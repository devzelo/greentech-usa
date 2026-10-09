import { Fragment } from "react";
import { Text, View, Svg, Path, Circle } from "@react-pdf/renderer";
import type { ApiMilestone, ApiProject } from "../../lib/api";
import {
  STATUS_META, delayDays, effectiveDays, fmtDay, fmtShort, groupByCategory, humanGap, isMilestonePoint, parseDate, phaseColor, phasePercent,
  plannedDays, sortedExtensions, wbsNumbers, type PlannedMilestone,
} from "../../lib/projectSchedule";
import { criticalPath } from "../../lib/scheduleLinks";
import { timelineOverview } from "../../lib/timelineOverview";
import { BRAND } from "./brand";

/**
 * 2026-10-09 - the Quick Report's timeline, as the Timeline / Milestones tab shows and prints it:
 * the timeline card from the top of the schedule (the same figures, lib/timelineOverview), the
 * phases and milestones grouped and numbered as the schedule numbers them (1, 1.1, 1.2), the
 * critical path in words, and the extensions of time.
 */

// Tailwind's colours, as the card uses them on screen.
const T = {
  s100: "#F1F5F9", s200: "#E2E8F0", s400: "#94A3B8", s500: "#64748B", s600: "#475569", s700: "#334155", s800: "#1E293B", s900: "#0F172A",
  em500: "#10B981", em600: "#059669", red500: "#EF4444", red600: "#DC2626", amber500: "#F59E0B", amber600: "#D97706",
  blue600: "#2563EB", sky50: "#F0F9FF", sky700: "#0369A1", v50: "#F5F3FF", v100: "#EDE9FE", v500: "#8B5CF6", v700: "#6D28D9",
};
// The status colours of the schedule's print (lib/timelinePdf), so the report reads the same.
const STATUS_INK: Record<string, string> = {
  not_started: "#64748B", in_progress: "#2563EB", completed: "#059669", on_hold: "#D97706", delayed: "#DC2626", cancelled: "#94A3B8",
};

