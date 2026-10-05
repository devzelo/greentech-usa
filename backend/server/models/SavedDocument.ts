import mongoose, { Schema, Document } from "mongoose";

// A frozen, versioned copy of a produced document (the exact PDF/Excel that was generated).
// Project-scoped docs (proposal/boq/rfq/po) carry projectId; resume versions carry userId.
// `refId` pins a version to a specific record when there are many per project (a given RFQ or PO).
// Version numbers auto-increment within a (scope + kind + refId) stream.
export type SavedDocKind = "proposal" | "boq" | "rfq" | "po" | "resume";

export interface ISavedDocument extends Document {
  kind: SavedDocKind;
  projectId: string;
  userId: mongoose.Types.ObjectId | null;
  refId: string;
  version: number;
  title: string;
  note: string;
  // CR-P (83) — a proposal revision moves through more than draft/final: it gets sent, submitted,
  // and eventually won or lost. "final" is kept as-is so nothing existing changes meaning.
  status: SavedDocStatus;
  fileName: string;
  filePath: string;
  fileType: string;
  size: string;
  createdById: mongoose.Types.ObjectId | null;
  createdByName: string;
  // CR-P (83) - the table shows "created" and "last modified" separately, each with a name.
  updatedByName: string;
  // CR-P (86) - archived revisions leave the table but are kept, and listed in Archive & Bin.
  archived: boolean;
  // CR-P (88) - the date ON the document (YYYY-MM-DD), e.g. when an uploaded proposal was issued.
  // Empty for ones built here, whose date is simply when they were filed.
  docDate: string;
  // Item 110 - who a revision went to, when and how (emailed from here, or sent another way).
  sendLog: Array<{ at: Date; to: string; method: string; byName: string; note: string }>;
}

/**
 * How a saved version is named outside its own table (Archive & Bin). Proposals count revisions
 * from Rev 0 and have their own bin kind so a restore link can open the Proposals tab.
 */
export function describeSavedDoc(d: { kind: string; refId?: string; version?: number; title?: string }) {
  const isProposal = d.kind === "proposal";
  const stream = isProposal
    ? `${d.refId ? d.refId.charAt(0).toUpperCase() + d.refId.slice(1) + " " : ""}proposal`
    : d.kind.toUpperCase();
  const num = isProposal ? `Rev ${Math.max(0, (d.version || 1) - 1)}` : `v${d.version || 1}`;
  return {
    binKind: isProposal ? "saved-proposal" : "saved-document",
    name: d.title || `${stream} ${num}`,
    subtitle: `${stream.charAt(0).toUpperCase() + stream.slice(1)} · ${num}`,
  };
}

// CR 356 - one short list for every proposal, in order: Draft, Final - Not submitted, Submitted -
// Sent (in review by the client), In negotiation, Awarded, Not awarded. "Completed" and "Sent" were
// the same step as Submitted and are folded into it (see LEGACY_SAVED_DOC_STATUS).
export const SAVED_DOC_STATUSES = ["draft", "final", "submitted", "negotiation", "awarded", "not-awarded"] as const;
export type SavedDocStatus = (typeof SAVED_DOC_STATUSES)[number];
/** Statuses no longer offered, and the one each now means. */
export const LEGACY_SAVED_DOC_STATUS: Record<string, SavedDocStatus> = { completed: "submitted", sent: "submitted" };
/** A status from a request: a current one, an old name mapped to its new one, or null. */
export function savedDocStatus(v: unknown): SavedDocStatus | null {
  const s = String(v || "");
  if ((SAVED_DOC_STATUSES as readonly string[]).includes(s)) return s as SavedDocStatus;
  return LEGACY_SAVED_DOC_STATUS[s] || null;
}

const SavedDocumentSchema = new Schema<ISavedDocument>(
  {
    kind: { type: String, enum: ["proposal", "boq", "rfq", "po", "resume"], required: true, index: true },
    projectId: { type: String, default: "", index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    refId: { type: String, default: "" },
    version: { type: Number, default: 1 },
    title: { type: String, default: "" },
    note: { type: String, default: "" },
    status: { type: String, enum: SAVED_DOC_STATUSES, default: "draft" },
    fileName: { type: String, default: "" },
    filePath: { type: String, default: "" },
    fileType: { type: String, default: "" },
    size: { type: String, default: "" },
    createdById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdByName: { type: String, default: "" },
    updatedByName: { type: String, default: "" },
    archived: { type: Boolean, default: false, index: true },
    docDate: { type: String, default: "" },
    sendLog: {
      type: [{
        at: { type: Date, default: Date.now },
        to: { type: String, default: "" },
        method: { type: String, default: "" },
        byName: { type: String, default: "" },
        note: { type: String, default: "" },
      }],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model<ISavedDocument>("SavedDocument", SavedDocumentSchema);
