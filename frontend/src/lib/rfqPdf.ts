import { PDFDocument } from "pdf-lib";
import { RFQ_REQUESTS, type ApiRfq, type ApiVendor } from "./api";
import { drawProjectInfo, type ProjectPdfInfo } from "./pdfProjectHeader";
import { GREENTECH } from "./poPdf";
import { drawWrapped, wrappedHeight } from "./pdfText";
import { BOTTOM, C, GUTTER, LETTER, brandPage, drawTable, label, loadBrand, partyBlock, stampPageNumbers, titleBlock, type Flow, type TableCol } from "./pdfBrand";

// A branded RFQ to send to a vendor, on the letterhead: title block, the FROM / VENDOR / DELIVERY
// blocks and the list of items wanted. It DESCRIBES the items; the vendor returns its own quotation.
// Vendor-facing, so it shows the project but never the client (H1/H2). US Letter (client request):
// long descriptions, brands and specs wrap and the table continues onto more pages.
// `pageNumbers: false` when the caller merges more pages behind it and numbers the whole file.
export async function buildRfqPdf(rfq: ApiRfq, vendor?: ApiVendor, projectInfo?: ProjectPdfInfo, refLabel?: string, opts: { pageNumbers?: boolean } = {}): Promise<Blob> {
  const ref = refLabel || rfq.rfqNo;
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const X = GUTTER, W = LETTER.w - GUTTER * 2;
  const refText = /^\s*rfq\b/i.test(ref) ? ref : `RFQ ${ref}`;
  const note = [refText, projectInfo?.name].filter(Boolean).join("  ·  ");
  const newPage = (): Flow => brandPage(doc, b, LETTER, note);
  let f = newPage();
  // CR 335 - the RFQ's own date and the date replies are due, and its currency.
  const day = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const cur = rfq.currency || "USD";
  const meta: Array<[string, string]> = [["RFQ number", ref], ["Date", day(rfq.date || rfq.createdAt?.slice(0, 10))]];
  if (rfq.dueDate) meta.push(["Reply by", day(rfq.dueDate)]);
  meta.push(["Currency", cur]);

  let y = titleBlock(f.page, b, { x: X, y: f.y, w: W, eyebrow: "Request for quotation", title: rfq.title || "Items requested for quotation", meta });
  y = drawProjectInfo(f.page, b.regular, projectInfo, X, y, W) - 4; // H1 (no client — H2)

  // Three party blocks (as on the PO): GreenTech | vendor | delivery details.
  const gap = 16, colW = (W - gap * 2) / 3;
  const gtEnd = partyBlock(f.page, b, X, y, colW, "From", [GREENTECH.name, GREENTECH.address, GREENTECH.email, GREENTECH.phone]);
  const vEnd = partyBlock(f.page, b, X + colW + gap, y, colW, "Vendor", vendor
    ? [vendor.name, [vendor.city, vendor.country].filter(Boolean).join(", "), vendor.contactName ? `Attn: ${vendor.contactName}` : "", vendor.email]
    : ["(all vendors)"]);
  const dEnd = partyBlock(f.page, b, X + (colW + gap) * 2, y, colW, "Delivery", [rfq.deliveryMethod || "Delivery", rfq.shipToLocation || ""]);
  f.y = Math.min(gtEnd, vEnd, dEnd) - 12;

  // The items. Description, Brand and Spec wrap. CR 335 - each item's note to the vendor sits under
  // its specification; the target unit price is printed only when the RFQ shows target prices.
  const targets = !!rfq.showTargetPrices && rfq.lineItems.some((li) => li.targetUnitPrice);
  const tW = targets ? 58 : 0;
  const fixed = 20 + 64 + 32 + 34 + 58 + tW;
  const rest = W - fixed, descW = Math.round(rest * 0.48);
  const cols: TableCol[] = [
    { label: "#", w: 20 }, { label: "Description", w: descW, wrap: true }, { label: "Brand", w: 64, wrap: true },
    { label: "Qty", w: 32, align: "right" }, { label: "Unit", w: 34 }, { label: "Specification / notes", w: rest - descW, wrap: true }, { label: "Need by", w: 58 },
    ...(targets ? [{ label: `Target (${cur})`, w: tW, align: "right" as const }] : []),
  ];
  const specOf = (li: ApiRfq["lineItems"][number]) => [li.spec || "", li.vendorNote ? `Note: ${li.vendorNote}` : ""].filter(Boolean).join("\n");
  f = drawTable(b, f, X, cols, rfq.lineItems.map((li, i) => ({
    cells: [String(i + 1), li.description || "", li.manufacturer || "", li.qty || "", li.unit || "", specOf(li), li.needOnSiteDate || "", ...(targets ? [li.targetUnitPrice || ""] : [])],
  })), { newPage });

  // Notes, what to include, the supporting documents and the closing request.
  f.y -= 16;
  const block = (title: string, text: string) => {
    if (!text) return;
    const h = 13 + wrappedHeight(b.regular, text, 9, W, 12.5) + 10;
    if (f.y - h < BOTTOM) f = newPage();
    label(f.page, b, title, X, f.y); f.y -= 13;
    f.y = drawWrapped(f.page, b.regular, text, { x: X, y: f.y, size: 9, maxW: W, lineHeight: 12.5, color: C.s700 }) - 8;
  };
  block("Notes", (rfq.notes || "").slice(0, 3000));
  const asked = RFQ_REQUESTS.filter((q) => (rfq.requests || []).includes(q.key)).map((q) => `•  ${q.label}`);
  block("Please include with your quotation", asked.join("\n"));
  block("Supporting documents (attached)", (rfq.attachments || []).map((a) => `•  ${a.name}`).join("\n"));
  if (f.y - 16 < BOTTOM) f = newPage();
  const closing = rfq.dueDate
    ? `Kindly send your quotation, with prices in ${cur}, by ${day(rfq.dueDate)}.`
    : "Kindly provide your quotation and delivery lead time for the items listed above.";
  f.page.drawText(closing, { x: X, y: f.y, size: 8.5, font: b.regular, color: C.s500 });

  if (opts.pageNumbers !== false) stampPageNumbers(doc, b);
  const out = await doc.save();
  return new Blob([out], { type: "application/pdf" });
}
