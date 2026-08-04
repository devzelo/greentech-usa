import mongoose, { Schema, Document } from "mongoose";

// The canonical procurement item (one per BOQ line). Submittals, RFQs, vendor quotes,
// purchase orders and invoices all reference this item; the Master Log is a derived view
// over these records. Items are never silently deleted in normal use — they are CANCELLED
// (status="Cancelled", with a reason) so the record survives for claims. Every change is
// also written to ProcurementEvent (append-only).
export type ProcurementStatus =
  | "BOQ" | "RFQ_Sent" | "Quoted" | "PO_Sent" | "Invoiced"
  | "Ordered" | "Fabrication" | "Transit" | "OnSite" | "Complete" | "Cancelled";

export interface IProcurementItem extends Document {
  projectId: string;
  sectionId: string;        // ProcurementSection._id (string)
  itemNo: string;           // human reference within the section (1, 2, 1.1 …)
  description: string;
  manufacturer: string;     // brand
  modelNo: string;
  qty: string;
  unit: string;
  spec: string;             // size / colour / spec note
  needOnSiteDate: string;   // required-on-site deadline (date string)
  leadTimeDays: string;     // procurement lead time (days) — order-by date = need − lead
  status: ProcurementStatus;
  vendorName: string;       // the accepted vendor (set when an RFQ quote is awarded)
  revNo: number;            // I2 — current revision number (0-based); bumps when a tracked field changes
  cancelledAt: Date | null;
  cancelledBy: string;
  cancellationReason: string;
  addedById: string;
  addedByName: string;
  addedByRole: string;
}

const ProcurementItemSchema = new Schema<IProcurementItem>(
  {
    projectId: { type: String, required: true, index: true },
    sectionId: { type: String, default: "", index: true },
    itemNo: { type: String, default: "" },
    description: { type: String, default: "" },
    manufacturer: { type: String, default: "" },
    modelNo: { type: String, default: "" },
    qty: { type: String, default: "" },
    unit: { type: String, default: "" },
    spec: { type: String, default: "" },
    needOnSiteDate: { type: String, default: "" },
    leadTimeDays: { type: String, default: "" },
    status: {
      type: String,
      enum: ["BOQ", "RFQ_Sent", "Quoted", "PO_Sent", "Invoiced", "Ordered", "Fabrication", "Transit", "OnSite", "Complete", "Cancelled"],
      default: "BOQ",
    },
    vendorName: { type: String, default: "" },
    revNo: { type: Number, default: 0 },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, default: "" },
    cancellationReason: { type: String, default: "" },
    addedById: { type: String, default: "" },
    addedByName: { type: String, default: "" },
    addedByRole: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IProcurementItem>("ProcurementItem", ProcurementItemSchema);
