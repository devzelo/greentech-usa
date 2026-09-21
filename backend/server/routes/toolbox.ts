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
// Two free, keyless sources, merged: open.er-api.com (~165 currencies, the main one) and the
// fawazahmed0 currency-api on jsDelivr (~340 codes: every ISO currency plus crypto, metals and a few
// legacy ones). Any code the first lacks comes from the second, and either one alone is enough if
// the other is down. The Iranian Toman (IRT, not an ISO code) is added as 1/10 of the Rial, because
// prices in Iran are quoted in Toman. Cached per base for 6 hours.
type Rates = { base: string; date: string; rates: Record<string, number>; names: Record<string, string>; source: string };
const rateCache = new Map<string, { at: number; data: Rates }>();
const SIX_HOURS = 6 * 60 * 60 * 1000;
const EXTRA_NAMES: Record<string, string> = { IRT: "Iranian Toman (10 Rial)" };

async function getJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json() as T;
  } finally { clearTimeout(timer); }
}

async function fromErApi(base: string) {
  const j = await getJson<{ result?: string; base_code?: string; time_last_update_utc?: string; rates?: Record<string, number> }>(`https://open.er-api.com/v6/latest/${base}`);
  if (j.result !== "success" || !j.rates) throw new Error("open.er-api returned no rates");
  return { date: j.time_last_update_utc ? new Date(j.time_last_update_utc).toISOString() : new Date().toISOString(), rates: j.rates };
}

async function fromCurrencyApi(base: string) {
  const b = base.toLowerCase();
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${b}.min.json`,
    `https://latest.currency-api.pages.dev/v1/currencies/${b}.min.json`,
  ];
  let last: unknown;
  for (const u of urls) {
    try {
      const j = await getJson<Record<string, unknown>>(u);
      const raw = j[b] as Record<string, number> | undefined;
      if (!raw) throw new Error("currency-api returned no rates");
      const rates: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw)) if (/^[a-z]{3}$/.test(k) && typeof v === "number" && v > 0) rates[k.toUpperCase()] = v;
      const names = await getJson<Record<string, string>>(u.replace(/currencies\/[a-z]+\.min\.json$/, "currencies.min.json")).catch(() => ({} as Record<string, string>));
      const upperNames: Record<string, string> = {};
      for (const [k, v] of Object.entries(names)) if (/^[a-z]{3}$/.test(k) && v) upperNames[k.toUpperCase()] = v;
      return { date: new Date(`${String(j.date || "").slice(0, 10) || new Date().toISOString().slice(0, 10)}T00:00:00Z`).toISOString(), rates, names: upperNames };
    } catch (e) { last = e; }
  }
  throw last instanceof Error ? last : new Error("currency-api unavailable");
}

async function loadRates(base: string): Promise<Rates> {
  const hit = rateCache.get(base);
  if (hit && Date.now() - hit.at < SIX_HOURS) return hit.data;
  const [a, b] = await Promise.allSettled([fromErApi(base), fromCurrencyApi(base)]);
  if (a.status === "rejected" && b.status === "rejected") {
    if (hit) return hit.data; // stale beats nothing
    throw new Error("Exchange rates are not available right now.");
  }
  const main = a.status === "fulfilled" ? a.value : null;
  const more = b.status === "fulfilled" ? b.value : null;
  const rates: Record<string, number> = { ...(more?.rates || {}), ...(main?.rates || {}) };
  if (rates.IRR) rates.IRT = rates.IRR / 10;
  if (base === "IRR") rates.IRT = 0.1;
  const sources = [main && "ExchangeRate-API (open.er-api.com)", more && (main ? "currency-api (extra currencies)" : "currency-api")].filter(Boolean).join(" + ");
  const data: Rates = {
    base,
    date: (main || more)!.date,
    rates,
    names: { ...(more?.names || {}), ...EXTRA_NAMES },
    source: sources,
  };
  rateCache.set(base, { at: Date.now(), data });
  return data;
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
