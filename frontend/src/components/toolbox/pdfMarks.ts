import type { PDFDocument, PDFPage } from "pdf-lib";
import { drawShapes, type Pt, type Shape } from "./annotate";

/**
 * CR 303 (2026-09-25): marks drawn on a PDF page (text, comments, highlights, drawings) and how
 * they get onto the page.
 *
 * Marks are kept in PDF points, in the page's orientation as it was shown when they were drawn
 * (`markRotate`, the page's total rotation at that time). They belong to the page's content, so
 * turning the page later turns them with it. When the PDF is built they are drawn into a clear
 * image and laid over the page, so the page's own text stays text: selectable and searchable.
 */

const norm = (deg: number) => ((deg % 360) + 360) % 360;
/** Overlay pixels per PDF point: sharp enough to print. */
export const MARK_SCALE = 3;

/** The marks alone, on a clear canvas `w` x `h` points, at `k` pixels per point. */
export function markCanvas(shapes: Shape[], w: number, h: number, k = MARK_SCALE): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w * k));
  c.height = Math.max(1, Math.ceil(h * k));
  drawShapes(c.getContext("2d")!, shapes, k);
  return c;
}

/** A canvas turned clockwise by a quarter turn or more. */
export function rotateCanvas(c: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  const r = norm(deg);
  if (!r) return c;
  const out = document.createElement("canvas");
  const quarter = r % 180 !== 0;
  out.width = quarter ? c.height : c.width;
  out.height = quarter ? c.width : c.height;
  const ctx = out.getContext("2d")!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((r * Math.PI) / 180);
  ctx.drawImage(c, -c.width / 2, -c.height / 2);
  return out;
}

/**
 * Marks drawn on a page shown `w` x `h` (in points), moved to how the page reads after turning it
 * clockwise by `deg`. Text stays upright; only where it sits moves.
 */
export function turnShapes(shapes: Shape[], deg: number, w: number, h: number): Shape[] {
  const r = norm(deg);
  if (!r) return shapes;
  const pt = ([x, y]: Pt): Pt => (r === 90 ? [h - y, x] : r === 180 ? [w - x, h - y] : [y, w - x]);
  return shapes.map((s) => {
    switch (s.kind) {
      case "pen": case "marker": return { ...s, points: s.points.map(pt) };
      case "text": case "note": return { ...s, at: pt(s.at) };
      default: return { ...s, a: pt(s.a), b: pt(s.b) };
    }
  });
}

/**
 * Lay a page's marks over it. `box` is the page's visible box (crop box) before any rotation;
 * `r0` is the rotation the marks were drawn at. The overlay is placed so that, whatever rotation
 * the page ends up with, the marks stay on the content they were drawn over.
 */
export async function stampMarks(out: PDFDocument, page: PDFPage, shapes: Shape[], r0: number, box: { x: number; y: number; width: number; height: number }) {
  if (!shapes.length) return;
  const { degrees } = await import("pdf-lib");
  const r = norm(r0);
  const W = box.width, H = box.height;
  const quarter = r % 180 !== 0;
  const Dw = quarter ? H : W, Dh = quarter ? W : H;
  const canvas = markCanvas(shapes, Dw, Dh);
  const bytes = await new Promise<Uint8Array>((resolve, reject) => canvas.toBlob((b) => {
    if (!b) { reject(new Error("Could not draw the marks.")); return; }
    b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
  }, "image/png"));
  const png = await out.embedPng(bytes);
  // Where the overlay's bottom-left corner lands on the unrotated page, for each rotation.
  const at = r === 90 ? { x: W, y: 0 } : r === 180 ? { x: W, y: H } : r === 270 ? { x: 0, y: H } : { x: 0, y: 0 };
  page.drawImage(png, { x: box.x + at.x, y: box.y + at.y, width: Dw, height: Dh, rotate: degrees(r) });
}
