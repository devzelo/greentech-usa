import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, Upload, X, FileText, Ship, Pencil, Check, MapPin, CalendarClock, Package, Link2, DollarSign, Eye, ExternalLink } from "lucide-react";
import {
  fetchShipments, createShipment, updateShipment, deleteShipment,
  addShipmentRow, renameShipmentRow, updateShipmentRow, deleteShipmentRow, uploadShipmentFile, deleteShipmentFile,
  fetchProcurementPOs, fetchVendors, attachmentUrl,
  type ApiShipment, type ApiProcurementPO, type ApiVendor, type ShipmentStatus, type ShipmentInput,
} from "../../lib/api";
import { buildPoPackage } from "../../lib/poPdf";
import PdfPreviewModal from "./PdfPreviewModal";
import type { ProjectPdfInfo } from "../../lib/pdfProjectHeader";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";

// The demurrage row is special: pinned to the top of the list and rendered dulled/grey. The
// shipping contract row is mandatory too (kept just under it) but renders normally.
const DEMURRAGE_DOC = "Demurrage Cost";
const SHIPPER_CONTRACT_DOC = "Shipping Contract (GreenTech ↔ Shipper)";
const REQUIRED_DOCS = [DEMURRAGE_DOC, SHIPPER_CONTRACT_DOC];
const sameDoc = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const isDemurrage = (docType: string) => sameDoc(docType, DEMURRAGE_DOC);
const isRequiredDoc = (docType: string) => REQUIRED_DOCS.some((d) => sameDoc(docType, d));
const isPackingList = (docType: string) => docType.trim().toLowerCase().includes("packing list");

const n = (s?: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });
const COST_FIELDS = [
  ["costFreight", "Freight"], ["costCustoms", "Customs / clearance"],
  ["costDemurrage", "Demurrage"], ["costOther", "Other"],
] as const;
// Cost of goods = sum of the linked POs' invoice amounts (falling back to the PO total). Pulled
// automatically from the POs, never entered by hand.
const goodsCost = (poIds: string[] | undefined, pos: { _id: string; invoiceAmount?: string; total?: string }[]) =>
  (poIds || []).reduce((sum, pid) => {
    const po = pos.find((x) => x._id === pid);
    return sum + (po ? (n(po.invoiceAmount) || n(po.total)) : 0);
  }, 0);
const shipmentTotal = (s: { costFreight?: string; costCustoms?: string; costDemurrage?: string; costOther?: string }) =>
  n(s.costFreight) + n(s.costCustoms) + n(s.costDemurrage) + n(s.costOther);

const STATUS_META: Record<ShipmentStatus, { label: string; cls: string }> = {
  Preparing:   { label: "Preparing",     cls: "bg-slate-100 text-slate-600" },
  Fabrication: { label: "In Fabrication", cls: "bg-indigo-50 text-indigo-600" },
  Transit:     { label: "In Transit",    cls: "bg-blue-50 text-blue-600" },
  Clearance:   { label: "In Clearance",  cls: "bg-amber-50 text-amber-600" },
  Warehouse:   { label: "In Warehouse",  cls: "bg-violet-50 text-violet-600" },
  Delivered:   { label: "Delivered",     cls: "bg-emerald-50 text-emerald-600" },
};
const STATUSES = Object.keys(STATUS_META) as ShipmentStatus[];

const inp = "w-full bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10";

type ShipDraft = {
  name: string; fromLocation: string; toLocation: string; description: string;
  status: ShipmentStatus; deadline: string; poIds: string[];
  costFreight: string; costCustoms: string; costDemurrage: string; costOther: string;
  trackingNo: string; carrier: string; currentLocation: string; etaDate: string; trackingUrl: string;
  containerType: string; containerSize: string; openBed: boolean;
  goods: Array<{ description: string; qty: string; unit: string }>;
  agencyName: string; agencyContact: string; agencyPhone: string; agencyEmail: string;
};
const BLANK_DRAFT: ShipDraft = {
  name: "", fromLocation: "", toLocation: "", description: "", status: "Preparing", deadline: "", poIds: [],
  costFreight: "", costCustoms: "", costDemurrage: "", costOther: "",
  trackingNo: "", carrier: "", currentLocation: "", etaDate: "", trackingUrl: "",
  containerType: "", containerSize: "", openBed: false,
  goods: [], agencyName: "", agencyContact: "", agencyPhone: "", agencyEmail: "",
};

