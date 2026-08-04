import mongoose, { Schema, Document } from "mongoose";

// A saved snapshot of a project's proposal content. Versions are never overwritten;
// an "archived" revision marks a submitted/final version.
export interface IProposalRevision extends Document {
  projectId: string;
  label: string;
  note: string;
  archived: boolean;
  content: Record<string, unknown>; // full ProposalContent snapshot
  createdById: mongoose.Types.ObjectId | null;
  createdByName: string;
}

const ProposalRevisionSchema = new Schema<IProposalRevision>(
  {
    projectId: { type: String, required: true, index: true },
    label: { type: String, default: "" },
    note: { type: String, default: "" },
    archived: { type: Boolean, default: false },
    content: { type: Schema.Types.Mixed, default: {} },
    createdById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IProposalRevision>("ProposalRevision", ProposalRevisionSchema);
