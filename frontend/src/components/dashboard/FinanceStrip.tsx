import { FIVE_META, fmtMoney, type FiveNumbers } from "../../lib/projectFinance";

// CR-P-15 — the five-number financial overview, rendered identically on the project header and the
// All Projects totals bar (same labels, same order, same colours).
const TONE: Record<string, { bg: string; text: string; border: string }> = {
  rose:    { bg: "bg-rose-50",    text: "text-rose-600",    border: "border-rose-100" },
  amber:   { bg: "bg-amber-50",   text: "text-amber-600",   border: "border-amber-100" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-100" },
  blue:    { bg: "bg-blue-50",    text: "text-blue-600",    border: "border-blue-100" },
  primary: { bg: "bg-primary/5",  text: "text-primary",     border: "border-primary/10" },
};

export default function FinanceStrip({ five, size = "md" }: { five: FiveNumbers; size?: "sm" | "md" }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {FIVE_META.map((m) => {
        const val = five[m.key];
        // Estimated Profit turns red when negative (label stays the same everywhere).
        const neg = m.key === "estimatedProfit" && val < 0;
        const t = neg ? { bg: "bg-red-50", text: "text-red-600", border: "border-red-100" } : TONE[m.tone];
        return (
          <div key={m.key} className={`rounded-xl border px-3 py-2 ${t.bg} ${t.border}`}>
            <p className={`font-display font-bold leading-none ${size === "sm" ? "text-sm" : "text-base"} ${t.text}`}>{fmtMoney(val)}</p>
            <div className="flex items-center gap-1.5 mt-1 min-w-0">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest truncate">{m.label}</p>
              {m.tag && <span className={`shrink-0 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-white border ${t.text} ${t.border}`}>{m.tag}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
