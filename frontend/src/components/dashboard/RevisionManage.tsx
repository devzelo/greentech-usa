import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Eye, Loader2 } from "lucide-react";
import { attachmentUrl, type ApiSavedDocument, type SavedDocStatus } from "../../lib/api";

// CR-P (86) - "Manage" on a proposal revision. The file itself is frozen (it is the record of what
// was produced), so managing a revision means its title, notes and status.

interface Props {
  doc: ApiSavedDocument;
  statuses: Record<string, { label: string }>;
  /** Throws on failure, so the window stays open with the edits intact. */
  onSave: (body: { title: string; note: string; status: SavedDocStatus }) => Promise<void>;
  onClose: () => void;
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "-");

export default function RevisionManage({ doc, statuses, onSave, onClose }: Props) {
  const [title, setTitle] = useState(doc.title || "");
  const [note, setNote] = useState(doc.note || "");
  const [status, setStatus] = useState<SavedDocStatus>(doc.status);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rev = `Rev ${Math.max(0, (doc.version || 1) - 1)}`;
  const dirty = title.trim() !== (doc.title || "") || note !== (doc.note || "") || status !== doc.status;
  const save = async () => {
    setBusy(true);
    try { await onSave({ title: title.trim(), note, status }); onClose(); }
    catch { /* the caller has already said what went wrong */ }
    finally { setBusy(false); }
  };

  const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
  const inp = "w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary/20";

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Manage ${rev}`} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-12" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-display font-bold text-slate-900 text-base">Manage {rev}</h3>
            <p className="text-[11px] text-slate-400">The file is frozen. Title, notes and status can change.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-50"><X size={16} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="rev-title" className={lbl}>Title</label>
            <input id="rev-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inp} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rev-note" className={lbl}>Notes</label>
            <textarea id="rev-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. Sent to the client by email on 12 Sep, addendum 2 included" className={`${inp} resize-y`} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rev-status" className={lbl}>Status</label>
            <select id="rev-status" value={status} onChange={(e) => setStatus(e.target.value as SavedDocStatus)} className={`${inp} appearance-none`}>
              {Object.entries(statuses).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-[11px] text-slate-500 space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-slate-700 truncate" title={doc.fileName}>{doc.fileName}</span>
              <button onClick={() => window.open(attachmentUrl(doc.filePath), "_blank")} className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline shrink-0"><Eye size={12} /> Open file</button>
            </div>
            <p>{(doc.fileType || "").toUpperCase()} · {doc.size}</p>
            <p>Created {when(doc.createdAt)}{doc.createdByName ? ` by ${doc.createdByName}` : ""}</p>
            <p>Last modified {when(doc.updatedAt || doc.createdAt)}{(doc.updatedByName || doc.createdByName) ? ` by ${doc.updatedByName || doc.createdByName}` : ""}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-50">Cancel</button>
          <button onClick={() => void save()} disabled={!dirty || busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary disabled:opacity-40">
            {busy && <Loader2 size={12} className="animate-spin" />} Save changes
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
