import Project from "../models/Project";

// CR 188: the old schedule chained milestones one after another from the start date, each with a
// duration. The timeline gives every phase its own dates, so turn each old milestone into planned
// (and baseline) dates, and a confirmed one into a completed phase. Idempotent: a milestone that
// already has planned dates is left alone.
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function parse(v?: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function add(d: Date, n: number, unit: string): Date {
  if (unit === "months") {
    const whole = Math.floor(n);
    const t = new Date(d.getFullYear(), d.getMonth() + whole, 1);
    t.setDate(Math.min(d.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
    t.setDate(t.getDate() + Math.round((n - whole) * 30));
    return t;
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + Math.round(n * (unit === "weeks" ? 7 : 1)));
}

export async function datedMilestones(): Promise<number> {
  const projects = await Project.find({ "schedule.milestones.0": { $exists: true } }).select("schedule startDate contractDate");
  let changed = 0;
  for (const p of projects) {
    const ms = p.schedule?.milestones || [];
    if (!ms.some((m) => !m.plannedStart && (m.duration > 0 || m.doneAt))) continue;
    let cursor = parse(p.startDate) || parse(p.contractDate);
    for (const m of ms) {
      if (m.plannedStart) { cursor = parse(m.plannedEnd) || cursor; continue; }
      if (cursor) {
        const end = add(cursor, m.duration || 0, m.unit || "days");
        m.plannedStart = iso(cursor);
        m.plannedEnd = iso(end);
        m.baselineStart = m.baselineStart || m.plannedStart;
        m.baselineEnd = m.baselineEnd || m.plannedEnd;
        cursor = end;
      }
      m.durationValue = m.durationValue || m.duration || 0;
      m.durationUnit = m.durationUnit || m.unit || "days";
      if (m.doneAt) { m.status = "completed"; m.percent = 100; m.actualEnd = m.actualEnd || m.doneAt; }
      else if (!m.status) m.status = "not_started";
    }
    p.markModified("schedule");
    await p.save();
    changed++;
  }
  return changed;
}

// CR 238: a schedule is grouped by category. Tasks created before categories existed get the one
// their master-list phase (or name) implies, the same rule the builder uses for new tasks. A task
// that already has a category, or whose name implies none, is left alone; idempotent.
export function categoryFor(key = "", name = ""): string {
  const k = `${key} ${name}`.toLowerCase();
  if (/opportunity|prebid|pre-bid|proposal|negotiation|solicitation|bid/.test(k)) return "Pre-award / Bidding";
  if (/award|execution|bonds|ntp|notice to proceed/.test(k)) return "Award / NTP";
  if (/submittal/.test(k)) return "Pre-construction submittals";
  if (/design|survey|boq/.test(k)) return "Design";
  if (/procure|rfq|vendor|purchase|manufactur|fabricat|fat|packing|shipping|customs|delivery/.test(k)) return "Procurement";
  if (/mobiliz/.test(k)) return "Mobilization";
  if (/commission|testing|training|inspection|punch/.test(k)) return "Testing & commissioning";
  if (/closeout|as-built|handover|completion|warranty|final/.test(k)) return "Closeout";
  if (/site|install|construct|electrical|civil|building|piping/.test(k)) return "Construction";
  return "";
}

export async function categoriseMilestones(): Promise<number> {
  const projects = await Project.find({ "schedule.milestones.0": { $exists: true } }).select("schedule");
  let changed = 0;
  for (const p of projects) {
    const ms = p.schedule?.milestones || [];
    let touched = false;
    for (const m of ms) {
      if ((m.category || "").trim()) continue;
      const c = categoryFor(m.key, m.name);
      if (c) { m.category = c; touched = true; }
    }
    if (touched) { p.markModified("schedule"); await p.save(); changed++; }
  }
  return changed;
}
