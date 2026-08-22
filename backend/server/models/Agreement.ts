import mongoose, { Schema, Document } from "mongoose";

// One shared agreement engine, two ownership contexts (spec: docs/agreement-feature-spec.md):
//  - "user"    → employee agreements, owned by a user profile (ownerUserId)
//  - "project" → partner / subcontractor / vendor agreements, owned by that entity inside a project
// The party data is SNAPSHOTTED (frozen once sent) so later profile edits never rewrite an
// issued agreement. A signed agreement is immutable — only Expired/Cancelled transitions remain.
export type AgreementStatus =
  | "Draft" | "Sent" | "Viewed" | "PendingSignature" | "Signed" | "Rejected" | "Expired" | "Cancelled";
// "general" — a standalone company agreement with an outside party, tied to no project and no
// employee (e.g. GreenTech contracting another company for a piece of work).
export type AgreementContext = "user" | "project" | "general";
export type AgreementEntityType = "" | "partner" | "subcontractor" | "vendor";

export interface IAgreementParty {
  name: string; contactName: string; address: string; email: string; phone: string; logoUrl: string;
}
export interface IAgreementFile { name: string; filePath: string; fileType: string; size: string; kind: string }

export interface IAgreement extends Document {
  ownerContextType: AgreementContext;
  ownerUserId: string;        // user context — the employee's User id
  ownerProjectId: string;     // project context
  ownerEntityType: AgreementEntityType;
  ownerEntityId: string;      // subId / vendorId; "jv" for the project's partner

  name: string;               // auto-generated code (GT-…), editable
  title: string;              // short human title (general agreements) — CR-P-45
  description: string;        // description / remarks (general agreements) — CR-P-45
  agreementType: string;      // Employment | Service | Supply | Partnership | NDA | Custom
  templateId: string;
  effectiveDate: string;
  startDate: string;
  endDate: string;
  status: AgreementStatus;

  partySnapshot: {
    party1: IAgreementParty;  // GreenTech (or the JV entity)
    party2: IAgreementParty;  // the employee / project entity
    contextLines: Array<{ label: string; value: string }>; // employee or project+entity info block
  };

  // "gt" = GreenTech letterhead; "jv" = joint-venture (both logos). Chosen per agreement.
  letterhead: "gt" | "jv";
  jvLogoUrl: string;        // the partner / JV logo drawn beside GreenTech's when letterhead = "jv"

  // "built" = generated from the fields below; "uploaded" = the user attached an already-made
  // agreement file, which becomes the document itself (preview/download serve the file as-is).
  documentMode: "built" | "uploaded";
  uploadedDocument: { name: string; filePath: string; fileType: string; size: string } | null;
  archived: boolean;   // hidden from the normal list; restorable from the Archived view

  sections: {
    scope: string;
    terms: string;
    paymentConditions: string;
    deliveryConditions: string;
    ndaEnabled: boolean;
    ndaMode: "text" | "file";  // write the NDA inline, or attach a file from the NDA library
    ndaText: string;
    ndaFile: { name: string; url: string } | null;  // the attached NDA (from classified NDA Files)
  };
  extraSections: Array<{ title: string; body: string; status?: string; locked?: boolean; hidden?: boolean; notes?: string; assignedTo?: string; attachments?: Array<{ name: string; filePath: string; fileType: string; size: string; kind?: string }>; history?: Array<{ at: string; by: string; text: string }> }>;  // custom named rich-text sections (HTML) + per-section state (CR-B-15/17/18/19a)
  // CR-P-49 — colleague tagged to review each fixed section (parallels extraSections.assignedTo).
  sectionAssignees: { scope: string; terms: string; paymentConditions: string; deliveryConditions: string };

  signatures: {
    company: { signerName: string; signerTitle: string; signerEmail: string; signerPhone: string; signatureUrl: string; stampUrl: string; signedAt: string };
    recipient: { signerName: string; signatureUrl: string; stampUrl: string; signedAt: string; method: "" | "account" | "upload" };
  };

  signedDocument: { name: string; filePath: string; fileType: string; size: string } | null; // frozen PDF once Signed
  attachments: IAgreementFile[];   // e.g. the counter-signed copy received back from a vendor
  activity: Array<{ at: Date; actorName: string; action: string; note: string }>;
  sentAt: string;
  addedById: string;
  addedByName: string;
}

