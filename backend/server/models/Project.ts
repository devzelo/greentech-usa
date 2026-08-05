import mongoose, { Schema, Document } from "mongoose";

export interface IProject extends Document {
  projectId: string;
  name: string;
  status: "Ongoing" | "Pending" | "Completed" | "Draft" | "Planning"
    | "Proposal" | "BidSubmitted" | "Active" | "Warranty" | "Closed" | "Lost" | "OnHold";
  category: string;
  contractNo: string;    // the contract number — shown in place of a project number
  contractYear: string;  // the year the project started (shown as the table's Year column)
  // The signed contract document itself — uploaded on the project identity and previewable
  // wherever the project is shown.
  contractFile: { name: string; filePath: string; fileType: string; size: string } | null;
  location: string;
  // Structured project site address; `location` mirrors it as a short "City, Country" string.
  siteAddress: {
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
  progress: number;
  fiscal: string;
  compliance: string;
  value: string; // contract value / project worth (free-form, e.g. "$2.5M" or "USD 2,500,000")
  disciplines: string[];
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
    notes: string;
    // Partner stamp & signature images kept on the partner profile; the PO picks from these.
    stamps: Array<{ name: string; url: string }>;
    signatures: Array<{ name: string; url: string }>;
  };
  timeline: {
    phases: Array<{ name: string; start: string; end: string }>;
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
  tabAccess: Record<string, { employees: boolean }>;
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

const ProjectSchema = new Schema<IProject>(
  {
    projectId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ["Ongoing", "Pending", "Completed", "Draft", "Planning", "Proposal", "BidSubmitted", "Active", "Warranty", "Closed", "Lost", "OnHold"],
      default: "Planning",
    },
    category: { type: String, default: "" },
    contractNo: { type: String, default: "" },
    contractYear: { type: String, default: "" },
    contractFile: { type: { name: String, filePath: String, fileType: String, size: String }, default: null },
    location: { type: String, default: "" },
    siteAddress: {
      type: {
        line1: { type: String, default: "" },
        city: { type: String, default: "" },
        state: { type: String, default: "" },
        postalCode: { type: String, default: "" },
        country: { type: String, default: "" },
      },
      default: () => ({ line1: "", city: "", state: "", postalCode: "", country: "" }),
    },
    description: { type: String, default: "" },
    reportNotes: { type: String, default: "" }, // rich-text HTML narrative shown in the project report PDF
    archived: { type: Boolean, default: false },
    owner: { type: String, default: "" },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    image: { type: String, default: "" },
    published: { type: Boolean, default: false },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    fiscal: { type: String, default: "" },
    compliance: { type: String, default: "" },
    value: { type: String, default: "" },
    disciplines: [{ type: String }],
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
      notes: { type: String, default: "" },
      stamps: { type: [{ name: { type: String, default: "" }, url: { type: String, default: "" } }], default: [] },
      signatures: { type: [{ name: { type: String, default: "" }, url: { type: String, default: "" } }], default: [] },
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
