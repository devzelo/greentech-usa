import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CalendarDays, Check, Clock, Flag, GanttChart, Loader2, Pencil, X } from "lucide-react";
import type { ApiExtension, ApiProject } from "../../../lib/api";
import {
  DAY, daysBetween, effectiveEndDate, fmtDay, fmtShort, humanGap, isMilestonePoint, milestoneFocus, parseDate, phaseColor, planSchedule,
  type PlannedMilestone,
} from "../../../lib/projectSchedule";
import ExtensionsPanel from "./ExtensionsPanel";

/**
 * CR 192: Progress and Contract Time as one card: contract start → deadline with the time
 * elapsed (green) and a Today marker, the work complete (blue), and the phases from the timeline
 * as dots in date order. The full table lives in Project Management > Timeline / Milestones.
 */
export default function TimelineBar({ project, canEdit, onOpenTimeline, onSaveExtensions, onSaveProgress, userName = "", className = "" }: {
  project: ApiProject;
  canEdit: boolean;
  onOpenTimeline?: () => void;
  onSaveExtensions?: (next: ApiExtension[], message: string) => Promise<void>;
  /** Projects without a timeline keep a hand-set percentage. */
  onSaveProgress?: (pct: number) => Promise<void>;
  userName?: string;
  className?: string;
}) {
  const [extOpen, setExtOpen] = useState(false);
  const extRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!extOpen) return;
    const onDown = (e: MouseEvent) => { if (extRef.current && !extRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[role=dialog], .fixed")) setExtOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExtOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [extOpen]);

  const milestones = useMemo(() => (project.schedule?.milestones || []).filter((m) => m.status !== "cancelled"), [project.schedule]);
  const contractStart = parseDate(project.startDate || project.contractDate);
  const origEnd = parseDate(project.endDate);
  const deadline = parseDate(effectiveEndDate(project));
  const extended = !!(deadline && origEnd && deadline > origEnd);
  const plan = useMemo(() => planSchedule(milestones, project.startDate || project.contractDate, new Date(), effectiveEndDate(project)), [milestones, project]);
  const hasMs = milestones.length > 0;
  const workPct = hasMs ? plan.progress : Math.max(0, Math.min(100, Math.round(project.progress || 0)));
  const focus = milestoneFocus(plan);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // The track runs over the contract; phases outside it widen it.
  const trackStart = plan.start || contractStart;
  const trackEnd = plan.finish || deadline;
  const span = trackStart && trackEnd ? Math.max(DAY, trackEnd.getTime() - trackStart.getTime()) : 0;
  const pos = (d: Date) => (trackStart && span ? Math.max(0, Math.min(100, ((d.getTime() - trackStart.getTime()) / span) * 100)) : 0);
  const todayPct = trackStart && span ? pos(today) : null;
  const elapsedPct = contractStart && deadline && deadline > contractStart
    ? Math.max(0, Math.min(100, (daysBetween(contractStart, today) / daysBetween(contractStart, deadline)) * 100)) : null;
  const overdue = !!(deadline && today > deadline && workPct < 100);
  const remaining = deadline ? (overdue ? `${humanGap(deadline, today)} overdue` : humanGap(today, deadline)) : "";
  const remainingDays = deadline ? Math.abs(daysBetween(today, deadline)) : 0;

  const dots: PlannedMilestone[] = plan.milestones.filter((m) => m.start).sort((a, b) => a.start!.getTime() - b.start!.getTime());
  const undated = plan.milestones.filter((m) => !m.start).length;

  if (!contractStart && !deadline && !hasMs) {
    return (
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 ${className}`}>
        <p className="flex items-center gap-2 text-xs text-slate-500"><CalendarClock size={14} className="text-slate-400" /> No contract dates or timeline yet.</p>
        {onOpenTimeline && <button type="button" onClick={onOpenTimeline} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary"><GanttChart size={13} /> Set up the timeline</button>}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-slate-100 bg-white shadow-sm ${className}`}>
      {/* Contract start · time remaining · deadline · work complete */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pt-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500"><CalendarDays size={15} /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Contract start</p>
            <p className="truncate text-sm font-bold text-slate-900">{contractStart ? fmtDay(contractStart) : "Not set"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={18} className={overdue ? "text-red-500" : "text-emerald-500"} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{overdue ? "Past the deadline" : "Time remaining"}</p>
            <p className={`text-base font-bold ${overdue ? "text-red-600" : "text-emerald-600"}`}>
              {deadline ? remaining : "No deadline"}
              {deadline && <span className="ml-1.5 text-[11px] font-semibold text-slate-400">({remainingDays} day{remainingDays === 1 ? "" : "s"})</span>}
            </p>
          </div>
        </div>
        <div ref={extRef} className="relative flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500"><CalendarDays size={15} /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{extended ? "Extended deadline" : "Contract deadline"}</p>
            <button type="button" onClick={() => setExtOpen((v) => !v)} title="Extensions of time" className={`flex items-center gap-1 truncate text-sm font-bold hover:underline ${extended ? "text-violet-700" : "text-slate-900"}`}>
              {deadline ? fmtDay(deadline) : "Not set"}
              {extended && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">Extended</span>}
            </button>
            {extended && origEnd && <p className="text-[10px] text-slate-400 line-through">{fmtDay(origEnd)}</p>}
          </div>
          {extOpen && (
            <div className="absolute right-0 top-full z-[70] mt-2 w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-slate-100 bg-white p-4 shadow-2xl">
              <ExtensionsPanel endDate={project.endDate} extensions={project.schedule?.extensions} canEdit={canEdit} onSave={onSaveExtensions} userName={userName} />
            </div>
          )}
        </div>
        <WorkComplete pct={workPct} hasMs={hasMs} canEdit={canEdit && !hasMs && !!onSaveProgress} onSave={onSaveProgress} detail={hasMs ? `${focus.done} of ${focus.total} phases complete` : "Set by hand"} />
      </div>

      {/* The track */}
      <div className="px-4 pt-3">
        <div className="relative h-7">
          {todayPct !== null && (
            <div className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${todayPct}%` }}>
              <span className="text-[9px] font-bold text-slate-500">Today</span>
            </div>
          )}
        </div>
        <div className="relative h-2.5 rounded-full bg-slate-100">
          {contractStart && deadline && (
            <>
              {extended && origEnd && <div className="absolute inset-y-0 rounded-r-full bg-violet-100" style={{ left: `${pos(origEnd)}%`, right: `${100 - pos(deadline)}%` }} title={`Extension: ${fmtDay(origEnd)} to ${fmtDay(deadline)}`} />}
              <div className={`absolute inset-y-0 rounded-full ${overdue ? "bg-red-500" : "bg-emerald-500"}`} style={{ left: `${pos(contractStart)}%`, width: `${Math.max(0, pos(today > deadline ? deadline : today) - pos(contractStart))}%` }} />
            </>
          )}
          {/* Phase start markers, by date */}
          {dots.map((m) => (
            <span key={m.id} className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded bg-white/90 ring-1" style={{ left: `${pos(m.start!)}%`, ["--tw-ring-color" as string]: phaseColor(m) }} title={`${m.name}: ${fmtDay(m.start)}`} />
          ))}
          {todayPct !== null && <span className="absolute -top-1.5 -bottom-1.5 w-0.5 -translate-x-1/2 rounded bg-blue-600" style={{ left: `${todayPct}%` }} />}
          {elapsedPct !== null && (
            <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-700 shadow-sm" style={{ left: `${Math.max(6, Math.min(94, pos(contractStart!) + (pos(today > deadline! ? deadline! : today) - pos(contractStart!)) / 2))}%` }}>
              {Math.round(elapsedPct)}% elapsed
            </span>
          )}
        </div>
      </div>

      {/* Phases in date order */}
      <div className="px-2 pb-3 pt-4">
        {dots.length ? (
          <div className="overflow-x-auto">
            <ol className="flex min-w-max items-start px-2">
              {dots.map((m, i) => <Fragment key={m.id}><Dot m={m} first={i === 0} last={i === dots.length - 1} /></Fragment>)}
            </ol>
          </div>
        ) : (
          <p className="px-2 text-[11px] text-slate-400">{hasMs ? "Add planned dates to the phases to place them on the timeline." : "No phases yet."}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-2">
          <p className="text-[10px] text-slate-400">
            {focus.overdue.length > 0 && <span className="mr-2 inline-flex items-center gap-1 font-bold text-amber-600"><AlertTriangle size={11} /> {focus.overdue.length} past planned end</span>}
            {undated > 0 && `${undated} phase${undated === 1 ? "" : "s"} without dates. `}
            Time elapsed is calendar time; work complete comes from the phases.
          </p>
          {onOpenTimeline && (
            <button type="button" onClick={onOpenTimeline} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary">
              <GanttChart size={13} /> {canEdit ? "Edit timeline" : "Open timeline"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Dot({ m, first, last }: { m: PlannedMilestone; first: boolean; last: boolean }) {
  const color = phaseColor(m);
  const point = isMilestonePoint(m);
  const done = m.state === "done";
  return (
    <li className="relative flex w-28 shrink-0 flex-col items-center text-center">
      <span className="mb-1 text-[10px] font-bold text-slate-600">{m.start ? fmtShort(m.start) : ""}</span>
      <div className="relative flex w-full items-center justify-center">
        {!first && <span className="absolute left-0 right-1/2 top-1/2 h-px bg-slate-200" />}
        {!last && <span className="absolute left-1/2 right-0 top-1/2 h-px bg-slate-200" />}
        <span
          className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-[3px] bg-white"
          style={{ borderColor: m.state === "overdue" ? "#f59e0b" : color, background: done ? color : "#fff" }}
          title={`${m.name}${m.start ? `: ${fmtDay(m.start)}` : ""}${m.end && !point ? ` to ${fmtDay(m.end)}` : ""}`}
        >
          {point ? <Flag size={11} style={{ color: done ? "#fff" : color }} /> : done ? <Check size={11} className="text-white" strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.state === "overdue" ? "#f59e0b" : color }} />}
        </span>
      </div>
      <span className="mt-1 line-clamp-2 px-1 text-[10px] font-semibold leading-tight text-slate-700">{m.name}</span>
    </li>
  );
}

function WorkComplete({ pct, hasMs, canEdit, onSave, detail }: { pct: number; hasMs: boolean; canEdit: boolean; onSave?: (v: number) => Promise<void>; detail: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(pct));
  const [busy, setBusy] = useState(false);
  const r = 16, c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-2" title={hasMs ? "Work complete, from the phases' % complete" : "Work complete"}>
      <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Work complete</p>
        {editing ? (
          <form className="flex items-center gap-1" onSubmit={async (e) => { e.preventDefault(); const v = Math.max(0, Math.min(100, Math.round(Number(val)))); if (!onSave || !isFinite(v)) return; setBusy(true); try { await onSave(v); setEditing(false); } finally { setBusy(false); } }}>
            <input autoFocus type="number" min={0} max={100} value={val} onChange={(e) => setVal(e.target.value)} className="w-14 rounded-md border border-slate-200 px-1.5 py-0.5 text-sm font-bold" />
            <button type="submit" disabled={busy} className="rounded p-0.5 text-emerald-600 hover:bg-emerald-50">{busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100"><X size={13} /></button>
          </form>
        ) : (
          <p className="flex items-center gap-1 text-base font-bold text-blue-600">
            {pct}%
            {canEdit && <button type="button" onClick={() => { setVal(String(pct)); setEditing(true); }} className="rounded p-0.5 text-slate-400 hover:text-primary" title="Change"><Pencil size={11} /></button>}
          </p>
        )}
        <p className="text-[10px] text-slate-400">{detail}</p>
      </div>
    </div>
  );
}
