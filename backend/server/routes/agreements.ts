import { Router, Response, NextFunction } from "express";
import mongoose from "mongoose";
import multer from "multer";
import fs from "fs";
import path from "path";
import Agreement, { IAgreement, AgreementStatus, AgreementEntityType } from "../models/Agreement";
import AgreementTemplate from "../models/AgreementTemplate";
import Project from "../models/Project";
import User from "../models/User";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { getProjectAccess } from "../lib/access";
import { createNotification } from "../lib/notify";

// One agreement engine, two context adapters (spec: docs/agreement-feature-spec.md):
//   userAgreementRouter    → /api/users/:uid/agreements      (employee agreements)
//   projectAgreementRouter → /api/projects/:id/agreements    (partner / sub / vendor agreements)
//   agreementTemplateRouter→ /api/agreement-templates
//
// Permissions:
//   user context    — admin manages; the employee themself can read + sign/reject their own.
//   project context — owners/assigned employees manage; a subcontractor login can read + sign
//                     the agreements of their OWN sub record only. Vendors have no login —
//                     the counter-signed copy is uploaded by staff (sign-upload).
// A Signed agreement is immutable: only Expired/Cancelled transitions remain.

type Ctx = "user" | "project" | "general";

const humanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
const today = () => new Date().toISOString().slice(0, 10);
// Custom named rich-text sections on an agreement (title + HTML body).
const cleanExtraSections = (v: unknown): Array<{ title: string; body: string; status: string; locked: boolean; hidden: boolean; notes: string; assignedTo: string; attachments: Array<{ name: string; filePath: string; fileType: string; size: string; kind: string }>; history: Array<{ at: string; by: string; text: string }> }> =>
  Array.isArray(v)
    ? v.map((s) => {
        const o = s as { title?: unknown; body?: unknown; status?: unknown; locked?: unknown; hidden?: unknown; notes?: unknown };
        return {
          title: String(o?.title ?? "").slice(0, 120),
          body: String(o?.body ?? "").slice(0, 20000),
          status: String(o?.status ?? "").slice(0, 20),
          locked: !!o?.locked,
          hidden: !!o?.hidden,
          notes: String(o?.notes ?? "").slice(0, 500),
          assignedTo: String((o as { assignedTo?: unknown })?.assignedTo ?? "").slice(0, 120),
          // CR-B-18 — carry per-section attachments through a whole-draft save (uploaded separately).
          attachments: Array.isArray((o as { attachments?: unknown })?.attachments)
            ? ((o as { attachments: Array<Record<string, unknown>> }).attachments).slice(0, 50).map((a) => ({
                name: String(a?.name ?? ""), filePath: String(a?.filePath ?? ""), fileType: String(a?.fileType ?? ""), size: String(a?.size ?? ""), kind: String(a?.kind ?? "other"),
              }))
            : [],
          // CR-B-17 — carry the per-section change history (View History).
          history: Array.isArray((o as { history?: unknown })?.history)
            ? ((o as { history: Array<Record<string, unknown>> }).history).slice(-50).map((h) => ({
                at: String(h?.at ?? ""), by: String(h?.by ?? "").slice(0, 80), text: String(h?.text ?? "").slice(0, 200),
              }))
            : [],
        };
      })
       .filter((s) => s.title || s.body).slice(0, 20)
    : [];

function act(ag: IAgreement, actorName: string, action: string, note = "") {
  ag.activity.push({ at: new Date(), actorName, action, note });
}

interface Perms { staff: boolean; self: boolean; mySubIds: string[]; isPartner: boolean }

