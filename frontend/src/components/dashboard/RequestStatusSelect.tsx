import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { ProjectRequestStatus } from "../../lib/api";

/**
 * 2026-10-08 - the contract-admin request status, as the client drew it: a drop-down with a coloured
 * dot per status, Closed set apart at the bottom. Requests saved before keep working: Sent and
 * Responded read as Submitted / Under Review, Cancelled as Closed.
 */
export const REQUEST_STATUSES: Array<{ v: ProjectRequestStatus; label: string; dot: string; apart?: boolean }> = [
  { v: "Draft", label: "Draft", dot: "#9CA3AF" },
  { v: "Submitted", label: "Submitted / Under Review", dot: "#1A73E8" },
  { v: "Approved", label: "Approved", dot: "#16A34A" },
  { v: "ApprovedWithComments", label: "Approved with Comments", dot: "#8BC34A" },
  { v: "Rejected", label: "Rejected", dot: "#E53935" },
  { v: "ReviseResubmit", label: "Revise & Resubmit", dot: "#F59E0B" },
  { v: "Closed", label: "Closed", dot: "#1E293B", apart: true },
];
export const normRequestStatus = (s?: string): ProjectRequestStatus =>
  s === "Sent" || s === "Responded" ? "Submitted" : s === "Cancelled" ? "Closed" : ((REQUEST_STATUSES.some((x) => x.v === s) ? s : "Draft") as ProjectRequestStatus);
export const requestStatusMeta = (s?: string) => REQUEST_STATUSES.find((x) => x.v === normRequestStatus(s)) || REQUEST_STATUSES[0];

const Dot = ({ color, size = 10 }: { color: string; size?: number }) => (
  <span aria-hidden="true" className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />
);

/** The status as a read-only pill (dot and label). */
export function RequestStatusPill({ status }: { status?: string }) {
  const m = requestStatusMeta(status);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-100 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700">
      <Dot color={m.dot} size={8} /> {m.label}
    </span>
  );
}

export default function RequestStatusSelect({ value, onChange, disabled, compact, id }: {
  value?: string;
  onChange: (s: ProjectRequestStatus) => void;
  disabled?: boolean;
  /** A small pill for table rows; otherwise a full-width form field. */
  compact?: boolean;
  id?: string;
}) {
  const cur = requestStatusMeta(value);
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 240);
    const height = 44 * REQUEST_STATUSES.length + 24;
    const below = window.innerHeight - r.bottom > height + 8 || r.top < height;
    setPos({ top: below ? r.bottom + 6 : r.top - height - 6, left: Math.min(r.left, window.innerWidth - width - 8), width });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    // A fixed list detaches from its button on scroll or resize: close it instead.
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
  }, [open]);

  const openList = () => { if (disabled) return; setActive(Math.max(0, REQUEST_STATUSES.findIndex((x) => x.v === cur.v))); setOpen(true); };
  const pick = (v: ProjectRequestStatus) => { setOpen(false); btn.current?.focus(); if (v !== cur.v) onChange(v); };
  const onKey = (e: KeyboardEvent) => {
    if (!open) { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openList(); } return; }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(REQUEST_STATUSES.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(REQUEST_STATUSES[active].v); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <>
      <button ref={btn} id={id} type="button" disabled={disabled} onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKey}
        aria-haspopup="listbox" aria-expanded={open} aria-label={`Status: ${cur.label}`}
        className={compact
          ? "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:border-slate-300 disabled:cursor-default disabled:hover:border-slate-200"
          : `flex w-full items-center gap-2.5 rounded-xl border bg-slate-50 px-3 py-2.5 text-left text-sm font-semibold text-slate-800 outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-60 ${open ? "border-blue-300 bg-white ring-2 ring-blue-100" : "border-slate-200"}`}>
        <Dot color={cur.dot} size={compact ? 8 : 10} />
        <span className={compact ? "" : "min-w-0 flex-1 truncate"}>{cur.label}</span>
        {!disabled && <ChevronDown size={compact ? 12 : 16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[399]" onMouseDown={() => setOpen(false)} />
          <ul role="listbox" aria-label="Status" className="fixed z-[400] overflow-hidden rounded-2xl border border-slate-100 bg-white py-1.5 shadow-xl"
            style={{ top: pos.top, left: pos.left, width: pos.width }}>
            {REQUEST_STATUSES.map((x, i) => (
              <li key={x.v} role="presentation">
                {x.apart && <div className="mx-3 my-1.5 border-t border-slate-100" />}
                <button type="button" role="option" aria-selected={x.v === cur.v} onMouseEnter={() => setActive(i)} onClick={() => pick(x.v)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-slate-800 ${x.v === cur.v ? "bg-blue-50" : i === active ? "bg-slate-50" : ""}`}>
                  <Dot color={x.dot} size={12} /> {x.label}
                </button>
              </li>
            ))}
          </ul>
        </>,
        document.body,
      )}
    </>
  );
}
