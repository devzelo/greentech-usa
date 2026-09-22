import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Upload, FileText, Eye, Download, X, Loader2, Globe, Archive, RotateCcw, Plus, Folder, FolderOpen, FolderPlus, FolderUp, ChevronRight, Trash2 } from "lucide-react";
import {
  fetchDocuments,
  fetchDocFolders,
  saveDocFolder,
  deleteDocFolder,
  uploadDocument,
  deleteDocument,
  setDocumentPublic,
  updateDocumentDescription,
  setDocumentArchived,
  documentUrl,
  ApiDocument,
  type ApiDocFolder,
} from "../../lib/api";
import DocumentViewer from "./DocumentViewer";
import ShareMenu from "./ShareMenu";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import { AnimatePresence } from "motion/react";

interface Props {
  projectId: string;
  section: string;
  title: string;
  canEdit: boolean;
  canPublish?: boolean; // owner-only: mark files as public on the showcase
  key?: string | number;
}

const parentOf = (p: string) => p.split("/").slice(0, -1).join("/");
const leafOf = (p: string) => p.split("/").pop() || p;
const join = (a: string, b: string) => [a, b].filter(Boolean).join("/");
const inFolder = (d: ApiDocument, p: string) => { const f = d.folder || ""; return f === p || f.startsWith(`${p}/`); };
const downloadAll = (list: ApiDocument[]) => list.forEach((d, i) => setTimeout(() => { const a = document.createElement("a"); a.href = documentUrl(d, true); a.download = d.name; document.body.appendChild(a); a.click(); a.remove(); }, i * 350));

// The folder picker attribute (Chrome, Edge, Firefox, Safari); not in React's typings.
const FOLDER_INPUT = { webkitdirectory: "", directory: "" } as Record<string, string>;

/**
 * Per-section file area used inside the project workspace tabs.
 * Lists existing uploads, lets the user preview/download/delete each one,
 * and (when editable) accepts new uploads.
 *
 * CR-P (131) — folders: upload a whole folder (its subfolders are kept), or create one and upload
 * into it. Folders show as folders (name, description, how many files); open one to see its files
 * with the same actions, and go back with the path at the top.
 */
