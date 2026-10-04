import mongoose from "mongoose";
import { Router, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import Rfq from "../models/Rfq";
import WorkPackage from "../models/WorkPackage";
import { locksOf } from "../lib/workPackageLocks";
import { ownerFilter, ownerPackage, linkIfEmpty } from "../lib/packageOwned";
import Company from "../models/Company";
import Project from "../models/Project";
import User from "../models/User";
import { sendMail } from "../lib/mailer";
import Vendor from "../models/Vendor";
import VendorQuote from "../models/VendorQuote";
import ProcurementEvent from "../models/ProcurementEvent";
import ProcurementItem from "../models/ProcurementItem";
import ProjectDocument from "../models/ProjectDocument";
import { recycleAndDelete } from "../lib/recycleBin";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { procTabGuard } from "../lib/access";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(procTabGuard(["proc-rfqs"]));

// Writes gated by tabAccessGuard (requires "edit"); a guest granted RFQ-edit may write.
const block = (_req: AuthedRequest, _res: Response) => false;
async function logEvent(req: AuthedRequest, e: { entityId: string; action: string; fromValue?: string; toValue?: string }) {
  try { await ProcurementEvent.create({ projectId: req.params.id, entityType: "rfq", entityId: e.entityId, action: e.action, fromValue: e.fromValue || "", toValue: e.toValue || "", actorId: req.user!.userId, actorName: req.user!.name || "" }); } catch { /* best-effort */ }
}

// List RFQs with their vendor quotes attached.
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    // CR-PR-07 — hide archived RFQs by default; ?archived=true returns only archived ones.
    const arch = String(req.query.archived) === "true" ? { archived: true } : { archived: { $ne: true } };
    // CR 345 - Procurement lists its own RFQs; a work package's view lists the package's (?package=).
    const rfqs = await Rfq.find({ projectId: req.params.id, ...arch, ...(await ownerFilter(req.params.id, req.query, "rfqId")) }).sort({ createdAt: 1 }).lean();
    const quotes = await VendorQuote.find({ projectId: req.params.id }).lean();
    const byRfq: Record<string, unknown[]> = {};
    for (const q of quotes) (byRfq[String(q.rfqId)] ||= []).push(q);
    // CR 335 - the work package each RFQ is for (the package holds the link).
    const pk = await WorkPackage.find({ projectId: req.params.id, rfqId: { $in: rfqs.map((r) => String(r._id)) } }).select("rfqId").lean();
    const pkOf = new Map(pk.map((p) => [p.rfqId, String(p._id)]));
    res.json(rfqs.map((r) => ({ ...r, quotes: byRfq[String(r._id)] || [], workPackageId: pkOf.get(String(r._id)) || "" })));
  } catch (err) { next(err); }
});

// CR 335 - the Create RFQ form's fields, cleaned. Only what was sent is returned.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const REQUESTS = ["leadTime", "dataSheets", "alternatives", "warranty", "other"];
function formFields(b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof b.date === "string") out.date = ISO_DAY.test(b.date) ? b.date : "";
  if (typeof b.dueDate === "string") out.dueDate = ISO_DAY.test(b.dueDate) ? b.dueDate : "";
  if (typeof b.currency === "string") out.currency = b.currency.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "USD";
  if (Array.isArray(b.requests)) out.requests = [...new Set(b.requests.map(String).filter((x) => REQUESTS.includes(x)))];
  if (typeof b.showTargetPrices === "boolean") out.showTargetPrices = b.showTargetPrices;
  return out;
}

/** The work package an RFQ is for ("" when none). */
async function packageOf(projectId: string, rid: string): Promise<string> {
  const p = await WorkPackage.findOne({ projectId, rfqId: rid }).select("_id").lean();
  return p ? String(p._id) : "";
}
/**
 * CR 335 - link the RFQ to a work package ("" unlinks it). The package holds the link (its rfqId),
 * as when the RFQ is made from the package. A package bound to a signed PO or agreement keeps its
 * links (CR 328), and a package already on another RFQ is not taken over.
 */
