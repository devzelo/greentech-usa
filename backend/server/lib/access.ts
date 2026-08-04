// Shared project access resolution for owners, assigned employees, and guests.
import type { Response, NextFunction } from "express";
import Project from "../models/Project";
import User from "../models/User";
import type { AuthedRequest } from "../middleware/auth";

export type ProjectAccess =
  | { role: "owner" }
  | { role: "employee" }
  | { role: "subcontractor"; perms: Record<string, "view" | "edit"> }
  | { role: "none" };

interface ProjectLike {
  ownerId?: unknown;
  assignedEmployees?: string[];
  // `guests` is the internal field that holds per-project subcontractor access.
  guests?: Array<{ userId: unknown; tabPermissions?: Record<string, "view" | "edit">; expiresAt?: Date | string | null }>;
}

/** Determine how a user relates to a project. Expired subcontractor access is denied. */
export function getProjectAccess(project: ProjectLike, userId: string, empId: string): ProjectAccess {
  if (project.ownerId && String(project.ownerId) === String(userId)) return { role: "owner" };
  if (empId && (project.assignedEmployees || []).includes(empId)) return { role: "employee" };
  const sub = (project.guests || []).find((g) => String(g.userId) === String(userId));
  if (sub) {
    // Access timeline: once the expiry passes, the subcontractor loses access automatically.
    if (sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now()) return { role: "none" };
    return { role: "subcontractor", perms: sub.tabPermissions || {} };
  }
  return { role: "none" };
}

/**
 * Resolve a document's `section` to the workspace tab id that owns it, so we can
 * honour per-tab access (tabAccess for employees, tabPermissions for guests).
 * Returns null when the section doesn't belong to a gated tab.
 */
export function sectionToTabId(section: string): string | null {
  if (!section) return null;
  // Custom tabs: `custom-<tabId>` or `custom-<tabId>-field-<fieldId>`,
  // where <tabId> is itself `custom-<timestamp>`.
  if (section.startsWith("custom-")) {
    let rest = section.slice("custom-".length);
    const fieldIdx = rest.indexOf("-field-");
    if (fieldIdx !== -1) rest = rest.slice(0, fieldIdx);
    return rest || null;
  }
  if (section.startsWith("project-info")) return "project-info";
  if (section.startsWith("proposals-")) return "proposals";
  if (section.startsWith("pm-")) return "pm";
  if (section.startsWith("tech-")) return "tech-docs";
  if (section.startsWith("legal-")) return "legal";
  if (section.startsWith("po-")) return "po";
  if (section.startsWith("procurement-")) return "procurement";
  if (section.startsWith("invoice-sent")) return "invoice-sent";
  if (section.startsWith("invoice-received")) return "invoice-received";
  if (section.startsWith("subinvoice-")) return "subs";
  if (section.startsWith("subcontractor-")) return "subs";
  if (section.startsWith("partner-")) return "subs";
  return null;
}

/** Can this access level VIEW the given tab's content? */
export function canViewTab(access: ProjectAccess, tabId: string | null, tabAccess?: Record<string, { employees?: boolean }>): boolean {
  switch (access.role) {
    case "owner":
      return true;
    case "employee":
      if (tabId && tabAccess && tabAccess[tabId]?.employees === false) return false;
      return true;
    case "subcontractor":
      if (!tabId) return false; // guests only see gated tab content, nothing loose
      return access.perms[tabId] === "view" || access.perms[tabId] === "edit";
    default:
      return false;
  }
}

/** Can this access level EDIT the given tab's content? */
export function canEditTab(access: ProjectAccess, tabId: string | null): boolean {
  switch (access.role) {
    case "owner":
      return true;
    case "employee":
      return true; // employees may edit tab content (identity fields gated elsewhere)
    case "subcontractor":
      return !!tabId && access.perms[tabId] === "edit";
    default:
      return false;
  }
}

/** Look up the requester's access level for the project named in req.params.id. */
export async function fetchRequesterAccess(req: AuthedRequest): Promise<{ access: ProjectAccess; found: boolean }> {
  const project = await Project.findOne({ projectId: req.params.id })
    .select("ownerId assignedEmployees guests")
    .lean();
  if (!project) return { access: { role: "none" }, found: false };
  const me = await User.findById(req.user!.userId).select("empId").lean();
  const empId = (me as { empId?: string } | null)?.empId || "";
  return { access: getProjectAccess(project, req.user!.userId, empId), found: true };
}

/**
 * Express guard for tab-scoped sub-resources (expenses, POs, invoices, procurement…).
 * Owners & assigned employees pass. Guests must have "view" on one of `tabIds` for
 * GET requests, and "edit" for writes. Pass-through users (role "none") are rejected.
 */
export function tabAccessGuard(tabIds: string[]) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const { access, found } = await fetchRequesterAccess(req);
      if (!found) return res.status(404).json({ error: "Project not found" });
      if (access.role === "owner" || access.role === "employee") return next();
      if (access.role === "subcontractor") {
        const needEdit = req.method !== "GET";
        const ok = tabIds.some((t) =>
          needEdit ? access.perms[t] === "edit" : access.perms[t] === "view" || access.perms[t] === "edit"
        );
        if (ok) return next();
        return res.status(403).json({ error: needEdit ? "You do not have edit access to this section." : "You do not have access to this section." });
      }
      return res.status(403).json({ error: "You do not have access to this project." });
    } catch (err) {
      next(err);
    }
  };
}

// The per-sub-tab permission ids for the Procurement module.
const PROC_SUBTAB_PERMS = ["proc-log", "proc-boq", "proc-submittals", "proc-rfqs", "proc-quotes", "proc-po", "proc-shipment"];

/**
 * Guard for procurement sub-tab routes. Mirrors the frontend exactly: once a guest has ANY
 * explicit proc sub-tab grant, access is governed SOLELY by the specific sub-tab perm(s) in
 * `acceptable` (an absent perm = Hidden → denied). Only legacy guests with no sub-tab grants
 * fall back to the module-level "procurement" perm. GET needs "view"; writes need "edit".
 */
export function procTabGuard(acceptable: string[]) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const { access, found } = await fetchRequesterAccess(req);
      if (!found) return res.status(404).json({ error: "Project not found" });
      if (access.role === "owner" || access.role === "employee") return next();
      if (access.role === "subcontractor") {
        const needEdit = req.method !== "GET";
        const hasAnySub = PROC_SUBTAB_PERMS.some((p) => access.perms[p] === "view" || access.perms[p] === "edit");
        const keys = hasAnySub ? acceptable : ["procurement"];
        const ok = keys.some((t) =>
          needEdit ? access.perms[t] === "edit" : access.perms[t] === "view" || access.perms[t] === "edit"
        );
        if (ok) return next();
        return res.status(403).json({ error: needEdit ? "You do not have edit access to this section." : "You do not have access to this section." });
      }
      return res.status(403).json({ error: "You do not have access to this project." });
    } catch (err) {
      next(err);
    }
  };
}
