import { Router, Response, NextFunction } from "express";
import ResourceBlock from "../models/ResourceBlock";
import User from "../models/User";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";

// Company-wide reusable proposal content library. Subcontractors excluded.
const router = Router();
router.use(requireAuth);
router.use(blockGuests);

// GET /api/resource-blocks?q=&category=
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { q, category } = req.query as { q?: string; category?: string };
    const filter: Record<string, unknown> = {};
    if (category && category !== "All") filter.category = category;
    if (q && q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ title: rx }, { category: rx }];
    }
    const blocks = await ResourceBlock.find(filter).sort({ category: 1, title: 1 }).lean();
    res.json(blocks);
  } catch (err) { next(err); }
});

// POST /api/resource-blocks
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { title, category, body } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required." });
    const me = await User.findById(req.user!.userId).select("name").lean();
    const block = await ResourceBlock.create({
      title: String(title).trim(),
      category: category || "Other",
      body: body || "",
      createdById: req.user!.userId,
      createdByName: (me as { name?: string } | null)?.name || "",
    });
    res.status(201).json(block);
  } catch (err) { next(err); }
});

// PUT /api/resource-blocks/:id
router.put("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { title, category, body } = req.body || {};
    const updates: Record<string, unknown> = {};
    if (typeof title === "string" && title.trim()) updates.title = title.trim();
    if (typeof category === "string") updates.category = category;
    if (typeof body === "string") updates.body = body;
    const block = await ResourceBlock.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!block) return res.status(404).json({ error: "Resource not found." });
    res.json(block);
  } catch (err) { next(err); }
});

// DELETE /api/resource-blocks/:id — creator or admin
router.delete("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const block = await ResourceBlock.findById(req.params.id);
    if (!block) return res.status(404).json({ error: "Resource not found." });
    if (req.user!.role !== "admin" && String(block.createdById) !== req.user!.userId)
      return res.status(403).json({ error: "Only the creator or an admin can delete this resource." });
    await block.deleteOne();
    res.json({ message: "Resource deleted." });
  } catch (err) { next(err); }
});

export default router;
