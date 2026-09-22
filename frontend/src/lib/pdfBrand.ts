import {
  PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, type Color,
  pushGraphicsState, popGraphicsState, rectangle, clip, endPath, setCharacterSpacing,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { BRAND, BRAND_ASSETS, abs } from "./brandTokens";
import { drawWrapped, fitOneLine, wrapText } from "./pdfText";

/**
 * The GreenTech document brand for pdf-lib, the twin of the react-pdf kit (components/pdf/brand):
 * the client-approved letterhead band on every page, the gradient rule with the page number at the
 * bottom, Inter and Outfit, and the same colours, eyebrow, title, heading and table styles. The
 * invoice, PO, RFQ, BOQ, submittal and closeout packages and the procurement reports draw with it,
 * so they read as the same family as the proposals and agreements.
 */

export const LETTER = { w: 612, h: 792 } as const;              // 8.5" x 11"
export const TABLOID_LANDSCAPE = { w: 1224, h: 792 } as const;  // 11" x 17", landscape
/**
 * CR 246 - "don't use 11 by 17, it's still small": every landscape document (the schedule, the
 * master log, the BOQ, submittals) is 18" x 24" landscape, with margins as narrow as possible.
 */
export const WIDE_LANDSCAPE = { w: 1728, h: 1296 } as const;    // 24" x 18", landscape
export const NARROW = 30;                                         // the side margin on wide sheets
/** The side margin for a page: narrow on the wide landscape sheets, the letterhead gutter otherwise. */
export const marginFor = (size: { w: number }) => (size.w >= 1200 ? NARROW : GUTTER);
export type PageSize = { w: number; h: number };
export const GUTTER = 72;                                         // lines up with the logo in the band
export const BAND_H = (LETTER.w * 220) / 3264;                    // the letterhead band, ~41 pt
const FOOTER_H = (LETTER.w * 64) / 3264;                          // the gradient rule art, ~12 pt
export const BOTTOM = 56;                                         // content stays above the footer

const channels = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
const hex = (h: string) => rgb(...channels(h));
/** The brand palette as pdf-lib colours. */
export const C = Object.fromEntries(Object.entries(BRAND).map(([k, v]) => [k, hex(v)])) as Record<keyof typeof BRAND, Color>;

// Fonts and letterhead art, fetched once per session and embedded into each document.
const bytesCache = new Map<string, Promise<ArrayBuffer | null>>();
function fetchBytes(url: string): Promise<ArrayBuffer | null> {
  let p = bytesCache.get(url);
  if (!p) {
    p = fetch(abs(url)).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    p.then((v) => { if (!v) bytesCache.delete(url); });   // a failed fetch is retried next time
    bytesCache.set(url, p);
  }
  return p;
}

export interface Brand {
  regular: PDFFont;   // Inter 400
  bold: PDFFont;      // Inter 700
  display: PDFFont;   // Outfit 700 (titles)
  header: PDFImage | null;
  footer: PDFImage | null;
}

/** Embed the brand fonts and letterhead art into `doc`. Falls back to Helvetica if a font cannot load. */
export async function loadBrand(doc: PDFDocument): Promise<Brand> {
  doc.registerFontkit(fontkit);
  const f = BRAND_ASSETS.pdfFonts;
  const [r, bd, d, hdr, ftr] = await Promise.all([
    fetchBytes(f.regular), fetchBytes(f.bold), fetchBytes(f.display),
    fetchBytes(BRAND_ASSETS.header), fetchBytes(BRAND_ASSETS.footer),
  ]);
  // Embedded whole (subset: false): the files are already trimmed to Latin, and pdf-lib's own
  // subsetting drops most of Inter's glyphs.
  const font = async (bytes: ArrayBuffer | null, fallback: StandardFonts) => {
    if (bytes) { try { return await doc.embedFont(bytes, { subset: false }); } catch { /* fall back below */ } }
    return doc.embedFont(fallback);
  };
  const png = async (bytes: ArrayBuffer | null) => { if (!bytes) return null; try { return await doc.embedPng(bytes); } catch { return null; } };
  return {
    regular: await font(r, StandardFonts.Helvetica), bold: await font(bd, StandardFonts.HelveticaBold),
    display: await font(d, StandardFonts.HelveticaBold), header: await png(hdr), footer: await png(ftr),
  };
}

function clipped(page: PDFPage, x: number, y: number, w: number, h: number, draw: () => void) {
  page.pushOperators(pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath());
  draw();
  page.pushOperators(popGraphicsState());
}

/** The letterhead band across the top of the page. */
export function drawBand(page: PDFPage, b: Brand) {
  const { width: W, height: H } = page.getSize();
  const y = H - BAND_H;
  const art = LETTER.w;
  if (!b.header) { page.drawRectangle({ x: 0, y, width: W, height: BAND_H, color: C.slate }); return; }
  const hdr = b.header;
  if (W <= art + 0.5) { page.drawImage(hdr, { x: 0, y, width: W, height: BAND_H }); return; }
  // A wider page (11" x 17" landscape): the logo end and the wave end stay at letter scale and the
  // plain middle of the art stretches between them, so the logo is never enlarged or repeated.
  const L = 0.5, R = 0.78;
  const midX = art * L, waveW = art * (1 - R), midW = W - midX - waveW, full = midW / (R - L);
  // Slate underneath and a little overlap between the pieces, so no hairline seam shows where they meet.
  page.drawRectangle({ x: 0, y, width: W, height: BAND_H, color: C.slate });
  clipped(page, 0, y, midX + 1, BAND_H, () => page.drawImage(hdr, { x: 0, y, width: art, height: BAND_H }));
  clipped(page, midX - 1, y, midW + 2, BAND_H, () => page.drawImage(hdr, { x: midX - L * full, y, width: full, height: BAND_H }));
  clipped(page, W - waveW - 1, y, waveW + 1, BAND_H, () => page.drawImage(hdr, { x: W - art, y, width: art, height: BAND_H }));
}

/** The gradient rule at the bottom, with an optional reference note on the left. */
export function drawFooter(page: PDFPage, b: Brand, note?: string) {
  const { width: W } = page.getSize();
  if (b.footer) page.drawImage(b.footer, { x: 0, y: 0, width: W, height: FOOTER_H });
  else page.drawRectangle({ x: 0, y: 4, width: W, height: 2, color: C.emerald });
  if (note) page.drawText(fitOneLine(b.regular, note, 7.5, W - GUTTER * 2 - 90), { x: GUTTER, y: 20, size: 7.5, font: b.regular, color: C.s500 });
}

export interface Flow { page: PDFPage; y: number }

/** A new page with the letterhead band and footer; `y` is where the content starts. */
export function brandPage(doc: PDFDocument, b: Brand, size: PageSize = LETTER, note?: string): Flow {
  const page = doc.addPage([size.w, size.h]);
  drawBand(page, b);
  drawFooter(page, b, note);
  return { page, y: size.h - BAND_H - 36 };
}

/**
 * CR 247 - "Fit to one page", like Excel's print option: a document that runs over several pages
 * is put on one sheet, smaller but whole. Each page's content (below the letterhead band, above the
 * footer; the first page keeps its band) is stacked in order and scaled to the sheet, then one
 * footer is drawn. A one-page document comes back unchanged.
 */
export async function fitToOnePage(input: Blob, note?: string): Promise<Blob> {
  const src = await PDFDocument.load(await input.arrayBuffer());
  const pages = src.getPages();
  if (pages.length <= 1) return input;
  const out = await PDFDocument.create();
  const b = await loadBrand(out);
  const { width: pw, height: ph } = pages[0].getSize();
  const bottom = BOTTOM - 10;
  const topOf = (i: number) => (i === 0 ? ph : ph - BAND_H - 20);
  const heights = pages.map((_, i) => topOf(i) - bottom);
  const strips = await Promise.all(pages.map((p, i) => out.embedPage(p, { left: 0, bottom, right: pw, top: topOf(i) })));
  // CR 275 (2026-09-22): stack the pages straight down, one column, in the order they were
  // written. Never side by side: the client reads a schedule top to bottom, and a sheet that grows
  // sideways is unreadable. The content only shrinks as far as it must to reach the footer.
  const sheet = out.addPage([pw, ph]);
  const room = ph - BOTTOM;                                    // keep the footer clear
  const gap = 12;
  const total = heights.reduce((s, h) => s + h, 0) + gap * (pages.length - 1);
  const scale = Math.min(1, room / total);
  const colW = pw * scale;
  const x0 = (pw - colW) / 2;
  let top = ph;
  strips.forEach((strip, i) => {
    const h = heights[i] * scale;
    sheet.drawPage(strip, { x: x0, y: top - h, width: colW, height: h });
    top -= h + gap * scale;
  });
  drawFooter(sheet, b, [note, `${pages.length} pages stacked on one sheet at ${Math.round(scale * 100)}%`].filter(Boolean).join("  ·  "));
  return new Blob([new Uint8Array(await out.save())], { type: "application/pdf" });
}

/** "Page i of N" at the bottom right of every page, except the indices in `skip` (as-is uploads). */
export function stampPageNumbers(doc: PDFDocument, b: Brand, skip: Set<number> = new Set()) {
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    if (skip.has(i)) return;
    const t = `Page ${i + 1} of ${pages.length}`;
    p.drawText(t, { x: p.getWidth() - GUTTER - b.regular.widthOfTextAtSize(t, 7.5), y: 20, size: 7.5, font: b.regular, color: C.s500 });
  });
}

