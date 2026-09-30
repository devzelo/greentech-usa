import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ApiMilestone } from "../../../lib/api";
import { DAY, delayDays, fmtDay, isMilestonePoint, parseDate, phasePercent } from "../../../lib/projectSchedule";
import { predsOf, type CpmInfo, type LinkType } from "../../../lib/scheduleLinks";

/**
 * CR 189: the timeline as a Gantt chart: each task's planned bar (with its % complete filled in),
 * the actual dates as a dashed bar under it, and the baseline as a faint band, with Today and the
 * contract deadline marked.
 *
 * CR 269 (2026-09-22): dense enough for a real schedule. Half-height rows, the categories drawn as
 * summary bars over their tasks, and three zoom levels, each with a two-level header:
 *   month - months over week numbers (the default, fits a two-year job on one screen)
 *   week  - weeks over days
 *   day   - months over single days
 *
 * CR 300 (2026-09-25): drawn the way a scheduler reads it.
 *   Phase      a blue summary bar across its tasks; a folded phase keeps its bar
 *   Task       a green bar, filled to its % complete
 *   Milestone  a red diamond, named beside it
 *   Link       an arrow from one bar to the next, for each of FS, SS, FF and SF
 *   Critical   the tasks with no float, and the links between them, in red
 *   Float      a hatched tail after a task's bar: the days it can slip
 * Bars can be dragged: the middle moves a task, the right end changes its length. A task tied to
 * others moves by shifting its links' lag, so the chain stays a chain.
 */

export type GanttZoom = "month" | "week" | "day";
export const GANTT_ZOOMS: Array<[GanttZoom, string]> = [["month", "Monthly"], ["week", "Weekly"], ["day", "Daily"]];

export const GANTT_ROW = 22;          // one task
const SECTION_ROW = 24;               // one phase
const HEADER_H = 32;                  // the two header strips together
const BAR_TOP = 6, BAR_H = 9;         // a task bar inside its row
const MID = BAR_TOP + BAR_H / 2;      // where the arrows meet a bar

// Pixels per day, and which unit the lower header strip counts in, per zoom level.
const SCALE: Record<GanttZoom, { pxPerDay: number; unit: "week" | "day"; top: "month" | "week" }> = {
  month: { pxPerDay: 3.6, unit: "week", top: "month" },
  week: { pxPerDay: 13, unit: "day", top: "week" },
  day: { pxPerDay: 26, unit: "day", top: "month" },
};

const GREEN = "#10b981", RED = "#ef4444", BLUE = "#3b82f6", BLUE_DARK = "#1d4ed8", LINK = "#94a3b8";

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

export type GanttSection = { category: string; items: ApiMilestone[]; folded?: boolean; number?: string };

