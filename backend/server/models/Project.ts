import mongoose, { Schema, Document } from "mongoose";

// CR 188-192: one phase / milestone on the project timeline. Dates are yyyy-mm-dd. Phases are not
// chained: each has its own planned and actual dates, and the first planned dates are kept as the
// baseline. `duration` / `unit` / `doneAt` are the older chained schedule (read for migration).
export interface MilestoneRecord {
  id: string; key: string; name: string; description: string;
  plannedStart: string; plannedEnd: string; baselineStart: string; baselineEnd: string;
  actualStart: string; actualEnd: string;
  durationValue: number; durationUnit: "days" | "weeks" | "months";
  status: string; percent: number; responsible: string[]; notes: string;
  category: string;   // CR 238 - the group a task sits in (Design, Procurement, Construction...)
  // CR 294 - the schedule as a chain: what this task waits on, how, and by how much.
  dependsOn: string;                 // the id of the task it follows ("" = it stands alone)
  linkType: "FS" | "SS" | "FF" | "SF";
  lagDays: number;                   // + waits, - overlaps
  isMilestone: boolean;              // no length: start and finish are the same day
  inc?: boolean; includeWeekends?: boolean; includeHolidays?: boolean;   // CR 322
  // CR 321 - where the start comes from, and the form's other details.
  startMode?: string; manualStart?: string; priority?: string; tags?: string[]; icon?: string;
  // CR 300 - every task this one waits on, each with its own link type and lag.
  predecessors: Array<{ id: string; type: "FS" | "SS" | "FF" | "SF"; lag: number }>;
  duration: number; unit: "days" | "weeks" | "months"; doneAt: string; doneBy: string;
}

