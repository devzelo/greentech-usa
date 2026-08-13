import { useEffect, useState } from "react";
import { Loader2, Download, Printer, X, Send } from "lucide-react";
import { emailFileAttachment } from "../../lib/api";
import { toast } from "../../lib/toast";

/**
 * Branded modal that builds a PDF (pdf-lib Blob) once, shows it in an iframe preview, and
 * offers a Download button — used for BOQ / RFQ / PO, mirroring the resume preview.
 */
export default function PdfPreviewModal({ title, fileName, build, onClose }: {
  title: string;
  fileName: string;
  build: () => Promise<Blob>;
  onClose: () => void;
}) {
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
    (async () => {
      try {
        const b = await build();
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
  }, []);

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
      <div onClick={onClose} className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-base font-display font-bold text-slate-900 truncate">{title}</h3>
          <div className="flex items-center gap-2 shrink-0">
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
            <button onClick={download} disabled={!blob} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary disabled:opacity-50"><Download size={12} /> Download</button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} /></button>
          </div>
        </div>
        <div className="flex-grow bg-slate-100">
          {error ? (
            <div className="h-full flex items-center justify-center text-sm text-red-500 px-6 text-center">{error}</div>
          ) : url ? (
            <iframe title={title} src={url} className="w-full h-full border-0" />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-300"><Loader2 size={24} className="animate-spin" /></div>
          )}
        </div>
      </div>
    </div>
  );
}
