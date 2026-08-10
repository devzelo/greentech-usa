import { Router, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import Project from "../models/Project";
import User from "../models/User";
import Expense from "../models/Expense";
import multer from "multer";
import fs from "fs";
import path from "path";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { getProjectAccess } from "../lib/access";
import { notifyByEmpId } from "../lib/notify";

// Shared check: is the requester the JV partner of this project (or staff)?
async function partnerCanEdit(req: AuthedRequest, project: { jointVenture?: { email?: string }; ownerId?: unknown; assignedEmployees?: string[]; guests?: Array<{ userId: unknown; tabPermissions?: Record<string, "view" | "edit">; expiresAt?: Date | string | null }> }): Promise<boolean> {
  const me = await User.findById(req.user!.userId).select("email empId").lean();
  const myEmail = String((me as { email?: string } | null)?.email || "").trim().toLowerCase();
  const empId = (me as { empId?: string } | null)?.empId || "";
  const access = getProjectAccess(project, req.user!.userId, empId);
  const isStaff = access.role === "owner" || access.role === "employee";
  const isPartner = !!myEmail && String(project.jointVenture?.email || "").trim().toLowerCase() === myEmail;
  return isStaff || isPartner;
}

const router = Router();

// All routes require auth
router.use(requireAuth);

// GET /api/projects/financials?ids=PROJ-1,PROJ-2 — income (sent invoices) & expenses
// (qty x unit price) per project, for the report PDFs. Defined before "/:id".
router.get("/financials", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const ids = String(req.query.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return res.json({});
    const num = (s: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
    const SubInvoice = (await import("../models/SubInvoice")).default;
    const Invoice = (await import("../models/Invoice")).default;
    // Income = legacy subcontractor invoice tables + the "Invoice Sent" builder invoices
    // (CR-I-06/09). Draft/Cancelled/Rejected sent invoices are not real billed revenue.
    const NON_REVENUE = ["Draft", "Cancelled", "Canceled", "Rejected"];
    const [expenses, subInvoices, sentInvoices] = await Promise.all([
      Expense.find({ projectId: { $in: ids } }).select("projectId qty amount").lean(),
      SubInvoice.find({ projectId: { $in: ids } }).select("projectId amount").lean(),
      Invoice.find({ projectId: { $in: ids }, type: "sent", status: { $nin: NON_REVENUE } })
        .select("projectId amount").lean(),
    ]);
    const map: Record<string, { income: number; expenses: number }> = {};
    const bucket = (pid: string) => (map[pid] ||= { income: 0, expenses: 0 });
    for (const e of expenses) bucket(e.projectId).expenses += (num(e.qty) || 1) * num(e.amount);
    for (const inv of subInvoices) bucket(inv.projectId).income += num(inv.amount);
    for (const inv of sentInvoices) bucket(inv.projectId).income += num(inv.amount);
    res.json(map);
  } catch (err) { next(err); }
});

// GET /api/projects/my-expenses — the caller's own logged expense rows across all
// projects they're on (used on the subcontractor's profile). Defined before "/:id".
router.get("/my-expenses", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const projects = await Project.find({ "guests.userId": userId }).select("projectId name subcontractors").lean();
    const nameById: Record<string, string> = {};
    const mySubIds: string[] = [];
    projects.forEach((p) => {
      nameById[p.projectId] = p.name;
      for (const s of (p.subcontractors || [])) {
        if ((s as { userId?: string }).userId === userId && s.subId) mySubIds.push(s.subId);
      }
    });
    const ids = projects.map((p) => p.projectId);
    // Their own logged rows + any expenses an owner/employee attributed to them.
    const expenses = ids.length
      ? await Expense.find({ projectId: { $in: ids }, $or: [{ addedById: userId }, { subId: { $in: mySubIds } }] })
          .sort({ createdAt: -1 }).lean()
      : [];
    res.json(expenses.map((e) => ({ ...e, projectName: nameById[e.projectId] || e.projectId })));
  } catch (err) { next(err); }
});

