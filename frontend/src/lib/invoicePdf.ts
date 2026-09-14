import { PDFDocument, type Color } from "pdf-lib";
import { type ApiInvoice } from "./api";
import { drawProjectInfo, type ProjectPdfInfo } from "./pdfProjectHeader";
import { drawWrapped, fitOneLine } from "./pdfText";
import { embedImage, drawFitted, GREENTECH } from "./poPdf";
import { payApplication } from "./payApplication";
import {
  BOTTOM, C, GUTTER, LETTER, brandPage, drawTable, flowText, kpiCard, label, loadBrand, partyBlock, sectionHeading,
  stampPageNumbers, titleBlock, type Flow, type TableCol,
} from "./pdfBrand";

// Branded invoice (client CR-I-04/07) on the letterhead, like every GreenTech document: page 1 is
// the invoice (parties, line items, total, bank, terms, signature); page 2 is the Payment
// Application (progressive billing) when the invoice bills against a contract.
const n = (s?: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });
const X = GUTTER, W = LETTER.w - GUTTER * 2;

const lineTotal = (inv: ApiInvoice) => (inv.lineItems || []).reduce((s, it) => s + n(it.qty) * n(it.unitPrice), 0);
const invoiceAmount = (inv: ApiInvoice) => ((inv.lineItems || []).length ? lineTotal(inv) : n(inv.amount));

