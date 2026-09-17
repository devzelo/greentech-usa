import { useMemo, useState } from "react";
import { CalendarDays, Copy, Minus, Plus } from "lucide-react";
import { toast } from "../../lib/toast";

type Mode = "between" | "add" | "warranty";
type Unit = "days" | "workdays" | "weeks" | "months" | "years";

const DAY = 86400000;
const labelCls = "block text-[11px] font-bold text-slate-500";
const inputCls = "mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-primary focus:outline-none";
const smallBtn = "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary";
const cardCls = "rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2";

// Local date helpers (never parse YYYY-MM-DD as UTC)
function parseLocal(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function toInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const today = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

// Whole days between two local dates, DST safe
function diffDays(a: Date, b: Date): number {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);
}

const isWeekday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;

// Mon to Fri count in [a, b) or [a, b] when inclusive; a <= b
function workingDays(a: Date, b: Date, inclusive: boolean): number {
  const total = diffDays(a, b) + (inclusive ? 1 : 0);
  if (total <= 0) return 0;
  const full = Math.floor(total / 7);
  let count = full * 5;
  const d = new Date(a.getFullYear(), a.getMonth(), a.getDate() + full * 7);
  for (let i = 0; i < total % 7; i++) {
    if (isWeekday(d)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// Add months with end of month clamping (Jan 31 + 1 month = Feb 28/29)
function addMonths(d: Date, months: number): Date {
  const target = d.getMonth() + months;
  const y = d.getFullYear() + Math.floor(target / 12);
  const m = ((target % 12) + 12) % 12;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), last));
}

function addWorkingDays(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  while (left > 0) {
    r.setDate(r.getDate() + step);
    if (isWeekday(r)) left--;
  }
  return r;
}

function addUnit(d: Date, amount: number, unit: Unit): Date {
  switch (unit) {
    case "days": return new Date(d.getFullYear(), d.getMonth(), d.getDate() + amount);
    case "weeks": return new Date(d.getFullYear(), d.getMonth(), d.getDate() + amount * 7);
    case "workdays": return addWorkingDays(d, amount);
    case "months": return addMonths(d, amount);
    case "years": return addMonths(d, amount * 12);
  }
}

// Calendar breakdown a <= b
function ymd(a: Date, b: Date): { y: number; m: number; d: number } {
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (addMonths(a, months) > b) months--;
  const anchor = addMonths(a, months);
  return { y: Math.floor(months / 12), m: months % 12, d: diffDays(anchor, b) };
}

const fmtLong = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const plural = (n: number, w: string) => `${n.toLocaleString("en-US")} ${w}${n === 1 ? "" : "s"}`;

const UNITS: Array<{ v: Unit; l: string }> = [
  { v: "days", l: "Days" },
  { v: "workdays", l: "Working days" },
  { v: "weeks", l: "Weeks" },
  { v: "months", l: "Months" },
  { v: "years", l: "Years" },
];

const PRESETS: Array<{ label: string; months: number }> = [
  { label: "DLP 12 months", months: 12 },
  { label: "DLP 24 months", months: 24 },
  { label: "Warranty 1 year", months: 12 },
  { label: "Warranty 2 years", months: 24 },
  { label: "Warranty 5 years", months: 60 },
];

function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ v: T; l: string }> }) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="tab"
          aria-selected={value === o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${value === o.v ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={cardCls}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700/70">{label}</div>
      <div className="text-sm font-bold tabular-nums text-slate-800">{value}</div>
    </div>
  );
}

function copy(text: string) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(
    () => toast("Copied to clipboard.", "success"),
    () => toast("Could not copy.", "error"),
  );
}

