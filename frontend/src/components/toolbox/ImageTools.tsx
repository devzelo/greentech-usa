import { useRef, useState, type DragEvent } from "react";
import { Crop, Eraser, FileArchive, ImagePlus, Maximize2, RotateCw } from "lucide-react";
import { PasteImage } from "./SnipTool";

// Image Tools: open, drop or paste a picture, then crop, resize, rotate, compress and annotate it
// in the image editor.

export default function ImageTools({ onEdit }: { onEdit: (f: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = Array.from<File>(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
    if (f) onEdit(f);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={`flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-6 text-center transition-colors ${over ? "border-primary bg-emerald-50" : "border-slate-300 hover:border-primary hover:bg-emerald-50/40"}`}
      >
        <ImagePlus size={24} className="text-primary" />
        <span className="text-sm font-bold text-slate-800">Choose, drop or paste an image</span>
        <span className="text-[11px] text-slate-500">PNG, JPG, WEBP, GIF. Paste with Ctrl+V.</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onEdit(f); e.target.value = ""; }} />
      <PasteImage onImage={onEdit} />
      <ul className="grid grid-cols-2 gap-1.5 text-[11px] font-semibold text-slate-600">
        <li className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5"><Crop size={13} className="text-primary" /> Crop</li>
        <li className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5"><Maximize2 size={13} className="text-primary" /> Resize</li>
        <li className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5"><RotateCw size={13} className="text-primary" /> Rotate and flip</li>
        <li className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5"><FileArchive size={13} className="text-primary" /> Compress (JPG / WEBP)</li>
        <li className="col-span-2 flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5"><Eraser size={13} className="text-primary" /> Annotate: pen, highlighter, arrows, shapes, text</li>
      </ul>
    </div>
  );
}
