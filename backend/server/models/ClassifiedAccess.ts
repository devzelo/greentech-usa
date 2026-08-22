import mongoose, { Schema, Document } from "mongoose";

// CR-P — a single (singleton) record controlling employee PIN access to Classified Documents.
// Admins manage it; when `enabled`, an employee who enters the correct PIN gets a short-lived
// token that unlocks the Classified tab. The PIN itself is stored only as a bcrypt hash.
export interface IClassifiedAccess extends Document {
  key: string;      // always "singleton"
  enabled: boolean;
  pinHash: string;
}

const ClassifiedAccessSchema = new Schema<IClassifiedAccess>(
  {
    key: { type: String, default: "singleton", unique: true },
    enabled: { type: Boolean, default: false },
    pinHash: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IClassifiedAccess>("ClassifiedAccess", ClassifiedAccessSchema);
