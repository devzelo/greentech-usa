import { PDFDocument } from "pdf-lib";
import { tableRowFileUrl, type ApiTableRow } from "./api";
import { fitOneLine } from "./pdfText";
import { BOTTOM, C, GUTTER, LETTER, brandPage, dividerPage, imagePage, loadBrand, sectionHeading, stampPageNumbers, titleBlock, type Flow } from "./pdfBrand";

// Combine every uploaded closeout document into ONE PDF to send the client (client request:
// "after we create each of these documents, we must combine them as a single pdf and send it").
// A branded cover lists the contents, then each document gets a branded divider page followed by
// its pages (PDFs page-by-page, images as a full page). Non-embeddable files (docx/xlsx) are
// skipped and reported so the user knows to convert them.
export async function buildCloseoutPackage(rows: ApiTableRow[], projectName = ""): Promise<{ blob: Blob; skipped: string[]; included: number }> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const skipped: string[] = [];
  let included = 0;
  const X = GUTTER, W = LETTER.w - GUTTER * 2;
  const note = ["Project closeout package", projectName].filter(Boolean).join("  ·  ");
  const newPage = (): Flow => brandPage(doc, b, LETTER, note);

  // Only rows that actually have files go into the package.
  const withFiles = rows.filter((r) => r.files && r.files.length);
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  // ── Cover page with the contents (continuing onto more pages when the list is long) ──
  let f = newPage();
  f.y = titleBlock(f.page, b, { x: X, y: f.y, w: W, eyebrow: "Project closeout package", title: projectName || "Closeout Documents", meta: [["Documents", String(withFiles.length)], ["Date", today]] });
  f.y = sectionHeading(f.page, b, "Contents", X, f.y, W);
  if (!withFiles.length) f.page.drawText("No documents uploaded yet.", { x: X, y: f.y, size: 10, font: b.regular, color: C.s500 });
  withFiles.forEach((r, i) => {
    if (f.y < BOTTOM + 10) { f = newPage(); f.y = sectionHeading(f.page, b, "Contents (continued)", X, f.y, W); }
    const name = r.data?.document || `Document ${i + 1}`;
    const count = `${r.files.length} file${r.files.length === 1 ? "" : "s"}`;
    f.page.drawText(`${i + 1}.`, { x: X, y: f.y, size: 10, font: b.bold, color: C.emerald });
    f.page.drawText(fitOneLine(b.regular, name, 10, W - 110), { x: X + 24, y: f.y, size: 10, font: b.regular, color: C.slate });
    f.page.drawText(count, { x: X + W - b.regular.widthOfTextAtSize(count, 8.5), y: f.y, size: 8.5, font: b.regular, color: C.s500 });
    f.page.drawLine({ start: { x: X, y: f.y - 7 }, end: { x: X + W, y: f.y - 7 }, thickness: 0.5, color: C.border });
    f.y -= 22;
  });

  for (const r of withFiles) {
    const title = r.data?.document || "Document";
    for (const file of r.files) {
      const ext = (file.fileType || file.name.split(".").pop() || "").toLowerCase();
      dividerPage(doc, b, LETTER, title, file.name, "Closeout document");
      try {
        const res = await fetch(tableRowFileUrl(file));
        if (!res.ok) { skipped.push(file.name); continue; }
        const bytes = await res.arrayBuffer();
        if (ext === "pdf") {
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const copied = await doc.copyPages(src, src.getPageIndices());
          copied.forEach((p) => doc.addPage(p));
          included++;
        } else if (["png", "jpg", "jpeg"].includes(ext)) {
          imagePage(doc, ext === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes), LETTER);
          included++;
        } else {
          skipped.push(file.name);
        }
      } catch { skipped.push(file.name); }
    }
  }

  stampPageNumbers(doc, b);   // continuous across the whole package
  const bytes = await doc.save();
  return { blob: new Blob([bytes], { type: "application/pdf" }), skipped, included };
}
