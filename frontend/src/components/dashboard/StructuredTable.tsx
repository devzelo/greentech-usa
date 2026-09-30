import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload, FileText, Download, Loader2, X, Pencil, Save } from "lucide-react";
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

export interface TableColumn {
  key: string; label: string; type?: "text" | "date" | "number" | "longtext"; width?: string; placeholder?: string; options?: string[];
  /** Filled in for a new entry, e.g. "Amendment 3" from the count so far. */
  auto?: (count: number) => string;
  /** How a saved row shows this column, when it is more than the stored value (older rows). */
  show?: (data: Record<string, string>) => string;
}

// CR 330 (2026-09-28): an entry is written in a small form and saved with a Save button; saved
// entries are plain rows of a table, opened to read or edit. They used to be open text boxes that
// saved on leaving the field, which read as unsaved text.

export default function StructuredTable({ projectId, tableKey, columns, canEdit, addLabel = "Add row", showRev = true, showFiles = true }: {
  projectId: string; tableKey: string; columns: TableColumn[]; canEdit: boolean; addLabel?: string; showRev?: boolean; showFiles?: boolean;
}) {
  const [rows, setRows] = useState<ApiTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [filesRow, setFilesRow] = useState<ApiTableRow | null>(null);
  const { confirm, dialogs } = useDialogs();
  // The entry being written: a new one (no row) or a saved one opened for editing.
  const [form, setForm] = useState<{ row: ApiTableRow | null; data: Record<string, string>; revNo: number } | null>(null);

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

  const openNew = () => setForm({
    row: null, revNo: 0,
    data: Object.fromEntries(columns.map((c) => [c.key, c.auto ? c.auto(rows.length) : c.type === "date" ? new Date().toISOString().slice(0, 10) : ""])),
  });
  const openRow = (row: ApiTableRow) => setForm({ row, revNo: row.revNo, data: Object.fromEntries(columns.map((c) => [c.key, row.data?.[c.key] || ""])) });
  const saveForm = async () => {
    if (!form) return;
    if (!columns.some((c) => !c.auto && c.type !== "date" && (form.data[c.key] || "").trim())) { setErr("Write the description before saving."); return; }
    setBusy(true); setErr("");
    try {
      if (form.row) replace(await updateTableRow(projectId, form.row._id, { data: form.data, revNo: form.revNo }));
      else { const r = await createTableRow(projectId, tableKey, form.data, form.revNo); setRows((p) => [...p, r]); }
      setForm(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
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
              {canEdit && <th className="py-3 px-3 text-right w-20"></th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={colCount} className="text-center text-slate-300 py-8"><Loader2 size={15} className="animate-spin inline" /></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={colCount} className="text-center text-slate-300 py-8">No rows yet.</td></tr>}
            {rows.map((row, i) => (
              <tr key={row._id} onClick={() => canEdit && openRow(row)} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/50 align-top ${canEdit ? "cursor-pointer" : ""}`} title={canEdit ? "Open to read or edit" : undefined}>
                <td className="py-2.5 px-3 text-slate-400">{i + 1}</td>
                {columns.map((c) => {
                  const v = c.show ? c.show(row.data || {}) : row.data?.[c.key] || "";
                  return <td key={c.key} className={`py-2.5 px-3 text-slate-700 ${c.type === "longtext" ? "whitespace-pre-wrap" : "whitespace-nowrap"} ${c.key === columns[0].key ? "font-bold" : ""}`}>{v || <span className="text-slate-300">-</span>}</td>;
                })}
                {showRev && <td className="py-2.5 px-3 text-slate-600">{row.revNo}</td>}
                {showFiles && (
                  <td className="py-2.5 px-3 text-center">
                    <button onClick={(e) => { e.stopPropagation(); setFilesRow(row); }} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${row.files.length ? "bg-primary/10 text-primary hover:bg-primary/20" : "bg-slate-50 text-slate-400 hover:bg-slate-100"}`}>
                      {row.files.length ? <><FileText size={11} /> {row.files.length}</> : <><Upload size={11} /> Add</>}
                    </button>
                  </td>
                )}
                {canEdit && (
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button onClick={(e) => { e.stopPropagation(); openRow(row); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary" title="Edit"><Pencil size={14} /></button>
                    <button onClick={(e) => { e.stopPropagation(); void remove(row._id); }} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-400" title="Delete"><Trash2 size={14} /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && <button disabled={busy} onClick={openNew} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 disabled:opacity-40"><Plus size={13} /> {addLabel}</button>}

      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
          <div className="my-16 w-full max-w-lg rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h3 className="text-sm font-bold text-slate-900">{form.row ? "Edit entry" : addLabel}</h3>
              <button onClick={() => setForm(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 p-5">
              {columns.map((c) => (
                <label key={c.key} className={`block space-y-1 ${c.type === "longtext" ? "col-span-2" : ""}`}>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{c.label}</span>
                  {c.type === "longtext" ? (
                    <textarea autoFocus rows={4} value={form.data[c.key] || ""} placeholder={c.placeholder || ""} onChange={(e) => setForm({ ...form, data: { ...form.data, [c.key]: e.target.value } })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                  ) : (
                    <input type={c.type === "date" ? "date" : c.type === "number" ? "number" : "text"} value={form.data[c.key] || ""} placeholder={c.placeholder || ""}
                      onChange={(e) => setForm({ ...form, data: { ...form.data, [c.key]: e.target.value } })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                  )}
                </label>
              ))}
              {showRev && (
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Revision</span>
                  <input type="number" min={0} value={form.revNo} onChange={(e) => setForm({ ...form, revNo: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                </label>
              )}
              {!form.row && showFiles && <p className="col-span-2 text-[10px] text-slate-400">Save it first; then attach its files from the row.</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button onClick={() => setForm(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button disabled={busy} onClick={() => void saveForm()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-40">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
              </button>
            </div>
          </div>
        </div>
      )}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
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
