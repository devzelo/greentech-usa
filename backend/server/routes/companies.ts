import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import Company from "../models/Company";
import Invoice from "../models/Invoice";
import Rfq from "../models/Rfq";
import ProcurementPO from "../models/ProcurementPO";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Fields a company may self-update via the public link. Banking/tax are "sensitive": changes go
// into a pending buffer for GT to approve, rather than overwriting verified data immediately.
const SELF_FIELDS = ["name", "logoUrl", "address", "phone", "email", "website", "contactPersons", "banking", "tax", "notes"] as const;

// Companies / Contact Directory (client CR-P-06). Top-level, project-independent master list.
const router = Router();
router.use(requireAuth);

const FIELDS = ["name", "category", "logoUrl", "address", "phone", "email", "website", "contactPersons", "banking", "tax", "notes", "archived"] as const;

// List — optional ?category= filter and ?archived=true (default hides archived).
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.category) filter.category = String(req.query.category);
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
    res.status(201).json(await Company.create(body));
  } catch (err) { next(err); }
});

router.patch("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) if (f in (req.body || {})) patch[f] = req.body[f];
    const c = await Company.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true });
    if (!c) return res.status(404).json({ error: "Company not found." });
    res.json(c);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try { await Company.findByIdAndDelete(req.params.id); res.json({ message: "Deleted" }); }
  catch (err) { next(err); }
});

// CR-PR-05 — records that reference this company (auto-linked into its profile).
router.get("/:id/links", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const c = await Company.findById(req.params.id).select("name").lean();
    const name = (c as { name?: string } | null)?.name || "";
    const nameRx = name ? new RegExp(`^${escapeRegex(name)}$`, "i") : null;
    const [invoices, rfqs, pos] = await Promise.all([
      // Invoices link by companyId (receiver picker) OR by matching party name.
      Invoice.find(nameRx ? { $or: [{ companyId: req.params.id }, { party: nameRx }] } : { companyId: req.params.id }).select("number type party amount date status projectId").sort({ createdAt: -1 }).limit(200).lean(),
      Rfq.find({ "recipients.companyId": req.params.id }).select("rfqNo title status projectId sentAt").sort({ createdAt: -1 }).limit(200).lean(),
      // POs store the vendor NAME — match the company's name to surface them under the profile.
      nameRx ? ProcurementPO.find({ vendorName: nameRx }).select("poNo vendorName total status projectId").sort({ createdAt: -1 }).limit(200).lean() : [],
    ]);
    res.json({ invoices, rfqs, pos });
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
    c.pendingUpdate = { data: JSON.stringify(clean), submittedAt: new Date().toISOString() };
    await c.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
});
