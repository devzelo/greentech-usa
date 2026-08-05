import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, Download, AlertTriangle, CheckCircle2, Clock, Package, History, ChevronDown, ChevronRight, ArrowUp, ArrowDown, ChevronsUpDown, Search } from "lucide-react";
import {
  fetchProcurementSections, fetchProcurementItems, updateProcurementItem, fetchProcurementEvents, fetchSubmittals,
  type ApiProcurementSection, type ApiProcurementItem, type ProcurementStatus, type ApiProcurementEvent,
  type ApiSubmittal, type SubmittalDisposition,
} from "../../lib/api";
import { projectInfoHtml, type ProjectPdfInfo } from "../../lib/pdfProjectHeader";

const GUEST_STAGES: ProcurementStatus[] = ["Fabrication", "Transit", "OnSite"];

// Submittal disposition → read-only badge shown in the master log (mirrors the Submittals tab).
const SUB_DISPO: Record<SubmittalDisposition, { label: string; cls: string }> = {
  Pending: { label: "Pending", cls: "bg-amber-50 text-amber-600" },
  Approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-600" },
  ApprovedAsNoted: { label: "Approved as Noted", cls: "bg-emerald-50 text-emerald-600" },
  ReviseResubmit: { label: "Revise & Resubmit", cls: "bg-orange-50 text-orange-600" },
  Rejected: { label: "Rejected", cls: "bg-red-50 text-red-600" },
  Superseded: { label: "Superseded", cls: "bg-slate-100 text-slate-500" },
};

// Status → { label, group, colour }. The group drives the dashboard cards; the colour drives the row badge.
type Group = "notStarted" | "inProgress" | "completed";
const STATUS_META: Record<Exclude<ProcurementStatus, "Cancelled">, { label: string; group: Group; cls: string }> = {
  BOQ:         { label: "Not Started",    group: "notStarted", cls: "bg-yellow-50 text-yellow-700" },
  RFQ_Sent:    { label: "RFQ Sent",       group: "inProgress", cls: "bg-amber-50 text-amber-600" },
  Quoted:      { label: "Quoted",         group: "inProgress", cls: "bg-amber-50 text-amber-600" },
  PO_Sent:     { label: "PO Sent",        group: "inProgress", cls: "bg-amber-50 text-amber-600" },
  Invoiced:    { label: "Invoiced",       group: "inProgress", cls: "bg-amber-50 text-amber-600" },
  Ordered:     { label: "Ordered",        group: "inProgress", cls: "bg-indigo-50 text-indigo-600" },
  Fabrication: { label: "In Fabrication", group: "inProgress", cls: "bg-indigo-50 text-indigo-600" },
  Transit:     { label: "In Transit",     group: "inProgress", cls: "bg-blue-50 text-blue-600" },
  OnSite:      { label: "On Site",        group: "completed",  cls: "bg-emerald-50 text-emerald-600" },
  Complete:    { label: "Complete",       group: "completed",  cls: "bg-emerald-50 text-emerald-600" },
};
const STATUS_ORDER: Array<Exclude<ProcurementStatus, "Cancelled">> = ["BOQ", "RFQ_Sent", "Quoted", "PO_Sent", "Invoiced", "Ordered", "Fabrication", "Transit", "OnSite", "Complete"];

// Column-header sorting (A6). Each column maps to a sort key; the header cycles asc → desc → off.
type SortKey = "category" | "itemNo" | "description" | "manufacturer" | "vendorName" | "spec" | "qty" | "revNo" | "needOnSiteDate" | "orderBy" | "submittal" | "status";
// Rev sits between # and Description — same order as the BOQ table.
const COLUMNS: Array<{ label: string; key: SortKey }> = [
  { label: "Category", key: "category" },
  { label: "#", key: "itemNo" },
  { label: "Rev", key: "revNo" },
  { label: "Description", key: "description" },
  { label: "Brand", key: "manufacturer" },
  { label: "Vendor", key: "vendorName" },
  { label: "Spec / Size", key: "spec" },
  { label: "Qty", key: "qty" },
  { label: "Need on site", key: "needOnSiteDate" },
  { label: "Order by", key: "orderBy" },
  { label: "Submittal", key: "submittal" },
  { label: "Status", key: "status" },
];
const num = (s: string) => { const n = parseFloat(String(s).replace(/[^0-9.-]/g, "")); return isFinite(n) ? n : NaN; };

