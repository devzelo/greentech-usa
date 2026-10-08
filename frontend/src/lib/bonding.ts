/**
 * CR 309 (2026-09-25): how a project is guaranteed to the client. Either it is bonded (a bid bond at
 * the proposal, returned after award; a performance bond held until handover; a payment bond), or,
 * when it is not, a bank issues an irrevocable letter of credit (ILOC). Each is a share of the
 * contract: given as a percent or an amount, the other is worked out from the contract value.
 *
 * The bank (or bonding company) charges a fee, a percent of the contract, and quotes an interest
 * rate for any loan it makes. Several banks may be applied to; `acceptedOffer` names the one taken.
 */

export interface BondLine { required: boolean; percent: string; amount: string }
export interface ProjectBonding {
  bonded: "" | "yes" | "no";
  bid: BondLine;
  performance: BondLine;
  payment: BondLine;
  /** The bonding company or bank for the bonds, and its terms. */
  bank: string;
  feePercent: string;
  interestRate: string;
  iloc: BondLine & { bank: string; feePercent: string; interestRate: string };
  acceptedOffer: string;
  notes: string;
}

const line = (): BondLine => ({ required: false, percent: "", amount: "" });
export const emptyBonding = (): ProjectBonding => ({
  bonded: "", bid: line(), performance: line(), payment: line(),
  bank: "", feePercent: "", interestRate: "",
  iloc: { ...line(), bank: "", feePercent: "", interestRate: "" },
  acceptedOffer: "", notes: "",
});
/** A stored record, filled out to the full shape (older projects have none). */
export function withBonding(b?: Partial<ProjectBonding> | null): ProjectBonding {
  const e = emptyBonding();
  if (!b) return e;
  return {
    ...e, ...b,
    bid: { ...e.bid, ...(b.bid || {}) },
    performance: { ...e.performance, ...(b.performance || {}) },
    payment: { ...e.payment, ...(b.payment || {}) },
    iloc: { ...e.iloc, ...(b.iloc || {}) },
  };
}

/** "$1,250,000.50" -> 1250000.5; anything unreadable -> 0. */
export const moneyNum = (v?: string) => parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")) || 0;
export const money = (n: number) => (n ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "");
const pctText = (n: number) => (n ? String(+n.toFixed(4)) : "");

/** A percent was typed: the amount follows the contract value. */
export const fromPercent = (percent: string, contract: number) => {
  const p = parseFloat(percent);
  return { percent, amount: contract && isFinite(p) ? money((contract * p) / 100) : "" };
};
/** An amount was typed: the percent follows. */
export const fromAmount = (amount: string, contract: number) => {
  const a = moneyNum(amount);
  return { amount, percent: contract && a ? pctText((a / contract) * 100) : "" };
};

/** 2026-10-08 - the bonds that cost the project, added up: what the bank's fee and interest are a
 *  percent of. The bid bond is returned after the bidding, so it is not a cost. */
export const bondsTotal = (b: ProjectBonding) =>
  b.bonded === "yes" ? (["performance", "payment"] as const).filter((k) => b[k].required).reduce((s, k) => s + moneyNum(b[k].amount), 0) : 0;

type Dated = { schedule?: { milestones?: Array<{ plannedStart?: string; plannedEnd?: string }>; extensions?: Array<{ endDate?: string }> } | null; startDate?: string; endDate?: string };
/** 2026-10-08 - the project's length in days, for the interest: the schedule's first start to its last
 *  finish (or a later approved extension), else the project's dates, else a year. As the server does. */
export function projectSpan(p: Dated): { days: number; from: "schedule" | "dates" | "default" } {
  const t = (s?: string) => (s ? Date.parse(s) : NaN);
  const ms = p.schedule?.milestones || [];
  let start = Math.min(...ms.map((m) => t(m.plannedStart)).filter((x) => isFinite(x)));
  let end = Math.max(...ms.map((m) => (isFinite(t(m.plannedEnd)) ? t(m.plannedEnd) : t(m.plannedStart))).filter((x) => isFinite(x)));
  const fromSchedule = isFinite(start) || isFinite(end);
  if (!isFinite(start)) start = t(p.startDate);
  if (!isFinite(end)) end = t(p.endDate);
  const ext = Math.max(...(p.schedule?.extensions || []).map((e) => t(e.endDate)).filter((x) => isFinite(x)));
  if (isFinite(ext) && (!isFinite(end) || ext > end)) end = ext;
  if (!(isFinite(start) && isFinite(end) && end > start)) return { days: 365, from: "default" };
  return { days: Math.round((end - start) / 86400000) + 1, from: fromSchedule ? "schedule" : "dates" };
}

const cents = (n: number) => Math.round(n * 100) / 100;
/** 2026-10-08 - what the guarantees cost the project, as the server files them in Expenses: the bank
 *  fee (once) and the interest over the project's days, on the performance and payment bonds and on
 *  the letter of credit. */
export function bondingCosts(b: ProjectBonding, days: number): Array<{ label: string; amount: number }> {
  const out: Array<{ label: string; amount: number }> = [];
  const add = (label: string, base: number, pct: string, overTime: boolean) => {
    const p = moneyNum(pct);
    const amount = cents(((base * p) / 100) * (overTime ? days / 365 : 1));
    if (base > 0 && p > 0 && amount > 0) out.push({ label, amount });
  };
  const bonds = bondsTotal(b);
  const iloc = b.iloc.required ? moneyNum(b.iloc.amount) : 0;
  add("Bank fee, performance and payment bonds", bonds, b.feePercent, false);
  add("Interest, performance and payment bonds", bonds, b.interestRate, true);
  add("Bank fee, letter of credit", iloc, b.iloc.feePercent, false);
  add("Interest, letter of credit", iloc, b.iloc.interestRate, true);
  return out;
}
export const bondingCostTotal = (b: ProjectBonding, days: number) => cents(bondingCosts(b, days).reduce((s, c) => s + c.amount, 0));
/** A percent of an amount, as money ("" when either is missing). */
export const pctOf = (percent: string, base: number) => {
  const p = parseFloat(percent);
  return base && isFinite(p) && p ? money(Math.round(base * p) / 100) : "";
};

/** The fee a percent of the contract comes to. */
export const feeAmount = (feePercent: string, contract: number) => {
  const p = parseFloat(feePercent);
  return contract && isFinite(p) && p ? money((contract * p) / 100) : "";
};

/** One line per guarantee in force, for summaries and reports: "Performance bond 100% ($1,000,000)". */
export function bondingLines(b: ProjectBonding): string[] {
  const out: string[] = [];
  const show = (label: string, l: BondLine) => {
    if (!l.required) return;
    const bits = [l.percent ? `${l.percent}%` : "", l.amount].filter(Boolean);
    out.push(`${label}${bits.length ? ` ${bits.join(" / ")}` : ""}`);
  };
  if (b.bonded === "yes") { show("Bid bond", b.bid); show("Performance bond", b.performance); show("Payment bond", b.payment); }
  show("Letter of credit", b.iloc);
  return out;
}
