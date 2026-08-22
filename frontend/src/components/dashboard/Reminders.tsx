import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bell, BellPlus, Loader2, Trash2, Pencil, X, ExternalLink, AlarmClock, AlertTriangle, Briefcase } from "lucide-react";
import NotificationsPanel from "./NotificationsPanel";
import {
  fetchReminders, createReminder, updateReminder, deleteReminder, fetchProjects, getAuthUser,
  type ApiReminder, type ReminderStatus, type ApiProject,
} from "../../lib/api";
import { localDateTime } from "./ReminderButton";
import { useMeta } from "../../hooks/useMeta";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";

// My Reminders — set against any project, tracked through Pending → In progress → Completed /
// Cancelled. The status is a dropdown on each row that moves it between the tabs; each tab can
// be filtered to one project; overdue reminders raise a red alert at the top.

const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/10";

const STATUS_META: Record<ReminderStatus, { label: string; cls: string }> = {
  Pending:    { label: "Pending",     cls: "bg-amber-50 text-amber-600" },
  InProgress: { label: "In progress", cls: "bg-blue-50 text-blue-600" },
  Completed:  { label: "Completed",   cls: "bg-emerald-50 text-emerald-600" },
  Cancelled:  { label: "Cancelled",   cls: "bg-slate-100 text-slate-400" },
};
const STATUS_ORDER: ReminderStatus[] = ["Pending", "InProgress", "Completed", "Cancelled"];

const SNOOZE: Array<{ label: string; minutes: number }> = [
  { label: "1 hour", minutes: 60 },
  { label: "Tomorrow", minutes: 60 * 24 },
  { label: "Next week", minutes: 60 * 24 * 7 },
];

const when = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};
const isOpen = (r: ApiReminder) => r.status === "Pending" || r.status === "InProgress";
const isOverdue = (r: ApiReminder) => isOpen(r) && new Date(r.dueAt).getTime() < Date.now();

type Tab = ReminderStatus | "All";
const TABS: Tab[] = ["Pending", "InProgress", "Completed", "Cancelled", "All"];

