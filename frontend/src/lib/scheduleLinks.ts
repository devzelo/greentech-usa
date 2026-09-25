import type { ApiMilestone } from "./api";
import { DAY, addDuration, daysBetween, parseDate, toIso, type DurationUnit } from "./projectSchedule";

/**
 * CR 294 (2026-09-23): a schedule is a chain, not a pile of separate dates.
 * CR 300 (2026-09-25): the full scheduling engine behind it.
 *
 * A task can wait on any number of other tasks, each link one of the four the trade uses:
 *   FS  finish-to-start   it starts after the other finishes (the default)
 *   SS  start-to-start    it starts when the other starts
 *   FF  finish-to-finish  it finishes when the other finishes
 *   SF  start-to-finish   it finishes when the other starts
 * each with a lag in days: positive waits, negative overlaps. A task with several links starts at
 * the latest date any of them allows. Move an early task, change its length or its links, and
 * everything hanging off it is worked out again, down the whole chain.
 *
 * On top of that, the critical path: the chain of tasks with no room to slip. The planned dates
 * are the early dates (the forward pass has already placed every linked task as early as its links
 * allow), a backward pass from the project's finish gives the latest dates, and the difference is
 * each task's float. Float 0 is critical.
 *
 * Days are calendar days, the count the rest of the schedule uses (the Duration column, the chart,
 * the contract-time bar), so nothing disagrees.
 */

export type LinkType = "FS" | "SS" | "FF" | "SF";
export interface Pred { id: string; type: LinkType; lag: number }
export const LINK_TYPES: Array<{ type: LinkType; label: string; short: string }> = [
  { type: "FS", label: "Finish to start", short: "After it finishes" },
  { type: "SS", label: "Start to start", short: "Alongside its start" },
  { type: "FF", label: "Finish to finish", short: "Finishes with it" },
  { type: "SF", label: "Start to finish", short: "Finishes when it starts" },
];
const TYPES = new Set<LinkType>(["FS", "SS", "FF", "SF"]);

/**
 * A task's links. The single link from CR 294 (dependsOn / linkType / lagDays) is read as a
 * one-item list, so no schedule saved before this loses its chain.
 */
export function predsOf(m: ApiMilestone): Pred[] {
  if (m.predecessors?.length) {
    return m.predecessors
      .filter((p) => p && p.id && p.id !== m.id)
      .map((p) => ({ id: p.id, type: TYPES.has(p.type as LinkType) ? (p.type as LinkType) : "FS", lag: Math.round(Number(p.lag) || 0) }));
  }
  if (m.dependsOn && m.dependsOn !== m.id) {
    return [{ id: m.dependsOn, type: TYPES.has(m.linkType as LinkType) ? (m.linkType as LinkType) : "FS", lag: Math.round(m.lagDays || 0) }];
  }
  return [];
}

/** The links written back in the one form from now on, with the old single link cleared. */
export const withPreds = (m: ApiMilestone, preds: Pred[]): ApiMilestone => ({ ...m, predecessors: preds, dependsOn: "", linkType: "FS", lagDays: 0 });

/**
 * How a link reads to a person, with the other task named, so the editor, the table and any
 * warning all say the same thing.
 */
export function lagLabel(link: LinkType, lag: number, predName = "the task before it"): string {
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const when = (base: string) => (lag === 0 ? base : lag > 0 ? `${days(lag)} after ${base}` : `${days(-lag)} before ${base}`);
  switch (link) {
    case "SS": return lag === 0 ? `starts when ${predName} starts` : `starts ${when(`${predName} starts`)}`;
    case "FF": return lag === 0 ? `finishes when ${predName} finishes` : `finishes ${when(`${predName} finishes`)}`;
    case "SF": return lag === 0 ? `finishes when ${predName} starts` : `finishes ${when(`${predName} starts`)}`;
    default:
      if (lag === 0) return `starts the day after ${predName} finishes`;
      if (lag > 0) return `starts ${days(lag)} after ${predName} finishes`;
      return `starts ${days(-lag)} before ${predName} finishes, so they overlap`;
  }
}

/**
 * The short form the Predecessor(s) column uses, the way scheduling software prints it:
 * "1.2" for a plain finish-to-start, "2.1SS", "3.3FS+5d", "1.3FF-2d".
 */