// ── Type ────────────────────────────────────────────────────────────────────────────────────────

/** Letter-spaced text (pdf-lib has no tracking option, so the PDF character spacing is set directly). */
export function tracked(page: PDFPage, text: string, o: { x: number; y: number; size: number; font: PDFFont; color: Color; spacing: number }) {
  page.pushOperators(pushGraphicsState(), setCharacterSpacing(o.spacing));
  page.drawText(text, { x: o.x, y: o.y, size: o.size, font: o.font, color: o.color });
  page.pushOperators(popGraphicsState());
}
export const trackedWidth = (font: PDFFont, text: string, size: number, spacing: number) => font.widthOfTextAtSize(text, size) + spacing * text.length;

/** Small spaced caps with a lead-in dash, e.g. "— PURCHASE ORDER". */
export function eyebrow(page: PDFPage, b: Brand, text: string, x: number, y: number, color: Color = C.emerald) {
  page.drawRectangle({ x, y: y + 2, width: 22, height: 3, color });
  tracked(page, text.toUpperCase(), { x: x + 30, y, size: 8.5, font: b.bold, color, spacing: 2.2 });
}

/** The emerald-to-blue bar, the brand's signature accent. */
export function gradBar(page: PDFPage, x: number, y: number, w: number, h = 3) {
  const [a, z] = [channels(BRAND.emerald), channels(BRAND.blue)];
  const steps = Math.max(12, Math.round(w / 3)), sw = w / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    page.drawRectangle({ x: x + i * sw, y, width: sw + 0.4, height: h, color: rgb(a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t, a[2] + (z[2] - a[2]) * t) });
  }
}

