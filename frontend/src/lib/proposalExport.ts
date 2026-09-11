import { pdf } from "@react-pdf/renderer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { documentUrl, withFileToken, type ApiDocument } from "./api";
import { PAGE_NUMBER_POS, abs } from "../components/pdf/brand";

/** A piece of an assembled proposal: generated pages, or uploaded files inserted as they are. */
export type ProposalPart =
  | { type: "doc"; element: unknown }
  | { type: "files"; files: Array<{ name: string; url: string }> };

const extOf = (name: string, url = "") =>
  (/\.[a-z0-9]+$/i.test(name) ? name.split(".").pop() : url.split("?")[0].split(".").pop() || "")!.toLowerCase();

// Uploaded documents sit behind the token guard (images are public); brand assets are plain paths.
function fetchUrl(url: string): string {
  const s = url.replace(/\\/g, "/");
  if (/^\/?uploads\//.test(s)) return withFileToken(`/${s.replace(/^\/+/, "")}`);
  return abs(s);
}

/**
 * Assemble a proposal: generated pages and uploaded files in document order, so a section's client
 * forms land right after it (as on the client's samples), then any trailing attachments.
 *
 * "Page i of N" runs across everything but is stamped only on our own pages: uploaded documents
 * (client forms, SAM printouts, certificates) keep their own footers and numbering untouched, and
 * the cover is counted but not numbered.
 */
export async function assembleProposalParts(
  parts: ProposalPart[],
  trailing: ApiDocument[] = [],
): Promise<{ blob: Blob; skipped: string[] }> {
  const merged = await PDFDocument.create();
  const skipped: string[] = [];
  const asIs = new Set<number>();   // page indices inserted from uploads

  const appendPdf = async (bytes: ArrayBuffer, uploaded: boolean) => {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const copied = await merged.copyPages(src, src.getPageIndices());
    for (const p of copied) {
      if (uploaded) asIs.add(merged.getPageCount());
      merged.addPage(p);
    }
  };
  const appendFile = async (name: string, url: string) => {
    const ext = extOf(name, url);
    try {
      const res = await fetch(url);
      if (!res.ok) { skipped.push(name); return; }
      const bytes = await res.arrayBuffer();
      if (ext === "pdf") {
        await appendPdf(bytes, true);
      } else if (["png", "jpg", "jpeg"].includes(ext)) {
        const img = ext === "png" ? await merged.embedPng(bytes) : await merged.embedJpg(bytes);
        asIs.add(merged.getPageCount());
        const page = merged.addPage([595.28, 841.89]); // A4 points
        const { width, height } = page.getSize();
        const m = 48;
        const scale = Math.min((width - m * 2) / img.width, (height - m * 2) / img.height, 1);
        const w = img.width * scale, h = img.height * scale;
        page.drawImage(img, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
      } else {
        skipped.push(name); // docx/xlsx etc. can't be embedded into a PDF
      }
    } catch {
      skipped.push(name);
    }
  };

  for (const part of parts) {
    if (part.type === "doc") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf(part.element as any).toBlob();
      await appendPdf(await blob.arrayBuffer(), false);
    } else {
      for (const f of part.files) await appendFile(f.name, fetchUrl(f.url));
    }
  }
  for (const a of trailing) await appendFile(a.name, documentUrl(a));

  // Page numbers, in the letterhead footer's right-hand slot (level with its reference line).
  const font = await merged.embedFont(StandardFonts.Helvetica);
  const pages = merged.getPages();
  pages.forEach((p, i) => {
    if (i === 0 || asIs.has(i)) return;
    const { width } = p.getSize();
    const text = `Page ${i + 1} of ${pages.length}`;
    const size = 7.5;
    const tw = font.widthOfTextAtSize(text, size);
    p.drawText(text, { x: width - PAGE_NUMBER_POS.right - tw, y: PAGE_NUMBER_POS.baseline, size, font, color: rgb(0.39, 0.45, 0.55) });
  });

  const out = await merged.save();
  return { blob: new Blob([out], { type: "application/pdf" }), skipped };
}

/** One generated document plus trailing attachments (the original single-document form). */
export async function assembleProposalPdf(element: unknown, attachments: ApiDocument[] = []) {
  return assembleProposalParts([{ type: "doc", element }], attachments);
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
