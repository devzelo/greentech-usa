import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import ProcurementPO, { IPOAttachment } from "../models/ProcurementPO";
import Rfq from "../models/Rfq";
import VendorQuote from "../models/VendorQuote";
import Vendor from "../models/Vendor";
import ProcurementItem, { ProcurementStatus } from "../models/ProcurementItem";
import ProcurementEvent from "../models/ProcurementEvent";
import Expense from "../models/Expense";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { procTabGuard } from "../lib/access";

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(procTabGuard(["proc-po"]));

const num = (s: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;

// E4 — placeholder standard Terms & Conditions pre-filled on new POs (editable per PO).
// Replace with GreenTech's official T&C once provided.
const DEFAULT_PO_TERMS = [
  "1. Payment: Net 30 days from receipt of a correct invoice, unless otherwise agreed in writing.",
  "2. Delivery: Per the shipping instruction above. Title and risk pass to GreenTech on delivery/pickup.",
  "3. Inspection & Acceptance: Goods may be inspected on arrival. Non-conforming, short, or damaged goods may be rejected and returned at the vendor's expense within 14 days.",
  "4. Warranty: Vendor warrants all goods are new, free from defects, and fit for purpose for 12 months from delivery.",
  "5. Cancellation: GreenTech may cancel any undelivered portion of this order with written notice at no penalty.",
  "6. Compliance: Vendor shall comply with all applicable laws and provide certificates/documentation on request.",
  "(Standard placeholder terms — to be replaced with GreenTech's official Terms & Conditions.)",
].join("\n");
const humanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
// Writes gated by tabAccessGuard (requires "edit"); a guest granted Purchase-Orders-edit may write.
const block = (_req: AuthedRequest, _res: Response) => false;
async function logEvent(req: AuthedRequest, e: { entityId: string; action: string; fromValue?: string; toValue?: string }) {
  try { await ProcurementEvent.create({ projectId: req.params.id, entityType: "po", entityId: e.entityId, action: e.action, fromValue: e.fromValue || "", toValue: e.toValue || "", actorId: req.user!.userId, actorName: req.user!.name || "" }); } catch { /* best-effort */ }
}

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try { res.json(await ProcurementPO.find({ projectId: req.params.id }).sort({ createdAt: 1 })); } catch (err) { next(err); }
});

// Create a PO from an awarded quote — snapshot line items + prices, compute total.
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const { rfqId, quoteId } = req.body || {};
    const rfq = await Rfq.findOne({ _id: rfqId, projectId: req.params.id });
    const quote = await VendorQuote.findOne({ _id: quoteId, rfqId, projectId: req.params.id });
    if (!rfq || !quote) return res.status(404).json({ error: "RFQ or quote not found." });
    const vendor = await Vendor.findById(quote.vendorId);
    const lineItems = (rfq.lineItems || []).map((li) => {
      const ql = (quote.lineItems || []).find((x) => x.itemId === li.itemId);
      return { itemId: li.itemId, description: li.description, qty: li.qty, unit: li.unit, unitPrice: ql?.unitPrice || "" };
    });
    const total = lineItems.reduce((s, l) => s + num(l.qty) * num(l.unitPrice), 0) + num(quote.shipping) + num(quote.tax);
    const count = await ProcurementPO.countDocuments({ projectId: req.params.id });
    // G — numbers-only, per-project, PO range starts at 8000.
    const poNo = String(8000 + count + 1);
    // E5 — carry the shipping instruction over from the RFQ (method + address kept separate now).
    const po = await ProcurementPO.create({
      projectId: req.params.id, poNo, rfqId, quoteId, vendorId: quote.vendorId, vendorName: vendor?.name || "",
      lineItems, shipping: quote.shipping, tax: quote.tax, total: String(total), status: "Sent",
      shipTo: rfq.shipToLocation || "", deliveryMethod: rfq.deliveryMethod || "Delivery",
      terms: DEFAULT_PO_TERMS, termsMode: "constant", addedByName: req.user!.name || "",
    });
    // Auto-carry the vendor's quotation document(s) from the RFQ onto the PO (kind "quote") —
    // physically COPIED into the PO's folder so it's clickable/downloadable and survives RFQ edits.
    const destDir = path.join("uploads", req.params.id, "procurement-pos", String(po._id));
    const carried: IPOAttachment[] = [];
    for (const a of quote.attachments || []) {
      if (!a.filePath) continue;
      try {
        fs.mkdirSync(destDir, { recursive: true });
        const dest = path.join(destDir, `${Date.now()}-${path.basename(a.filePath)}`);
        fs.copyFileSync(path.resolve(a.filePath), dest);
        carried.push({ name: a.name, filePath: dest.replace(/\\/g, "/"), fileType: a.fileType, size: a.size, kind: "quote" });
      } catch { /* skip a missing source file */ }
    }
    if (carried.length) { po.attachments.push(...carried); await po.save(); }
    // advance the PO's items to PO_Sent
    const itemIds = lineItems.map((l) => l.itemId).filter(Boolean);
    if (itemIds.length) await ProcurementItem.updateMany({ _id: { $in: itemIds }, projectId: req.params.id, status: { $in: ["BOQ", "RFQ_Sent", "Quoted"] } }, { $set: { status: "PO_Sent" } });
    await logEvent(req, { entityId: String(po._id), action: "created", toValue: poNo });
    res.status(201).json(po);
  } catch (err) { next(err); }
});

