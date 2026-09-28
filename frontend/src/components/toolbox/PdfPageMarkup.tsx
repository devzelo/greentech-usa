import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Loader2, Maximize2, Minus, Plus, X } from "lucide-react";
import { AnnotationLayer, AnnotationToolbar, useShapeHistory, useUndoKeys, type AnnoTool, type Shape } from "./annotate";
import { turnShapes } from "./pdfMarks";

/**
 * CR 303 (2026-09-25): open a PDF page full size and mark it up, the way a PDF reader does: text,
 * comments, highlighter, pen, arrows and boxes, eraser, undo and redo. Every change is kept on the
 * page straight away (Done just closes); the marks go into the PDF when it is built.
 */

export interface MarkupPage {
  key: string;
  label: string;                     // "report.pdf, p.3"
  marks: Shape[];
  markRotate: number;
}
/** The page as it reads now: a picture of it, its size in points, and its total rotation. */
export type RenderedPage = { url: string; w: number; h: number; rot: number };

export default function PdfPageMarkup({ pages, start, render, onMarks, onClose }: {
  pages: MarkupPage[];
  start: number;
  render: (key: string) => Promise<RenderedPage>;
  onMarks: (key: string, marks: Shape[], rot: number) => void;
  onClose: () => void;
}) {
  const [at, setAt] = useState(start);
  const [view, setView] = useState<RenderedPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);              // 1 = the whole page fits the window
  const [tool, setTool] = useState<AnnoTool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [width, setWidth] = useState(3);
  const hist = useShapeHistory();
  const loadedKey = useRef("");
  const box = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState({ w: 800, h: 600 });
  useUndoKeys(hist.undo, hist.redo);

  const page = pages[at];

  // Draw the page, and bring back its marks, turned if the page was turned since they were drawn.
  useEffect(() => {
    if (!page) return;
    let live = true;
    setView(null); setFailed(false);
    loadedKey.current = "";
    render(page.key).then((v) => {
      if (!live) return;
      const drawnW = (page.markRotate - v.rot) % 180 === 0 ? v.w : v.h;
      const drawnH = (page.markRotate - v.rot) % 180 === 0 ? v.h : v.w;
      hist.load(page.marks.length ? turnShapes(page.marks, v.rot - page.markRotate, drawnW, drawnH) : []);
      loadedKey.current = page.key;
      setView(v);
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.key]);

  // Every change goes back to the page, in the orientation it is shown in now.
  useEffect(() => {
    if (!view || !page || loadedKey.current !== page.key) return;
    onMarks(page.key, hist.shapes, view.rot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist.shapes]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
      if (e.key === "Escape") onClose();
      if (e.key === "PageDown") setAt((i) => Math.min(pages.length - 1, i + 1));
      if (e.key === "PageUp") setAt((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pages.length]);

  // The page on screen: the whole page fitted to the window (as a reader opens it), then zoomed.
  const fitW = view ? Math.min(boxSize.w - 32, ((boxSize.h - 32) * view.w) / view.h) : 0;
  const shownW = view ? Math.max(200, fitW * zoom) : 0;
  const shownH = view ? (shownW * view.h) / view.w : 0;
  const nav = "rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30";

  return createPortal(
    <div data-toolbox-modal data-pdf-markup className="fixed inset-0 z-[240] flex flex-col bg-slate-900/80">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <button type="button" className={nav} disabled={at === 0} onClick={() => setAt(at - 1)} aria-label="Previous page" title="Previous page (Page Up)"><ChevronLeft size={18} /></button>
        <p className="min-w-0 text-sm font-bold text-slate-800">
          Page {at + 1} <span className="font-normal text-slate-400">of {pages.length}</span>
          <span className="ml-2 hidden truncate text-[11px] font-normal text-slate-500 sm:inline">{page?.label}</span>
        </p>
        <button type="button" className={nav} disabled={at >= pages.length - 1} onClick={() => setAt(at + 1)} aria-label="Next page" title="Next page (Page Down)"><ChevronRight size={18} /></button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button type="button" className={nav} onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))} aria-label="Zoom out" title="Zoom out"><Minus size={15} /></button>
        <span className="w-10 text-center text-[11px] font-bold text-slate-500">{Math.round(zoom * 100)}%</span>
        <button type="button" className={nav} onClick={() => setZoom((z) => Math.min(4, +(z + 0.2).toFixed(2)))} aria-label="Zoom in" title="Zoom in"><Plus size={15} /></button>
        <button type="button" className={nav} onClick={() => setZoom(1)} aria-label="Fit the page" title="Fit the whole page"><Maximize2 size={14} /></button>
        <button type="button" onClick={() => view && setZoom(+((boxSize.w - 32) / fitW).toFixed(2))} className="rounded-lg px-1.5 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Fit the page to the window's width">Width</button>
        <p className="ml-auto hidden text-[11px] text-slate-500 md:block">Marks are kept on the page as you draw; they go into the PDF when you build it.</p>
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600" title="Close (Esc)">
          <X size={13} /> Done
        </button>
      </div>
      <div className="flex justify-center border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <AnnotationToolbar
          tool={tool} setTool={setTool} color={color} setColor={setColor} width={width} setWidth={setWidth}
          onUndo={hist.undo} onRedo={hist.redo} onClear={() => hist.setShapes([])} canUndo={hist.canUndo} canRedo={hist.canRedo}
          className="max-w-full justify-center shadow-none"
        />
      </div>
      <div ref={box} className="min-h-0 flex-1 overflow-auto p-4">
        {!view ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-300">
            {failed ? "This page could not be shown." : <Loader2 size={24} className="animate-spin" />}
          </div>
        ) : (
          <div className="relative mx-auto bg-white shadow-2xl" style={{ width: shownW, height: shownH }}>
            <img src={view.url} alt={`Page ${at + 1}`} className="absolute inset-0 h-full w-full select-none" draggable={false} />
            <AnnotationLayer
              shapes={hist.shapes} onChange={hist.setShapes} tool={tool} color={color} width={width}
              contentW={view.w} contentH={view.h} pixelRatio={(shownW / view.w) * (window.devicePixelRatio || 1)}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
