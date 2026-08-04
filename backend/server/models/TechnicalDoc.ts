import mongoose, { Schema, Document } from "mongoose";

// The Technical Docs module (client request, image.png). Two tables:
//   kind "drawing" — a submittal row: submittal stage + revision, with several file buckets
//                    (drawing PDFs, drawing DWGs, specifications, reports, other docs), a status,
//                    remarks, and the client's response (comments + returned files) on approval/
//                    rejection. Rejection → raise a new revision row and resubmit.
//   kind "other"   — a simpler row: revision + description + files + remarks.
// Each file carries its own remarks. A ZIP export bundles the drawing submittals folder-by-folder.
export type TechDocKind = "drawing" | "other";
export type TechDocStatus = "Pending" | "Approved" | "ApprovedAsNoted" | "Rejected";

// The submittal stages offered in the drawing table's dropdown (Prebid → 100%).
export const SUBMITTAL_STAGES = [
  "Pre-Bid Submittal", "10% Submittal", "20% Submittal", "30% Submittal", "40% Submittal",
  "50% Submittal", "60% Submittal", "70% Submittal", "80% Submittal", "90% Submittal", "100% Submittal",
];
// File buckets on a drawing row → the folder each maps to in the ZIP export.
export const DRAWING_CATEGORIES: Array<{ key: string; label: string; folder: string }> = [
  { key: "drawingsPdf", label: "Drawings (PDF)", folder: "Drawings (PDF)" },
  { key: "drawingsDwg", label: "Drawings (DWG)", folder: "Drawings (DWG)" },
  { key: "specifications", label: "Specifications", folder: "Specifications" },
  { key: "reports", label: "Reports", folder: "Reports" },
  { key: "other", label: "Other Docs", folder: "Other Docs" },
];

export interface ITechDocFile { category: string; folder: string; name: string; filePath: string; fileType: string; size: string; remarks: string }
export interface ITechnicalDoc extends Document {
  projectId: string;
  kind: TechDocKind;
  groupId: string;   // links revisions of the same submittal into one family (sub-rows in the UI)
  order: number;
  submittalStage: string;   // drawing kind
  revNo: number;
  status: TechDocStatus;
  description: string;       // other kind
  remarks: string;
  files: ITechDocFile[];
  folders: Array<{ category: string; name: string }>;  // named subfolders within a category
  clientComments: string;
  clientFiles: Array<{ name: string; filePath: string; fileType: string; size: string }>;
}

const FileSchema = new Schema<ITechDocFile>({
  category: { type: String, default: "documents" },
  folder: { type: String, default: "" },   // "" = category root; otherwise a subfolder name
  name: String, filePath: String, fileType: String, size: String, remarks: { type: String, default: "" },
}, { _id: true });
const PlainFileSchema = new Schema({ name: String, filePath: String, fileType: String, size: String }, { _id: true });

const TechnicalDocSchema = new Schema<ITechnicalDoc>(
  {
    projectId: { type: String, required: true, index: true },
    kind: { type: String, enum: ["drawing", "other"], default: "drawing", index: true },
    groupId: { type: String, default: "", index: true },
    order: { type: Number, default: 0 },
    submittalStage: { type: String, default: "10% Submittal" },
    revNo: { type: Number, default: 0 },
    status: { type: String, enum: ["Pending", "Approved", "ApprovedAsNoted", "Rejected"], default: "Pending" },
    description: { type: String, default: "" },
    remarks: { type: String, default: "" },
    files: { type: [FileSchema], default: [] },
    folders: { type: [{ category: String, name: String }], default: [] },
    clientComments: { type: String, default: "" },
    clientFiles: { type: [PlainFileSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<ITechnicalDoc>("TechnicalDoc", TechnicalDocSchema);
