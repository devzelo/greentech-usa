import { Router, Response, NextFunction } from "express";
import mongoose from "mongoose";
import MeetingMinute from "../models/MeetingMinute";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";
import { recycleAndDelete } from "../lib/recycleBin";

/**
 * CR 208 / 209: meeting minutes and progress reports written in the platform.
 * Mounted at /api/projects/:id/minutes (kind=meeting|progress).
 */
const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(blockGuests);

const kindOf = (v: unknown) => (String(v) === "progress" ? "progress" : "meeting");
const KEEP = ["title", "date", "time", "location", "period", "attendees", "items", "summary", "mentioned", "status", "archived"] as const;

const body = (req: AuthedRequest) => {
  const src = (req.body || {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of KEEP) if (src[k] !== undefined) out[k] = src[k];
  return out;
};

// GET /  — this project's minutes or reports, newest first. ?archived=1 for the archived ones.
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await MeetingMinute.find({
      projectId: req.params.id,
      kind: kindOf(req.query.kind),
      archived: req.query.archived === "1",
    }).sort({ date: -1, createdAt: -1 }).lean();
    res.json(rows);
  } catch (err) { next(err); }
});

// POST / — start a new one.
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await MeetingMinute.create({
      ...body(req),
      projectId: req.params.id,
      kind: kindOf(req.body?.kind ?? req.query.kind),
      createdById: req.user!.userId,
      createdByName: req.user!.name || "",
      updatedByName: req.user!.name || "",
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

// PUT /:id — save the edits (also used to archive or mark final).
router.put("/:minuteId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!mongoose.isValidObjectId(req.params.minuteId)) return res.status(404).json({ error: "Not found" });
    const doc = await MeetingMinute.findOneAndUpdate(
      { _id: req.params.minuteId, projectId: req.params.id },
      { ...body(req), updatedByName: req.user!.name || "" },
      { new: true },
    );
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (err) { next(err); }
});

// DELETE /:id — to the recycle bin, like every other document.
router.delete("/:minuteId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!mongoose.isValidObjectId(req.params.minuteId)) return res.status(404).json({ error: "Not found" });
    const doc = await MeetingMinute.findOne({ _id: req.params.minuteId, projectId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    await recycleAndDelete(doc, {
      kind: doc.kind === "progress" ? "progress-report" : "meeting-minutes",
      name: doc.title || (doc.kind === "progress" ? "Progress report" : "Meeting minutes"),
      subtitle: [doc.date, doc.location].filter(Boolean).join(" · "),
      projectId: doc.projectId,
      deletedById: req.user?.userId,
      deletedByName: req.user?.name || "",
    });
    res.json({ message: "Deleted." });
  } catch (err) { next(err); }
});

export default router;
