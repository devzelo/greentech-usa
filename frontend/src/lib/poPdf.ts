import { PDFDocument, PDFFont, PDFImage, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { attachmentUrl, type ApiProcurementPO, type ApiVendor } from "./api";
import { drawProjectInfo, type ProjectPdfInfo } from "./pdfProjectHeader";
import { drawWrapped, fitOneLine, wrappedHeight } from "./pdfText";

const n = (s: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });

const PAGE_W = 595.28, PAGE_H = 841.89, M = 48;
const GREEN = rgb(0.06, 0.72, 0.51), INK = rgb(0.06, 0.09, 0.16), MUTED = rgb(0.39, 0.45, 0.55);

// GreenTech's own company details (constant — the "our company" side of the PO & RFQ).
export const GREENTECH = {
  name: "GreenTech USA",
  address: "Chantilly, Virginia, USA",
  email: "info@gt-usa.com",
  phone: "+1-125-258-3525",
};

// Resolve an uploaded-file path or public asset URL to a fetchable URL. Handles both the
// token-guarded uploads paths ("uploads/…" or "/uploads/…") and plain public assets ("/gt-…png").
function toFetchUrl(p?: string): string {
  if (!p) return "";
  const s = p.replace(/\\/g, "/");
  if (s.startsWith("data:")) return s;
  if (/^https?:\/\//.test(s)) return s;
  if (s.includes("uploads/")) return attachmentUrl(s.replace(/^\/+/, ""));
  return s.startsWith("/") ? s : `/${s}`;
}

export async function embedImage(doc: PDFDocument, url?: string): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(toFetchUrl(url));
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const head = new Uint8Array(bytes.slice(0, 4));
    const isPng = head[0] === 0x89 && head[1] === 0x50;
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch { return null; }
}

// Draw an image constrained to a max box, anchored at (x, topY) growing downward. Returns height used.
export function drawFitted(page: PDFPage, img: PDFImage, x: number, topY: number, maxW: number, maxH: number): number {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = img.width * scale, h = img.height * scale;
  page.drawImage(img, { x, y: topY - h, width: w, height: h });
  return h;
}

// The stacked party details block ("FROM / PARTNER / VENDOR / SHIP TO").
function drawPartyBlock(page: PDFPage, font: PDFFont, bold: PDFFont, x: number, y: number, w: number, heading: string, lines: string[]): number {
  page.drawText(heading, { x, y, size: 8, font: bold, color: MUTED }); y -= 13;
  // Wrapped by measure — pdf-lib's own maxWidth wraps at a 24pt line height and would overlap.
  lines.filter(Boolean).forEach((l, i) => {
    y = drawWrapped(page, i === 0 ? bold : font, String(l), { x, y, size: i === 0 ? 10 : 9, maxW: w, lineHeight: 13, color: INK, maxLines: 3 });
  });
  return y;
}

