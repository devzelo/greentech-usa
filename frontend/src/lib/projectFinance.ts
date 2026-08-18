import { invoicePaid, type ApiExpense, type ApiInvoice, type ProjectFinancials } from "./api";

// CR-P-15 — the five-number financial overview shown on each project header, the All Projects
// totals bar, and (approved/pending) on the Expenses tab. One source of truth so the numbers and
// their NAMES are identical everywhere.
const n = (s: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const NON_REVENUE = ["Draft", "Cancelled", "Canceled", "Rejected"];
const invTotal = (inv: ApiInvoice) =>
  (inv.lineItems?.length ? inv.lineItems.reduce((s, it) => s + n(it.qty) * n(it.unitPrice), 0) : n(inv.amount));

export interface FiveNumbers {
  approvedExpenses: number;
  pendingExpenses: number;
  incomeReceived: number;
  remainingIncome: number;
  estimatedProfit: number;
}

const ZERO: FiveNumbers = { approvedExpenses: 0, pendingExpenses: 0, incomeReceived: 0, remainingIncome: 0, estimatedProfit: 0 };

// Compute the five numbers from the raw rows a project workspace already holds (live).
export function fiveFromRaw(expenses: ApiExpense[], sentInvoices: ApiInvoice[]): FiveNumbers {
  let approvedExpenses = 0, pendingExpenses = 0;
  for (const e of expenses) {
    const val = (n(e.qty) || 1) * n(e.amount);
    if (e.approval === "approved") approvedExpenses += val;
    else if (e.approval !== "rejected") pendingExpenses += val;   // pending (default); rejected ignored
  }
  let totalInvoiced = 0, incomeReceived = 0;
  for (const inv of sentInvoices) {
    if (NON_REVENUE.includes(inv.status || "")) continue;
    totalInvoiced += invTotal(inv);
    incomeReceived += invoicePaid(inv);
  }
  const remainingIncome = Math.max(0, totalInvoiced - incomeReceived);
  const estimatedProfit = totalInvoiced - (approvedExpenses + pendingExpenses);
  return { approvedExpenses, pendingExpenses, incomeReceived, remainingIncome, estimatedProfit };
}

// Same five numbers from the /projects/financials aggregate (used on All Projects, which doesn't
// load per-project rows).
export function fiveFromFinancials(f?: ProjectFinancials): FiveNumbers {
  const approvedExpenses = f?.approvedExpenses || 0;
  const pendingExpenses = f?.pendingExpenses || 0;
  const incomeReceived = f?.incomeReceived || 0;
  const remainingIncome = f?.remainingIncome || 0;
  const totalInvoiced = f?.totalInvoiced ?? (incomeReceived + remainingIncome);
  const estimatedProfit = totalInvoiced - (approvedExpenses + pendingExpenses);
  return { approvedExpenses, pendingExpenses, incomeReceived, remainingIncome, estimatedProfit };
}

export function sumFive(list: FiveNumbers[]): FiveNumbers {
  return list.reduce((a, f) => ({
    approvedExpenses: a.approvedExpenses + f.approvedExpenses,
    pendingExpenses: a.pendingExpenses + f.pendingExpenses,
    incomeReceived: a.incomeReceived + f.incomeReceived,
    remainingIncome: a.remainingIncome + f.remainingIncome,
    estimatedProfit: a.estimatedProfit + f.estimatedProfit,
  }), { ...ZERO });
}

// The canonical labels + colour tones — same names in every place they're shown.
export const FIVE_META: { key: keyof FiveNumbers; label: string; tone: "rose" | "amber" | "emerald" | "blue" | "primary" }[] = [
  { key: "approvedExpenses", label: "Approved Expenses", tone: "rose" },
  { key: "pendingExpenses", label: "Pending Expenses", tone: "amber" },
  { key: "incomeReceived", label: "Income Received", tone: "emerald" },
  { key: "remainingIncome", label: "Remaining Income", tone: "blue" },
  { key: "estimatedProfit", label: "Estimated Profit", tone: "primary" },
];

export const fmtMoney = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
