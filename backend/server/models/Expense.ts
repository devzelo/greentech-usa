import mongoose, { Schema, Document } from "mongoose";

export interface IExpenseAttachment {
  name: string;
  filePath: string;
  fileType: string;
  size: string;
}

export interface IExpense extends Document {
  projectId: string;
  description: string;
  date: string;
  qty: string;
  amount: string; // unit price
  remarks: string; // replaces the old "category"
  subId: string; // optional subcontractor this expense is attributed to
  invoiceId: string; // set when this expense is a received-invoice payment (excluded from P&L to avoid double-count)
  // Approval workflow: pending by default. Only employees/owners can change it.
  approval: "pending" | "approved" | "rejected";
  attachments: IExpenseAttachment[];
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
    invoiceId: { type: String, default: "" },
    approval: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    attachments: { type: [AttachmentSchema], default: [] },
    addedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    addedByName: { type: String, default: "" },
    addedByEmail: { type: String, default: "" },
    addedByRole: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IExpense>("Expense", ExpenseSchema);
