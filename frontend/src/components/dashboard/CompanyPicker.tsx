import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Search, Plus, Building2, Loader2, Check, ExternalLink } from "lucide-react";
import { fetchCompanies, createCompany, withFileToken, COMPANY_CATEGORIES, type ApiCompany, type CompanyCategory } from "../../lib/api";
import { toast } from "../../lib/toast";

const catLabel = (c: CompanyCategory) => COMPANY_CATEGORIES.find((x) => x.v === c)?.label || c;

// CR-P-43 — reusable Directory-backed company picker. Every party field in a project (vendor,
// subcontractor, partner, client, manufacturer…) uses this: pick an existing Directory company,
// quick-add a new one on the spot (saved straight into the Directory), or open the Directory on the
// matching category tab for the full form. Selecting a company fills the caller's name + detail
// fields via onSelectCompany.
export default function CompanyPicker({
  label, value, category, categories, onNameChange, onSelectCompany, placeholder, hint, size = "md", allowFreeText = true,
}: {
  label?: string;
  value: string;
  category: CompanyCategory;                 // primary category — used for quick-add + the Directory link tab
  categories?: CompanyCategory[];            // optional: also list these categories (defaults to just `category`)
  onNameChange: (v: string) => void;
  onSelectCompany: (c: ApiCompany) => void;
  placeholder?: string;
  hint?: string;
  size?: "md" | "sm";
  allowFreeText?: boolean;                    // keep the typed value even if no company is picked
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const wanted = categories && categories.length ? categories : [category];

  const load = () => {
    setLoading(true);
    // Fetch each wanted category (usually one). Merge + de-dupe by id.
    Promise.all(wanted.map((c) => fetchCompanies(c).catch(() => [])))
      .then((lists) => {
        const seen = new Set<string>();
        const merged: ApiCompany[] = [];
        for (const l of lists) for (const c of l) if (!seen.has(c._id)) { seen.add(c._id); merged.push(c); }
        merged.sort((a, b) => a.name.localeCompare(b.name));
        setCompanies(merged);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const q = (value || "").trim().toLowerCase();
  const matches = companies.filter((c) => !q || c.name.toLowerCase().includes(q));
  const exact = companies.some((c) => c.name.trim().toLowerCase() === q);

  const pick = (c: ApiCompany) => { onNameChange(c.name); onSelectCompany(c); setOpen(false); };

  const addNew = async () => {
    const name = (value || "").trim();
    if (!name) { toast("Type the company name first.", "error"); return; }
    setCreating(true);
    try {
      const c = await createCompany({ name, category });
      setCompanies((p) => [c, ...p]);
      pick(c);
      toast(`"${name}" added to the Directory (${catLabel(category)}).`, "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not create the company.", "error"); }
    finally { setCreating(false); }
  };

  const openDirectory = () => {
    const name = (value || "").trim();
    navigate(`/dashboard/directory?category=${category}&new=1${name ? `&name=${encodeURIComponent(name)}` : ""}`);
  };

  const inputCls = size === "sm"
    ? "w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 pr-9 text-sm outline-none focus:ring-2 focus:ring-primary/15 focus:bg-white"
    : "w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pr-11 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all";

  return (
    <div className={size === "sm" ? "relative" : "space-y-2"} ref={wrapRef}>
      {label && <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => { onNameChange(e.target.value); setOpen(true); if (!allowFreeText) { /* value still shown while choosing */ } }}
          onFocus={() => { setOpen(true); load(); }}
          placeholder={placeholder || `Search or add a ${catLabel(category).toLowerCase()}…`}
          className={inputCls}
        />
        <button type="button" onClick={() => { setOpen((v) => !v); if (!open) load(); }} className={`absolute ${size === "sm" ? "right-2" : "right-3"} top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-primary`} title="Choose from Directory">
          <ChevronDown size={size === "sm" ? 15 : 18} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-100 shadow-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-50 flex items-center justify-between gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span className="flex items-center gap-2"><Search size={12} /> {wanted.map(catLabel).join(" / ")} in Directory</span>
              <button type="button" onClick={openDirectory} className="inline-flex items-center gap-1 text-primary hover:underline normal-case tracking-normal" title="Open the Directory for the full form">
                <ExternalLink size={11} /> Open in Directory
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-6 text-slate-300"><Loader2 size={18} className="animate-spin" /></div>
              ) : matches.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-400 italic">{companies.length === 0 ? "None in the Directory yet — add one below." : "No match — add it below or open the Directory."}</p>
              ) : (
                matches.map((c) => (
                  <button key={c._id} type="button" onClick={() => pick(c)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors">
                    <span className="w-8 h-8 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {c.logoUrl ? <img src={withFileToken(c.logoUrl)} alt="" className="w-full h-full object-contain" /> : <Building2 size={15} className="text-slate-300" />}
                    </span>
                    <span className="min-w-0 flex-grow">
                      <span className="block text-sm font-bold text-slate-800 truncate">{c.name}</span>
                      <span className="block text-[10px] text-slate-400 truncate">{[catLabel(c.category), c.contactPersons?.[0]?.name, c.email || c.phone].filter(Boolean).join(" · ")}</span>
                    </span>
                    {c.name.trim().toLowerCase() === q && <Check size={15} className="text-primary flex-shrink-0" />}
                  </button>
                ))
              )}
            </div>
            {/* Quick-add a new company — saved straight into the Directory under `category`. */}
            {(value || "").trim() && !exact && (
              <button type="button" onClick={addNew} disabled={creating} className="w-full flex items-center gap-2 px-4 py-3 border-t border-slate-50 text-left text-xs font-bold text-primary hover:bg-primary/5 disabled:opacity-50">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add &ldquo;{(value || "").trim()}&rdquo; as a new {catLabel(category).toLowerCase()}
              </button>
            )}
          </div>
        )}
      </div>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}
