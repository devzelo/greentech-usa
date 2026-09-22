import { useMemo } from "react";
import { Flag } from "lucide-react";
import type { ApiMilestone } from "../../../lib/api";
import { DAY, delayDays, fmtDay, isMilestonePoint, parseDate, phaseColor, phasePercent } from "../../../lib/projectSchedule";

/**
 * CR 189: the timeline as a Gantt chart: each phase's planned bar (with its % complete filled in),
 * the actual dates as a dashed bar under it, and the original baseline as a faint band, with Today
 * and the contract deadline marked. Phases may overlap freely.
 *
 * CR 269 (2026-09-22): dense enough for a real schedule. Rows are half their old height, the
 * categories are drawn as summary bands over their milestones (the way a Microsoft Project export
 * prints them), and the time axis has three zoom levels, each with a two-level header:
 *   month - months over week numbers (the default, fits a two-year job on one screen)
 *   week  - weeks over days
 *   day   - months over single days
 */

export type GanttZoom = "month" | "week" | "day";
export const GANTT_ZOOMS: Array<[GanttZoom, string]> = [["month", "Monthly"], ["week", "Weekly"], ["day", "Daily"]];

export const GANTT_ROW = 22;          // one milestone
const SECTION_ROW = 24;               // one category band
const HEADER_H = 32;                  // the two header strips together

// Pixels per day, and which unit the lower header strip counts in, per zoom level.
const SCALE: Record<GanttZoom, { pxPerDay: number; unit: "week" | "day"; top: "month" | "week" }> = {
  month: { pxPerDay: 3.6, unit: "week", top: "month" },
  week: { pxPerDay: 13, unit: "day", top: "week" },
  day: { pxPerDay: 26, unit: "day", top: "month" },
};

const startOfWeek = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));            // weeks run Monday to Sunday
  return x;
};
const weekNo = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - first.getTime()) / DAY + 1) / 7);
};

export type GanttSection = { category: string; items: ApiMilestone[] };

