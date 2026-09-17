import type { ApiExtension, ApiMilestone, MilestoneStatus } from "./api";

/**
 * CR 188-192: the project timeline. Every phase / milestone has its own planned dates (phases can
 * overlap; nothing is chained), actual dates, a status and a % complete. The first planned dates
 * are kept as the baseline so planned and actual can be compared. A phase whose start and end are
 * the same day is a milestone (a flag on the chart).
 */

export const DAY = 86400000;

// ── Master list (Reza, "Project Timeline – Phases & Milestones") ───────────────────────────────
export interface PhaseDef { key: string; name: string }
export const MASTER_PHASES: PhaseDef[] = [
  { key: "opportunity", name: "Opportunity / Solicitation" },
  { key: "prebid", name: "Pre-Bid / Site Visit" },
  { key: "proposal-prep", name: "Proposal Preparation" },
  { key: "proposal-submission", name: "Proposal Submission" },
  { key: "negotiation", name: "Clarification / Negotiation" },
  { key: "award", name: "Contract Award" },
  { key: "execution", name: "Contract Execution" },
  { key: "bonds", name: "Bonds / Insurance / Letter of Credit" },
  { key: "ntp", name: "Notice to Proceed (NTP/CNTP)" },
  { key: "mobilization", name: "Mobilization" },
  { key: "survey", name: "Site Survey / Investigation" },
  { key: "design", name: "Design / Engineering" },
  { key: "design-review", name: "Design Review / Approval" },
  { key: "boq", name: "BOQ Development" },
  { key: "procurement", name: "Procurement / RFQ" },
  { key: "vendor-po", name: "Vendor Selection / Purchase Order" },
  { key: "submittals", name: "Technical Submittals" },
  { key: "submittal-review", name: "Submittal Review / Approval" },
  { key: "manufacturing", name: "Manufacturing / Fabrication" },
  { key: "fat", name: "Factory Acceptance Testing (FAT)" },
  { key: "packing", name: "Packing / Export Preparation" },
  { key: "shipping", name: "Shipping / Transit" },
  { key: "customs", name: "Customs Clearance" },
  { key: "delivery", name: "Site Delivery" },
  { key: "site-prep", name: "Site Preparation / Civil Works" },
  { key: "installation", name: "Installation / Construction" },
  { key: "electrical", name: "Electrical / Controls / BMS" },
  { key: "commissioning", name: "Testing & Commissioning" },
  { key: "training", name: "Training" },
  { key: "punch", name: "Punch List" },
  { key: "inspection", name: "Final Inspection / Acceptance" },
  { key: "as-built", name: "As-Built Drawings / Closeout Documents" },
  { key: "handover", name: "Project Handover" },
  { key: "substantial", name: "Substantial Completion" },
  { key: "final", name: "Final Completion" },
  { key: "warranty", name: "Warranty / Defects Liability Period (DLP)" },
  { key: "warranty-inspection", name: "Warranty Inspection / Closeout" },
  { key: "closeout", name: "Project Closeout / Closed" },
];
export const CUSTOM_KEY = "custom";

// A steady colour per phase (by list position), so a phase looks the same everywhere.
const PALETTE = ["#10b981", "#3b82f6", "#8b5cf6", "#f97316", "#0d9488", "#ec4899", "#eab308", "#6366f1", "#ef4444", "#14b8a6", "#a855f7", "#0ea5e9"];
export function phaseColor(m: Pick<ApiMilestone, "key" | "id">, index = 0): string {
  const i = MASTER_PHASES.findIndex((p) => p.key === m.key);
  if (i >= 0) return PALETTE[i % PALETTE.length];
  let h = 0;
  for (const ch of m.id || String(index)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return m.key === CUSTOM_KEY ? "#64748b" : PALETTE[h % PALETTE.length];
}

export const STATUS_META: Record<MilestoneStatus, { label: string; chip: string }> = {
  not_started: { label: "Not Started", chip: "border-slate-200 bg-slate-50 text-slate-500" },
  in_progress: { label: "In Progress", chip: "border-blue-200 bg-blue-50 text-blue-700" },
  completed: { label: "Completed", chip: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  on_hold: { label: "On Hold", chip: "border-amber-200 bg-amber-50 text-amber-700" },
  delayed: { label: "Delayed", chip: "border-red-200 bg-red-50 text-red-700" },
  cancelled: { label: "Cancelled", chip: "border-slate-200 bg-slate-100 text-slate-400 line-through" },
};
export const STATUS_ORDER: MilestoneStatus[] = ["not_started", "in_progress", "completed", "on_hold", "delayed", "cancelled"];

// ── Dates ───────────────────────────────────────────────────────────────────────────────────────

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
/** "01 May 2024", as on the timeline mockups. */
export const fmtDay = (v?: string | Date | null) => {
  const d = v instanceof Date ? v : parseDate(v || "");
  return d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
};
export const fmtShort = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });

/** Whole months, clamped to the end of a shorter month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(d: Date, n: number): Date {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d.getDate(), last));
  return t;
}

export type DurationUnit = "days" | "weeks" | "months";
export const UNIT_LABEL: Record<DurationUnit, string> = { days: "days", weeks: "weeks", months: "months" };

export function addDuration(d: Date, n: number, unit: DurationUnit): Date {
  const whole = Math.max(0, n || 0);
  if (unit === "months") {
    const full = Math.floor(whole);
    const base = addMonths(d, full);
    const extraDays = Math.round((whole - full) * 30);
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + extraDays);
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + Math.round(whole * (unit === "weeks" ? 7 : 1)));
}

export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);

/** Planned length in days ("0 days" is a milestone). Null when a date is missing. */
export function plannedDays(m: ApiMilestone): number | null {
  const s = parseDate(m.plannedStart), e = parseDate(m.plannedEnd);
  return s && e ? Math.max(0, daysBetween(s, e)) : null;
}
export const isMilestonePoint = (m: ApiMilestone) => plannedDays(m) === 0;

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

