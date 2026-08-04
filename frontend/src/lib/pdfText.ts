import type { Color, PDFFont, PDFPage } from "pdf-lib";

// Text helpers shared by every pdf-lib document builder.
//
// pdf-lib's own `maxWidth` option wraps text using the PAGE's default line height (24pt), which
// silently overlaps whatever the caller draws next when it advances by its own smaller step.
// These helpers measure and wrap ourselves, so the caller always knows how much vertical space
// was really used.

/** Split `text` into lines that each fit within `maxW` at `size`. Honours existing newlines. */
export function wrapText(font: PDFFont, text: string, size: number, maxW: number): string[] {
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

/** Truncate to what fits on ONE line at `size`, adding an ellipsis when it had to cut. */
export function fitOneLine(font: PDFFont, text: string, size: number, maxW: number): string {
  const s = String(text || "");
  if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(`${s.slice(0, mid)}…`, size) <= maxW) lo = mid; else hi = mid - 1;
  }
  return lo > 0 ? `${s.slice(0, lo)}…` : "";
}

/**
 * Draw wrapped text starting at (x, y) growing downward. Returns the y BELOW the last line so
 * callers keep a correct cursor. `maxLines` caps the block (extra lines are dropped).
 */
export function drawWrapped(
  page: PDFPage, font: PDFFont, text: string,
  opts: { x: number; y: number; size: number; maxW: number; lineHeight?: number; color?: Color; maxLines?: number }
): number {
  const lh = opts.lineHeight ?? opts.size + 3;
  const lines = wrapText(font, text, opts.size, opts.maxW);
  const capped = opts.maxLines ? lines.slice(0, opts.maxLines) : lines;
  let y = opts.y;
  for (const line of capped) {
    if (line) page.drawText(line, { x: opts.x, y, size: opts.size, font, color: opts.color });
    y -= lh;
  }
  return y;
}

/** How much vertical space `drawWrapped` would consume for the same arguments. */
export function wrappedHeight(font: PDFFont, text: string, size: number, maxW: number, lineHeight?: number): number {
  return wrapText(font, text, size, maxW).length * (lineHeight ?? size + 3);
}
