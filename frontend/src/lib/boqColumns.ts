import type { ApiProcurementItem, ProcurementStatus } from "./api";

/**
 * 2026-10-09 - the BOQ and the Master Log are one table now. The client: "combine them and only
 * keep the BOQ; the columns merged and optional on the report; sort each column, drag them smaller
 * or bigger or auto fit to content, so we see everything in one page." The columns live here so the
 * screen, the printed BOQ and the exports agree on what each one shows.
 */
export type BoqColId =
  | "category" | "no" | "rev" | "description" | "brand" | "model" | "vendor" | "qty" | "unit"
  | "spec" | "needOnSite" | "lead" | "orderBy" | "submittal" | "status";

export interface BoqColumn {
  id: BoqColId;
  label: string;
  /** The starting width on screen, in px. */
  w: number;
  /** The widest "Auto-fit" makes it. */
  max: number;
  /** Shown until the viewer hides it. */
  on: boolean;
  align?: "right";
  /** Long text that wraps (and gives way first when the table is fitted to the screen). */
  wrap?: boolean;
}

export const BOQ_COLUMNS: BoqColumn[] = [
  { id: "category", label: "Category", w: 130, max: 240, on: false, wrap: true },
  { id: "no", label: "#", w: 52, max: 90, on: true },
  { id: "rev", label: "Rev", w: 68, max: 90, on: true },
  { id: "description", label: "Description", w: 320, max: 520, on: true, wrap: true },
  { id: "brand", label: "Brand", w: 150, max: 280, on: true, wrap: true },
  { id: "model", label: "Model", w: 110, max: 240, on: true, wrap: true },
  { id: "vendor", label: "Vendor", w: 130, max: 260, on: true, wrap: true },
  { id: "qty", label: "Qty", w: 70, max: 130, on: true, align: "right" },
  { id: "unit", label: "Unit", w: 70, max: 130, on: true },
  { id: "spec", label: "Spec / Size", w: 280, max: 520, on: true, wrap: true },
  { id: "needOnSite", label: "Need on site", w: 136, max: 160, on: true },
  { id: "lead", label: "Lead (d)", w: 80, max: 120, on: true, align: "right" },
  { id: "orderBy", label: "Order by", w: 110, max: 150, on: true },
  { id: "submittal", label: "Submittal", w: 160, max: 230, on: true, wrap: true },
  { id: "status", label: "Status", w: 136, max: 180, on: true },
];
export const MIN_COL_W = 40;
export const MAX_COL_W = 900;
export const colById = (id: BoqColId) => BOQ_COLUMNS.find((c) => c.id === id)!;

// ── Status: one wording everywhere (the stored "BOQ" reads "Not Started") ──
export type LiveStatus = Exclude<ProcurementStatus, "Cancelled">;
export type StatusGroup = "notStarted" | "inProgress" | "completed";
export const STATUS_META: Record<LiveStatus, { label: string; group: StatusGroup; cls: string }> = {
  BOQ: { label: "Not Started", group: "notStarted", cls: "bg-yellow-50 text-yellow-700" },
  RFQ_Sent: { label: "RFQ Sent", group: "inProgress", cls: "bg-amber-50 text-amber-600" },
  Quoted: { label: "Quoted", group: "inProgress", cls: "bg-amber-50 text-amber-600" },
  PO_Sent: { label: "PO Sent", group: "inProgress", cls: "bg-amber-50 text-amber-600" },
  Invoiced: { label: "Invoiced", group: "inProgress", cls: "bg-amber-50 text-amber-600" },
  Ordered: { label: "Ordered", group: "inProgress", cls: "bg-indigo-50 text-indigo-600" },
  Fabrication: { label: "In Fabrication", group: "inProgress", cls: "bg-indigo-50 text-indigo-600" },
  Transit: { label: "In Transit", group: "inProgress", cls: "bg-blue-50 text-blue-600" },
  OnSite: { label: "On Site", group: "completed", cls: "bg-emerald-50 text-emerald-600" },
  Complete: { label: "Complete", group: "completed", cls: "bg-emerald-50 text-emerald-600" },
};
export const STATUS_ORDER: LiveStatus[] = ["BOQ", "RFQ_Sent", "Quoted", "PO_Sent", "Invoiced", "Ordered", "Fabrication", "Transit", "OnSite", "Complete"];
export const statusText = (s: string) => (s === "Cancelled" ? "Cancelled" : STATUS_META[s as LiveStatus]?.label || s);
export const statusCls = (s: string) => (s === "Cancelled" ? "bg-red-100 text-red-700" : STATUS_META[s as LiveStatus]?.cls || "bg-slate-100 text-slate-500");

// ── Submittal: the linked package's current revision and its disposition ──
export const DISPO_LABEL: Record<string, string> = { Pending: "Pending", Approved: "Approved", ApprovedAsNoted: "Appr. as Noted", ReviseResubmit: "Revise", Rejected: "Rejected", Superseded: "Superseded" };
export const DISPO_CLS: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-600", Approved: "bg-emerald-50 text-emerald-600", ApprovedAsNoted: "bg-emerald-50 text-emerald-600",
  ReviseResubmit: "bg-orange-50 text-orange-600", Rejected: "bg-red-50 text-red-600", Superseded: "bg-slate-100 text-slate-500",
};
export type SubmittalMark = { rev: number; disposition: string };
export const submittalText = (m?: SubmittalMark) => (m ? `Rev ${m.rev} · ${DISPO_LABEL[m.disposition] || m.disposition}` : "");

/** The order-by date: the need-on-site date less the lead time in days. */
export function orderByDate(needOnSite: string, leadDays: string): string {
  if (!needOnSite) return "";
  const days = parseInt(String(leadDays).replace(/[^0-9]/g, ""), 10);
  if (!isFinite(days) || !days) return needOnSite;
  const d = new Date(needOnSite);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
/** At risk: the order-by date has passed and the item is not on site yet. */
export function isAtRisk(it: ApiProcurementItem): boolean {
  if (it.status === "OnSite" || it.status === "Complete" || it.status === "Cancelled") return false;
  const ob = orderByDate(it.needOnSiteDate, it.leadTimeDays);
  return !!ob && ob < new Date().toISOString().slice(0, 10);
}

/** What a column says for an item, as text: for the exports, the printed BOQ and "Auto-fit". */
export interface BoqTextCtx {
  sectionName: (sectionId: string) => string;
  numberOf: (itemId: string) => number | undefined;
  submittalOf: (itemId: string) => SubmittalMark | undefined;
}
export function boqCellText(id: BoqColId, it: ApiProcurementItem, ctx: BoqTextCtx): string {
  switch (id) {
    case "category": return ctx.sectionName(it.sectionId);
    case "no": return it.status === "Cancelled" ? "" : String(ctx.numberOf(it._id) ?? "");
    case "rev": return `RV${it.revNo || 0}`;
    case "description": return it.description || "";
    case "brand": return it.manufacturer || "";
    case "model": return it.modelNo || "";
    case "vendor": return it.vendorName || "";
    case "qty": return it.qty || "";
    case "unit": return it.unit || "";
    case "spec": return it.spec || "";
    case "needOnSite": return it.needOnSiteDate || "";
    case "lead": return it.leadTimeDays || "";
    case "orderBy": return orderByDate(it.needOnSiteDate, it.leadTimeDays);
    case "submittal": return submittalText(ctx.submittalOf(it._id));
    case "status": return statusText(it.status);
  }
}
