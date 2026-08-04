import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ApiRfq, ApiVendor } from "./api";
import { drawProjectInfo, type ProjectPdfInfo } from "./pdfProjectHeader";
import { GREENTECH } from "./poPdf";
import { drawWrapped, fitOneLine, wrappedHeight } from "./pdfText";

// Generate a branded RFQ PDF to send to a vendor: GreenTech header, send-to block, and a
// line-item table with an EMPTY unit-price/amount column for the vendor to fill in, plus
// shipping / tax / total rows. Vendor-facing — shows project info but never the client (H1/H2).
export async function buildRfqPdf(rfq: ApiRfq, vendor?: ApiVendor, projectInfo?: ProjectPdfInfo, refLabel?: string): Promise<Blob> {
  const ref = refLabel || rfq.rfqNo;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const GREEN = rgb(0.06, 0.72, 0.51), INK = rgb(0.06, 0.09, 0.16), MUTED = rgb(0.39, 0.45, 0.55);
  const M = 48;
  let y = height - 56;

  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: GREEN });
  page.drawText("GreenTech USA", { x: M, y, size: 18, font: bold, color: INK });
  page.drawText("REQUEST FOR QUOTATION", { x: width - M - bold.widthOfTextAtSize("REQUEST FOR QUOTATION", 11), y: y + 2, size: 11, font: bold, color: GREEN });
  y -= 18;
  page.drawText("Construction & Engineering", { x: M, y, size: 9, font, color: MUTED });
  // Labelled like the PO's "PO Number: 8001" so the reference reads clearly on the document.
  const refLine = /^\s*rfq\b/i.test(ref) ? ref : `RFQ Number: ${ref}`;
  page.drawText(refLine, { x: width - M - bold.widthOfTextAtSize(refLine, 10), y, size: 10, font: bold, color: INK });
  y -= 22;
  y = drawProjectInfo(page, font, projectInfo, M, y, width - M * 2); // H1 (no client — H2)
  y -= 8;

  // Three-column party header (same as the PO document): GreenTech | vendor | delivery details.
  {
    const gap = 16;
    const colW = (width - M * 2 - gap * 2) / 3;
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
  page.drawText(rfq.title || "Items requested for quotation", { x: M, y, size: 12, font: bold, color: INK }); y -= 22;

  // Table header — this RFQ is a DESCRIPTION of the items we want quoted. No prices/totals appear
  // here; the vendor returns their own quotation separately.
  const cols = [
    { label: "#", x: M, max: 4 },
    { label: "Description", x: M + 22, max: 37 },
    { label: "Brand", x: M + 187, max: 20 },
    { label: "Qty", x: M + 277, max: 8 },
    { label: "Unit", x: M + 315, max: 8 },
    { label: "Spec", x: M + 353, max: 22 },
    { label: "Need by", x: M + 453, max: 11 },
  ];
  const drawRowLine = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: width - M, y: yy }, thickness: 0.5, color: rgb(0.9, 0.92, 0.95) });
  page.drawRectangle({ x: M, y: y - 4, width: width - M * 2, height: 18, color: INK });
  cols.forEach((c) => page.drawText(c.label, { x: c.x + 3, y: y + 1, size: 8, font: bold, color: rgb(1, 1, 1) }));
  y -= 18;

  rfq.lineItems.forEach((li, i) => {
    if (y < 120) return; // single-page v1
    const cells = [String(i + 1), li.description || "", li.manufacturer || "", li.qty || "", li.unit || "", li.spec || "", li.needOnSiteDate || ""];
    cells.forEach((t, ci) => page.drawText(String(t).slice(0, cols[ci].max), { x: cols[ci].x + 3, y: y + 2, size: 8, font, color: INK }));
    y -= 16; drawRowLine(y + 2);
  });

  y -= 20;
  if (rfq.notes) {
    page.drawText("Notes:", { x: M, y, size: 9, font: bold, color: INK }); y -= 13;
    // Wrapped by measure so the closing sentence below can never be overprinted.
    y = drawWrapped(page, font, rfq.notes.slice(0, 400), { x: M, y, size: 9, maxW: width - M * 2, lineHeight: 12, color: INK }) - 10;
  }
  page.drawText("Kindly provide your quotation and delivery lead time for the items listed above.", { x: M, y, size: 8, font, color: MUTED });

  const out = await doc.save();
  return new Blob([out], { type: "application/pdf" });
}
