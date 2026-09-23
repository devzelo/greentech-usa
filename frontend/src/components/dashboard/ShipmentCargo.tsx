import { Box, Boxes, Container, Fuel, Layers, Layers3, Minus, PackageOpen, Pencil, Plus, Snowflake, Trash2, Truck } from "lucide-react";

/**
 * CR 281 (2026-09-23): one shipment is rarely one container. It can be "1 container, 2 crates and
 * 3 pallets", so the cargo is entered as rows: what kind of thing it is (a dropdown, not free
 * text), how many, what size, what it weighs and its container or reference number. The old
 * shipment-level container type / size pair is folded into the first row for shipments saved
 * before this.
 */

export type CargoItem = {
  /** A key from CARGO_TYPES, or "custom" with the name typed into `customType`. */
  type: string;
  customType: string;
  qty: string;
  /** A label from the type's `sizes`, or "custom" with the dimensions below. */
  size: string;
  dimL: string; dimW: string; dimH: string; dimUnit: string;
  weight: string; weightUnit: string;
  /** Container number, trailer number or the agency's reference for this piece. */
  ref: string;
};

export type CargoType = {
  key: string;
  label: string;
  icon: typeof Container;
  /** What the number on this kind of cargo is called. */
  refLabel: string;
  /** Standard sizes offered first; "Custom size" is always appended. */
  sizes: string[];
  /** Size and weight are per piece for things that come in counts (pallets, crates). */
  perUnit?: boolean;
};

export const CARGO_TYPES: CargoType[] = [
  { key: "container", label: "Shipping Container", icon: Container, refLabel: "Container #",
    sizes: ["20 ft (Standard)", "40 ft (Standard)", "40 ft (High Cube)", "45 ft (High Cube)"] },
  { key: "opentop", label: "Open Top Container", icon: PackageOpen, refLabel: "Container #",
    sizes: ["20 ft", "40 ft", "40 ft (High Cube)"] },
  { key: "reefer", label: "Reefer Container (Refrigerated)", icon: Snowflake, refLabel: "Container #",
    sizes: ["20 ft", "40 ft", "40 ft (High Cube)"] },
  { key: "flatrack", label: "Flat Rack", icon: Layers, refLabel: "Container #",
    sizes: ["20 ft", "40 ft", "40 ft (High Cube)"] },
  { key: "openbed", label: "Open Bed / Flatbed", icon: Truck, refLabel: "Trailer / reference #",
    sizes: ["40 ft trailer", "48 ft trailer", "53 ft trailer"] },
  { key: "tanker", label: "Tanker", icon: Fuel, refLabel: "Tank / reference #",
    sizes: ["20 ft ISO tank", "Road tanker", "Rail tanker"] },
  { key: "pallet", label: "Pallet(s)", icon: Layers3, refLabel: "Reference #", perUnit: true,
    sizes: ['48" x 40" (US standard)', "1200 x 800 mm (Euro)", "1200 x 1000 mm (Industrial)"] },
  { key: "crate", label: "Crate(s)", icon: Box, refLabel: "Reference #", perUnit: true, sizes: [] },
  { key: "loose", label: "Loose Cargo / Break Bulk", icon: Boxes, refLabel: "Reference #", sizes: [] },
  { key: "custom", label: "Custom (specify)", icon: Pencil, refLabel: "Reference #", sizes: [] },
];

export const CUSTOM_SIZE = "custom";
const DIM_UNITS = ["ft", "in", "m", "cm", "mm"];
const WEIGHT_UNITS = ["Ton", "kg", "lb"];

export const cargoTypeOf = (key: string): CargoType =>
  CARGO_TYPES.find((t) => t.key === key) || CARGO_TYPES[CARGO_TYPES.length - 1];

export const blankCargo = (): CargoItem => ({
  type: "container", customType: "", qty: "1", size: "",
  dimL: "", dimW: "", dimH: "", dimUnit: "ft", weight: "", weightUnit: "Ton", ref: "",
});

