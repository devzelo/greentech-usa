import type { ApiInvoice } from "./api";

/**
 * CR-P (167)/(168) — the payment application of an invoice: the contract it bills against, what was
 * invoiced on that contract before it, this invoice, and the balance to finish, with the history
 * row by row (invoice 9001: 150,000, balance 600,000; 9002: 400,000, balance 200,000; …).
 *
 * Invoices belong to the same contract when they bill the same thing: the project's contract (to
 * the client), the same agreement, or (a value typed in) the same receiver.
 */

const n = (s?: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const NOT_BILLED = ["Cancelled", "Canceled", "Rejected"];

export const invoiceTotal = (inv: Pick<ApiInvoice, "lineItems" | "amount">) =>
  (inv.lineItems || []).length ? (inv.lineItems || []).reduce((s, it) => s + n(it.qty) * n(it.unitPrice), 0) : n(inv.amount);

export function contractKey(inv: Pick<ApiInvoice, "contractRef" | "companyId" | "party">): string {
  const r = inv.contractRef;
  if (r?.source === "project") return "project";
  if (r?.source === "agreement" && r.agreementId) return `agr:${r.agreementId}`;
  return `manual:${(inv.companyId || inv.party || "").trim().toLowerCase()}`;
}

// Earlier invoice first: by number (9001, 9002 …), then by date.
const order = (a: Pick<ApiInvoice, "number" | "date">, b: Pick<ApiInvoice, "number" | "date">) =>
  (n(a.number) - n(b.number)) || String(a.date || "").localeCompare(String(b.date || ""));

export interface PayAppRow { id: string; number: string; date: string; contract: number; previous: number; thisInvoice: number; balance: number; current: boolean }
export interface PayApp { contract: number; previous: number; thisInvoice: number; balance: number; rows: PayAppRow[] }

export function payApplication(inv: ApiInvoice, all: ApiInvoice[], thisAmount = invoiceTotal(inv)): PayApp {
  const key = contractKey(inv);
  const contract = n(inv.contractTotal);
  const earlier = all
    .filter((x) => x._id !== inv._id && x.type === inv.type && !x.isTemplate && !NOT_BILLED.includes(x.status || "") && contractKey(x) === key && order(x, inv) < 0)
    .sort(order);
  let running = 0;
  const rows: PayAppRow[] = [...earlier, inv].map((x) => {
    const amount = x._id === inv._id ? thisAmount : invoiceTotal(x);
    const value = x._id === inv._id ? contract : n(x.contractTotal) || contract;
    const previous = running;
    running += amount;
    return { id: x._id, number: x.number, date: x.date, contract: value, previous, thisInvoice: amount, balance: value - running, current: x._id === inv._id };
  });
  const previous = rows[rows.length - 1]?.previous || 0;
  return { contract, previous, thisInvoice: thisAmount, balance: contract - previous - thisAmount, rows };
}