export default function DateCalculator() {
  const todayStr = toInput(today());
  const [mode, setMode] = useState<Mode>("between");

  // Between
  const [start, setStart] = useState(todayStr);
  const [end, setEnd] = useState(toInput(addMonths(today(), 1)));
  const [inclusive, setInclusive] = useState(false);

  // Add / subtract
  const [base, setBase] = useState(todayStr);
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("30");
  const [unit, setUnit] = useState<Unit>("days");

  // Warranty
  const [handover, setHandover] = useState(todayStr);
  const [months, setMonths] = useState("12");
  const [preset, setPreset] = useState("DLP 12 months");

  const between = useMemo(() => {
    const a = parseLocal(start);
    const b = parseLocal(end);
    if (!a || !b) return null;
    const reversed = b < a;
    const [lo, hi] = reversed ? [b, a] : [a, b];
    const days = diffDays(lo, hi) + (inclusive ? 1 : 0);
    const work = workingDays(lo, hi, inclusive);
    const hiAdj = inclusive ? new Date(hi.getFullYear(), hi.getMonth(), hi.getDate() + 1) : hi;
    const parts = ymd(lo, hiAdj);
    const s = reversed ? -1 : 1;
    const breakdown = `${plural(parts.y, "year")}, ${plural(parts.m, "month")}, ${plural(parts.d, "day")}`;
    return {
      reversed,
      days: days * s,
      work: work * s,
      weeks: `${plural(Math.floor(days / 7), "week")}, ${plural(days % 7, "day")}`,
      breakdown,
      summary: `${fmtLong(a)} to ${fmtLong(b)}: ${plural(days * s, "calendar day")}, ${plural(work * s, "working day")} (${breakdown})${inclusive ? ", end date included" : ""}`,
    };
  }, [start, end, inclusive]);

  const added = useMemo(() => {
    const d = parseLocal(base);
    const n = Math.trunc(Number(amount));
    // Cap keeps the result inside the valid Date range
    if (!d || !Number.isFinite(n) || Math.abs(n) > 100000) return null;
    const r = addUnit(d, n * sign, unit);
    const unitLabel = UNITS.find((u) => u.v === unit)!.l.toLowerCase();
    return {
      date: r,
      summary: `${fmtLong(d)} ${sign > 0 ? "+" : "-"} ${Math.abs(n)} ${unitLabel} = ${fmtLong(r)}`,
    };
  }, [base, amount, sign, unit]);

  const warranty = useMemo(() => {
    const d = parseLocal(handover);
    const m = Math.trunc(Number(months));
    if (!d || !Number.isFinite(m) || m < 0 || m > 12000) return null;
    const exp = addMonths(d, m);
    const left = diffDays(today(), exp);
    const status = left > 0 ? `${plural(left, "day")} remaining` : left === 0 ? "Expires today" : `Expired ${plural(-left, "day")} ago`;
    const name = preset || `${m} months`;
    return { exp, left, status, summary: `${name} from ${fmtLong(d)}: expires ${fmtLong(exp)} (${status.toLowerCase()})` };
  }, [handover, months, preset]);

  const summary = mode === "between" ? between?.summary : mode === "add" ? added?.summary : warranty?.summary;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Tabs<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { v: "between", l: "Between dates" },
            { v: "add", l: "Add / subtract" },
            { v: "warranty", l: "Warranty / DLP" },
          ]}
        />
      </div>

      {mode === "between" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className={labelCls}>Start date
              <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className={labelCls}>End date
              <input type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <input type="checkbox" className="accent-primary" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} />
            Include end date
          </label>
          {between ? (
            <>
              {between.reversed && (
                <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">End date is before start date, so results are negative.</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Calendar days" value={between.days.toLocaleString("en-US")} />
                <Stat label="Working days (Mon to Fri)" value={between.work.toLocaleString("en-US")} />
                <Stat label="Weeks" value={between.weeks} />
                <Stat label="Duration" value={between.breakdown} />
              </div>
            </>
          ) : (
            <p className="text-[11px] text-slate-400">Pick both dates.</p>
          )}
        </div>
      )}

      {mode === "add" && (
        <div className="space-y-2">
          <label className={labelCls}>Start date
            <input type="date" className={inputCls} value={base} onChange={(e) => setBase(e.target.value)} />
          </label>
          <div className="flex items-end gap-2">
            <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200" role="group" aria-label="Add or subtract">
              <button type="button" aria-pressed={sign === 1} aria-label="Add" onClick={() => setSign(1)} className={`px-2 py-1.5 ${sign === 1 ? "bg-primary text-white" : "bg-white text-slate-500 hover:text-primary"}`}>
                <Plus className="h-4 w-4" />
              </button>
              <button type="button" aria-pressed={sign === -1} aria-label="Subtract" onClick={() => setSign(-1)} className={`px-2 py-1.5 ${sign === -1 ? "bg-primary text-white" : "bg-white text-slate-500 hover:text-primary"}`}>
                <Minus className="h-4 w-4" />
              </button>
            </div>
            <label className={`${labelCls} w-20 shrink-0`}>Amount
              <input type="number" min={0} step={1} inputMode="numeric" className={`${inputCls} tabular-nums`} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className={`${labelCls} min-w-0 flex-1`}>Unit
              <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                {UNITS.map((u) => <option key={u.v} value={u.v}>{u.l}</option>)}
              </select>
            </label>
          </div>
          {added ? (
            <div className={cardCls}>
              <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700/70">Result date</div>
              <div className="flex items-center gap-1.5 text-base font-bold tabular-nums text-slate-800">
                <CalendarDays className="h-4 w-4 text-primary" />
                {fmtLong(added.date)}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">Enter a start date and a whole number.</p>
          )}
        </div>
      )}

      {mode === "warranty" && (
        <div className="space-y-2">
          <label className={labelCls}>Completion (handover) date
            <input type="date" className={inputCls} value={handover} onChange={(e) => setHandover(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                aria-pressed={preset === p.label}
                onClick={() => { setPreset(p.label); setMonths(String(p.months)); }}
                className={preset === p.label ? "rounded-lg border border-primary bg-primary px-2 py-1 text-[11px] font-bold text-white" : smallBtn}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className={labelCls}>Custom period (months)
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              className={`${inputCls} tabular-nums`}
              value={months}
              onChange={(e) => { setMonths(e.target.value); setPreset(""); }}
            />
          </label>
          {warranty ? (
            <div className="grid grid-cols-2 gap-2">
              <div className={`${cardCls} col-span-2`}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700/70">Expiry date</div>
                <div className="text-base font-bold tabular-nums text-slate-800">{fmtLong(warranty.exp)}</div>
              </div>
              <div className={`col-span-2 rounded-xl border px-3 py-2 text-sm font-bold tabular-nums ${warranty.left < 0 ? "border-red-100 bg-red-50 text-red-700" : warranty.left <= 30 ? "border-amber-100 bg-amber-50 text-amber-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
                {warranty.status}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">Enter a handover date and a period.</p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" className={`${smallBtn} disabled:opacity-50`} disabled={!summary} onClick={() => copy(summary ?? "")}>
          <Copy className="h-3.5 w-3.5" /> Copy result
        </button>
      </div>
    </div>
  );
}
