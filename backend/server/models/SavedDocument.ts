import mongoose, { Schema, Document } from "mongoose";

// A frozen, versioned copy of a produced document (the exact PDF/Excel that was generated).
// Project-scoped docs (proposal/boq/rfq/po) carry projectId; resume versions carry userId.
// `refId` pins a version to a specific record when there are many per project (a given RFQ or PO).
// Version numbers auto-increment within a (scope + kind + refId) stream.
export type SavedDocKind = "proposal" | "boq" | "rfq" | "po" | "resume";

export interface ISavedDocument extends Document {
  kind: SavedDocKind;
  projectId: string;
  userId: mongoose.Types.ObjectId | null;
  refId: string;
  version: number;
  title: string;
  note: string;
  status: "draft" | "final"; // "final" = the copy sent to the client
  fileName: string;
  filePath: string;
  fileType: string;
  size: string;
  createdById: mongoose.Types.ObjectId | null;
  createdByName: string;
}

const SavedDocumentSchema = new Schema<ISavedDocument>(
  {
    kind: { type: String, enum: ["proposal", "boq", "rfq", "po", "resume"], required: true, index: true },
    projectId: { type: String, default: "", index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    refId: { type: String, default: "" },
    version: { type: Number, default: 1 },
    title: { type: String, default: "" },
    note: { type: String, default: "" },
    status: { type: String, enum: ["draft", "final"], default: "draft" },
    fileName: { type: String, default: "" },
    filePath: { type: String, default: "" },
    fileType: { type: String, default: "" },
    size: { type: String, default: "" },
    createdById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<ISavedDocument>("SavedDocument", SavedDocumentSchema);
