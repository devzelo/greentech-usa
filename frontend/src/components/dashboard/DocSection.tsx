import { useEffect, useState, type ChangeEvent } from "react";
import { Upload, FileText, Eye, Download, X, Loader2, Globe, Archive, RotateCcw } from "lucide-react";
import {
  fetchDocuments,
  uploadDocument,
  deleteDocument,
  setDocumentPublic,
  updateDocumentDescription,
  setDocumentArchived,
  documentUrl,
  ApiDocument,
} from "../../lib/api";
import DocumentViewer from "./DocumentViewer";
import ShareMenu from "./ShareMenu";
import { toast } from "../../lib/toast";
import { AnimatePresence } from "motion/react";

interface Props {
  projectId: string;
  section: string;
  title: string;
  canEdit: boolean;
  canPublish?: boolean; // owner-only: mark files as public on the showcase
  key?: string | number;
}

/**
 * Per-section file area used inside the project workspace tabs.
 * Lists existing uploads, lets the user preview/download/delete each one,
 * and (when editable) accepts a new upload via the dashed Upload Zone.
 */
export default function DocSection({ projectId, section, title, canEdit, canPublish }: Props) {
  const [docs, setDocs] = useState<ApiDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ApiDocument | null>(null);
  // Description editing happens in a small popup with an explicit Save (client request, v2) —
  // rather than saving silently on blur.
  const [descEdit, setDescEdit] = useState<{ doc: ApiDocument; value: string } | null>(null);
  const [descSaving, setDescSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false); // CR-P-10

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await fetchDocuments(projectId, section, showArchived);
      setDocs(list);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [projectId, section, showArchived]);

  const archiveDoc = async (d: ApiDocument, next: boolean) => {
    try { await setDocumentArchived(projectId, d._id, next); setDocs((p) => p.filter((x) => x._id !== d._id)); toast(next ? "File archived." : "File restored.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await uploadDocument(projectId, file, section);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Delete this file?")) return;
    try {
      await deleteDocument(projectId, docId);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  // Per-file description (J3) — RFPs arrive as several files (Appendix A, B, C…) so each needs a label.
  const saveDescription = async (did: string, description: string) => {
    setDescSaving(true);
    try {
      await updateDocumentDescription(projectId, did, description);
      setDocs((prev) => prev.map((x) => (x._id === did ? { ...x, description } : x)));
      setDescEdit(null);
      toast(description ? "Description saved." : "Description removed.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save the description.", "error");
    } finally { setDescSaving(false); }
  };

  const togglePublic = async (d: ApiDocument) => {
    try {
      const updated = await setDocumentPublic(projectId, d._id, !d.public);
      setDocs((prev) => prev.map((x) => (x._id === d._id ? { ...x, public: updated.public } : x)));
      toast(updated.public ? "Now visible on the public showcase." : "Removed from the public showcase.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update visibility.", "error");
    }
  };

  return (
    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-sm font-bold text-slate-700 uppercase tracking-widest">
          {title}{docs.length > 0 && <span className="text-slate-400 ml-2 font-medium normal-case tracking-normal">({docs.length})</span>}
        </h4>
        <div className="flex items-center gap-1.5">
          {canEdit && <button onClick={() => setShowArchived((v) => !v)} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${showArchived ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-200 hover:text-slate-900"}`}><Archive size={11} /> {showArchived ? "Active" : "Archived"}</button>}
          {/* CR-P-09/10 — download every file in this category/section at once. */}
          {docs.length > 1 && !showArchived && (
            <button onClick={() => docs.forEach((d, i) => setTimeout(() => { const a = document.createElement("a"); a.href = documentUrl(d); a.download = d.name; document.body.appendChild(a); a.click(); a.remove(); }, i * 350))} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-primary hover:text-white transition-colors" title="Download all files in this section">
              <Download size={12} /> Download all
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {loading && (
          <div className="flex items-center gap-2 text-slate-300 text-xs"><Loader2 size={12} className="animate-spin" /> Loading…</div>
        )}

        {!loading && docs.map((d) => (
          <div key={d._id} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 p-3 bg-slate-50 rounded-xl group">
            <div className="flex items-start gap-3 flex-grow min-w-0">
              <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-primary flex-shrink-0 border border-slate-100 mt-0.5">
                <FileText size={15} />
              </div>
              <div className="flex-grow min-w-0">
                <button onClick={() => setPreview(d)} className="block text-left w-full" title="Preview">
                  <p className="text-sm font-bold text-slate-900 truncate hover:text-primary transition-colors">{d.name}</p>
                  <p className="text-[10px] text-slate-400 font-medium">{d.size} · {new Date(d.uploadedAt).toLocaleDateString()}</p>
                </button>
                {/* CR-P-07 — description is hidden by default (kept the clean look the client
                    wanted) but still available: it shows when set, and a subtle "+ note"
                    opt-in appears on hover so RFP files can still be labelled (Appendix A/B/C). */}
                {canEdit ? (
                  d.description ? (
                    <button onClick={() => setDescEdit({ doc: d, value: d.description || "" })} className="mt-1 text-left text-[11px] font-medium italic text-slate-500 hover:text-primary py-0.5 transition-colors">{d.description}</button>
                  ) : (
                    <button onClick={() => setDescEdit({ doc: d, value: "" })} className="mt-0.5 text-left text-[10px] font-semibold text-slate-300 hover:text-primary py-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">+ note</button>
                  )
                ) : d.description ? (
                  <p className="mt-0.5 text-[11px] text-slate-500 font-medium italic">{d.description}</p>
                ) : null}
              </div>
            </div>
            {/* Actions — full opacity + own right-aligned row on mobile (no hover on touch). */}
            <div className="flex gap-1 shrink-0 justify-end opacity-100 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
              <button onClick={() => setPreview(d)} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-primary" title="Preview"><Eye size={13} /></button>
              <a href={documentUrl(d)} download={d.name} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-primary" title="Download"><Download size={13} /></a>
              <ShareMenu fileName={d.name} fileUrl={documentUrl(d)} size={13} />
              {canPublish && (
                <button
                  onClick={() => togglePublic(d)}
                  className={`p-1.5 rounded-lg hover:bg-white ${d.public ? "text-emerald-500" : "text-slate-400 hover:text-primary"}`}
                  title={d.public ? "Public — shown on the showcase. Click to unpublish." : "Make public (show on website showcase)"}
                >
                  <Globe size={13} />
                </button>
              )}
              {canEdit && (
                <button onClick={() => archiveDoc(d, !showArchived)} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-amber-600" title={showArchived ? "Restore" : "Archive"}>{showArchived ? <RotateCcw size={13} /> : <Archive size={13} />}</button>
              )}
              {canEdit && (
                <button onClick={() => handleDelete(d._id)} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-red-500" title="Delete"><X size={13} /></button>
              )}
            </div>
          </div>
        ))}

        {canEdit && (
          <label className="border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group">
            {uploading ? (
              <>
                <Loader2 size={22} className="text-primary animate-spin mb-2" />
                <p className="text-xs font-bold text-primary">Uploading…</p>
              </>
            ) : (
              <>
                <Upload size={22} className="text-slate-300 group-hover:text-primary transition-colors mb-2" />
                <p className="text-xs font-bold text-slate-400 group-hover:text-primary transition-colors">Upload {title}</p>
              </>
            )}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        )}
      </div>

      <AnimatePresence>
        {preview && (
          <DocumentViewer
            doc={{ name: preview.name, url: documentUrl(preview), fileType: preview.fileType || (preview.name.split(".").pop() || "") }}
            onClose={() => setPreview(null)}
          />
        )}
      </AnimatePresence>

      {/* Description popup — explicit Save / Remove (client request, v2). */}
      {descEdit && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => setDescEdit(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">Description</h3>
                <p className="text-[11px] text-slate-400 truncate">{descEdit.doc.name}</p>
              </div>
              <button onClick={() => setDescEdit(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0"><X size={18} /></button>
            </div>
            <textarea
              autoFocus
              value={descEdit.value}
              onChange={(e) => setDescEdit({ ...descEdit, value: e.target.value })}
              rows={4}
              placeholder="Add a description (e.g. Appendix A)…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/10"
            />
            <div className="flex items-center justify-between gap-2 mt-4">
              {descEdit.doc.description ? (
                <button onClick={() => saveDescription(descEdit.doc._id, "")} disabled={descSaving} className="px-3 py-2 rounded-xl text-red-500 hover:bg-red-50 text-xs font-bold disabled:opacity-50">Remove</button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button onClick={() => setDescEdit(null)} disabled={descSaving} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold disabled:opacity-50">Cancel</button>
                <button onClick={() => saveDescription(descEdit.doc._id, descEdit.value.trim())} disabled={descSaving} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{descSaving && <Loader2 size={13} className="animate-spin" />} Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
