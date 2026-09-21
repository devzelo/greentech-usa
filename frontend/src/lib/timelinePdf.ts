import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import type { ApiMilestone } from "./api";
import { C, GUTTER, brandPage, drawTable, kpiCard, loadBrand, sectionHeading, stampPageNumbers, titleBlock, type Brand, type Flow, type TableRow } from "./pdfBrand";
import { fitOneLine } from "./pdfText";
import {
  DAY, STATUS_META, daysBetween, delayDays, effectiveDays, fmtDay, humanGap, isMilestonePoint, parseDate, phaseColor, phasePercent, planSchedule,
} from "./projectSchedule";

/**
 * CR 190: the project timeline as a document for the monthly report: summary figures, the phases
 * table (planned, actual, duration, status, % complete) and the Gantt chart, on the letterhead.
 * US Letter, landscape, so the chart has room.
 */

const PAGE = { w: 792, h: 612 };
const RED = rgb(0.86, 0.15, 0.15);
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
}

export async function buildTimelinePdf(o: TimelinePdfInput): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const X = GUTTER, W = PAGE.w - GUTTER * 2;
  const note = ["Project timeline", o.projectName, o.version].filter(Boolean).join("  ·  ");
  const newPage = (): Flow => brandPage(doc, b, PAGE, note);
  const today = new Date();
  const rows = o.milestones.filter((m) => m.status !== "cancelled");
  const plan = planSchedule(rows, o.contractStart, today, o.deadline);

  // ── Summary ──
  let f = newPage();
  f.y = titleBlock(f.page, b, {
    x: X, y: f.y, w: W, eyebrow: "Project timeline · phases & milestones", title: o.projectName,
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
  f.y = sectionHeading(f.page, b, "Phases & milestones", X, f.y, W);
  const tableRows: TableRow[] = rows.map((m, i) => {
    const d = daysBetween(parseDate(m.plannedStart) || t0, parseDate(m.plannedEnd) || t0);
    const lateBy = delayDays(m, today);
    const moved = (m.baselineStart && m.baselineStart !== m.plannedStart) || (m.baselineEnd && m.baselineEnd !== m.plannedEnd);
    return {
      cells: [
        String(i + 1),
        m.name + (m.responsible?.length ? `\n${m.responsible.join(", ")}` : ""),
        m.plannedStart ? `${fmtDay(m.plannedStart)}\n${fmtDay(m.plannedEnd)}` : "-",
        moved ? `${fmtDay(m.baselineStart)}\n${fmtDay(m.baselineEnd)}` : "same",
        m.actualStart ? `${fmtDay(m.actualStart)}\n${m.actualEnd ? fmtDay(m.actualEnd) : "ongoing"}` : "-",
        (() => { const ed = effectiveDays(m); return ed.days === null ? "-" : `${ed.days} day${ed.days === 1 ? "" : "s"}${ed.actual ? "\n(actual)" : ""}`; })(),
        STATUS_META[m.status || "not_started"].label + (lateBy ? `\n${lateBy} days late` : ""),
        `${phasePercent(m)}%`,
        m.description || "",   // CR 234 - the PM's note is internal and never printed
      ],
      color: lateBy ? RED : undefined,
    };
  });
  const cols = [
    { label: "#", w: 22 }, { label: "Phase / milestone", w: 132, wrap: true }, { label: "Planned", w: 70, wrap: true },
    { label: "Baseline", w: 70, wrap: true }, { label: "Actual", w: 70, wrap: true }, { label: "Duration", w: 50 },
    { label: "Status", w: 66, wrap: true }, { label: "%", w: 34, align: "right" as const },
  ];
  const used = cols.reduce((s, c) => s + c.w, 0);
  f = drawTable(b, f, X, [...cols, { label: "Description", w: W - used, wrap: true }], tableRows.length ? tableRows : [{ cells: ["", "No phases yet."] }], { newPage, size: 7.5, maxLines: 5 });

  // ── Gantt ──
  if (rows.some((m) => m.plannedStart && m.plannedEnd)) drawGantt(doc, b, newPage, rows, o, today);

  stampPageNumbers(doc, b);
  return new Blob([await doc.save()], { type: "application/pdf" });
}

function drawGantt(doc: PDFDocument, b: Brand, newPage: () => Flow, rows: ApiMilestone[], o: TimelinePdfInput, today: Date) {
  const X = GUTTER, W = PAGE.w - GUTTER * 2, LABEL = 170, CH = W - LABEL, ROW = 17, BOTTOM = 70;
  const dates: Date[] = [];
  for (const m of rows) for (const v of [m.plannedStart, m.plannedEnd, m.actualStart, m.actualEnd, m.baselineStart, m.baselineEnd]) { const d = parseDate(v); if (d) dates.push(d); }
  for (const v of [o.contractStart, o.deadline, o.originalDeadline]) { const d = parseDate(v); if (d) dates.push(d); }
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  const from = new Date(min.getFullYear(), min.getMonth(), 1);
  const to = new Date(max.getFullYear(), max.getMonth() + 1, 1);
  const months: Date[] = [];
  for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);
  const mw = CH / months.length;
  const x = (d: Date) => {
    const mi = (d.getFullYear() - from.getFullYear()) * 12 + (d.getMonth() - from.getMonth());
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return X + LABEL + mi * mw + ((d.getDate() - 1) / dim) * mw;
  };
  const xEnd = (d: Date) => x(new Date(d.getTime() + DAY));
  const end = parseDate(o.deadline), origEnd = parseDate(o.originalDeadline);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let i = 0;
  while (i < rows.length) {
    const f = newPage();
    const page = f.page;
    let y = sectionHeading(page, b, "Gantt chart", X, f.y, W) - 4;
    // Header: years and months
    const headTop = y;
    page.drawRectangle({ x: X, y: y - 26, width: W, height: 26, color: C.mist });
    let yearStart = 0;
    months.forEach((m, k) => {
      const lab = mw >= 16 ? m.toLocaleDateString("en-GB", { month: "short" }) : m.toLocaleDateString("en-GB", { month: "narrow" });
      const sz = Math.min(6.5, mw * 0.4);
      page.drawText(lab, { x: X + LABEL + k * mw + (mw - b.regular.widthOfTextAtSize(lab, sz)) / 2, y: y - 22, size: sz, font: b.regular, color: C.s500 });
      if (k === months.length - 1 || months[k + 1].getFullYear() !== m.getFullYear()) {
        page.drawText(String(m.getFullYear()), { x: X + LABEL + yearStart * mw + 3, y: y - 10, size: 7, font: b.bold, color: C.slate });
        yearStart = k + 1;
      }
    });
    page.drawText("PHASE", { x: X + 4, y: y - 16, size: 6.8, font: b.bold, color: C.s500 });
    y -= 26;
    const bodyTop = y;
    const perPage = Math.floor((bodyTop - BOTTOM) / ROW);
    const chunk = rows.slice(i, i + perPage);
    const bodyH = chunk.length * ROW;
    // Grid
    months.forEach((m, k) => {
      page.drawLine({ start: { x: X + LABEL + k * mw, y: headTop - 13 * (m.getMonth() === 0 ? 0 : 1) }, end: { x: X + LABEL + k * mw, y: bodyTop - bodyH }, thickness: m.getMonth() === 0 ? 0.6 : 0.25, color: C.border });
    });
    if (origEnd && end && end > origEnd) page.drawRectangle({ x: xEnd(origEnd), y: bodyTop - bodyH, width: xEnd(end) - xEnd(origEnd), height: bodyH, color: rgb(0.93, 0.91, 0.99) });
    chunk.forEach((m, r) => {
      const idx = i + r;
      const top = bodyTop - r * ROW;
      if (r % 2 === 1) page.drawRectangle({ x: X, y: top - ROW, width: LABEL, height: ROW, color: C.mist });
      const color = phaseColor(m, idx);
      page.drawCircle({ x: X + 18, y: top - ROW / 2, size: 2.6, color: hex(color) });
      page.drawText(String(idx + 1), { x: X + 3, y: top - ROW / 2 - 2.5, size: 6.5, font: b.regular, color: C.s500 });
      page.drawText(fitOneLine(b.regular, m.name, 7.2, LABEL - 30), { x: X + 25, y: top - ROW / 2 - 2.6, size: 7.2, font: b.regular, color: C.slate });
      page.drawLine({ start: { x: X, y: top - ROW }, end: { x: X + W, y: top - ROW }, thickness: 0.25, color: C.border });
      const ps = parseDate(m.plannedStart), pe = parseDate(m.plannedEnd);
      const bs = parseDate(m.baselineStart), be = parseDate(m.baselineEnd);
      const as = parseDate(m.actualStart), ae = parseDate(m.actualEnd) || (as && m.status !== "completed" ? t0 : null);
      if (bs && be && ps && pe && (bs.getTime() !== ps.getTime() || be.getTime() !== pe.getTime())) {
        page.drawRectangle({ x: x(bs), y: top - 9, width: Math.max(1.5, xEnd(be) - x(bs)), height: 6, color: rgb(0.88, 0.9, 0.93) });
      }
      if (ps && pe) {
        if (isMilestonePoint(m)) {
          const cx = x(ps), cy = top - 6.5;
          page.drawSvgPath(`M ${cx} ${-(cy - 4)} L ${cx + 4} ${-cy} L ${cx} ${-(cy + 4)} L ${cx - 4} ${-cy} Z`, { x: 0, y: 0, color: hex(color) });
        } else {
          const bx = x(ps), bw = Math.max(2, xEnd(pe) - bx);
          page.drawRectangle({ x: bx, y: top - 9.5, width: bw, height: 6, color: mix(color, 0.3) });
          const pct = phasePercent(m);
          if (pct > 0) page.drawRectangle({ x: bx, y: top - 9.5, width: (bw * pct) / 100, height: 6, color: hex(color) });
        }
      }
      if (as && ae) {
        const late = delayDays(m, t0) > 0;
        page.drawLine({ start: { x: x(as), y: top - 13.5 }, end: { x: Math.max(x(as) + 2, xEnd(ae)), y: top - 13.5 }, thickness: 1.4, dashArray: [2.5, 1.5], color: late ? RED : C.s500 });
      }
    });
    if (end) page.drawLine({ start: { x: xEnd(end), y: bodyTop }, end: { x: xEnd(end), y: bodyTop - bodyH }, thickness: 0.9, color: C.slate });
    if (t0 >= from && t0 < new Date(from.getFullYear(), from.getMonth() + months.length, 1)) {
      page.drawLine({ start: { x: x(t0), y: bodyTop }, end: { x: x(t0), y: bodyTop - bodyH }, thickness: 1, color: rgb(0.15, 0.39, 0.92) });
      page.drawText("Today", { x: x(t0) - b.bold.widthOfTextAtSize("Today", 6) / 2, y: headTop + 3, size: 6, font: b.bold, color: rgb(0.15, 0.39, 0.92) });
    }
    legend(page, b, X, bodyTop - bodyH - 16);
    i += chunk.length;
    if (!chunk.length) break;
  }
}

