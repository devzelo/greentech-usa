import { useState } from "react";
import { Eye, Download, Trash2 } from "lucide-react";
import ShareMenu from "./ShareMenu";
import DocumentViewer from "./DocumentViewer";

// CR-P-10 — the standard action cluster shown in front of ANY uploaded file, everywhere in the
// platform: Preview (in-app viewer), Share, Download, and Delete. Pass `onDelete` only where the
// current user may remove the file; omit it to hide the delete action.
export default function FileActions({ name, url, projectName, onDelete, size = 13, className = "" }: {
  name: string;
  url: string;              // relative /uploads/... URL (attachmentUrl / documentUrl output)
  projectName?: string;
  onDelete?: () => void;
  size?: number;
  className?: string;
}) {
  const [view, setView] = useState(false);
  return (
    <span className={`inline-flex items-center gap-0.5 shrink-0 ${className}`}>
      <button onClick={() => setView(true)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-primary" title="Preview"><Eye size={size} /></button>
      <ShareMenu fileName={name} fileUrl={url} projectName={projectName} size={size} />
      <a href={url} download={name} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-primary" title="Download"><Download size={size} /></a>
      {onDelete && <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500" title="Delete"><Trash2 size={size} /></button>}
      {view && <DocumentViewer doc={{ name, url, fileType: (name.split(".").pop() || "").toLowerCase() }} onClose={() => setView(false)} />}
    </span>
  );
}
