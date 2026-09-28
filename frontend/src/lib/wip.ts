import { moneyNum } from "./bonding";

/**
 * CR 312 (2026-09-25): the figures a work-in-progress (WIP) report asks for that a project did not
 * hold yet. Banks and bonding companies each have their own form; the report gives GreenTech every
 * figure in one table to copy from. Billed to date and cost to date come from the invoices and
 * expenses already recorded, so they are not typed here.
 */
export interface ProjectWip {
  /** How the contract was competed: full and open, a set-aside, sole source. */
  competition: string;
  primeContractor: string;
  /** Chance of winning, for an opportunity (0-100). */
  winChance: string;
  /** How much of the contract is funded (obligated) so far. */
  fundedValue: string;
  /** The profit expected when the proposal was priced, as a percent of the contract. */
  grossProfitPct: string;
  /** Approved change orders, added to the contract price. */
  approvedChanges: string;
  /** What is still to be spent to finish the work, as last estimated. */
  costToComplete: string;
}

export const COMPETITION = [
  "Full and open (competitive)",
  "Small business set-aside",
  "8(a) set-aside",
  "SDVOSB set-aside",
  "WOSB set-aside",
  "HUBZone set-aside",
  "Sole source",
  "Other",
];

export const emptyWip = (): ProjectWip => ({
  competition: "", primeContractor: "GreenTech USA", winChance: "", fundedValue: "", grossProfitPct: "", approvedChanges: "", costToComplete: "",
});
export const withWip = (w?: Partial<ProjectWip> | null): ProjectWip => ({ ...emptyWip(), ...(w || {}) });

/** The contract price with the approved change orders. */
export const contractWithChanges = (value: string, w: ProjectWip) => moneyNum(value) + moneyNum(w.approvedChanges);
/** The gross profit first expected, in dollars. */
export const plannedProfit = (value: string, w: ProjectWip) => {
  const p = parseFloat(w.grossProfitPct);
  return isFinite(p) ? (moneyNum(value) * p) / 100 : 0;
};
