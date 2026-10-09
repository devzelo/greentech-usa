import { Router, Response, NextFunction } from "express";
import multer from "multer";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import User from "../models/User";
import Project from "../models/Project";
import ProcurementItem from "../models/ProcurementItem";
import ProcurementSection from "../models/ProcurementSection";
import WorkPackage from "../models/WorkPackage";
import VendorOffer, { type OfferKind } from "../models/VendorOffer";
import Invoice from "../models/Invoice";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { resolveMyCompany } from "../lib/myCompany";
import { tellOwner } from "../lib/vendorWork";

/**
 * 2026-10-09 - the vendor's side: a company login sees, project by project, the BOQ lines that name
 * it as their vendor and the work packages it is doing, and from its own profile enters its unit
 * price, total and lead time, uploads documents, and sends invoices (they reach the project's
 * Finances as Pending received invoices). Everything is scoped to the login's own Directory company:
 * a line or package not assigned to it is never shown or touched.
 */
const router = Router();
router.use(requireAuth);

type Work = { companyId: string; companyName: string; userName: string; kind: OfferKind; refId: string; projectId: string; label: string; pkg?: { agreementId?: string; poId?: string; name: string } };
type WorkRequest = AuthedRequest & { vendorWork?: Work };

const MAX_BYTES = 32 * 1024 * 1024;
const OK_EXT = new Set(["pdf", "png", "jpg", "jpeg", "webp", "gif", "doc", "docx", "xls", "xlsx", "csv", "txt"]);
const humanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
const extOf = (name: string) => (name.split(".").pop() || "").toLowerCase();
const safeName = (name: string) => name.replace(/[^\w.\- ()]+/g, "_").slice(-120) || "file";
const amountOf = (v: unknown) => { const s = String(v ?? "").replace(/[^0-9.]/g, "").slice(0, 20); return isFinite(parseFloat(s)) ? s : ""; };
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isKind = (k: string): k is OfferKind => k === "boq" || k === "package";

async function myCompanyOf(req: AuthedRequest) {
  const user = await User.findById(req.user!.userId).select("name email role companyId").lean() as { _id: unknown; name?: string; email?: string; role?: string; companyId?: unknown } | null;
  if (!user) return null;
  const company = await resolveMyCompany(user);
  return company ? { id: String(company._id), name: company.name || "", userName: user.name || "" } : null;
}
/** Projects a vendor may work on: open, not drafts. */
const openProjects = (ids: string[]) => Project.find({ projectId: { $in: ids }, archived: { $ne: true }, status: { $ne: "Draft" } }).select("projectId name location status").lean();

/** The line or package, when it is assigned to this company on an open project. */
async function assignment(companyId: string, kind: OfferKind, refId: string): Promise<{ projectId: string; label: string; pkg?: Work["pkg"] } | null> {
  if (!mongoose.isValidObjectId(refId)) return null;
  if (kind === "boq") {
    const it = await ProcurementItem.findOne({ _id: refId, vendorCompanyId: companyId, status: { $ne: "Cancelled" } }).select("projectId description").lean();
    if (!it || !(await openProjects([it.projectId])).length) return null;
    return { projectId: it.projectId, label: `the BOQ line "${(it.description || "").slice(0, 80)}"` };
  }
  const wp = await WorkPackage.findOne({ _id: refId, "responsible.kind": "company", "responsible.companyId": companyId, archived: { $ne: true }, status: { $ne: "cancelled" } }).select("projectId name agreementId poId").lean();
  if (!wp || !(await openProjects([wp.projectId])).length) return null;
  return { projectId: wp.projectId, label: `the work package "${wp.name}"`, pkg: { agreementId: wp.agreementId, poId: wp.poId, name: wp.name } };
}

/** Guard for one line or package: the login's company, and the work assigned to it. */
async function loadWork(req: WorkRequest, res: Response, next: NextFunction) {
  try {
    const kind = String(req.params.kind || req.body?.kind || "");
    const refId = String(req.params.refId || req.body?.refId || "");
    const me = await myCompanyOf(req);
    if (!me) return res.status(403).json({ error: "Only a company login can do this." });
    if (!isKind(kind)) return res.status(400).json({ error: "Unknown kind of work." });
    const a = await assignment(me.id, kind, refId);
    if (!a) return res.status(404).json({ error: "This line or package is not assigned to your company." });
    req.vendorWork = { companyId: me.id, companyName: me.name, userName: me.userName, kind, refId, ...a };
    next();
  } catch (err) { next(err); }
}

