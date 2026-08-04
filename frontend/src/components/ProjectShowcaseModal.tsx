import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, ChevronLeft, ChevronRight, MapPin, Calendar, User, Building2,
  FileText, Download, ExternalLink, Loader2, ImageOff,
} from "lucide-react";
import { fetchPublicProject, ApiPublicProjectDetail, GalleryItem } from "../lib/api";

const STATUS_STYLES: Record<string, string> = {
  Ongoing: "bg-blue-500 text-white",
  Completed: "bg-emerald-500 text-white",
  Pending: "bg-amber-500 text-white",
  Planning: "bg-violet-500 text-white",
};

// Convert a YouTube/Vimeo URL to an embeddable URL.
function embedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

function GalleryStage({ items }: { items: GalleryItem[] }) {
  const [i, setI] = useState(0);
  const count = items.length;
  const go = useCallback((d: number) => setI((p) => (p + d + count) % count), [count]);

  useEffect(() => {
    if (count < 2) return;
    const cur = items[i];
    if (cur?.type === "video") return; // don't auto-advance over a video
    const t = setTimeout(() => go(1), 6000);
    return () => clearTimeout(t);
  }, [i, count, items, go]);

  if (count === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-white/40 bg-slate-800">
        <ImageOff size={40} />
        <p className="text-xs font-bold uppercase tracking-widest mt-3">No media yet</p>
      </div>
    );
  }

  const item = items[i];

  return (
    <div className="relative w-full h-full bg-slate-900">
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0"
        >
          {item.type === "image" ? (
            <img src={item.url} alt={item.caption || "Project image"} className="w-full h-full object-cover" />
          ) : item.source === "link" && embedUrl(item.url) ? (
            <iframe src={embedUrl(item.url)!} title="Project video" className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          ) : (
            <video src={item.url} controls className="w-full h-full object-contain bg-black" />
          )}
        </motion.div>
      </AnimatePresence>

      {item.caption && item.type === "image" && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/80 to-transparent p-4 pt-10">
          <p className="text-white text-sm font-medium">{item.caption}</p>
        </div>
      )}

      {count > 1 && (
        <>
          <button onClick={() => go(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-900 flex items-center justify-center shadow-lg transition-all">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => go(1)} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-900 flex items-center justify-center shadow-lg transition-all">
            <ChevronRight size={18} />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
            {items.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setI(idx)}
                className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ProjectShowcaseModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [data, setData] = useState<ApiPublicProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false);
    fetchPublicProject(projectId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const statusClass = data ? (STATUS_STYLES[data.status] || "bg-slate-500 text-white") : "";

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: "spring", damping: 28, stiffness: 240 }}
        className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-slate-700 flex items-center justify-center shadow-lg transition-all"
        >
          <X size={20} />
        </button>

        {loading ? (
          <div className="flex items-center justify-center py-40 text-slate-300"><Loader2 size={36} className="animate-spin" /></div>
        ) : error || !data ? (
          <div className="flex flex-col items-center justify-center py-40 text-slate-400">
            <ImageOff size={36} className="mb-3" />
            <p className="font-bold text-sm">This project is not available.</p>
          </div>
        ) : (
          <div className="overflow-y-auto">
            {/* Header carousel */}
            <div className="relative aspect-[16/9] w-full flex-shrink-0">
              <GalleryStage items={data.gallery} />
              <span className={`absolute top-4 left-4 z-10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm ${statusClass}`}>
                {data.status}
              </span>
            </div>

            {/* Body */}
            <div className="p-8 sm:p-10">
              {data.category && (
                <span className="inline-block text-[11px] font-bold text-primary uppercase tracking-widest mb-2">{data.category}</span>
              )}
              <h2 className="font-display text-3xl font-bold text-slate-900 mb-5 leading-tight">{data.name}</h2>

              {/* Meta grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mb-8">
                {data.clientName && (
                  <div className="flex items-center gap-2.5 text-sm text-slate-600">
                    <Building2 size={16} className="text-primary flex-shrink-0" />
                    <span className="text-slate-400 font-medium">Client:</span>
                    <span className="font-bold text-slate-900">{data.clientName}</span>
                  </div>
                )}
                {data.location && (
                  <div className="flex items-center gap-2.5 text-sm text-slate-600">
                    <MapPin size={16} className="text-primary flex-shrink-0" />
                    <span className="font-bold text-slate-900">{data.location}</span>
                  </div>
                )}
                {(data.startDate || data.endDate) && (
                  <div className="flex items-center gap-2.5 text-sm text-slate-600">
                    <Calendar size={16} className="text-primary flex-shrink-0" />
                    <span className="font-bold text-slate-900">{data.startDate || "—"} → {data.endDate || "—"}</span>
                  </div>
                )}
                {data.owner && (
                  <div className="flex items-center gap-2.5 text-sm text-slate-600">
                    <User size={16} className="text-primary flex-shrink-0" />
                    <span className="text-slate-400 font-medium">Lead:</span>
                    <span className="font-bold text-slate-900">{data.owner}</span>
                  </div>
                )}
              </div>

              {/* Progress */}
              {data.progress > 0 && (
                <div className="mb-8">
                  <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    <span>Completion</span><span className="text-primary">{data.progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gt-gradient" style={{ width: `${Math.min(100, data.progress)}%` }} />
                  </div>
                </div>
              )}

              {/* Description */}
              {data.description && (
                <div className="mb-8">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">About this project</h3>
                  <p className="text-slate-600 leading-relaxed whitespace-pre-line">{data.description}</p>
                </div>
              )}

              {/* Documents */}
              {data.documents.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Documents</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {data.documents.map((d, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="w-9 h-9 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-primary flex-shrink-0">
                          <FileText size={15} />
                        </div>
                        <span className="flex-grow min-w-0 text-sm font-bold text-slate-900 truncate" title={d.name}>{d.name}</span>
                        <a href={d.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-white" title="Open"><ExternalLink size={15} /></a>
                        <a href={d.url} download={d.name} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-white" title="Download"><Download size={15} /></a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