/** Days late at the end: actual (or, while running, today) past the baseline end. */
export function delayDays(m: ApiMilestone, today = new Date()): number {
  const base = parseDate(m.baselineEnd || m.plannedEnd);
  if (!base) return 0;
  const ref = parseDate(m.actualEnd) || (m.status !== "completed" && m.status !== "cancelled" ? new Date(today.getFullYear(), today.getMonth(), today.getDate()) : null);
  return ref ? Math.max(0, daysBetween(base, ref)) : 0;
}
export const startSlip = (m: ApiMilestone) => {
  const b = parseDate(m.baselineStart || m.plannedStart), a = parseDate(m.actualStart);
  return a && b ? daysBetween(b, a) : 0;
};

// ── Extensions (CR-P 126) ───────────────────────────────────────────────────────────────────────

/** The extensions with a valid date, earliest first. */
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

// ── Where a project stands ──────────────────────────────────────────────────────────────────────

export type MilestoneState = "done" | "overdue" | "current" | "upcoming";

export interface PlannedMilestone extends ApiMilestone {
  start: Date | null;
  end: Date | null;
  days: number;
  state: MilestoneState;
}

export interface SchedulePlan {
  milestones: PlannedMilestone[];
  start: Date | null;
  finish: Date | null;
  totalDays: number;
  progress: number;          // 0-100, % complete weighted by planned length
  todayPct: number | null;   // where today sits between start and finish, 0-100
  overdue: PlannedMilestone[];
}

/** The state a phase is in today. */
export function milestoneState(m: ApiMilestone, today = new Date()): MilestoneState {
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (m.status === "completed" || (m.percent ?? 0) >= 100 || m.doneAt) return "done";
  const s = parseDate(m.plannedStart), e = parseDate(m.plannedEnd);
  if (e && now > e) return "overdue";
  if (m.status === "in_progress" || (s && now >= s)) return "current";
  return "upcoming";
}

export function phasePercent(m: ApiMilestone): number {
  if (m.status === "completed" || m.doneAt) return 100;
  return Math.max(0, Math.min(100, Math.round(m.percent ?? 0)));
}

/**
 * The timeline as a whole. `startDate` / `endDate` (the contract dates) frame it when given; the
 * phases' own dates widen it when they run outside.
 */
export function planSchedule(milestones: ApiMilestone[], startDate?: string, today = new Date(), endDate?: string): SchedulePlan {
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const active = milestones.filter((m) => m.status !== "cancelled");
  const planned: PlannedMilestone[] = milestones.map((m) => {
    const s = parseDate(m.plannedStart), e = parseDate(m.plannedEnd);
    return { ...m, start: s, end: e, days: s && e ? Math.max(0, daysBetween(s, e)) : 0, state: milestoneState(m, now) };
  });
  const dates = planned.flatMap((m) => [m.start, m.end]).filter((d): d is Date => !!d);
  const frameStart = parseDate(startDate);
  const frameEnd = parseDate(endDate);
  const start = [frameStart, ...dates].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] || null;
  const finish = [frameEnd, ...dates].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] || null;
  let w = 0, done = 0;
  for (const m of planned.filter((x) => x.status !== "cancelled")) {
    const weight = Math.max(1, m.days + 1);
    w += weight;
    done += weight * phasePercent(m);
  }
  const progress = active.length && w ? Math.round(done / w) : 0;
  const todayPct = start && finish && finish > start
    ? Math.max(0, Math.min(100, ((now.getTime() - start.getTime()) / (finish.getTime() - start.getTime())) * 100))
    : null;
  return {
    milestones: planned,
    start, finish,
    totalDays: start && finish ? Math.max(0, daysBetween(start, finish)) : 0,
    progress, todayPct,
    overdue: planned.filter((m) => m.state === "overdue" && m.status !== "cancelled"),
  };
}

/** Bar segment colour per milestone state (project lists). */
export const MILESTONE_SEG: Record<MilestoneState, string> = {
  done: "bg-emerald-500",
  overdue: "bg-amber-400 animate-pulse",
  current: "bg-primary/40",
  upcoming: "bg-slate-200",
};

export const MILESTONE_STATE_LABEL: Record<MilestoneState, string> = {
  done: "finished", overdue: "past its planned end", current: "in progress", upcoming: "upcoming",
};

/** A phase's planned length as written: "77 days", or the duration it was entered with. */
export function milestoneLength(m: ApiMilestone): string {
  const d = plannedDays(m);
  if (d !== null) return `${d} day${d === 1 ? "" : "s"}`;
  const n = m.durationValue || m.duration || 0;
  const u = (m.durationUnit || m.unit || "days") as DurationUnit;
  return n ? `${n} ${n === 1 ? UNIT_LABEL[u].replace(/s$/, "") : UNIT_LABEL[u]}` : "";
}

/** Where a project stands on its milestones: finished count, the one in progress, the next, and any overdue. */
export function milestoneFocus(plan: SchedulePlan) {
  const ms = plan.milestones.filter((m) => m.status !== "cancelled");
  const byStart = [...ms].sort((a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity));
  return {
    done: ms.filter((m) => m.state === "done").length,
    total: ms.length,
    overdue: plan.overdue,
    current: byStart.find((m) => m.state === "current"),
    next: byStart.find((m) => m.state === "upcoming"),
  };
}
