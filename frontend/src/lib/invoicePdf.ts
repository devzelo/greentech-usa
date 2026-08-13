import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { type ApiInvoice } from "./api";
import { drawProjectInfo, type ProjectPdfInfo } from "./pdfProjectHeader";
import { drawWrapped } from "./pdfText";
import { embedImage, drawFitted, GREENTECH } from "./poPdf";

// Branded invoice document (client CR-I-04/07): page 1 = the invoice (receiver, line items,
// bank, signature); page 2 = the Payment Application (progressive billing) when a contract
// total is set. Mirrors the PO/RFQ document styling.
const n = (s?: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });
const PAGE_W = 595.28, PAGE_H = 841.89, M = 48;
const GREEN = rgb(0.06, 0.72, 0.51), INK = rgb(0.06, 0.09, 0.16), MUTED = rgb(0.39, 0.45, 0.55), LINE = rgb(0.9, 0.92, 0.95);

const lineTotal = (inv: ApiInvoice) => (inv.lineItems || []).reduce((s, it) => s + n(it.qty) * n(it.unitPrice), 0);
const invoiceAmount = (inv: ApiInvoice) => ((inv.lineItems || []).length ? lineTotal(inv) : n(inv.amount));

function block(page: PDFPage, font: PDFFont, bold: PDFFont, x: number, y: number, w: number, heading: string, lines: string[]): number {
  page.drawText(heading, { x, y, size: 8, font: bold, color: MUTED }); y -= 13;
  lines.filter(Boolean).forEach((l, i) => {
    y = drawWrapped(page, i === 0 ? bold : font, String(l), { x, y, size: i === 0 ? 10 : 9, maxW: w, lineHeight: 13, color: INK, maxLines: 3 });
  });
  return y;
}

