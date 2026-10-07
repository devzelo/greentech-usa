import { Router, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import Shipment, { DEFAULT_SHIPMENT_DOCS, REQUIRED_SHIPMENT_DOCS, ShipmentStatus } from "../models/Shipment";
import ProcurementPO from "../models/ProcurementPO";
import ProcurementItem, { ProcurementStatus } from "../models/ProcurementItem";
import ProcurementEvent from "../models/ProcurementEvent";
import { recycleAndDelete } from "../lib/recycleBin";
import Project from "../models/Project";
import { createNotification } from "../lib/notify";
import { fetchTracking, mergeStatus, trackingProvider } from "../lib/carrierTracking";

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
      // CR 278 (2026-09-23) - "open bed / flat rack" was a tick box beside the container type; it
      // is a type in its own right now, so an old shipment's flag is folded into the type once.
      if (s.openBed) {
        const t = String(s.containerType || "").trim();
        if (!/flat ?rack|open ?bed/i.test(t)) s.containerType = t ? `${t} · Flat rack / open bed` : "Flat rack / open bed";
        s.openBed = false;
        changed = true;
      }
      // CR 281 (2026-09-23) - the cargo used to be one container type and one size on the
      // shipment itself. Read it as a single cargo row once, so an old shipment opens with its
      // cargo already listed and the editor has something to build on.
      if (!(s.cargo || []).length && (String(s.containerType || "").trim() || String(s.containerSize || "").trim())) {
        s.cargo = legacyCargo(s.containerType, s.containerSize, s.trackingNo);
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
async function syncItemsFromShipment(actor: { id: string; name: string }, projectId: string, shipmentId: string, poIds: string[], status: ShipmentStatus) {
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
      actorId: actor.id, actorName: actor.name,
    });
  } catch { /* best-effort */ }
}

// ── CR 219: automatic tracking ───────────────────────────────────────────────
// A carrier aggregator (if one is configured) is asked once a day for each live shipment, and on
// demand from the shipment screen. Whatever comes back is written on the shipment: last known
// location, anticipated arrival, the events we did not have yet, and a status nudge that only ever
// moves the shipment forward. With no aggregator configured the same fields are kept by hand
// ("Log an update"), and a weekly reminder goes to the project owner when they go stale.
type TrackDoc = InstanceType<typeof Shipment>;
const ACTIVE_STATUSES: ShipmentStatus[] = ["Preparing", "Fabrication", "Transit", "Clearance", "Warehouse"];
const eventKey = (e: { date?: string; description?: string; location?: string }) =>
  `${e.date || ""}|${(e.description || "").toLowerCase()}|${(e.location || "").toLowerCase()}`;

async function pullTracking(s: TrackDoc, actor: { id: string; name: string }): Promise<{ added: number; provider: string }> {
  const r = await fetchTracking(s.trackingNo, s.carrier);
  const known = new Set((s.trackingEvents || []).map(eventKey));
  const fresh = r.events.filter((e) => !known.has(eventKey(e)));
  s.trackingEvents = [
    ...fresh.map((e) => ({ ...e, source: r.provider, addedBy: "" })),
    ...(s.trackingEvents || []),
  ].slice(0, 200);
  if (r.currentLocation) s.currentLocation = r.currentLocation.slice(0, 300);
  if (r.etaDate) s.etaDate = r.etaDate;
  s.trackingCheckedAt = new Date().toISOString();
  s.trackingSource = r.provider;
  const next = mergeStatus(s.status, r.status);
  const moved = next !== s.status;
  s.status = next;
  await s.save();
  if (moved && s.poIds?.length) await syncItemsFromShipment(actor, s.projectId, String(s._id), s.poIds, s.status);
  return { added: fresh.length, provider: r.provider };
}

/** Is automatic tracking available on this server, and for this shipment? */
router.get("/tracking/config", async (_req: AuthedRequest, res: Response) => {
  const { enabled, provider } = trackingProvider();
  res.json({ enabled, provider, checkedDaily: enabled });
});

/** Ask the carrier now (the button on the shipment screen). */
router.post("/:sid/tracking/refresh", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const s = await Shipment.findOne({ _id: req.params.sid, projectId: req.params.id });
    if (!s) return res.status(404).json({ error: "Not found" });
    const { added, provider } = await pullTracking(s, actorOf(req));
    res.json({ shipment: s, added, provider });
  } catch (err) {
    if (err instanceof Error && !("statusCode" in err)) return res.status(400).json({ error: err.message });
    next(err);
  }
});

