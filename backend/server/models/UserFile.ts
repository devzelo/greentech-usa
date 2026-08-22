import mongoose, { Schema, Document } from "mongoose";

// CR-P-57 — admin-uploaded documents attached to a user's profile (any file type).
export interface IUserFile extends Document {
  userId: string;
  name: string;
  fileType: string;
  size: string;
  filePath: string;
  description: string;
  uploadedByName: string;
}

const UserFileSchema = new Schema<IUserFile>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, default: "" },
    fileType: { type: String, default: "" },
    size: { type: String, default: "" },
    filePath: { type: String, default: "" },
    description: { type: String, default: "" },
    uploadedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IUserFile>("UserFile", UserFileSchema);
