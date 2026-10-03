import type { ApiMilestone } from "./api";
import { DAY, addDuration, daysBetween, isMilestonePoint, parseDate, toIso, type DurationUnit } from "./projectSchedule";

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
 * CR 322 (2026-09-28): how days are counted, from the client's worked example (a recipe project,
 * kept as the engine's test).
 *   - A duration is the days worked, first and last included: 3 days from 2 Sep is 2, 3, 4 Sep.
 *     A task that starts and ends the same day is 1 day. Only a milestone is 0.
 *   - A milestone that follows a task falls on the day that task finishes; whatever follows a
 *     milestone starts the next day.
 *   - A task may leave out weekends, holidays or both; by default it counts every calendar day.
 * To make those come out without special cases everywhere, the engine thinks in day boundaries
 * ("instants"): a task runs from the start of its first day to the end of its last, and a
 * milestone sits at the end of its day.
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
    // A number (1.2) or an activity ID from an imported sheet (A1000), then the type and the lag.
    const m = /^([A-Za-z]*[0-9]+(?:\.[0-9]+)*)(FS|SS|FF|SF)?([+-][0-9]+)?d?$/i.exec(raw);
    const id = m ? idOfNumber(m[1]) : undefined;
    if (!m || !id) { unknown.push(raw); continue; }
    if (preds.some((p) => p.id === id)) continue;
    preds.push({ id, type: ((m[2] || "FS").toUpperCase() as LinkType), lag: m[3] ? parseInt(m[3], 10) : 0 });
  }
  return { preds, unknown };
}

// Whole days, so a clock change can never shave an hour into a day's worth of float.
const dn = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
const fromDn = (n: number) => { const u = new Date(n * DAY); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()); };

/** A milestone: no length, a moment at the end of its day. */
export const isZeroLength = (m: ApiMilestone) => isMilestonePoint(m);

// The days a task may leave out. Holidays are set once for the page (the platform's holiday list).
let HOLIDAYS = new Set<string>();
export function setScheduleHolidays(days: Iterable<string>) { HOLIDAYS = new Set(days); }
const everyDay = (m: ApiMilestone) => m.includeWeekends !== false && m.includeHolidays !== false;
function isWorkDay(n: number, m: ApiMilestone): boolean {
  const d = fromDn(n);
  if (m.includeWeekends === false && (d.getDay() === 0 || d.getDay() === 6)) return false;
  if (m.includeHolidays === false && HOLIDAYS.has(toIso(d))) return false;
  return true;
}
const nextWorkDay = (n: number, m: ApiMilestone) => { let d = n, guard = 0; while (!isWorkDay(d, m) && guard++ < 400) d++; return d; };

/**
 * A task's place in time as two day boundaries: `s` the start of its first day, `f` the end of its
 * last. A milestone has both at the end of its day. Null when it has no date yet.
 */
function span(m: ApiMilestone): { s: number; f: number } | null {
  const S = parseDate(m.plannedStart);
  if (!S) return null;
  if (isZeroLength(m)) { const t = dn(S) + 1; return { s: t, f: t }; }
  const F = parseDate(m.plannedEnd) || S;
  const s0 = dn(S);
  return { s: s0, f: Math.max(dn(F), s0) + 1 };
}

/**
 * The length to keep when a task moves: what was typed as a duration, or the days its two dates
 * cover (both counted; working days only when the task leaves some out). Null when it has no
 * length to preserve.
 */
export function lengthOf(m: ApiMilestone): { value: number; unit: DurationUnit } | null {
  if (isZeroLength(m)) return { value: 0, unit: "days" };
  if (m.durationValue && m.durationValue > 0) return { value: m.durationValue, unit: (m.durationUnit || "days") as DurationUnit };
  const sp = span(m);
  if (!sp) return null;
  if (everyDay(m)) return { value: sp.f - sp.s, unit: "days" };
  let n = 0;
  for (let d = sp.s; d < sp.f; d++) if (isWorkDay(d, m)) n++;
  return { value: Math.max(1, n), unit: "days" };
}

