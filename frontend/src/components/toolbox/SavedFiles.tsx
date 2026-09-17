import { useEffect, useState } from "react";
import { Download, ExternalLink, FileImage, FileText, FolderPlus, Loader2, Pencil, Trash2 } from "lucide-react";
import { deleteToolboxFile, fetchToolboxFiles, userFileUrl, type UserFile } from "../../lib/api";
import { toast } from "../../lib/toast";
import { AttachDialog, downloadBlob } from "./ExportActions";
import ShareMenu from "../dashboard/ShareMenu";

// Files saved from the toolbox (snips, edited images, PDFs, text): open, edit, download, attach
// to a project, share or delete.

async function fetchFile(f: UserFile): Promise<File> {
  const res = await fetch(userFileUrl(f));
  if (!res.ok) throw new Error("Could not load the file.");
  const blob = await res.blob();
  return new File([blob], f.name, { type: blob.type });
}

export default function SavedFiles({ onEdit }: { onEdit: (f: File) => void }) {
  const [files, setFiles] = useState<UserFile[] | null>(null);
  const [attach, setAttach] = useState<UserFile | null>(null);
  const [confirmId, setConfirmId] = useState("");

  useEffect(() => { fetchToolboxFiles().then(setFiles).catch(() => setFiles([])); }, []);

  const remove = async (f: UserFile) => {
    try { await deleteToolboxFile(f._id); setFiles((p) => p && p.filter((x) => x._id !== f._id)); toast("File deleted.", "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not delete the file.", "error"); }
    finally { setConfirmId(""); }
  };
  const run = (fn: () => Promise<void>) => fn().catch((e) => toast(e instanceof Error ? e.message : "Something went wrong.", "error"));

  if (!files) return <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-slate-400" /></div>;
  if (!files.length) return <p className="py-6 text-center text-xs text-slate-400">Nothing saved yet. Use Save in any tool and it appears here.</p>;

  const icon = "rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-primary";
  return (
    <>
      <ul className="max-h-[26rem] space-y-1.5 overflow-y-auto pr-1">
        {files.map((f) => {
          const isImg = /^(png|jpe?g|webp|gif)$/i.test(f.fileType);
          return (
            <li key={f._id} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
              <div className="flex items-center gap-2">
                {isImg ? <FileImage size={16} className="shrink-0 text-primary" /> : <FileText size={16} className="shrink-0 text-slate-400" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-800" title={f.name}>{f.name}</p>
                  <p className="text-[10px] text-slate-400">{f.size}{f.createdAt ? ` · ${new Date(f.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : ""}</p>
                </div>
              </div>
              {confirmId === f._id ? (
                <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] font-bold">
                  <span className="text-red-600">Delete this file?</span>
                  <button type="button" onClick={() => setConfirmId("")} className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100">Cancel</button>
                  <button type="button" onClick={() => void remove(f)} className="rounded bg-red-600 px-1.5 py-0.5 text-white hover:bg-red-700">Delete</button>
                </div>
              ) : (
                <div className="mt-1 flex items-center justify-end gap-0.5">
                  <a href={userFileUrl(f)} target="_blank" rel="noreferrer" title="Open" className={icon}><ExternalLink size={13} /></a>
                  {isImg && <button type="button" title="Edit" onClick={() => run(async () => onEdit(await fetchFile(f)))} className={icon}><Pencil size={13} /></button>}
                  <button type="button" title="Download" onClick={() => run(async () => { const file = await fetchFile(f); downloadBlob(file, f.name); })} className={icon}><Download size={13} /></button>
                  <button type="button" title="Attach to project" onClick={() => setAttach(f)} className={icon}><FolderPlus size={13} /></button>
                  <ShareMenu fileName={f.name} fileUrl={userFileUrl(f)} size={13} />
                  <button type="button" title="Delete" onClick={() => setConfirmId(f._id)} className={`${icon} hover:!text-red-600`}><Trash2 size={13} /></button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {attach && <AttachDialog getFile={() => fetchFile(attach)} onClose={() => setAttach(null)} />}
    </>
  );
}