/** What a row's type is called, with the typed name winning for a custom one. */
export const cargoTypeLabel = (c: CargoItem) =>
  (c.type === "custom" ? (c.customType || "").trim() : "") || cargoTypeOf(c.type).label;

/** "20 ft (Standard)", or "6 x 2.4 x 2.6 ft" when the size was given as dimensions. */
export const cargoSizeLabel = (c: CargoItem) => {
  if (c.size !== CUSTOM_SIZE) return c.size || "";
  const dims = [c.dimL, c.dimW, c.dimH].filter((d) => String(d || "").trim());
  return dims.length ? `${dims.join(" x ")} ${c.dimUnit || ""}`.trim() : "";
};

export const cargoWeightLabel = (c: CargoItem) =>
  String(c.weight || "").trim() ? `${String(c.weight).trim()} ${c.weightUnit || ""}`.trim() : "";

/** One row as a single line: "2 x Crate(s) - 1.2 x 1 x 1 m". */
export const cargoLine = (c: CargoItem) => {
  const qty = String(c.qty || "").trim();
  const head = `${qty && qty !== "1" ? `${qty} x ` : ""}${cargoTypeLabel(c)}`;
  const size = cargoSizeLabel(c);
  return size ? `${head} - ${size}` : head;
};

/** The whole cargo on one line, for the shipment header and the PDF. */
export const cargoSummary = (cargo?: CargoItem[]) =>
  (cargo || []).map(cargoLine).filter(Boolean).join(" · ");

/** Total pieces across the rows, for the "Cargo (n)" counts. */
export const cargoPieces = (cargo?: CargoItem[]) =>
  (cargo || []).reduce((sum, c) => sum + (parseInt(String(c.qty || "1"), 10) || 0), 0);

/**
 * A shipment saved before this change carried one container type and one size on the shipment
 * itself. Read it as a single cargo row so nothing disappears from an old record.
 */
export function cargoFromLegacy(containerType?: string, containerSize?: string, trackingNo?: string): CargoItem[] {
  const t = String(containerType || "").trim();
  const size = String(containerSize || "").trim();
  if (!t && !size) return [];
  const match = CARGO_TYPES.find((c) => c.key !== "custom" && new RegExp(c.key === "openbed" ? "open ?bed|flat ?bed" : c.key === "flatrack" ? "flat ?rack" : c.key === "opentop" ? "open ?top" : c.key, "i").test(t));
  const known = match && match.key !== "container";
  return [{
    ...blankCargo(),
    type: known ? match.key : t ? "custom" : "container",
    customType: known ? "" : t,
    size: size || "",
    ref: String(trackingNo || "").trim(),
  }];
}

const inp = "w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10";
const unitSel = "shrink-0 w-[4.5rem] bg-white border border-slate-200 rounded-lg px-1.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10";
const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";

/**
 * The cargo rows inside the New / Edit Shipment popup. Each row is its own little card: the type
 * picker sets what the rest of the row asks for, so a pallet row asks for the size per pallet and
 * a container row asks for its container number.
 */
