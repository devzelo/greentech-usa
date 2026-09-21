import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Flag, History, Plus, X } from "lucide-react";
import { fetchEmployees, type ApiMilestone, type MilestoneStatus } from "../../../lib/api";
import {
  CUSTOM_KEY, MASTER_PHASES, SCHEDULE_CATEGORIES, STATUS_META, STATUS_ORDER, addDuration, daysBetween, fmtDay, humanGap, parseDate, statusPatch, toIso, type DurationUnit,
} from "../../../lib/projectSchedule";

/**
 * One phase / milestone, every field: name (a master-list phase or a custom one with its own
 * description), planned start and end or a duration, actual dates, status, % complete, the people
 * responsible and notes. The baseline (first planned dates) is shown, and can be reset on purpose.
 */
export default function PhaseEditor({ initial, usedKeys, onSave, onClose, canEdit, isNew = false, categories }: {
  initial: ApiMilestone;
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
    const end = toIso(addDuration(s, m.durationValue || 0, (m.durationUnit || "days") as DurationUnit));
    if (end !== m.plannedEnd) set({ plannedEnd: end });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, m.plannedStart, m.durationValue, m.durationUnit]);

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
                : ps && pe ? <>{fmtDay(ps)} to {fmtDay(pe)} · <b>{daysBetween(ps, pe)} days</b>{daysBetween(ps, pe) >= 30 ? ` (${humanGap(ps, pe)})` : ""}{daysBetween(ps, pe) === 0 ? " · a milestone (zero duration)" : ""}</>
                : "Same start and end date makes it a milestone (a flag on the chart)."}
            </p>
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
