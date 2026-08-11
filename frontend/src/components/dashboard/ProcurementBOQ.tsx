import { Fragment, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Plus, Trash2, Upload, Download, Loader2, Ban, RotateCcw, ChevronDown, ChevronRight, Pencil, Eye, Copy, ArrowUp, ArrowDown, ChevronsUpDown, ExternalLink, Search, Settings2, Check, Lock, Unlock, FileText, X } from "lucide-react";
import {
  fetchProcurementSections, addProcurementSection, updateProcurementSection, deleteProcurementSection,
  fetchProcurementItems, addProcurementItem, updateProcurementItem, cancelProcurementItem, restoreProcurementItem,
  deleteProcurementItem, bulkAddProcurementItems, fetchSubmittals, fetchProcurementItemRevisions,
  createRfq, uploadDocument, uploadProcurementItemFile, deleteProcurementItemFile, attachmentUrl,
  type ApiProcurementSection, type ApiProcurementItem, type ProcurementItemInput, type ApiSubmittal, type ApiProcurementItemRevision,
} from "../../lib/api";
import { buildRfqPdf } from "../../lib/rfqPdf";
import { fetchSavedDocuments, saveDocumentVersion, updateSavedDocument, deleteSavedDocument } from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import { buildBoqPdf } from "../../lib/boqPdf";
import { buildSubmittalPackage } from "../../lib/submittalPackage";
import type { ProjectPdfInfo } from "../../lib/pdfProjectHeader";
import PdfPreviewModal from "./PdfPreviewModal";
import PresenceBar from "./PresenceBar";
import { useBuilderPresence } from "../../lib/usePresence";
import SavedVersionsPanel from "./SavedVersionsPanel";

const DEFAULT_SECTIONS = ["Electrical", "Civil", "Mechanical"];

// G1/G2 — "BOQ" reads as "Not Started" (light-yellow warning) without changing the stored value.
const statusLabel = (s: string) => (s === "BOQ" ? "Not Started" : s);
const statusCls = (s: string) => (s === "BOQ" ? "bg-yellow-50 text-yellow-700" : s === "Cancelled" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500");

// C3 — auto-growing multi-line cell (Enter = new line, grows with content), same as the
// Expenses/Invoices "Remarks" cell. Local copy to avoid touching ProjectWorkspace.
function AutoCell({ value, onChange, onBlur, className, disabled }: {
  value: string; onChange: (v: string) => void; onBlur?: (v: string) => void; className?: string; disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const resize = () => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } };
  useEffect(() => { resize(); }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      disabled={disabled}
      onChange={(e) => { onChange(e.target.value); resize(); }}
      onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
      className={`resize-none overflow-hidden whitespace-pre-wrap ${className || ""}`}
    />
  );
}