export function predLabel(p: Pred, number: string): string {
  const lag = p.lag ? `${p.lag > 0 ? "+" : ""}${p.lag}d` : "";
  return `${number}${p.type !== "FS" || lag ? p.type : ""}${lag}`;
}

/**
 * Read what was typed in the Predecessor(s) column back into links: "1.2, 2.1SS+3d, 3.3FF-2".
 * Unknown numbers are reported rather than guessed.
 */
export function parsePreds(text: string, idOfNumber: (n: string) => string | undefined): { preds: Pred[]; unknown: string[] } {
  const preds: Pred[] = [];
  const unknown: string[] = [];
  for (const raw of text.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^([0-9]+(?:\.[0-9]+)?)(FS|SS|FF|SF)?([+-][0-9]+)?d?$/i.exec(raw);
    const id = m ? idOfNumber(m[1]) : undefined;
    if (!m || !id) { unknown.push(raw); continue; }
    if (preds.some((p) => p.id === id)) continue;
    preds.push({ id, type: ((m[2] || "FS").toUpperCase() as LinkType), lag: m[3] ? parseInt(m[3], 10) : 0 });
  }
  return { preds, unknown };
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

/** The start that goes with a finish, keeping the task's length (for FF and SF links). */
export function startForFinish(m: ApiMilestone, finish: Date): Date {
  const len = lengthOf(m);
  if (!len || len.value <= 0) return finish;
  if (len.unit === "months") {
    const full = Math.floor(len.value);
    const extra = Math.round((len.value - full) * 30);
    return new Date(finish.getFullYear(), finish.getMonth() - full, finish.getDate() - extra);
  }
  return addDays(finish, -Math.round(len.value * (len.unit === "weeks" ? 7 : 1)));
}

/** The earliest start one link allows, or null when the other task has no dates yet. */
export function startFromLink(pred: ApiMilestone, link: LinkType, lag: number, task?: ApiMilestone): Date | null {
  const ps = parseDate(pred.plannedStart);
  const pf = parseDate(pred.plannedEnd) || ps;
  switch (link) {
    case "SS": return ps ? addDays(ps, lag) : null;
    case "FF": return pf ? (task ? startForFinish(task, addDays(pf, lag)) : addDays(pf, lag)) : null;
    case "SF": return ps ? (task ? startForFinish(task, addDays(ps, lag)) : addDays(ps, lag)) : null;
    default: return pf ? addDays(pf, 1 + lag) : null;
  }
}

/** Every task in an order where each comes after all the tasks it waits on. Tasks in a loop are left out. */
function topoOrder(rows: ApiMilestone[]): string[] {
  const ids = new Set(rows.map((r) => r.id));
  const indeg = new Map<string, number>();
  const succ = new Map<string, string[]>();
  for (const r of rows) {
    const preds = predsOf(r).filter((p) => ids.has(p.id));
    indeg.set(r.id, preds.length);
    for (const p of preds) succ.set(p.id, [...(succ.get(p.id) || []), r.id]);
  }
  const queue = rows.filter((r) => (indeg.get(r.id) || 0) === 0).map((r) => r.id);
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const s of succ.get(id) || []) {
      const n = (indeg.get(s) || 0) - 1;
      indeg.set(s, n);
      if (n === 0) queue.push(s);
    }
  }
  return out;
}

/** Would making `predId` a predecessor of `id` close a loop? */
export function wouldCycle(rows: ApiMilestone[], id: string, predId: string): boolean {
  if (!predId) return false;
  if (predId === id) return true;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const stack = [predId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === id) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const r = byId.get(cur);
    if (r) for (const p of predsOf(r)) stack.push(p.id);
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
      if (!seen.has(r.id) && predsOf(r).some((p) => p.id === cur)) { seen.add(r.id); out.push(r.id); queue.push(r.id); }
    }
  }
  return out;
}

/**
 * Work the linked dates through the whole list, in dependency order: every task that waits on
 * others starts at the latest date its links allow, and keeps its own length. A task with no link
 * keeps the dates it has; one whose predecessors have no dates yet is left alone rather than given
 * a guess.
 */
