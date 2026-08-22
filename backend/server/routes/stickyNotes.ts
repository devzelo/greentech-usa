import { Router, Response, NextFunction } from "express";
import mongoose from "mongoose";
import StickyNote from "../models/StickyNote";
import { requireAuth, AuthedRequest } from "../middleware/auth";

// CR-P-63 — personal sticky notes (per user), auto-saved and kept until deleted.
const router = Router();
router.use(requireAuth);
router.param("id", (req, res, next, value) => {
  if (!mongoose.isValidObjectId(String(value))) return res.status(404).json({ error: "Not found" });
  next();
});

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try { res.json(await StickyNote.find({ userId: req.user!.userId }).sort({ updatedAt: -1 })); }
  catch (err) { next(err); }
});
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const r = await StickyNote.create({
      userId: req.user!.userId,
      text: String(req.body?.text ?? "").slice(0, 5000),
      color: String(req.body?.color ?? "yellow").slice(0, 20),
    });
    res.status(201).json(r);
  } catch (err) { next(err); }
});
router.patch("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const r = await StickyNote.findOne({ _id: req.params.id, userId: req.user!.userId });
    if (!r) return res.status(404).json({ error: "Not found" });
    if (typeof req.body?.text === "string") r.text = req.body.text.slice(0, 5000);
    if (typeof req.body?.color === "string") r.color = req.body.color.slice(0, 20);
    await r.save();
    res.json(r);
  } catch (err) { next(err); }
});
router.delete("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await StickyNote.findOneAndDelete({ _id: req.params.id, userId: req.user!.userId });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