// Page 1: header (logos), parties, item table, totals.
async function drawPoPage1(doc: PDFDocument, font: PDFFont, bold: PDFFont, po: ApiProcurementPO, vendor: ApiVendor | undefined, projectInfo: ProjectPdfInfo | undefined, ref: string): Promise<PDFPage> {
  let page = doc.addPage([PAGE_W, PAGE_H]);
  const partner = projectInfo?.partner;
  page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: GREEN });
  let y = PAGE_H - 30;

  // 1) Logos: GreenTech (left) + partner (right, if JV).
  const gtLogo = await embedImage(doc, "/gt-usa-logo-new.png");
  if (gtLogo) drawFitted(page, gtLogo, M, y, 150, 42); else page.drawText("GreenTech USA", { x: M, y: y - 18, size: 18, font: bold, color: INK });
  if (partner) {
    const pLogo = await embedImage(doc, partner.logoUrl);
    if (pLogo) { const scale = Math.min(150 / pLogo.width, 42 / pLogo.height, 1); const w = pLogo.width * scale; drawFitted(page, pLogo, PAGE_W - M - w, y, 150, 42); }
    else if (partner.name) page.drawText(partner.name.slice(0, 24), { x: PAGE_W - M - bold.widthOfTextAtSize(partner.name.slice(0, 24), 12), y: y - 16, size: 12, font: bold, color: INK });
  }
  y -= 54;

  page.drawText("PURCHASE ORDER", { x: M, y, size: 13, font: bold, color: GREEN });
  const refLabel = `PO Number: ${ref}`;
  page.drawText(refLabel, { x: PAGE_W - M - bold.widthOfTextAtSize(refLabel, 11), y, size: 11, font: bold, color: INK });
  y -= 18;
  y = drawProjectInfo(page, font, projectInfo, M, y, PAGE_W - M * 2);
  y -= 6;

  // 2) Parties — two columns (us / partner), then vendor + ship-to underneath.
  const colW = (PAGE_W - M * 2 - 24) / 2, rx = M + colW + 24;
  const leftEnd = drawPartyBlock(page, font, bold, M, y, colW, "FROM", [GREENTECH.name, GREENTECH.address, GREENTECH.email, GREENTECH.phone]);
  let rightEnd = y;
  if (partner) rightEnd = drawPartyBlock(page, font, bold, rx, y, colW, "PARTNER", [partner.name, partner.address, partner.email, partner.phone]);
  y = Math.min(leftEnd, rightEnd) - 8;

  const vEnd = drawPartyBlock(page, font, bold, M, y, colW, "VENDOR", [po.vendorName || vendor?.name || "(vendor)", [vendor?.city, vendor?.country].filter(Boolean).join(", "), vendor?.contactName ? `Attn: ${vendor.contactName}` : "", vendor?.email || ""]);
  let shipEnd = y;
  if (po.shipTo || po.deliveryMethod) shipEnd = drawPartyBlock(page, font, bold, rx, y, colW, "SHIP TO", [po.deliveryMethod || "Delivery", po.shipTo || ""]);
  y = Math.min(vEnd, shipEnd) - 10;

  // 3) Item table.
  const cols = [
    { label: "#", x: M, w: 22 }, { label: "Description", x: M + 22, w: 210 }, { label: "Qty", x: M + 232, w: 40 },
    { label: "Unit", x: M + 272, w: 40 }, { label: "Unit Price", x: M + 360, w: 60 }, { label: "Amount", x: M + 440, w: 60 },
  ];
  // The signature & stamp block always occupies y ≈ 232 downward on whichever page it lands on,
  // so nothing above it may cross that line. Long orders continue onto extra pages instead of
  // being silently truncated.
  const drawTableHead = () => {
    page.drawRectangle({ x: M, y: y - 4, width: PAGE_W - M * 2, height: 18, color: INK });
    cols.forEach((c) => page.drawText(c.label, { x: c.x + 3, y: y + 1, size: 8, font: bold, color: rgb(1, 1, 1) }));
    y -= 18;
  };
  const nextPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: GREEN });
    y = PAGE_H - 56;
  };
  drawTableHead();
  let subtotal = 0;
  po.lineItems.forEach((li, i) => {
    if (y < 70) { nextPage(); drawTableHead(); }   // continue the table on a new page
    const amt = n(li.qty) * n(li.unitPrice); subtotal += amt;
    const cells = [String(i + 1), li.description || "", li.qty || "", li.unit || "", li.unitPrice ? money(n(li.unitPrice)) : "", money(amt)];
    cells.forEach((t, ci) => page.drawText(fitOneLine(font, String(t), 8, cols[ci].w - 6), { x: cols[ci].x + 3, y: y + 2, size: 8, font, color: INK }));
    y -= 16; page.drawLine({ start: { x: M, y: y + 2 }, end: { x: PAGE_W - M, y: y + 2 }, thickness: 0.5, color: rgb(0.9, 0.92, 0.95) });
  });

  // Reserve the room the totals + notes + signature block genuinely need; break the page if short.
  const totalsRows = (n(po.shipping) ? 1 : 0) + (n(po.tax) ? 1 : 0) + 1;
  const notesBody = (po.notes || "").slice(0, 600);
  const notesH = notesBody ? 13 + wrappedHeight(font, notesBody, 8, PAGE_W - M * 2, 11) + 8 : 0;
  const SIG_TOP = 232;
  if (y - 10 - totalsRows * 16 - notesH < SIG_TOP) nextPage();

  y -= 10;
  const rowR = (label: string, value: string, b = false) => {
    page.drawText(label, { x: M + 350, y, size: b ? 10 : 9, font: b ? bold : font, color: b ? INK : MUTED });
    const v = fitOneLine(font, value, b ? 10 : 9, PAGE_W - M - (M + 435));
    page.drawText(v, { x: M + 435, y, size: b ? 10 : 9, font: b ? bold : font, color: INK });
    y -= 16;
  };
  if (n(po.shipping)) rowR("Shipping", money(n(po.shipping)));
  if (n(po.tax)) rowR("Tax / Duty", money(n(po.tax)));
  rowR("TOTAL", money(n(po.total) || subtotal + n(po.shipping) + n(po.tax)), true);
  // Notes — extra info for the vendor, printed after the table and before the signature section.
  if (notesBody) {
    page.drawText("Notes:", { x: M, y, size: 9, font: bold, color: INK }); y -= 13;
    drawWrapped(page, font, notesBody, { x: M, y, size: 8, maxW: PAGE_W - M * 2, lineHeight: 11, color: INK });
  }
  return page;   // the LAST page — the signature block is drawn on this one
}

