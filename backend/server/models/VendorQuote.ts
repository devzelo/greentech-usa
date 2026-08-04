import mongoose, { Schema, Document } from "mongoose";

// One vendor's response to an RFQ. We keep ALL quotes (the non-selected ones too) — only the
// chosen one is "Awarded". Per-line unit prices line up with the RFQ's line items by itemId.
export interface IQuoteLine { itemId: string; unitPrice: string }

export interface IVendorQuote extends Document {
  projectId: string;
  rfqId: string;
  vendorId: string;
  lineItems: IQuoteLine[];
  totalOverride: string;   // optional lump-sum item total — used instead of per-line prices when set
  shipping: string;
  tax: string;
  leadTimeDays: string;
  inclusions: string;
  exclusions: string;
  notes: string;
  status: "Received" | "NotSelected" | "Awarded";
  attachments: Array<{ name: string; filePath: string; fileType: string; size: string }>;
}

const QuoteLineSchema = new Schema<IQuoteLine>({ itemId: { type: String, default: "" }, unitPrice: { type: String, default: "" } }, { _id: false });
const AttachmentSchema = new Schema({ name: String, filePath: String, fileType: String, size: String }, { _id: true });

const VendorQuoteSchema = new Schema<IVendorQuote>(
  {
    projectId: { type: String, required: true, index: true },
    rfqId: { type: String, required: true, index: true },
    vendorId: { type: String, default: "", index: true },
    lineItems: { type: [QuoteLineSchema], default: [] },
    totalOverride: { type: String, default: "" },
    shipping: { type: String, default: "" },
    tax: { type: String, default: "" },
    leadTimeDays: { type: String, default: "" },
    inclusions: { type: String, default: "" },
    exclusions: { type: String, default: "" },
    notes: { type: String, default: "" },
    status: { type: String, enum: ["Received", "NotSelected", "Awarded"], default: "Received" },
    attachments: { type: [AttachmentSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<IVendorQuote>("VendorQuote", VendorQuoteSchema);
