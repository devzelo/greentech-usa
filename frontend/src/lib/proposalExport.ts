import { pdf } from "@react-pdf/renderer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { documentUrl, type ApiDocument } from "./api";

// Render a react-pdf proposal element, append uploaded attachments (PDFs page-by-page,
// images as full pages), and stamp continuous page numbers across the whole document.
export async function assembleProposalPdf(
  element: unknown,
  attachments: ApiDocument[] = [],
): Promise<{ blob: Blob; skipped: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseBlob = await pdf(element as any).toBlob();
  const merged = await PDFDocument.load(await baseBlob.arrayBuffer());
  const skipped: string[] = [];

  for (const a of attachments) {
    const ext = (a.fileType || a.name.split(".").pop() || "").toLowerCase();
    try {
      const res = await fetch(documentUrl(a));
      if (!res.ok) { skipped.push(a.name); continue; }
      const bytes = await res.arrayBuffer();
      if (ext === "pdf") {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copied = await merged.copyPages(src, src.getPageIndices());
        copied.forEach((p) => merged.addPage(p));
      } else if (["png", "jpg", "jpeg"].includes(ext)) {
        const img = ext === "png" ? await merged.embedPng(bytes) : await merged.embedJpg(bytes);
        const page = merged.addPage([595.28, 841.89]); // A4 points
        const { width, height } = page.getSize();
        const m = 48;
        const scale = Math.min((width - m * 2) / img.width, (height - m * 2) / img.height, 1);
        const w = img.width * scale, h = img.height * scale;
        page.drawImage(img, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
      } else {
        skipped.push(a.name); // docx/xlsx etc. can't be embedded into a PDF
      }
    } catch {
      skipped.push(a.name);
    }
  }

  // Continuous "Page i of N" across the assembled document.
  const font = await merged.embedFont(StandardFonts.Helvetica);
  const pages = merged.getPages();
  pages.forEach((p, i) => {
    const { width } = p.getSize();
    const text = `Page ${i + 1} of ${pages.length}`;
    const size = 8;
    const tw = font.widthOfTextAtSize(text, size);
    p.drawText(text, { x: width - 44 - tw, y: 20, size, font, color: rgb(0.39, 0.45, 0.55) });
  });

  const out = await merged.save();
  return { blob: new Blob([out], { type: "application/pdf" }), skipped };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
