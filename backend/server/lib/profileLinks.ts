import Project from "../models/Project";
import Agreement from "../models/Agreement";
import Expense from "../models/Expense";
import Reminder from "../models/Reminder";
import Submittal from "../models/Submittal";
import ProcurementPO from "../models/ProcurementPO";
import Invoice from "../models/Invoice";
import Rfq from "../models/Rfq";
import Shipment from "../models/Shipment";
import Vendor from "../models/Vendor";
import VendorQuote from "../models/VendorQuote";

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// CR-P (16) — the profile "links" aggregations, shared by the admin user profile, the Directory
// company profile and the self profile (/api/me/links), so all three previews stay identical.

// Everything related to a user account (projects, agreements, POs, submittals, expenses,
// reminders) plus the projectId → name map that powers per-row project labels and the
// deleted-project blur. Extracted verbatim from the admin-only /api/users/:id/links.
export async function buildUserLinks(uid: string, name: string) {
  const nameRx = name ? new RegExp(`^${escapeRegex(name)}$`, "i") : null;

  const [owned, guest, agreements, expenses, reminders, submittals, pos] = await Promise.all([
    Project.find({ ownerId: uid }).select("projectId name status location").lean(),
    Project.find({ "guests.userId": uid }).select("projectId name status location").lean(),
    Agreement.find({ $or: [{ ownerUserId: uid }, { addedById: uid }] }).select("name agreementType status ownerProjectId").sort({ createdAt: -1 }).limit(60).lean(),
    Expense.find({ addedById: uid }).select("description amount qty approval projectId category").sort({ createdAt: -1 }).limit(60).lean(),
    Reminder.find({ userId: uid }).select("title dueAt projectId projectName").sort({ dueAt: -1 }).limit(60).lean(),
    nameRx ? Submittal.find({ addedByName: nameRx }).select("productName status projectId").sort({ createdAt: -1 }).limit(60).lean() : [],
    nameRx ? ProcurementPO.find({ $or: [{ addedByName: nameRx }, { assignedTo: nameRx }] }).select("poNo vendorName total status projectId").sort({ createdAt: -1 }).limit(60).lean() : [],
  ]);

  // Merge owned + guest projects, de-duped by _id.
  const seen = new Set<string>();
  const projects = [...owned, ...guest].filter((p) => { const k = String((p as { _id: unknown })._id); if (seen.has(k)) return false; seen.add(k); return true; });

  // CR-P (11) — resolve the name of every project referenced by the user's items, so each row can
  // show its project. A referenced projectId that's missing here means that project was deleted.
  const pidSet = new Set<string>();
  for (const a of agreements as Array<{ ownerProjectId?: string }>) if (a.ownerProjectId) pidSet.add(a.ownerProjectId);
  for (const arr of [expenses, reminders, submittals, pos] as Array<Array<{ projectId?: string }>>)
    for (const r of arr) if (r.projectId) pidSet.add(r.projectId);
  const projectNames = await resolveProjectNames(pidSet);

  return { projects, agreements, expenses, reminders, submittals, pos, projectNames };
}

// Everything that references a Directory company. Extracted from /api/companies/:id/links, plus
// CR-P (16): `linkedUserId` (the company's login) pulls in projects where that login is a guest
// and projects that list the company under subcontractors[] — previously invisible here, which
// left the Access tab unaware of grants made from the project side.
export async function buildCompanyLinks(companyId: string, name: string, email = "", linkedUserId = "") {
  const nameRx = name ? new RegExp(`^${escapeRegex(name)}$`, "i") : null;
  // Received quotes: vendors picked from the Directory carry a hard companyId link; legacy rows
  // entered by hand only match on name, so we accept either.
  const vendorMatch: Record<string, unknown>[] = [{ companyId }];
  if (nameRx) vendorMatch.push({ name: nameRx });
  const vendorIds = (await Vendor.find({ $or: vendorMatch }).select("_id").lean()).map((v) => String(v._id));

  const memberMatch: Record<string, unknown>[] = [];
  if (linkedUserId) memberMatch.push({ "guests.userId": linkedUserId }, { "subcontractors.userId": linkedUserId });
  if (email) memberMatch.push({ "subcontractors.email": new RegExp(`^${escapeRegex(email)}$`, "i") });
  if (nameRx) memberMatch.push({ "subcontractors.name": nameRx });

  const [invoices, rfqs, pos, shipments, quotes, agreements, submittals, memberProjects] = await Promise.all([
    // Invoices link by companyId (receiver picker) OR by matching party name.
    Invoice.find(nameRx ? { $or: [{ companyId }, { party: nameRx }] } : { companyId }).select("number type party amount date status projectId").sort({ createdAt: -1 }).limit(200).lean(),
    Rfq.find({ "recipients.companyId": companyId }).select("rfqNo title status projectId sentAt").sort({ createdAt: -1 }).limit(200).lean(),
    // POs store the vendor NAME — match the company's name to surface them under the profile.
    nameRx ? ProcurementPO.find({ vendorName: nameRx }).select("poNo vendorName total status projectId").sort({ createdAt: -1 }).limit(200).lean() : [],
    // CR-P-06b — shipping/delivery records: shipments whose logistics agency is this company.
    nameRx ? Shipment.find({ agencyName: nameRx }).select("name status etaDate agencyName projectId").sort({ createdAt: -1 }).limit(200).lean() : [],
    vendorIds.length ? VendorQuote.find({ vendorId: { $in: vendorIds } }).select("rfqId total status accepted projectId").sort({ createdAt: -1 }).limit(200).lean() : [],
    // CR-P-06b — agreements/contracts with this company (matched on the counterparty name).
    Agreement.find(nameRx
      ? { $or: [{ "partySnapshot.party2.companyId": companyId }, { "partySnapshot.party2.name": nameRx }] }
      : { "partySnapshot.party2.companyId": companyId }).select("name status projectId").sort({ createdAt: -1 }).limit(200).lean(),
    // CR-P-06b — submittals for this company's products (matched on manufacturer/brand).
    nameRx ? Submittal.find({ manufacturer: nameRx }).select("productName manufacturer status projectId").sort({ createdAt: -1 }).limit(200).lean() : [],
    memberMatch.length ? Project.find({ $or: memberMatch }).select("projectId name status").limit(200).lean() : [],
  ]);

  // "Projects they have been involved with": every project referenced by any linked record above,
  // plus (CR-P 16) projects where the company is a subcontractor or its login is a guest.
  const pidSet = new Set<string>();
  for (const arr of [invoices, rfqs, pos, shipments, quotes, agreements, submittals] as Array<Array<{ projectId?: string }>>)
    for (const r of arr) if (r.projectId) pidSet.add(r.projectId);
  for (const p of memberProjects as Array<{ projectId?: string }>) if (p.projectId) pidSet.delete(p.projectId);
  const referenced = pidSet.size
    ? await Project.find({ projectId: { $in: [...pidSet] } }).select("projectId name status").limit(200).lean()
    : [];
  const projects = [...memberProjects, ...referenced];

  return { invoices, rfqs, pos, shipments, quotes, agreements, submittals, projects };
}

export async function resolveProjectNames(pidSet: Set<string>) {
  const projRows = pidSet.size ? await Project.find({ projectId: { $in: [...pidSet] } }).select("projectId name").lean() : [];
  const projectNames: Record<string, string> = {};
  for (const p of projRows as Array<{ projectId?: string; name?: string }>) if (p.projectId) projectNames[p.projectId] = p.name || "";
  return projectNames;
}
