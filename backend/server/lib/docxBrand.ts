import fs from "fs";
import path from "path";
import { Header, Footer, Paragraph, TextRun, ImageRun, PageNumber, BorderStyle, TabStopType, type ISectionOptions } from "docx";

// Every Word file the platform exports, set up like the PDFs: US Letter (8.5" x 11", in twips), the
// GreenTech letterhead as the page header on every page, and a footer with the document's note and
// "Page X of Y" above the emerald rule. The letterhead picture is read from the frontend's public
// folder; if it is not on this server, the header falls back to the company name in type.

const LETTER_PAGE = {
  size: { width: 12240, height: 15840 },
  margin: { top: 1440, right: 1440, bottom: 1300, left: 1440, header: 420, footer: 460 },
};
const TEXT_WIDTH = 12240 - 1440 * 2;   // twips between the margins (for the right tab stop)

let art: Buffer | null | undefined;
function letterheadArt(): Buffer | null {
  if (art !== undefined) return art;
  art = null;
  for (const p of [
    path.resolve(process.cwd(), "../frontend/public/brand/letterhead-header.png"),
    path.resolve(process.cwd(), "frontend/public/brand/letterhead-header.png"),
    path.resolve(process.cwd(), "public/brand/letterhead-header.png"),
  ]) {
    try { if (fs.existsSync(p)) { art = fs.readFileSync(p); break; } } catch { /* try the next place */ }
  }
  return art;
}

/** A Word section with the GreenTech page setup, header and footer around `children`. */
export function brandedSection(children: ISectionOptions["children"], note = "GreenTech USA LLC  ·  www.gt-usa.com"): ISectionOptions {
  const img = letterheadArt();
  const header = new Header({
    children: [img
      // 624 x 42 px = the 6.5" text width at the art's own proportions (3264 x 220).
      ? new Paragraph({ children: [new ImageRun({ type: "png", data: img, transformation: { width: 624, height: 42 } })] })
      : new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "10B981", space: 4 } },
        children: [
          new TextRun({ text: "GREENTECH USA", bold: true, font: "Calibri", size: 22, color: "0F172A" }),
          new TextRun({ text: "   Construction & Engineering", font: "Calibri", size: 16, color: "10B981" }),
        ],
      })],
  });
  const footer = new Footer({
    children: [new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 12, color: "10B981", space: 4 } },
      tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
      children: [
        new TextRun({ text: note, font: "Calibri", size: 15, color: "64748B" }),
        new TextRun({ children: ["\tPage ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], font: "Calibri", size: 15, color: "64748B" }),
      ],
    })],
  });
  return { properties: { page: LETTER_PAGE }, headers: { default: header }, footers: { default: footer }, children };
}
