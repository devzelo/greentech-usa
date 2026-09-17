import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppWindow, ImagePlus, Monitor, SquareDashedMousePointer } from "lucide-react";
import { toast } from "../../lib/toast";
import { canCapture, captureScreen, type CaptureKind } from "./capture";
import { CropBox } from "./ImageEditor";
import ImageEditor from "./ImageEditor";
import { stamp } from "./ExportActions";

// Screenshot / Snip: the current page, a whole screen, or a selected area, then edit and
// Save / Copy / Download / Attach / Share / Delete. Also used by Draw after annotating.

export function useSnip() {
  const [shot, setShot] = useState<{ blob: Blob; select: boolean } | null>(null);
  const [edit, setEdit] = useState<Blob | null>(null);

  const take = async (kind: CaptureKind, select = false) => {
    try {
      const blob = await captureScreen(kind);
      if (!blob) return;
      if (select) setShot({ blob, select });
      else setEdit(blob);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Screenshot failed.", "error");
    }
  };

  const open = (b: Blob) => setEdit(b);
  const ui = (
    <>
      {shot && (
        <AreaSelector
          blob={shot.blob}
          onCancel={() => setShot(null)}
          onDone={(b) => { setShot(null); setEdit(b); }}
        />
      )}
      {edit && <ImageEditor source={edit} name={edit instanceof File ? edit.name : `screenshot-${stamp()}`} title={edit instanceof File ? "Edit image" : "Screenshot"} onClose={() => setEdit(null)} />}
    </>
  );
  return { take, open, ui };
}

export default function SnipTool({ onTake, onEdit }: { onTake: (kind: CaptureKind, select?: boolean) => void; onEdit: (f: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const supported = canCapture();
  const big = "flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-primary hover:bg-emerald-50/40 disabled:opacity-40";
  return (
    <div className="space-y-2">
      <button type="button" disabled={!supported} onClick={() => onTake("tab")} className={big}>
        <AppWindow size={20} className="shrink-0 text-primary" />
        <span><span className="block text-sm font-bold text-slate-800">Current page</span><span className="block text-[11px] text-slate-500">Pick "this tab" when the browser asks.</span></span>
      </button>
      <button type="button" disabled={!supported} onClick={() => onTake("tab", true)} className={big}>
        <SquareDashedMousePointer size={20} className="shrink-0 text-primary" />
        <span><span className="block text-sm font-bold text-slate-800">Selected area</span><span className="block text-[11px] text-slate-500">Capture the page, then drag over the part you want.</span></span>
      </button>
      <button type="button" disabled={!supported} onClick={() => onTake("screen")} className={big}>
        <Monitor size={20} className="shrink-0 text-primary" />
        <span><span className="block text-sm font-bold text-slate-800">Full screen</span><span className="block text-[11px] text-slate-500">Anything on your screen, including other apps.</span></span>
      </button>
      {!supported && <p className="text-[11px] font-semibold text-amber-600">Screen capture needs Chrome, Edge or Firefox on a computer. You can still edit an image below.</p>}
      <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2 py-2 text-[11px] font-bold text-slate-500 hover:border-primary hover:text-primary">
        <ImagePlus size={14} /> Open or paste (Ctrl+V) an image to annotate
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onEdit(f); e.target.value = ""; }} />
      <PasteImage onImage={onEdit} />
    </div>
  );
}

/** Ctrl+V an image while the tool is open. */
export function PasteImage({ onImage }: { onImage: (f: File) => void }) {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
      const f = item?.getAsFile();
      if (f) { e.preventDefault(); onImage(new File([f], `pasted-${stamp()}.png`, { type: f.type })); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onImage]);
  return null;
}

/** Full-screen "drag to select" over a captured page, like a snipping tool. */
function AreaSelector({ blob, onDone, onCancel }: { blob: Blob; onDone: (b: Blob) => void; onCancel: () => void }) {
  const [url] = useState(() => URL.createObjectURL(blob));
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const fit = img ? Math.min(size.w / img.naturalWidth, size.h / img.naturalHeight) : 1;
  const vw = img ? img.naturalWidth * fit : 0;
  const vh = img ? img.naturalHeight * fit : 0;

  return createPortal(
    <div data-toolbox-modal className="fixed inset-0 z-[244] flex items-center justify-center bg-slate-950">
      <div className="relative" style={{ width: vw, height: vh }}>
        <img src={url} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} onLoad={(e) => setImg(e.currentTarget)} />
        {img && (
          <CropBox
            viewW={vw} viewH={vh} autoApply onCancel={onCancel}
            onApply={(r) => {
              const c = document.createElement("canvas");
              c.width = Math.round(r.w / fit); c.height = Math.round(r.h / fit);
              c.getContext("2d")!.drawImage(img, r.x / fit, r.y / fit, r.w / fit, r.h / fit, 0, 0, c.width, c.height);
              c.toBlob((b) => (b ? onDone(b) : onCancel()), "image/png");
            }}
          />
        )}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-1.5 text-xs font-bold text-white shadow-lg">
        Drag to select an area. Esc to cancel.
      </div>
    </div>,
    document.body,
  );
}
