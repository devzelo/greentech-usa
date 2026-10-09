import type { ApiProject, ProjectFinancials } from "./api";
import { COMPANY } from "./brandTokens";
import { moneyNum } from "./bonding";
import { WIP_CURRENT, WIP_OPPORTUNITY, contractWithChanges, withWip } from "./wip";
import { effectiveEndDate, parseDate } from "./projectSchedule";
import { statusMatches } from "./projectStatus";
import { timelineOverview } from "./timelineOverview";

/**
 * 2026-10-09 - the WIP report's figures, worked out once and shared by its PDF, its Excel sheet and
 * its Word copy, so the three always agree. Laid out as the client's template (GT Platform Contract
 * Backlog Template): the contract backlog, the revenue opportunities and the formulas.
 */

export interface WipInput {
  projects: ApiProject[];
  financials: Record<string, ProjectFinancials>;
  current: boolean;
  opportunities: boolean;
  scope: string;
  /** The Project Location column (shown unless false). */
  location?: boolean;
}

export const WIP_TITLE = "GREENTECH USA  |  CONTRACT BACKLOG & REVENUE OPPORTUNITIES";
export const WIP_BADGE = "WORK IN PROGRESS (WIP)";
export const WIP_ACTIVE_TITLE = "1. Active Projects - Contract Backlog";
export const WIP_OPPS_TITLE = "2. Potential Projects - Revenue Capture Opportunities";
export const WIP_DEFS_TITLE = "3. Formulas & Report Definitions";

/** The column headings, broken over two lines where the template breaks them. Location is last. */
export const WIP_ACTIVE_COLUMNS = [
  "Customer", "Project Name /\nBrief Description", "Prime\nContractor", "Contract\nType", "Set-Aside /\nCompetitive", "Start\nDate", "End\nDate",
  "Contract\nValue", "Revenue\nEarned", "Remaining\nContract Value", "Invoiced\nto Date", "Costs to\nDate", "Cost to\nComplete", "Estimated\nGross Profit", "Project\nLocation*",
];
export const WIP_OPPS_COLUMNS = [
  "Customer", "Project Name /\nBrief Description", "Prime Contractor", "Contract Type", "Set-Aside /\nCompetitive", "Expected\nStart Date", "Expected\nEnd Date",
  "Estimated\nContract Value", "Pwin (%)", "Weighted\nContract Value", "Project Location*",
];

/** "Jan 2026", as the template writes the dates. */
export const monthYear = (v?: string) => { const d = parseDate(v); return d ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : ""; };
/** The contract's competition, as the template's "Set-Aside / Competitive" column reads it. */
export const competition = (v: string) => (!v ? "" : /full and open|competitive/i.test(v) ? "Competitive" : v.replace(/\bset-aside\b/i, "Set-Aside").replace(/^./, (c) => c.toUpperCase()));
/** City and country, from the site address when it has them. */
export const placeOf = (p: ApiProject) => {
  const city = p.siteAddress?.city?.trim(), country = p.siteAddress?.country?.trim();
  return city || country ? [city, country].filter(Boolean).join(", ") : (p.location || "").trim();
};

const inStatuses = (p: ApiProject, list: string[]) => list.some((s) => statusMatches(s, p.status));

export interface WipActive {
  p: ApiProject; customer: string; prime: string; contractType: string; competition: string; start: string; end: string;
  /** Contract value with the approved change orders. */
  value: number;
  /** Cost to cost when a cost to complete is held; otherwise the work complete on the timeline. */
  earned: number;
  remaining: number; invoiced: number; costs: number;
  /** Null: no cost to complete entered. */
  ctc: number | null;
  profit: number | null;
  /** The timeline's work complete (%), the fallback for the revenue earned. */
  workPct: number;
  place: string;
}

/** 1. Active Projects - Contract Backlog. */
export function wipActive(o: WipInput): WipActive[] {
  return o.projects.filter((p) => inStatuses(p, WIP_CURRENT)).map((p) => {
    const w = withWip(p.wip);
    const fin = o.financials[p.id] || ({} as ProjectFinancials);
    const value = contractWithChanges(p.value, w);
    const invoiced = fin.totalInvoiced ?? fin.income ?? 0;
    const costs = fin.expenses ?? 0;
    const ctc = w.costToComplete?.trim() ? moneyNum(w.costToComplete) : null;
    const total = ctc !== null ? costs + ctc : null;
    const workPct = timelineOverview(p).workPct;
    // Revenue earned, cost to cost: the share of the estimated total cost spent so far. Without a
    // cost to complete, the work complete from the project's timeline.
    const earned = value ? (ctc !== null ? (total ? Math.min(value, (value * costs) / total) : 0) : (value * workPct) / 100) : 0;
    return {
      p, customer: p.clientInfo?.name || "", prime: w.primeContractor || COMPANY.name, contractType: p.contractType || "", competition: competition(w.competition),
      start: monthYear(p.startDate || p.contractDate), end: monthYear(effectiveEndDate(p)),
      value, earned, remaining: value - earned, invoiced, costs, ctc, profit: ctc !== null ? value - (costs + ctc) : null, workPct, place: placeOf(p),
    };
  });
}

export interface WipOpportunity {
  p: ApiProject; customer: string; prime: string; contractType: string; competition: string; start: string; end: string;
  value: number; pwin: number | null; weighted: number | null; place: string;
}

/** 2. Potential Projects - Revenue Capture Opportunities. */
export function wipOpportunities(o: WipInput): WipOpportunity[] {
  return o.projects.filter((p) => inStatuses(p, WIP_OPPORTUNITY)).map((p) => {
    const w = withWip(p.wip);
    const value = moneyNum(p.value);
    const pwin = parseFloat(w.winChance);
    return {
      p, customer: p.clientInfo?.name || "", prime: w.primeContractor || COMPANY.name, contractType: p.contractType || "", competition: competition(w.competition),
      start: monthYear(p.startDate) || "TBD", end: monthYear(p.endDate) || "TBD",
      value, pwin: isFinite(pwin) ? pwin : null, weighted: isFinite(pwin) ? (value * pwin) / 100 : null, place: placeOf(p),
    };
  });
}

/** 3. Formulas & Report Definitions, in the template's two columns. */
export function wipDefinitions(showPlace: boolean): { left: string[]; right: string[] } {
  return {
    left: [
      "Remaining Contract Value = Contract Value - Revenue Earned.",
      "Estimated Gross Profit = Contract Value - (Costs to Date + Cost to Complete).",
      "Estimated Total Cost = Costs to Date + Cost to Complete.",
      "Revenue Earned: value of work completed; may differ from invoiced amounts. Here Contract Value x Costs to Date / Estimated Total Cost; without a Cost to Complete, Contract Value x the work complete on the timeline.",
      "Invoiced to Date: total invoices issued to the customer, not cash received.",
    ],
    right: [
      "Weighted Contract Value = Estimated Contract Value x (Pwin / 100).",
      "Costs to Date: actual project costs incurred.",
      "Cost to Complete: estimated additional costs to finish the project.",
      "Totals: sum monetary columns; Pwin is project-specific and is not summed.",
      showPlace
        ? "Project Location*: optional field; city and country. Contract Value includes approved change orders; a dash is a figure not held for the project."
        : "Contract Value includes approved change orders; a dash is a figure not held for the project.",
    ],
  };
}

export const usd = (n: number) => `${n < 0 ? "(" : ""}${Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}${n < 0 ? ")" : ""}`;
