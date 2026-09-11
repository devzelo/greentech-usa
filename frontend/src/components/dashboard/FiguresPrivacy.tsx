import type { ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { FIGURE_MASK, setFiguresShown, useFiguresShown } from "../../lib/figuresPrivacy";

// Privacy mode for financial figures (lib/figuresPrivacy): hidden by default, shown on demand.

/** A financial amount: shown as it is, or as "••••••" while figures are hidden. */
export function Fig({ children }: { children: ReactNode }) {
  const shown = useFiguresShown();
  if (shown) return <>{children}</>;
  return (
    <span className="tracking-[0.15em]" title="Financial numbers are hidden. Use Show numbers in the top bar." aria-label="Hidden amount">
      {FIGURE_MASK}
    </span>
  );
}

/**
 * The Show / Hide financial numbers switch. "bar" is the eye button in the dashboard's top bar,
 * always in reach; "inline" is the labelled switch placed beside a block of figures.
 */
export function FiguresToggle({ variant = "bar" }: { variant?: "bar" | "inline" }) {
  const shown = useFiguresShown();
  const flip = () => setFiguresShown(!shown);
  const hint = shown
    ? "Financial numbers are visible. They hide again on their own after 10 minutes, or on reload."
    : "Financial numbers are hidden (safe for screen sharing). Click to show them for a while.";

  if (variant === "inline") {
    return (
      <button type="button" onClick={flip} title={hint} aria-pressed={!shown}
        className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900">
        {shown ? <Eye size={15} /> : <EyeOff size={15} />}
        Hide financial numbers
        <span className={`relative w-9 h-5 rounded-full transition-colors ${shown ? "bg-slate-200" : "bg-primary"}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${shown ? "left-0.5" : "left-[18px]"}`} />
        </span>
      </button>
    );
  }
  return (
    <button type="button" onClick={flip} title={hint} aria-pressed={shown}
      className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-bold transition-colors ${shown ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "text-slate-400 hover:text-slate-900 hover:bg-slate-100"}`}>
      {shown ? <Eye size={17} /> : <EyeOff size={17} />}
      <span className="hidden md:inline">{shown ? "Numbers shown" : "Show numbers"}</span>
    </button>
  );
}
