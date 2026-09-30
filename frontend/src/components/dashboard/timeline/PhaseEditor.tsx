import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Flag, History, Plus, X } from "lucide-react";
import { fetchEmployees, type ApiMilestone, type MilestoneStatus } from "../../../lib/api";
import {
  CUSTOM_KEY, MASTER_PHASES, SCHEDULE_CATEGORIES, STATUS_META, STATUS_ORDER, daysBetween, endForDuration, fmtDay, humanGap, parseDate, statusPatch, toIso, type DurationUnit,
} from "../../../lib/projectSchedule";
import { LINK_TYPES, lagLabel, overrunsDeadline, predsOf, startFromLink, wouldCycle, type LinkType, type Pred } from "../../../lib/scheduleLinks";
import { wbsNumbers } from "../../../lib/projectSchedule";

/**
 * One phase / milestone, every field: name (a master-list phase or a custom one with its own
 * description), planned start and end or a duration, actual dates, status, % complete, the people
 * responsible and notes. The baseline (first planned dates) is shown, and can be reset on purpose.
 */
export default function PhaseEditor({ initial, usedKeys, onSave, onClose, canEdit, isNew = false, categories, others = [], deadline }: {
  initial: ApiMilestone;
  /** CR 294 - the other tasks in this schedule, so this one can be tied to one of them. */
  others?: ApiMilestone[];
  /** The contract deadline, so work planned past it is called out before it is saved. */
  deadline?: string;
  /** The open schedule's categories, offered first in the Category list. */
  categories?: string[];
  isNew?: boolean;
  usedKeys: string[];
  onSave: (m: ApiMilestone) => void;
  onClose: () => void;
  canEdit: boolean;
}) {
  const [m, setM] = useState<ApiMilestone>(initial);
  const [mode, setMode] = useState<"end" | "duration">(initial.durationValue ? "duration" : "end");
  const [people, setPeople] = useState<string[]>([]);
  const [personInput, setPersonInput] = useState("");
  const set = (patch: Partial<ApiMilestone>) => setM((p) => ({ ...p, ...patch }));

  useEffect(() => { fetchEmployees().then((e) => setPeople(e.map((x) => x.name).filter(Boolean).sort())).catch(() => setPeople([])); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A duration sets the planned end from the planned start.
  useEffect(() => {
    if (mode !== "duration") return;
    const s = parseDate(m.plannedStart);
    if (!s) return;
    const end = toIso(endForDuration(s, m.durationValue || 0, (m.durationUnit || "days") as DurationUnit));
    if (end !== m.plannedEnd) set({ plannedEnd: end });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, m.plannedStart, m.durationValue, m.durationUnit]);

  /**
   * CR 294 - a milestone is a marker, so it has no length: its finish follows its start.
   */
  useEffect(() => {
    if (!m.isMilestone) return;
    if (m.durationValue) set({ durationValue: 0 });
    if (m.plannedStart && m.plannedEnd !== m.plannedStart) set({ plannedEnd: m.plannedStart });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.isMilestone, m.plannedStart]);

  /**
   * CR 300 - what this task waits on: any number of other tasks, each with its link type and lag.
   * It starts at the latest date any of them allows, worked out whenever a link changes.
   */
  const preds = predsOf(m);
  const setPreds = (next: Pred[]) => set({ predecessors: next, dependsOn: "", linkType: "FS", lagDays: 0 });
  const others2 = others.filter((o) => o.id !== m.id);
  const numbers = useMemo(() => wbsNumbers([...others2, m], categories || []).task, [others2, m, categories]);
  const nameOf = (id: string) => { const o = others2.find((x) => x.id === id); return o ? `${numbers.get(id) ? `${numbers.get(id)} ` : ""}${o.name || "Untitled"}` : "a removed task"; };
  const linkKey = preds.map((p) => `${p.id}:${p.type}:${p.lag}`).join("|");
  const predDates = preds.map((p) => { const o = others2.find((x) => x.id === p.id); return `${o?.plannedStart || ""}/${o?.plannedEnd || ""}`; }).join("|");
  useEffect(() => {
    if (!preds.length) return;
    const starts = preds
      .map((p) => { const o = others2.find((x) => x.id === p.id); return o ? startFromLink(o, p.type, p.lag, m) : null; })
      .filter((d): d is Date => !!d);
    if (!starts.length) return;
    const start = toIso(new Date(Math.max(...starts.map((d) => d.getTime()))));
    if (start !== m.plannedStart) set({ plannedStart: start });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkKey, predDates]);

  const overrun = overrunsDeadline(m, deadline);

  const ps = parseDate(m.plannedStart), pe = parseDate(m.plannedEnd);
  const badOrder = ps && pe && pe < ps;
  const as = parseDate(m.actualStart), ae = parseDate(m.actualEnd);
  const badActual = as && ae && ae < as;
  const isCustom = m.key === CUSTOM_KEY || !m.key;
  const baselineMoved = (m.baselineStart && m.baselineStart !== m.plannedStart) || (m.baselineEnd && m.baselineEnd !== m.plannedEnd);
  const suggestions = useMemo(() => people.filter((p) => !(m.responsible || []).includes(p) && p.toLowerCase().includes(personInput.toLowerCase())).slice(0, 6), [people, m.responsible, personInput]);

  const addPerson = (name: string) => {
    const n = name.trim();
    if (!n || (m.responsible || []).includes(n)) return;
    set({ responsible: [...(m.responsible || []), n] });
    setPersonInput("");
  };
  const pickPhase = (key: string) => {
    if (key === CUSTOM_KEY) set({ key: CUSTOM_KEY, name: m.key === CUSTOM_KEY ? m.name : "" });
    else set({ key, name: MASTER_PHASES.find((p) => p.key === key)?.name || m.name });
  };
  const save = () => {
    const out: ApiMilestone = { ...m, name: (m.name || "").trim() || "Untitled phase", durationValue: mode === "duration" ? m.durationValue || 0 : 0 };
    if (out.status === "completed") out.percent = 100;
    if ((out.percent ?? 0) >= 100 && out.status !== "cancelled") out.status = "completed";
    if ((out.percent ?? 0) > 0 && out.status === "not_started") out.status = "in_progress";
    onSave(out);
  };

  const lbl = "block text-[10px] font-bold uppercase tracking-widest text-slate-400";
  const inp = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="flex items-center gap-2 font-display text-base font-bold text-slate-900">
            {ps && pe && ps.getTime() === pe.getTime() && <Flag size={15} className="text-emerald-600" />}
            {isNew ? "Add phase / milestone" : canEdit ? "Edit phase" : "Phase"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <fieldset disabled={!canEdit} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={lbl}>Phase / milestone</span>
            <select value={isCustom ? CUSTOM_KEY : m.key} onChange={(e) => pickPhase(e.target.value)} className={inp}>
              {MASTER_PHASES.map((p) => <option key={p.key} value={p.key} disabled={p.key !== initial.key && usedKeys.includes(p.key)}>{p.name}{p.key !== initial.key && usedKeys.includes(p.key) ? " (already added)" : ""}</option>)}
              <option value={CUSTOM_KEY}>Custom / manual phase or milestone</option>
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className={lbl}>Name {isCustom ? "" : "(rename if needed)"}</span>
            <input value={m.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Client Training" className={inp} />
          </label>
          {/* CR 238 - the group this task sits in on the schedule. Pick one or type your own. */}
          <label className="sm:col-span-2">
            <span className={lbl}>Category</span>
            <input list="schedule-categories" value={m.category || ""} onChange={(e) => set({ category: e.target.value })} placeholder="e.g. Design, Procurement, Construction" className={inp} />
            <datalist id="schedule-categories">
              {[...new Set([...(categories || []), ...SCHEDULE_CATEGORIES])].map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          {isCustom && (
            <label className="sm:col-span-2">
              <span className={lbl}>Description</span>
              <textarea value={m.description || ""} onChange={(e) => set({ description: e.target.value })} rows={2} className={`${inp} resize-y`} placeholder="What this phase covers" />
            </label>
          )}

          <div className="sm:col-span-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-slate-700">Planned</p>
              <div className="flex gap-1">
                {(["end", "duration"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${mode === k ? "bg-primary text-white" : "bg-white text-slate-600 border border-slate-200"}`}>
                    {k === "end" ? "End date" : "Duration"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className={lbl}>Planned start</span><input type="date" value={m.plannedStart || ""} onChange={(e) => set({ plannedStart: e.target.value })} className={inp} /></label>
              {mode === "end" ? (
                <label><span className={lbl}>Planned end</span><input type="date" value={m.plannedEnd || ""} min={m.plannedStart || undefined} onChange={(e) => set({ plannedEnd: e.target.value })} className={inp} /></label>
              ) : (
                <div>
                  <span className={lbl}>Duration</span>
                  <div className="mt-1 flex gap-1.5">
                    <input type="number" min={0} step="any" value={m.durationValue ?? 0} onChange={(e) => set({ durationValue: Math.max(0, Number(e.target.value) || 0) })} className={`${inp} mt-0`} />
                    <select value={m.durationUnit || "days"} onChange={(e) => set({ durationUnit: e.target.value as DurationUnit })} className={`${inp} mt-0 w-28`}>
                      <option value="days">days</option><option value="weeks">weeks</option><option value="months">months</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {badOrder ? <span className="font-bold text-red-600">The end is before the start.</span>
                : ps && pe ? <>{fmtDay(ps)} to {fmtDay(pe)} · <b>{daysBetween(ps, pe) + 1} day{daysBetween(ps, pe) === 0 ? "" : "s"}</b>{daysBetween(ps, pe) >= 30 ? ` (${humanGap(ps, pe)})` : ""}{daysBetween(ps, pe) === 0 ? " · a milestone (zero duration)" : ""}</>
                : "Same start and end date makes it a milestone (a flag on the chart)."}
            </p>
            {/* CR 300 - what this task waits on: any number of links, each with its type and lag. */}
            <div className="mt-3 border-t border-slate-200/70 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-slate-700">Predecessors</p>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-slate-600">
                  <input type="checkbox" checked={!!m.isMilestone} onChange={(e) => set({ isMilestone: e.target.checked })} className="accent-emerald-500" />
                  This is a milestone (no duration)
                </label>
              </div>
              {preds.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="hidden grid-cols-[1fr_10.5rem_5rem_1.75rem] gap-2 sm:grid">
                    <span className={lbl}>Task</span><span className={lbl}>Link</span><span className={lbl}>Lag (days)</span><span />
                  </div>
                  {preds.map((p, k) => (
                    <div key={`${p.id}-${k}`} className="grid grid-cols-[1fr_10.5rem_5rem_1.75rem] items-center gap-2">
                      <select
                        value={p.id}
                        onChange={(e) => setPreds(preds.map((q, j) => (j === k ? { ...q, id: e.target.value } : q)))}
                        className={`${inp} mt-0`}
                      >
                        {others2
                          .filter((o) => o.id === p.id || (!preds.some((q) => q.id === o.id) && !wouldCycle([...others2, m], m.id, o.id)))
                          .map((o) => <option key={o.id} value={o.id}>{nameOf(o.id)}</option>)}
                      </select>
                      <select value={p.type} onChange={(e) => setPreds(preds.map((q, j) => (j === k ? { ...q, type: e.target.value as LinkType } : q)))} className={`${inp} mt-0`} title={LINK_TYPES.find((x) => x.type === p.type)?.label}>
                        {LINK_TYPES.map((x) => <option key={x.type} value={x.type} title={x.short}>{x.type} - {x.label}</option>)}
                      </select>
                      <input type="number" step={1} value={p.lag} onChange={(e) => setPreds(preds.map((q, j) => (j === k ? { ...q, lag: Math.round(Number(e.target.value) || 0) } : q)))} className={`${inp} mt-0`} />
                      <button type="button" onClick={() => setPreds(preds.filter((_, j) => j !== k))} title="Remove this link" className="flex h-8 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
              {(() => {
                const free = others2.filter((o) => !preds.some((q) => q.id === o.id) && !wouldCycle([...others2, m], m.id, o.id));
                return free.length > 0 ? (
                  <button type="button" onClick={() => setPreds([...preds, { id: free[free.length - 1].id, type: "FS", lag: 0 }])} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary">
                    <Plus size={12} /> Add predecessor
                  </button>
                ) : null;
              })()}
              <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-500">
                {preds.length
                  ? <>
                      {preds.map((p, k) => <p key={k}>This task <b>{lagLabel(p.type, p.lag, nameOf(p.id))}</b>.</p>)}
                      <p>{preds.length > 1 ? "It starts at the latest date these allow. " : ""}Move {preds.length > 1 ? "any of them" : "that task"} and this one follows.</p>
                    </>
                  : <p>Tie this task to others and its start is worked out for you: FS starts after, SS alongside, FF finishes with, SF finishes when the other starts. A negative lag overlaps them.</p>}
              </div>
              {overrun > 0 && (
                <p className="mt-1.5 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] font-bold text-red-600">
                  This finishes {overrun} day{overrun === 1 ? "" : "s"} past the contract deadline ({fmtDay(parseDate(deadline))}). Extend the contract time or shorten the work.
                </p>
              )}
            </div>

            {(m.baselineStart || m.baselineEnd) && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <History size={12} className="text-slate-400" />
                Baseline: {fmtDay(m.baselineStart) || "-"} to {fmtDay(m.baselineEnd) || "-"}
                {baselineMoved && canEdit && (
                  <button type="button" onClick={() => set({ baselineStart: m.plannedStart, baselineEnd: m.plannedEnd })} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:border-primary hover:text-primary">
                    Make the current plan the baseline
                  </button>
                )}
              </p>
            )}
          </div>

          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
            <label><span className={lbl}>Actual start</span><input type="date" value={m.actualStart || ""} onChange={(e) => set({ actualStart: e.target.value })} className={inp} /></label>
            <label><span className={lbl}>Actual end</span><input type="date" value={m.actualEnd || ""} min={m.actualStart || undefined} onChange={(e) => set({ actualEnd: e.target.value, ...(e.target.value && m.status !== "completed" ? { status: "completed" as MilestoneStatus, percent: 100 } : {}) })} className={inp} /></label>
            {badActual && <p className="sm:col-span-2 text-[11px] font-bold text-red-600">The actual end is before the actual start.</p>}
          </div>

          <label>
            <span className={lbl}>Status</span>
            <select value={m.status || "not_started"} onChange={(e) => set(statusPatch(m, e.target.value as MilestoneStatus))} className={inp}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
          </label>
          <label>
            <span className={lbl}>% complete: {m.percent ?? 0}%</span>
            <input type="range" min={0} max={100} step={5} value={m.percent ?? 0} onChange={(e) => set({ percent: Number(e.target.value) })} className="mt-3 w-full accent-emerald-500" />
          </label>

          <div className="sm:col-span-2">
            <span className={lbl}>Responsible persons</span>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
              {(m.responsible || []).map((p) => (
                <span key={p} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {p}
                  {canEdit && <button type="button" onClick={() => set({ responsible: (m.responsible || []).filter((x) => x !== p) })} aria-label={`Remove ${p}`} className="text-slate-400 hover:text-red-500"><X size={11} /></button>}
                </span>
              ))}
              {canEdit && (
                <input
                  value={personInput}
                  onChange={(e) => setPersonInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addPerson(personInput); } }}
                  list="phase-people"
                  placeholder={(m.responsible || []).length ? "Add another" : "Name (employee or anyone)"}
                  className="min-w-[10rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
                />
              )}
            </div>
            <datalist id="phase-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
            {canEdit && personInput && suggestions.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {suggestions.map((p) => <button key={p} type="button" onClick={() => addPerson(p)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-primary hover:text-primary"><Plus size={10} /> {p}</button>)}
              </div>
            )}
          </div>

          <label className="sm:col-span-2">
            <span className={lbl}>Notes</span>
            <textarea value={m.notes || ""} onChange={(e) => set({ notes: e.target.value })} rows={3} className={`${inp} resize-y`} placeholder="Delays, dependencies, what the client agreed..." />
          </label>
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">{canEdit ? "Cancel" : "Close"}</button>
          {canEdit && (
            <button type="button" onClick={save} disabled={!!badOrder || !!badActual || !(m.name || "").trim()} className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white hover:bg-primary disabled:opacity-50">
              Apply
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
