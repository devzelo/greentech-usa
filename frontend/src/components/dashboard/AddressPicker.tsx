import { useState } from "react";
import { MapPin, X, Building2, Home, PencilLine, Check } from "lucide-react";

// The GreenTech office is a predefined address (placeholder until Reza confirms the real one).
export const OFFICE_ADDRESS = "GreenTech USA — Head Office, USA";

type Kind = "site" | "office" | "custom";
export interface CustomAddress { attention: string; street: string; city: string; state: string; postal: string; country: string }
const EMPTY: CustomAddress = { attention: "", street: "", city: "", state: "", postal: "", country: "" };

// Compose the structured pieces into the single ship-to string we store on the RFQ/PO.
function composeCustom(c: CustomAddress): string {
  const cityLine = [c.city, c.state, c.postal].filter(Boolean).join(", ");
  return [c.attention, c.street, cityLine, c.country].filter(Boolean).join(", ");
}

const inp = "w-full bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10";

// A detailed ship-to picker: a button that opens a modal where you choose the address TYPE
// (Project site → from the project location · GreenTech office → predefined · Custom → typed in
// with street / city / state / postal / country). Stores a single composed string via onChange.
export function AddressPicker({ value, projectSite, disabled, onChange }: {
  value: string; projectSite?: string; disabled?: boolean; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-start gap-2">
        <button type="button" disabled={disabled} onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-50 shrink-0">
          <MapPin size={12} /> {value ? "Change address" : "Choose address"}
        </button>
        {value
          ? <span className="text-[11px] text-slate-600 font-medium leading-snug py-1">{value}</span>
          : <span className="text-[11px] text-slate-400 italic py-1">No delivery address set</span>}
      </div>
      {open && (
        <AddressModal
          projectSite={projectSite}
          initial={value}
          onClose={() => setOpen(false)}
          onSave={(v) => { onChange(v); setOpen(false); }}
        />
      )}
    </>
  );
}

function AddressModal({ projectSite, initial, onClose, onSave }: {
  projectSite?: string; initial: string; onClose: () => void; onSave: (v: string) => void;
}) {
  // Guess the starting type from the current value so reopening feels natural.
  const initialKind: Kind = initial && initial === projectSite ? "site" : initial === OFFICE_ADDRESS ? "office" : initial ? "custom" : "site";
  const [kind, setKind] = useState<Kind>(initialKind);
  // Seed the custom form's street with the existing free-text value when it isn't a preset.
  const [custom, setCustom] = useState<CustomAddress>(initialKind === "custom" ? { ...EMPTY, street: initial } : EMPTY);
  const set = (k: keyof CustomAddress, v: string) => setCustom((p) => ({ ...p, [k]: v }));

  const resolved = kind === "site" ? (projectSite || "") : kind === "office" ? OFFICE_ADDRESS : composeCustom(custom);
  const canSave = kind !== "site" ? !!resolved : !!projectSite;

  const OPTIONS: { k: Kind; label: string; hint: string; icon: typeof MapPin }[] = [
    { k: "site", label: "Project site", hint: "From the project location", icon: MapPin },
    { k: "office", label: "GreenTech office", hint: "Predefined head office", icon: Building2 },
    { k: "custom", label: "Custom address", hint: "Type the full address", icon: PencilLine },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2"><MapPin size={16} className="text-primary" /><p className="text-sm font-bold text-slate-900">Delivery address</p></div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Type selector */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {OPTIONS.map((o) => {
              const Icon = o.icon;
              const active = kind === o.k;
              return (
                <button key={o.k} onClick={() => setKind(o.k)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-2xl border text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"}`}>
                  <Icon size={16} className={active ? "text-primary" : "text-slate-400"} />
                  <span className="text-[11px] font-bold text-slate-700 leading-tight">{o.label}</span>
                  <span className="text-[9px] text-slate-400 leading-tight">{o.hint}</span>
                </button>
              );
            })}
          </div>

          {/* Body per type */}
          {kind === "site" && (
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs">
              {projectSite
                ? <><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Home size={11} /> Project site</p><p className="font-medium text-slate-700">{projectSite}</p></>
                : <p className="text-slate-400 italic">This project has no location set yet — add it in the Client / project info, or use a custom address.</p>}
            </div>
          )}
          {kind === "office" && (
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Building2 size={11} /> GreenTech office</p>
              <p className="font-medium text-slate-700">{OFFICE_ADDRESS}</p>
            </div>
          )}
          {kind === "custom" && (
            <div className="space-y-2">
              <input className={inp} placeholder="Attention / recipient (optional)" value={custom.attention} onChange={(e) => set("attention", e.target.value)} />
              <input className={inp} placeholder="Street address" value={custom.street} onChange={(e) => set("street", e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inp} placeholder="City" value={custom.city} onChange={(e) => set("city", e.target.value)} />
                <input className={inp} placeholder="State / Province" value={custom.state} onChange={(e) => set("state", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className={inp} placeholder="Postal / ZIP code" value={custom.postal} onChange={(e) => set("postal", e.target.value)} />
                <input className={inp} placeholder="Country" value={custom.country} onChange={(e) => set("country", e.target.value)} />
              </div>
            </div>
          )}

          {/* Live preview */}
          <div className="rounded-xl border border-dashed border-slate-200 p-3">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Will be saved as</p>
            <p className="text-xs font-medium text-slate-700">{resolved || <span className="text-slate-300 italic">—</span>}</p>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Cancel</button>
            <button onClick={() => onSave(resolved)} disabled={!canSave} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-40"><Check size={13} /> Use this address</button>
          </div>
        </div>
      </div>
    </div>
  );
}
