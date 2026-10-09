import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * 2026-10-09 - the floating list under a picker (stamps, logos, signatures). Drawn on the page itself,
 * so a scrolling editor window never clips it; it follows its button when the page scrolls, opens
 * upward when there is no room below, and closes on Escape or a click outside.
 */
export default function PickerDropdown({ open, onClose, anchorRef, children, minWidth = 300, label }: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  minWidth?: number;
  label: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; bottom: number; left: number; width: number; up: boolean; maxH: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
      const up = below < 280 && above > below;
      const width = Math.min(Math.max(r.width, minWidth), window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos({ top: r.bottom + 4, bottom: window.innerHeight - r.top + 4, left, width, up, maxH: Math.min(440, Math.max(160, up ? above : below)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, anchorRef, minWidth]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !anchorRef.current?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); anchorRef.current?.focus(); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key, true); };
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;
  return createPortal(
    <div ref={panelRef} role="listbox" aria-label={label}
      style={{ position: "fixed", left: pos.left, width: pos.width, maxHeight: pos.maxH, ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }) }}
      className="z-[300] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl">
      {children}
    </div>,
    document.body,
  );
}
