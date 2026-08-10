import { Fragment, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, X, FileText, Eye, EyeOff, Download, Upload, ChevronDown, ChevronRight, ChevronUp, MessageSquare, Archive, RotateCcw, Lock, Unlock, Copy, Paperclip, UserPlus } from "lucide-react";
import {
  fetchProjectRequests, createProjectRequest, updateProjectRequest, deleteProjectRequest,
  addRequestResponse, deleteRequestResponse, uploadRequestFile, deleteRequestFile, uploadResponseFile,
  REQUEST_TYPES, attachmentUrl, fetchSignatories, uploadInlineImage,
  uploadRequestSectionFile, deleteRequestSectionFile,
  type ApiProjectRequest, type RequestCategory, type ProjectRequestStatus, type ApiSignatory,
  type RequestSection, type RequestSectionStatus,
} from "../../lib/api";

// Per-section status options (client CR-B-15). Locked/Unlocked is a separate toggle.
const SECTION_STATUS_OPTS: { v: RequestSectionStatus; label: string; cls: string }[] = [
  { v: "", label: "No status", cls: "bg-slate-100 text-slate-400" },
  { v: "NotStarted", label: "Not Started", cls: "bg-slate-100 text-slate-500" },
  { v: "InProgress", label: "In Progress", cls: "bg-amber-50 text-amber-600" },
  { v: "WaitingInfo", label: "Waiting for Info", cls: "bg-orange-50 text-orange-600" },
  { v: "UnderReview", label: "Under Review", cls: "bg-blue-50 text-blue-600" },
  { v: "Complete", label: "Complete", cls: "bg-emerald-50 text-emerald-600" },
  { v: "NeedsRevision", label: "Needs Revision", cls: "bg-red-50 text-red-600" },
];
import { buildRequestPdf } from "../../lib/requestPdf";
import type { ProjectPdfInfo } from "../../lib/pdfProjectHeader";
import { downloadBlob } from "../../lib/proposalExport";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import ShareMenu from "./ShareMenu";
import RichTextEditor from "./RichTextEditor";
import SaveStatus, { useSaveStatus } from "./SaveStatus";
import PdfPreviewModal from "./PdfPreviewModal";

// A request/notice builder — the same engine for the Contract Administration tab (full type
// catalogue) and Client Communications (letters/RFIs). Each request auto-numbers per type
// (RFI-001 …); the client's responses are kept under it as versioned entries.

const STATUS_CLS: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-500", Sent: "bg-indigo-50 text-indigo-600",
  Responded: "bg-amber-50 text-amber-600", Closed: "bg-emerald-50 text-emerald-600", Cancelled: "bg-slate-100 text-slate-400",
};
const STATUSES: ProjectRequestStatus[] = ["Draft", "Sent", "Responded", "Closed", "Cancelled"];
const inp = "w-full bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10";

