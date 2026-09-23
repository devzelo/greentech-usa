import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import type { ApiMilestone } from "./api";
import { C, NARROW, WIDE_LANDSCAPE, brandPage, drawTable, kpiCard, loadBrand, sectionHeading, stampPageNumbers, titleBlock, type Brand, type Flow, type TableCol, type TableRow } from "./pdfBrand";
import { fitOneLine } from "./pdfText";
import {
  DAY, STATUS_META, daysBetween, delayDays, effectiveDays, fmtDay, groupByCategory, humanGap, isMilestonePoint, parseDate, phaseColor, phasePercent, planSchedule,
} from "./projectSchedule";

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
  /** CR 270 - print each row's remark on its row. Off by default: remarks are internal notes. */
  remarks?: boolean;
  /** CR 273 - the chart prints at the zoom picked on screen, across the whole timeline. */
  zoom?: "month" | "week" | "day";
  /** CR 288 - the Actual start and end columns, printed unless they are left out. */
  actual?: boolean;
  /** CR 288 - which sheet to print on; a weekly chart of a long job may need a bigger one. */
  paper?: TimelinePaper;
}

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
  const hasCats = rows.some((m) => (m.category || "").trim());
  const displayOrder = hasCats
    ? groupByCategory(rows.map((m) => ({ m })), o.categories).flatMap((g) => g.items.map((z) => z.m))
    : rows;
  const numberOf = new Map<ApiMilestone, number>(displayOrder.map((m, i) => [m, i + 1]));
  const showActual = o.actual !== false;
  const tableRows: TableRow[] = rows.map((m, i) => {
    const lateBy = delayDays(m, today);
    const pct = phasePercent(m);
    const ed = effectiveDays(m);
    const actualEnd = m.actualEnd ? fmtDay(m.actualEnd) : m.actualStart ? "ongoing" : "-";
    const cells = [
      String(numberOf.get(m) ?? i + 1),
      m.name + (m.responsible?.length ? `\n${m.responsible.join(", ")}` : ""),
      fmtDay(m.plannedStart) || "-",
      fmtDay(m.plannedEnd) || "-",
      ...(showActual ? [
        fmtDay(m.actualStart) || "-",
        actualEnd + (lateBy && m.actualEnd ? `\n${lateBy} days late` : ""),
      ] : []),
      ed.days === null ? "-" : `${ed.days} day${ed.days === 1 ? "" : "s"}${ed.actual ? " (actual)" : ""}`,
      STATUS_META[m.status || "not_started"].label,
      `${pct}%`,
      ...(o.remarks ? [m.notes || ""] : []),
    ];
    // The columns shift left by two when the Actual pair is left out.
    const shift = showActual ? 0 : 2;
    const cellColors: Array<ReturnType<typeof rgb> | undefined> = [];
    if (showActual) cellColors[5] = lateBy && m.actualEnd ? RED : undefined;   // a late finish, red as on screen
    cellColors[7 - shift] = statusInk(m.status);                               // the status chip's colour
    return {
      cells,
      cellColors,
      bar: { col: 8 - shift, pct, color: pct >= 100 ? EMERALD : BLUE },
      color: lateBy && !m.actualEnd ? RED : undefined,
    };
  });
  // CR 238 - grouped under their categories when the schedule has them, each group with a heading
  // row; a flat list otherwise.
  const grouped: TableRow[] = hasCats
    ? groupByCategory(rows.map((m, i) => ({ m, row: tableRows[i] })), o.categories).flatMap((g) => [{ group: `${g.category}  (${g.items.length})` }, ...g.items.map((x) => x.row)])
    : tableRows;
  const fixed: TableCol[] = [
    { label: "#", w: 24 },
    { label: "Phase / milestone", w: 200, wrap: true },
    { label: "Start", w: 74, band: "Planned" },
    { label: "End", w: 74, band: "Planned" },
    // CR 288 - the actual dates are the site's record; they print unless they were left out.
    ...(showActual ? [
      { label: "Start", w: 74, band: "Actual", tint: SKY },
      { label: "End", w: 74, band: "Actual", tint: SKY, wrap: true },
    ] as TableCol[] : []),
    { label: "Duration", w: 74, align: "right" as const },
    { label: "Status", w: 80 },
    { label: "% complete", w: 62 },
  ];
  const used = fixed.reduce((s2, c) => s2 + c.w, 0);
  const cols: TableCol[] = o.remarks ? [...fixed, { label: "Remark", w: W - used, wrap: true }] : fixed;
  // Without the remark column the table would float; widen the name instead.
  if (!o.remarks) cols[1] = { ...cols[1], w: cols[1].w + (W - used) };
  f = drawTable(b, f, X, cols, grouped.length ? grouped : [{ cells: ["", "No phases yet."] }], { newPage, size: 7.8, maxLines: 4 });

  // ── Gantt ──
  if (rows.some((m) => m.plannedStart && m.plannedEnd)) f = drawGantt(doc, b, newPage, f, rows, o, today, PAGE);


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
  | { kind: "section"; category: string; items: ApiMilestone[] }
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

