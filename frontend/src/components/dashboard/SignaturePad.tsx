import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Eraser, Loader2, PenLine, Undo2, X } from "lucide-react";

/**
 * Sign on the screen with a finger, a stylus or the mouse (phones and tablets included). The ink is
 * kept as strokes so the last one can be undone, and the result is a transparent PNG cropped to the
 * signature, the same kind of file an uploaded signature is.
 */
type Pt = { x: number; y: number; p: number };

const INKS: Array<[string, string]> = [["#0f172a", "Black"], ["#1d4ed8", "Blue"]];

export default function SignaturePad({ name, onSave, onClose }: {
  /** Whose signature this is, shown above the pad. */
  name: string;
  onSave: (file: File) => Promise<void>;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const strokes = useRef<Pt[][]>([]);
  const drawing = useRef<Pt[] | null>(null);
  const [count, setCount] = useState(0);          // strokes on the pad, to enable Undo / Save
  const [ink, setInk] = useState(INKS[0][0]);
  const [saving, setSaving] = useState(false);

  // The canvas follows its box, at the screen's pixel density so the line stays crisp.
  const redraw = () => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of strokes.current) drawStroke(ctx, s, ink);
  };
  useEffect(() => {
    const fit = () => {
      const c = canvas.current, b = box.current;
      if (!c || !b) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(b.clientWidth * dpr);
      c.height = Math.round(b.clientHeight * dpr);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => { ro.disconnect(); document.removeEventListener("keydown", esc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(redraw, [ink]); // eslint-disable-line react-hooks/exhaustive-deps

  const at = (e: ReactPointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    // A finger or mouse reports no pressure (0 or 0.5); a stylus does, and the line follows it.
    const p = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    return { x: e.clientX - r.left, y: e.clientY - r.top, p };
  };
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = [at(e)];
    strokes.current.push(drawing.current);
    redraw();
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    // Every point the device reported since the last frame, so fast strokes stay smooth.
    const list = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    if (list.length) {
      const r = e.currentTarget.getBoundingClientRect();
      for (const c of list) drawing.current.push({ x: c.clientX - r.left, y: c.clientY - r.top, p: c.pointerType === "pen" && c.pressure > 0 ? c.pressure : 0.5 });
    } else drawing.current.push(at(e));
    redraw();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = null;
    setCount(strokes.current.length);
  };
  const undo = () => { strokes.current.pop(); setCount(strokes.current.length); redraw(); };
  const clear = () => { strokes.current = []; setCount(0); redraw(); };

  const save = async () => {
    const c = canvas.current;
    if (!c || !strokes.current.length) return;
    setSaving(true);
    try {
      const blob = await cropped(c);
      await onSave(new File([blob], `signature-${Date.now()}.png`, { type: "image/png" }));
    } finally { setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <p className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-900">
            <PenLine size={16} className="shrink-0 text-primary" />
            <span className="truncate">Sign here{name ? `: ${name}` : ""}</span>
          </p>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-4 sm:p-5">
          <div ref={box} className="relative h-56 w-full overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 sm:h-64">
            {/* The line to sign on, and a hint until the first stroke. */}
            <div className="pointer-events-none absolute inset-x-6 bottom-12 border-b border-slate-300" />
            <span className="pointer-events-none absolute bottom-6 left-6 text-lg text-slate-300">×</span>
            {count === 0 && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-300">Sign with your finger, a stylus or the mouse</p>}
            <canvas
              ref={canvas}
              className="absolute inset-0 h-full w-full cursor-crosshair"
              style={{ touchAction: "none" }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onPointerLeave={up}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {INKS.map(([c, label]) => (
                <button key={c} type="button" onClick={() => setInk(c)} title={label} aria-label={`${label} ink`} aria-pressed={ink === c}
                  className={`h-7 w-7 rounded-full border-2 ${ink === c ? "border-primary ring-2 ring-primary/20" : "border-white ring-1 ring-slate-200"}`} style={{ background: c }} />
              ))}
              <span className="mx-1 h-5 w-px bg-slate-200" />
              <button type="button" onClick={undo} disabled={!count} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-primary hover:text-primary disabled:opacity-40"><Undo2 size={13} /> Undo</button>
              <button type="button" onClick={clear} disabled={!count} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-red-300 hover:text-red-600 disabled:opacity-40"><Eraser size={13} /> Clear</button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => void save()} disabled={!count || saving} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-40">
                {saving && <Loader2 size={13} className="animate-spin" />} Save signature
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One stroke as a smooth line, a little heavier where the stylus pressed harder. */
function drawStroke(ctx: CanvasRenderingContext2D, s: Pt[], ink: string) {
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0].x, s[0].y, 1.4, 0, Math.PI * 2); ctx.fill(); return; }
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1], b = s[i];
    const prev = s[i - 2] || a;
    ctx.lineWidth = 1.4 + 2.2 * ((a.p + b.p) / 2);
    ctx.beginPath();
    // Through the midpoints, so the corners between samples are curves rather than kinks.
    ctx.moveTo((prev.x + a.x) / 2, (prev.y + a.y) / 2);
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.stroke();
  }
}

/** The canvas cropped to the ink with a small margin, as a transparent PNG. */
function cropped(c: HTMLCanvasElement): Promise<Blob> {
  const ctx = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const pad = Math.round(8 * (window.devicePixelRatio || 1));
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read the signature."))), "image/png"));
}
