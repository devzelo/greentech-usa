import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, GripVertical, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import {
  BAR_LABELS, COLUMN_LABELS, DEFAULT_COLORS, PRESETS, defaultDisplay, type BarColors, type ScheduleDisplay,
} from "../../../lib/scheduleDisplay";

/**
 * CR 323 (2026-09-28): the Display options panel. Two tick lists side by side, as in the client's
 * picture: the table's columns on the left, what is written on the chart on the right. Each line
 * can be ticked, and dragged (or moved with its arrows) to change the order. Below them: float and
 * actual dates, the phases in view, and the bar colours. Every change shows at once.
 */
export default function DisplayOptions({ value, onChange, phases, onClose }: {
  value: ScheduleDisplay;
  onChange: (d: ScheduleDisplay) => void;
  /** The schedule's phases, to choose which are shown and printed. */
  phases: string[];
  onClose: () => void;
}) {
  const set = (patch: Partial<ScheduleDisplay>) => onChange({ ...value, ...patch });
  const hidden = new Set(value.hiddenPhases);
  const color = (k: keyof BarColors, label: string) => (
    <label className="flex items-center gap-2 text-xs text-slate-700">
      <input type="color" value={value.colors[k]} onChange={(e) => set({ colors: { ...value.colors, [k]: e.target.value } })} className="h-6 w-8 cursor-pointer rounded border border-slate-200 bg-white p-0" aria-label={label} />
      {label}
    </label>
  );
  const sw = "flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700";
  const head = "text-[10px] font-bold uppercase tracking-widest text-slate-400";
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-900/30 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Display options" className="my-10 w-full max-w-3xl rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><SlidersHorizontal size={15} className="text-blue-600" /> Display options</p>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={head}>Presets</span>
            {PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => onChange(p.apply(value))} title={p.hint} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-primary hover:text-primary">{p.label}</button>
            ))}
            <button type="button" onClick={() => onChange({ ...defaultDisplay(), hiddenPhases: value.hiddenPhases })} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100"><RotateCcw size={12} /> Reset to defaults</button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TickList title="Left table: columns" items={value.columns} labels={COLUMN_LABELS} locked={["name"]} onChange={(columns) => set({ columns })} />
            <TickList title="Gantt chart: bars" items={value.bars} labels={BAR_LABELS} onChange={(bars) => set({ bars })} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <p className={head}>Also on the chart</p>
              <label className={sw}><input type="checkbox" checked={value.float} onChange={(e) => set({ float: e.target.checked })} className="accent-blue-600" /> Show float</label>
              <label className={sw}><input type="checkbox" checked={value.actual} onChange={(e) => set({ actual: e.target.checked })} className="accent-blue-600" /> Show actual dates</label>
            </div>
            <div className="space-y-2">
              <p className={head}>Phases to show</p>
              {phases.length === 0 ? <p className="text-xs text-slate-400">This schedule has no phases yet.</p> : (
                <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                  {phases.map((c, i) => (
                    <label key={c} className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                      <input type="checkbox" checked={!hidden.has(c)} onChange={(e) => set({ hiddenPhases: e.target.checked ? value.hiddenPhases.filter((x) => x !== c) : [...value.hiddenPhases, c] })} className="mt-0.5 accent-blue-600" />
                      <span><b className="text-slate-500">{i + 1}</b> {c}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-slate-400">Only the ticked phases are shown, printed and exported.</p>
            </div>
            <div className="space-y-2">
              <p className={head}>Bar colours</p>
              {color("critical", "Critical task")}
              {color("normal", "Non-critical task")}
              {color("milestone", "Milestone")}
              <button type="button" onClick={() => set({ colors: { ...DEFAULT_COLORS } })} className="text-[11px] font-bold text-slate-500 hover:text-primary">Reset the colours</button>
              <p className="text-[10px] text-slate-400">Each phase's colour is set on the phase.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
          <p className="text-[11px] text-slate-500">Kept for you on this project. Print and export follow what is shown.</p>
          <button type="button" onClick={onClose} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A list of ticks that can be reordered: by dragging a line, or with its arrows. */
function TickList<K extends string>({ title, items, labels, locked = [], onChange }: {
  title: string; items: Array<{ key: K; on: boolean }>; labels: Record<K, string>; locked?: K[]; onChange: (items: Array<{ key: K; on: boolean }>) => void;
}): ReactNode {
  const from = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const move = (a: number, b: number) => {
    if (b < 0 || b >= items.length || a === b) return;
    const next = [...items];
    const [x] = next.splice(a, 1);
    next.splice(b, 0, x);
    onChange(next);
  };
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</p>
      <ul className="mt-1.5 rounded-xl border border-slate-100">
        {items.map((it, i) => (
          <li
            key={it.key}
            draggable
            onDragStart={() => { from.current = i; }}
            onDragOver={(e) => { if (from.current !== null) { e.preventDefault(); setOver(i); } }}
            onDragLeave={() => setOver((v) => (v === i ? null : v))}
            onDrop={(e) => { e.preventDefault(); if (from.current !== null) move(from.current, i); from.current = null; setOver(null); }}
            onDragEnd={() => { from.current = null; setOver(null); }}
            className={`flex items-center gap-1.5 border-b border-slate-50 px-2 py-1 last:border-b-0 ${over === i ? "bg-blue-50" : ""}`}
          >
            <GripVertical size={13} className="shrink-0 cursor-grab text-slate-300" />
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={it.on} disabled={locked.includes(it.key)} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} className="accent-blue-600" />
              <span className="truncate">{labels[it.key]}</span>
            </label>
            <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${labels[it.key]} up`} className="rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"><ArrowUp size={12} /></button>
            <button type="button" onClick={() => move(i, i + 1)} disabled={i === items.length - 1} aria-label={`Move ${labels[it.key]} down`} className="rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"><ArrowDown size={12} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