function drawGantt(doc: PDFDocument, b: Brand, newPage: () => Flow, flow: Flow, rows: ApiMilestone[], o: TimelinePdfInput, today: Date, PAGE: { w: number; h: number }): Flow {
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
      lines.push({ kind: "section", category: g.category, items: g.items.map((z) => z.m) });
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
      page.drawText("PHASE", { x: X + 4, y: y - 16, size: 6.8, font: b.bold, color: C.s500 });

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
      chunk.forEach((line, k) => {
        const top = bodyTop - k * ROW;
        if (line.kind === "section") {
          page.drawRectangle({ x: X, y: top - ROW, width: W, height: ROW, color: C.mist });
          page.drawText(fitOneLine(b.bold, line.category.toUpperCase(), 7, LABEL - 10), { x: X + 5, y: top - ROW / 2 - 2.4, size: 7, font: b.bold, color: C.slate });
          const ss = line.items.map((z) => parseDate(z.plannedStart) || parseDate(z.actualStart)).filter((d): d is Date => !!d);
          const ee = line.items.map((z) => parseDate(z.plannedEnd) || parseDate(z.actualEnd)).filter((d): d is Date => !!d);
          if (ss.length && ee.length) {
            const s0 = new Date(Math.min(...ss.map((d) => d.getTime()))), e0 = new Date(Math.max(...ee.map((d) => d.getTime())));
            if (e0 >= sheetFrom && s0 < sheetTo) {
              const bx = clampL(x(s0)), bw = Math.max(1.5, clampL(xEnd(e0)) - bx);
              page.drawRectangle({ x: bx, y: top - 8, width: bw, height: 3, color: C.slate });
              if (s0 >= sheetFrom) page.drawRectangle({ x: bx, y: top - 10, width: 1.2, height: 6.5, color: C.slate });
              if (e0 < sheetTo) page.drawRectangle({ x: bx + bw - 1.2, y: top - 10, width: 1.2, height: 6.5, color: C.slate });
            }
          }
          page.drawLine({ start: { x: X, y: top - ROW }, end: { x: X + W, y: top - ROW }, thickness: 0.25, color: C.border });
          return;
        }
        const m = line.m, idx = line.index;
        if (k % 2 === 1) page.drawRectangle({ x: X, y: top - ROW, width: LABEL, height: ROW, color: C.mist });
        const color = phaseColor(m, idx);
        page.drawCircle({ x: X + 18, y: top - ROW / 2, size: 2.4, color: hex(color) });
        page.drawText(String(idx + 1), { x: X + 3, y: top - ROW / 2 - 2.3, size: 6.4, font: b.regular, color: C.s500 });
        page.drawText(fitOneLine(b.regular, m.name, 7, LABEL - 30), { x: X + 25, y: top - ROW / 2 - 2.4, size: 7, font: b.regular, color: C.slate });
        page.drawLine({ start: { x: X, y: top - ROW }, end: { x: X + W, y: top - ROW }, thickness: 0.25, color: C.border });

        const ps = parseDate(m.plannedStart), pe = parseDate(m.plannedEnd);
        const as = parseDate(m.actualStart), ae = parseDate(m.actualEnd) || (as && m.status !== "completed" ? t0 : null);
        if (ps && pe && pe >= sheetFrom && ps < sheetTo) {
          if (isMilestonePoint(m)) {
            const cx = clampL(x(ps)), cy = top - 6.5;
            page.drawSvgPath(`M ${cx} ${-(cy - 3.6)} L ${cx + 3.6} ${-cy} L ${cx} ${-(cy + 3.6)} L ${cx - 3.6} ${-cy} Z`, { x: 0, y: 0, color: hex(color) });
            const lab = fmtDay(ps);
            if (cx + 6 + b.regular.widthOfTextAtSize(lab, 5.6) < X + LABEL + CH) {
              page.drawText(lab, { x: cx + 5, y: top - 8.4, size: 5.6, font: b.regular, color: C.s500 });
            }
          } else {
            const bx = clampL(x(ps)), bw = Math.max(1.5, clampL(xEnd(pe)) - bx);
            page.drawRectangle({ x: bx, y: top - 9, width: bw, height: 5.5, color: mix(color, 0.3) });
            const pct = phasePercent(m);
            if (pct > 0) page.drawRectangle({ x: bx, y: top - 9, width: (bw * pct) / 100, height: 5.5, color: hex(color) });
          }
        }
        if (as && ae && ae >= sheetFrom && as < sheetTo) {
          const late = delayDays(m, t0) > 0;
          const l = clampL(x(as)), rr = Math.max(l + 1.5, clampL(xEnd(ae)));
          page.drawLine({ start: { x: l, y: top - 12.5 }, end: { x: rr, y: top - 12.5 }, thickness: 1.2, dashArray: [2.5, 1.5], color: late ? RED : C.s500 });
        }
      });

      // ── deadline and today, when they fall on this sheet ──
      if (end && end >= sheetFrom && end < sheetTo) {
        page.drawLine({ start: { x: xEnd(end), y: bodyTop }, end: { x: xEnd(end), y: bodyTop - bodyH }, thickness: 0.9, color: C.slate });
      }
      if (t0 >= sheetFrom && t0 < sheetTo) {
        page.drawLine({ start: { x: x(t0), y: bodyTop }, end: { x: x(t0), y: bodyTop - bodyH }, thickness: 1, color: BLUE });
        page.drawText("Today", { x: x(t0) - b.bold.widthOfTextAtSize("Today", 6) / 2, y: headTop + 3, size: 6, font: b.bold, color: BLUE });
      }
      legend(page, b, X, bodyTop - bodyH - 16);
      f = { page, y: bodyTop - bodyH - 30 };
    }
    i += chunk.length;
    if (!chunk.length) break;
  }
  return f;
}

