import mongoose, { Schema, Document } from "mongoose";

// A file in either the Company Documents area (kind "company", filed under a
// CompanyTab) or the Classified Documents area (kind "classified", flat list).
// Uploaded files set `filePath`; seeded dummy files reference a public `url`.
export interface ICompanyFile extends Document {
  kind: "company" | "classified";
  tabId: string; // company only — which CompanyTab it belongs to
  name: string;
  fileType: string;
  size: string;
  filePath: string; // uploads/... for uploaded files
  url: string; // direct URL for seeded/external files (takes precedence)
  description: string;
  uploadedByName: string;
}

const CompanyFileSchema = new Schema<ICompanyFile>(
  {
    kind: { type: String, enum: ["company", "classified"], default: "company" },
    tabId: { type: String, default: "" },
    name: { type: String, required: true },
    fileType: { type: String, default: "" },
    size: { type: String, default: "" },
    filePath: { type: String, default: "" },
    url: { type: String, default: "" },
    description: { type: String, default: "" },
    uploadedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<ICompanyFile>("CompanyFile", CompanyFileSchema);
