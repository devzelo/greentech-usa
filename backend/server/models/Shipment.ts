import mongoose, { Schema, Document } from "mongoose";

// A shipment groups the documents for one delivery. Each shipment has a set of document rows
// (Commercial Invoice, Packing List, …) and every row can hold MANY uploaded files plus a
// free-text remarks note. Rows are renamable / removable and extra rows can be added.
// The shipment itself carries logistics info (from/to, status, deadline) and links to the
// purchase orders it delivers — updating the shipment status cascades onto those POs' items
// in the Master Log.
export type ShipmentStatus =
  | "Preparing" | "Fabrication" | "Transit" | "Clearance" | "Warehouse" | "Delivered";

export interface IShipmentFile { name: string; filePath: string; fileType: string; size: string }
export interface IShipmentRow { docType: string; remarks: string; files: IShipmentFile[] }
export interface IShipment extends Document {
  projectId: string;
  name: string;   // "Shipment 1", "Shipment 2", …
  order: number;
  description: string;
  fromLocation: string;   // where it ships from
  toLocation: string;     // where it goes
  status: ShipmentStatus;
  deadline: string;       // expected receipt date (date string)
  // Live-tracking header (client CR-PR-08). Updated manually (or pasted from the carrier site).
  trackingNo: string;     // tracking / container #
  carrier: string;        // carrier / line (e.g. Maersk)
  currentLocation: string; // last known location (e.g. Istanbul Port)
  etaDate: string;        // current anticipated date of arrival (date string) — countdown derives from this
  trackingUrl: string;    // link to the carrier's tracking page
  // Container details (client CR-PR-09).
  containerType: string;  // e.g. 40' HC, 20' DV, Flat Rack
  containerSize: string;
  openBed: boolean;       // open-bed / flat-rack shipment?
  poIds: string[];        // linked ProcurementPO ids — their items sync with this shipment's status
  // Shipment cost breakdown — summed into the total shown on the shipment tab.
  costFreight: string;
  costCustoms: string;
  costDemurrage: string;
  costOther: string;
  rows: IShipmentRow[];
}

const FileSchema = new Schema<IShipmentFile>({ name: String, filePath: String, fileType: String, size: String }, { _id: true });
const RowSchema = new Schema<IShipmentRow>({ docType: { type: String, default: "" }, remarks: { type: String, default: "" }, files: { type: [FileSchema], default: [] } }, { _id: true });

const ShipmentSchema = new Schema<IShipment>(
  {
    projectId: { type: String, required: true, index: true },
    name: { type: String, default: "" },
    order: { type: Number, default: 0 },
    description: { type: String, default: "" },
    fromLocation: { type: String, default: "" },
    toLocation: { type: String, default: "" },
    status: { type: String, enum: ["Preparing", "Fabrication", "Transit", "Clearance", "Warehouse", "Delivered"], default: "Preparing" },
    deadline: { type: String, default: "" },
    trackingNo: { type: String, default: "" },
    carrier: { type: String, default: "" },
    currentLocation: { type: String, default: "" },
    etaDate: { type: String, default: "" },
    trackingUrl: { type: String, default: "" },
    containerType: { type: String, default: "" },
    containerSize: { type: String, default: "" },
    openBed: { type: Boolean, default: false },
    poIds: { type: [String], default: [] },
    costFreight: { type: String, default: "" },
    costCustoms: { type: String, default: "" },
    costDemurrage: { type: String, default: "" },
    costOther: { type: String, default: "" },
    rows: { type: [RowSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<IShipment>("Shipment", ShipmentSchema);

// The special demurrage row — kept on top of the list and rendered dulled/grey in the UI.
export const DEMURRAGE_DOC = "Demurrage Cost";

// The GreenTech ↔ shipper contract — a mandatory row like the demurrage one, backfilled onto
// existing shipments so every shipment keeps the signed carriage contract with its documents.
export const SHIPPER_CONTRACT_DOC = "Shipping Contract (GreenTech ↔ Shipper)";

// Rows that must exist on every shipment (seeded on create, backfilled on read).
export const REQUIRED_SHIPMENT_DOCS = [DEMURRAGE_DOC, SHIPPER_CONTRACT_DOC];

// The predefined document rows seeded into every new shipment (Demurrage Cost first).
export const DEFAULT_SHIPMENT_DOCS = [
  DEMURRAGE_DOC,
  SHIPPER_CONTRACT_DOC,
  "Commercial Invoice", "Packing List", "Bill of Lading (B/L) / Air Waybill (AWB)", "Booking Confirmation",
  "Shipping Instructions (SI)", "Certificate of Origin", "Insurance Certificate", "Export Customs Declaration",
  "Import Customs Clearance", "Tax Exemption Documents", "Delivery Order", "Goods Received Note (GRN)",
  "Material Inspection Report", "Photos", "Other",
];
