import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import SavedDocument, { SavedDocKind } from "../models/SavedDocument";
import User from "../models/User";
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
    const last = await SavedDocument.findOne({ projectId: req.params.id, kind, refId }).sort({ version: -1 }).select("version").lean();
    const version = ((last as { version?: number } | null)?.version || 0) + 1;
    const me = await User.findById(req.user!.userId).select("name").lean();
    const doc = await SavedDocument.create({
      kind,
      projectId: req.params.id,
      refId,
      version,
      title: String(req.body.title || "").trim() || `Version ${version}`,
      note: String(req.body.note || ""),
      status: req.body.status === "final" ? "final" : "draft",
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

// PATCH /api/projects/:id/saved-documents/:docId — rename or flip draft/final.
router.patch("/:docId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const update: Record<string, unknown> = {};
    if (typeof req.body.title === "string") update.title = req.body.title.trim();
    if (typeof req.body.note === "string") update.note = req.body.note;
    if (req.body.status === "draft" || req.body.status === "final") update.status = req.body.status;
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