export function relinkAll(rows: ApiMilestone[]): ApiMilestone[] {
  const byId = new Map(rows.map((r) => [r.id, { ...r }]));
  for (const id of topoOrder(rows)) {
    const t = byId.get(id)!;
    const starts = predsOf(t)
      .map((p) => { const pred = byId.get(p.id); return pred ? startFromLink(pred, p.type, p.lag, t) : null; })
      .filter((d): d is Date => !!d);
    if (!starts.length) continue;
    const start = new Date(Math.max(...starts.map((d) => d.getTime())));
    // The length is read before the start is moved. Read after, a task given as two dates took its
    // length from the new start to the old end, and stretched instead of moving (CR 300 - the CR 294
    // version did this too).
    const len = lengthOf(t);
    t.plannedStart = toIso(start);
    t.plannedEnd = toIso(len && len.value > 0 ? addDuration(start, len.value, len.unit) : start);
    if (isZeroLength(t)) { t.plannedEnd = t.plannedStart; t.durationValue = 0; }
  }
  // Anything caught in a loop keeps what it had; the editor refuses to make one in the first place.
  return rows.map((r) => byId.get(r.id) || r);
}

/**
 * The critical path.
 *
 * `float` is each task's total float in days: how far it can slip before the project's finish
 * moves. `critical` holds the tasks with none to spare. Cancelled tasks and tasks without dates
 * take no part. `finish` is the project's planned finish.
 */
export interface CpmInfo { float: Map<string, number>; critical: Set<string>; finish: Date | null }
export function criticalPath(rows: ApiMilestone[]): CpmInfo {
  const live = rows.filter((r) => r.status !== "cancelled" && parseDate(r.plannedStart));
  const byId = new Map(live.map((r) => [r.id, r]));
  // Whole days, so a clock change can never shave an hour into a day's worth of float.
  const dn = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
  const es = new Map<string, number>(), ef = new Map<string, number>();
  for (const r of live) {
    const s = parseDate(r.plannedStart)!, e = parseDate(r.plannedEnd) || s;
    es.set(r.id, dn(s)); ef.set(r.id, Math.max(dn(s), dn(e)));
  }
  const float = new Map<string, number>();
  const critical = new Set<string>();
  if (!live.length) return { float, critical, finish: null };
  const pf = Math.max(...live.map((r) => ef.get(r.id)!));

  const succ = new Map<string, Array<{ id: string; type: LinkType; lag: number }>>();
  for (const r of live) for (const p of predsOf(r)) if (byId.has(p.id)) succ.set(p.id, [...(succ.get(p.id) || []), { id: r.id, type: p.type, lag: p.lag }]);

  const lf = new Map<string, number>(), ls = new Map<string, number>();
  for (const id of topoOrder(live).reverse()) {
    const dur = ef.get(id)! - es.get(id)!;
    let latest = pf;
    for (const s of succ.get(id) || []) {
      if (!ls.has(s.id)) continue;       // a successor caught in a loop sets no limit
      const sls = ls.get(s.id)!, slf = lf.get(s.id)!;
      const cand = s.type === "SS" ? sls - s.lag + dur
        : s.type === "FF" ? slf - s.lag
        : s.type === "SF" ? slf - s.lag + dur
        : sls - 1 - s.lag;
      latest = Math.min(latest, cand);
    }
    lf.set(id, latest);
    ls.set(id, latest - dur);
  }
  for (const r of live) {
    if (!lf.has(r.id)) continue;
    const f = lf.get(r.id)! - ef.get(r.id)!;
    float.set(r.id, f);
    if (f <= 0) critical.add(r.id);
  }
  const u = new Date(pf * DAY);
  return { float, critical, finish: new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()) };
}

/**
 * The dates a new task should open with: straight after the one before it, tied to it with a
 * finish-to-start link, so the new row is genuinely part of the chain.
 */
export function suggestNext(prev: ApiMilestone | undefined, fallbackStart?: string): Partial<ApiMilestone> {
  if (prev && (prev.plannedEnd || prev.plannedStart)) {
    const start = startFromLink(prev, "FS", 0);
    if (start) return { predecessors: [{ id: prev.id, type: "FS", lag: 0 }], dependsOn: "", plannedStart: toIso(start), plannedEnd: toIso(start) };
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