/** A field label: small spaced caps. */
export function label(page: PDFPage, b: Brand, text: string, x: number, y: number, color: Color = C.s500) {
  tracked(page, text.toUpperCase(), { x, y, size: 6.8, font: b.bold, color, spacing: 0.8 });
}

/**
 * The document's title block: eyebrow, the title in Outfit, the gradient bar, and label/value pairs
 * on the right (reference number, date). Returns the y below it.
 */
export function titleBlock(page: PDFPage, b: Brand, o: { x: number; y: number; w: number; eyebrow: string; title: string; meta?: Array<[string, string]> }): number {
  const meta = (o.meta || []).filter(([, v]) => v);
  const metaW = meta.length ? Math.min(190, Math.max(...meta.map(([k, v]) => Math.max(trackedWidth(b.bold, k.toUpperCase(), 6.8, 0.8), b.bold.widthOfTextAtSize(v, 10.5)))) + 4) : 0;
  eyebrow(page, b, o.eyebrow, o.x, o.y);
  let y = o.y - 30;
  const lines = wrapText(b.display, o.title || "", 22, o.w - metaW - 16).slice(0, 3);
  for (const l of lines) { page.drawText(l, { x: o.x, y, size: 22, font: b.display, color: C.slate }); y -= 26; }
  y += 12;
  gradBar(page, o.x, y, 120, 3);
  y -= 18;
  // Right-hand meta, top-aligned with the eyebrow.
  let my = o.y;
  const right = o.x + o.w;
  for (const [k, v] of meta) {
    const kk = k.toUpperCase();
    label(page, b, kk, right - trackedWidth(b.bold, kk, 6.8, 0.8), my);
    const vv = fitOneLine(b.bold, v, 10.5, 190);
    page.drawText(vv, { x: right - b.bold.widthOfTextAtSize(vv, 10.5), y: my - 13, size: 10.5, font: b.bold, color: C.slate });
    my -= 30;
  }
  // Clear of both the title and the last label/value pair, whichever runs lower.
  return Math.min(y, my - 2);
}

