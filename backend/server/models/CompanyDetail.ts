import mongoose, { Schema, Document } from "mongoose";

// CR-P-37 — a single custom field in the admin-managed "Company Details" block (Legal Name, UEI,
// CAGE, etc.). Admins add / edit / delete / reorder these; everyone else reads them.
export interface ICompanyDetail extends Document {
  label: string;
  value: string;
  order: number;
}

const CompanyDetailSchema = new Schema<ICompanyDetail>(
  {
    label: { type: String, required: true },
    value: { type: String, default: "" },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<ICompanyDetail>("CompanyDetail", CompanyDetailSchema);
