import { Router, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Task from "../models/Task";
import TaskColumn from "../models/TaskColumn";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";

// CR-P — Kanban board for a project's Project Management tab. Gated by the "pm" tab permission,
// so assigned employees, subcontractors and partners with pm access all reach it.
const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["pm"]));

const DEFAULT_COLUMNS = [
  { key: "pending", title: "Pending" },
  { key: "inprogress", title: "In Progress" },
  { key: "done", title: "Done" },
  { key: "archive", title: "Archive" },
];

async function ensureColumns(projectId: string) {
  const count = await TaskColumn.countDocuments({ projectId });
  if (count === 0) {
    await TaskColumn.insertMany(DEFAULT_COLUMNS.map((d, i) => ({ projectId, key: d.key, title: d.title, order: i, isDefault: true })));
  }
}

// ── Board ────────────────────────────────────────────────────────────────────
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await ensureColumns(req.params.id);
    const [columns, tasks] = await Promise.all([
      TaskColumn.find({ projectId: req.params.id }).sort({ order: 1 }).lean(),
      Task.find({ projectId: req.params.id }).sort({ order: 1, createdAt: 1 }).lean(),
    ]);
    res.json({ columns, tasks });
  } catch (err) { next(err); }
});

// ── Columns ──────────────────────────────────────────────────────────────────
router.post("/columns", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const last = await TaskColumn.find({ projectId: req.params.id }).sort({ order: -1 }).limit(1).lean();
    const order = ((last[0] as { order?: number } | undefined)?.order ?? -1) + 1;
    const col = await TaskColumn.create({ projectId: req.params.id, title: String(req.body?.title || "New column").slice(0, 60), order, isDefault: false });
    res.status(201).json(col);
  } catch (err) { next(err); }
});
router.patch("/columns/:cid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const col = await TaskColumn.findOne({ _id: req.params.cid, projectId: req.params.id });
    if (!col) return res.status(404).json({ error: "Not found" });
    if (typeof req.body?.title === "string") col.title = req.body.title.slice(0, 60);
    if (typeof req.body?.order === "number") col.order = req.body.order;
    await col.save();
    res.json(col);
  } catch (err) { next(err); }
});
router.delete("/columns/:cid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const col = await TaskColumn.findOne({ _id: req.params.cid, projectId: req.params.id });
    if (!col) return res.status(404).json({ error: "Not found" });
    if (col.isDefault) return res.status(400).json({ error: "Default columns can't be deleted." });
    // Move its tasks to the first remaining column (or delete them if none remains).
    const first = await TaskColumn.findOne({ projectId: req.params.id, _id: { $ne: col._id } }).sort({ order: 1 });
    if (first) await Task.updateMany({ projectId: req.params.id, columnId: String(col._id) }, { $set: { columnId: String(first._id) } });
    else await Task.deleteMany({ projectId: req.params.id, columnId: String(col._id) });
    await col.deleteOne();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Tasks ────────────────────────────────────────────────────────────────────
router.post("/tasks", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const columnId = String(req.body?.columnId || "");
    if (!mongoose.isValidObjectId(columnId)) return res.status(400).json({ error: "A task needs a valid column." });
    const last = await Task.find({ projectId: req.params.id, columnId }).sort({ order: -1 }).limit(1).lean();
    const order = ((last[0] as { order?: number } | undefined)?.order ?? -1) + 1;
    const task = await Task.create({
      projectId: req.params.id, columnId, order,
      title: String(req.body?.title || "").slice(0, 200),
      createdById: req.user!.userId, createdByName: req.user!.name || "",
    });
    res.status(201).json(task);
  } catch (err) { next(err); }
});
router.patch("/tasks/:tid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const t = await Task.findOne({ _id: req.params.tid, projectId: req.params.id });
    if (!t) return res.status(404).json({ error: "Not found" });
    const b = req.body || {};
    if (typeof b.title === "string") t.title = b.title.slice(0, 200);
    if (typeof b.description === "string") t.description = b.description.slice(0, 10000);
    if (typeof b.columnId === "string" && mongoose.isValidObjectId(b.columnId)) t.columnId = b.columnId;
    if (Array.isArray(b.tags)) t.set("tags", b.tags.map((x: unknown) => String(x).slice(0, 40)).slice(0, 20));
    if (Array.isArray(b.assignees)) t.set("assignees", b.assignees.map((a: Record<string, unknown>) => ({ userId: String(a.userId || ""), empId: String(a.empId || ""), name: String(a.name || ""), kind: String(a.kind || "") })).slice(0, 30));
    if (Array.isArray(b.subtasks)) t.set("subtasks", b.subtasks.map((s: Record<string, unknown>) => ({ title: String(s.title || "").slice(0, 300), done: !!s.done })).slice(0, 100));
    await t.save();
    res.json(t);
  } catch (err) { next(err); }
});
router.delete("/tasks/:tid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try { await Task.findOneAndDelete({ _id: req.params.tid, projectId: req.params.id }); res.json({ ok: true }); }
  catch (err) { next(err); }
});

// ── Reorder / move — body: { columns: [{ columnId, taskIds: [...] }] } ────────
router.post("/reorder", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const cols = Array.isArray(req.body?.columns) ? req.body.columns : [];
    const ops: mongoose.AnyBulkWriteOperation[] = [];
    for (const c of cols) {
      const columnId = String(c?.columnId || "");
      if (!mongoose.isValidObjectId(columnId)) continue;
      const ids = Array.isArray(c?.taskIds) ? c.taskIds : [];
      ids.forEach((tid: unknown, i: number) => {
        if (mongoose.isValidObjectId(String(tid))) ops.push({ updateOne: { filter: { _id: String(tid), projectId: req.params.id }, update: { $set: { columnId, order: i } } } });
      });
    }
    if (ops.length) await Task.bulkWrite(ops);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
