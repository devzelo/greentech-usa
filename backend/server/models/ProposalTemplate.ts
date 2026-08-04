import mongoose, { Schema, Document } from "mongoose";

// A reusable proposal template. Built-ins are seeded and cannot be deleted; users can
// save the current proposal as a template and apply/modify it later. `content` is a
// flexible snapshot (either a full ProposalContent, or a built-in scaffold with
// { letterhead, sectionTitles }).
export interface IProposalTemplate extends Document {
  name: string;
  description: string;
  builtin: boolean;
  createdById: mongoose.Types.ObjectId | null;
  createdByName: string;
  content: Record<string, unknown>;
}

const ProposalTemplateSchema = new Schema<IProposalTemplate>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    builtin: { type: Boolean, default: false },
    createdById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdByName: { type: String, default: "" },
    content: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model<IProposalTemplate>("ProposalTemplate", ProposalTemplateSchema);
