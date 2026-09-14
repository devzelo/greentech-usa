import { PDFDocument, PDFImage, type PDFPage } from "pdf-lib";
import { attachmentUrl, type ApiProcurementPO, type ApiVendor } from "./api";
import { drawProjectInfo, type ProjectPdfInfo } from "./pdfProjectHeader";
import { drawWrapped, fitOneLine, wrappedHeight } from "./pdfText";
import {
  C, GUTTER, LETTER, brandPage, dividerPage, drawTable, flowText, imagePage, label, loadBrand, partyBlock,
  stampPageNumbers, titleBlock, type Brand, type Flow, type TableCol,
} from "./pdfBrand";

const n = (s: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });
// US Letter, 8.5" x 11" (client request), on the letterhead; descriptions wrap to keep the full text.
const X = GUTTER, W = LETTER.w - GUTTER * 2;

// GreenTech's own company details (constant — the "our company" side of the PO & RFQ).
export const GREENTECH = {
  name: "GreenTech USA",
  address: "Chantilly, Virginia, USA",
  email: "info@gt-usa.com",
  phone: "+1 571-337-1358",
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

// CR-P (38) — pdf-lib only understands PNG and JPEG. A picture pasted or uploaded from a phone or
// a screenshot tool is very often WebP, GIF, AVIF or SVG, and those used to throw here and be
// silently dropped: the image showed in the editor but was missing from the preview and the print.
// Anything that is not already PNG/JPEG is repainted through a canvas into PNG first.
async function repaintAsPng(src: string): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        if (!canvas.width || !canvas.height) return resolve(null);
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((b) => { if (!b) return resolve(null); void b.arrayBuffer().then(resolve).catch(() => resolve(null)); }, "image/png");
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function embedImage(doc: PDFDocument, url?: string): Promise<PDFImage | null> {
  if (!url) return null;
  const src = toFetchUrl(url);
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const head = new Uint8Array(bytes.slice(0, 4));
    const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const isJpg = head[0] === 0xff && head[1] === 0xd8;
    if (isPng) return await doc.embedPng(bytes);
    if (isJpg) return await doc.embedJpg(bytes);
    // Some other format (WebP / GIF / AVIF / SVG): let the browser decode it, then hand pdf-lib PNG.
    const png = await repaintAsPng(src);
    return png ? await doc.embedPng(png) : null;
  } catch {
    // A malformed PNG/JPEG can still fail to embed — the canvas route often rescues it.
    try {
      const png = await repaintAsPng(src);
      return png ? await doc.embedPng(png) : null;
    } catch { return null; }
  }
}

// Draw an image constrained to a max box, anchored at (x, topY) growing downward. Returns height used.
export function drawFitted(page: PDFPage, img: PDFImage, x: number, topY: number, maxW: number, maxH: number): number {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = img.width * scale, h = img.height * scale;
  page.drawImage(img, { x, y: topY - h, width: w, height: h });
  return h;
}

// The signature & stamp block sits from here down on the last page of the order itself, so the
// table, totals and notes above it never reach this line (a long order continues on a new page).
const SIG_TOP = 238;

