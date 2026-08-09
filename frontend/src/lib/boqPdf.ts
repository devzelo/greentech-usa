import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ApiProcurementSection, ApiProcurementItem } from "./api";
import { drawProjectInfo, type ProjectPdfInfo } from "./pdfProjectHeader";

// order-by date = need-on-site − lead-time(days)
function orderByDate(needOnSite: string, leadDays: string): string {
  if (!needOnSite) return "";
  const days = parseInt(String(leadDays).replace(/[^0-9]/g, ""), 10);
  const d = new Date(needOnSite);
  if (isNaN(d.getTime())) return "";
  if (isFinite(days) && days) d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// Branded, paginated BOQ PDF: GreenTech header, items grouped by category, one table per page-run.
export async function buildBoqPdf(sections: ApiProcurementSection[], items: ApiProcurementItem[], projectInfo?: ProjectPdfInfo): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const GREEN = rgb(0.06, 0.72, 0.51), INK = rgb(0.06, 0.09, 0.16), MUTED = rgb(0.39, 0.45, 0.55);
  const M = 40;
  const PW = 1190.55, PH = 841.89; // A3 landscape (CR-P-16 — fits all columns + full text)

  let page = doc.addPage([PW, PH]);
  let y = 0;

  // A3-landscape column layout — the extra width goes mostly to Description and Spec (CR-P-15).
  const cols = [
    { label: "#", x: M, w: 26 },
    { label: "Description", x: M + 26, w: 336 },
    { label: "Brand", x: M + 362, w: 100 },
    { label: "Vendor", x: M + 462, w: 100 },
    { label: "Qty", x: M + 562, w: 40 },
    { label: "Unit", x: M + 602, w: 44 },
    { label: "Spec", x: M + 646, w: 190 },
    { label: "Need on site", x: M + 836, w: 84 },
    { label: "Order by", x: M + 920, w: 84 },
    { label: "Status", x: M + 1004, w: 64 },
  ];

  const drawHeader = () => {
    page.drawRectangle({ x: 0, y: PH - 8, width: PW, height: 8, color: GREEN });
    page.drawText("GreenTech USA", { x: M, y: PH - 40, size: 16, font: bold, color: INK });
    const t = "BILL OF QUANTITY (BOQ)";
    page.drawText(t, { x: PW - M - bold.widthOfTextAtSize(t, 11), y: PH - 38, size: 11, font: bold, color: GREEN });
    y = PH - 70;
  };
  const drawTableHead = () => {
    page.drawRectangle({ x: M, y: y - 4, width: PW - M * 2, height: 18, color: INK });
    cols.forEach((c) => page.drawText(c.label, { x: c.x + 3, y: y + 1, size: 8, font: bold, color: rgb(1, 1, 1) }));
    y -= 20;
  };
  const newPage = () => { page = doc.addPage([PW, PH]); drawHeader(); };
  const ensure = (need: number) => { if (y < 46 + need) { newPage(); drawTableHead(); } };

  drawHeader();
  y = drawProjectInfo(page, font, projectInfo, M, y, PW - M * 2); // H1 project-info block on page 1
  const active = items.filter((it) => it.status !== "Cancelled");

  if (!active.length) {
    page.drawText("No BOQ items yet.", { x: M, y, size: 10, font, color: MUTED });
  } else {
    let rowNo = 0; // C5 — continuous 1..N numbering across all categories
    for (const s of sections) {
      const its = active.filter((it) => it.sectionId === s._id);
      if (!its.length) continue;
      ensure(40);
      page.drawText(s.name || "Category", { x: M, y, size: 11, font: bold, color: GREEN });
      y -= 16;
      drawTableHead();
      its.forEach((it) => {
        ensure(16);
        const cells = [
          String(++rowNo), it.description || "", it.manufacturer || "", it.vendorName || "", it.qty || "", it.unit || "",
          it.spec || "", it.needOnSiteDate || "", orderByDate(it.needOnSiteDate, it.leadTimeDays),
          it.status === "BOQ" ? "Not Started" : it.status || "",
        ];
        // Truncate each cell to roughly its own column width so columns never collide.
        cells.forEach((t, ci) => page.drawText(String(t).slice(0, Math.max(4, Math.floor(cols[ci].w / 4.6))), { x: cols[ci].x + 3, y: y + 2, size: 8, font, color: INK }));
        y -= 15;
        page.drawLine({ start: { x: M, y: y + 2 }, end: { x: PW - M, y: y + 2 }, thickness: 0.5, color: rgb(0.9, 0.92, 0.95) });
      });
      y -= 12;
    }
  }

  // Page numbers
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const t = `Page ${i + 1} of ${pages.length}`;
    p.drawText(t, { x: PW - M - font.widthOfTextAtSize(t, 8), y: 24, size: 8, font, color: MUTED });
  });

  const out = await doc.save();
  return new Blob([out], { type: "application/pdf" });
}
