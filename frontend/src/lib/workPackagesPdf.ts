import { PDFDocument, rgb } from "pdf-lib";
import type { ApiWorkPackage, WorkPackageStatus } from "./api";
import { C, GUTTER, LETTER, brandPage, drawTable, flowText, kpiCard, loadBrand, sectionHeading, stampPageNumbers, titleBlock, type Flow, type TableCol, type TableRow } from "./pdfBrand";
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

/** One package on one sheet: what it is, its commercial trail, its subtasks and its money. */
export async function buildWorkPackageSheet(o: Omit<WorkPackagesPdfInput, "packages" | "note"> & { item: { p: ApiWorkPackage; no: number; progress: number } }): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const { p, no, progress } = o.item;
  const X = GUTTER, W = LETTER.w - GUTTER * 2;
  const newPage = (): Flow => brandPage(doc, b, LETTER, `Work package ${no}.0  ·  ${o.projectName}`);
  let f = newPage();
  f.y = titleBlock(f.page, b, {
    x: X, y: f.y, w: W, eyebrow: `Work package ${no}.0 · ${o.projectName}`, title: p.name,
    meta: [["Status", STATUS[p.status]], ["Progress", `${progress}%`], ["As of", fmtDay(new Date())]],
  });
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

  if (p.subtasks.length) {
    f.y = sectionHeading(f.page, b, "Subtasks and deliverables", X, f.y, W);
    const rows: TableRow[] = p.subtasks.map((t, i) => {
      const cc: TableRow["cellColors"] = []; cc[2] = STATUS_INK[t.status];
      return { cells: [`${no}.${i + 1}`, t.name, STATUS[t.status], `${t.progress}%`, t.dueDate ? fmtDay(t.dueDate) : "-", t.assignee || "-"], cellColors: cc, bar: { col: 3, pct: t.progress, color: t.progress >= 100 ? EMERALD : BLUE } };
    });
    f = drawTable(b, f, X, [{ label: "#", w: 32 }, { label: "Subtask", w: W - 32 - 70 - 70 - 72 - 90, wrap: true }, { label: "Status", w: 70 }, { label: "Progress", w: 70 }, { label: "Due", w: 72 }, { label: "Person", w: 90, wrap: true }], rows, { newPage, size: 8, maxLines: 3 });
    f.y -= 24;
  }

  if (o.money && p.money) {
    const m = p.money;
    if (f.y < 200) f = newPage();
    f.y = sectionHeading(f.page, b, "Money", X, f.y, W);
    const cw = (W - 4 * 8) / 5;
    const cards: Array<[string, string]> = [
      [m.source === "po" ? "Original (PO)" : m.source === "agreement" ? "Original (agreement)" : "Original value", fig(o, m.original)],
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

  if (p.remarks) {
    if (f.y < 120) f = newPage();
    f.y = sectionHeading(f.page, b, "Remarks", X, f.y, W);
    f = flowText(f, p.remarks, { x: X, w: W, font: b.regular, size: 9.5, lineHeight: 13, color: C.slate, newPage });
  }
  stampPageNumbers(doc, b);
  return new Blob([await doc.save()], { type: "application/pdf" });
}
