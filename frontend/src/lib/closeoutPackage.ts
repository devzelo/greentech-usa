import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { tableRowFileUrl, type ApiTableRow } from "./api";

// Combine every uploaded closeout document into ONE PDF to send the client (client request:
// "after we create each of these documents, we must combine them as a single pdf and send it").
// A cover page lists the contents, then each document gets a labeled divider page followed by its
// pages (PDFs page-by-page, images as a full page). Non-embeddable files (docx/xlsx) are skipped
// and reported so the user knows to convert them.
const INK = rgb(0.06, 0.09, 0.16), GREEN = rgb(0.06, 0.72, 0.51), GREY = rgb(0.39, 0.45, 0.55);

export async function buildCloseoutPackage(rows: ApiTableRow[], projectName = ""): Promise<{ blob: Blob; skipped: string[]; included: number }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const skipped: string[] = [];
  let included = 0;

  // Only rows that actually have files go into the package.
  const withFiles = rows.filter((r) => r.files && r.files.length);

  // ── Cover page ──
  const cover = doc.addPage([595.28, 841.89]);
  const { width, height } = cover.getSize();
  cover.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: GREEN });
  cover.drawText("PROJECT CLOSEOUT PACKAGE", { x: 56, y: height - 120, size: 12, font: bold, color: GREEN });
  cover.drawText((projectName || "Closeout Documents").slice(0, 60), { x: 56, y: height - 156, size: 24, font: bold, color: INK });
  let y = height - 210;
  cover.drawText("CONTENTS", { x: 56, y, size: 9, font, color: GREY }); y -= 20;
  if (!withFiles.length) cover.drawText("No documents uploaded yet.", { x: 56, y, size: 11, font, color: GREY });
  withFiles.forEach((r, i) => {
    if (y < 60) { return; }
    const name = r.data?.document || `Document ${i + 1}`;
    cover.drawText(`${i + 1}.  ${name}`.slice(0, 80), { x: 56, y, size: 11, font, color: INK });
    y -= 17;
  });

  const addDivider = (title: string, fileName: string) => {
    const p = doc.addPage([595.28, 841.89]);
    const { width: w, height: h } = p.getSize();
    p.drawRectangle({ x: 0, y: h / 2 - 2, width: w, height: 4, color: GREEN });
    const label = title.toUpperCase().slice(0, 48);
    const lw = bold.widthOfTextAtSize(label, 24);
    p.drawText(label, { x: Math.max(40, (w - lw) / 2), y: h / 2 + 24, size: 24, font: bold, color: INK });
    const fw = font.widthOfTextAtSize(fileName, 11);
    p.drawText(fileName.slice(0, 80), { x: Math.max(40, (w - fw) / 2), y: h / 2 - 32, size: 11, font, color: GREY });
  };

  for (const r of withFiles) {
    const title = r.data?.document || "Document";
    for (const f of r.files) {
      const ext = (f.fileType || f.name.split(".").pop() || "").toLowerCase();
      addDivider(title, f.name);
      try {
        const res = await fetch(tableRowFileUrl(f));
        if (!res.ok) { skipped.push(f.name); continue; }
        const bytes = await res.arrayBuffer();
        if (ext === "pdf") {
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const copied = await doc.copyPages(src, src.getPageIndices());
          copied.forEach((p) => doc.addPage(p));
          included++;
        } else if (["png", "jpg", "jpeg"].includes(ext)) {
          const img = ext === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
          const page = doc.addPage([595.28, 841.89]);
          const m = 48;
          const scale = Math.min((page.getWidth() - m * 2) / img.width, (page.getHeight() - m * 2) / img.height, 1);
          const w = img.width * scale, h = img.height * scale;
          page.drawImage(img, { x: (page.getWidth() - w) / 2, y: (page.getHeight() - h) / 2, width: w, height: h });
          included++;
        } else {
          skipped.push(f.name);
        }
      } catch { skipped.push(f.name); }
    }
  }

  // Page numbers
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const t = `Page ${i + 1} of ${pages.length}`;
    const tw = font.widthOfTextAtSize(t, 8);
    p.drawText(t, { x: p.getWidth() - 44 - tw, y: 20, size: 8, font, color: GREY });
  });

  const bytes = await doc.save();
  return { blob: new Blob([bytes], { type: "application/pdf" }), skipped, included };
}
