import mongoose, { Schema, Document } from "mongoose";

// A frozen snapshot of a ProcurementItem's tracked fields, captured each time one of those
// fields changes (I2). The live item is always the CURRENT revision (item.revNo); each snapshot
// here is a PREVIOUS state, kept for the inline revision history + claims. Never edited/deleted.
export interface IProcurementItemRevision extends Document {
  projectId: string;
  itemId: string;
  revNo: number;            // the revision number this snapshot represents (its old state)
  description: string;
  manufacturer: string;
  modelNo: string;
  qty: string;
  unit: string;
  spec: string;
  needOnSiteDate: string;
  leadTimeDays: string;
  status: string;
  changedFields: string[];  // which fields changed to move ON from this revision
  note: string;             // human note for status changes, e.g. "Cancelled: client dropped the kitchen"
  actorName: string;
  createdAt: Date;
}

const ProcurementItemRevisionSchema = new Schema<IProcurementItemRevision>(
  {
    projectId: { type: String, required: true, index: true },
    itemId: { type: String, required: true, index: true },
    revNo: { type: Number, default: 0 },
    description: { type: String, default: "" },
    manufacturer: { type: String, default: "" },
    modelNo: { type: String, default: "" },
    qty: { type: String, default: "" },
    unit: { type: String, default: "" },
    spec: { type: String, default: "" },
    needOnSiteDate: { type: String, default: "" },
    leadTimeDays: { type: String, default: "" },
    status: { type: String, default: "" },
    changedFields: { type: [String], default: [] },
    note: { type: String, default: "" },
    actorName: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model<IProcurementItemRevision>("ProcurementItemRevision", ProcurementItemRevisionSchema);