export default function RequestBuilder({ projectId, category, canEdit, projectInfo, clientName }: {
  projectId: string; category: RequestCategory; canEdit: boolean; projectInfo?: ProjectPdfInfo; clientName?: string;
}) {
  const [rows, setRows] = useState<ApiProjectRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ type: string; customTitle: string; title: string; date: string; description: string; signerName: string; signerTitle: string; signatureUrl: string; stampUrl: string; contextLines: Array<{ label: string; value: string }>; sections: Array<{ title: string; body: string }> }>({ type: REQUEST_TYPES[0], customTitle: "", title: "", date: new Date().toISOString().slice(0, 10), description: "", signerName: "", signerTitle: "", signatureUrl: "", stampUrl: "", contextLines: [], sections: [] });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ title: string; fileName: string; build: () => Promise<Blob> } | null>(null);
  const [respDraft, setRespDraft] = useState<{ rid: string; note: string; date: string } | null>(null);
  const [signatories, setSignatories] = useState<ApiSignatory[]>([]);
  const { confirm, dialogs } = useDialogs();
  const blankDraft = { type: REQUEST_TYPES[0], customTitle: "", title: "", date: new Date().toISOString().slice(0, 10), description: "", signerName: "", signerTitle: "", signatureUrl: "", stampUrl: "", contextLines: [] as Array<{ label: string; value: string }>, sections: [] as Array<{ title: string; body: string }> };
  const sigSrc = (url: string) => (!url ? "" : url.startsWith("http") || url.startsWith("data:") ? url : attachmentUrl(url.replace(/^\/+/, "")));
  const imageUpload = (file: File) => uploadInlineImage(projectId, file);
  const pickSigner = (id: string, onPick: (s: { signerName: string; signerTitle: string; signatureUrl: string }) => void) => {
    const s = signatories.find((x) => x.id === id);
    onPick(s ? { signerName: s.name, signerTitle: s.jobTitle || "", signatureUrl: s.signatureUrl } : { signerName: "", signerTitle: "", signatureUrl: "" });
  };

  const [showArchived, setShowArchived] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setRows(await fetchProjectRequests(projectId, category, showArchived)); } catch { /* keep */ } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [projectId, category, showArchived]);
  useEffect(() => { fetchSignatories().then(setSignatories).catch(() => {}); }, []);
  const archive = async (r: ApiProjectRequest, next: boolean) => {
    try { await updateProjectRequest(projectId, r._id, { archived: next }); setRows((p) => p.filter((x) => x._id !== r._id)); toast(next ? "Request archived." : "Request restored.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
  };
  const patch = (r: ApiProjectRequest) => setRows((p) => p.map((x) => (x._id === r._id ? r : x)));

  const create = async (send = false) => {
    if (!draft.title.trim() && draft.type !== "Custom Request") { toast("Give the request a subject.", "error"); return; }
    setSaving(true);
    try {
      let r = await createProjectRequest(projectId, { category, type: draft.type, customTitle: draft.customTitle, title: draft.title, date: draft.date, description: draft.description, signerName: draft.signerName, signerTitle: draft.signerTitle, signatureUrl: draft.signatureUrl, stampUrl: draft.stampUrl, contextLines: draft.contextLines.filter((l) => l.label || l.value), sections: draft.sections.filter((s) => s.title || s.body) });
      // "Save & send" marks it Sent; "Save as draft" leaves it as a Draft.
      if (send) r = await updateProjectRequest(projectId, r._id, { status: "Sent" });
      setRows((p) => [r, ...p]); setCreating(false); setOpenId(r._id);
      setDraft(blankDraft);
      toast(send ? "Request saved & sent." : "Saved as draft.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not create.", "error"); }
    finally { setSaving(false); }
  };
  const saveStatus = useSaveStatus();
  const save = (rid: string, field: "title" | "date" | "description" | "signerName" | "signerTitle" | "signatureUrl" | "stampUrl", value: string) =>
    saveStatus.track(updateProjectRequest(projectId, rid, { [field]: value }).then(patch)).catch(() => {});
  // Rich-text body edits: update the row locally at once (keeps the editor in sync) and debounce
  // the PATCH so we don't hit the API on every keystroke.
  const descTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const onDescChange = (rid: string, html: string) => {
    setRows((p) => p.map((x) => (x._id === rid ? { ...x, description: html } : x)));
    clearTimeout(descTimers.current[rid]);
    descTimers.current[rid] = setTimeout(() => { saveStatus.track(updateProjectRequest(projectId, rid, { description: html })).catch(() => {}); }, 700);
  };
  // Custom sections on an existing request — update locally, debounce the PATCH of the whole array.
  const secTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const onSectionsChange = (rid: string, sections: RequestSection[], immediate = false) => {
    setRows((p) => p.map((x) => (x._id === rid ? { ...x, sections } : x)));
    clearTimeout(secTimers.current[rid]);
    const commit = () => { saveStatus.track(updateProjectRequest(projectId, rid, { sections }).then(patch)).catch(() => {}); };
    if (immediate) commit(); else secTimers.current[rid] = setTimeout(commit, 700);
  };
  const secUpdate = (r: ApiProjectRequest, i: number, p: Partial<RequestSection>, immediate: boolean) =>
    onSectionsChange(r._id, (r.sections || []).map((x, j) => (j === i ? { ...x, ...p } : x)), immediate);
  const secAdd = (r: ApiProjectRequest) => onSectionsChange(r._id, [...(r.sections || []), { title: "", body: "" }], true);
  const secDel = (r: ApiProjectRequest, i: number) => onSectionsChange(r._id, (r.sections || []).filter((_, j) => j !== i), true);
  // Section actions (CR-B-17): reorder + duplicate.
  const secMove = (r: ApiProjectRequest, i: number, dir: -1 | 1) => {
    const arr = [...(r.sections || [])]; const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onSectionsChange(r._id, arr, true);
  };
  const secDup = (r: ApiProjectRequest, i: number) => {
    const arr = [...(r.sections || [])]; const s = arr[i];
    arr.splice(i + 1, 0, { ...s, title: s.title ? `${s.title} (copy)` : "", locked: false });
    onSectionsChange(r._id, arr, true);
  };
  // CR-B-18 — per-section file attachments.
  const secUploadFile = async (r: ApiProjectRequest, i: number, file: File) => {
    try { patch(await uploadRequestSectionFile(projectId, r._id, i, file)); } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
  };
  const secDeleteFile = async (r: ApiProjectRequest, i: number, aid?: string) => {
    if (!aid) return;
    try { patch(await deleteRequestSectionFile(projectId, r._id, i, aid)); } catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  const setStatus = (r: ApiProjectRequest, status: ProjectRequestStatus) => { patch({ ...r, status }); updateProjectRequest(projectId, r._id, { status }).then(patch).catch(() => {}); };
  const remove = async (r: ApiProjectRequest) => {
    if (!(await confirm({ title: "Delete request?", message: `${r.number} and its responses will be removed.`, confirmLabel: "Delete" }))) return;
    try { await deleteProjectRequest(projectId, r._id); setRows((p) => p.filter((x) => x._id !== r._id)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  const openPreview = (r: ApiProjectRequest) => setPreview({ title: `${r.number} · ${r.title || r.type}`, fileName: `${r.number}.pdf`, build: () => buildRequestPdf(r, projectInfo, clientName) });
  const download = async (r: ApiProjectRequest) => { try { downloadBlob(await buildRequestPdf(r, projectInfo, clientName), `${r.number}.pdf`); } catch (err) { toast(err instanceof Error ? err.message : "Could not build the PDF.", "error"); } };

  const addResponse = async () => {
    if (!respDraft) return;
    setSaving(true);
    try { patch(await addRequestResponse(projectId, respDraft.rid, { note: respDraft.note, respondedAt: respDraft.date })); setRespDraft(null); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not add.", "error"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="py-10 flex justify-center text-slate-300"><Loader2 size={20} className="animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-slate-400">{rows.length} request{rows.length === 1 ? "" : "s"}{showArchived ? " (archived)" : ""}. Each has an auto-number; the client's replies are kept under it.</p>
        <div className="flex items-center gap-2">
          <SaveStatus state={saveStatus.state} savedAt={saveStatus.savedAt} className="mr-1" />
          {canEdit && <button onClick={() => setShowArchived((v) => !v)} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border ${showArchived ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-200 hover:text-slate-900"}`}><Archive size={11} /> {showArchived ? "Active" : "Archived"}</button>}
          {canEdit && !showArchived && <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Plus size={12} /> New request</button>}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic">No requests yet.</p>
      ) : (
        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
          <table className="w-full min-w-[760px] text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="w-8 px-3 py-2.5" />
                {["No.", "Type", "Subject", "Date", "Responses", "Status", ""].map((h) => <th key={h} className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest text-[10px] whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => {
                const isOpen = openId === r._id;
                return (
                  <Fragment key={r._id}>
                    <tr className="hover:bg-slate-50/40 align-top">
                      <td className="px-3 py-2.5"><button onClick={() => setOpenId(isOpen ? null : r._id)} className="text-slate-400 hover:text-slate-900">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></td>
                      <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap">{r.number}</td>
                      <td className="px-3 py-2.5 text-slate-500">{r.type === "Custom Request" && r.customTitle ? r.customTitle : r.type}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-700">{r.title || <span className="text-slate-300 italic">—</span>}</td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.date || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500">{r.responses.length || "—"}</td>
                      <td className="px-3 py-2.5">
                        {canEdit ? (
                          <select value={r.status} onChange={(e) => setStatus(r, e.target.value as ProjectRequestStatus)} className={`px-2 py-0.5 rounded-full text-[10px] font-bold border-0 cursor-pointer ${STATUS_CLS[r.status]}`}>
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLS[r.status]}`}>{r.status}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openPreview(r)} className="p-1.5 rounded text-slate-400 hover:text-primary" title="Preview"><Eye size={14} /></button>
                          <button onClick={() => download(r)} className="p-1.5 rounded text-slate-400 hover:text-primary" title="Download"><Download size={14} /></button>
                          {canEdit && <button onClick={() => archive(r, !r.archived)} className="p-1.5 rounded text-slate-300 hover:text-amber-500" title={r.archived ? "Restore" : "Archive"}>{r.archived ? <RotateCcw size={13} /> : <Archive size={13} />}</button>}
                          {canEdit && <button onClick={() => remove(r)} className="p-1.5 rounded text-slate-300 hover:text-red-500" title="Delete"><Trash2 size={13} /></button>}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/40"><td colSpan={8} className="px-6 py-4 space-y-3">
                        {/* Editable fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Subject
                            <input className={`${inp} mt-1`} defaultValue={r.title} disabled={!canEdit} onBlur={(e) => save(r._id, "title", e.target.value)} /></label>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date
                            <input type="date" className={`${inp} mt-1`} defaultValue={r.date} disabled={!canEdit} onBlur={(e) => save(r._id, "date", e.target.value)} /></label>
                        </div>
                        <div className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description / request
                          {canEdit ? (
                            <div className="mt-1"><RichTextEditor value={r.description} onChange={(html) => onDescChange(r._id, html)} minHeight={140} placeholder="Describe the request… (tables, pictures, lines supported)" onImageUpload={imageUpload} /></div>
                          ) : <div className="mt-1 text-xs text-slate-600 bg-white border border-slate-100 rounded-lg p-2" dangerouslySetInnerHTML={{ __html: r.description || "<span class='text-slate-400'>—</span>" }} />}
                        </div>

                        {/* Custom named sections — per-section status, lock, reorder, duplicate,
                            notes (client CR-B-15/17/19). A locked section can't be edited/deleted. */}
                        {(r.sections || []).map((s, i) => {
                          const st = SECTION_STATUS_OPTS.find((o) => o.v === (s.status || "")) || SECTION_STATUS_OPTS[0];
                          const locked = !!s.locked;
                          const secEditable = canEdit && !locked;
                          const count = (r.sections || []).length;
                          return (
                            <div key={i} className={`space-y-1.5 border-l-2 pl-3 ${locked ? "border-amber-300" : "border-primary/30"}`}>
                              <div className="flex flex-wrap items-center gap-2">
                                {secEditable
                                  ? <input className={`${inp} font-bold flex-grow min-w-[8rem]`} placeholder="Section title" defaultValue={s.title} onBlur={(e) => secUpdate(r, i, { title: e.target.value }, true)} />
                                  : <p className="text-xs font-bold text-slate-700 normal-case flex-grow">{s.title || "Untitled section"}{locked && <Lock size={11} className="inline ml-1 text-amber-500" />}</p>}
                                {canEdit && (
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <select value={s.status || ""} onChange={(e) => secUpdate(r, i, { status: e.target.value as RequestSectionStatus }, true)} disabled={locked} className={`text-[10px] font-bold rounded-full px-2 py-1 border-0 cursor-pointer disabled:opacity-60 ${st.cls}`} title="Section status">
                                      {SECTION_STATUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                                    </select>
                                    <button onClick={() => secUpdate(r, i, { locked: !locked }, true)} title={locked ? "Unlock section" : "Lock section"} className={`p-1 rounded ${locked ? "text-amber-600 bg-amber-50" : "text-slate-300 hover:text-slate-600"}`}>{locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
                                    <button onClick={() => secMove(r, i, -1)} disabled={i === 0} title="Move up" className="p-1 rounded text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp size={13} /></button>
                                    <button onClick={() => secMove(r, i, 1)} disabled={i === count - 1} title="Move down" className="p-1 rounded text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown size={13} /></button>
                                    <button onClick={() => secDup(r, i)} title="Duplicate section" className="p-1 rounded text-slate-300 hover:text-primary"><Copy size={13} /></button>
                                    <button onClick={() => secUpdate(r, i, { hidden: !s.hidden }, true)} title={s.hidden ? "Show section" : "Hide section"} className={`p-1 rounded ${s.hidden ? "text-slate-500 bg-slate-100" : "text-slate-300 hover:text-slate-600"}`}>{s.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                                    <button onClick={() => secDel(r, i)} disabled={locked} title="Delete section" className="p-1 rounded text-slate-300 hover:text-red-500 disabled:opacity-30"><X size={15} /></button>
                                  </div>
                                )}
                              </div>
                              {s.hidden ? (
                                <p className="text-[11px] text-slate-400 italic bg-slate-50 rounded-lg px-2 py-1.5">Section hidden{s.assignedTo ? ` · assigned to ${s.assignedTo}` : ""} — use the eye icon to show it.</p>
                              ) : (
                                <>
                                  {secEditable
                                    ? <RichTextEditor value={s.body} onChange={(html) => secUpdate(r, i, { body: html }, false)} minHeight={110} placeholder="Section content…" onImageUpload={imageUpload} />
                                    : <div className="text-xs text-slate-600 bg-white border border-slate-100 rounded-lg p-2" dangerouslySetInnerHTML={{ __html: s.body || "<span class='text-slate-300'>Empty</span>" }} />}
                                  {canEdit && !locked && (
                                    <input className={`${inp} text-[11px]`} placeholder="+ Internal notes for this section (not printed)" defaultValue={s.notes || ""} onBlur={(e) => secUpdate(r, i, { notes: e.target.value }, true)} />
                                  )}
                                  {/* CR-B-18/19a — per-section files + assign a colleague. */}
                                  {canEdit && !locked && (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><UserPlus size={12} className="text-slate-400" /><input className={`${inp} text-[11px] w-40 py-1`} placeholder="Assign to (name)" defaultValue={s.assignedTo || ""} onBlur={(e) => secUpdate(r, i, { assignedTo: e.target.value }, true)} /></span>
                                      {(s.attachments || []).map((a) => (
                                        <span key={a._id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-600"><Paperclip size={10} /><a href={attachmentUrl(a.filePath)} target="_blank" rel="noreferrer" className="hover:text-primary max-w-[10rem] truncate">{a.name}</a><button onClick={() => secDeleteFile(r, i, a._id)} className="text-slate-300 hover:text-red-500"><X size={10} /></button></span>
                                      ))}
                                      <label className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200 cursor-pointer"><Upload size={11} /> Upload<input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) secUploadFile(r, i, f); e.target.value = ""; }} /></label>
                                    </div>
                                  )}
                                  {!canEdit && s.assignedTo && <p className="text-[10px] text-slate-400">Assigned to {s.assignedTo}</p>}
                                </>
                              )}
                            </div>
                          );
                        })}
                        {canEdit && <button onClick={() => secAdd(r)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200 w-fit"><Plus size={12} /> Add section</button>}
                        {/* Custom info lines for this request. */}
                        {canEdit && (
                          <div className="bg-white rounded-xl border border-slate-100 p-2.5 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Additional information</p>
                              <button onClick={() => updateProjectRequest(projectId, r._id, { contextLines: [...(r.contextLines || []), { label: "", value: "" }] }).then(patch).catch(() => {})} className="text-[10px] font-bold text-primary hover:underline">+ Add line</button>
                            </div>
                            {(r.contextLines || []).length === 0 && <p className="text-[11px] text-slate-400 italic">No custom lines.</p>}
                            {(r.contextLines || []).map((l, i) => (
                              <div key={i} className="flex gap-2">
                                <input className={`${inp} max-w-[12rem]`} placeholder="Label" defaultValue={l.label} onBlur={(e) => { const lines = (r.contextLines || []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)); updateProjectRequest(projectId, r._id, { contextLines: lines }).then(patch).catch(() => {}); }} />
                                <input className={inp} placeholder="Value" defaultValue={l.value} onBlur={(e) => { const lines = (r.contextLines || []).map((x, j) => (j === i ? { ...x, value: e.target.value } : x)); updateProjectRequest(projectId, r._id, { contextLines: lines }).then(patch).catch(() => {}); }} />
                                <button onClick={() => updateProjectRequest(projectId, r._id, { contextLines: (r.contextLines || []).filter((_, j) => j !== i) }).then(patch).catch(() => {})} className="text-slate-300 hover:text-red-500 shrink-0"><X size={14} /></button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* GreenTech signer for this request's document, with a preview. */}
                        {canEdit && (
                          <div className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">GreenTech signature
                            <select className={`${inp} mt-1 font-bold`} value={signatories.find((s) => s.name === r.signerName && s.signatureUrl === r.signatureUrl)?.id || ""} onChange={(e) => pickSigner(e.target.value, (s) => { updateProjectRequest(projectId, r._id, s).then(patch).catch(() => {}); })}>
                              <option value="">— No signature —</option>
                              {signatories.map((s) => <option key={s.id} value={s.id}>{s.name}{s.jobTitle ? ` · ${s.jobTitle}` : ""}</option>)}
                            </select>
                            {r.signatureUrl && <div className="flex items-center gap-3 mt-2"><img src={sigSrc(r.signatureUrl)} alt="signature" className="h-10 object-contain bg-white rounded-lg px-2 py-1 border border-slate-200" /><span className="text-[11px] font-bold text-slate-600 normal-case">{r.signerName}{r.signerTitle ? ` · ${r.signerTitle}` : ""}</span></div>}
                          </div>
                        )}

                        {/* Our request document(s) */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Our document(s)</span>
                          {r.attachments.map((a) => (
                            <span key={a._id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-white border border-slate-100 text-[10px] font-bold text-slate-600">
                              <a href={attachmentUrl(a.filePath)} target="_blank" rel="noreferrer" className="hover:text-primary max-w-[12rem] truncate inline-flex items-center gap-1" title={a.name}><FileText size={10} />{a.name}</a>
                              <ShareMenu fileName={a.name} fileUrl={attachmentUrl(a.filePath)} projectName={clientName} size={11} />
                              {canEdit && <button onClick={async () => { if (!(await confirm({ title: "Delete file?", message: `Permanently delete "${a.name}"?`, confirmLabel: "Delete", danger: true }))) return; try { patch(await deleteRequestFile(projectId, r._id, a._id)); } catch { /* ignore */ } }} className="text-slate-300 hover:text-red-500"><X size={11} /></button>}
                            </span>
                          ))}
                          {r.attachments.length === 0 && <span className="text-[11px] text-slate-400 italic">none</span>}
                          {canEdit && <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 cursor-pointer hover:bg-slate-200"><Upload size={10} /> Upload<input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { patch(await uploadRequestFile(projectId, r._id, f)); } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); } } e.target.value = ""; }} /></label>}
                        </div>

                        {/* Client responses (versioned) */}
                        <div className="bg-white rounded-xl border border-slate-100 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><MessageSquare size={11} /> Client responses ({r.responses.length})</p>
                            {canEdit && <button onClick={() => setRespDraft({ rid: r._id, note: "", date: new Date().toISOString().slice(0, 10) })} className="text-[10px] font-bold text-primary hover:underline">+ Add response</button>}
                          </div>
                          {r.responses.length === 0 ? <p className="text-[11px] text-slate-400 italic">No responses yet.</p> : (
                            <div className="space-y-1.5">
                              {r.responses.map((resp) => (
                                <div key={resp._id} className="flex flex-wrap items-start gap-2 bg-slate-50 rounded-lg px-3 py-2">
                                  <div className="min-w-0 flex-grow">
                                    <p className="text-[11px] font-bold text-slate-600">{resp.respondedAt || "—"}{resp.addedByName ? ` · logged by ${resp.addedByName}` : ""}</p>
                                    {resp.note && <p className="text-[11px] text-slate-500 whitespace-pre-wrap">{resp.note}</p>}
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                      {resp.files.map((f) => (
                                        <span key={f._id} className="inline-flex items-center gap-0.5">
                                          <a href={attachmentUrl(f.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline max-w-[12rem] truncate" title={f.name}><FileText size={10} />{f.name}</a>
                                          <ShareMenu fileName={f.name} fileUrl={attachmentUrl(f.filePath)} projectName={clientName} size={11} />
                                        </span>
                                      ))}
                                      {canEdit && <label className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 cursor-pointer hover:text-primary"><Upload size={10} /> Attach<input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { patch(await uploadResponseFile(projectId, r._id, resp._id, f)); } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); } } e.target.value = ""; }} /></label>}
                                    </div>
                                  </div>
                                  {canEdit && <button onClick={async () => { if (!(await confirm({ title: "Delete response?", message: "This removes this client response and its files.", confirmLabel: "Delete", danger: true }))) return; try { patch(await deleteRequestResponse(projectId, r._id, resp._id)); } catch { /* ignore */ } }} className="text-slate-300 hover:text-red-500 shrink-0"><X size={12} /></button>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialogs}
      {preview && <PdfPreviewModal title={preview.title} fileName={preview.fileName} build={preview.build} onClose={() => setPreview(null)} />}

      {/* New request popup */}
      {creating && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={() => setCreating(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-12" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
              <p className="text-sm font-bold text-slate-900">New request</p>
              <button onClick={() => setCreating(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type
                <select className={`${inp} mt-1 font-bold`} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                  {REQUEST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select></label>
              {draft.type === "Custom Request" && (
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Custom title
                  <input className={`${inp} mt-1`} value={draft.customTitle} onChange={(e) => setDraft({ ...draft, customTitle: e.target.value })} placeholder="Name this request" /></label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Subject
                  <input className={`${inp} mt-1`} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Clarify pipe spec on drawing A-12" /></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date
                  <input type="date" className={`${inp} mt-1`} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
              </div>
              <div className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description / request <span className="normal-case font-medium text-slate-400">— add tables, pictures, lines and custom sections</span>
                <div className="mt-1"><RichTextEditor value={draft.description} onChange={(html) => setDraft({ ...draft, description: html })} minHeight={160} placeholder="Describe the information / clarification / change you are requesting…" onImageUpload={imageUpload} /></div>
              </div>

              {/* Custom named sections — each a titled rich-text block (tables, pictures, lists). */}
              {draft.sections.map((s, i) => (
                <div key={i} className="space-y-1.5 border-l-2 border-primary/30 pl-3">
                  <div className="flex items-center gap-2">
                    <input className={`${inp} font-bold`} placeholder="Section title (e.g. Background, Proposed Solution)" value={s.title} onChange={(e) => setDraft({ ...draft, sections: draft.sections.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                    <button onClick={() => setDraft({ ...draft, sections: draft.sections.filter((_, j) => j !== i) })} className="text-slate-300 hover:text-red-500 shrink-0" title="Remove section"><X size={16} /></button>
                  </div>
                  <RichTextEditor value={s.body} onChange={(html) => setDraft({ ...draft, sections: draft.sections.map((x, j) => (j === i ? { ...x, body: html } : x)) })} minHeight={120} placeholder="Section content — tables, pictures, lists…" onImageUpload={imageUpload} />
                </div>
              ))}
              <button onClick={() => setDraft({ ...draft, sections: [...draft.sections, { title: "", body: "" }] })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200"><Plus size={13} /> Add section</button>

              {/* Custom info lines — a label/value block printed on the request document. */}
              <div className="bg-slate-50 rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Additional information <span className="font-medium normal-case text-slate-400">— printed as an info block (e.g. Drawing Ref, Spec Section)</span></p>
                  <button onClick={() => setDraft({ ...draft, contextLines: [...draft.contextLines, { label: "", value: "" }] })} className="text-[10px] font-bold text-primary hover:underline">+ Add line</button>
                </div>
                {draft.contextLines.length === 0 && <p className="text-[11px] text-slate-400 italic">No custom lines.</p>}
                {draft.contextLines.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <input className={`${inp} max-w-[12rem]`} placeholder="Label (e.g. Drawing Ref)" value={l.label} onChange={(e) => setDraft({ ...draft, contextLines: draft.contextLines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                    <input className={inp} placeholder="Value" value={l.value} onChange={(e) => setDraft({ ...draft, contextLines: draft.contextLines.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                    <button onClick={() => setDraft({ ...draft, contextLines: draft.contextLines.filter((_, j) => j !== i) })} className="text-slate-300 hover:text-red-500 shrink-0"><X size={14} /></button>
                  </div>
                ))}
              </div>

              {/* GreenTech signer — the signature (and stamp) printed on the request document, previewed here. */}
              <div className="bg-slate-50 rounded-2xl p-3 space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">GreenTech signature</p>
                <select className={`${inp} font-bold`} value={signatories.find((s) => s.name === draft.signerName && s.signatureUrl === draft.signatureUrl)?.id || ""} onChange={(e) => pickSigner(e.target.value, (s) => setDraft({ ...draft, ...s }))}>
                  <option value="">— No signature —</option>
                  {signatories.map((s) => <option key={s.id} value={s.id}>{s.name}{s.jobTitle ? ` · ${s.jobTitle}` : ""}</option>)}
                </select>
                {draft.signatureUrl && (
                  <div className="flex items-center gap-3 pt-1">
                    <img src={sigSrc(draft.signatureUrl)} alt="signature" className="h-12 object-contain bg-white rounded-lg px-2 py-1 border border-slate-200" />
                    <div className="text-[11px]"><p className="font-bold text-slate-700">{draft.signerName}</p>{draft.signerTitle && <p className="text-slate-400">{draft.signerTitle}</p>}</div>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-400">The number is assigned automatically (e.g. RFI-001). Saved as a <strong>Draft</strong> — upload your drafted document, add the client's responses, and the client-signature block is a placeholder on the generated PDF.</p>
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Cancel</button>
                {/* CR-P-11 — Save and Send are separate. Save here as a draft; then set the
                    request's status to "Sent" from the row when you're ready to send. */}
                <button onClick={() => create(false)} disabled={saving} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{saving && <Loader2 size={12} className="animate-spin" />} Save as draft</button>
                <button onClick={() => create(false)} disabled={saving} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{saving && <Loader2 size={12} className="animate-spin" />} Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add-response popup */}
      {respDraft && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={() => setRespDraft(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-16" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">Add client response</p>
              <button onClick={() => setRespDraft(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date received
                <input type="date" className={`${inp} mt-1`} value={respDraft.date} onChange={(e) => setRespDraft({ ...respDraft, date: e.target.value })} /></label>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Response note
                <textarea rows={3} className={`${inp} mt-1 resize-y`} value={respDraft.note} onChange={(e) => setRespDraft({ ...respDraft, note: e.target.value })} placeholder="Summarise the client's reply…" /></label>
              <p className="text-[11px] text-slate-400">Attach the client's returned document(s) after saving.</p>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setRespDraft(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Cancel</button>
                <button onClick={addResponse} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50">Save response</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