export default function GanttChart({ rows, sections, contractStart, deadline, originalDeadline, labels = true, zoom = "month" }: {
  rows: ApiMilestone[];
  /** Categories with their milestones - drawn as summary bands (CR 269). Falls back to a flat list. */
  sections?: GanttSection[];
  contractStart?: string;
  deadline?: string;
  originalDeadline?: string;
  /** Show the phase names in a left column (off when the table sits beside it). */
  labels?: boolean;
  zoom?: GanttZoom;
}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const { pxPerDay, unit, top } = SCALE[zoom];

  // Every row the chart draws, in order: a category band followed by its milestones.
  const lines = useMemo(() => {
    const out: Array<{ kind: "section"; category: string; items: ApiMilestone[] } | { kind: "row"; m: ApiMilestone; index: number }> = [];
    let index = 0;
    if (sections?.length) {
      for (const s of sections) {
        if (s.category) out.push({ kind: "section", category: s.category, items: s.items });
        for (const m of s.items) out.push({ kind: "row", m, index: index++ });
      }
    } else {
      for (const m of rows) out.push({ kind: "row", m, index: index++ });
    }
    return out;
  }, [rows, sections]);

  const { from, to } = useMemo(() => {
    const dates: Date[] = [];
    for (const m of rows) for (const v of [m.plannedStart, m.plannedEnd, m.actualStart, m.actualEnd, m.baselineStart, m.baselineEnd]) { const d = parseDate(v); if (d) dates.push(d); }
    for (const v of [contractStart, deadline, originalDeadline]) { const d = parseDate(v); if (d) dates.push(d); }
    if (!dates.length) dates.push(today);
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    return {
      from: startOfWeek(new Date(min.getFullYear(), min.getMonth(), min.getDate() - 3)),
      to: new Date(max.getFullYear(), max.getMonth(), max.getDate() + 7),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, contractStart, deadline, originalDeadline, zoom]);

  const x = (d: Date) => ((d.getTime() - from.getTime()) / DAY) * pxPerDay;
  const xEnd = (d: Date) => x(new Date(d.getTime() + DAY));   // bars include their last day
  const width = Math.max(240, x(to));

  // The lower header strip: one cell per week or per day.
  const ticks = useMemo(() => {
    const out: Array<{ at: Date; label: string; w: number; strong: boolean }> = [];
    if (unit === "week") {
      for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
        out.push({ at: new Date(d), label: `W${weekNo(d)}`, w: 7 * pxPerDay, strong: d.getDate() <= 7 });
      }
    } else {
      for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        out.push({ at: new Date(d), label: zoom === "day" ? `${d.getDate()}` : `${d.getDate()}`, w: pxPerDay, strong: weekend });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, unit, pxPerDay, zoom]);

  // The upper header strip: months, or weeks when the lower strip counts days.
  const bands = useMemo(() => {
    const out: Array<{ label: string; left: number; w: number }> = [];
    if (top === "month") {
      for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const left = Math.max(0, x(d));
        out.push({ label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), left, w: Math.min(x(next), width) - left });
      }
    } else {
      for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
        out.push({ label: `W${weekNo(d)} · ${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`, left: x(d), w: 7 * pxPerDay });
      }
    }
    return out.filter((b) => b.w > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, top, pxPerDay, width]);

  const start = parseDate(contractStart), end = parseDate(deadline), origEnd = parseDate(originalDeadline);
  const rowTop = (i: number) => lines.slice(0, i).reduce((s, l) => s + (l.kind === "section" ? SECTION_ROW : GANTT_ROW), 0);
  const height = rowTop(lines.length);

  // A category band spans its earliest start to its latest end.
  const spanOf = (items: ApiMilestone[]) => {
    const starts = items.map((m) => parseDate(m.plannedStart) || parseDate(m.actualStart)).filter((d): d is Date => !!d);
    const ends = items.map((m) => parseDate(m.plannedEnd) || parseDate(m.actualEnd)).filter((d): d is Date => !!d);
    if (!starts.length || !ends.length) return null;
    return { s: new Date(Math.min(...starts.map((d) => d.getTime()))), e: new Date(Math.max(...ends.map((d) => d.getTime()))) };
  };

  return (
    <div className="flex overflow-hidden rounded-xl border border-slate-100 bg-white">
      {labels && (
        <div className="w-44 shrink-0 border-r border-slate-100 sm:w-56">
          <div className="border-b border-slate-100 bg-slate-50 px-2 text-[9px] font-bold uppercase tracking-widest leading-[32px] text-slate-400" style={{ height: HEADER_H }}>Phase</div>
          {lines.map((l, i) => (l.kind === "section" ? (
            <div key={`s-${l.category}-${i}`} className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-100/80 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-600" style={{ height: SECTION_ROW }}>
              <span className="truncate" title={l.category}>{l.category}</span>
              <span className="ml-auto shrink-0 text-[9px] font-bold text-slate-400">{l.items.length}</span>
            </div>
          ) : (
            <div key={l.m.id} className="flex items-center gap-1.5 border-b border-slate-50 px-2 text-[11px] font-semibold text-slate-700" style={{ height: GANTT_ROW }}>
              <span className="w-4 shrink-0 text-[9px] text-slate-400">{l.index + 1}</span>
              {isMilestonePoint(l.m)
                ? <Flag size={10} className="shrink-0" style={{ color: phaseColor(l.m, l.index) }} />
                : <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: phaseColor(l.m, l.index) }} />}
              <span className="truncate" title={l.m.name}>{l.m.name}</span>
            </div>
          )))}
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div style={{ width }} className="relative">
          {/* Two-level time header (CR 269). */}
          <div className="relative border-b border-slate-100 bg-slate-50" style={{ height: HEADER_H }}>
            {bands.map((b, i) => (
              <div key={i} className="absolute top-0 truncate border-r border-slate-200 px-1 text-[9px] font-bold leading-4 text-slate-600" style={{ left: b.left, width: b.w }}>{b.label}</div>
            ))}
            {ticks.map((t, i) => (
              <div key={i} className={`absolute bottom-0 truncate border-r text-center text-[8px] leading-4 ${t.strong ? "border-slate-200 bg-slate-100/70 text-slate-500" : "border-slate-100 text-slate-400"}`} style={{ left: x(t.at), width: t.w }}>
                {t.w >= 11 ? t.label : ""}
              </div>
            ))}
          </div>

          <div className="relative" style={{ height: Math.max(height, GANTT_ROW) }}>
            {/* Grid, contract window and extension. */}
            {ticks.map((t, i) => (
              <div key={i} className={`absolute inset-y-0 border-r ${t.strong ? "border-slate-100 bg-slate-50/50" : "border-slate-50"}`} style={{ left: x(t.at), width: t.w }} />
            ))}
            {start && end && <div className="absolute inset-y-0 bg-emerald-50/40" style={{ left: x(start), width: Math.max(0, xEnd(end) - x(start)) }} />}
            {origEnd && end && end > origEnd && <div className="absolute inset-y-0 bg-violet-50/70" style={{ left: xEnd(origEnd), width: xEnd(end) - xEnd(origEnd) }} title="Extension of time" />}

            {lines.map((l, i) => {
              const topPx = rowTop(i);
              if (l.kind === "section") {
                const span = spanOf(l.items);
                const done = l.items.length ? Math.round(l.items.reduce((s, m) => s + phasePercent(m), 0) / l.items.length) : 0;
                return (
                  <div key={`s-${l.category}-${i}`} className="absolute inset-x-0 border-b border-slate-100 bg-slate-100/60" style={{ top: topPx, height: SECTION_ROW }} title={`${l.category}: ${l.items.length} milestone${l.items.length === 1 ? "" : "s"}, ${done}% complete`}>
                    {span && (
                      <div className="absolute" style={{ top: 8, left: x(span.s), width: Math.max(6, xEnd(span.e) - x(span.s)) }}>
                        {/* A summary band with end caps, as a project schedule prints it. */}
                        <div className="h-1.5 rounded-sm bg-slate-700/80" />
                        <div className="absolute -top-0.5 left-0 h-2.5 w-0.5 bg-slate-700" />
                        <div className="absolute -top-0.5 right-0 h-2.5 w-0.5 bg-slate-700" />
                      </div>
                    )}
                  </div>
                );
              }
              const { m, index } = l;
              const color = phaseColor(m, index);
              const ps = parseDate(m.plannedStart), pe = parseDate(m.plannedEnd);
              const bs = parseDate(m.baselineStart), be = parseDate(m.baselineEnd);
              const as = parseDate(m.actualStart), ae = parseDate(m.actualEnd) || (as && m.status !== "completed" ? today : null);
              const moved = bs && be && ps && pe && (bs.getTime() !== ps.getTime() || be.getTime() !== pe.getTime());
              const late = delayDays(m, today) > 0;
              const pct = phasePercent(m);
              const tip = `${m.name}\nPlanned: ${fmtDay(ps) || "-"} to ${fmtDay(pe) || "-"}${moved ? `\nBaseline: ${fmtDay(bs)} to ${fmtDay(be)}` : ""}${as ? `\nActual: ${fmtDay(as)} to ${m.actualEnd ? fmtDay(m.actualEnd) : "ongoing"}` : ""}\n${pct}% complete`;
              return (
                <div key={m.id} className="absolute inset-x-0 border-b border-slate-50" style={{ top: topPx, height: GANTT_ROW }} title={tip}>
                  {moved && <div className="absolute rounded-sm bg-slate-200/80" style={{ top: 4, height: 7, left: x(bs!), width: Math.max(3, xEnd(be!) - x(bs!)) }} />}
                  {ps && pe && (isMilestonePoint(m) ? (
                    <>
                      <Flag size={11} className="absolute" style={{ top: 4, left: x(ps) - 2, color, fill: pct >= 100 ? color : "transparent" }} />
                      {/* The date beside the diamond, as the printed schedules show it. */}
                      <span className="absolute whitespace-nowrap text-[8px] font-bold text-slate-500" style={{ top: 6, left: x(ps) + 11 }}>{fmtDay(ps)}</span>
                    </>
                  ) : (
                    <div className="absolute overflow-hidden rounded-full" style={{ top: 6, height: 8, left: x(ps), width: Math.max(4, xEnd(pe) - x(ps)), background: `${color}40` }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  ))}
                  {as && ae && (
                    <div className={`absolute rounded-full border border-dashed ${late ? "border-red-500" : "border-slate-500"}`} style={{ top: 15, height: 4, left: x(as), width: Math.max(4, xEnd(ae) - x(as)) }} />
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
      {/* CR 269 - the dark band over a group of milestones. */}
      <span className={item}><span className="h-1.5 w-8 rounded-sm bg-slate-700/80" /> Category (summary)</span>
      <span className={item}><span className="h-3 w-0.5 bg-blue-600" /> Today</span>
      {/* CR 271 - the black line at the end of the chart was in the chart but not in the legend. */}
      <span className={item}><span className="h-3 w-0.5 bg-slate-800/70" /> Contract deadline</span>
      <span className={item}><span className="h-3 w-4 bg-violet-100" /> Extension</span>
    </div>
  );
}