// Page 1 (and its continuation pages): title block, parties, item table, totals, notes.
async function drawOrder(doc: PDFDocument, b: Brand, po: ApiProcurementPO, vendor: ApiVendor | undefined, info: ProjectPdfInfo | undefined, ref: string, note: string): Promise<PDFPage> {
  const newPage = (): Flow => brandPage(doc, b, LETTER, note);
  let f = newPage();
  const partner = info?.partner;
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  let y = titleBlock(f.page, b, { x: X, y: f.y, w: W, eyebrow: "Purchase order", title: `Order to ${po.vendorName || vendor?.name || "vendor"}`, meta: [["PO number", ref], ["Date", today]] });
  y = drawProjectInfo(f.page, b.regular, info, X, y, W) - 4;

  // Parties — us and the JV partner, then the vendor and where it ships to.
  const colW = (W - 24) / 2, rx = X + colW + 24;
  const leftEnd = partyBlock(f.page, b, X, y, colW, "From", [GREENTECH.name, GREENTECH.address, GREENTECH.email, GREENTECH.phone]);
  let rightEnd = y;
  if (partner) {
    // The GreenTech logo is in the band; the partner's sits at the top right of its own block.
    const pLogo = await embedImage(doc, partner.logoUrl);
    if (pLogo) { const s = Math.min(90 / pLogo.width, 26 / pLogo.height, 1); drawFitted(f.page, pLogo, rx + colW - pLogo.width * s, y + 8, 90, 26); }
    rightEnd = partyBlock(f.page, b, rx, y, colW - 96, "Partner", [partner.name, partner.address, partner.email, partner.phone]);
  }
  y = Math.min(leftEnd, rightEnd) - 10;
  const vEnd = partyBlock(f.page, b, X, y, colW, "Vendor", [po.vendorName || vendor?.name || "(vendor)", [vendor?.city, vendor?.country].filter(Boolean).join(", "), vendor?.contactName ? `Attn: ${vendor.contactName}` : "", vendor?.email || ""]);
  let shipEnd = y;
  if (po.shipTo || po.deliveryMethod) shipEnd = partyBlock(f.page, b, rx, y, colW, "Ship to", [po.deliveryMethod || "Delivery", po.shipTo || ""]);
  f.y = Math.min(vEnd, shipEnd) - 12;

  // Items. Description takes the width left over and wraps, so the full text still prints.
  const cols: TableCol[] = [
    { label: "#", w: 24 }, { label: "Description", w: W - 24 - 40 - 40 - 78 - 84, wrap: true }, { label: "Qty", w: 40, align: "right" },
    { label: "Unit", w: 40 }, { label: "Unit price", w: 78, align: "right" }, { label: "Amount", w: 84, align: "right" },
  ];
  let subtotal = 0;
  f = drawTable(b, f, X, cols, po.lineItems.map((li, i) => {
    const amt = n(li.qty) * n(li.unitPrice); subtotal += amt;
    return { cells: [String(i + 1), li.description || "", li.qty || "", li.unit || "", li.unitPrice ? money(n(li.unitPrice)) : "", money(amt)] };
  }), { newPage });

  // Totals and notes, kept clear of the signature block (a new page when there is no room).
  const totalsRows = (n(po.shipping) ? 1 : 0) + (n(po.tax) ? 1 : 0) + 1;
  const notesBody = (po.notes || "").slice(0, 600);
  const notesH = notesBody ? 16 + wrappedHeight(b.regular, notesBody, 8.5, W, 12) + 6 : 0;
  if (f.y - 18 - totalsRows * 18 - notesH < SIG_TOP) f = newPage();
  f.y -= 18;
  const rowR = (k: string, v: string, strong = false) => {
    if (strong) f.page.drawLine({ start: { x: X + W - 236, y: f.y + 13 }, end: { x: X + W, y: f.y + 13 }, thickness: 0.8, color: C.border });
    f.page.drawText(k, { x: X + W - 230, y: f.y, size: strong ? 9.5 : 9, font: strong ? b.bold : b.regular, color: strong ? C.slate : C.s500 });
    const font = strong ? b.display : b.bold, size = strong ? 14 : 9.5;
    const vv = fitOneLine(font, v, size, 150);
    f.page.drawText(vv, { x: X + W - 6 - font.widthOfTextAtSize(vv, size), y: f.y - (strong ? 1 : 0), size, font, color: strong ? C.emerald : C.slate });
    f.y -= strong ? 24 : 18;
  };
  if (n(po.shipping)) rowR("Shipping", money(n(po.shipping)));
  if (n(po.tax)) rowR("Tax / Duty", money(n(po.tax)));
  rowR("TOTAL", money(n(po.total) || subtotal + n(po.shipping) + n(po.tax)), true);
  // Notes — extra info for the vendor, printed after the table and before the signature section.
  if (notesBody) {
    label(f.page, b, "Notes", X, f.y); f.y -= 13;
    drawWrapped(f.page, b.regular, notesBody, { x: X, y: f.y, size: 8.5, maxW: W, lineHeight: 12, color: C.s700 });
  }
  return f.page;   // the LAST page of the order — the signature block is drawn on this one
}

// The signature & stamp section — right AFTER the table (client spec). Left column is GreenTech
// (name/email/phone/address/signature/stamp), right is the partner (JV only).
async function drawSignatureStamp(doc: PDFDocument, b: Brand, page: PDFPage, po: ApiProcurementPO, partner?: ProjectPdfInfo["partner"]): Promise<void> {
  const colW = (W - 24) / 2, rx = X + colW + 24;
  page.drawLine({ start: { x: X, y: SIG_TOP }, end: { x: X + W, y: SIG_TOP }, thickness: 0.8, color: C.border });

  const drawSide = async (x: number, heading: string, party: { name: string; title?: string; email?: string; phone?: string; address?: string; signatureUrl?: string; stampUrl?: string }) => {
    let y = SIG_TOP - 18;
    label(page, b, heading, x, y); y -= 14;
    // Signature image (or a ruled line if none) with the stamp RIGHT NEXT to it — the stamp
    // belongs to this party's block, overlapping the signature area like a real stamped document.
    const sigTop = y;
    const sig = await embedImage(doc, party.signatureUrl);
    if (sig) { drawFitted(page, sig, x, y, colW - 70, 40); y -= 44; }
    else { page.drawLine({ start: { x, y: y - 30 }, end: { x: x + colW - 70, y: y - 30 }, thickness: 0.8, color: C.s400 }); y -= 42; }
    const stamp = await embedImage(doc, party.stampUrl);
    if (stamp) drawFitted(page, stamp, x + colW - 62, sigTop + 4, 56, 56);
    // Keep every detail line clear of the stamp box, which starts at x + colW - 62.
    const textW = colW - 70;
    page.drawText(fitOneLine(b.bold, party.name || "-", 10, textW), { x, y, size: 10, font: b.bold, color: C.slate }); y -= 12;
    for (const [v, muted] of [[party.title, true], [party.email, false], [party.phone, false], [party.address, true]] as Array<[string | undefined, boolean]>) {
      if (!v) continue;
      page.drawText(fitOneLine(b.regular, v, 8.3, textW), { x, y, size: 8.3, font: b.regular, color: muted ? C.s500 : C.s700 }); y -= 11;
    }
  };

  await drawSide(X, "Authorized by: GreenTech USA", {
    name: po.signerName || "", title: po.signerTitle, email: po.signerEmail || GREENTECH.email, phone: po.signerPhone || GREENTECH.phone,
    address: GREENTECH.address, signatureUrl: po.signatureUrl, stampUrl: po.stampUrl,
  });
  if (partner) {
    await drawSide(rx, `Authorized by: ${partner.name || "Partner"}`, {
      name: po.partnerSignerName || "", email: po.partnerSignerEmail || partner.email, phone: po.partnerSignerPhone || partner.phone,
      address: partner.address, signatureUrl: po.partnerSignatureUrl, stampUrl: po.partnerStampUrl,
    });
  }
}

