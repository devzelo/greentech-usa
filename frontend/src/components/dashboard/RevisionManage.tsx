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
  onSave: (body: { title: string; note: string; status: SavedDocStatus; docDate: string }) => Promise<void>;
  onClose: () => void;
  /** Item 110 - record a send made outside the platform (portal, hand delivery, courier). Throws on failure. */
  onLogSend?: (e: { to: string; method: string; at: string; note: string }) => Promise<void>;
}

const SEND_METHODS = ["Portal", "Email", "Hand delivery", "Courier", "Other"];

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "-");

export default function RevisionManage({ doc, statuses, onSave, onClose, onLogSend }: Props) {
  const [title, setTitle] = useState(doc.title || "");
  const [note, setNote] = useState(doc.note || "");
  const [status, setStatus] = useState<SavedDocStatus>(doc.status);
  const [docDate, setDocDate] = useState(doc.docDate || "");   // CR-P (88)
  const [busy, setBusy] = useState(false);
  // Item 110 - the send log, and a send recorded by hand.
  const [log, setLog] = useState(doc.sendLog || []);
  const [sTo, setSTo] = useState("");
  const [sMethod, setSMethod] = useState(SEND_METHODS[0]);
  const [sDate, setSDate] = useState("");
  const [sNote, setSNote] = useState("");
  const [logging, setLogging] = useState(false);
  const addSend = async () => {
    if (!onLogSend || !sTo.trim()) return;
    setLogging(true);
    try {
      const at = sDate ? new Date(`${sDate}T12:00:00`).toISOString() : new Date().toISOString();
      await onLogSend({ to: sTo.trim(), method: sMethod, at, note: sNote.trim() });
      setLog((l) => [...l, { at, to: sTo.trim(), method: sMethod, byName: "", note: sNote.trim() }]);
      if (status === "draft" || status === "final" || status === "completed") setStatus("sent");
      setSTo(""); setSDate(""); setSNote("");
    } catch { /* the caller has already said what went wrong */ }
    finally { setLogging(false); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rev = `Rev ${Math.max(0, (doc.version || 1) - 1)}`;
  const dirty = title.trim() !== (doc.title || "") || note !== (doc.note || "") || status !== doc.status || docDate !== (doc.docDate || "");
  const save = async () => {
    setBusy(true);
    try { await onSave({ title: title.trim(), note, status, docDate }); onClose(); }
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
          <div className="space-y-1.5">
            <label htmlFor="rev-date" className={lbl}>Document date</label>
            <input id="rev-date" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={inp} />
            <p className="text-[10px] text-slate-400">The date on the document, e.g. when it was issued. Leave empty to use the day it was filed.</p>
          </div>

          {/* Item 110 - what went out, to whom, when and how. */}
          <div className="space-y-2">
            <span className={lbl}>Sent</span>
            {log.length === 0 ? (
              <p className="text-[11px] text-slate-400">Not sent yet. Emailing it from the row's share menu records it here.</p>
            ) : (
              <ul className="space-y-1.5">
                {log.map((x, i) => (
                  <li key={i} className="text-[11px] text-slate-600 flex flex-wrap gap-x-2">
                    <span className="font-bold text-slate-800">{x.to}</span>
                    <span>{x.method}</span>
                    <span className="text-slate-400">{when(x.at)}{x.byName ? ` · by ${x.byName}` : ""}</span>
                    {x.note && <span className="w-full text-slate-400">{x.note}</span>}
                  </li>
                ))}
              </ul>
            )}
            {onLogSend && (
              <div className="rounded-xl border border-slate-100 p-3 space-y-2">
                <p className="text-[11px] font-bold text-slate-700">Record a send made outside the platform</p>
                <div className="grid grid-cols-2 gap-2">
                  <input value={sTo} onChange={(e) => setSTo(e.target.value)} placeholder="Sent to (person, office or portal)" aria-label="Sent to" className={`${inp} col-span-2`} />
                  <select value={sMethod} onChange={(e) => setSMethod(e.target.value)} aria-label="How it was sent" className={`${inp} appearance-none`}>
                    {SEND_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} aria-label="Date sent" className={inp} />
                  <input value={sNote} onChange={(e) => setSNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" className={`${inp} col-span-2`} />
                </div>
                <button onClick={() => void addSend()} disabled={!sTo.trim() || logging} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary disabled:opacity-40">
                  {logging && <Loader2 size={12} className="animate-spin" />} Record send
                </button>
              </div>
            )}
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