export interface IProject extends Document {
  projectId: string;
  /** CR 297 - numbers this project carried before, so an old link or bookmark still opens it. */
  previousIds: string[];
  name: string;
  status: "Ongoing" | "Pending" | "Completed" | "Draft" | "Planning"
    | "Proposal" | "BidSubmitted" | "Active" | "Warranty" | "Closed" | "Lost" | "OnHold";
  category: string;
  categories: string[];  // item 101 - a project can cover several services (WTP, HVAC, piping); `category` mirrors the first
  contractType: string;  // proposal data sheets: FFP, IDIQ task order, T&M, ...
  cpars: string;         // "Yes" | "No" | "Pending" | "" - a CPARS / Government evaluation is on file
  contractNo: string;
  // CR 289 - the solicitation the project was bid under, beside the contract number.
  solicitationNo: string;    // the contract number — shown in place of a project number
  contractYear: string;  // the year the project started (shown as the table's Year column)
  contractDate: string;  // the exact contract date (ISO yyyy-mm-dd), parallel to contractYear
  // The signed contract document itself — uploaded on the project identity and previewable
  // wherever the project is shown.
  contractFile: { name: string; filePath: string; fileType: string; size: string } | null;
  location: string;
  // Structured project site address; `location` mirrors it as a short "City, Country" string.
  siteAddress: {
    full: string;       // CR 186: the whole address pasted as written (any country's format)
    line1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  description: string;
  reportNotes: string;
  archived: boolean;   // archived projects are hidden from normal lists, shown in the Archived view
  owner: string;
  ownerId: mongoose.Types.ObjectId | null;
  image: string;
  published: boolean;
  financialProposalLocked: boolean;  // CR-B-19b — Financial Proposal is owner-only when true
  progress: number;
  fiscal: string;
  compliance: string;
  value: string; // contract value / project worth (free-form, e.g. "$2.5M" or "USD 2,500,000")
  /** CR 309 - bonds and letter of credit (see lib/bonding.ts). */
  bonding?: Record<string, unknown>;
  /** CR 312 - figures for the bank reports (see lib/bonding.ts cleanWip). */
  wip?: Record<string, unknown>;
  // Financial figures access (client request, 2026-09-11) — per person (userId → on/off), who sees
  // the project's value and its expense / income / profit totals. With no entry, GT staff see them
  // and outside logins do not (lib/access canSeeFigures).
  figuresAccess: Record<string, boolean>;
  disciplines: string[];
  /** CR 277 - the key scope of work, one bullet per line, shown in About This Project. */
  scopeOfWork: string[];
  startDate: string;
  endDate: string;
  projectNature: {
    selected: string[];
    custom: string[];
  };
  clientInfo: {
    name: string;
    reference: string;
    contactName: string;
    email: string;
    phone: string;
    country: string;
    address: string;
    notes: string;
    // CR-P (127)/(128) — the Directory company the client was picked from, so the project and the
    // company stay linked (the company's page lists this project).
    companyId: string;
  };
  jointVenture: {
    enabled: boolean;
    partnerName: string;
    partnerAddress: string;
    contactName: string;
    email: string;
    phone: string;
    lead: string;   // who leads (e.g. "GreenTech 51% / Partner 49%")
    logo: string;   // partner logo file path (optional)
    // CR-P (31) — the Directory company the partner was picked from, so the project stays linked
    // to that one record (its logo became the project's JV letterhead when it was picked).
    companyId: string;
    notes: string;
    // Partner stamp & signature images kept on the partner profile; the PO picks from these.
    stamps: Array<{ name: string; url: string }>;
    signatures: Array<{ name: string; url: string }>;
    // Proposal step 8 - the JV as its own registered entity (EOIs, proposals).
    legalName: string;
    uei: string;
    cage: string;
    legalAddress: string;
    combinedLogo: string;
  };
  timeline: {
    phases: Array<{ name: string; start: string; end: string }>;
  };
  // CR-P (121)-(125) — the project's milestones, run one after another from the start date. Each
  // has a duration; the project manager confirms it finished (doneAt), which counts toward progress.
  schedule: {
    milestones: MilestoneRecord[];
    // Timeline work saved as a draft (not live) until the PM saves it.
    draft: { milestones: MilestoneRecord[]; categories?: string[]; phaseInfo?: unknown[]; savedAt: string; savedBy: string } | null;
    // CR-P (126) — approved extensions of time. The latest endDate is the project's deadline now;
    // the project's own endDate stays the original one.
    extensions: Array<{ id: string; endDate: string; reason: string; addedAt: string; addedBy: string }>;
    /** The master schedule's categories, in order (like BOQ sections). Empty ones are kept. */
    categories: string[];
    /** CR 321 - each phase's details (colour, dates set by hand, what it waits on), by name. */
    phaseInfo?: unknown[];
    /** CR 317 - when Current was last saved, and by whom (a plain Save files no history record). */
    savedAt?: string;
    savedBy?: string;
    /** CR 326 - a line describing the schedule, shown under its title. */
    description?: string;
    /** CR 317 - how often this project's schedule is filed in History: weekly, monthly or one-off. */
    historyCadence?: string;
    // Schedules beside the master (a Design schedule, a Construction schedule...). Since the client's
    // 2026-09-21 review each is separate: its own tasks, categories, draft and revisions, made from
    // scratch. `own` marks the ones already moved off the old "view of the master" model.
    subs: Array<{
      id: string; name: string; categories: string[];
      milestones: MilestoneRecord[];
      draft: { milestones: MilestoneRecord[]; categories?: string[]; savedAt: string; savedBy: string } | null;
      own: boolean;
    }>;
  };
  assignedEmployees: string[];
  subcontractors: Array<{
    name: string;
    scope: string;
    subId: string;
    contact: string;
    email: string;
    phone: string;
    notes: string;
    invoiceAmount: string; // legacy manual total (kept for back-compat; income now sums the invoice table)
    userId: string; // linked login account id — ties their logged expenses to this record
    acceptedOfferId?: string; // §L — the accepted offer's document id (gates Agreement & Scope)
    customTabs?: Array<{ tabId: string; label: string; parentId: string; notes: string }>; // per-sub custom tab tree
  }>;
  customTabs: Array<{
    tabId: string;
    label: string;
    notes: string;
    color?: string;
    parentId?: string;
    fields?: Array<{
      fieldId: string;
      label: string;
      type: string;
      options?: string[];
      value?: string;
    }>;
  }>;
  // Custom sub-tabs for the JV partner (About Partners tab) — each holds custom fields + files.
  partnerTabs: Array<{
    tabId: string;
    label: string;
    notes: string;
    fields?: Array<{ fieldId: string; label: string; type: string; options?: string[]; value?: string }>;
  }>;
  tabAccess: Record<string, { employees: boolean; employeeIds?: string[] }>;
  // Public showcase
  gallery: Array<{ type: "image" | "video"; source: "upload" | "link"; url: string; caption?: string }>;
  showClientName: boolean;
  // Subcontractor access: each subcontractor User gets per-tab access on this project.
  // tabPermissions[tabId] = "view" | "edit"; a tab absent from the map is hidden.
  // expiresAt: optional access timeline — once passed, access is denied automatically.
  guests: Array<{
    userId: mongoose.Types.ObjectId;
    tabPermissions: Record<string, "view" | "edit">;
    expiresAt?: Date | null;
  }>;
  proposals: {
    technical: { submissionDate: string; status: string };
    financial: { submissionDate: string; status: string };
  };
  // Full proposal builder content (Technical + Financial). Kept flexible (Mixed)
  // because the exact fields track the client's proposal templates.
  proposalContent: Record<string, unknown>;
}

const MilestoneSchema = new Schema({
  id: { type: String, default: "" },
  key: { type: String, default: "" },           // master-list key, "custom" for a manual phase
  name: { type: String, default: "" },
  description: { type: String, default: "" },
  plannedStart: { type: String, default: "" },
  plannedEnd: { type: String, default: "" },
  baselineStart: { type: String, default: "" },
  baselineEnd: { type: String, default: "" },
  actualStart: { type: String, default: "" },
  actualEnd: { type: String, default: "" },
  durationValue: { type: Number, default: 0, min: 0 },
  durationUnit: { type: String, enum: ["days", "weeks", "months"], default: "days" },
  status: { type: String, default: "not_started" },
  percent: { type: Number, default: 0, min: 0, max: 100 },
  responsible: { type: [String], default: [] },
  notes: { type: String, default: "" },
  category: { type: String, default: "" },      // CR 238 - Award / NTP, Design, Procurement, Construction...
  dependsOn: { type: String, default: "" },
  linkType: { type: String, enum: ["FS", "SS", "FF", "SF"], default: "FS" },
  lagDays: { type: Number, default: 0 },
  isMilestone: { type: Boolean, default: false },
  // CR 322 - `inc`: kept under the inclusive day count (a row without it is converted when read).
  // A task counts every calendar day unless weekends or holidays are switched off.
  inc: { type: Boolean, default: false },
  includeWeekends: { type: Boolean, default: true },
  includeHolidays: { type: Boolean, default: true },
  // CR 321 - "" leaves a row as it was before the forms: linked rows follow their links.
  startMode: { type: String, enum: ["", "auto", "manual"], default: "" },
  manualStart: { type: String, default: "" },
  priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },
  tags: { type: [String], default: [] },
  icon: { type: String, enum: ["diamond", "flag", "star", "circle"], default: "diamond" },
  predecessors: { type: [{ id: { type: String, default: "" }, type: { type: String, enum: ["FS", "SS", "FF", "SF"], default: "FS" }, lag: { type: Number, default: 0 } }], default: [] },
  // Older chained schedule
  duration: { type: Number, default: 0, min: 0 },
  unit: { type: String, enum: ["days", "weeks", "months"], default: "days" },
  doneAt: { type: String, default: "" },
  doneBy: { type: String, default: "" },
}, { _id: false });

