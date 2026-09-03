import { useState, type KeyboardEvent } from "react";
import { Pencil, Check, X } from "lucide-react";

/**
 * CR-P (06) — an inline text value that is NOT an always-open field.
 *
 * Read mode shows the text with a small Edit (pencil) icon; clicking it switches to an input with
 * explicit Save (check) and Cancel (x) icons. Nothing is committed until Save (or Enter); Cancel /
 * Escape discards. Used for description / remark cells in tables across the platform so a stray
 * click never edits, and edits are always saved deliberately.
 */
export default function InlineEditText({
  value,
  onSave,
  placeholder = "Add a description…",
  canEdit = true,
  className = "text-xs font-medium text-slate-600",
  inputClassName = "",
  multiline = false,
  emptyText = "—",
}: {
  value: string;
  onSave: (next: string) => void;
  placeholder?: string;
  canEdit?: boolean;
  /** Classes for the read-only text. */
  className?: string;
  /** Classes for the input/textarea in edit mode. */
  inputClassName?: string;
  multiline?: boolean;
  /** Shown (muted) in read-only mode when there is no value; pass "" to render nothing. */
  emptyText?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const start = () => { setDraft(value); setEditing(true); };
  const commit = () => { setEditing(false); if (draft.trim() !== value.trim()) onSave(draft); };
  const cancel = () => { setEditing(false); setDraft(value); };

  if (!canEdit) {
    if (value) return <span className={className}>{value}</span>;
    return emptyText ? <span className="text-xs text-slate-400">{emptyText}</span> : null;
  }

  if (editing) {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !multiline) { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
    };
    const cls = inputClassName || "flex-grow min-w-0 bg-white border border-slate-200 focus:ring-2 focus:ring-primary/20 rounded px-2 py-1 text-xs font-medium text-slate-600 outline-none";
    return (
      <span className="inline-flex items-center gap-1 w-full">
        {multiline ? (
          <textarea autoFocus rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} placeholder={placeholder} className={cls} />
        ) : (
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} placeholder={placeholder} className={cls} />
        )}
        <button type="button" onClick={commit} title="Save" className="p-1 rounded text-emerald-600 hover:bg-emerald-50 shrink-0"><Check size={14} /></button>
        <button type="button" onClick={cancel} title="Cancel" className="p-1 rounded text-slate-400 hover:bg-slate-100 shrink-0"><X size={14} /></button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 w-full min-w-0 group/inline">
      <span className={`min-w-0 ${value ? className : "text-xs text-slate-300 italic"}`}>{value || placeholder}</span>
      <button type="button" onClick={start} title="Edit" className="p-1 rounded text-slate-400 hover:text-primary hover:bg-slate-100 shrink-0"><Pencil size={12} /></button>
    </span>
  );
}
