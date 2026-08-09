import { Router, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import Shipment, { DEFAULT_SHIPMENT_DOCS, REQUIRED_SHIPMENT_DOCS, ShipmentStatus } from "../models/Shipment";
import ProcurementPO from "../models/ProcurementPO";
import ProcurementItem, { ProcurementStatus } from "../models/ProcurementItem";
import ProcurementEvent from "../models/ProcurementEvent";

// The Mongoose sub-document arrays expose .id()/.deleteOne() at runtime; the plain-array types
// don't. `subs()` casts to reach those helpers without sprinkling `any` everywhere.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subs = (arr: unknown): any => arr as any;
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { procTabGuard } from "../lib/access";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(procTabGuard(["proc-shipment"]));

// List shipments (oldest first — Shipment 1, 2, 3 …). Shipments created before the Demurrage
// Cost row existed are backfilled here, so every shipment always carries the mandatory row.
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const docs = await Shipment.find({ projectId: req.params.id }).sort({ order: 1, createdAt: 1 });
    for (const s of docs) {
      let changed = false;
      // Newest-required-first insert order keeps Demurrage Cost at the very top.
      for (const required of [...REQUIRED_SHIPMENT_DOCS].reverse()) {
        const has = (s.rows || []).some((r) => String(r.docType || "").trim().toLowerCase() === required.toLowerCase());
        if (has) continue;
        s.rows.unshift({ docType: required, remarks: "", files: [] });
        changed = true;
      }
      if (changed) { try { await s.save(); } catch { /* best-effort backfill */ } }
    }
    res.json(docs);
  } catch (err) { next(err); }
});

// Shipment status → Master Log item stage for the items on the shipment's linked POs.
// "Preparing" doesn't move items; clearance still reads as In Transit on the log.
const STATUS_TO_ITEM: Partial<Record<ShipmentStatus, ProcurementStatus>> = {
  Fabrication: "Fabrication", Transit: "Transit", Clearance: "Transit", Warehouse: "OnSite", Delivered: "Complete",
};

// Procurement lifecycle order — used to keep the cascade FORWARD-ONLY. A shipment may push an
// item further along the pipeline, never drag it back (site staff who already marked an item
// On Site must not be undone by an unrelated edit to the shipment).
const STAGE_ORDER: ProcurementStatus[] = ["BOQ", "RFQ_Sent", "Quoted", "PO_Sent", "Invoiced", "Ordered", "Fabrication", "Transit", "OnSite", "Complete"];
const rankOf = (s: ProcurementStatus) => STAGE_ORDER.indexOf(s);

// Cascade the shipment's status onto the Master Log items of its linked POs. Only ever ADVANCES
// an item (never moves it backwards) and never touches Cancelled items. Best-effort — the
// shipment write itself never fails because of this.
async function syncItemsFromShipment(req: AuthedRequest, projectId: string, shipmentId: string, poIds: string[], status: ShipmentStatus) {
  try {
    const stage = STATUS_TO_ITEM[status];
    if (!stage || !poIds.length) return;
    const targetRank = rankOf(stage);
    if (targetRank < 0) return;
    const pos = await ProcurementPO.find({ _id: { $in: poIds }, projectId }).lean();
    const itemIds = pos.flatMap((po) => (po.lineItems || []).map((l) => l.itemId)).filter(Boolean);
    if (!itemIds.length) return;
    // Only items currently EARLIER in the lifecycle than the shipment's stage.
    const behind = STAGE_ORDER.slice(0, targetRank);
    if (!behind.length) return;
    const result = await ProcurementItem.updateMany(
      { _id: { $in: itemIds }, projectId, status: { $in: behind } },
      { $set: { status: stage } }
    );
    if (!result.modifiedCount) return;
    await ProcurementEvent.create({
      projectId, entityType: "shipment", entityId: String(shipmentId), action: "status-sync",
      fromValue: status, toValue: `${stage} (${result.modifiedCount} item(s))`,
      actorId: req.user!.userId, actorName: req.user!.name || "",
    });
  } catch { /* best-effort */ }
}

const META_FIELDS = ["name", "description", "fromLocation", "toLocation", "deadline",
  "costFreight", "costCustoms", "costDemurrage", "costOther",
  // Tracking header + container details (CR-PR-08/09).
  "trackingNo", "carrier", "currentLocation", "etaDate", "trackingUrl", "containerType", "containerSize"] as const;

// The rows every shipment must keep (Demurrage Cost, the shipper contract) — they can't be
// renamed or removed, or the read-time backfill would silently recreate them as empty rows.
const isRequiredRow = (docType: string) =>
  REQUIRED_SHIPMENT_DOCS.some((d) => d.toLowerCase() === String(docType || "").trim().toLowerCase());
const STATUSES: ShipmentStatus[] = ["Preparing", "Fabrication", "Transit", "Clearance", "Warehouse", "Delivered"];

// Create the next shipment, pre-seeded with the default document rows (Demurrage Cost on top).
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const count = await Shipment.countDocuments({ projectId: req.params.id });
    const body = req.body || {};
    const s = await Shipment.create({
      projectId: req.params.id,
      name: String(body.name || `Shipment ${count + 1}`).slice(0, 300),
      order: count + 1,
      description: String(body.description || "").slice(0, 2000),
      fromLocation: String(body.fromLocation || "").slice(0, 300),
      toLocation: String(body.toLocation || "").slice(0, 300),
      status: STATUSES.includes(body.status) ? body.status : "Preparing",
      deadline: String(body.deadline || "").slice(0, 300),
      poIds: Array.isArray(body.poIds) ? body.poIds.map(String).slice(0, 100) : [],
      // Costs are captured in the same popup as everything else — accept them on create too,
      // not only on the later PATCH.
      costFreight: String(body.costFreight || "").slice(0, 60),
      costCustoms: String(body.costCustoms || "").slice(0, 60),
      costDemurrage: String(body.costDemurrage || "").slice(0, 60),
      costOther: String(body.costOther || "").slice(0, 60),
      rows: DEFAULT_SHIPMENT_DOCS.map((d) => ({ docType: d, remarks: "", files: [] })),
    });
    if (s.status !== "Preparing") await syncItemsFromShipment(req, req.params.id, String(s._id), s.poIds, s.status);
    res.status(201).json(s);
  } catch (err) { next(err); }
});

