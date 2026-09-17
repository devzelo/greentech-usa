import type { ApiProject, ProposalSimilarProject } from "./api";
import { projectCategories } from "./api";

/**
 * Step 6 (items 100 to 102; spec 21 to 23): past performance, relevant experience and project
 * references come from our own project records. The specification keeps the three apart, because
 * solicitations evaluate them separately.
 */

/** Library sections that list our projects. */
export const PROJECT_SECTION_KEYS = new Set(["past-performance", "relevant-experience", "project-references", "appx-experience-sheets"]);

/** Project References print as one table (spec 23); the others as a summary table, then one data sheet per project. */
export const referencesOnly = (libraryKey?: string) => libraryKey === "project-references";

/** The label on each data sheet: "Past Performance 1", "Relevant Experience 2", ... */
export function sheetLabel(builtin: boolean, libraryKey?: string): string {
  if (builtin || libraryKey === "past-performance") return "Past Performance";
  if (libraryKey === "relevant-experience") return "Relevant Experience";
  return "Project";
}

const DONE = new Set(["Completed", "Closed", "Warranty"]);
const uid = () => Math.random().toString(36).slice(2, 10);

/** Everything a project can be found by: its categories (which now include the former Project Nature, CR 184). */
export function projectTags(p: ApiProject): string[] {
  return [...new Set([...projectCategories(p), ...(p.projectNature?.selected || [])].filter(Boolean))];
}

/** A project's photos, cover image first. */
export function projectPhotos(p: ApiProject): string[] {
  const g = (p.gallery || []).filter((x) => x.type === "image" && !!x.url).map((x) => x.url);
  return [...new Set([p.image || "", ...g].filter(Boolean))];
}

/** A proposal entry filled from the project record. `prev` keeps the per-proposal choices on a refresh. */
export function entryFromProject(p: ApiProject, prev?: ProposalSimilarProject): ProposalSimilarProject {
  const start = p.startDate || p.contractDate || "";
  const photos = projectPhotos(p);
  return {
    id: prev?.id || uid(),
    projectId: p.id,
    name: p.name || "",
    client: p.clientInfo?.name || "",
    value: p.value || "",
    year: (p.endDate || start).slice(0, 4),
    summary: p.description || "",
    contractNo: p.contractNo || "",
    start,
    end: p.endDate || "",
    status: DONE.has(p.status) ? "Completed" : "Ongoing",
    location: p.location || "",
    contractType: p.contractType || "",
    workType: projectTags(p).join(", "),
    poc: p.clientInfo?.contactName || "",
    pocEmail: p.clientInfo?.email || "",
    pocPhone: p.clientInfo?.phone || "",
    cpars: p.cpars || "",
    photo: prev?.photo && photos.includes(prev.photo) ? prev.photo : photos[0] || "",
    showValue: prev?.showValue,
    showPhoto: prev?.showPhoto,
  };
}

export const blankEntry = (): ProposalSimilarProject => ({ id: uid(), name: "", client: "", value: "", year: "", summary: "", status: "Completed" });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2023-03-14" or "2023-03" as "Mar 2023"; anything else as typed. */
export function fmtMonth(v?: string): string {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})/.exec(v.trim());
  return m && MONTHS[Number(m[2]) - 1] ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : v.trim();
}

/** The period of performance, "Mar 2023 – Sep 2025", or "Mar 2023 – Present" while ongoing. */
export function periodOf(e: ProposalSimilarProject): string {
  const a = fmtMonth(e.start), b = fmtMonth(e.end);
  if (a && b) return `${a} – ${b}`;
  if (a) return e.status === "Completed" ? a : `${a} – Present`;
  return b || e.year || "";
}
