import { PDFDocument, rgb } from "pdf-lib";
import type { ApiWorkPackage, WorkPackageStatus } from "./api";
import { C, GUTTER, LETTER, brandPage, drawTable, flowText, kpiCard, loadBrand, sectionHeading, stampPageNumbers, titleBlock, type Brand, type Flow, type TableCol, type TableRow } from "./pdfBrand";
import { fmtDay } from "./projectSchedule";

/**
 * CR 328 (GT Comments 3, page 1: "All Work Package records ... should support appropriate actions
 * such as view, print, share ..."): the Work Packages list, and one package's sheet, as PDFs.
 *
 * Money is only printed for someone allowed to see the project's figures, and while the figures
 * are hidden on screen it prints masked, as the screen shows it. Letter paper: the list is
 * landscape, a package sheet portrait.
 */

const STATUS: Record<WorkPackageStatus, string> = { not_started: "Not started", in_progress: "In progress", complete: "Complete", on_hold: "On hold", cancelled: "Cancelled" };
const STATUSES_ORDER = Object.keys(STATUS) as WorkPackageStatus[];
const STATUS_INK: Record<WorkPackageStatus, ReturnType<typeof rgb>> = {
  not_started: rgb(0.39, 0.45, 0.55), in_progress: rgb(0.15, 0.39, 0.92), complete: rgb(0.02, 0.59, 0.41), on_hold: rgb(0.85, 0.47, 0.02), cancelled: rgb(0.58, 0.64, 0.72),
};
const RED = rgb(0.86, 0.15, 0.15), BLUE = rgb(0.15, 0.39, 0.92), EMERALD = rgb(0.06, 0.73, 0.51);
const LANDSCAPE = { w: LETTER.h, h: LETTER.w };
const MASK = "••••••";
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0 });

export interface WorkPackagesPdfInput {
  projectName: string;
  projectNo?: string;
  clientName?: string;
  /** The packages to print, in order, each with its number (1, 2, 3) and its progress as shown. */
  packages: Array<{ p: ApiWorkPackage; no: number; progress: number }>;
  /** May this person see the figures at all? */
  money: boolean;
  /** Are the figures hidden on screen right now (print them masked)? */
  masked: boolean;
  /** "Filtered: 3 of 7 packages" and the like, printed under the title. */
  note?: string;
}

const fig = (o: Pick<WorkPackagesPdfInput, "masked">, v: number) => (o.masked ? MASK : usd(v));
const rfqText = (p: ApiWorkPackage) => (p.rfq ? `RFQ ${p.rfq.no}${p.rfq.date ? `\n${fmtDay(p.rfq.date)}` : ""}${p.rfq.vendors ? ` · ${p.rfq.vendors} vendor${p.rfq.vendors === 1 ? "" : "s"}` : ""}` : "-");
const quotesText = (p: ApiWorkPackage) => (p.quotes.count ? `${p.quotes.count} quote${p.quotes.count === 1 ? "" : "s"}\n${p.quotes.names.join(", ")}` : "-");
const winnerText = (p: ApiWorkPackage) => (p.winner ? `${p.winner.name}${p.winner.internal ? "\nDone in-house" : p.winner.place ? `\n${p.winner.place}` : ""}` : "-");
const contractText = (p: ApiWorkPackage) => (p.po ? `${p.po.no}\n${p.po.signed ? "Signed" : p.po.status}${p.po.date ? ` · ${fmtDay(p.po.date)}` : ""}`
  : p.agreement ? `${p.agreement.no}\n${p.agreement.status}${p.agreement.date ? ` · ${fmtDay(p.agreement.date)}` : ""}` : "-");

