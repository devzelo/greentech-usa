import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { BOQ_COLUMNS, MAX_COL_W, MIN_COL_W, colById, type BoqColId } from "../../lib/boqColumns";

/**
 * 2026-10-09 - the BOQ table's columns as this viewer left them: which are shown, how wide each is,
 * whether the BOQ reads by category or as one list, and whether it keeps fitting the screen. Kept
 * in the browser (a viewer's preference, like a remembered tab); the BOQ itself never depends on it.
 */
type Saved = { on: Record<BoqColId, boolean>; w: Record<BoqColId, number>; flat: boolean; fit: boolean };
const KEY = "gt:boq-columns:v1";
const defaults = (): Saved => ({
  on: Object.fromEntries(BOQ_COLUMNS.map((c) => [c.id, c.on])) as Record<BoqColId, boolean>,
  w: Object.fromEntries(BOQ_COLUMNS.map((c) => [c.id, c.w])) as Record<BoqColId, number>,
  flat: false,
  // Until a column is sized by hand, the table fits the screen: everything in view.
  fit: true,
});
const clampW = (n: number) => Math.round(Math.min(MAX_COL_W, Math.max(MIN_COL_W, n)));
function read(): Saved {
  const d = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<Saved> | null;
    if (!raw) return d;
    for (const c of BOQ_COLUMNS) {
      if (typeof raw.on?.[c.id] === "boolean") d.on[c.id] = raw.on[c.id];
      if (typeof raw.w?.[c.id] === "number" && isFinite(raw.w[c.id])) d.w[c.id] = clampW(raw.w[c.id]);
    }
    d.flat = !!raw.flat;
    if (typeof raw.fit === "boolean") d.fit = raw.fit;
  } catch { /* storage blocked or unreadable: the defaults */ }
  return d;
}

// Text widths for "Auto-fit", measured with the page's own font.
let measureCtx: CanvasRenderingContext2D | null = null;
export function textWidth(text: string, font: string): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}
const family = () => (typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "sans-serif");

/** The space a cell needs around its text: the cell's padding plus its box (a date picker, a chevron). */
const EXTRA: Partial<Record<BoqColId, number>> = { brand: 44, rev: 34, status: 34, submittal: 26, needOnSite: 34 };
const CELL_PAD = 30;
/** The narrowest a column gets when the table is fitted to the screen (its heading sets a floor too). */
const FIT_MIN: Partial<Record<BoqColId, number>> = { description: 170, spec: 130, brand: 100, needOnSite: 118, orderBy: 106, status: 108 };
/** The width a heading needs: its label, the sort arrows and the cell padding. */
const headWidth = (id: BoqColId) => {
  const label = colById(id).label;
  return Math.ceil(textWidth(label.toUpperCase(), `700 10px ${family()}`) + label.length + 15 + 18);
};

