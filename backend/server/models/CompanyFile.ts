import mongoose, { Schema, Document } from "mongoose";

// A file in either the Company Documents area (kind "company", filed under a
// CompanyTab) or the Classified Documents area (kind "classified", flat list).
// Uploaded files set `filePath`; seeded dummy files reference a public `url`.
export interface ICompanyFile extends Document {
  kind: "company" | "classified" | "profile";
  tabId: string; // company only — which CompanyTab it belongs to
  folder: string; // CR 306 - the folder inside the tab ("" = the tab itself, "A/B" = B inside A)
  companyId: string; // profile only (CR-P-07) — the Directory Company this file belongs to
  docType: string;   // profile only — catalogue | certification | document | other
  name: string;
  fileType: string;
  size: string;
  filePath: string; // uploads/... for uploaded files
  url: string; // direct URL for seeded/external files (takes precedence)
  description: string;
  uploadedByName: string;
  archived: boolean; // CR-P-39 — hidden from the normal list, restorable from the Archived view
  // Proposal step 4 (item 104; spec 3 and 6) - what the document is (an Appendix Library key such as
  // "appx-sam" or "appx-insurance"), its version and its expiry date, so a proposal can pull in the
  // latest valid one and warn when it is out of date.
  libraryKey: string;
  version: string;
  expiresAt: string; // YYYY-MM-DD, "" when it does not expire
}

const CompanyFileSchema = new Schema<ICompanyFile>(
  {
    kind: { type: String, enum: ["company", "classified", "profile"], default: "company" },
    tabId: { type: String, default: "" },
    folder: { type: String, default: "" },
    companyId: { type: String, default: "", index: true },
    docType: { type: String, default: "document" },
    name: { type: String, required: true },
    fileType: { type: String, default: "" },
    size: { type: String, default: "" },
    filePath: { type: String, default: "" },
    url: { type: String, default: "" },
    description: { type: String, default: "" },
    uploadedByName: { type: String, default: "" },
    archived: { type: Boolean, default: false },
    libraryKey: { type: String, default: "", index: true },
    version: { type: String, default: "" },
    expiresAt: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<ICompanyFile>("CompanyFile", CompanyFileSchema);