export default function GanttChart({
  rows, sections, contractStart, deadline, originalDeadline, labels = true, zoom = "month",
  cpm, showCritical = true, showFloat = false, numbers, baseline, onMove, onResize,
}: {
  rows: ApiMilestone[];
  /** Phases with their tasks, drawn as summary bars (CR 269). Falls back to a flat list. */
  sections?: GanttSection[];
  contractStart?: string;
  deadline?: string;
  originalDeadline?: string;
  /** Show the task names in a left column (off when the table sits beside it). */
  labels?: boolean;
  zoom?: GanttZoom;
  /** CR 300 - float and the critical path, from the engine. */
  cpm?: CpmInfo;
  showCritical?: boolean;
  /** CR 319 - float tails, a switch of their own (off unless asked for). */
  showFloat?: boolean;
  /** The table's numbers (1, 1.1...), so the chart names rows the same way. */
  numbers?: Map<string, string>;
  /** The baseline to draw under each bar (a task not in it gets none); each task's own first planned dates when left out. */
  baseline?: Map<string, { s: string; e: string }>;
  /** Dragging, when the schedule can be edited: a whole bar moved, or its end moved, by whole days. */
  onMove?: (m: ApiMilestone, days: number) => void;
  onResize?: (m: ApiMilestone, days: number) => void;
}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const { pxPerDay, unit, top } = SCALE[zoom];

  // Every row the chart draws, in order: a phase bar followed by its tasks (none when folded).
  const lines = useMemo(() => {
    const out: Array<{ kind: "section"; category: string; items: ApiMilestone[]; number?: string } | { kind: "row"; m: ApiMilestone; index: number }> = [];
    let index = 0;
    if (sections?.length) {
      for (const s of sections) {
        if (s.category) out.push({ kind: "section", category: s.category, items: s.items, number: s.number });
        if (!s.folded) for (const m of s.items) out.push({ kind: "row", m, index: index++ });
      }
    } else {
      for (const m of rows) out.push({ kind: "row", m, index: index++ });
    }
    return out;
  }, [rows, sections]);

  const allTasks = useMemo(() => (sections?.length ? sections.flatMap((s) => s.items) : rows), [rows, sections]);

  const { from, to } = useMemo(() => {
    const dates: Date[] = [];
    for (const m of allTasks) for (const v of [m.plannedStart, m.plannedEnd, m.actualStart, m.actualEnd, m.baselineStart, m.baselineEnd]) { const d = parseDate(v); if (d) dates.push(d); }
    if (baseline) for (const b of baseline.values()) for (const v of [b.s, b.e]) { const d = parseDate(v); if (d) dates.push(d); }
    for (const v of [contractStart, deadline, originalDeadline]) { const d = parseDate(v); if (d) dates.push(d); }
    if (cpm) for (const m of allTasks) { const f = cpm.float.get(m.id); const e = parseDate(m.plannedEnd); if (f && e) dates.push(new Date(e.getTime() + f * DAY)); }
    if (!dates.length) dates.push(today);
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    return {
      from: startOfWeek(new Date(min.getFullYear(), min.getMonth(), min.getDate() - 3)),
      to: new Date(max.getFullYear(), max.getMonth(), max.getDate() + 7),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, contractStart, deadline, originalDeadline, zoom, baseline, cpm]);

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
        out.push({ at: new Date(d), label: `${d.getDate()}`, w: pxPerDay, strong: weekend });
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
  const tops = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const l of lines) { out.push(y); y += l.kind === "section" ? SECTION_ROW : GANTT_ROW; }
    out.push(y);
    return out;
  }, [lines]);
  const height = tops[lines.length];

  // A phase bar spans its earliest start to its latest end.
  const spanOf = (items: ApiMilestone[]) => {
    const starts = items.map((m) => parseDate(m.plannedStart) || parseDate(m.actualStart)).filter((d): d is Date => !!d);
    const ends = items.map((m) => parseDate(m.plannedEnd) || parseDate(m.plannedStart) || parseDate(m.actualEnd)).filter((d): d is Date => !!d);
    if (!starts.length || !ends.length) return null;
    return { s: new Date(Math.min(...starts.map((d) => d.getTime()))), e: new Date(Math.max(...ends.map((d) => d.getTime()))) };
  };

  const isPoint = (m: ApiMilestone) => !!m.isMilestone || isMilestonePoint(m);
  const critical = (id: string) => !!(showCritical && cpm?.critical.has(id));

  // ── dragging ──────────────────────────────────────────────────────────────────────────────
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "end"; dx: number } | null>(null);
  const dragRef = useRef<{ id: string; mode: "move" | "end"; x0: number; m: ApiMilestone } | null>(null);
  const canMove = !!onMove, canResize = !!onResize;
  const beginDrag = (e: ReactPointerEvent, m: ApiMilestone, mode: "move" | "end") => {
    if ((mode === "move" && !canMove) || (mode === "end" && !canResize)) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: m.id, mode, x0: e.clientX, m };
    setDrag({ id: m.id, mode, dx: 0 });
  };
  const moveDrag = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setDrag({ id: d.id, mode: d.mode, dx: e.clientX - d.x0 });
  };
  const endDrag = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    const days = Math.round((e.clientX - d.x0) / pxPerDay);
    if (!days) return;
    if (d.mode === "move") onMove?.(d.m, days);
    else onResize?.(d.m, days);
  };
  const shiftOf = (id: string, mode: "move" | "end") => (drag && drag.id === id && drag.mode === mode ? Math.round(drag.dx / pxPerDay) * pxPerDay : 0);

  // ── where each visible task sits, for the arrows ──────────────────────────────────────────
  const at = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((l, i) => { if (l.kind === "row") map.set(l.m.id, i); });
    return map;
  }, [lines]);
  const anchor = (m: ApiMilestone, side: "start" | "end") => {
    const i = at.get(m.id);
    const ps = parseDate(m.plannedStart), pe = parseDate(m.plannedEnd) || ps;
    if (i === undefined || !ps || !pe) return null;
    const move = shiftOf(m.id, "move"), grow = shiftOf(m.id, "end");
    const y = tops[i] + MID;
    if (isPoint(m)) return { x: x(ps) + move + 5, y };
    return side === "start" ? { x: x(ps) + move, y } : { x: xEnd(pe) + move + grow, y };
  };
  const links = useMemo(() => {
    const byId = new Map<string, ApiMilestone>(allTasks.map((m) => [m.id, m]));
    const out: Array<{ key: string; d: string; crit: boolean; tip: string }> = [];
    for (const m of allTasks) {
      for (const p of predsOf(m)) {
        const pred = byId.get(p.id);
        if (!pred) continue;
        const fromSide: "start" | "end" = p.type === "SS" || p.type === "SF" ? "start" : "end";
        const toSide: "start" | "end" = p.type === "FF" || p.type === "SF" ? "end" : "start";
        const a = anchor(pred, fromSide), b = anchor(m, toSide);
        if (!a || !b) continue;
        const outDir = fromSide === "end" ? 1 : -1;       // leaves an end to the right, a start to the left
        const inDir = toSide === "start" ? 1 : -1;         // enters a start from the left, an end from the right
        const ox = a.x + outDir * 6, ix = b.x - inDir * 6;
        const straight = inDir === 1 ? ix >= ox : ix <= ox;
        const my = b.y > a.y ? a.y + 11 : a.y - 11;
        const d = straight || a.y === b.y
          ? `M ${a.x} ${a.y} H ${ox} V ${b.y} H ${b.x}`
          : `M ${a.x} ${a.y} H ${ox} V ${my} H ${ix} V ${b.y} H ${b.x}`;
        const crit = critical(pred.id) && critical(m.id);
        const lag = p.lag ? ` ${p.lag > 0 ? "+" : ""}${p.lag}d` : "";
        out.push({ key: `${pred.id}-${m.id}`, d, crit, tip: `${pred.name} to ${m.name}: ${p.type as LinkType}${lag}` });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, at, tops, from, pxPerDay, drag, cpm, showCritical]);

  return (
    <div className="flex overflow-hidden rounded-xl border border-slate-100 bg-white">
      {labels && (
        <div className="w-44 shrink-0 border-r border-slate-100 sm:w-60">
          <div className="border-b border-slate-100 bg-slate-50 px-2 text-[9px] font-bold uppercase tracking-widest leading-[32px] text-slate-400" style={{ height: HEADER_H }}>Task</div>
          {lines.map((l, i) => (l.kind === "section" ? (
            <div key={`s-${l.category}-${i}`} className="flex items-center gap-1.5 border-b border-slate-100 bg-blue-50/70 px-2 text-[11px] font-bold text-blue-900" style={{ height: SECTION_ROW }}>
              {l.number && <span className="w-6 shrink-0 text-[10px] font-bold text-blue-700">{l.number}</span>}
              <span className="truncate" title={l.category}>{l.category}</span>
              <span className="ml-auto shrink-0 text-[9px] font-bold text-blue-400">{l.items.length}</span>
            </div>
          ) : (
            <div key={l.m.id} className="flex items-center gap-1.5 border-b border-slate-50 px-2 text-[11px] font-semibold text-slate-700" style={{ height: GANTT_ROW }}>
              <span className="w-6 shrink-0 text-[9px] tabular-nums text-slate-400">{numbers?.get(l.m.id) || l.index + 1}</span>
              {isPoint(l.m)
                ? <span className="h-2 w-2 shrink-0 rotate-45" style={{ background: RED }} />
                : <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: critical(l.m.id) ? RED : GREEN }} />}
              <span className="truncate" title={l.m.name}>{l.m.name}</span>
            </div>
          )))}
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div style={{ width }} className="relative select-none">
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

          <div className="relative" style={{ height: Math.max(height, GANTT_ROW) }} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            {/* Grid, contract window and extension. */}
            {ticks.map((t, i) => (
              <div key={i} className={`absolute inset-y-0 border-r ${t.strong ? "border-slate-100 bg-slate-50/50" : "border-slate-50"}`} style={{ left: x(t.at), width: t.w }} />
            ))}
            {start && end && <div className="absolute inset-y-0 bg-emerald-50/40" style={{ left: x(start), width: Math.max(0, xEnd(end) - x(start)) }} />}
            {origEnd && end && end > origEnd && <div className="absolute inset-y-0 bg-violet-50/70" style={{ left: xEnd(origEnd), width: xEnd(end) - xEnd(origEnd) }} title="Extension of time" />}

            {lines.map((l, i) => {
              const topPx = tops[i];
              if (l.kind === "section") {
                const span = spanOf(l.items);
                const done = l.items.length ? Math.round(l.items.reduce((s, m) => s + phasePercent(m), 0) / l.items.length) : 0;
                return (
                  <div key={`s-${l.category}-${i}`} className="absolute inset-x-0 border-b border-slate-100 bg-blue-50/40" style={{ top: topPx, height: SECTION_ROW }} title={`${l.number ? `${l.number} ` : ""}${l.category}: ${l.items.length} task${l.items.length === 1 ? "" : "s"}, ${done}% complete`}>
                    {span && (
                      <div className="absolute" style={{ top: 8, left: x(span.s), width: Math.max(6, xEnd(span.e) - x(span.s)) }}>
                        {/* A blue summary bar with end caps, as a project schedule prints it. */}
                        <div className="relative h-2 overflow-hidden rounded-sm" style={{ background: BLUE }}>
                          <div className="h-full" style={{ width: `${done}%`, background: BLUE_DARK }} />
                        </div>
                        <div className="absolute -top-0.5 left-0 h-3 w-1" style={{ background: BLUE_DARK }} />
                        <div className="absolute -top-0.5 right-0 h-3 w-1" style={{ background: BLUE_DARK }} />
                      </div>
                    )}
                  </div>
                );
              }
              const { m } = l;
              const ps = parseDate(m.plannedStart), pe = parseDate(m.plannedEnd) || ps;
              // Given a baseline, the chart compares with it alone (an empty one: with nothing).
              const b = baseline?.get(m.id);
              const bs = parseDate(baseline ? b?.s : m.baselineStart), be = parseDate(baseline ? b?.e : m.baselineEnd);
              const as = parseDate(m.actualStart), ae = parseDate(m.actualEnd) || (as && m.status !== "completed" ? today : null);
              const moved = bs && be && ps && pe && (bs.getTime() !== ps.getTime() || be.getTime() !== pe.getTime());
              const late = delayDays(m, today) > 0;
              const pct = phasePercent(m);
              const crit = critical(m.id);
              const color = crit ? RED : GREEN;
              const fl = cpm?.float.get(m.id);
              const move = shiftOf(m.id, "move"), grow = shiftOf(m.id, "end");
              const tip = `${numbers?.get(m.id) ? `${numbers.get(m.id)} ` : ""}${m.name}\nPlanned: ${fmtDay(ps) || "-"} to ${fmtDay(pe) || "-"}${moved ? `\nBaseline: ${fmtDay(bs)} to ${fmtDay(be)}` : ""}${as ? `\nActual: ${fmtDay(as)} to ${m.actualEnd ? fmtDay(m.actualEnd) : "ongoing"}` : ""}\n${pct}% complete${fl !== undefined ? `\nFloat: ${fl} day${fl === 1 ? "" : "s"}${fl <= 0 ? " (critical)" : ""}` : ""}${canMove ? "\nDrag to move it; drag its right end to change its length." : ""}`;
              return (
                <div key={m.id} className="absolute inset-x-0 border-b border-slate-50" style={{ top: topPx, height: GANTT_ROW }} title={tip}>
                  {moved && <div className="absolute rounded-sm bg-slate-300/70" style={{ top: BAR_TOP - 3, height: 4, left: x(bs!), width: Math.max(3, xEnd(be!) - x(bs!)) }} />}
                  {ps && pe && (isPoint(m) ? (
                    <>
                      <div
                        className={`absolute h-2.5 w-2.5 rotate-45 ${canMove ? "cursor-grab active:cursor-grabbing" : ""}`}
                        style={{ top: BAR_TOP, left: x(ps) + move, background: RED, boxShadow: pct >= 100 ? `0 0 0 1.5px #fff, 0 0 0 2.5px ${RED}` : undefined }}
                        onPointerDown={(e) => beginDrag(e, m, "move")}
                      />
                      {/* The name beside the diamond, as the reference schedules show it. */}
                      <span className="pointer-events-none absolute whitespace-nowrap text-[9px] font-semibold text-slate-600" style={{ top: BAR_TOP - 1, left: x(ps) + move + 14 }}>{m.name}</span>
                    </>
                  ) : (
                    <>
                      <div
                        className={`absolute overflow-hidden rounded-sm ${canMove ? "cursor-grab active:cursor-grabbing" : ""} ${drag?.id === m.id ? "ring-2 ring-blue-300" : ""}`}
                        style={{ top: BAR_TOP, height: BAR_H, left: x(ps) + move, width: Math.max(4, xEnd(pe) - x(ps) + grow), background: `${color}40` }}
                        onPointerDown={(e) => beginDrag(e, m, "move")}
                      >
                        <div className="pointer-events-none h-full" style={{ width: `${pct}%`, background: color }} />
                        {canResize && (
                          <div
                            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-black/10 opacity-0 hover:opacity-100"
                            onPointerDown={(e) => beginDrag(e, m, "end")}
                            title="Drag to change its length"
                          />
                        )}
                      </div>
                      {/* The days it can slip before the project finish moves. */}
                      {showFloat && fl !== undefined && fl > 0 && (
                        <div
                          className="pointer-events-none absolute flex items-center overflow-hidden rounded-sm border border-dashed"
                          style={{
                            top: BAR_TOP + 1, height: BAR_H - 2, left: xEnd(pe) + move + grow, width: fl * pxPerDay,
                            borderColor: `${GREEN}99`, background: `repeating-linear-gradient(45deg, ${GREEN}33 0 3px, transparent 3px 6px)`,
                          }}
                        >
                          {fl * pxPerDay > 58 && <span className="whitespace-nowrap px-1 text-[8px] font-bold text-emerald-700">{fl} day{fl === 1 ? "" : "s"} float</span>}
                        </div>
                      )}
                    </>
                  ))}
                  {as && ae && (
                    <div className={`pointer-events-none absolute rounded-full border border-dashed ${late ? "border-red-500" : "border-slate-500"}`} style={{ top: BAR_TOP + BAR_H + 2, height: 3, left: x(as), width: Math.max(4, xEnd(ae) - x(as)) }} />
                  )}
                </div>
              );
            })}

            {/* The links, as arrows from one bar to the next. */}
            <svg className="pointer-events-none absolute inset-0" width={width} height={Math.max(height, GANTT_ROW)}>
              <defs>
                <marker id="gantt-arrow" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L6,3 L0,6 z" fill={LINK} /></marker>
                <marker id="gantt-arrow-crit" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L6,3 L0,6 z" fill={RED} /></marker>
              </defs>
              {links.map((k) => (
                <path key={k.key} d={k.d} fill="none" stroke={k.crit ? RED : LINK} strokeWidth={k.crit ? 1.4 : 1} markerEnd={`url(#${k.crit ? "gantt-arrow-crit" : "gantt-arrow"})`}>
                  <title>{k.tip}</title>
                </path>
              ))}
            </svg>

            {/* Deadline and Today */}
            {end && <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-slate-800/70" style={{ left: xEnd(end) }} title={`Deadline ${fmtDay(end)}`} />}
            {today >= from && today <= to && <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-blue-600" style={{ left: x(today) }} />}
          </div>
          {today >= from && today <= to && (
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
      <span className={item}><span className="h-2 w-8 rounded-sm" style={{ background: BLUE }} /> Phase</span>
      <span className={item}><span className="h-2.5 w-8 rounded-sm" style={{ background: `${GREEN}40` }}><span className="block h-full w-1/2 rounded-sm" style={{ background: GREEN }} /></span> Task (filled = % complete)</span>
      <span className={item}><span className="h-2.5 w-8 rounded-sm" style={{ background: RED }} /> Critical task</span>
      <span className={item}><span className="h-2.5 w-2.5 rotate-45" style={{ background: RED }} /> Milestone</span>
      <span className={item}><svg width="26" height="10"><path d="M1 3 H8 V7 H22" fill="none" stroke={LINK} strokeWidth="1.2" /><path d="M20 4.5 L25 7 L20 9.5 z" fill={LINK} /></svg> Link</span>
      <span className={item}><span className="h-2 w-8 rounded-sm border border-dashed" style={{ borderColor: `${GREEN}99`, background: `repeating-linear-gradient(45deg, ${GREEN}33 0 3px, transparent 3px 6px)` }} /> Float</span>
      <span className={item}><span className="h-1 w-8 rounded-sm bg-slate-300" /> Baseline</span>
      <span className={item}><span className="h-1.5 w-8 rounded-full border-2 border-dashed border-slate-500" /> Actual</span>
      <span className={item}><span className="h-3 w-0.5 bg-blue-600" /> Today</span>
      <span className={item}><span className="h-3 w-0.5 bg-slate-800/70" /> Contract deadline</span>
      <span className={item}><span className="h-3 w-4 bg-violet-100" /> Extension</span>
    </div>
  );
}
