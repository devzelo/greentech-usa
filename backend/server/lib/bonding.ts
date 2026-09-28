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
