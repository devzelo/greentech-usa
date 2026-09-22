import { useEffect, useState, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";

/**
 * CR 276 (2026-09-22): a section of a page that can be folded away, so a long page stays readable.
 * The header keeps its own actions (Edit, Lock, Save) whether the body is open or shut, and the
 * open/closed choice is remembered per person and per section.
 */
export default function SectionCard({ title, icon, actions, storageKey, defaultOpen = true, children }: {
  title: string;
  icon?: ReactNode;
  /** Buttons that belong to the section, shown beside the fold control. */
  actions?: ReactNode;
  /** Remembers the open/closed state across visits when given. */
  storageKey?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(() => {
    if (!storageKey) return defaultOpen;
    try {
      const v = localStorage.getItem(storageKey);
      return v === null ? defaultOpen : v === "1";
    } catch { return defaultOpen; }
  });
  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, open ? "1" : "0"); } catch { /* ignore */ }
  }, [open, storageKey]);

  return (
    <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {icon}
          <h3 className="truncate font-display text-base font-bold text-slate-900">{title}</h3>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            title={open ? `Hide ${title}` : `Show ${title}`}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-400 hover:bg-slate-50 hover:text-slate-700"
          >
            <span className="hidden sm:inline">{open ? "Expanded" : "Collapsed"}</span>
            <ChevronUp size={16} className={`transition-transform ${open ? "" : "rotate-180"}`} />
          </button>
        </div>
      </div>
      {open && <div className="border-t border-slate-100 px-4 py-4 sm:px-5 sm:py-5">{children}</div>}
    </section>
  );
}
