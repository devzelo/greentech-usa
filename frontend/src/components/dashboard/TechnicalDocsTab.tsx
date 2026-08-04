import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  PencilRuler, FileStack, Plus, Trash2, Download, Upload, X, FileText, Eye,
  CheckCircle2, XCircle, Clock, MessageSquare, GitBranch, FolderArchive, Loader2,
  ClipboardList, Archive, Settings2, ChevronRight, ChevronDown, Folder, FolderPlus,
} from "lucide-react";
import {
  fetchTechnicalDocs, createTechnicalDoc, updateTechnicalDoc, reviseTechnicalDoc, deleteTechnicalDoc,
  uploadTechnicalDocFile, updateTechnicalDocFile, deleteTechnicalDocFile, createTechDocFolder, deleteTechDocFolder,
  uploadTechnicalDocClientFile, deleteTechnicalDocClientFile, exportTechnicalDocsZip, techDocFileUrl,
  SUBMITTAL_STAGES, DRAWING_CATEGORIES,
  type ApiTechnicalDoc, type ApiTechDocFile, type TechDocStatus,
} from "../../lib/api";
import type { ProjectPdfInfo } from "../../lib/pdfProjectHeader";
import RequestBuilder from "./RequestBuilder";
import CloseoutDocsTab from "./CloseoutDocsTab";
import ShareMenu from "./ShareMenu";
import DocumentViewer from "./DocumentViewer";
import { useDialogs } from "../../lib/useDialogs";

type Confirm = ReturnType<typeof useDialogs>["confirm"];
type Prompt = ReturnType<typeof useDialogs>["prompt"];

// Technical Docs (client request v1/v2) — one module with four sub-tabs. Design Documents & Other
// Technical Documents use the procurement-Submittals pattern: the TABLE is a read-only preview
// (submittal name, revision, per-category document previews, status, remarks, client response),
// all editing happens in a MANAGE modal, and revisions nest as sub-rows under their submittal.

type TechTab = "drawing" | "other" | "contract-admin" | "closeout";

const STATUS_META: Record<TechDocStatus, { label: string; cls: string; Icon: typeof Clock }> = {
  Pending: { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: Clock },
  Approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  ApprovedAsNoted: { label: "Approved as Noted", cls: "bg-sky-50 text-sky-700 border-sky-200", Icon: CheckCircle2 },
  Rejected: { label: "Rejected", cls: "bg-rose-50 text-rose-700 border-rose-200", Icon: XCircle },
};
const STATUSES: TechDocStatus[] = ["Pending", "Approved", "ApprovedAsNoted", "Rejected"];
const CUSTOM = "__custom__";

// A previewable file for the DocumentViewer / preview modal.
const toViewable = (f: { name: string; filePath: string; fileType?: string }) => ({ name: f.name, url: techDocFileUrl(f), fileType: f.fileType || (f.name.split(".").pop() || "") });