/** Where a task's last day ends, given where its first day starts. */
function finishInstant(m: ApiMilestone, s0: number): number {
  if (isZeroLength(m)) return s0;
  const len = lengthOf(m);
  if (!len || len.value <= 0) return s0 + 1;
  if (len.unit === "months") return Math.max(s0 + 1, dn(addDuration(fromDn(s0), len.value, "months")));
  const calendar = everyDay(m);
  const n = Math.max(1, Math.round(len.value * (len.unit === "weeks" ? (calendar ? 7 : 5) : 1)));
  if (calendar) return s0 + n;
  let last = nextWorkDay(s0, m), left = n - 1, guard = 0;
  while (left > 0 && guard++ < 20000) { last++; if (isWorkDay(last, m)) left--; }
  return last + 1;
}
/** The other way round, for FF and SF links: where it must start to finish at `f0`. */
function startInstant(m: ApiMilestone, f0: number): number {
  if (isZeroLength(m)) return f0;
  const len = lengthOf(m);
  if (!len || len.value <= 0) return f0 - 1;
  if (len.unit === "months") {
    const f = fromDn(f0), full = Math.floor(len.value), extra = Math.round((len.value - full) * 30);
    return Math.min(f0 - 1, dn(new Date(f.getFullYear(), f.getMonth() - full, f.getDate() - extra)));
  }
  const calendar = everyDay(m);
  const n = Math.max(1, Math.round(len.value * (len.unit === "weeks" ? (calendar ? 7 : 5) : 1)));
  if (calendar) return f0 - n;
  let first = f0 - 1, guard = 0;
  while (!isWorkDay(first, m) && guard++ < 400) first--;
  let left = n - 1;
  while (left > 0 && guard++ < 20000) { first--; if (isWorkDay(first, m)) left--; }
  return first;
}

/**
 * What one link asks of the task that follows: the boundary its start (FS, SS) or its finish
 * (FF, SF) may not come before. Two adjustments keep milestones where people expect them:
 * a milestone after a milestone is the next day, and a milestone tied to a task's start falls on
 * that first day rather than the evening before.
 */
const linkShift = (link: LinkType, predIsPoint: boolean, succIsPoint: boolean) =>
  (link === "FS" && predIsPoint && succIsPoint) || ((link === "SS" || link === "SF") && succIsPoint && !predIsPoint) ? 1 : 0;
function linkBoundary(pred: ApiMilestone, link: LinkType, lag: number, succIsPoint: boolean): number | null {
  const p = span(pred);
  if (!p) return null;
  return (link === "FS" || link === "FF" ? p.f : p.s) + lag + linkShift(link, isZeroLength(pred), succIsPoint);
}

/**
 * The earliest start one link allows (a milestone's date, for a milestone), or null when the other
 * task has no dates yet. Without `task` it answers for a plain task that follows.
 */
export function startFromLink(pred: ApiMilestone, link: LinkType, lag: number, task?: ApiMilestone): Date | null {
  const point = !!task && isZeroLength(task);
  const at = linkBoundary(pred, link, lag, point);
  if (at === null) return null;
  if (point) return fromDn(at - 1);
  if (link === "FS" || link === "SS") return fromDn(task ? nextWorkDay(at, task) : at);
  return task ? fromDn(startInstant(task, at)) : fromDn(at - 1);
}

/**
 * CR 321 (2026-09-28): what the rest of the schedule asks of a task beyond its own links.
 *   - A phase may wait on another phase or on a milestone. That is the same as every item in the
 *     phase waiting on it, so it is read as links the items do not carry themselves.
 *   - A phase, a task or a milestone may have its start set by hand. With links as well, the later
 *     of the two applies, so a date set by hand never breaks a dependency.
 *   - A task on "auto" with nothing to wait on starts when the project does.
 */
export interface PhaseLink { kind: "phase" | "item"; ref: string; type: LinkType; lag: number }
export interface PhaseRule { name: string; startMode?: "auto" | "manual"; manualStart?: string; pred?: PhaseLink | null }
export interface PlanContext { phases?: PhaseRule[]; projectStart?: string }
const phaseKey = (s?: string) => (s || "").trim().toLowerCase();

