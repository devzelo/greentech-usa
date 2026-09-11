import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Flag, Gauge, ListChecks, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import type { ApiMilestone, ApiProject } from "../../lib/api";
import { useDialogs } from "../../lib/useDialogs";
import {
  DAY, DEFAULT_MILESTONES, UNIT_LABEL, effectiveEndDate, fmtDate, humanGap, newMilestoneId, parseDate, planSchedule, toIso,
  type MilestoneState,
} from "../../lib/projectSchedule";

/**
 * CR-P (120)-(125) — the project's progress and schedule, inside the project.
 *
 * Without milestones it is the progress bar from the My Projects cards, with the percentage
 * editable in place. Once the project manager sets up the milestones (picked from the usual
 * construction list, each with a duration, run one after another from the start date) the bar
 * becomes the schedule: one segment per milestone, a Today marker, green for the milestones
 * confirmed finished, amber for those whose date has come without a confirmation (the reminder),
 * and the progress counts from the confirmed milestones. Collapsed to one line; click to open.
 */

const SEG: Record<MilestoneState, string> = {
  done: "bg-emerald-500",
  overdue: "bg-amber-400 animate-pulse",
  current: "bg-primary/40",
  upcoming: "bg-slate-200",
};
const DOT: Record<MilestoneState, string> = {
  done: "bg-emerald-500 text-white",
  overdue: "bg-amber-400 text-white",
  current: "bg-primary text-white",
  upcoming: "bg-slate-100 text-slate-500",
};

const fmtLen = (m: Pick<ApiMilestone, "duration" | "unit">) => `${m.duration} ${m.duration === 1 ? UNIT_LABEL[m.unit].replace(/s$/, "") : UNIT_LABEL[m.unit]}`;

