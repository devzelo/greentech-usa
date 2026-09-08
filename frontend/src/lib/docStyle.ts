import { rgb } from "pdf-lib";

/**
 * CR-P (41) — the one place the look of a GreenTech document is defined.
 *
 * "This table is good but the colour is not good. We need to make a default colour system and the
 * title system. So just insert it and use it everywhere, so whoever sees this document, they know
 * this is from GreenTech."
 *
 * The problem being solved is that the same document existed twice: once as HTML inside the
 * rich-text editor, and again as pdf-lib drawing calls. Each had its own hard-coded greys and
 * sizes, so a table looked one way while being written and another way once printed. Both sides
 * now read these tokens, so there is a single definition and the two agree by construction.
 *
 * Colours are declared once as hex and derived for pdf-lib, rather than being written twice.
 */

const hex = (h: string): [number, number, number] => {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
/** A hex colour as a pdf-lib colour. */
export const pdfColor = (h: string) => { const [r, g, b] = hex(h); return rgb(r / 255, g / 255, b / 255); };

/** Brand palette. Every generated document draws from this and nothing else. */
export const DOC_COLORS = {
  /** GreenTech green: headings, rules, table header text. */
  brand: "#10b981",
  /** Body text. */
  ink: "#0f172a",
  /** Secondary text: labels, meta lines, captions. */
  muted: "#64748b",
  /** Hairlines and table borders. */
  line: "#cbd5e1",
  /** Table header fill: a tint of the brand, so a table reads as ours at a glance. */
  headBg: "#ecfdf5",
  /** Zebra fill for alternate table rows. */
  rowAlt: "#f8fafc",
} as const;

/**
 * The type scale, in points. The PDF uses these directly; the editor uses the px equivalents.
 * One scale for every document, so a heading is the same weight in an agreement and a proposal.
 */
export const DOC_SIZES = {
  /** The document's name, e.g. "TEAMING AGREEMENT". */
  title: 16,
  /** What the document is for, printed under the title. */
  subtitle: 13,
  /** A section heading inside the body. */
  heading: 11,
  /** A sub-heading inside a section. */
  subheading: 10,
  /** Body copy. */
  body: 9,
  /** Meta lines, table captions, signature labels. */
  small: 8.5,
} as const;

export const PDF_COLORS = {
  brand: pdfColor(DOC_COLORS.brand),
  ink: pdfColor(DOC_COLORS.ink),
  muted: pdfColor(DOC_COLORS.muted),
  line: pdfColor(DOC_COLORS.line),
  headBg: pdfColor(DOC_COLORS.headBg),
  rowAlt: pdfColor(DOC_COLORS.rowAlt),
};

/** Table styling for the rich-text editor, so what is typed matches what is printed. */
export const TABLE_CELL_CSS =
  `border:1px solid ${DOC_COLORS.line};padding:6px;min-width:60px;`;
export const TABLE_HEAD_CSS =
  `${TABLE_CELL_CSS}background:${DOC_COLORS.headBg};color:${DOC_COLORS.ink};font-weight:700;text-align:left;`;
/**
 * CR-P (40) — a table's title. Rendered as the table's own <caption> so it can never drift away
 * from the table it names: the complaint was "this is too far from the table".
 */
export const TABLE_CAPTION_CSS =
  `caption-side:top;text-align:left;font-weight:700;color:${DOC_COLORS.ink};padding:0 0 3px 0;`;