// ── Icons (lucide's, drawn as SVG) ──────────────────────────────────────────────────────────────
const stroke = (color: string, sw = 2) => ({ stroke: color, strokeWidth: sw, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const });
const CalendarClockIcon = ({ size, color }: { size: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" style={{ marginRight: 2.5 }}>
    <Path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" {...stroke(color)} />
    <Path d="M16 2v4" {...stroke(color)} /><Path d="M8 2v4" {...stroke(color)} /><Path d="M3 10h5" {...stroke(color)} />
    <Path d="M17.5 17.5 16 16.3V14" {...stroke(color)} /><Circle cx="16" cy="16" r="6" {...stroke(color)} />
  </Svg>
);
const ClockIcon = ({ size, color }: { size: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" style={{ marginRight: 2.5 }}>
    <Circle cx="12" cy="12" r="10" {...stroke(color)} /><Path d="M12 6v6l4 2" {...stroke(color)} />
  </Svg>
);
const AlertIcon = ({ size, color }: { size: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" style={{ marginRight: 2 }}>
    <Path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" {...stroke(color)} />
    <Path d="M12 9v4" {...stroke(color)} /><Path d="M12 17h.01" {...stroke(color)} />
  </Svg>
);
const FlagIcon = ({ size, color }: { size: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" {...stroke(color, 2.5)} /><Path d="M4 22v-7" {...stroke(color, 2.5)} />
  </Svg>
);
const CheckIcon = ({ size, color }: { size: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M20 6 9 17l-5-5" {...stroke(color, 3.5)} /></Svg>
);

// ── The timeline card ────────────────────────────────────────────────────────────────────────────
const lbl = { fontSize: 5.8, fontWeight: 700, color: T.s400, letterSpacing: 0.9, marginRight: 2.5 } as const;
const val = { fontSize: 7.6, fontWeight: 700, color: T.s800 } as const;
const item = { flexDirection: "row", alignItems: "center", marginRight: 9, marginBottom: 2 } as const;

/** The card from the top of the schedule (TimelineBar), opened: the figures, the track and the phases. */
export function TimelineStrip({ project, width }: { project: ApiProject; width: number }) {
  const o = timelineOverview(project);
  const { contractStart, startIsContractDate, origEnd, deadline, extended, hasMs, workPct, focus, today, pos, todayPct, elapsedPct, overdue, remaining, remainingDays, totalDays, origDays, addedDays, dots, undated } = o;
  if (!contractStart && !deadline && !hasMs) return null;
  const PAD = 8;
  const inner = width - PAD * 2 - 1.6;
  // The phases in date order. The screen scrolls them sideways; on paper they carry on in rows.
  const DW = 56;
  const fit = Math.max(1, Math.floor(inner / DW));
  const nRows = Math.max(1, Math.ceil(dots.length / fit));
  const per = Math.max(1, Math.ceil(dots.length / nRows));
  const rows = Array.from({ length: nRows }, (_, r) => dots.slice(r * per, r * per + per)).filter((r) => r.length);
  return (
    <View wrap={false} style={{ border: `0.8 solid ${T.s200}`, borderRadius: 10, backgroundColor: BRAND.white, marginBottom: 12 }}>
      {/* The figures, as in the card's header line */}
      <View style={{ paddingHorizontal: PAD, paddingTop: 6, paddingBottom: 4 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
          <View style={item}>
            <CalendarClockIcon size={7.5} color={overdue ? T.red500 : T.em500} />
            <Text style={{ fontSize: 6.6, fontWeight: 700, color: T.s500, letterSpacing: 1.1 }}>TIMELINE</Text>
          </View>
          <View style={item}>
            <Text style={[lbl, startIsContractDate ? { color: T.amber600 } : {}]}>{startIsContractDate ? "CONTRACT" : "START"}</Text>
            <Text style={val}>{contractStart ? fmtDay(contractStart) : "Not set"}</Text>
          </View>
          {totalDays !== null && (
            <View style={item}>
              <Text style={lbl}>DURATION</Text>
              {extended && origDays !== null ? (
                <>
                  <Text style={[val, { color: T.s400, textDecoration: "line-through", marginRight: 2.5 }]}>{origDays}</Text>
                  <Text style={[val, { color: T.v700, marginRight: 2.5 }]}>{totalDays} days</Text>
                  <Text style={{ fontSize: 7, fontWeight: 600, color: T.v500 }}>(+{addedDays})</Text>
                </>
              ) : <Text style={val}>{totalDays} days</Text>}
            </View>
          )}
          <View style={item}>
            <ClockIcon size={7} color={overdue ? T.red600 : T.em600} />
            <Text style={[val, { color: overdue ? T.red600 : T.em600 }]}>
              {deadline ? (overdue ? remaining : `${remaining} left`) : "No deadline"}
              {deadline ? <Text style={{ fontWeight: 600, color: T.s400 }}>{` (${remainingDays}d${elapsedPct !== null ? `, ${Math.round(elapsedPct)}% elapsed` : ""})`}</Text> : null}
            </Text>
          </View>
          <View style={item}>
            <Text style={lbl}>END</Text>
            <Text style={[val, { color: extended ? T.v700 : T.s900, marginRight: 3 }]}>{deadline ? fmtDay(deadline) : "Not set"}</Text>
            {extended && <Text style={{ fontSize: 5.8, fontWeight: 700, color: T.v700, backgroundColor: T.v50, borderRadius: 6, paddingHorizontal: 3, paddingVertical: 1, marginRight: 3 }}>Extended</Text>}
            {extended && origEnd && (
              <Text style={{ fontSize: 7, fontWeight: 600, color: T.s400 }}>(original <Text style={{ textDecoration: "line-through" }}>{fmtDay(origEnd)}</Text>)</Text>
            )}
          </View>
          {/* As on screen, the late count and the work complete close the line, at its right. */}
          <View style={[item, { marginLeft: "auto", marginRight: 0 }]}>
            {focus.overdue.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", marginRight: 6 }}>
                <AlertIcon size={6.5} color={T.amber600} />
                <Text style={{ fontSize: 7, fontWeight: 700, color: T.amber600 }}>{focus.overdue.length} late</Text>
              </View>
            )}
            <Text style={{ fontSize: 7, fontWeight: 700, color: T.blue600 }}>Work {workPct}%{hasMs ? ` · ${focus.done}/${focus.total}` : ""}</Text>
          </View>
        </View>
      </View>

      {/* The track: the time elapsed, any extension, the phase starts and today */}
      <View style={{ paddingHorizontal: PAD }}>
        <View style={{ height: 9, position: "relative" }}>
          {todayPct !== null && (
            <Text style={{ position: "absolute", top: 1, left: `${todayPct}%`, width: 30, marginLeft: -15, textAlign: "center", fontSize: 5.2, fontWeight: 700, color: T.s400, letterSpacing: 0.6 }}>TODAY</Text>
          )}
        </View>
        <View style={{ height: 4.5, borderRadius: 2.25, backgroundColor: T.s100, position: "relative" }}>
          {contractStart && deadline && extended && origEnd && (
            <View style={{ position: "absolute", top: 0, bottom: 0, left: `${pos(origEnd)}%`, right: `${100 - pos(deadline)}%`, backgroundColor: T.v100, borderTopRightRadius: 2.25, borderBottomRightRadius: 2.25 }} />
          )}
          {contractStart && deadline && (
            <View style={{ position: "absolute", top: 0, bottom: 0, left: `${pos(contractStart)}%`, width: `${Math.max(0, pos(today > deadline ? deadline : today) - pos(contractStart))}%`, backgroundColor: overdue ? T.red500 : T.em500, borderRadius: 2.25 }} />
          )}
          {dots.map((m) => (
            <View key={m.id} style={{ position: "absolute", top: -1.5, height: 7.5, width: 1.6, marginLeft: -0.8, left: `${pos(m.start!)}%`, backgroundColor: BRAND.white, border: `0.6 solid ${phaseColor(m)}`, borderRadius: 0.8 }} />
          ))}
          {todayPct !== null && <View style={{ position: "absolute", top: -3, bottom: -3, width: 1.5, marginLeft: -0.75, left: `${todayPct}%`, backgroundColor: T.blue600, borderRadius: 0.75 }} />}
        </View>
      </View>

      {/* The phases in date order */}
      <View style={{ paddingHorizontal: PAD - 2, paddingTop: 8, paddingBottom: 6 }}>
        {rows.length ? rows.map((row, r) => (
          <View key={r} style={{ flexDirection: "row", marginTop: r ? 6 : 0 }}>
            {row.map((m, i) => <Fragment key={m.id}><Dot m={m} w={DW} first={i === 0} last={i === row.length - 1} /></Fragment>)}
          </View>
        )) : (
          <Text style={{ fontSize: 6.6, color: T.s400, paddingHorizontal: 2 }}>{hasMs ? "Add planned dates to the phases to place them on the timeline." : "No phases yet."}</Text>
        )}
        <Text style={{ marginTop: 4, paddingHorizontal: 2, fontSize: 5.8, color: T.s400 }}>
          {undated > 0 ? `${undated} phase${undated === 1 ? "" : "s"} without dates. ` : ""}Time elapsed is calendar time; work complete comes from the phases.
        </Text>
      </View>
    </View>
  );
}

function Dot({ m, w, first, last }: { m: PlannedMilestone; w: number; first: boolean; last: boolean }) {
  const color = phaseColor(m);
  const point = isMilestonePoint(m);
  const done = m.state === "done";
  const ring = m.state === "overdue" ? T.amber500 : color;
  return (
    <View style={{ width: w, alignItems: "center" }}>
      <Text style={{ fontSize: 6, fontWeight: 700, color: T.s500, marginBottom: 1.5 }}>{m.start ? fmtShort(m.start) : " "}</Text>
      <View style={{ width: w, height: 12, alignItems: "center", justifyContent: "center", position: "relative" }}>
        {!first && <View style={{ position: "absolute", left: 0, width: w / 2, top: 5.6, height: 0.75, backgroundColor: T.s200 }} />}
        {!last && <View style={{ position: "absolute", left: w / 2, width: w / 2, top: 5.6, height: 0.75, backgroundColor: T.s200 }} />}
        <View style={{ width: 12, height: 12, borderRadius: 6, border: `1.5 solid ${ring}`, backgroundColor: done ? color : BRAND.white, alignItems: "center", justifyContent: "center" }}>
          {point ? <FlagIcon size={6} color={done ? BRAND.white : color} />
            : done ? <CheckIcon size={6.5} color={BRAND.white} />
            : <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: ring }} />}
        </View>
      </View>
      <Text style={{ marginTop: 1.5, fontSize: 6, fontWeight: 600, color: T.s600, lineHeight: 1.2, textAlign: "center", paddingHorizontal: 1.5, textOverflow: "ellipsis" }} maxLines={2}>{m.name}</Text>
    </View>
  );
}

// ── The phases and milestones, as the schedule prints them ──────────────────────────────────────
const th = { fontSize: 6.4, fontWeight: 700, color: BRAND.white, letterSpacing: 0.5, lineHeight: 1.3, paddingVertical: 4.5, paddingHorizontal: 4 } as const;
const td = { fontSize: 7.4, color: BRAND.slate, lineHeight: 1.35, paddingVertical: 4, paddingHorizontal: 4 } as const;
const sub = { fontSize: 6.2, lineHeight: 1.3, marginTop: 1 } as const;
const W_NO = 26, W_DATE = 60, W_DUR = 46, W_STATUS = 52, W_PCT = 46;

function ScheduleTable({ project }: { project: ApiProject }) {
  const today = new Date();
  // As the schedule prints it: everything but the cancelled, under their phases when it has them.
  const rows = (project.schedule?.milestones || []).filter((m) => m.status !== "cancelled");
  if (!rows.length) return null;
  const categories = project.schedule?.categories || [];
  const hasCats = rows.some((m) => (m.category || "").trim()) || categories.length > 0;
  const wbs = wbsNumbers(rows, categories);
  const cpm = criticalPath(rows, { phases: project.schedule?.phaseInfo });
  const Row = ({ m, i }: { m: ApiMilestone; i: number }) => {
    const lateBy = delayDays(m, today);
    const pct = phasePercent(m);
    const ed = effectiveDays(m);
    const fl = cpm.float.get(m.id);
    const crit = fl !== undefined && fl <= 0;
    const ms = !!m.isMilestone;
    const ink = lateBy && !m.actualEnd ? T.red600 : BRAND.slate;
    const notes = [ms ? "Milestone" : "", (m.responsible || []).join(", ")].filter(Boolean).join("  ·  ");
    const short = (v: string) => { const d = parseDate(v); return d ? fmtShort(d) : v; };
    const actualEnd = m.actualEnd ? `Actual ${short(m.actualEnd)}` : m.actualStart ? "Actual: ongoing" : "";
    return (
      <View style={{ flexDirection: "row", borderBottom: `0.6 solid ${BRAND.border}`, backgroundColor: i % 2 ? BRAND.mist : BRAND.white }} wrap={false}>
        <Text style={[td, { width: W_NO, color: T.s500, fontWeight: 600 }]}>{wbs.task.get(m.id) || String(i + 1)}</Text>
        <View style={[td, { flex: 1 }]}>
          <Text style={{ fontWeight: 700, color: ink }}>{m.name}</Text>
          {(!!notes || crit) && (
            <Text style={[sub, { color: T.s500 }]}>
              {notes}{notes && crit ? "  ·  " : ""}{crit ? <Text style={{ color: T.red600, fontWeight: 700 }}>Critical</Text> : null}
            </Text>
          )}
        </View>
        <View style={[td, { width: W_DATE }]}>
          <Text style={{ color: ink }}>{fmtDay(m.plannedStart) || "-"}</Text>
          {!!m.actualStart && m.actualStart !== m.plannedStart && <Text style={[sub, { color: T.sky700 }]}>Actual {short(m.actualStart)}</Text>}
        </View>
        <View style={[td, { width: W_DATE }]}>
          <Text style={{ color: ink }}>{(ms ? fmtDay(m.plannedStart) : fmtDay(m.plannedEnd)) || "-"}</Text>
          {!!actualEnd && <Text style={[sub, { color: T.sky700 }]}>{actualEnd}</Text>}
          {!!lateBy && !!m.actualEnd && <Text style={[sub, { color: T.red600, fontWeight: 700 }]}>{lateBy} days late</Text>}
        </View>
        <Text style={[td, { width: W_DUR, textAlign: "right", color: ink }]}>{ms ? "0 days" : ed.days === null ? "-" : `${ed.days} day${ed.days === 1 ? "" : "s"}${ed.actual ? " (actual)" : ""}`}</Text>
        <Text style={[td, { width: W_STATUS, fontWeight: 700, color: STATUS_INK[m.status || "not_started"] || T.s500 }]}>{STATUS_META[m.status || "not_started"].label}</Text>
        <View style={[td, { width: W_PCT }]}>
          <Text style={{ fontWeight: 700, color: pct >= 100 ? T.em600 : T.blue600 }}>{pct}%</Text>
          <View style={{ height: 2.5, borderRadius: 1.25, backgroundColor: T.s100, marginTop: 2 }}>
            <View style={{ height: 2.5, borderRadius: 1.25, width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: pct >= 100 ? T.em500 : T.blue600 }} />
          </View>
        </View>
      </View>
    );
  };
  let n = 0;
  return (
    <View>
      <View style={{ flexDirection: "row", backgroundColor: BRAND.slate }} wrap={false} minPresenceAhead={30}>
        <Text style={[th, { width: W_NO }]}>#</Text>
        <Text style={[th, { flex: 1 }]}>TASK / MILESTONE</Text>
        <Text style={[th, { width: W_DATE }]}>START</Text>
        <Text style={[th, { width: W_DATE }]}>FINISH</Text>
        <Text style={[th, { width: W_DUR, textAlign: "right" }]}>DURATION</Text>
        <Text style={[th, { width: W_STATUS }]}>STATUS</Text>
        <Text style={[th, { width: W_PCT }]}>% COMPLETE</Text>
      </View>
      {hasCats
        ? groupByCategory(rows.map((m) => ({ m })), categories, true).map((g) => (
          <View key={g.category}>
            <View style={{ flexDirection: "row", backgroundColor: "#EAF0F6", borderBottom: `0.6 solid ${BRAND.border}` }} wrap={false} minPresenceAhead={22}>
              <Text style={[td, { width: W_NO, fontWeight: 700 }]}>{wbs.phase.get(g.category) || ""}</Text>
              <Text style={[td, { flex: 1, fontWeight: 700 }]}>{g.category}  <Text style={{ fontWeight: 400, color: T.s500 }}>({g.items.length})</Text></Text>
            </View>
            {g.items.map((x) => <Fragment key={x.m.id}><Row m={x.m} i={n++} /></Fragment>)}
          </View>
        ))
        : rows.map((m, i) => <Fragment key={m.id}><Row m={m} i={i} /></Fragment>)}
    </View>
  );
}

// ── The critical path and the float, in words, as under the chart ──────────────────────────────
function CriticalPathText({ project }: { project: ApiProject }) {
  const rows = (project.schedule?.milestones || []).filter((m) => m.status !== "cancelled");
  if (!rows.length) return null;
  const cpm = criticalPath(rows, { phases: project.schedule?.phaseInfo });
  if (!cpm.critical.size) return null;
  const day2 = (v?: string) => { const d = parseDate(v); return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""; };
  const live = rows.filter((m) => m.plannedStart);
  const chain = live.filter((m) => cpm.critical.has(m.id))
    .sort((a, c) => (a.plannedStart || "").localeCompare(c.plannedStart || "") || (a.plannedEnd || "").localeCompare(c.plannedEnd || ""))
    .map((m) => { const d = m.isMilestone || m.plannedStart === m.plannedEnd ? day2(m.plannedStart) : `${plannedDays(m) ?? ""} d`; return `${m.name}${d ? ` (${d})` : ""}`; })
    .join("  >  ");
  const floats = live.filter((m) => !m.isMilestone && (cpm.float.get(m.id) || 0) > 0)
    .sort((a, c) => (cpm.float.get(c.id) || 0) - (cpm.float.get(a.id) || 0))
    .map((m) => { const fl = Math.round(cpm.float.get(m.id) || 0); return `${m.name}: ${fl} day${fl === 1 ? "" : "s"} of float`; });
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={miniHead} minPresenceAhead={30}>CRITICAL PATH</Text>
      <Text style={{ fontSize: 7.8, lineHeight: 1.5, color: T.red600 }}>{chain}</Text>
      {floats.length > 0 && (
        <>
          <Text style={[miniHead, { marginTop: 6 }]} minPresenceAhead={20}>FLOAT (CAN SLIP THAT MUCH WITHOUT MOVING THE FINISH)</Text>
          <Text style={{ fontSize: 7.8, lineHeight: 1.5, color: T.s700 }}>{floats.join("   ·   ")}</Text>
        </>
      )}
    </View>
  );
}
const miniHead = { fontSize: 6.6, fontWeight: 700, color: T.s500, letterSpacing: 0.9, lineHeight: 1.3, marginBottom: 3 } as const;

// ── The extensions of time, as the End date's panel lists them ─────────────────────────────────
function ExtensionsList({ project }: { project: ApiProject }) {
  const all = sortedExtensions(project.schedule?.extensions);
  if (!all.length) return null;
  const origEnd = parseDate(project.endDate);
  const gapFor = (i: number) => {
    const prevExt = i > 0 ? parseDate(all[i - 1].endDate) : origEnd;
    const prev = prevExt && origEnd && prevExt > origEnd ? prevExt : origEnd;
    const d = parseDate(all[i].endDate);
    return d && prev && d > prev ? `+${humanGap(prev, d)}` : prev ? "not in effect (on or before the end date)" : "";
  };
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={miniHead} minPresenceAhead={30}>EXTENSIONS OF TIME</Text>
      {origEnd && <Text style={{ fontSize: 7.4, color: T.s500, marginBottom: 3 }}>Contract end as signed: {fmtDay(origEnd)}</Text>}
      {all.map((e, i) => {
        const on = !origEnd || (parseDate(e.endDate) || origEnd) > origEnd;
        const by = [e.addedBy, e.addedAt ? fmtDay(e.addedAt) : ""].filter(Boolean).join(" · ");
        return (
          <View key={e.id || i} wrap={false} style={{ flexDirection: "row", alignItems: "flex-start", backgroundColor: on ? "#F7F5FF" : BRAND.mist, borderRadius: 4, paddingVertical: 3.5, paddingHorizontal: 6, marginBottom: 2 }}>
            <Text style={{ width: 18, fontSize: 7.4, fontWeight: 700, color: T.v700 }}>#{i + 1}</Text>
            <Text style={{ width: 92, fontSize: 7.4, fontWeight: 700, color: on ? T.s800 : T.s400 }}>To {fmtDay(e.endDate)}</Text>
            <Text style={{ width: 96, fontSize: 7.4, fontWeight: 700, color: on ? T.v700 : T.s400 }}>{gapFor(i)}</Text>
            <Text style={{ flex: 1, fontSize: 7.4, color: T.s600 }}>{e.reason || ""}</Text>
            {!!by && <Text style={{ fontSize: 6.4, color: T.s400, marginLeft: 6 }}>{by}</Text>}
          </View>
        );
      })}
    </View>
  );
}

/** The report's timeline: the card, the phases and milestones, the critical path and the extensions. */
export default function ReportTimeline({ project, width }: { project: ApiProject; width: number }) {
  return (
    <View>
      <TimelineStrip project={project} width={width} />
      <ScheduleTable project={project} />
      <CriticalPathText project={project} />
      <ExtensionsList project={project} />
    </View>
  );
}

/** Whether the report has a timeline to print: contract dates, phases or extensions. */
export function hasReportTimeline(project: ApiProject): boolean {
  const o = timelineOverview(project);
  return !!(o.contractStart || o.deadline || o.hasMs || project.schedule?.extensions?.length);
}
