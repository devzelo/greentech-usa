import mongoose, { Schema, Document } from "mongoose";

// A purchase order created from an awarded vendor quote. Line items + prices are a SNAPSHOT
// (so later quote edits can't alter the PO). When a vendor invoice is linked, we 2-way match it
// against the PO total and auto-create a linked project Expense.
export interface IPOLine { itemId: string; description: string; qty: string; unit: string; unitPrice: string; cancelled?: boolean }
export interface IPOAttachment { name: string; filePath: string; fileType: string; size: string; kind: string }

export interface IProcurementPO extends Document {
  projectId: string;
  poNo: string;
  rfqId: string;
  quoteId: string;
  vendorId: string;
  vendorName: string;
  lineItems: IPOLine[];
  shipping: string;
  tax: string;
  total: string;
  terms: string;
  termsMode: "constant" | "file"; // T&C source: the standard constant text, or an uploaded file
  notes: string;            // extra info printed on the PO document after the item table (like RFQ notes)
  shipTo: string;
  deliveryMethod: string;   // "Delivery" | "Pickup" (free text, carried from the RFQ, editable)
  status: "Sent" | "Confirmed" | "InvoiceReceived" | "Paid";
  invoiceNo: string;
  invoiceAmount: string;
  invoiceDate: string;
  invoiceMatch: "" | "Matched" | "Discrepancy";
  expenseId: string;       // linked auto-created Expense
  attachments: IPOAttachment[];
  // Signatures & stamp (F1) — GreenTech signer is chosen from staff with a signature on file;
  // the stamp is picked from the classified Stamps tab. For a JV, the partner side is filled
  // manually (partners have no staff accounts or classified stamps).
  signerName: string; signerEmail: string; signerPhone: string; signerTitle: string; signatureUrl: string;
  stampUrl: string;
  partnerSignerName: string; partnerSignerEmail: string; partnerSignerPhone: string; partnerSignatureUrl: string;
  partnerStampUrl: string;
  addedByName: string;
}

const LineSchema = new Schema<IPOLine>({ itemId: String, description: String, qty: String, unit: String, unitPrice: String, cancelled: { type: Boolean, default: false } }, { _id: true });
const AttSchema = new Schema<IPOAttachment>({ name: String, filePath: String, fileType: String, size: String, kind: { type: String, default: "other" } }, { _id: true });

const ProcurementPOSchema = new Schema<IProcurementPO>(
  {
    projectId: { type: String, required: true, index: true },
    poNo: { type: String, default: "" },
    rfqId: { type: String, default: "" },
    quoteId: { type: String, default: "" },
    vendorId: { type: String, default: "" },
    vendorName: { type: String, default: "" },
    lineItems: { type: [LineSchema], default: [] },
    shipping: { type: String, default: "" },
    tax: { type: String, default: "" },
    total: { type: String, default: "" },
    terms: { type: String, default: "" },
    termsMode: { type: String, enum: ["constant", "file"], default: "constant" },
    notes: { type: String, default: "" },
    shipTo: { type: String, default: "" },
    deliveryMethod: { type: String, default: "Delivery" },
    status: { type: String, enum: ["Sent", "Confirmed", "InvoiceReceived", "Paid"], default: "Sent" },
    invoiceNo: { type: String, default: "" },
    invoiceAmount: { type: String, default: "" },
    invoiceDate: { type: String, default: "" },
    invoiceMatch: { type: String, enum: ["", "Matched", "Discrepancy"], default: "" },
    expenseId: { type: String, default: "" },
    attachments: { type: [AttSchema], default: [] },
    signerName: { type: String, default: "" },
    signerEmail: { type: String, default: "" },
    signerPhone: { type: String, default: "" },
    signerTitle: { type: String, default: "" },
    signatureUrl: { type: String, default: "" },
    stampUrl: { type: String, default: "" },
    partnerSignerName: { type: String, default: "" },
    partnerSignerEmail: { type: String, default: "" },
    partnerSignerPhone: { type: String, default: "" },
    partnerSignatureUrl: { type: String, default: "" },
    partnerStampUrl: { type: String, default: "" },
    addedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IProcurementPO>("ProcurementPO", ProcurementPOSchema);
