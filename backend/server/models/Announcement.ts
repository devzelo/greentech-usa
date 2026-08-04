import mongoose, { Schema, Document } from "mongoose";

// A public-site announcement shown in the hero banner (holidays, notices, events).
// Managed by admin (Reza). Public visitors read active ones; only admin writes.
export interface IAnnouncement extends Document {
  title: string;
  message: string;
  emoji: string;         // small glyph shown on the banner (e.g. "🎆")
  date: string;          // yyyy-mm-dd — the day it shows (a holiday shows only on this day)
  endDate: string;       // optional yyyy-mm-dd — custom announcements can span date…endDate
  kind: "holiday" | "news" | "event";
  active: boolean;
  addedByName: string;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, default: "" },
    message: { type: String, default: "" },
    emoji: { type: String, default: "📣" },
    date: { type: String, default: "" },
    endDate: { type: String, default: "" },
    kind: { type: String, enum: ["holiday", "news", "event"], default: "holiday" },
    active: { type: Boolean, default: true },
    addedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IAnnouncement>("Announcement", AnnouncementSchema);
