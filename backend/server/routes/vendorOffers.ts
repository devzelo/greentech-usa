import { Router, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Project from "../models/Project";
import ProcurementItem from "../models/ProcurementItem";
import WorkPackage from "../models/WorkPackage";
import VendorOffer from "../models/VendorOffer";
import Invoice from "../models/Invoice";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";
import { canSeeFigures, fetchRequesterAccess } from "../lib/access";

/**
 * 2026-10-09 - GreenTech's side of the vendors' offers (routes/vendorPortal.ts is the vendor's):
 * the figures each assigned vendor sent for a BOQ line or a work package, with their documents and
 * the invoices they sent, and Accept (locks the offer) / Reopen (lets them change it again).
 * Staff only, and only someone allowed to see the project's figures.
 */
const router = Router({ mergeParams: true });
router.use(requireAuth, blockGuests);
router.use(async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id }).select("ownerId figuresAccess").lean();
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (req.user!.role !== "admin") {
      const { access } = await fetchRequesterAccess(req);
      if (access.role === "none") return res.status(403).json({ error: "No access to this project." });
    }
    if (!canSeeFigures(project as { ownerId?: unknown; figuresAccess?: Record<string, boolean> | null }, req.user!.userId, req.user!.role)) {
      return res.status(403).json({ error: "The vendors' prices are part of the project's figures." });
    }
    next();
  } catch (err) { next(err); }
});

/** The company each line or package names now: only its offer counts. */
async function assigned(projectId: string): Promise<Map<string, string>> {
  const [items, pkgs] = await Promise.all([
    ProcurementItem.find({ projectId, vendorCompanyId: { $nin: ["", null] } }).select("_id vendorCompanyId").lean(),
    WorkPackage.find({ projectId, "responsible.kind": "company", "responsible.companyId": { $nin: ["", null] } }).select("_id responsible").lean(),
  ]);
  return new Map([
    ...items.map((i) => [`boq:${String(i._id)}`, String(i.vendorCompanyId)] as [string, string]),
    ...pkgs.map((w) => [`package:${String(w._id)}`, String(w.responsible?.companyId || "")] as [string, string]),
  ]);
}

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const kind = req.query.kind === "package" ? "package" : req.query.kind === "boq" ? "boq" : null;
    const who = await assigned(req.params.id);
    const offers = (await VendorOffer.find({ projectId: req.params.id, ...(kind ? { kind } : {}) }).lean())
      .filter((o) => who.get(`${o.kind}:${o.refId}`) === o.companyId);
    const invoices = (await Invoice.find({ projectId: req.params.id, source: "vendor-portal", ...(kind ? { "sourceRef.kind": kind } : {}) })
      .select("number amount date status companyId party sourceRef attachments createdAt").sort({ createdAt: -1 }).lean())
      .filter((i) => who.get(`${i.sourceRef?.kind}:${i.sourceRef?.refId}`) === i.companyId);
    res.json({ offers, invoices });
  } catch (err) { next(err); }
});

async function setStatus(req: AuthedRequest, res: Response, status: "accepted" | "submitted") {
  if (!mongoose.isValidObjectId(req.params.oid)) return res.status(404).json({ error: "Not found" });
  const offer = await VendorOffer.findOne({ _id: req.params.oid, projectId: req.params.id });
  if (!offer) return res.status(404).json({ error: "Not found" });
  offer.status = status;
  offer.acceptedAt = status === "accepted" ? new Date() : null;
  offer.acceptedByName = status === "accepted" ? req.user!.name || "" : "";
  await offer.save();
  return res.json(offer);
}
router.post("/:oid/accept", async (req: AuthedRequest, res: Response, next: NextFunction) => { try { await setStatus(req, res, "accepted"); } catch (err) { next(err); } });
router.post("/:oid/reopen", async (req: AuthedRequest, res: Response, next: NextFunction) => { try { await setStatus(req, res, "submitted"); } catch (err) { next(err); } });

export default router;
