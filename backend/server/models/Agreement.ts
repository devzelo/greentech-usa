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
  // CR-PR-09 — the Directory company this party is. Empty for employees and legacy rows.
  companyId?: string;
}
export interface IAgreementFile { name: string; filePath: string; fileType: string; size: string; kind: string; print?: boolean; placement?: string }

export interface IAgreement extends Document {
  ownerContextType: AgreementContext;
  ownerUserId: string;        // user context — the employee's User id
  ownerProjectId: string;     // project context
  ownerEntityType: AgreementEntityType;
  ownerEntityId: string;      // subId / vendorId; "jv" for the project's partner

  name: string;               // auto-generated code (GT-…), editable
  // CR-P (23) — the document's own reference, AG-0001, AG-0002, … Assigned by the server from a
  // standalone counter, never reused, and never editable: a number that went out on paper has to
  // keep meaning the same agreement even after that agreement is cancelled or revised.
  agreementNo: string;
  title: string;              // short human title (general agreements) — CR-P-45
  description: string;        // the short description printed under the title — CR-P-45 / (26)
  // CR-P (60) — "Remark": an internal note about the agreement for our own team. Never printed and
  // never sent to a party; the printed text is the description above.
  remark: string;
  /** CR 328 - what the agreement is worth: a figure for finance and the work packages, never printed. */
  contractValue: string;
  agreementType: string;      // Employment | Service | Supply | Partnership | NDA | Custom
  templateId: string;
  // CR-PR-11 — projects this agreement covers. A general agreement may span several, or none.
  // CR-P (27) — the location is snapshotted alongside the name so the printed document keeps the
  // project details it was issued with, the same way the party snapshot does.
  linkedProjects: Array<{ id: string; name: string; location: string }>;
  effectiveDate: string;
  startDate: string;
  endDate: string;
  // CR-P (21) — which of the three dates the document actually carries. Not every agreement has a
  // start and an end, and an unticked date must not print at all (no more "End: —"). A date only
  // prints when its flag is on AND it has a value, so the all-true default is safe for old rows.
  datesShown: { effective: boolean; start: boolean; end: boolean };
  // `status` below is the LIFECYCLE (draft → sent → signed). CR-P (33) adds a separate authoring
  // status for the document as a whole, using the same vocabulary as the per-section statuses:
  // where the writing has got to, as opposed to where the paperwork has got to.
  docStatus: string;
  status: AgreementStatus;

  partySnapshot: {
    party1: IAgreementParty;  // GreenTech (or the JV entity)
    party2: IAgreementParty;  // the employee / project entity
    // CR-P (19) — parties 3 and 4. Bonding applications need three signatories (bank, company,
    // surety) and a JV can add a subcontractor on top, so an agreement holds up to 4 parties.
    // Parties 1 and 2 keep their own fields for backwards compatibility; the rest live here.
    extraParties: IAgreementParty[];
    contextLines: Array<{ label: string; value: string }>; // employee or project+entity info block
  };

