import { Router, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import SubAgreement from "../models/SubAgreement";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subs = (arr: unknown): any => arr as any;

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["subs"]));

// List a subcontractor's agreements (newest first).
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, string> = { projectId: req.params.id };
    if (req.query.subId) filter.subId = String(req.query.subId);
    res.json(await SubAgreement.find(filter).sort({ createdAt: -1 }).lean());
  } catch (err) { next(err); }
});

// Create an agreement (name + description). Files are uploaded to it afterwards.
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { subId, name, description } = req.body || {};
    if (!subId) return res.status(400).json({ error: "subId is required." });
    const a = await SubAgreement.create({ projectId: req.params.id, subId: String(subId), name: String(name || "").slice(0, 200), description: String(description || "").slice(0, 2000) });
    res.status(201).json(a);
  } catch (err) { next(err); }
});

router.patch("/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const patch: Record<string, unknown> = {};
    if (typeof req.body?.name === "string") patch.name = req.body.name.slice(0, 200);
    if (typeof req.body?.description === "string") patch.description = req.body.description.slice(0, 2000);
    const a = await SubAgreement.findOneAndUpdate({ _id: req.params.aid, projectId: req.params.id }, patch, { new: true });
    if (!a) return res.status(404).json({ error: "Not found" });
    res.json(a);
  } catch (err) { next(err); }
});

router.delete("/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const a = await SubAgreement.findOneAndDelete({ _id: req.params.aid, projectId: req.params.id });
    for (const d of a?.documents || []) if (d.filePath) fs.unlink(path.resolve(d.filePath), () => {});
    res.json({ message: "Agreement deleted" });
  } catch (err) { next(err); }
});

// ── Document uploads (kind = agreement | offer | other) ───────────────────────
const storage = multer.diskStorage({
  destination: (req: AuthedRequest, _file, cb) => {
    const dir = path.join("uploads", req.params.id, "sub-agreements", req.params.aid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });

router.post("/:aid/files", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const a = await SubAgreement.findOne({ _id: req.params.aid, projectId: req.params.id });
    if (!a) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
    const kind = ["agreement", "offer", "other"].includes(String(req.body.kind)) ? req.body.kind : "other";
    a.documents.push({ kind, name: req.file.originalname, filePath: req.file.path.replace(/\\/g, "/"), fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(), size: humanSize(req.file.size) });
    await a.save();
    res.status(201).json(a);
  } catch (err) { next(err); }
});

router.delete("/:aid/files/:fid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const a = await SubAgreement.findOne({ _id: req.params.aid, projectId: req.params.id });
    if (!a) return res.status(404).json({ error: "Not found" });
    const doc = subs(a.documents).id(req.params.fid);
    if (doc?.filePath) fs.unlink(path.resolve(doc.filePath), () => {});
    if (doc) doc.deleteOne();
    await a.save();
    res.json(a);
  } catch (err) { next(err); }
});

export default router;
