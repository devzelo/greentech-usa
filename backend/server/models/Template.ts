import mongoose, { Schema, Document } from "mongoose";

/**
 * A saved tab/sub-tab template that can be inserted into any project.
 * Captures the structure (label, color, children) — not project-specific content.
 */
export interface ITemplate extends Document {
  name: string;
  description: string;
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  tabs: Array<{
    label: string;
    color?: string;
    notes?: string;
    fields?: Array<{ label: string; type: string; options?: string[] }>;
    children?: Array<{
      label: string;
      color?: string;
      notes?: string;
      fields?: Array<{ label: string; type: string; options?: string[] }>;
    }>;
  }>;
}

const TemplateSchema = new Schema<ITemplate>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: { type: String, default: "" },
    tabs: [
      {
        label: { type: String, required: true },
        color: { type: String, default: "" },
        notes: { type: String, default: "" },
        fields: [
          {
            label: { type: String, default: "" },
            type: { type: String, default: "text" },
            options: [{ type: String }],
          },
        ],
        children: [
          {
            label: { type: String, required: true },
            color: { type: String, default: "" },
            notes: { type: String, default: "" },
            fields: [
              {
                label: { type: String, default: "" },
                type: { type: String, default: "text" },
                options: [{ type: String }],
              },
            ],
          },
        ],
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<ITemplate>("Template", TemplateSchema);
