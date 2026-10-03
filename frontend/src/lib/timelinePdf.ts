import { PDFDocument, rgb, type Color, type PDFPage } from "pdf-lib";
import type { ApiMilestone, ApiSchedulePhase } from "./api";
import { C, NARROW, WIDE_LANDSCAPE, brandPage, drawTable, kpiCard, loadBrand, sectionHeading, stampPageNumbers, titleBlock, type Brand, type Flow, type TableCol, type TableRow } from "./pdfBrand";
import { fitOneLine } from "./pdfText";
import {
  DAY, STATUS_META, daysBetween, delayDays, effectiveDays, fmtDay, fmtShort, groupByCategory, humanGap, isMilestonePoint, parseDate, phaseColor, phasePercent, planSchedule, wbsNumbers,
} from "./projectSchedule";
import { criticalPath, predLabel, predsOf, type CpmInfo } from "./scheduleLinks";
import { DEFAULT_COLORS, barLabel, type BarColors, type ColKey, type ScheduleDisplay } from "./scheduleDisplay";

/**
 * CR 190: the project timeline as a document for the monthly report: summary figures, the phases
 * table (planned, actual, duration, status, % complete) and the Gantt chart, on the letterhead.
 * US Letter, landscape, so the chart has room.
 */

/**
 * CR 245 / 246 - the schedule prints on 18" x 24" landscape with narrow margins (they pin it on
 * the wall). CR 288 - a weekly chart of a long job needs more room than that, so the bigger
 * drawing sheets are offered too, both landscape.
 */
export const TIMELINE_PAPERS = {
  wide: { label: '24" x 18"', hint: "the usual sheet", size: WIDE_LANDSCAPE },
  ansie: { label: 'ANSI E, 44" x 34"', hint: "the largest", size: { w: 3168, h: 2448 } },
  a2: { label: "A2, 594 x 420 mm", hint: "metric", size: { w: 1683.78, h: 1190.55 } },
} as const;
export type TimelinePaper = keyof typeof TIMELINE_PAPERS;
const paperSize = (p?: TimelinePaper) => TIMELINE_PAPERS[p || "wide"].size;
const RED = rgb(0.86, 0.15, 0.15);
// CR 273 - the status colours the screen uses, so the print reads the same.
const STATUS_INK: Record<string, [number, number, number]> = {
  not_started: [0.39, 0.45, 0.55],
  in_progress: [0.15, 0.39, 0.92],
  completed: [0.02, 0.59, 0.41],
  on_hold: [0.85, 0.47, 0.02],
  delayed: [0.86, 0.15, 0.15],
  cancelled: [0.58, 0.64, 0.72],
};
const statusInk = (st?: string) => { const c = STATUS_INK[st || "not_started"] || STATUS_INK.not_started; return rgb(c[0], c[1], c[2]); };
const SKY = rgb(0.94, 0.97, 1);          // the wash behind the Actual columns on screen
const BLUE = rgb(0.15, 0.39, 0.92);
const EMERALD = rgb(0.06, 0.73, 0.51);
// CR 300 - the chart's colours, as on screen: blue phases, green tasks, red critical work and
// milestones, grey links.
const PHASE = rgb(0.23, 0.51, 0.96), PHASE_DARK = rgb(0.11, 0.31, 0.85);
// CR 324 - the document's colours: critical red, non-critical blue, a black diamond, float pale blue.
// (Task, critical and milestone colours come from the display options; DEFAULT_COLORS otherwise.)
const FLOAT = rgb(0.75, 0.86, 0.996);
const LINK_INK = rgb(0.58, 0.64, 0.72);

const hex = (h: string) => { const n = parseInt(h.replace("#", ""), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const mix = (h: string, a: number) => { const n = parseInt(h.replace("#", ""), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v * a + 255 * (1 - a)) / 255); return rgb(c[0], c[1], c[2]); };

export interface TimelinePdfInput {
  projectName: string;
  projectNo?: string;
  clientName?: string;
  contractStart?: string;
  deadline?: string;
  originalDeadline?: string;
  milestones: ApiMilestone[];
  version?: string;       // e.g. "Version 4" or "Draft (not saved)"
  scheduleName?: string;  // CR 243 - "Master schedule", "Design schedule"...
  categories?: string[];  // the schedule's categories, in order
  /** CR 321 - the phases' details: a phase that waits on another counts in the float. */
  phaseInfo?: ApiSchedulePhase[];
  /** CR 270 - print each row's remark on its row. Off by default: remarks are internal notes. */
  remarks?: boolean;
  /** CR 273 - the chart prints at the zoom picked on screen, across the whole timeline. */
  zoom?: "month" | "week" | "day";
  /** CR 288 - the Actual start and end columns, printed unless they are left out. */
  actual?: boolean;
  /** CR 288 - which sheet to print on; a weekly chart of a long job may need a bigger one. */
  paper?: TimelinePaper;
  /** CR 299 - the overview strip from the top of the schedule, printed after the chart. */
  overview?: boolean;
  /** CR 300 - mark the critical path in red, as the screen's toggle does. On unless turned off. */
  critical?: boolean;
  /** CR 319 - draw each task's float after its bar. Off unless asked for. */
  float?: boolean;
  /**
   * CR 323 / 324 - print what is shown: the table's columns in the order chosen, the text beside
   * the bars, whether links are drawn, and the bar colours. Left out, the table prints its full
   * standard set and the chart its standard look.
   */
  display?: Pick<ScheduleDisplay, "columns" | "bars" | "colors">;
}

/** The columns printed when no display options are given: everything the table used to print. */
const STANDARD_COLUMNS: ColKey[] = ["id", "name", "type", "start", "finish", "actualStart", "actualFinish", "duration", "predecessors", "float", "critical", "status", "percent"];
/** A colour a shade darker, for the finished part of a bar. */
const darker = (h: string, k = 0.68) => { const n = parseInt(h.replace("#", ""), 16); return rgb((((n >> 16) & 255) * k) / 255, (((n >> 8) & 255) * k) / 255, ((n & 255) * k) / 255); };

/**
 * CR 288 - the calendar the chart has to cover, so the number of sheets can be worked out before
 * anything is drawn (the print options say whether it fits on one).
 */
export function chartRange(o: Pick<TimelinePdfInput, "milestones" | "contractStart" | "deadline" | "originalDeadline">) {
  const dates: Date[] = [];
  for (const m of o.milestones.filter((x) => x.status !== "cancelled")) {
    for (const v of [m.plannedStart, m.plannedEnd, m.actualStart, m.actualEnd]) { const d = parseDate(v); if (d) dates.push(d); }
  }
  for (const v of [o.contractStart, o.deadline, o.originalDeadline]) { const d = parseDate(v); if (d) dates.push(d); }
  if (!dates.length) return null;
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  const from = startOfWeekPdf(new Date(min.getFullYear(), min.getMonth(), min.getDate() - 3));
  const to = new Date(max.getFullYear(), max.getMonth(), max.getDate() + 7);
  return { from, to, days: Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY)) };
}

