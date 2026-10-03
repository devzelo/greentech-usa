import { Router, Response, NextFunction } from "express";
import mongoose from "mongoose";
import LibraryItem from "../models/LibraryItem";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";

// CR 337 - the company's item library for RFQs. GreenTech staff only (an outside login never sees it).
const router = Router();
router.use(requireAuth);
router.use(blockGuests);
router.use((req: AuthedRequest, res: Response, next: NextFunction) => (req.user!.role === "subcontractor" ? res.status(403).json({ error: "Not available." }) : next()));

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const clean = (b: Record<string, unknown>) => ({
  description: str(b.description, 300), spec: str(b.spec, 2000), unit: str(b.unit, 30), category: str(b.category, 80), vendorNote: str(b.vendorNote, 1000),
});

// GET /api/item-library?q=&category=
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { q, category } = req.query as { q?: string; category?: string };
    const filter: Record<string, unknown> = {};
    if (category) filter.category = category;
    if (q && q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ description: rx }, { spec: rx }, { category: rx }];
    }
    res.json(await LibraryItem.find(filter).sort({ usedCount: -1, description: 1 }).limit(500).lean());
  } catch (err) { next(err); }
});

// POST /api/item-library - one item, or { items: [...] }. The same description and spec is kept once.
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const list = (Array.isArray(req.body?.items) ? req.body.items : [req.body || {}]).slice(0, 200).map(clean).filter((x: { description: string }) => x.description);
    if (!list.length) return res.status(400).json({ error: "Describe the item." });
    const out = [];
    for (const it of list) {
      const found = await LibraryItem.findOne({ description: it.description, spec: it.spec });
      if (found) { Object.assign(found, { unit: it.unit || found.unit, category: it.category || found.category, vendorNote: it.vendorNote || found.vendorNote }); await found.save(); out.push(found); continue; }
      out.push(await LibraryItem.create({ ...it, createdById: req.user!.userId, createdByName: req.user!.name || "" }));
    }
    res.status(201).json(out);
  } catch (err) { next(err); }
});

// POST /api/item-library/used { ids } - counts each use, so the most used come first.
router.post("/used", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter((x: unknown) => mongoose.isValidObjectId(x)).slice(0, 200);
    if (ids.length) await LibraryItem.updateMany({ _id: { $in: ids } }, { $inc: { usedCount: 1 } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.patch("/:lid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!mongoose.isValidObjectId(req.params.lid)) return res.status(404).json({ error: "Not found" });
    const patch = clean({ ...(await LibraryItem.findById(req.params.lid).lean() || {}), ...(req.body || {}) } as Record<string, unknown>);
    if (!patch.description) return res.status(400).json({ error: "Describe the item." });
    const item = await LibraryItem.findByIdAndUpdate(req.params.lid, patch, { new: true });
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (err) { next(err); }
});

router.delete("/:lid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!mongoose.isValidObjectId(req.params.lid)) return res.status(404).json({ error: "Not found" });
    await LibraryItem.findByIdAndDelete(req.params.lid);
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

export default router;
