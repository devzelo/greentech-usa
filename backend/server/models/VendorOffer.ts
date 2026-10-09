import mongoose, { Schema, Document } from "mongoose";

/**
 * 2026-10-09 - "When you add a vendor or a company in the BOQ or in the work package, it shows up in
 * their profile under the same project, so they can add their unit price, total price and lead
 * time, or upload documents or an invoice."
 *
 * One company's offer on one BOQ line (kind "boq", refId = the ProcurementItem) or one work package
 * (kind "package", refId = the WorkPackage). The company fills it in from its own profile; GreenTech
 * accepts it, which locks it (reopen to let them change it). Their invoices go to Finances as
 * received invoices (Invoice.source "vendor-portal"), not here.
 */
export type OfferKind = "boq" | "package";
export interface IOfferFile { name: string; filePath: string; fileType: string; size: string; uploadedByName: string; uploadedAt: Date }

export interface IVendorOffer extends Document {
  projectId: string;
  companyId: string;
  companyName: string;
  kind: OfferKind;
  refId: string;
  unitPrice: string;     // the amounts as plain numbers ("1250.5"), shown in currency format
  total: string;
  leadTime: string;      // as the vendor gives it ("30 days", "6 weeks")
  notes: string;
  status: "submitted" | "accepted";
  submittedAt: Date | null;
  submittedByName: string;
  acceptedAt: Date | null;
  acceptedByName: string;
  attachments: IOfferFile[];
}

const FileSchema = new Schema<IOfferFile>({
  name: { type: String, default: "" }, filePath: { type: String, default: "" }, fileType: { type: String, default: "" },
  size: { type: String, default: "" }, uploadedByName: { type: String, default: "" }, uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

const VendorOfferSchema = new Schema<IVendorOffer>(
  {
    projectId: { type: String, required: true, index: true },
    companyId: { type: String, required: true, index: true },
    companyName: { type: String, default: "" },
    kind: { type: String, enum: ["boq", "package"], required: true },
    refId: { type: String, required: true },
    unitPrice: { type: String, default: "" },
    total: { type: String, default: "" },
    leadTime: { type: String, default: "" },
    notes: { type: String, default: "" },
    status: { type: String, enum: ["submitted", "accepted"], default: "submitted" },
    submittedAt: { type: Date, default: null },
    submittedByName: { type: String, default: "" },
    acceptedAt: { type: Date, default: null },
    acceptedByName: { type: String, default: "" },
    attachments: { type: [FileSchema], default: [] },
  },
  { timestamps: true }
);
VendorOfferSchema.index({ projectId: 1, kind: 1, refId: 1, companyId: 1 }, { unique: true });

export default mongoose.model<IVendorOffer>("VendorOffer", VendorOfferSchema);