/** How many sheets the chart needs at this zoom on this paper. 0 when there is nothing to draw. */
export function chartSheets(o: Pick<TimelinePdfInput, "milestones" | "contractStart" | "deadline" | "originalDeadline" | "zoom" | "paper">): number {
  const range = chartRange(o);
  if (!range) return 0;
  const size = paperSize(o.paper);
  const chartW = size.w - NARROW * 2 - GANTT_LABEL;
  const daysPerSheet = Math.max(7, Math.floor(chartW / PDF_PX_PER_DAY[o.zoom || "month"]));
  return Math.max(1, Math.ceil(range.days / daysPerSheet));
}

export async function buildTimelinePdf(o: TimelinePdfInput): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const PAGE = paperSize(o.paper);
  const X = NARROW, W = PAGE.w - NARROW * 2;
  const note = [o.scheduleName || "Project timeline", o.projectName, o.version].filter(Boolean).join("  ·  ");
  const newPage = (): Flow => brandPage(doc, b, PAGE, note);
  const today = new Date();
  const rows = o.milestones.filter((m) => m.status !== "cancelled");
  const plan = planSchedule(rows, o.contractStart, today, o.deadline);

  // ── Summary ──
  let f = newPage();
  f.y = titleBlock(f.page, b, {
    x: X, y: f.y, w: W, eyebrow: o.scheduleName ? `${o.scheduleName} · phases & milestones` : "Project timeline · phases & milestones", title: o.projectName,
    meta: [["Project no.", o.projectNo || ""], ["Client", o.clientName || ""], ["As of", fmtDay(today)], ["Version", o.version || ""]],
  });
  const start = parseDate(o.contractStart), end = parseDate(o.deadline), origEnd = parseDate(o.originalDeadline);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const remaining = end ? (t0 > end ? `${humanGap(end, t0)} late` : humanGap(t0, end)) : "-";
  const elapsed = start && end && end > start ? `${Math.max(0, Math.min(100, Math.round((daysBetween(start, t0) / daysBetween(start, end)) * 100)))}%` : "-";
  const late = rows.filter((m) => delayDays(m, today) > 0).length;
  const cards: Array<[string, string]> = [
    ["Contract start", start ? fmtDay(start) : "-"],
    [end && origEnd && end > origEnd ? "Deadline (extended)" : "Contract deadline", end ? fmtDay(end) : "-"],
    ["Time remaining", remaining],
    ["Time elapsed", elapsed],
    ["Work complete", `${plan.progress}%`],
    ["Phases late", `${late} of ${rows.length}`],
  ];
  const cw = (W - 5 * 8) / 6;
  cards.forEach(([k, v], i) => kpiCard(f.page, b, X + i * (cw + 8), f.y, cw, 44, k, v, k === "Phases late" && late ? RED : C.slate));
  f.y -= 62;

  // ── Table ──
  // CR 273 - the same columns the screen shows, in the same order, with the same colours: no
  // baseline, no description, and the remark only when it was asked for before printing.
  f.y = sectionHeading(f.page, b, "Phases & milestones", X, f.y, W);
  // CR 288 - the # column counts down the table as it is printed (1, 2, 3...), not the order the
  // rows happen to be held in, which jumps about once they are grouped under their categories.
  // CR 300 - numbered as the screen numbers them (1, 1.1, 1.2, 2...), with each task's type, links
  // and float beside it.
  const hasCats = rows.some((m) => (m.category || "").trim()) || !!o.categories?.length;
  const wbs = wbsNumbers(rows, o.categories);
  const cpm = criticalPath(rows, { phases: o.phaseInfo });
  const showCrit = o.critical !== false;
  const showActual = o.actual !== false;
  const colors: BarColors = o.display?.colors || DEFAULT_COLORS;
  const critInk = hex(colors.critical);
  // CR 323 - the columns as chosen on screen, in that order. Leaving out the actual dates in the
  // print options also leaves out their columns.
  const keys = (o.display ? o.display.columns.filter((c) => c.on).map((c) => c.key) : STANDARD_COLUMNS)
    .filter((k) => showActual || (k !== "actualStart" && k !== "actualFinish"));
  if (!keys.includes("name")) keys.unshift("name");
  const COL: Record<ColKey, TableCol> = {
    id: { label: "#", w: 30 },
    name: { label: "Task / milestone", w: 200, wrap: true },
    type: { label: "Type", w: 54 },
    start: { label: "Start", w: 74 },
    finish: { label: "Finish", w: 74 },
    actualStart: { label: "Actual start", w: 74, tint: SKY },
    actualFinish: { label: "Actual finish", w: 80, tint: SKY, wrap: true },
    duration: { label: "Duration", w: 74, align: "right" },
    predecessors: { label: "Predecessors", w: 96, wrap: true },
    relationship: { label: "Relationship", w: 70 },
    float: { label: "Float", w: 40, align: "right" },
    critical: { label: "Critical", w: 44 },
    status: { label: "Status", w: 80 },
    assigned: { label: "Assigned to", w: 110, wrap: true },
    tags: { label: "Tags", w: 100, wrap: true },
    percent: { label: "% complete", w: 62 },
  };
  const tableRows: TableRow[] = rows.map((m, i) => {
    const lateBy = delayDays(m, today);
    const pct = phasePercent(m);
    const ed = effectiveDays(m);
    const actualEnd = m.actualEnd ? fmtDay(m.actualEnd) : m.actualStart ? "ongoing" : "-";
    const fl = cpm.float.get(m.id);
    const crit = showCrit && fl !== undefined && fl <= 0;
    const ms = !!m.isMilestone;
    const preds = predsOf(m);
    const cell: Record<ColKey, string> = {
      id: wbs.task.get(m.id) || String(i + 1),
      // Who it is assigned to goes under the name, unless it has a column of its own.
      name: m.name + (!keys.includes("assigned") && m.responsible?.length ? `\n${m.responsible.join(", ")}` : ""),
      type: ms ? "Milestone" : "Task",
      start: fmtDay(m.plannedStart) || "-",
      finish: ms ? fmtDay(m.plannedStart) || "-" : fmtDay(m.plannedEnd) || "-",
      actualStart: fmtDay(m.actualStart) || "-",
      actualFinish: actualEnd + (lateBy && m.actualEnd ? `\n${lateBy} days late` : ""),
      duration: ms ? "0 days" : ed.days === null ? "-" : `${ed.days} day${ed.days === 1 ? "" : "s"}${ed.actual ? " (actual)" : ""}`,
      predecessors: preds.map((q) => predLabel(q, wbs.task.get(q.id) || "?")).join(", ") || "-",
      relationship: preds.map((q) => q.type).join(", ") || "-",
      float: fl === undefined ? "-" : String(fl),
      critical: fl === undefined ? "-" : fl <= 0 ? "Yes" : "No",
      status: STATUS_META[m.status || "not_started"].label,
      assigned: (m.responsible || []).join(", ") || "-",
      tags: (m.tags || []).join(", ") || "-",
      percent: `${pct}%`,
    };
    const cells = [...keys.map((k) => cell[k]), ...(o.remarks ? [m.notes || ""] : [])];
    const cellColors: Array<ReturnType<typeof rgb> | undefined> = [];
    keys.forEach((k, n) => {
      if (k === "actualFinish" && lateBy && m.actualEnd) cellColors[n] = RED;            // a late finish, red as on screen
      if ((k === "float" || k === "critical") && crit) cellColors[n] = critInk;          // no float: the critical path
      if (k === "status") cellColors[n] = statusInk(m.status);                           // the status chip's colour
    });
    const pctCol = keys.indexOf("percent");
    return {
      cells,
      cellColors,
      ...(pctCol >= 0 ? { bar: { col: pctCol, pct, color: pct >= 100 ? EMERALD : BLUE } } : {}),
      color: lateBy && !m.actualEnd ? RED : undefined,
    };
  });
  // CR 238 - grouped under their categories when the schedule has them, each group with a heading
  // row; a flat list otherwise.
  const grouped: TableRow[] = hasCats
    ? groupByCategory(rows.map((m, i) => ({ m, row: tableRows[i] })), o.categories, true).flatMap((g) => [{ group: `${wbs.phase.get(g.category) || ""}   ${g.category}  (${g.items.length})`.trim() }, ...g.items.map((x) => x.row)])
    : tableRows;
  const fixed: TableCol[] = keys.map((k) => COL[k]);
  const used = fixed.reduce((s2, c) => s2 + c.w, 0);
  const cols: TableCol[] = o.remarks ? [...fixed, { label: "Remark", w: Math.max(120, W - used), wrap: true }] : fixed;
  // Without the remark column the table would float; widen the name instead.
  const nameAt = keys.indexOf("name");
  if (!o.remarks && W > used) cols[nameAt] = { ...cols[nameAt], w: cols[nameAt].w + (W - used) };
  f = drawTable(b, f, X, cols, grouped.length ? grouped : [{ cells: ["", "No phases yet."] }], { newPage, size: 7.8, maxLines: 4 });

  // ── Gantt ──
  if (rows.some((m) => m.plannedStart && m.plannedEnd)) f = drawGantt(doc, b, newPage, f, rows, o, today, PAGE, { wbs, cpm, showCrit, showFloat: o.float === true, colors });

  // CR 299 - the overview strip, as it reads at the top of the schedule, when it was asked for.
  if (o.overview) f = drawOverview(b, newPage, f, rows, o, today, PAGE);


  stampPageNumbers(doc, b);
  return new Blob([await doc.save()], { type: "application/pdf" });
}

