import { Router, Response, NextFunction } from "express";
import Vendor from "../models/Vendor";
import Company from "../models/Company";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { procTabGuard } from "../lib/access";

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(procTabGuard(["proc-rfqs"]));

// Writes gated by tabAccessGuard (requires "edit"); a guest granted RFQ-edit may write.
const block = (_req: AuthedRequest, _res: Response) => false;
const FIELDS = ["name", "country", "city", "contactName", "email", "phone"] as const;

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
    const vendor = await Vendor.create(body);
    // CR-P-06a — adding a vendor auto-creates its Company Directory profile (deduped by name),
    // so the same company is never entered twice. Best-effort: never block vendor creation.
    try {
      const name = String(body.name || "").trim();
      if (name) {
        const exists = await Company.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).select("_id").lean();
        if (!exists) {
          await Company.create({
            name,
            category: "vendor",
            email: String(body.email || ""),
            phone: String(body.phone || ""),
            address: [body.city, body.country].filter(Boolean).join(", "),
            contactPersons: body.contactName ? [{ name: String(body.contactName), role: "", email: String(body.email || ""), phone: String(body.phone || "") }] : [],
          });
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
    await Vendor.findByIdAndDelete(req.params.vid);
    res.json({ message: "Vendor deleted" });
  } catch (err) { next(err); }
});

export default router;
