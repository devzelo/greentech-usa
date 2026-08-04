import { Router, Response, NextFunction } from "express";
import PurchaseOrder from "../models/PurchaseOrder";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["po"]));

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const pos = await PurchaseOrder.find({ projectId: req.params.id }).sort({ createdAt: 1 });
    res.json(pos);
  } catch (err) { next(err); }
});

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const po = await PurchaseOrder.create({ ...req.body, projectId: req.params.id });
    res.status(201).json(po);
  } catch (err) { next(err); }
});

router.patch("/:pid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await PurchaseOrder.findOneAndUpdate(
      { _id: req.params.pid, projectId: req.params.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/:pid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await PurchaseOrder.findOneAndDelete({ _id: req.params.pid, projectId: req.params.id });
    res.json({ message: "Purchase order deleted" });
  } catch (err) { next(err); }
});

export default router;
