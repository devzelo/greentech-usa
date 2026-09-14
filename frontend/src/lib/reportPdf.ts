import { PDFDocument } from "pdf-lib";
import { drawProjectInfo, type ProjectPdfInfo } from "./pdfProjectHeader";
import { GUTTER, brandPage, drawTable, loadBrand, stampPageNumbers, titleBlock, type Flow, type PageSize, type TableCol, type TableRow } from "./pdfBrand";

/**
 * A printable table report on the letterhead (the procurement master log, the purchase-order
 * summary). These used to be plain HTML pages sent to the browser's print dialog; as PDFs they get
 * the same header, footer, page numbers and exact page size as every other GreenTech document.
 * Column widths are given as fractions of the text width, so the same report fits any page size.
 */
export async function buildTableReportPdf(o: {
  size: PageSize;
  eyebrow: string;
  title: string;
  meta?: Array<[string, string]>;
  projectInfo?: ProjectPdfInfo;
  note: string;
  cols: TableCol[];        // w = fraction of the text width
  rows: TableRow[];
}): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const X = GUTTER, W = o.size.w - GUTTER * 2;
  const newPage = (): Flow => brandPage(doc, b, o.size, o.note);
  const f = newPage();
  f.y = titleBlock(f.page, b, { x: X, y: f.y, w: W, eyebrow: o.eyebrow, title: o.title, meta: o.meta });
  f.y = drawProjectInfo(f.page, b.regular, o.projectInfo, X, f.y, W) - 6;
  const total = o.cols.reduce((s, c) => s + c.w, 0) || 1;
  drawTable(b, f, X, o.cols.map((c) => ({ ...c, w: (c.w / total) * W })), o.rows, { newPage });
  stampPageNumbers(doc, b);
  return new Blob([await doc.save()], { type: "application/pdf" });
}

/**
 * Show a PDF in a tab. Open the tab (`window.open("", "_blank")`) synchronously in the click and pass
 * it here once the PDF is built, so a popup blocker does not stop it.
 */
export function showPdfInTab(win: Window | null, blob: Blob) {
  const url = URL.createObjectURL(blob);
  if (win && !win.closed) win.location.href = url;
  else window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
}
