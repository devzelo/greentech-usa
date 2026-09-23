import { PDFDocument } from "pdf-lib";
import type { ApiShipment, ApiShipmentCargo } from "./api";
import { C, GUTTER, LETTER, brandPage, drawTable, kpiCard, loadBrand, sectionHeading, stampPageNumbers, titleBlock, type Flow, type TableCol, type TableRow } from "./pdfBrand";

/**
 * CR 280 (2026-09-23): a shipment's status as one page that can be printed or sent on: where it is,
 * when it is due, who is moving it, what is in it, what it costs, which papers are on file and every
 * tracking update logged so far. Letterhead, US Letter portrait, like the other documents.
 */

const PAGE = LETTER;
const X = GUTTER;
const W = PAGE.w - GUTTER * 2;

const STATUS_LABEL: Record<string, string> = {
  Preparing: "Preparing", Fabrication: "In Fabrication", Transit: "In Transit",
  Clearance: "In Clearance", Warehouse: "In Warehouse", Delivered: "Delivered",
};

const n = (v?: string) => parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
const dash = (v?: string) => (v && v.trim() ? v.trim() : "-");

export interface ShipmentPdfInput {
  projectName: string;
  projectNo?: string;
  /** The project's site, so a reader outside the company knows where this is going. */
  projectLocation?: string;
  shipment: ApiShipment;
  /** The purchase orders this shipment delivers, for the reference list. */
  pos?: Array<{ _id: string; poNo?: string; vendorName?: string; total?: string; invoiceAmount?: string }>;
  /** Sum of the linked POs' invoice amounts. */
  goodsCost?: number;
  /** CR 281 - the cargo rows, already read off the shipment (old records included). */
  cargo?: ApiShipmentCargo[];
}

// CR 281 - the same labels the screen uses, so the report reads like the shipment tab.
const CARGO_LABELS: Record<string, string> = {
  container: "Shipping Container", opentop: "Open Top Container", reefer: "Reefer Container (Refrigerated)",
  flatrack: "Flat Rack", openbed: "Open Bed / Flatbed", tanker: "Tanker",
  pallet: "Pallet(s)", crate: "Crate(s)", loose: "Loose Cargo / Break Bulk", custom: "Custom",
};
const cargoType = (c: ApiShipmentCargo) =>
  (c.type === "custom" ? (c.customType || "").trim() : "") || CARGO_LABELS[c.type] || c.type || "-";
const cargoSize = (c: ApiShipmentCargo) => {
  if (c.size !== "custom") return c.size || "-";
  const dims = [c.dimL, c.dimW, c.dimH].filter((d) => String(d || "").trim());
  return dims.length ? `${dims.join(" x ")} ${c.dimUnit || ""}`.trim() : "-";
};
const cargoWeight = (c: ApiShipmentCargo) =>
  String(c.weight || "").trim() ? `${String(c.weight).trim()} ${c.weightUnit || ""}`.trim() : "";
/** The whole cargo on one line, for the shipment summary table. */
const cargoLine = (cargo?: ApiShipmentCargo[]) => (cargo || []).map((c) => {
  const qty = String(c.qty || "").trim();
  const size = cargoSize(c);
  return `${qty && qty !== "1" ? `${qty} x ` : ""}${cargoType(c)}${size && size !== "-" ? ` - ${size}` : ""}`;
}).join(" · ");