export default function TechnicalDocsTab({ projectId, canEdit, isOwner, projectInfo, clientName, projectName }: { projectId: string; canEdit: boolean; isOwner: boolean; projectInfo?: ProjectPdfInfo; clientName?: string; projectName?: string }) {
  const [tab, setTab] = useState<TechTab>("drawing");
  const [rows, setRows] = useState<ApiTechnicalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { confirm, prompt, dialogs } = useDialogs();
  const [manageId, setManageId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; files: ApiTechDocFile[] } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { setRows(await fetchTechnicalDocs(projectId)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed to load technical documents."); }
    finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const replaceRow = useCallback((u: ApiTechnicalDoc) => setRows((prev) => prev.map((r) => (r._id === u._id ? u : r))), []);
  const manageDoc = manageId ? rows.find((r) => r._id === manageId) || null : null;

  // Group rows into revision families (groupId), newest revision first within each family.
  const groups = useMemo(() => {
    const build = (kind: "drawing" | "other") => {
      const map = new Map<string, ApiTechnicalDoc[]>();
      for (const r of rows.filter((x) => x.kind === kind)) {
        const g = r.groupId || r._id;
        if (!map.has(g)) map.set(g, []);
        map.get(g)!.push(r);
      }
      return [...map.values()]
        .map((revs) => { const sorted = [...revs].sort((a, b) => b.revNo - a.revNo); return { key: sorted[0].groupId || sorted[0]._id, current: sorted[0], older: sorted.slice(1) }; })
        .sort((a, b) => a.current.order - b.current.order);
    };
    return { drawing: build("drawing"), other: build("other") };
  }, [rows]);

  const addRow = async (kind: "drawing" | "other") => {
    setBusy(true);
    try { const d = await createTechnicalDoc(projectId, { kind }); setRows((p) => [...p, d]); setManageId(d._id); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed to add."); }
    finally { setBusy(false); }
  };
  const revise = async (row: ApiTechnicalDoc) => {
    setBusy(true);
    try { const c = await reviseTechnicalDoc(projectId, row._id); setRows((p) => [...p, c]); setManageId(c._id); setExpanded((s) => new Set(s).add(c.groupId || c._id)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed to create revision."); }
    finally { setBusy(false); }
  };
  const removeRow = async (row: ApiTechnicalDoc) => {
    if (!(await confirm({ title: "Delete this revision?", message: `Permanently delete ${row.submittalStage} Rev ${row.revNo} and all its files?`, confirmLabel: "Delete", danger: true }))) return;
    try { await deleteTechnicalDoc(projectId, row._id); setRows((p) => p.filter((r) => r._id !== row._id)); if (manageId === row._id) setManageId(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Delete failed."); }
  };
  const exportZip = async (did?: string) => {
    setExporting(true); setErr("");
    try { await exportTechnicalDocsZip(projectId, did); }
    catch (e) { setErr(e instanceof Error ? e.message : "Export failed."); }
    finally { setExporting(false); }
  };
  const toggle = (key: string) => setExpanded((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const catFiles = (row: ApiTechnicalDoc, key: string) => row.files.filter((f) => f.category === key);

  const previewBtn = (row: ApiTechnicalDoc, key: string, label: string) => {
    const files = catFiles(row, key);
    return (
      <button onClick={() => setPreview({ title: `${label} — ${row.submittalStage} Rev ${row.revNo}`, files })} disabled={!files.length}
        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${files.length ? "bg-primary/10 text-primary hover:bg-primary/20" : "bg-slate-50 text-slate-300 cursor-default"}`}>
        {files.length ? <><Eye size={11} /> {files.length}</> : "—"}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-fit flex-wrap">
        {([["drawing", "Design Documents", PencilRuler], ["other", "Other Technical Documents", FileStack], ["contract-admin", "Contract Admin", ClipboardList], ["closeout", "Closeout Documents", Archive]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${tab === k ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {err && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl px-4 py-2.5 flex items-center justify-between"><span>{err}</span><button onClick={() => setErr("")}><X size={14} /></button></div>}

      {tab === "contract-admin" ? (
        <div className="space-y-4">
          <p className="text-[11px] text-slate-400">Requests to the client — RFIs, clarifications, change orders, notices and claims. Auto-numbered; the client's responses are kept under each request.</p>
          <RequestBuilder projectId={projectId} category="contract-admin" canEdit={canEdit} projectInfo={projectInfo} clientName={clientName} />
        </div>
      ) : tab === "closeout" ? (
        <div className="space-y-4">
          <p className="text-[11px] text-slate-400">Documents submitted to the client at project end. Add each one, then combine into a single PDF.</p>
          <CloseoutDocsTab projectId={projectId} canEdit={canEdit} isOwner={isOwner} projectName={projectName} />
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : tab === "drawing" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[11px] text-slate-400">Drawing submittals — the table previews each submittal &amp; revision. Click <strong>Manage</strong> to edit, upload documents, set the status and record the client's response.</p>
            <div className="flex items-center gap-2">
              <button disabled={exporting || !groups.drawing.length} onClick={() => exportZip()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 disabled:opacity-40">
                {exporting ? <Loader2 size={13} className="animate-spin" /> : <FolderArchive size={13} />} Export all (ZIP)
              </button>
              {canEdit && <button disabled={busy} onClick={() => addRow("drawing")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 disabled:opacity-40"><Plus size={13} /> Add submittal</button>}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="py-3 px-2 w-6"></th>
                  <th className="py-3 px-3 w-8">#</th>
                  <th className="py-3 px-3 min-w-[150px]">Submittal</th>
                  <th className="py-3 px-3 w-16 whitespace-nowrap">Rev</th>
                  {DRAWING_CATEGORIES.map((c) => <th key={c.key} className="py-3 px-3 text-center min-w-[80px]">{c.label}</th>)}
                  <th className="py-3 px-3 min-w-[130px]">Status</th>
                  <th className="py-3 px-3 min-w-[120px]">Remarks</th>
                  <th className="py-3 px-3 text-center w-20">Client</th>
                  <th className="py-3 px-3 text-right min-w-[130px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.drawing.length === 0 && <tr><td colSpan={12} className="text-center text-slate-300 py-10">No submittals yet.</td></tr>}
                {groups.drawing.map((g, i) => {
                  const rowsToShow = expanded.has(g.key) ? [g.current, ...g.older] : [g.current];
                  return rowsToShow.map((row, ri) => {
                    const isCurrent = row._id === g.current._id;
                    const S = STATUS_META[row.status];
                    const hasClient = !!row.clientComments || row.clientFiles.length > 0;
                    return (
                      <tr key={row._id} className={`border-b border-slate-50 last:border-0 ${isCurrent ? "hover:bg-slate-50/50" : "bg-slate-50/40 text-slate-500"}`}>
                        <td className="py-2.5 px-2">
                          {isCurrent && g.older.length > 0 && (
                            <button onClick={() => toggle(g.key)} className="p-1 rounded hover:bg-slate-100 text-slate-400" title={`${g.older.length} earlier revision(s)`}>
                              {expanded.has(g.key) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{isCurrent ? i + 1 : ""}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-700">{isCurrent ? row.submittalStage : <span className="pl-3 text-slate-400">↳ {row.submittalStage}</span>}</td>
                        <td className="py-2.5 px-3"><span className="inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-500">Rev {row.revNo}</span></td>
                        {DRAWING_CATEGORIES.map((c) => <td key={c.key} className="py-2.5 px-3 text-center">{previewBtn(row, c.key, c.label)}</td>)}
                        <td className="py-2.5 px-3"><span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold ${S.cls}`}><S.Icon size={11} /> {S.label}</span></td>
                        <td className="py-2.5 px-3 text-slate-500 max-w-[160px] truncate" title={row.remarks}>{row.remarks || "—"}</td>
                        <td className="py-2.5 px-3 text-center">
                          <button onClick={() => setManageId(row._id)} className={`p-1.5 rounded-lg hover:bg-slate-100 relative ${hasClient ? "text-primary" : "text-slate-300"}`} title="Client response">
                            <MessageSquare size={14} />{hasClient && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full" />}
                          </button>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setManageId(row._id)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary" title="Manage"><Settings2 size={12} /> Manage</button>
                            <button title="Export (ZIP)" disabled={exporting} onClick={() => exportZip(row._id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-40"><Download size={13} /></button>
                            {canEdit && <button title="Delete" onClick={() => removeRow(row)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-400"><Trash2 size={13} /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // ── Other Technical Documents ──────────────────────────────────────────
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[11px] text-slate-400">Other technical documents — calculations, method statements, datasheets. Click <strong>Manage</strong> to edit and upload; revisions nest below.</p>
            {canEdit && <button disabled={busy} onClick={() => addRow("other")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 disabled:opacity-40"><Plus size={13} /> Add document</button>}
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="py-3 px-2 w-6"></th>
                  <th className="py-3 px-3 w-8">#</th>
                  <th className="py-3 px-3 w-16">Rev</th>
                  <th className="py-3 px-3 min-w-[220px]">Description</th>
                  <th className="py-3 px-3 text-center min-w-[90px]">Documents</th>
                  <th className="py-3 px-3 min-w-[150px]">Remarks</th>
                  <th className="py-3 px-3 text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.other.length === 0 && <tr><td colSpan={7} className="text-center text-slate-300 py-10">No documents yet.</td></tr>}
                {groups.other.map((g, i) => {
                  const rowsToShow = expanded.has(g.key) ? [g.current, ...g.older] : [g.current];
                  return rowsToShow.map((row) => {
                    const isCurrent = row._id === g.current._id;
                    return (
                      <tr key={row._id} className={`border-b border-slate-50 last:border-0 ${isCurrent ? "hover:bg-slate-50/50" : "bg-slate-50/40 text-slate-500"}`}>
                        <td className="py-2.5 px-2">{isCurrent && g.older.length > 0 && <button onClick={() => toggle(g.key)} className="p-1 rounded hover:bg-slate-100 text-slate-400">{expanded.has(g.key) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>}</td>
                        <td className="py-2.5 px-3 text-slate-400">{isCurrent ? i + 1 : ""}</td>
                        <td className="py-2.5 px-3"><span className="inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-500">Rev {row.revNo}</span></td>
                        <td className="py-2.5 px-3 text-slate-700">{row.description || <span className="text-slate-300">—</span>}</td>
                        <td className="py-2.5 px-3 text-center">{previewBtn(row, "documents", "Documents")}</td>
                        <td className="py-2.5 px-3 text-slate-500 max-w-[180px] truncate" title={row.remarks}>{row.remarks || "—"}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setManageId(row._id)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Settings2 size={12} /> Manage</button>
                            {canEdit && <button title="Delete" onClick={() => removeRow(row)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-400"><Trash2 size={13} /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {manageDoc && (
        <ManageModal
          projectId={projectId} doc={manageDoc} canEdit={canEdit} projectName={projectName} confirm={confirm} prompt={prompt}
          onClose={() => setManageId(null)} onChange={replaceRow} onRevise={() => revise(manageDoc)} onExport={() => exportZip(manageDoc._id)}
          onPreview={(title, files) => setPreview({ title, files })}
        />
      )}
      {preview && <PreviewModal title={preview.title} files={preview.files} projectName={projectName} onClose={() => setPreview(null)} />}
      {dialogs}
    </div>
  );
}

// ── Preview modal: a table of documents; click a row to preview it in-platform (PDF/Excel/images)
//    or download it (DWG/other). Every file has a share button. ────────────────────────────────
function PreviewModal({ title, files, projectName, onClose }: { title: string; files: ApiTechDocFile[]; projectName?: string; onClose: () => void }) {
  const [view, setView] = useState<ApiTechDocFile | null>(null);
  return (
    <>
      <Modal title={title} onClose={onClose} wide>
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100"><th className="py-2.5 px-3 w-8">#</th><th className="py-2.5 px-3">Document</th><th className="py-2.5 px-3 w-32">Folder</th><th className="py-2.5 px-3">Remarks</th><th className="py-2.5 px-3 text-right w-28">Actions</th></tr></thead>
            <tbody>
              {files.length === 0 && <tr><td colSpan={5} className="text-center text-slate-300 py-8">No files.</td></tr>}
              {[...files].sort((a, b) => (a.folder || "").localeCompare(b.folder || "")).map((f, i) => (
                <tr key={f._id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="py-2.5 px-3 text-slate-400">{i + 1}</td>
                  <td className="py-2.5 px-3">
                    <button onClick={() => setView(f)} className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-primary text-left"><FileText size={13} /> {f.name}</button>
                    <span className="ml-2 text-[10px] text-slate-400 uppercase">{f.fileType} · {f.size}</span>
                  </td>
                  <td className="py-2.5 px-3">{f.folder ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500"><Folder size={11} className="text-primary" /> {f.folder}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="py-2.5 px-3 text-slate-500 max-w-[180px] truncate" title={f.remarks}>{f.remarks || "—"}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setView(f)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary" title="Preview"><Eye size={14} /></button>
                      <a href={techDocFileUrl(f)} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" title="Download"><Download size={14} /></a>
                      <ShareMenu fileName={f.name} fileUrl={techDocFileUrl(f)} projectName={projectName} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
      {view && <DocumentViewer doc={toViewable(view)} onClose={() => setView(null)} />}
    </>
  );
}

// ── Manage modal: everything editable for one submittal/revision. Header fields (stage, status,
//    remarks, description, client comments) are buffered and saved with an explicit Save; closing
//    with unsaved edits prompts to save. File actions persist immediately (they are actions). ─────
function ManageModal({ projectId, doc, canEdit, projectName, confirm, prompt, onClose, onChange, onRevise, onExport, onPreview }: {
  projectId: string; doc: ApiTechnicalDoc; canEdit: boolean; projectName?: string; confirm: Confirm; prompt: Prompt;
  onClose: () => void; onChange: (d: ApiTechnicalDoc) => void; onRevise: () => void; onExport: () => void;
  onPreview: (title: string, files: ApiTechDocFile[]) => void;
}) {
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const isDrawing = doc.kind === "drawing";
  // Buffered editable fields — reset only when switching to a different row (doc._id), so live
  // file uploads (which update `doc`) don't wipe in-progress header edits.
  const [form, setForm] = useState({ submittalStage: doc.submittalStage, status: doc.status, remarks: doc.remarks, description: doc.description, clientComments: doc.clientComments });
  useEffect(() => { setForm({ submittalStage: doc.submittalStage, status: doc.status, remarks: doc.remarks, description: doc.description, clientComments: doc.clientComments }); }, [doc._id]);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const dirty = form.submittalStage !== doc.submittalStage || form.status !== doc.status || form.remarks !== doc.remarks || form.description !== doc.description || form.clientComments !== doc.clientComments;
  const S = STATUS_META[form.status];
  const stageIsCustom = !SUBMITTAL_STAGES.includes(form.submittalStage);

  const save = async () => {
    if (!dirty) return true;
    setSaving(true);
    try { onChange(await updateTechnicalDoc(projectId, doc._id, { submittalStage: form.submittalStage, status: form.status, remarks: form.remarks, description: form.description, clientComments: form.clientComments })); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : "Save failed."); return false; }
    finally { setSaving(false); }
  };
  const close = async () => {
    if (canEdit && dirty) {
      const yes = await confirm({ title: "Unsaved changes", message: "You have unsaved changes. Save them before closing?", confirmLabel: "Save & close", cancelLabel: "Discard", danger: false });
      if (yes) { if (!(await save())) return; }
    }
    onClose();
  };

  return (
    <Modal title={`Manage — ${isDrawing ? `${doc.submittalStage} · Rev ${doc.revNo}` : `Document · Rev ${doc.revNo}`}`} onClose={close} wide>
      {err && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2 mb-3">{err}</div>}
      <div className="space-y-4">
        {/* Header fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {isDrawing ? (
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Submittal</label>
              <div className="flex gap-2">
                <select disabled={!canEdit} value={stageIsCustom ? CUSTOM : form.submittalStage} onChange={(e) => set("submittalStage", e.target.value === CUSTOM ? "" : e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs">
                  {SUBMITTAL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value={CUSTOM}>Custom…</option>
                </select>
                {stageIsCustom && <input disabled={!canEdit} value={form.submittalStage} placeholder="Custom name" onChange={(e) => set("submittalStage", e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs" />}
              </div>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Description</label>
              <input disabled={!canEdit} value={form.description} placeholder="Document description" onChange={(e) => set("description", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs" />
            </div>
          )}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Revision</label>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold text-slate-600">Rev {doc.revNo} <span className="font-medium text-slate-400">· auto</span></div>
          </div>
        </div>

        {isDrawing && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
              {canEdit ? (
                <select value={form.status} onChange={(e) => set("status", e.target.value as TechDocStatus)} className={`w-full border rounded-lg px-2 py-2 text-[11px] font-semibold ${S.cls}`}>
                  {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              ) : <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold ${S.cls}`}><S.Icon size={11} /> {S.label}</span>}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Remarks</label>
              <input disabled={!canEdit} value={form.remarks} placeholder="Overall remarks" onChange={(e) => set("remarks", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs" />
            </div>
          </div>
        )}
        {!isDrawing && (
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Remarks</label>
            <input disabled={!canEdit} value={form.remarks} placeholder="Overall remarks" onChange={(e) => set("remarks", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs" />
          </div>
        )}

        {/* Document categories */}
        <div className="space-y-3">
          {(isDrawing ? DRAWING_CATEGORIES.map((c) => ({ k: c.key, label: c.label })) : [{ k: "documents", label: "Documents" }]).map((c) => (
            <Fragment key={c.k}>
              <CategorySection projectId={projectId} doc={doc} category={c.k} label={c.label} canEdit={canEdit} projectName={projectName} confirm={confirm} prompt={prompt} onChange={onChange} onPreview={onPreview} />
            </Fragment>
          ))}
        </div>

        {/* Client response — comments buffered here; files persist immediately. */}
        <ClientResponse projectId={projectId} doc={doc} canEdit={canEdit} projectName={projectName} confirm={confirm} onChange={onChange} comments={form.clientComments} onCommentsChange={(v) => set("clientComments", v)} />

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
          <button onClick={onExport} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"><FolderArchive size={13} /> Export (ZIP)</button>
          <div className="flex items-center gap-2">
            {canEdit && <button onClick={onRevise} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"><GitBranch size={13} /> Next revision</button>}
            <button onClick={close} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Close</button>
            {canEdit && <button onClick={save} disabled={saving || !dirty} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-40 inline-flex items-center gap-1.5">{saving && <Loader2 size={13} className="animate-spin" />} {dirty ? "Save" : "Saved"}</button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// One editable file row (remarks / share / download / delete).
function FileRow({ f, canEdit, projectName, onSaveRemark, onRemove }: { f: ApiTechDocFile; canEdit: boolean; projectName?: string; onSaveRemark: (fid: string, v: string) => void; onRemove: (f: ApiTechDocFile) => void }) {
  return (
    <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-slate-100">
      <FileText size={15} className="text-slate-400 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-700 truncate">{f.name}</p>
        {canEdit
          ? <input defaultValue={f.remarks} placeholder="Add remarks…" onBlur={(e) => { if (e.target.value !== f.remarks) onSaveRemark(f._id, e.target.value); }} className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px]" />
          : f.remarks && <p className="text-[11px] text-slate-500">{f.remarks}</p>}
      </div>
      <ShareMenu fileName={f.name} fileUrl={techDocFileUrl(f)} projectName={projectName} />
      <a href={techDocFileUrl(f)} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" title="Download"><Download size={14} /></a>
      {canEdit && <button onClick={() => onRemove(f)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-400" title="Delete"><Trash2 size={14} /></button>}
    </div>
  );
}

// One document category inside the manage modal. Files can sit at the category root or inside named
// subfolders (client request: "Create folder" → open it → upload files within). Preview shows all.
function CategorySection({ projectId, doc, category, label, canEdit, projectName, confirm, prompt, onChange, onPreview }: {
  projectId: string; doc: ApiTechnicalDoc; category: string; label: string; canEdit: boolean; projectName?: string;
  confirm: Confirm; prompt: Prompt; onChange: (d: ApiTechnicalDoc) => void; onPreview: (title: string, files: ApiTechDocFile[]) => void;
}) {
  const files = doc.files.filter((f) => f.category === category);
  const rootFiles = files.filter((f) => !f.folder);
  // Folder set = persisted folders + any folder referenced by a file.
  const folderNames = Array.from(new Set([
    ...(doc.folders || []).filter((f) => f.category === category).map((f) => f.name),
    ...files.map((f) => f.folder || "").filter(Boolean),
  ]));
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(""); // folder currently receiving an upload
  const fileRef = useRef<HTMLInputElement>(null);

  const titleFor = doc.kind === "drawing" ? `${doc.submittalStage} Rev ${doc.revNo}` : `Rev ${doc.revNo}`;
  const upload = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setUploading(true);
    try { let u = doc; for (const f of Array.from(list)) u = await uploadTechnicalDocFile(projectId, doc._id, f, category, "", target); onChange(u); }
    catch { /* ignore */ } finally { setUploading(false); setTarget(""); if (fileRef.current) fileRef.current.value = ""; }
  };
  const pickInto = (folder: string) => { setTarget(folder); setTimeout(() => fileRef.current?.click(), 0); };
  const saveRemark = async (fid: string, value: string) => { try { onChange(await updateTechnicalDocFile(projectId, doc._id, fid, value)); } catch { /* ignore */ } };
  const remove = async (f: ApiTechDocFile) => {
    if (!(await confirm({ title: "Delete file?", message: `Permanently delete "${f.name}"?`, confirmLabel: "Delete", danger: true }))) return;
    try { onChange(await deleteTechnicalDocFile(projectId, doc._id, f._id)); } catch { /* ignore */ }
  };
  const createFolder = async () => {
    const name = await prompt({ title: "Create folder", label: "Folder name", placeholder: "e.g. Structural", confirmLabel: "Create" });
    if (!name || !name.trim()) return;
    try { const u = await createTechDocFolder(projectId, doc._id, category, name.trim()); onChange(u); setOpenFolders((s) => new Set(s).add(name.trim())); }
    catch { /* ignore */ }
  };
  const removeFolder = async (name: string) => {
    if (!(await confirm({ title: "Delete folder?", message: `Delete the "${name}" folder and all files inside it?`, confirmLabel: "Delete", danger: true }))) return;
    try { onChange(await deleteTechDocFolder(projectId, doc._id, category, name)); } catch { /* ignore */ }
  };
  const toggleFolder = (name: string) => setOpenFolders((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });

  return (
    <div className="bg-slate-50 rounded-2xl border border-slate-100">
      <div className="flex items-center justify-between px-3 py-2.5">
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-xs font-bold text-slate-700">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {label}
          <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] text-slate-500">{files.length}</span>
        </button>
        {files.length > 0 && <button onClick={() => onPreview(`${label} — ${titleFor}`, files)} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-primary" title="Preview all"><Eye size={14} /></button>}
      </div>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {/* Shared hidden input — `target` decides which folder receives the upload. */}
          {canEdit && <input ref={fileRef} type="file" multiple onChange={(e) => upload(e.target.files)} className="hidden" />}

          {/* Root files */}
          {rootFiles.map((f) => <Fragment key={f._id}><FileRow f={f} canEdit={canEdit} projectName={projectName} onSaveRemark={saveRemark} onRemove={remove} /></Fragment>)}

          {/* Subfolders */}
          {folderNames.map((name) => {
            const ff = files.filter((f) => f.folder === name);
            const isOpen = openFolders.has(name);
            return (
              <div key={name} className="bg-white rounded-xl border border-slate-100">
                <div className="flex items-center justify-between px-2.5 py-2">
                  <button onClick={() => toggleFolder(name)} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} <Folder size={13} className="text-primary" /> {name}
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-500">{ff.length}</span>
                  </button>
                  <div className="flex items-center gap-1">
                    {ff.length > 0 && <button onClick={() => onPreview(`${label} / ${name} — ${titleFor}`, ff)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-primary" title="Preview folder"><Eye size={13} /></button>}
                    {canEdit && <button onClick={() => pickInto(name)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-primary" title="Upload into folder"><Upload size={13} /></button>}
                    {canEdit && <button onClick={() => removeFolder(name)} className="p-1 rounded hover:bg-rose-50 text-rose-400" title="Delete folder"><Trash2 size={13} /></button>}
                  </div>
                </div>
                {isOpen && (
                  <div className="px-2.5 pb-2.5 space-y-1.5">
                    {ff.map((f) => <Fragment key={f._id}><FileRow f={f} canEdit={canEdit} projectName={projectName} onSaveRemark={saveRemark} onRemove={remove} /></Fragment>)}
                    {ff.length === 0 && <p className="text-[11px] text-slate-300 text-center py-1">Empty folder.</p>}
                  </div>
                )}
              </div>
            );
          })}

          {files.length === 0 && folderNames.length === 0 && <p className="text-[11px] text-slate-300 text-center py-2">No files.</p>}

          {canEdit && (
            <div className="flex gap-2 pt-1">
              <button disabled={uploading} onClick={() => pickInto("")} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-[11px] font-bold hover:opacity-90 disabled:opacity-40">{uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload file(s)</button>
              <button disabled={uploading} onClick={createFolder} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200 disabled:opacity-40"><FolderPlus size={13} /> Create folder</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClientResponse({ projectId, doc, canEdit, projectName, confirm, onChange, comments, onCommentsChange }: {
  projectId: string; doc: ApiTechnicalDoc; canEdit: boolean; projectName?: string; confirm: Confirm; onChange: (d: ApiTechnicalDoc) => void;
  comments: string; onCommentsChange: (v: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setUploading(true);
    try { let u = doc; for (const f of Array.from(list)) u = await uploadTechnicalDocClientFile(projectId, doc._id, f); onChange(u); }
    catch { /* ignore */ } finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const remove = async (fid: string, name: string) => {
    if (!(await confirm({ title: "Delete file?", message: `Permanently delete "${name}"?`, confirmLabel: "Delete", danger: true }))) return;
    try { onChange(await deleteTechnicalDocClientFile(projectId, doc._id, fid)); } catch { /* ignore */ }
  };

  return (
    <div className="bg-slate-50 rounded-2xl border border-slate-100 p-3 space-y-2">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><MessageSquare size={12} className="text-primary" /> Client Response</p>
      {canEdit ? (
        <textarea value={comments} onChange={(e) => onCommentsChange(e.target.value)} rows={3} placeholder="Comments received from the client…" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs" />
      ) : <p className="text-xs text-slate-600 bg-white rounded-lg px-3 py-2 min-h-[2.5rem] whitespace-pre-wrap border border-slate-100">{doc.clientComments || "—"}</p>}
      <div className="space-y-1.5">
        {doc.clientFiles.map((f) => (
          <div key={f._id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 border border-slate-100">
            <FileText size={14} className="text-slate-400 shrink-0" />
            <a href={techDocFileUrl(f)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-slate-700 hover:text-primary truncate flex-1">{f.name}</a>
            <ShareMenu fileName={f.name} fileUrl={techDocFileUrl(f)} projectName={projectName} />
            {canEdit && <button onClick={() => remove(f._id, f.name)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-400"><Trash2 size={13} /></button>}
          </div>
        ))}
      </div>
      {canEdit && (
        <>
          <input ref={inputRef} type="file" multiple onChange={(e) => upload(e.target.files)} className="hidden" />
          <button disabled={uploading} onClick={() => inputRef.current?.click()} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-bold hover:bg-slate-100 disabled:opacity-40">{uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload client file(s)</button>
        </>
      )}
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className={`bg-white rounded-3xl shadow-2xl w-full my-8 ${wide ? "max-w-3xl" : "max-w-lg"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
          <h3 className="text-base font-bold text-slate-900 pr-4">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
