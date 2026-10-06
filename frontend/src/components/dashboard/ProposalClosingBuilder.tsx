import { useState } from "react";
import { Check, Eye, Globe, Loader2, Mail, MapPin, Pencil, Phone, RotateCcw, Undo2, X } from "lucide-react";
import PdfFrame from "./PdfFrame";
import type { ProposalBackCover } from "../../lib/api";
import { CLOSING_DEFAULTS, resolveClosing } from "../../lib/closingPage";
import { ClosingPageDocument } from "./ProposalPDF";

const inp = "w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
const lbl = "text-[9px] font-bold text-slate-400 uppercase tracking-widest";
const card = "bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3";

type Field = "website" | "email" | "phone" | "address";
const CONTACT: Array<{ key: Field; label: string; Icon: typeof Globe }> = [
  { key: "website", label: "Web", Icon: Globe },
  { key: "email", label: "Email", Icon: Mail },
  { key: "phone", label: "Phone", Icon: Phone },
  { key: "address", label: "Address", Icon: MapPin },
];

/**
 * 2026-10-06 - the proposal's Last Page: "Thank You", a short message and our contact details with a
 * QR code to the website. One page for both volumes, printed last (after the attachments). Every
 * field left blank takes the standard wording or the company's details.
 */
export default function ProposalClosingBuilder({ value, onChange, canEdit, onSave }: {
  value: ProposalBackCover;
  onChange: (next: ProposalBackCover) => void;
  canEdit: boolean;
  onSave?: () => Promise<unknown> | void;
}) {
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState(false);
  const [before, setBefore] = useState<ProposalBackCover | null>(null);
  const [saving, setSaving] = useState(false);
  const startEdit = () => { setBefore(value); setEditing(true); };
  const cancelEdit = () => { if (before) onChange(before); setEditing(false); };
  const save = async () => { setSaving(true); try { await onSave?.(); setEditing(false); } finally { setSaving(false); } };
  const edit = canEdit && editing;

  const set = <K extends keyof ProposalBackCover>(k: K, v: ProposalBackCover[K]) => onChange({ ...value, [k]: v });
  const c = resolveClosing(value);
  const on = !value.off;
  const custom = !!(value.heading?.trim() || value.message?.trim());

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h4 className="font-bold text-slate-800 text-sm">Last Page</h4>
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${on ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{on ? "Included · last page" : "Not included"}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {edit && (
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={on} onChange={(e) => set("off", !e.target.checked)} className="accent-emerald-600" />
              Include
            </label>
          )}
          <button type="button" onClick={() => setPreview(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200"><Eye size={12} /> Preview</button>
          {canEdit && !editing && <button type="button" onClick={startEdit} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Pencil size={12} /> Edit</button>}
          {edit && (
            <>
              <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-50"><Undo2 size={12} /> Cancel</button>
              <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-60">{saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save</button>
            </>
          )}
        </div>
      </div>
      <p className="text-[10px] text-slate-400">Closes both the technical and the financial proposal, after the attachments. A blank box prints the standard wording or our company details.</p>

      {preview && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex flex-col" onClick={() => setPreview(false)}>
          <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-slate-900 text-sm">Preview: the last page</h3>
            <button type="button" onClick={() => setPreview(false)} aria-label="Close preview" className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><X size={16} /></button>
          </div>
          <div className="flex-1 bg-slate-200" onClick={(e) => e.stopPropagation()}>
            <PdfFrame><ClosingPageDocument backCover={value} /></PdfFrame>
          </div>
        </div>
      )}

      {!edit ? (
        /* Read view: the page as it prints, in a few lines. */
        <div className={`grid grid-cols-1 gap-3 text-xs text-slate-700 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] ${on ? "" : "opacity-60"}`}>
          <div className="min-w-0 rounded-xl bg-slate-900 px-4 py-3">
            <p className="font-display text-lg font-bold text-white">{c.heading.split(/\s+/).slice(0, -1).join(" ")} <span className="text-[#2DE0C4]">{c.heading.split(/\s+/).slice(-1)}</span></p>
            <div className="mt-1 max-h-32 overflow-y-auto space-y-1.5 text-[11px] leading-relaxed text-slate-300">
              {c.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </div>
          <dl className="space-y-1.5 rounded-xl bg-slate-50 px-3 py-2.5">
            {CONTACT.map(({ key, label, Icon }) => (
              <div key={key} className="flex items-start gap-2">
                <Icon size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                <div className="min-w-0"><dt className={lbl}>{label}</dt><dd className="font-semibold break-words">{c[key]}</dd></div>
              </div>
            ))}
            <p className="text-[10px] text-slate-400 pt-0.5">QR code opens {c.qrUrl}</p>
          </dl>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-2">
            <div className="space-y-0.5">
              <label htmlFor="closing-heading" className={lbl}>Heading</label>
              <input id="closing-heading" value={value.heading || ""} onChange={(e) => set("heading", e.target.value)} placeholder={CLOSING_DEFAULTS.heading} className={inp} />
              <p className="text-[10px] text-slate-400">The last word prints in the brand mint.</p>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="closing-message" className={lbl}>Message (a blank line starts a new paragraph)</label>
                {custom && (
                  <button type="button" onClick={() => onChange({ ...value, heading: "", message: "" })} className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                    <RotateCcw size={10} /> Standard wording
                  </button>
                )}
              </div>
              <textarea id="closing-message" value={value.message || ""} onChange={(e) => set("message", e.target.value)} placeholder={CLOSING_DEFAULTS.message} rows={6} className={`${inp} resize-y leading-relaxed`} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {CONTACT.map(({ key, label }) => (
              <div key={key} className="space-y-0.5">
                <label htmlFor={`closing-${key}`} className={lbl}>{label}</label>
                <input id={`closing-${key}`} value={value[key] || ""} onChange={(e) => set(key, e.target.value)} placeholder={CLOSING_DEFAULTS[key]} className={inp} />
              </div>
            ))}
            <div className="space-y-0.5">
              <label htmlFor="closing-qr" className={lbl}>QR code link</label>
              <input id="closing-qr" value={value.qrUrl || ""} onChange={(e) => set("qrUrl", e.target.value)} placeholder={resolveClosing({ ...value, qrUrl: "" }).qrUrl} className={inp} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
