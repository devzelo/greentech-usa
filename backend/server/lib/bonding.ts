/**
 * CR 309 (2026-09-25): a project's bonding and letter of credit, as the client sends it, cleaned
 * before it is stored: yes/no flags, numbers as numbers, names trimmed. See the frontend's
 * lib/bonding.ts for what each part means.
 */
const txt = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
/** A percent: digits and one point, 0 to 1000 (a bond can be 100% or more of the contract). */
const pct = (v: unknown) => {
  const s = String(v ?? "").replace(/[^0-9.]/g, "");
  const n = parseFloat(s);
  return s && isFinite(n) && n >= 0 && n <= 1000 ? s.slice(0, 12) : "";
};
/** An amount as typed ("$1,000,000"): digits, commas, a point and a dollar sign. */
const amt = (v: unknown) => String(v ?? "").replace(/[^0-9.,$]/g, "").slice(0, 24);
const line = (v: unknown) => {
  const o = (v || {}) as Record<string, unknown>;
  return { required: o.required === true, percent: pct(o.percent), amount: amt(o.amount) };
};

export function cleanBonding(input: unknown) {
  const b = (input || {}) as Record<string, unknown>;
  const iloc = (b.iloc || {}) as Record<string, unknown>;
  return {
    bonded: b.bonded === "yes" || b.bonded === "no" ? b.bonded : "",
    bid: line(b.bid),
    performance: line(b.performance),
    payment: line(b.payment),
    bank: txt(b.bank, 160),
    feePercent: pct(b.feePercent),
    interestRate: pct(b.interestRate),
    iloc: { ...line(iloc), bank: txt(iloc.bank, 160), feePercent: pct(iloc.feePercent), interestRate: pct(iloc.interestRate) },
    acceptedOffer: txt(b.acceptedOffer, 300),
    notes: txt(b.notes, 2000),
  };
}

/**
 * CR 312 (2026-09-25): the figures the bank reports need that a project did not hold (see the
 * frontend's lib/wip.ts), cleaned the same way.
 */
export function cleanWip(input: unknown) {
  const w = (input || {}) as Record<string, unknown>;
  const pct100 = (v: unknown) => { const p = pct(v); return p && parseFloat(p) <= 100 ? p : ""; };
  return {
    competition: txt(w.competition, 80),
    primeContractor: txt(w.primeContractor, 160),
    winChance: pct100(w.winChance),
    fundedValue: amt(w.fundedValue),
    grossProfitPct: pct100(w.grossProfitPct),
    approvedChanges: amt(w.approvedChanges),
    costToComplete: amt(w.costToComplete),
  };
}
