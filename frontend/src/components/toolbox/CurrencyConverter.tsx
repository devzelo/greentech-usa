import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ChevronDown, Copy, Loader2, RefreshCw, Search } from "lucide-react";
import { fetchExchangeRates, type ApiRates } from "../../lib/api";
import { toast } from "../../lib/toast";

// Currency converter with today's exchange rates (refreshed daily by the provider, cached by our
// server). Shows the rate date so nobody relies on a stale number without knowing.

const COMMON = ["USD", "EUR", "GBP", "AED", "SAR", "QAR", "KWD", "IRT", "IRR", "AFN", "PKR", "INR", "JPY", "CNY", "CAD", "AUD", "CHF", "TRY", "EGP", "KES", "NGN", "GHS", "ZAR", "FJD", "XOF", "XAF", "ETB", "UGX", "TZS", "RWF", "DJF", "SLE", "LRD", "MAD", "JOD", "IQD", "PHP", "IDR", "THB", "BRL", "MXN", "COP"];
const LS_KEY = "gt-toolbox-currency";

// The browser's own name when it knows the code, else the rate source's (crypto, metals, IRT).
const intlName = (code: string) => {
  try { const n = new Intl.DisplayNames(["en"], { type: "currency" }).of(code); return n && n !== code ? n : ""; } catch { return ""; }
};
const titleCase = (t: string) => t.replace(/\b\w/g, (c) => c.toUpperCase());

type Groups = { common: string[]; world: string[]; other: string[] };

