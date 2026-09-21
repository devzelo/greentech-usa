import mongoose, { Schema, Document } from "mongoose";
import type { MilestoneRecord } from "./Project";

// CR 190: every saved version of a project's timeline, so the monthly report can show how the
// schedule moved.
export interface IScheduleRevision extends Document {
  projectId: string;
  /** "" for the master schedule, else the id of the separate schedule it belongs to. */
  scheduleId: string;
  version: number;
  categories: string[];
  milestones: MilestoneRecord[];
  progress: number;
  note: string;
  savedBy: string;
  createdAt: Date;
}

const ScheduleRevisionSchema = new Schema<IScheduleRevision>(
  {
    projectId: { type: String, required: true, index: true },
    scheduleId: { type: String, default: "" },
    version: { type: Number, required: true },
    categories: { type: [String], default: [] },
    milestones: { type: Schema.Types.Mixed, default: [] },
    progress: { type: Number, default: 0 },
    note: { type: String, default: "" },
    savedBy: { type: String, default: "" },
  },
  { timestamps: true }
);
ScheduleRevisionSchema.index({ projectId: 1, version: -1 });

export default mongoose.model<IScheduleRevision>("ScheduleRevision", ScheduleRevisionSchema);