// The signature & stamp section — drawn right AFTER the table (client spec). Left column is
// GreenTech (name/email/phone/address/signature/stamp), right is the partner (JV only).
async function drawSignatureStamp(doc: PDFDocument, page: PDFPage, font: PDFFont, bold: PDFFont, po: ApiProcurementPO, partner?: ProjectPdfInfo["partner"]): Promise<void> {
  const colW = (PAGE_W - M * 2 - 24) / 2, rx = M + colW + 24;

  const drawSide = async (x: number, heading: string, party: { name: string; title?: string; email?: string; phone?: string; address?: string; signatureUrl?: string; stampUrl?: string }) => {
    let y = 210;
    page.drawText(heading, { x, y, size: 8, font: bold, color: MUTED }); y -= 14;
    // Signature image (or a ruled line if none) with the stamp RIGHT NEXT to it — the stamp
    // belongs to this party's block, overlapping the signature area like a real stamped document.
    const sigTop = y;
    const sig = await embedImage(doc, party.signatureUrl);
    if (sig) { drawFitted(page, sig, x, y, colW - 70, 40); y -= 44; }
    else { page.drawLine({ start: { x, y: y - 30 }, end: { x: x + colW - 70, y: y - 30 }, thickness: 1, color: INK }); y -= 40; }
    const stamp = await embedImage(doc, party.stampUrl);
    if (stamp) drawFitted(page, stamp, x + colW - 62, sigTop + 4, 56, 56);
    // Keep every detail line clear of the stamp box, which starts at x + colW - 62.
    const textW = colW - 70;
    page.drawText(fitOneLine(bold, party.name || "—", 10, textW), { x, y, size: 10, font: bold, color: INK }); y -= 12;
    if (party.title) { page.drawText(fitOneLine(font, party.title, 8, textW), { x, y, size: 8, font, color: MUTED }); y -= 11; }
    if (party.email) { page.drawText(fitOneLine(font, party.email, 8, textW), { x, y, size: 8, font, color: INK }); y -= 11; }
    if (party.phone) { page.drawText(fitOneLine(font, party.phone, 8, textW), { x, y, size: 8, font, color: INK }); y -= 11; }
    if (party.address) { page.drawText(fitOneLine(font, party.address, 8, textW), { x, y, size: 8, font, color: MUTED }); y -= 11; }
  };

  // Ensure there's room; the section lives near the bottom of page 1 (y ~= 210 downward).
  await drawSide(M, "Authorized by — GreenTech USA", {
    name: po.signerName || "", title: po.signerTitle, email: po.signerEmail || GREENTECH.email, phone: po.signerPhone || GREENTECH.phone,
    address: GREENTECH.address, signatureUrl: po.signatureUrl, stampUrl: po.stampUrl,
  });
  if (partner) {
    await drawSide(rx, `Authorized by — ${partner.name || "Partner"}`, {
      name: po.partnerSignerName || "", email: po.partnerSignerEmail || partner.email, phone: po.partnerSignerPhone || partner.phone,
      address: partner.address, signatureUrl: po.partnerSignatureUrl, stampUrl: po.partnerStampUrl,
    });
  }
}

