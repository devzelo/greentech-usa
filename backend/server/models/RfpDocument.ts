import mongoose, { Schema, Document } from "mongoose";

// An uploaded solicitation (RFP/RFQ/SOW/Specification) with a structured outline of
// sections (jump/bookmark) and an extracted requirements checklist.
export interface IRfpSection { id: string; title: string; notes: string; bookmarked: boolean }
export interface IRfpRequirement { id: string; text: string; done: boolean }

export interface IRfpDocument extends Document {
  title: string;
  docType: string; // RFP | RFQ | SOW | Specification | Other
  fileName: string;
  filePath: string;
  fileType: string;
  size: string;
  sections: IRfpSection[];
  requirements: IRfpRequirement[];
  createdById: mongoose.Types.ObjectId | null;
  createdByName: string;
}

const RfpDocumentSchema = new Schema<IRfpDocument>(
  {
    title: { type: String, required: true },
    docType: { type: String, default: "RFP", index: true },
    fileName: { type: String, default: "" },
    filePath: { type: String, default: "" },
    fileType: { type: String, default: "" },
    size: { type: String, default: "" },
    sections: [{ id: String, title: String, notes: String, bookmarked: { type: Boolean, default: false } }],
    requirements: [{ id: String, text: String, done: { type: Boolean, default: false } }],
    createdById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IRfpDocument>("RfpDocument", RfpDocumentSchema);
