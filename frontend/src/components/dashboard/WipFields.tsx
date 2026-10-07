import { Landmark } from "lucide-react";
import { money } from "../../lib/bonding";
import { COMPETITION, plannedProfit, type ProjectWip } from "../../lib/wip";
import { sanitizeMoney } from "../../lib/money";
import MoneyInput from "./MoneyInput";

/**
 * CR 312 (2026-09-25): the project figures the bank reports (WIP, opportunities) need, in one small
 * block for the New Project form and the Edit Project dialog.
 */
const inp = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
const lbl = "text-[9px] font-bold uppercase tracking-widest text-slate-400";

export default function WipFields({ value, onChange, contractValue, disabled }: {
  value: ProjectWip;
  onChange: (w: ProjectWip) => void;
  contractValue: string;
  disabled?: boolean;
}) {
  const set = (patch: Partial<ProjectWip>) => onChange({ ...value, ...patch });
  const pct = (v: string) => v.replace(/[^0-9.]/g, "").slice(0, 6);
  const profit = plannedProfit(contractValue, value);
  return (
    <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
        <Landmark size={13} className="text-primary" /> For bank and bonding reports
        <span className="font-normal text-slate-400">(work in progress, opportunities). Leave blank what you do not know yet.</span>
      </p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <label className="space-y-0.5"><span className={lbl}>Competition</span>
          <select className={inp} disabled={disabled} value={value.competition} onChange={(e) => set({ competition: e.target.value })}>
            <option value="">Not set</option>
            {COMPETITION.map((c) => <option key={c} value={c}>{c}</option>)}
            {value.competition && !COMPETITION.includes(value.competition) && <option value={value.competition}>{value.competition}</option>}
          </select>
        </label>
        <label className="space-y-0.5"><span className={lbl}>Prime contractor</span>
          <input className={inp} disabled={disabled} value={value.primeContractor} onChange={(e) => set({ primeContractor: e.target.value.slice(0, 160) })} placeholder="GreenTech USA" />
        </label>
        <label className="space-y-0.5"><span className={lbl}>Chance of winning %</span>
          <input className={inp} disabled={disabled} inputMode="decimal" value={value.winChance} onChange={(e) => set({ winChance: pct(e.target.value) })} placeholder="70" />
        </label>
        <label className="space-y-0.5"><span className={lbl}>Funded value</span>
          <MoneyInput className={inp} disabled={disabled} value={value.fundedValue} onChange={(v) => set({ fundedValue: sanitizeMoney(v) })} />
        </label>
        <label className="space-y-0.5"><span className={lbl}>Est. gross profit % {profit ? <span className="normal-case tracking-normal text-slate-500">= {money(profit)}</span> : null}</span>
          <input className={inp} disabled={disabled} inputMode="decimal" value={value.grossProfitPct} onChange={(e) => set({ grossProfitPct: pct(e.target.value) })} placeholder="20" />
        </label>
        <label className="space-y-0.5"><span className={lbl}>Approved change orders</span>
          <MoneyInput className={inp} disabled={disabled} value={value.approvedChanges} onChange={(v) => set({ approvedChanges: sanitizeMoney(v) })} />
        </label>
        <label className="col-span-2 space-y-0.5"><span className={lbl}>Estimated cost to complete the remaining work</span>
          <MoneyInput className={inp} disabled={disabled} value={value.costToComplete} onChange={(v) => set({ costToComplete: sanitizeMoney(v) })} placeholder="Update as the work goes on" />
        </label>
      </div>
    </div>
  );
}