// Append an attachment behind a branded divider page: PDF pages copied as they are, pictures fitted
// on a page. Those pages keep their own look and are not numbered (`asIs`).
async function appendAttachment(doc: PDFDocument, b: Brand, att: { name: string; filePath: string; fileType: string }, kicker: string, skipped: string[], asIs: Set<number>) {
  dividerPage(doc, b, LETTER, kicker, att.name, "Attachment");
  const ext = (att.fileType || att.name.split(".").pop() || "").toLowerCase();
  try {
    const res = await fetch(attachmentUrl(att.filePath));
    if (!res.ok) { skipped.push(att.name); return; }
    const bytes = await res.arrayBuffer();
    if (ext === "pdf") {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const copied = await doc.copyPages(src, src.getPageIndices());
      copied.forEach((p) => { asIs.add(doc.getPageCount()); doc.addPage(p); });
    } else if (["png", "jpg", "jpeg"].includes(ext)) {
      const img = ext === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      asIs.add(doc.getPageCount());
      imagePage(doc, img, LETTER);
    } else {
      skipped.push(att.name);
    }
  } catch { skipped.push(att.name); }
}

// The standard (constant) Terms & Conditions, on as many letterhead pages as they need.
function drawConstantTerms(doc: PDFDocument, b: Brand, po: ApiProcurementPO, ref: string, note: string) {
  const newPage = (): Flow => brandPage(doc, b, LETTER, note);
  const f = newPage();
  f.y = titleBlock(f.page, b, { x: X, y: f.y, w: W, eyebrow: "Terms & conditions", title: "Terms and Conditions", meta: [["PO number", ref]] });
  if (po.terms) flowText(f, po.terms.slice(0, 20000), { x: X, w: W, font: b.regular, size: 9, lineHeight: 13, color: C.s700, newPage });
}

// The full PO PACKAGE we CREATE, following the PO_Insulation first-page order:
//   1) title block (the GreenTech logo is in the letterhead; the partner's in its block)
//   2) parties (us / partner / vendor / ship-to)  3) item table  4) signature & stamp section
//   5) other uploaded documents (vendor quote, invoice, submittals, other)
//   6) Terms & Conditions — ALWAYS the last page.
export async function buildPoPackage(po: ApiProcurementPO, vendor?: ApiVendor, projectInfo?: ProjectPdfInfo, refLabel?: string): Promise<{ blob: Blob; skipped: string[] }> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const ref = refLabel || po.poNo;
  const note = [`Purchase Order ${ref}`, projectInfo?.name].filter(Boolean).join("  ·  ");
  const skipped: string[] = [];
  const asIs = new Set<number>();

  const last = await drawOrder(doc, b, po, vendor, projectInfo, ref, note);
  await drawSignatureStamp(doc, b, last, po, projectInfo?.partner);

  const atts = po.attachments || [];
  const LABELS: Record<string, string> = { quote: "Vendor Quotation", invoice: "Vendor Invoice", submittal: "Approved Submittal", other: "Attachment" };
  for (const kind of ["quote", "invoice", "submittal", "other"]) {
    for (const a of atts.filter((x) => x.kind === kind)) await appendAttachment(doc, b, a, LABELS[kind] || "Attachment", skipped, asIs);
  }

  // Terms & Conditions — always last.
  if (po.termsMode === "file") {
    const t = atts.find((a) => a.kind === "terms");
    if (t) await appendAttachment(doc, b, t, "Terms & Conditions", skipped, asIs);
  } else {
    drawConstantTerms(doc, b, po, ref, note);
  }

  stampPageNumbers(doc, b, asIs);
  const out = await doc.save();
  return { blob: new Blob([out], { type: "application/pdf" }), skipped };
}