/**
 * CR 273 - the chart prints at the zoom chosen on screen (monthly, weekly or daily) and covers the
 * whole timeline: when the range does not fit the sheet at that zoom, it continues on the next page
 * instead of being squeezed, with the phase column repeated and the dates it covers in the heading.
 * Categories print as summary bands over their milestones, as they appear on screen.
 */
type GanttLine =
  | { kind: "section"; category: string; items: ApiMilestone[]; number?: string }
  | { kind: "row"; m: ApiMilestone; index: number };

const DAY_MS = DAY;
const startOfWeekPdf = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const weekNoPdf = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - first.getTime()) / DAY_MS + 1) / 7);
};
// Points per day on paper, per zoom. Monthly keeps a two-year job on one sheet; daily is readable
// day by day and simply runs onto more sheets.
const PDF_PX_PER_DAY = { month: 2.3, week: 8, day: 12 } as const;
/** The phase column beside the chart; the calendar gets whatever is left of the sheet. */
const GANTT_LABEL = 250;

function drawGantt(doc: PDFDocument, b: Brand, newPage: () => Flow, flow: Flow, rows: ApiMilestone[], o: TimelinePdfInput, today: Date, PAGE: { w: number; h: number },
  plan: { wbs: ReturnType<typeof wbsNumbers>; cpm: CpmInfo; showCrit: boolean; showFloat: boolean; colors: BarColors }): Flow {
  const { wbs, cpm, showCrit, showFloat, colors } = plan;
  // CR 324 - the bar colours chosen on screen (the document's by default).
  const CRIT = hex(colors.critical), CRIT_DARK = darker(colors.critical), NORMAL = hex(colors.normal), NORMAL_DARK = darker(colors.normal), MILESTONE = hex(colors.milestone);
  // CR 323 - what is written beside the bars, and whether the links are drawn, as on screen.
  const bars = o.display?.bars;
  const showLinks = bars ? !!bars.find((x) => x.key === "links")?.on : true;
  const isCrit = (id: string) => showCrit && cpm.critical.has(id);
  const X = NARROW, W = PAGE.w - NARROW * 2, LABEL = GANTT_LABEL, CH = W - LABEL, ROW = 15, BOTTOM = 74;
  const zoom = o.zoom || "month";
  const pxPerDay = PDF_PX_PER_DAY[zoom];
  const unit: "week" | "day" = zoom === "month" ? "week" : "day";
  const band: "month" | "week" = zoom === "week" ? "week" : "month";

  // Every line the chart draws, categories included, in the order the screen shows them.
  const lines: GanttLine[] = [];
  if (rows.some((m) => (m.category || "").trim())) {
    let n = 0;
    for (const g of groupByCategory(rows.map((m) => ({ m })), o.categories)) {
      lines.push({ kind: "section", category: g.category, items: g.items.map((z) => z.m), number: wbs.phase.get(g.category) });
      for (const z of g.items) lines.push({ kind: "row", m: z.m, index: n++ });
    }
  } else {
    rows.forEach((m, n) => lines.push({ kind: "row", m, index: n }));
  }

  const range = chartRange({ milestones: rows, contractStart: o.contractStart, deadline: o.deadline, originalDeadline: o.originalDeadline });
  if (!range) return flow;
  const { from, to, days: totalDays } = range;

  // How much of the calendar fits on one sheet at this zoom, and therefore how many sheets.
  const daysPerSheet = Math.max(7, Math.floor(CH / pxPerDay));
  const sheets = Math.max(1, Math.ceil(totalDays / daysPerSheet));

  const end = parseDate(o.deadline), origEnd = parseDate(o.originalDeadline), cStart = parseDate(o.contractStart);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // CR 275 - sections run on: the chart starts right under the table, on the same sheet, whenever
  // its header and a few rows still fit. No page break, no blank half page between sections; a
  // hairline marks the hand-over instead.
  const HEAD_BLOCK = 26 + 26;                         // the section heading plus the time header
  const roomFor = (y: number) => Math.floor((y - HEAD_BLOCK - BOTTOM) / ROW);
  const minInline = 6;                                // worth continuing here if six rows fit

  let f = flow;
  let firstPage = true;
  let i = 0;
  let perPage = 0;
  while (i < lines.length) {
    let chunk: GanttLine[] = [];
    for (let sheet = 0; sheet < sheets; sheet++) {
      const sheetFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate() + sheet * daysPerSheet);
      const sheetTo = new Date(Math.min(to.getTime(), sheetFrom.getTime() + daysPerSheet * DAY_MS));
      const x = (d: Date) => X + LABEL + ((d.getTime() - sheetFrom.getTime()) / DAY_MS) * pxPerDay;
      const xEnd = (d: Date) => x(new Date(d.getTime() + DAY_MS));
      const clampL = (v: number) => Math.max(X + LABEL, Math.min(X + LABEL + CH, v));

      const carryOn = firstPage && roomFor(f.y) >= minInline;
      if (!carryOn) f = newPage();
      const page = f.page;
      // CR 275 - where one section hands over to the next: a little air, a hairline with a soft
      // band under it (the edge of a card), then air again. No page break, no blank half sheet.
      if (carryOn) {
        const dy = f.y - 14;
        page.drawLine({ start: { x: X, y: dy }, end: { x: X + W, y: dy }, thickness: 0.7, color: C.border });
        page.drawRectangle({ x: X, y: dy - 3, width: W, height: 3, color: C.mist });
        f = { page, y: dy - 20 };
      }
      firstPage = false;
      const range = `${fmtDay(sheetFrom)} to ${fmtDay(new Date(sheetTo.getTime() - DAY_MS))}`;
      const heading = `Gantt chart · ${zoom === "month" ? "monthly" : zoom === "week" ? "weekly" : "daily"}${sheets > 1 ? ` · sheet ${sheet + 1} of ${sheets}` : ""}`;
      let y = sectionHeading(page, b, heading, X, f.y, W) - 4;
      page.drawText(range, { x: X + LABEL, y: y + 12, size: 7, font: b.regular, color: C.s500 });

      // ── the two-level time header, as on screen ──
      const headH = 26;
      const headTop = y;
      page.drawRectangle({ x: X, y: y - headH, width: W, height: headH, color: C.mist });
      page.drawText("TASK", { x: X + 4, y: y - 16, size: 6.8, font: b.bold, color: C.s500 });

      if (band === "month") {
        for (let d = new Date(sheetFrom.getFullYear(), sheetFrom.getMonth(), 1); d < sheetTo; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
          const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
          const left = clampL(x(d < sheetFrom ? sheetFrom : d)), right = clampL(x(next > sheetTo ? sheetTo : next));
          if (right - left < 8) continue;
          const lab = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
          page.drawText(fitOneLine(b.bold, lab, 6.8, right - left - 4), { x: left + 3, y: y - 10, size: 6.8, font: b.bold, color: C.slate });
          page.drawLine({ start: { x: left, y: y - 12 }, end: { x: left, y: y - headH }, thickness: 0.4, color: C.border });
        }
      } else {
        for (let d = new Date(startOfWeekPdf(sheetFrom)); d < sheetTo; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
          const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
          const left = clampL(x(d < sheetFrom ? sheetFrom : d)), right = clampL(x(next > sheetTo ? sheetTo : next));
          if (right - left < 8) continue;
          const lab = `W${weekNoPdf(d)} · ${d.getDate()}/${d.getMonth() + 1}`;
          page.drawText(fitOneLine(b.bold, lab, 6.8, right - left - 4), { x: left + 3, y: y - 10, size: 6.8, font: b.bold, color: C.slate });
          page.drawLine({ start: { x: left, y: y - 12 }, end: { x: left, y: y - headH }, thickness: 0.4, color: C.border });
        }
      }

      // the lower strip: weeks under months, or single days
      const ticks: Array<{ at: Date; w: number; label: string; strong: boolean }> = [];
      if (unit === "week") {
        for (let d = new Date(startOfWeekPdf(sheetFrom)); d < sheetTo; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
          ticks.push({ at: new Date(d), w: 7 * pxPerDay, label: `W${weekNoPdf(d)}`, strong: d.getDate() <= 7 });
        }
      } else {
        for (let d = new Date(sheetFrom); d < sheetTo; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
          ticks.push({ at: new Date(d), w: pxPerDay, label: String(d.getDate()), strong: d.getDay() === 0 || d.getDay() === 6 });
        }
      }
      for (const t of ticks) {
        const left = x(t.at);
        if (left < X + LABEL - 1 || left > X + LABEL + CH) continue;
        // Only label a tick that has room for it, so the strip never collides with itself.
        const tickSize = unit === "day" ? 5.2 : 5.8;
        const need = b.regular.widthOfTextAtSize(t.label, tickSize) + 2;
        if (t.w >= need) {
          page.drawText(t.label, { x: left + Math.max(1, (t.w - (need - 2)) / 2), y: y - 22, size: tickSize, font: b.regular, color: C.s500 });
        }
      }
      y -= headH;

      const bodyTop = y;
      // Rows that fit under the header on THIS sheet; the first sheet of a chunk sets the size.
      if (sheet === 0) {
        perPage = Math.max(1, Math.floor((bodyTop - BOTTOM) / ROW));
        chunk = lines.slice(i, i + perPage);
      }
      const bodyH = chunk.length * ROW;

      // ── grid, contract window, extension ──
      for (const t of ticks) {
        const left = x(t.at);
        if (left < X + LABEL - 1 || left > X + LABEL + CH) continue;
        page.drawLine({ start: { x: left, y: bodyTop }, end: { x: left, y: bodyTop - bodyH }, thickness: t.strong ? 0.5 : 0.25, color: C.border });
        if (t.strong && unit === "day") page.drawRectangle({ x: left, y: bodyTop - bodyH, width: Math.min(t.w, X + LABEL + CH - left), height: bodyH, color: rgb(0.97, 0.98, 0.99) });
      }
      if (cStart && end) {
        const l = clampL(x(cStart)), rr = clampL(xEnd(end));
        if (rr > l) page.drawRectangle({ x: l, y: bodyTop - bodyH, width: rr - l, height: bodyH, color: rgb(0.94, 0.99, 0.96) });
      }
      if (origEnd && end && end > origEnd) {
        const l = clampL(xEnd(origEnd)), rr = clampL(xEnd(end));
        if (rr > l) page.drawRectangle({ x: l, y: bodyTop - bodyH, width: rr - l, height: bodyH, color: rgb(0.93, 0.91, 0.99) });
      }

      // ── the rows ──
      // Where each task's bar starts and ends on this sheet, for the link arrows drawn after.
      const at = new Map<string, { y: number; s: number; e: number; point: boolean }>();
      chunk.forEach((line, k) => {
        const top = bodyTop - k * ROW;
        if (line.kind === "section") {
          // A phase: a blue summary bar across its tasks, darker for the part done, with end caps.
          page.drawRectangle({ x: X, y: top - ROW, width: W, height: ROW, color: rgb(0.94, 0.96, 1) });
          const head = `${line.number ? `${line.number}   ` : ""}${line.category}`;
          page.drawText(fitOneLine(b.bold, head, 7.2, LABEL - 10), { x: X + 4, y: top - ROW / 2 - 2.4, size: 7.2, font: b.bold, color: PHASE_DARK });
          const ss = line.items.map((z) => parseDate(z.plannedStart) || parseDate(z.actualStart)).filter((d): d is Date => !!d);
          const ee = line.items.map((z) => parseDate(z.plannedEnd) || parseDate(z.plannedStart) || parseDate(z.actualEnd)).filter((d): d is Date => !!d);
          if (ss.length && ee.length) {
            const s0 = new Date(Math.min(...ss.map((d) => d.getTime()))), e0 = new Date(Math.max(...ee.map((d) => d.getTime())));
            if (e0 >= sheetFrom && s0 < sheetTo) {
              const bx = clampL(x(s0)), bw = Math.max(1.5, clampL(xEnd(e0)) - bx);
              const done = line.items.length ? line.items.reduce((sum, z) => sum + phasePercent(z), 0) / line.items.length : 0;
              page.drawRectangle({ x: bx, y: top - 9.5, width: bw, height: 4.5, color: PHASE });
              if (done > 0) page.drawRectangle({ x: bx, y: top - 9.5, width: (bw * done) / 100, height: 4.5, color: PHASE_DARK });
              if (s0 >= sheetFrom) page.drawRectangle({ x: bx, y: top - 11, width: 1.6, height: 7.5, color: PHASE_DARK });
              if (e0 < sheetTo) page.drawRectangle({ x: bx + bw - 1.6, y: top - 11, width: 1.6, height: 7.5, color: PHASE_DARK });
            }
          }
          page.drawLine({ start: { x: X, y: top - ROW }, end: { x: X + W, y: top - ROW }, thickness: 0.25, color: C.border });
          return;
        }
        const m = line.m, idx = line.index;
        const point = !!m.isMilestone || isMilestonePoint(m);
        const crit = isCrit(m.id);
        if (k % 2 === 1) page.drawRectangle({ x: X, y: top - ROW, width: LABEL, height: ROW, color: C.mist });
        const cy0 = top - ROW / 2;
        if (point) page.drawSvgPath(`M ${X + 25} ${-(cy0 + 2.8)} L ${X + 27.8} ${-cy0} L ${X + 25} ${-(cy0 - 2.8)} L ${X + 22.2} ${-cy0} Z`, { x: 0, y: 0, color: MILESTONE });
        else page.drawRectangle({ x: X + 22.6, y: cy0 - 2.3, width: 4.6, height: 4.6, color: crit ? CRIT : NORMAL });
        page.drawText(wbs.task.get(m.id) || String(idx + 1), { x: X + 3, y: top - ROW / 2 - 2.3, size: 6.2, font: b.regular, color: C.s500 });
        page.drawText(fitOneLine(b.regular, m.name, 7, LABEL - 36), { x: X + 32, y: top - ROW / 2 - 2.4, size: 7, font: b.regular, color: C.slate });
        page.drawLine({ start: { x: X, y: top - ROW }, end: { x: X + W, y: top - ROW }, thickness: 0.25, color: C.border });

        const ps = parseDate(m.plannedStart), pe = parseDate(m.plannedEnd) || ps;
        const as = parseDate(m.actualStart), ae = parseDate(m.actualEnd) || (as && m.status !== "completed" ? t0 : null);
        if (ps && pe) at.set(m.id, { y: top - 6.25, s: x(ps), e: point ? x(ps) : xEnd(pe), point });
        if (ps && pe && pe >= sheetFrom && ps < sheetTo) {
          if (point) {
            // A milestone: a diamond in the milestone colour, with its label beside it.
            const cx = clampL(x(ps)), cy = top - 6.5;
            page.drawSvgPath(`M ${cx} ${-(cy - 3.8)} L ${cx + 3.8} ${-cy} L ${cx} ${-(cy + 3.8)} L ${cx - 3.8} ${-cy} Z`, { x: 0, y: 0, color: MILESTONE });
            const lab = bars ? barLabel(m, bars, wbs.task.get(m.id) || "") : m.name;
            const room = X + LABEL + CH - (cx + 6);
            if (lab && room > 20) page.drawText(fitOneLine(b.regular, lab, 5.8, room), { x: cx + 6, y: top - 8.6, size: 5.8, font: b.regular, color: C.s500 });
          } else {
            // A task: blue (red on the critical path), its finished part drawn darker.
            const bx = clampL(x(ps)), bw = Math.max(1.5, clampL(xEnd(pe)) - bx);
            page.drawRectangle({ x: bx, y: top - 9, width: bw, height: 5.5, color: crit ? CRIT : NORMAL });
            const pct = phasePercent(m);
            if (pct > 0) page.drawRectangle({ x: bx, y: top - 9, width: (bw * pct) / 100, height: 5.5, color: crit ? CRIT_DARK : NORMAL_DARK });
            // Its float: the days it can slip before the finish moves, as a pale tail.
            const fl = cpm.float.get(m.id);
            let after = clampL(xEnd(pe));
            if (showFloat && fl && fl > 0 && pe < sheetTo) {
              const fx = clampL(xEnd(pe)), fw = clampL(xEnd(pe) + fl * pxPerDay) - fx;
              if (fw > 1) { page.drawRectangle({ x: fx, y: top - 9, width: fw, height: 5.5, color: FLOAT }); after = fx + fw; }
            }
            // CR 323 - the text the display options put beside the bar, after its float.
            const lab = bars ? barLabel(m, bars, wbs.task.get(m.id) || "") : "";
            const room = X + LABEL + CH - (after + 3);
            if (lab && pe < sheetTo && room > 20) page.drawText(fitOneLine(b.regular, lab, 5.8, room), { x: after + 3, y: top - 8.6, size: 5.8, font: b.regular, color: C.s500 });
          }
        }
        if (as && ae && ae >= sheetFrom && as < sheetTo) {
          const late = delayDays(m, t0) > 0;
          const l = clampL(x(as)), rr = Math.max(l + 1.5, clampL(xEnd(ae)));
          page.drawLine({ start: { x: l, y: top - 12.5 }, end: { x: rr, y: top - 12.5 }, thickness: 1.2, dashArray: [2.5, 1.5], color: late ? RED : C.s500 });
        }
      });

      // ── the links: an arrow from one bar to the next, for each FS, SS, FF and SF ──
      const inside = (v: number) => v >= X + LABEL - 0.5 && v <= X + LABEL + CH + 0.5;
      for (const line of showLinks ? chunk : []) {
        if (line.kind !== "row") continue;
        const to = at.get(line.m.id);
        if (!to) continue;
        for (const q of predsOf(line.m)) {
          const from = at.get(q.id);
          if (!from) continue;
          const fromEnd = q.type === "FS" || q.type === "FF", toStart = q.type === "FS" || q.type === "SS";
          const ax = from.point ? from.s + 3.8 : fromEnd ? from.e : from.s, bx = to.point ? to.s - (toStart ? 3.8 : -3.8) : toStart ? to.s : to.e;
          if (!inside(ax) || !inside(bx)) continue;
          const ink = isCrit(q.id) && isCrit(line.m.id) ? CRIT : LINK_INK;
          const outX = ax + (fromEnd ? 3 : -3), inX = bx - (toStart ? 3 : -3);
          const midY = to.y < from.y ? from.y - 5.5 : from.y + 5.5;
          const pts = (toStart ? inX >= outX : inX <= outX)
            ? [[ax, from.y], [outX, from.y], [outX, to.y], [bx, to.y]]
            : [[ax, from.y], [outX, from.y], [outX, midY], [inX, midY], [inX, to.y], [bx, to.y]];
          for (let n = 1; n < pts.length; n++) page.drawLine({ start: { x: pts[n - 1][0], y: pts[n - 1][1] }, end: { x: pts[n][0], y: pts[n][1] }, thickness: 0.5, color: ink });
          const dir = toStart ? 1 : -1;
          page.drawSvgPath(`M ${bx} ${-to.y} L ${bx - dir * 2.6} ${-(to.y + 1.5)} L ${bx - dir * 2.6} ${-(to.y - 1.5)} Z`, { x: 0, y: 0, color: ink });
        }
      }

      // ── deadline and today, when they fall on this sheet ──
      if (end && end >= sheetFrom && end < sheetTo) {
        page.drawLine({ start: { x: xEnd(end), y: bodyTop }, end: { x: xEnd(end), y: bodyTop - bodyH }, thickness: 0.9, color: C.slate });
      }
      if (t0 >= sheetFrom && t0 < sheetTo) {
        page.drawLine({ start: { x: x(t0), y: bodyTop }, end: { x: x(t0), y: bodyTop - bodyH }, thickness: 1, color: BLUE });
        page.drawText("Today", { x: x(t0) - b.bold.widthOfTextAtSize("Today", 6) / 2, y: headTop + 3, size: 6, font: b.bold, color: BLUE });
      }
      legend(page, b, X, bodyTop - bodyH - 16, colors);
      f = { page, y: bodyTop - bodyH - 30 };
    }
    i += chunk.length;
    if (!chunk.length) break;
  }
  return f;
}