const storage = multer.diskStorage({
  destination: (req: WorkRequest, _file, cb) => {
    const w = req.vendorWork!;
    const dir = path.join("uploads", w.projectId.replace(/[^\w-]/g, "_"), "vendor-offers", w.companyId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${safeName(file.originalname)}`),
});
const upload = multer({
  storage, limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => cb(null, OK_EXT.has(extOf(file.originalname))),
});
const unlink = (p?: string) => { if (p) fs.unlink(path.resolve(p), () => {}); };

// ── GET /api/me/vendor — the company's work, project by project ──────────────────────────────
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const me = await myCompanyOf(req);
    if (!me) return res.json({ company: null, projects: [], offers: [], invoices: [] });
    const [items, pkgs] = await Promise.all([
      ProcurementItem.find({ vendorCompanyId: me.id, status: { $ne: "Cancelled" } })
        .select("projectId sectionId description manufacturer modelNo qty unit spec needOnSiteDate status").sort({ createdAt: 1 }).lean(),
      WorkPackage.find({ "responsible.kind": "company", "responsible.companyId": me.id, archived: { $ne: true }, status: { $ne: "cancelled" } })
        .select("projectId name description type status order").sort({ order: 1 }).lean(),
    ]);
    const projects = await openProjects([...new Set([...items.map((i) => i.projectId), ...pkgs.map((p) => p.projectId)])]);
    const open = new Set(projects.map((p) => p.projectId));
    const myItems = items.filter((i) => open.has(i.projectId));
    const myPkgs = pkgs.filter((p) => open.has(p.projectId));
    const sections = await ProcurementSection.find({ _id: { $in: [...new Set(myItems.map((i) => i.sectionId).filter((s) => mongoose.isValidObjectId(s)))] } }).select("name").lean();
    const sectionName = new Map(sections.map((s) => [String(s._id), s.name]));
    const [offers, invoices] = await Promise.all([
      VendorOffer.find({ companyId: me.id, $or: [{ kind: "boq", refId: { $in: myItems.map((i) => String(i._id)) } }, { kind: "package", refId: { $in: myPkgs.map((p) => String(p._id)) } }] }).lean(),
      Invoice.find({ companyId: me.id, source: "vendor-portal", projectId: { $in: [...open] } }).select("projectId number amount date status sourceRef attachments createdAt").sort({ createdAt: -1 }).lean(),
    ]);
    res.json({
      company: { id: me.id, name: me.name },
      projects: projects.map((p) => ({
        projectId: p.projectId, name: p.name, location: p.location || "", status: p.status,
        items: myItems.filter((i) => i.projectId === p.projectId).map((i) => ({
          _id: String(i._id), category: sectionName.get(String(i.sectionId)) || "", description: i.description, brand: i.manufacturer, model: i.modelNo,
          qty: i.qty, unit: i.unit, spec: i.spec, needOnSiteDate: i.needOnSiteDate,
        })),
        packages: myPkgs.filter((w) => w.projectId === p.projectId).map((w) => ({ _id: String(w._id), name: w.name, description: w.description, type: w.type, status: w.status })),
      })),
      offers,
      invoices,
    });
  } catch (err) { next(err); }
});

// ── Their figures for a line or package: editable until GreenTech accepts them ────────────────
router.put("/offers/:kind/:refId", loadWork, async (req: WorkRequest, res: Response, next: NextFunction) => {
  try {
    const w = req.vendorWork!;
    const key = { projectId: w.projectId, kind: w.kind, refId: w.refId, companyId: w.companyId };
    const was = await VendorOffer.findOne(key).select("status").lean();
    if (was?.status === "accepted") return res.status(409).json({ error: "GreenTech has accepted these figures. Ask them to reopen the offer to change it." });
    const fields = { unitPrice: amountOf(req.body?.unitPrice), total: amountOf(req.body?.total), leadTime: str(req.body?.leadTime, 60), notes: str(req.body?.notes, 2000) };
    if (!fields.unitPrice && !fields.total) return res.status(400).json({ error: "Enter a unit price or a total." });
    const offer = await VendorOffer.findOneAndUpdate(key, { $set: { ...fields, companyName: w.companyName, status: "submitted", submittedAt: new Date(), submittedByName: w.userName } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    void tellOwner(w.projectId, `${w.companyName} priced ${w.label}`, [fields.unitPrice && `Unit price ${fields.unitPrice}`, fields.total && `total ${fields.total}`, fields.leadTime && `lead time ${fields.leadTime}`].filter(Boolean).join(", ") + ".");
    res.json(offer);
  } catch (err) { next(err); }
});

// ── Their documents on a line or package ─────────────────────────────────────────────────────
router.post("/offers/:kind/:refId/files", loadWork, upload.single("file"), async (req: WorkRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Choose a PDF, picture, Word, Excel or text file (up to 32 MB)." });
    const w = req.vendorWork!;
    const file = { name: req.file.originalname.slice(0, 200), filePath: req.file.path.replace(/\\/g, "/"), fileType: extOf(req.file.originalname), size: humanSize(req.file.size), uploadedByName: w.userName, uploadedAt: new Date() };
    const offer = await VendorOffer.findOneAndUpdate(
      { projectId: w.projectId, kind: w.kind, refId: w.refId, companyId: w.companyId },
      { $push: { attachments: file }, $setOnInsert: { companyName: w.companyName, status: "submitted", submittedAt: new Date(), submittedByName: w.userName } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    void tellOwner(w.projectId, `${w.companyName} sent a document`, `${file.name}, for ${w.label}.`);
    res.status(201).json(offer);
  } catch (err) { unlink(req.file?.path); next(err); }
});
router.delete("/offers/:kind/:refId/files/:fid", loadWork, async (req: WorkRequest, res: Response, next: NextFunction) => {
  try {
    const w = req.vendorWork!;
    const offer = await VendorOffer.findOne({ projectId: w.projectId, kind: w.kind, refId: w.refId, companyId: w.companyId });
    if (!offer) return res.status(404).json({ error: "Not found" });
    if (offer.status === "accepted") return res.status(409).json({ error: "GreenTech has accepted this offer; its documents stay on record." });
    const f = offer.attachments.find((a) => String((a as unknown as { _id: unknown })._id) === req.params.fid);
    if (!f) return res.status(404).json({ error: "Not found" });
    offer.attachments = offer.attachments.filter((a) => a !== f);
    await offer.save();
    unlink(f.filePath);
    res.json(offer);
  } catch (err) { next(err); }
});

// ── Their invoice: a Pending received invoice in the project's Finances ─────────────────────
router.post("/invoices/:kind/:refId", loadWork, upload.single("file"), async (req: WorkRequest, res: Response, next: NextFunction) => {
  try {
    const w = req.vendorWork!;
    if (!req.file) return res.status(400).json({ error: "Attach the invoice (a PDF, picture, Word or Excel file, up to 32 MB)." });
    const amount = amountOf(req.body?.amount);
    if (!(parseFloat(amount) > 0)) { unlink(req.file.path); return res.status(400).json({ error: "Enter the invoice amount." }); }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.date || "")) ? String(req.body.date) : new Date().toISOString().slice(0, 10);
    // A work package's invoice bills its contract, so it also lists under the package's Invoice tab.
    const contract = w.pkg?.agreementId
      ? { contractRef: { source: "agreement", agreementId: w.pkg.agreementId, label: `Work package: ${w.pkg.name}` } }
      : w.pkg?.poId ? { poId: w.pkg.poId } : {};
    const invoice = await Invoice.create({
      projectId: w.projectId, type: "received", number: str(req.body?.number, 60), party: w.companyName, amount, date,
      status: "Pending", receiverKind: "Vendor", companyId: w.companyId,
      description: `${str(req.body?.notes, 500) || `For ${w.label}`} (sent by ${w.companyName} from their profile)`,
      attachments: [{ name: req.file.originalname.slice(0, 200), filePath: req.file.path.replace(/\\/g, "/"), fileType: extOf(req.file.originalname), size: humanSize(req.file.size) }],
      source: "vendor-portal", sourceRef: { kind: w.kind, refId: w.refId },
      addedByName: `${w.userName} (${w.companyName})`, ...contract,
    });
    void tellOwner(w.projectId, `${w.companyName} sent an invoice`, `${invoice.number ? `Invoice ${invoice.number}, ` : ""}${amount}, for ${w.label}. It waits in Finances as Pending.`);
    res.status(201).json(invoice);
  } catch (err) { unlink(req.file?.path); next(err); }
});
/** Withdraw an invoice GreenTech has not acted on yet. */
router.delete("/invoices/:iid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const me = await myCompanyOf(req);
    if (!me) return res.status(403).json({ error: "Only a company login can do this." });
    if (!mongoose.isValidObjectId(req.params.iid)) return res.status(404).json({ error: "Not found" });
    const inv = await Invoice.findOne({ _id: req.params.iid, companyId: me.id, source: "vendor-portal" });
    if (!inv) return res.status(404).json({ error: "Not found" });
    if (inv.status !== "Pending" || (inv.payments || []).length) return res.status(409).json({ error: "GreenTech has already taken this invoice up; ask them to change it." });
    await inv.deleteOne();
    (inv.attachments || []).forEach((a) => unlink(a.filePath));
    res.json({ message: "Withdrawn" });
  } catch (err) { next(err); }
});

export default router;
