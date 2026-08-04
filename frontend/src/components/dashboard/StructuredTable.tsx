import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload, FileText, Download, Loader2, X } from "lucide-react";
import {
  fetchTableRows, createTableRow, updateTableRow, deleteTableRow,
  uploadTableRowFile, deleteTableRowFile, tableRowFileUrl,
  type ApiTableRow,
} from "../../lib/api";
import ShareMenu from "./ShareMenu";
import { useDialogs } from "../../lib/useDialogs";

type Confirm = ReturnType<typeof useDialogs>["confirm"];

// A reusable structured table backed by the generic ProjectTable model. Columns are described by
// `columns`; each row also carries a revision number and file attachments. Used for Project Info →
// Amendments & Addenda (client request: an amendments table 1, 2, 3 … with descriptions & revisions).

export interface TableColumn { key: string; label: string; type?: "text" | "date" | "number"; width?: string; placeholder?: string; options?: string[] }

export default function StructuredTable({ projectId, tableKey, columns, canEdit, addLabel = "Add row", showRev = true, showFiles = true }: {
  projectId: string; tableKey: string; columns: TableColumn[]; canEdit: boolean; addLabel?: string; showRev?: boolean; showFiles?: boolean;
}) {
  const [rows, setRows] = useState<ApiTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [filesRow, setFilesRow] = useState<ApiTableRow | null>(null);
  const { confirm, dialogs } = useDialogs();

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { setRows(await fetchTableRows(projectId, tableKey)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed to load."); }
    finally { setLoading(false); }
  }, [projectId, tableKey]);
  useEffect(() => { load(); }, [load]);

  const replace = useCallback((u: ApiTableRow) => {
    setRows((p) => p.map((r) => (r._id === u._id ? u : r)));
    setFilesRow((m) => (m && m._id === u._id ? u : m));
  }, []);

  const add = async () => {
    setBusy(true);
    try { const r = await createTableRow(projectId, tableKey); setRows((p) => [...p, r]); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed to add row."); }
    finally { setBusy(false); }
  };
  const patchCell = async (rid: string, key: string, value: string) => {
    try { replace(await updateTableRow(projectId, rid, { data: { [key]: value } })); }
    catch (e) { setErr(e instanceof Error ? e.message : "Update failed."); }
  };
  const patchRev = async (rid: string, revNo: number) => {
    try { replace(await updateTableRow(projectId, rid, { revNo })); }
    catch (e) { setErr(e instanceof Error ? e.message : "Update failed."); }
  };
  const remove = async (rid: string) => {
    if (!(await confirm({ title: "Delete row?", message: "This permanently deletes this row and its files.", confirmLabel: "Delete", danger: true }))) return;
    try { await deleteTableRow(projectId, rid); setRows((p) => p.filter((r) => r._id !== rid)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Delete failed."); }
  };

  const colCount = columns.length + 1 + (showRev ? 1 : 0) + (showFiles ? 1 : 0) + (canEdit ? 1 : 0);

  return (
    <div className="space-y-3">
      {err && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2 flex items-center justify-between"><span>{err}</span><button onClick={() => setErr("")}><X size={13} /></button></div>}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
              <th className="py-3 px-3 w-8">#</th>
              {columns.map((c) => <th key={c.key} className="py-3 px-3" style={c.width ? { minWidth: c.width } : undefined}>{c.label}</th>)}
              {showRev && <th className="py-3 px-3 w-14">Rev</th>}
              {showFiles && <th className="py-3 px-3 text-center w-24">Files</th>}
              {canEdit && <th className="py-3 px-3 text-right w-12"></th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={colCount} className="text-center text-slate-300 py-8"><Loader2 size={15} className="animate-spin inline" /></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={colCount} className="text-center text-slate-300 py-8">No rows yet.</td></tr>}
            {rows.map((row, i) => (
              <tr key={row._id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 align-top">
                <td className="py-2.5 px-3 text-slate-400">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} className="py-2.5 px-3">
                    {canEdit ? (
                      c.options ? (
                        <input list={`dl-${tableKey}-${c.key}`} defaultValue={row.data?.[c.key] || ""} placeholder={c.placeholder || ""}
                          onBlur={(e) => { if (e.target.value !== (row.data?.[c.key] || "")) patchCell(row._id, c.key, e.target.value); }}
                          className="w-full bg-transparent border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
                      ) : (
                        <input type={c.type === "date" ? "date" : c.type === "number" ? "number" : "text"} defaultValue={row.data?.[c.key] || ""} placeholder={c.placeholder || ""}
                          onBlur={(e) => { if (e.target.value !== (row.data?.[c.key] || "")) patchCell(row._id, c.key, e.target.value); }}
                          className="w-full bg-transparent border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
                      )
                    ) : <span className="text-slate-700">{row.data?.[c.key] || "—"}</span>}
                  </td>
                ))}
                {showRev && (
                  <td className="py-2.5 px-3">
                    {canEdit ? <input type="number" min={0} defaultValue={row.revNo} onBlur={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v !== row.revNo) patchRev(row._id, v); }} className="w-12 bg-transparent border border-slate-200 rounded-lg px-1.5 py-1.5 text-xs text-center" /> : <span>{row.revNo}</span>}
                  </td>
                )}
                {showFiles && (
                  <td className="py-2.5 px-3 text-center">
                    <button onClick={() => setFilesRow(row)} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${row.files.length ? "bg-primary/10 text-primary hover:bg-primary/20" : "bg-slate-50 text-slate-400 hover:bg-slate-100"}`}>
                      {row.files.length ? <><FileText size={11} /> {row.files.length}</> : <><Upload size={11} /> Add</>}
                    </button>
                  </td>
                )}
                {canEdit && <td className="py-2.5 px-3 text-right"><button onClick={() => remove(row._id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-400"><Trash2 size={14} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {columns.filter((c) => c.options).map((c) => (
        <datalist key={c.key} id={`dl-${tableKey}-${c.key}`}>{c.options!.map((o) => <option key={o} value={o} />)}</datalist>
      ))}
      {canEdit && <button disabled={busy} onClick={add} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 disabled:opacity-40"><Plus size={13} /> {addLabel}</button>}

      {filesRow && <RowFilesModal projectId={projectId} row={filesRow} canEdit={canEdit} confirm={confirm} onClose={() => setFilesRow(null)} onChange={replace} />}
      {dialogs}
    </div>
  );
}

function RowFilesModal({ projectId, row, canEdit, confirm, onClose, onChange }: { projectId: string; row: ApiTableRow; canEdit: boolean; confirm: Confirm; onClose: () => void; onChange: (r: ApiTableRow) => void }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = async (fl: FileList | null) => {
    if (!fl || !fl.length) return;
    setUploading(true); setErr("");
    try { let u = row; for (const f of Array.from(fl)) u = await uploadTableRowFile(projectId, row._id, f); onChange(u); }
    catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const remove = async (fid: string, name: string) => {
    if (!(await confirm({ title: "Delete file?", message: `Permanently delete "${name}"?`, confirmLabel: "Delete", danger: true }))) return;
    try { onChange(await deleteTableRowFile(projectId, row._id, fid)); } catch (e) { setErr(e instanceof Error ? e.message : "Delete failed."); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="text-base font-bold text-slate-900">Attached files</h3><button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button></div>
        {err && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2 mb-3">{err}</div>}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {row.files.length === 0 && <p className="text-slate-300 text-sm text-center py-4">No files.</p>}
          {row.files.map((f) => (
            <div key={f._id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2">
              <FileText size={15} className="text-slate-400 shrink-0" />
              <a href={tableRowFileUrl(f)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-slate-700 hover:text-primary truncate flex-1">{f.name}</a>
              <span className="text-[10px] text-slate-400">{f.size}</span>
              <ShareMenu fileName={f.name} fileUrl={tableRowFileUrl(f)} />
              <a href={tableRowFileUrl(f)} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-white text-slate-400" title="Download"><Download size={14} /></a>
              {canEdit && <button onClick={() => remove(f._id, f.name)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-400" title="Delete"><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="mt-4">
            <input ref={inputRef} type="file" multiple onChange={(e) => upload(e.target.files)} className="hidden" />
            <button disabled={uploading} onClick={() => inputRef.current?.click()} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 disabled:opacity-40">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload file(s)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
