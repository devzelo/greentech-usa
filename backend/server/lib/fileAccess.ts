import mongoose from "mongoose";
import User from "../models/User";
import Project from "../models/Project";
import Agreement from "../models/Agreement";
import CompanyFile from "../models/CompanyFile";
import ProcurementPO from "../models/ProcurementPO";
import ProjectRequest from "../models/ProjectRequest";
import Invoice from "../models/Invoice";
import { getProjectAccess, canViewTab, sectionToTabId, type ProjectAccess } from "./access";
import { isSharedWith, partyMaySee, type PartyIdentity } from "./agreementAccess";

/**
 * 2026-10-09 - who may open an uploaded file (security fix). Until now any signed-in session could
 * open any file under /uploads once it knew the path. GreenTech staff still can; an outside login
 * (vendor, subcontractor, partner: role "subcontractor") only opens what it could see in the app:
 *   - a project's files: when it has access to that project, and to the tab the folder belongs to
 *     (a guest with Procurement only cannot open the project's invoices);
 *   - its own company's vendor offers and invoices on a project;
 *   - an agreement's files: when that agreement was shared with it;
 *   - its own profile files (and its company colleagues' resumes), its company's profile files;
 *   - company logos and signature images (they print on the documents it is shown).
 * Anything else (GreenTech's company documents, RFP files, other people's files) is refused.
 */

type Who = { id: string; role: string; companyId: string; email: string; empId: string; archived: boolean };
const TTL = 30_000;
const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v as T;
  const v = await load();
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 2000) cache.clear();
  return v;
}
const isId = (s?: string) => !!s && mongoose.isValidObjectId(s);

const who = (userId: string) => cached<Who | null>(`u:${userId}`, async () => {
  if (!isId(userId)) return null;
  const u = await User.findById(userId).select("role companyId email empId archived").lean() as { role?: string; companyId?: unknown; email?: string; empId?: string; archived?: boolean } | null;
  return u ? { id: userId, role: u.role || "", companyId: u.companyId ? String(u.companyId) : "", email: String(u.email || "").toLowerCase(), empId: u.empId || "", archived: !!u.archived } : null;
});
const companyOf = (userId: string) => cached<string>(`c:${userId}`, async () => {
  if (!isId(userId)) return "";
  const u = await User.findById(userId).select("companyId").lean() as { companyId?: unknown } | null;
  return u?.companyId ? String(u.companyId) : "";
});

/** The guest permission keys that open each project folder (documents use their section's tab). */
const FOLDER_KEYS: Record<string, string[]> = {
  "expenses": ["expenses"], "invoices": ["invoice-sent", "invoice-received"], "sub-invoices": ["subs"],
  "boq-items": ["proc-boq", "proc-log"], "procurement-pos": ["proc-po"], "rfq-quotes": ["proc-rfqs", "proc-quotes"],
  "rfq-items": ["proc-rfqs"], "procurement-quotes": ["proc-quotes", "proc-rfqs"], "submittals": ["proc-submittals"],
  "shipments": ["proc-shipment"], "procurement": ["procurement"], "contract": ["legal", "project-info"], "tasks": ["pm"],
  "technical-docs": ["tech-docs"], "requests": ["contract-admin", "tech-docs", "project-info", "proposals"],
  "proposal": ["proposals"], "partner-assets": ["proposals", "subs"], "agreements": ["legal"],
  "saved-documents": ["proposals", "proc-boq", "proc-rfqs", "proc-po", "procurement"],
  "tables": ["project-info", "proposals", "tech-docs", "closeout", "pm", "legal"],
};
const PROC_KEYS = ["proc-log", "proc-boq", "proc-submittals", "proc-rfqs", "proc-quotes", "proc-po", "proc-shipment"];
const FIN_KEYS = ["expenses", "invoice-sent", "invoice-received"];

/** A guest's view right on any of `keys`, with the module fallbacks the app uses (procurement, finances). */
function guestMayView(access: Extract<ProjectAccess, { role: "subcontractor" }>, keys: string[]): boolean {
  const has = (k: string) => access.perms[k] === "view" || access.perms[k] === "edit";
  if (keys.some(has)) return true;
  if (keys.some((k) => PROC_KEYS.includes(k)) && !PROC_KEYS.some(has)) return has("procurement");
  if (keys.some((k) => FIN_KEYS.includes(k)) && !FIN_KEYS.some(has)) return has("finances");
  return false;
}