/** A section heading with the emerald rule under it. Returns the y below it. */
export function sectionHeading(page: PDFPage, b: Brand, text: string, x: number, y: number, w: number): number {
  tracked(page, text.toUpperCase(), { x, y, size: 9.5, font: b.bold, color: C.slate, spacing: 0.4 });
  page.drawRectangle({ x, y: y - 6, width: w, height: 1.2, color: C.emerald });
  return y - 20;
}

/** A party / address block: label, then the name in bold and its lines. Returns the y below it. */
export function partyBlock(page: PDFPage, b: Brand, x: number, y: number, w: number, heading: string, lines: string[]): number {
  label(page, b, heading, x, y);
  y -= 14;
  lines.filter(Boolean).forEach((l, i) => {
    y = drawWrapped(page, i === 0 ? b.bold : b.regular, String(l), { x, y, size: i === 0 ? 10 : 8.8, maxW: w, lineHeight: 13, color: i === 0 ? C.slate : C.s700, maxLines: 3 });
  });
  return y;
}

/** A tinted card with the emerald edge, holding a label and a value (key figures). */
export function kpiCard(page: PDFPage, b: Brand, x: number, y: number, w: number, h: number, k: string, v: string, tone: Color = C.slate) {
  page.drawRectangle({ x, y: y - h, width: w, height: h, color: C.mist });
  page.drawRectangle({ x, y: y - h, width: 3, height: h, color: C.emerald });
  label(page, b, k, x + 12, y - 16);
  page.drawText(fitOneLine(b.bold, v, 12, w - 20), { x: x + 12, y: y - 33, size: 12, font: b.bold, color: tone });
}

/** Flow a block of text across pages. Returns where it ended. */
export function flowText(flow: Flow, text: string, o: { x: number; w: number; font: PDFFont; size: number; lineHeight: number; color: Color; newPage: () => Flow; bottom?: number }): Flow {
  let { page, y } = flow;
  for (const line of wrapText(o.font, text, o.size, o.w)) {
    if (y < (o.bottom ?? BOTTOM)) ({ page, y } = o.newPage());
    if (line) page.drawText(line, { x: o.x, y, size: o.size, font: o.font, color: o.color });
    y -= o.lineHeight;
  }
  return { page, y };
}

// ── Tables ──────────────────────────────────────────────────────────────────────────────────────

