import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Project from "../models/Project";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";
import { cleanGallery, coverOf, linkedGallery } from "../lib/projectGallery";

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

    // 2026-10-09 - the cover is the gallery's first picture: the new one takes the old cover's place
    // at the head of the gallery (keeping its pick for the report).
    const url = `/${req.file.path.replace(/\\/g, "/")}`;
    const gallery = linkedGallery(project.image, cleanGallery(project.toObject().gallery));
    const old = gallery.find((g) => g.url === project.image) || gallery.find((g) => g.type === "image");
    // Only a file under this project's own image folder is removed from disk (a gallery upload may
    // be in use elsewhere, as on a proposal).
    const own = `/uploads/${req.params.id}/project-image/`;
    if (old && old.url.startsWith(own) && !old.url.includes("..")) fs.unlink(old.url.replace(/^\//, ""), () => undefined);
    project.set("gallery", [{ type: "image", source: "upload", url, caption: "", report: !!old?.report }, ...gallery.filter((g) => g !== old)]);
    project.image = url;
    await project.save();

    res.json(project);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:id/image - owner only. CR 349: the cover picture can be removed.
router.delete("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id });
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.ownerId || String(project.ownerId) !== req.user!.userId) {
      return res.status(403).json({ error: "Only the project owner can change the image." });
    }
    // Only a file under this project's own image folder is removed from disk.
    const own = `/uploads/${req.params.id}/project-image/`;
    if (project.image && project.image.startsWith(own) && !project.image.includes("..")) fs.unlink(project.image.replace(/^\//, ""), () => undefined);
    // 2026-10-09 - the picture comes out of the gallery too, and the next one becomes the cover.
    const gallery = cleanGallery(project.toObject().gallery).filter((g) => g.url !== project.image);
    project.set("gallery", gallery);
    project.image = coverOf(gallery);
    await project.save();
    res.json(project);
  } catch (err) { next(err); }
});

export default router;
