import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";
import { embedImage } from "./poPdf";

// A reusable paginated cursor + rich-text (HTML) renderer for pdf-lib documents. Renders the HTML
// produced by RichTextEditor — paragraphs, headings, lists, images and tables — flowing onto new
// pages as needed. Used by the Contract Admin request PDF (and available to any pdf-lib document).
const INK = rgb(0.06, 0.09, 0.16), MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.8, 0.83, 0.87), HEADBG = rgb(0.95, 0.96, 0.97);

function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    if (!raw.trim()) { out.push(""); continue; }
    let line = "";
    for (const word of raw.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxW && line) { out.push(line); line = word; }
      else line = test;
    }
    if (line) out.push(line);
  }
  return out;
}

export class PdfCursor {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    public pageW: number,
    public pageH: number,
    public margin: number,
    private header?: (p: PDFPage) => void,
    private topY?: number,
    attach?: { page: PDFPage; y: number },
  ) {
    if (attach) { this.page = attach.page; this.y = attach.y; }
    else this.addPage();
  }
  get contentW() { return this.pageW - this.margin * 2; }
  addPage() {
    this.page = this.doc.addPage([this.pageW, this.pageH]);
    if (this.header) this.header(this.page);
    this.y = this.topY ?? this.pageH - 56;
  }
  need(h: number) { if (this.y - h < 56) this.addPage(); }
  text(t: string, font: PDFFont, size: number, color = INK, x = this.margin) {
    this.need(size + 4);
    this.page.drawText(t, { x, y: this.y, size, font, color });
    this.y -= size + 4;
  }
  para(t: string, font: PDFFont, size: number, color = INK) {
    for (const line of wrap(font, t, size, this.contentW)) {
      if (!line) { this.y -= size * 0.7; continue; }
      this.text(line, font, size, color);
    }
  }
  gap(h: number) { this.y -= h; }
  image(img: PDFImage, maxW: number, maxH: number) {
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale, h = img.height * scale;
    this.need(h + 6);
    this.page.drawImage(img, { x: this.margin, y: this.y - h, width: w, height: h });
    this.y -= h + 6;
  }
  table(rows: string[][], heads: boolean[], font: PDFFont, bold: PDFFont) {
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const colW = this.contentW / cols;
    const size = 9, pad = 4, lh = size + 2;
    for (let ri = 0; ri < rows.length; ri++) {
      const isHead = heads[ri];
      const f = isHead ? bold : font;
      const wrapped = rows[ri].map((c) => wrap(f, c, size, colW - 2 * pad));
      const lineCount = Math.max(1, ...wrapped.map((w) => w.length));
      const rowH = lineCount * lh + 2 * pad;
      this.need(rowH);
      const yTop = this.y;
      if (isHead) this.page.drawRectangle({ x: this.margin, y: yTop - rowH, width: this.contentW, height: rowH, color: HEADBG });
      for (let ci = 0; ci < cols; ci++) {
        const cx = this.margin + ci * colW;
        this.page.drawLine({ start: { x: cx, y: yTop }, end: { x: cx, y: yTop - rowH }, thickness: 0.5, color: LINE });
        let ty = yTop - pad - size;
        for (const wl of wrapped[ci] || []) { this.page.drawText(wl, { x: cx + pad, y: ty, size, font: f, color: INK }); ty -= lh; }
      }
      this.page.drawLine({ start: { x: this.margin + this.contentW, y: yTop }, end: { x: this.margin + this.contentW, y: yTop - rowH }, thickness: 0.5, color: LINE });
      this.page.drawLine({ start: { x: this.margin, y: yTop }, end: { x: this.margin + this.contentW, y: yTop }, thickness: 0.5, color: LINE });
      this.page.drawLine({ start: { x: this.margin, y: yTop - rowH }, end: { x: this.margin + this.contentW, y: yTop - rowH }, thickness: 0.5, color: LINE });
      this.y = yTop - rowH;
    }
    this.y -= 6;
  }
}

// Render a RichTextEditor HTML string into the cursor. Inline bold/italic is flattened to text;
// block structure (paragraphs, headings, lists) plus images and tables are preserved.
export async function renderHtml(cur: PdfCursor, doc: PDFDocument, html: string, font: PDFFont, bold: PDFFont) {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const drawImg = async (el: HTMLElement) => {
    const src = el.getAttribute("src"); if (!src) return;
    const img = await embedImage(doc, src); if (!img) return;
    const attrW = parseInt(el.getAttribute("width") || "", 10) || img.width;
    cur.image(img, Math.min(attrW, cur.contentW), 380);
  };
  const drawTbl = (tbl: HTMLElement) => {
    const rows: string[][] = []; const heads: boolean[] = [];
    for (const tr of Array.from(tbl.querySelectorAll("tr"))) {
      const cells = Array.from(tr.children).filter((c) => /^(TD|TH)$/.test(c.tagName));
      if (!cells.length) continue;
      rows.push(cells.map((c) => (c.textContent || "").trim()));
      heads.push(cells.some((c) => c.tagName === "TH"));
    }
    if (rows.length) cur.table(rows, heads, font, bold);
  };
  const drawList = (el: HTMLElement, ordered: boolean) => {
    Array.from(el.children).forEach((li, i) => {
      const t = (li.textContent || "").trim(); if (!t) return;
      cur.para(`${ordered ? `${i + 1}.` : "•"}  ${t}`, font, 9, INK);
    });
  };
  const walk = async (nodes: ChildNode[]) => {
    for (const node of nodes) {
      if (node.nodeType === 3) { const t = node.textContent || ""; if (t.trim()) cur.para(t, font, 9, INK); continue; }
      if (node.nodeType !== 1) continue;
      const el = node as HTMLElement; const tag = el.tagName.toUpperCase();
      if (tag === "IMG") { await drawImg(el); continue; }
      if (tag === "TABLE") { drawTbl(el); continue; }
      if (tag === "UL" || tag === "OL") { drawList(el, tag === "OL"); continue; }
      if (tag === "BR") { cur.gap(6); continue; }
      if (/^H[1-6]$/.test(tag)) { const t = (el.textContent || "").trim(); if (t) { cur.gap(4); cur.text(t.slice(0, 120), bold, 10, INK); cur.gap(2); } continue; }
      if (el.querySelector && el.querySelector("img, table, ul, ol")) { await walk(Array.from(el.childNodes)); continue; }
      const t = el.textContent || "";
      if (t.trim()) cur.para(t, font, 9, INK);
    }
  };
  await walk(Array.from(parsed.body.childNodes));
}

export { INK as PDF_INK, MUTED as PDF_MUTED };
