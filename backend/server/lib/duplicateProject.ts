/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Project from "../models/Project";
import Expense from "../models/Expense";
import Invoice from "../models/Invoice";
import SubInvoice from "../models/SubInvoice";
import ProjectDocument from "../models/ProjectDocument";
import Submittal from "../models/Submittal";
import SubmittalRevision from "../models/SubmittalRevision";
import Rfq from "../models/Rfq";
import VendorQuote from "../models/VendorQuote";
import ProcurementPO from "../models/ProcurementPO";
import ProcurementItem from "../models/ProcurementItem";
import ProcurementItemRevision from "../models/ProcurementItemRevision";
import ProcurementRow from "../models/ProcurementRow";
import ProcurementSection from "../models/ProcurementSection";
import ProcurementEvent from "../models/ProcurementEvent";
import Shipment from "../models/Shipment";
import ProjectRequest from "../models/ProjectRequest";
import ProjectTable from "../models/ProjectTable";
import ProposalRevision from "../models/ProposalRevision";
import SavedDocument from "../models/SavedDocument";
import SubAgreement from "../models/SubAgreement";
import TechnicalDoc from "../models/TechnicalDoc";
import Vendor from "../models/Vendor";
import FolderNote from "../models/FolderNote";
import Agreement from "../models/Agreement";

// CR-P-26b — a full deep clone of a project: the project doc, every project-scoped record, all
// cross-references between them remapped to the new copies, and all uploaded files copied on disk.
const oid = () => new mongoose.Types.ObjectId();

