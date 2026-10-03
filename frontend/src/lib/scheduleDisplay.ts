import type { ApiMilestone } from "./api";
import { isMilestonePoint, parseDate, phasePercent, plannedDays } from "./projectSchedule";

/**
 * CR 323 / 324 (2026-09-28): what the schedule shows.
 *
 * The same schedule can be a clean overview or a detailed one: which table columns show and in
 * what order, what is written beside each bar, whether float and actual dates are drawn, which
 * phases are in view, and the colours of the bars. The choice is kept per person and per project
 * (in this browser), and print and export follow it: what is shown is what is printed.
 */

export type ColKey =
  | "id" | "name" | "type" | "start" | "finish" | "duration" | "actualStart" | "actualFinish"
  | "float" | "critical" | "predecessors" | "relationship" | "status" | "assigned" | "tags" | "percent";
export type BarKey = "name" | "duration" | "start" | "finish" | "percent" | "assigned" | "id" | "milestoneLabel" | "links" | "critical";

export const COLUMN_LABELS: Record<ColKey, string> = {
  id: "ID", name: "Task name", type: "Type (Phase / Task / Milestone)", start: "Start date", finish: "Finish date", duration: "Duration (days)",
  actualStart: "Actual start date", actualFinish: "Actual finish date", float: "Float (days)", critical: "Critical (Yes / No)",
  predecessors: "Predecessors", relationship: "Relationship", status: "Status", assigned: "Assigned to", tags: "Tags", percent: "% complete",
};
export const BAR_LABELS: Record<BarKey, string> = {
  name: "Show task name on bar", duration: "Show duration (e.g. 3d)", start: "Show start date", finish: "Show finish date", percent: "Show % complete",
  assigned: "Show assigned to", id: "Show task ID", milestoneLabel: "Show milestone label", links: "Show dependency arrows (links)", critical: "Show critical path highlight",
};

export interface BarColors { critical: string; normal: string; milestone: string }
/** The document's colours: critical red, non-critical blue, a black diamond, float a pale blue. */
export const DEFAULT_COLORS: BarColors = { critical: "#dc2626", normal: "#2563eb", milestone: "#0f172a" };
export const FLOAT_COLOR = "#bfdbfe";

export interface ScheduleDisplay {
  columns: Array<{ key: ColKey; on: boolean }>;
  bars: Array<{ key: BarKey; on: boolean }>;
  /** Float after each bar: a switch of its own, apart from the critical highlight (CR 319). */
  float: boolean;
  /** The actual dates under each bar (CR 325). */
  actual: boolean;
  /** Phases left out of the table, the chart and the print. */
  hiddenPhases: string[];
  colors: BarColors;
}

const cols = (on: ColKey[]): ScheduleDisplay["columns"] => (Object.keys(COLUMN_LABELS) as ColKey[]).map((key) => ({ key, on: key === "name" || on.includes(key) }));
const bars = (on: BarKey[]): ScheduleDisplay["bars"] => (Object.keys(BAR_LABELS) as BarKey[]).map((key) => ({ key, on: on.includes(key) }));

/** The defaults in the client's picture (the ID is kept on: predecessors are read by it). */
export const defaultDisplay = (): ScheduleDisplay => ({
  columns: cols(["id", "type", "start", "finish", "duration", "float", "critical", "predecessors", "relationship"]),
  bars: bars(["name", "duration", "milestoneLabel", "links", "critical"]),
  float: false,
  actual: true,
  hiddenPhases: [],
  colors: { ...DEFAULT_COLORS },
});

export const PRESETS: Array<{ key: string; label: string; hint: string; apply: (d: ScheduleDisplay) => ScheduleDisplay }> = [
  {
    key: "minimal", label: "Minimal", hint: "Bars and links only",
    apply: (d) => ({ ...d, columns: cols(["id", "start", "finish", "duration"]), bars: bars(["links", "critical"]), float: false, actual: false }),
  },
  {
    key: "detailed", label: "Detailed", hint: "Names, durations, dates and links",
    apply: (d) => ({ ...d, columns: cols(["id", "type", "start", "finish", "duration", "float", "critical", "predecessors", "relationship"]), bars: bars(["name", "duration", "start", "finish", "milestoneLabel", "links", "critical"]), float: true }),
  },
  {
    key: "progress", label: "Progress", hint: "Actual dates, status and % complete",
    apply: (d) => ({ ...d, columns: cols(["id", "type", "start", "finish", "actualStart", "actualFinish", "duration", "float", "critical", "status", "percent"]), bars: bars(["name", "percent", "milestoneLabel", "links", "critical"]), actual: true }),
  },
];

