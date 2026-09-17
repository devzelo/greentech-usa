import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";

// CR 197: one Export button instead of a row of Print / PDF / Word / attachment buttons. Each
// option says what it produces, so it is clear which one to pick.

export interface ExportOption {
  key: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  onSelect: () => void | Promise<void>;
  busy?: boolean;
  disabled?: boolean;
}

export default function ExportMenu({ options, label = "Export", className = "" }: { options: ExportOption[]; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const anyBusy = options.some((o) => o.busy);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
      >
        {anyBusy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {label}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-[70] mt-1.5 w-72 rounded-xl border border-slate-100 bg-white p-1.5 shadow-2xl">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              role="menuitem"
              disabled={o.disabled || o.busy}
              onClick={() => { setOpen(false); void o.onSelect(); }}
              className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
            >
              <span className="mt-0.5 shrink-0 text-slate-500">{o.busy ? <Loader2 size={14} className="animate-spin" /> : o.icon}</span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-800">{o.label}</span>
                {o.hint && <span className="block text-[10px] text-slate-400">{o.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
