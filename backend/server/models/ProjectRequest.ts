import mongoose, { Schema, Document } from "mongoose";

// A formal request/notice we (the Contractor, GT) send to the Client — RFI, RFC, change orders,
// notices, claims, etc. Each type is auto-numbered per project (RFI-001, RFI-002, RFC-001 …).
// The client's replies are kept under the request as versioned responses, so the whole back-and-
// forth lives in one record. Used by the Contract Administration tab and by Client Communications.
export type RequestCategory = "contract-admin" | "client-comms";
export type RequestStatus = "Draft" | "Sent" | "Responded" | "Closed" | "Cancelled";

export interface IRequestFile { name: string; filePath: string; fileType: string; size: string }
export interface IRequestResponse {
  note: string;                 // summary of the client's response
  respondedAt: string;
  files: IRequestFile[];        // the documents the client sent back
  addedByName: string;
}

export interface IProjectRequest extends Document {
  projectId: string;
  category: RequestCategory;
  type: string;                 // "RFI", "RFC", … or "Custom"
  typeCode: string;             // short code used in the number, e.g. "RFI"
  customTitle: string;          // when type === "Custom"
  number: string;               // full reference, e.g. "RFI-001"
  seq: number;                  // the numeric part, for ordering / next-number
  title: string;
  date: string;
  description: string;             // rich-text HTML (tables/pictures/lines) — the request body
  status: RequestStatus;
  // The GreenTech signer (snapshot), drawn on the request document with the client-signature placeholder.
  signerName: string;
  signerTitle: string;
  signatureUrl: string;
  stampUrl: string;
  contextLines: Array<{ label: string; value: string }>;  // custom info lines printed on the document
  // Extra named rich-text sections (HTML). Per-section status/lock/notes/hidden/assignee/files
  // (client CR-B-15/17/18/19).
  sections: Array<{ title: string; body: string; status?: string; locked?: boolean; notes?: string; hidden?: boolean; assignedTo?: string; attachments?: Array<{ name: string; filePath: string; fileType: string; size: string }> }>;
  archived: boolean;   // hidden from the normal list; restorable from the Archived view
  attachments: IRequestFile[];  // our drafted request document(s)
  responses: IRequestResponse[];
  addedById: string;
  addedByName: string;
}

const FileSchema = new Schema<IRequestFile>({ name: String, filePath: String, fileType: String, size: String }, { _id: true });
const ResponseSchema = new Schema<IRequestResponse>({
  note: { type: String, default: "" },
  respondedAt: { type: String, default: "" },
  files: { type: [FileSchema], default: [] },
  addedByName: { type: String, default: "" },
}, { _id: true, timestamps: true });

const ProjectRequestSchema = new Schema<IProjectRequest>(
  {
    projectId: { type: String, required: true, index: true },
    category: { type: String, enum: ["contract-admin", "client-comms"], default: "contract-admin", index: true },
    type: { type: String, default: "RFI" },
    typeCode: { type: String, default: "RFI" },
    customTitle: { type: String, default: "" },
    number: { type: String, default: "" },
    seq: { type: Number, default: 0 },
    title: { type: String, default: "" },
    date: { type: String, default: "" },
    description: { type: String, default: "" },
    status: { type: String, enum: ["Draft", "Sent", "Responded", "Closed", "Cancelled"], default: "Draft" },
    signerName: { type: String, default: "" },
    signerTitle: { type: String, default: "" },
    signatureUrl: { type: String, default: "" },
    stampUrl: { type: String, default: "" },
    contextLines: { type: [{ label: { type: String, default: "" }, value: { type: String, default: "" } }], default: [] },
    sections: { type: [{ title: { type: String, default: "" }, body: { type: String, default: "" }, status: { type: String, default: "" }, locked: { type: Boolean, default: false }, notes: { type: String, default: "" }, hidden: { type: Boolean, default: false }, assignedTo: { type: String, default: "" }, attachments: { type: [{ name: String, filePath: String, fileType: String, size: String }], default: [] } }], default: [] },
    archived: { type: Boolean, default: false },
    attachments: { type: [FileSchema], default: [] },
    responses: { type: [ResponseSchema], default: [] },
    addedById: { type: String, default: "" },
    addedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IProjectRequest>("ProjectRequest", ProjectRequestSchema);

// The Contract-Administration request catalogue (label → short code used in the number).
export const REQUEST_TYPES: Array<{ type: string; code: string }> = [
  { type: "Request for Information (RFI)", code: "RFI" },
  { type: "Request for Clarification (RFC)", code: "RFC" },
  { type: "Technical Clarification", code: "TC" },
  { type: "Request for Approval (RFA)", code: "RFA" },
  { type: "Request for Equitable Adjustment (REA)", code: "REA" },
  { type: "Change Order Proposal (COP)", code: "COP" },
  { type: "Change Order Request (COR)", code: "COR" },
  { type: "Modification Proposal", code: "MP" },
  { type: "Request for Extension of Time (EOT)", code: "EOT" },
  { type: "Notice of Delay", code: "NOD" },
  { type: "Notice of Changed Conditions", code: "NCC" },
  { type: "Notice of Potential Claim", code: "NPC" },
  { type: "Notice of Claim", code: "NOC" },
  { type: "Formal Claim", code: "FC" },
  { type: "Value Engineering Proposal (VECP)", code: "VECP" },
  { type: "Design Deviation Request", code: "DDR" },
  { type: "Design Exception Request", code: "DER" },
  { type: "Substitution Request", code: "SR" },
  { type: "Material Substitution Request", code: "MSR" },
  { type: "Request for Site Instruction", code: "RSI" },
  { type: "Request for Site Access", code: "RSA" },
  { type: "Request for Acceptance", code: "RFAC" },
  { type: "Custom Request", code: "REQ" },
];
