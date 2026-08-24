import mongoose, { Schema, Document } from "mongoose";

// CR-P — a Kanban card on a project's Project Management board. Trello-like: assignees, tags,
// attachments, subtasks (checklist) and a comment thread with @mentions.
export interface ITaskAssignee { userId: string; empId: string; name: string; kind: string; avatarUrl: string }
export interface ITaskFile { name: string; filePath: string; fileType: string; size: string }
export interface ITaskComment { userId: string; authorName: string; authorAvatar: string; text: string; mentions: string[]; at: Date }
export interface ITask extends Document {
  projectId: string;
  columnId: string;
  title: string;
  description: string;
  deadline: string;   // CR-P — optional due date (YYYY-MM-DD)
  order: number;
  assignees: ITaskAssignee[];
  tags: string[];
  attachments: ITaskFile[];
  subtasks: Array<{ title: string; done: boolean }>;
  comments: ITaskComment[];
  createdById: string;
  createdByName: string;
}

const FileSchema = new Schema<ITaskFile>(
  { name: String, filePath: String, fileType: String, size: String },
  { _id: true }
);

const TaskSchema = new Schema<ITask>(
  {
    projectId: { type: String, required: true, index: true },
    columnId: { type: String, required: true, index: true },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    deadline: { type: String, default: "" },   // CR-P
    order: { type: Number, default: 0 },
    assignees: { type: [{ userId: { type: String, default: "" }, empId: { type: String, default: "" }, name: { type: String, default: "" }, kind: { type: String, default: "" }, avatarUrl: { type: String, default: "" } }], default: [] },
    tags: { type: [String], default: [] },
    attachments: { type: [FileSchema], default: [] },
    subtasks: { type: [{ title: { type: String, default: "" }, done: { type: Boolean, default: false } }], default: [] },
    comments: { type: [{ userId: { type: String, default: "" }, authorName: { type: String, default: "" }, authorAvatar: { type: String, default: "" }, text: { type: String, default: "" }, mentions: { type: [String], default: [] }, at: { type: Date, default: Date.now } }], default: [] },
    createdById: { type: String, default: "" },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<ITask>("Task", TaskSchema);
