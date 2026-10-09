import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import DirectoryNameField from "./DirectoryNameField";
import * as XLSX from "xlsx";
import { Plus, Trash2, Upload, Download, Loader2, Ban, RotateCcw, ChevronDown, ChevronRight, Pencil, Eye, Copy, ArrowUp, ArrowDown, ChevronsUpDown, ExternalLink, Search, Settings2, Check, Lock, Unlock, FileText, X, AlertTriangle, CheckCircle2, Clock, History, Columns3, MoveHorizontal, ArrowLeftRight, LayoutList, Rows3, Printer } from "lucide-react";
import {
  fetchProcurementSections, addProcurementSection, updateProcurementSection, deleteProcurementSection,
  fetchProcurementItems, addProcurementItem, updateProcurementItem, cancelProcurementItem, restoreProcurementItem,
  deleteProcurementItem, bulkAddProcurementItems, fetchSubmittals, fetchProcurementItemRevisions, fetchProcurementEvents,
  createRfq, uploadDocument, uploadProcurementItemFile, deleteProcurementItemFile, attachmentUrl,
  type ApiProcurementSection, type ApiProcurementItem, type ProcurementItemInput, type ApiSubmittal, type ApiProcurementItemRevision,
  type ApiProcurementEvent, type ProcurementStatus, fetchVendorOffers, type ApiVendorOffer,
} from "../../lib/api";
import VendorOfferPanel from "./VendorOfferPanel";
import { buildRfqPdf } from "../../lib/rfqPdf";
import { fetchSavedDocuments, saveDocumentVersion, updateSavedDocument, deleteSavedDocument } from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import { buildBoqPdf, type BoqPrintLayout } from "../../lib/boqPdf";
import {
  STATUS_META, STATUS_ORDER, DISPO_CLS, PRICE_COLS, boqCellText, colById, isAtRisk, orderByDate, statusCls, statusText, submittalText, usd,
  type BoqColId, type BoqTextCtx, type LiveStatus,
} from "../../lib/boqColumns";
import { useBoqColumns } from "./useBoqColumns";
import { buildSubmittalPackage } from "../../lib/submittalPackage";
import type { ProjectPdfInfo } from "../../lib/pdfProjectHeader";
import PdfPreviewModal from "./PdfPreviewModal";
import PresenceBar from "./PresenceBar";
import { useBuilderPresence } from "../../lib/usePresence";
import SavedVersionsPanel from "./SavedVersionsPanel";
import AssignColleague from "./AssignColleague";
import { useUnsavedGuard } from "../../lib/useUnsavedGuard";

const DEFAULT_SECTIONS = ["Electrical", "Civil", "Mechanical"];


// C3 — auto-growing multi-line cell (Enter = new line, grows with content), same as the
// Expenses/Invoices "Remarks" cell. Local copy to avoid touching ProjectWorkspace.
function AutoCell({ value, onChange, onBlur, className, disabled }: {
  value: string; onChange: (v: string) => void; onBlur?: (v: string) => void; className?: string; disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const resize = () => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } };
  useEffect(() => { resize(); }, [value]);
  // 2026-10-09 - a column made narrower or wider wraps the text again: grow or shrink to it.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; resize(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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

const cell = "w-full px-2 py-1.5 rounded bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none text-xs font-medium";

// A not-yet-saved new BOQ row. Edited locally, then created in one shot via the ✓ button.
type DraftItem = { tempId: string; sectionId: string; description: string; manufacturer: string; modelNo: string; qty: string; unit: string; spec: string; needOnSiteDate: string; leadTimeDays: string; remarks: string };
const BLANK_DRAFT = (sectionId: string): DraftItem => ({ tempId: `draft-${Date.now()}-${Math.round(Math.random() * 1e6)}`, sectionId, description: "", manufacturer: "", modelNo: "", qty: "", unit: "", spec: "", needOnSiteDate: "", leadTimeDays: "", remarks: "" });