  // "gt" = GreenTech letterhead; "jv" = joint-venture (both logos). Chosen per agreement.
  letterhead: "gt" | "jv";
  jvLogoUrl: string;        // the partner / JV logo drawn beside GreenTech's when letterhead = "jv"
  // CR-P (30) — the JV partner is CHOSEN FROM THE DIRECTORY, not uploaded by hand. These record
  // which company was picked; the logo above is copied from that company's Directory record so
  // the letterhead is the same wherever the partner appears.
  jvPartnerId: string;
  jvPartnerName: string;

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
    // CR-P (45) — the standard terms & conditions, handled exactly like the NDA: ticked on, then
    // either written inline or attached from Company Documents, and stapled after the signatures.
    stdTermsEnabled: boolean;
    stdTermsMode: "text" | "file";
    stdTermsText: string;
    stdTermsFile: { name: string; url: string } | null;
  };
  // CR-P (42)/(44) — a section attachment prints by default, right after its own section, and
  // can instead be pushed to the back as an appendix or held back from the document entirely.
  // CR-P (36) — `id` is a stable section id, so live changes merge section by section.
  extraSections: Array<{ id?: string; title: string; body: string; status?: string; locked?: boolean; hidden?: boolean; notes?: string; assignedTo?: string; attachments?: Array<{ name: string; filePath: string; fileType: string; size: string; kind?: string; print?: boolean; placement?: string }>; history?: Array<{ at: string; by: string; text: string }> }>;  // custom named rich-text sections (HTML) + per-section state (CR-B-15/17/18/19a)
  // CR-P-49 — colleague tagged to review each fixed section (parallels extraSections.assignedTo).
  sectionAssignees: { scope: string; terms: string; paymentConditions: string; deliveryConditions: string };

  signatures: {
    company: { signerName: string; signerTitle: string; signerEmail: string; signerPhone: string; signatureUrl: string; stampUrl: string; signedAt: string };
    recipient: { signerName: string; signatureUrl: string; stampUrl: string; signedAt: string; method: "" | "account" | "upload" };
    // CR-P (46) — parties 3 and 4 sign too. Indexed to match partySnapshot.extraParties, so
    // extra[0] belongs to party 3. Empty entries print an empty block for a wet signature.
    extra: Array<{ signerName: string; signerTitle: string; signatureUrl: string; stampUrl: string; signedAt: string; method: "" | "account" | "upload" }>;
  };

  signedDocument: { name: string; filePath: string; fileType: string; size: string } | null; // frozen PDF once Signed
  // CR-P (56)/(57) — the agreement's current PDF, made on demand for Copy link / Email / Notify a
  // teammate. A built agreement has no stored file until it is signed, so there was nothing to share.
  shareCopy: { name: string; filePath: string; fileType: string; size: string; madeAt: string } | null;
  // CR-P (52) — every signed copy that was replaced, newest last. A counterparty re-sending a
  // corrected scan must not erase the one we had on file: the record of what we held, and when,
  // is part of the paper trail.
  signedDocumentHistory: Array<{ name: string; filePath: string; fileType: string; size: string; replacedAt: string; replacedByName: string }>;
  attachments: IAgreementFile[];   // e.g. the counter-signed copy received back from a vendor
  activity: Array<{ at: Date; actorName: string; action: string; note: string }>;
  sentAt: string;
  // CR-P (62)/(63) — WHO may see this agreement. A party being named on the document is not the
  // same as being given it: until we share it, the draft is internal and may hold terms we are
  // still arguing about. Only companies listed here see it on their own profile.
  visibleTo: Array<{ companyId: string; name: string; email: string; grantedAt: string; grantedByName: string }>;
  // CR-P (61) — the record of every send: "so we know who we already sent and when".
  shares: Array<{ companyId: string; name: string; email: string; purpose: string; sentAt: string; sentByName: string; note: string }>;
  addedById: string;
  addedByName: string;
}

