import { useMemo } from "react";
import { Flag } from "lucide-react";
import type { ApiMilestone } from "../../../lib/api";
import { DAY, delayDays, fmtDay, isMilestonePoint, parseDate, phaseColor, phasePercent } from "../../../lib/projectSchedule";

/**
 * CR 189: the timeline as a Gantt chart: each phase's planned bar (with its % complete filled
 * in), the actual dates as a dashed bar under it, and the original baseline as a faint band, on a
 * month grid with Today and the contract deadline marked. Phases may overlap freely.
 */

export const GANTT_ROW = 40;
const MONTH_W = 56;

export default function GanttChart({ rows, contractStart, deadline, originalDeadline, labels = true }: {
  rows: ApiMilestone[];
  contractStart?: string;
  deadline?: string;
  originalDeadline?: string;
  /** Show the phase names in a left column (off when the table sits beside it). */
  labels?: boolean;
}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const { from, months } = useMemo(() => {
    const dates: Date[] = [];
    for (const m of rows) for (const v of [m.plannedStart, m.plannedEnd, m.actualStart, m.actualEnd, m.baselineStart, m.baselineEnd]) { const d = parseDate(v); if (d) dates.push(d); }
    for (const v of [contractStart, deadline, originalDeadline]) { const d = parseDate(v); if (d) dates.push(d); }
    if (!dates.length) dates.push(today);
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    const from = new Date(min.getFullYear(), min.getMonth(), 1);
    const to = new Date(max.getFullYear(), max.getMonth() + 1, 1);
    const months: Date[] = [];
    for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);
    return { from, months };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, contractStart, deadline, originalDeadline]);

  const width = months.length * MONTH_W;
  // x for a date: whole months are MONTH_W wide, days share their month's width.
  const x = (d: Date) => {
    const mi = (d.getFullYear() - from.getFullYear()) * 12 + (d.getMonth() - from.getMonth());
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return mi * MONTH_W + ((d.getDate() - 1) / dim) * MONTH_W;
  };
  const xEnd = (d: Date) => x(new Date(d.getTime() + DAY)); // bars include their last day

  const years: Array<{ year: number; start: number; span: number }> = [];
  months.forEach((m, i) => {
    const last = years[years.length - 1];
    if (last && last.year === m.getFullYear()) last.span++;
    else years.push({ year: m.getFullYear(), start: i, span: 1 });
  });

  const start = parseDate(contractStart), end = parseDate(deadline), origEnd = parseDate(originalDeadline);
  const height = rows.length * GANTT_ROW;

  return (
    <div className="flex overflow-hidden rounded-xl border border-slate-100 bg-white">
      {labels && (
        <div className="w-48 shrink-0 border-r border-slate-100 sm:w-60">
          <div className="h-12 border-b border-slate-100 bg-slate-50 px-3 pt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Phase</div>
          {rows.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2 border-b border-slate-50 px-3 text-xs font-semibold text-slate-700" style={{ height: GANTT_ROW }}>
              <span className="w-4 shrink-0 text-[10px] text-slate-400">{i + 1}</span>
              {isMilestonePoint(m) ? <Flag size={12} className="shrink-0" style={{ color: phaseColor(m, i) }} /> : <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: phaseColor(m, i) }} />}
              <span className="truncate" title={m.name}>{m.name}</span>
            </div>
          ))}
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div style={{ width }} className="relative">
          {/* Year and month header */}
          <div className="flex h-6 border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-600">
            {years.map((y) => <div key={y.year} className="border-r border-slate-100 px-1.5 leading-6" style={{ width: y.span * MONTH_W }}>{y.year}</div>)}
          </div>
          <div className="flex h-6 border-b border-slate-100 bg-slate-50 text-[10px] text-slate-500">
            {months.map((m) => <div key={m.getTime()} className="border-r border-slate-100 text-center leading-6" style={{ width: MONTH_W }}>{m.toLocaleDateString("en-GB", { month: "short" })}</div>)}
          </div>

          <div className="relative" style={{ height: Math.max(height, GANTT_ROW) }}>
            {/* Month grid */}
            {months.map((m, i) => <div key={m.getTime()} className={`absolute inset-y-0 border-r ${m.getMonth() === 0 ? "border-slate-200" : "border-slate-50"}`} style={{ left: i * MONTH_W, width: MONTH_W }} />)}
            {/* Contract window and extension */}
            {start && end && <div className="absolute inset-y-0 bg-emerald-50/30" style={{ left: x(start), width: Math.max(0, xEnd(end) - x(start)) }} />}
            {origEnd && end && end > origEnd && <div className="absolute inset-y-0 bg-violet-50/70" style={{ left: xEnd(origEnd), width: xEnd(end) - xEnd(origEnd) }} title="Extension of time" />}
            {rows.map((_, i) => <div key={i} className="absolute inset-x-0 border-b border-slate-50" style={{ top: (i + 1) * GANTT_ROW - 1 }} />)}

            {rows.map((m, i) => {
              const color = phaseColor(m, i);
              const top = i * GANTT_ROW;
              const ps = parseDate(m.plannedStart), pe = parseDate(m.plannedEnd);
              const bs = parseDate(m.baselineStart), be = parseDate(m.baselineEnd);
              const as = parseDate(m.actualStart), ae = parseDate(m.actualEnd) || (as && m.status !== "completed" ? today : null);
              const moved = bs && be && ps && pe && (bs.getTime() !== ps.getTime() || be.getTime() !== pe.getTime());
              const late = delayDays(m, today) > 0;
              const pct = phasePercent(m);
              const tip = `${m.name}\nPlanned: ${fmtDay(ps) || "-"} to ${fmtDay(pe) || "-"}${moved ? `\nBaseline: ${fmtDay(bs)} to ${fmtDay(be)}` : ""}${as ? `\nActual: ${fmtDay(as)} to ${m.actualEnd ? fmtDay(m.actualEnd) : "ongoing"}` : ""}\n${pct}% complete`;
              return (
                <div key={m.id} className="absolute inset-x-0" style={{ top, height: GANTT_ROW }} title={tip}>
                  {moved && <div className="absolute rounded-sm bg-slate-200/80" style={{ top: 8, height: 14, left: x(bs!), width: Math.max(3, xEnd(be!) - x(bs!)) }} />}
                  {ps && pe && (isMilestonePoint(m) ? (
                    <Flag size={16} className="absolute" style={{ top: 7, left: x(ps) - 3, color, fill: pct >= 100 ? color : "transparent" }} />
                  ) : (
                    <div className="absolute overflow-hidden rounded-full" style={{ top: 10, height: 12, left: x(ps), width: Math.max(4, xEnd(pe) - x(ps)), background: `${color}40` }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  ))}
                  {as && ae && (
                    <div className={`absolute rounded-full border-2 border-dashed ${late ? "border-red-500" : "border-slate-500"}`} style={{ top: 26, height: 6, left: x(as), width: Math.max(4, xEnd(ae) - x(as)) }} />
                  )}
                </div>
              );
            })}

            {/* Deadline and Today */}
            {end && <div className="absolute inset-y-0 w-0.5 bg-slate-800/70" style={{ left: xEnd(end) }} title={`Deadline ${fmtDay(end)}`} />}
            {today >= from && <div className="absolute inset-y-0 w-0.5 bg-blue-600" style={{ left: x(today) }} />}
          </div>
          {today >= from && (
            <span className="absolute top-0 -translate-x-1/2 rounded bg-blue-600 px-1 text-[9px] font-bold leading-4 text-white" style={{ left: x(today) }}>Today</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function GanttLegend() {
  const item = "inline-flex items-center gap-1.5";
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-500">
      <span className={item}><Flag size={12} className="text-emerald-600" /> Milestone (zero duration)</span>
      <span className={item}><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Phase / activity</span>
      <span className={item}><span className="h-2.5 w-8 rounded-full bg-blue-500/25"><span className="block h-full w-1/2 rounded-full bg-blue-500" /></span> Planned (filled = % complete)</span>
      <span className={item}><span className="h-1.5 w-8 rounded-full border-2 border-dashed border-slate-500" /> Actual</span>
      <span className={item}><span className="h-1.5 w-8 rounded-full border-2 border-dashed border-red-500" /> Actual, late</span>
      <span className={item}><span className="h-2.5 w-8 rounded-sm bg-slate-200" /> Baseline (original plan)</span>
      <span className={item}><span className="h-3 w-0.5 bg-blue-600" /> Today</span>
      {/* CR 271 - the black line at the end of the chart was in the chart but not in the legend. */}
      <span className={item}><span className="h-3 w-0.5 bg-slate-800/70" /> Contract deadline</span>
      <span className={item}><span className="h-3 w-4 bg-violet-100" /> Extension</span>
    </div>
  );
}
