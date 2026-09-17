import { Router, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import UserFile from "../models/UserFile";
import { requireAuth, AuthedRequest } from "../middleware/auth";

// Quick Toolbox (client list, 2026-09-17): exchange rates for the currency converter, and the
// personal "Saved" files the tools produce (snips, edited images, PDFs). Saved files are the
// user's own profile documents, so they also show under My Profile.
const router = Router();
router.use(requireAuth);

const TOOLBOX_NOTE = "Saved from the toolbox";

const humanFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

// ── Exchange rates ───────────────────────────────────────────────────────────
// open.er-api.com: free, no key, ~160 currencies, updated daily. Cached per base for 6 hours.
type Rates = { base: string; date: string; rates: Record<string, number>; source: string };
const rateCache = new Map<string, { at: number; data: Rates }>();
const SIX_HOURS = 6 * 60 * 60 * 1000;

async function loadRates(base: string): Promise<Rates> {
  const hit = rateCache.get(base);
  if (hit && Date.now() - hit.at < SIX_HOURS) return hit.data;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${base}`, { signal: ctrl.signal });
    const j = await r.json() as { result?: string; base_code?: string; time_last_update_utc?: string; rates?: Record<string, number> };
    if (!r.ok || j.result !== "success" || !j.rates) throw new Error("Exchange rates are not available right now.");
    const data: Rates = {
      base: j.base_code || base,
      date: j.time_last_update_utc ? new Date(j.time_last_update_utc).toISOString() : new Date().toISOString(),
      rates: j.rates,
      source: "ExchangeRate-API (open.er-api.com)",
    };
    rateCache.set(base, { at: Date.now(), data });
    return data;
  } catch (err) {
    if (hit) return hit.data; // stale beats nothing
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

router.get("/rates", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const base = String(req.query.base || "USD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(base)) return res.status(400).json({ error: "Invalid currency code." });
    res.json(await loadRates(base));
  } catch (err) {
    if (err instanceof Error && !("statusCode" in err)) return res.status(502).json({ error: err.message || "Exchange rates are not available right now." });
    next(err);
  }
});

// ── Saved files ──────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uid = String((req as AuthedRequest).user!.userId).replace(/[^\w-]/g, "");
    const dir = path.join("uploads", "users", uid, "toolbox");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.\- ]/g, "_")}`),
});
const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });

router.get("/files", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try { res.json(await UserFile.find({ userId: req.user!.userId, description: TOOLBOX_NOTE }).sort({ createdAt: -1 }).limit(100).lean()); }
  catch (err) { next(err); }
});

router.post("/files", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const file = await UserFile.create({
      userId: req.user!.userId,
      name: req.file.originalname,
      fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(),
      size: humanFileSize(req.file.size),
      filePath: req.file.path.replace(/\\/g, "/"),
      description: TOOLBOX_NOTE,
      uploadedByName: req.user!.name || "",
    });
    res.status(201).json(file);
  } catch (err) { next(err); }
});

router.delete("/files/:fid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!mongoose.isValidObjectId(req.params.fid)) return res.status(404).json({ error: "File not found." });
    const file = await UserFile.findOne({ _id: req.params.fid, userId: req.user!.userId, description: TOOLBOX_NOTE });
    if (!file) return res.status(404).json({ error: "File not found." });
    await file.deleteOne();
    if (file.filePath) fs.unlink(path.resolve(file.filePath), () => {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
