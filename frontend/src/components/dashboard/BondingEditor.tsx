import { useState } from "react";
import DirectoryNameField from "./DirectoryNameField";
import { ShieldCheck, Landmark, Pencil, Loader2 } from "lucide-react";
import {
  bondingLines, feeAmount, fromAmount, fromPercent, moneyNum, withBonding, type BondLine, type ProjectBonding,
} from "../../lib/bonding";
import { updateProject, type ApiProject } from "../../lib/api";
import { toast } from "../../lib/toast";

/**
 * CR 309 (2026-09-25): bonding and the letter of credit, in one compact block. Used in the New
 * Project form and in the project's Legal Docs, where the figures are updated once a bank accepts.
 * Percent and amount fill each other in from the contract value.
 */

const BONDS: Array<{ key: "bid" | "performance" | "payment"; label: string; hint: string }> = [
  { key: "bid", label: "Bid bond", hint: "With the proposal (often 10%); returned after the award" },
  { key: "performance", label: "Performance bond", hint: "Asked by the client; held until handover" },
  { key: "payment", label: "Payment bond", hint: "Guarantees subcontractors and suppliers are paid" },
];

const inp = "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-slate-50 disabled:text-slate-300";
const lbl = "text-[9px] font-bold uppercase tracking-widest text-slate-400";

function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-primary" : "bg-slate-200"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