export function useBoqColumns() {
  const [saved, setSaved] = useState<Saved>(read);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* not kept: fine */ } }, [saved]);
  // The tables read their widths from CSS variables on this box, so a drag only restyles it.
  const boxRef = useRef<HTMLDivElement | null>(null);

  const visible = BOQ_COLUMNS.filter((c) => saved.on[c.id]);
  const widthVars = Object.fromEntries(BOQ_COLUMNS.map((c) => [`--boq-w-${c.id}`, `${saved.w[c.id]}px`])) as CSSProperties;
  const colWidth = (id: BoqColId) => `var(--boq-w-${id})`;
  /** The table's width: its columns plus the fixed ones (tick box, actions). */
  const tableWidth = (fixed: number) => `calc(${visible.map((c) => colWidth(c.id)).join(" + ") || "0px"} + ${fixed}px)`;

  const setOn = (id: BoqColId, on: boolean) => setSaved((s) => ({ ...s, on: { ...s.on, [id]: on } }));
  const showAll = () => setSaved((s) => ({ ...s, on: Object.fromEntries(BOQ_COLUMNS.map((c) => [c.id, true])) as Record<BoqColId, boolean> }));
  const setFlat = (flat: boolean) => setSaved((s) => ({ ...s, flat, on: flat ? { ...s.on, category: true } : s.on }));
  /** New widths; `fit` says whether the table goes on fitting the screen (sizing by hand stops it). */
  const setWidths = (w: Partial<Record<BoqColId, number>>, fit: boolean) =>
    setSaved((s) => ({ ...s, fit, w: { ...s.w, ...Object.fromEntries(Object.entries(w).map(([k, v]) => [k, clampW(v as number)])) } }));
  const reset = () => setSaved((s) => ({ ...defaults(), flat: s.flat }));

  /** Drag a header's edge: the box is restyled as the pointer moves, the width kept on release. */
  const startResize = (id: BoqColId, e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const startX = e.clientX, startW = saved.w[id];
    let now = startW;
    try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
    const move = (ev: PointerEvent) => {
      now = clampW(startW + ev.clientX - startX);
      boxRef.current?.style.setProperty(`--boq-w-${id}`, `${now}px`);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (now !== startW) setWidths({ [id]: now }, false);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  /** The arrow keys resize too (10 px a press), for a keyboard. */
  const keyResize = (id: BoqColId, e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setWidths({ [id]: saved.w[id] + (e.key === "ArrowRight" ? 10 : -10) }, false);
  };

  /** The width a column needs for its heading and its longest line (capped for long text). */
  const naturalWidth = (id: BoqColId, texts: string[]) => {
    const def = colById(id);
    const f = family();
    const font = id === "status" || id === "submittal" ? `700 10px ${f}` : `500 12px ${f}`;
    let body = 0;
    for (const t of texts) for (const line of String(t || "").split(/\r?\n/)) body = Math.max(body, textWidth(line, font));
    if (id === "needOnSite") body = Math.max(body, textWidth("00/00/0000", font) + 30);
    const want = Math.max(headWidth(id), body ? body + CELL_PAD + (EXTRA[id] || 0) : 0);
    return clampW(Math.min(def.max, want));
  };
  /** Size every shown column to its content (the table may then run past the screen). */
  const autoFit = (textsOf: (id: BoqColId) => string[]) =>
    setWidths(Object.fromEntries(visible.map((c) => [c.id, naturalWidth(c.id, textsOf(c.id))])), false);
  const autoFitOne = (id: BoqColId, texts: string[]) => setWidths({ [id]: naturalWidth(id, texts) }, false);
  /**
   * Fit the shown columns to the width at hand, so the whole BOQ is in view, and keep doing so as
   * the screen, the columns or the view change. Each column starts at what its content needs; when
   * that is too wide, each gives way toward its floor (Description and Spec keep the most room);
   * spare room goes to Description and Spec.
   */
  const fitTo = (avail: number, textsOf: (id: BoqColId) => string[]) => {
    if (avail <= 0 || !visible.length) return;
    const w: Record<string, number> = Object.fromEntries(visible.map((c) => [c.id, naturalWidth(c.id, textsOf(c.id))]));
    const floor: Record<string, number> = Object.fromEntries(visible.map((c) => [c.id, Math.min(w[c.id], Math.max(headWidth(c.id), FIT_MIN[c.id] || (c.wrap ? 80 : MIN_COL_W)))]));
    const sum = () => visible.reduce((s, c) => s + w[c.id], 0);
    if (sum() > avail) {
      const room = visible.reduce((s, c) => s + (w[c.id] - floor[c.id]), 0);
      const k = room ? Math.min(1, (sum() - avail) / room) : 0;
      for (const c of visible) w[c.id] -= (w[c.id] - floor[c.id]) * k;
      // Still too wide at every floor (a narrow screen): all of them together.
      if (sum() > avail) { const r = avail / sum(); for (const c of visible) w[c.id] = Math.max(MIN_COL_W, w[c.id] * r); }
    } else {
      const grow = visible.filter((c) => c.id === "description" || c.id === "spec");
      const to = grow.length ? grow : visible;
      const extra = avail - sum();
      for (const c of to) w[c.id] += extra / to.length;
    }
    const next = Object.fromEntries(visible.map((c) => [c.id, Math.floor(w[c.id])]));
    // Nothing to change: leave the state alone (this runs whenever the screen or the columns move).
    if (saved.fit && visible.every((c) => saved.w[c.id] === clampW(next[c.id]))) return;
    setWidths(next, true);
  };

  return {
    flat: saved.flat, fit: saved.fit, on: saved.on, widths: saved.w, visible, boxRef, widthVars, colWidth, tableWidth,
    setOn, showAll, setFlat, reset, startResize, keyResize, autoFit, autoFitOne, fitTo,
  };
}