function legend(page: PDFPage, b: Brand, x: number, y: number, colors: BarColors = DEFAULT_COLORS) {
  const TASK = hex(colors.normal), TASK_DONE = darker(colors.normal), RED = hex(colors.critical), INK = hex(colors.milestone);
  const diamond = (cx: number, cy: number, r: number) => `M ${cx} ${-(cy - r)} L ${cx + r} ${-cy} L ${cx} ${-(cy + r)} L ${cx - r} ${-cy} Z`;
  const items: Array<[string, (px: number) => void]> = [
    ["Phase", (px) => { page.drawRectangle({ x: px, y: y, width: 18, height: 3.5, color: PHASE }); page.drawRectangle({ x: px, y: y - 1.5, width: 1.4, height: 6.5, color: PHASE_DARK }); page.drawRectangle({ x: px + 16.6, y: y - 1.5, width: 1.4, height: 6.5, color: PHASE_DARK }); }],
    ["Task (darker = done)", (px) => { page.drawRectangle({ x: px, y: y - 1, width: 18, height: 5, color: TASK }); page.drawRectangle({ x: px, y: y - 1, width: 9, height: 5, color: TASK_DONE }); }],
    ["Critical task", (px) => page.drawRectangle({ x: px, y: y - 1, width: 18, height: 5, color: RED })],
    ["Milestone", (px) => page.drawSvgPath(diamond(px + 5, y + 1.5, 3.8), { x: 0, y: 0, color: INK })],
    ["Link", (px) => { page.drawLine({ start: { x: px, y: y + 4 }, end: { x: px + 6, y: y + 4 }, thickness: 0.6, color: LINK_INK }); page.drawLine({ start: { x: px + 6, y: y + 4 }, end: { x: px + 6, y: y }, thickness: 0.6, color: LINK_INK }); page.drawLine({ start: { x: px + 6, y: y }, end: { x: px + 16, y: y }, thickness: 0.6, color: LINK_INK }); page.drawSvgPath(`M ${px + 18} ${-y} L ${px + 15.4} ${-(y + 1.5)} L ${px + 15.4} ${-(y - 1.5)} Z`, { x: 0, y: 0, color: LINK_INK }); }],
    ["Float", (px) => page.drawRectangle({ x: px, y: y - 1, width: 18, height: 5, color: FLOAT })],
    ["Actual", (px) => page.drawLine({ start: { x: px, y: y + 1.5 }, end: { x: px + 18, y: y + 1.5 }, thickness: 1.4, dashArray: [2.5, 1.5], color: C.s500 })],
    ["Actual, late", (px) => page.drawLine({ start: { x: px, y: y + 1.5 }, end: { x: px + 18, y: y + 1.5 }, thickness: 1.4, dashArray: [2.5, 1.5], color: RED })],
    ["Today", (px) => page.drawLine({ start: { x: px + 8, y: y - 2 }, end: { x: px + 8, y: y + 6 }, thickness: 1, color: rgb(0.15, 0.39, 0.92) })],
    ["Contract deadline", (px) => page.drawLine({ start: { x: px + 8, y: y - 2 }, end: { x: px + 8, y: y + 6 }, thickness: 1, color: C.slate })],
    ["Extension", (px) => page.drawRectangle({ x: px, y: y - 2, width: 18, height: 7, color: rgb(0.93, 0.91, 0.99) })],
  ];
  let px = x;
  for (const [label, draw] of items) {
    draw(px);
    page.drawText(label, { x: px + 22, y: y, size: 6.8, font: b.regular, color: C.s500 });
    px += 30 + b.regular.widthOfTextAtSize(label, 6.8);
  }
}