const PartySchema = new Schema<IAgreementParty>(
  { name: { type: String, default: "" }, contactName: { type: String, default: "" }, address: { type: String, default: "" }, email: { type: String, default: "" }, phone: { type: String, default: "" }, logoUrl: { type: String, default: "" } },
  { _id: false }
);
const FileSchema = new Schema<IAgreementFile>(
  { name: String, filePath: String, fileType: String, size: String, kind: { type: String, default: "other" } },
  { _id: true }
);

const AgreementSchema = new Schema<IAgreement>(
  {
    ownerContextType: { type: String, enum: ["user", "project", "general"], required: true, index: true },
    ownerUserId: { type: String, default: "", index: true },
    ownerProjectId: { type: String, default: "", index: true },
    ownerEntityType: { type: String, enum: ["", "partner", "subcontractor", "vendor"], default: "" },
    ownerEntityId: { type: String, default: "", index: true },

    name: { type: String, default: "" },
    title: { type: String, default: "" },        // CR-P-45
    description: { type: String, default: "" },   // CR-P-45
    agreementType: { type: String, default: "Custom" },
    templateId: { type: String, default: "" },
    effectiveDate: { type: String, default: "" },
    startDate: { type: String, default: "" },
    endDate: { type: String, default: "" },
    status: { type: String, enum: ["Draft", "Sent", "Viewed", "PendingSignature", "Signed", "Rejected", "Expired", "Cancelled"], default: "Draft" },

    partySnapshot: {
      party1: { type: PartySchema, default: () => ({}) },
      party2: { type: PartySchema, default: () => ({}) },
      contextLines: { type: [{ label: { type: String, default: "" }, value: { type: String, default: "" } }], default: [] },
    },

    letterhead: { type: String, enum: ["gt", "jv"], default: "gt" },
    jvLogoUrl: { type: String, default: "" },
    documentMode: { type: String, enum: ["built", "uploaded"], default: "built" },
    uploadedDocument: { type: { name: String, filePath: String, fileType: String, size: String }, default: null },
    archived: { type: Boolean, default: false },

    sections: {
      scope: { type: String, default: "" },
      terms: { type: String, default: "" },
      paymentConditions: { type: String, default: "" },
      deliveryConditions: { type: String, default: "" },
      ndaEnabled: { type: Boolean, default: false },
      ndaMode: { type: String, enum: ["text", "file"], default: "text" },
      ndaText: { type: String, default: "" },
      ndaFile: { type: { name: String, url: String }, default: null },
    },
    extraSections: { type: [{ title: { type: String, default: "" }, body: { type: String, default: "" }, status: { type: String, default: "" }, locked: { type: Boolean, default: false }, hidden: { type: Boolean, default: false }, notes: { type: String, default: "" }, assignedTo: { type: String, default: "" }, attachments: { type: [FileSchema], default: [] }, history: { type: [{ at: String, by: String, text: String }], default: [] } }], default: [] },
    // CR-P-49 — tagged reviewer per fixed section.
    sectionAssignees: {
      scope: { type: String, default: "" },
      terms: { type: String, default: "" },
      paymentConditions: { type: String, default: "" },
      deliveryConditions: { type: String, default: "" },
    },

    signatures: {
      company: {
        signerName: { type: String, default: "" }, signerTitle: { type: String, default: "" },
        signerEmail: { type: String, default: "" }, signerPhone: { type: String, default: "" },
        signatureUrl: { type: String, default: "" }, stampUrl: { type: String, default: "" }, signedAt: { type: String, default: "" },
      },
      recipient: {
        signerName: { type: String, default: "" }, signatureUrl: { type: String, default: "" },
        stampUrl: { type: String, default: "" }, signedAt: { type: String, default: "" },
        method: { type: String, enum: ["", "account", "upload"], default: "" },
      },
    },

    signedDocument: { type: { name: String, filePath: String, fileType: String, size: String }, default: null },
    attachments: { type: [FileSchema], default: [] },
    activity: { type: [{ at: { type: Date, default: Date.now }, actorName: { type: String, default: "" }, action: { type: String, default: "" }, note: { type: String, default: "" } }], default: [] },
    sentAt: { type: String, default: "" },
    addedById: { type: String, default: "" },
    addedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IAgreement>("Agreement", AgreementSchema);
