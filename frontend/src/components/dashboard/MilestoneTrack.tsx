import { useMemo } from "react";
import { AlertTriangle, Flag } from "lucide-react";
import type { ApiProject } from "../../lib/api";
import { MILESTONE_SEG, MILESTONE_STATE_LABEL, fmtDate, milestoneFocus, planSchedule } from "../../lib/projectSchedule";

/**
 * A project's progress wherever projects are listed (My / All Projects table and cards). With
 * milestones set up it shows the schedule: one segment per milestone (green finished, amber due
 * without a confirmation, tinted in progress), a Today marker, how many are finished and where the
 * project is now. Without milestones it is the plain percentage bar.
 */
export default function MilestoneTrack({ project, compact = false }: { project: ApiProject; compact?: boolean }) {
  const milestones = useMemo(() => project.schedule?.milestones || [], [project.schedule]);
  const startDate = project.startDate || project.contractDate || "";
  const plan = useMemo(() => planSchedule(milestones, startDate), [milestones, startDate]);
  const hasMs = milestones.length > 0;
  const pct = hasMs ? plan.progress : Math.max(0, Math.min(100, Math.round(project.progress || 0)));
  const f = milestoneFocus(plan);
  const h = compact ? "h-1.5" : "h-2";

  const bar = hasMs ? (
    <div className={`relative w-full ${h} flex gap-px rounded-full overflow-hidden bg-slate-100`} role="img" aria-label={`${pct}% complete, ${f.done} of ${f.total} milestones finished`}>
      {plan.milestones.map((m) => (
        <span key={m.id} className={`h-full ${MILESTONE_SEG[m.state]}`} style={{ flexGrow: m.days || 1, flexBasis: 0 }} title={`${m.name}: ${MILESTONE_STATE_LABEL[m.state]}`} />
      ))}
      {plan.todayPct !== null && plan.todayPct < 100 && (
        <span className="absolute inset-y-0 w-0.5 bg-slate-800 rounded" style={{ left: `${plan.todayPct}%` }} title="Today" />
      )}
    </div>
  ) : (
    <div className={`${h} w-full bg-slate-100 rounded-full overflow-hidden`}>
      <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
    </div>
  );

  // Where the project is now: an overdue confirmation first, else the milestone in progress, the next one, or all done.
  const status = !hasMs ? null
    : f.overdue.length ? (
      <span className="text-amber-700 inline-flex items-center gap-1 min-w-0" title="Due without a confirmation: open the project to confirm it">
        <AlertTriangle size={10} className="shrink-0" /><span className="truncate">{f.overdue[0].name} due{f.overdue.length > 1 ? ` +${f.overdue.length - 1}` : ""}</span>
      </span>
    ) : f.current ? (
      <span className="text-primary inline-flex items-center gap-1 min-w-0" title="Milestone in progress">
        <Flag size={10} className="shrink-0" /><span className="truncate">{f.current.name}{!compact && f.current.end ? ` · until ${fmtDate(f.current.end)}` : ""}</span>
      </span>
    ) : f.next ? (
      <span className="text-slate-500 truncate">Next: {f.next.name}{!compact && f.next.start ? ` · from ${fmtDate(f.next.start)}` : ""}</span>
    ) : f.done === f.total ? (
      <span className="text-emerald-600">All milestones finished</span>
    ) : null;

  if (compact) {
    return (
      <div className="w-40 space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-400">
          <span>{pct}%</span>
          {hasMs && <span title="Milestones finished">{f.done}/{f.total} milestones</span>}
        </div>
        {bar}
        {status && <div className="text-[10px] font-bold flex min-w-0">{status}</div>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        <span>Progress{hasMs ? ` · ${f.done} of ${f.total} milestones` : ""}</span><span>{pct}%</span>
      </div>
      {bar}
      {status && <div className="text-[11px] font-bold flex min-w-0">{status}</div>}
    </div>
  );
}