function orderByDate(needOnSite: string, leadDays: string): string {
  if (!needOnSite) return "";
  const days = parseInt(String(leadDays).replace(/[^0-9]/g, ""), 10);
  const d = new Date(needOnSite);
  if (isNaN(d.getTime())) return "";
  if (isFinite(days) && days) d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
const todayStr = () => new Date().toISOString().slice(0, 10);
// At risk = order-by date has passed and the item isn't completed yet.
function isAtRisk(it: ApiProcurementItem): boolean {
  if (it.status === "OnSite" || it.status === "Complete" || it.status === "Cancelled") return false;
  const ob = orderByDate(it.needOnSiteDate, it.leadTimeDays);
  return !!ob && ob < todayStr();
}

export default function ProcurementMasterLog({ projectId, canEdit, guestLogistics, projectInfo }: { projectId: string; canEdit: boolean; guestLogistics?: boolean; projectInfo?: ProjectPdfInfo }) {
  const [sections, setSections] = useState<ApiProcurementSection[]>([]);
  const [items, setItems] = useState<ApiProcurementItem[]>([]);
  const [events, setEvents] = useState<ApiProcurementEvent[]>([]);
  const [submittals, setSubmittals] = useState<ApiSubmittal[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionFilter, setSectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const [riskOnly, setRiskOnly] = useState(false);
  // Click a column header to sort/group by it (Reza: "click category → group electricals together").
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const canSetStatus = canEdit || guestLogistics;

  const load = async () => {
    setLoading(true);
    try {
      const [s, i, e, subs] = await Promise.all([fetchProcurementSections(projectId), fetchProcurementItems(projectId), fetchProcurementEvents(projectId).catch(() => []), fetchSubmittals(projectId).catch(() => [])]);
      setSections(s); setItems(i); setEvents(e); setSubmittals(subs);
    } catch { /* keep empty */ }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [projectId]);

  const sectionName = (sid: string) => sections.find((s) => s._id === sid)?.name || "—";
  const active = useMemo(() => items.filter((it) => it.status !== "Cancelled"), [items]);
  // Continuous 1..N BOQ numbering across all categories — the SAME scheme the BOQ, Quotes, RFQ
  // and PO tabs use, so one item carries one number everywhere.
  const boqNo = useMemo(() => {
    const map: Record<string, number> = {};
    let k = 0;
    for (const s of sections) for (const it of items.filter((x) => x.sectionId === s._id)) if (it.status !== "Cancelled") map[it._id] = ++k;
    return map;
  }, [sections, items]);

  // itemId → current submittal disposition (the current revision's). Read-only, from the Submittals tab.
  const subDispoByItem = useMemo(() => {
    const m = new Map<string, SubmittalDisposition>();
    for (const s of submittals) {
      if (!s.itemId) continue;
      const cur = s.revisions?.find((r) => r.revNo === s.currentRevisionNo) || s.revisions?.[s.revisions.length - 1];
      if (cur) m.set(s.itemId, cur.disposition);
    }
    return m;
  }, [submittals]);
  const subDispoLabel = (iid: string) => { const d = subDispoByItem.get(iid); return d ? SUB_DISPO[d]?.label || d : ""; };

  const stats = useMemo(() => {
    let notStarted = 0, inProgress = 0, completed = 0, atRisk = 0;
    for (const it of active) {
      const g = STATUS_META[it.status as Exclude<ProcurementStatus, "Cancelled">]?.group;
      if (g === "completed") completed++;
      else if (g === "inProgress") inProgress++;
      else notStarted++;
      if (isAtRisk(it)) atRisk++;
    }
    return { total: active.length, notStarted, inProgress, completed, atRisk };
  }, [active]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return active.filter((it) =>
      (sectionFilter === "all" || it.sectionId === sectionFilter) &&
      (statusFilter === "all" || it.status === statusFilter) &&
      (!riskOnly || isAtRisk(it)) &&
      (!q || [it.description, it.manufacturer, it.vendorName, it.itemNo, it.unit, it.spec, sectionName(it.sectionId)].some((v) => String(v || "").toLowerCase().includes(q)))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sectionFilter, statusFilter, riskOnly, search, sections]);

  // Sort value per item for the active sort key.
  const sortVal = (it: ApiProcurementItem, key: SortKey): string | number => {
    switch (key) {
      case "category": return sectionName(it.sectionId).toLowerCase();
      case "itemNo": return boqNo[it._id] ?? Number.MAX_SAFE_INTEGER;
      case "qty": return num(it.qty);
      case "orderBy": return orderByDate(it.needOnSiteDate, it.leadTimeDays);
      case "status": return STATUS_ORDER.indexOf(it.status as Exclude<ProcurementStatus, "Cancelled">);
      case "needOnSiteDate": return it.needOnSiteDate || "";
      case "description": return (it.description || "").toLowerCase();
      case "manufacturer": return (it.manufacturer || "").toLowerCase();
      case "vendorName": return (it.vendorName || "").toLowerCase();
      case "spec": return (it.spec || "").toLowerCase();
      case "revNo": return it.revNo || 0;
      case "submittal": return subDispoLabel(it._id).toLowerCase();
    }
  };
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = sortVal(a, sort.key), bv = sortVal(b, sort.key);
      const aNaN = typeof av === "number" && isNaN(av), bNaN = typeof bv === "number" && isNaN(bv);
      if (aNaN && bNaN) return 0; if (aNaN) return 1; if (bNaN) return -1; // blanks/NaN always sink
      if (av < bv) return -1 * sort.dir;
      if (av > bv) return 1 * sort.dir;
      return 0;
    });
    return copy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, sections]);
  // Click cycles: asc → desc → off.
  const toggleSort = (key: SortKey) => setSort((s) =>
    !s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null);

  const setStatus = (iid: string, status: ProcurementStatus) => {
    setItems((p) => p.map((it) => (it._id === iid ? { ...it, status } : it)));
    updateProcurementItem(projectId, iid, { status }).catch(() => {});
  };

  // Printable report — opens a clean window honouring the current section/status filter + sort.
  // Landscape @page so all columns fit one page (A5).
  const printReport = () => {
    const scope = sectionFilter === "all" ? "All categories" : sectionName(sectionFilter);
    const rows = sorted.map((it) => `
      <tr>
        <td>${sectionName(it.sectionId)}</td><td>${boqNo[it._id] || ""}</td>
        <td>RV${it.revNo || 0}</td><td>${esc(it.description)}</td>
        <td>${esc(it.manufacturer)}</td><td>${esc(it.vendorName || "")}</td><td>${esc(it.spec)}</td><td>${it.qty || ""} ${esc(it.unit)}</td>
        <td>${it.needOnSiteDate || ""}</td><td>${orderByDate(it.needOnSiteDate, it.leadTimeDays) || ""}</td>
        <td>${esc(subDispoLabel(it._id))}</td>
        <td>${STATUS_META[it.status as Exclude<ProcurementStatus, "Cancelled">]?.label || it.status}</td>
      </tr>`).join("");
    const html = `<!doctype html><html><head><title>Procurement Status Report</title>
      <style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}h1{font-size:18px}p{color:#64748b;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-top:12px;font-size:11px;table-layout:fixed}
      td{word-wrap:break-word}
      th{background:#0f172a;color:#fff;text-align:left;padding:6px}td{border-bottom:1px solid #e7ebf0;padding:6px}</style></head>
      <body><h1>Procurement Status Report</h1>
      ${projectInfoHtml(projectInfo)}
      <p>${esc(scope)} · ${sorted.length} item(s) · ${new Date().toLocaleDateString()}</p>
      <table><thead><tr><th>Category</th><th>#</th><th>Rev</th><th>Description</th><th>Brand</th><th>Vendor</th><th>Spec</th><th>Qty</th><th>Need on site</th><th>Order by</th><th>Submittal</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <script>window.onload=function(){window.print();}</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  // Export the current (filtered + sorted) log to CSV — opens in Excel (A4).
  const exportCsv = () => {
    const header = ["Category", "Item #", "Rev", "Description", "Brand", "Vendor", "Spec", "Qty", "Unit", "Need on site", "Order by", "Submittal", "Status"];
    const rowsOut = sorted.map((it) => [
      sectionName(it.sectionId), boqNo[it._id] || "", `RV${it.revNo || 0}`, it.description, it.manufacturer, it.vendorName || "", it.spec, it.qty, it.unit,
      it.needOnSiteDate, orderByDate(it.needOnSiteDate, it.leadTimeDays),
      subDispoLabel(it._id),
      STATUS_META[it.status as Exclude<ProcurementStatus, "Cancelled">]?.label || it.status,
    ]);
    const csv = [header, ...rowsOut].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Procurement-Master-Log.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) return <div className="py-12 flex justify-center text-slate-300"><Loader2 size={22} className="animate-spin" /></div>;

  const cards = [
    { label: "Total items", value: stats.total, icon: Package, cls: "text-slate-700" },
    { label: "Completed", value: stats.completed, icon: CheckCircle2, cls: "text-emerald-600" },
    { label: "In progress", value: stats.inProgress, icon: Clock, cls: "text-amber-600" },
  ];

  return (
    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-xl font-display font-bold text-slate-900">Master Log</h3>
          <p className="text-xs font-medium text-slate-400 mt-1">End-to-end status of every item, derived from the BOQ. {stats.notStarted} not started.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold"><Download size={13} /> Export</button>
          <button onClick={printReport} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold"><Printer size={13} /> Print / PDF</button>
        </div>
      </div>

      {/* Dashboard cards — compact (A1): short height, sits in the header band */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {cards.map((c) => (
          <div key={c.label} className="bg-slate-50 rounded-xl px-3 py-2 flex items-center gap-2.5">
            <c.icon size={15} className={c.cls} />
            <p className={`text-lg font-display font-bold leading-none ${c.cls}`}>{c.value}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{c.label}</p>
          </div>
        ))}

        {/* At risk — explains itself and filters the table to the items that need action */}
        <button
          type="button"
          onClick={() => { if (stats.atRisk || riskOnly) setRiskOnly((v) => !v); }}
          disabled={!stats.atRisk && !riskOnly}
          title={stats.atRisk > 0 ? "Order-by date passed and not on site yet — tap to filter to these" : "On track — no order-by dates have passed"}
          className={`flex items-center gap-2.5 rounded-xl px-3 py-2 border transition-all ${stats.atRisk ? "bg-red-50 border-red-100 hover:bg-red-100/60 cursor-pointer" : "bg-slate-50 border-transparent cursor-default"} ${riskOnly ? "ring-2 ring-red-400" : ""}`}
        >
          <AlertTriangle size={15} className={stats.atRisk ? "text-red-600" : "text-slate-300"} />
          <p className={`text-lg font-display font-bold leading-none ${stats.atRisk ? "text-red-600" : "text-slate-400"}`}>{stats.atRisk}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">At risk</p>
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-grow min-w-[12rem]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by item, brand, spec…" className="w-full bg-slate-50 border border-slate-100 rounded-lg pl-9 pr-3 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10" />
        </div>
        <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-bold outline-none">
          <option value="all">All categories</option>
          {sections.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-bold outline-none">
          <option value="all">All statuses</option>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        {(search || sectionFilter !== "all" || statusFilter !== "all") && (
          <button onClick={() => { setSearch(""); setSectionFilter("all"); setStatusFilter("all"); }} className="text-[11px] font-bold text-slate-500 hover:text-slate-900 px-2">Clear</button>
        )}
        <span className="text-[10px] text-slate-400 ml-auto">{sorted.length} of {active.length}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead>
            <tr className="bg-slate-50 border-y border-slate-100">
              {COLUMNS.map((col) => {
                const activeCol = sort?.key === col.key;
                return (
                  <th key={col.key} className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest text-[10px] whitespace-nowrap">
                    <button type="button" onClick={() => toggleSort(col.key)} className={`inline-flex items-center gap-1 hover:text-slate-800 ${activeCol ? "text-slate-800" : ""}`} title="Sort / group by this column">
                      {col.label}
                      {activeCol ? (sort!.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ChevronsUpDown size={11} className="text-slate-300" />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {sorted.length === 0 ? (
              <tr><td colSpan={12} className="px-3 py-10 text-center text-slate-400 italic text-sm">No items match. Add items in the BOQ tab.</td></tr>
            ) : sorted.map((it) => {
              const meta = STATUS_META[it.status as Exclude<ProcurementStatus, "Cancelled">];
              const risk = isAtRisk(it);
              const subD = subDispoByItem.get(it._id);
              return (
                <tr key={it._id} className={`hover:bg-slate-50/40 ${risk ? "bg-red-50/30" : ""}`}>
                  <td className="px-3 py-2 text-slate-500">{sectionName(it.sectionId)}</td>
                  <td className="px-3 py-2 text-slate-400 font-bold">{boqNo[it._id] || "—"}</td>
                  <td className="px-3 py-2 text-slate-400 font-bold whitespace-nowrap">{`RV${it.revNo || 0}`}</td>
                  <td className="px-3 py-2 font-bold text-slate-700">{it.description || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{it.manufacturer || "—"}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{it.vendorName || "—"}</td>
                  <td className="px-3 py-2 text-slate-500 max-w-[10rem] truncate" title={it.spec || ""}>{it.spec || "—"}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{[it.qty, it.unit].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{it.needOnSiteDate || "—"}</td>
                  <td className={`px-3 py-2 whitespace-nowrap ${risk ? "text-red-600 font-bold" : "text-slate-500"}`}>{orderByDate(it.needOnSiteDate, it.leadTimeDays) || "—"}{risk && " ⚠"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{subD ? <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${SUB_DISPO[subD]?.cls || "bg-slate-100 text-slate-500"}`}>{SUB_DISPO[subD]?.label || subD}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2">
                    {canSetStatus ? (() => {
                      // Full editors see all stages; guests see only logistics stages (+ the current value).
                      const opts = canEdit ? STATUS_ORDER : Array.from(new Set([it.status as ProcurementStatus, ...GUEST_STAGES]));
                      return (
                        <select value={it.status} onChange={(e) => setStatus(it._id, e.target.value as ProcurementStatus)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold outline-none cursor-pointer border-0 ${meta?.cls || "bg-slate-100 text-slate-500"}`}>
                          {opts.map((s) => <option key={s} value={s}>{STATUS_META[s as Exclude<ProcurementStatus, "Cancelled">]?.label || s}</option>)}
                        </select>
                      );
                    })() : (
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${meta?.cls || "bg-slate-100 text-slate-500"}`}>{meta?.label || it.status}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Activity timeline (append-only audit) */}
      <div className="border border-slate-100 rounded-2xl overflow-hidden">
        <button onClick={() => setShowActivity((v) => !v)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left">
          {showActivity ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
          <History size={14} className="text-slate-400" />
          <span className="font-bold text-slate-700 text-sm">Activity timeline ({events.length})</span>
        </button>
        {showActivity && (
          <div className="px-4 pb-3 max-h-72 overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic py-2">No activity yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {events.map((e) => (
                  <li key={e._id} className="flex items-start gap-2 text-[11px]">
                    <span className="text-slate-300 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</span>
                    <span className="font-bold text-slate-600 capitalize">{e.entityType} {e.action}</span>
                    {(e.fromValue || e.toValue) && <span className="text-slate-400">{[e.fromValue, e.toValue].filter(Boolean).join(" → ")}</span>}
                    <span className="text-slate-400 ml-auto whitespace-nowrap">{e.actorName}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function esc(s: string): string {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}
