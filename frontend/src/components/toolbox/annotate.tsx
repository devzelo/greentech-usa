import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowUpRight, Circle, Eraser, Highlighter, Minus, Pencil, Redo2, Square, Trash, Type, Undo2 } from "lucide-react";

// Shared annotation engine for the toolbox: Draw over the screen, the snip editor and Image Tools.
// Shapes are kept in "content units" (screen px for the overlay, image px for a picture), drawn on
// a canvas and flattened onto the picture when saving.

export type Pt = [number, number];
export type Shape =
  | { kind: "pen" | "marker"; color: string; width: number; points: Pt[] }
  | { kind: "arrow" | "line" | "rect" | "ellipse"; color: string; width: number; a: Pt; b: Pt }
  | { kind: "text"; color: string; size: number; at: Pt; text: string };
type LineShape = Extract<Shape, { a: Pt }>;
export type AnnoTool = "pen" | "marker" | "arrow" | "line" | "rect" | "ellipse" | "text" | "eraser";

export const ANNO_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#0f172a", "#ffffff"];

export function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], k = 1) {
  for (const s of shapes) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (s.kind === "text") {
      ctx.fillStyle = s.color;
      ctx.font = `700 ${s.size * k}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      // Light halo so text reads on any background.
      ctx.lineWidth = Math.max(2, s.size * k * 0.18);
      ctx.strokeStyle = s.color === "#ffffff" ? "rgba(15,23,42,.7)" : "rgba(255,255,255,.85)";
      s.text.split("\n").forEach((line, i) => {
        const y = s.at[1] * k + i * s.size * k * 1.2;
        ctx.strokeText(line, s.at[0] * k, y);
        ctx.fillText(line, s.at[0] * k, y);
      });
    } else if (s.kind === "pen" || s.kind === "marker") {
      if (!s.points.length) { ctx.restore(); continue; }
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = s.kind === "marker" ? 0.35 : 1;
      ctx.lineWidth = s.width * k;
      ctx.beginPath();
      ctx.moveTo(s.points[0][0] * k, s.points[0][1] * k);
      for (const [x, y] of s.points.slice(1)) ctx.lineTo(x * k, y * k);
      if (s.points.length === 1) ctx.lineTo(s.points[0][0] * k + 0.1, s.points[0][1] * k);
      ctx.stroke();
    } else {
      const g = s as LineShape;
      ctx.strokeStyle = g.color;
      ctx.fillStyle = g.color;
      ctx.lineWidth = g.width * k;
      const [x1, y1] = [g.a[0] * k, g.a[1] * k];
      const [x2, y2] = [g.b[0] * k, g.b[1] * k];
      ctx.beginPath();
      if (g.kind === "rect") ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      else if (g.kind === "ellipse") {
        ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (g.kind === "arrow") {
          const ang = Math.atan2(y2 - y1, x2 - x1);
          const head = Math.max(10, g.width * k * 4);
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
          ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
}

const distToSeg = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

/** Whether point p (content units) touches the shape, with a tolerance. */
export function hitShape(s: Shape, p: Pt, tol: number): boolean {
  if (s.kind === "text") {
    const lines = s.text.split("\n");
    const w = Math.max(...lines.map((l) => l.length)) * s.size * 0.6;
    const h = lines.length * s.size * 1.2;
    return p[0] >= s.at[0] - tol && p[0] <= s.at[0] + w + tol && p[1] >= s.at[1] - tol && p[1] <= s.at[1] + h + tol;
  }
  if (s.kind === "pen" || s.kind === "marker") {
    const t = tol + s.width / 2;
    for (let i = 0; i < s.points.length; i++) {
      const a = s.points[i], b = s.points[i + 1] || a;
      if (distToSeg(p, a, b) <= t) return true;
    }
    return false;
  }
  const g = s as LineShape;
  const t = tol + g.width / 2;
  if (g.kind === "arrow" || g.kind === "line") return distToSeg(p, g.a, g.b) <= t;
  const [x1, x2] = [Math.min(g.a[0], g.b[0]), Math.max(g.a[0], g.b[0])];
  const [y1, y2] = [Math.min(g.a[1], g.b[1]), Math.max(g.a[1], g.b[1])];
  if (g.kind === "rect") {
    const c: Pt[] = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    return c.some((a, i) => distToSeg(p, a, c[(i + 1) % 4]) <= t);
  }
  const rx = (x2 - x1) / 2 || 1, ry = (y2 - y1) / 2 || 1;
  const v = Math.hypot((p[0] - (x1 + rx)) / rx, (p[1] - (y1 + ry)) / ry);
  return Math.abs(v - 1) * Math.min(rx, ry) <= t;
}

/** Draw a background (optional) plus shapes into a new canvas and return it as an image. */
export async function flatten(bg: CanvasImageSource | null, w: number, h: number, shapes: Shape[], type = "image/png", quality = 0.92): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  if (type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
  if (bg) ctx.drawImage(bg, 0, 0, w, h);
  drawShapes(ctx, shapes);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not create the image."))), type, quality));
}

/** Undo / redo history of shape lists. */
export function useShapeHistory() {
  const [stack, setStack] = useState<{ past: Shape[][]; now: Shape[]; future: Shape[][] }>({ past: [], now: [], future: [] });
  const set = useCallback((next: Shape[]) => setStack((s) => ({ past: [...s.past, s.now].slice(-100), now: next, future: [] })), []);
  const undo = useCallback(() => setStack((s) => s.past.length ? { past: s.past.slice(0, -1), now: s.past[s.past.length - 1], future: [s.now, ...s.future] } : s), []);
  const redo = useCallback(() => setStack((s) => s.future.length ? { past: [...s.past, s.now], now: s.future[0], future: s.future.slice(1) } : s), []);
  const reset = useCallback(() => setStack({ past: [], now: [], future: [] }), []);
  return { shapes: stack.now, setShapes: set, undo, redo, reset, canUndo: stack.past.length > 0, canRedo: stack.future.length > 0 };
}

/**
 * Canvas that collects shapes. It fills its parent; `contentW`/`contentH` are the units shapes are
 * stored in (the parent is shown at any size), `pixelRatio` sharpens the canvas.
 */
export function AnnotationLayer({ shapes, onChange, tool, color, width, contentW, contentH, pixelRatio = 1, style }: {
  shapes: Shape[]; onChange: (s: Shape[]) => void; tool: AnnoTool; color: string; width: number;
  contentW: number; contentH: number; pixelRatio?: number; style?: CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draft = useRef<Shape | null>(null);
  const erased = useRef<Shape[] | null>(null);
  const [textAt, setTextAt] = useState<{ at: Pt; css: Pt } | null>(null);
  const [text, setText] = useState("");
  const [scale, setScale] = useState(1); // CSS px per content unit

  const paint = useCallback((list: Shape[]) => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    drawShapes(ctx, list, pixelRatio);
  }, [pixelRatio]);

  useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = Math.round(contentW * pixelRatio);
    c.height = Math.round(contentH * pixelRatio);
    paint(shapes);
  }, [contentW, contentH, pixelRatio, shapes, paint]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => setScale(c.getBoundingClientRect().width / contentW || 1));
    ro.observe(c);
    return () => ro.disconnect();
  }, [contentW]);

  const toContent = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * contentW) / r.width, ((e.clientY - r.top) * contentH) / r.height];
  };
  // Stroke widths are given in screen px; convert so they look the same at any zoom.
  const unit = 1 / scale;

  const commitText = () => {
    if (textAt && text.trim()) onChange([...shapes, { kind: "text", color, size: (12 + width * 3) * unit, at: textAt.at, text: text.replace(/\s+$/, "") }]);
    setTextAt(null);
    setText("");
  };

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const p = toContent(e);
    if (tool === "text") {
      if (textAt) { commitText(); return; }
      const r = canvasRef.current!.getBoundingClientRect();
      setTextAt({ at: p, css: [e.clientX - r.left, e.clientY - r.top] });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "eraser") {
      erased.current = shapes.filter((s) => !hitShape(s, p, 6 * unit));
      paint(erased.current);
      return;
    }
    const w = (tool === "marker" ? width * 5 : width) * unit;
    draft.current = tool === "pen" || tool === "marker"
      ? { kind: tool, color, width: w, points: [p] }
      : { kind: tool, color, width: w, a: p, b: p };
    paint([...shapes, draft.current]);
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = toContent(e);
    if (erased.current) {
      erased.current = erased.current.filter((s) => !hitShape(s, p, 6 * unit));
      paint(erased.current);
      return;
    }
    const d = draft.current;
    if (!d) return;
    if (d.kind === "pen" || d.kind === "marker") d.points.push(p);
    else if (d.kind !== "text") {
      // Shift keeps shapes square / lines at 45 degrees.
      if (e.shiftKey) {
        const dx = p[0] - d.a[0], dy = p[1] - d.a[1];
        if (d.kind === "rect" || d.kind === "ellipse") { const m = Math.max(Math.abs(dx), Math.abs(dy)); d.b = [d.a[0] + Math.sign(dx) * m, d.a[1] + Math.sign(dy) * m]; }
        else { const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4); const len = Math.hypot(dx, dy); d.b = [d.a[0] + Math.cos(ang) * len, d.a[1] + Math.sin(ang) * len]; }
      } else d.b = p;
    }
    paint([...shapes, d]);
  };
  const up = () => {
    if (erased.current) {
      if (erased.current.length !== shapes.length) onChange(erased.current);
      erased.current = null;
      return;
    }
    const d = draft.current;
    draft.current = null;
    if (!d) return;
    if (d.kind !== "pen" && d.kind !== "marker" && d.kind !== "text" && Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) < 3 * unit) { paint(shapes); return; }
    onChange([...shapes, d]);
  };

  const cursor = tool === "text" ? "text" : tool === "eraser" ? "cell" : "crosshair";
  return (
    <div className="absolute inset-0" style={style}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      {textAt && (
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); }
            if (e.key === "Escape") { e.stopPropagation(); setTextAt(null); setText(""); }
          }}
          placeholder="Type, Enter to place"
          rows={Math.max(1, text.split("\n").length)}
          className="absolute min-w-[10rem] resize-none rounded border border-dashed border-slate-400 bg-white/80 px-1 font-bold leading-tight outline-none"
          style={{ left: textAt.css[0], top: textAt.css[1], color, fontSize: 12 + width * 3 }}
        />
      )}
    </div>
  );
}

const TOOL_LIST: Array<{ key: AnnoTool; label: string; icon: ReactNode }> = [
  { key: "pen", label: "Pen", icon: <Pencil size={14} /> },
  { key: "marker", label: "Highlighter", icon: <Highlighter size={14} /> },
  { key: "arrow", label: "Arrow", icon: <ArrowUpRight size={14} /> },
  { key: "line", label: "Line", icon: <Minus size={14} /> },
  { key: "rect", label: "Rectangle", icon: <Square size={14} /> },
  { key: "ellipse", label: "Circle", icon: <Circle size={14} /> },
  { key: "text", label: "Text", icon: <Type size={14} /> },
  { key: "eraser", label: "Eraser", icon: <Eraser size={14} /> },
];

export function AnnotationToolbar({ tool, setTool, color, setColor, width, setWidth, onUndo, onRedo, onClear, canUndo, canRedo, children, className = "" }: {
  tool: AnnoTool; setTool: (t: AnnoTool) => void; color: string; setColor: (c: string) => void;
  width: number; setWidth: (w: number) => void; onUndo: () => void; onRedo: () => void; onClear: () => void;
  canUndo: boolean; canRedo: boolean; children?: ReactNode; className?: string;
}) {
  const b = "flex h-8 w-8 items-center justify-center rounded-lg transition-colors";
  return (
    <div className={`flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-xl ${className}`}>
      {TOOL_LIST.map((t) => (
        <button key={t.key} type="button" title={t.label} aria-label={t.label} aria-pressed={tool === t.key} onClick={() => setTool(t.key)}
          className={`${b} ${tool === t.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{t.icon}</button>
      ))}
      <span className="mx-1 h-6 w-px bg-slate-200" />
      {ANNO_COLORS.map((c) => (
        <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`}
          className={`h-5 w-5 rounded-full border-2 transition-transform ${color === c ? "scale-125 border-slate-900" : "border-white"}`}
          style={{ background: c, boxShadow: "0 0 0 1px #cbd5e1" }} />
      ))}
      <span className="mx-1 h-6 w-px bg-slate-200" />
      <label className="flex items-center gap-1 px-1 text-[11px] font-bold text-slate-500" title="Size">
        Size
        <input type="range" min={1} max={10} value={width} onChange={(e) => setWidth(Number(e.target.value))} className="w-16 accent-emerald-500" />
      </label>
      <span className="mx-1 h-6 w-px bg-slate-200" />
      <button type="button" title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo} className={`${b} text-slate-600 hover:bg-slate-100 disabled:opacity-30`}><Undo2 size={14} /></button>
      <button type="button" title="Redo (Ctrl+Y)" onClick={onRedo} disabled={!canRedo} className={`${b} text-slate-600 hover:bg-slate-100 disabled:opacity-30`}><Redo2 size={14} /></button>
      <button type="button" title="Clear all" onClick={onClear} disabled={!canUndo && !canRedo} className={`${b} text-slate-600 hover:bg-slate-100 disabled:opacity-30`}><Trash size={14} /></button>
      {children && <><span className="mx-1 h-6 w-px bg-slate-200" />{children}</>}
    </div>
  );
}

/** Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) while an annotation surface is open. */
export function useUndoKeys(undo: () => void, redo: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);
}
