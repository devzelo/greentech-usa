import mongoose, { Schema, Document } from "mongoose";

// A named agreement with a subcontractor. Replaces the old offers/agreements split — one agreement
// bundles a name, a description, and several documents (the agreement doc, the offer doc, and any
// other supporting files). A subcontractor can have many agreements.
export interface ISubAgreementDoc { kind: "agreement" | "offer" | "other"; name: string; filePath: string; fileType: string; size: string }
export interface ISubAgreement extends Document {
  projectId: string;
  subId: string;
  name: string;
  description: string;
  documents: ISubAgreementDoc[];
}

const DocSchema = new Schema<ISubAgreementDoc>({
  kind: { type: String, enum: ["agreement", "offer", "other"], default: "other" },
  name: String, filePath: String, fileType: String, size: String,
}, { _id: true });

const SubAgreementSchema = new Schema<ISubAgreement>(
  {
    projectId: { type: String, required: true, index: true },
    subId: { type: String, required: true, index: true },
    name: { type: String, default: "" },
    description: { type: String, default: "" },
    documents: { type: [DocSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<ISubAgreement>("SubAgreement", SubAgreementSchema);
