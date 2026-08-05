import { Fragment, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, FileText, Upload, X, FilePlus2, Copy, Download, ChevronRight, ChevronDown, Lock, Search, Eye, AlertTriangle, Settings2, FileCheck2, FolderOpen, Monitor, Archive, RotateCcw } from "lucide-react";
import {
  fetchSubmittals, createSubmittal, updateSubmittal, deleteSubmittal, setSubmittalArchived,
  addSubmittalRevision, updateSubmittalRevision, uploadSubmittalAttachment, deleteSubmittalAttachment,
  addSubmittalAttachmentFromDocument, attachmentUrl, fetchProcurementItems, fetchProcurementSections, fetchDocuments, getAuthUser, uploadDocument,
  type ApiSubmittal, type ApiSubmittalRevision, type SubmittalDisposition, type SubmittalComponent, type ApiProcurementItem, type ApiProcurementSection, type ApiDocument,
} from "../../lib/api";
import { sectionToPath } from "../../lib/docTree";
import { Folder } from "lucide-react";
import { buildSubmittalPackage } from "../../lib/submittalPackage";
import { downloadBlob } from "../../lib/proposalExport";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import PdfPreviewModal from "./PdfPreviewModal";

const DISPO: { k: SubmittalDisposition; label: string; cls: string }[] = [
  { k: "Pending", label: "Pending", cls: "bg-amber-50 text-amber-600" },
  { k: "Approved", label: "Approved", cls: "bg-emerald-50 text-emerald-600" },
  { k: "ApprovedAsNoted", label: "Approved as Noted", cls: "bg-emerald-50 text-emerald-600" },
  { k: "ReviseResubmit", label: "Revise & Resubmit", cls: "bg-orange-50 text-orange-600" },
  { k: "Rejected", label: "Rejected", cls: "bg-red-50 text-red-600" },
];
const dispoMeta = (d: SubmittalDisposition) => DISPO.find((x) => x.k === d) || { k: d, label: d, cls: "bg-slate-100 text-slate-500" };

// The package components — these are what get assembled into the Combined PDF we send the client.
// The client's approval/rejection LETTER is deliberately NOT here; it's the client's reply and
// lives in its own "Client response" section (see renderClientResponse).
const COMPONENTS: { k: SubmittalComponent; label: string }[] = [
  { k: "cover", label: "Cover Page" }, { k: "spec", label: "Specification" }, { k: "catalog", label: "Catalog / Data Sheet" },
  { k: "drawing", label: "Drawings" }, { k: "photo", label: "Site Photos" }, { k: "other", label: "Other" },
];
// Dispositions where the client sends back a signed letter we must keep on record (C7).
const DECIDED: SubmittalDisposition[] = ["Approved", "ApprovedAsNoted", "Rejected"];

const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/10";