function legend(page: PDFPage, b: Brand, x: number, y: number) {
  const items: Array<[string, (px: number) => void]> = [
    ["Planned (filled = % complete)", (px) => { page.drawRectangle({ x: px, y: y - 1, width: 18, height: 5, color: rgb(0.75, 0.84, 0.98) }); page.drawRectangle({ x: px, y: y - 1, width: 9, height: 5, color: rgb(0.23, 0.51, 0.96) }); }],
    ["Actual", (px) => page.drawLine({ start: { x: px, y: y + 1.5 }, end: { x: px + 18, y: y + 1.5 }, thickness: 1.4, dashArray: [2.5, 1.5], color: C.s500 })],
    ["Actual, late", (px) => page.drawLine({ start: { x: px, y: y + 1.5 }, end: { x: px + 18, y: y + 1.5 }, thickness: 1.4, dashArray: [2.5, 1.5], color: rgb(0.86, 0.15, 0.15) })],
    ["Baseline", (px) => page.drawRectangle({ x: px, y: y - 1, width: 18, height: 5, color: rgb(0.88, 0.9, 0.93) })],
    ["Milestone", (px) => page.drawSvgPath(`M ${px + 5} ${-(y - 2.5)} L ${px + 9} ${-(y + 1.5)} L ${px + 5} ${-(y + 5.5)} L ${px + 1} ${-(y + 1.5)} Z`, { x: 0, y: 0, color: rgb(0.06, 0.73, 0.51) })],
    ["Category (summary)", (px) => { page.drawRectangle({ x: px, y: y, width: 18, height: 3, color: C.slate }); page.drawRectangle({ x: px, y: y - 1.5, width: 1.2, height: 6, color: C.slate }); page.drawRectangle({ x: px + 16.8, y: y - 1.5, width: 1.2, height: 6, color: C.slate }); }],
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