async function linkPackage(projectId: string, rid: string, wpId: string): Promise<string> {
  const target = wpId ? await WorkPackage.findOne({ _id: mongoose.isValidObjectId(wpId) ? wpId : null, projectId }) : null;
  if (wpId && !target) return "That work package is not in this project.";
  if (target && target.rfqId === rid) return "";
  if (target?.rfqId) return `"${target.name}" is already linked to another RFQ. Unlink it on the work package first.`;
  const current = await WorkPackage.find({ projectId, rfqId: rid });
  for (const p of [...current, ...(target ? [target] : [])]) {
    const locks = await locksOf(projectId, p);
    if (locks.length) return `"${p.name}" is locked: ${locks[0].no} is ${locks[0].label}. Its links stay as they are.`;
  }
  for (const p of current) { p.rfqId = ""; await p.save(); }
  if (target) { target.rfqId = rid; await target.save(); }
  return "";
}

// STEP 1a — Create an RFQ (a DRAFT request) from selected BOQ items (line items snapshot).
// Items are NOT advanced yet; that happens when the request is actually sent to vendors (see /send).
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const { title, lineItems, includesShipping, includesTax, notes, shipToLocation, deliveryMethod } = req.body || {};
    // CR 335 - the Create RFQ form's own fields (dates, currency, requests, target prices).
    const extra = formFields(req.body || {});
    // G — numbers-only, per-project, RFQ range starts at 7000. Use max-existing+1 (not count+1)
    // so deleting an RFQ never lets the next one reuse a number (CR-PR-06 durable uniqueness).
    const existingRfqs = await Rfq.find({ projectId: req.params.id }).select("rfqNo").lean();
    const maxRfqNo = existingRfqs.reduce((m, r) => Math.max(m, parseInt(String((r as { rfqNo?: string }).rfqNo ?? "").replace(/[^0-9]/g, ""), 10) || 0), 7000);
    const rfqNo = String(maxRfqNo + 1);
    const rfq = await Rfq.create({
      projectId: req.params.id, rfqNo, title: title || `RFQ ${rfqNo}`,
      lineItems: Array.isArray(lineItems) ? lineItems.slice(0, 500) : [],
      includesShipping: includesShipping !== false, includesTax: includesTax !== false,
      shipToLocation: shipToLocation || "", deliveryMethod: deliveryMethod || "", notes: notes || "",
      date: new Date().toISOString().slice(0, 10),
      ...extra,
      status: "Draft",
      addedByName: req.user!.name || "",
    });
    await logEvent(req, { entityId: String(rfq._id), action: "created", toValue: rfqNo });
    // CR 345 - made in a work package's view: the package owns it (and links it when it has no RFQ yet).
    const owner = req.body?.ownerPackageId ? await ownerPackage(req.params.id, req.body.ownerPackageId) : null;
    if (req.body?.ownerPackageId && !owner) { await rfq.deleteOne(); return res.status(404).json({ error: "That work package is not in this project." }); }
    if (owner) {
      rfq.ownerPackageId = String(owner._id);
      await rfq.save();
      await linkIfEmpty(req.params.id, String(owner._id), "rfqId", String(rfq._id));
      return res.status(201).json({ ...rfq.toObject(), quotes: [], workPackageId: String(owner._id) });
    }
    // The work package it is for (optional): the package keeps the link (its rfqId).
    let workPackageId = "";
    if (typeof req.body?.workPackageId === "string" && req.body.workPackageId && req.user!.role !== "subcontractor") {
      const err = await linkPackage(req.params.id, String(rfq._id), req.body.workPackageId);
      if (err) { await rfq.deleteOne(); return res.status(409).json({ error: err }); }
      workPackageId = req.body.workPackageId;
    }
    res.status(201).json({ ...rfq.toObject(), quotes: [], workPackageId });
  } catch (err) { next(err); }
});

