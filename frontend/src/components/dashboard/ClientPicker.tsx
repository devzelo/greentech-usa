import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, Plus, Building2, Loader2, Check } from "lucide-react";
import { fetchCompanies, createCompany, type ApiCompany } from "../../lib/api";
import { toast } from "../../lib/toast";

// Client field with a Directory-backed dropdown: pick an existing client company (its details
// auto-fill the client fields) or add a brand-new one on the spot — which is saved straight into
// the Directory under the Client category. Used on the New Project form.
export default function ClientPicker({
  label, value, onNameChange, onSelectCompany, placeholder, hint,
}: {
  label: string;
  value: string;
  onNameChange: (v: string) => void;
  onSelectCompany: (c: ApiCompany) => void;
  placeholder?: string;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = () => {
    if (companies.length || loading) return;
    setLoading(true);
    fetchCompanies("client").then(setCompanies).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const q = value.trim().toLowerCase();
  const matches = companies.filter((c) => !q || c.name.toLowerCase().includes(q));
  const exact = companies.some((c) => c.name.trim().toLowerCase() === q);

  const pick = (c: ApiCompany) => { onSelectCompany(c); setOpen(false); };

  const addNew = async () => {
    const name = value.trim();
    if (!name) { toast("Type the client's name first.", "error"); return; }
    setCreating(true);
    try {
      const c = await createCompany({ name, category: "client" });
      setCompanies((p) => [c, ...p]);
      onSelectCompany(c);
      setOpen(false);
      toast(`"${name}" added to the Directory (Clients).`, "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not create the client.", "error"); }
    finally { setCreating(false); }
  };

  return (
    <div className="space-y-2" ref={wrapRef}>
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => { onNameChange(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); load(); }}
          placeholder={placeholder || "Search or type a client name…"}
          className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pr-11 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
        />
        <button type="button" onClick={() => { setOpen((v) => !v); load(); }} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-primary" title="Choose from Directory">
          <ChevronDown size={18} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute z-40 left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-100 shadow-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-50 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <Search size={12} /> Clients in Directory
            </div>
            <div className="max-h-64 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-6 text-slate-300"><Loader2 size={18} className="animate-spin" /></div>
              ) : matches.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-400 italic">{companies.length === 0 ? "No clients in the Directory yet." : "No client matches — add it below."}</p>
              ) : (
                matches.map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => pick(c)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                  >
                    <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><Building2 size={15} /></span>
                    <span className="min-w-0 flex-grow">
                      <span className="block text-sm font-bold text-slate-800 truncate">{c.name}</span>
                      <span className="block text-[10px] text-slate-400 truncate">{[c.contactPersons?.[0]?.name, c.email || c.phone].filter(Boolean).join(" · ") || "Client"}</span>
                    </span>
                    {c.name.trim().toLowerCase() === q && <Check size={15} className="text-primary flex-shrink-0" />}
                  </button>
                ))
              )}
            </div>
            {/* Add a new client on the spot — saved to the Directory (Clients). */}
            {value.trim() && !exact && (
              <button
                type="button"
                onClick={addNew}
                disabled={creating}
                className="w-full flex items-center gap-2 px-4 py-3 border-t border-slate-50 text-left text-xs font-bold text-primary hover:bg-primary/5 disabled:opacity-50"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add &ldquo;{value.trim()}&rdquo; as a new client
              </button>
            )}
          </div>
        )}
      </div>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}
