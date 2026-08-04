import { useState } from "react";
import { ArrowUp, ArrowDown, Eye, EyeOff, Copy, Trash2, Plus, GripVertical, Lock, SeparatorHorizontal, FileX, ChevronDown, ChevronRight } from "lucide-react";
import { PROPOSAL_STANDARD_SECTIONS, type ProposalSectionMeta } from "../../lib/api";

const KIND_BADGE: Record<string, string> = {
  description: "Built-in", personnel: "Built-in", pastPerformance: "Built-in", timeline: "Built-in", custom: "Custom", blank: "Blank",
};

export default function ProposalSectionManager({
  layout, onLayoutChange, onAdd, onAddBlank, onDuplicate, onRemove, canEdit, collapsed, onToggleCollapsed,
}: {
  layout: ProposalSectionMeta[];
  onLayoutChange: (next: ProposalSectionMeta[]) => void;
  onAdd: (title: string) => void;
  onAddBlank: () => void;
  onDuplicate: (meta: ProposalSectionMeta) => void;
  onRemove: (meta: ProposalSectionMeta) => void;
  canEdit: boolean;
  collapsed?: boolean;          // when true the reorder list is hidden (the header + Add stay visible)
  onToggleCollapsed?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= layout.length) return;
    const next = layout.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onLayoutChange(next);
  };
  const patch = (i: number, p: Partial<ProposalSectionMeta>) =>
    onLayoutChange(layout.map((m, idx) => (idx === i ? { ...m, ...p } : m)));

  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onToggleCollapsed && (
            <button onClick={onToggleCollapsed} className="p-1 rounded text-slate-400 hover:text-slate-900" title={collapsed ? "Show reorder list" : "Hide reorder list"}>
              {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
          <div>
            <h4 className="font-bold text-slate-800 text-sm">Sections</h4>
            <p className="text-[10px] text-slate-400 mt-0.5">Reorder with the ↑ ↓ arrows on each section below, or expand this list. The document follows this order.</p>
          </div>
        </div>
        {canEdit && (
          <div className="relative flex items-center gap-2">
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-800"><Plus size={12} /> Add section</button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-[150]" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-64 max-h-80 overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-100 z-[160] p-2">
                  <button onClick={() => { onAdd(""); setMenuOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-primary hover:bg-primary/5">+ Blank section (text)</button>
                  <button onClick={() => { onAddBlank(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"><FileX size={12} /> Blank page (no letterhead)</button>
                  <div className="my-1 border-t border-slate-100" />
                  <p className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Standard sections</p>
                  {PROPOSAL_STANDARD_SECTIONS.map((s) => (
                    <button key={s} onClick={() => { onAdd(s); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50">{s}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
      <div className="space-y-1.5">
        {layout.map((m, i) => (
          <div key={m.id} className={`flex items-center gap-2 p-2 rounded-xl border transition-colors ${m.hidden ? "bg-slate-50/60 border-slate-100 opacity-60" : "bg-white border-slate-100"}`}>
            <GripVertical size={14} className="text-slate-300 flex-shrink-0" />
            <div className="flex flex-col">
              <button disabled={!canEdit || i === 0} onClick={() => move(i, -1)} className="p-0.5 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ArrowUp size={12} /></button>
              <button disabled={!canEdit || i === layout.length - 1} onClick={() => move(i, 1)} className="p-0.5 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ArrowDown size={12} /></button>
            </div>
            <input
              value={m.title}
              onChange={(e) => patch(i, { title: e.target.value })}
              disabled={!canEdit}
              className="flex-grow bg-transparent text-xs font-bold text-slate-700 outline-none border-b border-transparent focus:border-primary/30 py-1"
            />
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${m.kind === "custom" ? "bg-indigo-50 text-indigo-500" : "bg-slate-100 text-slate-400"}`}>{KIND_BADGE[m.kind] || m.kind}</span>
            {canEdit && (
              <div className="flex items-center gap-0.5 shrink-0">
                {m.kind !== "blank" && (
                  <button onClick={() => patch(i, { divider: !m.divider })} title="Divider page before this section" className={`p-1.5 rounded hover:bg-slate-100 ${m.divider ? "text-primary" : "text-slate-300 hover:text-slate-600"}`}><SeparatorHorizontal size={13} /></button>
                )}
                <button onClick={() => patch(i, { hidden: !m.hidden })} title={m.hidden ? "Show" : "Hide"} className="p-1.5 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100">{m.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                {m.kind === "custom" && <button onClick={() => onDuplicate(m)} title="Duplicate" className="p-1.5 rounded text-slate-400 hover:text-primary hover:bg-slate-100"><Copy size={13} /></button>}
                {m.kind === "custom" || m.kind === "blank"
                  ? <button onClick={() => onRemove(m)} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={13} /></button>
                  : <span className="p-1.5 text-slate-200" title="Built-in section (hide to exclude)"><Lock size={13} /></span>}
              </div>
            )}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