/** The list, as the table shows it: packages with their subtasks under them, and the totals. */
export async function buildWorkPackagesPdf(o: WorkPackagesPdfInput): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const X = GUTTER, W = LANDSCAPE.w - GUTTER * 2;
  const newPage = (): Flow => brandPage(doc, b, LANDSCAPE, `Work packages  ·  ${o.projectName}`);
  let f = newPage();
  f.y = titleBlock(f.page, b, {
    x: X, y: f.y, w: W, eyebrow: "Project management · work packages", title: o.projectName,
    meta: [["Project no.", o.projectNo || ""], ["Client", o.clientName || ""], ["As of", fmtDay(new Date())]],
  });
  if (o.note) { f.page.drawText(o.note, { x: X, y: f.y + 4, size: 8, font: b.regular, color: C.s500 }); f.y -= 12; }
  f.y = sectionHeading(f.page, b, "Work packages", X, f.y, W);

  // Letter landscape is tight for this many columns: the RFQ and its quotes share one, the money
  // sits under one heading with short labels, and long values wrap rather than run over.
  const cols: TableCol[] = [
    { label: "#", w: 30 },
    { label: "Work package", w: 0, wrap: true },
    { label: "RFQ / quotes", w: o.money ? 78 : 104, wrap: true },
    { label: "Winner", w: o.money ? 66 : 92, wrap: true },
    { label: "PO / agrmt", w: o.money ? 56 : 76, wrap: true },
    { label: "Status", w: 44, wrap: true },
    { label: "Done", w: 40 },
    ...(o.money ? [
      { label: "Original", w: 48, align: "right" as const, band: "Money", wrap: true },
      { label: "+/- CO", w: 48, align: "right" as const, band: "Money", wrap: true },
      { label: "Current", w: 48, align: "right" as const, band: "Money", wrap: true },
      { label: "Paid", w: 48, align: "right" as const, band: "Money", wrap: true },
      { label: "Balance", w: 48, align: "right" as const, band: "Money", wrap: true },
    ] : []),
  ];
  cols[1].w = Math.max(96, W - cols.reduce((s, c) => s + c.w, 0));
  const statusCol = 5, pctCol = 6;
  const rows: TableRow[] = [];
  const totals = { original: 0, changes: 0, current: 0, paid: 0, remaining: 0 };
  for (const { p, no, progress } of o.packages) {
    const m = p.money;
    if (m) { totals.original += m.original; totals.changes += m.changes; totals.current += m.current; totals.paid += m.paid; totals.remaining += m.remaining; }
    const cellColors: TableRow["cellColors"] = [];
    cellColors[statusCol] = STATUS_INK[p.status];
    if (o.money && m && m.changes) cellColors[8] = m.changes > 0 ? RED : EMERALD;
    rows.push({
      bold: true,
      fill: p.changeOrders.length ? rgb(1, 0.98, 0.92) : undefined,
      cells: [
        `${no}.0`,
        [p.name, p.description, p.remarks ? `Remarks: ${p.remarks}` : ""].filter(Boolean).join("\n"),
        [rfqText(p), p.quotes.count ? quotesText(p) : ""].filter((x) => x && x !== "-").join("\n") || "-", winnerText(p), contractText(p),
        STATUS[p.status], `${progress}%`,
        ...(o.money ? (m ? [
          m.original || m.source ? fig(o, m.original) : "-",
          m.changeCount ? `${m.changes >= 0 ? "+" : "-"}${fig(o, Math.abs(m.changes))}\n${m.changeCount} CO` : "-",
          m.current || m.source ? fig(o, m.current) : "-",
          m.paid || m.source ? fig(o, m.paid) : "-",
          m.current || m.source ? fig(o, m.remaining) : "-",
        ] : ["-", "-", "-", "-", "-"]) : []),
      ],
      cellColors,
      bar: { col: pctCol, pct: progress, color: progress >= 100 ? EMERALD : BLUE },
    });
    p.subtasks.forEach((t, i) => {
      const sc: TableRow["cellColors"] = [];
      sc[statusCol] = STATUS_INK[t.status];
      rows.push({
        cells: [`${no}.${i + 1}`, `    ${t.name}${t.assignee ? ` · ${t.assignee}` : ""}${t.dueDate ? ` · due ${fmtDay(t.dueDate)}` : ""}`, "", "", "", STATUS[t.status], `${t.progress}%`, ...(o.money ? ["", "", "", "", ""] : [])],
        cellColors: sc,
        bar: { col: pctCol, pct: t.progress, color: t.progress >= 100 ? EMERALD : BLUE },
      });
    });
  }
  if (o.money && o.packages.length) {
    rows.push({ bold: true, fill: C.mist, cells: ["", "Totals", "", "", "", "", "", fig(o, totals.original), totals.changes ? `${totals.changes >= 0 ? "+" : "-"}${fig(o, Math.abs(totals.changes))}` : "-", fig(o, totals.current), fig(o, totals.paid), fig(o, totals.remaining)] });
  }
  f = drawTable(b, f, X, cols, rows.length ? rows : [{ cells: ["", "No work packages."] }], { newPage, size: 7, maxLines: 8 });
  stampPageNumbers(doc, b);
  return new Blob([await doc.save()], { type: "application/pdf" });
}

