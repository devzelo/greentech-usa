import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import User from "../models/User";
import UserFile from "../models/UserFile";
import Company from "../models/Company";
import Project from "../models/Project";
import SubInvoice from "../models/SubInvoice";
import Task from "../models/Task";
import { enrichTasks } from "../lib/taskProfile";
import { buildUserLinks, buildCompanyLinks, escapeRegex } from "../lib/profileLinks";
import { partyMaySee } from "../lib/agreementAccess";
import { requireAuth, AuthedRequest } from "../middleware/auth";

// CR-P (16) — self-profile endpoints. Every role uses these for its own profile preview
// (the admin-only /api/users/:id/* routes stay untouched), so guests must NOT be blocked here.
const router = Router();
router.use(requireAuth);

const humanFileSize = (bytes: number) => {
  if (!bytes) return "0 B";
  const u = ["B", "KB", "MB", "GB"]; const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
};

type LeanUser = {
  _id: unknown; name?: string; email?: string; role?: string; empId?: string;
  companyId?: unknown; signatureUrl?: string;
  signatures?: Array<{ _id: unknown; label?: string; url: string; isDefault?: boolean }>;
};

// A subcontractor/partner login maps to its Directory company via the hard companyId link,
// falling back to the legacy email match (and back-filling companyId when the match hits).
async function resolveMyCompany(user: LeanUser) {
  if (user.role !== "subcontractor") return null;
  if (user.companyId) {
    const byId = await Company.findById(user.companyId).select("name email logoUrl address phone website categories category").lean();
    if (byId) return byId;
  }
  if (!user.email) return null;
  const byEmail = await Company.findOne({ email: user.email.toLowerCase() }).select("name email logoUrl address phone website categories category").lean();
  if (byEmail) await User.updateOne({ _id: user._id }, { companyId: byEmail._id }).catch(() => undefined);
  return byEmail;
}

