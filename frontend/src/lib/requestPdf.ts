import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ApiProjectRequest } from "./api";
import { GREENTECH, embedImage, drawFitted } from "./poPdf";
import { drawProjectInfo, type ProjectPdfInfo } from "./pdfProjectHeader";
import { drawWrapped } from "./pdfText";
import { PdfCursor, renderHtml } from "./pdfHtml";
import { attachmentUrl } from "./api";

// A simple, formal request form (RFI / RFC / change order / notice …) to send to the client:
// GreenTech (Contractor) block, client block, project info, the request number, date, title and
// description. Mirrors the plain style of the RFQ / PO documents.
export async function buildRequestPdf(reqDoc: ApiProjectRequest, projectInfo?: ProjectPdfInfo, clientName?: string): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const GREEN = rgb(0.06, 0.72, 0.51), INK = rgb(0.06, 0.09, 0.16), MUTED = rgb(0.39, 0.45, 0.55);
  const M = 48;
  let y = height - 56;

  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: GREEN });
  page.drawText(GREENTECH.name, { x: M, y, size: 18, font: bold, color: INK });
  const heading = (reqDoc.type === "Custom Request" && reqDoc.customTitle ? reqDoc.customTitle : reqDoc.type).toUpperCase();
  page.drawText(heading.slice(0, 40), { x: width - M - bold.widthOfTextAtSize(heading.slice(0, 40), 11), y: y + 2, size: 11, font: bold, color: GREEN });
  y -= 18;
  page.drawText("Construction & Engineering", { x: M, y, size: 9, font, color: MUTED });
  const ref = `${reqDoc.type.match(/\(([^)]+)\)/)?.[1] || reqDoc.typeCode} No: ${reqDoc.number}`;
  page.drawText(ref, { x: width - M - bold.widthOfTextAtSize(ref, 10), y, size: 10, font: bold, color: INK });
  y -= 22;
  y = drawProjectInfo(page, font, projectInfo, M, y, width - M * 2);
  y -= 8;

  // Two-column party header: Contractor (GreenTech) | Client.
  {
    const gap = 20, colW = (width - M * 2 - gap) / 2;
    const drawCol = (x: number, headingText: string, lines: string[]) => {
      let yy = y;
      page.drawText(headingText, { x, y: yy, size: 8, font: bold, color: MUTED }); yy -= 13;
      lines.filter(Boolean).forEach((l, i) => { yy = drawWrapped(page, i === 0 ? bold : font, String(l), { x, y: yy, size: i === 0 ? 10 : 9, maxW: colW, lineHeight: 13, color: INK, maxLines: 3 }); });
      return yy;
    };
    const a = drawCol(M, "FROM (CONTRACTOR)", [GREENTECH.name, GREENTECH.address, GREENTECH.email, GREENTECH.phone]);
    const b = drawCol(M + colW + gap, "TO (CLIENT)", [clientName || projectInfo?.name || "Client", ""]);
    y = Math.min(a, b) - 14;
  }

  page.drawText(`Date: ${reqDoc.date || "—"}`, { x: M, y, size: 9, font: bold, color: INK });
  y -= 18;
  if (reqDoc.title) { page.drawText("Subject:", { x: M, y, size: 9, font: bold, color: INK }); y = drawWrapped(page, font, reqDoc.title, { x: M + 52, y, size: 9, maxW: width - M * 2 - 52, lineHeight: 12, color: INK }) - 8; }

  // Custom info lines (label: value) printed as an info block.
  const lines = (reqDoc.contextLines || []).filter((l) => l.label || l.value);
  if (lines.length) {
    for (const l of lines) {
      page.drawText(`${l.label}:`, { x: M, y, size: 9, font: bold, color: INK });
      y = drawWrapped(page, font, l.value, { x: M + 120, y, size: 9, maxW: width - M * 2 - 120, lineHeight: 12, color: INK, maxLines: 3 }) - 3;
    }
    y -= 8;
  }

  page.drawText("Description / Request", { x: M, y, size: 10, font: bold, color: INK }); y -= 16;

  // The body is rich text (tables, pictures, lists, lines) — rendered via a paginated cursor that
  // continues on this first page and flows onto new pages as needed.
  const cur = new PdfCursor(doc, width, height, M, undefined, undefined, { page, y });
  const bodyHtml = reqDoc.description || "";
  if (bodyHtml.trim()) {
    if (/<[a-z][\s\S]*>/i.test(bodyHtml)) await renderHtml(cur, doc, bodyHtml, font, bold);
    else cur.para(bodyHtml, font, 9, INK);
  }

  // Custom named sections (title + rich-text body), each rendered like the description.
  for (const s of reqDoc.sections || []) {
    if (!s.title && !s.body?.trim()) continue;
    cur.gap(10); cur.need(30);
    if (s.title) { cur.page.drawText(s.title.slice(0, 80), { x: M, y: cur.y, size: 10, font: bold, color: INK }); cur.y -= 16; }
    if (s.body?.trim()) {
      if (/<[a-z][\s\S]*>/i.test(s.body)) await renderHtml(cur, doc, s.body, font, bold);
      else cur.para(s.body, font, 9, INK);
    }
  }

  // ── Signatures: GreenTech signer (with signature image + stamp) and a client placeholder. ──
  cur.gap(24);
  cur.need(120);
  const sy = cur.y;
  const colW = (width - M * 2 - 24) / 2;
  // Contractor (GreenTech) — signature image + stamp when a signer was chosen.
  cur.page.drawText("FOR THE CONTRACTOR (GREENTECH)", { x: M, y: sy, size: 8, font: bold, color: MUTED });
  const sig = await embedImage(doc, reqDoc.signatureUrl);
  if (sig) drawFitted(cur.page, sig, M, sy - 14, colW - 70, 36);
  else cur.page.drawLine({ start: { x: M, y: sy - 44 }, end: { x: M + colW - 70, y: sy - 44 }, thickness: 1, color: INK });
  const stamp = await embedImage(doc, reqDoc.stampUrl);
  if (stamp) drawFitted(cur.page, stamp, M + colW - 58, sy - 10, 52, 52);
  cur.page.drawText(reqDoc.signerName || "____________________", { x: M, y: sy - 58, size: 10, font: bold, color: INK });
  if (reqDoc.signerTitle) cur.page.drawText(reqDoc.signerTitle.slice(0, 48), { x: M, y: sy - 70, size: 8, font, color: MUTED });
  cur.page.drawText(`Date: ${reqDoc.date || "____________"}`, { x: M, y: sy - 82, size: 8, font, color: MUTED });
  // Client — placeholder for the other party to sign.
  const cx = M + colW + 24;
  cur.page.drawText(`FOR THE CLIENT (${(clientName || "CLIENT").toUpperCase().slice(0, 28)})`, { x: cx, y: sy, size: 8, font: bold, color: MUTED });
  cur.page.drawLine({ start: { x: cx, y: sy - 44 }, end: { x: cx + colW - 20, y: sy - 44 }, thickness: 1, color: INK });
  cur.page.drawText("Name: ____________________", { x: cx, y: sy - 58, size: 9, font, color: MUTED });
  cur.page.drawText("Date: ____________________", { x: cx, y: sy - 74, size: 9, font, color: MUTED });

  // Merge our uploaded document(s) into the same PDF so the preview is the complete package
  // (client request v2). PDFs are appended page-by-page; images become full pages; a labeled
  // divider announces each. Non-embeddable files (docx/xlsx) are skipped.
  for (const a of reqDoc.attachments || []) {
    const ext = (a.fileType || a.name.split(".").pop() || "").toLowerCase();
    const divider = doc.addPage([595.28, 841.89]);
    divider.drawRectangle({ x: 0, y: height / 2 - 2, width, height: 4, color: GREEN });
    divider.drawText("ATTACHED DOCUMENT", { x: (width - bold.widthOfTextAtSize("ATTACHED DOCUMENT", 18)) / 2, y: height / 2 + 16, size: 18, font: bold, color: INK });
    divider.drawText(a.name.slice(0, 80), { x: (width - font.widthOfTextAtSize(a.name.slice(0, 80), 10)) / 2, y: height / 2 - 24, size: 10, font, color: MUTED });
    try {
      const res = await fetch(attachmentUrl(a.filePath));
      if (!res.ok) continue;
      const bytes = await res.arrayBuffer();
      if (ext === "pdf") {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await doc.copyPages(src, src.getPageIndices());
        pages.forEach((p) => doc.addPage(p));
      } else if (["png", "jpg", "jpeg"].includes(ext)) {
        const img = ext === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const p = doc.addPage([595.28, 841.89]);
        const scale = Math.min((width - M * 2) / img.width, (height - M * 2) / img.height, 1);
        p.drawImage(img, { x: (width - img.width * scale) / 2, y: (height - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
      }
    } catch { /* skip unreadable attachment */ }
  }

  const out = await doc.save();
  return new Blob([out], { type: "application/pdf" });
}
