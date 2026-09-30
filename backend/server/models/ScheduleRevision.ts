import mongoose, { Schema, Document } from "mongoose";
import type { MilestoneRecord } from "./Project";

// CR 190: every saved version of a project's timeline, so the monthly report can show how the
// schedule moved.
//
// CR 300 (2026-09-25): the schedule register. Three kinds of entry share this record:
//   revision  a Save of the live schedule (Revision 1, 2, 3...), the "Current" tab
//   baseline  a frozen copy approved by the client (B0, B1, B2...), never edited after; the
//             latest one not archived is the one the schedule is measured against
//   upload    a schedule sent or received as a file only (no live table behind it)
// Each can carry its submission details and files, which the History tab lists.
//   submittal a dated snapshot filed on purpose ("Save for submittal / history"), and the
//             separate schedules that existed before CR 314, filed once
export type ScheduleEntryKind = "revision" | "baseline" | "upload" | "submittal";
export type ScheduleEntryStatus = "draft" | "submitted" | "approved" | "rejected";
export interface ScheduleEntryFile {
  docId: string; name: string; filePath: string; fileType: string; size: string; uploadedAt: string; uploadedBy: string;
}
export interface IScheduleRevision extends Document {
  projectId: string;
  /** "" for the master schedule, else the id of the separate schedule it belongs to. */
  scheduleId: string;
  version: number;
  categories: string[];
  /** CR 321 - the phases' details as they stood. */
  phaseInfo: unknown[];
  milestones: MilestoneRecord[];
  progress: number;
  note: string;
  savedBy: string;
  kind: ScheduleEntryKind;
  /** B0, B1... for a baseline; -1 otherwise. */
  baselineNo: number;
  title: string;
  description: string;
  /** yyyy-mm-dd: the day progress was measured to. */
  dataDate: string;
  approvedAt: string;
  contractCompletion: string;
  status: ScheduleEntryStatus;
  submittedAt: string;
  submittedBy: string;
  client: string;
  relatedDocument: string;
  files: ScheduleEntryFile[];
  archived: boolean;
  createdAt: Date;
}

const ScheduleRevisionSchema = new Schema<IScheduleRevision>(
  {
    projectId: { type: String, required: true, index: true },
    scheduleId: { type: String, default: "" },
    version: { type: Number, required: true },
    categories: { type: [String], default: [] },
    phaseInfo: { type: [Schema.Types.Mixed], default: [] },
    milestones: { type: Schema.Types.Mixed, default: [] },
    progress: { type: Number, default: 0 },
    note: { type: String, default: "" },
    savedBy: { type: String, default: "" },
    kind: { type: String, enum: ["revision", "baseline", "upload", "submittal"], default: "revision" },
    baselineNo: { type: Number, default: -1 },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    dataDate: { type: String, default: "" },
    approvedAt: { type: String, default: "" },
    contractCompletion: { type: String, default: "" },
    status: { type: String, enum: ["draft", "submitted", "approved", "rejected"], default: "draft" },
    submittedAt: { type: String, default: "" },
    submittedBy: { type: String, default: "" },
    client: { type: String, default: "" },
    relatedDocument: { type: String, default: "" },
    files: { type: Schema.Types.Mixed, default: [] },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);
ScheduleRevisionSchema.index({ projectId: 1, version: -1 });

export default mongoose.model<IScheduleRevision>("ScheduleRevision", ScheduleRevisionSchema);

/** How an entry is named wherever it is listed on its own (the Recycle Bin, the Archive). */
export function scheduleEntryName(e: { kind?: string; baselineNo?: number; version?: number; title?: string }): string {
  if (e.kind === "baseline") {
    const code = `Baseline B${e.baselineNo ?? 0}`;
    return e.title && e.title !== code ? `${code} - ${e.title}` : code;
  }
  if (e.kind === "upload") return e.title || "Uploaded schedule";
  if (e.kind === "submittal") return e.title || "Saved schedule";
  return `Schedule revision ${e.version ?? ""}`.trim();
}
