import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Copy } from "lucide-react";
import { toast } from "../../lib/toast";

type Known = "price" | "markup" | "margin";

const labelCls = "block text-[11px] font-bold text-slate-500";
const inputCls = "mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm tabular-nums text-slate-700 focus:border-primary focus:outline-none";
const miniInput = "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm tabular-nums text-slate-700 focus:border-primary focus:outline-none";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

// Empty or invalid input gives null
function parse(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

interface MarkupResult { price: number; profit: number; markup: number | null; margin: number | null; error?: string }

function solveMarkup(cost: number | null, known: Known, value: number | null): MarkupResult | null {
  if (cost == null || value == null) return null;
  let price: number;
  if (known === "price") price = value;
  else if (known === "markup") price = cost * (1 + value / 100);
  else {
    if (value >= 100) return { price: 0, profit: 0, markup: null, margin: null, error: "Margin must be below 100%." };
    price = cost / (1 - value / 100);
  }
  const profit = price - cost;
  return {
    price,
    profit,
    markup: cost !== 0 ? (profit / cost) * 100 : null,
    margin: price !== 0 ? (profit / price) * 100 : null,
  };
}

function solveTax(amount: number | null, rate: number | null, includes: boolean) {
  if (amount == null || rate == null) return null;
  if (includes) {
    if (rate <= -100) return null;
    const net = amount / (1 + rate / 100);
    return { net, tax: amount - net, gross: amount };
  }
  const tax = amount * (rate / 100);
  return { net: amount, tax, gross: amount + tax };
}

function copyNumber(n: number | null) {
  if (n == null || !Number.isFinite(n)) return;
  const text = String(Math.round(n * 100) / 100);
  navigator.clipboard.writeText(text).then(
    () => toast(`Copied ${text}.`, "success"),
    () => toast("Could not copy.", "error"),
  );
}

function Result({ label, value, suffix = "", tone }: { label: string; value: number | null; suffix?: string; tone?: "neg" }) {
  const ok = value != null && Number.isFinite(value);
  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700/70">{label}</div>
      <div className="flex items-center justify-between gap-1">
        <span className={`truncate text-sm font-bold tabular-nums ${tone === "neg" ? "text-red-600" : "text-slate-800"}`}>
          {ok ? `${fmt(value)}${suffix}` : "-"}
        </span>
        {ok && (
          <button
            type="button"
            onClick={() => copyNumber(value)}
            aria-label={`Copy ${label}`}
            title="Copy"
            className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-white hover:text-primary"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border border-slate-100 p-2.5">
      <h3 className="text-xs font-bold text-slate-700">{title}</h3>
      {children}
    </section>
  );
}

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ v: T; l: string }>; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={label}>
      <span className="mr-0.5 text-[11px] font-bold text-slate-500">{label}</span>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${value === o.v ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function PctRow({ children, result }: { children: ReactNode; result: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">{children}</div>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-2 py-1 text-sm font-bold tabular-nums text-slate-800">{result}</div>
    </div>
  );
}

function CopyBtn({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) return null;
  return (
    <button type="button" onClick={() => copyNumber(value)} aria-label="Copy result" title="Copy" className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-white hover:text-primary">
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

export default function MarginCalculator() {
  // Markup / margin
  const [cost, setCost] = useState("100");
  const [known, setKnown] = useState<Known>("markup");
  const [knownVal, setKnownVal] = useState("25");
  const mk = solveMarkup(parse(cost), known, parse(knownVal));

  // Tax
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [includes, setIncludes] = useState(false);
  const tax = solveTax(parse(amount), parse(rate), includes);

  // Percentage
  const [p1x, setP1x] = useState("");
  const [p1y, setP1y] = useState("");
  const [p2x, setP2x] = useState("");
  const [p2y, setP2y] = useState("");
  const [p3x, setP3x] = useState("");
  const [p3y, setP3y] = useState("");

  const a1 = parse(p1x), b1 = parse(p1y);
  const r1 = a1 != null && b1 != null ? (a1 / 100) * b1 : null;
  const a2 = parse(p2x), b2 = parse(p2y);
  const r2 = a2 != null && b2 != null && b2 !== 0 ? (a2 / b2) * 100 : null;
  const a3 = parse(p3x), b3 = parse(p3y);
  const r3 = a3 != null && b3 != null && a3 !== 0 ? ((b3 - a3) / Math.abs(a3)) * 100 : null;

  const knownLabel = known === "price" ? "Selling price" : known === "markup" ? "Markup %" : "Margin %";

  return (
    <div className="space-y-3">
      <Section title="Markup / Margin">
        <Segmented<Known>
          label="I know the:"
          value={known}
          onChange={(v) => { setKnown(v); setKnownVal(""); }}
          options={[{ v: "price", l: "Price" }, { v: "markup", l: "Markup" }, { v: "margin", l: "Margin" }]}
        />
        <div className="grid grid-cols-2 gap-2">
          <label className={labelCls}>Cost
            <input type="number" inputMode="decimal" className={inputCls} value={cost} onChange={(e) => setCost(e.target.value)} />
          </label>
          <label className={labelCls}>{knownLabel}
            <input type="number" inputMode="decimal" className={inputCls} value={knownVal} onChange={(e) => setKnownVal(e.target.value)} />
          </label>
        </div>
        {mk?.error ? (
          <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">{mk.error}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Result label="Selling price" value={mk?.price ?? null} />
            <Result label="Profit" value={mk?.profit ?? null} tone={mk && mk.profit < 0 ? "neg" : undefined} />
            <Result label="Markup" value={mk?.markup ?? null} suffix="%" />
            <Result label="Margin" value={mk?.margin ?? null} suffix="%" />
          </div>
        )}
        {mk && !mk.error && (mk.markup == null || mk.margin == null) && (
          <p className="text-[11px] text-slate-400">{mk.markup == null ? "Markup needs a cost above zero." : "Margin needs a price above zero."}</p>
        )}
      </Section>

      <Section title="Tax">
        <div className="grid grid-cols-2 gap-2">
          <label className={labelCls}>Amount
            <input type="number" inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className={labelCls}>Tax rate %
            <input type="number" inputMode="decimal" className={inputCls} value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
        </div>
        <Segmented<"ex" | "inc">
          label="Amount:"
          value={includes ? "inc" : "ex"}
          onChange={(v) => setIncludes(v === "inc")}
          options={[{ v: "ex", l: "Excludes tax" }, { v: "inc", l: "Includes tax" }]}
        />
        <div className="grid grid-cols-3 gap-2">
          <Result label="Net" value={tax?.net ?? null} />
          <Result label="Tax" value={tax?.tax ?? null} />
          <Result label="Gross" value={tax?.gross ?? null} />
        </div>
      </Section>

      <Section title="Percentage">
        <PctRow result={<><span>{r1 != null ? fmt(r1) : "-"}</span><CopyBtn value={r1} /></>}>
          <input type="number" inputMode="decimal" aria-label="Percent" className={miniInput} value={p1x} onChange={(e) => setP1x(e.target.value)} />
          <span className="shrink-0">% of</span>
          <input type="number" inputMode="decimal" aria-label="Value" className={miniInput} value={p1y} onChange={(e) => setP1y(e.target.value)} />
        </PctRow>

        <PctRow result={<><span>{r2 != null ? `${fmt(r2)}%` : "-"}</span><CopyBtn value={r2} /></>}>
          <input type="number" inputMode="decimal" aria-label="Part" className={miniInput} value={p2x} onChange={(e) => setP2x(e.target.value)} />
          <span className="shrink-0">is what % of</span>
          <input type="number" inputMode="decimal" aria-label="Whole" className={miniInput} value={p2y} onChange={(e) => setP2y(e.target.value)} />
        </PctRow>

        <PctRow
          result={
            <>
              <span className={`inline-flex items-center gap-1 ${r3 == null || r3 === 0 ? "" : r3 > 0 ? "text-emerald-700" : "text-red-600"}`}>
                {r3 != null && r3 > 0 && <ArrowUpRight className="h-4 w-4" />}
                {r3 != null && r3 < 0 && <ArrowDownRight className="h-4 w-4" />}
                {r3 == null ? "-" : r3 === 0 ? "No change" : `${fmt(Math.abs(r3))}% ${r3 > 0 ? "increase" : "decrease"}`}
              </span>
              <CopyBtn value={r3} />
            </>
          }
        >
          <span className="shrink-0">From</span>
          <input type="number" inputMode="decimal" aria-label="From value" className={miniInput} value={p3x} onChange={(e) => setP3x(e.target.value)} />
          <span className="shrink-0">to</span>
          <input type="number" inputMode="decimal" aria-label="To value" className={miniInput} value={p3y} onChange={(e) => setP3y(e.target.value)} />
        </PctRow>
      </Section>
    </div>
  );
}
