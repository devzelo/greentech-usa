import mongoose, { Schema, Document } from "mongoose";

// A Request For Quotation built from selected BOQ items. Its line items are a SNAPSHOT so the
// RFQ stays stable even if the BOQ later changes. One RFQ is sent to many vendors; each vendor's
// quote is a VendorQuote linked back to this RFQ.
export interface IRfqLineFile { name: string; filePath: string; fileType: string; size: string }
// includeSubmittal (CR-PR-03) — attach the item's current submittal package to the RFQ PDF.
// attachments (CR-PR-03) — per-item reference docs (specs, data sheet, drawings) for the vendor.
export interface IRfqLineItem { itemId: string; description: string; qty: string; unit: string; spec: string; cancelled?: boolean; includeSubmittal?: boolean; attachments?: IRfqLineFile[] }

export interface IRfq extends Document {
  projectId: string;
  rfqNo: string;
  title: string;
  lineItems: IRfqLineItem[];
  includesShipping: boolean;
  includesTax: boolean;
  shipToLocation: string;   // where the vendor delivers / we collect from
  deliveryMethod: string;   // "Delivery" | "Pickup" (free text)
  // Two-step lifecycle: Draft (composing the request) → Sent (sent to vendors) →
  // Quoting (at least one vendor quote is in) → Awarded (one quote accepted).
  status: "Draft" | "Sent" | "Quoting" | "Awarded";
  sentAt: string;           // date the request was sent to vendors
  // Who this RFQ was sent to — chosen from the Companies Directory (CR-PR-04).
  recipients: Array<{ companyId: string; name: string; category: string }>;
  // An already-made RFQ document uploaded instead of building on the platform (CR-PR-02).
  uploadedDocument: IRfqLineFile | null;
  notes: string;
  addedByName: string;
}

const RfqLineFileSchema = new Schema<IRfqLineFile>({ name: String, filePath: String, fileType: String, size: String }, { _id: true });
const LineItemSchema = new Schema<IRfqLineItem>(
  { itemId: { type: String, default: "" }, description: { type: String, default: "" }, qty: { type: String, default: "" }, unit: { type: String, default: "" }, spec: { type: String, default: "" }, cancelled: { type: Boolean, default: false }, includeSubmittal: { type: Boolean, default: false }, attachments: { type: [RfqLineFileSchema], default: [] } },
  { _id: true }
);

const RfqSchema = new Schema<IRfq>(
  {
    projectId: { type: String, required: true, index: true },
    rfqNo: { type: String, default: "" },
    title: { type: String, default: "" },
    lineItems: { type: [LineItemSchema], default: [] },
    includesShipping: { type: Boolean, default: true },
    includesTax: { type: Boolean, default: true },
    shipToLocation: { type: String, default: "" },
    deliveryMethod: { type: String, default: "" },
    status: { type: String, enum: ["Draft", "Sent", "Quoting", "Awarded"], default: "Draft" },
    sentAt: { type: String, default: "" },
    recipients: { type: [{ companyId: { type: String, default: "" }, name: { type: String, default: "" }, category: { type: String, default: "" } }], default: [] },
    uploadedDocument: { type: RfqLineFileSchema, default: null },
    notes: { type: String, default: "" },
    addedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IRfq>("Rfq", RfqSchema);