// Create a PO directly from selected BOQ items (§H shortcut) — no vendor/prices yet; the user
// fills those in the PO tab. Items advance to PO_Sent.
router.post("/from-items", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const ids: string[] = Array.isArray(req.body?.itemIds) ? req.body.itemIds : [];
    const items = await ProcurementItem.find({ _id: { $in: ids }, projectId: req.params.id, status: { $ne: "Cancelled" } });
    if (!items.length) return res.status(400).json({ error: "No valid items selected." });
    const lineItems = items.map((it) => ({ itemId: String(it._id), description: it.description, qty: it.qty, unit: it.unit, unitPrice: "" }));
    const count = await ProcurementPO.countDocuments({ projectId: req.params.id });
    const poNo = String(8000 + count + 1);
    const po = await ProcurementPO.create({
      projectId: req.params.id, poNo, lineItems, total: "0", status: "Sent",
      terms: DEFAULT_PO_TERMS, addedByName: req.user!.name || "",
    });
    await ProcurementItem.updateMany({ _id: { $in: items.map((i) => i._id) }, projectId: req.params.id, status: { $in: ["BOQ", "RFQ_Sent", "Quoted"] } }, { $set: { status: "PO_Sent" } });
    await logEvent(req, { entityId: String(po._id), action: "created", toValue: poNo });
    res.status(201).json(po);
  } catch (err) { next(err); }
});

const PO_FIELDS = ["terms", "termsMode", "notes", "shipTo", "deliveryMethod", "status", "invoiceNo", "invoiceAmount", "invoiceDate",
  "signerName", "signerEmail", "signerPhone", "signerTitle", "signatureUrl", "stampUrl",
  "partnerSignerName", "partnerSignerEmail", "partnerSignerPhone", "partnerSignatureUrl", "partnerStampUrl"] as const;
router.patch("/:pid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const po = await ProcurementPO.findOne({ _id: req.params.pid, projectId: req.params.id });
    if (!po) return res.status(404).json({ error: "Not found" });
    const hadInvoice = !!po.invoiceAmount;
    for (const f of PO_FIELDS) if (f in (req.body || {})) (po as unknown as Record<string, unknown>)[f] = req.body[f];
    // Recording an invoice amount for the first time advances the PO to "Invoice received".
    // No amount matching and no auto-expense — expenses are managed manually.
    if (po.invoiceAmount && num(po.invoiceAmount) && !hadInvoice && po.status === "Sent") po.status = "InvoiceReceived";
    await po.save();
    // PO status → item stage. The PO drives the item while it's still in the procurement-controlled
    // zone (BOQ … Ordered) — up or down, so a corrected PO status corrects the item too. Once an item
    // is MANUALLY moved to Fabrication/Transit/OnSite/Complete (or Cancelled) the PO leaves it alone.
    const itemIds = (po.lineItems || []).map((l) => l.itemId).filter(Boolean);
    if (itemIds.length) {
      const map: Partial<Record<string, ProcurementStatus>> = { Sent: "PO_Sent", Confirmed: "PO_Sent", InvoiceReceived: "Invoiced", Paid: "Ordered" };
      const stage = map[po.status];
      if (stage) {
        const AUTO_ZONE: ProcurementStatus[] = ["BOQ", "RFQ_Sent", "Quoted", "PO_Sent", "Invoiced", "Ordered"];
        await ProcurementItem.updateMany({ _id: { $in: itemIds }, projectId: req.params.id, status: { $in: AUTO_ZONE } }, { $set: { status: stage } });
      }
    }
    res.json(po);
  } catch (err) { next(err); }
});

