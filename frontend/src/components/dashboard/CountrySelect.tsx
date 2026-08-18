import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { COUNTRIES } from "../../lib/countryFlag";

// Searchable country picker — type to filter the full country list instead of scrolling a long
// native <select>. Used on project create / update.
export default function CountrySelect({
  value, onChange, label, placeholder, disabled,
}: {
  value: string;
  onChange: (name: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  useEffect(() => { if (open) setQuery(""); }, [open]);

  const selected = COUNTRIES.find((c) => c.name === value);
  const q = query.trim().toLowerCase();
  const matches = COUNTRIES.filter((c) => !q || c.name.toLowerCase().includes(q) || c.iso.toLowerCase() === q);

  return (
    <div className="space-y-2" ref={wrapRef}>
      {label && <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium text-left focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <span className={value ? "text-slate-800" : "text-slate-400"}>
            {selected ? `${selected.flag} ${selected.name}` : value || placeholder || "Select a country…"}
          </span>
          <ChevronDown size={18} className={`text-slate-400 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute z-40 left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-100 shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-slate-50">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search countries…"
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/10"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {value && (
                <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-50">Clear selection</button>
              )}
              {matches.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-400 italic">No country matches.</p>
              ) : matches.map((c) => (
                <button
                  key={c.iso}
                  type="button"
                  onClick={() => { onChange(c.name); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-left hover:bg-slate-50 ${c.name === value ? "text-primary font-bold" : "text-slate-700"}`}
                >
                  <span className="text-[1.2em] leading-none">{c.flag}</span>
                  <span className="flex-grow truncate">{c.name}</span>
                  {c.name === value && <Check size={15} className="text-primary flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
