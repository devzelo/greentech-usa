import { Router, Response, NextFunction } from "express";
import mongoose from "mongoose";
import ProjectCategory from "../models/ProjectCategory";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";

// CR 183: the shared list of custom project categories.
const router = Router();
router.use(requireAuth);

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

router.get("/", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try { res.json(await ProjectCategory.find().sort({ name: 1 }).lean()); }
  catch (err) { next(err); }
});

// Adding an existing name (any letter case) returns the existing entry.
router.post("/", blockGuests, async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const name = clean(req.body?.name);
    if (!name) return res.status(400).json({ error: "Enter a category name." });
    const key = name.toLowerCase();
    const found = await ProjectCategory.findOne({ key }).lean();
    if (found) return res.json(found);
    const doc = await ProjectCategory.create({ name, key, createdByName: req.user!.name || "" });
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

// Admins can take a custom category off the list. Projects that use it keep it.
router.delete("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== "admin") return res.status(403).json({ error: "Only an admin can remove a category." });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    await ProjectCategory.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