router.delete("/:pid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const po = await ProcurementPO.findOneAndDelete({ _id: req.params.pid, projectId: req.params.id });
    if (po) {
      if (po.expenseId) await Expense.findByIdAndDelete(po.expenseId).catch(() => {});
      for (const a of po.attachments || []) { if (a.filePath) fs.unlink(path.resolve(a.filePath), () => {}); }
    }
    res.json({ message: "PO deleted" });
  } catch (err) { next(err); }
});

// ── Attachments (PO doc / quote / invoice) ───────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, _file, cb) => { const dir = path.join("uploads", req.params.id, "procurement-pos", req.params.pid); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });

router.post("/:pid/attachments", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const po = await ProcurementPO.findOne({ _id: req.params.pid, projectId: req.params.id });
    if (!po) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "PO not found." }); }
    po.attachments.push({ name: req.file.originalname, filePath: req.file.path.replace(/\\/g, "/"), fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(), size: humanSize(req.file.size), kind: String(req.body.kind || "other") });
    await po.save();
    res.status(201).json(po);
  } catch (err) { next(err); }
});

// Upload the PARTNER's signature or stamp (JV only — partners have no staff/classified stamps).
// field=partnerSignatureUrl | partnerStampUrl (decided by ?target=)
router.post("/:pid/party-image", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const target = req.query.target === "stamp" ? "partnerStampUrl" : "partnerSignatureUrl";
    const po = await ProcurementPO.findOne({ _id: req.params.pid, projectId: req.params.id });
    if (!po) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "PO not found." }); }
    (po as unknown as Record<string, unknown>)[target] = "/" + req.file.path.replace(/\\/g, "/");
    await po.save();
    res.status(201).json(po);
  } catch (err) { next(err); }
});

// Attach an EXISTING uploads file (e.g. an approved submittal document) onto the PO — physically
// copied into the PO folder so it survives and is downloadable. Body: { filePath, name, fileType, size, kind }.
router.post("/:pid/attach-file", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const { filePath, name, fileType, size, kind } = req.body || {};
    if (!filePath || !name) return res.status(400).json({ error: "filePath and name are required." });
    const po = await ProcurementPO.findOne({ _id: req.params.pid, projectId: req.params.id });
    if (!po) return res.status(404).json({ error: "PO not found." });
    const src = path.resolve(String(filePath).replace(/^\//, ""));
    if (!fs.existsSync(src)) return res.status(404).json({ error: "Source file not found." });
    const destDir = path.join("uploads", req.params.id, "procurement-pos", req.params.pid);
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, `${Date.now()}-${path.basename(src)}`);
    fs.copyFileSync(src, dest);
    po.attachments.push({ name: String(name), filePath: dest.replace(/\\/g, "/"), fileType: String(fileType || (String(name).split(".").pop() || "")).toLowerCase(), size: String(size || ""), kind: String(kind || "submittal") });
    await po.save();
    res.status(201).json(po);
  } catch (err) { next(err); }
});

router.delete("/:pid/attachments/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const po = await ProcurementPO.findOne({ _id: req.params.pid, projectId: req.params.id });
    if (!po) return res.status(404).json({ error: "PO not found." });
    const att = (po.attachments || []).find((a) => String((a as { _id?: unknown })._id) === req.params.aid);
    if (att?.filePath) fs.unlink(path.resolve(att.filePath), () => {});
    po.attachments = (po.attachments || []).filter((a) => String((a as { _id?: unknown })._id) !== req.params.aid);
    await po.save();
    res.json(po);
  } catch (err) { next(err); }
});

export default router;
