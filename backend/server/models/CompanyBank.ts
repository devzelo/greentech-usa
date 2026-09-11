import mongoose, { Schema, Document } from "mongoose";

// CR-P (162) — GreenTech's own bank accounts, entered once and picked on every invoice (instead of
// typing the bank details each time). One of them is the default for new invoices.
export interface ICompanyBank extends Document {
  label: string;          // how it shows in the list, e.g. "Chase USD operating"
  name: string;           // bank name
  accountName: string;
  accountNumber: string;
  iban: string;
  swift: string;
  routing: string;
  isDefault: boolean;
}

const CompanyBankSchema = new Schema<ICompanyBank>(
  {
    label: { type: String, default: "" },
    name: { type: String, default: "" },
    accountName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    iban: { type: String, default: "" },
    swift: { type: String, default: "" },
    routing: { type: String, default: "" },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model<ICompanyBank>("CompanyBank", CompanyBankSchema);
