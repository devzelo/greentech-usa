import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, Upload, X, FileText, Ship, Pencil, Check, MapPin, CalendarClock, Package, Link2, DollarSign, Eye, ExternalLink, Building2, History, RefreshCw, AlertTriangle } from "lucide-react";
import {
  fetchShipments, createShipment, updateShipment, deleteShipment,
  addShipmentRow, renameShipmentRow, updateShipmentRow, deleteShipmentRow, uploadShipmentFile, deleteShipmentFile,
  fetchProcurementPOs, fetchVendors, attachmentUrl,
  fetchTrackingConfig, refreshShipmentTracking, logShipmentTracking, deleteShipmentTracking,
  type ApiShipment, type ApiProcurementPO, type ApiVendor, type ShipmentStatus, type ShipmentInput,
} from "../../lib/api";
import { buildPoPackage } from "../../lib/poPdf";
import PdfPreviewModal from "./PdfPreviewModal";
import type { ProjectPdfInfo } from "../../lib/pdfProjectHeader";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import FormSection from "./FormSection";

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
// Journey progress by status — drives the route visual (CR-PR-08).
const STATUS_PCT: Record<ShipmentStatus, number> = { Preparing: 0, Fabrication: 12, Transit: 55, Clearance: 80, Warehouse: 92, Delivered: 100 };

const inp = "w-full bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10";

// CR-PR-08 — derive a live carrier tracking deep-link from the carrier name + tracking/container #,
// so "Track on carrier site" opens the carrier's own live status page in one click without the user
// pasting a URL. `{n}` is replaced with the tracking number. Unknown carriers fall back to a web
// search for the number. Pulling the status from the carrier itself is CR 219 (server side, off
// until the client names the carrier), so today this link is how the team reads the live status.
const CARRIER_TRACK_TEMPLATES: Array<{ match: RegExp; url: string }> = [
  { match: /maersk/i,                 url: "https://www.maersk.com/tracking/{n}" },
  { match: /msc/i,                    url: "https://www.msc.com/track-a-shipment?agencyPath=msc&trackingNumber={n}" },
  { match: /cma|cgm/i,                url: "https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference={n}" },
  { match: /hapag/i,                  url: "https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container={n}" },
  { match: /cosco/i,                  url: "https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number={n}" },
  { match: /\bone\b|ocean network/i,  url: "https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trackingType=CONTAINER&t={n}" },
  { match: /evergreen/i,              url: "https://www.evergreen-line.com/emodal/cs/CargoTracking.do?f_cmd=track&container_no={n}" },
  { match: /hmm/i,                    url: "https://www.hmm21.com/company/tracking.do?number={n}" },
  { match: /yang ?ming/i,             url: "https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx?container={n}" },
  { match: /zim/i,                    url: "https://www.zim.com/tools/track-a-shipment?consnumber={n}" },
  { match: /\bups\b/i,                url: "https://www.ups.com/track?tracknum={n}" },
  { match: /fedex/i,                  url: "https://www.fedex.com/fedextrack/?trknbr={n}" },
  { match: /usps/i,                   url: "https://tools.usps.com/go/TrackConfirmAction?tLabels={n}" },
  { match: /dhl/i,                    url: "https://www.dhl.com/en/express/tracking.html?AWB={n}" },
  { match: /\btnt\b/i,                url: "https://www.tnt.com/express/en_us/site/shipping-tools/tracking.html?searchType=con&cons={n}" },
];
function carrierTrackingUrl(carrier: string, trackingNo: string, manualUrl?: string): string {
  // A manually pasted URL always wins (override).
  if (manualUrl && manualUrl.trim()) return manualUrl.trim();
  const n = (trackingNo || "").trim();
  if (!n) return "";
  const t = CARRIER_TRACK_TEMPLATES.find((c) => c.match.test(carrier || ""));
  if (t) return t.url.replace("{n}", encodeURIComponent(n));
  // Unknown carrier — best-effort web search for the tracking number.
  return `https://www.google.com/search?q=${encodeURIComponent(`${carrier || ""} tracking ${n}`.trim())}`;
}

