import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Submittal from "../models/Submittal";
import SubmittalRevision from "../models/SubmittalRevision";
import ProjectDocument from "../models/ProjectDocument";
import ProcurementEvent from "../models/ProcurementEvent";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { procTabGuard } from "../lib/access";

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(procTabGuard(["proc-submittals"]));

const humanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
// Writes are gated by tabAccessGuard (requires "edit"); a guest granted Submittals-edit may write.
const blockSub = (_req: AuthedRequest, _res: Response): boolean => false;
async function logEvent(req: AuthedRequest, e: { entityId: string; action: string; fromValue?: string; toValue?: string }) {
  try { await ProcurementEvent.create({ projectId: req.params.id, entityType: "submittal", entityId: e.entityId, action: e.action, fromValue: e.fromValue || "", toValue: e.toValue || "", actorId: req.user!.userId, actorName: req.user!.name || "" }); } catch { /* best-effort */ }
}

// ── Packages ──────────────────────────────────────────────────────────────────
// List packages, each with their revisions attached.
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const archivedClause = String(req.query.archived) === "true" ? { archived: true } : { archived: { $ne: true } };
    const subs = await Submittal.find({ projectId: req.params.id, ...archivedClause }).sort({ createdAt: 1 }).lean();
    const revs = await SubmittalRevision.find({ projectId: req.params.id }).sort({ revisionNo: 1 }).lean();
    const byPkg: Record<string, unknown[]> = {};
    for (const r of revs) (byPkg[String(r.submittalId)] ||= []).push(r);
    res.json(subs.map((s) => ({ ...s, revisions: byPkg[String(s._id)] || [] })));
  } catch (err) { next(err); }
});

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (blockSub(req, res)) return;
    const { itemId, title, productName, manufacturer, modelNo, specSection } = req.body || {};
    const sub = await Submittal.create({
      projectId: req.params.id, itemId: itemId || "", title: title || "", productName: productName || "",
      manufacturer: manufacturer || "", modelNo: modelNo || "", specSection: specSection || "", status: "Draft", currentRevisionNo: 0,
      addedByName: req.user!.name || "",
    });
    // auto-create Revision 0 (seed its option/brand from the package's manufacturer)
    await SubmittalRevision.create({ submittalId: String(sub._id), projectId: req.params.id, revisionNo: 0, optionLabel: manufacturer || "", isCurrent: true, createdByName: req.user!.name || "" });
    await logEvent(req, { entityId: String(sub._id), action: "created", toValue: sub.title });
    const revisions = await SubmittalRevision.find({ submittalId: String(sub._id) }).sort({ revisionNo: 1 }).lean();
    res.status(201).json({ ...sub.toObject(), revisions });
  } catch (err) { next(err); }
});

const PKG_FIELDS = ["itemId", "title", "productName", "manufacturer", "modelNo", "specSection", "status"] as const;
router.patch("/:sid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (blockSub(req, res)) return;
    const patch: Record<string, unknown> = {};
    for (const f of PKG_FIELDS) if (f in (req.body || {})) patch[f] = req.body[f];
    if (typeof req.body?.archived === "boolean") patch.archived = req.body.archived;
    const sub = await Submittal.findOneAndUpdate({ _id: req.params.sid, projectId: req.params.id }, patch, { new: true });
    if (!sub) return res.status(404).json({ error: "Not found" });
    res.json(sub);
  } catch (err) { next(err); }
});

router.delete("/:sid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (blockSub(req, res)) return;
    const sub = await Submittal.findOneAndDelete({ _id: req.params.sid, projectId: req.params.id });
    if (sub) {
      const revs = await SubmittalRevision.find({ submittalId: req.params.sid });
      for (const r of revs) for (const a of r.attachments || []) { if (a.filePath) fs.unlink(path.resolve(a.filePath), () => {}); }
      await SubmittalRevision.deleteMany({ submittalId: req.params.sid });
      await logEvent(req, { entityId: req.params.sid, action: "deleted", fromValue: sub.title });
    }
    res.json({ message: "Submittal deleted" });
  } catch (err) { next(err); }
});

// ── Revisions (immutable: insert + supersede only; no delete) ────────────────
// Add the next revision; the current one is superseded (kept, never edited).
// Body { duplicate: true } (D7) copies the current revision's brand + package docs into the new
// one (physical files copied, not shared) and resets the client decision to Pending — so you only
// swap the parts that changed. The client-approval letter is NOT copied (a new decision is due).
router.post("/:sid/revisions", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (blockSub(req, res)) return;
    const sub = await Submittal.findOne({ _id: req.params.sid, projectId: req.params.id });
    if (!sub) return res.status(404).json({ error: "Not found" });
    const dup = !!req.body?.duplicate;
    const currentRev = dup ? await SubmittalRevision.findOne({ submittalId: req.params.sid, isCurrent: true }) : null;
    await SubmittalRevision.updateMany({ submittalId: req.params.sid, isCurrent: true }, { $set: { isCurrent: false } });
    const nextNo = (sub.currentRevisionNo || 0) + 1;
    const rev = await SubmittalRevision.create({
      submittalId: req.params.sid, projectId: req.params.id, revisionNo: nextNo, isCurrent: true,
      optionLabel: currentRev?.optionLabel || "", disposition: "Pending", createdByName: req.user!.name || "",
    });
    if (currentRev) {
      const destDir = path.join("uploads", req.params.id, "submittals", String(rev._id));
      const copied: typeof currentRev.attachments = [] as unknown as typeof currentRev.attachments;
      for (const a of currentRev.attachments || []) {
        if (a.component === "clientLetter") continue;          // fresh decision → don't carry the old letter
        try {
          const src = path.resolve(a.filePath);
          if (!fs.existsSync(src)) continue;
          fs.mkdirSync(destDir, { recursive: true });
          const dest = path.join(destDir, `${Date.now()}-${path.basename(a.filePath)}`);
          fs.copyFileSync(src, dest);
          copied.push({ name: a.name, filePath: dest.replace(/\\/g, "/"), fileType: a.fileType, size: a.size, component: a.component } as (typeof copied)[number]);
        } catch { /* skip a file we can't copy */ }
      }
      if (copied.length) { rev.attachments = copied; await rev.save(); }
    }
    sub.currentRevisionNo = nextNo;
    await sub.save();
    await logEvent(req, { entityId: req.params.sid, action: dup ? "duplicated" : "revision", toValue: `Rev ${nextNo}` });
    res.status(201).json(rev);
  } catch (err) { next(err); }
});

