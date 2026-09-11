import { useEffect, useState } from "react";
import { Check, Gauge, Loader2, Pencil, X } from "lucide-react";

/**
 * CR-P (120) — the project's progress, shown inside the project (the same bar as on the My
 * Projects cards). Whoever runs the project can change the percentage right here and save it,
 * without going to the project identity form.
 */
export default function ProjectProgress({ progress, canEdit, onSave, className = "" }: {
  progress: number;
  canEdit: boolean;
  onSave: (pct: number) => Promise<void>;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(progress || 0)));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(pct));
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!editing) setDraft(String(pct)); }, [pct, editing]);

  const value = Math.max(0, Math.min(100, Math.round(Number(draft) || 0)));
  const save = async () => {
    setSaving(true);
    try { await onSave(value); setEditing(false); }
    finally { setSaving(false); }
  };

  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-2.5 flex items-center gap-3 ${className}`}>
      <Gauge size={14} className={pct === 100 ? "text-emerald-500 shrink-0" : "text-slate-400 shrink-0"} />
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0 hidden sm:inline">Progress</span>
      <div className="flex-grow h-2 rounded-full bg-slate-100 overflow-hidden min-w-[4rem]">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-primary"}`}
          style={{ width: `${editing ? value : pct}%` }}
        />
      </div>
      {editing ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="number"
            min={0}
            max={100}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-primary"
            aria-label="Progress percentage"
          />
          <span className="text-xs font-bold text-slate-500">%</span>
          <button
            onClick={save}
            disabled={saving}
            title="Save progress"
            className="p-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          </button>
          <button onClick={() => setEditing(false)} title="Cancel" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50">
            <X size={12} />
          </button>
        </div>
      ) : (
        <>
          <span className={`text-xs font-bold shrink-0 ${pct === 100 ? "text-emerald-600" : "text-slate-700"}`}>{pct}%</span>
          {canEdit && (
            <button onClick={() => setEditing(true)} title="Change progress" className="p-1 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50 shrink-0">
              <Pencil size={12} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