// GET /api/projects?scope=mine|all|drafts  (default = all)
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const raw = String(req.query.scope || "all");
    const scope: "mine" | "all" | "drafts" | "archived" =
      raw === "mine" ? "mine" : raw === "drafts" ? "drafts" : raw === "archived" ? "archived" : "all";
    const userId = req.user!.userId;
    const me = await User.findById(userId).lean();
    const empId = (me as { empId?: string } | null)?.empId || "";
    const role = (me as { role?: string } | null)?.role || req.user!.role;
    // Every scope except "archived" hides archived projects; "archived" shows only those.
    const archiveClause = scope === "archived" ? { archived: true } : { archived: { $ne: true } };

    let filter: Record<string, unknown> = {};
    if (role === "subcontractor") {
      // Guests only ever see the (non-draft, non-archived) projects they are assigned to.
      filter = { "guests.userId": userId, status: { $ne: "Draft" }, ...archiveClause };
      const projects = await Project.find(filter).sort({ createdAt: -1 });
      return res.json(projects);
    }
    if (scope === "mine") {
      const ownerClause: Record<string, unknown>[] = [{ ownerId: userId }];
      if (empId) ownerClause.push({ assignedEmployees: empId });
      filter = { $or: ownerClause, status: { $ne: "Draft" }, ...archiveClause };
    } else if (scope === "drafts") {
      // Drafts are private to their creator
      filter = { ownerId: userId, status: "Draft", ...archiveClause };
    } else if (scope === "archived") {
      // Archived — staff see all archived projects.
      filter = { archived: true };
    } else {
      // "all" — exclude other employees' drafts; show only your own drafts here
      filter = {
        $and: [{ $or: [{ status: { $ne: "Draft" } }, { ownerId: userId }] }, archiveClause],
      };
    }

    const projects = await Project.find(filter).sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/guests-directory â€” distinct guests across the projects this user owns.
// (Defined before "/:id" so it isn't captured as a project id.)
router.get("/guests-directory", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const owned = await Project.find({ ownerId: req.user!.userId }).select("guests").lean();
    const ids = new Set<string>();
    owned.forEach((p) => (p.guests || []).forEach((g) => ids.add(String(g.userId))));
    const users = await User.find({ _id: { $in: Array.from(ids) }, role: "subcontractor" })
      .select("name email")
      .lean();
    res.json(users.map((u) => ({ userId: String(u._id), name: u.name, email: u.email })));
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id
router.get("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id });
    if (!project) return res.status(404).json({ error: "Project not found" });
    // Guests may only open a project they are assigned to.
    if (req.user!.role === "subcontractor") {
      const assigned = (project.guests || []).some((g) => String(g.userId) === req.user!.userId);
      if (!assigned) return res.status(403).json({ error: "You do not have access to this project." });
      // A subcontractor must never see other subcontractors' data — strip the list to their own
      // record, and the access list to their own entry.
      const me = req.user!.userId;
      const myEmail = (req.user!.email || "").toLowerCase();
      const obj = project.toObject() as unknown as {
        subcontractors?: Array<{ userId?: string; email?: string }>;
        guests?: Array<{ userId?: unknown }>;
      };
      obj.subcontractors = (obj.subcontractors || []).filter(
        (s) => s.userId === me || (s.email && s.email.toLowerCase() === myEmail && !!myEmail)
      );
      obj.guests = (obj.guests || []).filter((g) => String(g.userId) === me);
      return res.json(obj);
    }
    res.json(project);
  } catch (err) {
    next(err);
  }
});

