import { Loader2, Save, FileEdit, Eye, FileDown, FileText, FileSpreadsheet, Send, Copy, Printer, CheckCircle2, RotateCcw, Eraser, X } from "lucide-react";

// CR-B-14a — the standard action set for EVERY builder form. A form passes only the handlers that
// apply to it; each button renders only when its handler is given ("...if applicable"). Destructive
// actions (Cancel with unsaved work, Discard, Reset) confirm first via the passed `confirm` dialog.
type Confirm = (opts: { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>;

export interface BuilderActionsProps {
  confirm: Confirm;
  saving?: boolean;
  dirty?: boolean;                 // are there unsaved changes? (gates the Cancel confirmation)
  onSave?: () => void;
  onSaveDraft?: () => void;
  onPreview?: () => void;
  onExportPdf?: () => void;
  onExportWord?: () => void;
  onExportExcel?: () => void;      // CSV/Excel — only where tabular
  onSend?: () => void;
  onDuplicate?: () => void;
  onPrint?: () => void;
  onMarkComplete?: () => void;
  markCompleteTitle?: string;      // CR-B-21 — override the "Mark as complete?" dialog copy
  markCompleteMessage?: string;    // e.g. "…It will be saved as revision 2 in this directory."
  markCompleteLabel?: string;      // the button + confirm label (default "Mark complete")
  onDiscard?: () => void;          // revert unsaved edits back to the last saved state
  onReset?: () => void;            // clear the form to blank
  onCancel?: () => void;           // close; confirms when there are unsaved changes
  onClose?: () => void;            // plain close (no confirm) — used when nothing is editable
  className?: string;
}

const base = "px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors";
const ghost = `${base} border border-slate-200 text-slate-600 hover:bg-slate-50`;

export default function BuilderActions(p: BuilderActionsProps) {
  const { confirm } = p;
  const cancel = async () => {
    if (!p.onCancel) return;
    if (p.dirty && !(await confirm({ title: "Are you sure you want to cancel?", message: "You have unsaved changes — they will be lost.", confirmLabel: "Discard & close", cancelLabel: "Keep editing", danger: true }))) return;
    p.onCancel();
  };
  const discard = async () => {
    if (!p.onDiscard) return;
    if (await confirm({ title: "Discard changes?", message: "Revert this form back to the last saved version?", confirmLabel: "Discard changes", cancelLabel: "Keep editing", danger: true })) p.onDiscard();
  };
  const reset = async () => {
    if (!p.onReset) return;
    if (await confirm({ title: "Reset the form?", message: "This clears every field back to blank.", confirmLabel: "Reset form", cancelLabel: "Keep editing", danger: true })) p.onReset();
  };
  const markComplete = async () => {
    if (!p.onMarkComplete) return;
    if (await confirm({ title: p.markCompleteTitle || "Mark as complete?", message: p.markCompleteMessage || "Mark this document as complete/final?", confirmLabel: p.markCompleteLabel || "Mark complete" })) p.onMarkComplete();
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${p.className || ""}`}>
      {p.onPreview && <button type="button" onClick={p.onPreview} className={ghost} title="Preview before finalizing"><Eye size={13} /> Preview</button>}
      {p.onExportPdf && <button type="button" onClick={p.onExportPdf} className={ghost} title="Export as PDF"><FileDown size={13} /> PDF</button>}
      {p.onExportWord && <button type="button" onClick={p.onExportWord} className={ghost} title="Export as Word"><FileText size={13} /> Word</button>}
      {p.onExportExcel && <button type="button" onClick={p.onExportExcel} className={ghost} title="Export as Excel/CSV"><FileSpreadsheet size={13} /> Excel</button>}
      {p.onPrint && <button type="button" onClick={p.onPrint} className={ghost} title="Print"><Printer size={13} /> Print</button>}
      {p.onDuplicate && <button type="button" onClick={p.onDuplicate} className={ghost} title="Duplicate — make a copy/revision"><Copy size={13} /> Duplicate</button>}
      {p.onSend && <button type="button" onClick={p.onSend} className={ghost} title="Send / email a colleague"><Send size={13} /> Send</button>}
      {p.onReset && <button type="button" onClick={reset} className={ghost} title="Reset the form to blank"><Eraser size={13} /> Reset</button>}
      {p.onDiscard && <button type="button" onClick={discard} disabled={!p.dirty} className={ghost} title="Discard unsaved changes"><RotateCcw size={13} /> Discard</button>}
      {p.onCancel && <button type="button" onClick={cancel} className={`${base} border border-slate-200 text-slate-500 hover:bg-slate-50`} title="Cancel"><X size={13} /> Cancel</button>}
      {p.onClose && <button type="button" onClick={p.onClose} className={`${base} border border-slate-200 text-slate-500 hover:bg-slate-50`} title="Close"><X size={13} /> Close</button>}
      {p.onMarkComplete && <button type="button" onClick={markComplete} className={`${base} border border-emerald-200 text-emerald-700 hover:bg-emerald-50`} title={p.markCompleteLabel || "Mark as complete"}><CheckCircle2 size={13} /> {p.markCompleteLabel || "Mark complete"}</button>}
      {p.onSaveDraft && <button type="button" onClick={p.onSaveDraft} disabled={p.saving} className={ghost} title="Save without marking complete"><FileEdit size={13} /> Save as Draft</button>}
      {p.onSave && <button type="button" onClick={p.onSave} disabled={p.saving} className={`${base} bg-slate-900 text-white hover:bg-primary`} title="Save the latest changes">{p.saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save</button>}
    </div>
  );
}
