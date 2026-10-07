import { useEffect, useState } from "react";
import { Check, Stamp } from "lucide-react";
import { fetchStamps, withFileToken, type CompanyFile } from "../../lib/api";

/**
 * 2026-10-07 - "the stamp/seal is not working in any document builder. Make it similar to the
 * Signature so we can choose which stamp to use from the Stamp folder, and only one." One picker
 * for every document that carries a company stamp (EOI, cover letter, agreements, POs, requests):
 * the stamps in Classified Documents › Stamps as cards, one chosen (or none).
 *
 * A stamp is stored as its file's path ("/uploads/company/…"), which every PDF prints; uploaded
 * stamps have no `url` (only seeded files do), which is what left the old pickers blank.
 */
export const stampValue = (f: CompanyFile): string =>
  f.url || (f.filePath ? `/${f.filePath.replace(/\\/g, "/").replace(/^\/+/, "")}` : "");
/** Compare two stored stamps whatever their spelling ("uploads/x", "/uploads/x?token=…"). */
const key = (v?: string) => (v || "").replace(/\\/g, "/").replace(/^\/+/, "").split("?")[0];
/** The stamp as an <img> source. */
export const stampSrc = (v?: string): string => {
  const s = (v || "").replace(/\\/g, "/");
  if (!s) return "";
  return /^\/?uploads\//.test(s) ? withFileToken(`/${s.replace(/^\/+/, "")}`) : s;
};

export default function StampPicker({ value, onChange, disabled, extra = [] }: {
  value?: string;
  onChange: (stamp: string) => void;
  disabled?: boolean;
  /** More stamps to offer, e.g. a JV partner's (name and image path). */
  extra?: Array<{ name: string; url: string; note?: string }>;
}) {
  const [stamps, setStamps] = useState<CompanyFile[] | null>(null);
  useEffect(() => { let alive = true; fetchStamps().then((s) => alive && setStamps(s)).catch(() => alive && setStamps([])); return () => { alive = false; }; }, []);
  const choices = [
    ...(stamps || []).map((f) => ({ name: f.name.replace(/\.[a-z0-9]+$/i, ""), url: stampValue(f), note: "Stamps folder" })),
    ...extra.filter((x) => x.url).map((x) => ({ name: x.name, url: x.url, note: x.note || "Partner" })),
  ].filter((x) => x.url);
  const chosen = key(value);
  // A stamp chosen earlier that is no longer in the folder still shows, so it is not lost silently.
  const orphan = chosen && !choices.some((c) => key(c.url) === chosen);
  const card = (on: boolean) => `flex items-center gap-2 rounded-xl border bg-white p-2 text-left disabled:cursor-default ${on ? "border-primary ring-2 ring-primary/20" : "border-slate-100 hover:border-slate-300"}`;

  return (
    <div role="radiogroup" aria-label="Company stamp" className="space-y-1.5">
      {stamps === null ? <p className="text-[11px] text-slate-400">Loading the stamps…</p> : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" role="radio" aria-checked={!chosen} disabled={disabled} onClick={() => onChange("")} className={card(!chosen)}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300"><Stamp size={16} /></span>
            <span className="min-w-0"><span className="block truncate text-[11px] font-bold text-slate-800">No stamp</span><span className="block truncate text-[10px] text-slate-500">Signature only</span></span>
            {!chosen && <Check size={13} className="ml-auto shrink-0 text-primary" />}
          </button>
          {choices.map((c) => {
            const on = key(c.url) === chosen;
            return (
              <button key={c.url} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(c.url)} title={c.name} className={card(on)}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50 p-0.5"><img src={stampSrc(c.url)} alt="" className="max-h-full max-w-full object-contain" /></span>
                <span className="min-w-0"><span className="block truncate text-[11px] font-bold text-slate-800">{c.name}</span><span className="block truncate text-[10px] text-slate-500">{c.note}</span></span>
                {on && <Check size={13} className="ml-auto shrink-0 text-primary" />}
              </button>
            );
          })}
          {orphan && (
            <div className={card(true)}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50 p-0.5"><img src={stampSrc(value)} alt="" className="max-h-full max-w-full object-contain" /></span>
              <span className="min-w-0"><span className="block truncate text-[11px] font-bold text-slate-800">Chosen earlier</span><span className="block truncate text-[10px] text-slate-500">No longer in the Stamps folder</span></span>
              <Check size={13} className="ml-auto shrink-0 text-primary" />
            </div>
          )}
        </div>
      )}
      {stamps !== null && choices.length === 0 && <p className="text-[11px] text-slate-400">No stamps yet. An admin adds them in Documents › Classified › Stamps.</p>}
    </div>
  );
}
