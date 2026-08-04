import mongoose, { Schema, Document } from "mongoose";

// A single invoice line for a subcontractor (Subcontractors → Invoices tab).
// Mirrors the Expense row shape (description / amount / remarks / date + attachments).
export interface ISubInvoiceAttachment { name: string; filePath: string; fileType: string; size: string }

export type SubInvoiceApproval = "pending" | "approved" | "rejected";

export interface ISubInvoice extends Document {
  projectId: string;
  subId: string;        // which subcontractor this invoice belongs to
  description: string;
  amount: string;
  remarks: string;
  date: string;
  approval: SubInvoiceApproval; // client approval state (employee-set; default pending)
  attachments: ISubInvoiceAttachment[];
  addedByName: string;
}

const AttachmentSchema = new Schema<ISubInvoiceAttachment>(
  { name: { type: String, default: "" }, filePath: { type: String, default: "" }, fileType: { type: String, default: "" }, size: { type: String, default: "" } },
  { _id: true }
);

const SubInvoiceSchema = new Schema<ISubInvoice>(
  {
    projectId: { type: String, required: true, index: true },
    subId: { type: String, required: true, index: true },
    description: { type: String, default: "" },
    amount: { type: String, default: "" },
    remarks: { type: String, default: "" },
    date: { type: String, default: "" },
    approval: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    attachments: { type: [AttachmentSchema], default: [] },
    addedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<ISubInvoice>("SubInvoice", SubInvoiceSchema);
