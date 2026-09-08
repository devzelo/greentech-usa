import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import Company, { COMPANY_CATEGORIES } from "../models/Company";
import CompanyFile from "../models/CompanyFile";
import User from "../models/User";
import Project from "../models/Project";
import Task from "../models/Task";
import { enrichTasks } from "../lib/taskProfile";
import { buildCompanyLinks } from "../lib/profileLinks";
import { recycleAndDelete } from "../lib/recycleBin";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const humanFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const PROFILE_DOC_TYPES = ["catalogue", "certification", "document", "other"];

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Fields a company may self-update via the public link. Banking/tax are "sensitive": changes go
// into a pending buffer for GT to approve, rather than overwriting verified data immediately.
const SELF_FIELDS = ["name", "logoUrl", "address", "phone", "email", "website", "contactPersons", "banking", "tax", "notes"] as const;

// Companies / Contact Directory (client CR-P-06). Top-level, project-independent master list.
const router = Router();
router.use(requireAuth);

const FIELDS = ["name", "category", "categories", "logoUrl", "address", "phone", "email", "website", "contactPersons", "banking", "tax", "notes", "archived"] as const;

// CR-P — a company can hold several categories. Keep `categories` (the full set) and `category`
// (the primary = categories[0]) in sync on every write, whichever the client sent.
const CATS = new Set<string>(COMPANY_CATEGORIES as unknown as string[]);
function normalizeCategories(body: Record<string, unknown>) {
  let cats = Array.isArray(body.categories) ? (body.categories as unknown[]).map(String).filter((c) => CATS.has(c)) : undefined;
  if (cats) {
    cats = [...new Set(cats)];
    if (cats.length) { body.categories = cats; body.category = cats[0]; }
    else delete body.categories;   // never wipe to empty — leave the existing set
  } else if (typeof body.category === "string" && CATS.has(body.category)) {
    body.categories = [body.category];
  }
}

// List — optional ?category= filter (matches the primary OR the categories set) and ?archived=true.
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.category) { const c = String(req.query.category); filter.$or = [{ category: c }, { categories: c }]; }
    filter.archived = req.query.archived === "true" ? true : { $ne: true };
    res.json(await Company.find(filter).sort({ name: 1 }).lean());
  } catch (err) { next(err); }
});

router.get("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const c = await Company.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ error: "Company not found." });
    res.json(c);
  } catch (err) { next(err); }
});

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const body: Record<string, unknown> = { createdByName: req.user?.name || "" };
    for (const f of FIELDS) if (f in (req.body || {})) body[f] = req.body[f];
    if (!String(body.name || "").trim()) return res.status(400).json({ error: "Company name is required." });
    normalizeCategories(body);
    res.status(201).json(await Company.create(body));
  } catch (err) { next(err); }
});

router.patch("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) if (f in (req.body || {})) patch[f] = req.body[f];
    normalizeCategories(patch);
    const c = await Company.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true });
    if (!c) return res.status(404).json({ error: "Company not found." });
    res.json(c);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const c = await Company.findById(req.params.id);
    if (c) await recycleAndDelete(c, {
      kind: "company",
      name: c.name,
      subtitle: "Company",
      projectId: "",
      deletedById: req.user?.userId,
      deletedByName: req.user?.name || "",
    });
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

