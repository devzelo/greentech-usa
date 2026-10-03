import { PDFDocument } from "pdf-lib";
import type { ApiExpense } from "./api";
import { drawProjectInfo, type ProjectPdfInfo } from "./pdfProjectHeader";
import { embedImage } from "./poPdf";
import { drawWrapped, wrappedHeight } from "./pdfText";
import { BOTTOM, C, GUTTER, LETTER, brandPage, drawTable, label, loadBrand, partyBlock, stampPageNumbers, titleBlock, type Flow, type TableCol } from "./pdfBrand";

/**
 * CR 340 (GT Comments 4, "Preview" on the GT "Add Expense" form) - one expense as a document: its
 * number and dates, the vendor, invoice / receipt and PO it goes with, the items (with their account
 * when GreenTech prints it), the total in the currency paid and in USD, the notes, the files, and the
 * approval signatures (CR 339) with names and dates. US Letter.
 */
export async function buildExpensePdf(e: ApiExpense, o: { projectInfo?: ProjectPdfInfo; categoryName?: (code: string) => string; workPackage?: string } = {}): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const X = GUTTER, W = LETTER.w - GUTTER * 2;
  const ref = e.expenseNo || "Expense";
  const newPage = (): Flow => brandPage(doc, b, LETTER, [ref, o.projectInfo?.name].filter(Boolean).join("  ·  "));
  let f = newPage();
  const num = (s: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
  const cur = e.currency || "USD";
  const fmt = (v: number, c = cur) => { try { return v.toLocaleString("en-US", { style: "currency", currency: c }); } catch { return `${c} ${v.toFixed(2)}`; } };
  const status = e.draft ? "Draft" : e.approval === "approved" ? "Approved" : e.approval === "rejected" ? "Rejected" : "Pending approval";

  const meta: Array<[string, string]> = [["Expense no.", ref], ["Date", e.date || "-"], ["Status", status]];
  let y = titleBlock(f.page, b, { x: X, y: f.y, w: W, eyebrow: "Expense", title: e.description || "Expense", meta });
  y = drawProjectInfo(f.page, b.regular, o.projectInfo, X, y, W) - 4;

  const gap = 16, colW = (W - gap * 2) / 3;
  const e1 = partyBlock(f.page, b, X, y, colW, "Vendor", [e.vendorName || "-"]);
  const refs = [
    e.receiptNo ? `Invoice / receipt: ${e.receiptNo}` : "", e.poNo ? `PO: ${e.poNo}` : "", e.reference ? `Reference: ${e.reference}` : "", o.workPackage ? `Work package: ${o.workPackage}` : "",
  ].filter(Boolean);
  const e2 = partyBlock(f.page, b, X + colW + gap, y, colW, "References", refs.length ? refs : ["-"]);
  const e3 = partyBlock(f.page, b, X + (colW + gap) * 2, y, colW, "Added by", [e.addedByName || "-", cur !== "USD" ? `Paid in ${cur} at ${e.exchangeRate || "-"} to USD` : ""].filter(Boolean));
  f.y = Math.min(e1, e2, e3) - 12;

  // The items.
  const items = (e.items && e.items.length) ? e.items : [{ id: "", description: e.description, qty: e.qty || "1", unit: "", unitPrice: e.amount, category: "", remark: "" }];
  const showCat = !!o.categoryName && items.some((i) => i.category);
  const catW = showCat ? 92 : 0;
  const fixed = 20 + 34 + 34 + 62 + 66 + catW;
  const rest = W - fixed, descW = Math.round(rest * 0.6);
  const cols: TableCol[] = [
    { label: "#", w: 20 }, { label: "Description", w: descW, wrap: true },
    ...(showCat ? [{ label: "Account", w: catW, wrap: true }] : []),
    { label: "Qty", w: 34, align: "right" as const }, { label: "Unit", w: 34 }, { label: `Unit (${cur})`, w: 62, align: "right" as const }, { label: `Total (${cur})`, w: 66, align: "right" as const },
    { label: "Remark", w: rest - descW, wrap: true },
  ];
  f = drawTable(b, f, X, cols, items.map((it, i) => ({
    cells: [String(i + 1), it.description || "", ...(showCat ? [it.category ? `${it.category} ${o.categoryName!(it.category)}`.trim() : "-"] : []), it.qty || "", it.unit || "", num(it.unitPrice).toFixed(2), ((num(it.qty) || 0) * num(it.unitPrice)).toFixed(2), it.remark || ""],
  })), { newPage });

  // Totals.
  const sumOrig = items.reduce((s, it) => s + (num(it.qty) || 0) * num(it.unitPrice), 0);
  const usd = (num(e.qty) || 1) * num(e.amount);
  f.y -= 14;
  if (f.y - 40 < BOTTOM) f = newPage();
  const right = (text: string, yy: number, bold = false) => { const font = bold ? b.bold : b.regular; const size = bold ? 11 : 9; f.page.drawText(text, { x: X + W - font.widthOfTextAtSize(text, size), y: yy, size, font, color: bold ? C.slate : C.s700 }); };
  if (cur !== "USD") { right(`Total ${fmt(sumOrig)}`, f.y); f.y -= 15; }
  right(`Total ${fmt(usd, "USD")}${cur !== "USD" ? " (in USD)" : ""}`, f.y, true);
  f.y -= 24;

  const block = (title: string, text: string) => {
    if (!text) return;
    const h = 13 + wrappedHeight(b.regular, text, 9, W, 12.5) + 10;
    if (f.y - h < BOTTOM) f = newPage();
    label(f.page, b, title, X, f.y); f.y -= 13;
    f.y = drawWrapped(f.page, b.regular, text, { x: X, y: f.y, size: 9, maxW: W, lineHeight: 12.5, color: C.s700 }) - 8;
  };
  block("Remark", e.remarks || "");
  if (e.approval === "rejected" && e.rejectReason) block("Rejected", e.rejectReason);
  block("Files attached", (e.attachments || []).map((a) => `•  ${a.name}`).join("\n"));

  // Signatures (CR 339).
  const sigs = e.signatures || [];
  if (sigs.length) {
    if (f.y - 110 < BOTTOM) f = newPage();
    label(f.page, b, "Signatures", X, f.y); f.y -= 14;
    const boxW = (W - gap) / 2;
    let i = 0;
    for (const s of sigs) {
      const bx = X + (i % 2) * (boxW + gap);
      const img = await embedImage(doc, s.signatureUrl).catch(() => null);
      if (img) { const h = 36, w = Math.min(150, (img.width / img.height) * h); f.page.drawImage(img, { x: bx, y: f.y - h, width: w, height: h }); }
      f.page.drawLine({ start: { x: bx, y: f.y - 40 }, end: { x: bx + Math.min(200, boxW), y: f.y - 40 }, thickness: 0.6, color: C.s500 });
      f.page.drawText(s.name || "", { x: bx, y: f.y - 52, size: 9, font: b.bold, color: C.slate });
      const line2 = [s.side === "partner" ? "Joint venture partner" : "GreenTech", s.title, new Date(s.at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })].filter(Boolean).join("  ·  ");
      f.page.drawText(line2, { x: bx, y: f.y - 63, size: 7.5, font: b.regular, color: C.s500 });
      if (s.appliedByName) f.page.drawText(`Applied by ${s.appliedByName}`, { x: bx, y: f.y - 73, size: 7, font: b.regular, color: C.s500 });
      i++;
    }
    f.y -= 84;
  }

  stampPageNumbers(doc, b);
  return new Blob([await doc.save()], { type: "application/pdf" });
}
