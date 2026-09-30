import { Router, Response, NextFunction } from "express";
import Project, { type MilestoneRecord } from "../models/Project";
import mongoose from "mongoose";
import ScheduleRevision, { scheduleEntryName, type ScheduleEntryFile } from "../models/ScheduleRevision";
import ProjectDocument from "../models/ProjectDocument";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";
import { recycleAndDelete } from "../lib/recycleBin";

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

/**
 * `known` lists the other tasks in the schedule: a single task saved on its own is checked against
 * them, so its links to the rest of the schedule survive (CR 300 - they were being dropped, since
 * the one row was all the check could see).
 */
function cleanMilestones(input: unknown, known: string[] = []): MilestoneRecord[] {
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
      // CR 294 - the chain: what this task follows, how, and by how much.
      dependsOn: str(m.dependsOn, 40),
      linkType: (["SS", "FF", "SF"].includes(String(m.linkType)) ? String(m.linkType) : "FS") as MilestoneRecord["linkType"],
      lagDays: Math.max(-3650, Math.min(3650, Math.round(Number(m.lagDays) || 0))),
      isMilestone: m.isMilestone === true,
      // CR 300 - the links, each checked; the older single link is read into the list.
      predecessors: (() => {
        const list = Array.isArray(m.predecessors) ? (m.predecessors as Array<Record<string, unknown>>) : [];
        const out = list.slice(0, 50).map((p) => ({
          id: str(p?.id, 40),
          type: (["SS", "FF", "SF"].includes(String(p?.type)) ? String(p?.type) : "FS") as "FS" | "SS" | "FF" | "SF",
          lag: Math.max(-3650, Math.min(3650, Math.round(Number(p?.lag) || 0))),
        })).filter((p) => p.id);
        if (!out.length && m.dependsOn) {
          out.push({ id: str(m.dependsOn, 40), type: (["SS", "FF", "SF"].includes(String(m.linkType)) ? String(m.linkType) : "FS") as "FS" | "SS" | "FF" | "SF", lag: Math.round(Number(m.lagDays) || 0) });
        }
        return out;
      })(),
      duration: 0, unit: "days" as const, doneAt: "", doneBy: "",
    };
  }).map((m, _i, all) => {
    const exists = (tid: string) => known.includes(tid) || all.some((x) => x.id === tid);
    return {
    ...m,
    // The first planned dates become the baseline and are kept from then on.
    baselineStart: m.baselineStart || m.plannedStart,
    baselineEnd: m.baselineEnd || m.plannedEnd,
    // A link only counts if the task it names is really in this schedule, and nothing follows
    // itself: a dangling or self-referential link would have the chain chasing its own tail.
    dependsOn: m.dependsOn && m.dependsOn !== m.id && exists(m.dependsOn) ? m.dependsOn : "",
    predecessors: m.predecessors.filter((p, k, arr) => p.id !== m.id && exists(p.id) && arr.findIndex((q) => q.id === p.id) === k),
    };
  });
}

function cleanCategories(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const c of input.slice(0, 100)) {
    const v = str(c, 80).trim();
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
}

