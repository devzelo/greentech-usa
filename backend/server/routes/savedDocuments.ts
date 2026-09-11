import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import SavedDocument, { SavedDocKind, SAVED_DOC_STATUSES } from "../models/SavedDocument";
import User from "../models/User";
import Counter, { nextSequence } from "../models/Counter";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";

// Frozen, versioned copies of produced project documents (proposal / boq / rfq / po).
// Saving requires edit access to the owning tab; listing requires view access.
const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["proposals", "proc-boq", "proc-rfqs", "proc-po", "procurement"]));

const PROJECT_KINDS = ["proposal", "boq", "rfq", "po"];

const humanSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// CR-P (84) — one revision stream is one project + kind + refId (e.g. the technical proposal).
// Its numbers come from a counter that only moves forward: deleting the newest revision must not
// hand its number to the next one, or two different files could both have gone out as "Rev 2".
const streamKey = (projectId: string, kind: string, refId: string) => `saveddoc:${projectId}:${kind}:${refId}`;
const lastVersionInStream = async (projectId: string, kind: string, refId: string) => {
  const last = await SavedDocument.findOne({ projectId, kind: kind as SavedDocKind, refId }).sort({ version: -1 }).select("version").lean();
  return (last as { version?: number } | null)?.version || 0;
};

// GET /api/projects/:id/saved-documents/next-version?kind=&refId= — the number the next save gets,
// so a confirmation can name the real revision even after one was deleted.
router.get("/next-version", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const kind = String(req.query.kind || "");
    const refId = String(req.query.refId || "");
    const [last, counter] = await Promise.all([
      lastVersionInStream(req.params.id, kind, refId),
      Counter.findById(streamKey(req.params.id, kind, refId)).lean(),
    ]);
    res.json({ version: Math.max(last, counter?.seq || 0) + 1 });
  } catch (err) { next(err); }
});

// GET /api/projects/:id/saved-documents?kind=&refId= — newest version first.
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = { projectId: req.params.id };
    if (req.query.kind) filter.kind = String(req.query.kind);
    if (req.query.refId !== undefined) filter.refId = String(req.query.refId);
    const docs = await SavedDocument.find(filter).sort({ version: -1, createdAt: -1 }).lean();
    res.json(docs);
  } catch (err) { next(err); }
});

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const kind = String(req.body.kind || "misc").replace(/[^a-z0-9-]/gi, "");
    const dir = path.join("uploads", req.params.id, "saved-documents", kind || "misc");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });

// POST /api/projects/:id/saved-documents — store a generated file as the next version.
router.post("/", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const kind = String(req.body.kind || "") as SavedDocKind;
    if (!PROJECT_KINDS.includes(kind)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "Invalid document kind." });
    }
    const refId = String(req.body.refId || "");
    // The counter is seeded from the highest existing number the first time a stream uses it, so
    // streams saved before the counter existed carry on from where they are.
    const last = await lastVersionInStream(req.params.id, kind, refId);
    const version = Math.max(await nextSequence(streamKey(req.params.id, kind, refId), last), last + 1);
    const me = await User.findById(req.user!.userId).select("name").lean();
    const doc = await SavedDocument.create({
      kind,
      projectId: req.params.id,
      refId,
      version,
      // CR-P (84) — proposals count revisions from 0, so an unlabelled one is "Revision 0", not
      // "Version 1" sitting next to a "Rev 0" badge.
      title: String(req.body.title || "").trim() || (kind === "proposal" ? `Revision ${version - 1}` : `Version ${version}`),
      note: String(req.body.note || ""),
      // Any valid lifecycle status is kept. This used to collapse everything but "final" to
      // "draft", so an uploaded proposal asked to be "submitted" was silently filed as a draft.
      status: SAVED_DOC_STATUSES.includes(req.body.status) ? req.body.status : "draft",
      fileName: req.file.originalname,
      filePath: req.file.path.replace(/\\/g, "/"),
      fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(),
      size: humanSize(req.file.size),
      createdById: req.user!.userId,
      createdByName: (me as { name?: string } | null)?.name || "",
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

// PATCH /api/projects/:id/saved-documents/:docId — rename, annotate or move through the lifecycle.
router.patch("/:docId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const update: Record<string, unknown> = {};
    if (typeof req.body.title === "string") update.title = req.body.title.trim();
    if (typeof req.body.note === "string") update.note = req.body.note;
    // CR-P (83) — the wider proposal lifecycle.
    if (SAVED_DOC_STATUSES.includes(req.body.status)) update.status = req.body.status;
    // CR-P (83) — "last modified" names who made the change, not who created the revision.
    const me = await User.findById(req.user!.userId).select("name").lean();
    update.updatedByName = (me as { name?: string } | null)?.name || "";
    const doc = await SavedDocument.findOneAndUpdate(
      { _id: req.params.docId, projectId: req.params.id },
      update,
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (err) { next(err); }
});

// DELETE /api/projects/:id/saved-documents/:docId — removes the stored file too.
router.delete("/:docId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await SavedDocument.findOneAndDelete({ _id: req.params.docId, projectId: req.params.id });
    if (doc?.filePath) fs.unlink(path.resolve(doc.filePath), () => {});
    res.json({ message: "Saved document deleted." });
  } catch (err) { next(err); }
});

export default router;