// POST /api/projects
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "subcontractor") {
      return res.status(403).json({ error: "Guests cannot create projects." });
    }
    // Internal project number: <year>-<NN>, restarting at 01 each year (2026-01, 2026-02 …).
    // Derived from the highest existing number for that year — not a count — so deleting a
    // project can never mint a duplicate.
    const nextNumber = async (): Promise<string> => {
      // Only a real 4-digit year is accepted; anything else falls back to the current one, so a
      // typo like "26" can't mint a permanently malformed id (it also goes into a RegExp below).
      const raw = String(req.body.contractYear ?? "").trim();
      const year = /^[0-9]{4}$/.test(raw) ? raw : String(new Date().getFullYear());
      // [0-9] rather than \d — the year is interpolated, and this stays correct through any
      // tooling that mangles backslashes.
      const existing = await Project.find({ projectId: new RegExp("^" + year + "-[0-9]+$") }).select("projectId").lean();
      const highest = existing.reduce((max, p) => {
        const n = parseInt(String(p.projectId).split("-")[1] || "0", 10);
        return isFinite(n) && n > max ? n : max;
      }, 0);
      return `${year}-${String(highest + 1).padStart(2, "0")}`;
    };

    // Stamp owner from the authenticated user
    req.body.ownerId = req.user!.userId;
    req.body.owner = req.user!.name;

    // Concurrent creates can race for the same number — re-scan and retry a few times.
    let project;
    const supplied = !!req.body.projectId;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!supplied) req.body.projectId = await nextNumber();
      try {
        project = await Project.create(req.body);
        break;
      } catch (err) {
        const duplicate = (err as { code?: number }).code === 11000;
        if (!duplicate || supplied || attempt === 4) throw err;
      }
    }
    if (!project) return res.status(409).json({ error: "Could not allocate a project number — please try again." });
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

// Fields that only the owner is allowed to change.
const IDENTITY_FIELDS = new Set([
  "name", "status", "category", "contractNo", "contractYear", "contractFile", "location", "siteAddress", "description",
  "owner", "ownerId", "image", "published", "progress",
  "startDate", "endDate", "fiscal", "compliance", "value", "disciplines",
  "projectNature", "clientInfo", "timeline",
  // The JV partner record carries the partner's stamps & signatures, which end up on signed
  // POs and agreements — owner-only, like the rest of the project identity.
  "jointVenture",
  "assignedEmployees", "tabAccess", "gallery", "showClientName",
]);

// PUT /api/projects/:id â€” owner: full edit; assignee: tab-content only; else 403.
router.put("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await Project.findOne({ projectId: req.params.id });
    if (!existing) return res.status(404).json({ error: "Project not found" });

    const userId = req.user!.userId;
    const isOwner = existing.ownerId && String(existing.ownerId) === userId;

    if (!isOwner) {
      const me = await User.findById(userId).lean();
      const empId = (me as { empId?: string } | null)?.empId || "";
      const role = (me as { role?: string } | null)?.role || req.user!.role;
      const isAssigned = !!empId && existing.assignedEmployees.includes(empId);

      let allowed = isAssigned;
      if (!allowed && role === "subcontractor") {
        const guest = (existing.guests || []).find((g) => String(g.userId) === userId);
        const hasEditTab = !!guest && Object.values(guest.tabPermissions || {}).includes("edit");
        if (!hasEditTab) {
          return res.status(403).json({ error: "You do not have permission to edit this project." });
        }
        allowed = true;
        // Guests can never touch guest assignments or tab access.
        delete req.body.guests;
        delete req.body.tabAccess;
      }

      if (!allowed) {
        return res.status(403).json({ error: "You do not have permission to edit this project." });
      }

      // Strip identity fields â€” assignees/guests can only edit tab content
      for (const f of Object.keys(req.body)) {
        if (IDENTITY_FIELDS.has(f)) delete req.body[f];
      }
    }

    // Never let clients overwrite ownership
    delete req.body.ownerId;
    delete req.body.owner;
    // The contract document is written only by /projects/:id/contract, which also cleans up the
    // old file — a blanket PUT must never null it out and orphan the upload.
    delete req.body.contractFile;

    const beforeAssigned = new Set(existing.assignedEmployees || []);

    const project = await Project.findOneAndUpdate(
      { projectId: req.params.id },
      req.body,
      { new: true, runValidators: true }
    );

    // Notify newly-assigned employees (best-effort, owner-only path).
    if (project) {
      const added = (project.assignedEmployees || []).filter((e) => !beforeAssigned.has(e));
      const actor = req.user!.name || "A project owner";
      for (const empId of added) {
        await notifyByEmpId(empId, {
          type: "assignment",
          title: "You were assigned to a project",
          message: `${actor} assigned you to "${project.name}".`,
          link: `/dashboard/projects/${project.projectId}`,
        });
      }
    }

    res.json(project);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/projects/:id/partner-profile — the JV partner edits their OWN profile on a project.
// Same jointVenture record the staff Partners tab edits, so the two stay in sync. Editable by the
// project owner/employees, or by the partner login (matched by the JV email). "lead" is never
// editable here (only staff decide who leads). Stamps/signatures live here too.
router.patch("/:id/partner-profile", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id });
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.jointVenture?.enabled) return res.status(400).json({ error: "This project has no joint-venture partner." });

    if (!(await partnerCanEdit(req, project))) return res.status(403).json({ error: "Only the JV partner can edit this profile." });

    const b = req.body || {};
    const jv = project.jointVenture as unknown as Record<string, unknown>;
    for (const f of ["partnerName", "partnerAddress", "contactName", "email", "phone", "logo", "notes"] as const) {
      if (typeof b[f] === "string") jv[f] = String(b[f]).slice(0, 2000);
    }
    if (Array.isArray(b.stamps)) jv.stamps = b.stamps.slice(0, 20).map((s: { name?: string; url?: string }) => ({ name: String(s?.name || "").slice(0, 200), url: String(s?.url || "") }));
    if (Array.isArray(b.signatures)) jv.signatures = b.signatures.slice(0, 20).map((s: { name?: string; url?: string }) => ({ name: String(s?.name || "").slice(0, 200), url: String(s?.url || "") }));
    project.markModified("jointVenture");
    await project.save();
    res.json(project.jointVenture);
  } catch (err) { next(err); }
});

