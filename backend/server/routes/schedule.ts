import { Router, Response, NextFunction } from "express";
import Project, { type MilestoneRecord } from "../models/Project";
import ScheduleRevision from "../models/ScheduleRevision";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";

// CR 188-192: the project timeline (Project Management > Timeline / Milestones). Save makes the
// edits live and keeps a numbered version; Save as draft parks them without changing the live
// timeline. Gated by the "pm" tab permission like the task board.
const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["pm"]));

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: unknown) => (typeof v === "string" && ISO.test(v) ? v : "");
const UNITS = new Set(["days", "weeks", "months"]);
const STATUSES = new Set(["not_started", "in_progress", "completed", "on_hold", "delayed", "cancelled"]);
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

function cleanMilestones(input: unknown): MilestoneRecord[] {
  if (!Array.isArray(input)) return [];
  // CR 240 - real schedules run to hundreds of tasks.
  return input.slice(0, 2000).map((raw) => {
    const m = (raw || {}) as Record<string, unknown>;
    const unit = UNITS.has(String(m.durationUnit)) ? String(m.durationUnit) : "days";
    return {
      id: str(m.id, 40) || `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      key: str(m.key, 60),
      name: str(m.name, 160).trim() || "Untitled phase",
      description: str(m.description, 2000),
      plannedStart: date(m.plannedStart),
      plannedEnd: date(m.plannedEnd),
      baselineStart: date(m.baselineStart),
      baselineEnd: date(m.baselineEnd),
      actualStart: date(m.actualStart),
      actualEnd: date(m.actualEnd),
      durationValue: Math.max(0, Number(m.durationValue) || 0),
      durationUnit: unit as MilestoneRecord["durationUnit"],
      status: STATUSES.has(String(m.status)) ? String(m.status) : "not_started",
      percent: Math.max(0, Math.min(100, Math.round(Number(m.percent) || 0))),
      responsible: Array.isArray(m.responsible) ? m.responsible.map((r) => str(r, 120).trim()).filter(Boolean).slice(0, 30) : [],
      notes: str(m.notes, 4000),
      category: str(m.category, 80).trim(),
      duration: 0, unit: "days" as const, doneAt: "", doneBy: "",
    };
  }).map((m) => ({
    ...m,
    // The first planned dates become the baseline and are kept from then on.
    baselineStart: m.baselineStart || m.plannedStart,
    baselineEnd: m.baselineEnd || m.plannedEnd,
  }));
}

/** Overall % complete, weighted by each phase's planned length (a zero-length milestone counts as one day). */
function overallProgress(ms: MilestoneRecord[]): number {
  if (!ms.length) return 0;
  let w = 0, done = 0;
  for (const m of ms) {
    const s = Date.parse(m.plannedStart), e = Date.parse(m.plannedEnd);
    const days = isFinite(s) && isFinite(e) ? Math.max(1, Math.round((e - s) / 86400000) + 1) : 1;
    const pct = m.status === "completed" ? 100 : m.percent;
    w += days; done += days * pct;
  }
  return Math.round(done / w);
}

router.get("/revisions", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(await ScheduleRevision.find({ projectId: req.params.id }).sort({ version: -1 }).limit(100).lean());
  } catch (err) { next(err); }
});

router.post("/save", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id });
    if (!project) return res.status(404).json({ error: "Project not found" });
    const milestones = cleanMilestones(req.body?.milestones);
    const progress = overallProgress(milestones);
    project.schedule = { ...(project.schedule || { extensions: [] }), milestones, draft: null } as typeof project.schedule;
    project.markModified("schedule");
    if (milestones.length) project.progress = progress;
    await project.save();
    const last = await ScheduleRevision.findOne({ projectId: req.params.id }).sort({ version: -1 }).select("version").lean();
    const rev = await ScheduleRevision.create({
      projectId: req.params.id,
      version: (last?.version || 0) + 1,
      milestones,
      progress,
      note: str(req.body?.note, 500).trim(),
      savedBy: req.user!.name || "",
    });
    res.json({ schedule: project.schedule, progress: project.progress, revision: rev });
  } catch (err) { next(err); }
});

// CR 235 - save one row: that task's edits go live at once, without filing a revision. The Save for
// the whole timeline files the revision later, listing everything changed since the last one.
router.put("/milestones/:mid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id });
    if (!project) return res.status(404).json({ error: "Project not found" });
    const [row] = cleanMilestones([{ ...(req.body?.milestone || {}), id: req.params.mid }]);
    if (!row) return res.status(400).json({ error: "Nothing to save." });
    const current = (project.schedule?.milestones || []) as MilestoneRecord[];
    const at = current.findIndex((m) => m.id === row.id);
    // Keep the row's first planned dates as its baseline, as a full save does.
    const prev = at >= 0 ? current[at] : null;
    const saved = { ...row, baselineStart: prev?.baselineStart || row.baselineStart, baselineEnd: prev?.baselineEnd || row.baselineEnd };
    const milestones = at >= 0 ? current.map((m, i) => (i === at ? saved : m)) : [...current, saved];
    project.schedule = { ...(project.schedule || { extensions: [] }), milestones } as typeof project.schedule;
    project.markModified("schedule");
    if (milestones.length) project.progress = overallProgress(milestones);
    await project.save();
    res.json({ schedule: project.schedule, progress: project.progress, milestone: saved });
  } catch (err) { next(err); }
});

router.put("/draft", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id });
    if (!project) return res.status(404).json({ error: "Project not found" });
    const draft = { milestones: cleanMilestones(req.body?.milestones), savedAt: new Date().toISOString(), savedBy: req.user!.name || "" };
    project.schedule = { ...(project.schedule || { milestones: [], extensions: [] }), draft } as typeof project.schedule;
    project.markModified("schedule");
    await project.save();
    res.json({ schedule: project.schedule, progress: project.progress });
  } catch (err) { next(err); }
});

router.delete("/draft", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id });
    if (!project) return res.status(404).json({ error: "Project not found" });
    project.schedule = { ...(project.schedule || { milestones: [], extensions: [] }), draft: null } as typeof project.schedule;
    project.markModified("schedule");
    await project.save();
    res.json({ schedule: project.schedule, progress: project.progress });
  } catch (err) { next(err); }
});

export default router;