const PartySchema = new Schema<IAgreementParty>(
  { name: { type: String, default: "" }, contactName: { type: String, default: "" }, address: { type: String, default: "" }, email: { type: String, default: "" }, phone: { type: String, default: "" }, logoUrl: { type: String, default: "" }, companyId: { type: String, default: "" } },
  { _id: false }
);
const FileSchema = new Schema<IAgreementFile>(
  {
    name: String, filePath: String, fileType: String, size: String, kind: { type: String, default: "other" },
    // CR-P (44) — most attachments are meant to be printed, so that is the default.
    print: { type: Boolean, default: true },
    // CR-P (42) — "after" prints it straight after its section; "end" holds it back as an appendix.
    placement: { type: String, enum: ["after", "end"], default: "after" },
  },
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
    agreementNo: { type: String, default: "", index: true },   // CR-P (23) — AG-0001, AG-0002, …
    title: { type: String, default: "" },        // CR-P-45
    description: { type: String, default: "" },   // CR-P-45
    remark: { type: String, default: "" },        // CR-P (60) — internal, never printed
    contractValue: { type: String, default: "" }, // CR 328 — internal, never printed
    agreementType: { type: String, default: "Custom" },
    templateId: { type: String, default: "" },
    linkedProjects: { type: [{ id: { type: String, default: "" }, name: { type: String, default: "" }, location: { type: String, default: "" } }], default: [] },
    effectiveDate: { type: String, default: "" },
    startDate: { type: String, default: "" },
    endDate: { type: String, default: "" },
    datesShown: {  // CR-P (21)
      effective: { type: Boolean, default: true },
      start: { type: Boolean, default: true },
      end: { type: Boolean, default: true },
    },
    docStatus: { type: String, default: "" },   // CR-P (33) — authoring status of the whole document
    status: { type: String, enum: ["Draft", "Sent", "Viewed", "PendingSignature", "Signed", "Rejected", "Expired", "Cancelled"], default: "Draft" },

    partySnapshot: {
      party1: { type: PartySchema, default: () => ({}) },
      party2: { type: PartySchema, default: () => ({}) },
      extraParties: { type: [PartySchema], default: [] },  // CR-P (19) — parties 3 and 4
      contextLines: { type: [{ label: { type: String, default: "" }, value: { type: String, default: "" } }], default: [] },
    },

    letterhead: { type: String, enum: ["gt", "jv"], default: "gt" },
    jvLogoUrl: { type: String, default: "" },
    jvPartnerId: { type: String, default: "" },      // CR-P (30)
    jvPartnerName: { type: String, default: "" },    // CR-P (30)
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
      stdTermsEnabled: { type: Boolean, default: false },                                  // CR-P (45)
      stdTermsMode: { type: String, enum: ["text", "file"], default: "file" },
      stdTermsText: { type: String, default: "" },
      stdTermsFile: { type: { name: String, url: String }, default: null },
    },
    extraSections: { type: [{ id: { type: String, default: "" }, title: { type: String, default: "" }, body: { type: String, default: "" }, status: { type: String, default: "" }, locked: { type: Boolean, default: false }, hidden: { type: Boolean, default: false }, notes: { type: String, default: "" }, assignedTo: { type: String, default: "" }, attachments: { type: [FileSchema], default: [] }, history: { type: [{ at: String, by: String, text: String }], default: [] } }], default: [] },
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
      // CR-P (46) — signature slots for parties 3 and 4.
      extra: {
        type: [{
          signerName: { type: String, default: "" }, signerTitle: { type: String, default: "" },
          signatureUrl: { type: String, default: "" }, stampUrl: { type: String, default: "" },
          signedAt: { type: String, default: "" },
          method: { type: String, enum: ["", "account", "upload"], default: "" },
        }],
        default: [],
      },
    },

    signedDocument: { type: { name: String, filePath: String, fileType: String, size: String }, default: null },
    shareCopy: { type: { name: String, filePath: String, fileType: String, size: String, madeAt: String }, default: null },  // CR-P (56)
    signedDocumentHistory: {   // CR-P (52)
      type: [{ name: String, filePath: String, fileType: String, size: String, replacedAt: String, replacedByName: String }],
      default: [],
    },
    attachments: { type: [FileSchema], default: [] },
    activity: { type: [{ at: { type: Date, default: Date.now }, actorName: { type: String, default: "" }, action: { type: String, default: "" }, note: { type: String, default: "" } }], default: [] },
    sentAt: { type: String, default: "" },
    visibleTo: {   // CR-P (62)/(63)
      type: [{ companyId: { type: String, default: "" }, name: { type: String, default: "" }, email: { type: String, default: "" }, grantedAt: { type: String, default: "" }, grantedByName: { type: String, default: "" } }],
      default: [],
    },
    shares: {      // CR-P (61)
      type: [{ companyId: { type: String, default: "" }, name: { type: String, default: "" }, email: { type: String, default: "" }, purpose: { type: String, default: "review" }, sentAt: { type: String, default: "" }, sentByName: { type: String, default: "" }, note: { type: String, default: "" } }],
      default: [],
    },
    addedById: { type: String, default: "" },
    addedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IAgreement>("Agreement", AgreementSchema);
