import mongoose, { Schema, Document } from "mongoose";

// CR-P (131) — a folder inside a project's document section (e.g. RFP > Solicitation Documents >
// "Drawings and Specs"). Files carry the folder path themselves (ProjectDocument.folder); this
// record gives the folder its description and lets it exist while still empty.
export interface IDocumentFolder extends Document {
  projectId: string;
  section: string;
  path: string;          // "/"-separated, e.g. "Drawings and Specs/Specs"
  description: string;
  createdAt: Date;
}

const DocumentFolderSchema = new Schema<IDocumentFolder>(
  {
    projectId: { type: String, required: true, index: true },
    section: { type: String, required: true },
    path: { type: String, required: true },
    description: { type: String, default: "" },
  },
  { timestamps: true },
);
DocumentFolderSchema.index({ projectId: 1, section: 1, path: 1 }, { unique: true });

export default mongoose.model<IDocumentFolder>("DocumentFolder", DocumentFolderSchema);
