import { PDFDocument, rgb, type Color, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { ApiProject, ProjectFinancials } from "./api";
import { BOTTOM, C, NARROW, WIDE_LANDSCAPE, brandPage, gradBar, loadBrand, stampPageNumbers, type Brand, type Flow } from "./pdfBrand";
import { COMPANY } from "./brandTokens";
import { moneyNum } from "./bonding";
import { WIP_CURRENT, WIP_OPPORTUNITY, contractWithChanges, withWip } from "./wip";
import { effectiveEndDate, fmtDay, parseDate } from "./projectSchedule";
import { statusMatches } from "./projectStatus";
import { timelineOverview } from "./timelineOverview";
import { fitOneLine, wrapText } from "./pdfText";

/**
 * CR 311 (2026-09-25): the work-in-progress (WIP) report banks, sureties and bonding companies ask
 * for. 2026-10-09 - laid out as the client's template (GT Platform Contract Backlog Template), in
 * GreenTech's letterhead and colours, on the platform's landscape sheet (24" x 18"):
 *   1. Active Projects - Contract Backlog: each contract's value, revenue earned, what remains,
 *      invoiced, costs to date and to complete, and the estimated gross profit.
 *   2. Potential Projects - Revenue Capture Opportunities: the proposals out, their estimated value,
 *      the chance of winning (Pwin) and the value weighted by it.
 *   3. Formulas & Report Definitions.
 * Figures the system does not hold for a project print as a dash, to be filled in by hand.
 */

const inStatuses = (p: ApiProject, list: string[]) => list.some((s) => statusMatches(s, p.status));

const PAGE = WIDE_LANDSCAPE;
const X = NARROW + 10;
const W = PAGE.w - X * 2;
const RED = rgb(0.86, 0.15, 0.15);
// The total row's band, a shade between the brand's mist and its border, as in the template.
const TOTAL_FILL = rgb(0.933, 0.949, 0.965);

const usd = (n: number) => `${n < 0 ? "(" : ""}${Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}${n < 0 ? ")" : ""}`;
/** "Jan 2026", as the template writes the dates. */
const monthYear = (v?: string) => { const d = parseDate(v); return d ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : ""; };
/** The contract's competition, as the template's "Set-Aside / Competitive" column reads it. */
const competition = (v: string) => (!v ? "" : /full and open|competitive/i.test(v) ? "Competitive" : v.replace(/\bset-aside\b/i, "Set-Aside").replace(/^./, (c) => c.toUpperCase()));
/** City and country, from the site address when it has them. */
const placeOf = (p: ApiProject) => {
  const city = p.siteAddress?.city?.trim(), country = p.siteAddress?.country?.trim();
  return city || country ? [city, country].filter(Boolean).join(", ") : (p.location || "").trim();
};

// ── A table with logos and flags in its cells ───────────────────────────────────────────────────
type Block = { text: string; font: PDFFont; size: number; color: Color; maxLines?: number };
type Cell =
  | { kind: "text"; blocks: Block[]; align?: "left" | "center" }
  | { kind: "customer"; logo?: PDFImage; name: string }
  | { kind: "place"; flag?: PDFImage; text: string };
interface Col { label: string; w: number }

// Sized for the 24" x 18" sheet, in the template's proportions.
const PAD_X = 9, PAD_Y = 14, LH = 1.32, LOGO = 44, MIN_ROW = 80, BODY = 10.2, TOTAL_H = 44;

function linesOf(bk: Block, maxW: number): string[] {
  const all = bk.text.split("\n").flatMap((t) => wrapText(bk.font, t, bk.size, maxW));
  if (!bk.maxLines || all.length <= bk.maxLines) return all;
  const kept = all.slice(0, bk.maxLines);
  kept[kept.length - 1] = fitOneLine(bk.font, `${kept[kept.length - 1]} ${all.slice(bk.maxLines).join(" ")}`, bk.size, maxW);
  return kept;
}
const blockH = (bk: Block, maxW: number) => linesOf(bk, maxW).length * bk.size * LH;

function cellHeight(c: Cell, w: number, b: Brand): number {
  const inner = w - PAD_X * 2;
  if (c.kind === "text") return c.blocks.reduce((h, bk, i) => h + blockH(bk, inner) + (i ? 2 : 0), 0);
  if (c.kind === "customer") {
    const nameW = inner - (c.logo ? LOGO + 8 : 0);
    return Math.max(c.logo ? LOGO : 0, blockH({ text: c.name, font: b.bold, size: BODY, color: C.slate, maxLines: 3 }, nameW));
  }
  return (c.flag ? 19 : 0) + blockH({ text: c.text, font: b.regular, size: BODY - 0.4, color: C.s600, maxLines: 3 }, inner);
}

function drawBlock(page: PDFPage, bk: Block, x: number, top: number, w: number, align: "left" | "center"): number {
  let y = top;
  for (const ln of linesOf(bk, w)) {
    y -= bk.size * LH;
    const tw = bk.font.widthOfTextAtSize(ln, bk.size);
    page.drawText(ln, { x: align === "center" ? x + (w - tw) / 2 : x, y: y + bk.size * 0.28, size: bk.size, font: bk.font, color: bk.color });
  }
  return y;
}

function drawCell(page: PDFPage, c: Cell, x: number, rowTop: number, w: number, rowH: number, b: Brand) {
  const inner = w - PAD_X * 2;
  const h = cellHeight(c, w, b);
  const top = rowTop - (rowH - h) / 2;
  if (c.kind === "text") {
    let y = top;
    c.blocks.forEach((bk, i) => { y = drawBlock(page, bk, x + PAD_X, y - (i ? 2 : 0), inner, c.align || "center"); });
    return;
  }
  if (c.kind === "customer") {
    let nx = x + PAD_X;
    if (c.logo) {
      const d = c.logo.scaleToFit(LOGO, LOGO);
      page.drawImage(c.logo, { x: nx + (LOGO - d.width) / 2, y: rowTop - rowH / 2 - d.height / 2, width: d.width, height: d.height });
      nx += LOGO + 8;
    }
    const name: Block = { text: c.name, font: b.bold, size: BODY, color: C.slate, maxLines: 3 };
    const nh = blockH(name, x + w - PAD_X - nx);
    drawBlock(page, name, nx, rowTop - (rowH - nh) / 2, x + w - PAD_X - nx, "left");
    return;
  }
  let y = top;
  if (c.flag) {
    const d = c.flag.scaleToFit(24, 15);
    page.drawImage(c.flag, { x: x + (w - d.width) / 2, y: y - d.height, width: d.width, height: d.height });
    y -= 19;
  }
  drawBlock(page, { text: c.text, font: b.regular, size: BODY - 0.4, color: C.s600, maxLines: 3 }, x + PAD_X, y, inner, "center");
}

function drawTable(b: Brand, flow: Flow, cols: Col[], rows: Cell[][], total: string[] | null, newPage: () => Flow, empty: string): Flow {
  let f = flow;
  // The header: navy, white, centred, on two lines where the template breaks them.
  const HEAD_SIZE = 9.8;
  const headLines = cols.map((c) => c.label.split("\n"));
  const headH = Math.max(...headLines.map((l) => l.length)) * HEAD_SIZE * LH + 32;
  const header = () => {
    let x = X;
    f.page.drawRectangle({ x: X, y: f.y - headH, width: W, height: headH, color: C.slate });
    cols.forEach((c, i) => {
      const ls = headLines[i];
      const blockHt = ls.length * HEAD_SIZE * LH;
      let y = f.y - (headH - blockHt) / 2;
      for (const ln of ls) {
        y -= HEAD_SIZE * LH;
        const tw = b.bold.widthOfTextAtSize(ln, HEAD_SIZE);
        f.page.drawText(ln, { x: x + (c.w - tw) / 2, y: y + HEAD_SIZE * 0.28, size: HEAD_SIZE, font: b.bold, color: C.white });
      }
      x += c.w;
    });
    f.y -= headH;
  };
  const rowLines = (top: number, h: number, fill?: Color) => {
    if (fill) f.page.drawRectangle({ x: X, y: top - h, width: W, height: h, color: fill });
    let x = X;
    for (let i = 0; i <= cols.length; i++) {
      // The outer edges and the lines between the columns.
      if (i === 0 || i === cols.length || !fill) f.page.drawLine({ start: { x, y: top }, end: { x, y: top - h }, thickness: 0.6, color: C.border });
      if (i < cols.length) x += cols[i].w;
    }
    f.page.drawLine({ start: { x: X, y: top - h }, end: { x: X + W, y: top - h }, thickness: 0.6, color: C.border });
  };

  if (f.y - headH - MIN_ROW < BOTTOM + 10) f = newPage();
  header();
  if (!rows.length) {
    const h = TOTAL_H;
    rowLines(f.y, h);
    f.page.drawText(empty, { x: X + PAD_X + 4, y: f.y - h / 2 - 3.5, size: BODY, font: b.regular, color: C.s500 });
    f.y -= h;
  }
  for (const row of rows) {
    const h = Math.max(MIN_ROW, Math.max(...row.map((c, i) => cellHeight(c, cols[i].w, b))) + PAD_Y * 2);
    if (f.y - h < BOTTOM + 10) { f = newPage(); header(); }
    rowLines(f.y, h);
    let x = X;
    row.forEach((c, i) => { drawCell(f.page, c, x, f.y, cols[i].w, h, b); x += cols[i].w; });
    f.y -= h;
  }
  if (total) {
    const h = TOTAL_H;
    if (f.y - h < BOTTOM + 10) { f = newPage(); header(); }
    rowLines(f.y, h, TOTAL_FILL);
    let x = X;
    total.forEach((t, i) => {
      if (t) {
        const size = BODY + 0.4;
        const tw = b.bold.widthOfTextAtSize(t, size);
        f.page.drawText(t, { x: i === 0 ? x + PAD_X + 4 : x + (cols[i].w - tw) / 2, y: f.y - h / 2 - 3.5, size, font: b.bold, color: C.slate });
      }
      x += cols[i].w;
    });
    f.y -= h;
  }
  return f;
}

/** Column widths from the template's proportions, stretched to the sheet. */
const widths = (weights: number[]) => { const t = weights.reduce((s, x) => s + x, 0); return weights.map((x) => (x / t) * W); };

export async function buildWipReportPdf(o: {
  projects: ApiProject[];
  financials: Record<string, ProjectFinancials>;
  current: boolean;
  opportunities: boolean;
  scope: string;
  /** Per project id: the client's logo and the country's flag, as PNG (or JPEG) data URLs. */
  assets?: Record<string, { logo?: string; flag?: string }>;
}): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const note = `${COMPANY.name} · work in progress (WIP) report`;
  const newPage = (): Flow => brandPage(doc, b, PAGE, note);
  let f = newPage();
  const today = new Date();

  // The logos and flags, embedded once each.
  const images = new Map<string, Promise<PDFImage | undefined>>();
  const image = (src?: string) => {
    if (!src) return Promise.resolve(undefined);
    let p = images.get(src);
    if (!p) {
      p = (/^data:image\/png/i.test(src) ? doc.embedPng(src) : doc.embedJpg(src)).catch(() => undefined);
      images.set(src, p);
    }
    return p;
  };
  const assetsOf = async (p: ApiProject) => ({ logo: await image(o.assets?.[p.id]?.logo), flag: await image(o.assets?.[p.id]?.flag) });

  // ── The heading, as the template sets it ──
  const HEAD = "GREENTECH USA  |  CONTRACT BACKLOG & REVENUE OPPORTUNITIES";
  const WIP = "WORK IN PROGRESS (WIP)";
  f.y -= 4;
  f.page.drawText(HEAD, { x: X, y: f.y - 20, size: 21, font: b.bold, color: C.slate });
  const ww = b.display.widthOfTextAtSize(WIP, 30);
  f.page.drawText(WIP, { x: X + W - ww, y: f.y - 26, size: 30, font: b.display, color: C.emerald });
  f.page.drawText(`Report as of: ${fmtDay(today)}`, { x: X, y: f.y - 44, size: 11, font: b.regular, color: C.s500 });
  f.y -= 58;
  gradBar(f.page, X, f.y, W, 2.5);
  f.y -= 30;

  const section = (title: string) => {
    if (f.y - 120 < BOTTOM) f = newPage();
    f.page.drawText(title, { x: X, y: f.y - 17, size: 17, font: b.bold, color: C.slate });
    f.y -= 32;
  };
  const txt = (text: string, o2: Partial<Block> = {}): Cell => ({ kind: "text", blocks: [{ text: text || "-", font: b.regular, size: BODY, color: C.s700, ...o2 }] });
  const project = (p: ApiProject): Cell => ({
    kind: "text", align: "left",
    blocks: [
      { text: p.name, font: b.bold, size: BODY + 0.4, color: C.slate, maxLines: 2 },
      ...(p.description?.trim() ? [{ text: p.description.trim(), font: b.regular, size: BODY - 1.2, color: C.s500, maxLines: 3 }] : []),
    ],
  });
  const sum = <T,>(xs: T[], fn: (x: T) => number | null) => xs.reduce((s, x) => s + (fn(x) ?? 0), 0);

  // ── 1. Active Projects - Contract Backlog ──
  if (o.current) {
    const rows = o.projects.filter((p) => inStatuses(p, WIP_CURRENT)).map((p) => {
      const w = withWip(p.wip);
      const fin = o.financials[p.id] || ({} as ProjectFinancials);
      const value = contractWithChanges(p.value, w);
      const invoiced = fin.totalInvoiced ?? fin.income ?? 0;
      const costs = fin.expenses ?? 0;
      const hasCtc = !!w.costToComplete?.trim();
      const ctc = hasCtc ? moneyNum(w.costToComplete) : null;
      const total = ctc !== null ? costs + ctc : null;
      // Revenue earned, cost to cost: the share of the estimated total cost spent so far. Without a
      // cost to complete, the work complete from the project's timeline.
      const earned = value ? (total ? Math.min(value, (value * costs) / total) : (value * timelineOverview(p).workPct) / 100) : 0;
      const profit = ctc !== null ? value - (costs + ctc) : null;
      return { p, w, value, earned, remaining: value - earned, invoiced, costs, ctc, profit };
    });
    section("1. Active Projects - Contract Backlog");
    const cols: Col[] = widths([156, 196, 88, 80, 84, 62, 62, 84, 84, 96, 84, 82, 86, 96, 112]).map((w, i) => ({ w, label: [
      "Customer", "Project Name /\nBrief Description", "Prime\nContractor", "Contract\nType", "Set-Aside /\nCompetitive", "Start\nDate", "End\nDate",
      "Contract\nValue", "Revenue\nEarned", "Remaining\nContract Value", "Invoiced\nto Date", "Costs to\nDate", "Cost to\nComplete", "Estimated\nGross Profit", "Project\nLocation*",
    ][i] }));
    const cells: Cell[][] = [];
    for (const r of rows) {
      const a = await assetsOf(r.p);
      cells.push([
        { kind: "customer", logo: a.logo, name: r.p.clientInfo?.name || "-" },
        project(r.p),
        txt(r.w.primeContractor || COMPANY.name),
        txt(r.p.contractType || ""),
        txt(competition(r.w.competition)),
        txt(monthYear(r.p.startDate || r.p.contractDate)),
        txt(monthYear(effectiveEndDate(r.p))),
        txt(r.value ? usd(r.value) : ""),
        txt(r.value ? usd(Math.round(r.earned)) : ""),
        txt(r.value ? usd(Math.round(r.remaining)) : ""),
        txt(usd(r.invoiced)),
        txt(usd(r.costs)),
        txt(r.ctc !== null ? usd(r.ctc) : ""),
        txt(r.profit !== null ? usd(r.profit) : "", r.profit !== null && r.profit < 0 ? { color: RED, font: b.bold } : {}),
        { kind: "place", flag: a.flag, text: placeOf(r.p) || "-" },
      ]);
    }
    const total = rows.length ? [
      "TOTAL", "", "", "", "", "", "",
      usd(sum(rows, (r) => r.value)), usd(Math.round(sum(rows, (r) => r.earned))), usd(Math.round(sum(rows, (r) => r.remaining))),
      usd(sum(rows, (r) => r.invoiced)), usd(sum(rows, (r) => r.costs)), usd(sum(rows, (r) => r.ctc)), usd(sum(rows, (r) => r.profit)), "",
    ] : null;
    f = drawTable(b, f, cols, cells, total, newPage, "No active projects.");
    f.y -= 30;
  }

  // ── 2. Potential Projects - Revenue Capture Opportunities ──
  if (o.opportunities) {
    const rows = o.projects.filter((p) => inStatuses(p, WIP_OPPORTUNITY)).map((p) => {
      const w = withWip(p.wip);
      const value = moneyNum(p.value);
      const pwin = parseFloat(w.winChance);
      return { p, w, value, pwin: isFinite(pwin) ? pwin : null, weighted: isFinite(pwin) ? (value * pwin) / 100 : null };
    });
    section("2. Potential Projects - Revenue Capture Opportunities");
    const cols: Col[] = widths([156, 206, 120, 120, 126, 98, 98, 112, 74, 120, 136]).map((w, i) => ({ w, label: [
      "Customer", "Project Name /\nBrief Description", "Prime Contractor", "Contract Type", "Set-Aside /\nCompetitive", "Expected\nStart Date", "Expected\nEnd Date",
      "Estimated\nContract Value", "Pwin (%)", "Weighted\nContract Value", "Project Location*",
    ][i] }));
    const cells: Cell[][] = [];
    for (const r of rows) {
      const a = await assetsOf(r.p);
      cells.push([
        { kind: "customer", logo: a.logo, name: r.p.clientInfo?.name || "-" },
        project(r.p),
        txt(r.w.primeContractor || COMPANY.name),
        txt(r.p.contractType || ""),
        txt(competition(r.w.competition)),
        txt(monthYear(r.p.startDate) || "TBD"),
        txt(monthYear(r.p.endDate) || "TBD"),
        txt(r.value ? usd(r.value) : ""),
        txt(r.pwin !== null ? `${r.pwin}%` : ""),
        txt(r.weighted !== null ? usd(Math.round(r.weighted)) : ""),
        { kind: "place", flag: a.flag, text: placeOf(r.p) || "-" },
      ]);
    }
    const total = rows.length ? ["TOTAL", "", "", "", "", "", "", usd(sum(rows, (r) => r.value)), "", usd(Math.round(sum(rows, (r) => r.weighted))), ""] : null;
    f = drawTable(b, f, cols, cells, total, newPage, "No proposals out.");
    f.y -= 30;
  }

  // ── 3. Formulas & Report Definitions ──
  const left = [
    "Remaining Contract Value = Contract Value - Revenue Earned.",
    "Estimated Gross Profit = Contract Value - (Costs to Date + Cost to Complete).",
    "Estimated Total Cost = Costs to Date + Cost to Complete.",
    "Revenue Earned: value of work completed; may differ from invoiced amounts. Here Contract Value x Costs to Date / Estimated Total Cost; without a Cost to Complete, Contract Value x the work complete on the timeline.",
    "Invoiced to Date: total invoices issued to the customer, not cash received.",
  ];
  const right = [
    "Weighted Contract Value = Estimated Contract Value x (Pwin / 100).",
    "Costs to Date: actual project costs incurred.",
    "Cost to Complete: estimated additional costs to finish the project.",
    "Totals: sum monetary columns; Pwin is project-specific and is not summed.",
    "Project Location*: optional field; city and country. Contract Value includes approved change orders; a dash is a figure not held for the project.",
  ];
  const DEF = 10.5, colW = (W - 60) / 2 - 10;
  const defH = (list: string[]) => list.reduce((h, t) => h + wrapText(b.regular, t, DEF, colW).length * DEF * 1.45 + 9, 0);
  const boxH = Math.max(defH(left), defH(right)) + 36;
  if (f.y - 30 - boxH < BOTTOM) f = newPage();
  f.page.drawText("3. Formulas & Report Definitions", { x: X, y: f.y - 17, size: 17, font: b.bold, color: C.slate });
  f.y -= 32;
  f.page.drawRectangle({ x: X, y: f.y - boxH, width: W, height: boxH, color: C.mist, borderColor: C.border, borderWidth: 0.6 });
  [left, right].forEach((list, ci) => {
    let y = f.y - 24;
    const x = X + 20 + ci * ((W - 40) / 2);
    for (const t of list) {
      for (const ln of wrapText(b.regular, t, DEF, colW)) { f.page.drawText(ln, { x, y, size: DEF, font: b.regular, color: C.s600 }); y -= DEF * 1.45; }
      y -= 9;
    }
  });
  f.y -= boxH + 14;
  f.page.drawText(`Figures from the GreenTech project system (${o.scope}), as of ${fmtDay(today)}.`, { x: X, y: Math.max(BOTTOM, f.y), size: 9.5, font: b.regular, color: C.s500 });

  stampPageNumbers(doc, b);
  return new Blob([await doc.save()], { type: "application/pdf" });
}