// ── GET /api/me/links — everything related to me, role-aware ────────────────────────────────
// Staff get the same payload as the admin user profile; a subcontractor/partner login also gets
// the records linked to its Directory company (invoices, RFQs, quotes, shipments) plus its
// per-project sub-invoices, merged and de-duplicated.
router.get("/links", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const uid = req.user!.userId;
    const user = await User.findById(uid).select("name email role empId companyId").lean() as LeanUser | null;
    if (!user) return res.status(404).json({ error: "User not found." });

    const userLinks = await buildUserLinks(uid, user.name || "");
    const company = await resolveMyCompany(user);
    const companyLinks = company
      ? await buildCompanyLinks(String(company._id), company.name || "", (company as { email?: string }).email || "", uid)
      : null;

    // Sub-invoices: rows belong to a (projectId, subId) pair; resolve my pairs via the
    // subcontractors[] rows linked to my login (hard userId link, else email match).
    let subInvoices: unknown[] = [];
    if (user.role === "subcontractor" && user.email) {
      const emailRx = new RegExp(`^${escapeRegex(user.email)}$`, "i");
      const memberProjects = await Project.find({ $or: [{ "subcontractors.userId": uid }, { "subcontractors.email": emailRx }] })
        .select("projectId subcontractors.subId subcontractors.userId subcontractors.email").lean();
      const pairs: Array<{ projectId: string; subId: string }> = [];
      for (const p of memberProjects as Array<{ projectId?: string; subcontractors?: Array<{ subId?: string; userId?: string; email?: string }> }>) {
        for (const s of p.subcontractors || []) {
          if (!p.projectId || !s.subId) continue;
          if (String(s.userId || "") === uid || (s.email || "").toLowerCase() === user.email.toLowerCase()) pairs.push({ projectId: p.projectId, subId: s.subId });
        }
      }
      if (pairs.length) {
        subInvoices = await SubInvoice.find({ $or: pairs })
          .select("description amount date approval projectId subId").sort({ createdAt: -1 }).limit(200).lean();
      }
    }

    // Merge user + company records, de-duplicated by _id (projects by projectId).
    const dedupe = <T extends { _id: unknown }>(...lists: T[][]) => {
      const seen = new Set<string>();
      return lists.flat().filter((r) => { const k = String(r._id); if (seen.has(k)) return false; seen.add(k); return true; });
    };
    const seenPids = new Set<string>();
    const projects = [...userLinks.projects, ...(companyLinks?.projects || [])]
      .filter((p) => { const k = String((p as { projectId?: string }).projectId || (p as { _id: unknown })._id); if (seenPids.has(k)) return false; seenPids.add(k); return true; });

    // CR-P (62) — being NAMED on an agreement is not the same as having been GIVEN it. This list
    // used to hold every agreement naming me or my company, drafts included. A party now gets only
    // what was shared with them (see partyMaySee); agreements I created myself stay mine. Only the
    // fields the list shows leave the server: never the sharing log or who else it went to.
    const meParty = { email: String(user.email || "").trim().toLowerCase(), companyId: company ? String(company._id) : "" };
    const partyView = (a: { _id: unknown; name?: string; agreementNo?: string; title?: string; agreementType?: string; status?: string; ownerProjectId?: string; ownerContextType?: string }) => ({
      _id: a._id, name: a.name || "", agreementNo: a.agreementNo || "", title: a.title || "",
      agreementType: a.agreementType || "", status: a.status || "",
      ownerProjectId: a.ownerProjectId || "", ownerContextType: a.ownerContextType || "",
    });
    const myUserAgreements = userLinks.agreements.filter((a) => String(a.addedById || "") === uid || partyMaySee(a, meParty));
    const companyAgreements = (companyLinks?.agreements || []).filter((a) => partyMaySee(a, meParty));

    const projectNames: Record<string, string> = { ...userLinks.projectNames };
    for (const p of [...projects, ...(companyLinks?.projects || [])] as Array<{ projectId?: string; name?: string }>)
      if (p.projectId) projectNames[p.projectId] = p.name || "";
    for (const r of subInvoices as Array<{ projectId?: string }>) if (r.projectId && !(r.projectId in projectNames)) {
      const proj = await Project.findOne({ projectId: r.projectId }).select("name").lean();
      if (proj) projectNames[r.projectId] = (proj as { name?: string }).name || "";
    }

    res.json({
      projects,
      agreements: dedupe(myUserAgreements.map(partyView), companyAgreements.map(partyView)),
      expenses: userLinks.expenses,
      reminders: userLinks.reminders,
      submittals: dedupe(userLinks.submittals as Array<{ _id: unknown }>, (companyLinks?.submittals || []) as Array<{ _id: unknown }>),
      pos: dedupe(userLinks.pos as Array<{ _id: unknown }>, (companyLinks?.pos || []) as Array<{ _id: unknown }>),
      invoices: companyLinks?.invoices || [],
      rfqs: companyLinks?.rfqs || [],
      quotes: companyLinks?.quotes || [],
      shipments: companyLinks?.shipments || [],
      subInvoices,
      projectNames,
      company: company ? {
        id: String(company._id), name: company.name || "", email: (company as { email?: string }).email || "",
        logoUrl: (company as { logoUrl?: string }).logoUrl || "", address: (company as { address?: string }).address || "",
        phone: (company as { phone?: string }).phone || "", website: (company as { website?: string }).website || "",
        categories: (company as { categories?: string[] }).categories || [],
      } : null,
    });
  } catch (err) { next(err); }
});

// ── GET /api/me/tasks — my Kanban tasks across projects ─────────────────────────────────────
router.get("/tasks", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const uid = req.user!.userId;
    const user = await User.findById(uid).select("empId role email companyId name").lean() as LeanUser | null;
    if (!user) return res.status(404).json({ error: "User not found." });
    const or: Record<string, unknown>[] = [{ "assignees.userId": uid }];
    if (user.empId) or.push({ "assignees.empId": user.empId });
    const company = await resolveMyCompany(user);
    if (company?.name) or.push({ "assignees.name": new RegExp(`^${escapeRegex(company.name)}$`, "i") });
    const tasks = await Task.find({ $or: or }).sort({ updatedAt: -1 }).limit(200).lean();
    res.json(await enrichTasks(tasks as unknown as Array<Record<string, unknown>>));
  } catch (err) { next(err); }
});

// ── GET /api/me/files — documents on my profile (uploaded by admin) ─────────────────────────
router.get("/files", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try { res.json(await UserFile.find({ userId: req.user!.userId }).sort({ createdAt: -1 }).lean()); }
  catch (err) { next(err); }
});

// ── Signatures — named list with a default (CR-P 16) ────────────────────────────────────────
// The default's url is mirrored into the legacy `signatureUrl` so POs, the signatories picker
// and the agreement sign flow keep working unchanged.
const signatureStorage = multer.diskStorage({
  destination: (_req, _file, cb) => { const dir = path.join("uploads", "signatures"); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (req, file, cb) => { const ext = path.extname(file.originalname).toLowerCase() || ".png"; cb(null, `${(req as AuthedRequest).user!.userId}-${Date.now()}${ext}`); },
});
const signatureUpload = multer({
  storage: signatureStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error("Only image files are allowed."), { statusCode: 400 }));
  },
});
const MAX_SIGNATURES = 10;

