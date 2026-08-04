import mongoose, { Schema, Document } from "mongoose";

// A description attached to a *folder* in the Documents module. Folders there are virtual
// (a project, a tab, or a section group derived from the uploaded documents), so there is no
// record to hang a description on — this store provides one, keyed by (projectId, folderKey).
// folderKey encodes the level: "project" | "tab:<tabId>" | "group:<groupKey>".
export interface IFolderNote extends Document {
  projectId: string;
  folderKey: string;
  description: string;
}

const FolderNoteSchema = new Schema<IFolderNote>(
  {
    projectId: { type: String, required: true, index: true },
    folderKey: { type: String, required: true },
    description: { type: String, default: "" },
  },
  { timestamps: true }
);
FolderNoteSchema.index({ projectId: 1, folderKey: 1 }, { unique: true });

export default mongoose.model<IFolderNote>("FolderNote", FolderNoteSchema);
