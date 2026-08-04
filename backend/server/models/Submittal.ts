import mongoose, { Schema, Document } from "mongoose";

// A submittal PACKAGE — one per product submitted to the client for approval. The actual
// content lives on its revisions (SubmittalRevision); this holds the metadata + which
// revision is current. Internal record (the client never sees this table).
export interface ISubmittal extends Document {
  projectId: string;
  itemId: string;        // optional link to a ProcurementItem
  title: string;         // package title (e.g. "Kitchen Cabinet — United")
  productName: string;
  manufacturer: string;
  modelNo: string;       // model / part no. (snapshot from the linked BOQ item)
  specSection: string;   // CSI / spec division
  status: string;        // coarse internal state: Draft | Submitted | Closed
  currentRevisionNo: number;
  addedByName: string;
}

const SubmittalSchema = new Schema<ISubmittal>(
  {
    projectId: { type: String, required: true, index: true },
    itemId: { type: String, default: "", index: true },
    title: { type: String, default: "" },
    productName: { type: String, default: "" },
    manufacturer: { type: String, default: "" },
    modelNo: { type: String, default: "" },
    specSection: { type: String, default: "" },
    status: { type: String, default: "Draft" },
    currentRevisionNo: { type: Number, default: 0 },
    addedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<ISubmittal>("Submittal", SubmittalSchema);