export default function CargoEditor({ cargo, onChange }: { cargo: CargoItem[]; onChange: (next: CargoItem[]) => void }) {
  const patch = (i: number, p: Partial<CargoItem>) => onChange(cargo.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const remove = (i: number) => onChange(cargo.filter((_, j) => j !== i));
  const step = (i: number, by: number) => {
    const q = Math.max(1, (parseInt(String(cargo[i].qty || "1"), 10) || 1) + by);
    patch(i, { qty: String(q) });
  };

  return (
    <div className="space-y-2">
      {cargo.length === 0 && (
        <p className="text-[11px] italic text-slate-400">
          No cargo listed yet. Add a row for each kind of thing in this shipment - a container, the pallets, the crates.
        </p>
      )}

      {cargo.map((c, i) => {
        const t = cargoTypeOf(c.type);
        const Icon = t.icon;
        const per = t.perUnit ? ` (per ${t.label.replace(/\(s\)$/, "").toLowerCase().trim()})` : "";
        const sizes = [...t.sizes];
        // An old row whose size is not one of this type's standards still has to be selectable.
        if (c.size && c.size !== CUSTOM_SIZE && !sizes.includes(c.size)) sizes.unshift(c.size);
        return (
          <div key={i} className="rounded-xl border border-slate-200 bg-white/80 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <Icon size={12} className="text-emerald-600" /> Cargo item {i + 1}
              </p>
              <button type="button" onClick={() => remove(i)} title="Remove this cargo item" className="rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
                <Trash2 size={13} />
              </button>
            </div>

            <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className={lbl}>Type of cargo
                <select
                  className={`${inp} mt-1 font-bold`}
                  value={c.type}
                  onChange={(e) => {
                    // A new type brings its own sizes, so a size from the old one is dropped.
                    const next = cargoTypeOf(e.target.value);
                    patch(i, { type: next.key, size: next.sizes.includes(c.size) ? c.size : "" });
                  }}
                >
                  {CARGO_TYPES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </label>

              <label className={lbl}>Quantity
                <div className="mt-1 flex items-center gap-1">
                  <button type="button" onClick={() => step(i, -1)} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-primary hover:text-primary" title="One fewer"><Minus size={12} /></button>
                  <input className={`${inp} min-w-0 flex-1 text-center`} inputMode="numeric" value={c.qty} onChange={(e) => patch(i, { qty: e.target.value.replace(/[^0-9]/g, "") })} placeholder="1" />
                  <button type="button" onClick={() => step(i, 1)} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-primary hover:text-primary" title="One more"><Plus size={12} /></button>
                </div>
              </label>

              <label className={lbl}>Size / dimensions{per}
                <select className={`${inp} mt-1`} value={c.size} onChange={(e) => patch(i, { size: e.target.value })}>
                  <option value="">Not specified</option>
                  {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value={CUSTOM_SIZE}>Custom size…</option>
                </select>
              </label>

              <label className={lbl}>Weight{per}
                <div className="mt-1 flex items-center gap-1">
                  <input className={`${inp} min-w-0 flex-1`} inputMode="decimal" value={c.weight} onChange={(e) => patch(i, { weight: e.target.value })} placeholder="e.g. 12.5" />
                  <select className={unitSel} value={c.weightUnit || "Ton"} onChange={(e) => patch(i, { weightUnit: e.target.value })}>
                    {WEIGHT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </label>

              {c.type === "custom" && (
                <label className={`${lbl} sm:col-span-2`}>Describe the cargo
                  <input className={`${inp} mt-1`} value={c.customType} onChange={(e) => patch(i, { customType: e.target.value })} placeholder="e.g. Transformer on a skid" /></label>
              )}

              <label className={`${lbl} sm:col-span-2`}>{t.refLabel}
                <input className={`${inp} mt-1`} value={c.ref} onChange={(e) => patch(i, { ref: e.target.value })} placeholder={t.refLabel.startsWith("Container") ? "e.g. MRKU1234567" : "e.g. PL-004 / agency reference"} /></label>
            </div>

            {c.size === CUSTOM_SIZE && (
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-4">
                <label className={lbl}>Length
                  <input className={`${inp} mt-1`} inputMode="decimal" value={c.dimL} onChange={(e) => patch(i, { dimL: e.target.value })} placeholder="L" /></label>
                <label className={lbl}>Width
                  <input className={`${inp} mt-1`} inputMode="decimal" value={c.dimW} onChange={(e) => patch(i, { dimW: e.target.value })} placeholder="W" /></label>
                <label className={lbl}>Height
                  <input className={`${inp} mt-1`} inputMode="decimal" value={c.dimH} onChange={(e) => patch(i, { dimH: e.target.value })} placeholder="H" /></label>
                <label className={lbl}>Unit
                  <select className={`${inp} mt-1`} value={c.dimUnit || "ft"} onChange={(e) => patch(i, { dimUnit: e.target.value })}>
                    {DIM_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select></label>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onChange([...cargo, blankCargo()])}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-300 bg-white/60 py-2 text-[11px] font-bold text-emerald-700 hover:border-emerald-500 hover:bg-emerald-50"
      >
        <Plus size={13} /> Add another cargo item
      </button>
    </div>
  );
}
