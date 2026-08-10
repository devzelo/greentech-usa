import { Router, Response, NextFunction } from "express";
import ProcurementSection from "../models/ProcurementSection";
import ProcurementItem from "../models/ProcurementItem";
import ProcurementEvent from "../models/ProcurementEvent";
import Submittal from "../models/Submittal";
import Rfq from "../models/Rfq";
import ProcurementPO from "../models/ProcurementPO";
import ProcurementItemRevision from "../models/ProcurementItemRevision";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { procTabGuard } from "../lib/access";
import multer from "multer";
import fs from "fs";
import path from "path";

const router = Router({ mergeParams: true });
router.use(requireAuth);
// Items/sections/events are shared infrastructure for the whole module — every procurement
// sub-tab (BOQ, Master Log, Submittals, RFQ, PO) reads them — so any granted sub-tab passes for
// reads; writes still require "edit" on at least one. procTabGuard ignores the module fallback
// once the guest has any explicit sub-tab grant, so a Hidden sub-tab truly means no access.
router.use(procTabGuard(["proc-log", "proc-boq", "proc-submittals", "proc-rfqs", "proc-po"]));

// Append-only audit row. Best-effort — never blocks the main operation.
async function logEvent(req: AuthedRequest, e: { entityType?: string; entityId: string; action: string; fromValue?: string; toValue?: string }) {
  try {
    await ProcurementEvent.create({
      projectId: req.params.id,
      entityType: e.entityType || "item",
      entityId: e.entityId,
      action: e.action,
      fromValue: e.fromValue || "",
      toValue: e.toValue || "",
      actorId: req.user!.userId,
      actorName: req.user!.name || "",
    });
  } catch { /* audit is best-effort */ }
}

// ── Sections ──────────────────────────────────────────────────────────────────
router.get("/sections", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await ProcurementSection.find({ projectId: req.params.id }).sort({ order: 1, createdAt: 1 });
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/sections", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const count = await ProcurementSection.countDocuments({ projectId: req.params.id });
    const row = await ProcurementSection.create({ projectId: req.params.id, name: req.body?.name || "New Section", order: count });
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch("/sections/:sid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, order } = req.body || {};
    const patch: Record<string, unknown> = {};
    if (typeof name === "string") patch.name = name;
    if (typeof order === "number") patch.order = order;
    const row = await ProcurementSection.findOneAndUpdate({ _id: req.params.sid, projectId: req.params.id }, patch, { new: true });
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) { next(err); }
});

// Deleting a section also removes its items (they leave the BOQ entirely — use cancel to keep records).
router.delete("/sections/:sid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await ProcurementItem.deleteMany({ projectId: req.params.id, sectionId: req.params.sid });
    await ProcurementSection.findOneAndDelete({ _id: req.params.sid, projectId: req.params.id });
    res.json({ message: "Section deleted" });
  } catch (err) { next(err); }
});

// ── Items ─────────────────────────────────────────────────────────────────────
router.get("/items", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = { projectId: req.params.id };
    if (req.query.sectionId) filter.sectionId = String(req.query.sectionId);
    const rows = await ProcurementItem.find(filter).sort({ createdAt: 1 });
    res.json(rows);
  } catch (err) { next(err); }
});

const stamp = (req: AuthedRequest) => ({ addedById: req.user!.userId, addedByName: req.user!.name || "", addedByRole: req.user!.role || "" });

router.post("/items", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { sectionId, itemNo, description, manufacturer, modelNo, qty, unit, spec, needOnSiteDate, leadTimeDays } = req.body || {};
    const row = await ProcurementItem.create({
      projectId: req.params.id, sectionId: sectionId || "", itemNo: itemNo || "", description: description || "",
      manufacturer: manufacturer || "", modelNo: modelNo || "", qty: qty || "", unit: unit || "", spec: spec || "",
      needOnSiteDate: needOnSiteDate || "", leadTimeDays: leadTimeDays || "", status: "BOQ", ...stamp(req),
    });
    await logEvent(req, { entityId: String(row._id), action: "created", toValue: row.description });
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// Bulk import (e.g. from an Excel BOQ parsed on the client).
router.post("/items/bulk", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const items: Array<Record<string, string>> = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: "No items provided." });
    const docs = items.slice(0, 2000).map((it) => ({
      projectId: req.params.id, sectionId: it.sectionId || "", itemNo: it.itemNo || "", description: it.description || "",
      manufacturer: it.manufacturer || "", modelNo: it.modelNo || "", qty: it.qty || "", unit: it.unit || "",
      spec: it.spec || "", needOnSiteDate: it.needOnSiteDate || "", leadTimeDays: it.leadTimeDays || "",
      status: "BOQ" as const, ...stamp(req),
    }));
    const created = await ProcurementItem.insertMany(docs);
    await logEvent(req, { entityId: req.params.id, action: "imported", toValue: String(created.length) });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

