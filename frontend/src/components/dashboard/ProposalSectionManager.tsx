import { useState } from "react";
import { ArrowUp, ArrowDown, Eye, EyeOff, Copy, Trash2, Plus, GripVertical, Lock, Unlock, SeparatorHorizontal, ChevronDown, ChevronRight, History } from "lucide-react";
import type { ProposalPageType, ProposalSectionMeta, TechnicalProposalContent } from "../../lib/api";
import { SECTION_STATUS_OPTS } from "../../lib/sectionStatus";
import { PAGE_TYPES, isOriginalPageType } from "../../lib/proposalLibrary";
import SectionLibraryPicker, { type SectionAddOpts } from "./SectionLibraryPicker";

type Numbering = NonNullable<TechnicalProposalContent["numbering"]>;
type LevelName = NonNullable<TechnicalProposalContent["levelName"]>;
const LEVEL_NAMES: LevelName[] = ["Section", "Tab", "Factor", "Volume", "Part"];

const KIND_BADGE: Record<string, string> = {
  description: "Built-in", personnel: "Built-in", pastPerformance: "Built-in", timeline: "Built-in", custom: "Custom", blank: "Blank",
};

export default function ProposalSectionManager({
  layout, onLayoutChange, onAdd, onAddBlank, onDuplicate, onRemove, canEdit, collapsed, onToggleCollapsed, users, onAssign, userName,
  numbering = "numbers", onNumberingChange, levelName = "Section", onLevelNameChange,
}: {
  numbering?: Numbering;                                 // CR-P (95) - 1, 2, 3 / A, B, C / off
  onNumberingChange?: (n: Numbering) => void;
  levelName?: LevelName;                                 // spec 1 - Section, Tab, Factor, Volume, Part
  onLevelNameChange?: (n: LevelName) => void;
  layout: ProposalSectionMeta[];
  onLayoutChange: (next: ProposalSectionMeta[]) => void;
  onAdd: (title: string, opts?: SectionAddOpts) => void;
  onAddBlank: () => void;
  onDuplicate: (meta: ProposalSectionMeta) => void;
  onRemove: (meta: ProposalSectionMeta) => void;
  canEdit: boolean;
  collapsed?: boolean;          // when true the reorder list is hidden (the header + Add stay visible)
  onToggleCollapsed?: () => void;
  users?: Array<{ id: string; name: string }>;   // CR-B-19a — colleagues to tag on a section
  onAssign?: (index: number, userId: string, name: string) => void;
  userName?: string;                              // CR-B-17 — actor recorded in section history
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [histOpen, setHistOpen] = useState<number | null>(null); // CR-B-17 — which section's history is shown

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
            <p className="text-[10px] text-slate-400 mt-0.5">Add from the library, rename anything, set each section's page type. The document follows this order.</p>
          </div>
        </div>
        {/* CR-P (95) / spec 1 - numbering 1, 2, 3 or A, B, C ("Section A: Performance Schedule"), or off;
            and what a top-level section is called (Tab A, Factor 2, Volume I). */}
        {onNumberingChange && (
          <div className="flex items-center gap-2 ml-auto mr-2 flex-wrap justify-end">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5" role="radiogroup" aria-label="Section numbering">
              {([["numbers", "1, 2, 3"], ["letters", "A, B, C"], ["none", "Off"]] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={numbering === v} disabled={!canEdit} onClick={() => onNumberingChange(v)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${numbering === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>{l}</button>
              ))}
            </div>
            {onLevelNameChange && (
              <select value={levelName} onChange={(e) => onLevelNameChange(e.target.value as LevelName)} disabled={!canEdit} aria-label="What a top-level section is called"
                title="What a top-level section is called on divider pages and in the contents" className="text-[10px] font-bold rounded-lg px-2 py-1 border border-slate-200 text-slate-600 bg-white">
                {LEVEL_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
          </div>
        )}
        {canEdit && (
          <button onClick={() => setMenuOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-800"><Plus size={12} /> Add section</button>
        )}
        {/* Spec 5 - Add Section opens the Section Library (and the Appendix Library). */}
        {menuOpen && (
          <SectionLibraryPicker
            usedKeys={new Set(layout.map((m) => m.libraryKey).filter((k): k is string => !!k))}
            onPick={(title, opts) => onAdd(title, opts)}
            onBlankPage={onAddBlank}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>

      {!collapsed && (
      <div className="space-y-1.5">
        {layout.map((m, i) => {
          const locked = !!m.locked;
          const st = SECTION_STATUS_OPTS.find((o) => o.v === (m.status || "")) || SECTION_STATUS_OPTS[0];
          return (
          <div key={m.id} className={`rounded-xl border transition-colors ${m.hidden ? "bg-slate-50/60 border-slate-100 opacity-60" : locked ? "bg-white border-amber-200" : "bg-white border-slate-100"}`}>
          <div className="flex flex-wrap items-center gap-2 p-2">
            <GripVertical size={14} className="text-slate-300 flex-shrink-0" />
            <div className="flex flex-col">
              <button disabled={!canEdit || locked || i === 0} onClick={() => move(i, -1)} className="p-0.5 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ArrowUp size={12} /></button>
              <button disabled={!canEdit || locked || i === layout.length - 1} onClick={() => move(i, 1)} className="p-0.5 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ArrowDown size={12} /></button>
            </div>
            <input
              value={m.title}
              onChange={(e) => patch(i, { title: e.target.value })}
              disabled={!canEdit || locked}
              className="flex-grow min-w-[8rem] bg-transparent text-xs font-bold text-slate-700 outline-none border-b border-transparent focus:border-primary/30 py-1"
            />
            {/* CR-P (95) - the RFP paragraph this section answers, printed in the table of contents. */}
            {m.kind !== "blank" && (
              <input
                value={m.rfpRef || ""}
                onChange={(e) => patch(i, { rfpRef: e.target.value })}
                disabled={!canEdit || locked}
                placeholder="RFP ref."
                aria-label={`RFP reference for ${m.title}`}
                title="The RFP paragraph this section answers, e.g. L.5.5.3.1. Printed in the table of contents."
                className="w-20 bg-transparent text-[11px] text-slate-500 outline-none border-b border-slate-100 focus:border-primary/30 py-1"
              />
            )}
            {/* Spec 4 - the page type: our designed pages, a Government form, or an external document. */}
            {m.kind === "custom" && (
              <select
                value={m.pageType || "designed"}
                onChange={(e) => { const v = e.target.value as ProposalPageType; patch(i, { pageType: v, ...(isOriginalPageType(v) && m.divider === undefined ? { divider: true } : {}) }); }}
                disabled={!canEdit || locked}
                aria-label={`Page type for ${m.title}`}
                title={PAGE_TYPES.find((p) => p.v === (m.pageType || "designed"))?.hint}
                className="text-[10px] font-bold rounded-lg px-2 py-1 border border-slate-200 text-slate-600 bg-white cursor-pointer disabled:opacity-60"
              >
                {PAGE_TYPES.map((p) => <option key={p.v} value={p.v}>{p.short}</option>)}
              </select>
            )}
            {/* CR-B-15 — colour-coded per-section status. */}
            {canEdit && (
              <select value={m.status || ""} onChange={(e) => { const label = SECTION_STATUS_OPTS.find((o) => o.v === e.target.value)?.label || "No status"; patch(i, { status: e.target.value, history: [...(m.history || []), { at: new Date().toISOString(), by: userName || "Someone", text: `Status → ${label}` }] }); }} disabled={locked} className={`text-[10px] font-bold rounded-full px-2 py-1 border-0 cursor-pointer disabled:opacity-60 ${st.cls}`} title="Section status">
                {SECTION_STATUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
            )}
            {/* CR-B-19a — tag a colleague to review this section. */}
            {canEdit && users && users.length > 0 && (
              <select value={m.assignedTo || ""} disabled={locked} onChange={(e) => { const u = users.find((x) => x.id === e.target.value); patch(i, { assignedTo: u?.name || "" }); if (u && onAssign) onAssign(i, u.id, u.name); }} className="text-[10px] font-bold rounded-lg px-2 py-1 border border-slate-200 text-slate-600 bg-white cursor-pointer disabled:opacity-60" title="Tag a colleague to review this section">
                <option value="">{m.assignedTo ? `👤 ${m.assignedTo}` : "Tag…"}</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${m.kind === "custom" ? "bg-indigo-50 text-indigo-500" : "bg-slate-100 text-slate-400"}`}>{KIND_BADGE[m.kind] || m.kind}</span>
            {canEdit && (
              <div className="flex items-center gap-0.5 shrink-0">
                {/* CR-B-17 — View History for this section. */}
                {(m.history?.length || 0) > 0 && <button onClick={() => setHistOpen(histOpen === i ? null : i)} title="View history" className="p-1.5 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100"><History size={13} /></button>}
                {/* CR-B-17 — lock the section (blocks reorder/rename/edit). */}
                <button onClick={() => patch(i, { locked: !locked })} title={locked ? "Unlock section" : "Lock section"} className={`p-1.5 rounded hover:bg-slate-100 ${locked ? "text-amber-600" : "text-slate-300 hover:text-slate-600"}`}>{locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
                {m.kind !== "blank" && (
                  <button onClick={() => patch(i, { divider: !m.divider })} disabled={locked} title="Divider page before this section" className={`p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 ${m.divider ? "text-primary" : "text-slate-300 hover:text-slate-600"}`}><SeparatorHorizontal size={13} /></button>
                )}
                {/* CR-P (103) - appendices are numbered apart: Appendix 1, 2, 3. */}
                {m.kind !== "blank" && (
                  <button onClick={() => patch(i, { appendix: !m.appendix })} disabled={locked} aria-pressed={!!m.appendix}
                    title={m.appendix ? "Appendix (numbered Appendix 1, 2, ...). Click to make it a main section." : "Make this an appendix (numbered Appendix 1, 2, ...)"}
                    className={`px-1.5 py-1 rounded text-[9px] font-extrabold tracking-wide hover:bg-slate-100 disabled:opacity-30 ${m.appendix ? "text-primary bg-primary/10" : "text-slate-300 hover:text-slate-600"}`}>APPX</button>
                )}
                <button onClick={() => patch(i, { hidden: !m.hidden })} title={m.hidden ? "Show" : "Hide"} className="p-1.5 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100">{m.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                {m.kind === "custom" && <button onClick={() => onDuplicate(m)} title="Duplicate" className="p-1.5 rounded text-slate-400 hover:text-primary hover:bg-slate-100"><Copy size={13} /></button>}
                {m.kind === "custom" || m.kind === "blank"
                  ? <button onClick={() => onRemove(m)} disabled={locked} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30"><Trash2 size={13} /></button>
                  : null}
              </div>
            )}
          </div>
          {canEdit && !m.hidden && (
            <input value={m.notes || ""} onChange={(e) => patch(i, { notes: e.target.value })} disabled={locked} placeholder="+ Internal notes for this section (not printed)" className="w-full bg-transparent text-[11px] text-slate-500 outline-none border-t border-slate-50 px-3 py-1.5 disabled:opacity-60" />
          )}
          {/* CR-B-17 — per-section change history. */}
          {histOpen === i && (
            <div className="border-t border-slate-50 px-3 py-2 space-y-1 bg-slate-50/60">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><History size={10} /> Section history</p>
              {(m.history || []).slice().reverse().map((h, k) => (
                <p key={k} className="text-[11px] text-slate-500"><span className="text-slate-400">{h.at ? new Date(h.at).toLocaleString() : ""}</span> · <strong className="text-slate-600">{h.by}</strong> — {h.text}</p>
              ))}
            </div>
          )}
          </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
