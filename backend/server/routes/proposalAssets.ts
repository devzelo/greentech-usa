import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";

// Image assets for the proposal builder — cover images and signature images.
// Owners & assigned employees may upload (tabAccessGuard "proposals" with a write method).
const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["proposals"]));

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join("uploads", req.params.id, "proposal");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    cb(null, `p-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error("Only image files are allowed."), { statusCode: 400 }));
  },
});

// POST /api/projects/:id/proposal-assets — returns { url }
router.post("/", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const url = `/${req.file.path.replace(/\\/g, "/")}`;
    res.status(201).json({ url });
  } catch (err) { next(err); }
});

export default router;
