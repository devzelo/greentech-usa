import { Router, Response, NextFunction } from "express";
import Company from "../models/Company";
import { requireAuth, AuthedRequest } from "../middleware/auth";

// Companies / Contact Directory (client CR-P-06). Top-level, project-independent master list.
const router = Router();
router.use(requireAuth);

const FIELDS = ["name", "category", "logoUrl", "address", "phone", "email", "website", "contactPersons", "banking", "tax", "notes", "archived"] as const;

// List — optional ?category= filter and ?archived=true (default hides archived).
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.category) filter.category = String(req.query.category);
    filter.archived = req.query.archived === "true" ? true : { $ne: true };
    res.json(await Company.find(filter).sort({ name: 1 }).lean());
  } catch (err) { next(err); }
});

router.get("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const c = await Company.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ error: "Company not found." });
    res.json(c);
  } catch (err) { next(err); }
});

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const body: Record<string, unknown> = { createdByName: req.user?.name || "" };
    for (const f of FIELDS) if (f in (req.body || {})) body[f] = req.body[f];
    if (!String(body.name || "").trim()) return res.status(400).json({ error: "Company name is required." });
    res.status(201).json(await Company.create(body));
  } catch (err) { next(err); }
});

router.patch("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) if (f in (req.body || {})) patch[f] = req.body[f];
    const c = await Company.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true });
    if (!c) return res.status(404).json({ error: "Company not found." });
    res.json(c);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try { await Company.findByIdAndDelete(req.params.id); res.json({ message: "Deleted" }); }
  catch (err) { next(err); }
});

export default router;
