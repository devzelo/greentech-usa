import { Router, Response, NextFunction } from "express";
import ProposalTemplate from "../models/ProposalTemplate";
import AppSetting from "../models/AppSetting";
import User from "../models/User";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";
import { recycleAndDelete } from "../lib/recycleBin";

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

// 2026-10-07 - the standard appendices list, editable and company-wide: what "Add standard
// appendices" puts in a technical / financial proposal, in order. An item is an Appendix Library
// entry (key) or an appendix of our own (title only). Null until someone edits it (the app's
// default list applies).
const STD_KEY = "standard-appendices";
type StdItem = { key?: string; title: string };
const cleanList = (v: unknown): StdItem[] | null => {
  if (!Array.isArray(v) || v.length > 60) return null;
  const out: StdItem[] = [];
  for (const raw of v) {
    const r = (raw || {}) as { key?: unknown; title?: unknown };
    const title = typeof r.title === "string" ? r.title.trim().slice(0, 200) : "";
    const key = typeof r.key === "string" ? r.key.trim().slice(0, 80) : "";
    if (!title) return null;
    out.push(key ? { key, title } : { title });
  }
  return out;
};
const stdView = (doc: { value?: Record<string, unknown>; updatedByName?: string; updatedAt?: Date } | null) =>
  doc ? { ...(doc.value || {}), updatedByName: doc.updatedByName || "", updatedAt: doc.updatedAt } : null;

router.get("/standard-appendices", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(stdView(await AppSetting.findOne({ key: STD_KEY }).lean()));
  } catch (err) { next(err); }
});

router.put("/standard-appendices", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const technical = cleanList(req.body?.technical);
    const financial = cleanList(req.body?.financial);
    if (!technical || !financial) return res.status(400).json({ error: "Send both lists, each item with a title (60 at most)." });
    const me = await User.findById(req.user!.userId).select("name").lean();
    const doc = await AppSetting.findOneAndUpdate(
      { key: STD_KEY },
      { value: { technical, financial }, updatedByName: (me as { name?: string } | null)?.name || "" },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    res.json(stdView(doc));
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
    await recycleAndDelete(tpl, {
      kind: "proposal-template",
      name: tpl.name || "Template",
      subtitle: "Proposal template",
      projectId: "",
      deletedById: req.user?.userId,
      deletedByName: req.user?.name || "",
    });
    res.json({ message: "Template deleted." });
  } catch (err) { next(err); }
});

export default router;
