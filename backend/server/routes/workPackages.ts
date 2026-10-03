import { Router, Response, NextFunction } from "express";
import mongoose from "mongoose";
import WorkPackage, { WP_STATUSES, WP_TYPES, type IWorkPackage } from "../models/WorkPackage";
import Project from "../models/Project";
import Rfq from "../models/Rfq";
import VendorQuote from "../models/VendorQuote";
import Vendor from "../models/Vendor";
import Company from "../models/Company";
import ProcurementPO from "../models/ProcurementPO";
import Agreement from "../models/Agreement";
import Invoice from "../models/Invoice";
import Expense from "../models/Expense";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard, canSeeFigures, fetchRequesterAccess } from "../lib/access";
import { recycleAndDelete } from "../lib/recycleBin";
import { poLock, agrLock, locksOf, type Lock } from "../lib/workPackageLocks";

// CR 328 - Work Packages (Project Management). Behind the "pm" tab permission like the schedule
// and the task board. The list comes back with everything it shows about the linked RFQ, quotes,
// PO, agreement and payments already worked out; the money is left out for anyone who may not see
// the project's figures.
const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["pm"]));

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: unknown) => (typeof v === "string" && ISO.test(v) ? v : "");
const oid = (v: unknown) => (mongoose.isValidObjectId(v) ? String(v) : "");
const pct = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
const money = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
const amount = (v: unknown) => Math.max(-1e12, Math.min(1e12, Math.round(money(v) * 100) / 100));
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const status = (v: unknown) => ((WP_STATUSES as readonly string[]).includes(String(v)) ? String(v) : "not_started");

/** A change order's document: a file uploaded to this project, never a path elsewhere. */
function coDocument(projectId: string, c: Record<string, unknown>) {
  const p = str(c.document, 500).trim().replace(/\\/g, "/");
  const ok = p.startsWith(`uploads/${projectId}/`) && !p.includes("..");
  return { document: ok ? p : "", documentName: ok ? str(c.documentName, 200).trim() : "" };
}

/** What a person may set on a package. Links are checked against this project before they are kept. */
async function clean(projectId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (body.name !== undefined) out.name = str(body.name, 160).trim();
  if (body.description !== undefined) out.description = str(body.description, 2000).trim();
  if (body.type !== undefined) out.type = (WP_TYPES as readonly string[]).includes(String(body.type)) ? String(body.type) : "other";
  if (body.responsible !== undefined) {
    const r = (body.responsible || {}) as Record<string, unknown>;
    if (r.kind === "internal") out.responsible = { kind: "internal", companyId: "", name: str(r.name, 160).trim() || "GT" };
    else {
      /**
       * CR 328 (GT Comments 3, page 1): "Vendors/subcontractors must be selected directly from the
       * Company/Vendor Directory; if a company does not exist, it must first be created in the
       * Directory." The company is kept by its Directory record; a name typed without one is
       * matched to the Directory, and refused when it is not there.
       */
      const id = oid(r.companyId), name = str(r.name, 160).trim();
      let c = id ? await Company.findById(id).select("name").lean() : null;
      if (!c && name) c = await Company.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), archived: { $ne: true } }).select("name").lean();
      out.responsible = c ? { kind: "company", companyId: String(c._id), name: c.name } : { kind: "company", companyId: "", name: "" };
      if (name && !c) out.notInDirectory = name;
    }
  }
  if (body.rfqId !== undefined) {
    const id = oid(body.rfqId);
    out.rfqId = id && (await Rfq.exists({ _id: id, projectId })) ? id : "";
  }
  if (body.poId !== undefined) {
    const id = oid(body.poId);
    out.poId = id && (await ProcurementPO.exists({ _id: id, projectId })) ? id : "";
  }
  if (body.agreementId !== undefined) {
    const id = oid(body.agreementId);
    out.agreementId = id && (await Agreement.exists({ _id: id, $or: [{ ownerProjectId: projectId }, { "linkedProjects.id": projectId }] })) ? id : "";
  }
  if (body.status !== undefined) out.status = status(body.status);
  if (body.progressMode !== undefined) out.progressMode = ["subtasks", "schedule"].includes(String(body.progressMode)) ? String(body.progressMode) : "manual";
  if (body.progress !== undefined) out.progress = pct(body.progress);
  if (body.scheduleRef !== undefined) {
    const r = (body.scheduleRef || {}) as Record<string, unknown>;
    out.scheduleRef = { kind: r.kind === "task" || r.kind === "phase" ? r.kind : "", id: str(r.id, 120) };
  }
  if (Array.isArray(body.subtasks)) {
    out.subtasks = body.subtasks.slice(0, 100).map((raw) => {
      const t = (raw || {}) as Record<string, unknown>;
      return { id: str(t.id, 40) || newId(), name: str(t.name, 160).trim() || "Untitled", status: status(t.status), progress: pct(t.progress), dueDate: date(t.dueDate), assignee: str(t.assignee, 120).trim() };
    });
  }
  if (body.budget !== undefined) out.budget = Math.max(0, amount(body.budget));
  if (Array.isArray(body.changeOrders)) {
    out.changeOrders = body.changeOrders.slice(0, 100).map((raw, i) => {
      const c = (raw || {}) as Record<string, unknown>;
      return { id: str(c.id, 40) || newId(), no: str(c.no, 40).trim() || `CO-${String(i + 1).padStart(2, "0")}`, date: date(c.date), reason: str(c.reason, 500).trim(), amount: amount(c.amount), status: c.status === "proposed" ? "proposed" : "approved", ...coDocument(projectId, c) };
    });
  }
  if (body.remarks !== undefined) out.remarks = str(body.remarks, 2000).trim();
  if (body.archived !== undefined) out.archived = body.archived === true;
  return out;
}