// STEP 1b — Send the request to vendors. Marks the RFQ Sent and advances its BOQ items to RFQ_Sent.
router.post("/:rid/send", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const rfq = await Rfq.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!rfq) return res.status(404).json({ error: "Not found" });
    if (rfq.status === "Draft") rfq.status = "Sent";
    rfq.sentAt = req.body?.sentAt || new Date().toISOString().slice(0, 10);
    await rfq.save();
    const itemIds = (rfq.lineItems || []).map((l) => l.itemId).filter(Boolean);
    if (itemIds.length) await ProcurementItem.updateMany({ _id: { $in: itemIds }, projectId: req.params.id, status: "BOQ" }, { $set: { status: "RFQ_Sent" } });
    await logEvent(req, { entityId: String(rfq._id), action: "sent", toValue: rfq.sentAt });
    const quotes = await VendorQuote.find({ rfqId: req.params.rid, projectId: req.params.id }).lean();
    res.json({ ...rfq.toObject(), quotes });
  } catch (err) { next(err); }
});

router.patch("/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const patch: Record<string, unknown> = {};
    for (const f of ["title", "notes", "includesShipping", "includesTax", "shipToLocation", "deliveryMethod", "status", "lineItems", "recipients", "archived", "assignedTo"]) if (f in (req.body || {})) patch[f] = req.body[f];
    Object.assign(patch, formFields(req.body || {}));
    // Work packages are GreenTech's internal list (CR 328): an outside login cannot relink one.
    if (typeof req.body?.workPackageId === "string" && req.user!.role !== "subcontractor") {
      const err = await linkPackage(req.params.id, req.params.rid, req.body.workPackageId);
      if (err) return res.status(409).json({ error: err });
    }
    // Per-item docs (CR-PR-03) are uploaded separately, so a wholesale lineItems PATCH must NOT
    // wipe them — preserve each existing line's attachments by _id when the client omits them.
    if (Array.isArray(patch.lineItems)) {
      const existing = await Rfq.findOne({ _id: req.params.rid, projectId: req.params.id });
      const byId = new Map((existing?.lineItems || []).map((l) => [String((l as { _id?: unknown })._id), l.attachments || []]));
      patch.lineItems = (patch.lineItems as Array<Record<string, unknown>>).map((l) => {
        const id = l._id ? String(l._id) : "";
        return l.attachments === undefined && id && byId.has(id) ? { ...l, attachments: byId.get(id) } : l;
      });
    }
    const rfq = await Rfq.findOneAndUpdate({ _id: req.params.rid, projectId: req.params.id }, patch, { new: true });
    if (!rfq) return res.status(404).json({ error: "Not found" });
    res.json({ ...rfq.toObject(), workPackageId: await packageOf(req.params.id, req.params.rid) });
  } catch (err) { next(err); }
});

router.delete("/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const rfq = await Rfq.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (rfq) {
      await recycleAndDelete(rfq, {
        kind: "rfq",
        name: rfq.title,
        subtitle: "RFQ",
        projectId: String(rfq.projectId),
        deletedById: req.user?.userId,
        deletedByName: req.user?.name || "",
      });
    }
    await VendorQuote.deleteMany({ rfqId: req.params.rid, projectId: req.params.id });
    res.json({ message: "RFQ deleted" });
  } catch (err) { next(err); }
});

// ── Vendor quotes ───────────────────────────────────────────────────────────
router.post("/:rid/quotes", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const rfq = await Rfq.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });
    const lineItems = (rfq.lineItems || []).map((l) => ({ itemId: l.itemId, unitPrice: "" }));
    const quote = await VendorQuote.create({ projectId: req.params.id, rfqId: req.params.rid, vendorId: req.body?.vendorId || "", lineItems, status: "Received" });
    // STEP 2 begins — once a vendor quote is in, the RFQ moves from Sent to Quoting.
    if (rfq.status === "Sent" || rfq.status === "Draft") { rfq.status = "Quoting"; await rfq.save(); }
    res.status(201).json(quote);
  } catch (err) { next(err); }
});

const QUOTE_FIELDS = ["vendorId", "lineItems", "totalOverride", "shipping", "tax", "leadTimeDays", "inclusions", "exclusions", "notes", "status"] as const;
router.patch("/:rid/quotes/:qid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const patch: Record<string, unknown> = {};
    for (const f of QUOTE_FIELDS) if (f in (req.body || {})) patch[f] = req.body[f];
    const q = await VendorQuote.findOneAndUpdate({ _id: req.params.qid, rfqId: req.params.rid, projectId: req.params.id }, patch, { new: true });
    if (!q) return res.status(404).json({ error: "Not found" });
    res.json(q);
  } catch (err) { next(err); }
});

