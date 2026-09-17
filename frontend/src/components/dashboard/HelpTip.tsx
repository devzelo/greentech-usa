import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, HelpCircle } from "lucide-react";

/**
 * CR 198: "you need to make it a little more user friendly ... when you hover over this, it should
 * tell you what this is". A small question mark that explains a control on hover, focus or tap, and
 * a "How this works" panel that explains a whole screen at once.
 */
export default function HelpTip({ title, children, side = "bottom", className = "", size = 13 }: {
  title?: string;
  children: ReactNode;
  side?: "bottom" | "top";
  className?: string;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const W = 260;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - W / 2, window.innerWidth - W - 8));
    setPos({ top: side === "top" ? r.top - 8 : r.bottom + 8, left });
  };
  useLayoutEffect(() => { if (open) place(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <>
      {/* A span, not a button: these tips sit inside buttons and tabs. */}
      <span
        ref={btn}
        role="button"
        tabIndex={0}
        aria-label={title ? `What is ${title}?` : "Explain this"}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); } }}
        className={`inline-flex shrink-0 cursor-help items-center text-slate-300 hover:text-primary focus:text-primary focus:outline-none ${className}`}
      >
        <HelpCircle size={size} />
      </span>
      {open && pos && createPortal(
        <div
          role="tooltip"
          className="fixed z-[300] w-[260px] rounded-xl border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-600 shadow-2xl"
          style={{ left: pos.left, ...(side === "top" ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
        >
          {title && <p className="mb-1 text-[11px] font-bold text-slate-900">{title}</p>}
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}

/** A closed-by-default panel that explains a screen, so nobody has to guess what a control does. */
export function HelpPanel({ title = "How this works", children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border border-slate-100 bg-slate-50/70 ${className}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-slate-600 hover:text-primary">
        <HelpCircle size={13} className="text-primary" /> {title}
        <ChevronDown size={13} className={`ml-auto text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-1.5 border-t border-slate-100 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">{children}</div>}
    </div>
  );
}

/** One "icon: what it does" line inside a HelpPanel. */
export function HelpRow({ icon, label, children }: { icon?: ReactNode; label: string; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2">
      {icon && <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>}
      <span><b className="text-slate-700">{label}:</b> {children}</span>
    </p>
  );
}
