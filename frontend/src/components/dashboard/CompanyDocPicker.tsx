import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, Check, Star } from "lucide-react";
import type { ProposalDoc } from "../../lib/api";
import { APPENDIX_LIBRARY } from "../../lib/proposalLibrary";
import { expiryInfo } from "../../lib/docExpiry";

// Item 104: "Documents that never change (company registration, insurance, DBA insurance, NDA,
// certificates) should be a tick list. Selecting one pulls the file automatically from Company /
// Classified Documents, with no upload step." Documents of the section's own type come first.

const typeTitle = (key?: string) => APPENDIX_LIBRARY.find((a) => a.key === key)?.title || "";

export default function CompanyDocPicker({ docs, suggestKey, already, onPick, onClose }: {
  docs: ProposalDoc[];
  suggestKey?: string;
  already: Set<string>;
  onPick: (files: ProposalDoc[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const shown = needle ? docs.filter((d) => `${d.name} ${d.tabLabel || ""} ${typeTitle(d.libraryKey)}`.toLowerCase().includes(needle)) : docs;
    return shown.slice().sort((a, b) =>
      Number(b.libraryKey === suggestKey && !!suggestKey) - Number(a.libraryKey === suggestKey && !!suggestKey)
      || (a.tabLabel || "").localeCompare(b.tabLabel || "")
      || a.name.localeCompare(b.name),
    );
  }, [docs, q, suggestKey]);

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return createPortal(
    <div className="fixed inset-0 z-[160] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Attach from Company Documents" className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-8 flex flex-col max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <div>
            <h3 className="font-display font-bold text-slate-900 text-base">Attach from Company Documents</h3>
            <p className="text-[11px] text-slate-400">Tick the documents to insert, as they are. No upload needed.{suggestKey ? " Documents of this section's type come first." : ""}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-50"><X size={16} /></button>
        </div>
        <div className="px-6">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-primary/20">
            <Search size={14} className="text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, tab or type, e.g. insurance" className="flex-1 text-xs outline-none" autoFocus aria-label="Search company documents" />
          </label>
        </div>

        <ul className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {list.length === 0 && <li className="text-xs text-slate-400 italic px-2 py-6 text-center">No company documents{q ? " match" : " yet. Upload them in Company Documents"}.</li>}
          {list.map((d) => {
            const on = picked.has(d._id);
            const has = already.has(d._id);
            const ex = expiryInfo(d.expiresAt);
            const suggested = !!suggestKey && d.libraryKey === suggestKey;
            return (
              <li key={d._id}>
                <label className={`flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer ${has ? "opacity-50 cursor-not-allowed" : on ? "bg-primary/5" : "hover:bg-slate-50"}`}>
                  <input type="checkbox" checked={on || has} disabled={has} onChange={() => toggle(d._id)} className="mt-0.5 accent-emerald-600" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-800 truncate">{d.name}</span>
                      {suggested && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-primary"><Star size={9} /> Matches</span>}
                      {has && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-slate-400"><Check size={10} /> Attached</span>}
                      {ex.state !== "none" && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${ex.cls}`}>{ex.label}</span>}
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      {[d.tabLabel, typeTitle(d.libraryKey), d.version ? `Version ${d.version}` : "", d.kind === "classified" ? "Classified" : ""].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">Set a document's type and expiry in Company Documents (pencil icon) so it is suggested and checked.</p>
          <button onClick={() => { onPick(docs.filter((d) => picked.has(d._id))); onClose(); }} disabled={picked.size === 0} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary disabled:opacity-40 shrink-0">
            Attach {picked.size || ""}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
