import Project from "../models/Project";
import { createNotification } from "./notify";
import { companyLoginIds } from "./myCompany";

/**
 * 2026-10-09 - a company given a BOQ line or a work package hears about it: each of its logins gets
 * a notification pointing to its profile, where the line or package now waits for its prices.
 * Best-effort, never blocks the save.
 */
export async function tellCompanyAboutWork(companyId: string, projectId: string, what: string) {
  try {
    const ids = await companyLoginIds(companyId);
    if (!ids.length) return;
    const project = await Project.findOne({ projectId }).select("name").lean();
    const name = project?.name || projectId;
    await Promise.all(ids.map((userId) => createNotification({
      userId, type: "assignment", title: `New work on ${name}`,
      message: `GreenTech USA added you to ${what}. Open your profile to enter your unit price, total and lead time, or to send documents and invoices.`,
      link: "/dashboard/profile#vendor-work",
    })));
  } catch { /* best-effort */ }
}

/** The project's owner hears when a vendor sends prices, files or an invoice. */
export async function tellOwner(projectId: string, title: string, message: string) {
  try {
    const project = await Project.findOne({ projectId }).select("ownerId").lean();
    if (project?.ownerId) await createNotification({ userId: String(project.ownerId), title, message, link: `/dashboard/projects/${projectId}` });
  } catch { /* best-effort */ }
}
