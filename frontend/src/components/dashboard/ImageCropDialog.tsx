import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Crop, Loader2, Minus, Plus, RotateCcw, X } from "lucide-react";

/**
 * 2026-10-08 - "after uploading a photo, allow crop or zoom to a specific part of the picture to
 * show inside the frame." The picture fills a square frame; drag (or the arrow keys) moves it,
 * the slider, the mouse wheel or + / - zoom in. "Use this photo" hands back just the framed part,
 * as a square picture of `outputSize` pixels.
 */
const VIEW = 288;           // the frame on screen, px
const MAX_ZOOM = 5;

export default function ImageCropDialog({ file, title = "Crop your photo", outputSize = 512, busy, onCancel, onDone }: {
  file: File;
  title?: string;
  outputSize?: number;
  /** While the cropped picture is being saved. */
  busy?: boolean;
  onCancel: () => void;
  onDone: (blob: Blob, type: string) => void;
}) {
  const [src, setSrc] = useState("");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });   // the picture's top-left corner, relative to the frame
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The picture covers the frame at zoom 1.
  const base = img ? Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight) : 1;
  const scale = base * zoom;
  const w = img ? img.naturalWidth * scale : VIEW, h = img ? img.naturalHeight * scale : VIEW;
  const clamp = (p: { x: number; y: number }, ww = w, hh = h) => ({ x: Math.min(0, Math.max(VIEW - ww, p.x)), y: Math.min(0, Math.max(VIEW - hh, p.y)) });

  // Centred when the picture arrives.
  useEffect(() => { if (img) { setZoom(1); setPos({ x: (VIEW - img.naturalWidth * base) / 2, y: (VIEW - img.naturalHeight * base) / 2 }); } }, [img]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** Zoom keeping the frame's centre on the same spot of the picture. */
  const zoomTo = (z: number) => {
    if (!img) return;
    const nz = Math.min(MAX_ZOOM, Math.max(1, z));
    const cx = (VIEW / 2 - pos.x) / scale, cy = (VIEW / 2 - pos.y) / scale;
    const ns = base * nz;
    setZoom(nz);
    setPos(clamp({ x: VIEW / 2 - cx * ns, y: VIEW / 2 - cy * ns }, img.naturalWidth * ns, img.naturalHeight * ns));
  };

  const onDown = (e: ReactPointerEvent) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y }; };
  const onMove = (e: ReactPointerEvent) => { const d = drag.current; if (d) setPos(clamp({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py })); };
  const onUp = () => { drag.current = null; };
  // The wheel zooms instead of scrolling the page (a passive React listener could not stop that).
  const frame = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoomTo);
  zoomRef.current = zoomTo;
  const zoomNow = useRef(zoom);
  zoomNow.current = zoom;
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const wheel = (e: globalThis.WheelEvent) => { e.preventDefault(); zoomRef.current(zoomNow.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); setPos((p) => clamp({ x: p.x + moves[e.key][0], y: p.y + moves[e.key][1] })); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomTo(zoom + 0.2); }
    else if (e.key === "-") { e.preventDefault(); zoomTo(zoom - 0.2); }
  };
  const reset = () => { if (img) { setZoom(1); setPos({ x: (VIEW - img.naturalWidth * base) / 2, y: (VIEW - img.naturalHeight * base) / 2 }); } };

  const finish = () => {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize; canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // A photo is saved as JPEG (small); a picture that may be transparent stays PNG.
    const type = /png|webp|gif/i.test(file.type) ? "image/png" : "image/jpeg";
    if (type === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, outputSize, outputSize); }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, VIEW / scale, VIEW / scale, 0, 0, outputSize, outputSize);
    canvas.toBlob((b) => { if (b) onDone(b, type); }, type, 0.92);
  };

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4">
      <div role="dialog" aria-label={title} className="my-12 w-full max-w-md rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Crop size={16} className="text-primary" /> {title}</p>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-[11px] text-slate-500">Drag the picture to choose the part that shows in the frame; zoom in with the slider or the mouse wheel.</p>
          <div className="flex justify-center">
            <div ref={frame} tabIndex={0} onKeyDown={onKey} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              aria-label="The photo in its frame: drag or use the arrow keys to move it, + and - to zoom"
              className="relative cursor-grab touch-none select-none overflow-hidden rounded-[2rem] bg-slate-100 outline-none ring-4 ring-primary/30 focus-visible:ring-primary active:cursor-grabbing"
              style={{ width: VIEW, height: VIEW }}>
              {img
                ? <img src={src} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={{ left: pos.x, top: pos.y, width: w, height: h }} />
                : <span className="absolute inset-0 flex items-center justify-center text-slate-300"><Loader2 size={22} className="animate-spin" /></span>}
              {/* A thirds grid helps line up a face. */}
              <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(to right, transparent 33%, rgba(255,255,255,.35) 33%, rgba(255,255,255,.35) calc(33% + 1px), transparent calc(33% + 1px), transparent 66%, rgba(255,255,255,.35) 66%, rgba(255,255,255,.35) calc(66% + 1px), transparent calc(66% + 1px)), linear-gradient(to bottom, transparent 33%, rgba(255,255,255,.35) 33%, rgba(255,255,255,.35) calc(33% + 1px), transparent calc(33% + 1px), transparent 66%, rgba(255,255,255,.35) 66%, rgba(255,255,255,.35) calc(66% + 1px), transparent calc(66% + 1px))" }} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => zoomTo(zoom - 0.2)} disabled={!img || zoom <= 1} aria-label="Zoom out" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><Minus size={15} /></button>
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(e) => zoomTo(Number(e.target.value))} disabled={!img} aria-label="Zoom" className="flex-1 accent-emerald-600" />
            <button type="button" onClick={() => zoomTo(zoom + 0.2)} disabled={!img || zoom >= MAX_ZOOM} aria-label="Zoom in" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><Plus size={15} /></button>
            <span className="w-10 text-right text-[11px] font-bold tabular-nums text-slate-500">{Math.round(zoom * 100)}%</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button type="button" onClick={reset} disabled={!img || busy} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-40"><RotateCcw size={12} /> Reset</button>
            <div className="flex gap-2">
              <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={finish} disabled={!img || busy} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-50">
                {busy && <Loader2 size={13} className="animate-spin" />} Use this photo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