export default function ProcurementSubmittals({ projectId, canEdit, highlightItemId, onHighlightDone }: { projectId: string; canEdit: boolean; highlightItemId?: string; onHighlightDone?: () => void }) {
  const [subs, setSubs] = useState<ApiSubmittal[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null); // §C9 — submittal id to flash
  const [manageId, setManageId] = useState<string | null>(null); // action modal target (§A1 — tasks via popup)
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: "", productName: "", manufacturer: "", modelNo: "", specSection: "", itemId: "" });
  const [items, setItems] = useState<ApiProcurementItem[]>([]);
  const [sections, setSections] = useState<ApiProcurementSection[]>([]);
  const [building, setBuilding] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; fileName: string; build: () => Promise<Blob> } | null>(null);
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [dispoFilter, setDispoFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"none" | "status" | "category">("none");
  const [pickerSearch, setPickerSearch] = useState("");      // search inside the "link BOQ item" picker
  const [pickerSection, setPickerSection] = useState("all"); // section filter inside the picker
  // "Add File" now offers computer vs project-documents. This tracks the open per-component menu +
  // the project-documents picker (loaded lazily from the Documents module).
  const [addMenuKey, setAddMenuKey] = useState<string | null>(null);
  const [docPicker, setDocPicker] = useState<{ sid: string; rid: string; component: SubmittalComponent } | null>(null);
  const [projectDocs, setProjectDocs] = useState<ApiDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docSearch, setDocSearch] = useState("");
  // Folder-drill inside the project-documents picker: tab → section group.
  const [pickerNav, setPickerNav] = useState<{ tabId?: string; group?: string }>({});
  const { confirm, dialogs } = useDialogs();
  // Partners & subcontractors don't get the "Choose from project documents" option — employees only.
  const isGuest = getAuthUser()?.role === "subcontractor";

  const [showArchived, setShowArchived] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const [s, it, secs] = await Promise.all([fetchSubmittals(projectId, showArchived), fetchProcurementItems(projectId).catch(() => []), fetchProcurementSections(projectId).catch(() => [])]);
      setSubs(s); setItems(it.filter((x) => x.status !== "Cancelled")); setSections(secs);
    } catch { /* keep */ } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [projectId, showArchived]);
  const archiveSub = async (sid: string, next: boolean) => {
    try { await setSubmittalArchived(projectId, sid, next); setSubs((p) => p.filter((s) => s._id !== sid)); }
    catch { /* ignore */ }
  };

  // §C9 — when jumped here from a BOQ item, open that item's submittal and flash it for ~2.5s.
  useEffect(() => {
    if (!highlightItemId || loading) return;
    const target = subs.find((s) => s.itemId === highlightItemId);
    if (target) { setOpenId(target._id); setFlashId(target._id); }
    const t1 = setTimeout(() => setFlashId(null), 2500);
    const t2 = setTimeout(() => onHighlightDone?.(), 100); // consume the request
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line
  }, [highlightItemId, loading, subs.length]);

  // Helpers for search/filter
  const currentDispo = (sub: ApiSubmittal): SubmittalDisposition =>
    (sub.revisions?.find((r) => r.isCurrent) || sub.revisions?.[sub.revisions.length - 1])?.disposition || "Pending";
  const itemSectionId = (itemId: string) => items.find((x) => x._id === itemId)?.sectionId || "";
  const sectionName = (sid: string) => sections.find((s) => s._id === sid)?.name || "";
  // BOQ items shown in the "link an item" picker, narrowed by its own section + search.
  const pickable = items.filter((it) => {
    if (pickerSection !== "all" && it.sectionId !== pickerSection) return false;
    if (pickerSearch.trim()) {
      const q = pickerSearch.toLowerCase();
      if (![it.description, it.manufacturer, it.modelNo, it.spec].some((v) => String(v || "").toLowerCase().includes(q))) return false;
    }
    return true;
  });
  const dispoOrder = (d: SubmittalDisposition) => DISPO.findIndex((x) => x.k === d);
  const visible = subs.filter((sub) => {
    if (sub.status === "Cancelled") return false; // F2 — hidden when its BOQ item is cancelled (restored with it)
    if (sectionFilter !== "all" && itemSectionId(sub.itemId) !== sectionFilter) return false;
    if (dispoFilter !== "all" && currentDispo(sub) !== dispoFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (![sub.title, sub.productName, sub.manufacturer, sub.specSection].some((v) => String(v || "").toLowerCase().includes(q))) return false;
    }
    return true;
  }).sort((a, b) => {
    // Group same-status (or same-category) submittals together when a sort is chosen (C10).
    if (sortBy === "status") return dispoOrder(currentDispo(a)) - dispoOrder(currentDispo(b));
    if (sortBy === "category") return sectionName(itemSectionId(a.itemId)).localeCompare(sectionName(itemSectionId(b.itemId)));
    return 0;
  });

  // D1 — show submittals as a BOQ-style table grouped by category, with the BOQ item number.
  // Continuous 1..N item numbers (matches the BOQ), so you can tell which cable a submittal is for.
  const itemNo: Record<string, number> = {};
  { let k = 0; for (const s of sections) for (const it of items.filter((x) => x.sectionId === s._id)) itemNo[it._id] = ++k; }
  const groups = sections
    .map((s) => ({ section: s, subs: visible.filter((v) => itemSectionId(v.itemId) === s._id) }))
    .filter((g) => g.subs.length > 0);
  const unlinked = visible.filter((v) => !itemSectionId(v.itemId)); // manual packages / no live BOQ link

  const emptyDraft = { title: "", productName: "", manufacturer: "", modelNo: "", specSection: "", itemId: "" };
  // Selecting a BOQ item pre-fills the package from that item and links them.
  const pickItem = (itemId: string) => {
    const it = items.find((x) => x._id === itemId);
    if (!it) { setDraft((d) => ({ ...d, itemId: "" })); return; }
    setDraft({ itemId, title: it.description || it.manufacturer || "", productName: it.description || "", manufacturer: it.manufacturer || "", modelNo: it.modelNo || "", specSection: it.spec || "" });
  };

  const create = async () => {
    if (!draft.title.trim() && !draft.productName.trim()) { toast("Pick a BOQ item, or give the package a title.", "error"); return; }
    try {
      const s = await createSubmittal(projectId, draft);
      setSubs((p) => [...p, s]); setOpenId(s._id); setCreating(false); setDraft(emptyDraft); setPickerSearch(""); setPickerSection("all");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not create.", "error"); }
  };
  const removeSub = async (sid: string) => {
    if (!(await confirm({ title: "Delete submittal?", message: "This deletes the package and all its revisions.", confirmLabel: "Delete" }))) return;
    try { await deleteSubmittal(projectId, sid); setSubs((p) => p.filter((s) => s._id !== sid)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  const patchSub = (sid: string, patch: Partial<ApiSubmittal>) => setSubs((p) => p.map((s) => (s._id === sid ? { ...s, ...patch } : s)));
  const saveSubField = (sid: string, field: "title" | "productName" | "manufacturer" | "modelNo" | "specSection", value: string) => {
    updateSubmittal(projectId, sid, { [field]: value }).catch(() => {});
  };
  const replaceRev = (sid: string, rev: ApiSubmittalRevision) =>
    setSubs((p) => p.map((s) => (s._id === sid ? { ...s, revisions: s.revisions.map((r) => (r._id === rev._id ? rev : r)) } : s)));

  const addRevision = async (sid: string, dup = false) => {
    if (!(await confirm({
      title: dup ? "Duplicate as new revision?" : "Add revision?",
      message: dup
        ? "Copies the current brand + package documents into a new revision (client letter excluded) and resets the client decision to Pending — swap only what changed."
        : "The current revision becomes a locked, superseded record (kept for claims).",
      confirmLabel: dup ? "Duplicate" : "Add revision", danger: false,
    }))) return;
    try {
      const rev = await addSubmittalRevision(projectId, sid, dup);
      setSubs((p) => p.map((s) => s._id === sid
        ? { ...s, currentRevisionNo: rev.revisionNo, revisions: [...s.revisions.map((r) => ({ ...r, isCurrent: false })), rev] }
        : s));
    } catch (err) { toast(err instanceof Error ? err.message : "Could not add revision.", "error"); }
  };
  const setDispo = (sid: string, rid: string, disposition: SubmittalDisposition) => {
    setSubs((p) => p.map((s) => s._id === sid ? { ...s, revisions: s.revisions.map((r) => r._id === rid ? { ...r, disposition } : r) } : s));
    updateSubmittalRevision(projectId, sid, rid, { disposition }).catch(() => {});
  };
  const saveRevField = (sid: string, rid: string, field: "notes" | "sentToClientAt" | "respondedAt" | "optionLabel", value: string) => {
    setSubs((p) => p.map((s) => s._id === sid ? { ...s, revisions: s.revisions.map((r) => r._id === rid ? { ...r, [field]: value } : r) } : s));
    updateSubmittalRevision(projectId, sid, rid, { [field]: value }).catch(() => {});
  };
  // Committing a "sent to client" date saves the Combined PDF into the project documents
  // (Procurement → Submittals) — same as RFQ/PO documents. Runs on COMMIT (blur), not on every
  // keystroke: a typed date emits several valid-but-wrong dates before the real one.
  // Re-saving replaces the previous copy, so a corrected date always wins. Best-effort.
  const onSentDateCommit = (sid: string, rid: string, value: string) => {
    if (!value) return;
    const sub = subs.find((s) => s._id === sid);
    const rev = sub?.revisions.find((r) => r._id === rid);
    if (sub && rev) void autoSaveSubmittalDoc(sub, { ...rev, sentToClientAt: value });
  };
  const autoSaveSubmittalDoc = async (sub: ApiSubmittal, rev: ApiSubmittalRevision) => {
    try {
      const { blob } = await buildSubmittalPackage(sub, rev);
      const name = `${(sub.title || sub.productName || "submittal").replace(/\s+/g, "_")}_Rev${rev.revisionNo}.pdf`;
      await uploadDocument(projectId, new File([blob], name, { type: "application/pdf" }), "procurement-submittals", true);
    } catch { /* best-effort */ }
  };
  const uploadComp = async (sid: string, rid: string, file: File, component: SubmittalComponent, decision = "") => {
    try { const rev = await uploadSubmittalAttachment(projectId, sid, rid, file, component, decision); replaceRev(sid, rev); }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
  };
  // Load this project's documents when the picker opens (from the Documents module).
  useEffect(() => {
    if (!docPicker) return;
    setDocsLoading(true); setDocSearch(""); setPickerNav({});
    fetchDocuments(projectId).then(setProjectDocs).catch(() => setProjectDocs([])).finally(() => setDocsLoading(false));
  }, [docPicker, projectId]);
  const addFromDoc = async (documentId: string) => {
    if (!docPicker) return;
    try { const rev = await addSubmittalAttachmentFromDocument(projectId, docPicker.sid, docPicker.rid, documentId, docPicker.component); replaceRev(docPicker.sid, rev); setDocPicker(null); toast("Document added to the package.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not add document.", "error"); }
  };
  const removeAtt = async (sid: string, rid: string, aid: string) => {
    try { const rev = await deleteSubmittalAttachment(projectId, sid, rid, aid); replaceRev(sid, rev); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  const buildPackage = async (sub: ApiSubmittal, rev: ApiSubmittalRevision) => {
    setBuilding(rev._id);
    try {
      const { blob, skipped } = await buildSubmittalPackage(sub, rev);
      downloadBlob(blob, `${(sub.title || sub.productName || "submittal").replace(/\s+/g, "_")}_Rev${rev.revisionNo}.pdf`);
      if (skipped.length) toast(`Couldn't embed (not PDF/image): ${skipped.join(", ")}`, "info");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not build the PDF.", "error"); }
    finally { setBuilding(null); }
  };

  if (loading) return <div className="py-12 flex justify-center text-slate-300"><Loader2 size={22} className="animate-spin" /></div>;

  // The client's signed reply (approval / rejection letter). This is the client's RESPONSE to the
  // package we sent — it is kept SEPARATE from the package components and is never embedded in the
  // Combined PDF. Its "type" is the client decision, grabbed automatically from the revision's
  // disposition at upload time and filed under that decision.
  const renderClientResponse = (sub: ApiSubmittal, rev: ApiSubmittalRevision, locked: boolean) => {
    const letters = rev.attachments.filter((a) => a.component === "clientLetter");
    const decided = DECIDED.includes(rev.disposition);
    const dd = dispoMeta(rev.disposition);
    return (
      <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <FileCheck2 size={13} className="text-slate-400" />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Client response — signed letter</span>
        </div>
        <p className="text-[10px] text-slate-400 mb-2 leading-snug">The client's reply after we send the package. Filed under the client decision; kept out of the Combined PDF.</p>
        {letters.length > 0 ? (
          <div className="space-y-1.5 mb-2">
            {letters.map((a) => {
              const ld = dispoMeta((a.decision || rev.disposition) as SubmittalDisposition);
              return (
                <div key={a._id} className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${ld.cls}`}>{ld.label}</span>
                  <a href={attachmentUrl(a.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-primary max-w-[220px] truncate" title={a.name}><FileText size={11} />{a.name}</a>
                  {!locked && <button onClick={() => removeAtt(sub._id, rev._id, a._id)} className="text-slate-300 hover:text-red-500"><X size={12} /></button>}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 italic mb-2">No client letter uploaded yet.</p>
        )}
        {!locked && (decided ? (
          <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${letters.length ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : `${dd.cls} hover:opacity-80`}`} title={`Files the letter under “${dd.label}” automatically`}>
            <Upload size={12} /> Upload the “{dd.label}” letter
            <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadComp(sub._id, rev._id, f, "clientLetter", rev.disposition); e.target.value = ""; }} />
          </label>
        ) : (
          <p className="text-[10px] text-slate-400 italic">Set the client decision above first — the letter is filed under that decision automatically.</p>
        ))}
      </div>
    );
  };

  // The full package + revision editor, shown in the expanded row (unchanged behaviour).
  const renderDetail = (sub: ApiSubmittal) => (
    <div className="p-4 space-y-4">
      {/* Package meta */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input className={inp} value={sub.title} disabled={!canEdit} onChange={(e) => patchSub(sub._id, { title: e.target.value })} onBlur={(e) => saveSubField(sub._id, "title", e.target.value)} placeholder="Package title" />
        <input className={inp} value={sub.productName} disabled={!canEdit} onChange={(e) => patchSub(sub._id, { productName: e.target.value })} onBlur={(e) => saveSubField(sub._id, "productName", e.target.value)} placeholder="Product" />
        <input className={inp} value={sub.manufacturer} disabled={!canEdit} onChange={(e) => patchSub(sub._id, { manufacturer: e.target.value })} onBlur={(e) => saveSubField(sub._id, "manufacturer", e.target.value)} placeholder="Manufacturer" />
        <input className={inp} value={sub.modelNo || ""} disabled={!canEdit} onChange={(e) => patchSub(sub._id, { modelNo: e.target.value })} onBlur={(e) => saveSubField(sub._id, "modelNo", e.target.value)} placeholder="Model / Part No." />
        <input className={inp} value={sub.specSection} disabled={!canEdit} onChange={(e) => patchSub(sub._id, { specSection: e.target.value })} onBlur={(e) => saveSubField(sub._id, "specSection", e.target.value)} placeholder="Spec Section" />
      </div>

      {/* Revisions, newest first — the current one leads, superseded below */}
      {[...sub.revisions].sort((a, b) => b.revisionNo - a.revisionNo).map((rev) => {
        const locked = !rev.isCurrent || !canEdit;
        const d = dispoMeta(rev.disposition);
        return (
          <div key={rev._id} className="space-y-3">
          <div className={`rounded-2xl border p-4 ${rev.isCurrent ? "border-primary/20 bg-primary/5" : "border-slate-100 bg-slate-50/40 opacity-90"}`}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-800">Rev {rev.revisionNo}</span>
                {rev.optionLabel && <span className="text-xs font-bold text-slate-500">· {rev.optionLabel}</span>}
                {rev.isCurrent ? <span className="text-[10px] font-bold text-primary">CURRENT</span> : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400"><Lock size={10} /> Superseded (locked)</span>}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${d.cls}`} title="Client decision">{d.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPreview({ title: `${sub.title || sub.productName || "Submittal"} — Rev ${rev.revisionNo}`, fileName: `${(sub.title || sub.productName || "submittal").replace(/\s+/g, "_")}_Rev${rev.revisionNo}.pdf`, build: async () => { const { blob, skipped } = await buildSubmittalPackage(sub, rev); if (skipped.length) toast(`Couldn't embed (not PDF/image): ${skipped.join(", ")}`, "info"); return blob; } })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-white"><Eye size={12} /> Preview</button>
                <button onClick={() => buildPackage(sub, rev)} disabled={building === rev._id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary disabled:opacity-50">
                  {building === rev._id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Combined PDF
                </button>
              </div>
            </div>

            {rev.isCurrent && canEdit ? (
              <>
                {/* Editable — current revision */}
                <div className="mb-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Brand / option submitted</label>
                  <input className={inp} value={rev.optionLabel || ""} onChange={(e) => saveRevField(sub._id, rev._id, "optionLabel", e.target.value)} placeholder="e.g. United PVC pipe" />
                </div>
                <div className="mb-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client decision <span className="font-medium normal-case text-slate-400">— set this after the client responds on their portal</span></label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
                    <select value={rev.disposition} onChange={(e) => setDispo(sub._id, rev._id, e.target.value as SubmittalDisposition)} className={`${inp} font-bold`}>
                      {DISPO.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-[11px] text-slate-500">Sent <input type="date" value={rev.sentToClientAt} onChange={(e) => saveRevField(sub._id, rev._id, "sentToClientAt", e.target.value)} onBlur={(e) => onSentDateCommit(sub._id, rev._id, e.target.value)} className={inp} /></label>
                    <label className="flex items-center gap-2 text-[11px] text-slate-500">Returned <input type="date" value={rev.respondedAt} onChange={(e) => saveRevField(sub._id, rev._id, "respondedAt", e.target.value)} className={inp} /></label>
                  </div>
                </div>
                {/* C7 — once the client has decided, their signed letter is mandatory */}
                {DECIDED.includes(rev.disposition) && !rev.attachments.some((a) => a.component === "clientLetter") && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">
                    <AlertTriangle size={13} className="text-red-500 shrink-0" />
                    <span className="text-[11px] font-bold text-red-600">Client letter is missing — upload the signed “{dispoMeta(rev.disposition).label}” letter under “Client response” on the right.</span>
                  </div>
                )}
                {/* Client comments + the client's signed reply, side by side (the reply is separate from the package) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client comments</label>
                    <textarea rows={4} value={rev.notes} onChange={(e) => saveRevField(sub._id, rev._id, "notes", e.target.value)} placeholder="Client comments (e.g. the reason they gave for rejection)…" className={`${inp} resize-none mt-1 h-[calc(100%-1.25rem)]`} />
                  </div>
                  {renderClientResponse(sub, rev, false)}
                </div>
              </>
            ) : (
              /* Read-only — superseded (locked) revisions keep the full record */
              <>
              <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 bg-white/60 border border-slate-100 rounded-xl p-3">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Brand / option</p>
                  <p className="text-xs font-bold text-slate-700 mt-0.5">{rev.optionLabel || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Client decision</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${d.cls}`}>{d.label}</span>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sent</p>
                  <p className="text-xs font-bold text-slate-700 mt-0.5">{rev.sentToClientAt || "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Returned</p>
                  <p className="text-xs font-bold text-slate-700 mt-0.5">{rev.respondedAt || "—"}</p>
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Comments</p>
                  <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">{rev.notes || "—"}</p>
                </div>
              </div>
              {rev.attachments.some((a) => a.component === "clientLetter") && <div className="mb-3">{renderClientResponse(sub, rev, true)}</div>}
              </>
            )}

            {/* If the client rejected the current revision, prompt the next option */}
            {rev.isCurrent && canEdit && (rev.disposition === "Rejected" || rev.disposition === "ReviseResubmit") && (
              <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-1">
                <span className="text-[11px] font-bold text-amber-700">Client {rev.disposition === "Rejected" ? "rejected" : "asked to revise"} this option — submit a different brand as the next revision.</span>
                <button onClick={() => addRevision(sub._id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700 shrink-0"><FilePlus2 size={12} /> Submit new option (Rev {sub.currentRevisionNo + 1})</button>
              </div>
            )}

            {/* Package components — these are assembled into the Combined PDF sent to the client.
                The client's reply letter lives in the separate "Client response" section above. */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Submittal package documents <span className="font-medium normal-case">— combined into the PDF sent to the client</span></p>
              {COMPONENTS.map((c) => {
                const files = rev.attachments.filter((a) => a.component === c.k);
                if (!files.length && locked) return null;
                return (
                  <div key={c.k} className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-32 shrink-0">{c.label}</span>
                    {files.map((a) => (
                      <span key={a._id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded border text-[10px] font-bold bg-white border-slate-100 text-slate-600">
                        <a href={attachmentUrl(a.filePath)} target="_blank" rel="noreferrer" className="hover:text-primary max-w-[140px] truncate" title={a.name}><FileText size={10} className="inline mr-1" />{a.name}</a>
                        {!locked && <button onClick={() => removeAtt(sub._id, rev._id, a._id)} className="text-slate-300 hover:text-red-500"><X size={11} /></button>}
                      </span>
                    ))}
                    {!locked && (() => {
                      const menuKey = `${rev._id}:${c.k}`;
                      const open = addMenuKey === menuKey;
                      return (
                        <div className="relative inline-block">
                          <button onClick={() => setAddMenuKey(open ? null : menuKey)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 hover:bg-slate-200"><Upload size={10} /> Add File <ChevronDown size={10} /></button>
                          {open && (
                            <>
                              <button type="button" className="fixed inset-0 z-10 cursor-default" onClick={() => setAddMenuKey(null)} aria-label="Close" />
                              <div className="absolute z-20 mt-1 left-0 w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-1">
                                <label className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer">
                                  <Monitor size={13} /> Choose from computer
                                  <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadComp(sub._id, rev._id, f, c.k); e.target.value = ""; setAddMenuKey(null); }} />
                                </label>
                                {!isGuest && <button onClick={() => { setDocPicker({ sid: sub._id, rid: rev._id, component: c.k }); setAddMenuKey(null); }} className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-50"><FolderOpen size={13} /> Choose from project documents</button>}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submit a new option — sits right after the CURRENT revision, above the superseded ones */}
          {rev.isCurrent && canEdit && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => addRevision(sub._id, true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-primary/40 text-primary text-[11px] font-bold hover:bg-primary/5" title="Copy this revision's brand + documents into Rev, then swap only what changed">
                <Copy size={13} /> Duplicate this revision (Rev {sub.currentRevisionNo + 1}, copies docs)
              </button>
              <button onClick={() => addRevision(sub._id, false)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 text-[11px] font-bold hover:bg-slate-50" title="Start Rev with empty documents">
                <FilePlus2 size={13} /> New blank option
              </button>
            </div>
          )}
          </div>
        );
      })}
    </div>
  );

  // Read-only preview shown in the expanded sub-row (viewing only — all edits happen in the modal).
  const renderPreview = (sub: ApiSubmittal) => {
    const revs = [...sub.revisions].sort((a, b) => b.revisionNo - a.revisionNo);
    return (
      <div className="p-4 space-y-2">
        {revs.map((rev) => {
          const d = dispoMeta(rev.disposition);
          return (
            <div key={rev._id} className={`rounded-xl border p-3 ${rev.isCurrent ? "border-primary/20 bg-primary/5" : "border-slate-100 bg-white/60"}`}>
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-xs font-bold text-slate-800">Rev {rev.revisionNo}</span>
                {rev.optionLabel && <span className="text-[11px] font-bold text-slate-500">· {rev.optionLabel}</span>}
                {rev.isCurrent && <span className="text-[9px] font-bold text-primary uppercase tracking-widest">Current</span>}
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${d.cls}`}>{d.label}</span>
                <button onClick={() => setPreview({ title: `${sub.title || sub.productName || "Submittal"} — Rev ${rev.revisionNo}`, fileName: `${(sub.title || sub.productName || "submittal").replace(/\s+/g, "_")}_Rev${rev.revisionNo}.pdf`, build: async () => { const { blob, skipped } = await buildSubmittalPackage(sub, rev); if (skipped.length) toast(`Couldn't embed (not PDF/image): ${skipped.join(", ")}`, "info"); return blob; } })} className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 text-slate-500 text-[10px] font-bold hover:bg-white"><Eye size={11} /> Preview PDF</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[11px]">
                <div><span className="text-slate-400">Sent:</span> <span className="font-bold text-slate-600">{rev.sentToClientAt || "—"}</span></div>
                <div><span className="text-slate-400">Returned:</span> <span className="font-bold text-slate-600">{rev.respondedAt || "—"}</span></div>
                <div className="col-span-2"><span className="text-slate-400">Documents:</span> <span className="font-bold text-slate-600">{rev.attachments.length}</span></div>
              </div>
              {rev.notes && <p className="text-[11px] text-slate-500 mt-1 whitespace-pre-wrap">{rev.notes}</p>}
            </div>
          );
        })}
        {canEdit && <button onClick={() => setManageId(sub._id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Settings2 size={12} /> Manage — edit, upload docs, add revision</button>}
      </div>
    );
  };

  // D1 — one table row per submittal (summary). Expand = read-only preview; Actions button = modal.
  const SUB_COLS = ["#", "RV", "Product", "Brand", "Model", "Spec", "Status", "Actions"];
  const renderSubRow = (sub: ApiSubmittal, num: number | null) => {
    const isOpen = openId === sub._id;
    const current = sub.revisions.find((r) => r.isCurrent) || sub.revisions[sub.revisions.length - 1];
    const cd = current ? dispoMeta(current.disposition) : null;
    const flashing = flashId === sub._id;
    return (
      <Fragment key={sub._id}>
        <tr className={flashing ? "animate-pulse ring-2 ring-primary/60 bg-primary/10" : "hover:bg-slate-50/40"}>
          <td className="px-3 py-2 align-top font-bold text-slate-400 w-12 whitespace-nowrap">{num ?? "—"}</td>
          <td className="px-2 py-2 align-top">
            <button onClick={() => setOpenId(isOpen ? null : sub._id)} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary" title="Open package / revision history">
              {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />} RV{sub.currentRevisionNo}
            </button>
          </td>
          <td className="px-3 py-2 align-top font-bold text-slate-700">{sub.title || sub.productName || "Untitled"}{sub.itemId ? "" : <span className="ml-1 text-[9px] font-medium text-slate-300">(manual)</span>}</td>
          <td className="px-3 py-2 align-top text-slate-500">{sub.manufacturer || "—"}</td>
          <td className="px-3 py-2 align-top text-slate-500">{sub.modelNo || "—"}</td>
          <td className="px-3 py-2 align-top text-slate-500">{sub.specSection || "—"}</td>
          <td className="px-3 py-2 align-top whitespace-nowrap">{cd && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cd.cls}`}>{cd.label}</span>}</td>
          <td className="px-2 py-2 align-top">
            <div className="flex items-center justify-end gap-1">
              {canEdit && <button onClick={() => setManageId(sub._id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-primary hover:text-white" title="Manage — edit, upload, add revision"><Settings2 size={12} /> Manage</button>}
              {canEdit && <button onClick={() => archiveSub(sub._id, !sub.archived)} className="p-1.5 rounded text-slate-300 hover:text-amber-500 hover:bg-white" title={sub.archived ? "Restore" : "Archive"}>{sub.archived ? <RotateCcw size={13} /> : <Archive size={13} />}</button>}
              {canEdit && <button onClick={() => removeSub(sub._id)} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-white" title="Delete"><Trash2 size={13} /></button>}
            </div>
          </td>
        </tr>
        {isOpen && (
          <tr><td colSpan={SUB_COLS.length} className="p-0 bg-slate-50/30 border-t border-slate-100">
            {renderPreview(sub)}
          </td></tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-display font-bold text-slate-900">Submittals</h3>
          <p className="text-xs font-medium text-slate-400 mt-1">One package per product. Each revision is kept (locked once superseded). Internal — the client never sees this table.</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && <button onClick={() => setShowArchived((v) => !v)} className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-bold border ${showArchived ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-200 hover:text-slate-900"}`}><Archive size={12} /> {showArchived ? "Active" : "Archived"}</button>}
          {canEdit && !showArchived && <button onClick={() => setCreating((v) => !v)} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary transition-all"><Plus size={13} /> New submittal</button>}
        </div>
      </div>

      {/* How this tab works */}
      <div className="bg-primary/5 border border-primary/10 rounded-2xl px-4 py-3 text-[11px] text-slate-600 leading-relaxed">
        <strong>How it works:</strong> You (GreenTech) build the package and upload the docs (cover · spec · catalog · drawings · photos), then <strong>Combined PDF</strong> to send to the client on <em>their</em> portal. The client doesn't log in here — when they reply, you record their verdict under <strong>Client decision</strong>. Each <strong>revision</strong> = one brand/option you submitted: if it's rejected, click <strong>Submit a new option</strong> to add the next revision — the rejected one stays locked as a record.
      </div>

      {creating && (
        <div className="bg-slate-50 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Link a BOQ item (auto-fills the package)</label>
            {draft.itemId ? (
              (() => {
                const sel = items.find((x) => x._id === draft.itemId);
                return (
                  <div className="flex items-center justify-between gap-2 bg-white border border-primary/30 rounded-xl px-3 py-2">
                    <span className="text-xs font-bold text-slate-700 truncate">🔗 {sel?.description || "Linked item"}{sel?.manufacturer ? ` · ${sel.manufacturer}` : ""}<span className="text-slate-400 font-medium">{sel ? ` · ${sectionName(sel.sectionId) || "—"}` : ""}</span></span>
                    <button onClick={() => pickItem("")} className="text-[11px] font-bold text-slate-500 hover:text-primary shrink-0">Change</button>
                  </div>
                );
              })()
            ) : (
              <>
                <div className="flex gap-2">
                  <div className="relative flex-grow">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="Search BOQ items by name, brand, model…" className={`${inp} pl-9`} />
                  </div>
                  <select value={pickerSection} onChange={(e) => setPickerSection(e.target.value)} className={`${inp} max-w-[12rem] font-bold`}>
                    <option value="all">All categories</option>
                    {sections.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50 bg-white">
                  {items.length === 0 ? (
                    <p className="px-3 py-3 text-[11px] text-slate-400 italic">No BOQ items yet — add them in the BOQ tab, or fill the fields below manually.</p>
                  ) : pickable.length === 0 ? (
                    <p className="px-3 py-3 text-[11px] text-slate-400 italic">No items match. Clear the search or fill in manually below.</p>
                  ) : pickable.map((it) => (
                    <button key={it._id} onClick={() => pickItem(it._id)} className="w-full text-left px-3 py-2 hover:bg-primary/5 transition-colors">
                      <span className="text-xs font-bold text-slate-700">{it.description || "(no description)"}</span>
                      <span className="text-[10px] text-slate-400"> · {[it.manufacturer, [it.qty, it.unit].filter(Boolean).join(" "), sectionName(it.sectionId)].filter(Boolean).join(" · ")}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400">Pick an item to auto-fill, or just fill the fields below manually.</p>
              </>
            )}
          </div>
          <input className={inp} placeholder="Package title (e.g. Kitchen Cabinet — United)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <input className={inp} placeholder="Product" value={draft.productName} onChange={(e) => setDraft({ ...draft, productName: e.target.value })} />
          <input className={inp} placeholder="Manufacturer / Brand" value={draft.manufacturer} onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })} />
          <input className={inp} placeholder="Model / Part No." value={draft.modelNo} onChange={(e) => setDraft({ ...draft, modelNo: e.target.value })} />
          <input className={inp} placeholder="Spec Section" value={draft.specSection} onChange={(e) => setDraft({ ...draft, specSection: e.target.value })} />
          <div className="md:col-span-2 flex gap-2 justify-end">
            <button onClick={() => { setCreating(false); setDraft(emptyDraft); }} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Cancel</button>
            <button onClick={create} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold">Create</button>
          </div>
        </div>
      )}

      {/* Search + filters */}
      {subs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-grow min-w-[12rem]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by product, brand or spec…" className={`${inp} pl-9`} />
          </div>
          <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className={`${inp} max-w-[12rem] font-bold`}>
            <option value="all">All categories</option>
            {sections.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <select value={dispoFilter} onChange={(e) => setDispoFilter(e.target.value)} className={`${inp} max-w-[12rem] font-bold`}>
            <option value="all">All statuses</option>
            {DISPO.map((d) => <option key={d.k} value={d.k}>{d.label}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "none" | "status" | "category")} className={`${inp} max-w-[11rem] font-bold`} title="Group the list">
            <option value="none">Sort: none</option>
            <option value="status">Sort by status</option>
            <option value="category">Sort by category</option>
          </select>
          {(search || sectionFilter !== "all" || dispoFilter !== "all" || sortBy !== "none") && (
            <button onClick={() => { setSearch(""); setSectionFilter("all"); setDispoFilter("all"); setSortBy("none"); }} className="text-[11px] font-bold text-slate-500 hover:text-slate-900 px-2">Clear</button>
          )}
          <span className="text-[10px] text-slate-400 ml-auto">{visible.length} of {subs.length}</span>
        </div>
      )}

      {subs.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-6 text-center">No submittals yet.{canEdit ? " Create one per product you submit to the client." : ""}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-6 text-center">No submittals match your search.</p>
      ) : (
        <div className="space-y-5">
          {/* D1 — grouped by BOQ category, one table like the BOQ so you can see which item each submittal is for */}
          {groups.map((g) => (
            <div key={g.section._id} className="border border-slate-100 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5">
                <span className="font-bold text-slate-800 text-sm flex-grow">{g.section.name}</span>
                <span className="text-[10px] font-bold text-slate-400">{g.subs.length} submittal{g.subs.length === 1 ? "" : "s"}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-xs">
                  <thead><tr className="border-b border-slate-100">{SUB_COLS.map((h, i) => <th key={i} className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px] whitespace-nowrap">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-50">{g.subs.map((sub) => renderSubRow(sub, itemNo[sub.itemId] ?? null))}</tbody>
                </table>
              </div>
            </div>
          ))}
          {unlinked.length > 0 && (
            <div className="border border-slate-100 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5">
                <span className="font-bold text-slate-800 text-sm flex-grow">Manual / not linked to a BOQ item</span>
                <span className="text-[10px] font-bold text-slate-400">{unlinked.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-xs">
                  <thead><tr className="border-b border-slate-100">{SUB_COLS.map((h, i) => <th key={i} className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px] whitespace-nowrap">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-50">{unlinked.map((sub) => renderSubRow(sub, null))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {dialogs}
      {preview && <PdfPreviewModal title={preview.title} fileName={preview.fileName} build={preview.build} onClose={() => setPreview(null)} />}

      {/* Project-documents picker — choose an existing project document to add to the package */}
      {docPicker && (() => {
        const q = docSearch.trim().toLowerCase();
        const searching = !!q;
        const gKey = (s: string) => { const p = sectionToPath(s); return `${p.subtab || ""}|||${p.section}`; };
        const gLabel = (s: string) => { const p = sectionToPath(s); return p.subtab ? `${p.subtab} › ${p.section}` : p.section; };
        // Tab folders → section groups → files, mirroring the Documents module directory.
        const tabFolders = (() => {
          const m = new Map<string, { label: string; count: number }>();
          projectDocs.forEach((d) => { const p = sectionToPath(d.section || ""); const e = m.get(p.tabId) || { label: p.tab, count: 0 }; e.count++; m.set(p.tabId, e); });
          return Array.from(m.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => a.label.localeCompare(b.label));
        })();
        const groupFolders = (() => {
          if (!pickerNav.tabId) return [];
          const m = new Map<string, { label: string; count: number }>();
          projectDocs.filter((d) => sectionToPath(d.section || "").tabId === pickerNav.tabId).forEach((d) => { const k = gKey(d.section || ""); const e = m.get(k) || { label: gLabel(d.section || ""), count: 0 }; e.count++; m.set(k, e); });
          return Array.from(m.entries()).map(([key, v]) => ({ key, ...v })).sort((a, b) => a.label.localeCompare(b.label));
        })();
        const leaf = searching
          ? projectDocs.filter((d) => d.name.toLowerCase().includes(q) || sectionToPath(d.section || "").section.toLowerCase().includes(q) || sectionToPath(d.section || "").tab.toLowerCase().includes(q))
          : projectDocs.filter((d) => sectionToPath(d.section || "").tabId === pickerNav.tabId && gKey(d.section || "") === pickerNav.group);
        const showFolders = !searching && !pickerNav.group;
        const folders = !pickerNav.tabId
          ? tabFolders.map((t) => ({ id: t.id, label: t.label, count: t.count, onOpen: () => setPickerNav({ tabId: t.id }) }))
          : groupFolders.map((g) => ({ id: g.key, label: g.label, count: g.count, onOpen: () => setPickerNav({ tabId: pickerNav.tabId, group: g.key }) }));
        const tabLabel = tabFolders.find((t) => t.id === pickerNav.tabId)?.label;
        const groupName = groupFolders.find((g) => g.key === pickerNav.group)?.label;
        return (
          <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={() => setDocPicker(null)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl my-10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2"><FolderOpen size={16} className="text-primary" /><p className="text-sm font-bold text-slate-900">Add from project documents</p></div>
                <button onClick={() => setDocPicker(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={docSearch} onChange={(e) => setDocSearch(e.target.value)} placeholder="Search this project's documents…" className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/10" />
                </div>
                {/* Breadcrumb */}
                {!searching && (
                  <nav className="flex items-center gap-1 flex-wrap text-[11px] font-bold">
                    <button onClick={() => setPickerNav({})} className={`px-2 py-1 rounded-lg ${!pickerNav.tabId ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>All Tabs</button>
                    {pickerNav.tabId && (<><ChevronRight size={12} className="text-slate-300" /><button onClick={() => setPickerNav({ tabId: pickerNav.tabId })} className={`px-2 py-1 rounded-lg ${!pickerNav.group ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{tabLabel}</button></>)}
                    {pickerNav.group && (<><ChevronRight size={12} className="text-slate-300" /><span className="px-2 py-1 rounded-lg bg-slate-900 text-white">{groupName}</span></>)}
                  </nav>
                )}
                <div className="max-h-80 overflow-y-auto space-y-1">
                  {docsLoading ? (
                    <div className="py-8 flex justify-center text-slate-300"><Loader2 size={20} className="animate-spin" /></div>
                  ) : showFolders ? (
                    folders.length === 0
                      ? <p className="text-sm text-slate-400 italic text-center py-6">No documents in this project yet.</p>
                      : folders.map((f) => (
                        <button key={f.id} onClick={f.onOpen} className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-slate-50 text-left border border-transparent hover:border-slate-100">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary shrink-0"><Folder size={15} /></div>
                          <div className="min-w-0 flex-grow"><p className="text-sm font-bold text-slate-800 truncate">{f.label}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{f.count} file{f.count === 1 ? "" : "s"}</p></div>
                          <ChevronRight size={15} className="text-slate-300 shrink-0" />
                        </button>
                      ))
                  ) : leaf.length === 0 ? (
                    <p className="text-sm text-slate-400 italic text-center py-6">No documents match your search.</p>
                  ) : leaf.map((d) => (
                    <button key={d._id} onClick={() => addFromDoc(d._id)} className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-slate-50 text-left border border-transparent hover:border-slate-100">
                      <FileText size={16} className="text-slate-400 shrink-0" />
                      <div className="min-w-0 flex-grow">
                        <p className="text-sm font-bold text-slate-800 truncate">{d.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{sectionToPath(d.section || "").tab} › {sectionToPath(d.section || "").section}{d.size ? ` · ${d.size}` : ""}</p>
                      </div>
                      <Plus size={15} className="text-primary shrink-0" />
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400">Adds a copy to the submittal package — same as uploading it from your computer.</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* §A1 — Actions modal: perform tasks (edit, upload, add/duplicate revision, client letter) here */}
      {manageId && (() => {
        const m = subs.find((s) => s._id === manageId);
        if (!m) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={() => setManageId(null)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{m.title || m.productName || "Submittal"}</p>
                  <p className="text-[10px] text-slate-400">Manage submittal — edits save automatically</p>
                </div>
                <button onClick={() => setManageId(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
              </div>
              {renderDetail(m)}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
