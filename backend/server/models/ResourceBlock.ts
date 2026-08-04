import mongoose, { Schema, Document } from "mongoose";

// A reusable content block for proposals (methodology, company description, safety plan,
// equipment list, standard text, reference letter, etc.). Company-wide library.
export interface IResourceBlock extends Document {
  title: string;
  category: string;
  body: string; // HTML (from the rich-text editor)
  createdById: mongoose.Types.ObjectId | null;
  createdByName: string;
}

const ResourceBlockSchema = new Schema<IResourceBlock>(
  {
    title: { type: String, required: true },
    category: { type: String, default: "Other", index: true },
    body: { type: String, default: "" },
    createdById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IResourceBlock>("ResourceBlock", ResourceBlockSchema);
