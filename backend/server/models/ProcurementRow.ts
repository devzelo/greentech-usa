import mongoose, { Schema, Document } from "mongoose";

/**
 * One row in a project's Procurement Log.
 * Columns derived from the client's master log: Item #, Item Description, Submittal,
 * Status, Recommended Brand/Supplier, QTY, Unit, Total, Currency, Order Date,
 * Payment, Paid By, Remarks.
 */
export interface IProcurementAttachment {
  name: string;
  filePath: string;
  fileType: string;
  size: string;
}

export interface IProcurementRow extends Document {
  projectId: string;
  itemNo: string;
  description: string;
  submittal: string;
  status: string;
  recommendedBrand: string;
  qty: string;
  unit: string;
  total: string;
  currency: string;
  orderDate: string;
  payment: string;
  paidBy: string;
  remarks: string;
  attachments: IProcurementAttachment[];
  addedById: mongoose.Types.ObjectId | null;
  addedByName: string;
  addedByRole: string;
}

const ProcurementRowSchema = new Schema<IProcurementRow>(
  {
    projectId: { type: String, required: true, index: true },
    itemNo: { type: String, default: "" },
    description: { type: String, default: "" },
    submittal: { type: String, default: "" },
    status: { type: String, default: "" },
    recommendedBrand: { type: String, default: "" },
    qty: { type: String, default: "" },
    unit: { type: String, default: "" },
    total: { type: String, default: "" },
    currency: { type: String, default: "" },
    orderDate: { type: String, default: "" },
    payment: { type: String, default: "" },
    paidBy: { type: String, default: "" },
    remarks: { type: String, default: "" },
    attachments: {
      type: [new Schema<IProcurementAttachment>({
        name: { type: String, default: "" },
        filePath: { type: String, default: "" },
        fileType: { type: String, default: "" },
        size: { type: String, default: "" },
      }, { _id: true })],
      default: [],
    },
    addedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    addedByName: { type: String, default: "" },
    addedByRole: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IProcurementRow>("ProcurementRow", ProcurementRowSchema);