const notInDirectory = (name: unknown) => `"${String(name)}" is not in the Directory. Pick the company from the list, or add it to the Directory first (the list offers to).`;

/** Only the project's own team (its owner and employees) may unlink a signed document; a guest may not. */
async function mayUnlink(req: AuthedRequest): Promise<boolean> {
  const { access } = await fetchRequesterAccess(req);
  return access.role === "owner" || access.role === "employee";
}

type Plain = Record<string, unknown> & { _id: unknown };
/** The packages with what the linked records say about them. */
async function shape(projectId: string, list: IWorkPackage[], showMoney: boolean) {
  const rows = list.map((p) => p.toObject() as unknown as Plain & IWorkPackage);
  const ids = (k: "rfqId" | "poId" | "agreementId") => [...new Set(rows.map((r) => r[k]).filter((x) => mongoose.isValidObjectId(x)))];
  const rfqIds = ids("rfqId"), poIds = ids("poId"), agrIds = ids("agreementId");
  const [rfqs, quotes, pos, agrs, invoices] = await Promise.all([
    rfqIds.length ? Rfq.find({ _id: { $in: rfqIds }, projectId }).select("rfqNo title status sentAt recipients createdAt").lean() : [],
    rfqIds.length ? VendorQuote.find({ rfqId: { $in: rfqIds }, projectId }).select("rfqId vendorId status").lean() : [],
    poIds.length ? ProcurementPO.find({ _id: { $in: poIds }, projectId }).select("poNo status total vendorId vendorName signatureUrl createdAt").lean() : [],
    agrIds.length ? Agreement.find({ _id: { $in: agrIds } }).select("agreementNo name title status effectiveDate partySnapshot.party2 createdAt ownerContextType contractValue").lean() : [],
    showMoney && (poIds.length || agrIds.length)
      ? Invoice.find({ projectId, type: "received", $or: [{ poId: { $in: poIds } }, { "contractRef.agreementId": { $in: agrIds } }] }).select("poId contractRef payments").lean()
      : [],
  ]);
  // CR 328 - approved expenses tagged to a package are paid on it too. An expense made by a payment
  // on an invoice is left out: that payment is already counted from the invoice.
  const expenses = showMoney
    ? await Expense.find({ projectId, workPackageId: { $in: rows.map((r) => String(r._id)) }, approval: "approved", invoiceId: { $in: ["", null] } }).select("workPackageId qty amount").lean()
    : [];
  const vendorIds = [...new Set([...quotes.map((q) => q.vendorId), ...pos.map((p) => p.vendorId)].filter((x) => mongoose.isValidObjectId(x)))];
  const vendors = vendorIds.length ? await Vendor.find({ _id: { $in: vendorIds } }).select("name city country companyId").lean() : [];
  const vendorOf = new Map(vendors.map((v) => [String(v._id), v]));
  const companyIds = [...new Set([...rows.map((r) => r.responsible?.companyId), ...vendors.map((v) => (v as { companyId?: string }).companyId)].filter((x) => mongoose.isValidObjectId(x)))];
  const companies = companyIds.length ? await Company.find({ _id: { $in: companyIds } }).select("name logoUrl address").lean() : [];
  const companyOf = new Map(companies.map((c) => [String(c._id), c]));
  const day = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : "");
  const paidOf = (inv: { payments?: Array<{ amount: string }> }) => (inv.payments || []).reduce((a, p) => a + money(p.amount), 0);

  return rows.map((r) => {
    const rfq = rfqs.find((x) => String(x._id) === r.rfqId);
    const qs = quotes.filter((q) => q.rfqId === r.rfqId && r.rfqId);
    const po = pos.find((x) => String(x._id) === r.poId);
    const agr = agrs.find((x) => String(x._id) === r.agreementId);
    const awarded = qs.find((q) => q.status === "Awarded");
    const vendorName = (id: string) => vendorOf.get(id)?.name || "";
    // Who does it: the company chosen on the package, else whoever won the quote, else the PO's vendor.
    let winner: { name: string; place: string; logoUrl: string; companyId: string; internal: boolean; from: string } | null = null;
    if (r.responsible?.kind === "internal") winner = { name: r.responsible.name || "GT", place: "", logoUrl: "", companyId: "", internal: true, from: "package" };
    else if (r.responsible?.name) {
      const c = companyOf.get(r.responsible.companyId);
      winner = { name: c?.name || r.responsible.name, place: c?.address || "", logoUrl: c?.logoUrl || "", companyId: r.responsible.companyId, internal: false, from: "package" };
    } else {
      const v = vendorOf.get(awarded?.vendorId || "") || vendorOf.get(po?.vendorId || "");
      const c = companyOf.get(String((v as { companyId?: string } | undefined)?.companyId || ""));
      if (v) winner = { name: v.name, place: [v.city, v.country].filter(Boolean).join(", "), logoUrl: c?.logoUrl || "", companyId: String((v as { companyId?: string }).companyId || ""), internal: false, from: awarded ? "quote" : "po" };
      else if (po?.vendorName) winner = { name: po.vendorName, place: "", logoUrl: "", companyId: "", internal: false, from: "po" };
    }
    const subs = r.subtasks || [];
    const progress = r.progressMode === "subtasks" && subs.length ? Math.round(subs.reduce((a, t) => a + (t.progress || 0), 0) / subs.length) : r.progress || 0;
    const out: Record<string, unknown> = {
      ...r,
      progress,
      rfq: rfq ? { id: String(rfq._id), no: rfq.rfqNo, title: rfq.title, status: rfq.status, date: rfq.sentAt || day((rfq as { createdAt?: unknown }).createdAt), vendors: (rfq.recipients || []).length } : null,
      quotes: { count: qs.length, names: qs.map((q) => vendorName(q.vendorId)).filter(Boolean) },
      winner,
      po: po ? { id: String(po._id), no: po.poNo, status: po.status, signed: !!po.signatureUrl, date: day((po as { createdAt?: unknown }).createdAt) } : null,
      // A General Agreement lives on the Agreements page; a project one under Subcontractors & Employees.
      agreement: agr ? { id: String(agr._id), no: agr.agreementNo || agr.name, title: agr.title || "", status: agr.status, date: agr.effectiveDate || day((agr as { createdAt?: unknown }).createdAt), general: agr.ownerContextType === "general" } : null,
      locks: [poLock(po), agrLock(agr)].filter(Boolean),
    };
    if (!showMoney) {
      // Not theirs to see: the figures are taken off the record itself, not just left uncounted.
      delete out.budget;
      out.changeOrders = (r.changeOrders || []).map((c) => ({ ...c, amount: undefined }));
      out.money = null;
      return out;
    }
    // The original value comes from the record that carries it: the PO's total, else the agreement's
    // contract value, else the figure typed on the package.
    const agrValue = agr ? money((agr as { contractValue?: string }).contractValue) : 0;
    const original = po ? money(po.total) : agrValue || r.budget || 0;
    const changes = (r.changeOrders || []).filter((c) => c.status === "approved").reduce((a, c) => a + (c.amount || 0), 0);
    const paid = invoices.filter((i) => (r.poId && i.poId === r.poId) || (r.agreementId && i.contractRef?.agreementId === r.agreementId)).reduce((a, i) => a + paidOf(i), 0)
      + expenses.filter((e) => e.workPackageId === String(r._id)).reduce((a, e) => a + (money(e.qty) || 1) * money(e.amount), 0);
    out.money = { original, source: po ? "po" : agrValue ? "agreement" : r.budget ? "budget" : "", changes, changeCount: (r.changeOrders || []).filter((c) => c.status === "approved").length, current: original + changes, paid, remaining: original + changes - paid };
    return out;
  });
}

