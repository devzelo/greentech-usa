import { Router, Response, NextFunction } from "express";
import CompanyBank from "../models/CompanyBank";
import { requireAuth, AuthedRequest } from "../middleware/auth";

// CR-P (162) — GreenTech's own bank accounts for invoices. Staff only (admin / employee).
const router = Router();
router.use(requireAuth);
router.use((req: AuthedRequest, res: Response, next: NextFunction) => {
  if (req.user!.role === "subcontractor") return res.status(403).json({ error: "Not allowed." });
  next();
});

const FIELDS = ["label", "name", "accountName", "accountNumber", "iban", "swift", "routing"] as const;
const clean = (b: Record<string, unknown>) => {
  const out: Record<string, string> = {};
  for (const f of FIELDS) if (typeof b[f] === "string") out[f] = (b[f] as string).trim().slice(0, 120);
  return out;
};

router.get("/", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try { res.json(await CompanyBank.find().sort({ isDefault: -1, createdAt: 1 }).lean()); } catch (err) { next(err); }
});

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = clean(req.body || {});
    if (!data.name && !data.accountNumber && !data.iban) return res.status(400).json({ error: "Enter the bank name and the account." });
    // The first account, or one marked default, becomes the default.
    const isDefault = !!req.body?.isDefault || (await CompanyBank.countDocuments()) === 0;
    if (isDefault) await CompanyBank.updateMany({}, { isDefault: false });
    res.status(201).json(await CompanyBank.create({ ...data, isDefault }));
  } catch (err) { next(err); }
});

router.patch("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await CompanyBank.findById(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    Object.assign(row, clean(req.body || {}));
    if (req.body?.isDefault === true) { await CompanyBank.updateMany({ _id: { $ne: row._id } }, { isDefault: false }); row.isDefault = true; }
    await row.save();
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await CompanyBank.findByIdAndDelete(req.params.id);
    // Keep one default while any account is left.
    if (row?.isDefault) { const first = await CompanyBank.findOne().sort({ createdAt: 1 }); if (first) { first.isDefault = true; await first.save(); } }
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

export default router;
