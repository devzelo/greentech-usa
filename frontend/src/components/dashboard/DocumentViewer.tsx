import { useEffect, useState } from "react";
import { X, Download, FileText, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { motion } from "motion/react";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import ShareMenu from "./ShareMenu";

interface PreviewableDoc {
  name: string;
  url: string;
  fileType: string;
}

type ViewerState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "image" | "pdf" | "video" | "audio" | "text"; src: string }
  | { kind: "docx"; html: string }
  | { kind: "xlsx"; sheets: { name: string; html: string }[]; active: number }
  | { kind: "office"; src: string; localhost: boolean }
  | { kind: "unsupported"; reason: string };

function classify(ext: string): "image" | "pdf" | "docx" | "xlsx" | "pptx" | "video" | "audio" | "text" | "other" {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(e)) return "image";
  if (e === "pdf") return "pdf";
  if (e === "docx") return "docx";
  if (e === "xlsx" || e === "xls" || e === "csv") return "xlsx";
  if (["pptx", "ppt"].includes(e)) return "pptx";
  if (["mp4", "webm", "mov"].includes(e)) return "video";
  if (["mp3", "wav", "ogg", "m4a"].includes(e)) return "audio";
  if (["txt", "md", "json", "log", "yml", "yaml", "ini", "xml", "html", "css", "js", "ts", "tsx", "jsx"].includes(e)) return "text";
  return "other";
}

export default function DocumentViewer({
  doc,
  onClose,
}: {
  doc: PreviewableDoc | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<ViewerState>({ kind: "idle" });

  useEffect(() => {
    if (!doc) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });

    const kind = classify(doc.fileType || doc.name.split(".").pop() || "");

    const run = async () => {
      try {
        if (kind === "image" || kind === "pdf" || kind === "video" || kind === "audio") {
          if (!cancelled) setState({ kind, src: doc.url });
          return;
        }
        if (kind === "text") {
          const txt = await fetch(doc.url).then((r) => r.text());
          if (!cancelled) setState({ kind: "text", src: txt });
          return;
        }
        if (kind === "docx") {
          const buf = await fetch(doc.url).then((r) => r.arrayBuffer());
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          if (!cancelled) setState({ kind: "docx", html: result.value });
          return;
        }
        if (kind === "xlsx") {
          const buf = await fetch(doc.url).then((r) => r.arrayBuffer());
          const wb = XLSX.read(buf, { type: "array" });
          const sheets = wb.SheetNames.map((name) => ({
            name,
            html: XLSX.utils.sheet_to_html(wb.Sheets[name], { id: `sheet-${name}` }),
          }));
          if (!cancelled) setState({ kind: "xlsx", sheets, active: 0 });
          return;
        }
        if (kind === "pptx") {
          // PPTX rendering uses Microsoft Office Online viewer, which requires
          // a publicly reachable URL. On localhost it can't fetch the file.
          const absoluteUrl = new URL(doc.url, window.location.origin).toString();
          const isLocal = /localhost|127\.0\.0\.1/.test(window.location.hostname);
          const src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteUrl)}`;
          if (!cancelled) setState({ kind: "office", src, localhost: isLocal });
          return;
        }
        if (!cancelled) setState({ kind: "unsupported", reason: `${kind === "other" ? "This file type" : kind} cannot be previewed in-browser. Use Download to open it locally.` });
      } catch (err) {
        if (!cancelled) setState({ kind: "unsupported", reason: err instanceof Error ? err.message : "Failed to preview this file." });
      }
    };
    run();
    return () => { cancelled = true; };
  }, [doc]);

  if (!doc) return null;

  return (
    <div className="fixed inset-0 z-[200] flex">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 220 }}
        className="relative ml-auto w-full max-w-5xl h-screen bg-slate-50 flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-primary flex-shrink-0">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-sm truncate">{doc.name}</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">In-app viewer · {doc.fileType || classify(doc.name.split(".").pop() || "")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ShareMenu fileName={doc.name} fileUrl={doc.url} size={18} />
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 transition-all"
              title="Open in new tab"
            >
              <ExternalLink size={18} />
            </a>
            <a
              href={doc.url}
              download={doc.name}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 transition-all"
            >
              <Download size={14} /> Download
            </a>
            <button
              onClick={onClose}
              className="p-2 bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-all active:scale-95"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-grow overflow-auto bg-slate-100">
          {state.kind === "loading" && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Loader2 size={32} className="animate-spin mb-3" />
              <p className="text-xs font-bold uppercase tracking-widest">Preparing preview…</p>
            </div>
          )}

          {state.kind === "image" && (
            <div className="flex items-center justify-center min-h-full p-8">
              <img src={state.src} alt={doc.name} className="max-w-full max-h-[85vh] object-contain shadow-xl rounded-lg" />
            </div>
          )}

          {state.kind === "pdf" && (
            <iframe src={state.src} title={doc.name} className="w-full h-full border-0" />
          )}

          {state.kind === "video" && (
            <div className="flex items-center justify-center min-h-full p-8">
              <video controls src={state.src} className="max-w-full max-h-[85vh] shadow-xl rounded-lg" />
            </div>
          )}

          {state.kind === "audio" && (
            <div className="flex items-center justify-center min-h-full p-8">
              <audio controls src={state.src} className="w-96" />
            </div>
          )}

          {state.kind === "text" && (
            <pre className="p-8 text-xs font-mono text-slate-700 whitespace-pre-wrap break-words bg-white min-h-full">{state.src}</pre>
          )}

          {state.kind === "docx" && (
            <div className="p-10">
              <div
                className="bg-white max-w-4xl mx-auto shadow-sm rounded-lg p-12 border border-slate-200 prose prose-slate max-w-none"
                dangerouslySetInnerHTML={{ __html: state.html }}
              />
            </div>
          )}

          {state.kind === "xlsx" && (
            <div className="p-6 space-y-4">
              {state.sheets.length > 1 && (
                <div className="flex gap-1 overflow-x-auto bg-white rounded-xl p-1 shadow-sm">
                  {state.sheets.map((s, i) => (
                    <button
                      key={s.name}
                      onClick={() => setState({ ...state, active: i })}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
                        i === state.active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              <div
                className="bg-white rounded-xl border border-slate-200 overflow-auto p-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-1.5 [&_th]:border [&_th]:border-slate-200 [&_th]:px-3 [&_th]:py-1.5 [&_th]:bg-slate-50 [&_td]:text-xs [&_th]:text-xs"
                dangerouslySetInnerHTML={{ __html: state.sheets[state.active].html }}
              />
            </div>
          )}

          {state.kind === "office" && (
            <div className="w-full h-full flex flex-col">
              {state.localhost && (
                <div className="bg-amber-50 border-b border-amber-100 text-amber-700 text-xs font-bold px-6 py-3 text-center">
                  PowerPoint preview uses Microsoft Office Online and needs a publicly-reachable URL. On localhost it can&apos;t fetch the file — use Download to view, or test after deploying.
                </div>
              )}
              <iframe src={state.src} title={doc.name} className="flex-grow w-full border-0" />
            </div>
          )}

          {state.kind === "unsupported" && (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto p-6">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mb-6">
                <AlertCircle size={32} />
              </div>
              <h2 className="text-lg font-display font-bold text-slate-900 mb-3">Preview unavailable</h2>
              <p className="text-sm text-slate-500 mb-6">{state.reason}</p>
              <a
                href={doc.url}
                download={doc.name}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl text-xs font-bold"
              >
                <Download size={14} /> Download to view
              </a>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