/**
 * CR 299 (2026-09-24) - the timeline overview from the top of the schedule, printed the way it
 * reads there: the contract dates and the time left on one line, the track with the time elapsed,
 * any extension and today, and the phases in date order underneath, each with its date above and
 * its name below. Phases that do not fit across the sheet carry on in a second row.
 */
function drawOverview(b: Brand, newPage: () => Flow, flow: Flow, rows: ApiMilestone[], o: TimelinePdfInput, today: Date, PAGE: { w: number; h: number }): Flow {
  const X = NARROW, W = PAGE.w - NARROW * 2, BOTTOM = 74;
  const plan = planSchedule(rows, o.contractStart, today, o.deadline);
  const start = parseDate(o.contractStart), end = parseDate(o.deadline), origEnd = parseDate(o.originalDeadline);
  const extended = !!(end && origEnd && end > origEnd);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dots = plan.milestones.filter((m) => m.start).sort((a, z) => a.start!.getTime() - z.start!.getTime());

  // Same column width as the screen's milestone list, so the two read alike.
  const COL = 84, ROW_H = 44;
  const perRow = Math.max(1, Math.floor(W / COL));
  const dotRows = Math.max(1, Math.ceil(dots.length / perRow));
  const need = 26 + 22 + 30 + dotRows * ROW_H + 16;

  let f = flow;
  if (f.y - need < BOTTOM) f = newPage();
  const page = f.page;
  let y = sectionHeading(page, b, "Timeline overview", X, f.y - 10, W);

  const VIOLET = rgb(0.43, 0.16, 0.85), SLATE100 = rgb(0.945, 0.961, 0.976), VIOLET100 = rgb(0.929, 0.914, 0.996), BLUE600 = rgb(0.145, 0.388, 0.922);
  const AMBER = rgb(0.96, 0.62, 0.04), EMERALD600 = rgb(0.02, 0.59, 0.41);

  // ── one line of figures, as in the card's header ──
  const totalDays = start && end ? Math.max(0, daysBetween(start, end)) : null;
  const origDays = start && origEnd ? Math.max(0, daysBetween(start, origEnd)) : null;
  const overdue = !!(end && t0 > end && plan.progress < 100);
  const remaining = end ? (overdue ? `${humanGap(end, t0)} overdue` : `${humanGap(t0, end)} left`) : "No deadline";
  const elapsed = start && end && end > start ? Math.max(0, Math.min(100, Math.round((daysBetween(start, t0) / daysBetween(start, end)) * 100))) : null;
  const facts: Array<{ label: string; value: string; color: Color }> = [
    { label: "START", value: start ? fmtDay(start) : "Not set", color: C.slate },
    {
      label: extended ? "DURATION (EXTENDED)" : "DURATION",
      value: totalDays === null ? "-" : extended && origDays !== null ? `${totalDays} days (was ${origDays}, +${totalDays - origDays})` : `${totalDays} days`,
      color: extended ? VIOLET : C.slate,
    },
    {
      label: overdue ? "PAST THE DEADLINE" : "TIME REMAINING",
      value: end ? `${remaining} (${Math.abs(daysBetween(t0, end))}d${elapsed !== null ? `, ${elapsed}% elapsed` : ""})` : remaining,
      color: overdue ? RED : EMERALD600,
    },
    {
      label: extended ? "END (EXTENDED)" : "END",
      value: end ? fmtDay(end) + (extended && origEnd ? `  (original ${fmtDay(origEnd)})` : "") : "Not set",
      color: extended ? VIOLET : C.slate,
    },
    {
      label: "WORK COMPLETE",
      value: `${plan.progress}%${plan.milestones.length ? ` (${plan.milestones.filter((m) => m.state === "done").length} of ${plan.milestones.length} phases)` : ""}`,
      color: BLUE600,
    },
  ];
  const factW = W / facts.length;
  facts.forEach((fct, i) => {
    const fx = X + i * factW;
    page.drawText(fct.label, { x: fx, y, size: 6.4, font: b.bold, color: C.s400 });
    page.drawText(fitOneLine(b.bold, fct.value, 8.6, factW - 10), { x: fx, y: y - 11, size: 8.6, font: b.bold, color: fct.color });
  });
  y -= 30;

  // ── the track ──
  const ts = plan.start || start, te = plan.finish || end;
  const span = ts && te ? Math.max(DAY, te.getTime() - ts.getTime()) : 0;
  const px = (d: Date) => (ts && span ? X + Math.max(0, Math.min(1, (d.getTime() - ts.getTime()) / span)) * W : X);
  const TH = 4.5, ty = y - 10;
  if (ts && span && t0 >= ts && t0 <= te!) {
    const tx = px(t0);
    const lab = "TODAY";
    page.drawText(lab, { x: tx - b.bold.widthOfTextAtSize(lab, 5.6) / 2, y: ty + TH + 4, size: 5.6, font: b.bold, color: C.s400 });
  }
  page.drawRectangle({ x: X, y: ty, width: W, height: TH, color: SLATE100 });
  if (start && end && span) {
    if (extended && origEnd) page.drawRectangle({ x: px(origEnd), y: ty, width: Math.max(0, px(end) - px(origEnd)), height: TH, color: VIOLET100 });
    const fillTo = t0 > end ? end : t0;
    const w = Math.max(0, px(fillTo) - px(start));
    if (w > 0) page.drawRectangle({ x: px(start), y: ty, width: w, height: TH, color: overdue ? RED : EMERALD });
  }
  for (const m of dots) {
    page.drawLine({ start: { x: px(m.start!), y: ty - 2 }, end: { x: px(m.start!), y: ty + TH + 2 }, thickness: 1, color: hex(phaseColor(m)) });
  }
  if (ts && span && t0 >= ts && t0 <= te!) {
    page.drawLine({ start: { x: px(t0), y: ty - 3 }, end: { x: px(t0), y: ty + TH + 3 }, thickness: 1.4, color: BLUE600 });
  }
  y = ty - 16;

  // ── the phases in date order ──
  if (!dots.length) {
    page.drawText(rows.length ? "Add planned dates to the phases to place them on the timeline." : "No phases yet.", { x: X, y, size: 7, font: b.regular, color: C.s400 });
    y -= 14;
  }
  const wrap2 = (text: string, size: number, maxW: number): string[] => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (b.regular.widthOfTextAtSize(next, size) <= maxW) cur = next;
      else { if (cur) lines.push(cur); cur = w; }
      if (lines.length === 2) break;
    }
    if (lines.length < 2 && cur) lines.push(cur);
    if (lines.length === 2 && words.join(" ") !== lines.join(" ")) lines[1] = fitOneLine(b.regular, lines[1] + " ...", size, maxW);
    return lines.slice(0, 2).map((l) => fitOneLine(b.regular, l, size, maxW));
  };
  dots.forEach((m, i) => {
    const row = Math.floor(i / perRow), col = i % perRow;
    const cx = X + col * COL + COL / 2;
    const top = y - row * ROW_H;
    const cy = top - 13;
    const color = hex(phaseColor(m));
    const ring = m.state === "overdue" ? AMBER : color;
    const done = m.state === "done";
    const lastInRow = col === perRow - 1 || i === dots.length - 1;
    // the thin line the screen runs between the rings
    if (!lastInRow) page.drawLine({ start: { x: cx, y: cy }, end: { x: cx + COL, y: cy }, thickness: 0.6, color: C.border });
    // date above
    const date = fmtShort(m.start!);
    page.drawText(date, { x: cx - b.bold.widthOfTextAtSize(date, 6.4) / 2, y: top - 4, size: 6.4, font: b.bold, color: C.s500 });
    // the ring
    page.drawCircle({ x: cx, y: cy, size: 4.6, color: done ? color : C.white, borderColor: ring, borderWidth: 1.4 });
    if (isMilestonePoint(m)) {
      // a small flag, as on screen
      const ink = done ? C.white : color;
      page.drawLine({ start: { x: cx - 1.4, y: cy - 2.4 }, end: { x: cx - 1.4, y: cy + 2.4 }, thickness: 0.8, color: ink });
      page.drawSvgPath("M -1.4 -2.4 L 2.2 -1.3 L -1.4 -0.2 Z", { x: cx, y: cy, color: ink, borderWidth: 0 });
    } else if (done) {
      page.drawLine({ start: { x: cx - 2, y: cy }, end: { x: cx - 0.5, y: cy - 1.6 }, thickness: 0.9, color: C.white });
      page.drawLine({ start: { x: cx - 0.5, y: cy - 1.6 }, end: { x: cx + 2.2, y: cy + 1.6 }, thickness: 0.9, color: C.white });
    } else {
      page.drawCircle({ x: cx, y: cy, size: 1.2, color: ring });
    }
    // name below, up to two lines
    wrap2(m.name, 6.4, COL - 8).forEach((line, k) => {
      page.drawText(line, { x: cx - b.regular.widthOfTextAtSize(line, 6.4) / 2, y: cy - 11 - k * 7.6, size: 6.4, font: b.regular, color: C.s700 });
    });
  });
  y -= dotRows * ROW_H;

  page.drawText("Time elapsed is calendar time; work complete comes from the phases.", { x: X, y, size: 6.4, font: b.regular, color: C.s400 });
  return { page, y: y - 14 };
}
