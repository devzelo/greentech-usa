import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  FileArchive, Layers, MessageSquare, Plus, Settings2, Trash2, X, Loader2, Upload, FileText, Eye, Download,
  Folder, FolderPlus, ChevronRight, ChevronDown,
} from "lucide-react";
import DocSection from "./DocSection";
import PdfPreviewModal from "./PdfPreviewModal";
import ShareMenu from "./ShareMenu";
import DocumentViewer from "./DocumentViewer";
import { useDialogs } from "../../lib/useDialogs";
import {
  fetchTableRows, createTableRow, updateTableRow, deleteTableRow,
  uploadTableRowFile, updateTableRowFile, deleteTableRowFile, tableRowFileUrl,
  createTableFolder, deleteTableFolder,
  type ApiTableRow, type ApiTableFile,
} from "../../lib/api";
import { buildCloseoutPackage } from "../../lib/closeoutPackage";

// Closeout Documents — the documents submitted to the client at project end. Same manage-modal
// pattern as Design Documents: the table is a read-only preview; Add / Manage open a modal where
// the document type, status, remarks and files (each with its own remarks & share) are edited. The
// whole set combines into a single PDF; a Client Response area keeps what the client returns.

const TABLE_KEY = "closeout-docs";
const CLOSEOUT_TYPES = [
  "As-Built Drawings", "Record Drawings", "O&M Manual", "Preventive Maintenance Manual",
  "Commissioning Report", "Start-Up Report", "Functional Test Report", "Factory Acceptance Test (FAT) Report",
  "Site Acceptance Test (SAT) Report", "Performance Test Report", "Water Quality Test Report", "Training Materials",
  "Training Attendance Record", "Training Completion Report", "Spare Parts List", "Spare Parts Delivery Record",
  "Special Tools List", "Equipment Register / Asset Register", "Manufacturer Certificates", "Certificates of Compliance (COC)",
  "Calibration Certificates", "Material Certificates / Mill Certificates", "Warranty Certificate", "Warranty Management Plan (WMP)",
  "Defects Liability Period (DLP) Plan", "Punch List", "Punch List Completion Report", "Final Inspection Report",
  "Final Acceptance Request", "Final Acceptance Certificate", "Demobilization Report", "Environmental Compliance Report",
  "Safety Closeout Report", "Operation Readiness Report", "Maintenance Schedule", "Recommended Spare Parts List",
  "Software / PLC / HMI Backup", "Source Code & Configuration Files", "BMS Integration Report", "BMS Integration Manual",
  "Asset Tags / Equipment Labels", "Photo Documentation", "Closeout Letter", "Complete Closeout Package", "Other (Custom)",
];
const STATUS_OPTIONS = ["Pending", "In Progress", "Ready", "Submitted", "Approved"];
const STATUS_CLS: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200", "In Progress": "bg-sky-50 text-sky-700 border-sky-200",
  Ready: "bg-violet-50 text-violet-700 border-violet-200", Submitted: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const toViewable = (f: ApiTableFile) => ({ name: f.name, url: tableRowFileUrl(f), fileType: f.fileType || (f.name.split(".").pop() || "") });

