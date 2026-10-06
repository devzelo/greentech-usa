import type { ApiProject, ProposalSection, ProposalSimilarProject } from "./api";
import { fetchProjects, projectCategories } from "./api";

/**
 * Step 6 (items 100 to 102; spec 21 to 23): past performance, relevant experience and project
 * references come from our own project records. The specification keeps the three apart, because
 * solicitations evaluate them separately.
 */

/** Library sections that list our projects. */
export const PROJECT_SECTION_KEYS = new Set(["past-performance", "relevant-experience", "project-references", "appx-experience-sheets"]);

/** Project References open with the reference table (spec 23), the others with a summary table. Both then print one page per project. */
export const referencesOnly = (libraryKey?: string) => libraryKey === "project-references";

/** The label on each project page, numbered "#1", "#2": "Past Performance #1", "Project Reference #2", ... */
export function sheetLabel(builtin: boolean, libraryKey?: string): string {
  if (builtin || libraryKey === "past-performance") return "Past Performance";
  if (libraryKey === "relevant-experience") return "Relevant Experience";
  if (libraryKey === "project-references") return "Project Reference";
  if (libraryKey === "appx-experience-sheets") return "Relevant Project";
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
    // A reader without the figures right gets the record with no value: keep the one already saved.
    value: p.canSeeFigures === false ? prev?.value || "" : p.value || "",
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
    scope: (p.scopeOfWork || []).map((x) => x.trim()).filter(Boolean),
    showValue: prev?.showValue,
    showPhoto: prev?.showPhoto,
  };
}

/**
 * 2026-10-06 - "all data should come from the project information": an entry picked from our
 * records prints what the record says when the proposal is built, so a change to the project's
 * description or scope shows in every proposal that lists it. Only the per-proposal choices stay
 * (photo, print value, print photo, order). A record no longer found prints the copy saved here.
 */
type WithProjects = { similarProjects?: ProposalSimilarProject[]; sections?: ProposalSection[] };
export function withLiveProjects<T extends WithProjects>(c: T, pool: ApiProject[]): T {
  if (!pool.length) return c;
  const byId = new Map(pool.map((p) => [p.id, p]));
  const live = (xs: ProposalSimilarProject[]) => xs.map((e) => {
    const p = e.projectId ? byId.get(e.projectId) : undefined;
    return p ? entryFromProject(p, e) : e;
  });
  return {
    ...c,
    ...(c.similarProjects ? { similarProjects: live(c.similarProjects) } : {}),
    ...(c.sections ? { sections: c.sections.map((s) => (s.projects?.length ? { ...s, projects: live(s.projects) } : s)) } : {}),
  };
}

/** True when any entry in the volume is linked to a project record. */
export const hasLinkedProjects = (c: WithProjects) =>
  [...(c.similarProjects || []), ...(c.sections || []).flatMap((s) => s.projects || [])].some((e) => !!e.projectId);

/** The records a linked entry can point at: the open projects and the archived ones. */
export async function linkedProjectPool(): Promise<ApiProject[]> {
  const [open, archived] = await Promise.all([fetchProjects("all").catch(() => []), fetchProjects("archived").catch(() => [])]);
  return [...open, ...archived];
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