/**
 * 2026-10-07 - "Create Report": what goes in a report. A package's own report, or one for all of
 * them (the summary, then a part for each package).
 */
export interface WpReportSections {
  /** All packages: the totals, then one line per package. */
  summary: boolean;
  /** The description, and who does it under which RFQ, PO or agreement. */
  details: boolean;
  /** Each RFQ's offers: vendor, total, lead time, result. */
  quotes: boolean;
  subtasks: boolean;
  /** The contract value, change orders, paid and remaining (only for someone who may see the figures). */
  money: boolean;
  remarks: boolean;
}
/** A package's RFQ and the offers on it, for the report. */
export interface WpReportRfq {
  no: string; title: string; date?: string; status: string; currency: string;
  quotes: Array<{ vendor: string; total: number; lead: string; status: "Awarded" | "NotSelected" | "Received" }>;
}
type WpItem = { p: ApiWorkPackage; no: number; progress: number; rfqs?: WpReportRfq[] };
type WpParts = Omit<WpReportSections, "summary">;

/** One package from a fresh page: its title, then the parts asked for. */
function drawPackage(b: Brand, first: Flow, newPage: () => Flow, o: Pick<WorkPackagesPdfInput, "money" | "masked" | "projectName">, item: WpItem, s: WpParts): Flow {
  const { p, no, progress } = item;
  const X = GUTTER, W = LETTER.w - GUTTER * 2;
  let f = first;
  f.y = titleBlock(f.page, b, {
    x: X, y: f.y, w: W, eyebrow: `Work package ${no}.0 · ${o.projectName}`, title: p.name,
    meta: [["Status", STATUS[p.status]], ["Progress", `${progress}%`], ["As of", fmtDay(new Date())]],
  });
  if (s.details) {
    if (p.description) f = flowText(f, p.description, { x: X, w: W, font: b.regular, size: 9.5, lineHeight: 13, color: C.slate, newPage });
    f.y -= 8;
    f.y = sectionHeading(f.page, b, "Who does it and under what", X, f.y, W);
    const trail: TableRow[] = [
      { cells: ["Responsible", p.winner ? `${p.winner.name}${p.winner.internal ? " (done in-house)" : p.winner.place ? `, ${p.winner.place}` : ""}` : "Not chosen yet"] },
      { cells: ["RFQ", p.rfq ? `RFQ ${p.rfq.no}${p.rfq.title ? `, ${p.rfq.title}` : ""}${p.rfq.date ? `, ${fmtDay(p.rfq.date)}` : ""}, ${p.rfq.status}${p.rfq.vendors ? `, sent to ${p.rfq.vendors} vendor${p.rfq.vendors === 1 ? "" : "s"}` : ""}` : "-"] },
      { cells: ["Quotes", p.quotes.count ? `${p.quotes.count}: ${p.quotes.names.join(", ")}` : "-"] },
      { cells: ["Purchase order", p.po ? `${p.po.no}, ${p.po.signed ? "signed" : p.po.status}${p.po.date ? `, ${fmtDay(p.po.date)}` : ""}` : "-"] },
      { cells: ["Agreement", p.agreement ? `${p.agreement.no}${p.agreement.title ? `, ${p.agreement.title}` : ""}, ${p.agreement.status}${p.agreement.date ? `, ${fmtDay(p.agreement.date)}` : ""}` : "-"] },
    ];
    f = drawTable(b, f, X, [{ label: "Item", w: 110 }, { label: "Details", w: W - 110, wrap: true }], trail, { newPage, size: 8.5, maxLines: 4 });
    f.y -= 24;
  }

  if (s.quotes && item.rfqs?.length) {
    for (const r of item.rfqs) {
      if (f.y < 170) f = newPage();
      f.y = sectionHeading(f.page, b, `Quotes on RFQ ${r.no}${r.title ? ` · ${r.title}` : ""}`, X, f.y, W);
      const money = (v: number) => {
        if (o.masked) return MASK;
        try { return v.toLocaleString("en-US", { style: "currency", currency: r.currency || "USD", maximumFractionDigits: 2 }); } catch { return usd(v); }
      };
      const priced = r.quotes.filter((q) => q.total > 0);
      const lowest = priced.length ? Math.min(...priced.map((q) => q.total)) : 0;
      const cols: TableCol[] = [{ label: "Vendor", w: 0, wrap: true }, ...(o.money ? [{ label: "Total", w: 90, align: "right" as const }] : []), { label: "Lead time", w: 70 }, { label: "Result", w: 100, wrap: true }];
      cols[0].w = W - cols.reduce((a, c) => a + c.w, 0);
      const rows: TableRow[] = r.quotes.map((q) => {
        const won = q.status === "Awarded";
        const cc: TableRow["cellColors"] = [];
        if (won) cc[cols.length - 1] = EMERALD;
        return {
          bold: won, fill: won ? rgb(0.93, 0.99, 0.96) : undefined, cellColors: cc,
          cells: [q.vendor, ...(o.money ? [q.total ? money(q.total) : "-"] : []), q.lead ? `${q.lead} days` : "-",
            won ? "Winner" : q.status === "NotSelected" ? "Not selected" : !q.total ? "Waiting for prices" : q.total === lowest && o.money ? "Lowest offer" : "Received"],
        };
      });
      f = drawTable(b, f, X, cols, rows.length ? rows : [{ cells: ["No vendors on this RFQ yet."] }], { newPage, size: 8, maxLines: 3 });
      f.page.drawText(`RFQ ${r.no}${r.date ? `, ${fmtDay(r.date)}` : ""}, ${r.status}. ${r.quotes.length} vendor${r.quotes.length === 1 ? "" : "s"}.`, { x: X, y: f.y - 12, size: 7.5, font: b.regular, color: C.s500 });
      f.y -= 38;
    }
  }

  if (s.subtasks && p.subtasks.length) {
    if (f.y < 140) f = newPage();
    f.y = sectionHeading(f.page, b, "Subtasks and deliverables", X, f.y, W);
    const rows: TableRow[] = p.subtasks.map((t, i) => {
      const cc: TableRow["cellColors"] = []; cc[2] = STATUS_INK[t.status];
      return { cells: [`${no}.${i + 1}`, t.name, STATUS[t.status], `${t.progress}%`, t.dueDate ? fmtDay(t.dueDate) : "-", t.assignee || "-"], cellColors: cc, bar: { col: 3, pct: t.progress, color: t.progress >= 100 ? EMERALD : BLUE } };
    });
    f = drawTable(b, f, X, [{ label: "#", w: 32 }, { label: "Subtask", w: W - 32 - 70 - 70 - 72 - 90, wrap: true }, { label: "Status", w: 70 }, { label: "Progress", w: 70 }, { label: "Due", w: 72 }, { label: "Person", w: 90, wrap: true }], rows, { newPage, size: 8, maxLines: 3 });
    f.y -= 24;
  }

  if (s.money && o.money && p.money) {
    const m = p.money;
    if (f.y < 200) f = newPage();
    f.y = sectionHeading(f.page, b, "Money", X, f.y, W);
    const cw = (W - 4 * 8) / 5;
    const cards: Array<[string, string]> = [
      [m.source === "po" ? "PO value" : m.source === "agreement" ? "Contract value" : "Original value", fig(o, m.original)],
      ["Change orders", m.changeCount ? `${m.changes >= 0 ? "+" : "-"}${fig(o, Math.abs(m.changes))}` : "-"],
      ["Current value", fig(o, m.current)],
      ["Paid", fig(o, m.paid)],
      ["Remaining", fig(o, m.remaining)],
    ];
    cards.forEach(([k, v], i) => kpiCard(f.page, b, X + i * (cw + 8), f.y, cw, 44, k, v, k === "Change orders" && m.changes > 0 ? RED : C.slate));
    f.y -= 60;
    if (p.changeOrders.length) {
      const rows: TableRow[] = p.changeOrders.map((c) => ({ cells: [c.no, c.date ? fmtDay(c.date) : "-", [c.reason, c.documentName ? `(document: ${c.documentName})` : ""].filter(Boolean).join(" ") || "-", c.amount === undefined ? "-" : `${c.amount >= 0 ? "+" : "-"}${fig(o, Math.abs(c.amount))}`, c.status === "approved" ? "Approved" : "Proposed"] }));
      f = drawTable(b, f, X, [{ label: "Change order", w: 70 }, { label: "Date", w: 70 }, { label: "Reason", w: W - 70 - 70 - 80 - 70, wrap: true }, { label: "Amount", w: 80, align: "right" }, { label: "Status", w: 70 }], rows, { newPage, size: 8, maxLines: 4 });
      f.y -= 24;
    }
    if (m.source === "budget") { f.page.drawText("The original value was typed on the package (no PO carries it).", { x: X, y: f.y + 10, size: 7.5, font: b.regular, color: C.s500 }); f.y -= 10; }
  }

  if (s.remarks && p.remarks) {
    if (f.y < 100) f = newPage();
    f.y = sectionHeading(f.page, b, "Remarks", X, f.y, W);
    f = flowText(f, p.remarks, { x: X, w: W, font: b.regular, size: 9.5, lineHeight: 13, color: C.slate, newPage });
  }
  return f;
}

