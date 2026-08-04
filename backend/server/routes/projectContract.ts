import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Project from "../models/Project";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";

// The signed contract document for a project — uploaded on the project identity, previewable
// wherever the project is shown. One per project; re-uploading replaces the previous file.
const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(blockGuests);

// Project ids are our own generated values ("2026-01", "PROJ-204") — anything else is a
// crafted path and must never reach the filesystem.
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const id = String(req.params.id || "");
    if (!SAFE_ID.test(id)) return cb(Object.assign(new Error("Invalid project id."), { statusCode: 400 }), "");
    const dir = path.join("uploads", id, "contract");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  // The stored name is ours (extension only) — the uploaded name is kept in contractFile.name.
  // Using the raw originalname would let "../../x" escape the destination folder.
  filename: (_req, file, cb) => cb(null, `contract-${Date.now()}${path.extname(file.originalname).toLowerCase().slice(0, 12)}`),
});
const upload = multer({ storage, limits: { fileSize: 32 * 1024 * 1024 } });
const humanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);

async function ownedProject(req: AuthedRequest, res: Response) {
  const project = await Project.findOne({ projectId: req.params.id });
  if (!project) { res.status(404).json({ error: "Project not found." }); return null; }
  if (!project.ownerId || String(project.ownerId) !== req.user!.userId) {
    res.status(403).json({ error: "Only the project owner can change the contract." });
    return null;
  }
  return project;
}

// POST /api/projects/:id/contract — owner only
router.post("/", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const project = await ownedProject(req, res);
    if (!project) { fs.unlink(req.file.path, () => {}); return; }
    if (project.contractFile?.filePath) fs.unlink(path.resolve(project.contractFile.filePath), () => {});
    project.contractFile = {
      name: req.file.originalname,
      filePath: req.file.path.replace(/\\/g, "/"),
      fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(),
      size: humanSize(req.file.size),
    };
    await project.save();
    res.status(201).json(project);
  } catch (err) { next(err); }
});

router.delete("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await ownedProject(req, res);
    if (!project) return;
    if (project.contractFile?.filePath) fs.unlink(path.resolve(project.contractFile.filePath), () => {});
    project.contractFile = null;
    await project.save();
    res.json(project);
  } catch (err) { next(err); }
});

export default router;