// CR (2026-09-21): ~340 codes do not fit a plain dropdown, so the picker searches by code or name.
function CurrencyPick({ label, value, onChange, groups, nameOf }: { label: string; value: string; onChange: (c: string) => void; groups: Groups; nameOf: (c: string) => string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const n = q.trim().toLowerCase();
  const hit = (c: string) => !n || c.toLowerCase().includes(n) || nameOf(c).toLowerCase().includes(n);
  const sections: Array<[string, string[]]> = [
    ["Common", groups.common.filter(hit)],
    ["All currencies", groups.world.filter(hit)],
    ["Crypto, metals and other", groups.other.filter(hit)],
  ];
  const first = sections.find(([, l]) => l.length)?.[1][0];
  const pick = (c: string) => { onChange(c); setOpen(false); setQ(""); };
  return (
    <div ref={box} className="relative block text-[11px] font-bold text-slate-500">
      {label}
      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 flex w-full items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-xs font-semibold text-slate-700 hover:border-primary">
        <span className="truncate">{value} · {nameOf(value)}</span><ChevronDown size={12} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <label className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-2">
            <Search size={12} className="text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && first) pick(first); if (e.key === "Escape") setOpen(false); }}
              placeholder="Code or name: toman, IRR, dirham..." aria-label={`Find a currency (${label})`} className="min-w-0 flex-1 text-xs font-medium text-slate-700 outline-none" />
          </label>
          <div className="max-h-64 overflow-y-auto py-1">
            {sections.map(([title, list]) => list.length > 0 && (
              <div key={title}>
                <p className="px-2.5 pb-0.5 pt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">{title}</p>
                {list.map((c) => (
                  <button key={c} type="button" onClick={() => pick(c)} className={`flex w-full items-baseline gap-2 px-2.5 py-1 text-left text-xs hover:bg-primary/5 ${c === value ? "bg-emerald-50 text-emerald-800" : "text-slate-700"}`}>
                    <span className="w-9 shrink-0 font-mono font-bold">{c}</span><span className="truncate font-medium">{nameOf(c)}</span>
                  </button>
                ))}
              </div>
            ))}
            {!first && <p className="px-3 py-3 text-center text-[11px] italic text-slate-400">No currency matches.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CurrencyConverter() {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}") as { from?: string; to?: string }; } catch { return {}; } })();
  const [from, setFrom] = useState(saved.from || "USD");
  const [to, setTo] = useState(saved.to || "EUR");
  const [amount, setAmount] = useState("1");
  const [data, setData] = useState<ApiRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    fetchExchangeRates("USD")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Exchange rates are not available right now."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify({ from, to })); } catch { /* ignore */ } }, [from, to]);

  // All rates are against USD; cross rates are derived.
  const nameOf = (c: string) => intlName(c) || (data?.names?.[c] ? titleCase(data.names[c]) : c);
  const groups = useMemo<Groups>(() => {
    const all = Object.keys(data?.rates || {});
    const common = COMMON.filter((c) => all.includes(c));
    const rest = all.filter((c) => !COMMON.includes(c)).sort();
    // ISO currencies the browser can name go under "All currencies"; crypto, metals and legacy codes after.
    return { common, world: rest.filter((c) => !!intlName(c)), other: rest.filter((c) => !intlName(c)) };
  }, [data]);
  const rate = data && data.rates[from] && data.rates[to] ? data.rates[to] / data.rates[from] : null;
  const n = Number(amount);
  const result = rate != null && amount.trim() !== "" && isFinite(n) ? n * rate : null;
  const fmt = (v: number, code: string) => {
    try { return v.toLocaleString("en-US", { style: "currency", currency: code, maximumFractionDigits: v !== 0 && Math.abs(v) < 1 ? 6 : 2 }); }
    catch { return `${v.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${code}`; }
  };


  if (loading && !data) return <div className="flex items-center justify-center gap-2 py-8 text-xs font-bold text-slate-400"><Loader2 size={16} className="animate-spin" /> Loading exchange rates...</div>;
  if (error && !data) return (
    <div className="space-y-2 py-4 text-center">
      <p className="text-xs font-semibold text-red-600">{error}</p>
      <button type="button" onClick={load} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary"><RefreshCw size={12} /> Try again</button>
    </div>
  );

  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-bold text-slate-500">Amount
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-primary focus:outline-none" />
      </label>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5">
        <CurrencyPick label="From" value={from} onChange={setFrom} groups={groups} nameOf={nameOf} />
        <button type="button" onClick={() => { setFrom(to); setTo(from); }} title="Swap" className="mb-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeftRight size={14} /></button>
        <CurrencyPick label="To" value={to} onChange={setTo} groups={groups} nameOf={nameOf} />
      </div>
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <p className="break-all font-mono text-lg font-bold tabular-nums text-slate-900">{result != null ? fmt(result, to) : "..."}</p>
          {result != null && (
            <button type="button" title="Copy" onClick={() => navigator.clipboard.writeText(String(Number(result.toFixed(6)))).then(() => toast("Copied.", "success")).catch(() => {})} className="mt-1 rounded p-1 text-slate-400 hover:bg-white hover:text-primary"><Copy size={13} /></button>
          )}
        </div>
        {rate != null && (
          <p className="text-[11px] font-semibold text-slate-500 tabular-nums">1 {from} = {rate.toLocaleString("en-US", { maximumFractionDigits: 6 })} {to} · 1 {to} = {(1 / rate).toLocaleString("en-US", { maximumFractionDigits: 6 })} {from}</p>
        )}
      </div>
      {/* CR 264 - Iran has two rates that are far apart. Say which one this is, and what the other is. */}
      {data?.iran && (from === "IRR" || from === "IRT" || to === "IRR" || to === "IRT") && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] leading-relaxed text-amber-800">
          Converted at Iran's <b>open market</b> rate: {data.iran.market.toLocaleString("en-US", { maximumFractionDigits: 0 })} rial
          ({(data.iran.market / 10).toLocaleString("en-US", { maximumFractionDigits: 0 })} toman) per US dollar{data.iran.date ? `, ${data.iran.date}` : ""}.
          {data.iran.official > 0 && <> Google and XE quote the central bank rate, about {data.iran.official.toLocaleString("en-US", { maximumFractionDigits: 0 })} rial
          ({(data.iran.official / 10).toLocaleString("en-US", { maximumFractionDigits: 0 })} toman), which is not what money actually changes hands at.</>}
        </p>
      )}
      {data && (
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>Rates as of {new Date(data.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. Source: {data.source}. Indicative only.</span>
          <button type="button" onClick={load} disabled={loading} title="Reload rates" className="shrink-0 rounded p-1 hover:bg-slate-100 hover:text-primary"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /></button>
        </div>
      )}
    </div>
  );
}
