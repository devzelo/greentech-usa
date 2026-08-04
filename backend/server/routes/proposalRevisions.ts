import { Router, Response, NextFunction } from "express";
import ProposalRevision from "../models/ProposalRevision";
import User from "../models/User";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";

// Version history for a project's proposal. GET needs view access; writes need edit.
const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["proposals"]));

// GET /api/projects/:id/proposal-revisions — newest first (includes content for restore).
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const revs = await ProposalRevision.find({ projectId: req.params.id }).sort({ createdAt: -1 }).lean();
    res.json(revs);
  } catch (err) { next(err); }
});

// POST /api/projects/:id/proposal-revisions — snapshot current content.
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { label, note, content, archived } = req.body || {};
    const me = await User.findById(req.user!.userId).select("name").lean();
    const rev = await ProposalRevision.create({
      projectId: req.params.id,
      label: label || "",
      note: note || "",
      archived: !!archived,
      content: content || {},
      createdById: req.user!.userId,
      createdByName: (me as { name?: string } | null)?.name || "",
    });
    res.status(201).json(rev);
  } catch (err) { next(err); }
});

// DELETE /api/projects/:id/proposal-revisions/:rid — archived revisions are protected.
router.delete("/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const rev = await ProposalRevision.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!rev) return res.status(404).json({ error: "Revision not found." });
    if (rev.archived) return res.status(400).json({ error: "Archived (submitted) versions cannot be deleted." });
    await rev.deleteOne();
    res.json({ message: "Revision deleted." });
  } catch (err) { next(err); }
});

export default router;