/** One package on one sheet: what it is, its commercial trail, its subtasks and its money. */
export async function buildWorkPackageSheet(o: Omit<WorkPackagesPdfInput, "packages" | "note"> & { item: { p: ApiWorkPackage; no: number; progress: number } }): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const newPage = (): Flow => brandPage(doc, b, LETTER, `Work package ${o.item.no}.0  ·  ${o.projectName}`);
  drawPackage(b, newPage(), newPage, o, o.item, { details: true, quotes: false, subtasks: true, money: true, remarks: true });
  stampPageNumbers(doc, b);
  return new Blob([await doc.save()], { type: "application/pdf" });
}

/**
 * 2026-10-07 - "each work package should have its own Create Report. Also another Create Report
 * on the main tab, from all the work packages." One package: its part only. All of them: the
 * summary (totals and a line per package), then a part for each package, each from a new page.
 */
export async function buildWorkPackagesReport(o: Omit<WorkPackagesPdfInput, "packages"> & { items: WpItem[]; sections: WpReportSections }): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const X = GUTTER, W = LETTER.w - GUTTER * 2;
  const single = o.items.length === 1 && !o.sections.summary;
  const footer = single ? `Work package ${o.items[0].no}.0 report  ·  ${o.projectName}` : `Work packages report  ·  ${o.projectName}`;
  const newPage = (): Flow => brandPage(doc, b, LETTER, footer);
  const parts: WpParts = { details: o.sections.details, quotes: o.sections.quotes, subtasks: o.sections.subtasks, money: o.sections.money, remarks: o.sections.remarks };
  const anyPart = Object.values(parts).some(Boolean);

  if (o.sections.summary || !anyPart) {
    let f = newPage();
    const n = o.items.length;
    f.y = titleBlock(f.page, b, {
      x: X, y: f.y, w: W, eyebrow: "Project management · work packages report", title: o.projectName,
      meta: [["Project no.", o.projectNo || ""], ["Client", o.clientName || ""], ["Packages", String(n)], ["As of", fmtDay(new Date())]],
    });
    if (o.note) { f.page.drawText(o.note, { x: X, y: f.y + 4, size: 8, font: b.regular, color: C.s500 }); f.y -= 12; }
    const count = (st: WorkPackageStatus) => o.items.filter((x) => x.p.status === st).length;
    const avg = n ? Math.round(o.items.reduce((a, x) => a + x.progress, 0) / n) : 0;
    const cw4 = (W - 3 * 8) / 4;
    ([["Work packages", String(n)], ["Complete", `${count("complete")} of ${n}`], ["In progress", String(count("in_progress"))], ["Average progress", `${avg}%`]] as Array<[string, string]>)
      .forEach(([k, v], i) => kpiCard(f.page, b, X + i * (cw4 + 8), f.y, cw4, 44, k, v));
    f.y -= 58;
    const totals = o.items.reduce((a, { p }) => (p.money ? { original: a.original + p.money.original, changes: a.changes + p.money.changes, current: a.current + p.money.current, paid: a.paid + p.money.paid, remaining: a.remaining + p.money.remaining } : a), { original: 0, changes: 0, current: 0, paid: 0, remaining: 0 });
    if (o.money) {
      const cw5 = (W - 4 * 8) / 5;
      ([["Original", fig(o, totals.original)], ["Change orders", totals.changes ? `${totals.changes >= 0 ? "+" : "-"}${fig(o, Math.abs(totals.changes))}` : "-"], ["Current value", fig(o, totals.current)], ["Paid", fig(o, totals.paid)], ["Remaining", fig(o, totals.remaining)]] as Array<[string, string]>)
        .forEach(([k, v], i) => kpiCard(f.page, b, X + i * (cw5 + 8), f.y, cw5, 44, k, v, k === "Change orders" && totals.changes > 0 ? RED : C.slate));
      f.y -= 58;
    }
    const others = STATUSES_ORDER.filter((st) => st !== "complete" && st !== "in_progress" && count(st) > 0);
    if (others.length) { f.page.drawText(others.map((st) => `${STATUS[st]}: ${count(st)}`).join("   ·   "), { x: X, y: f.y - 2, size: 8, font: b.regular, color: C.s500 }); f.y -= 20; }

    f.y = sectionHeading(f.page, b, "Packages", X, f.y, W);
    const cols: TableCol[] = [
      { label: "#", w: 30 }, { label: "Work package", w: 0, wrap: true }, { label: "Responsible", w: o.money ? 80 : 120, wrap: true },
      { label: "Status", w: 58, wrap: true }, { label: "Done", w: 40 },
      ...(o.money ? [{ label: "Current", w: 60, align: "right" as const }, { label: "Paid", w: 56, align: "right" as const }, { label: "Left", w: 56, align: "right" as const }] : []),
    ];
    // Letter portrait leaves 468 pt: the package's name takes what the rest leave (88 pt with money).
    cols[1].w = Math.max(80, W - cols.reduce((a, c) => a + c.w, 0));
    const rows: TableRow[] = o.items.map(({ p, no, progress }) => {
      const cc: TableRow["cellColors"] = []; cc[3] = STATUS_INK[p.status];
      const m = p.money;
      return {
        cells: [`${no}.0`, p.name, p.winner ? p.winner.name : "-", STATUS[p.status], `${progress}%`,
          ...(o.money ? (m ? [m.current || m.source ? fig(o, m.current) : "-", m.paid || m.source ? fig(o, m.paid) : "-", m.current || m.source ? fig(o, m.remaining) : "-"] : ["-", "-", "-"]) : [])],
        cellColors: cc, fill: p.changeOrders.length ? rgb(1, 0.98, 0.92) : undefined,
        bar: { col: 4, pct: progress, color: progress >= 100 ? EMERALD : BLUE },
      };
    });
    if (o.money && rows.length) rows.push({ bold: true, fill: C.mist, cells: ["", "Totals", "", "", "", fig(o, totals.current), fig(o, totals.paid), fig(o, totals.remaining)] });
    drawTable(b, f, X, cols, rows.length ? rows : [{ cells: ["", "No work packages."] }], { newPage, size: 7.5, maxLines: 4 });
  }

  if (anyPart) for (const item of o.items) drawPackage(b, newPage(), newPage, o, item, parts);
  stampPageNumbers(doc, b);
  return new Blob([await doc.save()], { type: "application/pdf" });
}
