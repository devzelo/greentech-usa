import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { PDF_COLORS } from "./docStyle";
import type { ApiRfq, ApiVendor } from "./api";
import { drawProjectInfo, type ProjectPdfInfo } from "./pdfProjectHeader";
import { GREENTECH } from "./poPdf";
import { drawWrapped, fitOneLine, wrapText, wrappedHeight } from "./pdfText";

// Generate a branded RFQ PDF to send to a vendor: GreenTech header, send-to block, and a
// line-item table with an EMPTY unit-price/amount column for the vendor to fill in, plus
// shipping / tax / total rows. Vendor-facing — shows project info but never the client (H1/H2).
export async function buildRfqPdf(rfq: ApiRfq, vendor?: ApiVendor, projectInfo?: ProjectPdfInfo, refLabel?: string): Promise<Blob> {
  const ref = refLabel || rfq.rfqNo;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  // US Letter, 8.5" x 11" (client request). Long descriptions and specs wrap onto more lines and
  // the table continues onto more pages, so nothing is cut off.
  const width = 612, height = 792;
  let page: PDFPage = doc.addPage([width, height]);
  const { brand: GREEN, ink: INK, muted: MUTED } = PDF_COLORS;   // CR-P (41) — one palette
  const M = 48;
  const W = width - M * 2;
  let y = height - 56;
  const band = () => page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: GREEN });

  band();
  page.drawText("GreenTech USA", { x: M, y, size: 18, font: bold, color: INK });
  page.drawText("REQUEST FOR QUOTATION", { x: width - M - bold.widthOfTextAtSize("REQUEST FOR QUOTATION", 11), y: y + 2, size: 11, font: bold, color: GREEN });
  y -= 18;
  page.drawText("Construction & Engineering", { x: M, y, size: 9, font, color: MUTED });
  // Labelled like the PO's "PO Number: 8001" so the reference reads clearly on the document.
  const refLine = /^\s*rfq\b/i.test(ref) ? ref : `RFQ Number: ${ref}`;
  page.drawText(refLine, { x: width - M - bold.widthOfTextAtSize(refLine, 10), y, size: 10, font: bold, color: INK });
  y -= 22;
  y = drawProjectInfo(page, font, projectInfo, M, y, W); // H1 (no client — H2)
  y -= 8;

  // Three-column party header (same as the PO document): GreenTech | vendor | delivery details.
  {
    const gap = 16;
    const colW = (W - gap * 2) / 3;
    // Each line is wrapped by MEASURE (not pdf-lib's maxWidth, whose 24pt default line height
    // would overlap the line beneath) so the returned cursor is always accurate.
    const drawCol = (x: number, heading: string, lines: string[]): number => {
      let yy = y;
      page.drawText(heading, { x, y: yy, size: 8, font: bold, color: MUTED }); yy -= 13;
      lines.filter(Boolean).forEach((l, i) => {
        const size = i === 0 ? 10 : 9;
        yy = drawWrapped(page, i === 0 ? bold : font, String(l), { x, y: yy, size, maxW: colW, lineHeight: 13, color: INK, maxLines: 3 });
      });
      return yy;
    };
    const gtEnd = drawCol(M, "FROM", [GREENTECH.name, GREENTECH.address, GREENTECH.email, GREENTECH.phone]);
    const vEnd = drawCol(M + colW + gap, "VENDOR", vendor
      ? [vendor.name, [vendor.city, vendor.country].filter(Boolean).join(", "), vendor.contactName ? `Attn: ${vendor.contactName}` : "", vendor.email]
      : ["(all vendors)"]);
    const dEnd = drawCol(M + (colW + gap) * 2, "DELIVERY", [rfq.deliveryMethod || "Delivery", rfq.shipToLocation || ""]);
    y = Math.min(gtEnd, vEnd, dEnd) - 12;
  }
  y = drawWrapped(page, bold, rfq.title || "Items requested for quotation", { x: M, y, size: 12, maxW: W, lineHeight: 15, color: INK, maxLines: 2 }) - 7;

  // Table — this RFQ is a DESCRIPTION of the items we want quoted. No prices/totals appear here;
  // the vendor returns their own quotation separately. Description, Brand and Spec wrap.
  const fixed = { no: 20, brand: 74, qty: 34, unit: 34, need: 58 };
  const rest = W - fixed.no - fixed.brand - fixed.qty - fixed.unit - fixed.need;
  const descW = Math.round(rest * 0.55);
  let cx = M;
  const col = (label: string, w: number, wrap = false) => { const c = { label, x: cx, w, wrap }; cx += w; return c; };
  const cols = [
    col("#", fixed.no), col("Description", descW, true), col("Brand", fixed.brand, true), col("Qty", fixed.qty),
    col("Unit", fixed.unit), col("Spec", rest - descW, true), col("Need by", fixed.need),
  ];
  const SIZE = 8, LH = 10, MAX_LINES = 8;
  const drawRowLine = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: width - M, y: yy }, thickness: 0.5, color: rgb(0.9, 0.92, 0.95) });
  const drawTableHead = () => {
    page.drawRectangle({ x: M, y: y - 4, width: W, height: 18, color: INK });
    cols.forEach((c) => page.drawText(c.label, { x: c.x + 3, y: y + 1, size: 8, font: bold, color: rgb(1, 1, 1) }));
    y -= 18;
  };
  const newPage = () => { page = doc.addPage([width, height]); band(); y = height - 56; };
  drawTableHead();

  rfq.lineItems.forEach((li, i) => {
    const cells = [String(i + 1), li.description || "", li.manufacturer || "", li.qty || "", li.unit || "", li.spec || "", li.needOnSiteDate || ""];
    const lines = cells.map((t, ci) => (cols[ci].wrap ? Math.min(MAX_LINES, Math.max(1, wrapText(font, String(t), SIZE, cols[ci].w - 6).length)) : 1));
    const rowH = Math.max(16, Math.max(...lines) * LH + 6);
    if (y - rowH < 60) { newPage(); drawTableHead(); }   // continue the table on a new page
    cells.forEach((t, ci) => {
      const c = cols[ci];
      if (c.wrap) drawWrapped(page, font, String(t), { x: c.x + 3, y: y + 2, size: SIZE, maxW: c.w - 6, lineHeight: LH, color: INK, maxLines: MAX_LINES });
      else page.drawText(fitOneLine(font, String(t), SIZE, c.w - 6), { x: c.x + 3, y: y + 2, size: SIZE, font, color: INK });
    });
    y -= rowH; drawRowLine(y + 12);   // in the gap between this row's last line and the next row's text
  });

  y -= 20;
  const notes = (rfq.notes || "").slice(0, 400);
  const tailH = (notes ? 13 + wrappedHeight(font, notes, 9, W, 12) + 10 : 0) + 20;
  if (y - tailH < 50) newPage();
  if (notes) {
    page.drawText("Notes:", { x: M, y, size: 9, font: bold, color: INK }); y -= 13;
    // Wrapped by measure so the closing sentence below can never be overprinted.
    y = drawWrapped(page, font, notes, { x: M, y, size: 9, maxW: W, lineHeight: 12, color: INK }) - 10;
  }
  page.drawText("Kindly provide your quotation and delivery lead time for the items listed above.", { x: M, y, size: 8, font, color: MUTED });

  const out = await doc.save();
  return new Blob([out], { type: "application/pdf" });
}