// Sorting: one sort across the BOQ (by category, each category sorts its own rows). Click cycles
// asc -> desc -> off; blanks sort last either way.
const num = (s: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const STATUS_SORT: string[] = [...STATUS_ORDER, "Cancelled"];

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
  // 2026-10-09 - the Master Log is folded in here: its filters, its activity timeline, and the
  // columns each viewer shows and sizes (useBoqColumns).
  const [sectionFilter, setSectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskOnly, setRiskOnly] = useState(false);
  const [events, setEvents] = useState<ApiProcurementEvent[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [colMenu, setColMenu] = useState(false);
  // 2026-10-09 - what each line's vendor sent from its profile; only for those who see the figures.
  const [offers, setOffers] = useState<ApiVendorOffer[]>([]);
  const [offersOk, setOffersOk] = useState(false);
  const loadOffers = () => fetchVendorOffers(projectId, "boq").then((r) => { setOffers(r.offers); setOffersOk(true); }).catch(() => { setOffers([]); setOffersOk(false); });
  const layout = useBoqColumns(offersOk ? [] : PRICE_COLS);
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

  // The filters: status, at risk, and a search across the item's text and its category.
  const matchItem = (it: ApiProcurementItem) => {
    if (statusFilter !== "all" && it.status !== statusFilter) return false;
    if (riskOnly && !isAtRisk(it)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [it.description, it.manufacturer, it.vendorName, it.modelNo, it.spec, it.itemNo, it.unit, sectionName(it.sectionId)].some((v) => String(v || "").toLowerCase().includes(q));
  };

  const load = async () => {
    setLoading(true);
    try {
      const [s, i, subs, ev] = await Promise.all([fetchProcurementSections(projectId), fetchProcurementItems(projectId), fetchSubmittals(projectId).catch(() => []), fetchProcurementEvents(projectId).catch(() => [])]);
      setSections(s);
      setItems(i);
      setSubmittals(subs);
      setEvents(ev);
      void loadOffers();
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

  const sectionName = (sid: string) => sections.find((s) => s._id === sid)?.name || "No category";
  // What each column says for an item: for sorting, the exports, the print and Auto-fit.
  const offerByItem = new Map<string, ApiVendorOffer>();
  for (const o of offers) { const it = items.find((x) => x._id === o.refId); if (it && it.vendorCompanyId === o.companyId) offerByItem.set(o.refId, o); }
  const textCtx: BoqTextCtx = { sectionName, numberOf: (iid) => displayNo[iid], submittalOf: (iid) => subByItem[iid], offerOf: (iid) => offerByItem.get(iid) };

  // Every column sorts. One sort applies across the BOQ (by category, each sorts its own rows).
  const [sort, setSort] = useState<{ key: BoqColId; dir: 1 | -1 } | null>(null);
  const toggleSort = (key: BoqColId) => setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  const sortVal = (it: ApiProcurementItem, key: BoqColId): string | number => {
    switch (key) {
      case "no": return displayNo[it._id] ?? Number.MAX_SAFE_INTEGER;
      case "rev": return it.revNo || 0;
      case "qty": return it.qty ? num(it.qty) : "";
      case "lead": return it.leadTimeDays ? num(it.leadTimeDays) : "";
      case "unitPrice": { const v = offerByItem.get(it._id)?.unitPrice; return v ? num(v) : ""; }
      case "totalPrice": { const v = offerByItem.get(it._id)?.total; return v ? num(v) : ""; }
      case "status": { const i = STATUS_SORT.indexOf(it.status); return i === -1 ? 99 : i; }
      default: return boqCellText(key, it, textCtx).toLowerCase();
    }
  };
  const sortItems = (arr: ApiProcurementItem[]): ApiProcurementItem[] => {
    if (!sort) return arr;
    return [...arr].sort((a, b) => {
      const av = sortVal(a, sort.key), bv = sortVal(b, sort.key);
      if (av === "" && bv !== "") return 1;
      if (bv === "" && av !== "") return -1;
      if (av < bv) return -sort.dir; if (av > bv) return sort.dir; return 0;
    });
  };

  // What is shown: by category, or one list across them (the old Master Log view).
  const known = new Set(sections.map((s) => s._id));
  const lostItems = items.filter((it) => !known.has(it.sectionId));
  const filtering = !!search.trim() || sectionFilter !== "all" || statusFilter !== "all" || riskOnly;
  const sectionOn = (sid: string) => sectionFilter === "all" || sectionFilter === sid;
  const shownIn = (sid: string) => sortItems(rowsIn(sid).filter(matchItem));
  const flatRows = sortItems([...sections.flatMap((s) => (sectionOn(s._id) ? rowsIn(s._id) : [])), ...(sectionFilter === "all" ? lostItems : [])].filter(matchItem));
  const shownRows = layout.flat ? flatRows : [...sections.flatMap((s) => (sectionOn(s._id) ? shownIn(s._id) : [])), ...(sectionFilter === "all" ? lostItems.filter(matchItem) : [])];
  const stats = (() => {
    let completed = 0, inProgress = 0, notStarted = 0, atRisk = 0;
    for (const it of active) {
      const g = STATUS_META[it.status as LiveStatus]?.group;
      if (g === "completed") completed++; else if (g === "inProgress") inProgress++; else notStarted++;
      if (isAtRisk(it)) atRisk++;
    }
    return { completed, inProgress, notStarted, atRisk };
  })();
  // The print follows the screen: its columns at their widths, the view, and the filters (named).
  const scopeText = filtering
    ? [sectionFilter !== "all" ? sectionName(sectionFilter) : "", statusFilter !== "all" ? statusText(statusFilter) : "", riskOnly ? "at risk" : "", search.trim() ? `"${search.trim()}"` : ""].filter(Boolean).join(", ")
    : undefined;
  const printLayout = (scope?: string): BoqPrintLayout => ({ cols: layout.visible.map((c) => ({ id: c.id, w: layout.widths[c.id] })), flat: layout.flat, ctx: textCtx, scope });

  // 2026-10-09 - the status is set on the BOQ now (it was on the Master Log); saved at once.
  const setStatus = async (iid: string, status: ProcurementStatus) => {
    const was = items.find((x) => x._id === iid)?.status;
    setItems((p) => p.map((it) => (it._id === iid ? { ...it, status } : it)));
    try {
      const row = await updateProcurementItem(projectId, iid, { status });
      setItems((p) => p.map((it) => (it._id === iid ? { ...it, revNo: row.revNo ?? it.revNo } : it)));
    } catch (err) {
      if (was) setItems((p) => p.map((it) => (it._id === iid ? { ...it, status: was } : it)));
      toast(err instanceof Error ? err.message : "Could not change the status.", "error");
    }
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
  // CR-B-19 — tag a colleague to edit/review/verify this BOQ category.
  const assignSection = (sid: string, name: string) => { setSections((p) => p.map((s) => (s._id === sid ? { ...s, assignedTo: name } : s))); updateProcurementSection(projectId, sid, { assignedTo: name }).catch(() => {}); };
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
  const saveAddPopup = async (openDocs: boolean, draft = false) => {
    if (!addFor) return;
    if (!addForm.description.trim()) { toast("Add a description before saving the item.", "error"); return; }
    const nextNo = String(itemsIn(addFor).length + 1);
    try {
      const it = await addProcurementItem(projectId, {
        sectionId: addFor, itemNo: nextNo, description: addForm.description, manufacturer: addForm.manufacturer,
        modelNo: addForm.modelNo, qty: addForm.qty, unit: addForm.unit, spec: addForm.spec, needOnSiteDate: addForm.needOnSiteDate, leadTimeDays: addForm.leadTimeDays, remarks: addForm.remarks,
        draft,
      });
      setItems((p) => [...p, it]);
      setAddFor(null);
      if (openDocs) setManageId(it._id); else toast(draft ? "Saved as draft — complete it later." : "Item added.", "success");
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
    if (!(await confirm({ title: "Delete this attachment?", message: "The file is removed from this item for good.", confirmLabel: "Delete" }))) return;
    try { const up = await deleteProcurementItemFile(projectId, iid, aid); setItems((p) => p.map((x) => (x._id === iid ? up : x))); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  // CR-P-13 — edits to an existing line are held locally (dirty) and only persist when the user
  // clicks Save on that row — NEVER on blur — so everything can be verified first. Revert discards.
  const [dirtyRows, setDirtyRows] = useState<Record<string, Record<string, string>>>({});
  const [origRows, setOrigRows] = useState<Record<string, Record<string, string>>>({});
  // CR-B-20 — held-back row edits are unsaved: warn before leaving the page while any exist.
  useUnsavedGuard(Object.keys(dirtyRows).length > 0);
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
    // CR-P-13 — an import creates the category up front; if you discard its rows and it's left
    // empty, offer to remove the empty category too so nothing lingers unverified.
    if (itemsIn(sid).length === 0) {
      if (await confirm({ title: "Delete empty category?", message: "This category has no saved items. Delete it too?", confirmLabel: "Delete category", cancelLabel: "Keep it", danger: true })) {
        try { await deleteProcurementSection(projectId, sid); setSections((p) => p.filter((s) => s._id !== sid)); } catch { /* ignore */ }
      }
    }
  };

  // The exports carry the shown columns, and always the category (an export has no headings).
  const exportIds = (): BoqColId[] => ["category", ...layout.visible.map((c) => c.id).filter((id) => id !== "category")];
  const exportHeader = () => exportIds().map((id) => colById(id).label);
  const exportRows = (list: ApiProcurementItem[]): string[][] => { const ids = exportIds(); return list.map((it) => ids.map((id) => boqCellText(id, it, textCtx))); };
  const allRows = () => [...sections.flatMap((s) => rowsIn(s._id)), ...lostItems];

  // ── Export CSV: what is shown, in its order ──
  const exportCsv = () => {
    const csv = [exportHeader(), ...exportRows(shownRows)].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `BOQ.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Build an .xlsx workbook of the whole BOQ for saving as a frozen version.
  const buildBoqExcelBlob = async (): Promise<Blob> => {
    const ws = XLSX.utils.aoa_to_sheet([exportHeader(), ...exportRows(allRows())]);
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

  const selCol = canEdit; // show the checkbox column only to editors
  // 2026-10-09 - the fixed columns (tick box, actions: they wrap to two lines); the others are
  // sized by the viewer, or fitted to the screen until a column is sized by hand.
  const SEL_W = 36;
  const ACT_W = canEdit ? 152 : 76;
  const fixedW = (selCol ? SEL_W : 0) + ACT_W;
  const textsOf = (id: BoqColId) => [
    ...shownRows.map((it) => boqCellText(id, it, textCtx)),
    ...(id === "description" ? drafts.map((d) => d.description) : id === "spec" ? drafts.map((d) => d.spec) : []),
  ];
  const fitToScreen = () => {
    const box = layout.boxRef.current;
    if (box) layout.fitTo(box.clientWidth - fixedW - 4, textsOf);
  };
  // In "fit" mode the table follows the screen's width, the columns shown, the view and the items.
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = layout.boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  const visKey = layout.visible.map((c) => c.id).join(",");
  useEffect(() => {
    if (layout.fit && boxW > 0) fitToScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.fit, boxW, visKey, layout.flat, items.length, sectionFilter, canEdit]);

  if (loading) return <div className="py-12 flex justify-center text-slate-300"><Loader2 size={22} className="animate-spin" /></div>;

  const colCount = layout.visible.length + 1 + (selCol ? 1 : 0);
  const tableStyle = { width: layout.tableWidth(fixedW) };
  const toolBtn = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary transition-colors";

  const colgroup = (
    <colgroup>
      {selCol && <col style={{ width: SEL_W }} />}
      {layout.visible.map((c) => <col key={c.id} style={{ width: layout.colWidth(c.id) }} />)}
      <col style={{ width: ACT_W }} />
    </colgroup>
  );
  // Every heading sorts; its right edge drags to resize, and a double-click there fits the content.
  const head = (rows: ApiProcurementItem[]) => (
    <thead>
      <tr className="border-b border-slate-100">
        {selCol && (() => {
          const sel = rows.filter((x) => x.status !== "Cancelled");
          const allOn = sel.length > 0 && sel.every((x) => selected[x._id]);
          return <th className="px-3 py-2"><input type="checkbox" checked={allOn} onChange={(e) => setSelected((p) => { const n = { ...p }; sel.forEach((x) => { n[x._id] = e.target.checked; }); return n; })} title="Select all shown" aria-label="Select all shown" /></th>;
        })()}
        {layout.visible.map((c) => (
          <th key={c.id} className="relative overflow-hidden text-left px-2 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px] whitespace-nowrap">
            <button type="button" onClick={() => toggleSort(c.id)} className={`inline-flex max-w-full items-center gap-1 uppercase tracking-widest hover:text-slate-800 ${sort?.key === c.id ? "text-slate-800" : ""}`} title={`Sort by ${c.label}`}>
              <span className="truncate">{c.label}</span>
              {sort?.key === c.id ? (sort.dir === 1 ? <ArrowUp size={11} className="shrink-0" /> : <ArrowDown size={11} className="shrink-0" />) : <ChevronsUpDown size={11} className="shrink-0 text-slate-300" />}
            </button>
            <span role="separator" aria-orientation="vertical" tabIndex={0} aria-label={`Resize ${c.label}`}
              title="Drag to resize. Double-click to fit the content."
              onPointerDown={(e) => layout.startResize(c.id, e)} onKeyDown={(e) => layout.keyResize(c.id, e)} onDoubleClick={() => layout.autoFitOne(c.id, textsOf(c.id))}
              className="group absolute right-0 top-0 h-full w-3 cursor-col-resize touch-none select-none outline-none">
              <span className="absolute right-1 top-1/4 h-1/2 w-px bg-slate-200 transition-colors group-hover:bg-primary group-focus-visible:w-0.5 group-focus-visible:bg-primary" />
            </span>
          </th>
        ))}
        <th className="px-2 py-2 text-left font-bold text-slate-500 uppercase tracking-widest text-[10px]">{canEdit ? "" : "Export"}</th>
      </tr>
    </thead>
  );

  const itemCell = (id: BoqColId, it: ApiProcurementItem, rowEdit: boolean, strike: string): ReactNode => {
    const isCancelled = it.status === "Cancelled";
    const input = (field: keyof ProcurementItemInput, extra = "") => (
      <td key={id} className="px-1 py-1 align-top"><input value={(it[field] as string) || ""} onChange={(e) => editCell(it._id, field, e.target.value)} disabled={!rowEdit} title={(it[field] as string) || undefined} aria-label={colById(id).label} className={`${cell} ${extra} ${strike}`} /></td>
    );
    switch (id) {
      case "category": return <td key={id} className={`px-3 py-2 align-top text-[11px] text-slate-500 break-words ${strike}`}>{sectionName(it.sectionId)}</td>;
      case "no": return (
        <td key={id} className="px-3 py-2 align-top font-bold text-slate-400">{isCancelled ? "—" : (displayNo[it._id] ?? "—")}
          {it.draft && <span className="block mt-1 w-fit px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold uppercase tracking-wide" title="Draft: complete it in Manage">Draft</span>}</td>
      );
      case "rev": return (
        <td key={id} className="px-2 py-2 align-top">{it.revNo > 0 ? (
          <button onClick={() => toggleRevisions(it._id)} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary" title="Show change history">
            {expanded[it._id] ? <ChevronDown size={11} /> : <ChevronRight size={11} />} RV{it.revNo}
          </button>
        ) : <span className="text-[10px] text-slate-300 px-1.5" title="No changes yet">RV0</span>}</td>
      );
      case "description": return <td key={id} className="px-1 py-1 align-top"><AutoCell value={it.description || ""} onChange={(v) => editCell(it._id, "description", v)} disabled={!rowEdit} className={`${cell} align-top ${strike}`} /></td>;
      // 2026-10-07 - the brand is a manufacturer in the Directory, picked not typed.
      case "brand": return (
        <td key={id} className="px-1 py-1 align-top"><DirectoryNameField className={`w-full ${strike}`} value={it.manufacturer || ""} disabled={!rowEdit} categories={["manufacturer", "supplier", "vendor"]} title="Brand (manufacturer)" placeholder="Pick a brand"
          onPick={(co) => editCell(it._id, "manufacturer", co.name)} onClear={() => editCell(it._id, "manufacturer", "")} /></td>
      );
      case "model": return input("modelNo");
      // 2026-10-09 - the vendor is picked from the Directory (or set by an awarded RFQ quote); the
      // line then shows in that company's profile, where it enters its prices.
      case "vendor": return (
        <td key={id} className="px-1 py-1 align-top"><DirectoryNameField className={`w-full ${strike}`} value={it.vendorName || ""} disabled={!rowEdit} categories={["vendor", "supplier", "manufacturer", "subcontractor"]} title="Vendor" placeholder="Pick a vendor"
          onPick={(co) => { editCell(it._id, "vendorName", co.name); editCell(it._id, "vendorCompanyId", co._id); }} onClear={() => { editCell(it._id, "vendorName", ""); editCell(it._id, "vendorCompanyId", ""); }} /></td>
      );
      case "unitPrice": return <td key={id} className="px-3 py-2 align-top text-right text-[11px] font-bold tabular-nums text-slate-700">{usd(offerByItem.get(it._id)?.unitPrice) || <span className="font-normal text-slate-300">—</span>}</td>;
      case "totalPrice": {
        const o = offerByItem.get(it._id);
        return (
          <td key={id} className="px-3 py-2 align-top text-right text-[11px] font-bold tabular-nums text-slate-700">
            {usd(o?.total) || <span className="font-normal text-slate-300">—</span>}
            {o && <span className={`mt-0.5 block text-[9px] font-bold uppercase tracking-wide ${o.status === "accepted" ? "text-emerald-600" : "text-blue-600"}`}>{o.status === "accepted" ? "Accepted" : "From the vendor"}</span>}
          </td>
        );
      }
      case "vendorLead": return <td key={id} className="px-3 py-2 align-top text-[11px] text-slate-600 break-words">{offerByItem.get(it._id)?.leadTime || <span className="text-slate-300">—</span>}</td>;
      case "qty": return input("qty", "text-right");
      case "unit": return input("unit");
      case "spec": return <td key={id} className="px-1 py-1 align-top"><AutoCell value={it.spec || ""} onChange={(v) => editCell(it._id, "spec", v)} disabled={!rowEdit} className={`${cell} align-top ${strike}`} /></td>;
      case "needOnSite": return <td key={id} className="px-1 py-1 align-top"><input type="date" value={it.needOnSiteDate || ""} onChange={(e) => editCell(it._id, "needOnSiteDate", e.target.value)} disabled={!rowEdit} aria-label="Need on site" className={`${cell} ${strike}`} /></td>;
      case "lead": return input("leadTimeDays", "text-right");
      case "orderBy": {
        const risk = isAtRisk(it);
        return (
          <td key={id} className={`px-3 py-2 align-top text-[11px] whitespace-nowrap overflow-hidden ${risk ? "text-red-600 font-bold" : "text-slate-500"}`} title={risk ? "The order-by date has passed and the item is not on site yet" : undefined}>
            {orderByDate(it.needOnSiteDate, it.leadTimeDays) || "—"}{risk && <AlertTriangle size={11} className="ml-1 inline -mt-0.5" />}
          </td>
        );
      }
      case "submittal": return (
        <td key={id} className="px-3 py-2 align-top relative">{(() => {
          const sub = submittals.find((s) => s.itemId === it._id);
          if (!sub) {
            // No package yet (C1): offer to go create one.
            return onGoToSubmittals && canEdit
              ? <button onClick={() => onGoToSubmittals(it._id)} className="text-slate-300 hover:text-primary text-[10px] font-bold" title="No submittal yet: create one in the Submittals tab">+ Submittal</button>
              : <span className="text-slate-300 text-[10px]">—</span>;
          }
          const meta = subByItem[it._id];
          return (
            <>
              <button onClick={() => setSubMenu(subMenu === it._id ? null : it._id)} className={`inline-block max-w-full truncate px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer hover:ring-2 hover:ring-primary/20 ${DISPO_CLS[meta.disposition] || "bg-slate-100 text-slate-500"}`} title="Open the submittal">{submittalText(meta)}</button>
              {subMenu === it._id && (() => {
                const rev = sub.revisions.find((r) => r.isCurrent) || sub.revisions[sub.revisions.length - 1];
                return (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSubMenu(null)} />
                    <div className="absolute z-20 mt-1 left-3 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-44 text-left">
                      {rev && <button onClick={() => { setSubMenu(null); setSubPreview({ title: `${sub.title || sub.productName || "Submittal"}, Rev ${rev.revisionNo}`, fileName: `${(sub.title || sub.productName || "submittal").replace(/\s+/g, "_")}_Rev${rev.revisionNo}.pdf`, build: async () => (await buildSubmittalPackage(sub, rev)).blob }); }} className="w-full text-left px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2"><Eye size={12} /> Preview PDF</button>}
                      {onGoToSubmittals && <button onClick={() => { setSubMenu(null); onGoToSubmittals(it._id); }} className="w-full text-left px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2"><ExternalLink size={12} /> Open in Submittals</button>}
                    </div>
                  </>
                );
              })()}
            </>
          );
        })()}</td>
      );
      case "status": {
        // 2026-10-09 - the status is set here now (it was on the Master Log), saved at once.
        const canSet = canEdit && !isCancelled && !it.locked;
        return (
          <td key={id} className="px-2 py-1.5 align-top">
            {canSet ? (
              <select value={it.status} onChange={(e) => void setStatus(it._id, e.target.value as ProcurementStatus)} aria-label="Status" title="Set the status (saved at once)"
                className={`max-w-full px-2 py-1 rounded-full text-[10px] font-bold outline-none cursor-pointer border-0 ${statusCls(it.status)}`}>
                {STATUS_ORDER.map((st) => <option key={st} value={st}>{STATUS_META[st].label}</option>)}
              </select>
            ) : (
              <span className={`inline-block max-w-full truncate px-2 py-0.5 rounded-full text-[10px] font-bold ${statusCls(it.status)}`} title={isCancelled && it.cancellationReason ? `Reason: ${it.cancellationReason}` : undefined}>{statusText(it.status)}</span>
            )}
          </td>
        );
      }
    }
  };

  // I1 - a past revision under its line, cell for cell; the fields it changed in colour.
  const revCell = (id: BoqColId, rev: ApiProcurementItemRevision): ReactNode => {
    const td = (field: string, v: string) => <td key={id} className={`px-3 py-1.5 align-top text-[11px] whitespace-pre-wrap break-words ${rev.changedFields.includes(field) ? "text-primary font-bold" : "text-slate-400"}`}>{v || "—"}</td>;
    switch (id) {
      case "rev": return <td key={id} className="px-2 py-1.5 align-top text-[10px] font-bold text-slate-400">RV{rev.revNo}</td>;
      case "description": return td("description", rev.description);
      case "brand": return td("manufacturer", rev.manufacturer);
      case "model": return td("modelNo", rev.modelNo);
      case "qty": return td("qty", rev.qty);
      case "unit": return td("unit", rev.unit);
      case "spec": return td("spec", rev.spec);
      case "needOnSite": return td("needOnSiteDate", rev.needOnSiteDate);
      case "lead": return td("leadTimeDays", rev.leadTimeDays);
      case "orderBy": return <td key={id} className="px-3 py-1.5 align-top text-[11px] text-slate-400 whitespace-nowrap">{orderByDate(rev.needOnSiteDate, rev.leadTimeDays) || "—"}</td>;
      case "status": return (
        <td key={id} className="px-3 py-1.5 align-top text-[10px] text-slate-400">
          {statusText(rev.status)}
          {rev.note && <div className={`mt-0.5 text-[9px] font-semibold italic leading-tight ${rev.note.startsWith("Cancelled") ? "text-red-500" : rev.note.startsWith("Restored") ? "text-emerald-600" : "text-amber-600"}`}>{rev.note}</div>}
        </td>
      );
      default: return <td key={id} className="px-3 py-1.5" />;
    }
  };

  // New-item DRAFT rows: fill in, then Save once (no revisions until later edits).
  const draftCell = (id: BoqColId, d: DraftItem): ReactNode => {
    const dc = (field: keyof DraftItem, extra = "") => <td key={id} className="px-1 py-1 align-top"><input value={d[field]} onChange={(e) => editDraft(d.tempId, field, e.target.value)} aria-label={colById(id).label} className={`${cell} ${extra}`} /></td>;
    switch (id) {
      case "category": return <td key={id} className="px-3 py-2 align-top text-[11px] text-slate-500 break-words">{sectionName(d.sectionId)}</td>;
      case "no": return <td key={id} className="px-3 py-2 align-top"><span className="text-[9px] font-bold text-primary uppercase tracking-widest">New</span></td>;
      case "description": return <td key={id} className="px-1 py-1 align-top"><AutoCell value={d.description} onChange={(v) => editDraft(d.tempId, "description", v)} className={`${cell} align-top`} /></td>;
      case "brand": return (
        <td key={id} className="px-1 py-1 align-top"><DirectoryNameField className="w-full" value={d.manufacturer} categories={["manufacturer", "supplier", "vendor"]} title="Brand (manufacturer)" placeholder="Pick a brand"
          onPick={(co) => editDraft(d.tempId, "manufacturer", co.name)} onClear={() => editDraft(d.tempId, "manufacturer", "")} /></td>
      );
      case "model": return dc("modelNo");
      case "qty": return dc("qty", "text-right");
      case "unit": return dc("unit");
      case "spec": return <td key={id} className="px-1 py-1 align-top"><AutoCell value={d.spec} onChange={(v) => editDraft(d.tempId, "spec", v)} className={`${cell} align-top`} /></td>;
      case "needOnSite": return <td key={id} className="px-1 py-1 align-top"><input type="date" value={d.needOnSiteDate} onChange={(e) => editDraft(d.tempId, "needOnSiteDate", e.target.value)} aria-label="Need on site" className={cell} /></td>;
      case "lead": return dc("leadTimeDays", "text-right");
      case "orderBy": return <td key={id} className="px-3 py-2 align-top text-[11px] text-slate-500 whitespace-nowrap overflow-hidden">{orderByDate(d.needOnSiteDate, d.leadTimeDays) || "—"}</td>;
      case "status": return <td key={id} className="px-2 py-2 align-top"><span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-50 text-yellow-700">Not saved</span></td>;
      default: return <td key={id} className="px-3 py-2 align-top"><span className="text-slate-300 text-[10px]">—</span></td>;
    }
  };

  const renderItem = (it: ApiProcurementItem) => {
    const isCancelled = it.status === "Cancelled";
    const isLocked = !!it.locked;
    const rowEdit = canEdit && !isCancelled && !isLocked;   // cancelled (I3) or locked (CR-P-13) rows are read-only
    const strike = isCancelled ? "line-through text-red-400" : "";
    const risk = isAtRisk(it);
    return (
      <Fragment key={it._id}>
        <tr className={isCancelled ? "bg-red-50/50" : selected[it._id] ? "bg-primary/5" : risk ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-slate-50/40"}>
          {selCol && <td className="px-3 py-2 align-top">{!isCancelled && <input type="checkbox" checked={!!selected[it._id]} onChange={() => toggleSelect(it._id)} aria-label="Select this item" />}</td>}
          {layout.visible.map((c) => itemCell(c.id, it, rowEdit, strike))}
          <td className="px-2 py-1 align-top">
            {isCancelled ? (canEdit ? (
              <button onClick={() => restoreItem(it._id)} className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline whitespace-nowrap" title={it.cancellationReason ? `Reason: ${it.cancellationReason}` : "Restore this item"}><RotateCcw size={12} /> Restore</button>
            ) : null) : (
              <div className="flex flex-wrap items-center gap-1">
                {/* CR-P-13 - unsaved inline edits: Save persists this row; Revert discards them. */}
                {canEdit && dirtyRows[it._id] && (
                  <>
                    <button onClick={() => saveRow(it._id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-600" title="Save changes to this line"><Check size={12} /> Save</button>
                    <button onClick={() => revertRow(it._id)} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-slate-500 text-[10px] font-bold hover:text-red-500" title="Discard unsaved changes"><RotateCcw size={12} /> Revert</button>
                  </>
                )}
                {canEdit && <button onClick={() => setManageId(it._id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-primary hover:text-white" title="Manage: edit, submittal, duplicate, cancel"><Settings2 size={12} /> Manage</button>}
                <button onClick={() => openLineExport(it)} className="inline-flex items-center gap-1 p-1.5 rounded text-slate-400 hover:text-primary hover:bg-primary/5 text-[10px] font-bold" title="Export / share this line as a PDF"><Download size={13} />{!canEdit && " Line"}</button>
                {canEdit && (
                  <>
                    <button onClick={() => toggleLock(it)} className={`p-1.5 rounded ${isLocked ? "text-amber-600 bg-amber-50" : "text-slate-300 hover:text-slate-600 hover:bg-slate-50"}`} title={isLocked ? "Locked: click to unlock" : "Lock this item (prevents accidental edits or deleting)"}>{isLocked ? <Lock size={13} /> : <Unlock size={13} />}</button>
                    <button onClick={() => duplicateItem(it)} className="p-1.5 rounded text-slate-300 hover:text-primary hover:bg-primary/5" title="Duplicate row"><Copy size={13} /></button>
                    <button onClick={() => hardDelete(it._id)} disabled={isLocked} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:hover:text-slate-300 disabled:hover:bg-transparent" title={isLocked ? "Unlock first to delete" : "Delete"}><Trash2 size={13} /></button>
                  </>
                )}
              </div>
            )}
          </td>
        </tr>

        {/* I1 - inline revision history (previous states copied down, newest first) */}
        {expanded[it._id] && (revisions[it._id] === undefined ? (
          <tr className="bg-slate-50/70"><td colSpan={colCount} className="px-6 py-2 text-[11px] text-slate-400 italic">Loading history…</td></tr>
        ) : revisions[it._id].length === 0 ? (
          <tr className="bg-slate-50/70"><td colSpan={colCount} className="px-6 py-2 text-[11px] text-slate-400 italic">No earlier revisions recorded.</td></tr>
        ) : revisions[it._id].map((rev) => (
          <tr key={rev._id} className="bg-slate-50/70 border-t border-slate-100/70">
            {selCol && <td className="px-3 py-1.5" />}
            {layout.visible.map((c) => revCell(c.id, rev))}
            <td className="px-2 py-1.5 align-top text-[9px] text-slate-400 whitespace-nowrap leading-tight">{rev.actorName || "—"}<br />{new Date(rev.createdAt).toLocaleDateString()}</td>
          </tr>
        )))}
      </Fragment>
    );
  };

  const renderDraft = (d: DraftItem) => (
    <tr key={d.tempId} className="bg-primary/5">
      {selCol && <td className="px-3 py-2 align-top" />}
      {layout.visible.map((c) => draftCell(c.id, d))}
      <td className="px-2 py-1 align-top">
        <div className="flex flex-wrap items-center gap-1">
          <button onClick={() => saveDraft(d.tempId)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-600" title="Save this item"><Check size={13} /> Save</button>
          {/* CR-P-12 - save then jump to Manage to attach pictures / catalogue / data sheet / drawing / submittal + remarks. */}
          <button onClick={() => saveDraft(d.tempId, true)} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-500 text-emerald-600 text-[10px] font-bold hover:bg-emerald-50" title="Save this item and attach its documents (pictures, catalogue, data sheet, drawing, submittal)"><FileText size={13} /> Save &amp; docs</button>
          <button onClick={() => removeDraft(d.tempId)} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50" title="Discard"><Trash2 size={13} /></button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-5">
    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-display font-bold text-slate-900">Bill of Quantity (BOQ)</h3>
            {/* CR-B-01 - who else is in the BOQ right now. */}
            <PresenceBar users={present} />
          </div>
          <p className="text-xs font-medium text-slate-400 mt-1">{active.length} active item{active.length === 1 ? "" : "s"} across {sections.length} categor{sections.length === 1 ? "y" : "ies"}, {stats.notStarted} not started. Cancelled items are kept for claims.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowPreview(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold" title="Print or save the BOQ as shown: its columns, filters and order"><Printer size={13} /> Print / PDF</button>
          <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold"><Download size={13} /> Export</button>
          {canEdit && (
            <button onClick={() => setImportModal({ mode: "new" })} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold" title="Import an Excel/CSV file as a new category.">
              <Upload size={13} /> Import as new category
            </button>
          )}
          {canEdit && <button onClick={() => addSection("New Category")} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary transition-all"><Plus size={13} /> Add Category</button>}
        </div>
      </div>

      {/* C6 and the Master Log's cards: totals at a glance; At risk filters to what must be ordered now. */}
      {sections.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/10">
            <span className="text-lg font-display font-bold text-primary leading-none">{active.length}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total items</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-lg font-display font-bold text-slate-700 leading-none">{sections.length}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Categories</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100">
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span className="text-lg font-display font-bold text-emerald-700 leading-none">{stats.completed}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Completed</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-100">
            <Clock size={13} className="text-amber-600" />
            <span className="text-lg font-display font-bold text-amber-700 leading-none">{stats.inProgress}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">In progress</span>
          </span>
          <button type="button" onClick={() => setRiskOnly((v) => !v)} disabled={!stats.atRisk && !riskOnly} aria-pressed={riskOnly}
            title={stats.atRisk > 0 ? "Order-by date passed and not on site yet: click to show only these" : "On track: no order-by dates have passed"}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors ${stats.atRisk ? "bg-red-50 border-red-100 hover:bg-red-100/60 cursor-pointer" : "bg-slate-50 border-slate-100 cursor-default"} ${riskOnly ? "ring-2 ring-red-400" : ""}`}>
            <AlertTriangle size={13} className={stats.atRisk ? "text-red-600" : "text-slate-300"} />
            <span className={`text-lg font-display font-bold leading-none ${stats.atRisk ? "text-red-600" : "text-slate-400"}`}>{stats.atRisk}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">At risk</span>
          </button>
          {cancelled.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50/60 border border-red-100">
              <span className="text-lg font-display font-bold text-red-600 leading-none">{cancelled.length}</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cancelled</span>
            </span>
          )}
        </div>
      )}

      {/* Search and filters (from the Master Log), then the view and the columns. */}
      {sections.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-grow min-w-[12rem]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items by description, brand, model, spec…" aria-label="Search items" className="w-full bg-slate-50 border border-slate-100 rounded-lg pl-9 pr-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10" />
            </div>
            <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} aria-label="Category" className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs font-bold outline-none">
              <option value="all">All categories</option>
              {sections.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status" className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs font-bold outline-none">
              <option value="all">All statuses</option>
              {STATUS_ORDER.map((st) => <option key={st} value={st}>{STATUS_META[st].label}</option>)}
              <option value="Cancelled">Cancelled</option>
            </select>
            {filtering && <button onClick={() => { setSearch(""); setSectionFilter("all"); setStatusFilter("all"); setRiskOnly(false); }} className="text-[11px] font-bold text-slate-500 hover:text-slate-900 px-2">Clear</button>}
            <span className="text-[10px] text-slate-400 ml-auto">{shownRows.length} of {items.length}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white" role="group" aria-label="View">
              <button type="button" onClick={() => layout.setFlat(false)} aria-pressed={!layout.flat} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold transition-colors ${!layout.flat ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`}><Rows3 size={12} /> By category</button>
              <button type="button" onClick={() => layout.setFlat(true)} aria-pressed={layout.flat} title="Every item in one list, as the Master Log showed them: sort across the categories" className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold transition-colors ${layout.flat ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`}><LayoutList size={12} /> One list</button>
            </span>
            <div className="relative">
              <button type="button" onClick={() => setColMenu((v) => !v)} aria-expanded={colMenu} aria-haspopup="true" className={toolBtn}><Columns3 size={12} /> Columns <span className="text-slate-400">{layout.visible.length}/{layout.available.length}</span></button>
              {colMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setColMenu(false)} />
                  <div className="absolute left-0 z-30 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                    <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Show columns</p>
                    <div className="max-h-72 overflow-y-auto">
                      {layout.available.map((c) => {
                        const last = layout.on[c.id] && layout.visible.length === 1;
                        return (
                          <label key={c.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-700 ${last ? "opacity-50" : "cursor-pointer hover:bg-slate-50"}`}>
                            <input type="checkbox" checked={layout.on[c.id]} disabled={last} onChange={(e) => layout.setOn(c.id, e.target.checked)} /> {c.label}
                          </label>
                        );
                      })}
                    </div>
                    <div className="mt-1 flex gap-1 border-t border-slate-100 pt-2">
                      <button type="button" onClick={layout.showAll} className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100">Show all</button>
                      <button type="button" onClick={layout.reset} title="The standard columns and widths" className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100">Reset</button>
                    </div>
                    <p className="px-2 pt-1 text-[10px] leading-snug text-slate-400">The print and the export show the same columns.</p>
                  </div>
                </>
              )}
            </div>
            <button type="button" onClick={() => layout.autoFit(textsOf)} title="Size every column to its content" className={toolBtn}><MoveHorizontal size={12} /> Auto-fit</button>
            <button type="button" onClick={fitToScreen} aria-pressed={layout.fit} title={layout.fit ? "On: the columns keep fitting the screen. Drag a column's edge to size it yourself." : "Fit the shown columns across the screen, so the whole BOQ is in view"} className={`${toolBtn} ${layout.fit ? "!border-primary/40 !bg-primary/5 !text-primary" : ""}`}><ArrowLeftRight size={12} /> Fit to screen</button>
            <span className="text-[10px] text-slate-400">Click a heading to sort. Drag its edge to resize; double-click the edge to fit.</span>
          </div>
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

      {/* §H - selection action bar */}
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

      {/* The tables read their column widths from this box, so every category lines up. */}
      <div ref={layout.boxRef} style={layout.widthVars} className="space-y-5">
      {layout.flat && (items.length > 0 || sections.length > 0) && (
        <div className="border border-slate-100 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-fixed text-xs" style={tableStyle}>
              {colgroup}
              {head(flatRows)}
              <tbody className="divide-y divide-slate-50">
                {flatRows.length === 0
                  ? <tr><td colSpan={colCount} className="px-3 py-8 text-center text-[11px] text-slate-400 italic">{filtering ? "No items match." : "No items yet."}</td></tr>
                  : flatRows.map(renderItem)}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <p className="border-t border-slate-50 px-3 py-2 text-[11px] text-slate-400">
              Every category in one list. To add or import items{drafts.length ? `, or to review the ${drafts.length} unsaved draft row${drafts.length === 1 ? "" : "s"}` : ""}, switch to{" "}
              <button type="button" onClick={() => layout.setFlat(false)} className="font-bold text-primary hover:underline">By category</button>.
            </p>
          )}
        </div>
      )}

      {!layout.flat && sections.map((s, sIdx) => {
        if (!sectionOn(s._id)) return null;
        const its = shownIn(s._id); // active + cancelled (in place unless sorted)
        const total = itemsIn(s._id).length;
        const shownActive = its.filter((it) => it.status !== "Cancelled").length;
        // While filtering, hide categories with nothing to show.
        if (filtering && its.length === 0 && draftsIn(s._id).length === 0) return null;
        const isCollapsed = collapsed[s._id];
        return (
          <div key={s._id} className="border border-slate-100 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5">
              <button onClick={() => setCollapsed((c) => ({ ...c, [s._id]: !c[s._id] }))} aria-label={isCollapsed ? "Expand" : "Collapse"} className="text-slate-400 hover:text-slate-900">
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>
              {canEdit
                ? <input value={s.name} onChange={(e) => renameSection(s._id, e.target.value)} onBlur={(e) => saveSection(s._id, e.target.value)} aria-label="Category name" className="font-bold text-slate-800 text-sm bg-transparent outline-none border-b border-transparent focus:border-primary/30 py-0.5 flex-grow" />
                : <span className="font-bold text-slate-800 text-sm flex-grow">{s.name}</span>}
              <span className="text-[10px] font-bold text-slate-400">{filtering && shownActive !== total ? `${shownActive} of ` : ""}{total} item{total === 1 ? "" : "s"}</span>
              {canEdit && (
                <div className="flex items-center">
                  <button onClick={() => moveSection(s._id, -1)} disabled={sIdx === 0} className="p-1 rounded text-slate-300 hover:text-slate-700 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent" title="Move category up"><ArrowUp size={13} /></button>
                  <button onClick={() => moveSection(s._id, 1)} disabled={sIdx === sections.length - 1} className="p-1 rounded text-slate-300 hover:text-slate-700 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent" title="Move category down"><ArrowDown size={13} /></button>
                </div>
              )}
              {canEdit && (() => {
                const act = items.filter((it) => it.sectionId === s._id && it.status !== "Cancelled");
                const allLocked = act.length > 0 && act.every((it) => it.locked);
                return <button onClick={() => lockSection(s._id, !allLocked)} disabled={!act.length} className={`p-1.5 rounded disabled:opacity-30 disabled:hover:bg-transparent ${allLocked ? "text-amber-600 bg-amber-50" : "text-slate-300 hover:text-slate-700 hover:bg-white"}`} title={allLocked ? "Category locked: click to unlock all items" : "Lock all items in this category (prevents accidental changes)"}>{allLocked ? <Lock size={13} /> : <Unlock size={13} />}</button>;
              })()}
              {/* CR-B-19 - tag a colleague to edit/review/verify this category. */}
              {canEdit && <AssignColleague value={s.assignedTo} onChange={(name) => assignSection(s._id, name)} notify={{ title: `Review BOQ category "${s.name || "Section"}"`, notes: "You were tagged to edit / review / verify this BOQ category.", projectId, projectName: projectInfo?.name }} />}
              {canEdit && <button onClick={() => removeSection(s._id)} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-white" title="Delete category"><Trash2 size={13} /></button>}
            </div>

            {!isCollapsed && (
              <div>
                <div className="overflow-x-auto">
                  <table className="table-fixed text-xs" style={tableStyle}>
                    {colgroup}
                    {head(its)}
                    <tbody className="divide-y divide-slate-50">
                      {its.length === 0 && draftsIn(s._id).length === 0 ? (
                        <tr><td colSpan={colCount} className="px-3 py-5 text-center text-[11px] text-slate-400 italic">No items.{canEdit ? " Add one below." : ""}</td></tr>
                      ) : its.map(renderItem)}
                      {canEdit && draftsIn(s._id).map(renderDraft)}
                    </tbody>
                  </table>
                </div>
                {canEdit && draftsIn(s._id).length > 0 && (
                  <div className="px-3 py-2 border-t border-yellow-100 bg-yellow-50/60 flex flex-wrap items-center gap-3">
                    <span className="text-[11px] font-bold text-yellow-700">{draftsIn(s._id).length} unsaved draft{draftsIn(s._id).length === 1 ? "" : "s"}: nothing is saved until you confirm.</span>
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

      {/* 2026-10-08 - items whose category no longer exists, listed to move or delete. */}
      {!layout.flat && sectionFilter === "all" && lostItems.length > 0 && (
        <div className="border border-amber-200 rounded-2xl overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 bg-amber-50 px-4 py-2.5">
            <span className="font-bold text-amber-800 text-sm">No category</span>
            <span className="text-[11px] text-amber-700">{lostItems.length} item{lostItems.length === 1 ? "" : "s"} without a category. Move each into a category, or delete it.</span>
          </div>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-50">
              {lostItems.map((it) => (
                <tr key={it._id}>
                  <td className="px-3 py-2 font-bold text-slate-700 whitespace-pre-wrap break-words">{it.description || <span className="italic font-normal text-slate-400">No description</span>}</td>
                  <td className="px-3 py-2 text-slate-500">{it.manufacturer || "—"}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{[it.qty, it.unit].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{statusText(it.status)}</td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {sections.length > 0 && (
                        <select value="" aria-label="Move to a category" className={`${cell} w-auto mr-2`}
                          onChange={async (e) => {
                            const sid = e.target.value;
                            if (!sid) return;
                            try { const up = await updateProcurementItem(projectId, it._id, { sectionId: sid }); setItems((p) => p.map((x) => (x._id === it._id ? { ...x, ...up } : x))); toast(`Moved to ${sections.find((s) => s._id === sid)?.name || "the category"}.`, "success"); }
                            catch (err) { toast(err instanceof Error ? err.message : "Could not move it.", "error"); }
                          }}>
                          <option value="">Move to…</option>
                          {sections.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                        </select>
                      )}
                      <button type="button" onClick={() => void hardDelete(it._id)} title="Delete it" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50"><Trash2 size={12} /> Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {/* I3 - cancelled items stay in place (red rows) inside their category, with Restore. */}
      {cancelled.length > 0 && (
        <p className="text-[11px] text-red-500/80 font-medium px-1">
          {cancelled.length} cancelled item{cancelled.length === 1 ? "" : "s"} kept for claims, shown in red within {cancelled.length === 1 ? "its category" : "their categories"} (Restore available on each).
        </p>
      )}

      {/* 2026-10-09 - the Master Log's activity timeline (append-only audit), here now. */}
      <div className="border border-slate-100 rounded-2xl overflow-hidden">
        <button onClick={() => setShowActivity((v) => !v)} aria-expanded={showActivity} className="w-full flex items-center gap-2 px-4 py-2.5 text-left">
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
                  <li key={e._id} className="flex flex-wrap items-start gap-x-2 text-[11px]">
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
              <div className="text-[11px] font-bold text-slate-500">Brand
                <DirectoryNameField className="mt-1" value={addForm.manufacturer} categories={["manufacturer", "supplier", "vendor"]} title="Brand (manufacturer)" placeholder="Pick from the Directory"
                  onPick={(co) => setAddField("manufacturer", co.name)} onClear={() => setAddField("manufacturer", "")} /></div>
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
              {/* CR-P-12 — Save as Draft: a saved-but-incomplete item, shown as Draft to finish later. */}
              <button onClick={() => saveAddPopup(false, true)} className="px-4 py-2 rounded-xl border border-amber-300 text-amber-700 bg-amber-50 text-xs font-bold hover:bg-amber-100">Save as Draft</button>
              <button onClick={() => saveAddPopup(false)} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary">Save</button>
              <button onClick={() => saveAddPopup(true)} className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 inline-flex items-center gap-1.5"><FileText size={13} /> Save &amp; docs</button>
            </div>
          </div>
        </div>
      )}
      {dialogs}
      {showPreview && (
        <PdfPreviewModal title="Bill of Quantity (BOQ)" fileName="BOQ.pdf" build={() => buildBoqPdf(sections, shownRows, projectInfo, printLayout(scopeText))} onClose={() => setShowPreview(false)} fitOption={{ note: "Bill of Quantities" }} />
      )}
      {/* CR-P-14 — per-line export (one BOQ line as its own PDF, downloadable/shareable). */}
      {linePreview && (
        <PdfPreviewModal
          title={`BOQ item #${displayNo[linePreview.item._id] ?? ""} — ${linePreview.item.description || "line"}${linePreview.extras.length ? " (+ past revisions)" : ""}`}
          fileName={`BOQ_item_${displayNo[linePreview.item._id] ?? ""}.pdf`}
          build={() => buildBoqPdf(sections.filter((s) => s._id === linePreview.item.sectionId), [linePreview.item, ...linePreview.extras], projectInfo, { ...printLayout(), flat: false })}
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
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Brand</label>
                    <DirectoryNameField value={(mDraft.manufacturer as string) ?? ""} disabled={!canEdit} categories={["manufacturer", "supplier", "vendor"]} title="Brand (manufacturer)" placeholder="Pick from the Directory"
                      onPick={(co) => setMDraft((p) => ({ ...p, manufacturer: co.name }))} onClear={() => setMDraft((p) => ({ ...p, manufacturer: "" }))} />
                  </div>
                  {mField("Model", "modelNo")}
                  {mField("Quantity", "qty")}
                  {mField("Unit", "unit")}
                  {mField("Spec / Size", "spec")}
                  {mField("Need on site", "needOnSiteDate", "date")}
                  {mField("Lead time (days)", "leadTimeDays")}
                </div>
                <p className="text-[11px] text-slate-500">Order-by date: <span className="font-bold text-slate-700">{orderByDate(mDraft.needOnSiteDate || m.needOnSiteDate, mDraft.leadTimeDays || m.leadTimeDays) || "—"}</span> · Status: <span className="font-bold text-slate-700">{statusText(m.status)}</span> · RV{m.revNo || 0}</p>

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

                {/* 2026-10-09 - what the line's vendor sent from its profile: Accept or Reopen. */}
                {offersOk && !!m.vendorCompanyId && (
                  <VendorOfferPanel projectId={projectId} kind="boq" refId={m._id} companyId={m.vendorCompanyId} companyName={m.vendorName || ""} onChanged={() => void loadOffers()} />
                )}

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
                  {/* CR-P-12 — clear the Draft flag once the item is complete. */}
                  {m.draft && <button onClick={async () => { try { await updateProcurementItem(projectId, m._id, { draft: false }); setItems((p) => p.map((x) => (x._id === m._id ? { ...x, draft: false } : x))); toast("Draft finalized.", "success"); } catch (e) { toast(e instanceof Error ? e.message : "Could not finalize.", "error"); } }} className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-[12px] font-bold hover:bg-emerald-600 inline-flex items-center gap-1.5 mr-auto"><Check size={13} /> Finalize draft</button>}
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
                        <td className="px-2 py-1.5"><span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${statusCls(it.status)}`}>{statusText(it.status)}</span></td>
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
        { label: "PDF", ext: "pdf", baseName: "BOQ", build: () => buildBoqPdf(sections, items, projectInfo, printLayout()) },
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
