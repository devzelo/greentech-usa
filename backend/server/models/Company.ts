import mongoose, { Schema, Document } from "mongoose";

// Master company/contact record for the Companies Directory (client CR-P-06). One profile per
// vendor / subcontractor / client / manufacturer / consultant / partner / supplier. RFQs, POs,
// invoices, submittals etc. link to this by _id so a company's full history lives in one place.
export type CompanyCategory =
  | "vendor" | "subcontractor" | "client" | "manufacturer"
  | "consultant" | "partner" | "supplier" | "other";

export const COMPANY_CATEGORIES: CompanyCategory[] = [
  "vendor", "subcontractor", "client", "manufacturer", "consultant", "partner", "supplier", "other",
];

export interface ICompany extends Document {
  name: string;
  category: CompanyCategory;
  logoUrl: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  contactPersons: Array<{ name: string; role: string; email: string; phone: string }>;
  banking: { bankName: string; accountName: string; accountNumber: string; iban: string; swift: string; routing: string };
  tax: { taxId: string; registrationNo: string };
  notes: string;
  archived: boolean;
  createdByName: string;
  // Vendor self-registration (CR-P-06d): a secret token for the public update form,
  // plus a pending-changes buffer that GT reviews before it replaces verified data.
  registerToken: string;
  pendingUpdate: { data: string; submittedAt: string } | null;
}

const CompanySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true, index: true },
    category: { type: String, enum: COMPANY_CATEGORIES, default: "vendor", index: true },
    logoUrl: { type: String, default: "" },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    website: { type: String, default: "" },
    contactPersons: {
      type: [{ name: { type: String, default: "" }, role: { type: String, default: "" }, email: { type: String, default: "" }, phone: { type: String, default: "" } }],
      default: [],
    },
    banking: {
      bankName: { type: String, default: "" }, accountName: { type: String, default: "" }, accountNumber: { type: String, default: "" },
      iban: { type: String, default: "" }, swift: { type: String, default: "" }, routing: { type: String, default: "" },
    },
    tax: { taxId: { type: String, default: "" }, registrationNo: { type: String, default: "" } },
    notes: { type: String, default: "" },
    archived: { type: Boolean, default: false },
    createdByName: { type: String, default: "" },
    registerToken: { type: String, default: "", index: true },
    pendingUpdate: { type: { data: String, submittedAt: String }, default: null },
  },
  { timestamps: true }
);

export default mongoose.model<ICompany>("Company", CompanySchema);