// CR-P-06c — populate the Directory from real data already in the platform: every project's
// client (clientInfo), JV partner, and subcontractors, plus existing vendors and product
// manufacturers (from the BOQ / submittals). Idempotent — only creates a profile for a name that
// isn't in the Directory yet, so it can be run repeatedly. Returns the count added per category.
router.post("/sync-from-projects", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const Vendor = (await import("../models/Vendor")).default;
    const ProcurementItem = (await import("../models/ProcurementItem")).default;
    const Submittal = (await import("../models/Submittal")).default;
    const [projects, vendors, existing, items, submittals] = await Promise.all([
      Project.find({}).select("clientInfo jointVenture subcontractors").lean(),
      Vendor.find({}).select("name email phone city country contactName").lean(),
      Company.find({}).select("name").lean(),
      ProcurementItem.find({ manufacturer: { $nin: ["", null] } }).select("manufacturer").lean(),
      Submittal.find({ manufacturer: { $nin: ["", null] } }).select("manufacturer").lean(),
    ]);
    const key = (s: string) => s.trim().toLowerCase();
    const seen = new Set<string>((existing as Array<{ name?: string }>).map((c) => key(String(c.name || ""))).filter(Boolean));
    const toCreate: Array<Record<string, unknown>> = [];
    const added: Record<string, number> = { client: 0, partner: 0, subcontractor: 0, vendor: 0, manufacturer: 0 };
    const person = (name?: string, email?: string, phone?: string) =>
      name ? [{ name, role: "", email: email || "", phone: phone || "" }] : [];
    const add = (name: string, category: keyof typeof added, extra: Record<string, unknown> = {}) => {
      const n = (name || "").trim();
      if (!n || seen.has(key(n))) return;
      seen.add(key(n));
      toCreate.push({ name: n, category, categories: [category], createdByName: req.user?.name || "Sync", ...extra });
      added[category] += 1;
    };
    for (const p of projects as Array<Record<string, any>>) {
      const ci = p.clientInfo || {};
      if (ci.name) add(ci.name, "client", { email: ci.email || "", phone: ci.phone || "", address: [ci.address, ci.country].filter(Boolean).join(", "), notes: ci.notes || "", contactPersons: person(ci.contactName, ci.email, ci.phone) });
      const jv = p.jointVenture || {};
      if (jv.enabled && jv.partnerName) add(jv.partnerName, "partner", { address: jv.partnerAddress || "", email: jv.email || "", phone: jv.phone || "", notes: jv.notes || "", contactPersons: person(jv.contactName, jv.email, jv.phone) });
      for (const s of (p.subcontractors || []) as Array<Record<string, string>>) if (s.name) add(s.name, "subcontractor", { email: s.email || "", phone: s.phone || "", notes: s.notes || "", contactPersons: person(s.contact, s.email, s.phone) });
    }
    for (const v of vendors as Array<Record<string, any>>) add(v.name, "vendor", { email: v.email || "", phone: v.phone || "", address: [v.city, v.country].filter(Boolean).join(", "), contactPersons: person(v.contactName, v.email, v.phone) });
    for (const it of items as Array<{ manufacturer?: string }>) if (it.manufacturer) add(it.manufacturer, "manufacturer");
    for (const s of submittals as Array<{ manufacturer?: string }>) if (s.manufacturer) add(s.manufacturer, "manufacturer");
    if (toCreate.length) await Company.insertMany(toCreate);
    res.json({ added: toCreate.length, byCategory: added });
  } catch (err) { next(err); }
});

// CR-P-07 — upload a company logo image (stateless: returns a public URL the editor stores in
// logoUrl, so it works before the company is even created). Images are served publicly.
const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => { const dir = path.join("uploads", "company", "logos"); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});
router.post("/logo", logoUpload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Please choose an image file." });
    res.status(201).json({ url: `/${req.file.path.replace(/\\/g, "/")}` });
  } catch (err) { next(err); }
});

// ── CR-P-07 — per-company profile documents (catalogues / certifications / docs) ──────────────
const profileStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const cid = String(req.params.id || "").replace(/[^\w-]/g, "");
    const dir = path.join("uploads", "company", "profile", cid || "misc");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const profileUpload = multer({ storage: profileStorage, limits: { fileSize: 64 * 1024 * 1024 } });

router.get("/:id/files", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const files = await CompanyFile.find({ kind: "profile", companyId: req.params.id }).sort({ createdAt: -1 }).lean();
    res.json(files);
  } catch (err) { next(err); }
});

router.post("/:id/files", profileUpload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const company = await Company.exists({ _id: req.params.id });
    if (!company) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Company not found." }); }
    const docType = PROFILE_DOC_TYPES.includes(String(req.body.docType)) ? String(req.body.docType) : "document";
    const file = await CompanyFile.create({
      kind: "profile",
      companyId: req.params.id,
      docType,
      name: req.file.originalname,
      fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(),
      size: humanFileSize(req.file.size),
      filePath: req.file.path.replace(/\\/g, "/"),
      description: String(req.body.description || ""),
      uploadedByName: req.user!.name || "",
    });
    res.status(201).json(file);
  } catch (err) { next(err); }
});

