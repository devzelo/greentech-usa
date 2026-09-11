import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowLeftRight, Eye, Loader2 } from "lucide-react";
import { attachmentUrl, type ApiSavedDocument } from "../../lib/api";
import { extractPdfWords, type PdfWord } from "../../lib/pdfWords";
import { diffRevisionWords, type RevisionDiff } from "../../lib/textDiff";

// CR-P (85) - "we should be able to see the difference between two revisions."
// Reads the text of both PDFs and shows each place that changed: removed words struck through in
// red, added words in green, with a little unchanged text around each for context.

const revLabel = (d: ApiSavedDocument) => `Rev ${Math.max(0, (d.version || 1) - 1)}`;
const pageSpan = (a: number, b: number) => (a === b ? `page ${a}` : `pages ${a} to ${b}`);

/** Only PDFs have text to compare. An uploaded Word or image revision is skipped. */
export const isComparable = (d: ApiSavedDocument) =>
  (d.fileType || d.fileName.split(".").pop() || "").toLowerCase() === "pdf";

interface Props {
  title: string;              // the stream, e.g. "Technical Proposal"
  docs: ApiSavedDocument[];   // that stream's revisions, newest first
  fromId: string;
  toId: string;
  onClose: () => void;
}

type View = { phase: "loading" } | { phase: "error"; message: string } | { phase: "done"; diff: RevisionDiff };

export default function RevisionCompare({ title, docs, fromId: initialFrom, toId: initialTo, onClose }: Props) {
  const pdfs = useMemo(() => docs.filter(isComparable), [docs]);
  const [fromId, setFromId] = useState(initialFrom);
  const [toId, setToId] = useState(initialTo);
  const [view, setView] = useState<View>({ phase: "loading" });
  // Each file is read once per opening, however often the picks change.
  const cache = useRef(new Map<string, Promise<PdfWord[]>>());

  const wordsOf = (d: ApiSavedDocument) => {
    let p = cache.current.get(d._id);
    if (!p) {
      p = extractPdfWords(attachmentUrl(d.filePath));
      cache.current.set(d._id, p);
      p.catch(() => cache.current.delete(d._id));
    }
    return p;
  };

  const from = pdfs.find((d) => d._id === fromId);
  const to = pdfs.find((d) => d._id === toId);

  useEffect(() => {
    if (!from || !to) { setView({ phase: "error", message: "Pick two PDF revisions to compare." }); return; }
    if (from._id === to._id) { setView({ phase: "error", message: "Pick two different revisions." }); return; }
    let alive = true;
    setView({ phase: "loading" });
    Promise.all([wordsOf(from), wordsOf(to)])
      .then(([a, b]) => {
        if (!alive) return;
        if (!a.length || !b.length) {
          setView({ phase: "error", message: `${revLabel(!a.length ? from : to)} has no selectable text (it may be a scanned document), so it cannot be compared word by word. Open both with the eye buttons instead.` });
          return;
        }
        // Let "Reading both revisions..." paint before the comparison itself runs.
        setTimeout(() => {
          if (!alive) return;
          const diff = diffRevisionWords(a, b);
          setView(diff ? { phase: "done", diff } : { phase: "error", message: "These two revisions are too different to compare word by word. Open both with the eye buttons instead." });
        }, 0);
      })
      .catch((err) => { if (alive) setView({ phase: "error", message: err instanceof Error ? err.message : "Could not read the files." }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, toId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sel = "px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 max-w-[16rem]";
  const option = (d: ApiSavedDocument) => (
    <option key={d._id} value={d._id}>{revLabel(d)}{d.title ? ` · ${d.title}` : ""}</option>
  );
  const openBtn = (d: ApiSavedDocument | undefined) => d && (
    <button onClick={() => window.open(attachmentUrl(d.filePath), "_blank")} title={`Open ${revLabel(d)}`} aria-label={`Open ${revLabel(d)}`} className="p-1.5 rounded text-slate-400 hover:text-primary"><Eye size={14} /></button>
  );

  // Portalled to <body> so no transformed or clipped ancestor in the project tabs can trap it.
  return createPortal(
    <div className="fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Compare ${title} revisions`} className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-display font-bold text-slate-900 text-base">Compare revisions</h3>
            <p className="text-[11px] text-slate-400">{title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-50"><X size={16} /></button>
        </div>

        <div className="flex items-center gap-2 flex-wrap px-6 py-3 border-b border-slate-100 bg-slate-50/50">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">From</span>
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={sel} aria-label="Compare from">{pdfs.map(option)}</select>
          {openBtn(from)}
          <button onClick={() => { setFromId(toId); setToId(fromId); }} title="Swap" aria-label="Swap the two revisions" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-white"><ArrowLeftRight size={14} /></button>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">To</span>
          <select value={toId} onChange={(e) => setToId(e.target.value)} className={sel} aria-label="Compare to">{pdfs.map(option)}</select>
          {openBtn(to)}
        </div>

        <div className="px-6 py-4 max-h-[65vh] overflow-y-auto">
          {view.phase === "loading" && (
            <p className="flex items-center justify-center gap-2 text-xs text-slate-400 py-10"><Loader2 size={14} className="animate-spin" /> Reading both revisions...</p>
          )}
          {view.phase === "error" && <p className="text-xs text-slate-500 py-10 text-center max-w-md mx-auto">{view.message}</p>}
          {view.phase === "done" && (view.diff.hunks.length === 0 ? (
            <p className="text-xs text-slate-500 py-10 text-center">The text is identical. Layout, images or formatting may still differ.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap text-[11px] font-bold">
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{view.diff.hunks.length} place{view.diff.hunks.length === 1 ? "" : "s"} changed</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">+{view.diff.added} word{view.diff.added === 1 ? "" : "s"}</span>
                <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600">-{view.diff.removed} word{view.diff.removed === 1 ? "" : "s"}</span>
              </div>
              {view.diff.hunks.map((h, i) => (
                <div key={i} className="rounded-xl border border-slate-100">
                  <p className="px-3 py-1.5 border-b border-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {from && revLabel(from)} {pageSpan(h.pageFrom, h.pageFromEnd)} · {to && revLabel(to)} {pageSpan(h.pageTo, h.pageToEnd)}
                  </p>
                  <p className="px-3 py-2.5 text-xs leading-relaxed text-slate-600 break-words">
                    {h.cutStart && "... "}
                    {h.segs.map((s, k) => (
                      <span key={k}>
                        {k > 0 && " "}
                        {s.kind === "same" ? s.text
                          : s.kind === "del" ? <del className="bg-red-50 text-red-700 decoration-red-400 px-0.5 rounded">{s.text}</del>
                          : <ins className="bg-emerald-50 text-emerald-800 no-underline px-0.5 rounded">{s.text}</ins>}
                      </span>
                    ))}
                    {h.cutEnd && " ..."}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap px-6 py-3 border-t border-slate-100 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1"><del className="bg-red-50 text-red-700 px-1 rounded">removed</del></span>
          <span className="inline-flex items-center gap-1"><ins className="bg-emerald-50 text-emerald-800 no-underline px-1 rounded">added</ins></span>
          <span>Compares the words in both PDFs. Changes to layout, images and formatting are not shown.</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
