import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, Loader2, Layers } from "lucide-react";
import type { ApiProposalTemplate, ProposalSectionMeta } from "../../lib/api";

const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";

type GroupContent = { group?: boolean; items?: Array<{ meta: Partial<ProposalSectionMeta> }> };

/**
 * Step 9b (spec 1) - "save a selected group of sections as a template": tick the sections, name the
 * group, and insert it into any proposal later in one go (text, subsections, company documents).
 */
export default function SectionGroupTemplates({ layout, templates, canEdit, onSave, onInsert, onDelete }: {
  layout: ProposalSectionMeta[];
  templates: ApiProposalTemplate[];
  canEdit: boolean;
  onSave: (name: string, metaIds: string[]) => Promise<void>;
  onInsert: (t: ApiProposalTemplate) => void;
  onDelete: (t: ApiProposalTemplate) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const custom = layout.filter((m) => m.kind === "custom");
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const save = async () => {
    setBusy(true);
    try {
      await onSave(name.trim(), custom.filter((m) => picked.has(m.id)).map((m) => m.id));
      setName("");
      setPicked(new Set());
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-6 py-3.5 text-left">
        <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} <Layers size={14} className="text-slate-400" /> Section-group templates
        </span>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{templates.length} saved</span>
      </button>
      {open && (
        <div className="px-6 pb-6 space-y-4">
          <p className="text-[11px] text-slate-500">Save a set of sections (for example Quality Control, Safety and Schedule) and insert them into any proposal in one go, with their text, subsections and company documents.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className={lbl}>Insert a saved group</p>
              {templates.length === 0 && <p className="text-xs text-slate-400">None saved yet.</p>}
              {templates.map((t) => {
                const items = (t.content as GroupContent).items || [];
                return (
                  <div key={t._id} className="flex items-start gap-2 rounded-xl border border-slate-100 p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{t.name}</p>
                      <p className="text-[10px] text-slate-400 line-clamp-2">{items.map((i) => i.meta.title).filter(Boolean).join(", ") || "Empty"}</p>
                    </div>
                    {canEdit && <button onClick={() => onInsert(t)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary shrink-0"><Plus size={11} /> Insert</button>}
                    {canEdit && <button onClick={() => void onDelete(t)} aria-label={`Delete ${t.name}`} className="p-1.5 rounded text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={12} /></button>}
                  </div>
                );
              })}
            </div>
            {canEdit && (
              <div className="space-y-2">
                <p className={lbl}>Save sections as a group</p>
                {custom.length === 0 ? (
                  <p className="text-xs text-slate-400">No sections to save yet: add some from the Section Library first.</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-1 rounded-xl border border-slate-100 p-2">
                    {custom.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-slate-50 text-xs text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={picked.has(m.id)} onChange={() => toggle(m.id)} className="rounded" />
                        <span className="truncate">{m.title}</span>
                        {m.appendix && <span className="text-[9px] font-bold text-slate-400 uppercase">Appendix</span>}
                      </label>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name, e.g. Design-Build core sections" aria-label="Group name" className={inp} />
                  <button onClick={() => void save()} disabled={!name.trim() || picked.size === 0 || busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-bold hover:bg-primary disabled:opacity-40 shrink-0">
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Save ({picked.size})
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
