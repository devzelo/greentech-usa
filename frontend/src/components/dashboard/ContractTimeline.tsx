import { useState } from "react";
import { CalendarClock, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

/**
 * CR-PR-14 — how much contract time is left on a project.
 *
 * This is NOT progress on the work: it only measures the calendar between the contract date
 * and the deadline. Collapsed it is a single line (bar + time left); clicking expands it to
 * the full picture — both dates, percentages, and a "Today" marker on the track.
 */

const DAY = 86400000;

/** Parse a stored date. Returns null for blanks and anything unparseable. */
function parseDate(v?: string): Date | null {
  if (!v || !v.trim()) return null;
  const d = new Date(v.trim());
  return isNaN(d.getTime()) ? null : d;
}

const fmt = (d: Date) => d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

/**
 * Add whole months, clamping to the end of a shorter month. Plain setMonth() overflows —
 * Jan 31 + 1 month lands in March — which silently overstates the months remaining.
 */
function addMonths(d: Date, n: number): Date {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d.getDate(), lastDay));
  return t;
}

/** "7 months 12 days" — months first so long contracts stay readable. */
function humanGap(from: Date, to: Date): string {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (months > 0 && addMonths(from, months) > to) months -= 1;
  if (months < 0) months = 0;
  const anchor = addMonths(from, months);
  const days = Math.max(0, Math.round((to.getTime() - anchor.getTime()) / DAY));
  if (months <= 0 && days <= 0) return "today";
  if (months <= 0) return `${days} day${days === 1 ? "" : "s"}`;
  if (days <= 0) return `${months} month${months === 1 ? "" : "s"}`;
  return `${months} month${months === 1 ? "" : "s"} ${days} day${days === 1 ? "" : "s"}`;
}

export default function ContractTimeline({ startDate, endDate, className = "" }: {
  /** Contract / start date. Falls back to nothing shown if absent. */
  startDate?: string;
  /** Deadline. Required — with no deadline there is no time to count down. */
  endDate?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!end) return null;                       // nothing to count down to

  const now = new Date();
  // Whole days only, so the bar moves once a day rather than by the millisecond.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const overdue = today > end;
  const total = start ? Math.max(1, end.getTime() - start.getTime()) : 0;
  const done = start ? today.getTime() - start.getTime() : 0;
  const pct = start ? Math.min(100, Math.max(0, (done / total) * 100)) : overdue ? 100 : 0;

  const left = overdue ? humanGap(end, today) : humanGap(today, end);
  const headline = overdue ? `${left} overdue` : `${left} remaining`;

  const barColor = overdue ? "bg-red-500" : pct > 85 ? "bg-amber-500" : "bg-primary";

  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>
      {/* Collapsed: one line — click anywhere to see the detail. */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
        title={open ? "Hide contract timeline" : "Show contract timeline"}
      >
        <CalendarClock size={14} className={overdue ? "text-red-500 shrink-0" : "text-slate-400 shrink-0"} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0 hidden sm:inline">Contract time</span>
        <div className="flex-grow h-2 rounded-full bg-slate-100 overflow-hidden min-w-[4rem]">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${start ? pct : 100}%` }} />
        </div>
        <span className={`text-xs font-bold shrink-0 ${overdue ? "text-red-600" : "text-slate-700"}`}>
          {overdue && <AlertTriangle size={11} className="inline mb-0.5 mr-1" />}{headline}
        </span>
        {open ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
      </button>

      {/* Expanded: the full picture. */}
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-50">
          <div className="flex items-end gap-4 sm:gap-6">
            <div className="shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Start date</p>
              <p className="text-sm font-bold text-slate-900">{start ? fmt(start) : "—"}</p>
            </div>

            <div className="flex-grow min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-bold text-slate-500">{start ? `${Math.round(pct)}% elapsed` : "No start date set"}</span>
                <span className={`text-sm font-bold ${overdue ? "text-red-600" : "text-slate-900"}`}>{headline}</span>
              </div>
              {/* Track with a Today marker sitting at the elapsed position. */}
              <div className="relative h-2.5 rounded-full bg-slate-100">
                <div className={`absolute inset-y-0 left-0 rounded-full ${barColor}`} style={{ width: `${start ? pct : 100}%` }} />
                {start && !overdue && (
                  <div className="absolute -top-1 -bottom-1 w-px bg-slate-700" style={{ left: `${pct}%` }} title="Today" />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-[11px] font-bold text-slate-500">{start ? `${Math.round(100 - pct)}% remaining` : ""}</span>
                <span className="text-[10px] text-slate-400">Auto-updates daily</span>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">End date</p>
              <p className={`text-sm font-bold ${overdue ? "text-red-600" : "text-slate-900"}`}>{fmt(end)}</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-3">Calendar time between the start and end dates — not a measure of work completed.</p>
        </div>
      )}
    </div>
  );
}
