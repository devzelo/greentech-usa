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
import WorkPackage from "../models/WorkPackage";

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
    // The sharing fields are selected so the self profile can apply CR-P (62) before anything leaves.
    Agreement.find({ $or: [{ ownerUserId: uid }, { addedById: uid }] }).select("name agreementNo title agreementType status ownerProjectId ownerContextType ownerUserId addedById visibleTo shares archived").sort({ createdAt: -1 }).limit(60).lean(),
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
export async function buildCompanyLinks(companyId: string, name: string, email = "", linkedUserId = "", internal = false) {
  const nameRx = name ? new RegExp(`^${escapeRegex(name)}$`, "i") : null;
  // Received quotes: vendors picked from the Directory carry a hard companyId link; legacy rows
  // entered by hand only match on name, so we accept either.
  const vendorMatch: Record<string, unknown>[] = [{ companyId }];
  if (nameRx) vendorMatch.push({ name: nameRx });
  const vendorIds = (await Vendor.find({ $or: vendorMatch }).select("_id").lean()).map((v) => String(v._id));

  // CR-P (128) — the projects where this company is the client: picked from the Directory
  // (clientInfo.companyId), or an older project whose client name matches.
  const memberMatch: Record<string, unknown>[] = [{ "clientInfo.companyId": companyId }];
  if (linkedUserId) memberMatch.push({ "guests.userId": linkedUserId }, { "subcontractors.userId": linkedUserId });
  if (email) memberMatch.push({ "subcontractors.email": new RegExp(`^${escapeRegex(email)}$`, "i") });
  if (nameRx) memberMatch.push({ "subcontractors.name": nameRx }, { "clientInfo.name": nameRx });

  // CR-P (19)/(63) — a company is on an agreement as party 2, as party 3 or 4, or because it was
  // shared with it. Rows from before the Directory link are matched on the party 2 name.
  const agreementMatch: Record<string, unknown>[] = [
    { "partySnapshot.party2.companyId": companyId },
    { "partySnapshot.extraParties.companyId": companyId },
    { "visibleTo.companyId": companyId },
  ];
  if (nameRx) agreementMatch.push({ "partySnapshot.party2.name": nameRx });

  const [invoices, rfqs, pos, shipments, quotes, agreementRows, submittals, memberProjects] = await Promise.all([
    // Invoices link by companyId (receiver picker) OR by matching party name.
    Invoice.find(nameRx ? { $or: [{ companyId }, { party: nameRx }] } : { companyId }).select("number type party amount date status projectId").sort({ createdAt: -1 }).limit(200).lean(),
    Rfq.find({ "recipients.companyId": companyId }).select("rfqNo title status projectId sentAt").sort({ createdAt: -1 }).limit(200).lean(),
    // POs store the vendor NAME — match the company's name to surface them under the profile.
    nameRx ? ProcurementPO.find({ vendorName: nameRx }).select("poNo vendorName total status projectId").sort({ createdAt: -1 }).limit(200).lean() : [],
    // CR-P-06b — shipping/delivery records: shipments whose logistics agency is this company.
    nameRx ? Shipment.find({ agencyName: nameRx }).select("name status etaDate agencyName projectId").sort({ createdAt: -1 }).limit(200).lean() : [],
    vendorIds.length ? VendorQuote.find({ vendorId: { $in: vendorIds } }).select("rfqId total status accepted projectId").sort({ createdAt: -1 }).limit(200).lean() : [],
    // CR-P-06b — agreements/contracts with this company. The sharing fields ride along so the
    // company's own login only gets what was shared with it (CR-P (62)).
    Agreement.find({ $or: agreementMatch }).select("name agreementNo title agreementType status ownerProjectId ownerContextType visibleTo shares archived").sort({ createdAt: -1 }).limit(200).lean(),
    // CR-P-06b — submittals for this company's products (matched on manufacturer/brand).
    nameRx ? Submittal.find({ manufacturer: nameRx }).select("productName manufacturer status projectId").sort({ createdAt: -1 }).limit(200).lean() : [],
    memberMatch.length ? Project.find({ $or: memberMatch }).select("projectId name status").limit(200).lean() : [],
  ]);
  // An agreement's project lives in ownerProjectId. This used to select a `projectId` field that
  // agreements do not have, so agreement rows never linked to their project.
  const agreements = agreementRows.map((a) => ({ ...a, projectId: a.ownerProjectId || "" }));

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

  if (!internal) return { invoices, rfqs, pos, shipments, quotes, agreements, submittals, projects };

  /**
   * CR 328 (GT Comments 3, page 1: "All RFQs, quotations, POs, agreements, change orders, invoices,
   * and payments associated with a company should also automatically appear under that company's
   * profile"). Only on GreenTech's own view of the profile, not on the company's login: the work
   * packages are an internal list.
   *
   * Its work packages: it is the package's responsible company, or it won the package through its
   * awarded quote, its PO or its agreement. Their change orders come with them, and the payments
   * recorded on its invoices are listed one by one.
   */
  const awardedRfqIds = (quotes as Array<{ rfqId?: string; status?: string }>).filter((q) => q.status === "Awarded").map((q) => String(q.rfqId || "")).filter(Boolean);
  const wpMatch: Record<string, unknown>[] = [{ "responsible.companyId": companyId }];
  if (nameRx) wpMatch.push({ "responsible.kind": "company", "responsible.name": nameRx });
  if (pos.length) wpMatch.push({ poId: { $in: pos.map((p) => String(p._id)) } });
  if (agreements.length) wpMatch.push({ agreementId: { $in: agreements.map((a) => String(a._id)) } });
  if (awardedRfqIds.length) wpMatch.push({ rfqId: { $in: awardedRfqIds } });
  const [packageRows, paidInvoices] = await Promise.all([
    WorkPackage.find({ $or: wpMatch }).select("name status progress progressMode subtasks changeOrders projectId archived").sort({ updatedAt: -1 }).limit(200).lean(),
    Invoice.find(nameRx ? { $or: [{ companyId }, { party: nameRx }], "payments.0": { $exists: true } } : { companyId, "payments.0": { $exists: true } })
      .select("number type payments projectId").sort({ createdAt: -1 }).limit(200).lean(),
  ]);
  const workPackages = packageRows.map((p) => {
    const subs = p.subtasks || [];
    const progress = p.progressMode === "subtasks" && subs.length ? Math.round(subs.reduce((a, t) => a + (t.progress || 0), 0) / subs.length) : p.progress || 0;
    return { _id: String(p._id), name: p.name, status: p.status, progress, projectId: p.projectId, archived: !!p.archived };
  });
  const changeOrders = packageRows.flatMap((p) => (p.changeOrders || []).map((c) => ({
    _id: `${p._id}-${c.id}`, no: c.no, date: c.date, reason: c.reason, amount: c.amount, status: c.status, packageId: String(p._id), packageName: p.name, projectId: p.projectId,
  })));
  const payments = paidInvoices.flatMap((iv) => (iv.payments || []).map((pm, i) => ({
    _id: `${iv._id}-${i}`, invoiceId: String(iv._id), invoiceNo: iv.number, type: iv.type, date: pm.date, amount: pm.amount, method: pm.method, reference: pm.reference, projectId: iv.projectId,
  }))).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  // Their projects are named on the profile too, like those of the records above.
  const known = new Set((projects as Array<{ projectId?: string }>).map((p) => p.projectId));
  const more = [...new Set([...workPackages, ...payments].map((x) => x.projectId).filter((id) => id && !known.has(id)))];
  if (more.length) projects.push(...(await Project.find({ projectId: { $in: more } }).select("projectId name status").limit(200).lean()));
  return { invoices, rfqs, pos, shipments, quotes, agreements, submittals, projects, workPackages, changeOrders, payments };
}

export async function resolveProjectNames(pidSet: Set<string>) {
  const projRows = pidSet.size ? await Project.find({ projectId: { $in: [...pidSet] } }).select("projectId name").lean() : [];
  const projectNames: Record<string, string> = {};
  for (const p of projRows as Array<{ projectId?: string; name?: string }>) if (p.projectId) projectNames[p.projectId] = p.name || "";
  return projectNames;
}
