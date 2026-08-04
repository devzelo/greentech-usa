import { Router, Response } from "express";
import path from "path";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { signFilesToken, signFileShareToken } from "../lib/fileTokens";

const router = Router();
router.use(requireAuth);

// GET /api/files/token — short-lived token the app appends to /uploads URLs
// so <img>/<a download> requests (which cannot carry auth headers) are authorized.
router.get("/token", (req: AuthedRequest, res: Response) => {
  res.json({ token: signFilesToken(req.user!.userId) });
});

// POST /api/files/share-link — mint a signed single-file link (7-day expiry)
// for sharing a stored document with someone outside the app.
router.post("/share-link", (req: AuthedRequest, res: Response) => {
  const raw = typeof req.body?.path === "string" ? req.body.path : "";
  const rel = raw
    .split("?")[0]
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^uploads\//, "");
  const normalized = path.posix.normalize(rel);
  if (!normalized || normalized === "." || normalized.startsWith("..") || path.posix.isAbsolute(normalized)) {
    return res.status(400).json({ error: "Invalid file path." });
  }
  res.json({ url: `/uploads/${normalized}?token=${encodeURIComponent(signFileShareToken(normalized))}` });
});

export default router;
