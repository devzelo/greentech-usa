import mongoose, { Schema, Document } from "mongoose";

// A Request For Quotation built from selected BOQ items. Its line items are a SNAPSHOT so the
// RFQ stays stable even if the BOQ later changes. One RFQ is sent to many vendors; each vendor's
// quote is a VendorQuote linked back to this RFQ.
export interface IRfqLineFile { name: string; filePath: string; fileType: string; size: string }
// includeSubmittal (CR-PR-03) — attach the item's current submittal package to the RFQ PDF.
// attachments (CR-PR-03) — per-item reference docs (specs, data sheet, drawings) for the vendor.
// CR 335 - targetUnitPrice (optional, internal unless the RFQ shows target prices) and a note to
// the vendor on each item.
export interface IRfqLineItem { itemId: string; description: string; qty: string; unit: string; spec: string; cancelled?: boolean; includeSubmittal?: boolean; attachments?: IRfqLineFile[]; targetUnitPrice?: string; vendorNote?: string }

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
  // CR-PR-08 — expectsQuote: this receiver gets a price column in Step 2. Defaults true;
  // turn off for receivers who are only being informed (consultants, client engineers).
  recipients: Array<{ companyId: string; name: string; category: string; expectsQuote?: boolean }>;
  // An already-made RFQ document uploaded instead of building on the platform (CR-PR-02).
  uploadedDocument: IRfqLineFile | null;
  notes: string;
  // CR 335 - the Create RFQ form: the request's date and the date replies are due, its currency,
  // what each vendor is asked to include (lead time, data sheets, ...), the supporting documents,
  // and whether the target prices are printed for the vendor.
  date: string;
  dueDate: string;
  currency: string;
  requests: string[];
  showTargetPrices: boolean;
  attachments: IRfqLineFile[];
  // CR 338 - each copy emailed to a vendor: to whom, when, by whom, and whether the mail went out.
  emails: Array<{ vendorId: string; to: string; at: Date; byName: string; ok: boolean }>;
  ownerPackageId: string;   // CR 345 - the work package this RFQ belongs to ("" = Procurement's own)
  assignedTo: string;       // CR-B-19 — colleague tagged to edit/review/verify this RFQ
  addedByName: string;
  archived: boolean;        // CR-PR-07 — archived RFQs are hidden from the normal list.
}

const RfqLineFileSchema = new Schema<IRfqLineFile>({ name: String, filePath: String, fileType: String, size: String }, { _id: true });
const LineItemSchema = new Schema<IRfqLineItem>(
  { itemId: { type: String, default: "" }, description: { type: String, default: "" }, qty: { type: String, default: "" }, unit: { type: String, default: "" }, spec: { type: String, default: "" }, cancelled: { type: Boolean, default: false }, includeSubmittal: { type: Boolean, default: false }, attachments: { type: [RfqLineFileSchema], default: [] }, targetUnitPrice: { type: String, default: "" }, vendorNote: { type: String, default: "" } },
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
    recipients: { type: [{ companyId: { type: String, default: "" }, name: { type: String, default: "" }, category: { type: String, default: "" }, expectsQuote: { type: Boolean, default: true } }], default: [] },
    uploadedDocument: { type: RfqLineFileSchema, default: null },
    notes: { type: String, default: "" },
    date: { type: String, default: "" },
    dueDate: { type: String, default: "" },
    currency: { type: String, default: "USD" },
    requests: { type: [String], default: [] },
    showTargetPrices: { type: Boolean, default: false },
    attachments: { type: [RfqLineFileSchema], default: [] },
    emails: { type: [{ vendorId: { type: String, default: "" }, to: { type: String, default: "" }, at: { type: Date, default: Date.now }, byName: { type: String, default: "" }, ok: { type: Boolean, default: false }, _id: false }], default: [] },
    assignedTo: { type: String, default: "" },
    ownerPackageId: { type: String, default: "", index: true },
    addedByName: { type: String, default: "" },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model<IRfq>("Rfq", RfqSchema);
