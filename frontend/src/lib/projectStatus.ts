import type { ProjectStatus } from "./api";

// Color-coded project statuses so a project's stage reads at a glance (client request).
// Keeps the legacy statuses (Ongoing/Completed/Pending/Draft/Planning) mapped onto the new palette.
export type StatusMeta = { label: string; badge: string; dot: string; text: string };

export const PROJECT_STATUS_META: Record<string, StatusMeta> = {
  Proposal:     { label: "Proposal / Opportunity",     badge: "bg-yellow-50 text-yellow-700 border-yellow-200", dot: "bg-yellow-400", text: "text-yellow-600" },
  BidSubmitted: { label: "Bid Submitted / Awaiting Award", badge: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-400", text: "text-orange-600" },
  Active:       { label: "Active / Ongoing",           badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", text: "text-emerald-600" },
  Warranty:     { label: "Warranty / DLP",             badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-400", text: "text-blue-600" },
  Closed:       { label: "Completed / Closed",         badge: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400", text: "text-slate-500" },
  Lost:         { label: "Lost / Cancelled",           badge: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-400", text: "text-red-600" },
  OnHold:       { label: "On Hold",                    badge: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-400", text: "text-purple-600" },
  // Legacy statuses mapped onto the palette
  Ongoing:      { label: "Active / Ongoing",           badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", text: "text-emerald-600" },
  Completed:    { label: "Completed / Closed",         badge: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400", text: "text-slate-500" },
  Pending:      { label: "Bid Submitted / Awaiting Award", badge: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-400", text: "text-orange-600" },
  Planning:     { label: "Proposal / Opportunity",     badge: "bg-yellow-50 text-yellow-700 border-yellow-200", dot: "bg-yellow-400", text: "text-yellow-600" },
  Draft:        { label: "Draft",                      badge: "bg-slate-100 text-slate-500 border-slate-200", dot: "bg-slate-300", text: "text-slate-400" },
};

export const statusMeta = (status: string): StatusMeta =>
  PROJECT_STATUS_META[status] || { label: status || "—", badge: "bg-slate-100 text-slate-500 border-slate-200", dot: "bg-slate-300", text: "text-slate-400" };

// The statuses offered when creating / filtering a project (new palette, Draft last).
export const PROJECT_STATUSES: ProjectStatus[] = ["Proposal", "BidSubmitted", "Active", "Warranty", "Closed", "Lost", "OnHold", "Draft"];
// The colour key shown above the project tables (the 7 primary statuses, in stage order).
export const PROJECT_STATUS_LEGEND: ProjectStatus[] = ["Proposal", "BidSubmitted", "Active", "Warranty", "Closed", "Lost", "OnHold"];

// Statuses saved before the colour palette existed, folded onto their modern equivalent so old
// projects still match the right filter chip and the right dashboard tile.
export const LEGACY_ALIASES: Record<string, string[]> = {
  Proposal: ["Proposal", "Planning"],
  BidSubmitted: ["BidSubmitted", "Pending"],
  Active: ["Active", "Ongoing"],
  Closed: ["Closed", "Completed"],
};
export const statusMatches = (filter: string, status: string) =>
  filter === "All" || (LEGACY_ALIASES[filter] || [filter]).includes(status);
