import { useEffect, useState } from "react";
import { Check, Film, Loader2, Star, Trash2, Upload } from "lucide-react";
import { attachmentUrl, uploadGalleryFile, type GalleryItem } from "../../lib/api";
import { REPORT_PICKS } from "../../lib/projectGallery";
import { toast } from "../../lib/toast";

/**
 * 2026-10-09 - the project's gallery, the same in Manage Showcase and in Project Identity: images and
 * videos, the first picture is the cover (the project's image), and up to two pictures are ticked
 * for the Quick Report's cover page. Changes go to the caller's draft; its Save keeps them.
 */

type Update = (fn: (g: GalleryItem[]) => GalleryItem[]) => void;

interface Props {
  projectId: string;
  items: GalleryItem[];
  /** Add, remove, reorder and caption, choose the cover and the report's pictures. Else read-only. */
  editing: boolean;
  onChange?: Update;
  /** An upload is running (the caller's Save waits for it). */
  onBusy?: (busy: boolean) => void;
}

const assetSrc = (p: string) => { const s = p.replace(/^\/+/, ""); return s.startsWith("uploads/") ? attachmentUrl(s) : (p.startsWith("/") ? p : `/${p}`); };

export default function ProjectGallery({ projectId, items, editing, onChange, onBusy }: Props) {
  const [uploading, setUploading] = useState(false);
  const [link, setLink] = useState("");
  useEffect(() => { if (!editing) setLink(""); }, [editing]);

  const update: Update = (fn) => onChange?.(fn);
  const coverIdx = items.findIndex((g) => g.type === "image");
  const picks = items.filter((g) => g.type === "image" && g.report).length;
  const full = picks >= REPORT_PICKS;

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    onBusy?.(true);
    let added = 0;
    try {
      for (const file of files) {
        try {
          const { url, type } = await uploadGalleryFile(projectId, file);
          update((g) => [...g, { type, source: "upload", url, caption: "" }]);
          added++;
        } catch (err) { toast(`${file.name}: ${err instanceof Error ? err.message : "Upload failed."}`, "error"); }
      }
      if (added) toast(added === 1 ? "Added to the gallery. Save to keep it." : `${added} added to the gallery. Save to keep them.`, "success");
    } finally {
      setUploading(false);
      onBusy?.(false);
    }
  };
  const addLink = () => {
    const url = link.trim();
    if (!url) return;
    update((g) => [...g, { type: "video", source: "link", url, caption: "" }]);
    setLink("");
  };
  const remove = (i: number) => update((g) => g.filter((_, k) => k !== i));
  const move = (i: number, dir: -1 | 1) => update((g) => {
    const j = i + dir;
    if (j < 0 || j >= g.length) return g;
    const arr = [...g];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return arr;
  });
  // The cover is the first picture, so making one the cover moves it to the front.
  const makeCover = (i: number) => update((g) => [g[i], ...g.filter((_, k) => k !== i)]);
  const setCaption = (i: number, caption: string) => update((g) => g.map((x, k) => (k === i ? { ...x, caption } : x)));
  const toggleReport = (i: number) => update((g) => {
    const on = !g[i].report;
    if (on && g.filter((x) => x.type === "image" && x.report).length >= REPORT_PICKS) return g;
    return g.map((x, k) => (k === i ? { ...x, report: on } : x));
  });

  return (
    <div className="space-y-3">
      {coverIdx >= 0 && (
        <p className={`text-[11px] font-semibold ${picks ? "text-emerald-700" : "text-slate-500"}`}>
          Quick Report cover: {picks ? `${picks} of ${REPORT_PICKS} pictures picked` : "none picked, so the cover picture shows"}
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 italic">{editing ? "No pictures yet. Upload images or videos, or add a video link below." : "No pictures yet."}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((g, i) => {
            const isImage = g.type === "image";
            const isCover = i === coverIdx;
            const picked = isImage && !!g.report;
            return (
              <div key={`${g.url}-${i}`} className={`flex gap-3 p-3 rounded-2xl border transition-colors ${picked ? "bg-emerald-50/70 border-emerald-200" : "bg-slate-50 border-slate-100"}`}>
                <div className="relative w-24 h-[4.5rem] rounded-lg overflow-hidden bg-slate-200 flex items-center justify-center flex-shrink-0">
                  {isImage ? <img src={assetSrc(g.url)} alt={g.caption || ""} loading="lazy" className="w-full h-full object-cover" /> : <Film size={20} className="text-slate-400" />}
                  {isCover && (
                    <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-md bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white"><Star size={9} className="fill-current" /> Cover</span>
                  )}
                </div>
                <div className="flex-grow min-w-0 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-primary">{g.type}{g.source === "link" ? " · link" : ""}</span>
                    {picked && !editing && <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">· On the report cover</span>}
                  </div>
                  {editing
                    ? <input value={g.caption || ""} onChange={(e) => setCaption(i, e.target.value)} placeholder="Caption (optional)" aria-label="Caption" className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-primary/10" />
                    : <p className={`truncate text-xs ${g.caption ? "font-semibold text-slate-700" : "italic text-slate-400"}`} title={g.caption || ""}>{g.caption || "No caption"}</p>}
                  {editing && isImage && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={picked}
                        onClick={() => toggleReport(i)}
                        disabled={!picked && full}
                        title={!picked && full ? "Two pictures are on the report cover already. Untick one first." : picked ? "Take it off the Quick Report's cover" : "Show it on the Quick Report's cover"}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${picked ? "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700"}`}
                      >
                        <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${picked ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white"}`}>{picked && <Check size={10} strokeWidth={3} />}</span>
                        Report cover
                      </button>
                      {!isCover && (
                        <button type="button" onClick={() => makeCover(i)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 transition-colors hover:border-primary/40 hover:text-primary"><Star size={11} /> Make cover</button>
                      )}
                    </div>
                  )}
                </div>
                {editing && (
                  <div className="flex flex-col items-center gap-0.5">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="px-1.5 rounded text-slate-400 hover:text-primary disabled:opacity-30 text-sm font-bold">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" className="px-1.5 rounded text-slate-400 hover:text-primary disabled:opacity-30 text-sm font-bold">↓</button>
                    <button type="button" onClick={() => remove(i)} aria-label="Remove" className="p-1 rounded text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {editing && (
        <div className="flex flex-wrap gap-3 pt-1">
          <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold transition-colors ${uploading ? "opacity-60 cursor-wait" : "hover:bg-primary cursor-pointer"}`}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {uploading ? "Uploading…" : "Upload images / videos"}
            <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { const f: File[] = e.target.files ? Array.from(e.target.files) : []; e.target.value = ""; void upload(f); }} disabled={uploading} />
          </label>
          <div className="flex gap-2 flex-grow min-w-[220px]">
            <input value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLink()} placeholder="Paste a YouTube / Vimeo link…" className="flex-grow bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-primary/10" />
            <button type="button" onClick={addLink} className="px-4 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200">Add link</button>
          </div>
        </div>
      )}
    </div>
  );
}