export async function buildInvoicePdf(inv: ApiInvoice, opts?: { projectInfo?: ProjectPdfInfo; allInvoices?: ApiInvoice[] }): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const isSent = inv.type === "sent";
  const kind = isSent ? "Invoice" : "Bill received";
  const note = [`${kind} #${inv.number || "-"}`, opts?.projectInfo?.name].filter(Boolean).join("  ·  ");
  const newPage = (): Flow => brandPage(doc, b, LETTER, note);
  let f = newPage();
  const ensure = (h: number) => { if (f.y - h < BOTTOM) f = newPage(); };
  const total = invoiceAmount(inv);

  // Title block, project line, parties.
  let y = titleBlock(f.page, b, {
    x: X, y: f.y, w: W, eyebrow: kind,
    title: inv.party ? `${isSent ? "Invoice to" : "Bill from"} ${inv.party}` : kind,
    meta: [[isSent ? "Invoice no." : "Bill no.", inv.number ? `#${inv.number}` : "-"], ["Date", inv.date || "-"]],
  });
  y = drawProjectInfo(f.page, b.regular, opts?.projectInfo, X, y, W) - 4;
  const colW = (W - 24) / 2;
  const fromLines = isSent ? [GREENTECH.name, GREENTECH.address, GREENTECH.email, GREENTECH.phone] : [inv.party || "-"];
  const toLines = isSent ? [inv.party || "-", inv.receiverKind || ""] : [GREENTECH.name, GREENTECH.address];
  y = Math.min(
    partyBlock(f.page, b, X, y, colW, "From", fromLines),
    partyBlock(f.page, b, X + colW + 24, y, colW, isSent ? "Bill to" : "Our company", toLines),
  ) - 10;
  if (inv.description) y = drawWrapped(f.page, b.regular, inv.description, { x: X, y, size: 9, maxW: W, lineHeight: 12.5, color: C.s500, maxLines: 3 }) - 6;
  f.y = y;

  // Line items. CR-I-04 — remarks print under the description. CR-P (161) — one date, at the top.
  const items = (inv.lineItems || []).length ? inv.lineItems! : [{ description: inv.description || "Amount", qty: "1", unitPrice: String(n(inv.amount)) }];
  const cols: TableCol[] = [
    { label: "Description", w: W - 50 - 92 - 96, wrap: true }, { label: "Qty", w: 50, align: "right" },
    { label: "Unit price", w: 92, align: "right" }, { label: "Total", w: 96, align: "right" },
  ];
  f = drawTable(b, f, X, cols, items.map((it) => {
    const remarks = (it as typeof it & { remarks?: string }).remarks;
    return { cells: [`${it.description || ""}${remarks ? `\n${remarks}` : ""}`, String(it.qty || ""), money(n(it.unitPrice)), money(n(it.qty) * n(it.unitPrice))] };
  }), { newPage, size: 8.5 });

  // Total.
  ensure(40);
  f.y -= 20;
  f.page.drawText("TOTAL", { x: X + W - 96 - 92 + 6, y: f.y, size: 9.5, font: b.bold, color: C.slate });
  const tv = money(total);
  f.page.drawText(tv, { x: X + W - 6 - b.display.widthOfTextAtSize(tv, 15), y: f.y - 1, size: 15, font: b.display, color: C.emerald });
  f.y -= 30;

  // Bank information, as a grid of label / value.
  const bank = inv.bank;
  if (bank && (bank.name || bank.accountNumber || bank.iban)) {
    const kv = ([["Bank", bank.name], ["Account name", bank.accountName], ["Account no.", bank.accountNumber], ["IBAN", bank.iban], ["SWIFT / BIC", bank.swift], ["Routing", bank.routing]] as Array<[string, string]>).filter(([, v]) => v);
    ensure(26 + Math.ceil(kv.length / 3) * 30);
    f.y = sectionHeading(f.page, b, "Bank information", X, f.y, W);
    const cw = W / 3;
    kv.forEach(([k, v], i) => {
      const cx = X + (i % 3) * cw, cy = f.y - Math.floor(i / 3) * 30;
      label(f.page, b, k, cx, cy);
      f.page.drawText(fitOneLine(b.bold, v, 9.5, cw - 12), { x: cx, y: cy - 13, size: 9.5, font: b.bold, color: C.slate });
    });
    f.y -= Math.ceil(kv.length / 3) * 30 + 6;
  }

  // Terms, then any extra sections (CR-I-04).
  const block = (heading: string, body: string) => {
    ensure(60);
    f.y = sectionHeading(f.page, b, heading, X, f.y, W);
    f = flowText(f, body, { x: X, w: W, font: b.regular, size: 9, lineHeight: 12.5, color: C.s700, newPage });
    f.y -= 10;
  };
  if (inv.terms) block("Terms & conditions", inv.terms);
  for (const s of inv.sections || []) if (s.title || s.body) block(s.title || "Notes", s.body || "");

  // Signature.
  if (inv.signerName || inv.signatureUrl) {
    ensure(110);
    f.y -= 4;
    label(f.page, b, "Authorized signature", X, f.y);
    f.y -= 8;
    const sig = await embedImage(doc, inv.signatureUrl);
    if (sig) { drawFitted(f.page, sig, X, f.y, 150, 44); f.y -= 48; } else f.y -= 30;
    f.page.drawLine({ start: { x: X, y: f.y }, end: { x: X + 200, y: f.y }, thickness: 0.6, color: C.s400 });
    if (inv.signerName) f.page.drawText(inv.signerName, { x: X, y: f.y - 14, size: 10, font: b.bold, color: C.slate });
    if (inv.signerTitle) f.page.drawText(inv.signerTitle, { x: X, y: f.y - 26, size: 8.5, font: b.regular, color: C.s500 });
  }

  // Page 2 — Payment Application. CR-P (167)/(168) — against one contract (the project's contract,
  // an agreement, or a value typed in), with the history of every invoice on it. (An invoice set to
  // "No payment application" has no contract value, so it has no page 2.)
  const contract = n(inv.contractTotal);
  if (contract > 0) {
    f = newPage();
    const contractLabel = inv.contractRef?.label || (inv.contractRef?.source === "project" ? "Project contract" : "Contract");
    let y2 = titleBlock(f.page, b, {
      x: X, y: f.y, w: W, eyebrow: "Payment application", title: contractLabel,
      meta: [["Invoice no.", `#${inv.number || "-"}`], ["Project", opts?.projectInfo?.name || ""]],
    });
    const pa = payApplication(inv, opts?.allInvoices || [], total);
    const totalInvoiced = pa.previous + total;
    const kpis: Array<[string, string, Color?]> = [
      ["Contract value", money(contract)], ["Previously invoiced", money(pa.previous)], ["This invoice", money(total)],
      ["Total invoiced to date", money(totalInvoiced), C.emerald], ["Percent invoiced", `${Math.round((totalInvoiced / contract) * 100)}%`],
      ["Balance to finish", money(contract - totalInvoiced), C.emerald],
    ];
    const cw = (W - 16) / 3, ch = 46;
    kpis.forEach(([k, v, tone], i) => kpiCard(f.page, b, X + (i % 3) * (cw + 8), y2 - Math.floor(i / 3) * (ch + 8), cw, ch, k, v, tone));
    y2 -= 2 * (ch + 8) + 10;
    f.y = sectionHeading(f.page, b, "History", X, y2, W);
    const hcols: TableCol[] = [
      { label: "Invoice", w: W * 0.11 }, { label: "Date", w: W * 0.13 },
      { label: "Contract", w: W * 0.19, align: "right" }, { label: "Previously", w: W * 0.19, align: "right" },
      { label: "This invoice", w: W * 0.19, align: "right" }, { label: "Balance", w: W * 0.19, align: "right" },
    ];
    drawTable(b, f, X, hcols, pa.rows.map((r) => ({
      cells: [`#${r.number}`, r.date || "-", money(r.contract), money(r.previous), money(r.thisInvoice), money(r.balance)],
      bold: r.current, color: r.current ? C.emerald : undefined,
    })), { newPage });
  }

  stampPageNumbers(doc, b);
  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}
