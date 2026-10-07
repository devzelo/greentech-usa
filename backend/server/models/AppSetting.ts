import mongoose, { Schema, Document } from "mongoose";

// 2026-10-07 - a company-wide setting, one record per key (e.g. "standard-appendices": the
// appendices "Add standard appendices" puts in a proposal). `value` is the setting's own shape.
export interface IAppSetting extends Document {
  key: string;
  value: Record<string, unknown>;
  updatedByName: string;
}

const AppSettingSchema = new Schema<IAppSetting>(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, default: {} },
    updatedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IAppSetting>("AppSetting", AppSettingSchema);
