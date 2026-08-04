import mongoose, { Schema, Document } from "mongoose";

export interface IPurchaseOrder extends Document {
  projectId: string;
  poNumber: string;
  vendor: string;
  amount: string;
  date: string;
  status: string;
}

const PurchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    projectId: { type: String, required: true, index: true },
    poNumber: { type: String, default: "" },
    vendor: { type: String, default: "" },
    amount: { type: String, default: "$0.00" },
    date: { type: String, default: "" },
    status: { type: String, default: "Draft" },
  },
  { timestamps: true }
);

export default mongoose.model<IPurchaseOrder>("PurchaseOrder", PurchaseOrderSchema);