const KEY = (projectId: string) => `gt-schedule-display:${projectId}`;
const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

/** What was chosen last time, read defensively: a list from an older version gains the new lines. */
export function loadDisplay(projectId: string): ScheduleDisplay {
  const base = defaultDisplay();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(projectId)) || "null") as Partial<ScheduleDisplay> | null;
    if (!raw || typeof raw !== "object") return base;
    const merge = <K extends string>(saved: unknown, def: Array<{ key: K; on: boolean }>) => {
      const list = Array.isArray(saved) ? (saved as Array<{ key: K; on: boolean }>).filter((x) => x && def.some((d) => d.key === x.key)) : [];
      const seen = new Set<K>();
      const out = list.filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true))).map((x) => ({ key: x.key, on: !!x.on }));
      for (const d of def) if (!seen.has(d.key)) out.push(d);
      return out;
    };
    return {
      columns: merge(raw.columns, base.columns).map((c) => (c.key === "name" ? { ...c, on: true } : c)),
      bars: merge(raw.bars, base.bars),
      float: raw.float === true,
      actual: raw.actual !== false,
      hiddenPhases: Array.isArray(raw.hiddenPhases) ? raw.hiddenPhases.filter((x): x is string => typeof x === "string") : [],
      colors: {
        critical: isHex(raw.colors?.critical) ? raw.colors!.critical : base.colors.critical,
        normal: isHex(raw.colors?.normal) ? raw.colors!.normal : base.colors.normal,
        milestone: isHex(raw.colors?.milestone) ? raw.colors!.milestone : base.colors.milestone,
      },
    };
  } catch { return base; }
}
export function saveDisplay(projectId: string, d: ScheduleDisplay) {
  try { localStorage.setItem(KEY(projectId), JSON.stringify(d)); } catch { /* private mode: the choice lasts for the visit */ }
}

export const barOn = (d: Pick<ScheduleDisplay, "bars">, key: BarKey) => !!d.bars.find((b) => b.key === key)?.on;
export const shownColumns = (d: Pick<ScheduleDisplay, "columns">): ColKey[] => d.columns.filter((c) => c.on).map((c) => c.key);

/**
 * The text beside a bar, from the display options and in their order, e.g.
 * "1.2 Develop New Chicken Recipe (3d) · 2 Sep". The screen and the print both use it, so they
 * always say the same thing. A milestone with its label on is always named.
 */
export function barLabel(m: ApiMilestone, bars: ScheduleDisplay["bars"], number = ""): string {
  const point = !!m.isMilestone || isMilestonePoint(m);
  const on = (k: BarKey) => !!bars.find((b) => b.key === k)?.on;
  if (point && !on("milestoneLabel")) return "";
  const short = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
  const ps = parseDate(m.plannedStart), pe = parseDate(m.plannedEnd) || ps;
  const out: string[] = [];
  for (const b of bars) {
    if (!b.on) continue;
    const t = b.key === "name" ? m.name
      : b.key === "id" ? number
      : b.key === "duration" ? (point ? "" : plannedDays(m) !== null ? `${plannedDays(m)}d` : "")
      : b.key === "start" ? short(ps)
      : b.key === "finish" ? (point ? "" : short(pe))
      : b.key === "percent" ? (point ? "" : `${phasePercent(m)}%`)
      : b.key === "assigned" ? (m.responsible || []).join(", ")
      : "";
    if (!t) continue;
    if (b.key === "duration") { if (out.length) out[out.length - 1] += ` (${t})`; else out.push(`(${t})`); }
    else out.push(t);
  }
  if (point && !out.length) return m.name;
  return out.join(" · ");
}