export default function Reminders() {
  useMeta({ title: "My Reminders", description: "Your reminders for tasks, projects and documents." });
  const navigate = useNavigate();
  const [list, setList] = useState<ApiReminder[]>([]);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("Pending");
  const [projectFilter, setProjectFilter] = useState("all");  // per-tab project filter
  const [busy, setBusy] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ id: string | null } | null>(null);
  const [form, setForm] = useState({ title: "", notes: "", dueAt: localDateTime(60), emailEnabled: false, link: "", projectId: "" });
  const [saving, setSaving] = useState(false);
  const { confirm, dialogs } = useDialogs();
  // Top-level view: the reminders list, or the full notifications history (?view=notifications,
  // linked from the bell's "See all notifications").
  const [searchParams, setSearchParams] = useSearchParams();
  const view: "reminders" | "notifications" = searchParams.get("view") === "notifications" ? "notifications" : "reminders";
  const setView = (v: "reminders" | "notifications") => {
    const next = new URLSearchParams(searchParams);
    if (v === "notifications") next.set("view", "notifications"); else next.delete("view");
    setSearchParams(next, { replace: true });
  };

  const load = async () => {
    setLoading(true);
    try {
      // Staff (admin/employee) can pick any project they can access ("all"); guests & partners
      // only see the projects they are assigned to ("mine"). "mine" for staff would be empty
      // unless they happen to own or be assigned to a project.
      const scope = getAuthUser()?.role === "subcontractor" ? "mine" : "all";
      const [rem, projs] = await Promise.all([
        fetchReminders(),
        fetchProjects(scope).catch(() => [] as ApiProject[]),
      ]);
      setList(rem); setProjects(projs);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not load reminders.", "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const patch = (r: ApiReminder) => setList((p) => p.map((x) => (x._id === r._id ? r : x)));

  // Projects that actually have a reminder — the filter only offers those.
  const projectsInTab = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of list) if (r.projectId) m.set(r.projectId, r.projectName || r.projectId);
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [list]);

  const shown = useMemo(() => {
    let rows = tab === "All" ? list : list.filter((r) => r.status === tab);
    if (projectFilter !== "all") rows = rows.filter((r) => r.projectId === projectFilter);
    return [...rows].sort((a, b) => {
      // Group by project (so a project's reminders sit together), then by due date.
      const pn = (a.projectName || "").localeCompare(b.projectName || "");
      return pn !== 0 ? pn : new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });
  }, [list, tab, projectFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { Pending: 0, InProgress: 0, Completed: 0, Cancelled: 0, All: list.length };
    for (const r of list) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [list]);
  const overdue = useMemo(() => list.filter(isOverdue), [list]);

  const openNew = () => { setForm({ title: "", notes: "", dueAt: localDateTime(60), emailEnabled: false, link: "", projectId: "" }); setEditor({ id: null }); };
  const openEdit = (r: ApiReminder) => {
    const d = new Date(r.dueAt); const pad = (v: number) => String(v).padStart(2, "0");
    setForm({
      title: r.title, notes: r.notes, emailEnabled: r.emailEnabled, link: r.link, projectId: r.projectId || "",
      dueAt: isNaN(d.getTime()) ? localDateTime(60) : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    });
    setEditor({ id: r._id });
  };
  const save = async () => {
    if (!form.title.trim()) { toast("Give the reminder a title.", "error"); return; }
    if (isNaN(new Date(form.dueAt).getTime())) { toast("Pick a valid date and time.", "error"); return; }
    setSaving(true);
    try {
      const proj = projects.find((p) => p.id === form.projectId);
      const body = {
        title: form.title.trim(), notes: form.notes, dueAt: new Date(form.dueAt).toISOString(),
        emailEnabled: form.emailEnabled,
        // Default the link to the chosen project when the user didn't type one.
        link: form.link || (proj ? `/dashboard/projects/${proj.id}` : ""),
        projectId: form.projectId, projectName: proj?.name || "",
        contextLabel: proj ? `Project · ${proj.name}` : "",
      };
      if (editor?.id) patch(await updateReminder(editor.id, body));
      else { const created = await createReminder(body); setList((p) => [created, ...p]); }
      setEditor(null);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save.", "error"); }
    finally { setSaving(false); }
  };
  // The per-row status dropdown moves the reminder between tabs.
  const setStatus = async (r: ApiReminder, status: ReminderStatus) => {
    setBusy(r._id);
    try { patch(await updateReminder(r._id, { status })); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
    finally { setBusy(null); }
  };
  const snooze = async (r: ApiReminder, minutes: number) => {
    setBusy(r._id);
    try { patch(await updateReminder(r._id, { dueAt: new Date(Date.now() + minutes * 60_000).toISOString() })); toast("Snoozed.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not snooze.", "error"); }
    finally { setBusy(null); }
  };
  const remove = async (r: ApiReminder) => {
    if (!(await confirm({ title: "Delete reminder?", message: `"${r.title}" will be removed.`, confirmLabel: "Delete" }))) return;
    try { await deleteReminder(r._id); setList((p) => p.filter((x) => x._id !== r._id)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* View switch — Reminders vs. the full Notifications history. */}
      <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-max">
        {([["reminders", "My Reminders"], ["notifications", "Notifications"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${view === v ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}>
            {v === "reminders" ? <Bell size={14} /> : <AlarmClock size={14} />}{label}
          </button>
        ))}
      </div>

      {view === "notifications" ? (
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 mb-1">Notifications</h1>
          <p className="text-sm text-slate-500 mb-5">Everything the platform has notified you about — assignments, agreements, shared documents and due reminders.</p>
          <NotificationsPanel />
        </div>
      ) : (
      <>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary mb-2"><Bell size={18} /><span className="text-xs font-bold uppercase tracking-widest">Reminders</span></div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">My Reminders</h1>
          <p className="text-sm text-slate-500 mt-1">{loading ? "Loading…" : `${counts.Pending + counts.InProgress} open. You're notified in-app when one falls due.`}</p>
        </div>
        <button onClick={openNew} className="bg-gt-gradient text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all self-start">
          <BellPlus size={18} /> New Reminder
        </button>
      </div>

      {/* Overdue alert — eye-catching, sits right at the top when anything is late. */}
      {!loading && overdue.length > 0 && (
        <button onClick={() => { setTab("Pending"); setProjectFilter("all"); }} className="w-full flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-3 text-left hover:bg-red-100/60 transition-colors">
          <AlertTriangle size={20} className="text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-700">{overdue.length} reminder{overdue.length === 1 ? " is" : "s are"} overdue</p>
            <p className="text-[11px] text-red-500 font-medium">{overdue.slice(0, 3).map((r) => r.title).join(" · ")}{overdue.length > 3 ? " …" : ""}</p>
          </div>
        </button>
      )}

      {/* Status tabs + per-tab project filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-max">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${tab === t ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}>
                {t === "All" ? "All" : STATUS_META[t].label}
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${tab === t ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{counts[t] || 0}</span>
              </button>
            ))}
          </div>
        </div>
        {projectsInTab.length > 0 && (
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="bg-white border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 outline-none shadow-sm">
            <option value="all">All projects</option>
            {projectsInTab.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-300"><Loader2 size={28} className="animate-spin" /></div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 bg-white rounded-[2rem] border border-slate-100">
          <AlarmClock size={38} className="mb-3" />
          <p className="font-bold text-sm">No reminders here.</p>
          <p className="text-xs mt-1">Create one, or use "Remind me" on any record in the platform.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((r, i) => {
            const over = isOverdue(r);
            return (
              <div key={r._id} className={`bg-white rounded-2xl border p-4 ${over ? "border-red-200 bg-red-50/30" : "border-slate-100"}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <span className="text-xs font-bold text-slate-300 tabular-nums pt-0.5 shrink-0 w-6 text-right">{i + 1}</span>
                  <div className="min-w-0 flex-grow">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-bold ${r.status === "Completed" || r.status === "Cancelled" ? "text-slate-400 line-through" : "text-slate-900"}`}>{r.title}</p>
                      {over && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[9px] font-bold uppercase tracking-widest">Overdue</span>}
                      {/* CR-P-17 — the project is named on every reminder and links to that project. */}
                      {r.projectName && (
                        r.projectId
                          ? <button onClick={() => navigate(`/dashboard/projects/${r.projectId}`)} title={`Open ${r.projectName}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-primary hover:text-white text-[9px] font-bold transition-colors"><Briefcase size={9} /> {r.projectName}</button>
                          : <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-bold">{r.projectName}</span>
                      )}
                    </div>
                    <p className={`text-[11px] mt-0.5 font-bold ${over ? "text-red-500" : "text-slate-400"}`}>{when(r.dueAt)}</p>
                    {r.notes && <p className="text-[11px] text-slate-500 mt-1 whitespace-pre-wrap"><span className="font-bold text-slate-400">Remarks:</span> {r.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Status dropdown — moves the reminder to the matching tab. */}
                    <select value={r.status} disabled={busy === r._id} onChange={(e) => setStatus(r, e.target.value as ReminderStatus)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold outline-none cursor-pointer border-0 ${STATUS_META[r.status].cls}`}>
                      {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                    </select>
                    {r.link && <button onClick={() => navigate(r.link)} title="Open the related record" className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50"><ExternalLink size={15} /></button>}
                    <button onClick={() => openEdit(r)} title="Edit" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50"><Pencil size={15} /></button>
                    <button onClick={() => remove(r)} title="Delete" className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                  </div>
                </div>
                {isOpen(r) && (
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Snooze</span>
                    {SNOOZE.map((s) => (
                      <button key={s.label} onClick={() => snooze(r, s.minutes)} disabled={busy === r._id} className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-primary hover:text-white disabled:opacity-50">{s.label}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {dialogs}

      {editor && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-16" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">{editor.id ? "Edit reminder" : "New reminder"}</p>
              <button onClick={() => setEditor(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Title
                <input className={`${inp} mt-1`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Finish the vendor agreement" /></label>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project
                <select className={`${inp} mt-1`} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                  <option value="">— none —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></label>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Remarks
                <textarea rows={3} className={`${inp} mt-1 resize-y`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Quick options</p>
                <div className="flex flex-wrap gap-1.5">
                  {[{ label: "In 1 hour", m: 60 }, { label: "Tomorrow", m: 1440 }, { label: "Next week", m: 10080 }, { label: "Next month", m: 43200 }].map((q) => (
                    <button key={q.label} onClick={() => setForm({ ...form, dueAt: localDateTime(q.m) })} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-primary hover:text-white">{q.label}</button>
                  ))}
                </div>
              </div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date &amp; time
                <input type="datetime-local" className={`${inp} mt-1`} value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></label>
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                <input type="checkbox" checked={form.emailEnabled} onChange={(e) => setForm({ ...form, emailEnabled: e.target.checked })} />
                Also email me when it's due
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setEditor(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Cancel</button>
                <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{saving && <Loader2 size={12} className="animate-spin" />} {editor.id ? "Save changes" : "Set reminder"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