/** Was this agreement given to this login (shared with it, or named as its party when nothing was shared)? */
async function agreementOpen(aid: string, me: Who): Promise<boolean> {
  if (!isId(aid)) return false;
  const ag = await cached(`a:${aid}`, () => Agreement.findById(aid).select("status archived visibleTo shares partySnapshot ownerUserId").lean());
  if (!ag) return false;
  const a = ag as unknown as { status?: string; archived?: boolean; visibleTo?: Array<{ email?: string; companyId?: string }>; shares?: Array<{ purpose?: string }>; ownerUserId?: string;
    partySnapshot?: { party2?: { email?: string; companyId?: string }; extraParties?: Array<{ email?: string; companyId?: string }> } };
  if (a.ownerUserId && a.ownerUserId === me.id) return true;
  const id: PartyIdentity = { email: me.email, companyId: me.companyId };
  if (!partyMaySee(a, id)) return false;
  if (isSharedWith(a, id)) return true;
  if ((a.visibleTo || []).length) return false;
  // An agreement from before sharing existed: its named parties.
  const named = [a.partySnapshot?.party2, ...(a.partySnapshot?.extraParties || [])].filter(Boolean) as Array<{ email?: string; companyId?: string }>;
  return named.some((p) => (!!me.companyId && String(p.companyId || "") === me.companyId) || (!!me.email && String(p.email || "").toLowerCase() === me.email));
}

/** A stamp or signature from the Classified folders (they print on documents). */
const printedPicture = (rel: string) => cached(`f:${rel}`, async () =>
  !!(await CompanyFile.exists({ tabId: { $in: ["classified-stamps", "classified-signatures"] }, filePath: { $in: [`uploads/${rel}`, `uploads\\${rel.replace(/\//g, "\\")}`] } })));

/**
 * A Classified stamp or signature as it prints on a document this outside login is shown: the
 * company's signature block of an agreement given to it, or the purchase order, request or invoice
 * of a project it is a guest on.
 */
async function printedForMe(rel: string, me: Who): Promise<boolean> {
  if (!(await printedPicture(rel))) return false;
  return cached(`pf:${me.id}:${rel}`, async () => {
    const pic = { $in: [`/uploads/${rel}`, `uploads/${rel}`] };
    const ags = await Agreement.find({ $or: [{ "signatures.company.stampUrl": pic }, { "signatures.company.signatureUrl": pic }] }).select("_id").limit(100).lean();
    for (const a of ags) if (await agreementOpen(String(a._id), me)) return true;
    const projects = await Project.find({ "guests.userId": me.id }).select("projectId guests").lean() as Array<{ projectId: string; guests?: Array<{ userId?: unknown; expiresAt?: Date | string | null }> }>;
    const ids = projects.filter((p) => (p.guests || []).some((g) => String(g.userId) === me.id && (!g.expiresAt || new Date(g.expiresAt).getTime() > Date.now()))).map((p) => p.projectId);
    if (!ids.length) return false;
    const onDoc = { projectId: { $in: ids }, $or: [{ stampUrl: pic }, { signatureUrl: pic }] };
    return !!((await ProcurementPO.exists(onDoc)) || (await ProjectRequest.exists(onDoc)) || (await Invoice.exists({ projectId: { $in: ids }, signatureUrl: pic })));
  });
}

/** May this signed-in user open the file at `rel` (a path under uploads/, posix, normalized)? */
export async function mayReadUpload(userId: string, rel: string): Promise<boolean> {
  const me = await who(userId);
  if (!me || me.archived) return false;
  if (me.role === "admin" || me.role === "employee") return true;
  if (me.role !== "subcontractor") return false;

  const seg = rel.split("/");
  const [first, second, third] = seg;
  switch (first) {
    case "signatures": return true;
    case "company":
      // Logos (the Directory's and the Logos folder) and pictures picked for one document.
      if (second === "logos" || second === "company-logos" || second === "picked") return true;
      if (second === "profile") return !!me.companyId && third === me.companyId;
      // A stamp or signature from the Classified folders: only one printed on a document this login
      // is shown (security review, 2026-10-09), never the folder at large.
      if (second === "classified") return printedForMe(rel, me);
      return false;   // GreenTech's own company and classified documents
    case "resumes": case "profile-gallery": case "users":
      // Their own files; a company login also sees its colleagues' resumes.
      if (second === me.id) return true;
      return first === "resumes" && !!me.companyId && (await companyOf(second)) === me.companyId;
    case "general-agreements": return agreementOpen(second, me);
    case "user-agreements": return second === me.id || agreementOpen(third, me);
    case "rfp": return false;
  }

  // A project's folder: uploads/<projectId>/<section or folder>/...
  if (second === "vendor-offers") return !!me.companyId && third === me.companyId;
  const project = await cached(`p:${first}`, () => Project.findOne({ projectId: first }).select("ownerId assignedEmployees guests tabAccess").lean());
  if (!project) return false;
  if (second === "agreements" && (await agreementOpen(third, me))) return true;
  const access = getProjectAccess(project as Parameters<typeof getProjectAccess>[0], userId, me.empId);
  if (access.role === "owner") return true;
  if (access.role !== "subcontractor") return false;
  const keys = FOLDER_KEYS[second];
  if (keys) return guestMayView(access, keys);
  const tab = sectionToTabId(second || "");
  return canViewTab(access, tab);
}
