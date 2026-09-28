import { PDFDocument } from "pdf-lib";
import { C, GUTTER, LETTER, brandPage, drawTable, kpiCard, loadBrand, sectionHeading, stampPageNumbers, titleBlock, type Flow, type TableRow } from "./pdfBrand";

/**
 * CR 267 (2026-09-22): a full report for one profile, company or person. The quick report gives the
 * headlines; this prints everything the platform holds for them, section by section: the profile
 * itself, the projects they are on, and every agreement, proposal, BOQ, RFQ, quote, purchase order,
 * invoice, submittal, shipment, expense and reminder that names them.
 *
 * US Letter, portrait, on the letterhead, so it prints and emails like the other documents.
 */

const PAGE = LETTER;
const X = GUTTER;
const W = PAGE.w - GUTTER * 2;

export interface ProfileReportSection {
  title: string;
  /** Column headers. */
  columns: Array<{ label: string; w: number; wrap?: boolean; align?: "right" }>;
  rows: string[][];
  /** Shown instead of the table when there is nothing. */
  empty?: string;
}

export interface ProfileReportInput {
  kind: "company" | "person";
  name: string;
  subtitle?: string;                    // category, job title...
  fields: Array<[string, string]>;      // the profile's own details
  stats: Array<[string, string]>;       // the figures across the top
  sections: ProfileReportSection[];
  note?: string;                        // footer note
  /** CR 307 - the company's logo as a PNG data URL, printed beside its name. */
  logo?: string;
}

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

export async function buildProfileReportPdf(o: ProfileReportInput): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const note = o.note || `${o.name} · profile report`;
  const newPage = (): Flow => brandPage(doc, b, PAGE, note);
  let f = newPage();

  // CR 307 (2026-09-25): the logo goes beside the name, in a box it keeps its proportions in.
  let tx = X;
  let logoBottom = f.y;
  if (o.logo) {
    try {
      const png = await doc.embedPng(o.logo);
      const box = 64;
      const k = Math.min(box / png.width, box / png.height);
      const w = png.width * k, h = png.height * k;
      f.page.drawImage(png, { x: X + (box - w) / 2, y: f.y + 6 - box + (box - h) / 2, width: w, height: h });
      tx = X + box + 14;
      logoBottom = f.y + 6 - box - 8;
    } catch { /* an unreadable logo leaves the report as it was */ }
  }
  f.y = titleBlock(f.page, b, {
    x: tx, y: f.y, w: W - (tx - X),
    eyebrow: o.kind === "company" ? "Directory · company report" : "Team · person report",
    title: o.name,
    meta: [
      ...(o.subtitle ? ([["Profile", o.subtitle]] as Array<[string, string]>) : []),
      ["Generated", new Date().toLocaleDateString(undefined, { dateStyle: "medium" })],
    ],
  });
  f.y = Math.min(f.y, logoBottom);
  f.y -= 8;

  // ── The figures across the top ──
  if (o.stats.length) {
    const per = Math.min(6, o.stats.length);
    const cw = (W - (per - 1) * 8) / per;
    o.stats.slice(0, per).forEach(([k, v], i) => kpiCard(f.page, b, X + i * (cw + 8), f.y, cw, 44, k, v, C.slate));
    f.y -= 62;
  }

  // ── The profile's own details ──
  if (o.fields.length) {
    f.y = sectionHeading(f.page, b, o.kind === "company" ? "Company details" : "Personal details", X, f.y, W);
    const rows: TableRow[] = o.fields.map(([k, v]) => ({ cells: [clean(k), clean(v) || "-"] }));
    f = drawTable(b, f, X, [{ label: "Field", w: 150 }, { label: "Value", w: W - 150, wrap: true }], rows, { newPage, size: 8.5, maxLines: 4 });
    f.y -= 10;
  }

  // ── Everything that names this profile ──
  for (const s of o.sections) {
    f.y = sectionHeading(f.page, b, `${s.title}${s.rows.length ? `  (${s.rows.length})` : ""}`, X, f.y, W);
    const rows: TableRow[] = s.rows.length
      ? s.rows.map((cells) => ({ cells: cells.map(clean) }))
      : [{ cells: [s.empty || "Nothing recorded.", ...s.columns.slice(1).map(() => "")] }];
    f = drawTable(b, f, X, s.columns, rows, { newPage, size: 8, maxLines: 3 });
    f.y -= 10;
  }

  stampPageNumbers(doc, b);
  return new Blob([await doc.save()], { type: "application/pdf" });
}