export default function ProjectSchedule({ project, canEdit, onSave, userName = "", className = "" }: {
  project: ApiProject;
  canEdit: boolean;
  onSave: (patch: Partial<ApiProject>, message?: string) => Promise<void>;
  userName?: string;
  className?: string;
}) {
  const { confirm, dialogs } = useDialogs();
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState(false);
  const [editingPct, setEditingPct] = useState(false);
  const [busy, setBusy] = useState("");
  // The detail opens as a dropdown over the page (like the notifications), so it closes on a
  // click outside or Escape. The milestone setup and the dialogs render inside `root`, so using
  // them does not count as outside.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!setup && root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !setup) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open, setup]);

  const milestones = useMemo(() => project.schedule?.milestones || [], [project.schedule]);
  const startDate = project.startDate || project.contractDate || "";
  const plan = useMemo(() => planSchedule(milestones, startDate), [milestones, startDate]);
  const hasMs = milestones.length > 0;
  const pct = hasMs ? plan.progress : Math.max(0, Math.min(100, Math.round(project.progress || 0)));
  const end = parseDate(effectiveEndDate(project));   // after an extension, the new end date (126)

  // Keep the stored percentage (used by the lists and reports) in step with the milestones. The
  // whole schedule goes back, so the extensions are kept.
  const saveMilestones = async (next: ApiMilestone[], message?: string) => {
    const progress = next.length ? planSchedule(next, startDate).progress : project.progress;
    await onSave({ schedule: { ...project.schedule, milestones: next }, progress }, message);
  };

  const setDone = async (m: ApiMilestone, done: boolean) => {
    if (done && !(await confirm({ title: "Milestone finished?", message: `Confirm that "${m.name}" is finished. It turns green and counts toward the project's progress.`, confirmLabel: "Yes, it is finished", danger: false }))) return;
    setBusy(m.id);
    try {
      const next = milestones.map((x) => (x.id === m.id ? { ...x, doneAt: done ? toIso(new Date()) : "", doneBy: done ? userName : "" } : x));
      await saveMilestones(next, done ? `"${m.name}" confirmed finished.` : `"${m.name}" is open again.`);
    } catch { /* the workspace shows the error */ } finally { setBusy(""); }
  };

  const overdue = plan.overdue[0];

  return (
    <div ref={root} className={`relative bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>
      {/* Collapsed: one line. */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Gauge size={14} className={pct === 100 ? "text-emerald-500 shrink-0" : "text-slate-400 shrink-0"} />
        <button onClick={() => setOpen((v) => !v)} className="text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0 hidden sm:inline hover:text-primary">
          Progress
        </button>

        {hasMs ? (
          <button onClick={() => setOpen((v) => !v)} className="relative flex-grow min-w-[4rem] h-2.5 flex gap-px rounded-full overflow-hidden bg-slate-100" title="Project milestones">
            {plan.milestones.map((m) => (
              <span key={m.id} className={`h-full ${SEG[m.state]}`} style={{ flexGrow: m.days || 1, flexBasis: 0 }} title={`${m.name}: ${m.state === "done" ? "finished" : m.state === "overdue" ? "due, not confirmed" : m.state === "current" ? "in progress" : "upcoming"}`} />
            ))}
            {plan.todayPct !== null && plan.todayPct < 100 && (
              <span className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-slate-800 rounded" style={{ left: `${plan.todayPct}%` }} title="Today" />
            )}
          </button>
        ) : (
          <div className="flex-grow h-2 rounded-full bg-slate-100 overflow-hidden min-w-[4rem]">
            <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
          </div>
        )}

        {editingPct && !hasMs ? (
          <PercentEditor
            value={pct}
            onCancel={() => setEditingPct(false)}
            onSave={async (v) => { await onSave({ progress: v }, `Progress set to ${v}%.`); setEditingPct(false); }}
          />
        ) : (
          <>
            <span className={`text-xs font-bold shrink-0 ${pct === 100 ? "text-emerald-600" : "text-slate-700"}`}>{pct}%</span>
            {canEdit && !hasMs && (
              <button onClick={() => setEditingPct(true)} title="Change progress" className="p-1 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50 shrink-0">
                <Pencil size={12} />
              </button>
            )}
          </>
        )}

        {/* The reminder: a milestone whose date came without a confirmation. */}
        {overdue && (
          <button onClick={() => setOpen(true)} className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold shrink-0 hover:bg-amber-100" title="Confirm whether it is finished">
            <AlertTriangle size={10} /> {overdue.name} due{plan.overdue.length > 1 ? ` +${plan.overdue.length - 1}` : ""}
          </button>
        )}

        <button onClick={() => setOpen((v) => !v)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 shrink-0" title={open ? "Hide the schedule" : "Show the schedule"}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expanded: the milestones, as a dropdown on top of everything below. */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-[300] bg-white rounded-2xl border border-slate-100 shadow-2xl px-4 py-3 max-h-[70vh] overflow-y-auto">
          {!hasMs ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500 max-w-lg">
                No milestones yet. Set them up (design, mobilization, site work, ...) with how long each takes: the bar then follows the
                schedule, and the progress counts from the milestones the project manager confirms.
              </p>
              {canEdit && (
                <button onClick={() => setSetup(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90">
                  <ListChecks size={13} /> Set up milestones
                </button>
              )}
            </div>
          ) : (
            <>
              <ol className="space-y-1.5">
                {plan.milestones.map((m, i) => (
                  <li key={m.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 ${m.state === "overdue" ? "bg-amber-50/70 ring-1 ring-amber-200" : "bg-slate-50/60"}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${DOT[m.state]}`}>
                      {m.state === "done" ? <Check size={12} /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-grow">
                      <p className="text-sm font-bold text-slate-800 truncate">{m.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {fmtLen(m)}
                        {m.start && m.end && <> · {fmtDate(m.start)} to {fmtDate(m.end)}</>}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold shrink-0">
                      {m.state === "done" && <span className="text-emerald-600">Finished {m.doneAt ? fmtDate(parseDate(m.doneAt)!) : ""}{m.doneBy ? ` · ${m.doneBy}` : ""}</span>}
                      {m.state === "overdue" && m.end && <span className="text-amber-700 inline-flex items-center gap-1"><AlertTriangle size={11} /> Due {fmtDate(m.end)}: is it finished?</span>}
                      {m.state === "current" && <span className="text-primary">In progress</span>}
                      {m.state === "upcoming" && <span className="text-slate-400">Upcoming</span>}
                    </span>
                    {canEdit && (
                      m.state === "done" ? (
                        <button onClick={() => setDone(m, false)} disabled={!!busy} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:bg-white disabled:opacity-50" title="Open it again">
                          {busy === m.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Undo
                        </button>
                      ) : (
                        <button onClick={() => setDone(m, true)} disabled={!!busy} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold disabled:opacity-50 ${m.state === "overdue" ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-white border border-slate-200 text-slate-700 hover:border-emerald-400 hover:text-emerald-700"}`}>
                          {busy === m.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Mark finished
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ol>

              {/* CR-P (125) — the milestones set the project's length: compare with the end date. */}
              <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                <p className="text-[11px] text-slate-500">
                  {!plan.start
                    ? "Set the project start date to see when each milestone is due."
                    : <>Starts {fmtDate(plan.start)} · milestones finish <b className="text-slate-700">{plan.finish ? fmtDate(plan.finish) : "-"}</b>
                      {plan.finish && end && Math.abs(plan.finish.getTime() - end.getTime()) >= DAY && (
                        <span className="text-amber-700"> · {plan.finish > end ? `${humanGap(end, plan.finish)} after` : `${humanGap(plan.finish, end)} before`} the end date ({fmtDate(end)})</span>
                      )}
                    </>}
                </p>
                {canEdit && (
                  <button onClick={() => setSetup(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:text-primary hover:border-primary">
                    <ListChecks size={12} /> Edit milestones
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {setup && (
        <MilestoneSetup
          current={milestones}
          startDate={startDate}
          onClose={() => setSetup(false)}
          onSave={async (next) => { await saveMilestones(next, "Milestones saved."); setSetup(false); setOpen(true); }}
        />
      )}
      {dialogs}
    </div>
  );
}

function PercentEditor({ value, onSave, onCancel }: { value: number; onSave: (v: number) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const v = Math.max(0, Math.min(100, Math.round(Number(draft) || 0)));
  const save = async () => { setSaving(true); try { await onSave(v); } catch { /* shown by the workspace */ } finally { setSaving(false); } };
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <input
        type="number" min={0} max={100} autoFocus value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }}
        className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-primary"
        aria-label="Progress percentage"
      />
      <span className="text-xs font-bold text-slate-500">%</span>
      <button onClick={save} disabled={saving} title="Save progress" className="p-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      </button>
      <button onClick={onCancel} title="Cancel" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50"><X size={12} /></button>
    </div>
  );
}

type Row = { key: string; id: string; name: string; duration: string; unit: ApiMilestone["unit"]; on: boolean; doneAt: string; doneBy: string; custom: boolean };

// CR-P (121)/(122) — pick the milestones that apply from the usual list (or add your own), give
// each a duration and put them in order. They run one after another from the start date.
function MilestoneSetup({ current, startDate, onSave, onClose }: {
  current: ApiMilestone[];
  startDate: string;
  onSave: (next: ApiMilestone[]) => Promise<void>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const have = new Set(current.map((m) => m.name.trim().toLowerCase()));
    const mine: Row[] = current.map((m) => ({ key: m.id, id: m.id, name: m.name, duration: String(m.duration), unit: m.unit, on: true, doneAt: m.doneAt, doneBy: m.doneBy, custom: !DEFAULT_MILESTONES.some((d) => d.name.toLowerCase() === m.name.trim().toLowerCase()) }));
    const rest: Row[] = DEFAULT_MILESTONES.filter((d) => !have.has(d.name.toLowerCase())).map((d) => {
      const id = newMilestoneId();
      return { key: id, id, name: d.name, duration: String(d.duration), unit: d.unit, on: current.length === 0, doneAt: "", doneBy: "", custom: false };
    });
    return [...mine, ...rest];
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => setRows((rs) => {
    const j = i + d;
    if (j < 0 || j >= rs.length) return rs;
    const next = [...rs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const chosen: ApiMilestone[] = rows
    .filter((r) => r.on && r.name.trim())
    .map((r) => ({ id: r.id, name: r.name.trim(), duration: Math.max(0, Number(r.duration) || 0), unit: r.unit, doneAt: r.doneAt, doneBy: r.doneBy }));
  const preview = planSchedule(chosen, startDate);

  const save = async () => { setSaving(true); try { await onSave(chosen); } catch { /* shown by the workspace */ } finally { setSaving(false); } };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Flag size={18} className="text-primary" /> Project milestones</h3>
            <p className="text-xs text-slate-500 mt-1">Tick the milestones this project has, give each a duration and put them in order. They run one after another from the start date.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-2">
          {rows.map((r, i) => (
            <div key={r.key} className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${r.on ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50/60"}`}>
              <input type="checkbox" checked={r.on} onChange={(e) => set(r.key, { on: e.target.checked })} className="w-4 h-4 accent-emerald-600" aria-label={`Include ${r.name || "milestone"}`} />
              <input
                value={r.name}
                onChange={(e) => set(r.key, { name: e.target.value })}
                placeholder="Milestone name"
                className={`flex-grow min-w-[10rem] px-2 py-1 rounded-lg border border-transparent hover:border-slate-200 focus:border-primary focus:outline-none text-sm font-bold ${r.on ? "text-slate-800" : "text-slate-400"}`}
              />
              {r.doneAt && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">Finished</span>}
              <input
                type="number" min={0} step="any" value={r.duration}
                onChange={(e) => set(r.key, { duration: e.target.value })}
                disabled={!r.on}
                className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-sm text-slate-800 focus:border-primary focus:outline-none disabled:bg-slate-50"
                aria-label="Duration"
              />
              <select value={r.unit} onChange={(e) => set(r.key, { unit: e.target.value as Row["unit"] })} disabled={!r.on} className="px-2 py-1 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white disabled:bg-slate-50">
                <option value="days">days</option>
                <option value="weeks">weeks</option>
                <option value="months">months</option>
              </select>
              <div className="flex items-center">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Move up"><ArrowUp size={13} /></button>
                <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Move down"><ArrowDown size={13} /></button>
                {r.custom && (
                  <button onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="p-1 rounded text-slate-400 hover:text-red-600" title="Remove"><Trash2 size={13} /></button>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={() => { const id = newMilestoneId(); setRows((rs) => [...rs, { key: id, id, name: "", duration: "1", unit: "months", on: true, doneAt: "", doneBy: "", custom: true }]); }}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 border-dashed border-slate-200 text-xs font-bold text-slate-500 hover:text-primary hover:border-primary"
          >
            <Plus size={13} /> Add a milestone
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            {chosen.length} milestone{chosen.length === 1 ? "" : "s"}
            {preview.start && preview.finish ? <> · {fmtDate(preview.start)} to <b className="text-slate-700">{fmtDate(preview.finish)}</b> ({humanGap(preview.start, preview.finish)})</> : " · set the start date to see the dates"}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50">
              {saving && <Loader2 size={12} className="animate-spin" />} Save milestones
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