router.delete("/:rid/quotes/:qid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    await VendorQuote.findOneAndDelete({ _id: req.params.qid, rfqId: req.params.rid, projectId: req.params.id });
    res.json({ message: "Quote deleted" });
  } catch (err) { next(err); }
});

// Award a quote — it becomes Awarded, the others on this RFQ become NotSelected (kept).
router.post("/:rid/quotes/:qid/award", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const q = await VendorQuote.findOne({ _id: req.params.qid, rfqId: req.params.rid, projectId: req.params.id });
    if (!q) return res.status(404).json({ error: "Not found" });
    await VendorQuote.updateMany({ rfqId: req.params.rid, projectId: req.params.id, _id: { $ne: q._id } }, { $set: { status: "NotSelected" } });
    q.status = "Awarded";
    await q.save();
    // Accepting a quote closes the RFQ (Awarded) and advances the RFQ's BOQ items to Quoted.
    const rfq = await Rfq.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (rfq) { rfq.status = "Awarded"; await rfq.save(); }
    const itemIds = (rfq?.lineItems || []).map((l) => l.itemId).filter(Boolean);
    if (itemIds.length) await ProcurementItem.updateMany({ _id: { $in: itemIds }, projectId: req.params.id, status: { $in: ["BOQ", "RFQ_Sent"] } }, { $set: { status: "Quoted" } });
    // Accepting a vendor stamps that vendor's name onto the items — shown in the BOQ & Master Log.
    // Guard the lookup: a quote with no/invalid vendorId must not throw after the award landed.
    const vendor = /^[a-f\d]{24}$/i.test(String(q.vendorId || "")) ? await Vendor.findById(q.vendorId).lean() : null;
    if (itemIds.length && vendor?.name) {
      await ProcurementItem.updateMany(
        { _id: { $in: itemIds }, projectId: req.params.id, status: { $ne: "Cancelled" } },
        { $set: { vendorName: vendor.name } }
      );
    }
    await logEvent(req, { entityId: req.params.rid, action: "awarded", toValue: q.vendorId });
    res.json(q);
  } catch (err) { next(err); }
});

// ── Vendor quote attachments (STEP 2 — upload the vendor's returned quotation) ─────────────────
const storage = multer.diskStorage({
  destination: (req: AuthedRequest, _file, cb) => {
    const dir = path.join("uploads", req.params.id, "rfq-quotes", req.params.qid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });

router.post("/:rid/quotes/:qid/attachments", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const q = await VendorQuote.findOne({ _id: req.params.qid, rfqId: req.params.rid, projectId: req.params.id });
    if (!q) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Quote not found." }); }
    const fileType = (req.file.originalname.split(".").pop() || "").toLowerCase();
    const size = humanSize(req.file.size);
    q.attachments.push({ name: req.file.originalname, filePath: req.file.path.replace(/\\/g, "/"), fileType, size });
    await q.save();
    // Auto-save a copy into the organized project documents (Procurement → Quotes) — no manual step.
    try {
      const destDir = path.join("uploads", req.params.id, "procurement-quotes");
      fs.mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, `${Date.now()}-${path.basename(req.file.path)}`);
      fs.copyFileSync(path.resolve(req.file.path), dest);
      await ProjectDocument.create({ projectId: req.params.id, section: "procurement-quotes", name: req.file.originalname, fileType, size, filePath: dest.replace(/\\/g, "/") });
    } catch { /* best-effort — the quote is saved regardless */ }
    res.status(201).json(q);
  } catch (err) { next(err); }
});

router.delete("/:rid/quotes/:qid/attachments/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const q = await VendorQuote.findOne({ _id: req.params.qid, rfqId: req.params.rid, projectId: req.params.id });
    if (!q) return res.status(404).json({ error: "Not found" });
    const att = (q.attachments || []).find((a) => String((a as { _id?: unknown })._id) === req.params.aid);
    if (att?.filePath) fs.unlink(path.resolve(att.filePath), () => {});
    q.attachments = (q.attachments || []).filter((a) => String((a as { _id?: unknown })._id) !== req.params.aid);
    await q.save();
    res.json(q);
  } catch (err) { next(err); }
});

