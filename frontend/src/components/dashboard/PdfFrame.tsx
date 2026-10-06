import { useEffect, useRef, useState, type ReactElement } from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import { Loader2 } from "lucide-react";

/**
 * A react-pdf document shown in a preview, built once when the preview opens.
 *
 * react-pdf's own <PDFViewer> builds the PDF again every time the page around it re-renders, and the
 * project page re-renders every few seconds (who else is here, autosave), so the preview reloaded
 * and blinked. This keeps the document as it was when the preview opened; closing and opening the
 * preview again shows any later change.
 */
export default function PdfFrame({ children, title = "PDF preview" }: { children: ReactElement<DocumentProps>; title?: string }) {
  const doc = useRef(children);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    let made = "";
    pdf(doc.current).toBlob()
      .then((b) => { if (!live) return; made = URL.createObjectURL(b); setUrl(made); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not build the preview."); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, []);
  if (error) return <div className="flex h-full w-full items-center justify-center p-6 text-sm text-red-600">{error}</div>;
  if (!url) return <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" /> Building the preview...</div>;
  return <iframe src={url} title={title} className="h-full w-full border-0" />;
}
