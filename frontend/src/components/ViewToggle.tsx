import { LayoutGrid, List } from "lucide-react";
import { useEffect, useState } from "react";

export type ViewMode = "grid" | "list";

export function useViewMode(defaultMode: ViewMode = "grid"): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      return "list";
    }
    return defaultMode;
  });
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = (e: MediaQueryListEvent) => setMode(e.matches ? "list" : defaultMode);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [defaultMode]);
  return [mode, setMode];
}

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

export default function ViewToggle({ mode, onChange, className = "" }: Props) {
  return (
    <div
      role="group"
      aria-label="View mode"
      className={`inline-flex items-center bg-slate-100 rounded-full p-1 ${className}`}
    >
      <button
        type="button"
        aria-pressed={mode === "grid"}
        aria-label="Grid view"
        onClick={() => onChange("grid")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
          mode === "grid"
            ? "bg-white text-primary shadow-sm"
            : "text-slate-500 hover:text-slate-900"
        }`}
      >
        <LayoutGrid size={14} />
        <span className="hidden sm:inline">Grid</span>
      </button>
      <button
        type="button"
        aria-pressed={mode === "list"}
        aria-label="List view"
        onClick={() => onChange("list")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
          mode === "list"
            ? "bg-white text-primary shadow-sm"
            : "text-slate-500 hover:text-slate-900"
        }`}
      >
        <List size={14} />
        <span className="hidden sm:inline">List</span>
      </button>
    </div>
  );
}
