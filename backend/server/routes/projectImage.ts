import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Project from "../models/Project";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(blockGuests); // guests cannot change the project cover image

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // Project ids are our own generated values — reject anything that could escape uploads/.
    const id = String(req.params.id || "");
    if (!/^[A-Za-z0-9._-]+$/.test(id)) return cb(Object.assign(new Error("Invalid project id."), { statusCode: 400 }), "");
    const dir = path.join("uploads", id, "project-image");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    cb(null, `cover-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error("Only image files are allowed."), { statusCode: 400 }));
  },
});

// POST /api/projects/:id/image  — owner only
router.post("/", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const project = await Project.findOne({ projectId: req.params.id });
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.ownerId || String(project.ownerId) !== req.user!.userId) {
      return res.status(403).json({ error: "Only the project owner can change the image." });
    }

    // Remove the previous image file if it lived under this project's folder
    if (project.image && project.image.startsWith("/uploads/")) {
      const oldPath = project.image.replace(/^\//, "");
      fs.unlink(oldPath, () => undefined);
    }

    const url = `/${req.file.path.replace(/\\/g, "/")}`;
    project.image = url;
    await project.save();

    res.json(project);
  } catch (err) {
    next(err);
  }
});

export default router;
