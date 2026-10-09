import { Fragment, useEffect, useRef, useState } from "react";
import { fileName as docFileName } from "../../lib/fileNames";
import SignaturePicker, { signerFields } from "./SignaturePicker";
import { createPortal } from "react-dom";
import { Loader2, Plus, Trash2, X, FileText, Eye, EyeOff, Download, Upload, ChevronDown, ChevronUp, MessageSquare, Archive, RotateCcw, Lock, Unlock, Copy, Paperclip, UserPlus, Shield, Clock, Settings2 } from "lucide-react";
import { getAuthUser, fetchCompany, withFileTokensInHtml } from "../../lib/api";
import {
  fetchProjectRequests, createProjectRequest, updateProjectRequest, deleteProjectRequest,
  addRequestResponse, deleteRequestResponse, uploadRequestFile, deleteRequestFile, uploadResponseFile,
  REQUEST_TYPES, attachmentUrl, fetchSignatories, uploadInlineImage,
  uploadRequestSectionFile, deleteRequestSectionFile, fetchUsers, createReminder, fetchStamps, type CompanyFile,
  type ApiProjectRequest, type RequestCategory, type ProjectRequestStatus, type ApiSignatory,
  type RequestSection, type RequestSectionStatus, type AdminUser, type ApiRequestTo, type ApiCompany,
} from "../../lib/api";
import CompanyPicker from "./CompanyPicker";

// CR-P (147) — the recipient comes from the Directory: the client most of the time, but an RFI can
// also go to a partner or a subcontractor.
const TO_CATEGORIES = ["client", "partner", "subcontractor", "vendor", "consultant"] as const;
const toFromCompany = (c: ApiCompany): ApiRequestTo => {
  const cp = c.contactPersons?.[0];
  return { name: c.name, companyId: c._id, contactName: cp?.name || "", email: c.email || cp?.email || "", address: c.address || "" };
};
// CR-P (148) — an RFI / clarification ends with the questions we want answered.
const QUESTIONS_TITLE = "Questions / Clarifications";
const asksQuestions = (type: string) => /\((RFI|RFC)\)|Clarification/i.test(type);
const isQuestions = (s?: { title: string }) => !!s && s.title.trim().toLowerCase() === QUESTIONS_TITLE.toLowerCase();
const withQuestions = <T extends { title: string; body: string }>(type: string, secs: T[]): T[] =>
  asksQuestions(type) && !secs.some(isQuestions) ? [...secs, { title: QUESTIONS_TITLE, body: "<ol><li></li></ol>" } as T] : secs;
// A new section goes before the questions, which stay last.
const insertSection = <T extends { title: string; body: string }>(secs: T[], blank: T): T[] =>
  isQuestions(secs[secs.length - 1]) ? [...secs.slice(0, -1), blank, secs[secs.length - 1]] : [...secs, blank];
// Moving or duplicating sections never pushes the questions off the end.
const keepQuestionsLast = <T extends { title: string }>(secs: T[]): T[] => {
  const q = secs.filter(isQuestions);
  return q.length ? [...secs.filter((s) => !isQuestions(s)), ...q] : secs;
};

// 2026-10-08 - "attach files is missing": files picked in the new-request form (several at once)
// wait here and are uploaded as soon as the request is saved.
function AttachFiles({ files, onChange, label = "Attach files" }: { files: File[]; onChange: (files: File[]) => void; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary">
        <Paperclip size={13} /> {label}
        <input type="file" multiple className="hidden" onChange={(e) => { const picked = Array.from<File>(e.target.files || []); e.target.value = ""; if (picked.length) onChange([...files, ...picked]); }} />
      </label>
      {files.map((f, i) => (
        <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600">
          <Paperclip size={10} /><span className="max-w-[10rem] truncate" title={f.name}>{f.name}</span>
          <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="text-slate-300 hover:text-red-500"><X size={11} /></button>
        </span>
      ))}
    </div>
  );
}

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
import { downloadHtmlAsWord, escapeHtml } from "../../lib/wordExport";
import type { ProjectPdfInfo } from "../../lib/pdfProjectHeader";
import { downloadBlob } from "../../lib/proposalExport";
import { toast } from "../../lib/toast";
import StampPicker from "./StampPicker";
import RequestStatusSelect, { RequestStatusPill, normRequestStatus } from "./RequestStatusSelect";
import { useDialogs } from "../../lib/useDialogs";
import ShareMenu from "./ShareMenu";
import FileActions from "./FileActions";
import RichTextEditor from "./RichTextEditor";
import SaveStatus, { useSaveStatus } from "./SaveStatus";
import PresenceBar from "./PresenceBar";
import BuilderActions from "./BuilderActions";
import { useSectionPresence } from "../../lib/usePresence";
import PdfPreviewModal from "./PdfPreviewModal";
import { useTableSort, SortTh } from "../../lib/useTableSort";

// A request/notice builder — the same engine for the Contract Administration tab (full type
// catalogue) and Client Communications (letters/RFIs). Each request auto-numbers per type
// (RFI-001 …); the client's responses are kept under it as versioned entries.

const inp = "w-full bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10";

