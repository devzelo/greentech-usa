import mongoose, { Schema, Document } from "mongoose";

export interface IExpenseAttachment {
  name: string;
  filePath: string;
  fileType: string;
  size: string;
  itemIds?: string[];   // CR 340 - the lines this file belongs to (none: the whole expense)
}

// CR-P (154) — one expense can hold several items (laptop, mouse, 4 monitors …).
// CR 331 - each item is booked to an account of the chart (lib/expenseCategories), set by GreenTech staff only.
// CR 340 - each item has an id (its files point to it) and a remark of its own.
// CR 341 - each line is reviewed on its own: pending, approved or rejected (with why).
export interface IExpenseItem { id: string; description: string; qty: string; unit: string; unitPrice: string; category: string; remark: string; status: "pending" | "approved" | "rejected"; rejectReason: string }
// CR-P (157) — the conversation on an expense (e.g. why it was rejected, "receipt added").
export interface IExpenseComment { userId: string; authorName: string; text: string; mentions: string[]; at: Date }

export interface IExpense extends Document {
  projectId: string;
  description: string;
  date: string;
  qty: string;
  amount: string; // unit price
  remarks: string; // replaces the old "category"
  subId: string; // optional subcontractor this expense is attributed to
  workPackageId: string; // CR 328 - optional work package this expense is spent on
  invoiceId: string; // set when this expense is a received-invoice payment (excluded from P&L to avoid double-count)
  source: string;    // 2026-10-08 - made by the app, e.g. "bonding:bond-fee" (kept in step with its figures)
  // Approval workflow: pending by default. Only employees/owners can change it.
  approval: "pending" | "approved" | "rejected";
  attachments: IExpenseAttachment[];
  items: IExpenseItem[];        // CR-P (154) — when set, qty is 1 and amount is the items' total
  rejectReason: string;         // CR-P (156) — required when rejected
  comments: IExpenseComment[];  // CR-P (157)
  historic: boolean;            // CR-P (158) — past expenses recorded in bulk, already approved and paid
  // CR 340 (GT Comments 4, the GT "Add Expense" form): its number, the invoice / receipt and PO it
  // goes with, the vendor (from the Directory), the currency it was paid in and the rate to USD.
  // `amount` stays in USD (every total reads it); `totalOriginal` is the total in the currency paid.
  expenseNo: string;
  receiptNo: string;
  poNo: string;
  vendorName: string;
  vendorCompanyId: string;
  currency: string;
  exchangeRate: string;
  totalOriginal: string;
  reference: string;            // CR 341 - the vendor's own reference
  draft: boolean;               // CR 340 / 341 - saved, not yet submitted: in no total, not for approval
  // CR 339 (GT Comments 4) - "if approved, manager signature is needed. If it's JV, 2 signatures are
  // needed, one from each partner." Approving is signing; the expense is approved once every side
  // the project needs has signed (GreenTech; and the partner on a joint venture).
  signatures: Array<{ side: "gt" | "partner"; userId: string; name: string; title: string; signatureUrl: string; at: Date; appliedById: string; appliedByName: string }>;
  // Who added this row (employee or subcontractor) — stamped from their profile.
  addedById: mongoose.Types.ObjectId | null;
  addedByName: string;
  addedByEmail: string;
  addedByRole: string;
}

const AttachmentSchema = new Schema<IExpenseAttachment>(
  {
    name: { type: String, default: "" },
    filePath: { type: String, default: "" },
    fileType: { type: String, default: "" },
    size: { type: String, default: "" },
    itemIds: { type: [String], default: [] },
  },
  { _id: true }
);

const ExpenseSchema = new Schema<IExpense>(
  {
    projectId: { type: String, required: true, index: true },
    description: { type: String, default: "" },
    date: { type: String, default: "" },
    qty: { type: String, default: "1" },
    amount: { type: String, default: "$0.00" },
    remarks: { type: String, default: "" },
    subId: { type: String, default: "" },
    workPackageId: { type: String, default: "" },
    invoiceId: { type: String, default: "" },
    source: { type: String, default: "", index: true },
    approval: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    attachments: { type: [AttachmentSchema], default: [] },
    items: {
      type: [{ id: { type: String, default: "" }, description: { type: String, default: "" }, qty: { type: String, default: "1" }, unit: { type: String, default: "" }, unitPrice: { type: String, default: "" }, category: { type: String, default: "" }, remark: { type: String, default: "" }, status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" }, rejectReason: { type: String, default: "" }, _id: false }],
      default: [],
    },
    rejectReason: { type: String, default: "" },
    comments: {
      type: [{ userId: { type: String, default: "" }, authorName: { type: String, default: "" }, text: { type: String, default: "" }, mentions: { type: [String], default: [] }, at: { type: Date, default: Date.now } }],
      default: [],
    },
    historic: { type: Boolean, default: false },
    expenseNo: { type: String, default: "" },
    receiptNo: { type: String, default: "" },
    poNo: { type: String, default: "" },
    vendorName: { type: String, default: "" },
    vendorCompanyId: { type: String, default: "" },
    currency: { type: String, default: "USD" },
    exchangeRate: { type: String, default: "" },
    totalOriginal: { type: String, default: "" },
    reference: { type: String, default: "" },
    draft: { type: Boolean, default: false },
    signatures: {
      type: [{ side: { type: String, enum: ["gt", "partner"] }, userId: { type: String, default: "" }, name: { type: String, default: "" }, title: { type: String, default: "" }, signatureUrl: { type: String, default: "" }, at: { type: Date, default: Date.now }, appliedById: { type: String, default: "" }, appliedByName: { type: String, default: "" }, _id: false }],
      default: [],
    },
    addedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    addedByName: { type: String, default: "" },
    addedByEmail: { type: String, default: "" },
    addedByRole: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IExpense>("Expense", ExpenseSchema);