export async function buildInvoicePdf(inv: ApiInvoice, opts?: { projectInfo?: ProjectPdfInfo; allInvoices?: ApiInvoice[] }): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const isSent = inv.type === "sent";

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  // Header — logo + title
  const gtLogo = await embedImage(doc, "/gt-usa-logo-new.png");
  if (gtLogo) drawFitted(page, gtLogo, M, y, 150, 46);
  const title = isSent ? "INVOICE" : "BILL RECEIVED";
  page.drawText(title, { x: PAGE_W - M - bold.widthOfTextAtSize(title, 20), y: y - 18, size: 20, font: bold, color: INK });
  page.drawText(`#${inv.number || ""}`, { x: PAGE_W - M - bold.widthOfTextAtSize(`#${inv.number || ""}`, 11), y: y - 34, size: 11, font: bold, color: GREEN });
  if (inv.date) page.drawText(inv.date, { x: PAGE_W - M - font.widthOfTextAtSize(inv.date, 9), y: y - 47, size: 9, font, color: MUTED });
  y -= 64;

  y = drawProjectInfo(page, font, opts?.projectInfo, M, y, PAGE_W - M * 2);
  y -= 8;

  // From / To
  const colW = (PAGE_W - M * 2 - 24) / 2;
  const fromLines = isSent ? [GREENTECH.name, GREENTECH.address, GREENTECH.email, GREENTECH.phone] : [inv.party || "—"];
  const toLines = isSent ? [inv.party || "—", inv.receiverKind ? `(${inv.receiverKind})` : ""] : [GREENTECH.name, GREENTECH.address];
  const yA = block(page, font, bold, M, y, colW, "FROM", fromLines);
  const yB = block(page, font, bold, M + colW + 24, y, colW, isSent ? "BILL TO" : "OUR COMPANY", toLines);
  y = Math.min(yA, yB) - 14;
  if (inv.description) { page.drawText(inv.description.slice(0, 120), { x: M, y, size: 9, font, color: MUTED }); y -= 16; }

  // Line items table
  const cols = [
    { label: "Description", x: M, w: PAGE_W - M * 2 - 60 - 70 - 90 },
    { label: "Qty", x: PAGE_W - M - 60 - 70 - 90, w: 60 },
    { label: "Unit price", x: PAGE_W - M - 70 - 90, w: 70 },
    { label: "Total", x: PAGE_W - M - 90, w: 90 },
  ];
  const items = (inv.lineItems || []).length ? inv.lineItems! : [{ description: inv.description || "Amount", qty: "1", unitPrice: String(n(inv.amount)) }];
  page.drawRectangle({ x: M, y: y - 4, width: PAGE_W - M * 2, height: 18, color: INK });
  cols.forEach((c) => page.drawText(c.label, { x: c.x + 4, y: y + 1, size: 8, font: bold, color: rgb(1, 1, 1) }));
  y -= 22;
  for (const it of items) {
    if (y < 140) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - M; }
    // CR-I-04 — carry the per-line date (prefixed) and remarks (muted sub-line) onto the PDF.
    const itx = it as typeof it & { date?: string; remarks?: string };
    const descText = (itx.date ? `[${itx.date}] ` : "") + (it.description || "");
    let lineY = drawWrapped(page, font, descText, { x: cols[0].x + 4, y, size: 9, maxW: cols[0].w - 8, lineHeight: 12, color: INK, maxLines: 3 });
    if (itx.remarks) lineY = drawWrapped(page, font, itx.remarks, { x: cols[0].x + 4, y: lineY - 1, size: 7.5, maxW: cols[0].w - 8, lineHeight: 10, color: MUTED, maxLines: 2 });
    page.drawText(String(it.qty || ""), { x: cols[1].x + 4, y, size: 9, font, color: INK });
    page.drawText(money(n(it.unitPrice)), { x: cols[2].x + 4, y, size: 9, font, color: INK });
    const t = money(n(it.qty) * n(it.unitPrice));
    page.drawText(t, { x: cols[3].x + cols[3].w - 4 - font.widthOfTextAtSize(t, 9), y, size: 9, font, color: INK });
    y = Math.min(y - 14, lineY - 2);
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: PAGE_W - M, y: y + 4 }, thickness: 0.5, color: LINE });
  }
  // Total
  y -= 6;
  const total = invoiceAmount(inv);
  const totLabel = "TOTAL", totVal = money(total);
  page.drawText(totLabel, { x: cols[2].x, y, size: 11, font: bold, color: INK });
  page.drawText(totVal, { x: cols[3].x + cols[3].w - 4 - bold.widthOfTextAtSize(totVal, 11), y, size: 11, font: bold, color: GREEN });
  y -= 24;

  // Bank info
  if (inv.bank && (inv.bank.name || inv.bank.accountNumber || inv.bank.iban)) {
    const b = inv.bank;
    const bl = [
      b.name && `Bank: ${b.name}`, b.accountName && `Account name: ${b.accountName}`,
      b.accountNumber && `Account #: ${b.accountNumber}`, b.iban && `IBAN: ${b.iban}`,
      b.swift && `SWIFT/BIC: ${b.swift}`, b.routing && `Routing: ${b.routing}`,
    ].filter(Boolean) as string[];
    y = block(page, font, bold, M, y, PAGE_W - M * 2, "BANK INFORMATION", bl) - 12;
  }
  // T&C
  if (inv.terms) { page.drawText("TERMS & CONDITIONS", { x: M, y, size: 8, font: bold, color: MUTED }); y -= 12; y = drawWrapped(page, font, inv.terms, { x: M, y, size: 9, maxW: PAGE_W - M * 2, lineHeight: 12, color: INK, maxLines: 8 }) - 14; }
  // Extra sections (CR-I-04)
  for (const s of inv.sections || []) {
    if (!s.title && !s.body) continue;
    if (y < 120) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - M; }
    if (s.title) { page.drawText(s.title.toUpperCase().slice(0, 80), { x: M, y, size: 8, font: bold, color: MUTED }); y -= 12; }
    if (s.body) y = drawWrapped(page, font, s.body, { x: M, y, size: 9, maxW: PAGE_W - M * 2, lineHeight: 12, color: INK, maxLines: 20 }); y -= 12;
  }

  // Signature
  if (inv.signerName || inv.signatureUrl) {
    if (y < 120) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - M; }
    const sig = await embedImage(doc, inv.signatureUrl);
    if (sig) { drawFitted(page, sig, M, y, 140, 44); y -= 48; }
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: M + 180, y: y + 2 }, thickness: 0.6, color: MUTED });
    if (inv.signerName) page.drawText(inv.signerName, { x: M, y: y - 12, size: 9, font: bold, color: INK });
    if (inv.signerTitle) page.drawText(inv.signerTitle, { x: M, y: y - 24, size: 8, font, color: MUTED });
  }

  // Page 2 — Payment Application
  const contract = n(inv.contractTotal);
  if (contract > 0) {
    const p2 = doc.addPage([PAGE_W, PAGE_H]);
    let y2 = PAGE_H - M;
    p2.drawText("PAYMENT APPLICATION", { x: M, y: y2 - 4, size: 14, font: bold, color: INK }); y2 -= 30;
    const all = opts?.allInvoices || [];
    const prevInvoiced = all.filter((r) => r._id !== inv._id).reduce((s, r) => s + invoiceAmount(r), 0);
    const totalInvoiced = prevInvoiced + total;
    const rows: [string, string][] = [
      ["Original contract total", money(contract)],
      ["Previously invoiced", money(prevInvoiced)],
      ["This invoice", money(total)],
      ["Total invoiced to date", money(totalInvoiced)],
      ["Percent invoiced", `${Math.round((totalInvoiced / contract) * 100)}%`],
      ["Balance to finish", money(contract - totalInvoiced)],
      ["Invoices to date", String(all.length || 1)],
    ];
    for (const [k, v] of rows) {
      const strong = k === "Total invoiced to date" || k === "Balance to finish";
      p2.drawText(k, { x: M, y: y2, size: 10, font: strong ? bold : font, color: INK });
      p2.drawText(v, { x: PAGE_W - M - (strong ? bold : font).widthOfTextAtSize(v, 10), y: y2, size: 10, font: strong ? bold : font, color: strong ? GREEN : INK });
      y2 -= 8;
      p2.drawLine({ start: { x: M, y: y2 }, end: { x: PAGE_W - M, y: y2 }, thickness: 0.5, color: LINE });
      y2 -= 14;
    }
    p2.drawText(`${all.length} invoice(s) on this project.`, { x: M, y: y2 - 4, size: 8, font, color: MUTED });
  }

  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}
