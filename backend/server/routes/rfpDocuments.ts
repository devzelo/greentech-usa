import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import RfpDocument from "../models/RfpDocument";
import User from "../models/User";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";

// Company-wide RFP / spec library. Staff only.
const router = Router();
router.use(requireAuth);
router.use(blockGuests);

const humanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => { const dir = path.join("uploads", "rfp"); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });

// GET /api/rfp-documents?q=&type=
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { q, type } = req.query as { q?: string; type?: string };
    const filter: Record<string, unknown> = {};
    if (type && type !== "All") filter.docType = type;
    if (q && q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ title: rx }, { "sections.title": rx }, { "sections.notes": rx }, { "requirements.text": rx }];
    }
    const docs = await RfpDocument.find(filter).sort({ updatedAt: -1 }).lean();
    res.json(docs);
  } catch (err) { next(err); }
});

// POST /api/rfp-documents — multipart: fields title, docType + optional file
router.post("/", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { title, docType } = req.body || {};
    if (!title || !String(title).trim()) { if (req.file) fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: "Title is required." }); }
    const me = await User.findById(req.user!.userId).select("name").lean();
    const doc = await RfpDocument.create({
      title: String(title).trim(),
      docType: docType || "RFP",
      fileName: req.file?.originalname || "",
      filePath: req.file ? req.file.path.replace(/\\/g, "/") : "",
      fileType: req.file ? (req.file.originalname.split(".").pop() || "").toLowerCase() : "",
      size: req.file ? humanSize(req.file.size) : "",
      sections: [],
      requirements: [],
      createdById: req.user!.userId,
      createdByName: (me as { name?: string } | null)?.name || "",
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

// PUT /api/rfp-documents/:id — update title/type/sections/requirements
router.put("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { title, docType, sections, requirements } = req.body || {};
    const updates: Record<string, unknown> = {};
    if (typeof title === "string" && title.trim()) updates.title = title.trim();
    if (typeof docType === "string") updates.docType = docType;
    if (Array.isArray(sections)) updates.sections = sections;
    if (Array.isArray(requirements)) updates.requirements = requirements;
    const doc = await RfpDocument.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: "Document not found." });
    res.json(doc);
  } catch (err) { next(err); }
});

// DELETE /api/rfp-documents/:id — creator or admin
router.delete("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await RfpDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found." });
    if (req.user!.role !== "admin" && String(doc.createdById) !== req.user!.userId)
      return res.status(403).json({ error: "Only the creator or an admin can delete this document." });
    if (doc.filePath) fs.unlink(path.resolve(doc.filePath), () => {});
    await doc.deleteOne();
    res.json({ message: "Document deleted." });
  } catch (err) { next(err); }
});

export default router;
