import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

/**
 * Renders a popup menu in document.body, positioned just below the anchor element.
 * Escapes any scrollable / overflow-clipped parent (like the tab bar).
 */
export default function PortalMenu({ open, anchor, onClose, children, width = 208 }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !anchor) {
      setPos(null);
      return;
    }
    const update = () => {
      const r = anchor.getBoundingClientRect();
      let left = r.left;
      // keep on-screen horizontally
      const max = window.innerWidth - width - 12;
      if (left > max) left = max;
      if (left < 8) left = 8;
      setPos({ top: r.bottom + 4, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchor, width]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && anchor && !anchor.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchor, onClose]);

  if (!open || !pos) return null;
  return createPortal(
    <div
      ref={menuRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, width, zIndex: 250 }}
      className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-1.5"
    >
      {children}
    </div>,
    document.body
  );
}