async function figures(req: AuthedRequest): Promise<boolean> {
  const p = await Project.findOne({ projectId: req.params.id }).select("ownerId figuresAccess").lean();
  return !!p && canSeeFigures(p as { ownerId?: unknown; figuresAccess?: Record<string, boolean> }, req.user!.userId, req.user!.role);
}

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const showMoney = await figures(req);
    const list = await WorkPackage.find({ projectId: req.params.id }).sort({ order: 1, createdAt: 1 }).limit(500);
    res.json({ canSeeFigures: showMoney, canUnlink: await mayUnlink(req), packages: await shape(req.params.id, list, showMoney) });
  } catch (err) { next(err); }
});

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const showMoney = await figures(req);
    const body = await clean(req.params.id, req.body || {});
    if (!body.name) return res.status(400).json({ error: "Give the work package a name." });
    if (body.notInDirectory) return res.status(400).json({ error: notInDirectory(body.notInDirectory) });
    // Someone who cannot see the figures cannot set them either.
    if (!showMoney) { delete body.budget; delete body.changeOrders; }
    const last = await WorkPackage.findOne({ projectId: req.params.id }).sort({ order: -1 }).select("order").lean();
    const doc = await WorkPackage.create({ ...body, projectId: req.params.id, order: (last?.order ?? 0) + 1, createdByName: req.user!.name || "" });
    res.status(201).json((await shape(req.params.id, [doc], showMoney))[0]);
  } catch (err) { next(err); }
});

