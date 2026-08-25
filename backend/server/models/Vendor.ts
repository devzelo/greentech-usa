import mongoose, { Schema, Document } from "mongoose";

// A supplier/vendor (or logistics company) we send RFQs and POs to. Project-scoped for now.
export interface IVendor extends Document {
  projectId: string;
  // CR-PR-08 — the Directory company this vendor IS. Set when the vendor was picked from
  // (or auto-created alongside) a Company profile. Empty on legacy rows entered by hand.
  companyId: string;
  name: string;
  country: string;
  city: string;
  contactName: string;
  email: string;
  phone: string;
}

const VendorSchema = new Schema<IVendor>(
  {
    projectId: { type: String, required: true, index: true },
    companyId: { type: String, default: "", index: true },
    name: { type: String, default: "" },
    country: { type: String, default: "" },
    city: { type: String, default: "" },
    contactName: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IVendor>("Vendor", VendorSchema);