export async function buildShipmentPdf(o: ShipmentPdfInput): Promise<Blob> {
  const s = o.shipment;
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const note = [s.name || "Shipment", o.projectName].filter(Boolean).join("  ·  ");
  const newPage = (): Flow => brandPage(doc, b, PAGE, note);
  let f = newPage();

  f.y = titleBlock(f.page, b, {
    x: X, y: f.y, w: W,
    eyebrow: "Procurement · shipment status",
    title: `${s.name || "Shipment"}${s.description ? ` - ${s.description}` : ""}`,
    meta: [
      ["Project", o.projectName],
      ["Project no.", o.projectNo || ""],
      ["Project site", o.projectLocation || ""],
      ["As of", new Date().toLocaleDateString(undefined, { dateStyle: "medium" })],
    ],
  });
  f.y -= 6;

  // ── Where it stands ──
  // Three cards only: on a portrait sheet more than that truncates their values.
  const costs = n(s.costFreight) + n(s.costCustoms) + n(s.costDemurrage) + n(s.costOther);
  const cards: Array<[string, string]> = [
    ["Status", STATUS_LABEL[s.status || "Preparing"] || String(s.status || "-")],
    ["Current location", dash(s.currentLocation || s.fromLocation)],
    ["Anticipated arrival", dash(s.etaDate)],
  ];
  const cw = (W - (cards.length - 1) * 8) / cards.length;
  cards.forEach(([k, v], i) => kpiCard(f.page, b, X + i * (cw + 8), f.y, cw, 46, k, v, C.slate));
  f.y -= 64;

  const twoCol: TableCol[] = [{ label: "Field", w: 150 }, { label: "Detail", w: W - 150, wrap: true }];
  // A heading belongs with its table: start a page when only the heading would fit here.
  const keepTogether = (rows: number) => { if (f.y - (22 + 18 + rows * 15) < 70) f = newPage(); };

  // ── The journey ──
  keepTogether(3);
  f.y = sectionHeading(f.page, b, "The shipment", X, f.y, W);
  const journey: TableRow[] = [
    { cells: ["Description", dash(s.description)] },
    { cells: ["From", dash(s.fromLocation)] },
    { cells: ["To", dash(s.toLocation)] },
    { cells: ["Carrier", dash(s.carrier)] },
    { cells: ["Tracking / container #", dash(s.trackingNo)] },
    { cells: ["Cargo", dash(cargoLine(o.cargo))] },
    { cells: ["Last location update", s.trackingCheckedAt ? `${s.trackingCheckedAt.slice(0, 10)}${s.trackingSource ? ` (${s.trackingSource})` : ""}` : "not updated yet"] },
  ];
  f = drawTable(b, f, X, twoCol, journey, { newPage, size: 8.5, maxLines: 4 });
  f.y -= 10;

  // ── Who is moving it ──
  keepTogether(3);
  f.y = sectionHeading(f.page, b, "Shipping agency", X, f.y, W);
  const agency: TableRow[] = [
    { cells: ["Company", dash(s.agencyName)] },
    { cells: ["Contact", dash(s.agencyContact)] },
    { cells: ["Phone", dash(s.agencyPhone)] },
    { cells: ["Email", dash(s.agencyEmail)] },
    { cells: ["Website", dash(s.agencyWebsite)] },
    { cells: ["Country", dash(s.agencyCountry)] },
  ];
  f = drawTable(b, f, X, twoCol, agency, { newPage, size: 8.5, maxLines: 3 });
  f.y -= 10;

  // ── The cargo (CR 281) ──
  const cargo = o.cargo || [];
  if (cargo.length) {
    keepTogether(2);
    f.y = sectionHeading(f.page, b, `Cargo (${cargo.length})`, X, f.y, W);
    const cargoCols: TableCol[] = [
      { label: "Qty", w: 40, align: "right" },
      { label: "Type", w: 150, wrap: true },
      { label: "Size / dimensions", w: 130, wrap: true },
      { label: "Weight", w: 70 },
      { label: "Reference", w: W - 390, wrap: true },
    ];
    const cargoRows: TableRow[] = cargo.map((c) => ({
      cells: [c.qty || "1", cargoType(c), cargoSize(c), cargoWeight(c) || "-", c.ref || "-"],
    }));
    f = drawTable(b, f, X, cargoCols, cargoRows, { newPage, size: 8, maxLines: 3 });
    f.y -= 10;
  }

  // ── What it carries ──
  keepTogether(2);
  f.y = sectionHeading(f.page, b, `Goods (${s.goods?.length || 0})`, X, f.y, W);
  const goodsCols: TableCol[] = [{ label: "#", w: 26 }, { label: "Description", w: W - 166, wrap: true }, { label: "Qty", w: 70, align: "right" }, { label: "Unit", w: 70 }];
  const goodsRows: TableRow[] = (s.goods || []).length
    ? (s.goods || []).map((g, i) => ({ cells: [String(i + 1), g.description || "-", g.qty || "", g.unit || ""] }))
    : [{ cells: ["", "Nothing listed."] }];
  f = drawTable(b, f, X, goodsCols, goodsRows, { newPage, size: 8, maxLines: 3 });
  f.y -= 10;

  // ── What it costs ──
  keepTogether(3);
  f.y = sectionHeading(f.page, b, "Costs", X, f.y, W);
  const costCols: TableCol[] = [{ label: "Item", w: 220 }, { label: "Amount", w: W - 220, align: "right" }];
  const costRows: TableRow[] = [
    { cells: ["Freight", money(n(s.costFreight))] },
    { cells: ["Customs / clearance", money(n(s.costCustoms))] },
    { cells: ["Demurrage", money(n(s.costDemurrage))] },
    { cells: ["Other", money(n(s.costOther))] },
    { cells: ["Total shipment cost", money(costs)], bold: true, fill: C.mint },
    ...(o.goodsCost !== undefined ? [{ cells: ["Cost of goods (from the linked POs)", money(o.goodsCost)] }] : []),
  ];
  f = drawTable(b, f, X, costCols, costRows, { newPage, size: 8.5, maxLines: 2 });
  f.y -= 10;

  // ── The purchase orders it delivers ──
  if ((s.poIds || []).length) {
    keepTogether(2);
  f.y = sectionHeading(f.page, b, `Purchase orders (${(s.poIds || []).length})`, X, f.y, W);
    const poCols: TableCol[] = [{ label: "PO", w: 110 }, { label: "Vendor", w: W - 290, wrap: true }, { label: "Invoiced", w: 90, align: "right" }, { label: "Total", w: 90, align: "right" }];
    const byId = new Map((o.pos || []).map((p) => [p._id, p]));
    const poRows: TableRow[] = (s.poIds || []).map((id) => {
      const p = byId.get(id);
      return { cells: [p?.poNo || id, p?.vendorName || "-", p?.invoiceAmount ? money(n(p.invoiceAmount)) : "-", p?.total ? money(n(p.total)) : "-"] };
    });
    f = drawTable(b, f, X, poCols, poRows, { newPage, size: 8, maxLines: 2 });
    f.y -= 10;
  }

  // ── Tracking history (CR 219) ──
  const events = s.trackingEvents || [];
  keepTogether(2);
  f.y = sectionHeading(f.page, b, `Tracking updates (${events.length})`, X, f.y, W);
  const evCols: TableCol[] = [{ label: "Date", w: 80 }, { label: "Location", w: 150, wrap: true }, { label: "Update", w: W - 370, wrap: true }, { label: "Source", w: 140 }];
  const evRows: TableRow[] = events.length
    ? events.slice(0, 60).map((e) => ({ cells: [e.date || "-", e.location || "-", e.description || "-", [e.source, e.addedBy].filter(Boolean).join(" · ") || "-"] }))
    : [{ cells: ["", "No updates logged yet."] }];
  f = drawTable(b, f, X, evCols, evRows, { newPage, size: 8, maxLines: 3 });
  f.y -= 10;

  // ── The papers on file ──
  keepTogether(2);
  f.y = sectionHeading(f.page, b, "Documents on file", X, f.y, W);
  const docCols: TableCol[] = [{ label: "Document", w: 230, wrap: true }, { label: "Files", w: 60, align: "right" }, { label: "Remarks", w: W - 290, wrap: true }];
  const docRows: TableRow[] = (s.rows || []).length
    ? (s.rows || []).map((r) => ({ cells: [r.docType || "-", String(r.files?.length || 0), r.remarks || ""] }))
    : [{ cells: ["", "0", "Nothing uploaded yet."] }];
  f = drawTable(b, f, X, docCols, docRows, { newPage, size: 8, maxLines: 3 });

  stampPageNumbers(doc, b);
  return new Blob([await doc.save()], { type: "application/pdf" });
}
