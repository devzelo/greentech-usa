import Expense from "../models/Expense";

/**
 * 2026-10-08 - "when you choose the bank fee percentage, it must calculate the bank fee and consider
 * it an expense of the project; also the interest for one year." The bonding figures, as costs:
 *   the bank fee on the bonds        = fee %      x the bonds needed (bid + performance + payment)
 *   one year's interest on the bonds = interest % x the same
 *   the bank fee on the ILOC         = fee %      x the letter of credit's amount
 *   one year's interest on the ILOC  = interest % x the same
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

export function bondingCosts(b?: Bonding | null): BondingCost[] {
  if (!b) return [];
  const out: BondingCost[] = [];
  const bonds = b.bonded === "yes" ? (["bid", "performance", "payment"] as const).filter((k) => b[k]?.required).reduce((s, k) => s + num(b[k]?.amount), 0) : 0;
  const iloc = b.iloc?.required ? num(b.iloc.amount) : 0;
  const add = (key: BondingCost["key"], base: number, pct: string | undefined, what: string, vendor: string) => {
    const p = num(pct);
    const amount = cents((base * p) / 100);
    if (base > 0 && p > 0 && amount > 0) out.push({ key, description: `${what} (${p}% of ${usd(base)})`, amount, vendor });
  };
  add("bond-fee", bonds, b.feePercent, "Bank fee for the bonds", b.bank || "");
  add("bond-interest", bonds, b.interestRate, "Interest on the bonds, one year", b.bank || "");
  add("iloc-fee", iloc, b.iloc?.feePercent, "Bank fee for the letter of credit", b.iloc?.bank || "");
  add("iloc-interest", iloc, b.iloc?.interestRate, "Interest on the letter of credit, one year", b.iloc?.bank || "");
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

export async function syncBondingExpenses(projectId: string, bonding: Bonding | null | undefined, actor: { userId?: string; name?: string; email?: string; role?: string }) {
  const costs = bondingCosts(bonding);
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
        approval: "pending", addedByName: actor.name || "", addedByEmail: actor.email || "", addedByRole: actor.role || "",
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
