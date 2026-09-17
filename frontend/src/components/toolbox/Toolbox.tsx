import { useEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import {
  Calculator as CalcIcon, CalendarDays, Camera, ChevronLeft, Coins, FileStack, FolderOpen, Image as ImageIcon,
  Pencil, Percent, Ruler, Sparkles, StickyNote, Timer, Type, Wrench, X,
} from "lucide-react";
import { useCapturing, type CaptureKind } from "./capture";
import { useSnip } from "./SnipTool";
import { useClockRunning } from "./timerStore";
import Calculator from "./Calculator";
import MarginCalculator from "./MarginCalculator";
import UnitConverter from "./UnitConverter";
import CurrencyConverter from "./CurrencyConverter";
import DateCalculator from "./DateCalculator";
import QuickNotes from "./QuickNotes";
import SnipTool from "./SnipTool";
import DrawOverlay from "./DrawOverlay";
import ImageTools from "./ImageTools";
import PdfTools from "./PdfTools";
import TextTools from "./TextTools";
import TimerTool from "./TimerTool";
import AiTools from "./AiTools";
import SavedFiles from "./SavedFiles";

// Quick Toolbox (client list, 2026-09-17): a Tools button in the top bar, on every page, opening a
// compact panel of everyday tools. The panel stays open while you work on the page; Esc or X
// closes it. Timers, the drawing and open editors keep going when the panel is closed.

type ToolKey = "calc" | "margin" | "units" | "currency" | "date" | "notes" | "snip" | "draw" | "image" | "pdf" | "text" | "timer" | "ai" | "saved";
type Tool = { key: ToolKey; label: string; hint: string; icon: ComponentType<{ size?: number; className?: string }> };

const GROUPS: Array<{ title: string; tools: Tool[] }> = [
  { title: "Calculate", tools: [
    { key: "calc", label: "Calculator", hint: "Everyday maths", icon: CalcIcon },
    { key: "margin", label: "Markup / Margin", hint: "Price, profit, tax, %", icon: Percent },
    { key: "units", label: "Unit Converter", hint: "Engineering units", icon: Ruler },
    { key: "currency", label: "Currency", hint: "Today's rates", icon: Coins },
    { key: "date", label: "Date Calculator", hint: "Durations, DLP, warranty", icon: CalendarDays },
  ] },
  { title: "Capture and edit", tools: [
    { key: "snip", label: "Screenshot / Snip", hint: "Page, screen or area", icon: Camera },
    { key: "draw", label: "Draw / Annotate", hint: "Draw over the screen", icon: Pencil },
    { key: "image", label: "Image Tools", hint: "Crop, resize, compress", icon: ImageIcon },
    { key: "pdf", label: "PDF Tools", hint: "Merge, split, rotate", icon: FileStack },
  ] },
  { title: "Write and organise", tools: [
    { key: "notes", label: "Quick Notes", hint: "Scratchpad and notes", icon: StickyNote },
    { key: "text", label: "Text Tools", hint: "Count, case, clean up", icon: Type },
    { key: "timer", label: "Timer / Stopwatch", hint: "Meetings and tasks", icon: Timer },
    { key: "ai", label: "Quick AI Tools", hint: "Coming soon", icon: Sparkles },
    { key: "saved", label: "Saved Files", hint: "Your toolbox files", icon: FolderOpen },
  ] },
];
const ALL = GROUPS.flatMap((g) => g.tools);
const LS_KEY = "gt-toolbox-last";

export default function Toolbox() {
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState<ToolKey | null>(() => {
    try { const k = localStorage.getItem(LS_KEY) as ToolKey | null; return k && ALL.some((t) => t.key === k) && k !== "draw" ? k : null; } catch { return null; }
  });
  const [drawing, setDrawing] = useState(false);
  const [selection, setSelection] = useState("");
  const capturing = useCapturing();
  const clockRunning = useClockRunning();
  const snip = useSnip();
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { try { if (tool) localStorage.setItem(LS_KEY, tool); else localStorage.removeItem(LS_KEY); } catch { /* ignore */ } }, [tool]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "Escape" || drawing || document.querySelector("[data-toolbox-modal]")) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA") && t.closest("[data-toolbox-panel]") == null) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, drawing]);

  const pick = (k: ToolKey) => {
    if (k === "draw") { setDrawing(true); setOpen(false); return; }
    setTool(k);
  };
  const take = (kind: CaptureKind, select?: boolean) => { void snip.take(kind, select); };
  const edit = (f: File) => snip.open(f);

  const current = ALL.find((t) => t.key === tool);
  const body = (() => {
    switch (tool) {
      case "calc": return <Calculator />;
      case "margin": return <MarginCalculator />;
      case "units": return <UnitConverter />;
      case "currency": return <CurrencyConverter />;
      case "date": return <DateCalculator />;
      case "notes": return <QuickNotes />;
      case "snip": return <SnipTool onTake={take} onEdit={edit} />;
      case "image": return <ImageTools onEdit={edit} />;
      case "pdf": return <PdfTools />;
      case "text": return <TextTools />;
      case "timer": return <TimerTool />;
      case "ai": return <AiTools selection={selection} />;
      case "saved": return <SavedFiles onEdit={edit} />;
      default: return null;
    }
  })();

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        // Remember any text selected on the page before focus moves to the panel (for AI tools).
        onMouseDown={() => setSelection(window.getSelection()?.toString().trim() || "")}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Toolbox"
        title="Toolbox: calculator, converters, screenshot, draw, PDF and image tools, notes, timer"
        className={`relative p-2 rounded-lg transition-colors ${open ? "bg-emerald-50 text-primary" : "text-slate-500 hover:bg-slate-100 hover:text-primary"}`}
      >
        <Wrench size={18} />
        {clockRunning && <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-amber-500 ring-2 ring-white" title="A timer is running" />}
      </button>

      {open && createPortal(
        <div
          data-toolbox-panel
          className="fixed right-2 top-[4.5rem] z-[190] flex max-h-[calc(100vh-5.5rem)] w-[min(26rem,calc(100vw-1rem))] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-6 sm:top-[5.25rem]"
          style={{ visibility: capturing ? "hidden" : "visible" }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
            {current ? (
              <button type="button" onClick={() => setTool(null)} className="flex min-w-0 items-center gap-1 rounded-lg px-1 py-0.5 text-sm font-bold text-slate-800 hover:bg-slate-100">
                <ChevronLeft size={16} className="shrink-0 text-slate-400" />
                <current.icon size={15} className="shrink-0 text-primary" />
                <span className="truncate">{current.label}</span>
              </button>
            ) : (
              <p className="flex items-center gap-1.5 px-1 text-sm font-bold text-slate-800"><Wrench size={15} className="text-primary" /> Toolbox</p>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close toolbox" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {current ? body : (
              <div className="space-y-3">
                {GROUPS.map((g) => (
                  <section key={g.title}>
                    <p className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">{g.title}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {g.tools.map((t) => (
                        <button key={t.key} type="button" onClick={() => pick(t.key)}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-primary hover:bg-emerald-50/50">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-primary"><t.icon size={16} /></span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-bold text-slate-800">{t.label}</span>
                            <span className="block truncate text-[10px] text-slate-400">{t.hint}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {drawing && <DrawOverlay onClose={() => setDrawing(false)} onScreenshot={() => take("tab")} />}
      {snip.ui}
    </>
  );
}
