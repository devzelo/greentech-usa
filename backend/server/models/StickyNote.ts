import mongoose, { Schema, Document } from "mongoose";

// CR-P-63 — personal sticky notes shown on the Reminders page. Auto-saved; kept until the owner
// deletes them. One document per note, scoped to the owning user.
export interface IStickyNote extends Document {
  userId: string;
  text: string;
  color: string;
}

const StickyNoteSchema = new Schema<IStickyNote>(
  {
    userId: { type: String, required: true, index: true },
    text: { type: String, default: "" },
    color: { type: String, default: "yellow" },
  },
  { timestamps: true }
);

export default mongoose.model<IStickyNote>("StickyNote", StickyNoteSchema);
