import { PDFDocument, rgb } from "pdf-lib";
import type { ApiProject, ProjectFinancials } from "./api";
import { C, NARROW, TABLOID_LANDSCAPE, brandPage, drawTable, kpiCard, loadBrand, sectionHeading, stampPageNumbers, titleBlock, type Flow, type TableRow } from "./pdfBrand";
import { COMPANY } from "./brandTokens";
import { moneyNum, withBonding } from "./bonding";
import { WIP_CURRENT, WIP_OPPORTUNITY, contractWithChanges, plannedProfit, withWip } from "./wip";
import { effectiveEndDate, fmtDay } from "./projectSchedule";
import { statusMatches } from "./projectStatus";

/**
 * CR 311 (2026-09-25): the work-in-progress (WIP) report banks, sureties and bonding companies ask
 * for, in two tables on an 11" x 17" landscape sheet:
 *   1. Current and completed contracts - price, profit, billed, cost to date and to complete.
 *   2. Future opportunities - the proposals out, their value and the chance of winning them.
 * Each bank has its own form; this report puts every figure in one place to copy from. Columns the
 * system does not hold for a project are left blank, to be filled in by hand.
 */

const inStatuses = (p: ApiProject, list: string[]) => list.some((s) => statusMatches(s, p.status));

const PAGE = TABLOID_LANDSCAPE;
const RED = rgb(0.86, 0.15, 0.15);
const X = NARROW + 18;
const W = PAGE.w - X * 2;

const usd = (n: number) => (n ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "");
const neg = (n: number) => (n < 0 ? `(${usd(-n)})` : usd(n));
const statusLabel = (s: string) => ({ BidSubmitted: "Awaiting award", Active: "Ongoing", Closed: "Completed", Warranty: "Warranty / DLP", Proposal: "Proposal" } as Record<string, string>)[s] || s;