const unlinkUpload = (url: string) => {
  if (url && url.includes("/uploads/signatures/")) fs.unlink(url.replace(/^\//, ""), () => undefined);
};
const publicSignatures = (user: { signatures?: Array<{ _id: unknown; label?: string; url: string; isDefault?: boolean }> }) =>
  (user.signatures || []).map((s) => ({ id: String(s._id), label: s.label || "", url: s.url, isDefault: !!s.isDefault }));

router.get("/signatures", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.userId).select("name signatureUrl signatures");
    if (!user) return res.status(404).json({ error: "User not found." });
    // Lazy migration: surface a pre-existing single signature as the default named entry.
    if ((!user.signatures || user.signatures.length === 0) && user.signatureUrl) {
      user.signatures = [{ label: user.name || "", url: user.signatureUrl, isDefault: true }] as typeof user.signatures;
      await user.save();
    }
    res.json(publicSignatures(user));
  } catch (err) { next(err); }
});

router.post("/signatures", signatureUpload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const user = await User.findById(req.user!.userId).select("signatureUrl signatures");
    if (!user) return res.status(404).json({ error: "User not found." });
    if ((user.signatures || []).length >= MAX_SIGNATURES) {
      fs.unlink(req.file.path, () => undefined);
      return res.status(400).json({ error: `You can keep up to ${MAX_SIGNATURES} signatures. Remove one first.` });
    }
    const url = `/${req.file.path.replace(/\\/g, "/")}`;
    const makeDefault = !(user.signatures || []).some((s) => s.isDefault);
    user.signatures.push({ label: String(req.body.label || "").trim().slice(0, 120), url, isDefault: makeDefault } as (typeof user.signatures)[number]);
    if (makeDefault) user.signatureUrl = url;
    await user.save();
    res.status(201).json(publicSignatures(user));
  } catch (err) { next(err); }
});

router.patch("/signatures/:sid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.userId).select("signatureUrl signatures");
    if (!user) return res.status(404).json({ error: "User not found." });
    const sig = (user.signatures || []).find((s) => String(s._id) === req.params.sid);
    if (!sig) return res.status(404).json({ error: "Signature not found." });
    if (typeof req.body.label === "string") sig.label = req.body.label.trim().slice(0, 120);
    if (req.body.isDefault === true) {
      for (const s of user.signatures) s.isDefault = false;
      sig.isDefault = true;
      user.signatureUrl = sig.url;
    }
    await user.save();
    res.json(publicSignatures(user));
  } catch (err) { next(err); }
});

router.delete("/signatures/:sid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.userId).select("signatureUrl signatures");
    if (!user) return res.status(404).json({ error: "User not found." });
    const sig = (user.signatures || []).find((s) => String(s._id) === req.params.sid);
    if (!sig) return res.status(404).json({ error: "Signature not found." });
    const wasDefault = !!sig.isDefault;
    unlinkUpload(sig.url);
    user.signatures = user.signatures.filter((s) => String(s._id) !== req.params.sid) as typeof user.signatures;
    if (wasDefault) {
      const first = user.signatures[0];
      if (first) { first.isDefault = true; user.signatureUrl = first.url; }
      else user.signatureUrl = "";
    }
    await user.save();
    res.json(publicSignatures(user));
  } catch (err) { next(err); }
});

// ── Resume file — a plain uploaded CV, separate from the resume builder (CR-P 16) ───────────
const resumeStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uid = String((req as AuthedRequest).user!.userId).replace(/[^\w-]/g, "");
    const dir = path.join("uploads", "resumes", uid || "misc");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `cv-${Date.now()}-${file.originalname}`),
});
const resumeUpload = multer({ storage: resumeStorage, limits: { fileSize: 32 * 1024 * 1024 } });

router.post("/resume-file", resumeUpload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const user = await User.findById(req.user!.userId).select("resumeFile");
    if (!user) return res.status(404).json({ error: "User not found." });
    if (user.resumeFile?.filePath) fs.unlink(path.resolve(user.resumeFile.filePath), () => undefined);
    user.resumeFile = { name: req.file.originalname, filePath: req.file.path.replace(/\\/g, "/"), size: humanFileSize(req.file.size) };
    await user.save();
    res.status(201).json(user.resumeFile);
  } catch (err) { next(err); }
});

router.delete("/resume-file", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.userId).select("resumeFile");
    if (!user) return res.status(404).json({ error: "User not found." });
    if (user.resumeFile?.filePath) fs.unlink(path.resolve(user.resumeFile.filePath), () => undefined);
    user.resumeFile = { name: "", filePath: "", size: "" };
    await user.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