// Resolve what the requester may do in this context.
async function resolvePerms(ctx: Ctx, req: AuthedRequest): Promise<Perms | null> {
  const userId = req.user!.userId;
  if (ctx === "user") {
    return { staff: req.user!.role === "admin", self: String(userId) === String(req.params.uid), mySubIds: [], isPartner: false };
  }
  if (ctx === "general") {
    // Company-wide agreements with an outside party — staff only, no recipient login exists.
    const staff = req.user!.role === "admin" || req.user!.role === "employee";
    return staff ? { staff: true, self: false, mySubIds: [], isPartner: false } : null;
  }
  const project = await Project.findOne({ projectId: req.params.id })
    .select("ownerId assignedEmployees guests subcontractors jointVenture").lean();
  if (!project) return null;
  const me = await User.findById(userId).select("empId email").lean();
  const access = getProjectAccess(project, userId, (me as { empId?: string } | null)?.empId || "");
  if (access.role === "none") return null;
  // Match the sub record by its hard link (userId) OR by email — the same two-way rule the
  // Subcontractors tab uses, so a record linked only by email isn't silently locked out.
  const myEmailLower = String((me as { email?: string } | null)?.email || "").trim().toLowerCase();
  const mySubIds = (project.subcontractors || [])
    .filter((s: { userId?: string; email?: string }) =>
      String(s.userId || "") === String(userId) ||
      (!!myEmailLower && String(s.email || "").trim().toLowerCase() === myEmailLower))
    .map((s: { subId?: string }) => String(s.subId || ""))
    .filter(Boolean);
  // The JV partner's login is a project guest matched by the partner email on the JV record —
  // the same rule the Partners tab uses to show the partner's account.
  const jvEmail = String(project.jointVenture?.email || "").trim().toLowerCase();
  const isPartner = !!project.jointVenture?.enabled && !!jvEmail && jvEmail === myEmailLower;
  return { staff: access.role === "owner" || access.role === "employee", self: false, mySubIds, isPartner };
}

// Is the requester the agreement's recipient (the one who signs)?
function isRecipient(ctx: Ctx, ag: IAgreement, p: Perms): boolean {
  if (ctx === "user") return p.self;
  if (ctx === "general") return false;   // the counterparty has no login — signed copies are uploaded
  if (ag.ownerEntityType === "partner") return p.isPartner;
  return ag.ownerEntityType === "subcontractor" && p.mySubIds.includes(ag.ownerEntityId);
}

function ownerFilter(ctx: Ctx, req: AuthedRequest): Record<string, string> {
  if (ctx === "user") return { ownerContextType: "user", ownerUserId: String(req.params.uid) };
  if (ctx === "general") return { ownerContextType: "general" };
  return { ownerContextType: "project", ownerProjectId: String(req.params.id) };
}

