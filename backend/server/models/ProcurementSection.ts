import mongoose, { Schema, Document } from "mongoose";

// A BOQ section (Electrical, Civil, Mechanical, custom…) within a project's procurement module.
// Items reference a section by its _id. Sections persist even when empty so they can be
// pre-created, renamed, and reordered.
export interface IProcurementSection extends Document {
  projectId: string;
  name: string;
  order: number;
  assignedTo: string;   // CR-B-19 — colleague tagged to edit/review/verify this BOQ section
}

const ProcurementSectionSchema = new Schema<IProcurementSection>(
  {
    projectId: { type: String, required: true, index: true },
    name: { type: String, default: "" },
    order: { type: Number, default: 0 },
    assignedTo: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IProcurementSection>("ProcurementSection", ProcurementSectionSchema);
