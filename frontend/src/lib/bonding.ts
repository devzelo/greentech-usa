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