export async function buildWipReportPdf(o: {
  projects: ApiProject[];
  financials: Record<string, ProjectFinancials>;
  current: boolean;
  opportunities: boolean;
  scope: string;
}): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const note = `${COMPANY.name} · work in progress report`;
  const newPage = (): Flow => brandPage(doc, b, PAGE, note);
  let f = newPage();
  const today = new Date();

  const current = o.projects.filter((p) => inStatuses(p, WIP_CURRENT));
  const opps = o.projects.filter((p) => inStatuses(p, WIP_OPPORTUNITY));

  f.y = titleBlock(f.page, b, {
    x: X, y: f.y, w: W,
    eyebrow: "Work in progress report",
    title: COMPANY.name,
    meta: [["As of", fmtDay(today)], ["Address", COMPANY.mailingAddress], ["Phone", COMPANY.phone], ["Email", COMPANY.email]],
  });
  f.y -= 4;

  // ── Headline figures ──
  const rows1 = current.map((p) => {
    const w = withWip(p.wip);
    const fin = o.financials[p.id] || ({} as ProjectFinancials);
    const price = contractWithChanges(p.value, w);
    const billed = fin.totalInvoiced ?? fin.income ?? 0;
    const cost = fin.expenses ?? 0;
    const toComplete = moneyNum(w.costToComplete);
    const revised = w.costToComplete ? price - cost - toComplete : NaN;
    return { p, w, price, planned: plannedProfit(p.value, w), billed, cost, toComplete, revised };
  });
  const rows2 = opps.map((p) => {
    const w = withWip(p.wip);
    const value = moneyNum(p.value);
    const win = parseFloat(w.winChance);
    return { p, w, value, funded: moneyNum(w.fundedValue), win, profit: plannedProfit(p.value, w) };
  });
  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + (isFinite(f(x)) ? f(x) : 0), 0);
  const cards: Array<[string, string]> = [];
  if (o.current) cards.push(["Contracts in hand", String(rows1.filter((r) => !statusMatches("Closed", r.p.status)).length)], ["Contract value (in hand)", usd(sum(rows1.filter((r) => !statusMatches("Closed", r.p.status)), (r) => r.price)) || "$0"], ["Backlog (not yet billed)", usd(sum(rows1.filter((r) => !statusMatches("Closed", r.p.status)), (r) => Math.max(0, r.price - r.billed))) || "$0"]);
  if (o.opportunities) cards.push(["Opportunities", String(rows2.length)], ["Pipeline value", usd(sum(rows2, (r) => r.value)) || "$0"], ["Weighted by chance", usd(sum(rows2, (r) => (isFinite(r.win) ? (r.value * r.win) / 100 : 0))) || "$0"]);
  if (cards.length) {
    const cw = (W - (cards.length - 1) * 8) / cards.length;
    cards.forEach(([k, v], i) => kpiCard(f.page, b, X + i * (cw + 8), f.y, cw, 44, k, v, C.slate));
    f.y -= 62;
  }

  // ── 1. Current and completed contracts ──
  if (o.current) {
    f.y = sectionHeading(f.page, b, `Current and completed contracts  (${rows1.length})`, X, f.y, W);
    // Short headings, grouped under a shared band where they belong together; the note under the
    // report spells them out.
    const cols = [
      { label: "GT #", w: 40 },
      { label: "Contract / description", w: 190, wrap: true },
      { label: "Status", w: 74 },
      { label: "Bonded", w: 44 },
      { label: "Contract price*", w: 88, align: "right" as const },
      { label: "Billed to date", w: 84, align: "right" as const },
      { label: "To date", w: 80, align: "right" as const, band: "Cost" },
      { label: "To complete", w: 80, align: "right" as const, band: "Cost" },
      { label: "Original", w: 84, align: "right" as const, band: "Est. gross profit" },
      { label: "Revised", w: 84, align: "right" as const, band: "Est. gross profit" },
      { label: "Done", w: 42, align: "right" as const },
      { label: "Completion", w: 66 },
    ];
    const extra = W - cols.reduce((s, c) => s + c.w, 0);
    cols[1] = { ...cols[1], w: cols[1].w + extra };
    const rows: TableRow[] = rows1.map((r) => {
      const bond = withBonding(r.p.bonding);
      return {
        cells: [
          r.p.id,
          [r.p.name, [r.p.clientInfo?.name, r.p.contractNo ? `Contract ${r.p.contractNo}` : "", r.p.contractType].filter(Boolean).join(" · ")].filter(Boolean).join("\n"),
          statusLabel(r.p.status),
          bond.bonded === "yes" ? "Yes" : bond.bonded === "no" ? "No" : "",
          usd(r.price),
          usd(r.billed),
          usd(r.cost),
          r.w.costToComplete ? usd(r.toComplete) || "$0" : "",
          r.planned ? `${usd(r.planned)} (${r.w.grossProfitPct}%)` : "",
          isFinite(r.revised) ? neg(r.revised) : "",
          `${Math.round(r.p.progress || 0)}%`,
          fmtDay(effectiveEndDate(r.p)) || "",
        ],
        cellColors: [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, isFinite(r.revised) && r.revised < 0 ? RED : undefined],
      };
    });
    if (rows1.length) {
      rows.push({
        bold: true, fill: C.mist,
        cells: ["", "Total", "", "", usd(sum(rows1, (r) => r.price)), usd(sum(rows1, (r) => r.billed)), usd(sum(rows1, (r) => r.cost)), usd(sum(rows1, (r) => (r.w.costToComplete ? r.toComplete : 0))), usd(sum(rows1, (r) => r.planned)), neg(sum(rows1, (r) => (isFinite(r.revised) ? r.revised : 0))), "", ""],
      });
    }
    f = drawTable(b, f, X, cols, rows.length ? rows : [{ cells: ["", "No current or completed contracts."] }], { newPage, size: 8, maxLines: 4 });
    f.y -= 16;
  }

  // ── 2. Future opportunities ──
  if (o.opportunities) {
    if (f.y < 200) f = newPage();
    f.y = sectionHeading(f.page, b, `Future opportunities  (${rows2.length})`, X, f.y, W);
    const cols = [
      { label: "GT #", w: 44 },
      { label: "Project", w: 170, wrap: true },
      { label: "Client", w: 120, wrap: true },
      { label: "Prime contractor", w: 96, wrap: true },
      { label: "Contract type", w: 70, wrap: true },
      { label: "Competition", w: 86, wrap: true },
      { label: "Status", w: 80 },
      { label: "Start", w: 60, band: "Estimated" },
      { label: "End", w: 60, band: "Estimated" },
      { label: "Value", w: 84, align: "right" as const, band: "Contract" },
      { label: "Funded", w: 76, align: "right" as const, band: "Contract" },
      { label: "Win %", w: 46, align: "right" as const },
      { label: "Est. profit", w: 78, align: "right" as const },
    ];
    const extra = W - cols.reduce((s, c) => s + c.w, 0);
    cols[1] = { ...cols[1], w: cols[1].w + extra };
    const rows: TableRow[] = rows2.map((r) => ({
      cells: [
        r.p.id, r.p.name, r.p.clientInfo?.name || "", r.w.primeContractor || COMPANY.name, r.p.contractType || "", r.w.competition,
        statusLabel(r.p.status), fmtDay(r.p.startDate) || "", fmtDay(r.p.endDate) || "",
        usd(r.value), usd(r.funded) || (r.value ? "$0" : ""), isFinite(r.win) ? `${r.win}%` : "", usd(r.profit),
      ],
    }));
    if (rows2.length) {
      rows.push({ bold: true, fill: C.mist, cells: ["", "Total", "", "", "", "", "", "", "", usd(sum(rows2, (r) => r.value)), usd(sum(rows2, (r) => r.funded)), "", usd(sum(rows2, (r) => r.profit))] });
    }
    f = drawTable(b, f, X, cols, rows.length ? rows : [{ cells: ["", "No proposals out."] }], { newPage, size: 8, maxLines: 4 });
    f.y -= 12;
  }

  f.page.drawText(`Figures from the GreenTech project system, ${o.scope}. * Contract price includes approved change orders. Billed to date is the invoices sent (retainage included); cost to date is the expenses recorded. Revised gross profit = contract price - cost to date - cost to complete. Blank cells are not held in the system.`, {
    x: X, y: Math.max(60, f.y - 4), size: 7, font: b.regular, color: C.s500, maxWidth: W,
  });
  stampPageNumbers(doc, b);
  return new Blob([await doc.save()], { type: "application/pdf" });
}
