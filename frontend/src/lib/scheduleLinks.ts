import type { ApiMilestone } from "./api";
import { addDuration, daysBetween, parseDate, toIso, type DurationUnit } from "./projectSchedule";

/**
 * CR 294 (2026-09-23): a schedule is a chain, not a pile of separate dates.
 *
 * A task can be tied to the one before it: it starts after that task finishes (finish to start),
 * starts alongside it (start to start), or overlaps it by a few days. Move an early task and
 * everything hanging off it moves with it. A task's length is either entered as a duration, in
 * which case the finish is worked out, or given as two dates. A milestone has no length at all:
 * its start and finish are the same day.
 *
 * Days here are calendar days, the same as everywhere else in the schedule (the Duration column,
 * the Gantt chart and the contract-time bar all count calendar days), so nothing disagrees.
 */

export type LinkType = "FS" | "SS";

/**
 * How a link reads to a person, with the other task named, so the wording in the editor, the table
 * and any warning all say the same thing.
 */
export function lagLabel(link: LinkType, lag: number, predName = "the task before it"): string {
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  if (link === "SS") {
    if (lag === 0) return `starts when ${predName} starts`;
    return lag > 0 ? `starts ${days(lag)} after ${predName} starts` : `starts ${days(-lag)} before ${predName} starts`;
  }
  if (lag === 0) return `starts the day after ${predName} finishes`;
  if (lag > 0) return `starts ${days(lag)} after ${predName} finishes`;
  return `starts ${days(-lag)} before ${predName} finishes, so they overlap`;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** A task with no length: start and finish are the same day. */
export const isZeroLength = (m: ApiMilestone) => !!m.isMilestone;

/**
 * The length to keep when a task moves: what was typed as a duration, or the span its two dates
 * already describe. Null when the task has no length to preserve.
 */
export function lengthOf(m: ApiMilestone): { value: number; unit: DurationUnit } | null {
  if (isZeroLength(m)) return { value: 0, unit: "days" };
  if (m.durationValue && m.durationValue > 0) return { value: m.durationValue, unit: (m.durationUnit || "days") as DurationUnit };
  const s = parseDate(m.plannedStart), e = parseDate(m.plannedEnd);
  if (s && e) return { value: Math.max(0, daysBetween(s, e)), unit: "days" };
  return null;
}

/** The finish that goes with a start, keeping the task's length. */
export function finishFor(m: ApiMilestone, start: Date): Date {
  const len = lengthOf(m);
  if (!len || len.value <= 0) return start;
  return addDuration(start, len.value, len.unit);
}

/**
 * Where a task starts, given the task it waits on.
 * - FS, lag 0: the day after the predecessor finishes. A negative lag overlaps them.
 * - SS, lag 0: the same day the predecessor starts.
 */
export function startFromLink(pred: ApiMilestone, link: LinkType, lag: number): Date | null {
  if (link === "SS") {
    const ps = parseDate(pred.plannedStart);
    return ps ? addDays(ps, lag) : null;
  }
  const pe = parseDate(pred.plannedEnd) || parseDate(pred.plannedStart);
  return pe ? addDays(pe, 1 + lag) : null;
}

/** Would making `predId` the predecessor of `id` close a loop? */
export function wouldCycle(rows: ApiMilestone[], id: string, predId: string): boolean {
  if (!predId) return false;
  if (predId === id) return true;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<string>();
  let cur = byId.get(predId);
  while (cur) {
    if (cur.id === id) return true;
    if (seen.has(cur.id)) return true;    // an existing loop; do not add to it
    seen.add(cur.id);
    cur = cur.dependsOn ? byId.get(cur.dependsOn) : undefined;
  }
  return false;
}

/** The tasks that hang off `id`, directly or further down the chain. */
export function dependentsOf(rows: ApiMilestone[], id: string): string[] {
  const out: string[] = [];
  const queue = [id];
  const seen = new Set([id]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const r of rows) {
      if (r.dependsOn === cur && !seen.has(r.id)) { seen.add(r.id); out.push(r.id); queue.push(r.id); }
    }
  }
  return out;
}

/**
 * Work the linked dates through the whole list: every task that waits on another takes its dates
 * from it, and so on down the chain. A task with no link keeps the dates it has. A task whose
 * predecessor has no dates yet is left alone rather than being given a guess.
 */
export function relinkAll(rows: ApiMilestone[]): ApiMilestone[] {
  const byId = new Map(rows.map((r) => [r.id, { ...r }]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const r of rows) {
    const pred = r.dependsOn && byId.get(r.dependsOn) ? r.dependsOn : "";
    if (pred) children.set(pred, [...(children.get(pred) || []), r.id]);
    else roots.push(r.id);
  }

  const done = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const id = queue.shift()!;
    if (done.has(id)) continue;          // a loop: stop rather than spin
    done.add(id);
    const parent = byId.get(id)!;
    for (const childId of children.get(id) || []) {
      const child = byId.get(childId)!;
      const start = startFromLink(parent, (child.linkType as LinkType) || "FS", child.lagDays || 0);
      if (start) {
        child.plannedStart = toIso(start);
        child.plannedEnd = toIso(finishFor(child, start));
        if (isZeroLength(child)) { child.plannedEnd = child.plannedStart; child.durationValue = 0; }
      }
      queue.push(childId);
    }
  }
  // Anything caught in a loop keeps what it had; the UI refuses to create one in the first place.
  return rows.map((r) => byId.get(r.id) || r);
}

/**
 * The dates a new task should open with: straight after the one before it. Returns the link as
 * well, so the new row is genuinely tied to its predecessor rather than merely starting near it.
 */
export function suggestNext(prev: ApiMilestone | undefined, fallbackStart?: string): Partial<ApiMilestone> {
  if (prev && (prev.plannedEnd || prev.plannedStart)) {
    const start = startFromLink(prev, "FS", 0);
    if (start) return { dependsOn: prev.id, linkType: "FS", lagDays: 0, plannedStart: toIso(start), plannedEnd: toIso(start) };
  }
  const s = parseDate(fallbackStart);
  return s ? { plannedStart: toIso(s), plannedEnd: toIso(s) } : {};
}

/** A task that runs past the contract deadline, so the schedule can say so before it is saved. */
export function overrunsDeadline(m: ApiMilestone, deadline?: string): number {
  const end = parseDate(m.plannedEnd) || parseDate(m.plannedStart);
  const dl = parseDate(deadline);
  return end && dl && end > dl ? daysBetween(dl, end) : 0;
}