const ITEM_FIELDS = ["sectionId", "itemNo", "description", "manufacturer", "modelNo", "qty", "unit", "spec", "needOnSiteDate", "leadTimeDays", "status", "vendorName", "locked", "remarks"] as const;

// Per-item file uploads (CR-P-12) — pictures, catalogue, data sheet, drawing.
const itemHumanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
const itemStorage = multer.diskStorage({
  destination: (req: AuthedRequest, _file, cb) => { const dir = path.join("uploads", req.params.id, "boq-items", req.params.iid); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const itemUpload = multer({ storage: itemStorage, limits: { fileSize: 64 * 1024 * 1024 } });
// I2 — editing any of these "content" fields snapshots the prior state as a revision.
const TRACKED_FIELDS = ["description", "manufacturer", "modelNo", "qty", "unit", "spec", "needOnSiteDate", "leadTimeDays"] as const;

router.patch("/items/:iid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    // Anyone who passes the guard with edit (employee, owner, or a guest granted BOQ/Master-Log edit) may update.
    const patch: Record<string, unknown> = {};
    for (const f of ITEM_FIELDS) if (f in (req.body || {})) patch[f] = req.body[f];
    const before = await ProcurementItem.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!before) return res.status(404).json({ error: "Not found" });

    // I2 — if any tracked field changed, freeze the current state as a revision and bump revNo.
    const b = before as unknown as Record<string, unknown>;
    const changed = TRACKED_FIELDS.filter((f) => f in patch && String(patch[f] ?? "") !== String(b[f] ?? ""));
    if (changed.length) {
      await ProcurementItemRevision.create({
        projectId: req.params.id, itemId: req.params.iid, revNo: before.revNo || 0,
        description: before.description, manufacturer: before.manufacturer, modelNo: before.modelNo,
        qty: before.qty, unit: before.unit, spec: before.spec, needOnSiteDate: before.needOnSiteDate,
        leadTimeDays: before.leadTimeDays, status: before.status,
        changedFields: changed, actorName: req.user!.name || "",
      });
      patch.revNo = (before.revNo || 0) + 1;
    }

    const row = await ProcurementItem.findByIdAndUpdate(req.params.iid, patch, { new: true, runValidators: true });
    if (patch.status && patch.status !== before.status) {
      await logEvent(req, { entityId: req.params.iid, action: "status", fromValue: before.status, toValue: String(patch.status) });
    }
    // B4 — keep the linked submittal's product name / brand in sync when the BOQ item is renamed.
    if ("description" in patch || "manufacturer" in patch) {
      const sub = await Submittal.findOne({ itemId: req.params.iid, projectId: req.params.id });
      if (sub) {
        if ("description" in patch) {
          if (!sub.title || sub.title === before.description) sub.title = String(patch.description || "");
          sub.productName = String(patch.description || "");
        }
        if ("manufacturer" in patch) sub.manufacturer = String(patch.manufacturer || "");
        await sub.save();
      }
    }
    res.json(row);
  } catch (err) { next(err); }
});

// CR-P-12 — upload / remove a per-item reference file (picture, catalogue, data sheet, drawing).
router.post("/items/:iid/files", itemUpload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const it = await ProcurementItem.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!it) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Item not found." }); }
    it.attachments.push({ name: req.file.originalname, filePath: req.file.path.replace(/\\/g, "/"), fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(), size: itemHumanSize(req.file.size), kind: String(req.body?.kind || "other") });
    await it.save();
    res.status(201).json(it);
  } catch (err) { next(err); }
});
router.delete("/items/:iid/files/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const it = await ProcurementItem.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!it) return res.status(404).json({ error: "Not found" });
    const f = it.attachments.find((a) => String((a as { _id?: unknown })._id) === req.params.aid);
    if (f?.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    it.attachments = it.attachments.filter((a) => String((a as { _id?: unknown })._id) !== req.params.aid);
    await it.save();
    res.json(it);
  } catch (err) { next(err); }
});

// I1 — the inline revision history for one item (previous states, newest first).
router.get("/items/:iid/revisions", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const revs = await ProcurementItemRevision.find({ itemId: req.params.iid, projectId: req.params.id }).sort({ revNo: -1 });
    res.json(revs);
  } catch (err) { next(err); }
});

