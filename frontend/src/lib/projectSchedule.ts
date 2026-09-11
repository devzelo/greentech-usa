import type { ApiExtension, ApiMilestone } from "./api";

/**
 * CR-P (121)-(125) — the project schedule: milestones run one after another from the project's
 * start date, each for its own duration. From that we get each milestone's planned finish, which
 * one we are in today, which are overdue (not confirmed by their date), and the progress, counted
 * from the confirmed milestones weighted by their length.
 */

export const DAY = 86400000;

/** The usual construction milestones; a project ticks the ones that apply (client list to follow). */
export const DEFAULT_MILESTONES: Array<{ name: string; duration: number; unit: ApiMilestone["unit"] }> = [
  { name: "Design", duration: 2, unit: "months" },
  { name: "Mobilization", duration: 20, unit: "days" },
  { name: "Site work", duration: 1, unit: "months" },
  { name: "Building construction", duration: 3, unit: "months" },
  { name: "Piping", duration: 1, unit: "months" },
  { name: "Testing and commissioning", duration: 3, unit: "weeks" },
  { name: "Project closeout", duration: 2, unit: "weeks" },
];

export const UNIT_LABEL: Record<ApiMilestone["unit"], string> = { days: "days", weeks: "weeks", months: "months" };

/** A stored yyyy-mm-dd (or any parseable) date as a local midnight; null when blank or invalid. */
export function parseDate(v?: string): Date | null {
  if (!v || !v.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v.trim());
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** Whole months, clamped to the end of a shorter month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(d: Date, n: number): Date {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d.getDate(), last));
  return t;
}

export function addDuration(d: Date, n: number, unit: ApiMilestone["unit"]): Date {
  const whole = Math.max(0, n || 0);
  if (unit === "months") {
    const full = Math.floor(whole);
    const base = addMonths(d, full);
    const extraDays = Math.round((whole - full) * 30);   // a fraction of a month counts as days
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + extraDays);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + Math.round(whole * (unit === "weeks" ? 7 : 1)));
}

/** Rough length in days, for weighting when there is no start date to plan from. */
const approxDays = (m: ApiMilestone) => Math.max(0, m.duration || 0) * (m.unit === "months" ? 30 : m.unit === "weeks" ? 7 : 1);

export type MilestoneState = "done" | "overdue" | "current" | "upcoming";

export interface PlannedMilestone extends ApiMilestone {
  start: Date | null;
  end: Date | null;
  days: number;          // its length in days (planned, or approximate)
  state: MilestoneState;
}

export interface SchedulePlan {
  milestones: PlannedMilestone[];
  start: Date | null;
  finish: Date | null;   // when the last milestone is planned to finish
  totalDays: number;
  progress: number;      // 0-100, from the confirmed milestones
  todayPct: number | null;   // where today sits along the plan, 0-100
  overdue: PlannedMilestone[];
}

export function planSchedule(milestones: ApiMilestone[], startDate?: string, today = new Date()): SchedulePlan {
  const start = parseDate(startDate);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let cursor = start;
  const planned: PlannedMilestone[] = milestones.map((m) => {
    const s = cursor;
    const e = s ? addDuration(s, m.duration, m.unit) : null;
    cursor = e;
    const days = s && e ? Math.max(0, Math.round((e.getTime() - s.getTime()) / DAY)) : approxDays(m);
    let state: MilestoneState = "upcoming";
    if (m.doneAt) state = "done";
    else if (e && now >= e) state = "overdue";          // its date came and it is not confirmed
    else if (s && now >= s) state = "current";
    return { ...m, start: s, end: e, days, state };
  });
  const totalDays = planned.reduce((n, m) => n + m.days, 0);
  const doneDays = planned.filter((m) => m.state === "done").reduce((n, m) => n + m.days, 0);
  const progress = totalDays > 0 ? Math.round((doneDays / totalDays) * 100)
    : planned.length ? Math.round((planned.filter((m) => m.state === "done").length / planned.length) * 100) : 0;
  const finish = cursor;
  const todayPct = start && finish && finish > start
    ? Math.max(0, Math.min(100, ((now.getTime() - start.getTime()) / (finish.getTime() - start.getTime())) * 100))
    : null;
  return { milestones: planned, start, finish, totalDays, progress, todayPct, overdue: planned.filter((m) => m.state === "overdue") };
}

/** "2 months 5 days" between two dates (months first). */
export function humanGap(from: Date, to: Date): string {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (months > 0 && addMonths(from, months) > to) months -= 1;
  if (months < 0) months = 0;
  const days = Math.max(0, Math.round((to.getTime() - addMonths(from, months).getTime()) / DAY));
  const p = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (months <= 0) return p(days, "day");
  return days ? `${p(months, "month")} ${p(days, "day")}` : p(months, "month");
}

/** CR-P (126) — the extensions with a valid date, earliest first. */
export function sortedExtensions(exts?: ApiExtension[]): ApiExtension[] {
  return (exts || []).filter((e) => parseDate(e.endDate)).sort((a, b) => parseDate(a.endDate)!.getTime() - parseDate(b.endDate)!.getTime());
}

/** The deadline now: the latest approved extension, or the original end date. */
export function effectiveEndDate(p: { endDate?: string; schedule?: { extensions?: ApiExtension[] } }): string {
  const exts = sortedExtensions(p.schedule?.extensions);
  const last = exts[exts.length - 1];
  const orig = parseDate(p.endDate);
  return last && (!orig || parseDate(last.endDate)! > orig) ? last.endDate : p.endDate || "";
}

export const newMilestoneId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
