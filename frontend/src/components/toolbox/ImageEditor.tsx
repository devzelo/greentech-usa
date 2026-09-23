import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Crop, FlipHorizontal2, FlipVertical2, Loader2, RotateCcw, RotateCw, Undo, X } from "lucide-react";
import { AnnotationLayer, AnnotationToolbar, drawShapes, flatten, useShapeHistory, useUndoKeys, type AnnoTool } from "./annotate";
import ExportActions from "./ExportActions";

// Image editor used by Screenshot / Snip and Image Tools: crop, rotate, flip, resize, compress
// (format + quality) and annotate, then Save / Copy / Download / Attach / Share / Delete.

type Fmt = "image/png" | "image/jpeg" | "image/webp";
const EXT: Record<Fmt, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
type Rect = { x: number; y: number; w: number; h: number };

const toCanvas = (src: CanvasImageSource, w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(src, 0, 0, w, h);
  return c;
};
const kb = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export default function ImageEditor({ source, name = "image", title = "Edit image", onClose, startWithCrop = false }: {
  source: Blob; name?: string; title?: string; onClose: () => void; startWithCrop?: boolean;
}) {
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [original, setOriginal] = useState<HTMLCanvasElement | null>(null);
  const [past, setPast] = useState<HTMLCanvasElement[]>([]);
  const hist = useShapeHistory();
  const [tool, setTool] = useState<AnnoTool>("arrow");
  const [color, setColor] = useState("#ef4444");
  const [width, setWidth] = useState(3);
  const [mode, setMode] = useState<"annotate" | "crop">(startWithCrop ? "crop" : "annotate");
  const [fmt, setFmt] = useState<Fmt>(source.type === "image/jpeg" ? "image/jpeg" : "image/png");
  const [quality, setQuality] = useState(0.85);
  const [fileName, setFileName] = useState(name.replace(/\.[a-z0-9]+$/i, ""));
  const [resizeW, setResizeW] = useState("");
  const [resizeH, setResizeH] = useState("");
  const [lockRatio, setLockRatio] = useState(true);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  useUndoKeys(hist.undo, hist.redo);

  useEffect(() => {
    let alive = true;
    createImageBitmap(source).then((bmp) => {
      if (!alive) return;
      const c = toCanvas(bmp, bmp.width, bmp.height);
      setBase(c); setOriginal(c);
      setResizeW(String(c.width)); setResizeH(String(c.height));
    }).catch(() => onClose());
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && mode === "annotate" && !document.querySelector("[data-toolbox-attach]")) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, mode]);

  // Fit the picture into the stage.
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 800, h: 500 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth - 32, h: el.clientHeight - 32 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = base ? Math.min(1, stage.w / base.width, stage.h / base.height) : 1;
  const view = base ? { w: Math.max(1, Math.round(base.width * fit)), h: Math.max(1, Math.round(base.height * fit)) } : { w: 0, h: 0 };

  // Bake the drawing into the picture, then transform it (so drawings follow crops and rotations).
  const apply = (fn: (src: HTMLCanvasElement) => HTMLCanvasElement) => {
    if (!base) return;
    const baked = toCanvas(base, base.width, base.height);
    drawShapes(baked.getContext("2d")!, hist.shapes);
    const next = fn(baked);
    setPast((p) => [...p.slice(-9), base]);
    setBase(next);
    hist.reset();
    setResizeW(String(next.width)); setResizeH(String(next.height));
    setVersion((v) => v + 1);
  };
  const undoStep = () => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setBase(prev);
    hist.reset();
    setResizeW(String(prev.width)); setResizeH(String(prev.height));
    setVersion((v) => v + 1);
  };
  const rotate = (dir: 1 | -1) => apply((src) => {
    const c = document.createElement("canvas");
    c.width = src.height; c.height = src.width;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((dir * Math.PI) / 2);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  });
  const flip = (h: boolean) => apply((src) => {
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext("2d")!;
    ctx.translate(h ? c.width : 0, h ? 0 : c.height);
    ctx.scale(h ? -1 : 1, h ? 1 : -1);
    ctx.drawImage(src, 0, 0);
    return c;
  });
  const crop = (r: Rect) => apply((src) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(r.w)); c.height = Math.max(1, Math.round(r.h));
    c.getContext("2d")!.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return c;
  });
  const resize = (w: number, h: number) => {
    if (!base || !(w > 0 && h > 0) || (w === base.width && h === base.height)) return;
    apply((src) => {
      // Step down in halves for a smoother result on big reductions.
      let cur: HTMLCanvasElement = src;
      while (cur.width / 2 > w && cur.height / 2 > h) cur = toCanvas(cur, Math.round(cur.width / 2), Math.round(cur.height / 2));
      return toCanvas(cur, w, h);
    });
  };
  const onResizeW = (v: string) => {
    setResizeW(v);
    if (lockRatio && base && Number(v) > 0) setResizeH(String(Math.round((Number(v) * base.height) / base.width)));
  };
  const onResizeH = (v: string) => {
    setResizeH(v);
    if (lockRatio && base && Number(v) > 0) setResizeW(String(Math.round((Number(v) * base.width) / base.height)));
  };

  const build = async () => {
    if (!base) throw new Error("The image is still loading.");
    return flatten(base, base.width, base.height, hist.shapes, fmt, quality);
  };
  const getFile = async () => new File([await build()], `${(fileName.trim() || "image").replace(/[\\/:*?"<>|]/g, "_")}.${EXT[fmt]}`, { type: fmt });

  // Estimated output size, refreshed shortly after changes.
  const shapesKey = hist.shapes.length;
  useEffect(() => {
    if (!base) return;
    setEstimate(null);
    const t = setTimeout(() => { build().then((b) => setEstimate(b.size)).catch(() => {}); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, fmt, quality, shapesKey]);

  const exportVersion = useMemo(() => `${version}:${hist.shapes.length}:${fmt}:${quality}:${fileName}`, [version, hist.shapes.length, fmt, quality, fileName]);
  const small = "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary disabled:opacity-40";
  const input = "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-primary focus:outline-none";

  return createPortal(
    <div data-toolbox-modal className="fixed inset-0 z-[1400] flex flex-col bg-slate-900/70 p-2 sm:p-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <h3 className="font-display text-base font-bold text-slate-900">{title}</h3>
          <div className="flex items-center gap-1">
            {original && base !== original && (
              <button type="button" onClick={() => { setPast([]); setBase(original); hist.reset(); setResizeW(String(original.width)); setResizeH(String(original.height)); setVersion((v) => v + 1); }} className={small}>Reset to original</button>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2">
              {mode === "annotate" ? (
                <AnnotationToolbar
                  tool={tool} setTool={setTool} color={color} setColor={setColor} width={width} setWidth={setWidth}
                  onUndo={hist.undo} onRedo={hist.redo} onClear={() => hist.setShapes([])} canUndo={hist.canUndo} canRedo={hist.canRedo}
                  className="!shadow-none"
                >
                  <button type="button" onClick={() => setMode("crop")} className={small}><Crop size={13} /> Crop</button>
                </AnnotationToolbar>
              ) : (
                <p className="text-xs font-bold text-slate-600">Drag over the picture to choose the area to keep.</p>
              )}
            </div>
            <div ref={stageRef} className="relative flex min-h-[16rem] flex-1 items-center justify-center overflow-hidden bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:20px_20px] p-4">
              {!base ? <Loader2 className="animate-spin text-slate-400" /> : (
                <div className="relative shadow-lg" style={{ width: view.w, height: view.h }}>
                  <CanvasView canvas={base} version={version} />
                  {mode === "annotate" ? (
                    <AnnotationLayer shapes={hist.shapes} onChange={hist.setShapes} tool={tool} color={color} width={width} contentW={base.width} contentH={base.height} />
                  ) : (
                    <CropBox
                      viewW={view.w} viewH={view.h}
                      onCancel={() => setMode("annotate")}
                      onApply={(r) => { crop({ x: r.x / fit, y: r.y / fit, w: r.w / fit, h: r.h / fit }); setMode("annotate"); }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <aside className="w-full shrink-0 space-y-3 overflow-y-auto border-t border-slate-100 p-3 lg:w-72 lg:border-l lg:border-t-0">
            <section>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Transform</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => rotate(-1)} className={small} title="Rotate left"><RotateCcw size={13} /> Left</button>
                <button type="button" onClick={() => rotate(1)} className={small} title="Rotate right"><RotateCw size={13} /> Right</button>
                <button type="button" onClick={() => flip(true)} className={small} title="Flip horizontally"><FlipHorizontal2 size={13} /></button>
                <button type="button" onClick={() => flip(false)} className={small} title="Flip vertically"><FlipVertical2 size={13} /></button>
                <button type="button" onClick={undoStep} disabled={!past.length} className={small} title="Undo the last crop / rotate / resize"><Undo size={13} /> Undo step</button>
              </div>
            </section>
            <section>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Resize {base && <span className="normal-case tracking-normal text-slate-400">({base.width} x {base.height} px)</span>}</p>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="text-[11px] font-bold text-slate-500">Width<input type="number" min={1} value={resizeW} onChange={(e) => onResizeW(e.target.value)} className={input} /></label>
                <label className="text-[11px] font-bold text-slate-500">Height<input type="number" min={1} value={resizeH} onChange={(e) => onResizeH(e.target.value)} className={input} /></label>
              </div>
              <label className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><input type="checkbox" checked={lockRatio} onChange={(e) => setLockRatio(e.target.checked)} className="accent-emerald-500" /> Keep proportions</label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[25, 50, 75].map((p) => (
                  <button key={p} type="button" className={small} onClick={() => base && resize(Math.round((base.width * p) / 100), Math.round((base.height * p) / 100))}>{p}%</button>
                ))}
                <button type="button" className={`${small} !border-primary !text-primary`} onClick={() => resize(Number(resizeW), Number(resizeH))}>Apply</button>
              </div>
            </section>
            <section>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Save as</p>
              <label className="text-[11px] font-bold text-slate-500">File name<input value={fileName} onChange={(e) => setFileName(e.target.value)} className={input} /></label>
              <div className="mt-1.5 flex gap-1">
                {(Object.keys(EXT) as Fmt[]).map((f) => (
                  <button key={f} type="button" onClick={() => setFmt(f)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${fmt === f ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{EXT[f].toUpperCase()}</button>
                ))}
              </div>
              {fmt !== "image/png" && (
                <label className="mt-1.5 block text-[11px] font-bold text-slate-500">Quality (compression): {Math.round(quality * 100)}%
                  <input type="range" min={0.3} max={1} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full accent-emerald-500" />
                </label>
              )}
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                File size: {estimate == null ? "calculating..." : kb(estimate)}{source.size ? ` (was ${kb(source.size)})` : ""}
              </p>
              {fmt === "image/png" && <p className="text-[11px] text-slate-400">Choose JPG or WEBP to make the file smaller.</p>}
            </section>
            <section className="border-t border-slate-100 pt-3">
              <ExportActions getFile={getFile} onDelete={onClose} version={exportVersion} disabled={!base} />
            </section>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CanvasView({ canvas, version }: { canvas: HTMLCanvasElement; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = canvas.width; c.height = canvas.height;
    c.getContext("2d")!.drawImage(canvas, 0, 0);
  }, [canvas, version]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

/** Drag a rectangle; shows the rest dimmed. Coordinates are in view px. */
export function CropBox({ viewW, viewH, onApply, onCancel, autoApply = false }: {
  viewW: number; viewH: number; onApply: (r: Rect) => void; onCancel: () => void; autoApply?: boolean;
}) {
  const [r, setR] = useState<Rect | null>(null);
  const start = useRef<[number, number] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pos = (e: ReactPointerEvent) => {
    const b = rootRef.current!.getBoundingClientRect();
    return [Math.max(0, Math.min(viewW, e.clientX - b.left)), Math.max(0, Math.min(viewH, e.clientY - b.top))] as [number, number];
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
      if (e.key === "Enter" && r && r.w > 2 && r.h > 2) onApply(r);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [r, onApply, onCancel]);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 touch-none select-none"
      style={{ cursor: "crosshair" }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = pos(e); setR({ x: start.current[0], y: start.current[1], w: 0, h: 0 }); }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const [x, y] = pos(e);
        const [sx, sy] = start.current;
        setR({ x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) });
      }}
      onPointerUp={() => {
        start.current = null;
        if (autoApply && r && r.w > 4 && r.h > 4) onApply(r);
      }}
    >
      {!r || r.w < 1 ? <div className="absolute inset-0 bg-slate-900/40" /> : (
        <div className="absolute border-2 border-white" style={{ left: r.x, top: r.y, width: r.w, height: r.h, boxShadow: "0 0 0 9999px rgba(15,23,42,.45)" }}>
          <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">{Math.round(r.w)} x {Math.round(r.h)}</span>
        </div>
      )}
      {!autoApply && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={onCancel} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow">Cancel</button>
          <button type="button" disabled={!r || r.w < 3 || r.h < 3} onClick={() => r && onApply(r)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white shadow disabled:opacity-50">Apply crop</button>
        </div>
      )}
    </div>
  );
}
