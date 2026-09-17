import mongoose, { Schema, Document } from "mongoose";

// CR 183: custom project categories. Anyone on staff can add one while picking a project's
// categories; it is then offered on every project next to the standard list.
export interface IProjectCategory extends Document {
  name: string;
  key: string; // lower-cased name, for de-duplication
  createdByName: string;
}

const ProjectCategorySchema = new Schema<IProjectCategory>(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, unique: true },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IProjectCategory>("ProjectCategory", ProjectCategorySchema);