// POST /api/projects/:id/partner-profile/asset — the JV partner uploads a logo / stamp / signature
// image and gets back its URL to store on their profile.
const partnerAssetStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const id = String(req.params.id || "");
    if (!/^[A-Za-z0-9._-]+$/.test(id)) return cb(Object.assign(new Error("Invalid project id."), { statusCode: 400 }), "");
    const dir = path.join("uploads", id, "partner-assets");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname).toLowerCase().slice(0, 12)}`),
});
const partnerAssetUpload = multer({
  storage: partnerAssetStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => { if (/^image\//.test(file.mimetype)) cb(null, true); else cb(Object.assign(new Error("Only image files are allowed."), { statusCode: 400 })); },
});
router.post("/:id/partner-profile/asset", partnerAssetUpload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const project = await Project.findOne({ projectId: req.params.id });
    if (!project) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Project not found." }); }
    if (!(await partnerCanEdit(req, project))) { fs.unlink(req.file.path, () => {}); return res.status(403).json({ error: "Only the JV partner can upload here." }); }
    res.status(201).json({ url: `/${req.file.path.replace(/\\/g, "/")}` });
  } catch (err) { next(err); }
});

// â”€â”€ Guest management (project owner only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function requireOwnedProject(req: AuthedRequest, res: Response) {
  const project = await Project.findOne({ projectId: req.params.id });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  if (!project.ownerId || String(project.ownerId) !== req.user!.userId) {
    res.status(403).json({ error: "Only the project owner can manage guests." });
    return null;
  }
  return project;
}

// GET /api/projects/:id/guests â€” list guests on this project (owner only)
router.get("/:id/guests", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await requireOwnedProject(req, res);
    if (!project) return;
    const ids = (project.guests || []).map((g) => g.userId);
    const users = await User.find({ _id: { $in: ids } }).select("name email role").lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const guests = (project.guests || []).map((g) => {
      const u = byId.get(String(g.userId));
      return {
        userId: String(g.userId),
        name: (u as { name?: string } | undefined)?.name || "",
        email: (u as { email?: string } | undefined)?.email || "",
        tabPermissions: g.tabPermissions || {},
        expiresAt: (g as { expiresAt?: Date | null }).expiresAt || null,
      };
    });
    res.json(guests);
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:id/guests â€” create/reuse a guest and assign to this (+ other) projects
router.post("/:id/guests", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await requireOwnedProject(req, res);
    if (!project) return;

    const { name, email, password, tabPermissions, alsoAssignProjectIds, expiresAt } = req.body as {
      name?: string; email?: string; password?: string;
      tabPermissions?: Record<string, "view" | "edit">;
      alsoAssignProjectIds?: string[];
      expiresAt?: string | null;
    };

    if (!email) return res.status(400).json({ error: "Email is required." });
    const cleanEmail = email.toLowerCase().trim();
    const perms = tabPermissions || {};
    const expiry = expiresAt ? new Date(expiresAt) : null;

    // Reuse an existing subcontractor by email, or create a new one.
    let user = await User.findOne({ email: cleanEmail });
    if (user) {
      if (user.role !== "subcontractor") {
        return res.status(409).json({ error: "That email belongs to a non-subcontractor account." });
      }
      if (password) user.password = await bcrypt.hash(password, 12);
      if (name) user.name = name;
      await user.save();
    } else {
      if (!password) return res.status(400).json({ error: "Password is required for a new subcontractor." });
      user = await User.create({
        name: name || cleanEmail.split("@")[0],
        email: cleanEmail,
        password: await bcrypt.hash(password, 12),
        role: "subcontractor",
      });
    }

    // Upsert the subcontractor access entry on this project (with optional expiry).
    const upsertGuest = (proj: typeof project) => {
      const existing = (proj.guests || []).find((g) => String(g.userId) === String(user!._id));
      if (existing) { existing.tabPermissions = perms; (existing as { expiresAt?: Date | null }).expiresAt = expiry; }
      else proj.guests.push({ userId: user!._id as never, tabPermissions: perms, expiresAt: expiry } as never);
      proj.markModified("guests");
    };
    upsertGuest(project);
    await project.save();

    // Assign to additional projects the requester also owns (same permissions).
    const others = Array.isArray(alsoAssignProjectIds) ? alsoAssignProjectIds.filter((p) => p && p !== project.projectId) : [];
    for (const pid of others) {
      const proj = await Project.findOne({ projectId: pid });
      if (proj && proj.ownerId && String(proj.ownerId) === req.user!.userId) {
        upsertGuest(proj);
        await proj.save();
      }
    }

    res.status(201).json({
      userId: String(user._id),
      name: user.name,
      email: user.email,
      tabPermissions: perms,
      expiresAt: expiry,
      assignedTo: [project.projectId, ...others],
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/projects/:id/guests/:userId â€” update a guest's tab permissions / details
router.patch("/:id/guests/:userId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await requireOwnedProject(req, res);
    if (!project) return;
    const guest = (project.guests || []).find((g) => String(g.userId) === req.params.userId);
    if (!guest) return res.status(404).json({ error: "Guest is not assigned to this project." });

    const { tabPermissions, name, password, expiresAt } = req.body as {
      tabPermissions?: Record<string, "view" | "edit">; name?: string; password?: string; expiresAt?: string | null;
    };
    if (tabPermissions || expiresAt !== undefined) {
      if (tabPermissions) guest.tabPermissions = tabPermissions;
      if (expiresAt !== undefined) (guest as { expiresAt?: Date | null }).expiresAt = expiresAt ? new Date(expiresAt) : null;
      project.markModified("guests");
      await project.save();
    }
    if (name || password) {
      const user = await User.findById(req.params.userId);
      if (user && user.role === "subcontractor") {
        if (name) user.name = name;
        if (password) user.password = await bcrypt.hash(password, 12);
        await user.save();
      }
    }
    res.json({ message: "Guest updated." });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:id/guests/:userId â€” remove a guest from this project
router.delete("/:id/guests/:userId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await requireOwnedProject(req, res);
    if (!project) return;
    project.guests = (project.guests || []).filter((g) => String(g.userId) !== req.params.userId) as never;
    project.markModified("guests");
    await project.save();
    res.json({ message: "Guest removed from project." });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:id â€” owner only
router.delete("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await Project.findOne({ projectId: req.params.id });
    if (!existing) return res.status(404).json({ error: "Project not found" });
    if (!existing.ownerId || String(existing.ownerId) !== req.user!.userId) {
      return res.status(403).json({ error: "Only the project owner can delete this project." });
    }
    await Project.deleteOne({ projectId: req.params.id });
    res.json({ message: "Project deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
