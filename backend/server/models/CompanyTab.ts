import mongoose, { Schema, Document } from "mongoose";

// A folder in the Company Documents area. Top-level tabs have parentId "";
// sub-tabs reference their parent's tabId. `system` marks the pre-defined tabs.
export interface ICompanyTab extends Document {
  tabId: string;
  label: string;
  parentId: string;
  order: number;
  system: boolean;
  kind: string; // "company" | "classified" (legacy docs without it = company)
  /** CR 306 - folders made inside the tab ("A", "A/B"); a folder holding files needs no entry. */
  folders: string[];
}

const CompanyTabSchema = new Schema<ICompanyTab>(
  {
    tabId: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    parentId: { type: String, default: "" },
    order: { type: Number, default: 0 },
    system: { type: Boolean, default: false },
    kind: { type: String, default: "company", index: true },
    folders: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<ICompanyTab>("CompanyTab", CompanyTabSchema);