// Several at once, from an Excel sheet.
router.post("/import", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const rows = Array.isArray(req.body?.packages) ? req.body.packages.slice(0, 300) : [];
    const showMoney = await figures(req);
    const last = await WorkPackage.findOne({ projectId: req.params.id }).sort({ order: -1 }).select("order").lean();
    let order = last?.order ?? 0;
    const made: IWorkPackage[] = [];
    const unmatched: string[] = [];
    for (const raw of rows) {
      // Links are never taken from a sheet.
      const body = await clean(req.params.id, { ...(raw as Record<string, unknown>), rfqId: undefined, poId: undefined, agreementId: undefined });
      if (!body.name) continue;
      // A company that is not in the Directory is left for the PM to pick; the package still comes in.
      if (body.notInDirectory) { if (!unmatched.includes(String(body.notInDirectory))) unmatched.push(String(body.notInDirectory)); delete body.notInDirectory; }
      if (!showMoney) { delete body.budget; delete body.changeOrders; }
      made.push(await WorkPackage.create({ ...body, projectId: req.params.id, order: ++order, createdByName: req.user!.name || "" }));
    }
    res.status(201).json({ packages: await shape(req.params.id, made, showMoney), unmatched });
  } catch (err) { next(err); }
});

// The order of the list, top to bottom.
router.put("/order", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter((x: unknown) => mongoose.isValidObjectId(x)).slice(0, 500);
    await Promise.all(ids.map((id: string, i: number) => WorkPackage.updateOne({ _id: id, projectId: req.params.id }, { $set: { order: i + 1 } })));
    res.json({ message: "Saved" });
  } catch (err) { next(err); }
});