const ProjectSchema = new Schema<IProject>(
  {
    projectId: { type: String, required: true, unique: true },
    previousIds: { type: [String], default: [], index: true },
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ["Ongoing", "Pending", "Completed", "Draft", "Planning", "Proposal", "BidSubmitted", "Active", "Warranty", "Closed", "Lost", "OnHold"],
      default: "Planning",
    },
    category: { type: String, default: "" },
    categories: [{ type: String }],
    contractType: { type: String, default: "" },
    cpars: { type: String, default: "" },
    contractNo: { type: String, default: "" },
    solicitationNo: { type: String, default: "" },
    contractYear: { type: String, default: "" },
    contractDate: { type: String, default: "" },   // exact contract date (parallel to contractYear)
    contractFile: { type: { name: String, filePath: String, fileType: String, size: String }, default: null },
    location: { type: String, default: "" },
    siteAddress: {
      type: {
        full: { type: String, default: "" },
        line1: { type: String, default: "" },
        city: { type: String, default: "" },
        state: { type: String, default: "" },
        postalCode: { type: String, default: "" },
        country: { type: String, default: "" },
      },
      default: () => ({ full: "", line1: "", city: "", state: "", postalCode: "", country: "" }),
    },
    description: { type: String, default: "" },
    reportNotes: { type: String, default: "" }, // rich-text HTML narrative shown in the project report PDF
    archived: { type: Boolean, default: false },
    owner: { type: String, default: "" },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    image: { type: String, default: "" },
    published: { type: Boolean, default: false },
    financialProposalLocked: { type: Boolean, default: false },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    fiscal: { type: String, default: "" },
    compliance: { type: String, default: "" },
    value: { type: String, default: "" },
    bonding: { type: Schema.Types.Mixed, default: undefined },
    wip: { type: Schema.Types.Mixed, default: undefined },
    figuresAccess: { type: Schema.Types.Mixed, default: {} },   // financial figures access, per userId
    disciplines: [{ type: String }],
    scopeOfWork: { type: [String], default: [] },
    startDate: { type: String, default: "" },
    endDate: { type: String, default: "" },
    projectNature: {
      selected: [{ type: String }],
      custom: [{ type: String }],
    },
    clientInfo: {
      name: { type: String, default: "" },
      reference: { type: String, default: "" },
      contactName: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      country: { type: String, default: "" },
      address: { type: String, default: "" },
      notes: { type: String, default: "" },
      companyId: { type: String, default: "" },   // CR-P (127)/(128)
    },
    jointVenture: {
      enabled: { type: Boolean, default: false },
      partnerName: { type: String, default: "" },
      partnerAddress: { type: String, default: "" },
      contactName: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      lead: { type: String, default: "" },
      logo: { type: String, default: "" },
      companyId: { type: String, default: "" },   // CR-P (31)
      notes: { type: String, default: "" },
      stamps: { type: [{ name: { type: String, default: "" }, url: { type: String, default: "" } }], default: [] },
      signatures: { type: [{ name: { type: String, default: "" }, url: { type: String, default: "" } }], default: [] },
      legalName: { type: String, default: "" },
      uei: { type: String, default: "" },
      cage: { type: String, default: "" },
      legalAddress: { type: String, default: "" },
      combinedLogo: { type: String, default: "" },
    },
    timeline: {
      phases: [
        {
          name: { type: String, default: "" },
          start: { type: String, default: "" },
          end: { type: String, default: "" },
        },
      ],
    },
    schedule: {
      milestones: { type: [MilestoneSchema], default: [] },
      draft: {
        type: new Schema({ milestones: { type: [MilestoneSchema], default: [] }, categories: { type: [String], default: [] }, phaseInfo: { type: [Schema.Types.Mixed], default: [] }, savedAt: { type: String, default: "" }, savedBy: { type: String, default: "" } }, { _id: false }),
        default: null,
      },
      phaseInfo: { type: [Schema.Types.Mixed], default: [] },
      savedAt: { type: String, default: "" },
      savedBy: { type: String, default: "" },
      description: { type: String, default: "" },
      historyCadence: { type: String, enum: ["", "weekly", "monthly", "oneoff"], default: "" },
      extensions: {
        type: [{
          id: { type: String, default: "" },
          endDate: { type: String, default: "" },
          reason: { type: String, default: "" },
          addedAt: { type: String, default: "" },
          addedBy: { type: String, default: "" },
          _id: false,
        }],
        default: [],
      },
      categories: { type: [String], default: [] },
      subs: {
        type: [{
          id: { type: String, default: "" },
          name: { type: String, default: "" },
          categories: { type: [String], default: [] },
          milestones: { type: [MilestoneSchema], default: [] },
          draft: { type: Schema.Types.Mixed, default: null },
          own: { type: Boolean, default: false },
          _id: false,
        }],
        default: [],
      },
    },
    assignedEmployees: [{ type: String }],
    subcontractors: [
      {
        name: { type: String, default: "" },
        scope: { type: String, default: "" },
        subId: { type: String, default: "" },
        contact: { type: String, default: "" },
        email: { type: String, default: "" },
        phone: { type: String, default: "" },
        notes: { type: String, default: "" },
        invoiceAmount: { type: String, default: "" },
        userId: { type: String, default: "" },
        acceptedOfferId: { type: String, default: "" },
        customTabs: [{ tabId: String, label: String, parentId: { type: String, default: "" }, notes: { type: String, default: "" } }],
      },
    ],
    customTabs: [
      {
        tabId: { type: String },
        label: { type: String },
        notes: { type: String, default: "" },
        color: { type: String, default: "" },
        parentId: { type: String, default: "" },
        fields: [
          {
            fieldId: { type: String },
            label: { type: String, default: "" },
            type: { type: String, default: "text" },
            options: [{ type: String }],
            value: { type: String, default: "" },
          },
        ],
      },
    ],
    partnerTabs: [
      {
        tabId: { type: String },
        label: { type: String, default: "" },
        notes: { type: String, default: "" },
        fields: [{ fieldId: { type: String }, label: { type: String, default: "" }, type: { type: String, default: "text" }, options: [{ type: String }], value: { type: String, default: "" } }],
      },
    ],
    tabAccess: { type: Schema.Types.Mixed, default: {} },
    gallery: [
      {
        type: { type: String, enum: ["image", "video"], default: "image" },
        source: { type: String, enum: ["upload", "link"], default: "upload" },
        url: { type: String, required: true },
        caption: { type: String, default: "" },
      },
    ],
    showClientName: { type: Boolean, default: true },
    guests: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        tabPermissions: { type: Schema.Types.Mixed, default: {} },
        expiresAt: { type: Date, default: null },
      },
    ],
    proposals: {
      technical: {
        submissionDate: { type: String, default: "" },
        status: { type: String, default: "Draft" },
      },
      financial: {
        submissionDate: { type: String, default: "" },
        status: { type: String, default: "Draft" },
      },
    },
    proposalContent: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model<IProject>("Project", ProjectSchema);