function legend(page: PDFPage, b: Brand, x: number, y: number) {
  const items: Array<[string, (px: number) => void]> = [
    ["Planned (filled = % complete)", (px) => { page.drawRectangle({ x: px, y: y - 1, width: 18, height: 5, color: rgb(0.75, 0.84, 0.98) }); page.drawRectangle({ x: px, y: y - 1, width: 9, height: 5, color: rgb(0.23, 0.51, 0.96) }); }],
    ["Actual", (px) => page.drawLine({ start: { x: px, y: y + 1.5 }, end: { x: px + 18, y: y + 1.5 }, thickness: 1.4, dashArray: [2.5, 1.5], color: C.s500 })],
    ["Actual, late", (px) => page.drawLine({ start: { x: px, y: y + 1.5 }, end: { x: px + 18, y: y + 1.5 }, thickness: 1.4, dashArray: [2.5, 1.5], color: rgb(0.86, 0.15, 0.15) })],
    ["Baseline", (px) => page.drawRectangle({ x: px, y: y - 1, width: 18, height: 5, color: rgb(0.88, 0.9, 0.93) })],
    ["Milestone", (px) => page.drawSvgPath(`M ${px + 5} ${-(y - 2.5)} L ${px + 9} ${-(y + 1.5)} L ${px + 5} ${-(y + 5.5)} L ${px + 1} ${-(y + 1.5)} Z`, { x: 0, y: 0, color: rgb(0.06, 0.73, 0.51) })],
    ["Today", (px) => page.drawLine({ start: { x: px + 8, y: y - 2 }, end: { x: px + 8, y: y + 6 }, thickness: 1, color: rgb(0.15, 0.39, 0.92) })],
    ["Extension", (px) => page.drawRectangle({ x: px, y: y - 2, width: 18, height: 7, color: rgb(0.93, 0.91, 0.99) })],
  ];
  let px = x;
  for (const [label, draw] of items) {
    draw(px);
    page.drawText(label, { x: px + 22, y: y, size: 6.8, font: b.regular, color: C.s500 });
    px += 30 + b.regular.widthOfTextAtSize(label, 6.8);
  }
}
