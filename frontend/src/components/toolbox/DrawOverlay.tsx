import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, GripHorizontal, MousePointer2, SquareDashedMousePointer, X } from "lucide-react";
import { AnnotationLayer, AnnotationToolbar, useShapeHistory, useUndoKeys, type AnnoTool } from "./annotate";
import { useCapturing } from "./capture";

// Draw / Annotate over the whole screen: pen, highlighter, arrows, lines, rectangles, circles,
// text and eraser. "Full page" captures the page with the drawing and opens the editor.
// "Pause" lets clicks reach the page (scroll, open a tab) and keeps the drawing visible.
// CR 301 (2026-09-25): "Snip area" captures the page with the drawing and lets you drag a box over
// just the part you want, so drawing and snipping happen in one go.

export default function DrawOverlay({ onClose, onScreenshot, onSnip }: { onClose: () => void; onScreenshot: () => void; onSnip: () => void }) {
  const hist = useShapeHistory();
  const [tool, setTool] = useState<AnnoTool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [width, setWidth] = useState(3);
  const [paused, setPaused] = useState(false);
  const [atBottom, setAtBottom] = useState(false);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const capturing = useCapturing();
  useUndoKeys(hist.undo, hist.redo);

  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "Escape" && !(t && t.tagName === "TEXTAREA")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const small = "inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold";
  return createPortal(
    <div className="fixed inset-0 z-[1300]" style={{ pointerEvents: paused ? "none" : "auto" }}>
      <AnnotationLayer
        shapes={hist.shapes} onChange={hist.setShapes} tool={tool} color={color} width={width}
        contentW={size.w} contentH={size.h} pixelRatio={window.devicePixelRatio || 1}
      />
      {!capturing && (
        <div className={`absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 ${atBottom ? "bottom-3" : "top-3"}`} style={{ pointerEvents: "auto" }}>
          <AnnotationToolbar
            tool={tool} setTool={(t) => { setTool(t); setPaused(false); }} color={color} setColor={setColor} width={width} setWidth={setWidth}
            onUndo={hist.undo} onRedo={hist.redo} onClear={() => hist.setShapes([])} canUndo={hist.canUndo} canRedo={hist.canRedo}
            className="max-w-[calc(100vw-1.5rem)] justify-center"
          >
            <button type="button" onClick={() => setPaused((p) => !p)} title="Let clicks reach the page (the drawing stays)" className={`${small} ${paused ? "bg-amber-100 text-amber-700" : "text-slate-600 hover:bg-slate-100"}`}>
              <MousePointer2 size={13} /> {paused ? "Resume drawing" : "Pause"}
            </button>
            <button type="button" onClick={onSnip} className={`${small} bg-emerald-50 text-primary hover:bg-emerald-100`} title="Capture the page with your drawing, then drag over the part to keep">
              <SquareDashedMousePointer size={13} /> Snip area
            </button>
            <button type="button" onClick={onScreenshot} className={`${small} text-slate-600 hover:bg-slate-100`} title="Capture the whole page with your drawing">
              <Camera size={13} /> Full page
            </button>
            <button type="button" onClick={() => setAtBottom((b) => !b)} className={`${small} text-slate-400 hover:bg-slate-100`} title={atBottom ? "Move bar to the top" : "Move bar to the bottom"}>
              <GripHorizontal size={13} />
            </button>
            <button type="button" onClick={onClose} className={`${small} bg-primary text-white hover:bg-emerald-600`} title="Close (Esc)">
              <X size={13} /> Done
            </button>
          </AnnotationToolbar>
        </div>
      )}
    </div>,
    document.body,
  );
}
