import { useEffect, useState } from "react";
import { Loader2, Download, X } from "lucide-react";

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
