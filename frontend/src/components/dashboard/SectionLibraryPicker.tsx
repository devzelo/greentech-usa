import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, Check, FileX, Plus } from "lucide-react";
import type { ProposalPageType } from "../../lib/api";
import { SECTION_LIBRARY, APPENDIX_LIBRARY, BUILT_IN_SECTIONS, FINANCIAL_SECTION_LIBRARY, FINANCIAL_BUILT_INS, PAGE_TYPES, isOriginalPageType, type LibraryItem } from "../../lib/proposalLibrary";

// Spec section 5: "When the proposal writer clicks Add Section, show the Section Library and allow
// them to select a section." Sections and appendices each have their own library; the writer can
// always add a custom one with any title.

export interface SectionAddOpts {
  libraryKey?: string;
  guide?: string;
  appendix?: boolean;
  pageType?: ProposalPageType;
  divider?: boolean;
}

const TYPE_BADGE: Record<ProposalPageType, string> = {
  designed: "bg-emerald-50 text-emerald-700",
  government: "bg-amber-50 text-amber-700",
  external: "bg-sky-50 text-sky-700",
};

export default function SectionLibraryPicker({ usedKeys, onPick, onBlankPage, onClose, volume = "technical" }: {
  usedKeys: Set<string>;
  onPick: (title: string, opts: SectionAddOpts) => void;
  onBlankPage: () => void;
  onClose: () => void;
  volume?: "technical" | "financial";   // step 7 - the financial volume has its own section library
}) {
  const lib = volume === "financial" ? FINANCIAL_SECTION_LIBRARY : SECTION_LIBRARY;
  const [tab, setTab] = useState<"sections" | "appendices">("sections");
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const appendix = tab === "appendices";
  const items = useMemo(() => {
    const src = appendix ? APPENDIX_LIBRARY : lib;
    const needle = q.trim().toLowerCase();
    return needle ? src.filter((i) => `${i.title} ${i.hint}`.toLowerCase().includes(needle)) : src;
  }, [appendix, q, lib]);

  const pick = (item: LibraryItem) => {
    const pageType = item.pageType || (appendix ? "external" : "designed");
    // Appendices and original documents get a GT/JV separator page by default (the samples do).
    onPick(item.title, { libraryKey: item.key, guide: item.hint, appendix, pageType, divider: appendix || isOriginalPageType(pageType) || undefined });
    onClose();
  };
  const addCustom = () => {
    const t = custom.trim();
    if (!t) return;
    onPick(t, appendix ? { appendix: true, pageType: "external", divider: true } : { pageType: "designed" });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[160] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Add to the proposal" className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-8 flex flex-col max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <div>
            <h3 className="font-display font-bold text-slate-900 text-base">Add to the proposal</h3>
            <p className="text-[11px] text-slate-400">Pick what the solicitation asks for. Every title can be renamed afterwards.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-50"><X size={16} /></button>
        </div>

        <div className="px-6 space-y-3">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 w-fit" role="tablist">
            {([["sections", `Sections (${lib.length})`], ["appendices", `Appendices & attachments (${APPENDIX_LIBRARY.length})`]] as const).map(([v, l]) => (
              <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${tab === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>{l}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-primary/20">
            <Search size={14} className="text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={appendix ? "Search appendices, e.g. insurance, SAM, SF 330" : "Search sections, e.g. quality, schedule, CTIP"} className="flex-1 text-xs outline-none" autoFocus aria-label="Search the library" />
          </label>
          {!appendix && <p className="text-[10px] text-slate-400">Built in, on their own tabs: {(volume === "financial" ? FINANCIAL_BUILT_INS : BUILT_IN_SECTIONS).join(", ")}.</p>}
        </div>

        <ul className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {items.length === 0 && <li className="text-xs text-slate-400 italic px-2 py-4 text-center">Nothing matches. Add it as a custom {appendix ? "appendix" : "section"} below.</li>}
          {items.map((item) => {
            const type = item.pageType || (appendix ? "external" : "designed");
            const used = usedKeys.has(item.key);
            return (
              <li key={item.key}>
                <button onClick={() => pick(item)} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 flex items-start gap-3 group">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-800">{item.title}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${TYPE_BADGE[type]}`}>{PAGE_TYPES.find((p) => p.v === type)?.short}</span>
                      {used && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-slate-400"><Check size={10} /> Added</span>}
                    </span>
                    <span className="block text-[11px] text-slate-500 leading-snug mt-0.5">{item.hint}</span>
                  </span>
                  <Plus size={14} className="text-slate-300 group-hover:text-primary mt-0.5 shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-slate-100 px-6 py-4 space-y-2">
          <div className="flex items-center gap-2">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
              placeholder={appendix ? "Custom appendix title, e.g. Appendix: Hydraulic Calculations" : "Custom section title, e.g. Factor 2 - Key Personnel Qualifications"}
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-primary/20" aria-label="Custom title" />
            <button onClick={addCustom} disabled={!custom.trim()} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-bold hover:bg-primary disabled:opacity-40">Add custom</button>
          </div>
          {!appendix && (
            <button onClick={() => { onBlankPage(); onClose(); }} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-900"><FileX size={12} /> Add a blank page (no letterhead)</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