// Set disposition / notes / dates — ONLY on the current revision.
const REV_FIELDS = ["disposition", "notes", "sentToClientAt", "respondedAt", "optionLabel"] as const;
router.patch("/:sid/revisions/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (blockSub(req, res)) return;
    const rev = await SubmittalRevision.findOne({ _id: req.params.rid, submittalId: req.params.sid });
    if (!rev) return res.status(404).json({ error: "Not found" });
    if (!rev.isCurrent) return res.status(409).json({ error: "Superseded revisions are locked." });
    const from = rev.disposition;
    for (const f of REV_FIELDS) if (f in (req.body || {})) (rev as unknown as Record<string, unknown>)[f] = req.body[f];
    await rev.save();
    if (req.body?.disposition && req.body.disposition !== from) {
      await logEvent(req, { entityId: req.params.sid, action: "disposition", fromValue: from, toValue: String(req.body.disposition) });
    }
    res.json(rev);
  } catch (err) { next(err); }
});

// ── Attachments (current revision only) ──────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join("uploads", req.params.id, "submittals", req.params.rid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });

router.post("/:sid/revisions/:rid/attachments", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const rev = await SubmittalRevision.findOne({ _id: req.params.rid, submittalId: req.params.sid });
    if (!rev) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Revision not found." }); }
    if (!rev.isCurrent) { fs.unlink(req.file.path, () => {}); return res.status(409).json({ error: "Superseded revisions are locked." }); }
    const component = String(req.body.component || "other");
    // A client-response letter carries the decision it belongs to (auto-grabbed from the revision's
    // disposition on the client side). Package components never carry a decision.
    const decision = component === "clientLetter" ? String(req.body.decision || rev.disposition || "") : "";
    const attachment = { name: req.file.originalname, filePath: req.file.path.replace(/\\/g, "/"), fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(), size: humanSize(req.file.size), component, decision };
    rev.attachments.push(attachment);
    await rev.save();
    res.status(201).json(rev);
  } catch (err) { next(err); }
});

// Add an attachment by COPYING an existing project document (from the Documents module) into the
// submittal — the same result as uploading it from the computer, but sourced from project docs.
router.post("/:sid/revisions/:rid/attachments/from-document", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (blockSub(req, res)) return;
    const rev = await SubmittalRevision.findOne({ _id: req.params.rid, submittalId: req.params.sid });
    if (!rev) return res.status(404).json({ error: "Revision not found." });
    if (!rev.isCurrent) return res.status(409).json({ error: "Superseded revisions are locked." });
    const doc = await ProjectDocument.findOne({ _id: req.body?.documentId, projectId: req.params.id });
    if (!doc || !doc.filePath) return res.status(404).json({ error: "Project document not found." });
    const dir = path.join("uploads", req.params.id, "submittals", req.params.rid);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${Date.now()}-${path.basename(doc.filePath)}`);
    fs.copyFileSync(path.resolve(doc.filePath), dest);
    const component = String(req.body?.component || "other");
    const decision = component === "clientLetter" ? String(req.body?.decision || rev.disposition || "") : "";
    rev.attachments.push({ name: doc.name, filePath: dest.replace(/\\/g, "/"), fileType: doc.fileType || (doc.name.split(".").pop() || "").toLowerCase(), size: doc.size || "", component, decision });
    await rev.save();
    res.status(201).json(rev);
  } catch (err) { next(err); }
});

router.delete("/:sid/revisions/:rid/attachments/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (blockSub(req, res)) return;
    const rev = await SubmittalRevision.findOne({ _id: req.params.rid, submittalId: req.params.sid });
    if (!rev) return res.status(404).json({ error: "Revision not found." });
    if (!rev.isCurrent) return res.status(409).json({ error: "Superseded revisions are locked." });
    const att = (rev.attachments || []).find((a) => String((a as { _id?: unknown })._id) === req.params.aid);
    if (att?.filePath) fs.unlink(path.resolve(att.filePath), () => {});
    rev.attachments = (rev.attachments || []).filter((a) => String((a as { _id?: unknown })._id) !== req.params.aid);
    await rev.save();
    res.json(rev);
  } catch (err) { next(err); }
});

export default router;