export interface TableCol {
  label: string; w: number; align?: "left" | "right"; wrap?: boolean;
  /** CR 273 - columns under a shared heading (Planned: Start / End), as the screen shows them. */
  band?: string;
  /** A tint behind this column's cells, e.g. the sky wash the screen puts behind Actual. */
  tint?: Color;
}
export interface TableRow {
  cells?: string[]; group?: string; bold?: boolean; color?: Color; fill?: Color;
  /** CR 273 - per-cell text colour (a status chip, a late date in red). */
  cellColors?: Array<Color | undefined>;
  /** CR 273 - the little progress bar the screen draws beside the percentage. */
  bar?: { col: number; pct: number; color: Color };
}

/**
 * A branded table: slate header row, zebra rows, hairlines. Wrapping columns grow the row; the
 * table continues on a new page (header repeated) when it reaches the footer. Returns where it ended.
 */
export function drawTable(b: Brand, flow: Flow, x: number, cols: TableCol[], rows: TableRow[], opts: { newPage: () => Flow; bottom?: number; size?: number; maxLines?: number }): Flow {
  const size = opts.size ?? 8, LH = size + 2.6, maxLines = opts.maxLines ?? 8, bottom = opts.bottom ?? BOTTOM;
  const W = cols.reduce((s, c) => s + c.w, 0);
  let { page, y } = flow;
  // CR 273 - a second header strip when columns share a heading (Planned, Actual).
  const bands = cols.some((c) => c.band);
  const headH = bands ? 29 : 18;
  const head = () => {
    page.drawRectangle({ x, y: y - headH, width: W, height: headH, color: C.slate });
    if (bands) {
      let cx = x, i = 0;
      while (i < cols.length) {
        const g = cols[i].band || "";
        let span = cols[i].w, j = i + 1;
        while (j < cols.length && (cols[j].band || "") === g && g) { span += cols[j].w; j++; }
        if (g) {
          const t = g.toUpperCase();
          const tw = trackedWidth(b.bold, t, 6.2, 0.5);
          tracked(page, t, { x: cx + Math.max(6, (span - tw) / 2), y: y - 8.6, size: 6.2, font: b.bold, color: C.white, spacing: 0.5 });
          page.drawLine({ start: { x: cx + span, y: y - 11.5 }, end: { x: cx + span, y: y - headH }, thickness: 0.4, color: C.white });
        }
        cx += span; i = j;
      }
      page.drawLine({ start: { x, y: y - 11.5 }, end: { x: x + W, y: y - 11.5 }, thickness: 0.4, color: C.white });
    }
    let cx = x;
    for (const c of cols) {
      const t = c.label.toUpperCase();
      const tw = trackedWidth(b.bold, t, 6.6, 0.5);
      tracked(page, t, { x: c.align === "right" ? cx + c.w - 6 - tw : cx + 6, y: y - headH + 6.2, size: 6.6, font: b.bold, color: C.white, spacing: 0.5 });
      cx += c.w;
    }
    y -= headH;
  };
  // A header printed at the very bottom of a page would sit on the footer, so start a fresh page
  // unless the header and one row still fit.
  if (y - headH - (size + 12) < bottom) ({ page, y } = opts.newPage());
  head();
  let zebra = 0;
  for (const r of rows) {
    if (r.group !== undefined) {
      const h = 19;
      if (y - h - 22 < bottom) { ({ page, y } = opts.newPage()); head(); }
      page.drawRectangle({ x, y: y - h, width: W, height: h, color: C.mint });
      page.drawRectangle({ x, y: y - h, width: 3, height: h, color: C.emerald });
      page.drawText(fitOneLine(b.bold, r.group, 8.5, W - 16), { x: x + 10, y: y - 12.6, size: 8.5, font: b.bold, color: C.slate });
      y -= h;
      zebra = 0;
      continue;
    }
    const cells = r.cells || [];
    const font = r.bold ? b.bold : b.regular;
    const lines = cols.map((c, ci) => (c.wrap ? Math.min(maxLines, Math.max(1, wrapText(font, cells[ci] || "", size, c.w - 12).length)) : 1));
    const h = Math.max(...lines) * LH + 9 + (r.bar ? 4 : 0);
    if (y - h < bottom) { ({ page, y } = opts.newPage()); head(); }
    const fill = r.fill ?? (zebra % 2 === 1 ? C.mist : undefined);
    if (fill) page.drawRectangle({ x, y: y - h, width: W, height: h, color: fill });
    // CR 273 - the tinted columns (the screen's sky wash behind Actual) go over the zebra.
    let tx = x;
    for (const c of cols) {
      if (c.tint) page.drawRectangle({ x: tx, y: y - h, width: c.w, height: h, color: c.tint });
      tx += c.w;
    }
    const color = r.color ?? C.s700;
    let cx = x;
    cols.forEach((c, ci) => {
      const t = cells[ci] || "";
      const base = y - 4.5 - size;
      const cellColor = r.cellColors?.[ci] ?? color;
      if (c.wrap) drawWrapped(page, font, t, { x: cx + 6, y: base, size, maxW: c.w - 12, lineHeight: LH, color: cellColor, maxLines });
      else {
        const s = fitOneLine(font, t, size, c.w - 12);
        page.drawText(s, { x: c.align === "right" ? cx + c.w - 6 - font.widthOfTextAtSize(s, size) : cx + 6, y: base, size, font, color: cellColor });
      }
      // the percentage's little bar, drawn under its number
      if (r.bar && r.bar.col === ci) {
        const bw = Math.min(c.w - 12, 34), bx = cx + 6, by = y - h + 4.5;
        page.drawRectangle({ x: bx, y: by, width: bw, height: 2.6, color: C.border });
        if (r.bar.pct > 0) page.drawRectangle({ x: bx, y: by, width: (bw * Math.min(100, r.bar.pct)) / 100, height: 2.6, color: r.bar.color });
      }
      cx += c.w;
    });
    y -= h;
    page.drawLine({ start: { x, y }, end: { x: x + W, y }, thickness: 0.5, color: C.border });
    zebra++;
  }
  return { page, y };
}

