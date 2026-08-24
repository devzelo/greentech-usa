import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Loader2, X, Briefcase, Tag as TagIcon, LayoutGrid, CalendarClock } from "lucide-react";
import {
  fetchMyBoard, createTask, updateTask, fetchBoardMembers,
  type ApiTask, type ApiTaskColumn, type BoardMember,
} from "../../lib/api";
import { TaskModal, fmtDeadline, isOverdue } from "./ProjectBoard";
import { toast } from "../../lib/toast";

// CR-P — a cross-project overview board: every task across the user's projects, grouped by status
// (column title). Create tasks by picking a project; drag between statuses; open a card to edit.
export default function AggregateBoard() {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [columns, setColumns] = useState<ApiTaskColumn[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const dragId = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchMyBoard().then((b) => { setProjects(b.projects); setColumns(b.columns); setTasks(b.tasks); }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const colTitle = (columnId: string) => columns.find((c) => c._id === columnId)?.title || "Other";
  const projName = (pid: string) => projects.find((p) => p.id === pid)?.name || "";
  const openTask = useMemo(() => tasks.find((t) => t._id === openTaskId) || null, [tasks, openTaskId]);

  // Status groups = distinct column titles across all projects, defaults first (by min order).
  const statusGroups = useMemo(() => {
    const byTitle = new Map<string, { title: string; order: number }>();
    for (const c of columns) { const g = byTitle.get(c.title) || { title: c.title, order: c.order }; g.order = Math.min(g.order, c.order); byTitle.set(c.title, g); }
    return Array.from(byTitle.values()).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  }, [columns]);
  const tasksInStatus = (title: string) => tasks.filter((t) => colTitle(t.columnId) === title);

  // Move a task to a status group → its project's column with that title.
  const moveToStatus = (taskId: string, title: string) => {
    const t = tasks.find((x) => x._id === taskId); if (!t || colTitle(t.columnId) === title) return;
    const target = columns.find((c) => c.projectId === t.projectId && c.title === title);
    if (!target) { toast(`"${title}" isn't a status in ${projName(t.projectId) || "that project"}.`, "error"); return; }
    setTasks((prev) => prev.map((x) => (x._id === taskId ? { ...x, columnId: target._id } : x)));
    updateTask(t.projectId, taskId, { columnId: target._id }).catch(() => toast("Could not move the task.", "error"));
  };

  // Load the open task's project members lazily (for the assignee picker in the modal).
  useEffect(() => {
    if (!openTask) return;
    fetchBoardMembers(openTask.projectId).then(setMembers).catch(() => setMembers([]));
  }, [openTask?.projectId]);

  const patchLocal = (t: ApiTask) => setTasks((p) => p.map((x) => (x._id === t._id ? t : x)));

  if (loading) return <div className="py-16 flex justify-center text-slate-300"><Loader2 size={24} className="animate-spin" /></div>;
  if (projects.length === 0) return (
    <div className="text-center py-16 text-slate-400 bg-white rounded-3xl border border-slate-100">
      <LayoutGrid size={34} className="mx-auto mb-3 text-slate-200" />
      <p className="text-sm font-medium">No projects yet — tasks from your projects will appear here.</p>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm text-slate-500">All tasks across your {projects.length} project{projects.length === 1 ? "" : "s"}, grouped by status.</p>
        <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gt-gradient text-white text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-transform"><Plus size={16} /> New task</button>
      </div>

      <div className="flex items-start gap-3 overflow-x-auto pb-3 -mx-1 px-1">
        {statusGroups.map((g) => {
          const list = tasksInStatus(g.title);
          return (
            <div
              key={g.title}
              onDragOver={(e) => { if (dragId.current) { e.preventDefault(); setDragOver(g.title); } }}
              onDragLeave={() => setDragOver((c) => (c === g.title ? null : c))}
              onDrop={(e) => { e.preventDefault(); if (dragId.current) moveToStatus(dragId.current, g.title); dragId.current = null; setDragOver(null); }}
              className={`w-72 shrink-0 rounded-2xl border p-2.5 flex flex-col max-h-[calc(100vh-18rem)] ${dragOver === g.title ? "border-primary/40 bg-primary/5" : "border-slate-200 bg-slate-50/70"}`}
            >
              <div className="flex items-center gap-1.5 px-1.5 py-1 mb-1">
                <span className="font-bold text-sm text-slate-700 truncate">{g.title}</span>
                <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 rounded-full px-1.5">{list.length}</span>
              </div>
              <div className="flex-grow overflow-y-auto space-y-2 pr-0.5">
                {list.map((t) => {
                  const doneSubs = t.subtasks.filter((s) => s.done).length;
                  return (
                    <div
                      key={t._id}
                      draggable
                      onDragStart={() => { dragId.current = t._id; }}
                      onDragEnd={() => { dragId.current = null; setDragOver(null); }}
                      onClick={() => setOpenTaskId(t._id)}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-primary/30 p-2.5 cursor-pointer transition-all"
                    >
                      <p className="text-sm font-semibold text-slate-800 leading-snug">{t.title || "Untitled"}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600"><Briefcase size={8} /> {projName(t.projectId) || "Project"}</span>
                        {t.deadline && <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isOverdue(t.deadline) ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}><CalendarClock size={8} /> {fmtDeadline(t.deadline)}</span>}
                        {t.subtasks.length > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{doneSubs}/{t.subtasks.length} ✓</span>}
                        {t.tags.slice(0, 2).map((tag) => <span key={tag} className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500"><TagIcon size={8} /> {tag}</span>)}
                        {t.assignees.slice(0, 3).map((a, i) => <span key={i} title={a.name} className="w-5 h-5 rounded-full bg-gt-gradient text-white text-[9px] font-bold flex items-center justify-center ring-1 ring-white">{(a.name || "?").charAt(0).toUpperCase()}</span>)}
                      </div>
                    </div>
                  );
                })}
                {list.length === 0 && <p className="text-[11px] text-slate-400 italic px-1 py-2">No tasks.</p>}
              </div>
            </div>
          );
        })}
      </div>

      {openTask && (
        <TaskModal
          projectId={openTask.projectId}
          task={openTask}
          columns={columns.filter((c) => c.projectId === openTask.projectId)}
          members={members}
          canEdit
          onClose={() => setOpenTaskId(null)}
          onSaved={patchLocal}
          onDelete={() => { setTasks((p) => p.filter((x) => x._id !== openTask._id)); setOpenTaskId(null); toast("Delete the task from its project board.", "info"); }}
        />
      )}

      {createOpen && (
        <CreateTaskModal
          projects={projects}
          columns={columns}
          onClose={() => setCreateOpen(false)}
          onCreated={(t) => { setTasks((p) => [...p, t]); setCreateOpen(false); }}
        />
      )}
    </div>
  );
}

// Cross-project task creation: pick a project, then a status/column, then a title.
function CreateTaskModal({ projects, columns, onClose, onCreated }: {
  projects: Array<{ id: string; name: string }>; columns: ApiTaskColumn[]; onClose: () => void; onCreated: (t: ApiTask) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [columnId, setColumnId] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const projectColumns = columns.filter((c) => c.projectId === projectId).sort((a, b) => a.order - b.order);

  const submit = async () => {
    if (!projectId) { toast("Pick a project.", "error"); return; }
    if (!title.trim()) { toast("Give the task a title.", "error"); return; }
    const col = columnId || projectColumns[0]?._id;
    if (!col) { toast("That project has no board yet — open it once first.", "error"); return; }
    setSaving(true);
    try { onCreated(await createTask(projectId, { title: title.trim(), columnId: col })); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not create the task.", "error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-16" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-900">New task</p>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setColumnId(""); }} className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/10">
              <option value="">— select a project —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {projectId && (
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status
              <select value={columnId} onChange={(e) => setColumnId(e.target.value)} className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/10">
                {projectColumns.length === 0 ? <option value="">Pending</option> : projectColumns.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
              </select>
            </label>
          )}
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="What needs doing?" className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/10" />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{saving && <Loader2 size={12} className="animate-spin" />} Create task</button>
          </div>
        </div>
      </div>
    </div>
  );
}
