import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

// CR 268 - the toolbar's actions live in menus instead of a row of ten buttons.
// CR 300 - shared with the schedule register, whose rows sit inside scrolling tables: the menu is
// drawn over the page, beside its button, so no table edge can cut it off.
export const MENU_ITEM = "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40";

export default function ToolMenu({ label, icon, tone = "plain", align = "right", children, title }: {
  label: string; icon: ReactNode; tone?: "plain" | "primary" | "solid" | "ghost"; align?: "left" | "right"; children: ReactNode; title?: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos(align === "right" ? { top: r.bottom + 4, right: window.innerWidth - r.right } : { top: r.bottom + 4, left: r.left });
    const close = (e: MouseEvent) => { if (!btn.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    // It stays by its button: a scroll of the page (not of the menu itself) closes it.
    const scroll = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    const resize = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [open, align]);
  // "solid" is a button in its own right (the blue Add), "primary" the caret half of a split button,
  // "ghost" a bare icon (a row's ⋮).
  const trigger = tone === "primary"
    ? "inline-flex items-center self-stretch rounded-r-lg px-2 text-xs font-bold text-white transition-colors hover:bg-blue-700"
    : tone === "solid"
      ? "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
      : tone === "ghost"
        ? "inline-flex items-center rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
        : "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-primary hover:text-primary";
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((v) => !v)} className={trigger} aria-haspopup="menu" aria-expanded={open} title={title || label} aria-label={label}>
        {icon}{tone === "primary" || tone === "ghost" ? "" : label}{tone !== "ghost" && <ChevronDown size={12} className={tone === "plain" ? "text-slate-400" : ""} />}
      </button>
      {open && pos && createPortal(
        <div ref={menu} role="menu" onClick={() => setOpen(false)} style={{ position: "fixed", top: pos.top, left: pos.left, right: pos.right }} className="z-[300] w-60 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