// Cancel = keep the record, mark Cancelled with a reason (the claims-safe way to remove an item).
router.post("/items/:iid/cancel", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await ProcurementItem.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!row) return res.status(404).json({ error: "Not found" });
    const from = row.status;
    const reason = req.body?.reason || "";
    // Record the cancellation in the item's RV history so the reason stays on the record (kept for claims).
    await ProcurementItemRevision.create({
      projectId: req.params.id, itemId: req.params.iid, revNo: row.revNo || 0,
      description: row.description, manufacturer: row.manufacturer, modelNo: row.modelNo,
      qty: row.qty, unit: row.unit, spec: row.spec, needOnSiteDate: row.needOnSiteDate,
      leadTimeDays: row.leadTimeDays, status: from,
      changedFields: ["status"], note: `Cancelled${reason ? `: ${reason}` : ""}`, actorName: req.user!.name || "",
    });
    row.revNo = (row.revNo || 0) + 1;
    row.status = "Cancelled";
    row.cancelledAt = new Date();
    row.cancelledBy = req.user!.name || "";
    row.cancellationReason = reason;
    await row.save();
    // I3 — cascade the cancellation. Submittal is 1:1 → cancel it. RFQ/PO are multi-item shared
    // docs → cancel only THIS item's line inside them (the document itself survives).
    await Submittal.updateMany({ itemId: req.params.iid, projectId: req.params.id }, { $set: { status: "Cancelled" } });
    await Rfq.updateMany({ projectId: req.params.id, "lineItems.itemId": req.params.iid }, { $set: { "lineItems.$[el].cancelled": true } }, { arrayFilters: [{ "el.itemId": req.params.iid }] });
    await ProcurementPO.updateMany({ projectId: req.params.id, "lineItems.itemId": req.params.iid }, { $set: { "lineItems.$[el].cancelled": true } }, { arrayFilters: [{ "el.itemId": req.params.iid }] });
    await logEvent(req, { entityId: req.params.iid, action: "cancelled", fromValue: from, toValue: req.body?.reason || "" });
    res.json(row);
  } catch (err) { next(err); }
});

// Restore a cancelled item back to the BOQ.
router.post("/items/:iid/restore", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await ProcurementItem.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!row) return res.status(404).json({ error: "Not found" });
    const reason = req.body?.reason || "";
    // Record the restore in the item's RV history too, with its reason, to keep the full trail.
    await ProcurementItemRevision.create({
      projectId: req.params.id, itemId: req.params.iid, revNo: row.revNo || 0,
      description: row.description, manufacturer: row.manufacturer, modelNo: row.modelNo,
      qty: row.qty, unit: row.unit, spec: row.spec, needOnSiteDate: row.needOnSiteDate,
      leadTimeDays: row.leadTimeDays, status: row.status,
      changedFields: ["status"], note: `Restored${reason ? `: ${reason}` : ""}`, actorName: req.user!.name || "",
    });
    row.revNo = (row.revNo || 0) + 1;
    row.status = "BOQ";
    row.cancelledAt = null;
    row.cancelledBy = "";
    row.cancellationReason = "";
    await row.save();
    // I3 — bring the cascaded submittal + RFQ/PO lines back with the item.
    await Submittal.updateMany({ itemId: req.params.iid, projectId: req.params.id, status: "Cancelled" }, { $set: { status: "Draft" } });
    await Rfq.updateMany({ projectId: req.params.id, "lineItems.itemId": req.params.iid }, { $set: { "lineItems.$[el].cancelled": false } }, { arrayFilters: [{ "el.itemId": req.params.iid }] });
    await ProcurementPO.updateMany({ projectId: req.params.id, "lineItems.itemId": req.params.iid }, { $set: { "lineItems.$[el].cancelled": false } }, { arrayFilters: [{ "el.itemId": req.params.iid }] });
    await logEvent(req, { entityId: req.params.iid, action: "restored" });
    res.json(row);
  } catch (err) { next(err); }
});

// Hard delete (mistakes only) — owners/employees.
router.delete("/items/:iid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await ProcurementItem.findOneAndDelete({ _id: req.params.iid, projectId: req.params.id });
    if (row) await logEvent(req, { entityId: req.params.iid, action: "deleted", fromValue: row.description });
    res.json({ message: "Item deleted" });
  } catch (err) { next(err); }
});

// ── Audit timeline (read-only) ──────────────────────────────────────────────
router.get("/events", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = { projectId: req.params.id };
    if (req.query.entityId) filter.entityId = String(req.query.entityId);
    const rows = await ProcurementEvent.find(filter).sort({ createdAt: -1 }).limit(500);
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
