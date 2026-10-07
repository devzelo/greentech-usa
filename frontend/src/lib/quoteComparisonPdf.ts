import { PDFDocument, rgb } from "pdf-lib";
import { C, GUTTER, LETTER, brandPage, drawTable, loadBrand, sectionHeading, stampPageNumbers, titleBlock, type Flow, type TableCol, type TableRow } from "./pdfBrand";
import { fmtDay } from "./projectSchedule";

/**
 * 2026-10-07 - the quotes on one RFQ side by side, as a PDF to preview, download or share from a
 * work package's Quotes tab: each offer's totals, lead time and result, the prices item by item,
 * and what each vendor included, excluded or noted. Letter paper, landscape past three vendors.
 */
export interface QuoteComparisonInput {
  projectName: string;
  projectNo?: string;
  rfqNo: string;
  title: string;
  date?: string;
  dueDate?: string;
  currency: string;
  items: Array<{ id: string; description: string; qty: string; unit: string }>;
  offers: Array<{
    vendor: string; items: number; shipping: number; tax: number; total: number; lead: string;
    status: "Awarded" | "NotSelected" | "Received"; unitPrices: Record<string, number>;
    inclusions: string; exclusions: string; notes: string;
  }>;
}

const EMERALD = rgb(0.02, 0.59, 0.41);
const PER_TABLE = 5;   // vendor columns side by side before the item table continues below

export async function buildQuoteComparisonPdf(o: QuoteComparisonInput): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const size = o.offers.length > 3 ? { w: LETTER.h, h: LETTER.w } : LETTER;
  const X = GUTTER, W = size.w - GUTTER * 2;
  const money = (v: number) => {
    try { return v.toLocaleString("en-US", { style: "currency", currency: o.currency || "USD", maximumFractionDigits: 2 }); }
    catch { return `${o.currency || ""} ${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`.trim(); }
  };
  const newPage = (): Flow => brandPage(doc, b, size, `Quote comparison  ·  RFQ ${o.rfqNo}  ·  ${o.projectName}`);
  let f = newPage();
  f.y = titleBlock(f.page, b, {
    x: X, y: f.y, w: W, eyebrow: `Quote comparison · ${o.projectName}`, title: `RFQ ${o.rfqNo}${o.title ? ` · ${o.title}` : ""}`,
    meta: [["RFQ date", o.date ? fmtDay(o.date) : "-"], ["Response due", o.dueDate ? fmtDay(o.dueDate) : "-"], ["Currency", o.currency || "USD"], ["As of", fmtDay(new Date())]],
  });

  // ── The offers ──
  f.y = sectionHeading(f.page, b, "Offers", X, f.y, W);
  const priced = o.offers.filter((x) => x.total > 0);
  const lowest = priced.length ? Math.min(...priced.map((x) => x.total)) : 0;
  const offerCols: TableCol[] = [
    { label: "Vendor", w: 0, wrap: true },
    { label: "Items", w: 66, align: "right" }, { label: "Shipping", w: 58, align: "right" }, { label: "Tax", w: 50, align: "right" },
    { label: "Total", w: 70, align: "right" }, { label: "Lead time", w: 54 }, { label: "Result", w: 74, wrap: true },
  ];
  // Letter portrait leaves 468 pt: the vendor takes what the figures leave (96 pt).
  offerCols[0].w = Math.max(80, W - offerCols.reduce((s, c) => s + c.w, 0));
  const offerRows: TableRow[] = o.offers.map((x) => {
    const won = x.status === "Awarded";
    const cc: TableRow["cellColors"] = [];
    if (won) cc[6] = EMERALD;
    return {
      bold: won,
      fill: won ? rgb(0.93, 0.99, 0.96) : undefined,
      cells: [
        x.vendor, x.items ? money(x.items) : "-", x.shipping ? money(x.shipping) : "-", x.tax ? money(x.tax) : "-",
        x.total ? money(x.total) : "-", x.lead ? `${x.lead} days` : "-",
        won ? "Winner" : x.status === "NotSelected" ? "Not selected" : !x.total ? "Waiting for prices" : x.total === lowest ? "Lowest offer" : "Received",
      ],
      cellColors: cc,
    };
  });
  f = drawTable(b, f, X, offerCols, offerRows.length ? offerRows : [{ cells: ["No vendors on this RFQ yet."] }], { newPage, size: 8, maxLines: 3 });
  f.y -= 22;

  // ── Prices item by item, a few vendors at a time ──
  if (o.items.length && o.offers.length) {
    for (let start = 0; start < o.offers.length; start += PER_TABLE) {
      const group = o.offers.slice(start, start + PER_TABLE);
      if (f.y < 160) f = newPage();
      f.y = sectionHeading(f.page, b, o.offers.length > PER_TABLE ? `Unit prices (${start + 1} to ${start + group.length} of ${o.offers.length} vendors)` : "Unit prices", X, f.y, W);
      const vw = Math.min(96, Math.floor((W - 200) / group.length));
      const cols: TableCol[] = [
        { label: "#", w: 24 }, { label: "Item", w: 0, wrap: true }, { label: "Qty", w: 52, align: "right" },
        ...group.map((x) => ({ label: x.vendor.length > 18 ? `${x.vendor.slice(0, 17)}.` : x.vendor, w: vw, align: "right" as const })),
      ];
      cols[1].w = Math.max(90, W - cols.reduce((s, c) => s + c.w, 0));
      const rows: TableRow[] = o.items.map((it, i) => {
        const prices = group.map((x) => x.unitPrices[it.id] || 0);
        const best = Math.min(...prices.filter((v) => v > 0));
        const cc: TableRow["cellColors"] = [];
        prices.forEach((v, k) => { if (v > 0 && v === best && prices.filter((p) => p > 0).length > 1) cc[3 + k] = EMERALD; });
        return { cells: [String(i + 1), it.description || "-", [it.qty, it.unit].filter(Boolean).join(" ") || "-", ...prices.map((v) => (v ? money(v) : "-"))], cellColors: cc };
      });
      f = drawTable(b, f, X, cols, rows, { newPage, size: 7.5, maxLines: 4 });
      f.y -= 22;
    }
  }

  // ── What each vendor said ──
  const said = o.offers.filter((x) => x.inclusions.trim() || x.exclusions.trim() || x.notes.trim());
  if (said.length) {
    if (f.y < 160) f = newPage();
    f.y = sectionHeading(f.page, b, "Inclusions, exclusions and notes", X, f.y, W);
    const third = Math.floor((W - 120) / 3);
    f = drawTable(b, f, X, [{ label: "Vendor", w: 120, wrap: true }, { label: "Included", w: third, wrap: true }, { label: "Excluded", w: third, wrap: true }, { label: "Notes", w: W - 120 - third * 2, wrap: true }],
      said.map((x) => ({ cells: [x.vendor, x.inclusions.trim() || "-", x.exclusions.trim() || "-", x.notes.trim() || "-"] })), { newPage, size: 7.5, maxLines: 8 });
  }
  if (o.offers.length && !priced.length) {
    f.page.drawText("No prices have been entered yet.", { x: X, y: f.y - 4, size: 8, font: b.regular, color: C.s500 });
  }
  stampPageNumbers(doc, b);
  return new Blob([await doc.save()], { type: "application/pdf" });
}
