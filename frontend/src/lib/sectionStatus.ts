// Shared per-section status options (client CR-B-15) so EVERY builder — RFIs, Agreements,
// Proposal, Submittals — uses the exact same colour-coded set. Locked/Unlocked is a separate
// toggle (a section can be e.g. "Complete" AND locked).
export type SectionStatus = "" | "NotStarted" | "InProgress" | "WaitingInfo" | "UnderReview" | "Complete" | "NeedsRevision";

export const SECTION_STATUS_OPTS: { v: SectionStatus; label: string; cls: string }[] = [
  { v: "", label: "No status", cls: "bg-slate-100 text-slate-400" },
  { v: "NotStarted", label: "Not Started", cls: "bg-slate-100 text-slate-500" },
  { v: "InProgress", label: "In Progress", cls: "bg-amber-50 text-amber-600" },
  { v: "WaitingInfo", label: "Waiting for Info", cls: "bg-orange-50 text-orange-600" },
  { v: "UnderReview", label: "Under Review", cls: "bg-blue-50 text-blue-600" },
  { v: "Complete", label: "Complete", cls: "bg-emerald-50 text-emerald-600" },
  { v: "NeedsRevision", label: "Needs Revision", cls: "bg-red-50 text-red-600" },
];

export const sectionStatusMeta = (v?: string) =>
  SECTION_STATUS_OPTS.find((o) => o.v === (v || "")) || SECTION_STATUS_OPTS[0];
