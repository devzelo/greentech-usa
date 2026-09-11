import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Upload, Loader2, FileText } from "lucide-react";
import type { SavedDocStatus } from "../../lib/api";

// CR-P (88) - "Upload existing proposal" for projects that are already awarded: a proposal produced
// outside the platform, filed into the same revision table with its own title, revision number,
// date and description, so it sits in the history (with the same row actions) like a built one.

export interface UploadMeta { title: string; revision: number; docDate: string; note: string; status: SavedDocStatus }

interface Props {
  streamTitle: string;                                    // e.g. "Technical Proposal"
  statuses: Record<string, { label: string }>;
  fetchNextVersion: () => Promise<number>;                // suggests the next free revision
  onUpload: (file: File, meta: UploadMeta) => Promise<void>;   // throws with a message on failure
  onClose: () => void;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function UploadExistingProposal({ streamTitle, statuses, fetchNextVersion, onUpload, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [revision, setRevision] = useState("0");
  const [docDate, setDocDate] = useState(today());
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<SavedDocStatus>("submitted");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Suggest the next free number; they can type the one the document was actually issued under.
  useEffect(() => {
    fetchNextVersion().then((v) => setRevision(String(Math.max(0, v - 1)))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const revNum = Number(revision);
  const revOk = revision.trim() !== "" && Number.isInteger(revNum) && revNum >= 0 && revNum <= 999;

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
    setError("");
  };

  const submit = async () => {
    if (!file || !revOk) return;
    setBusy(true);
    setError("");
    try {
      await onUpload(file, { title: title.trim(), revision: revNum, docDate, note: note.trim(), status });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
  const inp = "w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary/20";

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Upload an existing ${streamTitle}`} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-12" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-display font-bold text-slate-900 text-base">Upload existing proposal</h3>
            <p className="text-[11px] text-slate-400">{streamTitle}. A proposal produced outside the platform joins this table's history.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-50"><X size={16} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${file ? "border-primary/40 bg-primary/5" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}>
            {file ? <FileText size={18} className="text-primary shrink-0" /> : <Upload size={18} className="text-slate-400 shrink-0" />}
            <span className="min-w-0">
              <span className="block text-xs font-bold text-slate-800 truncate">{file ? file.name : "Choose the file"}</span>
              <span className="block text-[10px] text-slate-400">{file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB · click to change` : "PDF is best: it can be previewed and compared"}</span>
            </span>
            <input type="file" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          </label>

          <div className="space-y-1.5">
            <label htmlFor="up-title" className={lbl}>Title</label>
            <input id="up-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Technical Proposal as submitted" className={inp} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="up-rev" className={lbl}>Revision number</label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-500">Rev</span>
                <input id="up-rev" type="number" min={0} max={999} step={1} value={revision} onChange={(e) => setRevision(e.target.value)} aria-invalid={!revOk} className={`${inp} ${revOk ? "" : "border-red-300 focus:ring-red-100"}`} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="up-date" className={lbl}>Date</label>
              <input id="up-date" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={inp} />
            </div>
          </div>
          {!revOk && <p className="text-[11px] text-red-600 -mt-2">Enter a whole number from 0 up.</p>}

          <div className="space-y-1.5">
            <label htmlFor="up-status" className={lbl}>Status</label>
            <select id="up-status" value={status} onChange={(e) => setStatus(e.target.value as SavedDocStatus)} className={`${inp} appearance-none`}>
              {Object.entries(statuses).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="up-note" className={lbl}>Description</label>
            <textarea id="up-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. Submitted to the county in March, awarded in May" className={`${inp} resize-y`} />
          </div>

          {error && <p role="alert" className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-50">Cancel</button>
          <button onClick={() => void submit()} disabled={!file || !revOk || busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary disabled:opacity-40">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload as Rev {revOk ? revNum : "?"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
