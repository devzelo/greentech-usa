import { PDFDocument } from "pdf-lib";
import type { ApiProcurementSection, ApiProcurementItem } from "./api";
import { drawProjectInfo, type ProjectPdfInfo } from "./pdfProjectHeader";
import { C, WIDE_LANDSCAPE, marginFor, brandPage, drawTable, loadBrand, stampPageNumbers, titleBlock, type Flow, type TableCol, type TableRow } from "./pdfBrand";
import { BOQ_COLUMNS, boqCellText, colById, type BoqColId, type BoqTextCtx } from "./boqColumns";

/**
 * 2026-10-09 - how the BOQ prints: the columns shown on screen at their on-screen proportions, in
 * one list or by category, in the screen's order. Leave it out for the standard BOQ.
 */
export interface BoqPrintLayout {
  cols: Array<{ id: BoqColId; w: number }>;
  /** One list across the categories (the old Master Log view) instead of a heading per category. */
  flat?: boolean;
  ctx?: BoqTextCtx;
  /** What is shown, when not the whole BOQ ("Electrical, at risk"). */
  scope?: string;
}

// The BOQ on the letterhead, 18" x 24" landscape: items grouped by category with one continuous
// numbering (C5), long text wrapped in full, the table header repeated on every page.
export async function buildBoqPdf(sections: ApiProcurementSection[], items: ApiProcurementItem[], projectInfo?: ProjectPdfInfo, layout?: BoqPrintLayout): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  // CR 246 - 18" x 24" landscape, narrow margins.
  const size = WIDE_LANDSCAPE, X = marginFor(size), W = size.w - X * 2;
  const note = ["Bill of Quantities", projectInfo?.name].filter(Boolean).join("  ·  ");
  const newPage = (): Flow => brandPage(doc, b, size, note);
  let f = newPage();
  const active = items.filter((it) => it.status !== "Cancelled");
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const meta: Array<[string, string]> = [["Items", String(active.length)], ...(layout?.scope ? [["Showing", layout.scope] as [string, string]] : []), ["Date", today]];

  f.y = titleBlock(f.page, b, { x: X, y: f.y, w: W, eyebrow: "Bill of quantities (BOQ)", title: projectInfo?.name || "Bill of Quantities", meta });
  f.y = drawProjectInfo(f.page, b.regular, projectInfo, X, f.y, W) - 6; // H1 project-info block

  if (!active.length) {
    f.page.drawText("No BOQ items yet.", { x: X, y: f.y, size: 10, font: b.regular, color: C.s500 });
  } else {
    const picked = layout?.cols.length ? layout.cols : BOQ_COLUMNS.filter((c) => c.on).map((c) => ({ id: c.id, w: c.w }));
    const total = picked.reduce((s, c) => s + c.w, 0) || 1;
    // The page's width shared out as the screen shares it.
    const cols: TableCol[] = picked.map((c) => {
      const def = colById(c.id);
      // Text wraps; the figures (Qty, Lead) stay on one line, right-aligned.
      return { label: def.label, w: (c.w / total) * W, wrap: !def.align && c.id !== "no" && c.id !== "rev", align: def.align };
    });
    // C5 - one number per item across the whole BOQ, as on screen.
    const known = new Set(sections.map((s) => s._id));
    const numbers: Record<string, number> = {};
    { let k = 0; for (const s of sections) for (const it of active) if (it.sectionId === s._id) numbers[it._id] = ++k; for (const it of active) if (!known.has(it.sectionId)) numbers[it._id] = ++k; }
    const ctx: BoqTextCtx = layout?.ctx || {
      sectionName: (sid) => sections.find((s) => s._id === sid)?.name || "No category",
      numberOf: (iid) => numbers[iid],
      submittalOf: () => undefined,
    };
    const rows: TableRow[] = [];
    const push = (its: ApiProcurementItem[]) => its.forEach((it) => rows.push({ cells: picked.map((c) => boqCellText(c.id, it, ctx)) }));
    if (layout?.flat) push(active);
    else {
      for (const s of sections) {
        const its = active.filter((it) => it.sectionId === s._id);
        if (!its.length) continue;
        rows.push({ group: `${s.name || "Category"}  ·  ${its.length} item${its.length === 1 ? "" : "s"}` });
        push(its);
      }
      const other = active.filter((it) => !known.has(it.sectionId));
      if (other.length) { rows.push({ group: "No category" }); push(other); }
    }
    // 2026-10-08 - descriptions and specs print in full, however many lines.
    drawTable(b, f, X, cols, rows, { newPage, maxLines: 60 });
  }

  stampPageNumbers(doc, b);
  const out = await doc.save();
  return new Blob([out], { type: "application/pdf" });
}
