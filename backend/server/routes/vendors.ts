import { Router, Response, NextFunction } from "express";
import Vendor from "../models/Vendor";
import Company from "../models/Company";
import { recycleAndDelete } from "../lib/recycleBin";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { procTabGuard } from "../lib/access";

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(procTabGuard(["proc-rfqs"]));

// Writes gated by tabAccessGuard (requires "edit"); a guest granted RFQ-edit may write.
const block = (_req: AuthedRequest, _res: Response) => false;
const FIELDS = ["name", "country", "city", "contactName", "email", "phone", "companyId"] as const;

// Vendors are a SHARED, company-wide supplier list — created once, usable on every project.
// So we return all vendors regardless of which project asked (the projectId on each doc just
// records where it was first added).
router.get("/", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try { res.json(await Vendor.find({}).sort({ name: 1, createdAt: 1 })); } catch (err) { next(err); }
});
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const body: Record<string, unknown> = { projectId: req.params.id };
    for (const f of FIELDS) body[f] = req.body?.[f] || "";

    // CR-PR-08 — vendors picked from the Directory are deduped on companyId, so choosing the
    // same company again reuses its vendor row (and its quote history) instead of making a twin.
    // The vendor list is shared company-wide, so this lookup is intentionally global.
    const companyId = String(body.companyId || "").trim();
    if (companyId) {
      const existing = await Vendor.findOne({ companyId });
      if (existing) return res.status(200).json(existing);
    }

    const vendor = await Vendor.create(body);
    // CR-P-06a — adding a vendor auto-creates its Company Directory profile (deduped by name),
    // so the same company is never entered twice. Best-effort: never block vendor creation.
    try {
      const name = String(body.name || "").trim();
      // Skip when the vendor came from the Directory — it already has its profile.
      if (name && !companyId) {
        const exists = await Company.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).select("_id").lean();
        // CR-PR-08 — record the link by id either way, so the profile page can find this
        // vendor's quotes without matching on the name string.
        if (exists) {
          await Vendor.findByIdAndUpdate(vendor._id, { companyId: String(exists._id) });
          vendor.companyId = String(exists._id);
        } else {
          const created = await Company.create({
            name,
            category: "vendor",
            email: String(body.email || ""),
            phone: String(body.phone || ""),
            address: [body.city, body.country].filter(Boolean).join(", "),
            contactPersons: body.contactName ? [{ name: String(body.contactName), role: "", email: String(body.email || ""), phone: String(body.phone || "") }] : [],
          });
          await Vendor.findByIdAndUpdate(vendor._id, { companyId: String(created._id) });
          vendor.companyId = String(created._id);
        }
      }
    } catch { /* directory profile is best-effort */ }
    res.status(201).json(vendor);
  } catch (err) { next(err); }
});
router.patch("/:vid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) if (f in (req.body || {})) patch[f] = req.body[f];
    // Shared list → edit by id regardless of which project it was created under.
    const v = await Vendor.findByIdAndUpdate(req.params.vid, patch, { new: true });
    if (!v) return res.status(404).json({ error: "Not found" });
    res.json(v);
  } catch (err) { next(err); }
});
router.delete("/:vid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (block(req, res)) return;
    // Shared list → delete by id (removes the vendor for every project).
    const v = await Vendor.findById(req.params.vid);
    if (v) await recycleAndDelete(v, {
      kind: "vendor",
      name: v.name,
      subtitle: "Vendor",
      projectId: String(v.projectId),
      deletedById: req.user?.userId,
      deletedByName: req.user?.name || "",
    });
    res.json({ message: "Vendor deleted" });
  } catch (err) { next(err); }
});

export default router;