type Draft = { milestones: MilestoneRecord[]; categories?: string[]; savedAt: string; savedBy: string } | null;
type Plain = {
  milestones?: MilestoneRecord[]; draft?: Draft; extensions?: unknown[]; categories?: string[];
  subs?: Array<{ id: string; name: string; categories: string[]; milestones: MilestoneRecord[]; draft: Draft; own: boolean; filed?: boolean }>;
};
// 2026-09-21 - every call names its schedule (?sched=<id>); none means the master. The master's
// save also moves the project's progress; a separate schedule never does.
const schedId = (req: AuthedRequest) => str(req.query.sched, 40).trim();
function scheduleOf(project: InstanceType<typeof Project>, id: string) {
  const s = ((project.toObject() as { schedule?: Plain }).schedule || {}) as Plain;
  const subs = s.subs || [];
  const at = id ? subs.findIndex((x) => x.id === id) : -1;
  if (id && at < 0) return null;
  const cur = id ? subs[at] : { milestones: s.milestones || [], draft: s.draft || null, categories: s.categories || [] };
  return {
    milestones: (cur.milestones || []) as MilestoneRecord[],
    draft: (cur.draft || null) as Draft,
    categories: cur.categories || [],
    apply(patch: { milestones?: MilestoneRecord[]; draft?: Draft; categories?: string[] }) {
      const next: Plain = id
        ? { ...s, subs: subs.map((x, k) => (k === at ? { ...x, ...patch } : x)) }
        : { ...s, ...patch };
      project.schedule = next as unknown as typeof project.schedule;
      project.markModified("schedule");
    },
  };
}
const noSchedule = { error: "That schedule no longer exists." };

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
    const id = schedId(req);
    if (id) {
      return res.json(await ScheduleRevision.find({ projectId: req.params.id, scheduleId: id }).sort({ createdAt: -1 }).limit(300).lean());
    }
    /**
     * CR 314 (2026-09-28): a project has one schedule. The separate schedules that were made beside
     * the master are no longer offered; each one holding tasks is filed here once, as a record of
     * its own, and the revisions it had saved are listed with the rest, named after it. Nothing is
     * deleted: the schedules stay on the project, marked as filed.
     */
    const project = await Project.findOne({ projectId: req.params.id });
    const s = ((project?.toObject() as { schedule?: Plain } | undefined)?.schedule || {}) as Plain;
    const subs = s.subs || [];
    if (project && subs.some((x) => !x.filed && (x.milestones || []).length)) {
      for (const x of subs) {
        if (x.filed || !(x.milestones || []).length) continue;
        await ScheduleRevision.create({
          projectId: req.params.id,
          scheduleId: x.id,
          version: 0,
          kind: "submittal",
          title: `${x.name} (separate schedule)`,
          description: "Filed from the separate schedules when the project moved to one schedule.",
          milestones: x.milestones,
          categories: x.categories || [],
          progress: overallProgress(x.milestones),
          savedBy: "",
          dataDate: new Date().toISOString().slice(0, 10),
        });
      }
      project.schedule = { ...s, subs: subs.map((x) => ({ ...x, filed: true })) } as unknown as typeof project.schedule;
      project.markModified("schedule");
      await project.save();
    }
    // The whole register: revisions, baselines, submittals and uploaded schedules, newest first.
    const nameOf = new Map(subs.map((x) => [x.id, x.name]));
    const all = await ScheduleRevision.find({ projectId: req.params.id }).sort({ createdAt: -1 }).limit(400).lean();
    res.json(all.map((e) => (e.scheduleId ? { ...e, scheduleName: nameOf.get(e.scheduleId) || "Separate schedule" } : e)));
  } catch (err) { next(err); }
});

router.post("/save", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id });
    if (!project) return res.status(404).json({ error: "Project not found" });
    const id = schedId(req);
    const target = scheduleOf(project, id);
    if (!target) return res.status(404).json(noSchedule);
    const milestones = cleanMilestones(req.body?.milestones);
    const categories = req.body?.categories !== undefined ? cleanCategories(req.body.categories) : target.categories;
    const progress = overallProgress(milestones);
    target.apply({ milestones, categories, draft: null });
    if (!id && milestones.length) project.progress = progress;
    await project.save();
    const last = await ScheduleRevision.findOne({ projectId: req.params.id, scheduleId: id || { $in: ["", null] }, kind: { $in: ["revision", null] } }).sort({ version: -1 }).select("version").lean();
    const rev = await ScheduleRevision.create({
      projectId: req.params.id,
      scheduleId: id,
      version: (last?.version || 0) + 1,
      milestones,
      categories,
      progress,
      note: str(req.body?.note, 500).trim(),
      savedBy: req.user!.name || "",
      kind: "revision",
      title: `Revision ${(last?.version || 0) + 1}`,
      dataDate: new Date().toISOString().slice(0, 10),
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
    const id = schedId(req);
    const target = scheduleOf(project, id);
    if (!target) return res.status(404).json(noSchedule);
    const [row] = cleanMilestones([{ ...(req.body?.milestone || {}), id: req.params.mid }], target.milestones.map((m) => m.id));
    if (!row) return res.status(400).json({ error: "Nothing to save." });
    const current = target.milestones;
    const at = current.findIndex((m) => m.id === row.id);
    // Keep the row's first planned dates as its baseline, as a full save does.
    const prev = at >= 0 ? current[at] : null;
    const saved = { ...row, baselineStart: prev?.baselineStart || row.baselineStart, baselineEnd: prev?.baselineEnd || row.baselineEnd };
    const milestones = at >= 0 ? current.map((m, i) => (i === at ? saved : m)) : [...current, saved];
    // A task saved into a category the schedule does not list yet adds that category.
    const cat = (saved.category || "").trim();
    const categories = cat && !target.categories.some((c) => c.toLowerCase() === cat.toLowerCase()) ? [...target.categories, cat] : target.categories;
    target.apply({ milestones, categories });
    if (!id && milestones.length) project.progress = overallProgress(milestones);
    await project.save();
    res.json({ schedule: project.schedule, progress: project.progress, milestone: saved });
  } catch (err) { next(err); }
});