type ShipDraft = {
  name: string; fromLocation: string; toLocation: string; description: string;
  status: ShipmentStatus; deadline: string; poIds: string[];
  costFreight: string; costCustoms: string; costDemurrage: string; costOther: string;
  trackingNo: string; carrier: string; currentLocation: string; etaDate: string; trackingUrl: string;
  containerType: string; containerSize: string; openBed: boolean;
  goods: Array<{ description: string; qty: string; unit: string }>;
  agencyName: string; agencyContact: string; agencyPhone: string; agencyEmail: string; agencyWebsite: string; agencyCountry: string;
};
const BLANK_DRAFT: ShipDraft = {
  name: "", fromLocation: "", toLocation: "", description: "", status: "Preparing", deadline: "", poIds: [],
  costFreight: "", costCustoms: "", costDemurrage: "", costOther: "",
  trackingNo: "", carrier: "", currentLocation: "", etaDate: "", trackingUrl: "",
  containerType: "", containerSize: "", openBed: false,
  goods: [], agencyName: "", agencyContact: "", agencyPhone: "", agencyEmail: "", agencyWebsite: "", agencyCountry: "",
};

// CR 219 - a live shipment whose location has not moved in a week needs a look. The server sends
// the project owner the same nudge on Monday mornings.
const STALE_DAYS = 7;
const daysSince = (iso?: string) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);
const checkedLabel = (s: ApiShipment) => {
  const d = daysSince(s.trackingCheckedAt);
  if (d === null) return "No location update yet";
  const when = d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
  return `Updated ${when}${s.trackingSource ? ` · ${s.trackingSource}` : ""}`;
};
const isStale = (s: ApiShipment) => {
  if (s.status === "Delivered" || s.status === "Preparing") return false;
  const d = daysSince(s.trackingCheckedAt);
  return d === null || d >= STALE_DAYS;
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
  const [justAdded, setJustAdded] = useState("");
  const [listPopup, setListPopup] = useState<null | "items" | "pos">(null);   // CR 220 - items / POs pop-up   // CR 218 - the line just created
  // Creation / edit popup — everything about the shipment is editable here (CRUD).
  const [popup, setPopup] = useState<{ mode: "create" | "edit"; sid?: string } | null>(null);
  const [draft, setDraft] = useState<ShipDraft>(BLANK_DRAFT);
  const [poPickerOpen, setPoPickerOpen] = useState(false);
  // CR 219 - automatic tracking when the server has a carrier aggregator key; the manual log always.
  const [trackCfg, setTrackCfg] = useState<{ enabled: boolean; provider: string }>({ enabled: false, provider: "" });
  const [checking, setChecking] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [logDraft, setLogDraft] = useState({ date: "", location: "", description: "", etaDate: "", status: "" as ShipmentStatus | "" });
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
  useEffect(() => {
    fetchTrackingConfig(projectId).then((c) => setTrackCfg({ enabled: c.enabled, provider: c.provider })).catch(() => setTrackCfg({ enabled: false, provider: "" }));
  }, [projectId]);

  // CR 219 - ask the carrier now. Only offered when the server has an aggregator key.
  const checkTrackingNow = async (s: ApiShipment) => {
    setChecking(true);
    try {
      const r = await refreshShipmentTracking(projectId, s._id);
      setShipments((p) => p.map((x) => (x._id === s._id ? r.shipment : x)));
      toast(r.added ? `${r.added} new update${r.added === 1 ? "" : "s"} from ${r.provider}.` : `${r.provider} has nothing newer.`, "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not reach the carrier.", "error"); }
    finally { setChecking(false); }
  };

  // CR 219 fallback - log where the shipment is now (the weekly update), kept in the same history.
  const openLog = (s: ApiShipment) => {
    setLogDraft({ date: new Date().toISOString().slice(0, 10), location: s.currentLocation || "", description: "", etaDate: s.etaDate || "", status: "" });
    setLogOpen(true);
  };
  const saveLog = async (s: ApiShipment) => {
    if (!logDraft.location.trim() && !logDraft.description.trim()) { toast("Add the location or a note.", "error"); return; }
    setSaving(true);
    try {
      const updated = await logShipmentTracking(projectId, s._id, {
        date: logDraft.date, location: logDraft.location.trim(), description: logDraft.description.trim(),
        etaDate: logDraft.etaDate, ...(logDraft.status ? { status: logDraft.status } : {}),
      });
      setShipments((p) => p.map((x) => (x._id === s._id ? updated : x)));
      setLogOpen(false);
      toast("Location updated.", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save the update.", "error"); }
    finally { setSaving(false); }
  };
  const removeLog = async (s: ApiShipment, index: number) => {
    if (!(await confirm({ title: "Delete this update?", message: "It is removed from the tracking history.", confirmLabel: "Delete", danger: true }))) return;
    try {
      const updated = await deleteShipmentTracking(projectId, s._id, index);
      setShipments((p) => p.map((x) => (x._id === s._id ? updated : x)));
    } catch (e) { toast(e instanceof Error ? e.message : "Could not delete the update.", "error"); }
  };

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
      goods: s.goods ? s.goods.map((g) => ({ ...g })) : [], agencyName: s.agencyName || "", agencyContact: s.agencyContact || "", agencyPhone: s.agencyPhone || "", agencyEmail: s.agencyEmail || "", agencyWebsite: s.agencyWebsite || "", agencyCountry: s.agencyCountry || "",
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
      agencyWebsite: draft.agencyWebsite, agencyCountry: draft.agencyCountry,
    };
    try {
      if (popup.mode === "create") {
        const s = await createShipment(projectId, body);
        setShipments((p) => [...p, s]); setActiveId(s._id);
        // CR 218 - "the line did not appear": say it saved, and show which line is the new one.
        setJustAdded(s._id);
        setTimeout(() => setJustAdded((id) => (id === s._id ? "" : id)), 6000);
        toast(`${s.name} added. It is the last line above, and it is open below.`, "success");
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

          {/* CR 218 - the shipment line carries what people look for: where it is now, when it is
              expected, and the deadline right next to the status. */}
          <div className="flex flex-wrap items-stretch gap-1.5 rounded-2xl border border-slate-100 bg-slate-50 p-2">
            {shipments.map((s) => {
              const on = activeId === s._id;
              const eta = etaCountdown(s.etaDate);
              return (
                <button
                  key={s._id}
                  onClick={() => setActiveId(s._id)}
                  className={`min-w-[13rem] rounded-xl px-3 py-2 text-left transition-all ${on ? "bg-white text-slate-900 shadow-sm ring-1 ring-primary/20" : "text-slate-500 hover:bg-white/70"} ${justAdded === s._id ? "ring-2 ring-emerald-300" : ""}`}
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Ship size={12} className="shrink-0" />
                    <span className="text-[11px] font-bold">{s.name}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${STATUS_META[s.status || "Preparing"].cls}`}>{STATUS_META[s.status || "Preparing"].label}</span>
                    {!!s.deadline && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-500" title="Deadline (expected receipt)">Due {s.deadline}</span>}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400">
                    <span className="inline-flex items-center gap-1"><MapPin size={9} className="shrink-0" />{s.currentLocation || s.fromLocation || "Location not set"}</span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock size={9} className="shrink-0" />
                      {s.etaDate ? <>{s.etaDate}{eta ? <span className="text-primary"> ({eta})</span> : null}</> : "Arrival not set"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {active && (
            <div className="space-y-3">
              {/* Shipment info card — everything from the creation popup, at a glance */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <h4 className="text-base font-bold text-slate-800 truncate">{active.name}</h4>
                      {projectInfo?.name && <span className="text-[11px] text-slate-400 font-medium truncate">· {projectInfo.name}</span>}
                    </div>
                    {/* CR 220 - what this shipment is, right under its name. */}
                    {!!active.description && <p className="mt-0.5 max-w-[46rem] truncate text-[11px] text-slate-500" title={active.description}>{active.description}</p>}
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
                  {(() => {
                    const url = carrierTrackingUrl(active.carrier, active.trackingNo, active.trackingUrl);
                    return url ? (
                      <div className="col-span-2 sm:col-span-3 flex items-end">
                        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary font-bold hover:underline">
                          <ExternalLink size={11} /> Track live on {active.carrier ? `${active.carrier} site` : "carrier site"}
                        </a>
                      </div>
                    ) : null;
                  })()}

                  {/* CR 219 - where the location came from and when, then the two ways to move it on:
                      ask the carrier (when this server has a tracking account) or log it by hand. */}
                  <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-primary/10 pt-2">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${isStale(active) ? "text-amber-700" : "text-slate-500"}`}>
                      {isStale(active) ? <AlertTriangle size={11} /> : <History size={11} />} {checkedLabel(active)}
                    </span>
                    {trackCfg.enabled && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700" title={`Checked automatically every day through ${trackCfg.provider}`}>
                        Auto · {trackCfg.provider}
                      </span>
                    )}
                    {canEdit && trackCfg.enabled && (
                      <button onClick={() => void checkTrackingNow(active)} disabled={checking || !active.trackingNo} title={active.trackingNo ? "Ask the carrier now" : "Add the tracking / container number first"} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:border-primary hover:text-primary disabled:opacity-40">
                        {checking ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Check now
                      </button>
                    )}
                    {canEdit && (
                      <button onClick={() => openLog(active)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:border-primary hover:text-primary">
                        <MapPin size={11} /> Log an update
                      </button>
                    )}
                    {(active.trackingEvents?.length || 0) > 0 && (
                      <button onClick={() => setHistoryOpen((v) => !v)} className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                        <History size={11} /> {historyOpen ? "Hide" : "Show"} history ({active.trackingEvents!.length})
                      </button>
                    )}
                    {isStale(active) && (
                      <span className="text-[10px] text-amber-700">Open the carrier page and log where it is now — the owner is reminded every Monday.</span>
                    )}
                  </div>
                </div>

                {/* CR 219 - the trail itself: carrier pulls and hand-logged updates in one list. */}
                {historyOpen && (active.trackingEvents?.length || 0) > 0 && (
                  <ol className="space-y-1.5 rounded-2xl border border-slate-100 p-3">
                    {active.trackingEvents!.map((e, i) => (
                      <li key={`${e.date}-${i}`} className="flex items-start gap-2 text-[11px]">
                        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${i === 0 ? "bg-primary" : "bg-slate-300"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="font-bold text-slate-700">{e.location || e.description || "Update"}</span>
                          {e.location && e.description ? <span className="text-slate-500"> — {e.description}</span> : null}
                          <span className="block text-[10px] text-slate-400">
                            {e.date || "no date"}{e.source ? ` · ${e.source}` : ""}{e.addedBy ? ` · ${e.addedBy}` : ""}
                          </span>
                        </span>
                        {canEdit && e.source === "Manual" && (
                          <button onClick={() => void removeLog(active, i)} title="Delete this update" className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"><Trash2 size={11} /></button>
                        )}
                      </li>
                    ))}
                  </ol>
                )}

                {/* CR-PR-08 — route visual: origin → destination with a progress marker (no external map). */}
                {(active.fromLocation || active.toLocation) && (() => {
                  const pct = STATUS_PCT[active.status || "Preparing"] ?? 0;
                  return (
                    <div className="rounded-2xl border border-slate-100 p-3">
                      <div className="relative h-8 mx-2">
                        <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-slate-200" />
                        <div className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 bg-primary rounded-full" style={{ width: `${pct}%` }} />
                        <span className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-slate-400 ring-2 ring-white" />
                        <span className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-slate-400 ring-2 ring-white" />
                        <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-primary transition-all" style={{ left: `${pct}%` }}><Ship size={16} /></span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mt-1"><span className="truncate max-w-[35%]">{active.fromLocation || "Origin"}</span><span className="text-primary truncate max-w-[30%]">{active.currentLocation || STATUS_META[active.status || "Preparing"].label}</span><span className="truncate max-w-[35%] text-right">{active.toLocation || "Destination"}</span></div>
                      {/* CR 220 - the deadline sits under from / to, once, with the items and POs as links. */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-1.5 text-[11px]">
                        <span className="inline-flex items-center gap-1.5"><CalendarClock size={12} className="shrink-0 text-slate-400" />
                          <span className="font-bold text-slate-400">Deadline:</span>
                          <span className={`font-bold ${active.deadline && active.deadline < new Date().toISOString().slice(0, 10) && active.status !== "Delivered" ? "text-red-600" : "text-slate-700"}`}>{active.deadline || "—"}</span>
                        </span>
                        <button onClick={() => setListPopup("items")} className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline">
                          <Package size={12} /> See items ({active.goods?.length || 0})
                        </button>
                        <button onClick={() => setListPopup("pos")} className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline">
                          <Link2 size={12} /> POs ({(active.poIds || []).length})
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* CR 220 - the shipping agency is who you call: its own block, not a footnote. */}
                {(active.agencyName || active.agencyContact || active.agencyEmail || active.agencyPhone) && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-amber-800"><Building2 size={11} className="text-amber-600" /> Shipping agency</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-4">
                      <div><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Company</p><p className="truncate font-bold text-slate-800" title={active.agencyName}>{active.agencyName || "—"}</p></div>
                      <div><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Website</p>
                        {active.agencyWebsite
                          ? <a href={/^https?:/i.test(active.agencyWebsite) ? active.agencyWebsite : `https://${active.agencyWebsite}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-primary hover:underline"><ExternalLink size={10} /> {active.agencyWebsite}</a>
                          : <span className="font-bold text-slate-800">—</span>}
                      </div>
                      <div><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Point of contact</p>
                        <p className="truncate font-bold text-slate-800">{active.agencyContact || "—"}</p>
                        {(active.agencyPhone || active.agencyEmail) && <p className="truncate text-[10px] text-slate-500">{[active.agencyPhone, active.agencyEmail].filter(Boolean).join(" · ")}</p>}
                      </div>
                      <div><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Country</p><p className="truncate font-bold text-slate-800">{active.agencyCountry || "—"}</p></div>
                    </div>
                  </div>
                )}

                {/* CR 220 - from / to, the deadline, the items and the POs live on the route strip
                    above and the description under the title: nothing is said twice. */}

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

      {/* CR 219 - the manual side of tracking: where it is now, when it is expected, in one small form. */}
      {logOpen && active && (
        <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={() => setLogOpen(false)}>
          <div className="my-20 w-full max-w-md rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><MapPin size={15} className="text-primary" /> Update {active.name}</p>
              <button onClick={() => setLogOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X size={18} /></button>
            </div>
            <div className="space-y-3 p-5">
              {(() => {
                const url = carrierTrackingUrl(active.carrier, active.trackingNo, active.trackingUrl);
                return url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-xl bg-primary/5 px-3 py-2 text-[11px] font-bold text-primary hover:underline">
                    <ExternalLink size={12} /> Open {active.carrier || "the carrier"} tracking for {active.trackingNo || "this shipment"}
                  </a>
                ) : null;
              })()}
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Date</span>
                  <input type="date" value={logDraft.date} onChange={(e) => setLogDraft({ ...logDraft, date: e.target.value })} className={`${inp} mt-1`} /></label>
                <label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Anticipated arrival</span>
                  <input type="date" value={logDraft.etaDate} onChange={(e) => setLogDraft({ ...logDraft, etaDate: e.target.value })} className={`${inp} mt-1`} /></label>
              </div>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Current location</span>
                <input autoFocus value={logDraft.location} onChange={(e) => setLogDraft({ ...logDraft, location: e.target.value })} placeholder="e.g. Istanbul Port" className={`${inp} mt-1`} /></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Note (optional)</span>
                <input value={logDraft.description} onChange={(e) => setLogDraft({ ...logDraft, description: e.target.value })} placeholder="e.g. Vessel departed, next port Valencia" className={`${inp} mt-1`} /></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Move the status (optional)</span>
                <select value={logDraft.status} onChange={(e) => setLogDraft({ ...logDraft, status: e.target.value as ShipmentStatus | "" })} className={`${inp} mt-1`}>
                  <option value="">Leave as {STATUS_META[active.status || "Preparing"].label}</option>
                  {STATUSES.map((st) => <option key={st} value={st}>{STATUS_META[st].label}</option>)}
                </select></label>
              <p className="text-[10px] text-slate-400">Saved to this shipment's tracking history. Changing the status also moves the linked POs' items on the Master Log.</p>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setLogOpen(false)} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
                <button onClick={() => void saveLog(active)} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-50">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save update
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / edit shipment popup — the whole shipment record is managed here (CRUD). */}
      {/* CR 220 - the items and the POs open as a list instead of filling the card. */}
      {listPopup && active && (
        <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={() => setListPopup(null)}>
          <div className="my-16 w-full max-w-lg rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <p className="text-sm font-bold text-slate-900">
                {listPopup === "items" ? `Items in ${active.name}` : `Purchase orders on ${active.name}`}
                <span className="ml-2 text-[11px] font-bold text-slate-400">{listPopup === "items" ? (active.goods?.length || 0) : (active.poIds || []).length}</span>
              </p>
              <button onClick={() => setListPopup(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X size={18} /></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-5">
              {listPopup === "items" ? (
                (active.goods?.length || 0) === 0
                  ? <p className="py-6 text-center text-sm italic text-slate-400">No items listed on this shipment.</p>
                  : (
                    <table className="w-full text-left text-xs">
                      <thead><tr className="border-b border-slate-100 text-[10px] uppercase tracking-widest text-slate-400"><th className="py-2">Description</th><th className="w-16 py-2">Qty</th><th className="w-20 py-2">Unit</th></tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {active.goods!.map((g, i) => (
                          <tr key={i}><td className="py-2 font-medium text-slate-700">{g.description || "—"}</td><td className="py-2 text-slate-500">{g.qty || "—"}</td><td className="py-2 text-slate-500">{g.unit || "—"}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )
              ) : (
                (active.poIds || []).length === 0
                  ? <p className="py-6 text-center text-sm italic text-slate-400">No purchase orders linked to this shipment.</p>
                  : (
                    <div className="space-y-1.5">
                      {(active.poIds || []).map((pid) => (
                        <button key={pid} onClick={() => { setListPopup(null); viewPO(pid); }} className="flex w-full items-center gap-2 rounded-xl border border-transparent p-2.5 text-left hover:border-slate-100 hover:bg-slate-50">
                          <Eye size={14} className="shrink-0 text-primary" />
                          <span className="min-w-0 flex-grow truncate text-sm font-bold text-slate-700">{poNo(pid)}</span>
                          <span className="text-[10px] font-bold text-slate-400">Open the document</span>
                        </button>
                      ))}
                    </div>
                  )
              )}
            </div>
          </div>
        </div>
      )}

      {popup && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2"><Ship size={16} className="text-primary" /><p className="text-sm font-bold text-slate-900">{popup.mode === "create" ? "New shipment" : `Edit ${draft.name || "shipment"}`}</p></div>
              <button onClick={() => setPopup(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shipment name
                  <input className={`${inp} mt-1`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Shipment 1" /></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project
                  <input className={`${inp} mt-1 opacity-70`} value={projectInfo?.name || ""} disabled title="Filled automatically from the project information" /></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">From (origin)
                  <input className={`${inp} mt-1`} value={draft.fromLocation} onChange={(e) => setDraft({ ...draft, fromLocation: e.target.value })} placeholder="e.g. Shanghai Port, China" /></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">To (destination)
                  <input className={`${inp} mt-1`} value={draft.toLocation} onChange={(e) => setDraft({ ...draft, toLocation: e.target.value })} placeholder={projectInfo?.location ? `e.g. ${projectInfo.location}` : "e.g. project site"} /></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status
                  <select className={`${inp} mt-1 font-bold`} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ShipmentStatus })}>
                    {STATUSES.map((st) => <option key={st} value={st}>{STATUS_META[st].label}</option>)}
                  </select></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Deadline (expected receipt)
                  <input type="date" className={`${inp} mt-1`} value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /></label>
              </div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description
                <textarea rows={2} className={`${inp} mt-1 resize-y`} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What's in this shipment…" /></label>

              {/* CR-PR-08/09 — tracking header + container details (entered/pasted manually). */}
              {/* CR 217 - each part of the form is its own section, with its own colour. */}
              <FormSection tone="blue" icon={<Ship size={11} />} title="Tracking & container">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                  <label className="sm:col-span-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carrier tracking link <span className="normal-case text-slate-300">(optional, auto-derived)</span>
                    <input className={`${inp} mt-1`} value={draft.trackingUrl} onChange={(e) => setDraft({ ...draft, trackingUrl: e.target.value })} placeholder="Leave blank to auto-link from carrier + number" /></label>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 self-end pb-2"><input type="checkbox" checked={draft.openBed} onChange={(e) => setDraft({ ...draft, openBed: e.target.checked })} /> Open bed / flat rack</label>
                </div>
              </FormSection>

              {/* CR-PR-09 — goods in the shipment. */}
              <FormSection
                tone="emerald"
                icon={<Package size={11} />}
                title="Items in this shipment"
                right={<button onClick={() => setDraft({ ...draft, goods: [...draft.goods, { description: "", qty: "", unit: "" }] })} className="text-[11px] font-bold text-primary hover:underline">+ Add item</button>}
              >
                {draft.goods.length === 0 && <p className="text-[11px] text-slate-400 italic">No items listed.</p>}
                {draft.goods.length > 0 && (
                  <div className="grid grid-cols-6 gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <span className="col-span-4">Description</span><span>Qty</span><span>Unit</span>
                  </div>
                )}
                {draft.goods.map((g, i) => (
                  <div key={i} className="grid grid-cols-6 gap-2 items-center">
                    <input className={`${inp} col-span-4`} placeholder="Description" value={g.description} onChange={(e) => setDraft({ ...draft, goods: draft.goods.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
                    <input className={inp} placeholder="Qty" value={g.qty} onChange={(e) => setDraft({ ...draft, goods: draft.goods.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })} />
                    <div className="flex items-center gap-1"><input className={inp} placeholder="Unit" value={g.unit} onChange={(e) => setDraft({ ...draft, goods: draft.goods.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })} /><button onClick={() => setDraft({ ...draft, goods: draft.goods.filter((_, j) => j !== i) })} className="text-slate-300 hover:text-red-500 shrink-0"><X size={14} /></button></div>
                  </div>
                ))}
              </FormSection>

              {/* CR-PR-09 — the shipping agency / forwarder, its own section with the titles above
                  the fields (a placeholder title disappeared as soon as something was typed). */}
              <FormSection tone="amber" icon={<Building2 size={11} />} title="Shipping agency">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Agency name
                    <input className={`${inp} mt-1`} placeholder="e.g. DHL Global Forwarding" value={draft.agencyName} onChange={(e) => setDraft({ ...draft, agencyName: e.target.value })} /></label>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contact person
                    <input className={`${inp} mt-1`} placeholder="e.g. John Mensah" value={draft.agencyContact} onChange={(e) => setDraft({ ...draft, agencyContact: e.target.value })} /></label>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phone
                    <input type="tel" className={`${inp} mt-1`} placeholder="e.g. +233 20 000 0000" value={draft.agencyPhone} onChange={(e) => setDraft({ ...draft, agencyPhone: e.target.value })} /></label>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email
                    <input type="email" className={`${inp} mt-1`} placeholder="e.g. ops@agency.com" value={draft.agencyEmail} onChange={(e) => setDraft({ ...draft, agencyEmail: e.target.value })} /></label>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Website
                    <input className={`${inp} mt-1`} placeholder="e.g. dhl.com" value={draft.agencyWebsite} onChange={(e) => setDraft({ ...draft, agencyWebsite: e.target.value })} /></label>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Country
                    <input className={`${inp} mt-1`} placeholder="e.g. Ghana" value={draft.agencyCountry} onChange={(e) => setDraft({ ...draft, agencyCountry: e.target.value })} /></label>
                </div>
              </FormSection>

              {/* Shipment costs — summed into the total shown on the shipment tab. */}
              <FormSection
                tone="violet"
                icon={<DollarSign size={11} />}
                title="Shipment costs"
                right={<span className="text-[11px] font-bold text-primary">Total: {money(shipmentTotal(draft))}</span>}
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {COST_FIELDS.map(([f, label]) => (
                    <label key={f} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}
                      <input className={`${inp} mt-1`} value={draft[f]} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} placeholder="0.00" /></label>
                  ))}
                </div>
              </FormSection>

              {/* Link purchase orders — the shipment's status will drive these POs' items on the Master Log */}
              <FormSection
                tone="slate"
                icon={<Link2 size={11} />}
                title="Linked purchase orders"
                hint="Their items follow this shipment's status on the Master Log and show on the Packing List row."
                right={<button onClick={() => setPoPickerOpen((v) => !v)} className="text-[10px] font-bold text-primary hover:underline shrink-0">{poPickerOpen ? "Done" : "+ Add PO"}</button>}
              >
                {/* Cost of goods is computed live from the selected POs' invoice amounts. */}
                <div className="flex items-center justify-between gap-2 bg-white rounded-lg border border-slate-100 px-3 py-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cost of goods <span className="normal-case font-medium">(from the linked POs' invoice amounts)</span></span>
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
                          : "No purchase orders in this project yet. Create them in the Purchase Orders tab, or upload PO documents manually to the rows below."}
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
              </FormSection>

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
