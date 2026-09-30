import type { ApiMilestone } from "./api";
import { UNCATEGORISED, isMilestonePoint, parseDate, phasePercent, plannedDays, wbsNumbers } from "./projectSchedule";
import { predsOf, type LinkType } from "./scheduleLinks";

/**
 * CR 326 (2026-09-28): the schedule as a Primavera P6 file.
 *
 * P6 imports its XML format (PMXML) without extra tools, so that is what is written: the project,
 * its phases as the WBS, each task and milestone as an activity with its dates, duration and
 * progress, and every dependency as a relationship with its type and lag. P6 counts in hours, on
 * an 8-hour day.
 *
 * Not yet checked against a P6 installation: the structure follows Oracle's published schema.
 */

const HOURS = 8;
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tag = (name: string, v: unknown) => (v === "" || v === null || v === undefined ? `<${name} xsi:nil="true"/>` : `<${name}>${esc(v)}</${name}>`);
const at = (iso: string | undefined, end: boolean) => (parseDate(iso) ? `${iso}T${end ? "17:00:00" : "08:00:00"}` : "");
const REL: Record<LinkType, string> = { FS: "Finish to Start", SS: "Start to Start", FF: "Finish to Finish", SF: "Start to Finish" };
const STATUS = (m: ApiMilestone) => (m.status === "completed" ? "Completed" : m.status === "in_progress" || m.actualStart ? "In Progress" : "Not Started");

export function buildP6Xml(o: { projectNo: string; projectName: string; contractStart?: string; deadline?: string; milestones: ApiMilestone[]; categories: string[] }): string {
  const rows = o.milestones.filter((m) => m.status !== "cancelled");
  const nums = wbsNumbers(rows, o.categories);
  const phaseOf = (m: ApiMilestone) => (m.category || "").trim() || UNCATEGORISED;
  const phases = [...new Set([...o.categories.filter((c) => rows.some((m) => phaseOf(m) === c)), ...rows.map(phaseOf)])];
  const wbsId = new Map(phases.map((c, i) => [c, 100 + i]));
  const actId = new Map(rows.map((m, i) => [m.id, 1000 + i]));
  const starts = rows.map((m) => m.plannedStart || "").filter(Boolean).sort();
  const ends = rows.map((m) => m.plannedEnd || m.plannedStart || "").filter(Boolean).sort();
  const start = o.contractStart || starts[0] || "";
  const today = new Date().toISOString().slice(0, 10);

  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<APIBusinessObjects xmlns="http://xmlns.oracle.com/Primavera/P6/V8.3/API/BusinessObjects" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`);
  out.push(`<Calendar><ObjectId>1</ObjectId><Name>7-day week, ${HOURS} hours</Name><Type>Global</Type><HoursPerDay>${HOURS}</HoursPerDay><HoursPerWeek>${HOURS * 7}</HoursPerWeek><IsDefault>1</IsDefault></Calendar>`);
  out.push(`<Project>`);
  out.push(tag("ObjectId", 1), tag("Id", o.projectNo), tag("Name", o.projectName), tag("PlannedStartDate", at(start, false)), tag("MustFinishByDate", at(o.deadline, true)), tag("DataDate", at(today, false)), tag("ScheduledFinishDate", at(ends[ends.length - 1], true)));
  phases.forEach((c, i) => {
    out.push(`<WBS>${tag("ObjectId", wbsId.get(c))}${tag("ProjectObjectId", 1)}<ParentObjectId xsi:nil="true"/>${tag("Code", nums.phase.get(c) || String(i + 1))}${tag("Name", c)}${tag("SequenceNumber", (i + 1) * 10)}</WBS>`);
  });
  rows.forEach((m) => {
    const point = isMilestonePoint(m);
    const days = point ? 0 : plannedDays(m) ?? 0;
    const no = nums.task.get(m.id) || "";
    out.push(`<Activity>` +
      tag("ObjectId", actId.get(m.id)) + tag("ProjectObjectId", 1) + tag("WBSObjectId", wbsId.get(phaseOf(m))) + tag("CalendarObjectId", 1) +
      tag("Id", `A${no.replace(/\./g, "-") || actId.get(m.id)}`) + tag("Name", m.name) +
      // A milestone that ends a chain of work is a finish milestone; one with nothing before it starts one.
      tag("Type", point ? (predsOf(m).length ? "Finish Milestone" : "Start Milestone") : "Task Dependent") +
      tag("Status", STATUS(m)) + tag("DurationType", "Fixed Duration and Units") + tag("PercentCompleteType", "Duration") +
      tag("PlannedDuration", days * HOURS) + tag("RemainingDuration", Math.round(days * HOURS * (1 - phasePercent(m) / 100))) +
      tag("PlannedStartDate", at(m.plannedStart, false)) + tag("PlannedFinishDate", at(m.plannedEnd || m.plannedStart, !point || predsOf(m).length > 0)) +
      tag("StartDate", at(m.actualStart || m.plannedStart, false)) + tag("FinishDate", at(m.actualEnd || m.plannedEnd || m.plannedStart, true)) +
      tag("ActualStartDate", at(m.actualStart, false)) + tag("ActualFinishDate", at(m.actualEnd, true)) +
      tag("PercentComplete", phasePercent(m) / 100) + tag("NotesToResources", m.description || "") +
      `</Activity>`);
  });
  let rel = 5000;
  rows.forEach((m) => {
    for (const p of predsOf(m)) {
      if (!actId.has(p.id)) continue;
      out.push(`<Relationship>${tag("ObjectId", rel++)}${tag("PredecessorProjectObjectId", 1)}${tag("SuccessorProjectObjectId", 1)}${tag("PredecessorActivityObjectId", actId.get(p.id))}${tag("SuccessorActivityObjectId", actId.get(m.id))}${tag("Type", REL[p.type])}${tag("Lag", p.lag * HOURS)}</Relationship>`);
    }
  });
  out.push(`</Project>`, `</APIBusinessObjects>`);
  return out.join("\n");
}
