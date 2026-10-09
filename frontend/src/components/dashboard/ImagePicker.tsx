import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Image as ImageIcon, Loader2, Search, Stamp, Upload } from "lucide-react";
import { fetchLogoFiles, uploadPickedImage, withFileToken, type CompanyFile } from "../../lib/api";
import { toast } from "../../lib/toast";
import PickerDropdown from "./PickerDropdown";

/**
 * 2026-10-09 - "this is how the stamp system should work, very simple: the stamps saved in the
 * Stamps folder with their names; the dropdown shows all the stamps in that folder; if one is not
 * there, upload it manually. Same thing for the logo." One dropdown for a picture on a document:
 * the folder's pictures with their names, the extra ones offered (a JV partner's), None, and
 * Upload, which keeps a picture for this document only.
 *
 * A picture is stored as its path ("/uploads/company/…") or a site address, which every PDF prints.
 */
export type PictureChoice = { name: string; url: string; note?: string };

/** A folder file as the value a document stores. */
export const fileValue = (f: CompanyFile): string =>
  f.url || (f.filePath ? `/${f.filePath.replace(/\\/g, "/").replace(/^\/+/, "")}` : "");
/** Two stored pictures compared, whatever their spelling ("uploads/x", "/uploads/x?token=…"). */
export const pictureKey = (v?: string) => (v || "").replace(/\\/g, "/").replace(/^\/+/, "").split("?")[0];
/** The picture as an <img> source. */
export const pictureSrc = (v?: string): string => {
  const s = (v || "").replace(/\\/g, "/");
  if (!s) return "";
  return /^\/?uploads\//.test(s) ? withFileToken(`/${s.replace(/^\/+/, "")}`) : s;
};
const nameOf = (f: CompanyFile) => f.name.replace(/\.[a-z0-9]+$/i, "");

export default function ImagePicker({ kind, value, onChange, disabled, choices, loading, placeholder, noneLabel, noneNote, folderHint, ariaLabel }: {
  kind: "stamp" | "logo";
  value?: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  choices: PictureChoice[];
  loading?: boolean;
  placeholder: string;
  noneLabel: string;
  noneNote?: string;
  /** Where the folder is, for the empty state and the foot of the list. */
  folderHint: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const btn = useRef<HTMLButtonElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const chosen = pictureKey(value);
  const current = choices.find((c) => pictureKey(c.url) === chosen);
  const needle = q.trim().toLowerCase();
  const shown = needle ? choices.filter((c) => `${c.name} ${c.note || ""}`.toLowerCase().includes(needle)) : choices;
  const Icon = kind === "stamp" ? Stamp : ImageIcon;
  const word = kind === "stamp" ? "stamp" : "logo";

  const pick = (url: string) => { onChange(url); setOpen(false); setQ(""); };
  const upload = async (file: File) => {
    setBusy(true);
    try { const r = await uploadPickedImage(kind, file); pick(r.url); toast(`The ${word} is added to this document.`, "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Upload failed.", "error"); }
    finally { setBusy(false); }
  };
  const thumb = (src: string) => (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white p-0.5">
      {src ? <img src={pictureSrc(src)} alt="" className="max-h-full max-w-full object-contain" /> : <Icon size={16} className="text-slate-300" />}
    </span>
  );
  const row = "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none";

  return (
    <div>
      <button ref={btn} type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        className={`flex w-full items-center gap-2.5 rounded-xl border bg-white px-2 py-1.5 text-left transition-colors disabled:cursor-default disabled:bg-slate-50 ${open ? "border-primary ring-2 ring-primary/15" : "border-slate-200 hover:border-slate-300"}`}>
        {chosen ? thumb(value || "") : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300"><Icon size={16} /></span>}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-xs font-bold ${chosen ? "text-slate-800" : "text-slate-400"}`}>{chosen ? current?.name || "Uploaded for this document" : placeholder}</span>
          {chosen && <span className="block truncate text-[10px] text-slate-500">{current?.note || "Not in the folder"}</span>}
        </span>
        {!disabled && <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>

      <PickerDropdown open={open} onClose={() => { setOpen(false); setQ(""); }} anchorRef={btn} label={ariaLabel}>
        {choices.length > 6 && (
          <label className="mb-1 flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
            <Search size={13} className="text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find a ${word}`} className="w-full bg-transparent text-xs outline-none" />
          </label>
        )}
        <button type="button" role="option" aria-selected={!chosen} onClick={() => pick("")} className={row}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300"><Icon size={16} /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-700">{noneLabel}</span>{noneNote && <span className="block truncate text-[10px] text-slate-500">{noneNote}</span>}</span>
          {!chosen && <Check size={14} className="shrink-0 text-primary" />}
        </button>
        {loading && <p className="flex items-center gap-2 px-2 py-2 text-[11px] text-slate-400"><Loader2 size={12} className="animate-spin" /> Loading…</p>}
        {shown.map((c) => {
          const on = pictureKey(c.url) === chosen;
          return (
            <button key={c.url} type="button" role="option" aria-selected={on} onClick={() => pick(c.url)} title={c.name} className={row}>
              {thumb(c.url)}
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{c.name}</span>{c.note && <span className="block truncate text-[10px] text-slate-500">{c.note}</span>}</span>
              {on && <Check size={14} className="shrink-0 text-primary" />}
            </button>
          );
        })}
        {!loading && choices.length === 0 && <p className="px-2 py-2 text-[11px] text-slate-400">No {word}s in the folder yet. An admin adds them in {folderHint}.</p>}
        {!loading && choices.length > 0 && shown.length === 0 && <p className="px-2 py-2 text-[11px] text-slate-400">No {word} by that name.</p>}
        <div className="my-1 border-t border-slate-100" />
        <button type="button" role="option" aria-selected={false} disabled={busy} onClick={() => fileRef.current?.click()} className={row}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center text-slate-500">{busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}</span>
          <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-700">Upload {word}…</span><span className="block text-[10px] text-slate-500">For this document only; the folder is {folderHint}</span></span>
        </button>
        <input ref={fileRef} type="file" accept={kind === "logo" ? "image/png,image/jpeg,image/webp,image/gif" : "image/png,image/jpeg"} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
      </PickerDropdown>
    </div>
  );
}

/** The logo picker: the Logos folder (Documents › Logos), extras offered, None, Upload. */
export function LogoPicker({ value, onChange, disabled, extra = [], placeholder = "Select logo", noneLabel = "No logo", ariaLabel = "Logo" }: {
  value?: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  extra?: PictureChoice[];
  placeholder?: string;
  noneLabel?: string;
  ariaLabel?: string;
}) {
  const [files, setFiles] = useState<CompanyFile[] | null>(null);
  useEffect(() => { let alive = true; fetchLogoFiles().then((f) => alive && setFiles(f)).catch(() => alive && setFiles([])); return () => { alive = false; }; }, []);
  const choices: PictureChoice[] = [
    ...extra.filter((x) => x.url),
    ...(files || []).map((f) => ({ name: nameOf(f), url: fileValue(f), note: "Logos folder" })),
  ].filter((c, i, a) => a.findIndex((x) => pictureKey(x.url) === pictureKey(c.url)) === i);
  return <ImagePicker kind="logo" value={value} onChange={onChange} disabled={disabled} choices={choices} loading={files === null}
    placeholder={placeholder} noneLabel={noneLabel} folderHint="Documents › Logos" ariaLabel={ariaLabel} />;
}
