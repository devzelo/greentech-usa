import mongoose, { Schema, Document } from "mongoose";

// A personal reminder. Every user can set one against any task or record in the system — the
// optional `link` opens the related project / document / tab straight from the notification.
// A background sweep fires due reminders as in-app notifications (plus email when enabled).
export type ReminderStatus = "Pending" | "InProgress" | "Completed" | "Cancelled";

export interface IReminder extends Document {
  userId: string;
  title: string;
  notes: string;           // free-text remarks
  dueAt: Date;
  status: ReminderStatus;
  link: string;            // in-app route, e.g. /dashboard/projects/2026-01?tab=procurement
  contextLabel: string;    // human label for what it's about, e.g. "Project · Riyadh Metro"
  projectId: string;       // the project this reminder is about (for the project filter)
  projectName: string;     // denormalised for display / filtering without a join
  emailEnabled: boolean;
  notifiedAt: Date | null; // set when the due notification has been sent (fire once)
  completedAt: Date | null;
}

const ReminderSchema = new Schema<IReminder>(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, default: "" },
    notes: { type: String, default: "" },
    dueAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ["Pending", "InProgress", "Completed", "Cancelled"], default: "Pending", index: true },
    link: { type: String, default: "" },
    contextLabel: { type: String, default: "" },
    projectId: { type: String, default: "" },
    projectName: { type: String, default: "" },
    emailEnabled: { type: Boolean, default: false },
    notifiedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model<IReminder>("Reminder", ReminderSchema);