/** The manual path: log where the shipment is now (kept in the same history as the automatic pulls). */
router.post("/:sid/tracking/log", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const s = await Shipment.findOne({ _id: req.params.sid, projectId: req.params.id });
    if (!s) return res.status(404).json({ error: "Not found" });
    const b = req.body || {};
    const location = String(b.location || "").trim().slice(0, 300);
    const description = String(b.description || "").trim().slice(0, 300);
    if (!location && !description) return res.status(400).json({ error: "Add the location or a note." });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) ? String(b.date) : new Date().toISOString().slice(0, 10);
    s.trackingEvents = [
      { date, location, description, status: "", source: "Manual", addedBy: req.user!.name || "" },
      ...(s.trackingEvents || []),
    ].slice(0, 200);
    if (location) s.currentLocation = location;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(b.etaDate || ""))) s.etaDate = String(b.etaDate);
    s.trackingCheckedAt = new Date().toISOString();
    s.trackingSource = "Manual";
    const moved = typeof b.status === "string" && STATUSES.includes(b.status as ShipmentStatus) && b.status !== s.status;
    if (moved) s.status = b.status as ShipmentStatus;
    await s.save();
    if (moved && s.poIds?.length) await syncItemsFromShipment(actorOf(req), req.params.id, String(s._id), s.poIds, s.status);
    res.json(s);
  } catch (err) { next(err); }
});

/** Delete one logged update (a typo in the weekly entry). */
router.delete("/:sid/tracking/:idx", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const s = await Shipment.findOne({ _id: req.params.sid, projectId: req.params.id });
    if (!s) return res.status(404).json({ error: "Not found" });
    const i = Number(req.params.idx);
    if (!Number.isInteger(i) || i < 0 || i >= (s.trackingEvents || []).length) return res.status(404).json({ error: "No such update." });
    s.trackingEvents = (s.trackingEvents || []).filter((_, k) => k !== i);
    await s.save();
    res.json(s);
  } catch (err) { next(err); }
});

/**
 * Daily sweep (the cron calls this): every live shipment with a tracking number is refreshed from
 * the aggregator. Does nothing at all when no aggregator is configured.
 */
export async function sweepShipmentTracking(): Promise<{ checked: number; updated: number; failed: number }> {
  const out = { checked: 0, updated: 0, failed: 0 };
  if (!trackingProvider().enabled) return out;
  const live = await Shipment.find({ status: { $in: ACTIVE_STATUSES }, trackingNo: { $nin: ["", null] } }).limit(500);
  for (const s of live) {
    out.checked++;
    try {
      const { added } = await pullTracking(s, { id: "system", name: "Automatic tracking" });
      if (added) out.updated++;
    } catch { out.failed++; }
    await new Promise((r) => setTimeout(r, 400));   // stay well inside the free tiers' rate limits
  }
  return out;
}

/**
 * Weekly nudge (the fallback the client asked for): a live shipment whose location has not moved in
 * `days` days gets the project owner a reminder to update it from the carrier page.
 */
export async function remindStaleShipments(days = 7): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const live = await Shipment.find({ status: { $in: ACTIVE_STATUSES } }).limit(500);
  let sent = 0;
  for (const s of live) {
    if (s.status === "Preparing") continue;               // nothing to track until it moves
    if ((s.trackingCheckedAt || "") > cutoff) continue;   // updated recently enough
    const project = await Project.findOne({ projectId: s.projectId }).select("ownerId name").lean();
    const ownerId = (project as { ownerId?: unknown } | null)?.ownerId;
    if (!ownerId) continue;
    const since = s.trackingCheckedAt ? `last updated ${s.trackingCheckedAt.slice(0, 10)}` : "never updated";
    await createNotification({
      userId: String(ownerId),
      type: "reminder",
      title: `Update ${s.name || "the shipment"} location`,
      message: `${s.name || "A shipment"} on ${(project as { name?: string } | null)?.name || s.projectId} is ${s.status === "Transit" ? "in transit" : s.status.toLowerCase()} and ${since}. Open the carrier page and log where it is now.`,
      link: `/dashboard/projects/${s.projectId}?tab=procurement&proc=shipment`,
    });
    sent++;
  }
  return sent;
}

const actorOf = (req: AuthedRequest) => ({ id: req.user!.userId, name: req.user!.name || "" });

const META_FIELDS = ["name", "description", "fromLocation", "toLocation", "deadline",
  "costFreight", "costCustoms", "costDemurrage", "costOther",
  // Tracking header + container details + agency (CR-PR-08/09).
  "trackingNo", "carrier", "carrierCompanyId", "currentLocation", "etaDate", "trackingUrl", "containerType", "containerSize",
  // CR 282 - the mode of transport, with the typed name when it is "custom".
  "transportMode", "transportModeOther",
  "agencyName", "agencyCompanyId", "agencyContact", "agencyPhone", "agencyEmail", "agencyWebsite", "agencyCountry"] as const;

