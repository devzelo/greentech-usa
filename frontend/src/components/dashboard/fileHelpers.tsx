import { FileText, FileImage, FileCode, FileSpreadsheet, File } from "lucide-react";

/** Coarse file category used for icons, colors, and the type filter. */
export function classifyForFilter(ext: string): string {
  const e = (ext || "").toLowerCase();
  if (e === "pdf") return "pdf";
  if (e === "docx" || e === "doc") return "docx";
  if (e === "xlsx" || e === "xls" || e === "csv") return "xlsx";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(e)) return "image";
  return "other";
}

export function iconFor(ext: string, size = 20) {
  const cat = classifyForFilter(ext);
  if (cat === "image") return <FileImage size={size} />;
  if (cat === "pdf") return <FileText size={size} />;
  if (cat === "docx") return <FileText size={size} />;
  if (cat === "xlsx") return <FileSpreadsheet size={size} />;
  if (["dwg", "cad"].includes((ext || "").toLowerCase())) return <FileCode size={size} />;
  return <File size={size} />;
}

export function colorFor(ext: string) {
  const cat = classifyForFilter(ext);
  if (cat === "pdf") return "bg-red-50 text-red-500";
  if (cat === "docx") return "bg-blue-50 text-blue-500";
  if (cat === "xlsx") return "bg-emerald-50 text-emerald-500";
  if (cat === "image") return "bg-amber-50 text-amber-500";
  return "bg-slate-100 text-slate-500";
}

export function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
