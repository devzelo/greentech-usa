import type { FinancialRow, FinancialTable } from "./api";

/**
 * Step 7b - price tables that calculate themselves. The specification: totals are always
 * calculated, never typed (both client samples carry arithmetic errors). A line's amount is
 * quantity × unit price; phase headings get subtotals; lines under the table add VAT, DBA
 * insurance, a markup or a discount; option years repeat the price with escalation (the PM sample).
 * Used by the builder and the PDF, so both always show the same numbers.
 */
export const pNum = (s: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;

export interface PriceGroup { id: string; label: string; rows: FinancialRow[]; subtotal: number }
export interface PriceCalc {
  computed: boolean;                            // the table has quantity and unit price columns
  isComputed: (r: FinancialRow) => boolean;     // this line's amount is quantity × unit price
  amountOf: (r: FinancialRow) => number;
  groups: PriceGroup[];                         // the first has no label (lines before any phase heading)
  items: number;                                // every line added up
  adjustments: Array<{ id: string; amount: number }>;
  total: number;                                // lines + adjustments, one period
  periods: Array<{ label: string; factor: number; total: number }>;   // base + option years (empty without)
  grand: number;                                // what the table adds to the grand total
}

export function tableCalc(tb: FinancialTable): PriceCalc {
  const qtyCol = tb.columns.find((c) => c.kind === "qty")?.id;
  const rateCol = tb.columns.find((c) => c.kind === "rate")?.id;
  const amountCols = tb.columns.filter((c) => c.kind === "amount").map((c) => c.id);
  const computed = !!qtyCol && !!rateCol;
  const cell = (r: FinancialRow, cid?: string) => (cid ? String(r.cells[cid] ?? "").trim() : "");
  // A lump-sum line (no quantity, no unit price) keeps its typed amount.
  const isComputed = (r: FinancialRow) => computed && (!!cell(r, qtyCol) || !!cell(r, rateCol));
  const amountOf = (r: FinancialRow) => {
    if (r.type === "group") return 0;
    if (isComputed(r)) return (cell(r, qtyCol) ? pNum(cell(r, qtyCol)) : 1) * pNum(cell(r, rateCol));
    return amountCols.reduce((s, cid) => s + pNum(r.cells[cid]), 0);
  };
  const groups: PriceGroup[] = [{ id: "", label: "", rows: [], subtotal: 0 }];
  for (const r of tb.rows) {
    if (r.type === "group") groups.push({ id: r.id, label: r.label || "", rows: [], subtotal: 0 });
    else { const g = groups[groups.length - 1]; g.rows.push(r); g.subtotal += amountOf(r); }
  }
  const items = groups.reduce((s, g) => s + g.subtotal, 0);
  const adjustments = (tb.adjustments || []).map((a) => ({ id: a.id, amount: a.mode === "percent" ? (items * pNum(a.value)) / 100 : pNum(a.value) }));
  const total = items + adjustments.reduce((s, a) => s + a.amount, 0);
  const n = Math.max(0, Math.floor(tb.optionYears?.count || 0));
  const esc = pNum(tb.optionYears?.escalation) / 100;
  const periods = n > 0
    ? [{ label: "Base Year", factor: 1, total }, ...Array.from({ length: n }, (_, k) => {
        const factor = Math.pow(1 + esc, k + 1);
        return { label: `Option Year ${k + 1}`, factor, total: total * factor };
      })]
    : [];
  const grand = periods.length ? periods.reduce((s, p) => s + p.total, 0) : total;
  return { computed, isComputed, amountOf, groups, items, adjustments, total, periods, grand };
}

/** "VAT (15%)" for a percentage line, the label alone for a fixed amount. */
export const adjustmentLabel = (a: { label: string; mode: string; value: string }) =>
  a.mode === "percent" ? `${a.label || "Adjustment"} (${pNum(a.value)}%)` : a.label || "Adjustment";

/** One-click lines under a table; every value stays editable. */
export const ADJUSTMENT_PRESETS: Array<{ label: string; mode: "percent" | "fixed"; value: string }> = [
  { label: "VAT", mode: "percent", value: "15" },
  { label: "DBA insurance", mode: "percent", value: "3" },
  { label: "Overhead & profit", mode: "percent", value: "10" },
  { label: "Discount", mode: "fixed", value: "" },
];