export default function CloseoutDocsTab({ projectId, canEdit, projectName }: { projectId: string; canEdit: boolean; isOwner?: boolean; projectName?: string }) {
  const [rows, setRows] = useState<ApiTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const { confirm, prompt, dialogs } = useDialogs();

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { setRows(await fetchTableRows(projectId, TABLE_KEY)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed to load."); }
    finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const replace = useCallback((u: ApiTableRow) => setRows((p) => p.map((r) => (r._id === u._id ? u : r))), []);
  const manageRow = manageId ? rows.find((r) => r._id === manageId) || null : null;

  const add = async () => {
    setBusy(true);
    try { const r = await createTableRow(projectId, TABLE_KEY); setRows((p) => [...p, r]); setManageId(r._id); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed to add."); }
    finally { setBusy(false); }
  };
  const remove = async (row: ApiTableRow) => {
    if (!(await confirm({ title: "Delete document?", message: `Permanently delete "${row.data?.document || "this closeout document"}" and its files?`, confirmLabel: "Delete", danger: true }))) return;
    try { await deleteTableRow(projectId, row._id); setRows((p) => p.filter((r) => r._id !== row._id)); if (manageId === row._id) setManageId(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Delete failed."); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-[11px] text-slate-400"><Layers size={14} /> Documents submitted to the client at project end. The table is a preview — click <strong>Manage</strong> to edit and upload.</div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPreview(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:opacity-90"><FileArchive size={14} /> Combine into single PDF</button>
          {canEdit && <button disabled={busy} onClick={add} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 disabled:opacity-40"><Plus size={13} /> Add closeout document</button>}
        </div>
      </div>

      {err && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl px-4 py-2.5 flex items-center justify-between"><span>{err}</span><button onClick={() => setErr("")}><X size={14} /></button></div>}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
              <th className="py-3 px-3 w-8">#</th>
              <th className="py-3 px-3 min-w-[240px]">Document</th>
              <th className="py-3 px-3 min-w-[120px]">Status</th>
              <th className="py-3 px-3 min-w-[160px]">Remarks</th>
              <th className="py-3 px-3 text-center w-24">Files</th>
              <th className="py-3 px-3 text-right w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="text-center text-slate-300 py-10"><Loader2 size={15} className="animate-spin inline" /></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="text-center text-slate-300 py-10">No closeout documents yet.</td></tr>}
            {rows.map((row, i) => {
              const status = row.data?.status || "Pending";
              return (
                <tr key={row._id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="py-2.5 px-3 text-slate-400">{i + 1}</td>
                  <td className="py-2.5 px-3 font-medium text-slate-700">{row.data?.document || <span className="text-slate-300">Untitled</span>}</td>
                  <td className="py-2.5 px-3"><span className={`inline-flex items-center px-2 py-1 rounded-lg border text-[11px] font-semibold ${STATUS_CLS[status] || "bg-slate-50 text-slate-500 border-slate-200"}`}>{status}</span></td>
                  <td className="py-2.5 px-3 text-slate-500 max-w-[200px] truncate" title={row.data?.remarks}>{row.data?.remarks || "—"}</td>
                  <td className="py-2.5 px-3 text-center">
                    <button onClick={() => setManageId(row._id)} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${row.files.length ? "bg-primary/10 text-primary hover:bg-primary/20" : "bg-slate-50 text-slate-300 cursor-default"}`}>
                      {row.files.length ? <><Eye size={11} /> {row.files.length}</> : "—"}
                    </button>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setManageId(row._id)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Settings2 size={12} /> Manage</button>
                      {canEdit && <button onClick={() => remove(row)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-400" title="Delete"><Trash2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Client Response — everything received from the client about the closeout package. */}
      <div className="bg-slate-50 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2"><MessageSquare size={15} className="text-primary" /><h4 className="text-sm font-bold text-slate-900">Client Response</h4></div>
        <p className="text-[11px] text-slate-400">Documents and comments received from the client regarding the closeout package.</p>
        <DocSection projectId={projectId} section="closeout-client-response" title="Client Response Documents" canEdit={canEdit} canPublish={false} />
      </div>

      {manageRow && (
        <ManageModal projectId={projectId} row={manageRow} canEdit={canEdit} projectName={projectName} confirm={confirm} prompt={prompt} onClose={() => setManageId(null)} onChange={replace} />
      )}
      {preview && (
        <PdfPreviewModal
          title="Closeout Package (combined)"
          fileName={`Closeout_Package_${projectName || projectId}.pdf`}
          build={async () => {
            const fresh = await fetchTableRows(projectId, TABLE_KEY);
            const { blob, skipped, included } = await buildCloseoutPackage(fresh, projectName);
            if (!included) throw new Error("No embeddable PDF/image documents uploaded yet (Word/Excel must be saved as PDF).");
            if (skipped.length) console.warn("Closeout package skipped non-PDF/image files:", skipped);
            return blob;
          }}
          onClose={() => setPreview(false)}
        />
      )}
      {dialogs}
    </div>
  );
}

// ── Manage modal: edit the document type, status, remarks and files (each with its own remarks
//    & share) in one place; the table just previews the result. ─────────────────────────────────
function ManageModal({ projectId, row, canEdit, projectName, confirm, prompt, onClose, onChange }: {
  projectId: string; row: ApiTableRow; canEdit: boolean; projectName?: string;
  confirm: ReturnType<typeof useDialogs>["confirm"]; prompt: ReturnType<typeof useDialogs>["prompt"]; onClose: () => void; onChange: (r: ApiTableRow) => void;
}) {
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ApiTableFile | null>(null);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const rootFiles = row.files.filter((f) => !f.folder);
  const folderNames = Array.from(new Set([...(row.folders || []), ...row.files.map((f) => f.folder || "").filter(Boolean)]));
  // Buffered fields — reset only on row change so live file uploads don't wipe header edits.
  const [form, setForm] = useState({ document: row.data?.document || "", status: row.data?.status || "Pending", remarks: row.data?.remarks || "" });
  useEffect(() => { setForm({ document: row.data?.document || "", status: row.data?.status || "Pending", remarks: row.data?.remarks || "" }); }, [row._id]);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = form.document !== (row.data?.document || "") || form.status !== (row.data?.status || "Pending") || form.remarks !== (row.data?.remarks || "");

  const save = async () => {
    if (!dirty) return true;
    setSaving(true);
    try { onChange(await updateTableRow(projectId, row._id, { data: { ...row.data, ...form } })); return true; }
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
  const upload = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setUploading(true);
    try { let u = row; for (const f of Array.from(list)) u = await uploadTableRowFile(projectId, row._id, f, target); onChange(u); }
    catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
    finally { setUploading(false); setTarget(""); if (fileRef.current) fileRef.current.value = ""; }
  };
  const pickInto = (folder: string) => { setTarget(folder); setTimeout(() => fileRef.current?.click(), 0); };
  const saveRemark = async (fid: string, value: string) => { try { onChange(await updateTableRowFile(projectId, row._id, fid, value)); } catch { /* ignore */ } };
  const removeFile = async (f: ApiTableFile) => {
    if (!(await confirm({ title: "Delete file?", message: `Permanently delete "${f.name}"?`, confirmLabel: "Delete", danger: true }))) return;
    try { onChange(await deleteTableRowFile(projectId, row._id, f._id)); } catch { /* ignore */ }
  };
  const createFolder = async () => {
    const name = await prompt({ title: "Create folder", label: "Folder name", placeholder: "e.g. Certificates", confirmLabel: "Create" });
    if (!name || !name.trim()) return;
    try { const u = await createTableFolder(projectId, row._id, name.trim()); onChange(u); setOpenFolders((s) => new Set(s).add(name.trim())); } catch { /* ignore */ }
  };
  const removeFolder = async (name: string) => {
    if (!(await confirm({ title: "Delete folder?", message: `Delete the "${name}" folder and all files inside it?`, confirmLabel: "Delete", danger: true }))) return;
    try { onChange(await deleteTableFolder(projectId, row._id, name)); } catch { /* ignore */ }
  };
  const toggleFolder = (name: string) => setOpenFolders((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const fileRow = (f: ApiTableFile) => (
    <div key={f._id} className="flex flex-col sm:flex-row sm:items-start gap-2 bg-white rounded-xl px-3 py-2 border border-slate-100">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <FileText size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <button onClick={() => setView(f)} className="text-xs font-semibold text-slate-700 hover:text-primary truncate block text-left w-full">{f.name}</button>
          {canEdit
            ? <input defaultValue={f.remarks || ""} placeholder="Add remarks…" onBlur={(e) => { if (e.target.value !== (f.remarks || "")) saveRemark(f._id, e.target.value); }} className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px]" />
            : f.remarks && <p className="text-[11px] text-slate-500">{f.remarks}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 justify-end">
        <button onClick={() => setView(f)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary" title="Preview"><Eye size={14} /></button>
        <ShareMenu fileName={f.name} fileUrl={tableRowFileUrl(f)} projectName={projectName} />
        <a href={tableRowFileUrl(f)} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" title="Download"><Download size={14} /></a>
        {canEdit && <button onClick={() => removeFile(f)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-400" title="Delete"><Trash2 size={14} /></button>}
      </div>
    </div>
  );

  return (
    <>
      <Modal title={`Manage — ${row.data?.document || "Closeout document"}`} onClose={close}>
        {err && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2 mb-3">{err}</div>}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Document</label>
              <select disabled={!canEdit} value={CLOSEOUT_TYPES.includes(form.document) ? form.document : "__custom__"} onChange={(e) => set("document", e.target.value === "__custom__" ? "" : e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-semibold">
                <option value="" disabled>Select a document…</option>
                {CLOSEOUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value="__custom__">Custom…</option>
              </select>
              {!CLOSEOUT_TYPES.includes(form.document) && <input disabled={!canEdit} value={form.document} placeholder="Custom document name" onChange={(e) => set("document", e.target.value)} className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs" />}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
              <select disabled={!canEdit} value={form.status} onChange={(e) => set("status", e.target.value)} className={`w-full border rounded-lg px-2 py-2 text-[11px] font-semibold ${STATUS_CLS[form.status] || "bg-slate-50 text-slate-500 border-slate-200"}`}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Remarks</label>
            <input disabled={!canEdit} value={form.remarks} placeholder="Notes…" onChange={(e) => set("remarks", e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs" />
          </div>

          {/* Files — root files + named subfolders; each file has its own remarks, share, preview, delete. */}
          <div className="bg-slate-50 rounded-2xl border border-slate-100 p-3 space-y-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Documents ({row.files.length})</p>
            {canEdit && <input ref={fileRef} type="file" multiple onChange={(e) => upload(e.target.files)} className="hidden" />}
            {rootFiles.map((f) => fileRow(f))}
            {folderNames.map((name) => {
              const ff = row.files.filter((f) => f.folder === name);
              const isOpen = openFolders.has(name);
              return (
                <div key={name} className="bg-white rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between px-2.5 py-2">
                    <button onClick={() => toggleFolder(name)} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                      {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} <Folder size={13} className="text-primary" /> {name}
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-500">{ff.length}</span>
                    </button>
                    <div className="flex items-center gap-1">
                      {ff.length > 0 && <button onClick={() => ff.forEach((f, i) => setTimeout(() => { const a = document.createElement("a"); a.href = tableRowFileUrl(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); }, i * 350))} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-primary" title="Download all files in this folder"><Download size={13} /></button>}
                      {canEdit && <button onClick={() => pickInto(name)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-bold hover:bg-emerald-600 shrink-0" title="Upload into this folder"><Upload size={13} /> Upload</button>}
                      {canEdit && <button onClick={() => removeFolder(name)} className="p-1 rounded hover:bg-rose-50 text-rose-400" title="Delete folder"><Trash2 size={13} /></button>}
                    </div>
                  </div>
                  {isOpen && <div className="px-2.5 pb-2.5 space-y-1.5">{ff.map((f) => fileRow(f))}{ff.length === 0 && <p className="text-[11px] text-slate-300 text-center py-1">Empty folder.</p>}</div>}
                </div>
              );
            })}
            {row.files.length === 0 && folderNames.length === 0 && <p className="text-[11px] text-slate-300 text-center py-2">No files.</p>}
            {canEdit && (
              <div className="flex gap-2 pt-1">
                <button disabled={uploading} onClick={() => pickInto("")} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-[11px] font-bold hover:opacity-90 disabled:opacity-40">{uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload file(s)</button>
                <button disabled={uploading} onClick={createFolder} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200 disabled:opacity-40"><FolderPlus size={13} /> Create folder</button>
              </div>
            )}
          </div>

          <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-100">
            <button onClick={close} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Close</button>
            {canEdit && <button onClick={save} disabled={saving || !dirty} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-40 inline-flex items-center gap-1.5">{saving && <Loader2 size={13} className="animate-spin" />} {dirty ? "Save" : "Saved"}</button>}
          </div>
        </div>
      </Modal>
      {view && <DocumentViewer doc={toViewable(view)} onClose={() => setView(null)} />}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
          <h3 className="text-base font-bold text-slate-900 pr-4">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
