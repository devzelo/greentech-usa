import { Router, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Project from "../models/Project";
import Agreement from "../models/Agreement";
import Submittal from "../models/Submittal";
import SubmittalRevision from "../models/SubmittalRevision";
import Rfq from "../models/Rfq";
import Company from "../models/Company";
import ProjectDocument from "../models/ProjectDocument";
import RecycleBin from "../models/RecycleBin";
import User from "../models/User";
// CR-P — every record type that now snapshots to the recycle bin on delete, so restore can re-create it.
import Announcement from "../models/Announcement";
import Invoice from "../models/Invoice";
import ProcurementPO from "../models/ProcurementPO";
import ProjectRequest from "../models/ProjectRequest";
import ProjectTable from "../models/ProjectTable";
import ProposalRevision from "../models/ProposalRevision";
import ProposalTemplate from "../models/ProposalTemplate";
import ResourceBlock from "../models/ResourceBlock";
import SubResume from "../models/SubResume";
import RfpDocument from "../models/RfpDocument";
import Shipment from "../models/Shipment";
import SubAgreement from "../models/SubAgreement";
import SubInvoice from "../models/SubInvoice";
import Vendor from "../models/Vendor";
import Template from "../models/Template";
import TaskColumn from "../models/TaskColumn";
import Task from "../models/Task";
import TechnicalDoc from "../models/TechnicalDoc";
import ProcurementSection from "../models/ProcurementSection";
import ProcurementItem from "../models/ProcurementItem";
import SavedDocument, { describeSavedDoc } from "../models/SavedDocument";
import ScheduleRevision, { scheduleEntryName } from "../models/ScheduleRevision";
import WorkPackage from "../models/WorkPackage";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { sectionToTabId } from "../lib/access";

// CR-P-26 — Archive & Recycle Bin. Staff-only. The Archive tab aggregates everything that carries an
// `archived` flag; the Recycle Bin lists snapshots of deleted records (see lib/recycleBin).
const router = Router();
router.use(requireAuth);
router.use((req: AuthedRequest, res, next) => {
  if (req.user!.role === "subcontractor") return res.status(403).json({ error: "Not available." });
  next();
});

// Restore targets for the two tabs.
const M = (model: unknown) => model as mongoose.Model<unknown>;
const RECYCLE_MODELS: Record<string, mongoose.Model<unknown> | undefined> = {
  project: M(Project), agreement: M(Agreement), document: M(ProjectDocument), submittal: M(Submittal),
  // CR-P — all record types that now snapshot to the recycle bin on delete.
  announcement: M(Announcement), invoice: M(Invoice), po: M(ProcurementPO),
  "project-request": M(ProjectRequest), "project-table": M(ProjectTable),
  "proposal-revision": M(ProposalRevision), "proposal-template": M(ProposalTemplate),
  "resource-block": M(ResourceBlock), "sub-resume": M(SubResume), "rfp-document": M(RfpDocument),
  rfq: M(Rfq), shipment: M(Shipment), "sub-agreement": M(SubAgreement), "sub-invoice": M(SubInvoice),
  company: M(Company), user: M(User), vendor: M(Vendor), template: M(Template),
  "board-column": M(TaskColumn), "board-task": M(Task), "technical-doc": M(TechnicalDoc),
  "procurement-section": M(ProcurementSection), "procurement-item": M(ProcurementItem),
  // CR-P (86) — filed proposal revisions and other saved document versions.
  "saved-proposal": M(SavedDocument), "saved-document": M(SavedDocument),
  // CR 300 - schedule baselines, revisions and uploaded schedules.
  "schedule-entry": M(ScheduleRevision),
  // CR 328 - work packages.
  "work-package": M(WorkPackage),
};
const ARCHIVE_MODELS: Record<string, mongoose.Model<unknown> | undefined> = {
  "saved-proposal": M(SavedDocument), "saved-document": M(SavedDocument),
  project: Project as unknown as mongoose.Model<unknown>,
  agreement: Agreement as unknown as mongoose.Model<unknown>,
  submittal: Submittal as unknown as mongoose.Model<unknown>,
  rfq: Rfq as unknown as mongoose.Model<unknown>,
  company: Company as unknown as mongoose.Model<unknown>,
  "schedule-entry": M(ScheduleRevision),
};

async function projectNames(): Promise<Record<string, string>> {
  const projs = await Project.find().select("projectId name").lean();
  const m: Record<string, string> = {};
  for (const p of projs) m[p.projectId] = p.name;
  return m;
}

// ── Archive tab ──────────────────────────────────────────────────────────────
router.get("/archive", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const nameById = await projectNames();
    const [projects, agreements, submittals, rfqs, companies, savedDocs, schedules] = await Promise.all([
      Project.find({ archived: true }).select("projectId name category location updatedAt").sort({ updatedAt: -1 }).lean(),
      Agreement.find({ archived: true }).select("name agreementType ownerProjectId ownerContextType updatedAt").sort({ updatedAt: -1 }).lean(),
      Submittal.find({ archived: true }).select("title productName projectId updatedAt").sort({ updatedAt: -1 }).lean(),
      Rfq.find({ archived: true }).select("rfqNo title projectId updatedAt").sort({ updatedAt: -1 }).lean(),
      Company.find({ archived: true }).select("name category updatedAt").sort({ updatedAt: -1 }).lean(),
      SavedDocument.find({ archived: true }).select("kind refId version title projectId updatedAt").sort({ updatedAt: -1 }).lean(),
      ScheduleRevision.find({ archived: true }).select("kind baselineNo b1 version title projectId updatedAt").sort({ updatedAt: -1 }).lean(),
    ]);
    const items = [
      ...projects.map((p) => ({ kind: "project", id: String(p._id), refId: p.projectId, name: p.name || "Untitled project", subtitle: [p.category, p.location].filter(Boolean).join(" · ") || "Project", projectId: p.projectId, projectName: p.name || "", origin: "Projects", updatedAt: (p as { updatedAt?: unknown }).updatedAt, link: `/dashboard/projects/${p.projectId}` })),
      ...agreements.map((a) => ({ kind: "agreement", id: String(a._id), refId: String(a._id), name: a.name || `${a.agreementType} agreement`, subtitle: `${a.agreementType || "Agreement"}`, projectId: a.ownerProjectId || "", projectName: nameById[a.ownerProjectId] || "", origin: a.ownerProjectId ? `Project · ${nameById[a.ownerProjectId] || a.ownerProjectId} · Subcontractor & Employees` : "General Agreements", updatedAt: (a as { updatedAt?: unknown }).updatedAt, link: binLink("agreement", a.ownerProjectId || "") })),
      ...submittals.map((s) => ({ kind: "submittal", id: String(s._id), refId: String(s._id), name: s.productName || s.title || "Submittal", subtitle: "Submittal", projectId: s.projectId, projectName: nameById[s.projectId] || "", origin: `Project · ${nameById[s.projectId] || s.projectId} · Submittals`, updatedAt: (s as { updatedAt?: unknown }).updatedAt, link: `/dashboard/projects/${s.projectId}?tab=procurement&proc=submittals` })),
      ...rfqs.map((r) => ({ kind: "rfq", id: String(r._id), refId: String(r._id), name: r.title || r.rfqNo || "RFQ", subtitle: `RFQ ${r.rfqNo || ""}`.trim(), projectId: r.projectId, projectName: nameById[r.projectId] || "", origin: `Project · ${nameById[r.projectId] || r.projectId} · RFQs`, updatedAt: (r as { updatedAt?: unknown }).updatedAt, link: `/dashboard/projects/${r.projectId}?tab=procurement&proc=rfqs` })),
      ...companies.map((c) => ({ kind: "company", id: String(c._id), refId: String(c._id), name: c.name || "Company", subtitle: c.category || "Company", projectId: "", projectName: "Directory", origin: "Directory", updatedAt: (c as { updatedAt?: unknown }).updatedAt, link: "/dashboard/directory" })),
      // CR-P (86) — archived proposal revisions (and any other archived saved versions).
      ...savedDocs.map((d) => {
        const l = describeSavedDoc(d);
        return { kind: l.binKind, id: String(d._id), refId: String(d._id), name: l.name, subtitle: l.subtitle, projectId: d.projectId, projectName: nameById[d.projectId] || "", origin: binOrigin(l.binKind, nameById[d.projectId] || d.projectId), updatedAt: (d as { updatedAt?: unknown }).updatedAt, link: binLink(l.binKind, d.projectId) };
      }),
      // CR 300 - archived schedule baselines, revisions and uploads.
      ...schedules.map((e) => ({ kind: "schedule-entry", id: String(e._id), refId: String(e._id), name: scheduleEntryName(e), subtitle: "Schedule", projectId: e.projectId, projectName: nameById[e.projectId] || "", origin: `Project · ${nameById[e.projectId] || e.projectId} · Schedule`, updatedAt: (e as { updatedAt?: unknown }).updatedAt, link: binLink("schedule-entry", e.projectId) })),
    ];
    items.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    res.json(items);
  } catch (err) { next(err); }
});

