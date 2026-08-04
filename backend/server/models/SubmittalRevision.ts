import mongoose, { Schema, Document } from "mongoose";

// An IMMUTABLE revision of a submittal package. New revisions are inserted; older ones are
// marked Superseded (isCurrent=false) but never edited or deleted — this revision history is
// the claims artifact. Only the current, not-yet-dispositioned revision can take new
// attachments / a disposition.
export interface ISubmittalAttachment { name: string; filePath: string; fileType: string; size: string; component: string; decision: string }

export type SubmittalDisposition =
  | "Pending" | "Approved" | "ApprovedAsNoted" | "ReviseResubmit" | "Rejected" | "Superseded";

export interface ISubmittalRevision extends Document {
  submittalId: string;
  projectId: string;
  revisionNo: number;
  optionLabel: string;       // the brand / option submitted in this revision (e.g. "United PVC pipe")
  disposition: SubmittalDisposition;
  notes: string;             // reviewer / client comments
  sentToClientAt: string;    // date string
  respondedAt: string;       // date string
  attachments: ISubmittalAttachment[];
  isCurrent: boolean;
  createdByName: string;
}

const AttachmentSchema = new Schema<ISubmittalAttachment>(
  {
    name: { type: String, default: "" },
    filePath: { type: String, default: "" },
    fileType: { type: String, default: "" },
    size: { type: String, default: "" },
    component: { type: String, default: "other" }, // cover | spec | catalog | drawing | photo | other | clientLetter
    decision: { type: String, default: "" },        // for clientLetter only: which client decision this letter is (Approved | Rejected | …), auto-grabbed from the revision's disposition on upload
  },
  { _id: true }
);

const SubmittalRevisionSchema = new Schema<ISubmittalRevision>(
  {
    submittalId: { type: String, required: true, index: true },
    projectId: { type: String, required: true, index: true },
    revisionNo: { type: Number, default: 0 },
    optionLabel: { type: String, default: "" },
    disposition: {
      type: String,
      enum: ["Pending", "Approved", "ApprovedAsNoted", "ReviseResubmit", "Rejected", "Superseded"],
      default: "Pending",
    },
    notes: { type: String, default: "" },
    sentToClientAt: { type: String, default: "" },
    respondedAt: { type: String, default: "" },
    attachments: { type: [AttachmentSchema], default: [] },
    isCurrent: { type: Boolean, default: true },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<ISubmittalRevision>("SubmittalRevision", SubmittalRevisionSchema);
