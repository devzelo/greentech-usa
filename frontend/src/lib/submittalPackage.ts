import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { attachmentUrl, type ApiSubmittal, type ApiSubmittalRevision, type ApiSubmittalAttachment } from "./api";

// Submittal packages are assembled in this conventional order.
const COMPONENT_ORDER = ["cover", "spec", "catalog", "drawing", "photo", "other"];
const COMPONENT_LABEL: Record<string, string> = {
  cover: "Cover Page", spec: "Specification", catalog: "Catalog / Data Sheet", drawing: "Drawings", photo: "Site Photos", other: "Other",
};
const DISPO_LABEL: Record<string, string> = {
  Pending: "Pending", Approved: "Approved", ApprovedAsNoted: "Approved as Noted", ReviseResubmit: "Revise & Resubmit", Rejected: "Rejected", Superseded: "Superseded",
};

function sortByComponent(atts: ApiSubmittalAttachment[]): ApiSubmittalAttachment[] {
  return [...atts].sort((a, b) => COMPONENT_ORDER.indexOf(a.component) - COMPONENT_ORDER.indexOf(b.component));
}

/**
 * Build ONE combined PDF for a submittal revision: a generated title page, then each
 * uploaded component (PDFs page-by-page, images as full pages), with continuous page numbers.
 * Returns the blob + a list of files that couldn't be embedded (docx/xlsx etc.).
 */
export async function buildSubmittalPackage(sub: ApiSubmittal, rev: ApiSubmittalRevision): Promise<{ blob: Blob; skipped: string[] }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const skipped: string[] = [];
  // CR-P-16 — A3 landscape (11"x17") for the generated pages so all content/columns are visible.
  // A3-landscape height equals A4-portrait height (841.89), so the vertical layout is unchanged.
  const PW = 1190.55, PH = 841.89;

  // ── Title page ──
  const title = doc.addPage([PW, PH]);
  const { width, height } = title.getSize();
  const draw = (text: string, y: number, size: number, f = font, color = rgb(0.06, 0.09, 0.16)) =>
    title.drawText(text, { x: 56, y, size, font: f, color });
  title.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: rgb(0.06, 0.72, 0.51) });
  draw("SUBMITTAL PACKAGE", height - 120, 12, bold, rgb(0.06, 0.72, 0.51));
  draw(sub.title || sub.productName || "Submittal", height - 156, 26, bold);
  let y = height - 200;
  const line = (label: string, value: string) => { if (!value) return; draw(label, y, 9, font, rgb(0.39, 0.45, 0.55)); draw(value, y - 14, 12, bold); y -= 36; };
  line("Product", sub.productName);
  line("Brand / option submitted", rev.optionLabel || sub.manufacturer);
  line("Model / Part No.", sub.modelNo);
  line("Spec Section", sub.specSection);
  line("Revision", `Rev ${rev.revisionNo}`);
  line("Client decision", DISPO_LABEL[rev.disposition] || rev.disposition);
  line("Date submitted", rev.sentToClientAt);
  line("Date returned", rev.respondedAt);
  if (rev.notes && rev.notes.trim()) {
    draw("Client comments", y, 9, font, rgb(0.39, 0.45, 0.55)); y -= 14;
    title.drawText(rev.notes.slice(0, 600), { x: 56, y, size: 10, font, color: rgb(0.06, 0.09, 0.16), maxWidth: width - 112, lineHeight: 13 });
    y -= 40;
  }
  // Contents list — the client-response letter is NOT part of the package we send the client
  // (it's their reply to it), so it never appears in the combined PDF.
  y -= 8;
  draw("CONTENTS", y, 9, font, rgb(0.39, 0.45, 0.55)); y -= 18;
  const present = sortByComponent(rev.attachments.filter((a) => a.component !== "clientLetter"));
  const seen = new Set<string>();
  for (const a of present) {
    if (seen.has(a.component)) continue;
    seen.add(a.component);
    draw(`•  ${COMPONENT_LABEL[a.component] || a.component}`, y, 11, font);
    y -= 16;
  }
  if (!present.length) draw("No components uploaded yet.", y, 11, font, rgb(0.39, 0.45, 0.55));

  // Draw a labeled divider page that announces the next component (e.g. "DRAWINGS"),
  // plus the source file name, so a reader always knows what they're looking at.
  const addDivider = (component: string, fileName: string) => {
    const p = doc.addPage([PW, PH]);
    const { width: w, height: h } = p.getSize();
    p.drawRectangle({ x: 0, y: h / 2 - 2, width: w, height: 4, color: rgb(0.06, 0.72, 0.51) });
    const label = (COMPONENT_LABEL[component] || component).toUpperCase();
    const ls = 28;
    const lw = bold.widthOfTextAtSize(label, ls);
    p.drawText(label, { x: (w - lw) / 2, y: h / 2 + 24, size: ls, font: bold, color: rgb(0.06, 0.09, 0.16) });
    const fs = 11;
    const fw = font.widthOfTextAtSize(fileName, fs);
    p.drawText(fileName, { x: (w - fw) / 2, y: h / 2 - 32, size: fs, font, color: rgb(0.39, 0.45, 0.55) });
  };

  // ── Components ──
  for (const a of present) {
    const ext = (a.fileType || a.name.split(".").pop() || "").toLowerCase();
    // Every uploaded file gets its own labeled divider page so the reader always
    // knows what the following pages are (Cover Page / Drawings / …) and which file.
    addDivider(a.component, a.name);
    try {
      const res = await fetch(attachmentUrl(a.filePath));
      if (!res.ok) { skipped.push(a.name); continue; }
      const bytes = await res.arrayBuffer();
      if (ext === "pdf") {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copied = await doc.copyPages(src, src.getPageIndices());
        copied.forEach((p) => doc.addPage(p));
      } else if (["png", "jpg", "jpeg"].includes(ext)) {
        const img = ext === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const page = doc.addPage([PW, PH]);
        const m = 48;
        const scale = Math.min((page.getWidth() - m * 2) / img.width, (page.getHeight() - m * 2) / img.height, 1);
        const w = img.width * scale, h = img.height * scale;
        page.drawImage(img, { x: (page.getWidth() - w) / 2, y: (page.getHeight() - h) / 2, width: w, height: h });
      } else {
        skipped.push(a.name);
      }
    } catch { skipped.push(a.name); }
  }

  // Page numbers
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const t = `Page ${i + 1} of ${pages.length}`;
    const size = 8;
    const tw = font.widthOfTextAtSize(t, size);
    p.drawText(t, { x: p.getWidth() - 44 - tw, y: 20, size, font, color: rgb(0.39, 0.45, 0.55) });
  });

  const out = await doc.save();
  return { blob: new Blob([out], { type: "application/pdf" }), skipped };
}