// ── Per-item RFQ documents (CR-PR-03 — specs/data sheets/drawings the vendor needs) ────────────
const lineStorage = multer.diskStorage({
  destination: (req: AuthedRequest, _file, cb) => {
    const dir = path.join("uploads", req.params.id, "rfq-items", req.params.rid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const lineUpload = multer({ storage: lineStorage, limits: { fileSize: 64 * 1024 * 1024 } });

router.post("/:rid/line-items/:lid/attachments", lineUpload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const rfq = await Rfq.findOne({ _id: req.params.rid, projectId: req.params.id });
    const line = rfq?.lineItems?.find((l) => String((l as { _id?: unknown })._id) === req.params.lid);
    if (!rfq || !line) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "RFQ item not found." }); }
    const fileType = (req.file.originalname.split(".").pop() || "").toLowerCase();
    line.attachments = line.attachments || [];
    line.attachments.push({ name: req.file.originalname, filePath: req.file.path.replace(/\\/g, "/"), fileType, size: humanSize(req.file.size) });
    await rfq.save();
    res.status(201).json(rfq);
  } catch (err) { next(err); }
});

router.delete("/:rid/line-items/:lid/attachments/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const rfq = await Rfq.findOne({ _id: req.params.rid, projectId: req.params.id });
    const line = rfq?.lineItems?.find((l) => String((l as { _id?: unknown })._id) === req.params.lid);
    if (!rfq || !line) return res.status(404).json({ error: "Not found" });
    const att = (line.attachments || []).find((a) => String((a as { _id?: unknown })._id) === req.params.aid);
    if (att?.filePath) fs.unlink(path.resolve(att.filePath), () => {});
    line.attachments = (line.attachments || []).filter((a) => String((a as { _id?: unknown })._id) !== req.params.aid);
    await rfq.save();
    res.json(rfq);
  } catch (err) { next(err); }
});

// CR 335 - the RFQ's supporting documents (drawings, BOQ, specs) for every vendor.
router.post("/:rid/attachments", lineUpload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const rfq = await Rfq.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!rfq) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "RFQ not found." }); }
    const fileType = (req.file.originalname.split(".").pop() || "").toLowerCase();
    rfq.attachments = rfq.attachments || [];
    rfq.attachments.push({ name: req.file.originalname, filePath: req.file.path.replace(/\\/g, "/"), fileType, size: humanSize(req.file.size) });
    await rfq.save();
    res.status(201).json(rfq);
  } catch (err) { next(err); }
});
router.delete("/:rid/attachments/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const rfq = await Rfq.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!rfq) return res.status(404).json({ error: "Not found" });
    const att = (rfq.attachments || []).find((a) => String((a as { _id?: unknown })._id) === req.params.aid);
    if (att?.filePath) fs.unlink(path.resolve(att.filePath), () => {});
    rfq.attachments = (rfq.attachments || []).filter((a) => String((a as { _id?: unknown })._id) !== req.params.aid);
    await rfq.save();
    res.json(rfq);
  } catch (err) { next(err); }
});

/**
 * CR 338 - email a vendor its own copy of the RFQ (the PDF is made in the browser and sent here).
 * GreenTech staff only. The mail goes only to an address the vendor's Directory record holds (its
 * email or a contact person's), so this can never be used to mail anyone else; replies go to the
 * person who sent it.
 */