// Recipient's login account id (for notifications) — null when there is none (e.g. vendors).
async function recipientUserId(ctx: Ctx, ag: IAgreement): Promise<string | null> {
  if (ctx === "user") return ag.ownerUserId || null;
  const project = await Project.findOne({ projectId: ag.ownerProjectId }).select("subcontractors jointVenture").lean();
  if (ag.ownerEntityType === "partner") {
    // The partner's login is the account whose email matches the JV partner email.
    const jvEmail = String(project?.jointVenture?.email || "").trim();
    if (!jvEmail) return null;
    const u = await User.findOne({ email: new RegExp(`^${jvEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).select("_id").lean();
    return u ? String(u._id) : null;
  }
  if (ag.ownerEntityType !== "subcontractor" || !ag.ownerEntityId) return null;
  const sub = (project?.subcontractors || []).find((s: { subId?: string }) => String(s.subId) === ag.ownerEntityId);
  return (sub as { userId?: string } | undefined)?.userId || null;
}

const EDIT_FIELDS = ["name", "agreementType", "templateId", "effectiveDate", "startDate", "endDate"] as const;

function buildAgreementRouter(ctx: Ctx): Router {
  const router = Router({ mergeParams: true });
  router.use(requireAuth);

  // Per-request permission resolution — 403/404 out early.
  router.use(async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const p = await resolvePerms(ctx, req);
      if (!p) return res.status(ctx === "project" ? 404 : 403).json({ error: ctx === "project" ? "Project not found or no access." : "No access." });
      if (!p.staff && !p.self && !p.isPartner && p.mySubIds.length === 0) return res.status(403).json({ error: "You do not have access to these agreements." });
      (req as AuthedRequest & { agPerms?: Perms }).agPerms = p;
      next();
    } catch (err) { next(err); }
  });
  const permsOf = (req: AuthedRequest): Perms => (req as AuthedRequest & { agPerms?: Perms }).agPerms!;

  // Every :aid route — reject anything that isn't a real ObjectId BEFORE it reaches a handler
  // (or multer, whose upload path is derived from these params). Also turns CastError 500s into 404s.
  router.param("aid", (req, res, next, value) => {
    if (!mongoose.isValidObjectId(String(value))) return res.status(404).json({ error: "Not found" });
    next();
  });

  const findAg = async (req: AuthedRequest) =>
    Agreement.findOne({ _id: req.params.aid, ...ownerFilter(ctx, req) });

  // ── List ──────────────────────────────────────────────────────────────────
  router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const p = permsOf(req);
      const filter: Record<string, unknown> = ownerFilter(ctx, req);
      const qType = req.query.entityType ? String(req.query.entityType) : "";
      const qId = req.query.entityId ? String(req.query.entityId) : "";
      if (qType) filter.ownerEntityType = qType;
      if (qId) filter.ownerEntityId = qId;
      // Archived agreements are hidden unless staff explicitly asks for the archived view.
      filter.archived = p.staff && String(req.query.archived) === "true" ? true : { $ne: true };
      if (!p.staff) {
        // A recipient never sees drafts or cancelled records — only what was actually issued.
        filter.status = { $nin: ["Draft", "Cancelled"] };
        if (ctx === "user") { if (!p.self) return res.status(403).json({ error: "No access." }); }
        else {
          // Intersect the requested entity with what this recipient owns — never widen it.
          const scopes: Array<Record<string, unknown>> = [];
          if (p.mySubIds.length && (!qType || qType === "subcontractor")) {
            const ids = qId ? p.mySubIds.filter((s) => s === qId) : p.mySubIds;
            if (ids.length) scopes.push({ ownerEntityType: "subcontractor", ownerEntityId: { $in: ids } });
          }
          if (p.isPartner && (!qType || qType === "partner")) scopes.push({ ownerEntityType: "partner" });
          if (!scopes.length) return res.json([]);
          delete filter.ownerEntityType; delete filter.ownerEntityId;
          filter.$or = scopes;
        }
      }
      const list = await Agreement.find(filter).sort({ createdAt: -1 });
      // Recipient opening their list marks freshly-sent agreements as Viewed.
      if (!p.staff) {
        for (const ag of list) {
          if (ag.status === "Sent" && isRecipient(ctx, ag, p)) {
            ag.status = "Viewed";
            act(ag, req.user!.name || "", "viewed");
            await ag.save();
          }
        }
      }
      res.json(list);
    } catch (err) { next(err); }
  });

  // ── Create (staff) ────────────────────────────────────────────────────────
  router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "Only staff can create agreements." });
      const b = req.body || {};
      const entityType = ctx === "project" ? String(b.ownerEntityType || "") : "";
      if (ctx === "project" && !["partner", "subcontractor", "vendor"].includes(entityType)) {
        return res.status(400).json({ error: "ownerEntityType must be partner, subcontractor or vendor." });
      }
      const ag = await Agreement.create({
        ownerContextType: ctx,
        ownerUserId: ctx === "user" ? String(req.params.uid) : "",
        ownerProjectId: ctx === "project" ? String(req.params.id) : "",
        // general agreements own no entity — the counterparty lives entirely in partySnapshot
        ownerEntityType: entityType as AgreementEntityType,
        ownerEntityId: ctx === "project" ? String(b.ownerEntityId || "") : "",
        name: String(b.name || "").slice(0, 160),
        agreementType: String(b.agreementType || "Custom").slice(0, 60),
        templateId: String(b.templateId || ""),
        effectiveDate: String(b.effectiveDate || ""),
        startDate: String(b.startDate || ""),
        endDate: String(b.endDate || ""),
        partySnapshot: b.partySnapshot || {},
        sections: b.sections || {},
        extraSections: cleanExtraSections(b.extraSections),
        letterhead: b.letterhead === "jv" ? "jv" : "gt",
        jvLogoUrl: String(b.jvLogoUrl || ""),
        documentMode: b.documentMode === "uploaded" ? "uploaded" : "built",
        // Accept the company signer at creation so the client needs ONE call (no half-made record).
        signatures: b.companySignature ? { company: b.companySignature } : (b.signatures || {}),
        status: "Draft",
        addedById: req.user!.userId,
        addedByName: req.user!.name || "",
        activity: [{ at: new Date(), actorName: req.user!.name || "", action: "created", note: "" }],
      });
      res.status(201).json(ag);
    } catch (err) { next(err); }
  });

  // ── Edit (staff; locked once Signed; party snapshot locked once Sent) ─────
  router.patch("/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "Only staff can edit agreements." });
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      // Archive/restore is allowed in any status (it doesn't change the agreement's terms).
      if (typeof req.body?.archived === "boolean" && Object.keys(req.body).length === 1) {
        ag.archived = req.body.archived; await ag.save(); return res.json(ag);
      }
      if (ag.status === "Signed") return res.status(400).json({ error: "A signed agreement is locked. Only cancel/expire are possible." });
      const b = req.body || {};
      for (const f of EDIT_FIELDS) if (f in b) (ag as unknown as Record<string, unknown>)[f] = String(b[f] ?? "").slice(0, f === "name" ? 160 : 200);
      if (b.letterhead === "gt" || b.letterhead === "jv") ag.letterhead = b.letterhead;
      if (typeof b.jvLogoUrl === "string") ag.jvLogoUrl = b.jvLogoUrl;
      if (b.documentMode === "built" || b.documentMode === "uploaded") ag.documentMode = b.documentMode;
      if (b.sections && typeof b.sections === "object") ag.sections = { ...ag.sections, ...b.sections };
      if (Array.isArray(b.extraSections)) ag.extraSections = cleanExtraSections(b.extraSections);
      // The party snapshot freezes at send time (spec §3) — applied only while still a Draft.
      // Once sent it is silently ignored so that editing the TERMS of a sent/rejected agreement
      // (and re-sending it) still works.
      if (b.partySnapshot && typeof b.partySnapshot === "object" && ag.status === "Draft") {
        ag.partySnapshot = { ...ag.partySnapshot, ...b.partySnapshot };
      }
      if (b.companySignature && typeof b.companySignature === "object") {
        ag.signatures.company = { ...ag.signatures.company, ...b.companySignature };
      }
      if (b.status === "PendingSignature" && ["Sent", "Viewed"].includes(ag.status)) {
        ag.status = "PendingSignature";
        act(ag, req.user!.name || "", "pending-signature");
      }
      await ag.save();
      res.json(ag);
    } catch (err) { next(err); }
  });

  // ── Send (staff): Draft/Rejected → Sent, snapshot locks, recipient notified ─
  router.post("/:aid/send", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "Only staff can send agreements." });
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      if (!["Draft", "Rejected"].includes(ag.status)) return res.status(400).json({ error: `Cannot send an agreement in status ${ag.status}.` });
      ag.status = "Sent";
      ag.sentAt = today();
      act(ag, req.user!.name || "", "sent");
      await ag.save();
      const rid = await recipientUserId(ctx, ag);
      if (rid) {
        await createNotification({
          userId: rid, type: "general",
          title: "Agreement awaiting your review",
          message: `${req.user!.name || "GreenTech USA"} sent you the agreement "${ag.name || ag.agreementType}".`,
          link: `${ctx === "user" ? "/dashboard/profile" : ctx === "general" ? "/dashboard/agreements" : `/dashboard/projects/${ag.ownerProjectId}`}?hl=ag-${ag._id}`,
        });
      }
      res.json(ag);
    } catch (err) { next(err); }
  });

  // ── Sign (the recipient, from their own account) ──────────────────────────
  router.post("/:aid/sign", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const p = permsOf(req);
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      if (!isRecipient(ctx, ag, p)) return res.status(403).json({ error: "Only the agreement's recipient can sign it." });
      if (!["Sent", "Viewed", "PendingSignature"].includes(ag.status)) return res.status(400).json({ error: `Cannot sign an agreement in status ${ag.status}.` });
      ag.signatures.recipient = {
        ...ag.signatures.recipient,
        signerName: String(req.body?.signerName || req.user!.name || "").slice(0, 120),
        signatureUrl: String(req.body?.signatureUrl || ""),
        signedAt: today(),
        method: "account",
      };
      ag.status = "Signed";
      act(ag, req.user!.name || "", "signed");
      await ag.save();
      if (ag.addedById) {
        await createNotification({
          userId: ag.addedById, type: "general",
          title: "Agreement signed",
          message: `${req.user!.name || "The recipient"} signed "${ag.name || ag.agreementType}".`,
          link: `${ctx === "user" ? "/dashboard/users" : ctx === "general" ? "/dashboard/agreements" : `/dashboard/projects/${ag.ownerProjectId}`}?hl=ag-${ag._id}`,
        });
      }
      res.json(ag);
    } catch (err) { next(err); }
  });

  // ── Reject (the recipient) ────────────────────────────────────────────────
  router.post("/:aid/reject", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const p = permsOf(req);
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      if (!isRecipient(ctx, ag, p)) return res.status(403).json({ error: "Only the agreement's recipient can reject it." });
      if (!["Sent", "Viewed", "PendingSignature"].includes(ag.status)) return res.status(400).json({ error: `Cannot reject an agreement in status ${ag.status}.` });
      ag.status = "Rejected";
      act(ag, req.user!.name || "", "rejected", String(req.body?.note || "").slice(0, 500));
      await ag.save();
      if (ag.addedById) {
        await createNotification({
          userId: ag.addedById, type: "general",
          title: "Agreement rejected",
          message: `${req.user!.name || "The recipient"} rejected "${ag.name || ag.agreementType}".${req.body?.note ? ` Note: ${String(req.body.note).slice(0, 200)}` : ""}`,
          link: `${ctx === "user" ? "/dashboard/users" : ctx === "general" ? "/dashboard/agreements" : `/dashboard/projects/${ag.ownerProjectId}`}?hl=ag-${ag._id}`,
        });
      }
      res.json(ag);
    } catch (err) { next(err); }
  });

  // ── Cancel (staff) ────────────────────────────────────────────────────────
  router.post("/:aid/cancel", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "Only staff can cancel agreements." });
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      ag.status = "Cancelled";
      act(ag, req.user!.name || "", "cancelled", String(req.body?.note || "").slice(0, 500));
      await ag.save();
      res.json(ag);
    } catch (err) { next(err); }
  });

  // ── Delete (staff; a signed agreement is never deleted) ───────────────────
  router.delete("/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "Only staff can delete agreements." });
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      if (ag.status === "Signed") return res.status(400).json({ error: "A signed agreement cannot be deleted — cancel it instead." });
      for (const a of ag.attachments || []) if (a.filePath) fs.unlink(path.resolve(a.filePath), () => {});
      if (ag.signedDocument?.filePath) fs.unlink(path.resolve(ag.signedDocument.filePath), () => {});
      await ag.deleteOne();
      res.json({ message: "Agreement deleted" });
    } catch (err) { next(err); }
  });

  // ── File uploads ──────────────────────────────────────────────────────────
  const storage = multer.diskStorage({
    destination: (req: AuthedRequest, _file, cb) => {
      const dir = ctx === "project"
        ? path.join("uploads", req.params.id, "agreements", req.params.aid)
        : ctx === "general"
          ? path.join("uploads", "general-agreements", req.params.aid)
          : path.join("uploads", "user-agreements", req.params.uid, req.params.aid);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  });
  const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });
  const fileMeta = (f: Express.Multer.File) => ({
    name: f.originalname, filePath: f.path.replace(/\\/g, "/"),
    fileType: (f.originalname.split(".").pop() || "").toLowerCase(), size: humanSize(f.size),
  });

  // Freeze the final PDF (built client-side) as the immutable signed snapshot.
  router.post("/:aid/freeze", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded." });
      const p = permsOf(req);
      const ag = await findAg(req);
      if (!ag) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
      if (!p.staff && !isRecipient(ctx, ag, p)) { fs.unlink(req.file.path, () => {}); return res.status(403).json({ error: "No access." }); }
      if (ag.signedDocument?.filePath) fs.unlink(path.resolve(ag.signedDocument.filePath), () => {});
      ag.signedDocument = fileMeta(req.file);
      act(ag, req.user!.name || "", "snapshot-frozen", req.file.originalname);
      await ag.save();
      res.status(201).json(ag);
    } catch (err) { next(err); }
  });

  // Upload an already-made agreement file (documentMode "uploaded"). The file becomes the
  // document itself — preview & download serve it as-is, in whatever format it was uploaded.
  router.post("/:aid/document", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded." });
      if (!permsOf(req).staff) { fs.unlink(req.file.path, () => {}); return res.status(403).json({ error: "Only staff can upload the agreement document." }); }
      const ag = await findAg(req);
      if (!ag) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
      if (ag.status === "Signed") { fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: "A signed agreement is locked." }); }
      if (ag.uploadedDocument?.filePath) fs.unlink(path.resolve(ag.uploadedDocument.filePath), () => {});
      ag.uploadedDocument = fileMeta(req.file);
      ag.documentMode = "uploaded";
      act(ag, req.user!.name || "", "document-uploaded", req.file.originalname);
      await ag.save();
      res.status(201).json(ag);
    } catch (err) { next(err); }
  });

  // CR-B-18 — attach a pre-made file (resume/excel/pdf/picture) to a specific agreement section.
  router.post("/:aid/sections/:idx/files", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded." });
      if (!permsOf(req).staff) { fs.unlink(req.file.path, () => {}); return res.status(403).json({ error: "Only staff can attach section files." }); }
      const ag = await findAg(req);
      const idx = parseInt(req.params.idx, 10);
      if (!ag || !ag.extraSections[idx]) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Section not found." }); }
      if (ag.status === "Signed") { fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: "A signed agreement is locked." }); }
      ag.extraSections[idx].attachments = ag.extraSections[idx].attachments || [];
      ag.extraSections[idx].attachments!.push(fileMeta(req.file));
      await ag.save();
      res.status(201).json(ag);
    } catch (err) { next(err); }
  });
  router.delete("/:aid/sections/:idx/files/:fid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "Only staff can remove section files." });
      const ag = await findAg(req);
      const idx = parseInt(req.params.idx, 10);
      if (!ag || !ag.extraSections[idx]) return res.status(404).json({ error: "Section not found." });
      const list = ag.extraSections[idx].attachments || [];
      const gone = list.find((a) => String((a as { _id?: unknown })._id) === req.params.fid);
      if (gone?.filePath) fs.unlink(path.resolve(gone.filePath), () => {});
      ag.extraSections[idx].attachments = list.filter((a) => String((a as { _id?: unknown })._id) !== req.params.fid);
      await ag.save();
      res.json(ag);
    } catch (err) { next(err); }
  });

  // Staff uploads the counter-signed copy received outside the platform (vendor flow) —
  // the uploaded document becomes the signed snapshot and the agreement is marked Signed.
  router.post("/:aid/sign-upload", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded." });
      if (!permsOf(req).staff) { fs.unlink(req.file.path, () => {}); return res.status(403).json({ error: "Only staff can upload the signed copy." }); }
      const ag = await findAg(req);
      if (!ag) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
      // Only an issued, not-yet-settled agreement can receive a counter-signed copy — the same
      // states the UI offers the upload in (a Signed one is immutable; Draft must be sent first).
      if (!["Sent", "Viewed", "PendingSignature", "Rejected"].includes(ag.status)) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: `Cannot mark a ${ag.status} agreement as signed. Send it first, and note that a signed agreement is locked.` });
      }
      const meta = fileMeta(req.file);
      ag.attachments.push({ ...meta, kind: "signed" });
      if (ag.signedDocument?.filePath) fs.unlink(path.resolve(ag.signedDocument.filePath), () => {});
      ag.signedDocument = meta;
      ag.signatures.recipient = {
        ...ag.signatures.recipient,
        signerName: String(req.body?.signerName || ag.partySnapshot?.party2?.contactName || ag.partySnapshot?.party2?.name || "").slice(0, 120),
        signedAt: today(),
        method: "upload",
      };
      ag.status = "Signed";
      act(ag, req.user!.name || "", "signed", "Counter-signed copy uploaded");
      await ag.save();
      res.status(201).json(ag);
    } catch (err) { next(err); }
  });

  return router;
}

export const userAgreementRouter = buildAgreementRouter("user");
export const projectAgreementRouter = buildAgreementRouter("project");
export const generalAgreementRouter = buildAgreementRouter("general");

// ── Templates (read for all staff/recipients; seeded at startup) ─────────────
export const agreementTemplateRouter = Router();
agreementTemplateRouter.use(requireAuth);
agreementTemplateRouter.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.contextType) filter.contextType = String(req.query.contextType);
    res.json(await AgreementTemplate.find(filter).sort({ builtin: -1, name: 1 }));
  } catch (err) { next(err); }
});

// ── Daily expiry sweep (called from the agreements cron) ─────────────────────
export async function expireOverdueAgreements(): Promise<number> {
  const ACTIVE: AgreementStatus[] = ["Sent", "Viewed", "PendingSignature", "Signed"];
  const result = await Agreement.updateMany(
    { status: { $in: ACTIVE }, endDate: { $nin: ["", null] as unknown as string[], $lt: today() } },
    { $set: { status: "Expired" }, $push: { activity: { at: new Date(), actorName: "system", action: "expired", note: "End date passed" } } }
  );
  return result.modifiedCount || 0;
}