// Rewrite "uploads/<oldPid>/…" → "uploads/<newPid>/…" anywhere in a doc's strings, leaving
// ObjectIds, Dates and Buffers untouched.
function remapPaths<T>(doc: T, oldPid: string, newPid: string): T {
  const esc = oldPid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(uploads[\\/\\\\])${esc}([\\/\\\\])`, "g");
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.replace(re, `$1${newPid}$2`);
    if (v == null) return v;
    if (Array.isArray(v)) return v.map(walk);
    if (v instanceof Date || v instanceof mongoose.Types.ObjectId || Buffer.isBuffer(v)) return v;
    if (typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = walk(val);
      return o;
    }
    return v;
  };
  return walk(doc) as T;
}

function stripMeta(d: any) { delete d.createdAt; delete d.updatedAt; delete d.__v; }

// Clone every row of a project-scoped collection, giving each a fresh _id and the new projectId.
// `transform` gets each cloned row to fix cross-references. Returns oldId → newId for later remaps.
async function cloneCollection(
  Model: mongoose.Model<any>,
  oldPid: string, newPid: string,
  transform?: (doc: any) => void,
): Promise<Map<string, string>> {
  const rows = await Model.find({ projectId: oldPid }).lean();
  const idMap = new Map<string, string>();
  const out: any[] = [];
  for (const r of rows) {
    const newId = oid();
    idMap.set(String((r as any)._id), String(newId));
    const cloned: any = remapPaths({ ...(r as any) }, oldPid, newPid);
    cloned._id = newId;
    cloned.projectId = newPid;
    stripMeta(cloned);
    if (transform) transform(cloned);
    out.push(cloned);
  }
  if (out.length) { try { await Model.insertMany(out, { ordered: false }); } catch { /* skip bad rows, keep the rest */ } }
  return idMap;
}

const mapId = (m: Map<string, string>, v: any) => (v ? m.get(String(v)) || v : v);

export async function duplicateProject(oldPid: string, opts: { ownerId: string; ownerName: string }): Promise<any> {
  const src: any = await Project.findOne({ projectId: oldPid }).lean();
  if (!src) throw new Error("Project not found");

  // New internal number (<year>-NN), same scheme as create.
  const year = /^[0-9]{4}$/.test(String(src.contractYear || "")) ? String(src.contractYear) : String(new Date().getFullYear());
  const existing = await Project.find({ projectId: new RegExp("^" + year + "-[0-9]+$") }).select("projectId").lean();
  const highest = existing.reduce((m, p) => { const n = parseInt(String(p.projectId).split("-")[1] || "0", 10); return isFinite(n) && n > m ? n : m; }, 0);
  const newPid = `${year}-${String(highest + 1).padStart(2, "0")}`;

  // Copy the whole uploads/<oldPid> tree so every file has its own physical copy.
  try {
    const srcDir = path.join("uploads", oldPid);
    if (fs.existsSync(srcDir)) fs.cpSync(srcDir, path.join("uploads", newPid), { recursive: true });
  } catch { /* files are best-effort; the records still clone */ }

  // 1) The project document itself.
  const proj: any = remapPaths({ ...src }, oldPid, newPid);
  proj._id = oid();
  proj.projectId = newPid;
  proj.ownerId = opts.ownerId;
  proj.owner = opts.ownerName;
  proj.name = `${src.name || "Project"} (copy)`;
  proj.published = false;   // a copy is never auto-published to the public site
  proj.archived = false;
  stripMeta(proj);
  await Project.create(proj);

  // 2) Procurement chain (order matters so cross-references resolve).
  const itemMap = await cloneCollection(ProcurementItem, oldPid, newPid);
  await cloneCollection(ProcurementItemRevision, oldPid, newPid, (d) => { d.itemId = mapId(itemMap, d.itemId); });
  const rfqMap = await cloneCollection(Rfq, oldPid, newPid, (d) => { for (const li of d.lineItems || []) li.itemId = mapId(itemMap, li.itemId); });
  await cloneCollection(VendorQuote, oldPid, newPid, (d) => { d.rfqId = mapId(rfqMap, d.rfqId); for (const li of d.lineItems || []) li.itemId = mapId(itemMap, li.itemId); });
  const poMap = await cloneCollection(ProcurementPO, oldPid, newPid, (d) => { d.rfqId = mapId(rfqMap, d.rfqId); for (const li of d.lineItems || []) li.itemId = mapId(itemMap, li.itemId); });
  await cloneCollection(Shipment, oldPid, newPid, (d) => { if (Array.isArray(d.poIds)) d.poIds = d.poIds.map((x: any) => mapId(poMap, x)); });
  const subMap = await cloneCollection(Submittal, oldPid, newPid, (d) => { d.itemId = mapId(itemMap, d.itemId); });
  await cloneCollection(SubmittalRevision, oldPid, newPid, (d) => { d.submittalId = mapId(subMap, d.submittalId); });

  // 3) Invoices & expenses (invoices link to PO/RFQ; expenses link to invoices).
  const invMap = await cloneCollection(Invoice, oldPid, newPid, (d) => { d.poId = mapId(poMap, d.poId); d.rfqId = mapId(rfqMap, d.rfqId); });
  await cloneCollection(Expense, oldPid, newPid, (d) => { d.invoiceId = mapId(invMap, d.invoiceId); });

  // 4) Everything else scoped by projectId (subIds stay valid — the subcontractors are embedded on
  // the project doc and copied verbatim).
  await cloneCollection(SubInvoice, oldPid, newPid);
  await cloneCollection(SubAgreement, oldPid, newPid);
  await cloneCollection(ProjectDocument, oldPid, newPid);
  await cloneCollection(ProjectTable, oldPid, newPid);
  await cloneCollection(ProjectRequest, oldPid, newPid);
  await cloneCollection(ProposalRevision, oldPid, newPid);
  await cloneCollection(SavedDocument, oldPid, newPid);
  await cloneCollection(TechnicalDoc, oldPid, newPid);
  await cloneCollection(Vendor, oldPid, newPid);
  await cloneCollection(ProcurementRow, oldPid, newPid);
  await cloneCollection(ProcurementSection, oldPid, newPid);
  await cloneCollection(ProcurementEvent, oldPid, newPid);
  await cloneCollection(FolderNote, oldPid, newPid);

  // 5) Project-context agreements (keyed by ownerProjectId, entity ids stay).
  const ags = await Agreement.find({ ownerProjectId: oldPid }).lean();
  const agOut: any[] = [];
  for (const a of ags) { const c: any = remapPaths({ ...(a as any) }, oldPid, newPid); c._id = oid(); c.ownerProjectId = newPid; stripMeta(c); agOut.push(c); }
  if (agOut.length) { try { await Agreement.insertMany(agOut, { ordered: false }); } catch { /* skip */ } }

  return Project.findOne({ projectId: newPid });
}