export default function BondingEditor({ value, onChange, contractValue }: {
  value: ProjectBonding;
  onChange: (b: ProjectBonding) => void;
  /** The contract value the percentages work from ("$1,000,000"). */
  contractValue: string;
}) {
  const contract = moneyNum(contractValue);
  const bonded = value.bonded === "yes";
  const setLine = (key: "bid" | "performance" | "payment", patch: Partial<BondLine>) => onChange({ ...value, [key]: { ...value[key], ...patch } });
  const setIloc = (patch: Partial<ProjectBonding["iloc"]>) => onChange({ ...value, iloc: { ...value.iloc, ...patch } });
  const seg = (v: ProjectBonding["bonded"], text: string) => (
    <button type="button" onClick={() => onChange({ ...value, bonded: v })}
      className={`px-3 py-1 text-[11px] font-bold transition-colors ${value.bonded === v ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`}>{text}</button>
  );

  return (
    <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800"><ShieldCheck size={14} className="text-primary" /> Bonded?</span>
        <span className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">{seg("yes", "Yes")}{seg("no", "No")}</span>
        <span className="text-[11px] text-slate-400">
          {contract ? <>Percentages work from the contract value, <b className="text-slate-600">${contract.toLocaleString("en-US")}</b>.</> : "Enter the project value to have amounts and percentages fill each other in."}
        </span>
      </div>

      {/* The three bonds: greyed out unless the project is bonded. */}
      <div className={`overflow-x-auto rounded-xl border border-slate-100 bg-white ${bonded ? "" : "opacity-60"}`}>
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className={`${lbl} px-3 py-1.5 text-left`}>Bond</th>
              <th className={`${lbl} px-2 py-1.5 text-left`}>Needed</th>
              <th className={`${lbl} w-24 px-2 py-1.5 text-left`}>%</th>
              <th className={`${lbl} w-36 px-2 py-1.5 text-left`}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {BONDS.map((bd) => {
              const l = value[bd.key];
              const off = !bonded || !l.required;
              return (
                <tr key={bd.key} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-1.5">
                    <p className="text-xs font-bold text-slate-700">{bd.label}</p>
                    <p className="text-[10px] text-slate-400">{bd.hint}</p>
                  </td>
                  <td className="px-2 py-1.5"><Toggle label={`${bd.label} needed`} on={bonded && l.required} disabled={!bonded} onChange={(v) => setLine(bd.key, { required: v })} /></td>
                  <td className="px-2 py-1.5">
                    <input className={inp} inputMode="decimal" placeholder={bd.key === "bid" ? "10" : bd.key === "performance" ? "100" : "100"} disabled={off}
                      value={l.percent} onChange={(e) => setLine(bd.key, fromPercent(e.target.value.replace(/[^0-9.]/g, ""), contract))} aria-label={`${bd.label} percent`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={inp} inputMode="decimal" placeholder="$" disabled={off}
                      value={l.amount} onChange={(e) => setLine(bd.key, fromAmount(e.target.value.replace(/[^0-9.,$]/g, ""), contract))} aria-label={`${bd.label} amount`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="grid grid-cols-1 gap-2 border-t border-slate-100 px-3 py-2 sm:grid-cols-[2fr_1fr_1fr]">
          {/* 2026-10-07 - the surety or bank is a company in the Directory, picked not typed. */}
          <div className="space-y-0.5"><span className={lbl}>Bonding company / bank</span>
            <DirectoryNameField value={value.bank} disabled={!bonded} categories={["financial", "other"]} title="Bonding company / bank" placeholder="Pick from the Directory"
              onPick={(c) => onChange({ ...value, bank: c.name })} onClear={() => onChange({ ...value, bank: "" })} /></div>
          <label className="space-y-0.5"><span className={lbl}>Fee % {bonded && feeAmount(value.feePercent, contract) && <span className="normal-case tracking-normal text-slate-500">= {feeAmount(value.feePercent, contract)}</span>}</span>
            <input className={inp} disabled={!bonded} inputMode="decimal" value={value.feePercent} onChange={(e) => onChange({ ...value, feePercent: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="2" /></label>
          <label className="space-y-0.5"><span className={lbl}>Interest rate %</span>
            <input className={inp} disabled={!bonded} inputMode="decimal" value={value.interestRate} onChange={(e) => onChange({ ...value, interestRate: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="7" /></label>
        </div>
      </div>

      {/* The letter of credit: usual when the project is not bonded, but always available. */}
      <div className="rounded-xl border border-slate-100 bg-white">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><Landmark size={13} className="text-primary" /> Letter of credit (ILOC)</span>
          <Toggle label="Letter of credit needed" on={value.iloc.required} onChange={(v) => setIloc({ required: v })} />
          <span className="text-[10px] text-slate-400">{value.bonded === "no" ? "Not bonded, so usually a bank letter of credit instead." : "A bank guarantees the work instead of a bond."}</span>
        </div>
        {value.iloc.required && (
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 px-3 py-2 sm:grid-cols-[1fr_1.4fr_2fr_1fr_1fr]">
            <label className="space-y-0.5"><span className={lbl}>%</span>
              <input className={inp} inputMode="decimal" value={value.iloc.percent} onChange={(e) => setIloc(fromPercent(e.target.value.replace(/[^0-9.]/g, ""), contract))} placeholder="40" /></label>
            <label className="space-y-0.5"><span className={lbl}>Amount</span>
              <input className={inp} inputMode="decimal" value={value.iloc.amount} onChange={(e) => setIloc(fromAmount(e.target.value.replace(/[^0-9.,$]/g, ""), contract))} placeholder="$" /></label>
            <div className="col-span-2 space-y-0.5 sm:col-span-1"><span className={lbl}>Bank / institution</span>
              <DirectoryNameField value={value.iloc.bank} categories={["financial", "other"]} title="Bank / institution" placeholder="Pick from the Directory"
                onPick={(c) => setIloc({ bank: c.name })} onClear={() => setIloc({ bank: "" })} /></div>
            <label className="space-y-0.5"><span className={lbl}>Fee % {feeAmount(value.iloc.feePercent, contract) && <span className="normal-case tracking-normal text-slate-500">= {feeAmount(value.iloc.feePercent, contract)}</span>}</span>
              <input className={inp} inputMode="decimal" value={value.iloc.feePercent} onChange={(e) => setIloc({ feePercent: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="2" /></label>
            <label className="space-y-0.5"><span className={lbl}>Interest %</span>
              <input className={inp} inputMode="decimal" value={value.iloc.interestRate} onChange={(e) => setIloc({ interestRate: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="7" /></label>
          </div>
        )}
      </div>

      <label className="block space-y-0.5"><span className={lbl}>Accepted offer</span>
        <input className={inp} value={value.acceptedOffer} onChange={(e) => onChange({ ...value, acceptedOffer: e.target.value })} placeholder="When several banks were applied to: whose offer was taken, and its terms" /></label>
    </div>
  );
}

/** The figures in brief, for the top of Legal Docs. */
export function BondingSummary({ value }: { value: ProjectBonding }) {
  const lines = bondingLines(value);
  const chip = "inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200";
  if (!value.bonded && !lines.length) return <p className="text-xs text-slate-400">Not set yet. Record whether the project is bonded or needs a letter of credit.</p>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`${chip} ${value.bonded === "yes" ? "!bg-emerald-50 !text-emerald-700 !ring-emerald-200" : ""}`}>{value.bonded === "yes" ? "Bonded" : value.bonded === "no" ? "Not bonded" : "Bonding not set"}</span>
      {lines.map((l) => <span key={l} className={chip}>{l}</span>)}
      {value.bonded === "yes" && value.bank && <span className={chip}>Bonds: {value.bank}{value.feePercent ? `, fee ${value.feePercent}%` : ""}{value.interestRate ? `, interest ${value.interestRate}%` : ""}</span>}
      {value.iloc.required && value.iloc.bank && <span className={chip}>ILOC: {value.iloc.bank}{value.iloc.feePercent ? `, fee ${value.iloc.feePercent}%` : ""}{value.iloc.interestRate ? `, interest ${value.iloc.interestRate}%` : ""}</span>}
      {value.acceptedOffer && <span className={chip}>Accepted: {value.acceptedOffer}</span>}
    </div>
  );
}

/**
 * The top of the project's Legal Docs: the bonding figures in brief, above the bank applications
 * and bond documents filed below. The owner updates them here once a bank accepts.
 */
export function BondingCard({ project, canEdit, onSaved }: { project: ApiProject; canEdit: boolean; onSaved: (b: ProjectBonding) => void }) {
  const [draft, setDraft] = useState<ProjectBonding | null>(null);
  const [saving, setSaving] = useState(false);
  if (project.canSeeFigures === false) return null;
  const current = withBonding(project.bonding);
  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await updateProject(project.id, { bonding: draft });
      onSaved(withBonding(updated.bonding ?? draft));
      setDraft(null);
      toast("Bonding saved.", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save.", "error"); }
    finally { setSaving(false); }
  };
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><ShieldCheck size={15} className="text-primary" /> Bonding &amp; letter of credit</p>
        {canEdit && !draft && (
          <button type="button" onClick={() => setDraft(current)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary"><Pencil size={11} /> Edit</button>
        )}
        {draft && (
          <span className="flex gap-1.5">
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-primary disabled:opacity-50">
              {saving && <Loader2 size={11} className="animate-spin" />} Save
            </button>
          </span>
        )}
      </div>
      {draft ? <BondingEditor value={draft} onChange={setDraft} contractValue={project.value} /> : <BondingSummary value={current} />}
    </div>
  );
}
