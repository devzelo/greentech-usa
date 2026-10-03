import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Route, Timer, Workflow } from "lucide-react";
import type { ApiMilestone } from "../../../lib/api";
import { parseDate } from "../../../lib/projectSchedule";
import { isZeroLength, lagLabel, lengthOf, predsOf, withPhaseLinks, type CpmInfo, type PlanContext } from "../../../lib/scheduleLinks";

/**
 * CR 327 (GT Comments 2, picture 3, bottom half) - the schedule explained under the chart, all
 * worked out from the schedule itself (nothing here is typed):
 * - Critical path: the chain of critical tasks and milestones in order, as boxes joined by arrows.
 * - Project workflow: the phases as columns of boxes, each task placed after the tasks it waits on
 *   inside its phase, with an arrow for every dependency (dashed when it has a lead or lag).
 * - Key relationships: every link in plain words.
 * - Float: each task that can slip, and by how much, without moving the project's finish.
 * The chart's legend (just above) covers the colours and lines used here.
 */

type Group = { category: string; color?: string; items: ApiMilestone[] };
const short = (v?: string) => { const d = parseDate(v); return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""; };
const lengthText = (m: ApiMilestone) => {
  const l = lengthOf(m);
  if (!l || isZeroLength(m)) return "";
  const unit = l.value === 1 ? l.unit.replace(/s$/, "") : l.unit;
  return `${l.value} ${unit}`;
};
/** "2-4 Sep", or "28 Aug-2 Sep" across months. */
const range = (a?: string, b?: string) => {
  const s = parseDate(a), e = parseDate(b);
  if (!s || !e) return short(a);
  if (s.getTime() === e.getTime()) return short(a);
  const m = (d: Date) => d.toLocaleDateString("en-GB", { month: "short" });
  return m(s) === m(e) && s.getFullYear() === e.getFullYear() ? `${s.getDate()}-${e.getDate()} ${m(e)}` : `${short(a)}-${short(b)}`;
};
/** Light tint of a phase colour for its column. */
const tint = (hex?: string) => (hex && /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}1f` : "#f1f5f9");

// The workflow's geometry, in px.
const BOX_W = 136, BOX_H = 60, DIA = 76, COL_GAP = 38, ROW_GAP = 16, PAD = 14, HEAD = 44, PHASE_GAP = 16, LANE = 22;

export default function ScheduleOverview({ groups, cpm, planCtx, numbers, colors, onOpen }: {
  groups: Group[];
  cpm: CpmInfo;
  planCtx?: PlanContext;
  numbers?: Map<string, string>;
  colors: { critical: string; normal: string; milestone: string };
  onOpen?: (m: ApiMilestone) => void;
}) {
  const [open, setOpen] = useState<boolean>(() => { try { return localStorage.getItem("gt_schedule_overview") !== "0"; } catch { return true; } });
  const toggle = () => setOpen((v) => { const next = !v; try { localStorage.setItem("gt_schedule_overview", next ? "1" : "0"); } catch { /* ignore */ } return next; });
  const [allLinks, setAllLinks] = useState(false);

  const data = useMemo(() => {
    const live = groups.flatMap((g) => g.items).filter((m) => m.status !== "cancelled" && parseDate(m.plannedStart));
    const ids = new Set(live.map((m) => m.id));
    const byId = new Map(live.map((m) => [m.id, m]));
    // The links as the engine sees them, a phase's own predecessor included.
    const eff = new Map(withPhaseLinks(live, planCtx).map((m) => [m.id, predsOf(m).filter((p) => ids.has(p.id) && p.id !== m.id)]));
    const phaseOf = new Map<string, string>();
    groups.forEach((g) => g.items.forEach((m) => phaseOf.set(m.id, g.category)));
    const name = (id: string) => byId.get(id)?.name || "a task";

    // Critical path: in date order.
    const critical = live.filter((m) => cpm.critical.has(m.id))
      .sort((a, b) => (a.plannedStart || "").localeCompare(b.plannedStart || "") || (a.plannedEnd || "").localeCompare(b.plannedEnd || ""));

    // Workflow: each phase a column; inside it, a task sits one step after the latest task it waits
    // on within the same phase.
    const depth = new Map<string, number>();
    const depthOf = (id: string, seen = new Set<string>()): number => {
      if (depth.has(id)) return depth.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const inPhase = (eff.get(id) || []).filter((p) => phaseOf.get(p.id) === phaseOf.get(id));
      const d = inPhase.length ? 1 + Math.max(...inPhase.map((p) => depthOf(p.id, seen))) : 0;
      depth.set(id, d);
      return d;
    };
    type Box = { m: ApiMilestone; x: number; y: number; w: number; h: number; point: boolean; col: number };
    const boxes = new Map<string, Box>();
    const phases: Array<{ name: string; color?: string; x: number; w: number }> = [];
    let x = 0, height = 0, colNo = 0;
    for (const g of groups) {
      const items = g.items.filter((m) => ids.has(m.id));
      if (!items.length) continue;
      const cols = new Map<number, ApiMilestone[]>();
      for (const m of items) { const d = depthOf(m.id); cols.set(d, [...(cols.get(d) || []), m]); }
      const nCols = Math.max(...cols.keys()) + 1;
      const colW = (d: number) => Math.max(...(cols.get(d) || []).map((m) => (isZeroLength(m) ? DIA : BOX_W)), BOX_W);
      let cx = x + PAD;
      for (let d = 0; d < nCols; d++) {
        const list = (cols.get(d) || []).sort((a, b) => (a.plannedStart || "").localeCompare(b.plannedStart || ""));
        let cy = HEAD + LANE;
        const w = colW(d);
        for (const m of list) {
          const point = isZeroLength(m);
          const bw = point ? DIA : BOX_W, bh = point ? DIA : BOX_H;
          boxes.set(m.id, { m, x: cx + (w - bw) / 2, y: cy, w: bw, h: bh, point, col: colNo });
          cy += bh + ROW_GAP;
        }
        height = Math.max(height, cy);
        cx += w + COL_GAP;
        colNo++;
      }
      const pw = cx - COL_GAP + PAD - x;
      phases.push({ name: g.category || "Schedule", color: g.color, x, w: pw });
      x += pw + PHASE_GAP;
    }
    const width = Math.max(0, x - PHASE_GAP);
    const edges: Array<{ from: Box; to: Box; dashed: boolean; critical: boolean; slot: number }> = [];
    let slots = 0;
    for (const [id, preds] of eff) for (const p of preds) {
      const from = boxes.get(p.id), to = boxes.get(id);
      // A link to the next column is drawn directly; anything further gets its own lane track.
      if (from && to) edges.push({ from, to, dashed: !!p.lag, critical: cpm.critical.has(p.id) && cpm.critical.has(id), slot: to.col - from.col === 1 ? -1 : slots++ });
    }

    // Plain-language links, in the order the work happens.
    const links: string[] = [];
    for (const m of [...live].sort((a, b) => (a.plannedStart || "").localeCompare(b.plannedStart || ""))) {
      for (const p of eff.get(m.id) || []) links.push(`${m.name} ${lagLabel(p.type, p.lag, name(p.id))}.`);
    }
    // Float: what can slip, most first.
    const floats = live.filter((m) => !isZeroLength(m) && (cpm.float.get(m.id) || 0) > 0)
      .map((m) => ({ m, f: Math.round(cpm.float.get(m.id) || 0) }))
      .sort((a, b) => b.f - a.f);
    return { live, critical, boxes: [...boxes.values()], phases, width, height: height + LANE, edges, links, floats };
  }, [groups, cpm, planCtx]);

  if (!data.live.length) return null;
  const card = "rounded-2xl border border-slate-200 bg-white";
  const head = "flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 text-xs font-bold uppercase tracking-widest text-slate-500";
  const num = (m: ApiMilestone) => numbers?.get(m.id);

  return (
    <div className="mt-4">
      <button onClick={toggle} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Schedule overview
        <span className="normal-case tracking-normal font-medium text-slate-400">critical path, workflow, relationships and float, worked out from the schedule</span>
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {/* Critical path */}
          <section className={card}>
            <div className={head}><Route size={13} className="text-red-500" /> Critical path <span className="normal-case tracking-normal font-medium text-slate-400">({data.critical.length} item{data.critical.length === 1 ? "" : "s"}; a delay to any of them moves the finish)</span></div>
            <div className="p-4 flex flex-wrap items-center gap-y-3">
              {data.critical.length === 0 && <p className="text-xs text-slate-400">No critical path yet: link the tasks so the schedule can work it out.</p>}
              {data.critical.map((m, i) => (
                <span key={m.id} className="inline-flex items-center">
                  <button onClick={() => onOpen?.(m)} className="rounded-lg border px-2.5 py-1.5 text-center leading-tight hover:shadow-sm" style={{ borderColor: colors.critical, background: `${colors.critical}12` }} title={num(m) ? `${num(m)} ${m.name}` : m.name}>
                    <span className="block text-[11px] font-bold text-slate-800 max-w-[12rem] truncate">{m.name}</span>
                    <span className="block text-[10px] text-slate-500">{isZeroLength(m) ? short(m.plannedStart) : lengthText(m)}</span>
                  </button>
                  {i < data.critical.length - 1 && <ChevronRight size={16} className="mx-0.5 text-slate-300 shrink-0" />}
                </span>
              ))}
            </div>
          </section>

          {/* Workflow */}
          <section className={card}>
            <div className={head}><Workflow size={13} className="text-blue-500" /> Project workflow &amp; dependencies</div>
            <div className="p-3 overflow-x-auto">
              <div className="relative" style={{ width: data.width, height: data.height }}>
                {data.phases.map((p) => (
                  <div key={p.name + p.x} className="absolute top-0 rounded-xl" style={{ left: p.x, width: p.w, height: data.height, background: tint(p.color) }}>
                    <p className="px-3 pt-2 text-[11px] font-bold text-slate-700 truncate" title={p.name}>{p.name}</p>
                  </div>
                ))}
                <svg className="absolute inset-0 pointer-events-none" width={data.width} height={data.height}>
                  <defs>
                    <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#64748b" /></marker>
                    <marker id="wf-arrow-c" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={colors.critical} /></marker>
                  </defs>
                  {data.edges.map((e, i) => {
                    const x1 = e.from.x + e.from.w, y1 = e.from.y + e.from.h / 2;
                    const x2 = e.to.x, y2 = e.to.y + e.to.h / 2;
                    const gap = x2 - x1;
                    let d: string;
                    if (e.slot < 0) {
                      // Next column: a smooth S from one box's right side to the other's left side.
                      d = `M${x1} ${y1} C${x1 + gap / 2} ${y1}, ${x1 + gap / 2} ${y2}, ${x2 - 2} ${y2}`;
                    } else {
                      // Further away (or inside the same column): along a lane above the boxes from
                      // the first row, below them from lower rows, so the arrow never crosses a box.
                      const top = e.from.y <= HEAD + LANE + 1;
                      const track = (e.slot % 4) * 4;
                      const lane = top ? HEAD + 6 + track : data.height - 6 - track;
                      const sx = e.from.x + e.from.w / 2, ex = e.to.x + e.to.w / 2;
                      const sy = top ? e.from.y : e.from.y + e.from.h;
                      const ey = top ? e.to.y : e.to.y + e.to.h;
                      const r = 8, dir = ex >= sx ? 1 : -1, vy = top ? -1 : 1;
                      d = `M${sx} ${sy} V${lane - vy * r} Q${sx} ${lane}, ${sx + dir * r} ${lane} H${ex - dir * r} Q${ex} ${lane}, ${ex} ${lane - vy * r} V${ey + (top ? -2 : 2)}`;
                    }
                    return <path key={i} d={d} fill="none" stroke={e.critical ? colors.critical : "#94a3b8"} strokeWidth={e.critical ? 1.6 : 1.2} strokeDasharray={e.dashed ? "4 3" : undefined} markerEnd={`url(#${e.critical ? "wf-arrow-c" : "wf-arrow"})`} />;
                  })}
                </svg>
                {data.boxes.map((b) => {
                  const crit = cpm.critical.has(b.m.id);
                  const line = crit ? colors.critical : colors.normal;
                  return b.point ? (
                    <button key={b.m.id} onClick={() => onOpen?.(b.m)} title={b.m.name} className="absolute flex items-center justify-center" style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
                      <span className="absolute inset-[10px] rotate-45 rounded-sm border-2 bg-white" style={{ borderColor: crit ? colors.critical : colors.milestone }} />
                      <span className="relative px-1 text-center leading-tight">
                        <span className="block text-[9.5px] font-bold text-slate-800 line-clamp-2">{b.m.name}</span>
                        <span className="block text-[9px] text-slate-500">{short(b.m.plannedStart)}</span>
                      </span>
                    </button>
                  ) : (
                    <button key={b.m.id} onClick={() => onOpen?.(b.m)} title={b.m.name} className="absolute rounded-lg border-2 bg-white px-2 py-1 text-center leading-tight hover:shadow-md transition-shadow" style={{ left: b.x, top: b.y, width: b.w, height: b.h, borderColor: line, background: `${line}12` }}>
                      <span className="block text-[11px] font-bold text-slate-800 line-clamp-2">{b.m.name}</span>
                      <span className="block text-[10px] text-slate-500 truncate">{[lengthText(b.m), range(b.m.plannedStart, b.m.plannedEnd)].filter(Boolean).join(" · ")}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Key relationships */}
            <section className={card}>
              <div className={head}><GitBranch size={13} className="text-slate-500" /> Key relationships &amp; logic</div>
              <ol className="p-4 space-y-1.5 text-xs text-slate-700 list-decimal pl-8">
                {data.links.length === 0 && <li className="list-none -ml-4 text-slate-400">No links yet.</li>}
                {(allLinks ? data.links : data.links.slice(0, 8)).map((t, i) => <li key={i}>{t}</li>)}
              </ol>
              {data.links.length > 8 && <button onClick={() => setAllLinks((v) => !v)} className="mx-4 mb-3 -mt-2 text-[11px] font-bold text-primary hover:underline">{allLinks ? "Show fewer" : `Show all ${data.links.length}`}</button>}
            </section>

            {/* Float */}
            <section className={card}>
              <div className={head}><Timer size={13} className="text-sky-500" /> Float explanation</div>
              <ol className="p-4 space-y-1.5 text-xs text-slate-700 list-decimal pl-8">
                {data.floats.length === 0 && <li className="list-none -ml-4 text-slate-400">No task has float: every task is on the critical path, so any delay moves the finish.</li>}
                {data.floats.map(({ m, f }) => (
                  <li key={m.id}><b>{m.name}</b> has {f} day{f === 1 ? "" : "s"} of float. It can slip up to {f} day{f === 1 ? "" : "s"} without moving the project&apos;s finish.</li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
