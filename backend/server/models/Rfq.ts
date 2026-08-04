import mongoose, { Schema, Document } from "mongoose";

// A Request For Quotation built from selected BOQ items. Its line items are a SNAPSHOT so the
// RFQ stays stable even if the BOQ later changes. One RFQ is sent to many vendors; each vendor's
// quote is a VendorQuote linked back to this RFQ.
export interface IRfqLineItem { itemId: string; description: string; qty: string; unit: string; spec: string; cancelled?: boolean }

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
  notes: string;
  addedByName: string;
}

const LineItemSchema = new Schema<IRfqLineItem>(
  { itemId: { type: String, default: "" }, description: { type: String, default: "" }, qty: { type: String, default: "" }, unit: { type: String, default: "" }, spec: { type: String, default: "" }, cancelled: { type: Boolean, default: false } },
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
    notes: { type: String, default: "" },
    addedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IRfq>("Rfq", RfqSchema);