export default function RequestBuilder({ projectId, category, canEdit, projectInfo, clientName }: {
  projectId: string; category: RequestCategory; canEdit: boolean; projectInfo?: ProjectPdfInfo; clientName?: string;
}) {
  const [rows, setRows] = useState<ApiProjectRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ type: string; customTitle: string; title: string; date: string; description: string; signerName: string; signerTitle: string; signatureUrl: string; stampUrl: string; contextLines: Array<{ label: string; value: string }>; sections: Array<{ title: string; body: string; files?: File[] }>; files?: File[]; covers?: boolean; status?: ProjectRequestStatus }>({ type: REQUEST_TYPES[0], customTitle: "", title: "", date: new Date().toISOString().slice(0, 10), description: "", signerName: "", signerTitle: "", signatureUrl: "", stampUrl: "", contextLines: [], sections: withQuestions(REQUEST_TYPES[0], [] as Array<{ title: string; body: string }>) });
  const blankTo = (): ApiRequestTo => ({ name: clientName || "", companyId: "", contactName: "", email: "", address: "" });
  const [draftTo, setDraftTo] = useState<ApiRequestTo>(blankTo);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ title: string; fileName: string; build: () => Promise<Blob> } | null>(null);
  const [respDraft, setRespDraft] = useState<{ rid: string; note: string; date: string } | null>(null);
  const [signatories, setSignatories] = useState<ApiSignatory[]>([]);
  const { confirm, dialogs } = useDialogs();
  const blankDraft = { type: REQUEST_TYPES[0], customTitle: "", title: "", date: new Date().toISOString().slice(0, 10), description: "", signerName: "", signerTitle: "", signatureUrl: "", stampUrl: "", contextLines: [] as Array<{ label: string; value: string }>, sections: withQuestions(REQUEST_TYPES[0], [] as Array<{ title: string; body: string }>) };
  const sigSrc = (url: string) => (!url ? "" : url.startsWith("http") || url.startsWith("data:") ? url : attachmentUrl(url.replace(/^\/+/, "")));
  const imageUpload = (file: File) => uploadInlineImage(projectId, file);
  const pickSigner = (id: string, onPick: (s: { signerName: string; signerTitle: string; signatureUrl: string }) => void) => {
    const s = signatories.find((x) => x.id === id);
    onPick(s ? { signerName: s.name, signerTitle: s.jobTitle || "", signatureUrl: s.signatureUrl } : { signerName: "", signerTitle: "", signatureUrl: "" });
  };

  const [showArchived, setShowArchived] = useState(false);
  const [justAdded, setJustAdded] = useState("");     // CR 210 - the row just saved, highlighted
  const [titleError, setTitleError] = useState(false); // CR 210 - the subject is required
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
  // CR 211 - the requests table sorts by any column.
  const sort = useTableSort<ApiProjectRequest>(rows, {
    no: (r) => r.number,
    type: (r) => (r.type === "Custom Request" && r.customTitle ? r.customTitle : r.type),
    to: (r) => r.to?.name || clientName || "",
    subject: (r) => r.title,
    date: (r) => r.date,
    responses: (r) => r.responses.length,
    status: (r) => normRequestStatus(r.status),
  });

  const create = async (send = false) => {
    // CR 210 - "the RFI did not appear in the table": it was refused for a missing subject and the
    // toast was easy to miss. The field now says so, and stays said until it is filled.
    if (!draft.title.trim() && draft.type !== "Custom Request") {
      setTitleError(true);
      toast("Give the request a subject before saving.", "error");
      document.getElementById("request-subject")?.focus();
      return;
    }
    setTitleError(false);
    setSaving(true);
    try {
      const keptSecs = draft.sections.filter((s) => s.title || s.body || s.files?.length);
      let r = await createProjectRequest(projectId, { category, type: draft.type, customTitle: draft.customTitle, title: draft.title, date: draft.date, description: draft.description, signerName: draft.signerName, signerTitle: draft.signerTitle, signatureUrl: draft.signatureUrl, stampUrl: draft.stampUrl, contextLines: draft.contextLines.filter((l) => l.label || l.value), sections: keptSecs.map(({ title, body }) => ({ title, body })), to: draftTo, attachmentCovers: !!draft.covers, status: send ? "Submitted" : (draft.status || "Draft") });
      // 2026-10-08 - the files attached in the form go up now that the request exists.
      const failed: string[] = [];
      for (const f of draft.files || []) { try { r = await uploadRequestFile(projectId, r._id, f); } catch { failed.push(f.name); } }
      for (const [i, sec] of keptSecs.entries()) for (const f of sec.files || []) { try { r = await uploadRequestSectionFile(projectId, r._id, i, f); } catch { failed.push(f.name); } }
      if (failed.length) toast(`Not uploaded: ${failed.join(", ")}. Attach them again from the request.`, "error");
      // "Save & send" saves it as Submitted; otherwise it takes the status chosen in the form (Draft by default).
      setRows((p) => [r, ...p]); setCreating(false); setOpenId(r._id);
      setDraft(blankDraft); setDraftTo(blankTo());
      // CR 210 - show where it landed in the table, so nobody wonders whether it saved.
      setJustAdded(r._id);
      setTimeout(() => setJustAdded((id) => (id === r._id ? "" : id)), 6000);
      toast(send ? `${r.number} saved & sent. It is at the top of the table.` : `${r.number} saved as a draft. It is at the top of the table.`, "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not create.", "error"); }
    finally { setSaving(false); }
  };
  const saveStatus = useSaveStatus();
  // CR-B-01/16 — presence on this builder + notify when a new colleague joins.
  // `activeSection` is the "<requestId>:<sectionIndex>" the current user is editing, reported to
  // peers so each section can show who else is in it.
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const present = useSectionPresence(`requests:${projectId}:${category}`, activeSection);
  const prevPresent = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set(present.map((u) => u.userId));
    for (const u of present) if (!prevPresent.current.has(u.userId) && prevPresent.current.size > 0) toast(`${u.name} joined this builder.`, "info");
    prevPresent.current = now;
  }, [present]);
  // CR-B-19a — colleague picker for section assignment + notify the assignee.
  const [users, setUsers] = useState<AdminUser[]>([]);
  useEffect(() => { fetchUsers().then(setUsers).catch(() => {}); }, []);
  // CR-B-17 — record a history entry when a section's status changes.
  const meName = () => getAuthUser()?.name || "Someone";
  const [histFor, setHistFor] = useState<{ r: ApiProjectRequest; i: number } | null>(null);
  const secSetStatus = (r: ApiProjectRequest, i: number, status: RequestSectionStatus) => {
    const label = SECTION_STATUS_OPTS.find((o) => o.v === status)?.label || status || "No status";
    const arr = (r.sections || []).map((x, j) => (j === i ? { ...x, status, history: [...(x.history || []), { at: new Date().toISOString(), by: meName(), text: `Status → ${label}` }] } : x));
    onSectionsChange(r._id, arr, true);
  };
  const assignSection = (r: ApiProjectRequest, i: number, userId: string, name: string) => {
    secUpdate(r, i, { assignedTo: name }, true);
    if (userId) {
      const sec = (r.sections || [])[i];
      createReminder({ userId, title: `Review section "${sec?.title || "Section"}" — ${r.number}`, notes: "You were assigned to edit / review / verify this section.", dueAt: new Date(Date.now() + 3 * 86400000).toISOString(), link: `/dashboard/projects/${projectId}`, projectId, projectName: r.number })
        .then(() => toast(`${name} was notified.`, "success")).catch(() => {});
    }
  };
  const save = (rid: string, field: "title" | "date" | "description" | "signerName" | "signerTitle" | "signatureUrl" | "stampUrl", value: string) =>
    saveStatus.track(updateProjectRequest(projectId, rid, { [field]: value }).then(patch)).catch(() => {});
  // Rich-text body edits: update the row locally at once (keeps the editor in sync) and debounce
  // the PATCH so we don't hit the API on every keystroke.
  const descTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const onDescChange = (rid: string, html: string) => {
    saveStatus.markDirty(); // CR-B-20 — typed but not yet saved (debounced): warn on leave
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
  const secAdd = (r: ApiProjectRequest) => onSectionsChange(r._id, insertSection(r.sections || [], { title: "", body: "" }), true);
  // CR-P (147) — the recipient on an existing request: typed names save after a pause, a picked
  // Directory company saves at once.
  const toTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const setTo = (r: ApiProjectRequest, to: ApiRequestTo, immediate: boolean) => {
    setRows((p) => p.map((x) => (x._id === r._id ? { ...x, to } : x)));
    clearTimeout(toTimers.current[r._id]);
    const commit = () => { saveStatus.track(updateProjectRequest(projectId, r._id, { to }).then(patch)).catch(() => {}); };
    if (immediate) commit(); else toTimers.current[r._id] = setTimeout(commit, 700);
  };
  const secDel = (r: ApiProjectRequest, i: number) => onSectionsChange(r._id, (r.sections || []).filter((_, j) => j !== i), true);
  // Section actions (CR-B-17): reorder + duplicate.
  const secMove = (r: ApiProjectRequest, i: number, dir: -1 | 1) => {
    const arr = [...(r.sections || [])]; const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onSectionsChange(r._id, keepQuestionsLast(arr), true);
  };
  const secDup = (r: ApiProjectRequest, i: number) => {
    const arr = [...(r.sections || [])]; const s = arr[i];
    arr.splice(i + 1, 0, { ...s, title: s.title ? `${s.title} (copy)` : "", locked: false });
    onSectionsChange(r._id, keepQuestionsLast(arr), true);
  };
  // CR-P (146) — the company stamps (classified Stamps tab) for the GreenTech signer.
  const saveFields = (r: ApiProjectRequest, body: Parameters<typeof updateProjectRequest>[2]) => {
    patch({ ...r, ...body });
    saveStatus.track(updateProjectRequest(projectId, r._id, body).then(patch)).catch(() => {});
  };
  const partner = projectInfo?.partner;
  // 2026-10-07 - the JV partner signs through one of its people in the Directory, not a typed name.
  const [partnerCo, setPartnerCo] = useState<ApiCompany | null>(null);
  useEffect(() => {
    if (!partner?.companyId) { setPartnerCo(null); return; }
    fetchCompany(partner.companyId).then(setPartnerCo).catch(() => setPartnerCo(null));
  }, [partner?.companyId]);
  // CR-B-18 — per-section file attachments.
  const secUploadFile = async (r: ApiProjectRequest, i: number, file: File) => {
    try { patch(await uploadRequestSectionFile(projectId, r._id, i, file)); } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
  };
  const secDeleteFile = async (r: ApiProjectRequest, i: number, aid?: string) => {
    if (!aid) return;
    if (!(await confirm({ title: "Delete this file?", message: "The attachment is removed from this section for good.", confirmLabel: "Delete" }))) return;
    try { patch(await deleteRequestSectionFile(projectId, r._id, i, aid)); } catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  // Dropping a section discards whatever was written in it, so it asks first.
  const removeDraftSection = async (idx: number) => {
    if (!(await confirm({ title: "Delete this section?", message: "The section and everything written in it are removed from this request.", confirmLabel: "Delete" }))) return;
    setDraft((d) => (d ? { ...d, sections: d.sections.filter((_, j) => j !== idx) } : d));
  };
  const setStatus = (r: ApiProjectRequest, status: ProjectRequestStatus) => { patch({ ...r, status }); updateProjectRequest(projectId, r._id, { status }).then(patch).catch(() => {}); };
  const remove = async (r: ApiProjectRequest) => {
    if (!(await confirm({ title: "Delete request?", message: `${r.number} and its responses will be removed.`, confirmLabel: "Delete" }))) return;
    try { await deleteProjectRequest(projectId, r._id); setRows((p) => p.filter((x) => x._id !== r._id)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  // CR 212 - "Change Order Proposal", not just "COP"; a custom request uses the name it was given.
  const fullType = (r: ApiProjectRequest) => (r.type === "Custom Request" && r.customTitle ? r.customTitle : r.type);
  const openPreview = (r: ApiProjectRequest) => setPreview({ title: `${r.number} · ${fullType(r)}${r.title ? ` · ${r.title}` : ""}`, fileName: docFileName([r.number, fullType(r), r.title], "pdf"), build: () => buildRequestPdf(r, projectInfo, clientName) });
  // CR 210 - see the document before it is saved, exactly as it will print.
  const previewDraft = () => {
    const code = draft.type.match(/\(([^)]+)\)/)?.[1] || "REQ";
    const asRequest = {
      _id: "draft", projectId, category, type: draft.type, typeCode: code, customTitle: draft.customTitle,
      number: `${code}-draft`, seq: 0, title: draft.title, date: draft.date, description: draft.description,
      status: "Draft", signerName: draft.signerName, signerTitle: draft.signerTitle, signatureUrl: draft.signatureUrl,
      stampUrl: draft.stampUrl, contextLines: draft.contextLines, sections: draft.sections.map(({ title, body }) => ({ title, body })), to: draftTo, attachmentCovers: !!draft.covers,
      responses: [], files: [], archived: false, addedByName: "", createdAt: "", updatedAt: "",
    } as unknown as ApiProjectRequest;
    setPreview({ title: `Preview · ${draft.title || draft.type}`, fileName: docFileName([code, draft.title || draft.type, "Draft"], "pdf"), build: () => buildRequestPdf(asRequest, projectInfo, clientName) });
  };
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
          <PresenceBar users={present} className="mr-1" />
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
              {/* CR 211 - every column sorts: click to sort, again to reverse, again for the original order. */}
              <tr className="bg-slate-50 border-b border-slate-100">
                <SortTh sort={sort} col="no">No.</SortTh>
                <SortTh sort={sort} col="type">Type</SortTh>
                <SortTh sort={sort} col="to">To</SortTh>
                <SortTh sort={sort} col="subject">Subject</SortTh>
                <SortTh sort={sort} col="date">Date</SortTh>
                <SortTh sort={sort} col="responses">Responses</SortTh>
                <SortTh sort={sort} col="status">Status</SortTh>
                <SortTh sort={sort}>{""}</SortTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sort.rows.map((r) => {
                const isOpen = openId === r._id;
                return (
                  <Fragment key={r._id}>
                    <tr className={`align-top ${justAdded === r._id ? "bg-emerald-50/70 ring-1 ring-emerald-200" : "hover:bg-slate-50/40"}`}>
                      <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap">{r.number}</td>
                      <td className="px-3 py-2.5 text-slate-500">{r.type === "Custom Request" && r.customTitle ? r.customTitle : r.type}</td>
                      <td className="px-3 py-2.5 text-slate-600 font-medium">{r.to?.name || clientName || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-700">{r.title || <span className="text-slate-300 italic">—</span>}</td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.date || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500">{r.responses.length || "—"}</td>
                      <td className="px-3 py-2.5">
                        {canEdit
                          ? <RequestStatusSelect compact value={r.status} onChange={(st) => setStatus(r, st)} />
                          : <RequestStatusPill status={r.status} />}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {/* CR-P (149) — everything about a request (its content, documents and the
                              client's responses) is edited in its Manage window. */}
                          <button onClick={() => setOpenId(r._id)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary mr-1" title="Manage"><Settings2 size={12} /> Manage</button>
                          <button onClick={() => openPreview(r)} className="p-1.5 rounded text-slate-400 hover:text-primary" title="Preview"><Eye size={14} /></button>
                          <button onClick={() => download(r)} className="p-1.5 rounded text-slate-400 hover:text-primary" title="Download PDF"><Download size={14} /></button>
                          {/* CR-B-14a — Word export (description + sections are HTML). */}
                          <button onClick={() => {
                            const body = `<h1>${escapeHtml(r.number || "")} — ${escapeHtml(r.title || r.type || "")}</h1>`
                              + (r.date ? `<p class="muted">${escapeHtml(r.date)}</p>` : "")
                              + (r.description || "")
                              + (r.sections || []).filter((s) => !s.hidden).map((s) => `<h2>${escapeHtml(s.title || "Section")}</h2>${s.body || ""}`).join("");
                            downloadHtmlAsWord(r.number || "Request", body, `${(r.number || "request").replace(/[^\w-]+/g, "_")}`);
                          }} className="p-1.5 rounded text-slate-400 hover:text-primary" title="Export to Word"><FileText size={14} /></button>
                          {canEdit && <button onClick={() => archive(r, !r.archived)} className="p-1.5 rounded text-slate-300 hover:text-amber-500" title={r.archived ? "Restore" : "Archive"}>{r.archived ? <RotateCcw size={13} /> : <Archive size={13} />}</button>}
                          {canEdit && <button onClick={() => remove(r)} className="p-1.5 rounded text-slate-300 hover:text-red-500" title="Delete"><Trash2 size={13} /></button>}
                        </div>
                      </td>
                    </tr>
                    {isOpen && createPortal(
                      <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-10" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
                            <div className="min-w-0">
                              {/* CR 212 - the full name of the type leads ("COP-001 · Change Order Proposal"),
                                  with the subject under it, so a COP or an EOT is never just a code. */}
                              <p className="text-sm font-bold text-slate-900 truncate">{r.number} · {fullType(r)}</p>
                              {!!r.title && <p className="truncate text-[11px] font-bold text-slate-500">{r.title}</p>}
                              {/* CR 210 - what kind of request this is, and which list it belongs to. */}
                              <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{category === "client-comms" ? "Client communications" : "Contract administration"}</span>
                                <RequestStatusPill status={r.status} />
                                <span>Changes save as you type.</span>
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <SaveStatus state={saveStatus.state} savedAt={saveStatus.savedAt} />
                              <button onClick={() => openPreview(r)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold hover:text-primary"><Eye size={13} /> Preview</button>
                              <button onClick={() => setOpenId(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100" title="Close"><X size={18} /></button>
                            </div>
                          </div>
                          <div className="px-6 py-5 space-y-3">
                        {/* CR-P (147) — who receives this request, before the subject. */}
                        {canEdit ? (
                          <CompanyPicker
                            label="To (who receives this request)"
                            size="sm"
                            value={r.to?.name ?? ""}
                            hint={!r.to?.name && clientName ? `Left empty, the document is addressed to the project's client, ${clientName}.` : undefined}
                            category="client"
                            categories={[...TO_CATEGORIES]}
                            onNameChange={(v) => setTo(r, { name: v, companyId: "", contactName: "", email: "", address: "" }, false)}
                            onSelectCompany={(c) => setTo(r, toFromCompany(c), true)}
                            placeholder="Search the Directory: the client, a partner, a subcontractor…"
                          />
                        ) : (
                          <p className="text-xs text-slate-600"><span className="font-bold text-slate-400 uppercase tracking-widest text-[10px] mr-2">To</span>{r.to?.name || clientName || "—"}</p>
                        )}
                        {/* Editable fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Subject
                            <input className={`${inp} mt-1`} defaultValue={r.title} disabled={!canEdit} onBlur={(e) => save(r._id, "title", e.target.value)} /></label>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date
                            <input type="date" className={`${inp} mt-1`} defaultValue={r.date} disabled={!canEdit} onBlur={(e) => save(r._id, "date", e.target.value)} /></label>
                        </div>
                        <div className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description / request
                          {canEdit ? (
                            <div className="mt-1" onFocusCapture={() => setActiveSection(null)}><RichTextEditor value={r.description} onChange={(html) => onDescChange(r._id, html)} minHeight={140} placeholder="Describe the request… (tables, pictures, lines supported)" onImageUpload={imageUpload} draftKey={`req-desc-${r._id}`} /></div>
                          ) : <div className="mt-1 text-xs text-slate-600 bg-white border border-slate-100 rounded-lg p-2" dangerouslySetInnerHTML={{ __html: withFileTokensInHtml(r.description || "") || "<span class='text-slate-400'>—</span>" }} />}
                        </div>

                        {/* Custom named sections — per-section status, lock, reorder, duplicate,
                            notes (client CR-B-15/17/19). A locked section can't be edited/deleted. */}
                        {(r.sections || []).map((s, i) => {
                          const st = SECTION_STATUS_OPTS.find((o) => o.v === (s.status || "")) || SECTION_STATUS_OPTS[0];
                          const locked = !!s.locked;
                          const secEditable = canEdit && !locked;
                          const count = (r.sections || []).length;
                          const secKey = `${r._id}:${i}`;
                          const secPeers = present.filter((u) => u.section === secKey);
                          return (
                            <div key={i} className={`space-y-1.5 border-l-2 pl-3 ${locked ? "border-amber-300" : "border-primary/30"}`} onFocusCapture={() => secEditable && setActiveSection(secKey)}>
                              <div className="flex flex-wrap items-center gap-2">
                                {secEditable
                                  ? <input className={`${inp} font-bold flex-grow min-w-[8rem]`} placeholder="Section title" defaultValue={s.title} onBlur={(e) => secUpdate(r, i, { title: e.target.value }, true)} />
                                  : <p className="text-xs font-bold text-slate-700 normal-case flex-grow">{s.title || "Untitled section"}{locked && <Lock size={11} className="inline ml-1 text-amber-500" />}</p>}
                                {/* CR-B-16 — live: who else is editing this section right now. */}
                                {secPeers.length > 0 && (
                                  <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5" title={`${secPeers.map((u) => u.name).join(", ")} editing this section`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    {secPeers.map((u) => u.name).join(", ")}
                                  </span>
                                )}
                                {canEdit && (
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <select value={s.status || ""} onChange={(e) => secSetStatus(r, i, e.target.value as RequestSectionStatus)} disabled={locked} className={`text-[10px] font-bold rounded-full px-2 py-1 border-0 cursor-pointer disabled:opacity-60 ${st.cls}`} title="Section status">
                                      {SECTION_STATUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                                    </select>
                                    {(s.history?.length || 0) > 0 && <button onClick={() => setHistFor({ r, i })} title="View history" className="p-1 rounded text-slate-300 hover:text-slate-600"><Clock size={13} /></button>}
                                    <button onClick={() => secUpdate(r, i, { viewLock: !s.viewLock }, true)} title={s.viewLock ? "View-restricted — click to unrestrict" : "Restrict who can view this section (e.g. financials)"} className={`p-1 rounded ${s.viewLock ? "text-indigo-600 bg-indigo-50" : "text-slate-300 hover:text-slate-600"}`}><Shield size={13} /></button>
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
                              ) : s.viewLock && !canEdit ? (
                                <p className="text-[11px] text-indigo-500 italic bg-indigo-50 rounded-lg px-2 py-1.5 inline-flex items-center gap-1.5"><Shield size={12} /> Restricted section — you don't have access to view this.</p>
                              ) : (
                                <>
                                  {secEditable
                                    ? <RichTextEditor value={s.body} onChange={(html) => secUpdate(r, i, { body: html }, false)} minHeight={110} placeholder="Section content…" onImageUpload={imageUpload} />
                                    : <div className="text-xs text-slate-600 bg-white border border-slate-100 rounded-lg p-2" dangerouslySetInnerHTML={{ __html: withFileTokensInHtml(s.body || "") || "<span class='text-slate-300'>Empty</span>" }} />}
                                  {canEdit && !locked && (
                                    <input className={`${inp} text-[11px]`} placeholder="+ Internal notes for this section (not printed)" defaultValue={s.notes || ""} onBlur={(e) => secUpdate(r, i, { notes: e.target.value }, true)} />
                                  )}
                                  {/* CR-B-18/19a — per-section files + assign a colleague. */}
                                  {canEdit && !locked && (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><UserPlus size={12} className="text-slate-400" />
                                        {users.length > 0 ? (
                                          <select className={`${inp} text-[11px] w-44 py-1`} value={users.find((u) => u.name === s.assignedTo)?._id || ""} onChange={(e) => { const u = users.find((x) => x._id === e.target.value); assignSection(r, i, u?._id || "", u?.name || ""); }} title="Assign & notify a colleague to edit/review/verify">
                                            <option value="">Assign to…</option>
                                            {users.map((u) => <option key={u._id} value={u._id}>{u.name || u.email}</option>)}
                                          </select>
                                        ) : (
                                          <input className={`${inp} text-[11px] w-40 py-1`} placeholder="Assign to (name)" defaultValue={s.assignedTo || ""} onBlur={(e) => secUpdate(r, i, { assignedTo: e.target.value }, true)} />
                                        )}
                                      </span>
                                      {(s.attachments || []).map((a) => (
                                        <span key={a._id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-600"><Paperclip size={10} /><span className="max-w-[10rem] truncate" title={a.name}>{a.name}</span><FileActions name={a.name} url={attachmentUrl(a.filePath)} projectName={clientName} size={11} onDelete={() => secDeleteFile(r, i, a._id)} /></span>
                                      ))}
                                      <label className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200 cursor-pointer"><Paperclip size={11} /> Attach files<input type="file" multiple className="hidden" onChange={(e) => { const fs = Array.from<File>(e.target.files || []); e.target.value = ""; void (async () => { for (const f of fs) await secUploadFile(r, i, f); })(); }} /></label>
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
                            <div className="mt-1 normal-case tracking-normal"><SignaturePicker value={{ name: r.signerName, title: r.signerTitle, signatureUrl: r.signatureUrl }} placeholder="No signature" ariaLabel="GreenTech signature"
                              onPick={(p) => { const f = signerFields(p, r); updateProjectRequest(projectId, r._id, { signerName: f.signerName, signerTitle: f.signerTitle, signatureUrl: f.signatureUrl }).then(patch).catch(() => {}); }} /></div>
                            {r.signatureUrl && <div className="flex items-center gap-3 mt-2"><img src={sigSrc(r.signatureUrl)} alt="signature" className="h-10 object-contain bg-white rounded-lg px-2 py-1 border border-slate-200" /><span className="text-[11px] font-bold text-slate-600 normal-case">{r.signerName}{r.signerTitle ? ` · ${r.signerTitle}` : ""}</span></div>}
                            {/* CR-P (146) — the company stamp beside the GreenTech signature. */}
                            <div className="mt-2 space-y-1 font-normal normal-case tracking-normal">
                              <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">Company stamp</span>
                              <StampPicker value={r.stampUrl || ""} onChange={(v) => saveFields(r, { stampUrl: v })} />
                            </div>
                          </div>
                        )}
                        {/* CR-P (146) — on a joint-venture project the JV partner signs too, with the
                            signatures and stamps saved on the partner's profile. */}
                        {canEdit && partner?.name && (
                          <div className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">{partner.name} (JV partner) signature
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                              {(() => {
                                const people = partnerCo?.contactPersons || [];
                                const legacy = !!r.partnerSignerName && !people.some((p) => p.name === r.partnerSignerName);
                                return people.length ? (
                                  <select className={`${inp} font-bold sm:col-span-2`} value={r.partnerSignerName || ""} aria-label="Partner signer"
                                    onChange={(e) => { const p = people.find((x) => x.name === e.target.value); saveFields(r, { partnerSignerName: p?.name || "", partnerSignerTitle: p?.role || "" }); }}>
                                    <option value="">— Choose the signer (the partner's people in the Directory) —</option>
                                    {legacy && <option value={r.partnerSignerName}>{r.partnerSignerName}{r.partnerSignerTitle ? `, ${r.partnerSignerTitle}` : ""} (typed before; not in the Directory)</option>}
                                    {people.map((p) => <option key={p.name} value={p.name}>{p.name}{p.role ? `, ${p.role}` : ""}</option>)}
                                  </select>
                                ) : (
                                  <p className="sm:col-span-2 normal-case tracking-normal font-medium text-slate-400">{partner?.companyId ? "The partner's Directory record has no people yet: add them in the Directory to choose the signer." : "Link the JV partner to the Directory (Project Identity) to choose its signer."}{r.partnerSignerName ? ` Now: ${r.partnerSignerName}.` : ""}</p>
                                );
                              })()}
                              <select className={`${inp} font-bold`} value={r.partnerSignatureUrl || ""} onChange={(e) => saveFields(r, { partnerSignatureUrl: e.target.value })}>
                                <option value="">— No signature —</option>
                                {(partner.signatures || []).map((s, i) => <option key={i} value={s.url}>{s.name || `Signature ${i + 1}`}</option>)}
                              </select>
                              <select className={`${inp} font-bold`} value={r.partnerStampUrl || ""} onChange={(e) => saveFields(r, { partnerStampUrl: e.target.value })}>
                                <option value="">— No stamp —</option>
                                {(partner.stamps || []).map((s, i) => <option key={i} value={s.url}>{s.name || `Stamp ${i + 1}`}</option>)}
                              </select>
                            </div>
                            {(r.partnerSignatureUrl || r.partnerStampUrl) && (
                              <div className="flex items-center gap-2 mt-2">
                                {r.partnerSignatureUrl && <img src={sigSrc(r.partnerSignatureUrl)} alt="partner signature" className="h-10 object-contain bg-white rounded-lg px-2 py-1 border border-slate-200" />}
                                {r.partnerStampUrl && <img src={sigSrc(r.partnerStampUrl)} alt="partner stamp" className="h-10 object-contain bg-white rounded-lg px-1 border border-slate-200" />}
                              </div>
                            )}
                            {(partner.signatures || []).length === 0 && <p className="text-[10px] font-medium normal-case tracking-normal text-slate-400 mt-1">No signatures saved on the partner profile yet (Project Identity → Joint Venture).</p>}
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
                          {canEdit && <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 cursor-pointer hover:bg-slate-200"><Paperclip size={10} /> Attach files<input type="file" multiple className="hidden" onChange={async (e) => { const fs = Array.from<File>(e.target.files || []); e.target.value = ""; for (const f of fs) { try { patch(await uploadRequestFile(projectId, r._id, f)); } catch (err) { toast(err instanceof Error ? err.message : `Could not upload ${f.name}.`, "error"); } } }} /></label>}
                          {/* 2026-10-08 - no cover sheet before each file unless asked for. */}
                          {canEdit && <label className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 cursor-pointer select-none"><input type="checkbox" checked={!!r.attachmentCovers} onChange={(e) => saveFields(r, { attachmentCovers: e.target.checked })} className="accent-emerald-600" /> Cover page before each attached file</label>}
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
                          </div>
                        </div>
                      </div>,
                      document.body,
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
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-12" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
              <p className="text-sm font-bold text-slate-900">New request</p>
              <button onClick={() => setCreating(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              {/* CR 329 (2026-09-28) - the type is editable: pick one of the standard types, or type
                  your own. A typed one is kept as a custom request under that name. */}
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type
                <input
                  list="request-type-list"
                  className={`${inp} mt-1 font-bold`}
                  value={draft.type === "Custom Request" ? draft.customTitle : draft.type}
                  onChange={(e) => {
                    const v = e.target.value;
                    const known = REQUEST_TYPES.find((t) => t !== "Custom Request" && t.toLowerCase() === v.trim().toLowerCase());
                    setDraft(known
                      ? { ...draft, type: known, customTitle: "", sections: withQuestions(known, draft.sections) }
                      : { ...draft, type: "Custom Request", customTitle: v.slice(0, 160), sections: withQuestions(v, draft.sections) });
                  }}
                  onFocus={(e) => e.target.select()}
                  placeholder="Pick a type, or type your own"
                />
                <datalist id="request-type-list">
                  {REQUEST_TYPES.filter((t) => t !== "Custom Request").map((t) => <option key={t} value={t} />)}
                </datalist>
                <span className="mt-1 block normal-case tracking-normal text-[10px] font-medium text-slate-400">Choose from the list or write your own type. Clear the box to see the whole list.</span>
              </label>
              {/* CR-P (147) — the recipient, from the Directory; the project's client by default. */}
              <CompanyPicker
                label="To (who receives this request)"
                size="sm"
                value={draftTo.name}
                category="client"
                categories={[...TO_CATEGORIES]}
                onNameChange={(v) => setDraftTo({ name: v, companyId: "", contactName: "", email: "", address: "" })}
                onSelectCompany={(c) => setDraftTo(toFromCompany(c))}
                placeholder="Search the Directory: the client, a partner, a subcontractor…"
                hint="Usually the client; an RFI can also go to a partner or a subcontractor."
              />
              <div className="grid grid-cols-2 gap-3">
                <label className={`text-[10px] font-bold uppercase tracking-widest ${titleError ? "text-rose-600" : "text-slate-400"}`}>Subject
                  <input
                    id="request-subject"
                    className={`${inp} mt-1 ${titleError ? "border-rose-300 ring-2 ring-rose-100" : ""}`}
                    value={draft.title}
                    onChange={(e) => { setDraft({ ...draft, title: e.target.value }); if (e.target.value.trim()) setTitleError(false); }}
                    placeholder="e.g. Clarify pipe spec on drawing A-12"
                    aria-invalid={titleError}
                  />
                  {titleError && <span className="mt-1 block normal-case text-[10px] font-bold text-rose-600">A request needs a subject before it can be saved.</span>}
                </label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date
                  <input type="date" className={`${inp} mt-1`} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
              </div>
              {/* 2026-10-08 - the status, from the client's list (Draft until changed). */}
              <div className="space-y-1">
                <label htmlFor="request-status" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
                <RequestStatusSelect id="request-status" value={draft.status || "Draft"} onChange={(st) => setDraft({ ...draft, status: st })} />
              </div>
              <div className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description / request <span className="normal-case font-medium text-slate-400">— add tables, pictures, lines and custom sections</span>
                <div className="mt-1"><RichTextEditor value={draft.description} onChange={(html) => setDraft({ ...draft, description: html })} minHeight={160} placeholder="Describe the information / clarification / change you are requesting…" onImageUpload={imageUpload} /></div>
              </div>

              {/* Custom named sections — each a titled rich-text block (tables, pictures, lists). */}
              {draft.sections.map((s, i) => (
                <div key={i} className="space-y-1.5 border-l-2 border-primary/30 pl-3">
                  <div className="flex items-center gap-2">
                    <input className={`${inp} font-bold`} placeholder="Section title (e.g. Background, Proposed Solution)" value={s.title} onChange={(e) => setDraft({ ...draft, sections: draft.sections.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                    <button onClick={() => removeDraftSection(i)} className="text-slate-300 hover:text-red-500 shrink-0" title="Remove section"><X size={16} /></button>
                  </div>
                  <RichTextEditor value={s.body} onChange={(html) => setDraft({ ...draft, sections: draft.sections.map((x, j) => (j === i ? { ...x, body: html } : x)) })} minHeight={120} placeholder="Section content — tables, pictures, lists…" onImageUpload={imageUpload} />
                  <AttachFiles files={s.files || []} onChange={(files) => setDraft({ ...draft, sections: draft.sections.map((x, j) => (j === i ? { ...x, files } : x)) })} label="Attach files to this section" />
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setDraft({ ...draft, sections: insertSection(draft.sections, { title: "", body: "" }) })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200"><Plus size={13} /> Add section</button>
                <AttachFiles files={draft.files || []} onChange={(files) => setDraft({ ...draft, files })} />
              </div>
              {((draft.files || []).length > 0 || draft.sections.some((x) => (x.files || []).length > 0)) && (
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={!!draft.covers} onChange={(e) => setDraft({ ...draft, covers: e.target.checked })} className="accent-emerald-600" />
                  A cover page before each attached file <span className="font-medium text-slate-400">(off: the files follow straight on)</span>
                </label>
              )}

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
                <SignaturePicker value={{ name: draft.signerName, title: draft.signerTitle, signatureUrl: draft.signatureUrl }} placeholder="No signature" ariaLabel="GreenTech signature"
                  onPick={(p) => { const f = signerFields(p, draft); setDraft({ ...draft, signerName: f.signerName, signerTitle: f.signerTitle, signatureUrl: f.signatureUrl }); }} />
                {draft.signatureUrl && (
                  <div className="flex items-center gap-3 pt-1">
                    <img src={sigSrc(draft.signatureUrl)} alt="signature" className="h-12 object-contain bg-white rounded-lg px-2 py-1 border border-slate-200" />
                    <div className="text-[11px]"><p className="font-bold text-slate-700">{draft.signerName}</p>{draft.signerTitle && <p className="text-slate-400">{draft.signerTitle}</p>}</div>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-400">The number is assigned automatically (e.g. RFI-001). Saved as a <strong>Draft</strong> — upload your drafted document, add the client's responses, and the client-signature block is a placeholder on the generated PDF.</p>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                {/* CR 210 - preview the document before saving it. */}
                <button onClick={previewDraft} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-[11px] font-bold hover:text-primary">
                  <Eye size={13} /> Preview
                </button>
                {/* CR-B-14a — standard actions with confirmations. Send stays a separate row action (CR-P-11). */}
                <BuilderActions
                  confirm={confirm}
                  saving={saving}
                  dirty
                  onReset={() => { setDraft(blankDraft); setDraftTo(blankTo()); }}
                  onCancel={() => setCreating(false)}
                  onSaveDraft={() => create(false)}
                  onSave={() => create(false)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add-response popup — CR-B-03: a data-entry modal must not close on an accidental
          outside click; it stays until the user explicitly closes it. */}
      {respDraft && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
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

      {/* CR-B-17 — per-section history */}
      {histFor && (() => {
        const sec = (histFor.r.sections || [])[histFor.i];
        const hist = sec?.history || [];
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 truncate">History — {sec?.title || "Section"}</h3>
                <button onClick={() => setHistFor(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
              </div>
              <div className="p-4 max-h-80 overflow-y-auto space-y-1.5">
                {hist.length === 0 ? <p className="text-xs text-slate-400 italic">No changes recorded yet.</p> : [...hist].reverse().map((h, k) => (
                  <div key={k} className="flex items-start gap-2 text-[11px]"><Clock size={11} className="text-slate-300 mt-0.5 shrink-0" /><div><span className="font-bold text-slate-700">{h.text}</span> <span className="text-slate-400">· {h.by}{h.at ? ` · ${new Date(h.at).toLocaleString()}` : ""}</span></div></div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