// Append an attachment's pages (PDF pages copied, images fitted) behind a labeled divider page.
async function appendAttachment(doc: PDFDocument, font: PDFFont, bold: PDFFont, att: { name: string; filePath: string; fileType: string }, label: string, skipped: string[]) {
  const d = doc.addPage([PAGE_W, PAGE_H]);
  d.drawRectangle({ x: 0, y: PAGE_H / 2 - 2, width: PAGE_W, height: 4, color: GREEN });
  const lab = label.toUpperCase();
  d.drawText(lab, { x: (PAGE_W - bold.widthOfTextAtSize(lab, 24)) / 2, y: PAGE_H / 2 + 20, size: 24, font: bold, color: INK });
  d.drawText(att.name, { x: (PAGE_W - font.widthOfTextAtSize(att.name, 10)) / 2, y: PAGE_H / 2 - 28, size: 10, font, color: MUTED });
  const ext = (att.fileType || att.name.split(".").pop() || "").toLowerCase();
  try {
    const res = await fetch(attachmentUrl(att.filePath));
    if (!res.ok) { skipped.push(att.name); return; }
    const bytes = await res.arrayBuffer();
    if (ext === "pdf") {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const copied = await doc.copyPages(src, src.getPageIndices());
      copied.forEach((p) => doc.addPage(p));
    } else if (["png", "jpg", "jpeg"].includes(ext)) {
      const img = ext === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const p = doc.addPage([PAGE_W, PAGE_H]);
      const m = 48;
      const scale = Math.min((PAGE_W - m * 2) / img.width, (PAGE_H - m * 2) / img.height, 1);
      const w = img.width * scale, h = img.height * scale;
      p.drawImage(img, { x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, width: w, height: h });
    } else {
      skipped.push(att.name);
    }
  } catch { skipped.push(att.name); }
}

// A page of the standard (constant) Terms & Conditions text.
function drawConstantTermsPage(doc: PDFDocument, font: PDFFont, bold: PDFFont, po: ApiProcurementPO, ref: string) {
  const p = doc.addPage([PAGE_W, PAGE_H]);
  p.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: GREEN });
  let y = PAGE_H - 56;
  p.drawText("Terms & Conditions", { x: M, y, size: 13, font: bold, color: INK });
  p.drawText(ref, { x: PAGE_W - M - bold.widthOfTextAtSize(ref, 10), y, size: 10, font: bold, color: MUTED });
  y -= 20;
  if (po.terms) p.drawText(po.terms.slice(0, 3000), { x: M, y, size: 9, font, color: INK, maxWidth: PAGE_W - M * 2, lineHeight: 13 });
}

// The full PO PACKAGE we CREATE, following the PO_Insulation first-page order:
//   1) logos (GreenTech + partner)  2) parties (us / partner / vendor / ship-to)
//   3) item table  4) signature & stamp section (parallel columns)
//   5) other uploaded documents (vendor quote, invoice, submittals, other)
//   6) Terms & Conditions — ALWAYS the last page.
export async function buildPoPackage(po: ApiProcurementPO, vendor?: ApiVendor, projectInfo?: ProjectPdfInfo, refLabel?: string): Promise<{ blob: Blob; skipped: string[] }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ref = refLabel || po.poNo;
  const skipped: string[] = [];

  const page1 = await drawPoPage1(doc, font, bold, po, vendor, projectInfo, ref);
  await drawSignatureStamp(doc, page1, font, bold, po, projectInfo?.partner);

  const atts = po.attachments || [];
  const LABELS: Record<string, string> = { quote: "Vendor Quotation", invoice: "Vendor Invoice", submittal: "Approved Submittal", other: "Attachment" };
  for (const kind of ["quote", "invoice", "submittal", "other"]) {
    for (const a of atts.filter((x) => x.kind === kind)) await appendAttachment(doc, font, bold, a, LABELS[kind] || "Attachment", skipped);
  }

  // Terms & Conditions — always last.
  if (po.termsMode === "file") {
    const t = atts.find((a) => a.kind === "terms");
    if (t) await appendAttachment(doc, font, bold, t, "Terms & Conditions", skipped);
  } else {
    drawConstantTermsPage(doc, font, bold, po, ref);
  }

  const out = await doc.save();
  return { blob: new Blob([out], { type: "application/pdf" }), skipped };
}
