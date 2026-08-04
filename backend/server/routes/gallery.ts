import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Project from "../models/Project";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(blockGuests); // only owners (employees gated below) manage the public gallery

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join("uploads", req.params.id, "gallery");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || "";
    cb(null, `g-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 64 * 1024 * 1024 }, // 64 MB (allows short videos)
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype) || /^video\//.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error("Only image or video files are allowed."), { statusCode: 400 }));
  },
});

// POST /api/projects/:id/gallery — upload one image/video file (owner only). Returns { url, type }.
router.post("/", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const project = await Project.findOne({ projectId: req.params.id }).select("ownerId").lean();
    if (!project) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Project not found." }); }
    if (!project.ownerId || String(project.ownerId) !== req.user!.userId) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: "Only the project owner can manage the gallery." });
    }
    const url = `/${req.file.path.replace(/\\/g, "/")}`;
    const type = /^video\//.test(req.file.mimetype) ? "video" : "image";
    res.status(201).json({ url, type });
  } catch (err) {
    next(err);
  }
});

export default router;
