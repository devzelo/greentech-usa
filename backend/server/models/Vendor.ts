import mongoose, { Schema, Document } from "mongoose";

// A supplier/vendor (or logistics company) we send RFQs and POs to. Project-scoped for now.
export interface IVendor extends Document {
  projectId: string;
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
