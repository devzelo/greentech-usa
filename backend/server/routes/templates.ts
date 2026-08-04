import { Router, Response, NextFunction } from "express";
import Template from "../models/Template";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);
router.use((req, res, next) => (req.method === "GET" ? next() : blockGuests(req, res, next)));

// GET /api/templates — list all templates (any employee can use)
router.get("/", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const templates = await Template.find().sort({ createdAt: -1 });
    res.json(templates);
  } catch (err) {
    next(err);
  }
});

// POST /api/templates
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description, tabs } = req.body;
    if (!name || !Array.isArray(tabs) || tabs.length === 0) {
      return res.status(400).json({ error: "Name and at least one tab are required." });
    }
    const created = await Template.create({
      name,
      description: description || "",
      tabs,
      createdBy: req.user!.userId,
      createdByName: req.user!.name,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// PUT /api/templates/:id — only the creator can edit
router.put("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const tpl = await Template.findById(req.params.id);
    if (!tpl) return res.status(404).json({ error: "Template not found." });
    if (String(tpl.createdBy) !== req.user!.userId) {
      return res.status(403).json({ error: "Only the template's creator can edit it." });
    }
    const { name, description, tabs } = req.body;
    if (name !== undefined) {
      if (!name) return res.status(400).json({ error: "Name is required." });
      tpl.name = name;
    }
    if (description !== undefined) tpl.description = description;
    if (tabs !== undefined) {
      if (!Array.isArray(tabs) || tabs.length === 0) {
        return res.status(400).json({ error: "At least one tab is required." });
      }
      tpl.tabs = tabs;
    }
    await tpl.save();
    res.json(tpl);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/templates/:id — only the creator can delete
router.delete("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const tpl = await Template.findById(req.params.id);
    if (!tpl) return res.status(404).json({ error: "Template not found." });
    if (String(tpl.createdBy) !== req.user!.userId) {
      return res.status(403).json({ error: "Only the template's creator can delete it." });
    }
    await Template.deleteOne({ _id: tpl._id });
    res.json({ message: "Template deleted." });
  } catch (err) {
    next(err);
  }
});

export default router;
