import { Router, Response, NextFunction } from "express";
import ProposalTemplate from "../models/ProposalTemplate";
import User from "../models/User";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";

// Reusable proposal templates (company-wide). Subcontractors are excluded.
const router = Router();
router.use(requireAuth);
router.use(blockGuests);

// GET /api/proposal-templates — built-ins first, then user templates by name.
router.get("/", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const templates = await ProposalTemplate.find().sort({ builtin: -1, name: 1 }).lean();
    res.json(templates);
  } catch (err) { next(err); }
});

// POST /api/proposal-templates — save the current proposal as a template.
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description, content } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: "Template name is required." });
    const me = await User.findById(req.user!.userId).select("name").lean();
    const tpl = await ProposalTemplate.create({
      name: String(name).trim(),
      description: description || "",
      builtin: false,
      createdById: req.user!.userId,
      createdByName: (me as { name?: string } | null)?.name || "",
      content: content || {},
    });
    res.status(201).json(tpl);
  } catch (err) { next(err); }
});

// PUT /api/proposal-templates/:id — rename / update a non-built-in template.
router.put("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const tpl = await ProposalTemplate.findById(req.params.id);
    if (!tpl) return res.status(404).json({ error: "Template not found." });
    if (tpl.builtin) return res.status(400).json({ error: "Built-in templates cannot be modified." });
    const { name, description, content } = req.body || {};
    if (typeof name === "string" && name.trim()) tpl.name = name.trim();
    if (typeof description === "string") tpl.description = description;
    if (content && typeof content === "object") tpl.content = content;
    await tpl.save();
    res.json(tpl);
  } catch (err) { next(err); }
});

// DELETE /api/proposal-templates/:id — creator or admin; never a built-in.
router.delete("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const tpl = await ProposalTemplate.findById(req.params.id);
    if (!tpl) return res.status(404).json({ error: "Template not found." });
    if (tpl.builtin) return res.status(400).json({ error: "Built-in templates cannot be deleted." });
    const isAdmin = req.user!.role === "admin";
    if (!isAdmin && String(tpl.createdById) !== req.user!.userId)
      return res.status(403).json({ error: "Only the creator or an admin can delete this template." });
    await tpl.deleteOne();
    res.json({ message: "Template deleted." });
  } catch (err) { next(err); }
});

export default router;
