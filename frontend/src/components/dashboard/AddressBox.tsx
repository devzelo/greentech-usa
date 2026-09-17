import { useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import CountrySelect from "./CountrySelect";
import { composeSiteAddress, guessAddressParts, type SiteAddress } from "../../lib/address";

// CR 186: one big box to paste the whole address exactly as written (every country orders and
// names the parts differently), with City / State / Postal code / Country beside it. Those parts
// drive the flag, the local clock and short headers; "Fill from address" suggests them, and an AI
// reader will do it properly in a later phase.

const legacyFull = (a: SiteAddress) =>
  [a.line1, [a.city, a.state, a.postalCode].filter(Boolean).join(", "), a.country].filter((x) => x && x.trim()).join("\n");

export default function AddressBox({ value, onChange, disabled, label = "Address", placeholder }: {
  value: SiteAddress; onChange: (v: SiteAddress) => void; disabled?: boolean; label?: string; placeholder?: string;
}) {
  // Older records only have the separate parts, so the box starts from those.
  const [shown, setShown] = useState(() => value.full || legacyFull(value));
  const [filledNote, setFilledNote] = useState("");

  const setFull = (text: string) => { setShown(text); onChange({ ...value, full: text, line1: text.split(/\r?\n/)[0]?.trim() || "" }); };
  const setPart = (k: "city" | "state" | "postalCode" | "country", v: string) => onChange({ ...value, full: shown, [k]: v });

  const fill = (text: string, onlyEmpty: boolean) => {
    const g = guessAddressParts(text);
    setShown(text);
    const next: SiteAddress = { ...value, full: text, line1: text.split(/\r?\n/)[0]?.trim() || "" };
    const keys = ["city", "state", "postalCode", "country"] as const;
    let n = 0;
    for (const k of keys) {
      if (!g[k]) continue;
      if (onlyEmpty && value[k]) continue;
      next[k] = g[k]!;
      n++;
    }
    onChange(next);
    setFilledNote(n ? "Details filled from the address. Please check them." : "Could not pick out the details. Please fill them in.");
  };

  const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
  const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-60";
  const hasDetails = !!(value.city || value.state || value.postalCode || value.country);

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="space-y-2">
        <label className={lbl}>{label}</label>
        <textarea
          value={shown}
          disabled={disabled}
          rows={6}
          onChange={(e) => { setFull(e.target.value); setFilledNote(""); }}
          onPaste={(e) => {
            // A pasted address fills the empty detail fields straight away.
            const pasted = e.clipboardData.getData("text");
            if (!pasted.trim() || disabled) return;
            e.preventDefault();
            const ta = e.currentTarget;
            const text = shown.slice(0, ta.selectionStart) + pasted + shown.slice(ta.selectionEnd);
            fill(text, true);
          }}
          placeholder={placeholder || "Paste the full address exactly as written, e.g.\nU.S. Embassy Accra\nNo. 24 Fourth Circular Road, Cantonments\nAccra, Greater Accra Region\nGhana"}
          className={`${inp} resize-y leading-relaxed min-h-[9rem]`}
        />
        <div className="flex flex-wrap items-center gap-2">
          {!disabled && (
            <button type="button" onClick={() => fill(shown, false)} disabled={!shown.trim()} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary disabled:opacity-40">
              <Wand2 size={12} /> Fill details from address
            </button>
          )}
          <span className={`text-[10px] ${filledNote.startsWith("Could") ? "text-amber-600" : "text-slate-400"}`}>
            {filledNote || "Any country's format works. Keep the lines as the address is written."}
          </span>
        </div>
      </div>
      <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
        <p className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Details <span className="normal-case tracking-normal font-medium text-slate-400">(for the flag, local time and headers)</span>
        </p>
        <CountrySelect label="Country" value={value.country} onChange={(v) => setPart("country", v)} disabled={disabled} />
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={lbl}>City</label>
            <input value={value.city} disabled={disabled} onChange={(e) => setPart("city", e.target.value)} placeholder="City / town" className={inp} />
          </div>
          <div className="space-y-1">
            <label className={lbl}>State / Province</label>
            <input value={value.state} disabled={disabled} onChange={(e) => setPart("state", e.target.value)} placeholder="If any" className={inp} />
          </div>
          <div className="space-y-1">
            <label className={lbl}>Postal / ZIP</label>
            <input value={value.postalCode} disabled={disabled} onChange={(e) => setPart("postalCode", e.target.value)} placeholder="If any" className={inp} />
          </div>
        </div>
        {!hasDetails && shown.trim() && (
          <p className="text-[10px] text-slate-400">One line: <span className="font-semibold text-slate-500">{composeSiteAddress({ ...value, full: shown })}</span></p>
        )}
        <p className="flex items-center gap-1 text-[10px] text-violet-500"><Sparkles size={11} /> The AI assistant will fill these automatically in a later phase.</p>
      </div>
    </div>
  );
}
