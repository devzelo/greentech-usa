import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Download, Printer, X, Send, Minimize2 } from "lucide-react";
import { emailFileAttachment } from "../../lib/api";
import { toast } from "../../lib/toast";
import { fitToOnePage } from "../../lib/pdfBrand";

/**
 * Branded modal that builds a PDF (pdf-lib Blob) once, shows it in an iframe preview, and
 * offers a Download button — used for BOQ / RFQ / PO, mirroring the resume preview.
 */
/** CR 250 - an action taken from the preview (Save, Mark as final, Save revision). Returning false keeps the preview open. */
export interface PreviewAction {
  label: string;
  icon?: ReactNode;
  onClick: () => Promise<boolean | void> | boolean | void;
  tone?: "primary" | "final";
}

export default function PdfPreviewModal({ title, fileName, build, onClose, fitOption, actions, hint, toggles, rebuildKey, exports }: {
  title: string;
  fileName: string;
  build: () => Promise<Blob>;
  onClose: () => void;
  /** CR 247 - offer "Fit to one page" (large schedules and logs); the text goes in the footer note. */
  fitOption?: { note?: string };
  /** CR 250 - "preview before save / before final": the step itself, taken from the preview. */
  actions?: PreviewAction[];
  /** A line under the title, e.g. what the action will do. */
  hint?: string;
  /** CR 270 - switches that change what the PDF contains, e.g. "Print remarks". */
  toggles?: Array<{ key: string; label: string; icon?: ReactNode; title?: string; value: boolean; onChange: (v: boolean) => void }>;
  /** Changes whenever a toggle above changes, so the PDF is built again. */
  rebuildKey?: string | number;
  /** 2026-10-09 - the same document in other formats (Excel, Word), to change or add to by hand. */
  exports?: Array<{ label: string; icon?: ReactNode; title?: string; run: () => Promise<void> | void }>;
}) {
  const [acting, setActing] = useState("");
  const [exporting, setExporting] = useState("");
  const runExport = async (x: NonNullable<typeof exports>[number]) => {
    setExporting(x.label);
    try { await x.run(); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not export.", "error"); }
    finally { setExporting(""); }
  };
  const act = async (a: PreviewAction) => {
    setActing(a.label);
    try { if ((await a.onClick()) !== false) onClose(); }
    finally { setActing(""); }
  };
  const [fit, setFit] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  // CR-P-14 — Send: email this generated PDF to someone (outside or inside the org) as an attachment.
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!blob) return;
    const to = sendTo.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { toast("Enter a valid email address.", "error"); return; }
    setSending(true);
    try {
      await emailFileAttachment(blob, fileName, to, title);
      toast(`Sent to ${to}.`, "success");
      setSendTo(""); setSendOpen(false);
    } catch (e) { toast(e instanceof Error ? e.message : "Could not send.", "error"); }
    finally { setSending(false); }
  };

  useEffect(() => {
    let cancelled = false;
    let created = "";
    setUrl(null);
    (async () => {
      try {
        const full = await build();
        const b = fit ? await fitToOnePage(full, fitOption?.note) : full;
        if (cancelled) return;
        created = URL.createObjectURL(b);
        setBlob(b);
        setUrl(created);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not build the PDF.");
      }
    })();
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, rebuildKey]);

  const download = () => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="text-base font-display font-bold text-slate-900 truncate">{title}</h3>
            {hint && <p className="truncate text-[11px] text-slate-400">{hint}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* CR 247, reworked for CR 275 - the pages stacked down one sheet, never side by side. */}
            {fitOption && (
              <label className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold ${fit ? "border-primary/40 bg-primary/5 text-primary" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`} title="Stack every page down a single sheet, top to bottom">
                <input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} className="accent-emerald-600" />
                <Minimize2 size={12} /> One long sheet
              </label>
            )}
            {/* CR 270 - what goes into the PDF, decided here and rebuilt on the spot. */}
            {toggles?.map((t) => (
              <label key={t.key} title={t.title} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold ${t.value ? "border-primary/40 bg-primary/5 text-primary" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                <input type="checkbox" checked={t.value} onChange={(e) => t.onChange(e.target.checked)} className="accent-emerald-600" />
                {t.icon} {t.label}
              </label>
            ))}
            {/* CR-P-01 — Print the previewed PDF directly. */}
            <button onClick={() => { const f = document.querySelector<HTMLIFrameElement>(`iframe[title="${title.replace(/"/g, "")}"]`); (f?.contentWindow || window).print(); }} disabled={!url} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-50"><Printer size={12} /> Print</button>
            {/* CR-P-14 — Send this exact document (with any past revisions) to someone by email. */}
            <div className="relative">
              <button onClick={() => setSendOpen((v) => !v)} disabled={!blob} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-50"><Send size={12} /> Send</button>
              {sendOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-slate-100 shadow-2xl z-[10] p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Send this document</p>
                  <input type="email" value={sendTo} onChange={(e) => setSendTo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder="name@example.com" className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 mb-2" />
                  <button onClick={send} disabled={sending || !sendTo.trim()} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary disabled:opacity-40">{sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Email it</button>
                </div>
              )}
            </div>
            {exports?.map((x) => (
              <button key={x.label} onClick={() => void runExport(x)} disabled={!!exporting} title={x.title} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-50">
                {exporting === x.label ? <Loader2 size={12} className="animate-spin" /> : x.icon} {x.label}
              </button>
            ))}
            <button onClick={download} disabled={!blob} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-50 ${actions?.length ? "border border-slate-200 text-slate-600 hover:bg-slate-50" : "bg-slate-900 text-white hover:bg-primary"}`}><Download size={12} /> Download</button>
            {actions?.map((a) => (
              <button key={a.label} onClick={() => void act(a)} disabled={!blob || !!acting}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-50 ${a.tone === "final" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-900 hover:bg-primary"}`}>
                {acting === a.label ? <Loader2 size={12} className="animate-spin" /> : a.icon} {a.label}
              </button>
            ))}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} /></button>
          </div>
        </div>
        {/* 2026-10-09 - the browser's own toolbar is hidden: its download names the file after the
            preview's temporary link (a long number). Download and Print above give the real name. */}
        <div className="flex-grow bg-slate-100">
          {error ? (
            <div className="h-full flex items-center justify-center text-sm text-red-500 px-6 text-center">{error}</div>
          ) : url ? (
            <iframe title={title} src={`${url}#toolbar=0&navpanes=0`} className="w-full h-full border-0" />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-300"><Loader2 size={24} className="animate-spin" /></div>
          )}
        </div>
      </div>
    </div>
  );
}
