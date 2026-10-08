import Expense from "../models/Expense";

/**
 * 2026-10-08 - "when you choose the bank fee percentage, it must calculate the bank fee and consider
 * it an expense of the project; also the interest." Then: "the bid bond is not a cost (it is returned
 * after the bidding); the performance and payment bonds are part of the project's cost from the
 * beginning, with the bank fee and the interest over the project's duration per the Gantt chart."
 *   the bank fee on the bonds         = fee %      x (performance + payment bonds)
 *   the interest on the bonds         = interest % a year x the same x the project's days / 365
 *   the bank fee on the ILOC          = fee %      x the letter of credit's amount
 *   the interest on the ILOC          = interest % a year x the same x the project's days / 365
 * Each is kept as one expense of the project (marked by `source`), created, updated or removed when
 * the bonding is saved. It goes through approval like any expense; a changed amount asks again.
 */
type Line = { required?: boolean; amount?: string };
type Bonding = {
  bonded?: string; bid?: Line; performance?: Line; payment?: Line; bank?: string; feePercent?: string; interestRate?: string;
  iloc?: Line & { bank?: string; feePercent?: string; interestRate?: string };
};
export type BondingCost = { key: "bond-fee" | "bond-interest" | "iloc-fee" | "iloc-interest"; description: string; amount: number; vendor: string };

const num = (v?: string) => parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")) || 0;
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cents = (n: number) => Math.round(n * 100) / 100;

type Dated = { schedule?: { milestones?: Array<{ plannedStart?: string; plannedEnd?: string }>; extensions?: Array<{ endDate?: string }> }; startDate?: string; endDate?: string };
/** The project's length in days: the schedule's first start to its last finish (or a later
 *  approved extension), else the project's own dates, else a year. */
export function projectDays(p: Dated): number {
  const t = (s?: string) => (s ? Date.parse(s) : NaN);
  const ms = p.schedule?.milestones || [];
  let start = Math.min(...ms.map((m) => t(m.plannedStart)).filter((x) => isFinite(x)));
  let end = Math.max(...ms.map((m) => (isFinite(t(m.plannedEnd)) ? t(m.plannedEnd) : t(m.plannedStart))).filter((x) => isFinite(x)));
  if (!isFinite(start)) start = t(p.startDate);
  if (!isFinite(end)) end = t(p.endDate);
  const ext = Math.max(...(p.schedule?.extensions || []).map((e) => t(e.endDate)).filter((x) => isFinite(x)));
  if (isFinite(ext) && (!isFinite(end) || ext > end)) end = ext;
  return isFinite(start) && isFinite(end) && end > start ? Math.round((end - start) / 86400000) + 1 : 365;
}

export function bondingCosts(b?: Bonding | null, days = 365): BondingCost[] {
  if (!b) return [];
  const out: BondingCost[] = [];
  // The bid bond is returned after the bidding: not a cost.
  const bonds = b.bonded === "yes" ? (["performance", "payment"] as const).filter((k) => b[k]?.required).reduce((s, k) => s + num(b[k]?.amount), 0) : 0;
  const iloc = b.iloc?.required ? num(b.iloc.amount) : 0;
  const add = (key: BondingCost["key"], base: number, pct: string | undefined, what: string, vendor: string, overTime: boolean) => {
    const p = num(pct);
    const amount = cents((base * p) / 100 * (overTime ? days / 365 : 1));
    const how = overTime ? `${p}% a year over the project's ${days} days, on ${usd(base)}` : `${p}% of ${usd(base)}`;
    if (base > 0 && p > 0 && amount > 0) out.push({ key, description: `${what} (${how})`, amount, vendor });
  };
  add("bond-fee", bonds, b.feePercent, "Bank fee for the performance and payment bonds", b.bank || "", false);
  add("bond-interest", bonds, b.interestRate, "Interest on the performance and payment bonds", b.bank || "", true);
  add("iloc-fee", iloc, b.iloc?.feePercent, "Bank fee for the letter of credit", b.iloc?.bank || "", false);
  add("iloc-interest", iloc, b.iloc?.interestRate, "Interest on the letter of credit", b.iloc?.bank || "", true);
  return out;
}

const KEYS: BondingCost["key"][] = ["bond-fee", "bond-interest", "iloc-fee", "iloc-interest"];
const NOTE = "Worked out from the project's Bonding & letter of credit; it follows those figures when they change.";

/** The next expense number in the project (EXP-2026-001 ...), as the Expenses tab numbers them. */
async function nextExpenseNo(projectId: string): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await Expense.find({ projectId, expenseNo: new RegExp(`^EXP-${year}-`) }).select("expenseNo").lean();
  const n = rows.reduce((m, r) => Math.max(m, parseInt(String(r.expenseNo).split("-")[2] || "0", 10) || 0), 0) + 1;
  return `EXP-${year}-${String(n).padStart(3, "0")}`;
}

type Actor = { userId?: string; name?: string; email?: string; role?: string };
// One sync at a time for a project, so two saves close together never add the same expense twice.
const running = new Map<string, Promise<void>>();
export function syncBondingExpenses(projectId: string, bonding: Bonding | null | undefined, actor: Actor, days = 365): Promise<void> {
  const run = (running.get(projectId) || Promise.resolve()).catch(() => undefined).then(() => syncNow(projectId, bonding, actor, days));
  running.set(projectId, run);
  void run.catch(() => undefined).finally(() => { if (running.get(projectId) === run) running.delete(projectId); });
  return run;
}

async function syncNow(projectId: string, bonding: Bonding | null | undefined, actor: Actor, days: number) {
  const costs = bondingCosts(bonding, days);
  const existing = await Expense.find({ projectId, source: { $in: KEYS.map((k) => `bonding:${k}`) } });
  const today = new Date().toISOString().slice(0, 10);
  for (const key of KEYS) {
    const want = costs.find((c) => c.key === key);
    const doc = existing.find((e) => e.source === `bonding:${key}`);
    if (!want) {
      // No longer a cost: an expense not yet approved goes; an approved one stays on the record.
      if (doc && doc.approval !== "approved") await doc.deleteOne();
      continue;
    }
    const amount = usd(want.amount);
    if (!doc) {
      await Expense.create({
        projectId, source: `bonding:${key}`, expenseNo: await nextExpenseNo(projectId),
        description: want.description, date: today, qty: "1", amount, remarks: NOTE, vendorName: want.vendor,
        approval: "pending", addedByName: actor.name || "Bonding & letter of credit", addedByEmail: actor.email || "", addedByRole: actor.role || "",
      });
      continue;
    }
    if (doc.amount === amount && doc.description === want.description && doc.vendorName === want.vendor) continue;
    const amountChanged = doc.amount !== amount;
    doc.description = want.description;
    doc.amount = amount;
    doc.vendorName = want.vendor;
    // A different amount is a different expense: it is approved (and signed) again.
    if (amountChanged && doc.approval !== "pending") { doc.approval = "pending"; doc.signatures = []; doc.rejectReason = ""; }
    await doc.save();
  }
}
