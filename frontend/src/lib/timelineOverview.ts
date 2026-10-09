import type { ApiProject } from "./api";
import { DAY, daysBetween, effectiveEndDate, humanGap, milestoneFocus, parseDate, planSchedule, type PlannedMilestone } from "./projectSchedule";

/**
 * 2026-10-09 - the figures of the timeline card at the top of the schedule (TimelineBar): the
 * contract dates, its length and any extension, the time left and elapsed, the work complete, and
 * the phases in date order on a track. The Quick Report prints the same card from these, so the
 * two always read alike.
 */
export function timelineOverview(project: ApiProject, now = new Date()) {
  const milestones = (project.schedule?.milestones || []).filter((m) => m.status !== "cancelled");
  const contractStart = parseDate(project.startDate || project.contractDate);
  const startIsContractDate = !parseDate(project.startDate) && !!parseDate(project.contractDate);
  const origEnd = parseDate(project.endDate);
  const deadline = parseDate(effectiveEndDate(project));
  const extended = !!(deadline && origEnd && deadline > origEnd);
  const plan = planSchedule(milestones, project.startDate || project.contractDate, now, effectiveEndDate(project));
  const hasMs = milestones.length > 0;
  const workPct = hasMs ? plan.progress : Math.max(0, Math.min(100, Math.round(project.progress || 0)));
  const focus = milestoneFocus(plan);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // The track runs over the contract; phases outside it widen it.
  const trackStart = plan.start || contractStart;
  const trackEnd = plan.finish || deadline;
  const span = trackStart && trackEnd ? Math.max(DAY, trackEnd.getTime() - trackStart.getTime()) : 0;
  const pos = (d: Date) => (trackStart && span ? Math.max(0, Math.min(100, ((d.getTime() - trackStart.getTime()) / span) * 100)) : 0);
  const todayPct = trackStart && span ? pos(today) : null;
  const elapsedPct = contractStart && deadline && deadline > contractStart
    ? Math.max(0, Math.min(100, (daysBetween(contractStart, today) / daysBetween(contractStart, deadline)) * 100)) : null;
  const overdue = !!(deadline && today > deadline && workPct < 100);
  const remaining = deadline ? (overdue ? `${humanGap(deadline, today)} overdue` : humanGap(today, deadline)) : "";
  const remainingDays = deadline ? Math.abs(daysBetween(today, deadline)) : 0;

  /**
   * CR 287 (2026-09-23): how long the contract runs, all told. Counted the same way a phase's
   * duration is counted on the schedule (start to end), so the two agree. When time has been
   * granted, both numbers are shown: what was signed, and what it now runs to.
   * CR 322 - first day and last day both count: 1 Sep to 15 Sep is 15 days (GT Comments 2, the
   * KFC example: "Project Duration: 15 days").
   */
  const totalDays = contractStart && deadline ? Math.max(0, daysBetween(contractStart, deadline) + 1) : null;
  const origDays = contractStart && origEnd ? Math.max(0, daysBetween(contractStart, origEnd) + 1) : null;
  const addedDays = extended && totalDays !== null && origDays !== null ? totalDays - origDays : 0;

  const dots: PlannedMilestone[] = plan.milestones.filter((m) => m.start).sort((a, b) => a.start!.getTime() - b.start!.getTime());
  const undated = plan.milestones.filter((m) => !m.start).length;

  return {
    milestones, contractStart, startIsContractDate, origEnd, deadline, extended, plan, hasMs, workPct, focus,
    today, pos, todayPct, elapsedPct, overdue, remaining, remainingDays, totalDays, origDays, addedDays, dots, undated,
  };
}
