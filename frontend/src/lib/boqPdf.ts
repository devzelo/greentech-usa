import { PDFDocument } from "pdf-lib";
import type { ApiProcurementSection, ApiProcurementItem } from "./api";
import { drawProjectInfo, type ProjectPdfInfo } from "./pdfProjectHeader";
import { C, WIDE_LANDSCAPE, marginFor, brandPage, drawTable, loadBrand, stampPageNumbers, titleBlock, type Flow, type TableCol, type TableRow } from "./pdfBrand";

// order-by date = need-on-site − lead-time(days)
function orderByDate(needOnSite: string, leadDays: string): string {
  if (!needOnSite) return "";
  const days = parseInt(String(leadDays).replace(/[^0-9]/g, ""), 10);
  const d = new Date(needOnSite);
  if (isNaN(d.getTime())) return "";
  if (isFinite(days) && days) d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// The BOQ on the letterhead, 11" x 17" landscape (client request): items grouped by category with
// one continuous numbering (C5), long text wrapped in full, the table header repeated on every page.
export async function buildBoqPdf(sections: ApiProcurementSection[], items: ApiProcurementItem[], projectInfo?: ProjectPdfInfo): Promise<Blob> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  // CR 246 - 18" x 24" landscape, narrow margins.
  const size = WIDE_LANDSCAPE, X = marginFor(size), W = size.w - X * 2;
  const note = ["Bill of Quantities", projectInfo?.name].filter(Boolean).join("  ·  ");
  const newPage = (): Flow => brandPage(doc, b, size, note);
  let f = newPage();
  const active = items.filter((it) => it.status !== "Cancelled");
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  f.y = titleBlock(f.page, b, { x: X, y: f.y, w: W, eyebrow: "Bill of quantities (BOQ)", title: projectInfo?.name || "Bill of Quantities", meta: [["Items", String(active.length)], ["Date", today]] });
  f.y = drawProjectInfo(f.page, b.regular, projectInfo, X, f.y, W) - 6; // H1 project-info block

  if (!active.length) {
    f.page.drawText("No BOQ items yet.", { x: X, y: f.y, size: 10, font: b.regular, color: C.s500 });
  } else {
    // The extra width of the 17" page goes mostly to Description and Spec (CR-P-15).
    const cols: TableCol[] = [
      { label: "#", w: 30 }, { label: "Description", w: 380, wrap: true }, { label: "Brand", w: 110, wrap: true },
      { label: "Vendor", w: 110, wrap: true }, { label: "Qty", w: 50, align: "right" }, { label: "Unit", w: 50 },
      { label: "Spec", w: W - 30 - 380 - 110 - 110 - 50 - 50 - 85 - 85 - 80, wrap: true },
      { label: "Need on site", w: 85 }, { label: "Order by", w: 85 }, { label: "Status", w: 80 },
    ];
    const rows: TableRow[] = [];
    let rowNo = 0; // C5 — continuous 1..N numbering across all categories
    const push = (its: ApiProcurementItem[]) => its.forEach((it) => rows.push({
      cells: [
        String(++rowNo), it.description || "", it.manufacturer || "", it.vendorName || "", it.qty || "", it.unit || "",
        it.spec || "", it.needOnSiteDate || "", orderByDate(it.needOnSiteDate, it.leadTimeDays),
        // "RFQ_Sent" → "RFQ Sent", "OnSite" → "On Site"
        it.status === "BOQ" ? "Not Started" : (it.status || "").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2"),
      ],
    }));
    for (const s of sections) {
      const its = active.filter((it) => it.sectionId === s._id);
      if (!its.length) continue;
      rows.push({ group: `${s.name || "Category"}  ·  ${its.length} item${its.length === 1 ? "" : "s"}` });
      push(its);
    }
    const known = new Set(sections.map((s) => s._id));
    const other = active.filter((it) => !known.has(it.sectionId));
    if (other.length) { rows.push({ group: "Other" }); push(other); }
    drawTable(b, f, X, cols, rows, { newPage });
  }

  stampPageNumbers(doc, b);
  const out = await doc.save();
  return new Blob([out], { type: "application/pdf" });
}
