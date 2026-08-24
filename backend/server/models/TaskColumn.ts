import mongoose, { Schema, Document } from "mongoose";

// CR-P — a Kanban column on a project's Project Management board. Four defaults are seeded
// (Pending / In Progress / Done / Archive); users can add custom columns.
export interface ITaskColumn extends Document {
  projectId: string;
  title: string;
  order: number;
  isDefault: boolean;
  key: string;
}

const TaskColumnSchema = new Schema<ITaskColumn>(
  {
    projectId: { type: String, required: true, index: true },
    title: { type: String, default: "" },
    order: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    key: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<ITaskColumn>("TaskColumn", TaskColumnSchema);
