import mongoose, { Schema, Document } from "mongoose";

// CR-P-26 — a platform-wide recycle bin. Deleting a supported record MOVES a snapshot here instead
// of erasing it; restore re-creates the record from `data` (+ `extra` for related rows). Files are
// kept on disk until the entry is permanently purged.
export interface IRecycleBin extends Document {
  kind: string;              // "project" | "agreement" | "document" | "submittal" | …
  refId: string;             // original id (business key or _id) for display / de-dupe
  projectId: string;         // owning project (for scope / badge); "" if global
  projectName: string;
  name: string;              // display title
  subtitle: string;
  data: unknown;             // the original document (restored via Model.create)
  extra: unknown;            // related rows (e.g. submittal revisions)
  files: Array<{ filePath: string }>; // files to purge on permanent delete
  deletedById: string;
  deletedByName: string;
}

const RecycleBinSchema = new Schema<IRecycleBin>(
  {
    kind: { type: String, required: true, index: true },
    refId: { type: String, default: "" },
    projectId: { type: String, default: "", index: true },
    projectName: { type: String, default: "" },
    name: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    data: { type: Schema.Types.Mixed },
    extra: { type: Schema.Types.Mixed, default: null },
    files: { type: [{ filePath: String }], default: [] },
    deletedById: { type: String, default: "" },
    deletedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IRecycleBin>("RecycleBin", RecycleBinSchema);
