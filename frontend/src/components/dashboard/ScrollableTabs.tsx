import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// CR-P-29 — a horizontally scrollable tab strip with left/right arrow buttons that appear only when
// the tabs overflow. The card styling is passed via `className` onto the scroll container itself.
export default function ScrollableTabs({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); window.removeEventListener("resize", update); };
  }, []);
  // Recheck whenever the children (tab set) change.
  useEffect(() => { update(); });

  const by = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.6), behavior: "smooth" });
  };

  const arrow = "absolute top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center text-slate-500 hover:text-primary transition-colors";

  return (
    <div className="relative">
      {canLeft && (
        <button type="button" onClick={() => by(-1)} aria-label="Scroll tabs left" className={`${arrow} left-1`}>
          <ChevronLeft size={16} />
        </button>
      )}
      <div ref={ref} className={`overflow-x-auto no-scrollbar ${className}`}>{children}</div>
      {canRight && (
        <button type="button" onClick={() => by(1)} aria-label="Scroll tabs right" className={`${arrow} right-1`}>
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
