import mongoose, { Schema, Document } from "mongoose";

/**
 * CR 208 / 209: minutes and progress reports written in the platform rather than uploaded. One
 * model for both (`kind`), because they are the same thing: a dated record of a project, with
 * agenda or report items, the people it involves and the actions that came out of it.
 */
export interface MinuteAction {
  id: string;
  text: string;
  ownerUserId?: string;
  ownerName?: string;
  due?: string;            // yyyy-mm-dd
  done?: boolean;
}
export interface MinuteItem {
  id: string;
  title: string;
  notes: string;           // rich text
  actions: MinuteAction[];
}
export interface MinuteAttendee {
  userId?: string;
  name: string;
  role?: string;
  company?: string;
  present?: boolean;
}

export interface IMeetingMinute extends Document {
  projectId: string;
  kind: "meeting" | "progress";
  title: string;
  date: string;            // yyyy-mm-dd, the meeting or reporting date
  time?: string;
  location?: string;
  period?: string;         // progress reports: the period covered ("Week 12", "May 2026")
  attendees: MinuteAttendee[];
  items: MinuteItem[];
  summary: string;         // rich text, the opening note
  mentioned: string[];     // names already notified, so nobody is told twice
  status: "draft" | "final";
  archived: boolean;
  createdById?: string;
  createdByName: string;
  updatedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const ActionSchema = new Schema<MinuteAction>({
  id: { type: String, required: true },
  text: { type: String, default: "" },
  ownerUserId: { type: String, default: "" },
  ownerName: { type: String, default: "" },
  due: { type: String, default: "" },
  done: { type: Boolean, default: false },
}, { _id: false });

const ItemSchema = new Schema<MinuteItem>({
  id: { type: String, required: true },
  title: { type: String, default: "" },
  notes: { type: String, default: "" },
  actions: { type: [ActionSchema], default: [] },
}, { _id: false });

const AttendeeSchema = new Schema<MinuteAttendee>({
  userId: { type: String, default: "" },
  name: { type: String, default: "" },
  role: { type: String, default: "" },
  company: { type: String, default: "" },
  present: { type: Boolean, default: true },
}, { _id: false });

const MeetingMinuteSchema = new Schema<IMeetingMinute>(
  {
    projectId: { type: String, required: true, index: true },
    kind: { type: String, enum: ["meeting", "progress"], default: "meeting", index: true },
    title: { type: String, default: "" },
    date: { type: String, default: "" },
    time: { type: String, default: "" },
    location: { type: String, default: "" },
    period: { type: String, default: "" },
    attendees: { type: [AttendeeSchema], default: [] },
    items: { type: [ItemSchema], default: [] },
    summary: { type: String, default: "" },
    mentioned: { type: [String], default: [] },
    status: { type: String, enum: ["draft", "final"], default: "draft" },
    archived: { type: Boolean, default: false },
    createdById: { type: String, default: "" },
    createdByName: { type: String, default: "" },
    updatedByName: { type: String, default: "" },
  },
  { timestamps: true }
);
MeetingMinuteSchema.index({ projectId: 1, kind: 1, date: -1 });

export default mongoose.model<IMeetingMinute>("MeetingMinute", MeetingMinuteSchema);
