import mongoose, { Schema, Document } from "mongoose";

// CR 328 (2026-09-28): Work Packages. The project manager's master list of everything the project
// has to get done (design, equipment packages, civil work, a crane service, testing...), each with
// who does it, its RFQ, quotes, winner, PO or agreement, status, progress and money.
//
// The RFQ, PO and agreement are the existing Procurement and agreement records, linked here by id
// and never copied: what the table shows about them is read from them each time. The money (the
// PO's total, what has been paid on the vendor's invoices) is read the same way; only the budget
// and the change orders are typed here.
export const WP_STATUSES = ["not_started", "in_progress", "complete", "on_hold", "cancelled"] as const;
export type WorkPackageStatus = (typeof WP_STATUSES)[number];
export const WP_TYPES = ["design", "equipment", "civil", "installation", "controls", "lifting", "transport", "testing", "commissioning", "other"] as const;

export interface IWorkSubtask { id: string; name: string; status: WorkPackageStatus; progress: number; dueDate: string; assignee: string }
export interface IChangeOrder { id: string; no: string; date: string; reason: string; amount: number; status: "proposed" | "approved"; document: string }

export interface IWorkPackage extends Document {
  projectId: string;
  order: number;
  name: string;
  description: string;
  type: string;
  /** Who does it: GT / the JV, or an outside company from the Directory (empty until one is chosen or a quote is awarded). */
  responsible: { kind: "internal" | "company"; companyId: string; name: string };
  rfqId: string;
  poId: string;
  agreementId: string;
  status: WorkPackageStatus;
  /** How progress is measured: the average of the subtasks, a typed figure, or a task / phase of the schedule. */
  progressMode: "subtasks" | "manual" | "schedule";
  progress: number;
  scheduleRef: { kind: "" | "task" | "phase"; id: string };
  subtasks: IWorkSubtask[];
  /** The contract value when no PO carries it (an agreement, or internal work): a typed figure. */
  budget: number;
  changeOrders: IChangeOrder[];
  remarks: string;
  archived: boolean;
  createdByName: string;
}

const WorkPackageSchema = new Schema<IWorkPackage>(
  {
    projectId: { type: String, required: true, index: true },
    order: { type: Number, default: 0 },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    type: { type: String, enum: WP_TYPES, default: "other" },
    responsible: {
      kind: { type: String, enum: ["internal", "company"], default: "company" },
      companyId: { type: String, default: "" },
      name: { type: String, default: "" },
    },
    rfqId: { type: String, default: "" },
    poId: { type: String, default: "" },
    agreementId: { type: String, default: "" },
    status: { type: String, enum: WP_STATUSES, default: "not_started" },
    progressMode: { type: String, enum: ["subtasks", "manual", "schedule"], default: "manual" },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    scheduleRef: { kind: { type: String, enum: ["", "task", "phase"], default: "" }, id: { type: String, default: "" } },
    subtasks: {
      type: [{
        _id: false,
        id: { type: String, default: "" },
        name: { type: String, default: "" },
        status: { type: String, enum: WP_STATUSES, default: "not_started" },
        progress: { type: Number, default: 0, min: 0, max: 100 },
        dueDate: { type: String, default: "" },
        assignee: { type: String, default: "" },
      }],
      default: [],
    },
    budget: { type: Number, default: 0 },
    changeOrders: {
      type: [{
        _id: false,
        id: { type: String, default: "" },
        no: { type: String, default: "" },
        date: { type: String, default: "" },
        reason: { type: String, default: "" },
        amount: { type: Number, default: 0 },
        status: { type: String, enum: ["proposed", "approved"], default: "approved" },
        document: { type: String, default: "" },
      }],
      default: [],
    },
    remarks: { type: String, default: "" },
    archived: { type: Boolean, default: false },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true }
);
WorkPackageSchema.index({ projectId: 1, order: 1 });

export default mongoose.model<IWorkPackage>("WorkPackage", WorkPackageSchema);
