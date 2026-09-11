import mongoose, { Schema, Document } from "mongoose";

export interface IProjectDocument extends Document {
  projectId: string;
  section: string;
  name: string;
  fileType: string;
  size: string;
  filePath: string;
  description: string; // per-file note (e.g. "Appendix A", "Attachment C")
  public: boolean; // shown on the project's public showcase modal
  archived: boolean; // hidden from the default list; restorable (client CR-P-10)
  // CR-P (131) — the folder the file sits in within its section ("" = top level; subfolders are
  // "/"-separated, e.g. "Drawings and Specs/Specs"). Kept when a whole folder is uploaded.
  folder: string;
  uploadedAt: Date;
}

const ProjectDocumentSchema = new Schema<IProjectDocument>({
  projectId: { type: String, required: true, index: true },
  section: { type: String, required: true },
  name: { type: String, required: true },
  fileType: { type: String, default: "pdf" },
  size: { type: String, default: "" },
  filePath: { type: String, required: true },
  description: { type: String, default: "" },
  public: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
  folder: { type: String, default: "" },
  uploadedAt: { type: Date, default: Date.now },
});

export default mongoose.model<IProjectDocument>("ProjectDocument", ProjectDocumentSchema);
