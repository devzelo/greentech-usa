import mongoose, { Schema, Document } from "mongoose";

// An invoice on a project, in one of two directions:
//   type "sent"     — we invoiced the client (money in)
//   type "received" — a vendor / subcontractor billed us (money out)
//
// Invoices carry PAYMENTS: each payment records how much was paid, when, how, and the receipt.
// "Paid so far" and "remaining" are derived from those payments, so partial payments are real.
// A received invoice can be linked back to the Procurement PO it came from (poId), and every
// payment on a received invoice posts a linked Expense so the money reaches the Expenses tab.
export interface IInvoiceFile { name: string; filePath: string; fileType: string; size: string }

export interface IInvoicePayment {
  amount: string;
  date: string;
  method: string;          // Bank transfer, Cheque, Cash …
  reference: string;       // transfer / cheque reference
  notes: string;           // proof, remarks, description
  attachments: IInvoiceFile[];  // the receipt
  expenseId: string;       // the Expense row this payment created (received invoices)
  addedByName: string;
}

export interface IInvoice extends Document {
  projectId: string;
  type: "sent" | "received";
  number: string;
  party: string;           // client (sent) or vendor / subcontractor (received)
  amount: string;          // the invoice total
  date: string;
  status: string;
  description: string;
  // Where this invoice came from, when it wasn't typed in by hand.
  poId: string;            // ProcurementPO._id — set when raised from a PO's vendor invoice
  subId: string;           // subcontractor record, when it's a sub's bill
  attachments: IInvoiceFile[];
  payments: IInvoicePayment[];
  addedByName: string;
}

const FileSchema = new Schema<IInvoiceFile>({ name: String, filePath: String, fileType: String, size: String }, { _id: true });

const PaymentSchema = new Schema<IInvoicePayment>({
  amount: { type: String, default: "" },
  date: { type: String, default: "" },
  method: { type: String, default: "" },
  reference: { type: String, default: "" },
  notes: { type: String, default: "" },
  attachments: { type: [FileSchema], default: [] },
  expenseId: { type: String, default: "" },
  addedByName: { type: String, default: "" },
}, { _id: true, timestamps: true });

const InvoiceSchema = new Schema<IInvoice>(
  {
    projectId: { type: String, required: true, index: true },
    type: { type: String, enum: ["sent", "received"], required: true, index: true },
    number: { type: String, default: "" },
    party: { type: String, default: "" },
    amount: { type: String, default: "" },
    date: { type: String, default: "" },
    status: { type: String, default: "Draft" },
    description: { type: String, default: "" },
    poId: { type: String, default: "", index: true },
    subId: { type: String, default: "" },
    attachments: { type: [FileSchema], default: [] },
    payments: { type: [PaymentSchema], default: [] },
    addedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IInvoice>("Invoice", InvoiceSchema);

// Shared money helpers — amounts are free-text strings across this codebase ("$1,200.00").
export const num = (s: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
export const paidTotal = (inv: { payments?: Array<{ amount?: string }> }) =>
  (inv.payments || []).reduce((sum, p) => sum + num(p.amount), 0);
export const remainingTotal = (inv: { amount?: string; payments?: Array<{ amount?: string }> }) =>
  Math.max(0, num(inv.amount) - paidTotal(inv));

// Status derived from the payments — keeps the badge honest without manual bookkeeping.
// Disputed / Cancelled are deliberate states and are never overridden. "Draft" is only
// protected while nothing has been paid: once money has moved, the badge must reflect it.
export function derivedStatus(inv: { type?: string; amount?: string; status?: string; payments?: Array<{ amount?: string }> }): string {
  const total = num(inv.amount);
  const paid = paidTotal(inv);
  if (["Disputed", "Cancelled"].includes(inv.status || "")) return inv.status as string;
  if (inv.status === "Draft" && paid === 0) return "Draft";
  if (total > 0 && paid >= total) return "Paid";
  if (paid > 0) return "Partially Paid";
  // Nothing paid — never keep a stale "Paid"/"Partially Paid" from before the payments were removed.
  if (["Paid", "Partially Paid", "Draft"].includes(inv.status || "")) return inv.type === "sent" ? "Sent" : "Unpaid";
  return inv.status || "Unpaid";
}