// Only the RFQ's PDF is ever attached: checked by type here and by its first bytes below.
const mailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf" && /\.pdf$/i.test(file.originalname)),
});
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.post("/:rid/email", mailUpload.single("pdf"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "subcontractor") return res.status(403).json({ error: "Only GreenTech staff can email an RFQ." });
    if (!req.file || req.file.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") return res.status(400).json({ error: "The RFQ document (a PDF) is missing." });
    const rfq = await Rfq.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!rfq) return res.status(404).json({ error: "RFQ not found." });
    const vendorId = String(req.body?.vendorId || "");
    const vendor = mongoose.isValidObjectId(vendorId) ? await Vendor.findOne({ _id: vendorId, projectId: req.params.id }).lean() : null;
    if (!vendor) return res.status(404).json({ error: "That vendor is not on this project." });
    const company = vendor.companyId && mongoose.isValidObjectId(vendor.companyId) ? await Company.findById(vendor.companyId).select("name email contactPersons").lean() : null;
    const allowed = [company?.email, ...(company?.contactPersons || []).map((c) => c.email), vendor.email]
      .map((e) => String(e || "").trim().toLowerCase()).filter((e) => EMAIL.test(e));
    const wanted = String(req.body?.to || "").trim().toLowerCase();
    const to = wanted || allowed[0] || "";
    if (!to) return res.status(400).json({ error: `${vendor.name} has no email in the Directory. Add one to its Directory record, or download the copy and send it yourself.` });
    if (!allowed.includes(to)) return res.status(400).json({ error: "That address is not on the vendor's Directory record." });
    const [project, me] = await Promise.all([
      Project.findOne({ projectId: req.params.id }).select("name").lean(),
      User.findById(req.user!.userId).select("name email").lean(),
    ]);
    const contact = (company?.contactPersons || []).find((c) => String(c.email || "").trim().toLowerCase() === to)?.name || vendor.contactName || vendor.name;
    const due = rfq.dueDate ? new Date(`${rfq.dueDate}T12:00:00`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
    const senderName = (me as { name?: string } | null)?.name || req.user!.name || "GreenTech USA";
    const senderEmail = (me as { email?: string } | null)?.email || "";
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.5">
      <p>Dear ${esc(contact)},</p>
      <p>GreenTech USA invites you to quote for the items in the attached Request for Quotation <b>RFQ ${esc(rfq.rfqNo)}</b>${rfq.title ? `, <b>${esc(rfq.title)}</b>` : ""}${project?.name ? `, for the project ${esc(project.name)}` : ""}.</p>
      ${due ? `<p>Please send your quotation${rfq.currency ? `, with prices in ${esc(rfq.currency)},` : ""} by <b>${esc(due)}</b>.</p>` : ""}
      ${rfq.notes ? `<p style="white-space:pre-wrap">${esc(rfq.notes.slice(0, 3000))}</p>` : ""}
      <p>Reply to this email with your quotation or any questions.</p>
      <p>Kind regards,<br/>${esc(senderName)}<br/>GreenTech USA${senderEmail ? `<br/>${esc(senderEmail)}` : ""}</p>
    </div>`;
    const fileName = `${String(req.body?.fileName || `RFQ_${rfq.rfqNo}`).replace(/[^\w.\- ]/g, "_").slice(0, 116).replace(/\.pdf$/i, "")}.pdf`;
    const ok = await sendMail({ to, subject: `Request for Quotation ${rfq.rfqNo}${rfq.title ? `: ${rfq.title}` : ""}`, html, attachments: [{ filename: fileName, content: req.file.buffer }], replyTo: senderEmail || undefined });
    rfq.emails = [...(rfq.emails || []), { vendorId, to, at: new Date(), byName: senderName, ok }];
    await rfq.save();
    if (ok) await logEvent(req, { entityId: String(rfq._id), action: "emailed", toValue: to });
    if (!ok) return res.status(503).json({ error: "Email is not set up on the server, so nothing was sent. Download the vendor's copy and send it yourself.", emails: rfq.emails });
    res.json({ ok, to, emails: rfq.emails });
  } catch (err) { next(err); }
});

// CR-PR-02 — upload / remove an already-made RFQ document (reuses the per-item storage folder).
router.post("/:rid/document", lineUpload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const rfq = await Rfq.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!rfq) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "RFQ not found." }); }
    const fileType = (req.file.originalname.split(".").pop() || "").toLowerCase();
    rfq.uploadedDocument = { name: req.file.originalname, filePath: req.file.path.replace(/\\/g, "/"), fileType, size: humanSize(req.file.size) };
    await rfq.save();
    res.status(201).json(rfq);
  } catch (err) { next(err); }
});
router.delete("/:rid/document", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const rfq = await Rfq.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!rfq) return res.status(404).json({ error: "Not found" });
    if (rfq.uploadedDocument?.filePath) fs.unlink(path.resolve(rfq.uploadedDocument.filePath), () => {});
    rfq.uploadedDocument = null;
    await rfq.save();
    res.json(rfq);
  } catch (err) { next(err); }
});

export default router;
