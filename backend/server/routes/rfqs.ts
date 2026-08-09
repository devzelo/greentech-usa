import { Router, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import Rfq from "../models/Rfq";
import Vendor from "../models/Vendor";
import VendorQuote from "../models/VendorQuote";
import ProcurementEvent from "../models/ProcurementEvent";
import ProcurementItem from "../models/ProcurementItem";
import ProjectDocument from "../models/ProjectDocument";
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
    const rfqs = await Rfq.find({ projectId: req.params.id }).sort({ createdAt: 1 }).lean();
    const quotes = await VendorQuote.find({ projectId: req.params.id }).lean();
    const byRfq: Record<string, unknown[]> = {};
    for (const q of quotes) (byRfq[String(q.rfqId)] ||= []).push(q);
    res.json(rfqs.map((r) => ({ ...r, quotes: byRfq[String(r._id)] || [] })));
  } catch (err) { next(err); }
});

// STEP 1a — Create an RFQ (a DRAFT request) from selected BOQ items (line items snapshot).
// Items are NOT advanced yet; that happens when the request is actually sent to vendors (see /send).
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const { title, lineItems, includesShipping, includesTax, notes, shipToLocation, deliveryMethod } = req.body || {};
    const count = await Rfq.countDocuments({ projectId: req.params.id });
    // G — numbers-only, per-project, RFQ range starts at 7000.
    const rfqNo = String(7000 + count + 1);
    const rfq = await Rfq.create({
      projectId: req.params.id, rfqNo, title: title || `RFQ ${rfqNo}`,
      lineItems: Array.isArray(lineItems) ? lineItems.slice(0, 500) : [],
      includesShipping: includesShipping !== false, includesTax: includesTax !== false,
      shipToLocation: shipToLocation || "", deliveryMethod: deliveryMethod || "", notes: notes || "",
      status: "Draft",
      addedByName: req.user!.name || "",
    });
    await logEvent(req, { entityId: String(rfq._id), action: "created", toValue: rfqNo });
    res.status(201).json({ ...rfq.toObject(), quotes: [] });
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
    for (const f of ["title", "notes", "includesShipping", "includesTax", "shipToLocation", "deliveryMethod", "status", "lineItems"]) if (f in (req.body || {})) patch[f] = req.body[f];
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
    res.json(rfq);
  } catch (err) { next(err); }
});

router.delete("/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    await Rfq.findOneAndDelete({ _id: req.params.rid, projectId: req.params.id });
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

export default router;