router.patch("/:sid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {};
    const patch: Record<string, unknown> = {};
    for (const f of META_FIELDS) if (typeof body[f] === "string") patch[f] = body[f].slice(0, f === "description" ? 2000 : 300);
    if (typeof body.openBed === "boolean") patch.openBed = body.openBed;
    if (Array.isArray(body.poIds)) patch.poIds = body.poIds.map(String).slice(0, 100);
    if (typeof body.status === "string" && STATUSES.includes(body.status as ShipmentStatus)) patch.status = body.status;
    const before = await Shipment.findOne({ _id: req.params.sid, projectId: req.params.id });
    if (!before) return res.status(404).json({ error: "Not found" });
    // Which POs are newly linked by this edit? Only those need catching up to the current stage.
    const addedPoIds = Array.isArray(patch.poIds)
      ? (patch.poIds as string[]).filter((pid) => !(before.poIds || []).includes(pid))
      : [];
    const statusChanged = "status" in patch && patch.status !== before.status;
    const s = await Shipment.findByIdAndUpdate(before._id, patch, { new: true });
    // Sync the Master Log only on a real status change (all linked POs), or for POs newly added
    // while the shipment is already in an active stage. Editing a description never re-syncs.
    if (s && s.status !== "Preparing") {
      if (statusChanged) await syncItemsFromShipment(req, req.params.id, String(s._id), s.poIds, s.status);
      else if (addedPoIds.length) await syncItemsFromShipment(req, req.params.id, String(s._id), addedPoIds, s.status);
    }
    res.json(s);
  } catch (err) { next(err); }
});

router.delete("/:sid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const s = await Shipment.findOneAndDelete({ _id: req.params.sid, projectId: req.params.id });
    // Best-effort: remove the uploaded files from disk.
    for (const row of s?.rows || []) for (const f of row.files || []) if (f.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    res.json({ message: "Shipment deleted" });
  } catch (err) { next(err); }
});

// Add a custom document row.
router.post("/:sid/rows", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const s = await Shipment.findOne({ _id: req.params.sid, projectId: req.params.id });
    if (!s) return res.status(404).json({ error: "Not found" });
    s.rows.push({ docType: (req.body?.docType || "New document").slice(0, 120), remarks: "", files: [] });
    await s.save();
    res.status(201).json(s);
  } catch (err) { next(err); }
});

// Rename a document row / update its remarks.
router.patch("/:sid/rows/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const s = await Shipment.findOne({ _id: req.params.sid, projectId: req.params.id });
    if (!s) return res.status(404).json({ error: "Not found" });
    const row = subs(s.rows).id(req.params.rid);
    if (!row) return res.status(404).json({ error: "Row not found" });
    // Renaming a required row would orphan it and make the backfill add a duplicate.
    if (typeof req.body?.docType === "string") {
      if (isRequiredRow(String(row.docType || ""))) return res.status(400).json({ error: `The "${row.docType}" row cannot be renamed.` });
      row.docType = req.body.docType.slice(0, 120);
    }
    if (typeof req.body?.remarks === "string") row.remarks = req.body.remarks.slice(0, 1000);
    await s.save();
    res.json(s);
  } catch (err) { next(err); }
});

// Delete a document row (and its files). The Demurrage Cost row is mandatory and can't be removed.
router.delete("/:sid/rows/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const s = await Shipment.findOne({ _id: req.params.sid, projectId: req.params.id });
    if (!s) return res.status(404).json({ error: "Not found" });
    const row = subs(s.rows).id(req.params.rid);
    if (row && isRequiredRow(String(row.docType || ""))) {
      return res.status(400).json({ error: `The "${row.docType}" row is required and cannot be removed.` });
    }
    for (const f of row?.files || []) if (f.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    if (row) row.deleteOne();
    await s.save();
    res.json(s);
  } catch (err) { next(err); }
});

// ── File uploads (multiple per row) ──────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req: AuthedRequest, _file, cb) => {
    const dir = path.join("uploads", req.params.id, "shipments", req.params.sid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });

router.post("/:sid/rows/:rid/files", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const s = await Shipment.findOne({ _id: req.params.sid, projectId: req.params.id });
    if (!s) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
    const row = subs(s.rows).id(req.params.rid);
    if (!row) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Row not found" }); }
    row.files.push({ name: req.file.originalname, filePath: req.file.path.replace(/\\/g, "/"), fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(), size: humanSize(req.file.size) });
    await s.save();
    res.status(201).json(s);
  } catch (err) { next(err); }
});

router.delete("/:sid/rows/:rid/files/:fid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const s = await Shipment.findOne({ _id: req.params.sid, projectId: req.params.id });
    if (!s) return res.status(404).json({ error: "Not found" });
    const row = subs(s.rows).id(req.params.rid);
    if (!row) return res.status(404).json({ error: "Row not found" });
    const file = subs(row.files).id(req.params.fid);
    if (file?.filePath) fs.unlink(path.resolve(file.filePath), () => {});
    if (file) file.deleteOne();
    await s.save();
    res.json(s);
  } catch (err) { next(err); }
});

export default router;