// The schedules beside the master: this call names, adds, renames and removes them. Each one's
// tasks, categories and draft are kept as they are; a new one starts empty (from scratch), or with
// the category names it was given.
router.put("/subs", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id });
    if (!project) return res.status(404).json({ error: "Project not found" });
    const s = ((project.toObject() as { schedule?: Plain }).schedule || {}) as Plain;
    const existing = s.subs || [];
    const input = Array.isArray(req.body?.subs) ? req.body.subs : [];
    const subs = input.slice(0, 30).map((raw: Record<string, unknown>) => {
      const id = str(raw?.id, 40) || `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const name = str(raw?.name, 80).trim() || "Schedule";
      const had = existing.find((x) => x.id === id);
      return had
        ? { ...had, name }
        : { id, name, categories: cleanCategories(raw?.categories), milestones: [], draft: null, own: true };
    });
    project.schedule = { ...s, subs } as unknown as typeof project.schedule;
    project.markModified("schedule");
    await project.save();
    res.json({ schedule: project.schedule, progress: project.progress });
  } catch (err) { next(err); }
});

router.put("/draft", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id });
    if (!project) return res.status(404).json({ error: "Project not found" });
    const target = scheduleOf(project, schedId(req));
    if (!target) return res.status(404).json(noSchedule);
    const draft = {
      milestones: cleanMilestones(req.body?.milestones),
      categories: req.body?.categories !== undefined ? cleanCategories(req.body.categories) : target.categories,
      savedAt: new Date().toISOString(),
      savedBy: req.user!.name || "",
    };
    target.apply({ draft });
    await project.save();
    res.json({ schedule: project.schedule, progress: project.progress });
  } catch (err) { next(err); }
});

router.delete("/draft", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id });
    if (!project) return res.status(404).json({ error: "Project not found" });
    const target = scheduleOf(project, schedId(req));
    if (!target) return res.status(404).json(noSchedule);
    target.apply({ draft: null });
    await project.save();
    res.json({ schedule: project.schedule, progress: project.progress });
  } catch (err) { next(err); }
});

// ── CR 300 - the schedule register: baselines, uploaded schedules, and every entry's details ──
const ENTRY_STATUSES = new Set(["draft", "submitted", "approved", "rejected"]);
const entryQuery = (req: AuthedRequest) => {
  const id = schedId(req);
  return { projectId: req.params.id, scheduleId: id || { $in: ["", null] } };
};
/**
 * The files an entry points at, looked up by id among this project's own documents. The client
 * names the documents; their paths always come from the server, so an entry can never point at
 * another project's file.
 */
async function entryFiles(projectId: string, input: unknown, by: string): Promise<ScheduleEntryFile[]> {
  if (!Array.isArray(input)) return [];
  const ids = input.map((f) => str((f as { docId?: unknown })?.docId ?? f, 40)).filter((x) => mongoose.isValidObjectId(x)).slice(0, 40);
  if (!ids.length) return [];
  const docs = await ProjectDocument.find({ _id: { $in: ids }, projectId }).lean();
  return ids.map((docId) => docs.find((d) => String(d._id) === docId)).filter((d): d is NonNullable<typeof d> => !!d).map((d) => ({
    docId: String(d._id), name: d.name, filePath: d.filePath, fileType: d.fileType, size: d.size,
    uploadedAt: new Date(d.uploadedAt || Date.now()).toISOString(), uploadedBy: by,
  }));
}
/** The details a person can set on any entry. The schedule itself (its tasks) is never edited here. */
function entryDetails(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (body.title !== undefined) out.title = str(body.title, 160).trim();
  if (body.description !== undefined) out.description = str(body.description, 2000).trim();
  if (body.note !== undefined) out.note = str(body.note, 500).trim();
  for (const k of ["dataDate", "approvedAt", "contractCompletion", "submittedAt"]) if (body[k] !== undefined) out[k] = date(body[k]);
  if (body.client !== undefined) out.client = str(body.client, 160).trim();
  if (body.relatedDocument !== undefined) out.relatedDocument = str(body.relatedDocument, 200).trim();
  if (body.status !== undefined && ENTRY_STATUSES.has(String(body.status))) out.status = String(body.status);
  if (body.archived !== undefined) out.archived = body.archived === true;
  return out;
}

// A new baseline: the live schedule (or a saved revision of it) frozen as B0, B1, B2... The tasks
// are copied once and never edited afterwards; only the details around them can change.
router.post("/baselines", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id });
    if (!project) return res.status(404).json({ error: "Project not found" });
    const id = schedId(req);
    const target = scheduleOf(project, id);
    if (!target) return res.status(404).json(noSchedule);
    let milestones = target.milestones, categories = target.categories;
    const fromId = str(req.body?.fromId, 40);
    if (fromId) {
      if (!mongoose.isValidObjectId(fromId)) return res.status(400).json({ error: "That revision was not found." });
      const from = await ScheduleRevision.findOne({ _id: fromId, ...entryQuery(req) }).lean();
      if (!from || from.kind === "upload") return res.status(400).json({ error: "That revision was not found." });
      milestones = from.milestones; categories = from.categories;
    }
    if (!milestones.length) return res.status(400).json({ error: "The schedule is empty. Add its tasks before freezing a baseline." });
    const last = await ScheduleRevision.findOne({ ...entryQuery(req), kind: "baseline" }).sort({ baselineNo: -1 }).select("baselineNo").lean();
    const baselineNo = last ? last.baselineNo + 1 : 0;
    const details = entryDetails(req.body || {});
    const entry = await ScheduleRevision.create({
      projectId: req.params.id,
      scheduleId: id,
      version: 0,
      kind: "baseline",
      baselineNo,
      milestones,
      categories,
      progress: overallProgress(milestones),
      savedBy: req.user!.name || "",
      status: "approved",
      title: `Baseline B${baselineNo}`,
      ...details,
      files: await entryFiles(req.params.id, req.body?.files, req.user!.name || ""),
    });
    res.json(entry);
  } catch (err) { next(err); }
});

// A schedule kept as a file only: one sent to the client or received back, with no live table.
router.post("/entries", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id }).select("projectId").lean();
    if (!project) return res.status(404).json({ error: "Project not found" });
    const files = await entryFiles(req.params.id, req.body?.files, req.user!.name || "");
    if (!files.length) return res.status(400).json({ error: "Attach the schedule file first." });
    const details = entryDetails(req.body || {});
    const entry = await ScheduleRevision.create({
      projectId: req.params.id,
      scheduleId: schedId(req),
      version: 0,
      kind: "upload",
      savedBy: req.user!.name || "",
      title: files[0].name.replace(/\.[^.]+$/, ""),
      ...details,
      submittedBy: details.status === "submitted" ? req.user!.name || "" : "",
      files,
    });
    res.json(entry);
  } catch (err) { next(err); }
});

// An entry's details: title, dates, status, client, archive, and the files that go with it.
router.patch("/entries/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!mongoose.isValidObjectId(req.params.rid)) return res.status(404).json({ error: "Not found" });
    const entry = await ScheduleRevision.findOne({ _id: req.params.rid, ...entryQuery(req) });
    if (!entry) return res.status(404).json({ error: "Not found" });
    const details = entryDetails(req.body || {});
    if (details.status === "submitted" && entry.status !== "submitted") {
      entry.submittedBy = req.user!.name || "";
      if (!details.submittedAt && !entry.submittedAt) entry.submittedAt = new Date().toISOString().slice(0, 10);
    }
    if (details.status === "approved" && entry.status !== "approved" && !details.approvedAt && !entry.approvedAt) {
      entry.approvedAt = new Date().toISOString().slice(0, 10);
    }
    entry.set(details);
    if (req.body?.files !== undefined) {
      // Files already on the entry keep who added them; new ones are credited to this person.
      const listed = await entryFiles(req.params.id, req.body.files, req.user!.name || "");
      entry.files = listed.map((f) => (entry.files || []).find((x) => x.docId === f.docId) || f);
      entry.markModified("files");
    }
    await entry.save();
    res.json(entry);
  } catch (err) { next(err); }
});

// Deleting an entry puts it in the Recycle Bin, where it can be restored. Its files stay in the
// project's documents.
router.delete("/entries/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!mongoose.isValidObjectId(req.params.rid)) return res.status(404).json({ error: "Not found" });
    const entry = await ScheduleRevision.findOne({ _id: req.params.rid, ...entryQuery(req) });
    if (!entry) return res.status(404).json({ error: "Not found" });
    const project = await Project.findOne({ projectId: req.params.id }).select("name").lean();
    await recycleAndDelete(entry, {
      kind: "schedule-entry",
      name: scheduleEntryName(entry),
      subtitle: "Schedule",
      projectId: req.params.id,
      projectName: project?.name || "",
      deletedById: req.user?.userId,
      deletedByName: req.user?.name || "",
    });
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

export default router;
