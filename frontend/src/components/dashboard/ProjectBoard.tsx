import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2, X, Trash2, GripVertical, Tag as TagIcon, CheckSquare, Square, MoreVertical, Pencil, UserPlus, Paperclip, Upload, Download, Eye, FileText, MessageSquare, Send, AtSign, CalendarClock } from "lucide-react";
import {
  fetchBoard, addBoardColumn, updateBoardColumn, deleteBoardColumn,
  createTask, updateTask, deleteTask, reorderBoard,
  fetchBoardMembers, uploadTaskAttachment, deleteTaskAttachment, attachmentUrl, addTaskComment, getAuthUser,
  type ApiTaskColumn, type ApiTask, type BoardMember, type ApiTaskAssignee,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import Avatar from "./Avatar";

// CR-P — Trello-style Kanban board on a project's Project Management tab. Columns (Pending /
// In Progress / Done / Archive + custom), draggable task cards, and a task detail modal.
export default function ProjectBoard({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { confirm, dialogs } = useDialogs();
  const [columns, setColumns] = useState<ApiTaskColumn[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [quickAddCol, setQuickAddCol] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [addingCol, setAddingCol] = useState(false);
  const [newColTitle, setNewColTitle] = useState("");
  const [colMenu, setColMenu] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchBoard(projectId).then((b) => { setColumns(b.columns); setTasks(b.tasks); }).catch(() => {}).finally(() => setLoading(false));
    fetchBoardMembers(projectId).then(setMembers).catch(() => {});
  }, [projectId]);

  const tasksIn = (cid: string) => tasks.filter((t) => t.columnId === cid).sort((a, b) => a.order - b.order);
  const openTask = useMemo(() => tasks.find((t) => t._id === openTaskId) || null, [tasks, openTaskId]);
  const patchLocal = (t: ApiTask) => setTasks((p) => p.map((x) => (x._id === t._id ? t : x)));

  // ── Persist a reorder for the columns whose contents changed ────────────────
  const persistOrder = (next: ApiTask[], colIds: string[]) => {
    const payload = colIds.map((columnId) => ({ columnId, taskIds: next.filter((t) => t.columnId === columnId).sort((a, b) => a.order - b.order).map((t) => t._id) }));
    reorderBoard(projectId, payload).catch(() => {});
  };

  // Move the dragged task into `toCol`, inserted before `beforeId` (or at the end).
  const moveTask = (taskId: string, toCol: string, beforeId?: string) => {
    setTasks((prev) => {
      const moving = prev.find((t) => t._id === taskId);
      if (!moving) return prev;
      const fromCol = moving.columnId;
      // New ordering of the target column (with the moving task inserted).
      const targetIds = prev.filter((t) => t.columnId === toCol && t._id !== taskId).sort((a, b) => a.order - b.order).map((t) => t._id);
      const pos = beforeId ? targetIds.indexOf(beforeId) : -1;
      targetIds.splice(pos < 0 ? targetIds.length : pos, 0, taskId);
      const orderTarget = new Map(targetIds.map((id, i) => [id, i]));
      // Re-densify the source column when moving across columns.
      const srcOrder = new Map(fromCol !== toCol ? prev.filter((t) => t.columnId === fromCol && t._id !== taskId).sort((a, b) => a.order - b.order).map((t, i) => [t._id, i]) : []);
      const next = prev.map((t) => {
        if (t._id === taskId) return { ...t, columnId: toCol, order: orderTarget.get(taskId) ?? 0 };
        if (t.columnId === toCol && orderTarget.has(t._id)) return { ...t, order: orderTarget.get(t._id)! };
        if (fromCol !== toCol && t.columnId === fromCol && srcOrder.has(t._id)) return { ...t, order: srcOrder.get(t._id)! };
        return t;
      });
      persistOrder(next, Array.from(new Set([fromCol, toCol])));
      return next;
    });
  };

  // ── Columns ──────────────────────────────────────────────────────────────
  const addColumn = async () => {
    const title = newColTitle.trim(); if (!title) return;
    try { const c = await addBoardColumn(projectId, title); setColumns((p) => [...p, c]); setNewColTitle(""); setAddingCol(false); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not add column.", "error"); }
  };
  const renameColumn = async (c: ApiTaskColumn) => {
    const title = prompt("Rename column", c.title)?.trim();
    if (!title || title === c.title) return;
    try { const up = await updateBoardColumn(projectId, c._id, { title }); setColumns((p) => p.map((x) => (x._id === up._id ? up : x))); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not rename.", "error"); }
    setColMenu(null);
  };
  const removeColumn = async (c: ApiTaskColumn) => {
    setColMenu(null);
    if (!(await confirm({ title: "Delete column?", message: `"${c.title}" will be removed. Its tasks move to the first column.`, confirmLabel: "Delete", danger: true }))) return;
    try { await deleteBoardColumn(projectId, c._id); setColumns((p) => p.filter((x) => x._id !== c._id)); const b = await fetchBoard(projectId); setTasks(b.tasks); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not delete.", "error"); }
  };

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const quickAdd = async (columnId: string) => {
    const title = quickTitle.trim(); if (!title) { setQuickAddCol(null); return; }
    try { const t = await createTask(projectId, { title, columnId }); setTasks((p) => [...p, t]); setQuickTitle(""); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not add task.", "error"); }
  };
  const removeTask = async (t: ApiTask) => {
    if (!(await confirm({ title: "Delete task?", message: `"${t.title || "Untitled"}" will be permanently removed.`, confirmLabel: "Delete", danger: true }))) return;
    try { await deleteTask(projectId, t._id); setTasks((p) => p.filter((x) => x._id !== t._id)); setOpenTaskId(null); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not delete.", "error"); }
  };

  if (loading) return <div className="py-16 flex justify-center text-slate-300"><Loader2 size={24} className="animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-start gap-3 overflow-x-auto pb-3 -mx-1 px-1">
        {columns.map((c) => {
          const colTasks = tasksIn(c._id);
          return (
            <div
              key={c._id}
              onDragOver={(e) => { if (dragId.current) { e.preventDefault(); setDragOverCol(c._id); } }}
              onDragLeave={() => setDragOverCol((cur) => (cur === c._id ? null : cur))}
              onDrop={(e) => { e.preventDefault(); if (dragId.current) moveTask(dragId.current, c._id); dragId.current = null; setDragOverCol(null); }}
              className={`w-72 shrink-0 rounded-2xl border p-2.5 flex flex-col max-h-[calc(100vh-16rem)] ${dragOverCol === c._id ? "border-primary/40 bg-primary/5" : "border-slate-200 bg-slate-50/70"}`}
            >
              <div className="flex items-center justify-between gap-2 px-1.5 py-1 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-sm text-slate-700 truncate">{c.title}</span>
                  <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 rounded-full px-1.5">{colTasks.length}</span>
                </div>
                {canEdit && !c.isDefault && (
                  <div className="relative">
                    <button onClick={() => setColMenu(colMenu === c._id ? null : c._id)} className="p-1 rounded text-slate-400 hover:text-slate-700"><MoreVertical size={15} /></button>
                    {colMenu === c._id && (
                      <>
                        <button className="fixed inset-0 z-10 cursor-default" onClick={() => setColMenu(null)} />
                        <div className="absolute right-0 mt-1 z-20 w-36 bg-white border border-slate-100 rounded-xl shadow-xl p-1">
                          <button onClick={() => renameColumn(c)} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50"><Pencil size={13} /> Rename</button>
                          <button onClick={() => removeColumn(c)} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 size={13} /> Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-grow overflow-y-auto space-y-2 pr-0.5 gt-scroll">
                {colTasks.map((t) => {
                  const doneSubs = t.subtasks.filter((s) => s.done).length;
                  return (
                    <div
                      key={t._id}
                      draggable={canEdit}
                      onDragStart={() => { dragId.current = t._id; }}
                      onDragEnd={() => { dragId.current = null; setDragOverCol(null); }}
                      onDragOver={(e) => { if (dragId.current && dragId.current !== t._id) e.preventDefault(); }}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (dragId.current && dragId.current !== t._id) moveTask(dragId.current, t.columnId, t._id); dragId.current = null; setDragOverCol(null); }}
                      onClick={() => setOpenTaskId(t._id)}
                      className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-primary/30 p-2.5 cursor-pointer transition-all"
                    >
                      <div className="flex items-start gap-1.5">
                        {canEdit && <GripVertical size={13} className="text-slate-300 mt-0.5 shrink-0 cursor-grab" />}
                        <p className="text-sm font-semibold text-slate-800 leading-snug flex-grow">{t.title || "Untitled"}</p>
                      </div>
                      {(t.tags.length > 0 || t.subtasks.length > 0 || t.assignees.length > 0 || !!t.deadline) && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-[18px]">
                          {t.deadline && <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isOverdue(t.deadline) ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}><CalendarClock size={8} /> {fmtDeadline(t.deadline)}</span>}
                          {t.tags.slice(0, 3).map((tag) => <span key={tag} className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500"><TagIcon size={8} /> {tag}</span>)}
                          {t.subtasks.length > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{doneSubs}/{t.subtasks.length} ✓</span>}
                          {t.assignees.slice(0, 4).map((a, i) => <span key={i} className="inline-flex"><Avatar url={a.avatarUrl || members.find((mm) => mm.userId && mm.userId === a.userId)?.avatarUrl} name={a.name} size={20} /></span>)}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Quick add */}
                {canEdit && (quickAddCol === c._id ? (
                  <div className="bg-white rounded-xl border border-primary/30 p-2 shadow-sm">
                    <textarea autoFocus value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); quickAdd(c._id); } if (e.key === "Escape") { setQuickAddCol(null); setQuickTitle(""); } }} rows={2} placeholder="Task title…" className="w-full text-sm outline-none resize-none" />
                    <div className="flex items-center gap-2 mt-1">
                      <button onClick={() => quickAdd(c._id)} className="px-2.5 py-1 rounded-lg bg-primary text-white text-[11px] font-bold">Add</button>
                      <button onClick={() => { setQuickAddCol(null); setQuickTitle(""); }} className="text-slate-400 hover:text-slate-700"><X size={15} /></button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setQuickAddCol(c._id); setQuickTitle(""); }} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-700 hover:bg-white"><Plus size={14} /> Add task</button>
                ))}
              </div>
            </div>
          );
        })}

        {/* Add column */}
        {canEdit && (
          <div className="w-72 shrink-0">
            {addingCol ? (
              <div className="rounded-2xl border border-primary/30 bg-white p-2.5">
                <input autoFocus value={newColTitle} onChange={(e) => setNewColTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addColumn(); if (e.key === "Escape") { setAddingCol(false); setNewColTitle(""); } }} placeholder="Column title…" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none" />
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={addColumn} className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold">Add column</button>
                  <button onClick={() => { setAddingCol(false); setNewColTitle(""); }} className="text-slate-400 hover:text-slate-700"><X size={15} /></button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingCol(true)} className="w-full flex items-center gap-1.5 px-3 py-2.5 rounded-2xl border border-dashed border-slate-300 text-slate-400 text-sm font-bold hover:border-primary hover:text-primary"><Plus size={16} /> Add column</button>
            )}
          </div>
        )}
      </div>

      {openTask && <TaskModal projectId={projectId} task={openTask} columns={columns} members={members} canEdit={canEdit} onClose={() => setOpenTaskId(null)} onSaved={patchLocal} onDelete={() => removeTask(openTask)} />}
      {dialogs}
    </div>
  );
}

// Match a stored assignee to a member (userId, then empId, then name+kind).
const sameMember = (a: ApiTaskAssignee, m: BoardMember) =>
  (!!m.userId && a.userId === m.userId) || (!!m.empId && a.empId === m.empId) || (a.name === m.name && a.kind === m.kind);
const kindLabel: Record<string, string> = { employee: "Employee", subcontractor: "Subcontractor", partner: "Partner" };
// Deadline helpers (stored as YYYY-MM-DD).
export const fmtDeadline = (d?: string) => { if (!d) return ""; const dt = new Date(`${d}T00:00:00`); return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }); };
export const isOverdue = (d?: string) => { if (!d) return false; const dt = new Date(`${d}T23:59:59`); return !isNaN(dt.getTime()) && dt.getTime() < Date.now(); };
// Group members into category sections (Employees / Subcontractors / Partners) for the pickers.
const KIND_ORDER = ["employee", "subcontractor", "partner"];
function groupByKind(list: BoardMember[]): Array<{ kind: string; label: string; items: BoardMember[] }> {
  const m = new Map<string, BoardMember[]>();
  for (const x of list) { const k = x.kind || "other"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(x); }
  const inOrder = KIND_ORDER.filter((k) => m.has(k)).map((k) => ({ kind: k, label: `${kindLabel[k] || k}s`, items: m.get(k)! }));
  const rest = [...m.keys()].filter((k) => !KIND_ORDER.includes(k)).map((k) => ({ kind: k, label: k, items: m.get(k)! }));
  return [...inOrder, ...rest];
}

// ── Task detail modal — title, description, assignees, tags, subtasks, attachments ──
// Exported so the cross-project overview board can reuse it.
export function TaskModal({ projectId, task, columns, members, canEdit, onClose, onSaved, onDelete }: {
  projectId: string; task: ApiTask; columns: ApiTaskColumn[]; members: BoardMember[]; canEdit: boolean; onClose: () => void; onSaved: (t: ApiTask) => void; onDelete: () => void;
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [tags, setTags] = useState<string[]>(task.tags);
  const [tagInput, setTagInput] = useState("");
  const [subtasks, setSubtasks] = useState(task.subtasks);
  const [subInput, setSubInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [pendingMentions, setPendingMentions] = useState<BoardMember[]>([]);
  const [sending, setSending] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const myId = getAuthUser()?.id || "";
  const [mentionQuery, setMentionQuery] = useState("");
  // The modal fetches its own member list too, so it works even if the parent hasn't loaded it yet;
  // surfaces an error so a broken endpoint / access issue is visible instead of silently empty.
  const [localMembers, setLocalMembers] = useState<BoardMember[]>(members);
  useEffect(() => {
    fetchBoardMembers(projectId).then(setLocalMembers).catch((e) => toast(e instanceof Error ? e.message : "Could not load the people on this project.", "error"));
  }, [projectId]);
  // Mentionable = members with a login, minus yourself (you can assign yourself, but not @-mention yourself).
  const mentionable = localMembers.filter((m) => m.userId && m.userId !== myId);
  const mentionMatches = mentionable.filter((m) => !mentionQuery || m.name.toLowerCase().includes(mentionQuery.toLowerCase()));

  const save = async (patch: Parameters<typeof updateTask>[2], silent = false) => {
    setSaving(true);
    try { const up = await updateTask(projectId, task._id, patch); onSaved(up); }
    catch (e) { if (!silent) toast(e instanceof Error ? e.message : "Could not save.", "error"); }
    finally { setSaving(false); }
  };
  const isAssigned = (m: BoardMember) => task.assignees.some((a) => sameMember(a, m));
  const toggleAssignee = (m: BoardMember) => {
    const next = isAssigned(m)
      ? task.assignees.filter((a) => !sameMember(a, m))
      : [...task.assignees, { userId: m.userId, empId: m.empId, name: m.name, kind: m.kind, avatarUrl: m.avatarUrl || "" }];
    save({ assignees: next }, true);
  };
  const uploadFile = async (file: File) => {
    setUploading(true);
    try { onSaved(await uploadTaskAttachment(projectId, task._id, file)); }
    catch (e) { toast(e instanceof Error ? e.message : "Upload failed.", "error"); }
    finally { setUploading(false); }
  };
  const removeFile = async (aid?: string) => {
    if (!aid) return;
    try { onSaved(await deleteTaskAttachment(projectId, task._id, aid)); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not delete.", "error"); }
  };
  // Pick a member → add a removable mention chip and strip the @query from the text.
  const pickMention = (m: BoardMember) => {
    setPendingMentions((p) => (p.some((x) => x.userId === m.userId) ? p : [...p, m]));
    setCommentText((c) => c.replace(/@([^\s@]*)$/, "").replace(/[ ]+$/, ""));
    setMentionOpen(false); setMentionQuery("");
  };
  const removePending = (m: BoardMember) => setPendingMentions((p) => p.filter((x) => x.userId !== m.userId));
  // Detect an @-token as the user types, and open the mention menu filtered by it.
  const onCommentInput = (val: string) => {
    setCommentText(val);
    const m = /@([^\s@]*)$/.exec(val);
    if (m && mentionable.length) { setMentionQuery(m[1]); setMentionOpen(true); } else { setMentionOpen(false); setMentionQuery(""); }
  };
  const sendComment = async () => {
    const msg = commentText.trim();
    const mentionText = pendingMentions.map((m) => `@${m.name}`).join(" ");
    const finalText = [mentionText, msg].filter(Boolean).join(" ");
    if (!finalText) return;
    const mentions = pendingMentions.map((m) => m.userId).filter(Boolean);
    setSending(true);
    try { onSaved(await addTaskComment(projectId, task._id, { text: finalText, mentions })); setCommentText(""); setPendingMentions([]); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not comment.", "error"); }
    finally { setSending(false); }
  };
  // Highlight @mentions of known members in a comment body.
  const memberNames = localMembers.map((m) => m.name).filter(Boolean).sort((a, b) => b.length - a.length);
  const renderComment = (text: string) => {
    if (!memberNames.length) return text;
    const rx = new RegExp(`@(${memberNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    const parts: ReactNode[] = []; let last = 0; let m: RegExpExecArray | null;
    while ((m = rx.exec(text))) { if (m.index > last) parts.push(text.slice(last, m.index)); parts.push(<button key={m.index} onClick={() => navigate(`/dashboard/projects/${projectId}?tab=pm`)} className="inline-flex items-center px-1.5 rounded-md bg-primary/10 text-primary font-bold hover:bg-primary/20 transition-colors align-baseline" title="Open Project Management">{m[0]}</button>); last = m.index + m[0].length; }
    parts.push(text.slice(last));
    return parts;
  };
  const addTag = () => { const t = tagInput.trim(); if (!t || tags.includes(t)) { setTagInput(""); return; } const next = [...tags, t]; setTags(next); setTagInput(""); save({ tags: next }, true); };
  const removeTag = (t: string) => { const next = tags.filter((x) => x !== t); setTags(next); save({ tags: next }, true); };
  const addSub = () => { const t = subInput.trim(); if (!t) return; const next = [...subtasks, { title: t, done: false }]; setSubtasks(next); setSubInput(""); save({ subtasks: next }, true); };
  const toggleSub = (i: number) => { const next = subtasks.map((s, j) => (j === i ? { ...s, done: !s.done } : s)); setSubtasks(next); save({ subtasks: next }, true); };
  const removeSub = (i: number) => { const next = subtasks.filter((_, j) => j !== i); setSubtasks(next); save({ subtasks: next }, true); };

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Task</p>
          <div className="flex items-center gap-1">
            {canEdit && <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500" title="Delete task"><Trash2 size={16} /></button>}
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <input value={title} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== task.title && save({ title })} placeholder="Task title" className="w-full text-lg font-bold text-slate-900 outline-none border-b border-transparent focus:border-slate-200 pb-1" />

          {/* Status = the column the card sits in. Changing it moves the card (same as dragging). */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</span>
            <select value={task.columnId} disabled={!canEdit} onChange={(e) => save({ columnId: e.target.value })} className="text-xs font-bold rounded-lg border border-slate-200 px-2.5 py-1 bg-white text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60">
              {columns.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
            </select>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-1"><CalendarClock size={12} /> Deadline</span>
            <input type="date" value={task.deadline || ""} disabled={!canEdit} onChange={(e) => save({ deadline: e.target.value })} className="text-xs font-bold rounded-lg border border-slate-200 px-2.5 py-1 bg-white text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60" />
            {task.deadline && canEdit && <button onClick={() => save({ deadline: "" })} className="text-[10px] font-bold text-slate-400 hover:text-red-500">Clear</button>}
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Description</p>
            <textarea value={description} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== task.description && save({ description })} rows={4} placeholder="Add a description…" className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 resize-y" />
          </div>

          {/* Assignees — only people on this project (employees + subcontractors + partner) */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assignees</p>
              {canEdit && <button onClick={() => setAssignOpen((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"><UserPlus size={12} /> Assign</button>}
            </div>
            {task.assignees.length === 0 ? <p className="text-[11px] text-slate-400 italic">No one assigned.</p> : (
              <div className="flex flex-wrap gap-1.5">
                {task.assignees.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                    <Avatar url={a.avatarUrl || localMembers.find((mm) => mm.userId && mm.userId === a.userId)?.avatarUrl} name={a.name} size={20} />
                    {a.name}{a.kind && <span className="text-slate-400 font-medium">· {kindLabel[a.kind] || a.kind}</span>}
                  </span>
                ))}
              </div>
            )}
            {assignOpen && canEdit && (
              <div className="mt-2 rounded-xl border border-slate-100 p-2 max-h-56 overflow-y-auto space-y-2">
                {localMembers.length === 0 ? <p className="text-[11px] text-slate-400 italic px-1 py-1">No one with access to this project yet — assign employees, or grant access to subcontractors / partners first.</p> : groupByKind(localMembers).map((g) => (
                  <div key={g.kind}>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-0.5">{g.label}</p>
                    {g.items.map((m) => (
                      <label key={m.key} className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-slate-50 cursor-pointer text-xs">
                        <input type="checkbox" checked={isAssigned(m)} onChange={() => toggleAssignee(m)} />
                        <Avatar url={m.avatarUrl} name={m.name} size={18} />
                        <span className="font-bold text-slate-700 truncate">{m.name}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Tags</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold">{t}{canEdit && <button onClick={() => removeTag(t)} className="text-slate-400 hover:text-red-500"><X size={11} /></button>}</span>
              ))}
              {canEdit && <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="+ tag" className="w-20 text-[11px] bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 outline-none" />}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Subtasks {subtasks.length > 0 && `(${subtasks.filter((s) => s.done).length}/${subtasks.length})`}</p>
            <div className="space-y-1">
              {subtasks.map((s, i) => (
                <div key={i} className="flex items-center gap-2 group">
                  <button disabled={!canEdit} onClick={() => toggleSub(i)} className="text-slate-400 hover:text-primary shrink-0">{s.done ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}</button>
                  <span className={`text-sm flex-grow ${s.done ? "line-through text-slate-400" : "text-slate-700"}`}>{s.title}</span>
                  {canEdit && <button onClick={() => removeSub(i)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><X size={13} /></button>}
                </div>
              ))}
            </div>
            {canEdit && <div className="flex items-center gap-2 mt-1.5"><input value={subInput} onChange={(e) => setSubInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }} placeholder="Add a subtask…" className="flex-grow bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none" /><button onClick={addSub} className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200">Add</button></div>}
          </div>

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Paperclip size={12} /> Attachments {task.attachments.length > 0 && `(${task.attachments.length})`}</p>
              {canEdit && <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary cursor-pointer">{uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload<input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = ""; }} /></label>}
            </div>
            {task.attachments.length === 0 ? <p className="text-[11px] text-slate-400 italic">No files attached.</p> : (
              <div className="space-y-1">{task.attachments.map((f) => (
                <div key={f._id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-100 text-xs">
                  <span className="flex items-center gap-1.5 min-w-0"><FileText size={13} className="text-slate-400 shrink-0" /><span className="font-bold text-slate-700 truncate" title={f.name}>{f.name}</span>{f.size && <span className="text-slate-400 shrink-0">· {f.size}</span>}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <a href={attachmentUrl(f.filePath)} target="_blank" rel="noreferrer" className="p-1 rounded text-slate-400 hover:text-primary" title="View"><Eye size={13} /></a>
                    <a href={attachmentUrl(f.filePath)} download={f.name} className="p-1 rounded text-slate-400 hover:text-primary" title="Download"><Download size={13} /></a>
                    {canEdit && <button onClick={() => removeFile(f._id)} className="p-1 rounded text-slate-400 hover:text-red-500" title="Delete"><Trash2 size={13} /></button>}
                  </span>
                </div>
              ))}</div>
            )}
          </div>

          {/* Comments + @mentions */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2"><MessageSquare size={12} /> Comments {task.comments.length > 0 && `(${task.comments.length})`}</p>
            <div className="space-y-3 mb-3">
              {task.comments.length === 0 ? <p className="text-[11px] text-slate-400 italic">No comments yet.</p> : task.comments.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Avatar url={c.authorAvatar} name={c.authorName} size={28} />

                  <div className="min-w-0">
                    <p className="text-[11px]"><span className="font-bold text-slate-700">{c.authorName || "Someone"}</span> <span className="text-slate-400">{c.at ? new Date(c.at).toLocaleString() : ""}</span></p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{renderComment(c.text)}</p>
                  </div>
                </div>
              ))}
            </div>
            {canEdit && (
              <div>
                {/* Selected mentions as removable tags (like assignees). */}
                {pendingMentions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {pendingMentions.map((m) => (
                      <span key={m.key} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                        <Avatar url={m.avatarUrl} name={m.name} size={20} />
                        {m.name}
                        <button onClick={() => removePending(m)} className="text-primary/60 hover:text-red-500"><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <textarea value={commentText} onChange={(e) => onCommentInput(e.target.value)} rows={2} placeholder="Write a comment… type @ to tag someone" className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 resize-y" />
                {/* Inline @-mention suggestions as you type. */}
                {mentionOpen && mentionMatches.length > 0 && (
                  <div className="mt-1 rounded-xl border border-slate-100 shadow-lg bg-white p-1.5 max-h-52 overflow-y-auto space-y-2">
                    {groupByKind(mentionMatches).map((g) => (
                      <div key={g.kind}>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1.5 mb-0.5">{g.label}</p>
                        {g.items.map((m) => (
                          <button key={m.key} onClick={() => pickMention(m)} className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 truncate">@{m.name}</button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 mt-1.5">
                  <button onClick={() => { setMentionQuery(""); setMentionOpen((v) => !v); }} disabled={mentionable.length === 0} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-primary disabled:opacity-40" title={mentionable.length === 0 ? "No members with a login to mention" : "Tag a member"}><AtSign size={12} /> Mention</button>
                  <button onClick={sendComment} disabled={sending || (!commentText.trim() && pendingMentions.length === 0)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold disabled:opacity-40">{sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Comment</button>
                </div>
              </div>
            )}
          </div>

          <p className="text-[10px] text-slate-400 flex items-center gap-1.5">{saving && <Loader2 size={11} className="animate-spin" />} Changes save automatically.</p>
        </div>
      </div>
    </div>
  );
}