// Days-until-ETA countdown for the tracking header (CR-PR-08).
function etaCountdown(etaDate?: string): string {
  if (!etaDate) return "";
  const d = new Date(etaDate); if (isNaN(d.getTime())) return "";
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days > 1) return `in ${days} days`;
  if (days === 1) return "tomorrow";
  if (days === 0) return "today";
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
}

// One sub-tab per shipment; each holds the shipment's logistics info (from/to, status, deadline,
// linked POs) and a table of document rows (predefined + custom) with files and remarks.
export default function ProcurementShipment({ projectId, canEdit, projectInfo }: { projectId: string; canEdit: boolean; projectInfo?: ProjectPdfInfo }) {
  const [shipments, setShipments] = useState<ApiShipment[]>([]);
  const [pos, setPOs] = useState<ApiProcurementPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editRowVal, setEditRowVal] = useState("");
  // Creation / edit popup — everything about the shipment is editable here (CRUD).
  const [popup, setPopup] = useState<{ mode: "create" | "edit"; sid?: string } | null>(null);
  const [draft, setDraft] = useState<ShipDraft>(BLANK_DRAFT);
  const [poPickerOpen, setPoPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { confirm, dialogs } = useDialogs();

  // POs live behind their own permission — a user with shipment access but not PO access gets a
  // 403 here, so we distinguish "no POs yet" from "you can't see the POs".
  const [poAccessDenied, setPoAccessDenied] = useState(false);
  const [vendors, setVendors] = useState<ApiVendor[]>([]);
  // The PO document opened from a linked-PO chip (Packing List row / info card).
  const [poPreview, setPoPreview] = useState<{ title: string; fileName: string; build: () => Promise<Blob> } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      let denied = false;
      const [s, p, v] = await Promise.all([
        fetchShipments(projectId),
        fetchProcurementPOs(projectId).catch(() => { denied = true; return [] as ApiProcurementPO[]; }),
        fetchVendors(projectId).catch(() => [] as ApiVendor[]),
      ]);
      setShipments(s); setPOs(p); setVendors(v); setPoAccessDenied(denied);
      // Reset the selection whenever the project changes (the component isn't remounted on nav).
      setActiveId((cur) => (cur && s.some((x) => x._id === cur) ? cur : s[0]?._id || null));
    }
    catch { /* keep */ } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [projectId]);

  // Remarks are edited optimistically and saved on blur; any other row action replaces the whole
  // shipment with the server's copy, which can briefly clobber an in-flight edit. Re-apply the
  // pending text after each replace so the user never sees their typing vanish.
  const pendingRemarks = useRef<Record<string, string>>({});
  const patch = (s: ApiShipment) => setShipments((p) => p.map((x) => x._id === s._id
    ? { ...s, rows: s.rows.map((r) => (r._id in pendingRemarks.current ? { ...r, remarks: pendingRemarks.current[r._id] } : r)) }
    : x));
  const active = shipments.find((s) => s._id === activeId) || null;
  const poOf = (pid: string) => pos.find((x) => x._id === pid);
  const poNo = (pid: string) => { const po = poOf(pid); return po ? `PO ${po.poNo}` : "PO"; };
  // Linked POs are viewable in place: build and preview the PO document without leaving the tab.
  const viewPO = (pid: string) => {
    const po = poOf(pid);
    if (!po) { toast("That purchase order isn't available to you.", "error"); return; }
    setPoPreview({
      title: `Purchase Order ${po.poNo}${po.vendorName ? ` · ${po.vendorName}` : ""}`,
      fileName: `PO_${po.poNo}.pdf`,
      build: async () => (await buildPoPackage(po, vendors.find((v) => v._id === po.vendorId), projectInfo)).blob,
    });
  };

  // Demurrage Cost pinned on top; everything else keeps its stored order.
  const orderedRows = (s: ApiShipment) => [...s.rows.filter((r) => isDemurrage(r.docType)), ...s.rows.filter((r) => !isDemurrage(r.docType))];

  const openCreate = () => { setDraft({ ...BLANK_DRAFT, name: `Shipment ${shipments.length + 1}` }); setPopup({ mode: "create" }); };
  const openEdit = (s: ApiShipment) => {
    setDraft({
      name: s.name, fromLocation: s.fromLocation || "", toLocation: s.toLocation || "", description: s.description || "",
      status: s.status || "Preparing", deadline: s.deadline || "", poIds: s.poIds || [],
      costFreight: s.costFreight || "", costCustoms: s.costCustoms || "", costDemurrage: s.costDemurrage || "", costOther: s.costOther || "",
      trackingNo: s.trackingNo || "", carrier: s.carrier || "", currentLocation: s.currentLocation || "", etaDate: s.etaDate || "", trackingUrl: s.trackingUrl || "",
      containerType: s.containerType || "", containerSize: s.containerSize || "", openBed: !!s.openBed,
      goods: s.goods ? s.goods.map((g) => ({ ...g })) : [], agencyName: s.agencyName || "", agencyContact: s.agencyContact || "", agencyPhone: s.agencyPhone || "", agencyEmail: s.agencyEmail || "",
    });
    setPopup({ mode: "edit", sid: s._id });
  };
  const savePopup = async () => {
    if (!popup) return;
    if (!draft.name.trim()) { toast("Give the shipment a name.", "error"); return; }
    setSaving(true);
    const body: ShipmentInput = {
      name: draft.name.trim(), fromLocation: draft.fromLocation, toLocation: draft.toLocation,
      description: draft.description, status: draft.status, deadline: draft.deadline, poIds: draft.poIds,
      costFreight: draft.costFreight, costCustoms: draft.costCustoms, costDemurrage: draft.costDemurrage, costOther: draft.costOther,
      trackingNo: draft.trackingNo, carrier: draft.carrier, currentLocation: draft.currentLocation, etaDate: draft.etaDate, trackingUrl: draft.trackingUrl,
      containerType: draft.containerType, containerSize: draft.containerSize, openBed: draft.openBed,
      goods: draft.goods, agencyName: draft.agencyName, agencyContact: draft.agencyContact, agencyPhone: draft.agencyPhone, agencyEmail: draft.agencyEmail,
    };
    try {
      if (popup.mode === "create") {
        const s = await createShipment(projectId, body);
        setShipments((p) => [...p, s]); setActiveId(s._id);
      } else if (popup.sid) {
        patch(await updateShipment(projectId, popup.sid, body));
        toast("Shipment updated. Linked Master Log items follow the shipment status automatically.", "success");
      }
      setPopup(null);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save shipment.", "error"); }
    finally { setSaving(false); }
  };
  const removeShipment = async (s: ApiShipment) => {
    if (!(await confirm({ title: "Delete shipment?", message: `This deletes ${s.name} and all its documents.`, confirmLabel: "Delete" }))) return;
    try { await deleteShipment(projectId, s._id); setShipments((p) => { const rest = p.filter((x) => x._id !== s._id); if (activeId === s._id) setActiveId(rest[0]?._id || null); return rest; }); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  const setStatus = async (s: ApiShipment, status: ShipmentStatus) => {
    patch({ ...s, status });
    try { patch(await updateShipment(projectId, s._id, { status })); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not update status.", "error"); }
  };
  const addRow = async () => {
    if (!active) return;
    try { patch(await addShipmentRow(projectId, active._id, "New document")); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not add row.", "error"); }
  };
  const saveRowName = async (rid: string) => {
    if (!active) return;
    setEditRow(null);
    if (!editRowVal.trim()) return;
    try { patch(await renameShipmentRow(projectId, active._id, rid, editRowVal.trim())); }
    catch (err) { toast(err instanceof Error ? err.message : "Rename failed.", "error"); }
  };
  const setRemarks = (rid: string, remarks: string) => {
    if (!active) return;
    pendingRemarks.current[rid] = remarks;
    setShipments((p) => p.map((x) => x._id === active._id ? { ...x, rows: x.rows.map((r) => r._id === rid ? { ...r, remarks } : r) } : x));
  };
  const saveRemarks = (rid: string, remarks: string) => {
    if (!active) return;
    updateShipmentRow(projectId, active._id, rid, { remarks })
      .catch(() => toast("Could not save the remark.", "error"))
      .finally(() => { delete pendingRemarks.current[rid]; });
  };
  const removeRow = async (rid: string) => {
    if (!active) return;
    if (!(await confirm({ title: "Remove row?", message: "This removes the document row and its files.", confirmLabel: "Remove" }))) return;
    try { patch(await deleteShipmentRow(projectId, active._id, rid)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  const upload = async (rid: string, file: File) => {
    if (!active) return;
    try { patch(await uploadShipmentFile(projectId, active._id, rid, file)); }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
  };
  const removeFile = async (rid: string, fid: string) => {
    if (!active) return;
    try { patch(await deleteShipmentFile(projectId, active._id, rid, fid)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };

  if (loading) return <div className="py-12 flex justify-center text-slate-300"><Loader2 size={22} className="animate-spin" /></div>;

  return (
    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-xl font-display font-bold text-slate-900">Shipment</h3>
          <p className="text-xs font-medium text-slate-400 mt-1">Track every delivery — link its POs, set the status (it updates the Master Log automatically) and keep all shipping documents together.</p>
        </div>
        {canEdit && <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary transition-all shrink-0"><Plus size={13} /> New shipment</button>}
      </div>

      {shipments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400"><Ship size={36} className="mb-3" /><p className="font-bold text-sm">No shipments yet.</p>{canEdit && <p className="text-xs">Create Shipment 1 to start tracking documents and status.</p>}</div>
      ) : (
        <>
          {/* Tab-wide overview — every shipment's cost and goods summed. */}
          {(() => {
            const allShipCost = shipments.reduce((s, sh) => s + shipmentTotal(sh), 0);
            const allGoods = shipments.reduce((s, sh) => s + goodsCost(sh.poIds, pos), 0);
            return (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-lg font-display font-bold text-slate-700 leading-none">{shipments.length}</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Shipments</span>
                </span>
                <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/10">
                  <span className="text-lg font-display font-bold text-primary leading-none">{money(allShipCost)}</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total cost of all shipment</span>
                </span>
                <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-100">
                  <span className="text-lg font-display font-bold text-indigo-600 leading-none">{money(allGoods)}</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total cost of all goods</span>
                </span>
              </div>
            );
          })()}

          {/* Shipment sub-tabs */}
          <div className="flex items-center gap-1 flex-wrap bg-slate-50 border border-slate-100 rounded-2xl p-2">
            {shipments.map((s) => (
              <button key={s._id} onClick={() => setActiveId(s._id)} className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-bold text-[11px] transition-all ${activeId === s._id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/60"}`}>
                <Ship size={12} /> {s.name}
                <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider ${STATUS_META[s.status || "Preparing"].cls}`}>{STATUS_META[s.status || "Preparing"].label}</span>
              </button>
            ))}
          </div>

          {active && (
            <div className="space-y-3">
              {/* Shipment info card — everything from the creation popup, at a glance */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h4 className="text-base font-bold text-slate-800 truncate">{active.name}</h4>
                    {projectInfo?.name && <span className="text-[11px] text-slate-400 font-medium truncate">· {projectInfo.name}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit ? (
                      <select value={active.status || "Preparing"} onChange={(e) => setStatus(active, e.target.value as ShipmentStatus)} title="Shipment status — also updates the linked items on the Master Log" className={`px-2.5 py-1 rounded-full text-[10px] font-bold outline-none cursor-pointer border-0 ${STATUS_META[active.status || "Preparing"].cls}`}>
                        {STATUSES.map((st) => <option key={st} value={st}>{STATUS_META[st].label}</option>)}
                      </select>
                    ) : (
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${STATUS_META[active.status || "Preparing"].cls}`}>{STATUS_META[active.status || "Preparing"].label}</span>
                    )}
                    {canEdit && <button onClick={() => openEdit(active)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold hover:border-primary hover:text-primary"><Pencil size={11} /> Edit</button>}
                    {canEdit && <button onClick={() => removeShipment(active)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold hover:bg-red-100"><Trash2 size={12} /> Delete</button>}
                  </div>
                </div>

                {/* CR-PR-08/09 — tracking header: container #, carrier, current location, ETA
                    countdown, container details, and a link to the carrier's tracking page. */}
                <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-[11px]">
                  <div><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Tracking / Container #</p><p className="font-bold text-slate-800 break-all">{active.trackingNo || "—"}</p></div>
                  <div><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Carrier</p><p className="font-bold text-slate-800">{active.carrier || "—"}</p></div>
                  <div><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Current location</p><p className="font-bold text-slate-800">{active.currentLocation || "—"}</p></div>
                  <div><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Anticipated arrival</p><p className="font-bold text-slate-800">{active.etaDate || "—"}{active.etaDate && etaCountdown(active.etaDate) && <span className="text-primary"> ({etaCountdown(active.etaDate)})</span>}</p></div>
                  <div><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Container</p><p className="font-bold text-slate-800">{[active.containerType, active.containerSize].filter(Boolean).join(" · ") || "—"}{active.openBed ? " · Open bed" : ""}</p></div>
                  {active.trackingUrl && <div className="col-span-2 sm:col-span-3 flex items-end"><a href={active.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary font-bold hover:underline"><ExternalLink size={11} /> Track on carrier site</a></div>}
                </div>

                {/* CR-PR-09 — items in the shipment + shipping agency. */}
                {((active.goods?.length || 0) > 0 || active.agencyName) && (
                  <div className="rounded-2xl border border-slate-100 p-3 space-y-2">
                    {(active.goods?.length || 0) > 0 && (
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Items ({active.goods!.length})</p>
                        <div className="space-y-0.5">{active.goods!.map((g, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-[11px]"><span className="text-slate-700 font-medium truncate">{g.description || "—"}</span><span className="text-slate-400 whitespace-nowrap">{[g.qty, g.unit].filter(Boolean).join(" ")}</span></div>
                        ))}</div>
                      </div>
                    )}
                    {active.agencyName && <p className="text-[11px] text-slate-500"><span className="font-bold text-slate-400">Shipping agency:</span> {[active.agencyName, active.agencyContact, active.agencyPhone, active.agencyEmail].filter(Boolean).join(" · ")}</p>}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2 text-[11px]">
                  <div className="flex items-start gap-1.5"><MapPin size={12} className="text-slate-400 mt-0.5 shrink-0" /><span><span className="text-slate-400 font-bold">From:</span> <span className="font-bold text-slate-700">{active.fromLocation || "—"}</span></span></div>
                  <div className="flex items-start gap-1.5"><MapPin size={12} className="text-slate-400 mt-0.5 shrink-0" /><span><span className="text-slate-400 font-bold">To:</span> <span className="font-bold text-slate-700">{active.toLocation || "—"}</span></span></div>
                  <div className="flex items-start gap-1.5"><CalendarClock size={12} className="text-slate-400 mt-0.5 shrink-0" /><span><span className="text-slate-400 font-bold">Deadline:</span> <span className={`font-bold ${active.deadline && active.deadline < new Date().toISOString().slice(0, 10) && active.status !== "Delivered" ? "text-red-600" : "text-slate-700"}`}>{active.deadline || "—"}</span></span></div>
                  <div className="flex items-start gap-1.5"><Package size={12} className="text-slate-400 mt-0.5 shrink-0" /><span><span className="text-slate-400 font-bold">POs:</span> {(active.poIds || []).length === 0 ? <span className="font-bold text-slate-700">—</span> : (active.poIds || []).map((pid) => <button key={pid} onClick={() => viewPO(pid)} title={`Open the ${poNo(pid)} document`} className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded bg-white border border-slate-200 font-bold text-slate-600 hover:border-primary hover:text-primary transition-colors"><Eye size={10} /> {poNo(pid)}</button>)}</span></div>
                </div>
                {active.description && <p className="text-[11px] text-slate-500 leading-relaxed"><span className="font-bold text-slate-400">Description:</span> {active.description}</p>}

                {/* Two headline numbers side by side: total shipment cost, and cost of goods
                    (pulled from the linked POs' invoice amounts). */}
                <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-slate-200/70">
                  <div className="flex items-baseline gap-2">
                    <DollarSign size={16} className="text-primary self-center" />
                    <span className="text-2xl font-display font-bold text-primary leading-none">{money(shipmentTotal(active))}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total shipment cost</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <Package size={16} className="text-indigo-500 self-center" />
                    <span className="text-2xl font-display font-bold text-indigo-600 leading-none">{money(goodsCost(active.poIds, pos))}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest" title="Sum of the linked POs' invoice amounts">Cost of goods</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                    {COST_FIELDS.map(([f, label]) => (
                      <span key={f} className="inline-flex items-baseline gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px]">
                        <span className="font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                        <span className="font-bold text-slate-700">{n(active[f]) ? money(n(active[f])) : "—"}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                <table className="w-full min-w-[760px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="text-left px-4 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px] w-64">Document Type</th>
                      <th className="text-left px-4 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Files</th>
                      <th className="text-left px-4 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px] w-56">Remarks</th>
                      {canEdit && <th className="px-3 py-2 w-10" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {orderedRows(active).map((row) => {
                      const dem = isDemurrage(row.docType);
                      return (
                      <tr key={row._id} className={`align-top ${dem ? "bg-slate-100/80 text-slate-400" : "hover:bg-slate-50/40"}`}>
                        <td className={`px-4 py-2.5 font-bold ${dem ? "text-slate-500" : "text-slate-700"}`}>
                          {editRow === row._id ? (
                            <div className="flex items-center gap-1.5">
                              <input autoFocus value={editRowVal} onChange={(e) => setEditRowVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveRowName(row._id)} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10 w-full" />
                              <button onClick={() => saveRowName(row._id)} className="p-1 rounded bg-primary text-white shrink-0"><Check size={12} /></button>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">{row.docType}{canEdit && !isRequiredDoc(row.docType) && <button onClick={() => { setEditRowVal(row.docType); setEditRow(row._id); }} className="text-slate-300 hover:text-primary"><Pencil size={11} /></button>}</span>
                          )}
                          {/* The linked POs surface automatically on the Packing List row — compare the
                              vendor's packing list against these purchase orders. */}
                          {isPackingList(row.docType) && (active.poIds || []).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {(active.poIds || []).map((pid) => (
                                <button
                                  key={pid}
                                  onClick={() => viewPO(pid)}
                                  title={`Open the ${poNo(pid)} document to compare against the packing list`}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/5 border border-primary/15 text-[9px] font-bold text-primary hover:bg-primary hover:text-white transition-colors"
                                >
                                  <Eye size={9} /> {poNo(pid)}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {row.files.map((f) => (
                              <span key={f._id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-white border border-slate-100 text-[10px] font-bold text-slate-600">
                                <a href={attachmentUrl(f.filePath)} target="_blank" rel="noreferrer" className="hover:text-primary max-w-[150px] truncate inline-flex items-center gap-1" title={f.name}><FileText size={10} />{f.name}</a>
                                {canEdit && <button onClick={() => removeFile(row._id, f._id)} className="text-slate-300 hover:text-red-500"><X size={11} /></button>}
                              </span>
                            ))}
                            {row.files.length === 0 && <span className="text-[11px] text-slate-400 italic">No files</span>}
                            {canEdit && <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 cursor-pointer hover:bg-slate-200"><Upload size={10} /> Upload<input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(row._id, f); e.target.value = ""; }} /></label>}
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <input value={row.remarks || ""} disabled={!canEdit} placeholder="—" onChange={(e) => setRemarks(row._id, e.target.value)} onBlur={(e) => saveRemarks(row._id, e.target.value)} className="w-full bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary/20 rounded px-2 py-1.5 text-[11px] font-medium outline-none" />
                        </td>
                        {canEdit && <td className="px-3 py-2.5 text-right">{!isRequiredDoc(row.docType) && <button onClick={() => removeRow(row._id)} className="text-slate-300 hover:text-red-500" title="Remove row"><Trash2 size={13} /></button>}</td>}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {canEdit && <button onClick={addRow} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-600 text-[11px] font-bold hover:border-primary hover:text-primary"><Plus size={12} /> Add document row</button>}
            </div>
          )}
        </>
      )}
      {dialogs}
      {poPreview && <PdfPreviewModal title={poPreview.title} fileName={poPreview.fileName} build={poPreview.build} onClose={() => setPoPreview(null)} />}

      {/* Create / edit shipment popup — the whole shipment record is managed here (CRUD). */}
      {popup && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={() => setPopup(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl my-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2"><Ship size={16} className="text-primary" /><p className="text-sm font-bold text-slate-900">{popup.mode === "create" ? "New shipment" : `Edit ${draft.name || "shipment"}`}</p></div>
              <button onClick={() => setPopup(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shipment name
                  <input className={`${inp} mt-1`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Shipment 1" /></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project
                  <input className={`${inp} mt-1 opacity-70`} value={projectInfo?.name || ""} disabled title="Filled automatically from the project information" /></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">From — origin
                  <input className={`${inp} mt-1`} value={draft.fromLocation} onChange={(e) => setDraft({ ...draft, fromLocation: e.target.value })} placeholder="e.g. Shanghai Port, China" /></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">To — destination
                  <input className={`${inp} mt-1`} value={draft.toLocation} onChange={(e) => setDraft({ ...draft, toLocation: e.target.value })} placeholder={projectInfo?.location ? `e.g. ${projectInfo.location}` : "e.g. project site"} /></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status
                  <select className={`${inp} mt-1 font-bold`} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ShipmentStatus })}>
                    {STATUSES.map((st) => <option key={st} value={st}>{STATUS_META[st].label}</option>)}
                  </select></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Deadline — expected receipt
                  <input type="date" className={`${inp} mt-1`} value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /></label>
              </div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description
                <textarea rows={2} className={`${inp} mt-1 resize-y`} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What's in this shipment…" /></label>

              {/* CR-PR-08/09 — tracking header + container details (entered/pasted manually). */}
              <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Ship size={11} /> Tracking &amp; container</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tracking / Container #
                    <input className={`${inp} mt-1`} value={draft.trackingNo} onChange={(e) => setDraft({ ...draft, trackingNo: e.target.value })} placeholder="e.g. MRKU1234567" /></label>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carrier
                    <input className={`${inp} mt-1`} value={draft.carrier} onChange={(e) => setDraft({ ...draft, carrier: e.target.value })} placeholder="e.g. Maersk" /></label>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current location
                    <input className={`${inp} mt-1`} value={draft.currentLocation} onChange={(e) => setDraft({ ...draft, currentLocation: e.target.value })} placeholder="e.g. Istanbul Port" /></label>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Anticipated arrival
                    <input type="date" className={`${inp} mt-1`} value={draft.etaDate} onChange={(e) => setDraft({ ...draft, etaDate: e.target.value })} /></label>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Container type
                    <input className={`${inp} mt-1`} value={draft.containerType} onChange={(e) => setDraft({ ...draft, containerType: e.target.value })} placeholder="e.g. 40' HC" /></label>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Container size
                    <input className={`${inp} mt-1`} value={draft.containerSize} onChange={(e) => setDraft({ ...draft, containerSize: e.target.value })} placeholder="e.g. 40 ft" /></label>
                  <label className="sm:col-span-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carrier tracking link
                    <input className={`${inp} mt-1`} value={draft.trackingUrl} onChange={(e) => setDraft({ ...draft, trackingUrl: e.target.value })} placeholder="https://www.maersk.com/tracking/…" /></label>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 self-end pb-2"><input type="checkbox" checked={draft.openBed} onChange={(e) => setDraft({ ...draft, openBed: e.target.checked })} /> Open bed / flat rack</label>
                </div>
                <p className="text-[10px] text-slate-400">Paste the latest status from the carrier's site — a live auto-fetch can be added later.</p>
              </div>

              {/* CR-PR-09 — goods in the shipment + shipping agency / forwarder contact. */}
              <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Package size={11} /> Items in this shipment</p>
                  <button onClick={() => setDraft({ ...draft, goods: [...draft.goods, { description: "", qty: "", unit: "" }] })} className="text-[11px] font-bold text-primary hover:underline">+ Add item</button>
                </div>
                {draft.goods.length === 0 && <p className="text-[11px] text-slate-400 italic">No items listed.</p>}
                {draft.goods.map((g, i) => (
                  <div key={i} className="grid grid-cols-6 gap-2 items-center">
                    <input className={`${inp} col-span-4`} placeholder="Description" value={g.description} onChange={(e) => setDraft({ ...draft, goods: draft.goods.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
                    <input className={inp} placeholder="Qty" value={g.qty} onChange={(e) => setDraft({ ...draft, goods: draft.goods.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })} />
                    <div className="flex items-center gap-1"><input className={inp} placeholder="Unit" value={g.unit} onChange={(e) => setDraft({ ...draft, goods: draft.goods.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })} /><button onClick={() => setDraft({ ...draft, goods: draft.goods.filter((_, j) => j !== i) })} className="text-slate-300 hover:text-red-500 shrink-0"><X size={14} /></button></div>
                  </div>
                ))}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <input className={inp} placeholder="Shipping agency" value={draft.agencyName} onChange={(e) => setDraft({ ...draft, agencyName: e.target.value })} />
                  <input className={inp} placeholder="Agency contact" value={draft.agencyContact} onChange={(e) => setDraft({ ...draft, agencyContact: e.target.value })} />
                  <input className={inp} placeholder="Agency phone" value={draft.agencyPhone} onChange={(e) => setDraft({ ...draft, agencyPhone: e.target.value })} />
                  <input className={inp} placeholder="Agency email" value={draft.agencyEmail} onChange={(e) => setDraft({ ...draft, agencyEmail: e.target.value })} />
                </div>
              </div>

              {/* Shipment costs — summed into the total shown on the shipment tab. */}
              <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><DollarSign size={11} /> Shipment costs</p>
                  <span className="text-[11px] font-bold text-primary">Total: {money(shipmentTotal(draft))}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {COST_FIELDS.map(([f, label]) => (
                    <label key={f} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}
                      <input className={`${inp} mt-1`} value={draft[f]} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} placeholder="0.00" /></label>
                  ))}
                </div>
              </div>

              {/* Link purchase orders — the shipment's status will drive these POs' items on the Master Log */}
              <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Link2 size={11} /> Linked purchase orders <span className="font-medium normal-case text-slate-400">— their items follow this shipment's status on the Master Log; shown on the Packing List row</span></p>
                  <button onClick={() => setPoPickerOpen((v) => !v)} className="text-[10px] font-bold text-primary hover:underline shrink-0">{poPickerOpen ? "Done" : "+ Add PO"}</button>
                </div>
                {/* Cost of goods is computed live from the selected POs' invoice amounts. */}
                <div className="flex items-center justify-between gap-2 bg-white rounded-lg border border-slate-100 px-3 py-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cost of goods <span className="normal-case font-medium">— from the linked POs' invoice amounts</span></span>
                  <span className="text-sm font-display font-bold text-indigo-600">{money(goodsCost(draft.poIds, pos))}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {draft.poIds.length === 0 && !poPickerOpen && <span className="text-[11px] text-slate-400 italic">No POs linked yet.</span>}
                  {draft.poIds.map((pid) => (
                    <span key={pid} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-600">
                      {poNo(pid)}
                      <button onClick={() => setDraft({ ...draft, poIds: draft.poIds.filter((x) => x !== pid) })} className="text-slate-300 hover:text-red-500"><X size={11} /></button>
                    </span>
                  ))}
                </div>
                {poPickerOpen && (
                  <div className="max-h-48 overflow-y-auto space-y-1 bg-white rounded-lg border border-slate-100 p-2">
                    {pos.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic px-1 py-2">
                        {poAccessDenied
                          ? "You don't have access to this project's Purchase Orders, so they can't be listed here. Ask the project owner for Purchase Orders access, or upload PO documents manually to the rows below."
                          : "No purchase orders in this project yet — create them in the Purchase Orders tab, or upload PO documents manually to the rows below."}
                      </p>
                    ) : pos.map((po) => (
                      <label key={po._id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs">
                        <input type="checkbox" checked={draft.poIds.includes(po._id)} onChange={(e) => setDraft({ ...draft, poIds: e.target.checked ? [...draft.poIds, po._id] : draft.poIds.filter((x) => x !== po._id) })} />
                        <span className="font-bold text-slate-700">PO {po.poNo}</span>
                        <span className="text-slate-400 truncate">· {po.vendorName || "vendor"} · {po.lineItems.length} item(s)</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setPopup(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Cancel</button>
                <button onClick={savePopup} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{saving && <Loader2 size={12} className="animate-spin" />} {popup.mode === "create" ? "Create shipment" : "Save changes"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