// Restore an archived item (un-archive).
router.post("/archive/:kind/:id/restore", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const Model = ARCHIVE_MODELS[req.params.kind];
    if (!Model || !mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Unknown item." });
    await Model.updateOne({ _id: req.params.id }, { $set: { archived: false } });
    // CR-P (73) — "it should give us like a link, so you can click it."
    res.json({ message: "Restored", link: String(req.body?.link || "") });
  } catch (err) { next(err); }
});

// ── Recycle Bin tab ──────────────────────────────────────────────────────────
// CR-P (73)/(75) — where a binned item CAME FROM, and where it will be once restored.
// "The second tab should be original location, so we can see where it was, where did we archive it
// from." A bin row that only says "Agreement" tells you nothing about which one.
function binOrigin(kind: string, projectName: string): string {
  if (projectName) return kind === "saved-proposal" ? `Project · ${projectName} · Proposals` : `Project · ${projectName}`;
  switch (kind) {
    case "company": case "vendor": return "Directory";
    case "user": return "Users";
    case "agreement": return "General Agreements";
    case "announcement": return "Announcements";
    case "template": case "proposal-template": return "Templates";
    case "document": case "technical-doc": case "rfp-document": return "Documents";
    case "sub-resume": return "Company Documents · Resumes";
    case "board-task": case "board-column": case "resource-block": return "My Workspace · Board";
    default: return "Company-wide";
  }
}
// CR-P (73) — where "Open" takes you after a restore. A project item goes straight to the tab it
// lives in (an agreement to Subcontractor & Employees, a document to its own tab), not just to the
// project; and every company-wide item gets a link too, so a restore never ends in "done" alone.
function binLink(kind: string, projectId: string, data?: Record<string, unknown>): string {
  if (projectId) {
    const base = `/dashboard/projects/${projectId}`;
    if (kind === "saved-proposal" || kind === "proposal-revision") return `${base}?tab=proposals`;
    if (["submittal", "rfq", "po", "shipment", "procurement-section", "procurement-item", "saved-document"].includes(kind)) {
      return `${base}?tab=procurement`;
    }
    if (kind === "agreement" || kind === "sub-invoice" || kind === "sub-agreement") return `${base}?tab=subs`;
    if (kind === "invoice") return `${base}?tab=finances`;
    if (kind === "schedule-entry" || kind === "work-package") return `${base}?tab=pm`;
    if (kind === "document") {
      const tab = sectionToTabId(String(data?.section || ""));
      if (tab) return `${base}?tab=${encodeURIComponent(tab)}`;
    }
    return base;
  }
  switch (kind) {
    case "company": case "vendor": return "/dashboard/directory";
    case "user": return "/dashboard/users";
    case "agreement": return "/dashboard/agreements";
    case "project": return "/dashboard/my-projects";
    case "template": case "proposal-template": case "document": case "technical-doc": case "rfp-document": case "sub-resume":
      return "/dashboard/documents";
    case "board-task": case "board-column": case "resource-block": return "/dashboard/my-projects";
    // Announcements live on the Overview; anything else lands on the dashboard rather than nowhere.
    default: return "/dashboard";
  }
}