// order-by date = need-on-site − lead-time(days)
function orderByDate(needOnSite: string, leadDays: string): string {
  if (!needOnSite) return "";
  const days = parseInt(String(leadDays).replace(/[^0-9]/g, ""), 10);
  if (!isFinite(days) || !days) return needOnSite;
  const d = new Date(needOnSite);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const cell = "w-full px-2 py-1.5 rounded bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none text-xs font-medium";

// A not-yet-saved new BOQ row. Edited locally, then created in one shot via the ✓ button.
type DraftItem = { tempId: string; sectionId: string; description: string; manufacturer: string; modelNo: string; qty: string; unit: string; spec: string; needOnSiteDate: string; leadTimeDays: string; remarks: string };
const BLANK_DRAFT = (sectionId: string): DraftItem => ({ tempId: `draft-${Date.now()}-${Math.round(Math.random() * 1e6)}`, sectionId, description: "", manufacturer: "", modelNo: "", qty: "", unit: "", spec: "", needOnSiteDate: "", leadTimeDays: "", remarks: "" });

// Column sorting for each category table (like the Master Log).
const num = (s: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
type BoqSortKey = "displayNo" | "revNo" | "description" | "manufacturer" | "modelNo" | "vendorName" | "qty" | "unit" | "spec" | "needOnSiteDate" | "leadTimeDays" | "orderBy" | "submittal" | "status";
const STATUS_SORT = ["BOQ", "RFQ_Sent", "Quoted", "PO_Sent", "Invoiced", "Ordered", "Fabrication", "Transit", "OnSite", "Complete", "Cancelled"];
const BOQ_COLS: Array<{ label: string; key: BoqSortKey | null }> = [
  { label: "#", key: "displayNo" }, { label: "RV", key: "revNo" }, { label: "Description", key: "description" },
  { label: "Brand", key: "manufacturer" }, { label: "Model", key: "modelNo" }, { label: "Vendor", key: "vendorName" }, { label: "Qty", key: "qty" },
  { label: "Unit", key: "unit" }, { label: "Spec", key: "spec" }, { label: "Need on site", key: "needOnSiteDate" },
  { label: "Lead (d)", key: "leadTimeDays" }, { label: "Order by", key: "orderBy" }, { label: "Submittal", key: "submittal" },
  { label: "Status", key: "status" }, { label: "", key: null },
];

const DISPO_CLS: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-600", Approved: "bg-emerald-50 text-emerald-600", ApprovedAsNoted: "bg-emerald-50 text-emerald-600",
  ReviseResubmit: "bg-orange-50 text-orange-600", Rejected: "bg-red-50 text-red-600",
};
const DISPO_LABEL: Record<string, string> = { Pending: "Pending", Approved: "Approved", ApprovedAsNoted: "Appr. as Noted", ReviseResubmit: "Revise", Rejected: "Rejected" };

export default function ProcurementBOQ({ projectId, canEdit, projectInfo, onGoToSubmittals, onGoToRFQ }: { projectId: string; canEdit: boolean; projectInfo?: ProjectPdfInfo; onGoToSubmittals?: (itemId?: string) => void; onGoToRFQ?: (rfqId?: string) => void; onGoToPO?: () => void }) {
  const present = useBuilderPresence(projectId ? `boq:${projectId}` : null, "the BOQ"); // CR-B-01
  const [sections, setSections] = useState<ApiProcurementSection[]>([]);
  const [items, setItems] = useState<ApiProcurementItem[]>([]);
  // New items are entered as local DRAFTS first — filled in, then saved once with the ✓ button.
  // This avoids the create-then-patch-each-field flow that was spawning spurious revisions.
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [submittals, setSubmittals] = useState<ApiSubmittal[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [linePreview, setLinePreview] = useState<{ item: ApiProcurementItem; extras: ApiProcurementItem[] } | null>(null); // CR-P-14 — per-line export (+ optional past revisions)
  // CR-P-14 — exporting a line asks whether to include its past revisions; if yes, each older
  // version is appended as its own row (labelled "(RV n)") so the full history prints.
  const openLineExport = async (it: ApiProcurementItem) => {
    let extras: ApiProcurementItem[] = [];
    try {
      const revs = revisions[it._id] ?? await fetchProcurementItemRevisions(projectId, it._id);
      if (revs.length && await confirm({ title: "Include past revisions?", message: `This line has ${revs.length} earlier revision${revs.length === 1 ? "" : "s"}. Include the older versions in the export, or export the current version only?`, confirmLabel: "Include past", cancelLabel: "Current only", danger: false })) {
        extras = revs.map((r) => ({ ...it, description: `${it.description || ""} (RV${r.revNo})`, manufacturer: r.manufacturer, modelNo: r.modelNo, qty: r.qty, unit: r.unit, spec: r.spec, needOnSiteDate: r.needOnSiteDate }));
      }
    } catch { /* proceed with current only */ }
    setLinePreview({ item: it, extras });
  };
  const [subMenu, setSubMenu] = useState<string | null>(null); // itemId whose submittal-link menu is open (C1)
  const [subPreview, setSubPreview] = useState<{ title: string; fileName: string; build: () => Promise<Blob> } | null>(null);
  const [search, setSearch] = useState("");
  // I1 — inline revision history: which rows are expanded + a per-item cache of revisions.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [revisions, setRevisions] = useState<Record<string, ApiProcurementItemRevision[]>>({});
  // §H — multi-select to create an RFQ / PO from picked BOQ items.
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  // BOQ → RFQ confirmation modal: the working list of items to include (rows removable before create).
  const [rfqDraft, setRfqDraft] = useState<ApiProcurementItem[] | null>(null);
  const [manageId, setManageId] = useState<string | null>(null); // §A1 — per-row actions via popup
  // Manage modal edits into a local draft; nothing persists until the user hits Save.
  const [mDraft, setMDraft] = useState<Record<string, string>>({});
  const [mSaving, setMSaving] = useState(false);
  // Import modal: shows the expected column format + template before the user picks a file.
  const [importModal, setImportModal] = useState<{ mode: "new" | "section"; sectionId?: string } | null>(null);
  const { confirm, prompt, dialogs } = useDialogs();

  const loadRevisions = (iid: string) => {
    fetchProcurementItemRevisions(projectId, iid).then((r) => setRevisions((p) => ({ ...p, [iid]: r }))).catch(() => {});
  };
  const toggleRevisions = (iid: string) => {
    setExpanded((p) => ({ ...p, [iid]: !p[iid] }));
    if (!revisions[iid]) loadRevisions(iid);
  };

  // Search filter across items (by description, brand, model, spec, item #).
  const matchItem = (it: ApiProcurementItem) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [it.description, it.manufacturer, it.vendorName, it.modelNo, it.spec, it.itemNo, it.unit].some((v) => String(v || "").toLowerCase().includes(q));
  };

  const load = async () => {
    setLoading(true);
    try {
      const [s, i, subs] = await Promise.all([fetchProcurementSections(projectId), fetchProcurementItems(projectId), fetchSubmittals(projectId).catch(() => [])]);
      setSections(s);
      setItems(i);
      setSubmittals(subs);
    } catch { /* keep empty */ }
    finally { setLoading(false); }
  };
  // itemId → its linked submittal's current disposition (for the BOQ badge).
  const subByItem: Record<string, { rev: number; disposition: string }> = {};
  for (const s of submittals) {
    if (!s.itemId) continue;
    const cur = s.revisions?.find((r) => r.isCurrent) || s.revisions?.[s.revisions.length - 1];
    subByItem[s.itemId] = { rev: s.currentRevisionNo, disposition: cur?.disposition || "Pending" };
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [projectId]);

  const active = items.filter((it) => it.status !== "Cancelled");
  const cancelled = items.filter((it) => it.status === "Cancelled");
  const itemsIn = (sid: string) => active.filter((it) => it.sectionId === sid);
  // I3 — cancelled items stay IN PLACE (shown red), so a section lists active + cancelled together.
  const rowsIn = (sid: string) => items.filter((it) => it.sectionId === sid);
  // C5 — continuous 1..N item numbers across the whole BOQ (active items only, in category order).
  const displayNo: Record<string, number> = {};
  { let k = 0; for (const s of sections) for (const it of rowsIn(s._id)) if (it.status !== "Cancelled") displayNo[it._id] = ++k; }

  // Column-header sorting for every category table. One sort applies across all categories (each
  // sorts its own rows by the chosen column). Click cycles asc → desc → off.
  const [sort, setSort] = useState<{ key: BoqSortKey; dir: 1 | -1 } | null>(null);
  const toggleSort = (key: BoqSortKey) => setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  const sortVal = (it: ApiProcurementItem, key: BoqSortKey): string | number => {
    switch (key) {
      case "displayNo": return displayNo[it._id] ?? Number.MAX_SAFE_INTEGER;
      case "revNo": return it.revNo || 0;
      case "qty": return num(it.qty);
      case "leadTimeDays": return num(it.leadTimeDays);
      case "orderBy": return orderByDate(it.needOnSiteDate, it.leadTimeDays) || "";
      case "needOnSiteDate": return it.needOnSiteDate || "";
      case "submittal": return subByItem[it._id]?.rev ?? -1;
      case "status": { const i = STATUS_SORT.indexOf(it.status); return i === -1 ? 99 : i; }
      case "description": return (it.description || "").toLowerCase();
      case "manufacturer": return (it.manufacturer || "").toLowerCase();
      case "modelNo": return (it.modelNo || "").toLowerCase();
      case "vendorName": return (it.vendorName || "").toLowerCase();
      case "unit": return (it.unit || "").toLowerCase();
      case "spec": return (it.spec || "").toLowerCase();
    }
  };
  const sortItems = (arr: ApiProcurementItem[]): ApiProcurementItem[] => {
    if (!sort) return arr;
    return [...arr].sort((a, b) => {
      const av = sortVal(a, sort.key), bv = sortVal(b, sort.key);
      const aNaN = typeof av === "number" && isNaN(av), bNaN = typeof bv === "number" && isNaN(bv);
      if (aNaN && bNaN) return 0; if (aNaN) return 1; if (bNaN) return -1;
      if (av < bv) return -sort.dir; if (av > bv) return sort.dir; return 0;
    });
  };

  // ── Sections ──────────────────────────────────────────────
  const addSection = async (name: string) => {
    try { const s = await addProcurementSection(projectId, name); setSections((p) => [...p, s]); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not add category.", "error"); }
  };
  // Reorder categories (B3). Renumbers order sequentially and persists whatever changed.
  const moveSection = (sid: string, dir: -1 | 1) => {
    const ordered = [...sections];
    const idx = ordered.findIndex((s) => s._id === sid);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= ordered.length) return;
    [ordered[idx], ordered[j]] = [ordered[j], ordered[idx]];
    const renumbered = ordered.map((s, i) => ({ ...s, order: i }));
    const prevOrder = Object.fromEntries(sections.map((s) => [s._id, s.order]));
    setSections(renumbered);
    renumbered.forEach((s) => { if (prevOrder[s._id] !== s.order) updateProcurementSection(projectId, s._id, { order: s.order }).catch(() => {}); });
  };
  const renameSection = (sid: string, name: string) => setSections((p) => p.map((s) => (s._id === sid ? { ...s, name } : s)));
  const saveSection = (sid: string, name: string) => { updateProcurementSection(projectId, sid, { name }).catch(() => {}); };
  const removeSection = async (sid: string) => {
    const n = itemsIn(sid).length;
    if (!(await confirm({ title: "Delete category?", message: `This deletes the category${n ? ` and its ${n} item(s)` : ""}. Use Cancel on items you need to keep for claims.`, confirmLabel: "Delete category" }))) return;
    try { await deleteProcurementSection(projectId, sid); setSections((p) => p.filter((s) => s._id !== sid)); setItems((p) => p.filter((it) => it.sectionId !== sid)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };

  // ── Items ─────────────────────────────────────────────────
  // CR-P-12 — a new BOQ item opens a POPUP (description, brand, qty, spec, remarks, dates) with
  // Save / Save & docs / Cancel. Files (pictures, catalogue, data sheet, drawing, submittal) need
  // the saved item's id, so "Save & docs" saves then opens Manage to attach them.
  const [addFor, setAddFor] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<DraftItem>(BLANK_DRAFT(""));
  const openAddPopup = (sid: string) => { setAddForm(BLANK_DRAFT(sid)); setAddFor(sid); };
  const setAddField = (field: keyof DraftItem, value: string) => setAddForm((f) => ({ ...f, [field]: value }));
  const saveAddPopup = async (openDocs: boolean) => {
    if (!addFor) return;
    if (!addForm.description.trim()) { toast("Add a description before saving the item.", "error"); return; }
    const nextNo = String(itemsIn(addFor).length + 1);
    try {
      const it = await addProcurementItem(projectId, {
        sectionId: addFor, itemNo: nextNo, description: addForm.description, manufacturer: addForm.manufacturer,
        modelNo: addForm.modelNo, qty: addForm.qty, unit: addForm.unit, spec: addForm.spec, needOnSiteDate: addForm.needOnSiteDate, leadTimeDays: addForm.leadTimeDays, remarks: addForm.remarks,
      });
      setItems((p) => [...p, it]);
      setAddFor(null);
      if (openDocs) setManageId(it._id); else toast("Item added.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not add item.", "error"); }
  };
  // Bulk import (Excel/PDF) still lands as inline review DRAFT rows so many can be verified then saved.
  const addItem = (sid: string) => setDrafts((p) => [...p, BLANK_DRAFT(sid)]);
  const draftsIn = (sid: string) => drafts.filter((d) => d.sectionId === sid);
  const editDraft = (tempId: string, field: keyof DraftItem, value: string) =>
    setDrafts((p) => p.map((d) => (d.tempId === tempId ? { ...d, [field]: value } : d)));
  const removeDraft = (tempId: string) => setDrafts((p) => p.filter((d) => d.tempId !== tempId));
  // Save the draft as a single create (no per-field PATCH → no spurious revisions; the item starts at RV0).
  // CR-P-12 — save the draft as a single create. `openDocs` then opens Manage so the user can
  // attach the item's pictures / catalogue / data sheet / drawing / submittal (files need the
  // saved item's id, so they're added in the step right after creation).
  const saveDraft = async (tempId: string, openDocs = false) => {
    const d = drafts.find((x) => x.tempId === tempId);
    if (!d) return;
    if (!d.description.trim()) { toast("Add a description before saving the item.", "error"); return; }
    const nextNo = String(itemsIn(d.sectionId).length + 1);
    try {
      const it = await addProcurementItem(projectId, {
        sectionId: d.sectionId, itemNo: nextNo, description: d.description, manufacturer: d.manufacturer,
        modelNo: d.modelNo, qty: d.qty, unit: d.unit, spec: d.spec, needOnSiteDate: d.needOnSiteDate, leadTimeDays: d.leadTimeDays, remarks: d.remarks,
      });
      setItems((p) => [...p, it]);
      removeDraft(tempId);
      if (openDocs) setManageId(it._id);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not add item.", "error"); }
  };
  // Duplicate a row (B2) — copies every field into a new item in the same category so
  // near-identical items (1"/2"/3" pipe: same brand/model/spec) take one click, not a retype.
  const duplicateItem = async (src: ApiProcurementItem) => {
    const nextNo = String(itemsIn(src.sectionId).length + 1);
    try {
      const it = await addProcurementItem(projectId, {
        sectionId: src.sectionId, itemNo: nextNo, description: src.description,
        manufacturer: src.manufacturer, modelNo: src.modelNo, qty: src.qty, unit: src.unit,
        spec: src.spec, needOnSiteDate: src.needOnSiteDate, leadTimeDays: src.leadTimeDays,
      });
      setItems((p) => [...p, it]);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not duplicate item.", "error"); }
  };
  // CR-P-13 — Lock an item (or a whole category) so it can't be accidentally changed/deleted.
  const toggleLock = async (it: ApiProcurementItem) => {
    const locked = !it.locked;
    setItems((p) => p.map((x) => (x._id === it._id ? { ...x, locked } : x)));
    try { await updateProcurementItem(projectId, it._id, { locked }); }
    catch (err) { setItems((p) => p.map((x) => (x._id === it._id ? { ...x, locked: !locked } : x))); toast(err instanceof Error ? err.message : "Could not update lock.", "error"); }
  };
  const lockSection = async (sid: string, locked: boolean) => {
    const targets = items.filter((it) => it.sectionId === sid && it.status !== "Cancelled" && !!it.locked !== locked);
    if (!targets.length) return;
    setItems((p) => p.map((x) => (x.sectionId === sid && x.status !== "Cancelled" ? { ...x, locked } : x)));
    try { await Promise.all(targets.map((it) => updateProcurementItem(projectId, it._id, { locked }))); toast(locked ? "Category locked." : "Category unlocked.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not update the category lock.", "error"); }
  };
  // CR-P-12 — per-item reference files.
  const uploadItemFile = async (iid: string, file: File, kind: string) => {
    try { const up = await uploadProcurementItemFile(projectId, iid, file, kind); setItems((p) => p.map((x) => (x._id === iid ? up : x))); }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
  };
  const deleteItemFile = async (iid: string, aid: string) => {
    try { const up = await deleteProcurementItemFile(projectId, iid, aid); setItems((p) => p.map((x) => (x._id === iid ? up : x))); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  // CR-P-13 — edits to an existing line are held locally (dirty) and only persist when the user
  // clicks Save on that row — NEVER on blur — so everything can be verified first. Revert discards.
  const [dirtyRows, setDirtyRows] = useState<Record<string, Record<string, string>>>({});
  const [origRows, setOrigRows] = useState<Record<string, Record<string, string>>>({});
  const editCell = (iid: string, field: keyof ProcurementItemInput, value: string) => {
    const f = field as string;
    setOrigRows((o) => (o[iid] && f in o[iid] ? o : { ...o, [iid]: { ...o[iid], [f]: (items.find((x) => x._id === iid)?.[field as keyof ApiProcurementItem] as string) || "" } }));
    setItems((p) => p.map((it) => (it._id === iid ? { ...it, [field]: value } : it)));
    setDirtyRows((d) => ({ ...d, [iid]: { ...d[iid], [f]: value } }));
  };
  const saveRow = async (iid: string) => {
    const patch = dirtyRows[iid];
    if (!patch || !Object.keys(patch).length) return;
    try {
      const row = await updateProcurementItem(projectId, iid, patch as ProcurementItemInput);
      setItems((p) => p.map((it) => (it._id === iid ? { ...it, revNo: row.revNo } : it)));
      setDirtyRows((d) => { const n = { ...d }; delete n[iid]; return n; });
      setOrigRows((o) => { const n = { ...o }; delete n[iid]; return n; });
      if (expanded[iid]) loadRevisions(iid); // refresh an open history
      toast("Line saved.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Save failed.", "error"); }
  };
  const revertRow = (iid: string) => {
    const o = origRows[iid];
    if (o) setItems((p) => p.map((it) => (it._id === iid ? { ...it, ...o } : it)));
    setDirtyRows((d) => { const n = { ...d }; delete n[iid]; return n; });
    setOrigRows((ov) => { const n = { ...ov }; delete n[iid]; return n; });
  };
  // ── Manage modal: draft-based editing ────────────────────────────────
  const M_FIELDS: (keyof ProcurementItemInput)[] = ["description", "manufacturer", "modelNo", "qty", "unit", "spec", "needOnSiteDate", "leadTimeDays", "remarks"];
  // Seed the draft each time a different item's Manage modal opens.
  useEffect(() => {
    if (!manageId) { setMDraft({}); return; }
    const it = items.find((x) => x._id === manageId);
    if (!it) return;
    const seed: Record<string, string> = {};
    M_FIELDS.forEach((f) => { seed[f as string] = (it[f as keyof ApiProcurementItem] as string) || ""; });
    setMDraft(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageId]);
  const mDirty = (() => {
    if (!manageId) return false;
    const it = items.find((x) => x._id === manageId);
    if (!it) return false;
    return M_FIELDS.some((f) => (mDraft[f as string] ?? "") !== ((it[f as keyof ApiProcurementItem] as string) || ""));
  })();
  const saveManage = async () => {
    if (!manageId) return;
    const it = items.find((x) => x._id === manageId);
    if (!it) return;
    const patch: Record<string, string> = {};
    M_FIELDS.forEach((f) => { if ((mDraft[f as string] ?? "") !== ((it[f as keyof ApiProcurementItem] as string) || "")) patch[f as string] = mDraft[f as string] ?? ""; });
    if (Object.keys(patch).length === 0) { setManageId(null); return; }
    setMSaving(true);
    try {
      const row = await updateProcurementItem(projectId, manageId, patch);
      setItems((p) => p.map((x) => (x._id === manageId ? { ...x, ...patch, revNo: row.revNo } : x)));
      if (expanded[manageId]) loadRevisions(manageId);
      setManageId(null);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save.", "error"); }
    finally { setMSaving(false); }
  };
  const closeManage = async () => {
    if (mDirty && !(await confirm({ title: "Discard changes?", message: "You have unsaved edits to this item. Close without saving?", confirmLabel: "Discard" }))) return;
    setManageId(null);
  };

  const cancelItem = async (iid: string) => {
    const reason = await prompt({ title: "Cancel item", label: "Reason for cancelling (kept on record for claims)", placeholder: "e.g. client cancelled the kitchen", confirmLabel: "Cancel item" });
    if (reason === null) return;
    try {
      const it = await cancelProcurementItem(projectId, iid, reason);
      setItems((p) => p.map((x) => (x._id === iid ? it : x)));
      loadRevisions(iid); // the cancellation is now logged as a revision — refresh the RV history
    }
    catch (err) { toast(err instanceof Error ? err.message : "Could not cancel.", "error"); }
  };
  const restoreItem = async (iid: string) => {
    const reason = await prompt({ title: "Restore item", label: "Reason for restoring (kept on record)", placeholder: "e.g. client reinstated the kitchen", confirmLabel: "Restore item" });
    if (reason === null) return;
    try {
      const it = await restoreProcurementItem(projectId, iid, reason);
      setItems((p) => p.map((x) => (x._id === iid ? it : x)));
      loadRevisions(iid); // the restore is logged as a revision too — refresh the RV history
    }
    catch (err) { toast(err instanceof Error ? err.message : "Could not restore.", "error"); }
  };
  const hardDelete = async (iid: string) => {
    if (!(await confirm({ title: "Delete item?", message: "This permanently removes its record — use Cancel instead to keep it for claims.", confirmLabel: "Delete" }))) return;
    try { await deleteProcurementItem(projectId, iid); setItems((p) => p.filter((x) => x._id !== iid)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };

  // ── Excel import ──────────────────────────────────────────
  // Parse an Excel/CSV file into item payloads for a given section.
  const parseSheet = async (file: File, sectionId: string): Promise<ProcurementItemInput[]> => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const pick = (row: Record<string, unknown>, keys: string[]) => {
      for (const k of Object.keys(row)) {
        const lk = k.toLowerCase().trim();
        if (keys.some((kw) => lk.includes(kw))) return String(row[k] ?? "").trim();
      }
      return "";
    };
    return rows.map((r, idx) => ({
      sectionId,
      itemNo: pick(r, ["item no", "item #", "item", "no", "#"]) || String(idx + 1),
      description: pick(r, ["description", "desc", "material", "name"]),
      manufacturer: pick(r, ["brand", "manufacturer", "make"]),
      modelNo: pick(r, ["model", "part"]),
      qty: pick(r, ["qty", "quantity"]),
      unit: pick(r, ["unit", "uom"]),
      spec: pick(r, ["spec", "size"]),
    }));
  };

  // Turn parsed import rows into local DRAFTS (CR-P-13 — imports must NOT auto-save;
  // the user reviews every row, then saves them explicitly via "Save all").
  const payloadToDrafts = (payload: ProcurementItemInput[], sectionId: string, tag: string): DraftItem[] =>
    payload.map((p, i) => ({
      tempId: `${tag}-${Date.now()}-${i}-${Math.round(Math.random() * 1e6)}`,
      sectionId,
      description: p.description || "", manufacturer: p.manufacturer || "", modelNo: p.modelNo || "",
      qty: String(p.qty ?? ""), unit: p.unit || "", spec: p.spec || "", needOnSiteDate: "", leadTimeDays: "", remarks: "",
    }));

  // Import a file's rows INTO an existing category (B1 — the per-category import button).
  // Rows land as unsaved drafts (yellow "Not saved") so nothing is committed without review.
  const importIntoSection = async (file: File, sectionId: string) => {
    setBusy(true);
    try {
      const payload = await parseSheet(file, sectionId);
      if (!payload.length) { toast("That sheet looks empty.", "error"); return; }
      const newDrafts = payloadToDrafts(payload, sectionId, "imp");
      setDrafts((p) => [...p, ...newDrafts]);
      setCollapsed((c) => ({ ...c, [sectionId]: false }));
      const secName = sections.find((s) => s._id === sectionId)?.name || "category";
      toast(`${newDrafts.length} row(s) added to "${secName}" as drafts — review, then Save all.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not read that file. Use a .xlsx or .csv.", "error");
    } finally { setBusy(false); }
  };

  // Give the user a ready-made Excel template so their columns match what the importer reads.
  // Only these six are needed here; dates / lead time can be filled in per row afterwards.
  const downloadImportTemplate = () => {
    const header = ["Description", "Brand", "Model", "Quantity", "Unit", "Spec"];
    const example = ["e.g. 4-core 16mm² XLPE power cable", "Nexans", "XLPE-16", "2500", "m", "Black, 0.6/1kV"];
    const ws = XLSX.utils.aoa_to_sheet([header, example]);
    ws["!cols"] = [{ wch: 38 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOQ items");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "BOQ-import-template.xlsx";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Top-level import: creates a fresh (empty) category named after the file, then loads
  // its rows in as drafts for review (CR-P-13 — no auto-save of the items themselves).
  const importAsNewSection = async (file: File) => {
    setBusy(true);
    try {
      const sectionName = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Imported";
      const section = await addProcurementSection(projectId, sectionName);
      setSections((p) => [...p, section]);
      const payload = await parseSheet(file, section._id);
      if (!payload.length) { toast(`Created empty category "${sectionName}" — that sheet had no rows.`, "error"); return; }
      const newDrafts = payloadToDrafts(payload, section._id, "imp");
      setDrafts((p) => [...p, ...newDrafts]);
      toast(`${newDrafts.length} row(s) loaded into new category "${sectionName}" as drafts — review, then Save all.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not read that file. Use a .xlsx or .csv.", "error");
    } finally { setBusy(false); }
  };

  // Bulk-save / discard the drafts in a category (CR-P-13 — explicit, reviewed commit).
  const saveAllDrafts = async (sid: string) => {
    const ds = drafts.filter((d) => d.sectionId === sid && d.description.trim());
    if (!ds.length) { toast("Add a description to each row before saving.", "error"); return; }
    setBusy(true);
    try {
      const base = itemsIn(sid).length;
      const payload: ProcurementItemInput[] = ds.map((d, i) => ({
        sectionId: sid, itemNo: String(base + i + 1), description: d.description, manufacturer: d.manufacturer,
        modelNo: d.modelNo, qty: d.qty, unit: d.unit, spec: d.spec, needOnSiteDate: d.needOnSiteDate, leadTimeDays: d.leadTimeDays,
      }));
      const created = await bulkAddProcurementItems(projectId, payload);
      setItems((p) => [...p, ...created]);
      const savedIds = new Set(ds.map((d) => d.tempId));
      setDrafts((p) => p.filter((d) => !savedIds.has(d.tempId)));
      toast(`Saved ${created.length} item(s).`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save the items.", "error");
    } finally { setBusy(false); }
  };
  const discardAllDrafts = async (sid: string) => {
    const n = draftsIn(sid).length;
    if (!n) return;
    if (!(await confirm({ title: "Discard drafts?", message: `Remove ${n} unsaved draft row${n === 1 ? "" : "s"} from this category? They have not been saved.`, confirmLabel: "Discard", danger: true }))) return;
    setDrafts((p) => p.filter((d) => d.sectionId !== sid));
  };

  // Rows grouped by category, numbered continuously (C5) — shared by CSV + Excel export.
  const exportRows = (): string[][] => {
    const out: string[][] = [];
    for (const s of sections) {
      const sec = s.name || "";
      for (const it of rowsIn(s._id)) {
        out.push([sec, it.status === "Cancelled" ? "" : String(displayNo[it._id] ?? ""), it.description, it.manufacturer, it.modelNo, it.vendorName || "", it.qty, it.unit, it.spec, it.needOnSiteDate, it.leadTimeDays, orderByDate(it.needOnSiteDate, it.leadTimeDays), statusLabel(it.status)]);
      }
    }
    return out;
  };

  // ── Export CSV ────────────────────────────────────────────
  const exportCsv = () => {
    const header = ["Category", "Item #", "Description", "Brand", "Model", "Vendor", "Qty", "Unit", "Spec", "Need on site", "Lead (days)", "Order by", "Status"];
    const rowsOut = exportRows();
    const csv = [header, ...rowsOut].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `BOQ.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Build an .xlsx workbook of the BOQ for saving as a frozen version.
  const buildBoqExcelBlob = async (): Promise<Blob> => {
    const header = ["Category", "Item #", "Description", "Brand", "Model", "Vendor", "Qty", "Unit", "Spec", "Need on site", "Lead (days)", "Order by", "Status"];
    const rowsOut = exportRows();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rowsOut]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOQ");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  };

  // §H — bulk actions from the current selection (active items only).
  const toggleSelect = (iid: string) => setSelected((p) => ({ ...p, [iid]: !p[iid] }));
  const selectedItems = active.filter((it) => selected[it._id]);
  // Open the confirmation modal (shows the detailed BOQ rows to be requested; rows removable there).
  const openRfqConfirm = () => { if (selectedItems.length) setRfqDraft(selectedItems); };
  // Confirm → create the RFQ from the (possibly trimmed) list and jump straight into it in the RFQ tab.
  const confirmCreateRfq = async () => {
    const list = rfqDraft || [];
    if (!list.length) { setRfqDraft(null); return; }
    setBulkBusy(true);
    try {
      const rfq = await createRfq(projectId, { lineItems: list.map((it) => ({ itemId: it._id, description: it.description, qty: it.qty, unit: it.unit, spec: it.spec })) });
      // Same auto-save as the RFQ tab's own create — the document must exist in the Documents
      // module regardless of which path created the RFQ. Best-effort.
      try {
        const blob = await buildRfqPdf(rfq, undefined, projectInfo);
        await uploadDocument(projectId, new File([blob], `RFQ_${rfq.rfqNo}.pdf`, { type: "application/pdf" }), "procurement-rfq", true);
      } catch { /* best-effort */ }
      toast(`RFQ ${rfq.rfqNo} created with ${list.length} item(s).`, "success");
      setSelected({}); setRfqDraft(null); await load(); onGoToRFQ?.(rfq._id);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not create RFQ.", "error"); }
    finally { setBulkBusy(false); }
  };

  if (loading) return <div className="py-12 flex justify-center text-slate-300"><Loader2 size={22} className="animate-spin" /></div>;

  const selCol = canEdit; // show the checkbox column only to editors
  const colCount = BOQ_COLS.length + (selCol ? 1 : 0);

  return (
    <div className="space-y-5">
    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-display font-bold text-slate-900">Bill of Quantity (BOQ)</h3>
            {/* CR-B-01 — who else is in the BOQ right now. */}
            <PresenceBar users={present} />
          </div>
          <p className="text-xs font-medium text-slate-400 mt-1">{active.length} active item{active.length === 1 ? "" : "s"} across {sections.length} categor{sections.length === 1 ? "y" : "ies"}. Cancelled items are kept for claims.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowPreview(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold"><Eye size={13} /> Preview</button>
          <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold"><Download size={13} /> Export</button>
          {canEdit && (
            <button onClick={() => setImportModal({ mode: "new" })} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold" title="Import an Excel/CSV file as a new category.">
              <Upload size={13} /> Import as new category
            </button>
          )}
          {canEdit && <button onClick={() => addSection("New Category")} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary transition-all"><Plus size={13} /> Add Category</button>}
        </div>
      </div>

      {/* C6 — glanceable totals (update live as items are added/duplicated) */}
      {sections.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/10">
            <span className="text-lg font-display font-bold text-primary leading-none">{active.length}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total items</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-lg font-display font-bold text-slate-700 leading-none">{sections.length}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Categories</span>
          </span>
          {cancelled.length > 0 && (
            <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-100">
              <span className="text-lg font-display font-bold text-amber-700 leading-none">{cancelled.length}</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cancelled</span>
            </span>
          )}
        </div>
      )}

      {sections.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-grow">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items by description, brand, model, spec…" className="w-full bg-slate-50 border border-slate-100 rounded-lg pl-9 pr-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10" />
          </div>
          {search && <button onClick={() => setSearch("")} className="text-[11px] font-bold text-slate-500 hover:text-slate-900 px-2">Clear</button>}
        </div>
      )}

      {sections.length === 0 && (
        <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl">
          <p className="text-sm text-slate-400 mb-3">No BOQ categories yet.</p>
          {canEdit && (
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {DEFAULT_SECTIONS.map((n) => (
                <button key={n} onClick={() => addSection(n)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-primary hover:text-white transition-colors">+ {n}</button>
              ))}
              <span className="text-slate-300 text-xs">or import an Excel BOQ above</span>
            </div>
          )}
        </div>
      )}

      {/* §H — selection action bar */}
      {selCol && selectedItems.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 bg-slate-900 text-white rounded-2xl px-4 py-2.5 shadow-lg">
          <span className="text-xs font-bold">{selectedItems.length} item{selectedItems.length === 1 ? "" : "s"} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={openRfqConfirm} disabled={bulkBusy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-slate-900 text-[11px] font-bold hover:bg-primary hover:text-white disabled:opacity-50">
              {bulkBusy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Create RFQ
            </button>
            <button onClick={() => setSelected({})} className="text-[11px] font-bold text-slate-300 hover:text-white px-1">Clear</button>
          </div>
        </div>
      )}

      {sections.map((s, sIdx) => {
        const its = sortItems(rowsIn(s._id).filter(matchItem)); // active + cancelled (in place unless sorted)
        const activeCount = its.filter((it) => it.status !== "Cancelled").length;
        // While searching, hide categories with no matches.
        if (search.trim() && its.length === 0 && draftsIn(s._id).length === 0) return null;
        const isCollapsed = collapsed[s._id];
        return (
          <div key={s._id} className="border border-slate-100 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5">
              <button onClick={() => setCollapsed((c) => ({ ...c, [s._id]: !c[s._id] }))} className="text-slate-400 hover:text-slate-900">
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>
              {canEdit
                ? <input value={s.name} onChange={(e) => renameSection(s._id, e.target.value)} onBlur={(e) => saveSection(s._id, e.target.value)} className="font-bold text-slate-800 text-sm bg-transparent outline-none border-b border-transparent focus:border-primary/30 py-0.5 flex-grow" />
                : <span className="font-bold text-slate-800 text-sm flex-grow">{s.name}</span>}
              <span className="text-[10px] font-bold text-slate-400">{activeCount} item{activeCount === 1 ? "" : "s"}</span>
              {canEdit && (
                <div className="flex items-center">
                  <button onClick={() => moveSection(s._id, -1)} disabled={sIdx === 0} className="p-1 rounded text-slate-300 hover:text-slate-700 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent" title="Move category up"><ArrowUp size={13} /></button>
                  <button onClick={() => moveSection(s._id, 1)} disabled={sIdx === sections.length - 1} className="p-1 rounded text-slate-300 hover:text-slate-700 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent" title="Move category down"><ArrowDown size={13} /></button>
                </div>
              )}
              {canEdit && (() => {
                const active = items.filter((it) => it.sectionId === s._id && it.status !== "Cancelled");
                const allLocked = active.length > 0 && active.every((it) => it.locked);
                return <button onClick={() => lockSection(s._id, !allLocked)} disabled={!active.length} className={`p-1.5 rounded disabled:opacity-30 disabled:hover:bg-transparent ${allLocked ? "text-amber-600 bg-amber-50" : "text-slate-300 hover:text-slate-700 hover:bg-white"}`} title={allLocked ? "Category locked — click to unlock all items" : "Lock all items in this category (prevents accidental changes)"}>{allLocked ? <Lock size={13} /> : <Unlock size={13} />}</button>;
              })()}
              {canEdit && <button onClick={() => removeSection(s._id)} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-white" title="Delete category"><Trash2 size={13} /></button>}
            </div>

            {!isCollapsed && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {selCol && (() => {
                        const sel = its.filter((x) => x.status !== "Cancelled");
                        const allOn = sel.length > 0 && sel.every((x) => selected[x._id]);
                        return <th className="px-3 py-2 w-8"><input type="checkbox" checked={allOn} onChange={(e) => setSelected((p) => { const n = { ...p }; sel.forEach((x) => { n[x._id] = e.target.checked; }); return n; })} title="Select all in this category" /></th>;
                      })()}
                      {BOQ_COLS.map((col, i) => (
                        <th key={i} className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px] whitespace-nowrap">
                          {col.key ? (
                            <button type="button" onClick={() => toggleSort(col.key!)} className={`inline-flex items-center gap-1 uppercase tracking-widest hover:text-slate-800 ${sort?.key === col.key ? "text-slate-800" : ""}`} title="Sort by this column">
                              {col.label}
                              {sort?.key === col.key ? (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ChevronsUpDown size={11} className="text-slate-300" />}
                            </button>
                          ) : col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {its.length === 0 && draftsIn(s._id).length === 0 ? (
                      <tr><td colSpan={colCount} className="px-3 py-5 text-center text-[11px] text-slate-400 italic">No items.{canEdit ? " Add one below." : ""}</td></tr>
                    ) : its.map((it) => {
                      const isCancelled = it.status === "Cancelled";
                      const isLocked = !!it.locked;
                      const rowEdit = canEdit && !isCancelled && !isLocked;   // cancelled (I3) or locked (CR-P-13) rows are read-only
                      const strike = isCancelled ? "line-through text-red-400" : "";
                      const c = (field: keyof ProcurementItemInput, w = "") => (
                        <td className="px-1 py-1 align-top"><input value={(it[field] as string) || ""} onChange={(e) => editCell(it._id, field, e.target.value)} disabled={!rowEdit} className={`${cell} ${w} ${strike}`} /></td>
                      );
                      return (
                        <Fragment key={it._id}>
                        <tr className={isCancelled ? "bg-red-50/50" : (selected[it._id] ? "bg-primary/5" : "hover:bg-slate-50/40")}>
                          {selCol && <td className="px-3 py-2 align-top w-8">{!isCancelled && <input type="checkbox" checked={!!selected[it._id]} onChange={() => toggleSelect(it._id)} />}</td>}
                          <td className="px-3 py-2 align-top w-12 font-bold text-slate-400 whitespace-nowrap">{isCancelled ? "—" : displayNo[it._id]}</td>
                          <td className="px-2 py-2 align-top">{it.revNo > 0 ? (
                            <button onClick={() => toggleRevisions(it._id)} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary" title="Show change history">
                              {expanded[it._id] ? <ChevronDown size={11} /> : <ChevronRight size={11} />} RV{it.revNo}
                            </button>
                          ) : <span className="text-[10px] text-slate-300 px-1.5" title="No changes yet">RV0</span>}</td>
                          <td className="px-1 py-1 align-top"><AutoCell value={(it.description as string) || ""} onChange={(v) => editCell(it._id, "description", v)} disabled={!rowEdit} className={`${cell} min-w-[16rem] w-full align-top ${strike}`} /></td>
                          {c("manufacturer", "w-28")}
                          {c("modelNo", "w-24")}
                          <td className="px-3 py-2 align-top text-[11px] text-slate-500 whitespace-nowrap" title="Accepted vendor — set automatically when a quote is accepted in the RFQ tab">{it.vendorName || "—"}</td>
                          {c("qty", "w-14")}
                          {c("unit", "w-16")}
                          <td className="px-1 py-1 align-top"><AutoCell value={(it.spec as string) || ""} onChange={(v) => editCell(it._id, "spec", v)} disabled={!rowEdit} className={`${cell} min-w-[13rem] w-52 align-top ${strike}`} /></td>
                          <td className="px-1 py-1 align-top"><input type="date" value={it.needOnSiteDate || ""} onChange={(e) => editCell(it._id, "needOnSiteDate", e.target.value)} disabled={!rowEdit} className={`${cell} w-32`} /></td>
                          {c("leadTimeDays", "w-14")}
                          <td className="px-3 py-2 align-top text-[11px] text-slate-500 whitespace-nowrap">{orderByDate(it.needOnSiteDate, it.leadTimeDays) || "—"}</td>
                          <td className="px-3 py-2 align-top whitespace-nowrap relative">{(() => {
                            const sub = submittals.find((s) => s.itemId === it._id);
                            if (!sub) {
                              // No package yet (C1): offer to go create one.
                              return onGoToSubmittals
                                ? <button onClick={() => onGoToSubmittals(it._id)} className="text-slate-300 hover:text-primary text-[10px] font-bold" title="No submittal yet — create one in the Submittals tab">+ Submittal</button>
                                : <span className="text-slate-300 text-[10px]">—</span>;
                            }
                            const meta = subByItem[it._id];
                            return (
                              <>
                                <button onClick={() => setSubMenu(subMenu === it._id ? null : it._id)} className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer hover:ring-2 hover:ring-primary/20 ${DISPO_CLS[meta.disposition] || "bg-slate-100 text-slate-500"}`} title="Open the submittal">Rev {meta.rev} · {DISPO_LABEL[meta.disposition] || meta.disposition}</button>
                                {subMenu === it._id && (() => {
                                  const rev = sub.revisions.find((r) => r.isCurrent) || sub.revisions[sub.revisions.length - 1];
                                  return (
                                    <>
                                      <div className="fixed inset-0 z-10" onClick={() => setSubMenu(null)} />
                                      <div className="absolute z-20 mt-1 left-3 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-44 text-left">
                                        {rev && <button onClick={() => { setSubMenu(null); setSubPreview({ title: `${sub.title || sub.productName || "Submittal"} — Rev ${rev.revisionNo}`, fileName: `${(sub.title || sub.productName || "submittal").replace(/\s+/g, "_")}_Rev${rev.revisionNo}.pdf`, build: async () => (await buildSubmittalPackage(sub, rev)).blob }); }} className="w-full text-left px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2"><Eye size={12} /> Preview PDF</button>}
                                        {onGoToSubmittals && <button onClick={() => { setSubMenu(null); onGoToSubmittals(it._id); }} className="w-full text-left px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2"><ExternalLink size={12} /> Open in Submittals</button>}
                                      </div>
                                    </>
                                  );
                                })()}
                              </>
                            );
                          })()}</td>
                          <td className="px-3 py-2 align-top"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${statusCls(it.status)}`} title={isCancelled && it.cancellationReason ? `Reason: ${it.cancellationReason}` : undefined}>{statusLabel(it.status)}</span></td>
                          <td className="px-2 py-1 align-top">
                            {canEdit && (isCancelled ? (
                              <button onClick={() => restoreItem(it._id)} className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline whitespace-nowrap" title={it.cancellationReason ? `Reason: ${it.cancellationReason}` : "Restore this item"}><RotateCcw size={12} /> Restore</button>
                            ) : (
                              <div className="flex items-center gap-1">
                                {/* CR-P-13 — unsaved inline edits: Save persists this row; Revert discards them. */}
                                {dirtyRows[it._id] && (
                                  <>
                                    <button onClick={() => saveRow(it._id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-600" title="Save changes to this line"><Check size={12} /> Save</button>
                                    <button onClick={() => revertRow(it._id)} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-slate-500 text-[10px] font-bold hover:text-red-500" title="Discard unsaved changes"><RotateCcw size={12} /> Revert</button>
                                  </>
                                )}
                                <button onClick={() => setManageId(it._id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-primary hover:text-white" title="Manage — edit, submittal, duplicate, cancel"><Settings2 size={12} /> Manage</button>
                                <button onClick={() => openLineExport(it)} className="p-1.5 rounded text-slate-300 hover:text-primary hover:bg-primary/5" title="Export / share this line as a PDF"><Download size={13} /></button>
                                <button onClick={() => toggleLock(it)} className={`p-1.5 rounded ${isLocked ? "text-amber-600 bg-amber-50" : "text-slate-300 hover:text-slate-600 hover:bg-slate-50"}`} title={isLocked ? "Locked — click to unlock" : "Lock this item (prevents accidental edits/delete)"}>{isLocked ? <Lock size={13} /> : <Unlock size={13} />}</button>
                                <button onClick={() => duplicateItem(it)} className="p-1.5 rounded text-slate-300 hover:text-primary hover:bg-primary/5" title="Duplicate row"><Copy size={13} /></button>
                                <button onClick={() => hardDelete(it._id)} disabled={isLocked} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:hover:text-slate-300 disabled:hover:bg-transparent" title={isLocked ? "Unlock first to delete" : "Delete"}><Trash2 size={13} /></button>
                              </div>
                            ))}
                          </td>
                        </tr>

                        {/* I1 — inline revision history (previous states copied down, newest first) */}
                        {expanded[it._id] && (revisions[it._id] === undefined ? (
                          <tr className="bg-slate-50/70"><td colSpan={colCount} className="px-6 py-2 text-[11px] text-slate-400 italic">Loading history…</td></tr>
                        ) : revisions[it._id].length === 0 ? (
                          <tr className="bg-slate-50/70"><td colSpan={colCount} className="px-6 py-2 text-[11px] text-slate-400 italic">No earlier revisions recorded.</td></tr>
                        ) : revisions[it._id].map((rev) => {
                          const chg = (f: string) => rev.changedFields.includes(f) ? "text-primary font-bold" : "text-slate-400";
                          return (
                            <tr key={rev._id} className="bg-slate-50/70 border-t border-slate-100/70">
                              {selCol && <td className="px-3 py-1.5"></td>}
                              <td className="px-3 py-1.5 align-top"></td>
                              <td className="px-2 py-1.5 align-top text-[10px] font-bold text-slate-400">RV{rev.revNo}</td>
                              <td className={`px-3 py-1.5 align-top text-[11px] ${chg("description")}`}>{rev.description || "—"}</td>
                              <td className={`px-3 py-1.5 align-top text-[11px] ${chg("manufacturer")}`}>{rev.manufacturer || "—"}</td>
                              <td className={`px-3 py-1.5 align-top text-[11px] ${chg("modelNo")}`}>{rev.modelNo || "—"}</td>
                              <td className="px-3 py-1.5"></td>
                              <td className={`px-3 py-1.5 align-top text-[11px] ${chg("qty")}`}>{rev.qty || "—"}</td>
                              <td className={`px-3 py-1.5 align-top text-[11px] ${chg("unit")}`}>{rev.unit || "—"}</td>
                              <td className={`px-3 py-1.5 align-top text-[11px] ${chg("spec")}`}>{rev.spec || "—"}</td>
                              <td className={`px-3 py-1.5 align-top text-[11px] whitespace-nowrap ${chg("needOnSiteDate")}`}>{rev.needOnSiteDate || "—"}</td>
                              <td className={`px-3 py-1.5 align-top text-[11px] ${chg("leadTimeDays")}`}>{rev.leadTimeDays || "—"}</td>
                              <td className="px-3 py-1.5 align-top text-[11px] text-slate-400 whitespace-nowrap">{orderByDate(rev.needOnSiteDate, rev.leadTimeDays) || "—"}</td>
                              <td className="px-3 py-1.5"></td>
                              <td className="px-3 py-1.5 align-top text-[10px] text-slate-400">
                                {statusLabel(rev.status)}
                                {rev.note && (
                                  <div className={`mt-0.5 text-[9px] font-semibold italic leading-tight ${rev.note.startsWith("Cancelled") ? "text-red-500" : rev.note.startsWith("Restored") ? "text-emerald-600" : "text-amber-600"}`}>{rev.note}</div>
                                )}
                              </td>
                              <td className="px-2 py-1.5 align-top text-[9px] text-slate-400 whitespace-nowrap leading-tight">{rev.actorName || "—"}<br />{new Date(rev.createdAt).toLocaleDateString()}</td>
                            </tr>
                          );
                        }))}
                        </Fragment>
                      );
                    })}
                    {/* New-item DRAFT rows — fill in, then ✓ to save once (no revisions until later edits) */}
                    {canEdit && draftsIn(s._id).map((d) => {
                      const dc = (field: keyof DraftItem, w = "") => (
                        <td className="px-1 py-1 align-top"><input value={d[field]} onChange={(e) => editDraft(d.tempId, field, e.target.value)} className={`${cell} ${w}`} /></td>
                      );
                      return (
                        <tr key={d.tempId} className="bg-primary/5">
                          {selCol && <td className="px-3 py-2 align-top w-8" />}
                          <td className="px-3 py-2 align-top w-12"><span className="text-[9px] font-bold text-primary uppercase tracking-widest">New</span></td>
                          <td className="px-2 py-2 align-top"><span className="text-[10px] text-slate-300 px-1.5">—</span></td>
                          <td className="px-1 py-1 align-top"><AutoCell value={d.description} onChange={(v) => editDraft(d.tempId, "description", v)} className={`${cell} min-w-[16rem] w-full align-top`} /></td>
                          {dc("manufacturer", "w-28")}
                          {dc("modelNo", "w-24")}
                          <td className="px-3 py-2 align-top"><span className="text-slate-300 text-[10px]">—</span></td>
                          {dc("qty", "w-14")}
                          {dc("unit", "w-16")}
                          <td className="px-1 py-1 align-top"><AutoCell value={d.spec} onChange={(v) => editDraft(d.tempId, "spec", v)} className={`${cell} min-w-[13rem] w-52 align-top`} /></td>
                          <td className="px-1 py-1 align-top"><input type="date" value={d.needOnSiteDate} onChange={(e) => editDraft(d.tempId, "needOnSiteDate", e.target.value)} className={`${cell} w-32`} /></td>
                          {dc("leadTimeDays", "w-14")}
                          <td className="px-3 py-2 align-top text-[11px] text-slate-500 whitespace-nowrap">{orderByDate(d.needOnSiteDate, d.leadTimeDays) || "—"}</td>
                          <td className="px-3 py-2 align-top"><span className="text-slate-300 text-[10px]">—</span></td>
                          <td className="px-3 py-2 align-top"><span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-50 text-yellow-700">Not saved</span></td>
                          <td className="px-2 py-1 align-top">
                            <div className="flex items-center gap-1">
                              <button onClick={() => saveDraft(d.tempId)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-600" title="Save this item"><Check size={13} /> Save</button>
                              {/* CR-P-12 — save then jump to Manage to attach pictures / catalogue / data sheet / drawing / submittal + remarks. */}
                              <button onClick={() => saveDraft(d.tempId, true)} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-500 text-emerald-600 text-[10px] font-bold hover:bg-emerald-50" title="Save this item and attach its documents (pictures, catalogue, data sheet, drawing, submittal)"><FileText size={13} /> Save &amp; docs</button>
                              <button onClick={() => removeDraft(d.tempId)} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50" title="Discard"><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {canEdit && draftsIn(s._id).length > 0 && (
                  <div className="px-3 py-2 border-t border-yellow-100 bg-yellow-50/60 flex flex-wrap items-center gap-3">
                    <span className="text-[11px] font-bold text-yellow-700">{draftsIn(s._id).length} unsaved draft{draftsIn(s._id).length === 1 ? "" : "s"} — nothing is saved until you confirm.</span>
                    <button onClick={() => saveAllDrafts(s._id)} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-bold hover:bg-emerald-600 disabled:opacity-50"><Check size={13} /> Save all</button>
                    <button onClick={() => discardAllDrafts(s._id)} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-[11px] font-bold hover:text-red-600 hover:border-red-200 disabled:opacity-50"><Trash2 size={13} /> Discard all</button>
                  </div>
                )}
                {canEdit && (
                  <div className="px-3 py-2 border-t border-slate-50 flex items-center gap-4">
                    <button onClick={() => openAddPopup(s._id)} className="flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline"><Plus size={12} /> Add item</button>
                    <button onClick={() => setImportModal({ mode: "section", sectionId: s._id })} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-primary" title={`Import Excel/CSV rows into "${s.name}"`}>
                      <Upload size={12} /> Import into this category
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* I3 — cancelled items now stay in place (red rows) inside their category, with Restore.
          A one-line note points there when any are collapsed out of view. */}
      {cancelled.length > 0 && (
        <p className="text-[11px] text-red-500/80 font-medium px-1">
          {cancelled.length} cancelled item{cancelled.length === 1 ? "" : "s"} kept for claims — shown in red within their categories (Restore available on each).
        </p>
      )}
      {/* Import modal — explains the expected columns + offers the template, then takes the file. */}
      {importModal && (() => {
        const secName = importModal.mode === "section" ? (sections.find((s) => s._id === importModal.sectionId)?.name || "this category") : null;
        const runImport = (file: File) => {
          setImportModal(null);
          if (importModal.mode === "section" && importModal.sectionId) void importIntoSection(file, importModal.sectionId);
          else void importAsNewSection(file);
        };
        const cols: [string, string][] = [
          ["Description", "e.g. 4-core 16mm² XLPE power cable"],
          ["Brand", "Nexans"],
          ["Model", "XLPE-16"],
          ["Quantity", "2500"],
          ["Unit", "m"],
          ["Spec", "Black, 0.6/1kV"],
        ];
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl w-full max-w-lg mt-10 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-display font-bold text-slate-900">{importModal.mode === "section" ? `Import into “${secName}”` : "Import as a new category"}</h3>
                  <p className="text-[11px] text-slate-500 mt-1">Upload an Excel (.xlsx) or CSV file. Use these columns so the rows map correctly — order doesn’t matter, and extra columns are ignored.</p>
                </div>
                <button onClick={() => setImportModal(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><Plus size={18} className="rotate-45" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[880px]">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <tr><th className="px-3 py-2">Column</th><th className="px-3 py-2">Example</th></tr>
                    </thead>
                    <tbody className="text-[11px]">
                      {cols.map(([c, ex]) => (
                        <tr key={c} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 font-bold text-slate-700">{c}</td>
                          <td className="px-3 py-1.5 text-slate-500">{ex}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">Need-on-site date, lead time and status aren’t required here — fill those in per row afterwards.</p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button onClick={downloadImportTemplate} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold"><Download size={14} /> Download template</button>
                  <label className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary cursor-pointer transition-colors ${busy ? "opacity-50 pointer-events-none" : ""}`}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Choose file & import
                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) runImport(f); e.target.value = ""; }} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* CR-P-12 — new BOQ item popup. Backdrop does NOT close (CR-B-03) — only Cancel/Save do. */}
      {addFor && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">New BOQ item</p>
              <button onClick={() => setAddFor(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="sm:col-span-2 text-[11px] font-bold text-slate-500">Description *
                <input autoFocus className={`${cell} mt-1 w-full`} value={addForm.description} onChange={(e) => setAddField("description", e.target.value)} placeholder="e.g. PVC pipe 4in Schedule 40" /></label>
              <label className="text-[11px] font-bold text-slate-500">Brand
                <input className={`${cell} mt-1 w-full`} value={addForm.manufacturer} onChange={(e) => setAddField("manufacturer", e.target.value)} placeholder="Manufacturer / brand" /></label>
              <label className="text-[11px] font-bold text-slate-500">Model / Part #
                <input className={`${cell} mt-1 w-full`} value={addForm.modelNo} onChange={(e) => setAddField("modelNo", e.target.value)} /></label>
              <label className="text-[11px] font-bold text-slate-500">Quantity
                <input className={`${cell} mt-1 w-full`} value={addForm.qty} onChange={(e) => setAddField("qty", e.target.value)} /></label>
              <label className="text-[11px] font-bold text-slate-500">Unit
                <input className={`${cell} mt-1 w-full`} value={addForm.unit} onChange={(e) => setAddField("unit", e.target.value)} placeholder="pcs / m / kg" /></label>
              <label className="sm:col-span-2 text-[11px] font-bold text-slate-500">Specs
                <textarea rows={2} className={`${cell} mt-1 w-full resize-none`} value={addForm.spec} onChange={(e) => setAddField("spec", e.target.value)} placeholder="Technical specification" /></label>
              <label className="sm:col-span-2 text-[11px] font-bold text-slate-500">Remarks
                <input className={`${cell} mt-1 w-full`} value={addForm.remarks} onChange={(e) => setAddField("remarks", e.target.value)} placeholder="Notes / remarks" /></label>
              <label className="text-[11px] font-bold text-slate-500">Need on site
                <input type="date" className={`${cell} mt-1 w-full`} value={addForm.needOnSiteDate} onChange={(e) => setAddField("needOnSiteDate", e.target.value)} /></label>
              <label className="text-[11px] font-bold text-slate-500">Lead time (days)
                <input className={`${cell} mt-1 w-full`} value={addForm.leadTimeDays} onChange={(e) => setAddField("leadTimeDays", e.target.value)} /></label>
              <p className="sm:col-span-2 text-[11px] text-slate-400">Pictures, catalogue, data sheet, drawing &amp; submittal package attach in the next step — use <strong>Save &amp; docs</strong>.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
              {/* CR-B-14a — Reset + Cancel (with confirmation) alongside Save / Save & docs. */}
              <button onClick={() => setAddForm(BLANK_DRAFT(addFor || ""))} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50">Reset</button>
              <button onClick={async () => { if (await confirm({ title: "Are you sure you want to cancel?", message: "Unsaved item details will be lost.", confirmLabel: "Discard & close", cancelLabel: "Keep editing", danger: true })) setAddFor(null); }} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Cancel</button>
              <button onClick={() => saveAddPopup(false)} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary">Save</button>
              <button onClick={() => saveAddPopup(true)} className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 inline-flex items-center gap-1.5"><FileText size={13} /> Save &amp; docs</button>
            </div>
          </div>
        </div>
      )}
      {dialogs}
      {showPreview && (
        <PdfPreviewModal title="Bill of Quantity (BOQ)" fileName="BOQ.pdf" build={() => buildBoqPdf(sections, items, projectInfo)} onClose={() => setShowPreview(false)} />
      )}
      {/* CR-P-14 — per-line export (one BOQ line as its own PDF, downloadable/shareable). */}
      {linePreview && (
        <PdfPreviewModal
          title={`BOQ item #${displayNo[linePreview.item._id] ?? ""} — ${linePreview.item.description || "line"}${linePreview.extras.length ? " (+ past revisions)" : ""}`}
          fileName={`BOQ_item_${displayNo[linePreview.item._id] ?? ""}.pdf`}
          build={() => buildBoqPdf(sections.filter((s) => s._id === linePreview.item.sectionId), [linePreview.item, ...linePreview.extras], projectInfo)}
          onClose={() => setLinePreview(null)}
        />
      )}
      {subPreview && (
        <PdfPreviewModal title={subPreview.title} fileName={subPreview.fileName} build={subPreview.build} onClose={() => setSubPreview(null)} />
      )}

      {/* §A1 — per-item Actions modal: edit fields, submittal, duplicate, cancel */}
      {manageId && (() => {
        const m = items.find((x) => x._id === manageId);
        if (!m) return null;
        const sub = subByItem[m._id];
        const mField = (label: string, field: keyof ProcurementItemInput, type = "text") => (
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>
            <input type={type} value={mDraft[field as string] ?? ""} disabled={!canEdit} onChange={(e) => setMDraft((p) => ({ ...p, [field as string]: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-70" />
          </div>
        );
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{m.description || "BOQ item"}</p>
                  <p className="text-[10px] text-slate-400">{mDirty ? <span className="text-amber-600 font-bold">Unsaved changes</span> : "Manage item — edit fields then Save"}</p>
                </div>
                <button onClick={closeManage} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><Plus size={18} className="rotate-45" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {mField("Description", "description")}
                  {mField("Brand", "manufacturer")}
                  {mField("Model", "modelNo")}
                  {mField("Quantity", "qty")}
                  {mField("Unit", "unit")}
                  {mField("Spec / Size", "spec")}
                  {mField("Need on site", "needOnSiteDate", "date")}
                  {mField("Lead time (days)", "leadTimeDays")}
                </div>
                <p className="text-[11px] text-slate-500">Order-by date: <span className="font-bold text-slate-700">{orderByDate(mDraft.needOnSiteDate || m.needOnSiteDate, mDraft.leadTimeDays || m.leadTimeDays) || "—"}</span> · Status: <span className="font-bold text-slate-700">{statusLabel(m.status)}</span> · RV{m.revNo || 0}</p>

                {/* CR-P-12 — remarks + per-item reference files (pictures, catalogue, data sheet, drawing). */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Remarks</label>
                  <textarea rows={2} value={mDraft.remarks ?? ""} disabled={!canEdit} onChange={(e) => setMDraft((p) => ({ ...p, remarks: e.target.value }))} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-70 resize-y" placeholder="Notes on this item…" />
                </div>
                <div className="bg-slate-50 rounded-2xl p-3 space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Files — picture, catalogue, data sheet, drawing</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {(m.attachments || []).map((a) => (
                      <span key={a._id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-600">
                        <FileText size={10} /> <a href={attachmentUrl(a.filePath)} target="_blank" rel="noreferrer" className="hover:text-primary max-w-[10rem] truncate" title={`${a.kind}: ${a.name}`}>{a.name}</a>
                        {a.kind && a.kind !== "other" && <span className="text-slate-300">· {a.kind}</span>}
                        {canEdit && <button onClick={() => deleteItemFile(m._id, a._id)} className="text-slate-300 hover:text-red-500"><Plus size={11} className="rotate-45" /></button>}
                      </span>
                    ))}
                    {(m.attachments || []).length === 0 && <span className="text-[10px] text-slate-400 italic">No files yet.</span>}
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {["picture", "catalogue", "datasheet", "drawing", "other"].map((k) => (
                        <label key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:border-primary hover:text-primary cursor-pointer capitalize">
                          <Upload size={10} /> {k}<input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadItemFile(m._id, f, k); e.target.value = ""; }} />
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                    <button onClick={() => { setManageId(null); onGoToSubmittals?.(m._id); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary hover:text-white"><ExternalLink size={13} /> {sub ? "Open submittal" : "Create submittal"}</button>
                    <button onClick={() => { duplicateItem(m); setManageId(null); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200"><Copy size={13} /> Duplicate</button>
                    <button onClick={async () => { setManageId(null); await cancelItem(m._id); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-[11px] font-bold hover:bg-amber-100"><Ban size={13} /> Cancel item</button>
                  </div>
                )}

                {/* Read-only revision history */}
                {(m.revNo || 0) > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <button onClick={() => { if (!revisions[m._id]) loadRevisions(m._id); }} className="text-[11px] font-bold text-slate-600 mb-2">Change history (RV{m.revNo})</button>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {(revisions[m._id] || []).map((rev) => (
                        <div key={rev._id} className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 border-b border-slate-50 pb-1">
                          <span className="font-bold text-slate-400">RV{rev.revNo}</span>
                          {rev.note
                            ? <span className={`font-semibold ${rev.note.startsWith("Cancelled") ? "text-red-500" : rev.note.startsWith("Restored") ? "text-emerald-600" : "text-amber-600"}`}>{rev.note}</span>
                            : <><span>{rev.description || "—"}</span><span>{rev.manufacturer}</span><span>{[rev.qty, rev.unit].filter(Boolean).join(" ")}</span></>}
                          <span className="ml-auto text-slate-400">{rev.actorName} · {new Date(rev.createdAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                      {!revisions[m._id] && <p className="text-[11px] text-slate-400 italic">Click above to load history.</p>}
                    </div>
                  </div>
                )}
              </div>
              {canEdit && (
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/60 rounded-b-3xl">
                  <button onClick={closeManage} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-[12px] font-bold hover:bg-slate-100">Cancel</button>
                  <button onClick={saveManage} disabled={!mDirty || mSaving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-[12px] font-bold hover:bg-primary/90 disabled:opacity-40">
                    {mSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save changes
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* BOQ → RFQ confirmation: review the detailed item rows, remove any, then create + open the RFQ */}
      {rfqDraft && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <div>
                <p className="text-sm font-bold text-slate-900">Create RFQ — confirm items</p>
                <p className="text-[10px] text-slate-400">Review the items below. Remove any you don't want, then create the RFQ. You'll be taken straight into it.</p>
              </div>
              <button onClick={() => setRfqDraft(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><Plus size={18} className="rotate-45" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-xl border border-slate-100 overflow-x-auto">
                <table className="w-full min-w-[640px] text-[11px]">
                  <thead className="bg-slate-50 text-[9px] uppercase tracking-widest text-slate-400"><tr>
                    <th className="text-left px-2 py-1.5 w-8">#</th><th className="text-left px-2 py-1.5">Description</th><th className="text-left px-2 py-1.5">Brand</th><th className="text-left px-2 py-1.5">Qty</th><th className="text-left px-2 py-1.5">Unit</th><th className="text-left px-2 py-1.5">Spec</th><th className="text-left px-2 py-1.5">Status</th><th className="w-8" />
                  </tr></thead>
                  <tbody>
                    {rfqDraft.map((it, i) => (
                      <tr key={it._id} className="border-t border-slate-50">
                        <td className="px-2 py-1.5 text-slate-400 font-bold">{i + 1}</td>
                        <td className="px-2 py-1.5 font-bold text-slate-700">{it.description || "—"}</td>
                        <td className="px-2 py-1.5 text-slate-500">{it.manufacturer || "—"}</td>
                        <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{it.qty || "—"}</td>
                        <td className="px-2 py-1.5 text-slate-500">{it.unit || "—"}</td>
                        <td className="px-2 py-1.5 text-slate-500">{it.spec || "—"}</td>
                        <td className="px-2 py-1.5"><span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-bold">{statusLabel(it.status)}</span></td>
                        <td className="px-2 py-1.5 text-right"><button onClick={() => setRfqDraft((p) => (p || []).filter((x) => x._id !== it._id))} className="text-slate-300 hover:text-red-500" title="Remove from this RFQ"><Trash2 size={12} /></button></td>
                      </tr>
                    ))}
                    {rfqDraft.length === 0 && <tr><td colSpan={8} className="px-2 py-4 text-center text-slate-400 italic">No items left — add some back or cancel.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setRfqDraft(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Cancel</button>
                <button onClick={confirmCreateRfq} disabled={bulkBusy || rfqDraft.length === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50">{bulkBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Create RFQ ({rfqDraft.length})</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    <SavedVersionsPanel
      heading="Saved BOQ Versions"
      subtitle="Freeze a PDF or Excel copy of the BOQ. Preview, print, or download any revision anytime."
      canEdit={canEdit}
      formats={[
        { label: "PDF", ext: "pdf", baseName: "BOQ", build: () => buildBoqPdf(sections, items, projectInfo) },
        { label: "Excel", ext: "xlsx", baseName: "BOQ", build: buildBoqExcelBlob },
      ]}
      fetchList={() => fetchSavedDocuments(projectId, "boq")}
      saveVersion={(file, fileName, meta) => saveDocumentVersion(projectId, { kind: "boq", title: meta.title, status: meta.status }, file, fileName)}
      update={(docId, body) => updateSavedDocument(projectId, docId, body)}
      remove={(docId) => deleteSavedDocument(projectId, docId).then(() => {})}
      toast={toast}
    />
    </div>
  );
}
