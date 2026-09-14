import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { PDF_COLORS } from "./docStyle";
import { type ApiInvoice } from "./api";
import { drawProjectInfo, type ProjectPdfInfo } from "./pdfProjectHeader";
import { drawWrapped } from "./pdfText";
import { embedImage, drawFitted, GREENTECH } from "./poPdf";
import { payApplication } from "./payApplication";

// Branded invoice document (client CR-I-04/07): page 1 = the invoice (receiver, line items,
// bank, signature); page 2 = the Payment Application (progressive billing) when a contract
// total is set. Mirrors the PO/RFQ document styling.
const n = (s?: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });
const PAGE_W = 612, PAGE_H = 792, M = 48;   // US Letter, 8.5" x 11"
const { brand: GREEN, ink: INK, muted: MUTED, line: LINE } = PDF_COLORS;   // CR-P (41) — one palette

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
    // CR-I-04 — remarks print as a muted sub-line. CR-P (161) — the invoice has one date, at the top;
    // lines no longer carry their own.
    const itx = it as typeof it & { remarks?: string };
    const descText = it.description || "";
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

  // Page 2 — Payment Application. CR-P (167)/(168) — against one contract (the project's contract,
  // an agreement, or a value typed in), with the history of every invoice on it.
  const contract = n(inv.contractTotal);
  // (An invoice set to "No payment application" has no contract value, so it has no page 2; an older
  // invoice with a contract total and no contract choice still gets it.)
  if (contract > 0) {
    const p2 = doc.addPage([PAGE_W, PAGE_H]);
    let y2 = PAGE_H - M;
    p2.drawText("PAYMENT APPLICATION", { x: M, y: y2 - 4, size: 14, font: bold, color: INK }); y2 -= 20;
    const label = inv.contractRef?.label || (inv.contractRef?.source === "project" ? "Project contract" : "Contract");
    p2.drawText(`${label}${opts?.projectInfo?.name ? ` · ${opts.projectInfo.name}` : ""} · Invoice #${inv.number || ""}`, { x: M, y: y2, size: 9, font, color: MUTED }); y2 -= 24;
    const pa = payApplication(inv, opts?.allInvoices || [], total);
    const totalInvoiced = pa.previous + total;
    const summary: [string, string][] = [
      ["Contract value", money(contract)],
      ["Previously invoiced", money(pa.previous)],
      ["This invoice", money(total)],
      ["Total invoiced to date", money(totalInvoiced)],
      ["Percent invoiced", `${Math.round((totalInvoiced / contract) * 100)}%`],
      ["Balance to finish", money(contract - totalInvoiced)],
    ];
    for (const [k, v] of summary) {
      const strong = k === "Total invoiced to date" || k === "Balance to finish";
      p2.drawText(k, { x: M, y: y2, size: 10, font: strong ? bold : font, color: INK });
      p2.drawText(v, { x: PAGE_W - M - (strong ? bold : font).widthOfTextAtSize(v, 10), y: y2, size: 10, font: strong ? bold : font, color: strong ? GREEN : INK });
      y2 -= 8;
      p2.drawLine({ start: { x: M, y: y2 }, end: { x: PAGE_W - M, y: y2 }, thickness: 0.5, color: LINE });
      y2 -= 14;
    }

    // The history: one row per invoice on this contract, this one last.
    y2 -= 10;
    p2.drawText("HISTORY", { x: M, y: y2, size: 8, font: bold, color: MUTED }); y2 -= 14;
    const W = PAGE_W - M * 2;
    const hc = [
      { label: "Invoice", w: 0.14, right: false }, { label: "Date", w: 0.16, right: false },
      { label: "Contract value", w: 0.18, right: true }, { label: "Previously invoiced", w: 0.18, right: true },
      { label: "This invoice", w: 0.16, right: true }, { label: "Balance to finish", w: 0.18, right: true },
    ];
    const colX = (i: number) => M + hc.slice(0, i).reduce((s, c) => s + c.w * W, 0);
    const cell = (text: string, i: number, f: PDFFont, color = INK) => {
      const c = hc[i]; const x = colX(i);
      p2.drawText(text, { x: c.right ? x + c.w * W - 4 - f.widthOfTextAtSize(text, 8.5) : x + 4, y: y2, size: 8.5, font: f, color });
    };
    p2.drawRectangle({ x: M, y: y2 - 5, width: W, height: 18, color: INK });
    hc.forEach((c, i) => cell(c.label, i, bold, rgb(1, 1, 1)));
    y2 -= 20;
    for (const r of pa.rows) {
      if (y2 < M + 20) break;
      const f = r.current ? bold : font;
      const col = r.current ? GREEN : INK;
      [`#${r.number}`, r.date || "-", money(r.contract), money(r.previous), money(r.thisInvoice), money(r.balance)].forEach((t, i) => cell(t, i, f, col));
      y2 -= 8;
      p2.drawLine({ start: { x: M, y: y2 }, end: { x: PAGE_W - M, y: y2 }, thickness: 0.5, color: LINE });
      y2 -= 12;
    }
  }

  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}
