import mongoose, { Schema, Document } from "mongoose";

// A small generic structured-table row, keyed by (projectId, tableKey). Column semantics live on
// the frontend; here each row just stores a free-form `data` object plus attached files and a
// revision number. First used for Project Info → Amendments & Addenda (client request: a table of
// amendments 1, 2, 3 … with descriptions, dates and revisions), reusable for other simple tables.
export interface IProjectTableFile { _id?: string; name: string; filePath: string; fileType: string; size: string; remarks?: string; folder?: string }
export interface IProjectTableRow extends Document {
  projectId: string;
  tableKey: string;
  order: number;
  revNo: number;
  data: Record<string, string>;
  files: IProjectTableFile[];
  folders: string[];   // named subfolders within this row's files (Closeout "Create folder")
}

const FileSchema = new Schema<IProjectTableFile>({ name: String, filePath: String, fileType: String, size: String, remarks: { type: String, default: "" }, folder: { type: String, default: "" } }, { _id: true });
const ProjectTableSchema = new Schema<IProjectTableRow>(
  {
    projectId: { type: String, required: true, index: true },
    tableKey: { type: String, required: true, index: true },
    order: { type: Number, default: 0 },
    revNo: { type: Number, default: 0 },
    data: { type: Schema.Types.Mixed, default: {} },
    files: { type: [FileSchema], default: [] },
    folders: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<IProjectTableRow>("ProjectTable", ProjectTableSchema);
