import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Eye, Download, Trash2, Search, Folder, FolderOpen, Upload, Loader2, FileText } from "lucide-react";
import { fetchDocuments, deleteDocument, uploadDocument, documentUrl, type ApiDocument } from "../../../lib/api";
import DocumentViewer from "../DocumentViewer";
import ShareMenu from "../ShareMenu";
import { toast } from "../../../lib/toast";
import { useDialogs } from "../../../lib/useDialogs";

/**
 * CR 241 / 244: the schedule files live with the timeline, not in a separate "Schedules" tab. Each
 * schedule type has its own folder (Master schedule, Design schedule, Construction schedule...)
 * holding Revision 1, 2, 3; everything is searchable by name, folder or revision. Files uploaded
 * to the old Schedules tab show under "Other schedule files".
 */

export const SCHEDULE_SECTION = "pm-schedules";
const LOOSE = "Other schedule files";

export interface ScheduleFilesHandle { reload: () => void }

const ScheduleFiles = forwardRef<ScheduleFilesHandle, { projectId: string; projectName: string; canEdit: boolean; highlight?: string }>(
  function ScheduleFiles({ projectId, projectName, canEdit, highlight }, ref) {
    const { confirm, dialogs } = useDialogs();
    const [docs, setDocs] = useState<ApiDocument[] | null>(null);
    const [q, setQ] = useState("");
    const [open, setOpen] = useState<Set<string>>(new Set());
    const [preview, setPreview] = useState<ApiDocument | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    const load = () => fetchDocuments(projectId, SCHEDULE_SECTION).then(setDocs).catch(() => setDocs([]));
    useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);
    useImperativeHandle(ref, () => ({ reload: () => void load() }));
    // A folder that just received a file opens by itself.
    useEffect(() => { if (highlight) setOpen((s) => new Set(s).add(highlight)); }, [highlight]);

    const folders = useMemo(() => {
      const n = q.trim().toLowerCase();
      const list = (docs || []).filter((d) => !n || `${d.name} ${d.folder || ""}`.toLowerCase().includes(n));
      const map = new Map<string, ApiDocument[]>();
      for (const d of list) {
        const f = (d.folder || "").split("/")[0] || LOOSE;
        if (!map.has(f)) map.set(f, []);
        map.get(f)!.push(d);
      }
      // Master first, the other schedules by name, loose files last; newest revision first inside.
      const names = [...map.keys()].sort((a, b) => (a === "Master schedule" ? -1 : b === "Master schedule" ? 1 : a === LOOSE ? 1 : b === LOOSE ? -1 : a.localeCompare(b)));
      return names.map((name) => ({ name, files: map.get(name)!.slice().sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || "")) }));
    }, [docs, q]);

    const remove = async (d: ApiDocument) => {
      if (!(await confirm({ title: `Delete "${d.name}"?`, message: "The file goes to the recycle bin. The timeline itself is not changed.", confirmLabel: "Delete", danger: true }))) return;
      try { await deleteDocument(projectId, d._id); setDocs((p) => (p || []).filter((x) => x._id !== d._id)); toast("File deleted.", "success"); }
      catch (e) { toast(e instanceof Error ? e.message : "Could not delete.", "error"); }
    };
    const upload = async (file: File) => {
      setUploading(true);
      try { const d = await uploadDocument(projectId, file, SCHEDULE_SECTION); setDocs((p) => [d, ...(p || [])]); setOpen((s) => new Set(s).add(LOOSE)); toast(`${file.name} added to ${LOOSE}.`, "success"); }
      catch (e) { toast(e instanceof Error ? e.message : "Upload failed.", "error"); }
      finally { setUploading(false); }
    };

    const searching = !!q.trim();
    return (
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        {dialogs}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">Schedule files</h3>
            <p className="text-[11px] text-slate-400">Every saved revision as a PDF, one folder per schedule.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-primary/20">
              <Search size={13} className="text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: design, revision 3..." className="w-52 text-xs outline-none" aria-label="Search schedule files" />
            </label>
            {canEdit && (
              <>
                <input ref={fileInput} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
                <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-primary hover:text-primary disabled:opacity-50">
                  {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload a file
                </button>
              </>
            )}
          </div>
        </div>
        <div className="divide-y divide-slate-50">
          {docs === null && <p className="flex items-center gap-2 px-4 py-5 text-xs text-slate-400"><Loader2 size={13} className="animate-spin" /> Loading...</p>}
          {docs !== null && folders.length === 0 && (
            <p className="px-4 py-6 text-center text-xs italic text-slate-400">{searching ? "Nothing matches." : "No schedule files yet. Saving a revision files it here."}</p>
          )}
          {folders.map((f) => {
            const isOpen = searching || open.has(f.name);
            return (
              <div key={f.name}>
                <button type="button" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(f.name)) n.delete(f.name); else n.add(f.name); return n; })} className={`flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50 ${highlight === f.name ? "bg-emerald-50/60" : ""}`}>
                  {isOpen ? <FolderOpen size={15} className="text-amber-500" /> : <Folder size={15} className="text-amber-500" />}
                  <span className="text-xs font-bold text-slate-800">{f.name}</span>
                  <span className="text-[10px] font-bold text-slate-400">{f.files.length} file{f.files.length === 1 ? "" : "s"}</span>
                </button>
                {isOpen && (
                  <ul className="pb-2">
                    {f.files.map((d) => (
                      <li key={d._id} className="flex items-center gap-2 py-1.5 pl-10 pr-4 hover:bg-slate-50/60">
                        <FileText size={13} className="shrink-0 text-slate-300" />
                        <button type="button" onClick={() => setPreview(d)} className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-slate-700 hover:text-primary">{d.name}</button>
                        <span className="shrink-0 text-[10px] text-slate-400">{d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString(undefined, { dateStyle: "medium" }) : ""}</span>
                        <button type="button" onClick={() => setPreview(d)} title="Preview" className="rounded p-1 text-slate-400 hover:text-primary"><Eye size={13} /></button>
                        <a href={documentUrl(d)} download={d.name} title="Download" className="rounded p-1 text-slate-400 hover:text-primary"><Download size={13} /></a>
                        <ShareMenu fileName={d.name} fileUrl={documentUrl(d)} projectName={projectName} size={13} />
                        {canEdit && <button type="button" onClick={() => void remove(d)} title="Delete" className="rounded p-1 text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <DocumentViewer doc={preview ? { name: preview.name, url: documentUrl(preview), fileType: preview.fileType } : null} onClose={() => setPreview(null)} />
      </div>
    );
  },
);

export default ScheduleFiles;
