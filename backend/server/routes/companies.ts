import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import Company from "../models/Company";
import Invoice from "../models/Invoice";
import Rfq from "../models/Rfq";
import ProcurementPO from "../models/ProcurementPO";
import Project from "../models/Project";
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
      toCreate.push({ name: n, category, createdByName: req.user?.name || "Sync", ...extra });
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

// CR-PR-05 — records that reference this company (auto-linked into its profile).
router.get("/:id/links", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const c = await Company.findById(req.params.id).select("name").lean();
    const name = (c as { name?: string } | null)?.name || "";
    const nameRx = name ? new RegExp(`^${escapeRegex(name)}$`, "i") : null;
    const Shipment = (await import("../models/Shipment")).default;
    const Vendor = (await import("../models/Vendor")).default;
    const VendorQuote = (await import("../models/VendorQuote")).default;
    const Agreement = (await import("../models/Agreement")).default;
    const Submittal = (await import("../models/Submittal")).default;
    // CR-PR-05 — received quotes: project Vendors named like this company → their quotes.
    const vendorIds = nameRx ? (await Vendor.find({ name: nameRx }).select("_id").lean()).map((v) => String(v._id)) : [];
    const [invoices, rfqs, pos, shipments, quotes, agreements, submittals] = await Promise.all([
      // Invoices link by companyId (receiver picker) OR by matching party name.
      Invoice.find(nameRx ? { $or: [{ companyId: req.params.id }, { party: nameRx }] } : { companyId: req.params.id }).select("number type party amount date status projectId").sort({ createdAt: -1 }).limit(200).lean(),
      Rfq.find({ "recipients.companyId": req.params.id }).select("rfqNo title status projectId sentAt").sort({ createdAt: -1 }).limit(200).lean(),
      // POs store the vendor NAME — match the company's name to surface them under the profile.
      nameRx ? ProcurementPO.find({ vendorName: nameRx }).select("poNo vendorName total status projectId").sort({ createdAt: -1 }).limit(200).lean() : [],
      // CR-P-06b — shipping/delivery records: shipments whose logistics agency is this company.
      nameRx ? Shipment.find({ agencyName: nameRx }).select("name status etaDate agencyName projectId").sort({ createdAt: -1 }).limit(200).lean() : [],
      vendorIds.length ? VendorQuote.find({ vendorId: { $in: vendorIds } }).select("rfqId total status accepted projectId").sort({ createdAt: -1 }).limit(200).lean() : [],
      // CR-P-06b — agreements/contracts with this company (matched on the counterparty name).
      nameRx ? Agreement.find({ "partySnapshot.party2.name": nameRx }).select("name status projectId").sort({ createdAt: -1 }).limit(200).lean() : [],
      // CR-P-06b — submittals for this company's products (matched on manufacturer/brand).
      nameRx ? Submittal.find({ manufacturer: nameRx }).select("productName manufacturer status projectId").sort({ createdAt: -1 }).limit(200).lean() : [],
    ]);
    // CR-P-06b — "projects they have been involved with": every project referenced by any of the
    // linked records above (invoices / RFQs / POs / shipments), resolved to name + status.
    const pidSet = new Set<string>();
    for (const arr of [invoices, rfqs, pos, shipments, quotes, agreements, submittals] as Array<Array<{ projectId?: string }>>)
      for (const r of arr) if (r.projectId) pidSet.add(r.projectId);
    const projects = pidSet.size
      ? await Project.find({ projectId: { $in: [...pidSet] } }).select("projectId name status").limit(200).lean()
      : [];
    res.json({ invoices, rfqs, pos, shipments, quotes, agreements, submittals, projects });
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
