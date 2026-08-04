import mongoose, { Schema, Document } from "mongoose";

// Append-only audit log for the procurement module. Every meaningful change (item created,
// cancelled, restored, status changed, revision added, RFQ/PO sent…) writes one row here.
// This is the claims artifact — there is intentionally NO update/delete route for it.
export interface IProcurementEvent extends Document {
  projectId: string;
  entityType: string;   // "item" | "submittal" | "rfq" | "po" | "invoice"
  entityId: string;
  action: string;       // "created" | "cancelled" | "restored" | "status" | "updated" | …
  fromValue: string;
  toValue: string;
  actorId: string;
  actorName: string;
}

const ProcurementEventSchema = new Schema<IProcurementEvent>(
  {
    projectId: { type: String, required: true, index: true },
    entityType: { type: String, default: "item" },
    entityId: { type: String, default: "", index: true },
    action: { type: String, default: "" },
    fromValue: { type: String, default: "" },
    toValue: { type: String, default: "" },
    actorId: { type: String, default: "" },
    actorName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IProcurementEvent>("ProcurementEvent", ProcurementEventSchema);