// CR 281 - the cargo rows. Everything is kept as text (like the rest of the shipment) so a
// quantity of "2" and a weight of "12.5" travel the same way; the UI does the arithmetic.
const CARGO_KEYS = ["container", "opentop", "reefer", "flatrack", "openbed", "tanker", "pallet", "crate", "loose", "custom"];
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const cleanCargo = (v: unknown) => Array.isArray(v)
  ? v.map((raw) => {
      const c = (raw || {}) as Record<string, unknown>;
      const type = String(c.type ?? "container");
      return {
        type: CARGO_KEYS.includes(type) ? type : "custom",
        customType: str(c.customType, 200),
        qty: str(c.qty, 10),
        size: str(c.size, 120),
        dimL: str(c.dimL, 20), dimW: str(c.dimW, 20), dimH: str(c.dimH, 20), dimUnit: str(c.dimUnit, 10),
        weight: str(c.weight, 20), weightUnit: str(c.weightUnit, 10),
        ref: str(c.ref, 120),
      };
    }).slice(0, 100)
  : [];

/** An old shipment's single container type / size, read as one cargo row. */
const legacyCargo = (containerType?: string, containerSize?: string, trackingNo?: string) => {
  const t = String(containerType || "").trim();
  const size = String(containerSize || "").trim();
  if (!t && !size) return [];
  const match = ([
    ["opentop", /open ?top/i], ["reefer", /reefer|refrigerat/i], ["flatrack", /flat ?rack/i],
    ["openbed", /open ?bed|flat ?bed/i], ["tanker", /tank/i], ["pallet", /pallet/i],
    ["crate", /crate/i], ["loose", /break ?bulk|loose|lcl/i],
  ] as Array<[string, RegExp]>).find(([, re]) => re.test(t));
  return [{
    type: match ? match[0] : t ? "custom" : "container",
    customType: match ? "" : t,
    qty: "1", size,
    dimL: "", dimW: "", dimH: "", dimUnit: "ft",
    weight: "", weightUnit: "Ton",
    ref: String(trackingNo || "").trim().slice(0, 120),
  }];
};

// CR 282 - the modes a shipment can travel by; anything else is not stored.
const TRANSPORT_KEYS = ["ocean", "air", "road", "rail", "ocean_road", "air_road", "custom"];

const cleanGoods = (v: unknown) => Array.isArray(v)
  ? v.map((g) => ({ description: String((g as { description?: unknown })?.description ?? "").slice(0, 300), qty: String((g as { qty?: unknown })?.qty ?? "").slice(0, 40), unit: String((g as { unit?: unknown })?.unit ?? "").slice(0, 40) })).filter((g) => g.description || g.qty).slice(0, 200)
  : [];

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
      cargo: cleanCargo(body.cargo),
      transportMode: TRANSPORT_KEYS.includes(String(body.transportMode || "")) ? String(body.transportMode) : "",
      transportModeOther: String(body.transportModeOther || "").slice(0, 120),
      // Costs are captured in the same popup as everything else — accept them on create too,
      // not only on the later PATCH.
      costFreight: String(body.costFreight || "").slice(0, 60),
      costCustoms: String(body.costCustoms || "").slice(0, 60),
      costDemurrage: String(body.costDemurrage || "").slice(0, 60),
      costOther: String(body.costOther || "").slice(0, 60),
      rows: DEFAULT_SHIPMENT_DOCS.map((d) => ({ docType: d, remarks: "", files: [] })),
    });
    if (s.status !== "Preparing") await syncItemsFromShipment(actorOf(req), req.params.id, String(s._id), s.poIds, s.status);
    res.status(201).json(s);
  } catch (err) { next(err); }
});

router.patch("/:sid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {};
    const patch: Record<string, unknown> = {};
    for (const f of META_FIELDS) if (typeof body[f] === "string") patch[f] = body[f].slice(0, f === "description" ? 2000 : 300);
    if (typeof body.openBed === "boolean") patch.openBed = body.openBed;
    if ("transportMode" in patch && !TRANSPORT_KEYS.includes(String(patch.transportMode))) patch.transportMode = "";
    if (Array.isArray(body.cargo)) patch.cargo = cleanCargo(body.cargo);
    if (Array.isArray(body.goods)) patch.goods = cleanGoods(body.goods);
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
      if (statusChanged) await syncItemsFromShipment(actorOf(req), req.params.id, String(s._id), s.poIds, s.status);
      else if (addedPoIds.length) await syncItemsFromShipment(actorOf(req), req.params.id, String(s._id), addedPoIds, s.status);
    }
    res.json(s);
  } catch (err) { next(err); }
});

router.delete("/:sid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const s = await Shipment.findOne({ _id: req.params.sid, projectId: req.params.id });
    if (s) {
      const files: Array<{ filePath: string }> = [];
      for (const row of s.rows || []) for (const f of row.files || []) if (f.filePath) files.push({ filePath: f.filePath });
      await recycleAndDelete(s, {
        kind: "shipment",
        name: s.name,
        subtitle: "Shipment",
        projectId: String(s.projectId),
        files,
        deletedById: req.user?.userId,
        deletedByName: req.user?.name || "",
      });
    }
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