export default function DocSection({ projectId, section, title, canEdit, canPublish }: Props) {
  const { confirm, prompt, dialogs } = useDialogs();
  const [docs, setDocs] = useState<ApiDocument[]>([]);
  const [folders, setFolders] = useState<ApiDocFolder[]>([]);
  const [cwd, setCwd] = useState("");                 // the open folder ("" = top level)
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [preview, setPreview] = useState<ApiDocument | null>(null);
  // Description editing happens in a small popup with an explicit Save (client request, v2) —
  // rather than saving silently on blur. Used for files and (CR-P 131) folders.
  const [descEdit, setDescEdit] = useState<{ doc?: ApiDocument; folder?: string; value: string; had: boolean } | null>(null);
  const [descSaving, setDescSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false); // CR-P-10
  const folderInput = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [list, fl] = await Promise.all([
        fetchDocuments(projectId, section, showArchived),
        fetchDocFolders(projectId, section).catch(() => [] as ApiDocFolder[]),
      ]);
      setDocs(list);
      setFolders(fl);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [projectId, section, showArchived]);

  // Every folder: the saved ones, the ones files sit in, and all their parents.
  const allFolders = useMemo(() => {
    const set = new Set<string>();
    const add = (p: string) => { let x = p; while (x) { set.add(x); x = parentOf(x); } };
    folders.forEach((f) => add(f.path));
    docs.forEach((d) => d.folder && add(d.folder));
    return set;
  }, [folders, docs]);
  const folderDesc = (p: string) => folders.find((f) => f.path === p)?.description || "";

  // The archived view is a flat list (with each file's folder shown), not a folder tree.
  const here = showArchived ? "" : cwd;
  const subfolders = showArchived ? [] : [...allFolders].filter((p) => parentOf(p) === here).sort((a, b) => a.localeCompare(b));
  const filesHere = showArchived ? docs : docs.filter((d) => (d.folder || "") === here);
  const total = docs.length;

  const archiveDoc = async (d: ApiDocument, next: boolean) => {
    try { await setDocumentArchived(projectId, d._id, next); setDocs((p) => p.filter((x) => x._id !== d._id)); toast(next ? "File archived." : "File restored.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
  };

  // Several files at once; one file opens its description popup right away (CR-P 130).
  const uploadFiles = async (files: File[], folderOf: (f: File) => string) => {
    if (!files.length) return;
    setUploading({ done: 0, total: files.length });
    let last: ApiDocument | null = null;
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      try { last = await uploadDocument(projectId, files[i], section, false, folderOf(files[i])); }
      catch { failed++; }
      setUploading({ done: i + 1, total: files.length });
    }
    setUploading(null);
    await refresh();
    if (failed) toast(`${failed} of ${files.length} file${files.length === 1 ? "" : "s"} could not be uploaded.`, "error");
    else if (files.length > 1) toast(`${files.length} files uploaded.`, "success");
    if (files.length === 1 && last && !failed) setDescEdit({ doc: last, value: "", had: false });
  };

  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    e.target.value = "";
    uploadFiles(files, () => here);
  };

  // A whole folder: each file keeps its place (webkitRelativePath is "Top/Sub/file.pdf").
  const handleFolderUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = (Array.from(e.target.files || []) as File[]).filter((f) => !/^\./.test(f.name));   // skip .DS_Store etc.
    e.target.value = "";
    uploadFiles(files, (f) => join(here, parentOf(f.webkitRelativePath || "")));
  };

  const newFolder = async () => {
    const name = await prompt({ title: "New folder", label: "Folder name", placeholder: "e.g. Drawings and Specs", confirmLabel: "Create" });
    if (!name || !name.trim()) return;
    try { await saveDocFolder(projectId, section, join(here, name.trim().replace(/[\\/]+/g, " "))); await refresh(); toast(`Folder "${name.trim()}" created.`, "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not create the folder.", "error"); }
  };

  const removeFolder = async (p: string) => {
    const n = docs.filter((d) => inFolder(d, p)).length;
    if (!(await confirm({ title: "Delete folder?", message: `Delete "${leafOf(p)}"${n ? ` and the ${n} file${n === 1 ? "" : "s"} in it (they go to the Recycle Bin)` : ""}?`, confirmLabel: "Delete", danger: true }))) return;
    try { await deleteDocFolder(projectId, section, p); if (cwd === p || cwd.startsWith(`${p}/`)) setCwd(parentOf(p)); await refresh(); toast("Folder deleted.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not delete the folder.", "error"); }
  };

  const handleDelete = async (docId: string) => {
    if (!(await confirm({ title: "Delete file?", message: "Delete this file? It goes to the Recycle Bin.", confirmLabel: "Delete", danger: true }))) return;
    try {
      await deleteDocument(projectId, docId);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    }
  };

  // Per-file description (J3) — RFPs arrive as several files (Appendix A, B, C…) so each needs a label.
  const saveDescription = async (description: string) => {
    if (!descEdit) return;
    setDescSaving(true);
    try {
      if (descEdit.doc) {
        const did = descEdit.doc._id;
        await updateDocumentDescription(projectId, did, description);
        setDocs((prev) => prev.map((x) => (x._id === did ? { ...x, description } : x)));
      } else if (descEdit.folder) {
        await saveDocFolder(projectId, section, descEdit.folder, description);
        setFolders(await fetchDocFolders(projectId, section));
      }
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

  const viewList = here ? docs.filter((d) => inFolder(d, here)) : docs;

  return (
    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h4 className="text-sm font-bold text-slate-700 uppercase tracking-widest min-w-0">
          {title}{total > 0 && <span className="text-slate-400 ml-2 font-medium normal-case tracking-normal">({total})</span>}
        </h4>
        <div className="flex items-center gap-1.5 shrink-0">
          {canEdit && <button onClick={() => { setShowArchived((v) => !v); setCwd(""); }} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${showArchived ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-200 hover:text-slate-900"}`}><Archive size={11} /> {showArchived ? "Active" : "Archived"}</button>}
          {/* CR-P-09/10 — download every file in this category/section (or the open folder) at once. */}
          {viewList.length > 1 && !showArchived && (
            <button onClick={() => downloadAll(viewList)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-primary hover:text-white transition-colors" title={here ? "Download all files in this folder" : "Download all files in this section"}>
              <Download size={12} /> Download all
            </button>
          )}
        </div>
      </div>

      {/* The path to the open folder; click a part to go back up. */}
      {here && (
        <nav className="flex flex-wrap items-center gap-1 mb-3 text-xs font-bold">
          <button onClick={() => setCwd("")} className="text-slate-500 hover:text-primary">{title}</button>
          {here.split("/").map((part, i, arr) => {
            const p = arr.slice(0, i + 1).join("/");
            return (
              <span key={p} className="inline-flex items-center gap-1">
                <ChevronRight size={12} className="text-slate-300" />
                {i === arr.length - 1
                  ? <span className="text-slate-800 inline-flex items-center gap-1"><FolderOpen size={13} className="text-amber-500" /> {part}</span>
                  : <button onClick={() => setCwd(p)} className="text-slate-500 hover:text-primary">{part}</button>}
              </span>
            );
          })}
        </nav>
      )}

      <div className="space-y-2">
        {loading && (
          <div className="flex items-center gap-2 text-slate-300 text-xs"><Loader2 size={12} className="animate-spin" /> Loading…</div>
        )}

        {/* Folders first, like a file explorer. Click (or double-click) to open. */}
        {!loading && subfolders.map((p) => {
          const count = docs.filter((d) => inFolder(d, p)).length;
          const desc = folderDesc(p);
          return (
            <div key={p} onDoubleClick={() => setCwd(p)} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 p-3 bg-amber-50/40 border border-amber-100/70 rounded-xl group">
              <div className="flex items-start gap-3 flex-grow min-w-0">
                <button onClick={() => setCwd(p)} className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-amber-500 flex-shrink-0 border border-amber-100 mt-0.5" title="Open folder">
                  <Folder size={16} fill="currentColor" fillOpacity={0.15} />
                </button>
                <div className="flex-grow min-w-0">
                  <button onClick={() => setCwd(p)} className="block text-left w-full" title="Open folder">
                    <p className="text-sm font-bold text-slate-900 truncate hover:text-primary transition-colors">{leafOf(p)}</p>
                    <p className="text-[10px] text-slate-400 font-medium">Folder · {count} file{count === 1 ? "" : "s"}</p>
                  </button>
                  {desc ? (
                    canEdit
                      ? <button onClick={() => setDescEdit({ folder: p, value: desc, had: true })} className="mt-1 text-left text-xs font-medium text-slate-600 hover:text-primary py-0.5" title="Edit description">{desc}</button>
                      : <p className="mt-0.5 text-xs text-slate-600 font-medium">{desc}</p>
                  ) : canEdit ? (
                    <button onClick={() => setDescEdit({ folder: p, value: "", had: false })} className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-primary py-0.5"><Plus size={11} /> Add description</button>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-1 shrink-0 justify-end opacity-100 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
                <button onClick={() => setCwd(p)} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-primary" title="Open"><FolderOpen size={13} /></button>
                {count > 0 && <button onClick={() => downloadAll(docs.filter((d) => inFolder(d, p)))} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-primary" title="Download all files in this folder"><Download size={13} /></button>}
                {canEdit && <button onClick={() => removeFolder(p)} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-red-500" title="Delete folder"><Trash2 size={13} /></button>}
              </div>
            </div>
          );
        })}

        {!loading && filesHere.map((d) => (
          <div key={d._id} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 p-3 bg-slate-50 rounded-xl group">
            <div className="flex items-start gap-3 flex-grow min-w-0">
              <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-primary flex-shrink-0 border border-slate-100 mt-0.5">
                <FileText size={15} />
              </div>
              <div className="flex-grow min-w-0">
                <button onClick={() => setPreview(d)} className="block text-left w-full" title="Preview">
                  <p className="text-sm font-bold text-slate-900 truncate hover:text-primary transition-colors">{d.name}</p>
                  <p className="text-[10px] text-slate-400 font-medium">{d.size} · {new Date(d.uploadedAt).toLocaleDateString()}{showArchived && d.folder ? ` · ${d.folder}` : ""}</p>
                </button>
                {/* CR-P (130) — every file carries a description of what it is (e.g. which appendix),
                    added in a popup with Save and shown under the file name. (CR-P-07 had removed
                    the "Add description" line; the client now wants it back.) */}
                {d.description ? (
                  canEdit ? (
                    <button onClick={() => setDescEdit({ doc: d, value: d.description || "", had: true })} className="mt-1 text-left text-xs font-medium text-slate-600 hover:text-primary py-0.5 transition-colors" title="Edit description">{d.description}</button>
                  ) : (
                    <p className="mt-0.5 text-xs text-slate-600 font-medium">{d.description}</p>
                  )
                ) : canEdit && !showArchived ? (
                  <button onClick={() => setDescEdit({ doc: d, value: "", had: false })} className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-primary py-0.5 transition-colors">
                    <Plus size={11} /> Add description
                  </button>
                ) : null}
              </div>
            </div>
            {/* Actions — full opacity + own right-aligned row on mobile (no hover on touch). */}
            <div className="flex gap-1 shrink-0 justify-end opacity-100 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
              <button onClick={() => setPreview(d)} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-primary" title="Preview"><Eye size={13} /></button>
              <a href={documentUrl(d, true)} download={d.name} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-primary" title="Download"><Download size={13} /></a>
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

        {!loading && here && subfolders.length === 0 && filesHere.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-3">This folder is empty.</p>
        )}

        {canEdit && !showArchived && (
          /* CR-P-08 — a prominent, solid-green upload button (not a faint dashed zone) so it's easy to find. */
          <div className="border-2 border-dashed border-emerald-200 bg-emerald-50/40 rounded-2xl p-5 flex flex-col items-center justify-center text-center gap-3">
            {uploading ? (
              <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold shadow-sm">
                <Loader2 size={18} className="animate-spin" /> {uploading.total > 1 ? `Uploading ${uploading.done} of ${uploading.total}…` : "Uploading…"}
              </span>
            ) : (
              <>
                <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold shadow-sm hover:bg-emerald-600 transition-colors cursor-pointer">
                  <Upload size={18} /> Upload {here ? `into ${leafOf(here)}` : title}
                  <input type="file" multiple className="hidden" onChange={handleUpload} />
                </label>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button onClick={() => folderInput.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-700 text-xs font-bold hover:bg-emerald-50" title="Upload a whole folder, with its subfolders">
                    <FolderUp size={14} /> Upload folder
                  </button>
                  <button onClick={newFolder} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50">
                    <FolderPlus size={14} /> New folder
                  </button>
                </div>
                <input ref={folderInput} type="file" multiple className="hidden" onChange={handleFolderUpload} {...FOLDER_INPUT} />
              </>
            )}
          </div>
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">{descEdit.folder ? "Folder description" : "Description"}</h3>
                <p className="text-[11px] text-slate-400 truncate">{descEdit.doc ? descEdit.doc.name : descEdit.folder}</p>
              </div>
              <button onClick={() => setDescEdit(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0"><X size={18} /></button>
            </div>
            <textarea
              autoFocus
              value={descEdit.value}
              onChange={(e) => setDescEdit({ ...descEdit, value: e.target.value })}
              rows={4}
              placeholder={descEdit.folder ? "What is in this folder? e.g. Drawings and specifications from the RFP" : "What is this file? e.g. Appendix A: geotechnical report"}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/10"
            />
            <div className="flex items-center justify-between gap-2 mt-4">
              {descEdit.had ? (
                <button onClick={() => saveDescription("")} disabled={descSaving} className="px-3 py-2 rounded-xl text-red-500 hover:bg-red-50 text-xs font-bold disabled:opacity-50">Remove</button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button onClick={() => setDescEdit(null)} disabled={descSaving} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold disabled:opacity-50">{descEdit.had ? "Cancel" : "Later"}</button>
                <button onClick={() => saveDescription(descEdit.value.trim())} disabled={descSaving} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{descSaving && <Loader2 size={13} className="animate-spin" />} Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {dialogs}
    </div>
  );
}
