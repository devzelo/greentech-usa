import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Copy, Loader2, RefreshCw } from "lucide-react";
import { fetchExchangeRates, type ApiRates } from "../../lib/api";
import { toast } from "../../lib/toast";

// Currency converter with today's exchange rates (refreshed daily by the provider, cached by our
// server). Shows the rate date so nobody relies on a stale number without knowing.

const COMMON = ["USD", "EUR", "GBP", "AED", "SAR", "QAR", "KWD", "AFN", "PKR", "INR", "JPY", "CNY", "CAD", "AUD", "CHF", "TRY", "EGP", "KES", "NGN", "GHS", "ZAR", "FJD", "XOF", "XAF", "ETB", "UGX", "TZS", "RWF", "DJF", "SLE", "LRD", "MAD", "JOD", "IQD", "PHP", "IDR", "THB", "BRL", "MXN", "COP"];
const LS_KEY = "gt-toolbox-currency";

const nameOf = (code: string) => {
  try { return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) || code; } catch { return code; }
};

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
  const codes = useMemo(() => {
    const all = Object.keys(data?.rates || {});
    const common = COMMON.filter((c) => all.includes(c));
    const rest = all.filter((c) => !COMMON.includes(c)).sort();
    return { common, rest };
  }, [data]);
  const rate = data && data.rates[from] && data.rates[to] ? data.rates[to] / data.rates[from] : null;
  const n = Number(amount);
  const result = rate != null && amount.trim() !== "" && isFinite(n) ? n * rate : null;
  const fmt = (v: number, code: string) => {
    try { return v.toLocaleString("en-US", { style: "currency", currency: code, maximumFractionDigits: v !== 0 && Math.abs(v) < 1 ? 6 : 2 }); }
    catch { return `${v.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${code}`; }
  };

  const select = "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 focus:border-primary focus:outline-none";
  const options = (
    <>
      <optgroup label="Common">{codes.common.map((c) => <option key={c} value={c}>{c} · {nameOf(c)}</option>)}</optgroup>
      <optgroup label="All currencies">{codes.rest.map((c) => <option key={c} value={c}>{c} · {nameOf(c)}</option>)}</optgroup>
    </>
  );

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
        <label className="block text-[11px] font-bold text-slate-500">From<select value={from} onChange={(e) => setFrom(e.target.value)} className={`${select} mt-1`}>{options}</select></label>
        <button type="button" onClick={() => { setFrom(to); setTo(from); }} title="Swap" className="mb-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeftRight size={14} /></button>
        <label className="block text-[11px] font-bold text-slate-500">To<select value={to} onChange={(e) => setTo(e.target.value)} className={`${select} mt-1`}>{options}</select></label>
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
      {data && (
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>Rates as of {new Date(data.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. Source: {data.source}. Indicative only.</span>
          <button type="button" onClick={load} disabled={loading} title="Reload rates" className="shrink-0 rounded p-1 hover:bg-slate-100 hover:text-primary"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /></button>
        </div>
      )}
    </div>
  );
}