router.patch("/:wid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!mongoose.isValidObjectId(req.params.wid)) return res.status(404).json({ error: "Not found" });
    const doc = await WorkPackage.findOne({ _id: req.params.wid, projectId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    const showMoney = await figures(req);
    const body = await clean(req.params.id, req.body || {});
    if (body.name === "") delete body.name;
    if (body.notInDirectory) return res.status(400).json({ error: notInDirectory(body.notInDirectory) });
    // Someone who cannot see the figures cannot change them either.
    if (!showMoney) { delete body.budget; delete body.changeOrders; }
    // Bound to a signed document: unlinking it is allowed (to the project's team), nothing else that
    // decides who does the work. Unlinked in this same save, the rest of the save goes ahead.
    const locks = await locksOf(req.params.id, doc);
    if (locks.length) {
      const was = { rfqId: doc.rfqId || "", poId: doc.poId || "", agreementId: doc.agreementId || "" };
      const lockField = (l: Lock) => (l.kind === "po" ? "poId" : "agreementId");
      const unlinked = locks.filter((l) => body[lockField(l)] === "");
      if (unlinked.length && !(await mayUnlink(req))) return res.status(403).json({ error: `${unlinked[0].no} is ${unlinked[0].label}. Only the project's team can unlink it from the work package.` });
      const held = locks.filter((l) => !unlinked.includes(l));
      if (held.length) {
        const sameWho = (() => {
          if (body.responsible === undefined) return true;
          const a = body.responsible as { kind: string; companyId: string; name: string }, b = doc.responsible || { kind: "company", companyId: "", name: "" };
          return a.kind === b.kind && (a.kind === "internal" ? a.name === b.name : a.companyId === (b.companyId || ""));
        })();
        const moved = (["rfqId", "poId", "agreementId"] as const).filter((k) => body[k] !== undefined && body[k] !== was[k] && !unlinked.some((l) => lockField(l) === k));
        if (!sameWho || moved.length) {
          const l = held[0];
          return res.status(409).json({ error: `${l.no} is ${l.label}, so the company${moved.length ? " and the links" : ""} of this work package stay as they are. Unlink ${l.no} first to change them.` });
        }
      }
    }
    doc.set(body);
    await doc.save();
    res.json((await shape(req.params.id, [doc], showMoney))[0]);
  } catch (err) { next(err); }
});

// To the Recycle Bin. Refused while a PO or a signed agreement is linked: unlink it, or archive.
router.delete("/:wid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!mongoose.isValidObjectId(req.params.wid)) return res.status(404).json({ error: "Not found" });
    const doc = await WorkPackage.findOne({ _id: req.params.wid, projectId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    if (doc.poId && (await ProcurementPO.exists({ _id: doc.poId, projectId: req.params.id }))) return res.status(400).json({ error: "A purchase order is linked to this work package. Unlink it first, or archive the package instead." });
    if (doc.agreementId && (await Agreement.exists({ _id: doc.agreementId, status: "Signed" }))) return res.status(400).json({ error: "A signed agreement is linked to this work package. Unlink it first, or archive the package instead." });
    const project = await Project.findOne({ projectId: req.params.id }).select("name").lean();
    await recycleAndDelete(doc, { kind: "work-package", name: doc.name, subtitle: "Work package", projectId: req.params.id, projectName: project?.name || "", deletedById: req.user?.userId, deletedByName: req.user?.name || "" });
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

export default router;