/** The items a phase's link points at: the milestone itself, or the other phase's items. */
export function phaseLinkTargets(rows: ApiMilestone[], link: PhaseLink): string[] {
  if (link.kind === "item") return rows.some((r) => r.id === link.ref) ? [link.ref] : [];
  const items = rows.filter((r) => phaseKey(r.category) === phaseKey(link.ref) && r.status !== "cancelled");
  // A phase finishes when all its items have (FS, FF); it starts when its earliest item does (SS, SF).
  if (link.type === "FS" || link.type === "FF") return items.map((r) => r.id);
  const dated = items.filter((r) => parseDate(r.plannedStart)).sort((a, b) => parseDate(a.plannedStart)!.getTime() - parseDate(b.plannedStart)!.getTime());
  return dated.length ? [dated[0].id] : [];
}

/** The rows with each phase's link written onto its items (never one that would make a loop). */
export function withPhaseLinks(rows: ApiMilestone[], ctx?: PlanContext): ApiMilestone[] {
  const rules = (ctx?.phases || []).filter((p) => p.pred && p.pred.ref);
  if (!rules.length) return rows;
  let out = rows;
  for (const rule of rules) {
    const link = rule.pred!;
    const targets = phaseLinkTargets(rows, link);
    if (!targets.length) continue;
    const cur = out;
    /**
     * CR 321 / GT Comments 2 page 3 - which of the phase's items the link is written onto.
     *   FS, SS: the phase cannot start before the link allows, so every item waits on it.
     *   FF, SF: the phase cannot FINISH before the link allows. A phase finishes with its last
     *           items (those nothing else in the phase follows), so those are the ones timed.
     */
    const inPhase = cur.filter((r) => phaseKey(r.category) === phaseKey(rule.name));
    const ids = new Set(inPhase.map((r) => r.id));
    const followed = new Set(inPhase.flatMap((r) => predsOf(r).map((q) => q.id)).filter((id) => ids.has(id)));
    const finishLink = link.type === "FF" || link.type === "SF";
    out = cur.map((r) => {
      if (!ids.has(r.id) || (finishLink && followed.has(r.id))) return r;
      const own = predsOf(r);
      const extra = targets
        .filter((id) => id !== r.id && !own.some((q) => q.id === id) && !wouldCycle(cur, r.id, id))
        .map((id) => ({ id, type: link.type, lag: Math.round(link.lag || 0) }));
      return extra.length ? withPreds(r, [...own, ...extra]) : r;
    });
  }
  return out;
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

/**
 * CR 321 - an item put into the list with what comes after it. A successor is the same link seen
 * from the other end: "this, then 2.4" is kept as "this" among 2.4's predecessors, so a link made
 * from either item shows on both, and taking it off one takes it off the other.
 */
export function withItem(rows: ApiMilestone[], item: ApiMilestone, successors: Pred[]): ApiMilestone[] {
  let found = false;
  const out = rows.map((r) => {
    if (r.id === item.id) { found = true; return item; }
    const own = predsOf(r), kept = own.filter((p) => p.id !== item.id);
    const add = successors.find((c) => c.id === r.id);
    if (!add && kept.length === own.length) return r;
    return withPreds(r, add ? [...kept, { id: item.id, type: add.type, lag: add.lag }] : kept);
  });
  return found ? out : [...out, item];
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
export function relinkAll(rows: ApiMilestone[], ctx?: PlanContext): ApiMilestone[] {
  const linked = withPhaseLinks(rows, ctx);
  const own = new Map(rows.map((r) => [r.id, r]));
  const byId = new Map(linked.map((r) => [r.id, { ...r }]));
  const phaseFloor = new Map<string, number>();
  for (const p of ctx?.phases || []) {
    const d = p.startMode === "manual" ? parseDate(p.manualStart) : null;
    if (d) phaseFloor.set(phaseKey(p.name), dn(d));
  }
  const projectStart = parseDate(ctx?.projectStart);
  for (const id of topoOrder(linked)) {
    const t = byId.get(id)!;
    const o = own.get(id)!;
    const point = isZeroLength(t);
    const starts: number[] = [];
    for (const p of predsOf(t)) {
      const pred = byId.get(p.id);
      const at = pred ? linkBoundary(pred, p.type, p.lag, point) : null;
      if (at === null) continue;
      starts.push(p.type === "FS" || p.type === "SS" ? at : startInstant(t, at));
    }
    // CR 321 - dates set by hand are floors; a milestone sits at the end of its day.
    const at = (d: Date) => dn(d) + (point ? 1 : 0);
    const floor = phaseFloor.get(phaseKey(o.category));
    if (floor !== undefined) starts.push(floor + (point ? 1 : 0));
    if (o.startMode === "manual") {
      const d = parseDate(o.manualStart || o.plannedStart);
      if (d) starts.push(at(d));
    } else if (o.startMode === "auto") {
      if (!starts.length && projectStart) starts.push(at(projectStart));
    } else if (starts.length && !predsOf(o).length) {
      // A row from before the forms, with a typed date and no link of its own, now caught by its
      // phase: the typed date is kept as a date set by hand, so the phase can only push it later.
      const d = parseDate(o.plannedStart);
      if (d) { starts.push(at(d)); t.startMode = "manual"; t.manualStart = o.plannedStart; }
    }
    if (!starts.length) continue;
    let s0 = Math.max(...starts);
    if (point) {
      // A milestone sits at the end of its day.
      t.plannedStart = toIso(fromDn(s0 - 1));
      t.plannedEnd = t.plannedStart;
      t.durationValue = 0;
      continue;
    }
    s0 = nextWorkDay(s0, t);
    // The finish is worked out from the length the task had BEFORE it moved (CR 300): a task given
    // as two dates must move, not stretch.
    const f0 = finishInstant(t, s0);
    t.plannedStart = toIso(fromDn(s0));
    t.plannedEnd = toIso(fromDn(f0 - 1));
  }
  // Anything caught in a loop keeps what it had; the editor refuses to make one in the first place.
  // Only the dates come back: a phase's link is never written onto its items for good.
  return rows.map((r) => {
    const t = byId.get(r.id);
    if (!t) return r;
    if (t.plannedStart === r.plannedStart && t.plannedEnd === r.plannedEnd && t.durationValue === r.durationValue && t.startMode === r.startMode) return r;
    return { ...r, plannedStart: t.plannedStart, plannedEnd: t.plannedEnd, durationValue: t.durationValue, ...(t.startMode !== r.startMode ? { startMode: t.startMode, manualStart: t.manualStart } : {}) };
  });
}

/**
 * The critical path.
 *
 * `float` is each task's total float in days: how far it can slip before the project's finish
 * moves. `critical` holds the tasks with none to spare. Cancelled tasks and tasks without dates
 * take no part. `finish` is the project's last planned day. Both are always worked out here;
 * nobody types a float or marks a task critical (CR 320).
 */
export interface CpmInfo { float: Map<string, number>; critical: Set<string>; finish: Date | null }
export function criticalPath(all: ApiMilestone[], ctx?: PlanContext): CpmInfo {
  const rows = withPhaseLinks(all, ctx);
  const live = rows.filter((r) => r.status !== "cancelled" && parseDate(r.plannedStart));
  const byId = new Map(live.map((r) => [r.id, r]));
  const es = new Map<string, number>(), ef = new Map<string, number>();
  for (const r of live) { const sp = span(r)!; es.set(r.id, sp.s); ef.set(r.id, sp.f); }
  const float = new Map<string, number>();
  const critical = new Set<string>();
  if (!live.length) return { float, critical, finish: null };
  const pf = Math.max(...live.map((r) => ef.get(r.id)!));

  const succ = new Map<string, Array<{ id: string; type: LinkType; lag: number }>>();
  for (const r of live) for (const p of predsOf(r)) if (byId.has(p.id)) succ.set(p.id, [...(succ.get(p.id) || []), { id: r.id, type: p.type, lag: p.lag }]);

  const lf = new Map<string, number>(), ls = new Map<string, number>();
  for (const id of topoOrder(live).reverse()) {
    const dur = ef.get(id)! - es.get(id)!;
    const point = isZeroLength(byId.get(id)!);
    let latest = pf;
    for (const s of succ.get(id) || []) {
      if (!ls.has(s.id)) continue;       // a successor caught in a loop sets no limit
      const shift = linkShift(s.type, point, isZeroLength(byId.get(s.id)!));
      // The latest this task's start (SS, SF) or finish (FS, FF) may be, from that successor.
      const limit = (s.type === "FS" || s.type === "SS" ? ls.get(s.id)! : lf.get(s.id)!) - s.lag - shift;
      latest = Math.min(latest, s.type === "FS" || s.type === "FF" ? limit : limit + dur);
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
  return { float, critical, finish: fromDn(pf - 1) };
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
