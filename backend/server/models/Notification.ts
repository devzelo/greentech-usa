import mongoose, { Schema, Document } from "mongoose";

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId; // recipient
  type: "assignment" | "share" | "general" | "reminder";
  title: string;
  message: string;
  link: string; // where clicking takes the user (relative route or file URL)
  read: boolean;
  reminderId: mongoose.Types.ObjectId | null; // set on reminder-due notifications so they can be snoozed
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["assignment", "share", "general", "reminder"], default: "general" },
    title: { type: String, default: "" },
    message: { type: String, default: "" },
    link: { type: String, default: "" },
    read: { type: Boolean, default: false },
    reminderId: { type: Schema.Types.ObjectId, ref: "Reminder", default: null },
  },
  { timestamps: true }
);

export default mongoose.model<INotification>("Notification", NotificationSchema);
