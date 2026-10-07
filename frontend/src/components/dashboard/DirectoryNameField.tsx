import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, ChevronDown, Loader2, Plus, Search, X } from "lucide-react";
import { createCompany, fetchCompanies, withFileToken, COMPANY_CATEGORIES, type ApiCompany, type CompanyCategory } from "../../lib/api";
import { toast } from "../../lib/toast";

/**
 * 2026-10-07 - "whenever you see third party information, make sure it comes from the Directory":
 * a company field that is picked, never typed. It shows the company chosen; clicking opens the
 * Directory over the page (so it works inside tables and windows that clip a drop-down), with a
 * search, and adding a new company there when it is not in yet.
 */
const catLabel = (c: string) => COMPANY_CATEGORIES.find((x) => x.v === c)?.label || c;

export function DirectoryPickDialog({ title, categories, onPick, onClose, initialSearch = "" }: {
  title: string;
  /** The categories listed (none: every company); the first is where a company added here is filed. */
  categories: CompanyCategory[];
  onPick: (c: ApiCompany) => void;
  onClose: () => void;
  initialSearch?: string;
}) {
  const [list, setList] = useState<ApiCompany[] | null>(null);
  const [q, setQ] = useState(initialSearch);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    let alive = true;
    const wanted: Array<CompanyCategory | undefined> = categories.length ? categories : [undefined];
    Promise.all(wanted.map((c) => fetchCompanies(c).catch(() => [] as ApiCompany[]))).then((lists) => {
      if (!alive) return;
      const seen = new Set<string>();
      const all: ApiCompany[] = [];
      for (const l of lists) for (const c of l) if (!seen.has(c._id)) { seen.add(c._id); all.push(c); }
      setList(all.sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const needle = q.trim().toLowerCase();
  const shown = (list || []).filter((c) => !needle || `${c.name} ${c.email || ""}`.toLowerCase().includes(needle));
  const exact = (list || []).some((c) => c.name.trim().toLowerCase() === needle);
  const add = async () => {
    const name = q.trim();
    if (!name) return;
    setAdding(true);
    try {
      const cat = categories[0] || "other";
      const c = await createCompany({ name, category: cat });
      toast(`"${name}" added to the Directory (${catLabel(cat)}).`, "success");
      onPick(c);
    } catch (e) { toast(e instanceof Error ? e.message : "Could not add it to the Directory.", "error"); }
    finally { setAdding(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label={title} className="my-12 flex max-h-[80vh] w-full max-w-lg flex-col rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">{title}</p>
            <p className="text-[11px] text-slate-400">From the Directory{categories.length ? `: ${categories.map(catLabel).join(", ")}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="border-b border-slate-100 px-5 py-3">
          <label className="relative block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the Directory" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-primary/15" />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {list === null ? <p className="flex justify-center py-8 text-slate-300"><Loader2 size={18} className="animate-spin" /></p>
            : shown.length === 0 ? <p className="py-6 text-center text-xs italic text-slate-400">{list.length ? "No match." : "None in the Directory yet."}</p>
            : shown.map((c) => (
              <button key={c._id} type="button" onClick={() => onPick(c)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-50">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                  {c.logoUrl ? <img src={withFileToken(c.logoUrl)} alt="" className="h-full w-full object-contain" /> : <Building2 size={14} className="text-slate-300" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-800">{c.name}</span>
                  <span className="block truncate text-[10px] text-slate-400">{[catLabel(c.category), c.email || c.phone].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            ))}
        </div>
        {q.trim() && !exact && (
          <button type="button" onClick={() => void add()} disabled={adding} className="flex items-center gap-2 border-t border-slate-100 px-5 py-3 text-left text-xs font-bold text-primary hover:bg-primary/5 disabled:opacity-50">
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add "{q.trim()}" to the Directory as {categories.length ? `a ${catLabel(categories[0]).toLowerCase()}` : "a company (Other)"}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** A company's name, picked from the Directory (shown as a button that opens it). */
export default function DirectoryNameField({ value, onPick, onClear, categories, title, disabled, placeholder = "Pick from the Directory", className = "" }: {
  value: string;
  onPick: (c: ApiCompany) => void;
  /** Offered when there is a value: empties the field. */
  onClear?: () => void;
  categories: CompanyCategory[];
  title: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span className={`flex items-center gap-1 ${className}`}>
        <button type="button" disabled={disabled} onClick={() => setOpen(true)} title={value ? `${value} (from the Directory; click to change)` : placeholder}
          className="flex min-w-0 flex-1 items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-left text-xs text-slate-800 hover:border-primary disabled:cursor-default disabled:border-transparent disabled:bg-transparent">
          <span className={`truncate ${value ? "font-semibold" : "text-slate-400"}`}>{value || placeholder}</span>
          {!disabled && <ChevronDown size={12} className="shrink-0 text-slate-400" />}
        </button>
        {!disabled && value && onClear && <button type="button" onClick={onClear} aria-label="Clear" className="shrink-0 rounded p-0.5 text-slate-300 hover:text-red-500"><X size={12} /></button>}
      </span>
      {open && <DirectoryPickDialog title={title} categories={categories} initialSearch="" onClose={() => setOpen(false)} onPick={(c) => { setOpen(false); onPick(c); }} />}
    </>
  );
}