router.delete("/:id/files/:fid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const file = await CompanyFile.findOne({ _id: req.params.fid, kind: "profile", companyId: req.params.id });
    if (!file) return res.status(404).json({ error: "File not found." });
    await file.deleteOne();
    if (file.filePath) fs.unlink(path.resolve(file.filePath), () => {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// CR-P — the company's Kanban tasks (assignees matching this company's name) for its profile board.
router.get("/:id/tasks", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const c = await Company.findById(req.params.id).select("name").lean();
    const name = (c as { name?: string } | null)?.name || "";
    if (!name) return res.json([]);
    const rx = new RegExp(`^${escapeRegex(name)}$`, "i");
    const tasks = await Task.find({ "assignees.name": rx }).sort({ updatedAt: -1 }).limit(200).lean();
    res.json(await enrichTasks(tasks as unknown as Array<Record<string, unknown>>));
  } catch (err) { next(err); }
});

// CR-PR-05 — records that reference this company (auto-linked into its profile).
// CR-P (16) — aggregation moved to lib/profileLinks; it now also surfaces projects where the
// company sits in subcontractors[] or its login is a guest, so the Access tab sees every
// involvement regardless of which side the grant was made from.
router.get("/:id/links", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const c = await Company.findById(req.params.id).select("name email").lean();
    const name = (c as { name?: string } | null)?.name || "";
    const email = (c as { email?: string } | null)?.email || "";
    const login = await User.findOne(email
      ? { $or: [{ companyId: req.params.id }, { email: email.toLowerCase() }] }
      : { companyId: req.params.id }).select("_id").lean();
    res.json(await buildCompanyLinks(req.params.id, name, email, login ? String(login._id) : ""));
  } catch (err) { next(err); }
});

// CR-P-06d — generate (or reuse) the self-registration token for a company.
router.post("/:id/register-link", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const c = await Company.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Company not found." });
    if (!c.registerToken) { c.registerToken = crypto.randomBytes(24).toString("hex"); await c.save(); }
    res.json({ token: c.registerToken });
  } catch (err) { next(err); }
});

// Approve (apply) or discard a company's pending self-submitted update.
router.post("/:id/pending/:action", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const c = await Company.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Company not found." });
    if (req.params.action === "approve" && c.pendingUpdate?.data) {
      const data = JSON.parse(c.pendingUpdate.data) as Record<string, unknown>;
      for (const f of SELF_FIELDS) if (f in data) (c as unknown as Record<string, unknown>)[f] = data[f];
    }
    c.pendingUpdate = null;
    await c.save();
    res.json(c);
  } catch (err) { next(err); }
});

export default router;

// ── Public self-registration router (NO auth) — mounted separately at /api/public/companies ──
export const publicCompanyRouter = Router();
// The vendor opens the link and sees only what they need to fill in (never GT's internal notes).
publicCompanyRouter.get("/:token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const c = await Company.findOne({ registerToken: req.params.token });
    if (!c) return res.status(404).json({ error: "This link is invalid or has expired." });
    res.json({
      name: c.name, category: c.category, logoUrl: c.logoUrl, address: c.address, phone: c.phone,
      email: c.email, website: c.website, contactPersons: c.contactPersons, banking: c.banking, tax: c.tax,
    });
  } catch (err) { next(err); }
});
// The vendor submits their update — it lands in the pending buffer for GT to review.
publicCompanyRouter.patch("/:token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const c = await Company.findOne({ registerToken: req.params.token });
    if (!c) return res.status(404).json({ error: "This link is invalid or has expired." });
    const clean: Record<string, unknown> = {};
    for (const f of SELF_FIELDS) if (f in (req.body || {})) clean[f] = req.body[f];
    // CR-P-06d — record WHO submitted (from the primary contact they entered, or an explicit
    // submittedBy field) alongside WHEN, so GT can audit sensitive (e.g. banking) changes.
    const contacts = (clean.contactPersons as Array<{ name?: string; email?: string }> | undefined) || [];
    const submittedBy = String(req.body?.submittedBy || contacts[0]?.name || contacts[0]?.email || clean.email || "").slice(0, 120);
    c.pendingUpdate = { data: JSON.stringify(clean), submittedAt: new Date().toISOString(), submittedBy };
    await c.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
});
