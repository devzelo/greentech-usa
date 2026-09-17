import { useState } from "react";

// Engineering unit converter: length, area, volume, flow, weight, pressure, power, energy,
// speed and temperature.

type Unit = { key: string; label: string; factor: number }; // factor to the base unit
const UNIT_GROUPS: Record<string, Unit[]> = {
  Length: [
    { key: "m", label: "Meter (m)", factor: 1 }, { key: "mm", label: "Millimeter (mm)", factor: 0.001 },
    { key: "cm", label: "Centimeter (cm)", factor: 0.01 }, { key: "km", label: "Kilometer (km)", factor: 1000 },
    { key: "in", label: "Inch (in)", factor: 0.0254 }, { key: "ft", label: "Foot (ft)", factor: 0.3048 },
    { key: "yd", label: "Yard (yd)", factor: 0.9144 }, { key: "mi", label: "Mile (mi)", factor: 1609.344 },
  ],
  Area: [
    { key: "m2", label: "Square meter (m²)", factor: 1 }, { key: "ft2", label: "Square foot (ft²)", factor: 0.09290304 },
    { key: "yd2", label: "Square yard (yd²)", factor: 0.83612736 }, { key: "ha", label: "Hectare (ha)", factor: 10000 },
    { key: "acre", label: "Acre", factor: 4046.8564224 }, { key: "km2", label: "Square kilometer (km²)", factor: 1e6 },
  ],
  Volume: [
    { key: "m3", label: "Cubic meter (m³)", factor: 1 }, { key: "L", label: "Liter (L)", factor: 0.001 },
    { key: "gal", label: "US gallon (gal)", factor: 0.003785411784 }, { key: "ft3", label: "Cubic foot (ft³)", factor: 0.028316846592 },
    { key: "yd3", label: "Cubic yard (yd³)", factor: 0.764554857984 },
  ],
  Flow: [
    { key: "Ls", label: "Liters per second (L/s)", factor: 0.001 }, { key: "m3h", label: "Cubic meters per hour (m³/h)", factor: 1 / 3600 },
    { key: "m3d", label: "Cubic meters per day (m³/d)", factor: 1 / 86400 }, { key: "gpm", label: "US gallons per minute (gpm)", factor: 0.003785411784 / 60 },
    { key: "mgd", label: "Million US gallons per day (MGD)", factor: 3785.411784 / 86400 }, { key: "cfs", label: "Cubic feet per second (cfs)", factor: 0.028316846592 },
  ],
  Weight: [
    { key: "kg", label: "Kilogram (kg)", factor: 1 }, { key: "g", label: "Gram (g)", factor: 0.001 },
    { key: "t", label: "Metric ton (t)", factor: 1000 }, { key: "lb", label: "Pound (lb)", factor: 0.45359237 },
    { key: "ton", label: "US ton", factor: 907.18474 },
  ],
  Pressure: [
    { key: "kPa", label: "Kilopascal (kPa)", factor: 1 }, { key: "bar", label: "Bar", factor: 100 },
    { key: "psi", label: "PSI", factor: 6.894757293 }, { key: "mH2O", label: "Meters of water (mH₂O)", factor: 9.80665 },
    { key: "ftH2O", label: "Feet of water (ftH₂O)", factor: 2.98906692 }, { key: "atm", label: "Atmosphere (atm)", factor: 101.325 },
  ],
  Power: [
    { key: "kW", label: "Kilowatt (kW)", factor: 1 }, { key: "hp", label: "Horsepower (hp)", factor: 0.745699872 },
    { key: "W", label: "Watt (W)", factor: 0.001 }, { key: "BTUh", label: "BTU per hour", factor: 0.000293071 },
    { key: "TR", label: "Ton of refrigeration", factor: 3.516852842 },
  ],
  Energy: [
    { key: "kWh", label: "Kilowatt hour (kWh)", factor: 1 }, { key: "MWh", label: "Megawatt hour (MWh)", factor: 1000 },
    { key: "MJ", label: "Megajoule (MJ)", factor: 1 / 3.6 }, { key: "BTU", label: "BTU", factor: 0.000293071 },
    { key: "therm", label: "Therm", factor: 29.3071 }, { key: "kcal", label: "Kilocalorie (kcal)", factor: 0.001163 },
  ],
  Speed: [
    { key: "ms", label: "Meters per second (m/s)", factor: 1 }, { key: "kmh", label: "Kilometers per hour (km/h)", factor: 1 / 3.6 },
    { key: "mph", label: "Miles per hour (mph)", factor: 0.44704 }, { key: "fts", label: "Feet per second (ft/s)", factor: 0.3048 },
    { key: "kn", label: "Knot (kn)", factor: 0.514444 },
  ],
  Temperature: [
    { key: "C", label: "Celsius (°C)", factor: 1 }, { key: "F", label: "Fahrenheit (°F)", factor: 1 }, { key: "K", label: "Kelvin (K)", factor: 1 },
  ],
};

function convertTemp(v: number, from: string, to: string) {
  const c = from === "C" ? v : from === "F" ? (v - 32) * 5 / 9 : v - 273.15;
  return to === "C" ? c : to === "F" ? c * 9 / 5 + 32 : c + 273.15;
}

export default function UnitConverter() {
  const [group, setGroup] = useState("Length");
  const units = UNIT_GROUPS[group];
  const [from, setFrom] = useState(units[0].key);
  const [to, setTo] = useState(units[4]?.key || units[1].key);
  const [value, setValue] = useState("1");

  const pickGroup = (g: string) => {
    setGroup(g);
    setFrom(UNIT_GROUPS[g][0].key);
    setTo(UNIT_GROUPS[g][1].key);
  };

  const v = Number(value);
  let result = "";
  if (value.trim() !== "" && isFinite(v)) {
    const out = group === "Temperature"
      ? convertTemp(v, from, to)
      : (v * (units.find((u) => u.key === from)?.factor || 1)) / (units.find((u) => u.key === to)?.factor || 1);
    result = Number(out.toPrecision(8)).toLocaleString("en-US", { maximumFractionDigits: 6 });
  }

  const sel = "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 focus:border-primary focus:outline-none";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {Object.keys(UNIT_GROUPS).map((g) => (
          <button key={g} type="button" onClick={() => pickGroup(g)} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${g === group ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{g}</button>
        ))}
      </div>
      <label className="block text-[11px] font-bold text-slate-500">Value
        <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className={`${sel} mt-1 text-sm`} />
      </label>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5">
        <label className="block text-[11px] font-bold text-slate-500">From
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={`${sel} mt-1`}>
            {units.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => { setFrom(to); setTo(from); }} title="Swap" className="mb-1 rounded-lg px-1.5 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100">⇄</button>
        <label className="block text-[11px] font-bold text-slate-500">To
          <select value={to} onChange={(e) => setTo(e.target.value)} className={`${sel} mt-1`}>
            {units.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
          </select>
        </label>
      </div>
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-right">
        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">Result</p>
        <p className="break-all font-mono text-lg font-bold text-slate-900">{result || "…"} <span className="text-xs text-slate-500">{units.find((u) => u.key === to)?.label}</span></p>
      </div>
    </div>
  );
}