// ── Separator and picture pages ─────────────────────────────────────────────────────────────────

/** A branded separator page that announces what follows (an attachment, a component). */
export function dividerPage(doc: PDFDocument, b: Brand, size: PageSize, title: string, subtitle?: string, kicker = "Attachment"): PDFPage {
  const { page } = brandPage(doc, b, size);
  const W = size.w, H = size.h, maxW = W - GUTTER * 2;
  const lines = wrapText(b.display, title || "", 26, maxW).slice(0, 3);
  let y = H / 2 + (lines.length * 30) / 2;
  const k = kicker.toUpperCase();
  const kw = trackedWidth(b.bold, k, 8.5, 2.2) + 30;
  eyebrow(page, b, k, (W - kw) / 2, y + 30);
  for (const l of lines) { page.drawText(l, { x: (W - b.display.widthOfTextAtSize(l, 26)) / 2, y, size: 26, font: b.display, color: C.slate }); y -= 30; }
  gradBar(page, (W - 120) / 2, y + 12, 120, 3);
  if (subtitle) {
    const s = fitOneLine(b.regular, subtitle, 10, maxW);
    page.drawText(s, { x: (W - b.regular.widthOfTextAtSize(s, 10)) / 2, y: y - 10, size: 10, font: b.regular, color: C.s500 });
  }
  return page;
}

/** An uploaded picture as its own page, fitted inside the margins. */
export function imagePage(doc: PDFDocument, img: PDFImage, size: PageSize): PDFPage {
  const page = doc.addPage([size.w, size.h]);
  const m = 48;
  const scale = Math.min((size.w - m * 2) / img.width, (size.h - m * 2) / img.height, 1);
  const w = img.width * scale, h = img.height * scale;
  page.drawImage(img, { x: (size.w - w) / 2, y: (size.h - h) / 2, width: w, height: h });
  return page;
}