router.get("/recycle", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const entries = await RecycleBin.find().sort({ createdAt: -1 }).limit(300).lean();
    res.json(entries.map((e) => ({
      id: String(e._id), kind: e.kind, name: e.name, subtitle: e.subtitle,
      projectId: e.projectId, projectName: e.projectName,
      origin: binOrigin(e.kind, e.projectName),
      // CR-P (73) — so the restore toast can offer "Open" and take you straight there.
      link: e.kind === "project" ? `/dashboard/projects/${e.refId || ""}` : binLink(e.kind, e.projectId, e.data as Record<string, unknown>),
      deletedByName: e.deletedByName, deletedAt: (e as { createdAt?: unknown }).createdAt,
    })));
  } catch (err) { next(err); }
});

// Restore a deleted item — re-create it from the snapshot, then drop the bin entry.
router.post("/recycle/:id/restore", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const entry = await RecycleBin.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: "Not found" });
    const Model = RECYCLE_MODELS[entry.kind];
    if (!Model) return res.status(400).json({ error: "This item cannot be restored." });
    await Model.create(entry.data as object);
    // Submittals bring their revisions back with them.
    if (entry.kind === "submittal" && Array.isArray(entry.extra)) {
      for (const rev of entry.extra as object[]) { try { await SubmittalRevision.create(rev); } catch { /* skip */ } }
    }
    const link = entry.kind === "project" ? `/dashboard/projects/${entry.refId || ""}` : binLink(entry.kind, entry.projectId, entry.data as Record<string, unknown>);
    await entry.deleteOne();
    res.json({ message: "Restored", link, name: entry.name, kind: entry.kind });
  } catch (err) { next(err); }
});

// Permanently delete a binned item — removes its files and the snapshot.
router.delete("/recycle/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const entry = await RecycleBin.findByIdAndDelete(req.params.id);
    for (const f of entry?.files || []) if (f.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    res.json({ message: "Permanently deleted" });
  } catch (err) { next(err); }
});

export default router;
