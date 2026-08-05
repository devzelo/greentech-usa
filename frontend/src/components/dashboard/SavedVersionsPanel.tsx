import { useEffect, useState } from "react";
import { Plus, Eye, Printer, Download, Trash2, Lock, CheckCircle2, Clock, History } from "lucide-react";
import { attachmentUrl, type ApiSavedDocument } from "../../lib/api";

// One way to produce the current document (e.g. "PDF" or "Excel").
export interface SaveFormat {
  label: string;                 // shown on the save button
  ext: string;                   // file extension, e.g. "pdf" | "xlsx" | "csv"
  baseName: string;              // file name without extension
  build: () => Promise<Blob>;    // generate the file bytes
}

export interface SavedVersionsPanelProps {
  heading?: string;
  subtitle?: string;
  canEdit: boolean;
  formats: SaveFormat[];
  fetchList: () => Promise<ApiSavedDocument[]>;
  saveVersion: (file: Blob, fileName: string, meta: { title?: string; status: "draft" | "final" }) => Promise<ApiSavedDocument>;
  update: (id: string, body: { status?: "draft" | "final" }) => Promise<ApiSavedDocument>;
  remove: (id: string) => Promise<void>;
  toast?: (msg: string, type?: string) => void;
}

async function downloadFile(url: string, name: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function printFile(url: string) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  frame.src = url;
  frame.onload = () => {
    try { frame.contentWindow?.focus(); frame.contentWindow?.print(); }
    catch { window.open(url, "_blank"); }
  };
  document.body.appendChild(frame);
}

export default function SavedVersionsPanel(props: SavedVersionsPanelProps) {
  const { heading = "Saved Versions", subtitle, canEdit, formats, fetchList, saveVersion, update, remove, toast } = props;
  const [list, setList] = useState<ApiSavedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isFinal, setIsFinal] = useState(false);
  const [busy, setBusy] = useState(false);

  const notify = (m: string, t?: string) => { if (toast) toast(m, t); };

  useEffect(() => {
    let alive = true;
    fetchList().then((d) => { if (alive) setList(d); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (fmt: SaveFormat) => {
    setBusy(true);
    try {
      const blob = await fmt.build();
      const safe = fmt.baseName.replace(/[^a-z0-9._-]+/gi, "_");
      const doc = await saveVersion(blob, `${safe}.${fmt.ext}`, { title: title.trim() || undefined, status: isFinal ? "final" : "draft" });
      setList((p) => [doc, ...p]);
      setTitle(""); setIsFinal(false); setOpen(false);
      notify(`Saved ${doc.title} (v${doc.version}).`, "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not save this version.", "error");
    } finally { setBusy(false); }
  };

  const toggleFinal = async (d: ApiSavedDocument) => {
    try {
      const next = d.status === "final" ? "draft" : "final";
      const upd = await update(d._id, { status: next });
      setList((p) => p.map((x) => (x._id === d._id ? upd : x)));
    } catch (err) { notify(err instanceof Error ? err.message : "Failed", "error"); }
  };

  const del = async (d: ApiSavedDocument) => {
    if (!confirm(`Delete "${d.title}" (v${d.version})? This removes the stored file.`)) return;
    try { await remove(d._id); setList((p) => p.filter((x) => x._id !== d._id)); }
    catch (err) { notify(err instanceof Error ? err.message : "Failed", "error"); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <History size={16} className="text-primary" />
          <h4 className="text-sm font-display font-bold text-slate-900">{heading}</h4>
          <span className="text-[10px] font-bold text-slate-400">({list.length})</span>
        </div>
        {canEdit && (
          <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[11px] font-bold hover:bg-primary">
            <Plus size={12} /> Save Version
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-400 mb-3">{subtitle || "Frozen copies you can preview, print, or download anytime."}</p>

      {open && canEdit && (
        <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Label (optional, e.g. 'First draft' or 'Sent to client')"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
          />
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} className="accent-emerald-600" />
            Mark as final (the copy sent to the client)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {formats.map((f) => (
              <button key={f.label} disabled={busy} onClick={() => handleSave(f)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold hover:opacity-90 disabled:opacity-50">
                <Plus size={12} /> {busy ? "Saving…" : `Save as ${f.label}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-[11px] text-slate-400 italic py-3">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic py-3">No saved versions yet.</p>
      ) : (
        <div className="space-y-1.5">
          {list.map((d) => {
            const url = attachmentUrl(d.filePath);
            const when = (() => { try { return new Date(d.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return ""; } })();
            return (
              <div key={d._id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2 rounded-xl border border-slate-100 hover:bg-slate-50/60">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="shrink-0 inline-flex items-center justify-center w-9 h-7 rounded-lg bg-slate-100 text-[11px] font-extrabold text-slate-600">v{d.version}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 truncate" title={d.title}>{d.title}</span>
                    {d.status === "final" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-bold uppercase tracking-wide"><CheckCircle2 size={9} /> Final</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-bold uppercase tracking-wide"><Clock size={9} /> Draft</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">{d.fileType.toUpperCase()} · {d.size} · {d.createdByName || "—"} · {when}</p>
                </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 justify-end">
                  <button onClick={() => window.open(url, "_blank")} title="Preview" className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-white"><Eye size={14} /></button>
                  <button onClick={() => printFile(url)} title="Print" className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-white"><Printer size={14} /></button>
                  <button onClick={() => downloadFile(url, d.fileName)} title="Download" className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-white"><Download size={14} /></button>
                  {canEdit && (
                    <button onClick={() => toggleFinal(d)} title={d.status === "final" ? "Mark as draft" : "Mark as final"} className={`p-1.5 rounded-lg hover:bg-white ${d.status === "final" ? "text-emerald-500" : "text-slate-300 hover:text-emerald-500"}`}><Lock size={14} /></button>
                  )}
                  {canEdit && (
                    <button onClick={() => del(d)} title="Delete" className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-white"><Trash2 size={14} /></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
