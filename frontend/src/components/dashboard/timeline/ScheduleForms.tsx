import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Circle, Diamond, Flag, FolderTree, History, Info, ListTodo, Plus, Search, Star, Trash2, X } from "lucide-react";
import { fetchEmployees, type ApiMilestone, type ApiSchedulePhase, type MilestoneIcon, type MilestoneStatus, type SchedulePriority } from "../../../lib/api";
import {
  MASTER_PHASES, STATUS_META, STATUS_ORDER, UNCATEGORISED, daysBetween, endForDuration, fmtDay, isMilestonePoint, parseDate, statusPatch, toIso, wbsNumbers, type DurationUnit,
} from "../../../lib/projectSchedule";
import {
  LINK_TYPES, criticalPath, lengthOf, overrunsDeadline, phaseLinkTargets, predsOf, relinkAll, withItem, withPhaseLinks, withPreds, wouldCycle,
  type LinkType, type PhaseLink, type PlanContext, type Pred,
} from "../../../lib/scheduleLinks";

/**
 * CR 321 (2026-09-28): the schedule's three forms - Add Phase, Add Task, Add Milestone - laid out
 * as the client drew them, section by section.
 *
 * They open as a panel down the right-hand side instead of a box over the page: the table and the
 * chart stay in view and can be scrolled while a form is filled in, and the panel folds to a strip
 * when the whole width is wanted.
 *
 * What the forms never ask for: float, critical, or a finish date. Those are worked out from the
 * duration, the links, the relationship and the lead or lag, and shown here read-only.
 */

export const PHASE_COLORS = ["#2563eb", "#0891b2", "#059669", "#65a30d", "#d97706", "#ea580c", "#dc2626", "#db2777", "#7c3aed", "#475569"];
export const phaseColorOf = (phases: ApiSchedulePhase[], name: string, index = 0) =>
  phases.find((p) => p.name.toLowerCase() === name.toLowerCase())?.color || PHASE_COLORS[index % PHASE_COLORS.length];

export const MILESTONE_ICONS: Array<{ v: MilestoneIcon; label: string }> = [
  { v: "diamond", label: "Diamond" }, { v: "flag", label: "Flag" }, { v: "star", label: "Star" }, { v: "circle", label: "Circle" },
];
/** A milestone's mark, wherever one is drawn. */
export function MilestoneMark({ icon = "diamond", size = 12, color = "#0f172a", className = "" }: { icon?: MilestoneIcon; size?: number; color?: string; className?: string }) {
  const p = { size, color, fill: color, className: `shrink-0 ${className}` };
  return icon === "flag" ? <Flag {...p} /> : icon === "star" ? <Star {...p} /> : icon === "circle" ? <Circle {...p} /> : <Diamond {...p} />;
}
const PRIORITIES: Array<{ v: SchedulePriority; label: string }> = [
  { v: "low", label: "Low" }, { v: "normal", label: "Normal" }, { v: "high", label: "High" }, { v: "urgent", label: "Urgent" },
];

const lbl = "block text-[10px] font-bold uppercase tracking-widest text-slate-400";
const inp = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";
const hint = "text-[11px] leading-snug text-slate-500";

// ── The panel ──
export function SidePanel({ title, icon, narrow, onNarrow, onClose, footer, children }: {
  title: string; icon: ReactNode; narrow: boolean; onNarrow: (v: boolean) => void; onClose: () => void; footer: ReactNode; children: ReactNode;
}) {
  return createPortal(
    narrow ? (
      <aside aria-label={title} className="fixed bottom-0 right-0 top-0 z-[150] flex w-11 flex-col items-center gap-3 border-l border-slate-200 bg-white py-3 shadow-xl">
        <button type="button" onClick={() => onNarrow(false)} title="Open the form again" aria-label="Open the form again" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-primary"><ChevronsLeft size={16} /></button>
        <button type="button" onClick={() => onNarrow(false)} className="flex items-center gap-2 text-xs font-bold text-slate-700 [writing-mode:vertical-rl] hover:text-primary">{icon}{title}</button>
      </aside>
    ) : (
      <aside role="dialog" aria-label={title} className="fixed bottom-0 right-0 top-0 z-[150] flex w-full max-w-[460px] flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">{icon}</span>
          <h3 className="min-w-0 flex-1 truncate font-display text-base font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={() => onNarrow(true)} title="Fold the form away to see the whole schedule" aria-label="Fold the form away" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><ChevronsRight size={16} /></button>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X size={16} /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3">{footer}</div>
      </aside>
    ),
    document.body,
  );
}

export function Section({ n, title, note, children }: { n: number; title: string; note?: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="flex items-center gap-2 text-xs font-bold text-slate-900">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">{n}</span>{title}
      </h4>
      {note && <p className={`mt-1.5 rounded-lg bg-blue-50/70 px-2.5 py-1.5 ${hint} text-blue-900`}>{note}</p>}
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function Fold({ title, open: initial = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="rounded-xl border border-slate-100">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-bold text-slate-700 hover:text-primary">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{title}
      </button>
      {open && <div className="space-y-3 border-t border-slate-100 px-3 py-3">{children}</div>}
    </section>
  );
}

/** "Auto calculate" or "Manually set date", with the date box beside the second. */
function ModeChoice({ name, mode, date, onChange, min }: {
  name: string; mode: "auto" | "manual"; date: string; min?: string; onChange: (mode: "auto" | "manual", date: string) => void;
}) {
  return (
    <div className="mt-1 space-y-1.5">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input type="radio" name={name} checked={mode === "auto"} onChange={() => onChange("auto", date)} className="accent-blue-600" />
        Auto calculate <span className="text-[11px] text-slate-400">(based on dependencies)</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="radio" name={name} checked={mode === "manual"} onChange={() => onChange("manual", date)} className="accent-blue-600" />
          Manually set date
        </label>
        <input type="date" value={date} min={min} disabled={mode !== "manual"} onChange={(e) => onChange("manual", e.target.value)} aria-label="Date" className={`${inp} mt-0 w-40`} />
      </div>
    </div>
  );
}

/** Names as chips: employees are suggested, anyone can be typed. */
export function Chips({ label, value, onChange, suggestions = [], placeholder, canEdit }: {
  label: string; value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder: string; canEdit: boolean;
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => { const n = raw.trim(); if (n && !value.some((x) => x.toLowerCase() === n.toLowerCase())) onChange([...value, n]); setText(""); };
  const offer = text ? suggestions.filter((p) => !value.includes(p) && p.toLowerCase().includes(text.toLowerCase())).slice(0, 6) : [];
  return (
    <div>
      <span className={lbl}>{label}</span>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
        {value.map((p) => (
          <span key={p} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {p}
            {canEdit && <button type="button" onClick={() => onChange(value.filter((x) => x !== p))} aria-label={`Remove ${p}`} className="text-slate-400 hover:text-red-500"><X size={11} /></button>}
          </span>
        ))}
        {canEdit && (
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(text); } }}
            onBlur={() => add(text)}
            placeholder={value.length ? "Add another" : placeholder}
            aria-label={label}
            className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
          />
        )}
      </div>
      {offer.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {offer.map((p) => <button key={p} type="button" onMouseDown={(e) => { e.preventDefault(); add(p); }} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-primary hover:text-primary"><Plus size={10} /> {p}</button>)}
        </div>
      )}
    </div>
  );
}

// ── The item list ──
/**
 * Every item of every phase, grouped by phase, with a search box. One that cannot be picked is
 * shown greyed with the reason, never left out: an item missing from the list reads as a bug.
 */
interface PickOption { id: string; label: string; group: string; why?: string; mark?: ReactNode }
function ItemPicker({ value, current, getOptions, onChange, placeholder, disabled }: {
  value: string; current: string; getOptions: () => PickOption[]; onChange: (id: string) => void; placeholder: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  const options = open ? getOptions() : [];
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const groups = [...new Set(shown.map((o) => o.group))];
  return (
    <div ref={box} className="relative">
      <button type="button" disabled={disabled} onClick={() => { setOpen((v) => !v); setQ(""); }} aria-haspopup="listbox" aria-expanded={open} className={`${inp} mt-0 flex items-center justify-between gap-2 text-left`}>
        <span className={`truncate ${value ? "" : "text-slate-400"}`}>{value ? current : placeholder}</span>
        <ChevronDown size={14} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center gap-1.5 border-b border-slate-100 px-2.5 py-1.5">
            <Search size={13} className="text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }} placeholder="Search by number or name" aria-label="Search the items" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <div role="listbox" className="max-h-64 overflow-y-auto py-1">
            {groups.map((g) => (
              <div key={g}>
                <p className="px-2.5 pb-0.5 pt-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">{g}</p>
                {shown.filter((o) => o.group === g).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={o.id === value}
                    aria-disabled={!!o.why}
                    onClick={() => { if (o.why) return; onChange(o.id); setOpen(false); }}
                    className={`flex w-full items-start gap-1.5 px-2.5 py-1 text-left text-xs ${o.why ? "cursor-not-allowed text-slate-400" : o.id === value ? "bg-blue-50 font-bold text-blue-700" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    {o.mark && <span className="mt-0.5">{o.mark}</span>}
                    <span className="min-w-0">
                      <span className="block truncate">{o.label}</span>
                      {o.why && <span className="block text-[10px] italic text-slate-400">{o.why}</span>}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {!shown.length && <p className="px-2.5 py-3 text-center text-xs text-slate-400">{options.length ? "Nothing matches." : "No other items on the schedule yet."}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Lead and lag as the client asked: two tick boxes, each with a positive number of days. Behind
 * them is the one signed number the schedule has always kept (lag positive, lead negative).
 */
type LinkRow = { id: string; type: LinkType; mode: "" | "lead" | "lag"; days: number };
const toRow = (p: Pred): LinkRow => ({ id: p.id, type: p.type, mode: p.lag < 0 ? "lead" : p.lag > 0 ? "lag" : "", days: Math.abs(p.lag) });
const toPred = (r: LinkRow): Pred => ({ id: r.id, type: r.type, lag: r.mode === "lead" ? -r.days : r.mode === "lag" ? r.days : 0 });

function LeadLag({ row, onChange }: { row: Pick<LinkRow, "mode" | "days">; onChange: (patch: Pick<LinkRow, "mode" | "days">) => void }) {
  const box = (mode: "lead" | "lag", text: string, title: string) => (
    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600" title={title}>
      <input type="checkbox" checked={row.mode === mode} onChange={(e) => onChange({ mode: e.target.checked ? mode : "", days: e.target.checked ? row.days || 1 : 0 })} className="accent-blue-600" />
      {text}
      <input
        type="number" min={0} step={1} aria-label={`${text} days`}
        value={row.mode === mode ? row.days : ""}
        disabled={row.mode !== mode}
        onChange={(e) => onChange({ mode, days: Math.max(0, Math.round(Math.abs(Number(e.target.value)) || 0)) })}
        className="w-12 rounded-md border border-slate-200 px-1.5 py-1 text-right text-xs text-slate-800 focus:border-primary focus:outline-none disabled:bg-slate-50"
      />
      <span className="font-normal text-slate-400">days</span>
    </label>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {box("lead", "Lead", "Lead: start earlier, overlapping the other item by this many days")}
      {box("lag", "Lag", "Lag: wait this many days after the other item")}
    </div>
  );
}

/**
 * GT Comments 2, page 3 (picture 2): each link on one line - the item, its relationship, Lead and
 * Lag, and the bin - under small column headings. On a narrow screen the line wraps.
 */
function LinkBox({ mode, row, onChange, disabled }: { mode: "lead" | "lag"; row: Pick<LinkRow, "mode" | "days">; onChange: (patch: Pick<LinkRow, "mode" | "days">) => void; disabled?: boolean }) {
  const text = mode === "lead" ? "Lead" : "Lag";
  return (
    <label className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500 sm:w-[4.75rem]" title={mode === "lead" ? "Lead: start earlier, overlapping the other item by this many days" : "Lag: wait this many days after the other item"}>
      <input type="checkbox" checked={row.mode === mode} disabled={disabled} onChange={(e) => onChange({ mode: e.target.checked ? mode : "", days: e.target.checked ? row.days || 1 : 0 })} aria-label={text} className="accent-blue-600" />
      <input
        type="number" min={0} step={1} aria-label={`${text} days`}
        value={row.mode === mode ? row.days : ""}
        disabled={disabled || row.mode !== mode}
        onChange={(e) => onChange({ mode, days: Math.max(0, Math.round(Math.abs(Number(e.target.value)) || 0)) })}
        className="w-9 rounded-md border border-slate-200 px-1 py-1 text-right text-xs text-slate-800 focus:border-primary focus:outline-none disabled:bg-slate-50"
      />
      <span className="sm:hidden">{text}</span><span className="hidden sm:inline">d</span>
    </label>
  );
}

function LinkList({ title, rows, onChange, optionsFor, labelOf, addLabel, canEdit }: {
  title: string; rows: LinkRow[]; onChange: (rows: LinkRow[]) => void; optionsFor: (k: number) => PickOption[]; labelOf: (id: string) => string; addLabel: string; canEdit: boolean;
}) {
  const patch = (k: number, p: Partial<LinkRow>) => onChange(rows.map((r, j) => (j === k ? { ...r, ...p } : r)));
  const head = "hidden shrink-0 text-[10px] font-bold leading-tight text-slate-400 sm:block";
  return (
    <div>
      {/* The headings line up with the row below them, as in the client's picture. */}
      <div className="flex items-end gap-1.5">
        <p className="min-w-0 flex-1 text-[11px] font-bold text-slate-700">{title}</p>
        {rows.length > 0 && (
          <>
            <span className={`${head} w-[4.75rem]`}>Relationship</span>
            <span className={`${head} w-[4.75rem]`}>Lead<span className="block font-medium">start earlier</span></span>
            <span className={`${head} w-[4.75rem]`}>Lag<span className="block font-medium">wait after</span></span>
            {canEdit && <span className="hidden w-7 shrink-0 sm:block" />}
          </>
        )}
      </div>
      <div className="mt-1 space-y-1">
        {rows.map((r, k) => (
          <div key={k} className="flex flex-wrap items-center gap-1.5">
            <div className="min-w-0 basis-full sm:min-w-[8rem] sm:flex-1 sm:basis-0" title={r.id ? labelOf(r.id) : undefined}><ItemPicker value={r.id} current={labelOf(r.id)} getOptions={() => optionsFor(k)} onChange={(id) => patch(k, { id })} placeholder="Select an item" disabled={!canEdit} /></div>
            <select value={r.type} disabled={!canEdit} onChange={(e) => patch(k, { type: e.target.value as LinkType })} aria-label="Relationship" title={`${r.type}: ${LINK_TYPES.find((x) => x.type === r.type)?.label}`} className="w-[4.75rem] shrink-0 rounded-md border border-slate-200 bg-white px-1 py-1.5 text-xs font-bold text-slate-700 focus:border-primary focus:outline-none">
              {LINK_TYPES.map((x) => <option key={x.type} value={x.type} title={x.label}>{x.type}</option>)}
            </select>
            <LinkBox mode="lead" row={r} onChange={(p) => patch(k, p)} disabled={!canEdit} />
            <LinkBox mode="lag" row={r} onChange={(p) => patch(k, p)} disabled={!canEdit} />
            {canEdit && <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== k))} title="Remove this link" aria-label="Remove this link" className="ml-auto w-7 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 sm:ml-0"><Trash2 size={14} /></button>}
          </div>
        ))}
      </div>
      {rows.length > 0 && <p className="mt-1 text-[10px] text-slate-400">FS finish to start · SS start to start · FF finish to finish · SF start to finish</p>}
      {canEdit && (
        <button type="button" onClick={() => onChange([...rows, { id: "", type: "FS", mode: "", days: 0 }])} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary">
          <Plus size={12} /> {addLabel}
        </button>
      )}
    </div>
  );
}

/** The notes the client wrote under the forms, kept as help. */
function HowItWorks() {
  return (
    <Fold title="How the dates are worked out">
      <div className={`space-y-2 ${hint}`}>
        <p className="flex gap-1.5"><Info size={13} className="mt-0.5 shrink-0 text-blue-500" /><span><b>Automatic, read-only:</b> float, critical status, start and finish are worked out from the duration, the dependencies, the relationship and the lead or lag. They are never entered by hand.</span></p>
        <ul className="space-y-0.5 pl-5">
          <li><b>FS</b> Finish to Start: starts after the other finishes.</li>
          <li><b>SS</b> Start to Start: starts when the other starts.</li>
          <li><b>FF</b> Finish to Finish: finishes when the other finishes.</li>
          <li><b>SF</b> Start to Finish: finishes when the other starts.</li>
        </ul>
        <p><b>Lead</b> starts earlier (an overlap); <b>Lag</b> waits after. Tick one and give a positive number of days.</p>
        <p>Any number of predecessors and successors is allowed, and phases and milestones can have dependencies too. The whole schedule is recalculated on every change.</p>
      </div>
    </Fold>
  );
}

const footBtn = "rounded-lg px-4 py-2 text-sm font-bold";

// ── Add Task / Add Milestone ──
export function ItemForm({ kind, initial, isNew, canEdit, rows, catList, ctx, deadline, narrow, onNarrow, onSave, onClose }: {
  kind: "task" | "milestone";
  initial: ApiMilestone;
  isNew: boolean;
  canEdit: boolean;
  /** Every item on the schedule, this one included when it is being edited. */
  rows: ApiMilestone[];
  catList: string[];
  ctx: PlanContext;
  deadline?: string;
  narrow: boolean;
  onNarrow: (v: boolean) => void;
  /** The item, and what comes after it: each successor is stored on the other item, as its predecessor. */
  onSave: (m: ApiMilestone, successors: Pred[]) => void;
  onClose: () => void;
}) {
  const point = kind === "milestone";
  const noun = point ? "milestone" : "task";
  const others = useMemo(() => rows.filter((r) => r.id !== initial.id), [rows, initial.id]);
  const [m, setM] = useState<ApiMilestone>(() => {
    const mode = initial.startMode === "auto" || initial.startMode === "manual" ? initial.startMode : !predsOf(initial).length && initial.plannedStart ? "manual" : "auto";
    return { ...initial, startMode: mode, manualStart: initial.manualStart || initial.plannedStart || "" };
  });
  const set = (patch: Partial<ApiMilestone>) => setM((p) => ({ ...p, ...patch }));
  const len0 = point ? null : lengthOf(initial);
  const [dur, setDur] = useState(len0 && len0.value > 0 ? len0.value : 1);
  const [unit, setUnit] = useState<DurationUnit>(len0?.unit || "days");
  const [preds, setPreds] = useState<LinkRow[]>(() => predsOf(initial).map(toRow));
  const [succs, setSuccs] = useState<LinkRow[]>(() => rows.filter((r) => r.id !== initial.id).flatMap((r) => predsOf(r).filter((p) => p.id === initial.id).map((p) => toRow({ ...p, id: r.id }))));
  const [people, setPeople] = useState<string[]>([]);
  useEffect(() => { fetchEmployees().then((e) => setPeople(e.map((x) => x.name).filter(Boolean).sort())).catch(() => setPeople([])); }, []);

  // The item as the form has it, then the whole schedule worked through with it in place: that
  // gives its real start and finish, its float and whether it is critical, before it is saved.
  const item = useMemo<ApiMilestone>(() => {
    const start = (m.startMode === "manual" ? m.manualStart : "") || m.plannedStart || ctx.projectStart || toIso(new Date());
    const base = withPreds({ ...m, plannedStart: start, inc: true }, preds.filter((r) => r.id).map(toPred));
    const s = parseDate(start);
    if (point || !s) return { ...base, isMilestone: point, durationValue: point ? 0 : dur, plannedEnd: start };
    return { ...base, isMilestone: false, durationValue: dur, durationUnit: unit, plannedEnd: toIso(endForDuration(s, dur, unit)) };
  }, [m, preds, dur, unit, point, ctx.projectStart]);
  const successors = useMemo(() => succs.filter((r) => r.id).map(toPred), [succs]);
  const work = useMemo(() => withItem(rows, item, successors), [rows, item, successors]);
  const planned = useMemo(() => relinkAll(work, ctx), [work, ctx]);
  const out = planned.find((r) => r.id === item.id) || item;
  const cpm = useMemo(() => criticalPath(planned, ctx), [planned, ctx]);
  const numbers = useMemo(() => wbsNumbers(work, catList).task, [work, catList]);
  const float = cpm.float.get(item.id);
  const overrun = overrunsDeadline(out, deadline);

  const labelOf = (id: string) => { const o = others.find((x) => x.id === id); return o ? `${numbers.get(id) ? `${numbers.get(id)} ` : ""}${o.name || "Untitled"}` : "An item that was removed"; };
  const optionsFor = (side: "pred" | "succ") => (k: number): PickOption[] => {
    const mine = side === "pred" ? preds : succs, theirs = side === "pred" ? succs : preds;
    const order = new Map(catList.map((c, i) => [c.toLowerCase(), i]));
    return others.map((o) => {
      const num = numbers.get(o.id) || "";
      const why = mine.some((r, j) => j !== k && r.id === o.id) ? (side === "pred" ? "Already a predecessor" : "Already a successor")
        : theirs.some((r) => r.id === o.id) ? (side === "pred" ? `Already a successor of this ${noun}` : `Already a predecessor of this ${noun}`)
        : side === "pred" && wouldCycle(work, item.id, o.id) ? `${num || "It"} already waits on this ${noun}`
        : side === "succ" && wouldCycle(work, o.id, item.id) ? `This ${noun} already waits on ${num || "it"}`
        : "";
      const group = (o.category || "").trim() || (catList.length ? UNCATEGORISED : "Schedule");
      return { id: o.id, label: `${num ? `${num} ` : ""}${o.name || "Untitled"}`, group, why, mark: isMilestonePoint(o) ? <MilestoneMark icon={o.icon} size={9} color="#64748b" /> : undefined };
    }).sort((a, b) => (order.get(a.group.toLowerCase()) ?? 999) - (order.get(b.group.toLowerCase()) ?? 999));
  };

  const as = parseDate(m.actualStart), ae = parseDate(m.actualEnd);
  const badActual = !!as && !!ae && ae < as;
  const needPhase = isNew && catList.length > 0 && !(m.category || "").trim();
  const badDur = !point && !(dur > 0);
  const half = preds.some((r) => !r.id) || succs.some((r) => !r.id);
  const blocked = !(m.name || "").trim() || needPhase || badDur || badActual || (m.startMode === "manual" && !m.manualStart);
  const baselineMoved = (m.baselineStart && m.baselineStart !== out.plannedStart) || (m.baselineEnd && m.baselineEnd !== out.plannedEnd);
  const save = () => {
    const done: ApiMilestone = { ...out, name: (out.name || "").trim(), manualStart: out.startMode === "manual" ? out.manualStart : "" };
    if (done.status === "completed") done.percent = 100;
    if ((done.percent ?? 0) >= 100 && done.status !== "cancelled") done.status = "completed";
    if ((done.percent ?? 0) > 0 && done.status === "not_started") done.status = "in_progress";
    onSave(done, successors);
  };

  const ps = parseDate(out.plannedStart), pe = parseDate(out.plannedEnd);
  const title = isNew ? (point ? "Add milestone" : "Add task") : canEdit ? (point ? "Edit milestone" : "Edit task") : point ? "Milestone" : "Task";
  const hasProgress = !!(m.actualStart || m.actualEnd || (m.percent ?? 0) > 0 || m.notes || (m.status && m.status !== "not_started"));
  const datesNote = m.startMode === "manual" && preds.some((r) => r.id) && m.manualStart && out.plannedStart !== m.manualStart
    ? `Its links do not allow ${fmtDay(m.manualStart)}: the later date applies, so a date set by hand never breaks a dependency.`
    : m.startMode === "auto" && !preds.some((r) => r.id) ? `With nothing to wait on, it starts when the ${ctx.projectStart ? "project" : "schedule"} does.` : "";

  return (
    <SidePanel
      title={title}
      icon={point ? <MilestoneMark icon={m.icon} size={14} color="#2563eb" /> : <ListTodo size={15} />}
      narrow={narrow} onNarrow={onNarrow} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={`${footBtn} text-slate-500 hover:bg-slate-100`}>{canEdit ? "Cancel" : "Close"}</button>
        {canEdit && <button type="button" onClick={save} disabled={blocked || half} title={half ? "Pick an item for every link, or remove the empty one" : undefined} className={`${footBtn} bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:opacity-50`}>{point ? "Save milestone" : "Save task"}</button>}
      </>}
    >
      <fieldset disabled={!canEdit} className="space-y-5">
        <Section n={1} title="Basic information">
          <label className="block">
            <span className={lbl}>{point ? "Milestone name" : "Task name"} *</span>
            <input value={m.name} onChange={(e) => set({ name: e.target.value })} list="schedule-item-names" placeholder={point ? "e.g. Recipe Approved" : "e.g. Order & Receive Oil"} className={inp} autoFocus={isNew} />
            <datalist id="schedule-item-names">{MASTER_PHASES.map((p) => <option key={p.key} value={p.name} />)}</datalist>
          </label>
          <label className="block">
            <span className={lbl}>Phase {catList.length ? "*" : ""}</span>
            <select value={m.category || ""} onChange={(e) => set({ category: e.target.value })} className={inp}>
              {(!catList.length || !isNew || !(m.category || "").trim()) && <option value="">{catList.length ? (isNew ? "Select a phase" : "No phase (Other)") : "No phase"}</option>}
              {catList.map((c, i) => <option key={c} value={c}>{i + 1}  {c}</option>)}
              {m.category && !catList.some((c) => c.toLowerCase() === (m.category || "").toLowerCase()) && <option value={m.category}>{m.category}</option>}
            </select>
            {!catList.length && <span className={`mt-1 block ${hint}`}>This schedule has no phases yet. Add one from the Add menu to group its items.</span>}
          </label>
          <label className="block">
            <span className={lbl}>Description / notes</span>
            <textarea value={m.description || ""} onChange={(e) => set({ description: e.target.value })} rows={2} className={`${inp} resize-y`} placeholder={point ? "What this milestone marks" : "What this task covers"} />
          </label>
        </Section>

        {!point && (
          <Section n={2} title="Duration & calendar">
            <div>
              <span className={lbl}>Duration *</span>
              <div className="mt-1 flex gap-1.5">
                <input type="number" min={1} step={unit === "days" ? 1 : "any"} value={dur || ""} onChange={(e) => setDur(Math.max(0, unit === "days" ? Math.round(Number(e.target.value) || 0) : Number(e.target.value) || 0))} aria-label="Duration" className={`${inp} mt-0 w-24`} />
                <select value={unit} onChange={(e) => setUnit(e.target.value as DurationUnit)} aria-label="Duration unit" className={`${inp} mt-0 w-28`}>
                  <option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option>
                </select>
              </div>
              <span className={`mt-1 block ${hint}`}>The days worked, first and last included: 3 days from 2 Sep is 2, 3 and 4 Sep.</span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={m.includeWeekends !== false} onChange={(e) => set({ includeWeekends: e.target.checked })} className="accent-blue-600" /> Include weekends</label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={m.includeHolidays !== false} onChange={(e) => set({ includeHolidays: e.target.checked })} className="accent-blue-600" /> Include holidays</label>
            </div>
          </Section>
        )}

        <Section n={point ? 2 : 3} title={point ? "Date" : "Dates (optional)"}>
          <div>
            <span className={lbl}>{point ? "Milestone date" : "Start date"}</span>
            <ModeChoice name="item-start" mode={m.startMode === "manual" ? "manual" : "auto"} date={m.manualStart || ""} onChange={(mode, date) => set({ startMode: mode, manualStart: date })} />
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Worked out for you</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
              {point
                ? <span>Date <b className="text-slate-900">{ps ? fmtDay(ps) : "-"}</b></span>
                : <><span>Start <b className="text-slate-900">{ps ? fmtDay(ps) : "-"}</b></span><span>Finish <b className="text-slate-900">{pe ? fmtDay(pe) : "-"}</b></span>{ps && pe && <span className="text-slate-500">{daysBetween(ps, pe) + 1} calendar day{daysBetween(ps, pe) === 0 ? "" : "s"}</span>}</>}
              <span>Float <b className={float === undefined ? "text-slate-400" : float <= 0 ? "text-red-600" : "text-emerald-600"}>{float === undefined ? "-" : `${float} day${float === 1 ? "" : "s"}`}</b></span>
              <span>Critical <b className={float !== undefined && float <= 0 ? "text-red-600" : "text-slate-700"}>{float === undefined ? "-" : float <= 0 ? "Yes" : "No"}</b></span>
            </div>
            {datesNote && <p className={`mt-1 ${hint}`}>{datesNote}</p>}
            {overrun > 0 && <p className="mt-1.5 rounded-md bg-red-50 px-2 py-1 text-[11px] font-bold text-red-600">This finishes {overrun} day{overrun === 1 ? "" : "s"} past the contract deadline ({fmtDay(parseDate(deadline))}). Extend the contract time or shorten the work.</p>}
          </div>
        </Section>

        <Section n={point ? 3 : 4} title="Dependencies" note="Select predecessor(s) and/or successor(s). You can add multiple dependencies. Float and Critical Path will be calculated automatically by the system.">
          <LinkList title="Predecessor(s)" rows={preds} onChange={setPreds} optionsFor={optionsFor("pred")} labelOf={labelOf} addLabel={preds.length ? "Add another predecessor" : "Add a predecessor"} canEdit={canEdit} />
          <LinkList title="Successor(s)" rows={succs} onChange={setSuccs} optionsFor={optionsFor("succ")} labelOf={labelOf} addLabel={succs.length ? "Add another successor" : "Add a successor"} canEdit={canEdit} />
        </Section>

        <Section n={point ? 4 : 5} title={point ? "Other details" : "Assignment & other details"}>
          {point && (
            <div>
              <span className={lbl}>Milestone icon</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {MILESTONE_ICONS.map((x) => (
                  <button key={x.v} type="button" onClick={() => set({ icon: x.v })} aria-pressed={(m.icon || "diamond") === x.v} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${(m.icon || "diamond") === x.v ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-primary"}`}>
                    <MilestoneMark icon={x.v} size={11} /> {x.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Chips label="Assigned to" value={m.responsible || []} onChange={(v) => set({ responsible: v })} suggestions={people} placeholder="Name (employee or anyone)" canEdit={canEdit} />
          {!point && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={lbl}>Priority</span>
                <select value={m.priority || "normal"} onChange={(e) => set({ priority: e.target.value as SchedulePriority })} className={inp}>
                  {PRIORITIES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={lbl}>Status</span>
                <select value={m.status || "not_started"} onChange={(e) => set(statusPatch(m, e.target.value as MilestoneStatus))} className={inp}>
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </label>
            </div>
          )}
          <Chips label="Tags (optional)" value={m.tags || []} onChange={(v) => set({ tags: v })} placeholder="Type a tag and press Enter" canEdit={canEdit} />
        </Section>

        <Fold title="Progress" open={hasProgress}>
          {point ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={lbl}>Status</span>
                <select value={m.status || "not_started"} onChange={(e) => set(statusPatch(m, e.target.value as MilestoneStatus))} className={inp}>
                  {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </label>
              <label className="block"><span className={lbl}>Actual date</span><input type="date" value={m.actualEnd || ""} onChange={(e) => set({ actualStart: e.target.value, actualEnd: e.target.value, ...(e.target.value && m.status !== "completed" ? { status: "completed" as MilestoneStatus, percent: 100 } : {}) })} className={inp} /></label>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={lbl}>Actual start</span><input type="date" value={m.actualStart || ""} onChange={(e) => set({ actualStart: e.target.value, ...(e.target.value && (m.status || "not_started") === "not_started" ? { status: "in_progress" as MilestoneStatus } : {}) })} className={inp} /></label>
                <label className="block"><span className={lbl}>Actual finish</span><input type="date" value={m.actualEnd || ""} min={m.actualStart || undefined} onChange={(e) => set({ actualEnd: e.target.value, ...(e.target.value && m.status !== "completed" ? { status: "completed" as MilestoneStatus, percent: 100 } : {}) })} className={inp} /></label>
              </div>
              {badActual && <p className="text-[11px] font-bold text-red-600">The actual finish is before the actual start.</p>}
              <label className="block">
                <span className={lbl}>% complete: {m.percent ?? 0}%</span>
                <input type="range" min={0} max={100} step={5} value={m.percent ?? 0} onChange={(e) => set({ percent: Number(e.target.value) })} className="mt-2 w-full accent-blue-600" />
              </label>
            </>
          )}
          <label className="block">
            <span className={lbl}>Internal notes</span>
            <textarea value={m.notes || ""} onChange={(e) => set({ notes: e.target.value })} rows={2} className={`${inp} resize-y`} placeholder="Delays, what the client agreed... (never printed)" />
          </label>
          {(m.baselineStart || m.baselineEnd) && (
            <p className={`flex flex-wrap items-center gap-2 ${hint}`}>
              <History size={12} className="text-slate-400" />
              Baseline: {fmtDay(m.baselineStart) || "-"} to {fmtDay(m.baselineEnd) || "-"}
              {baselineMoved && canEdit && (
                <button type="button" onClick={() => set({ baselineStart: out.plannedStart, baselineEnd: out.plannedEnd })} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:border-primary hover:text-primary">Make the current plan the baseline</button>
              )}
            </p>
          )}
        </Fold>
      </fieldset>
      <HowItWorks />
    </SidePanel>
  );
}

// ── Add Phase / Category ──
export function PhaseForm({ initial, oldName, number, catList, rows, phases, canEdit, narrow, onNarrow, onSave, onClose }: {
  initial: ApiSchedulePhase;
  /** The phase's name before this edit; null for a new phase. */
  oldName: string | null;
  number: number;
  catList: string[];
  rows: ApiMilestone[];
  phases: ApiSchedulePhase[];
  canEdit: boolean;
  narrow: boolean;
  onNarrow: (v: boolean) => void;
  onSave: (phase: ApiSchedulePhase, number: number) => void;
  onClose: () => void;
}) {
  const [p, setP] = useState<ApiSchedulePhase>({ startMode: "auto", finishMode: "auto", status: "not_started", assignedTo: [], ...initial, color: initial.color || PHASE_COLORS[(number - 1) % PHASE_COLORS.length] });
  const [no, setNo] = useState(number);
  const [link, setLink] = useState<{ value: string; type: LinkType; mode: "" | "lead" | "lag"; days: number }>(() => {
    const q = initial.pred;
    return q ? { value: `${q.kind}:${q.ref}`, type: q.type, mode: q.lag < 0 ? "lead" : q.lag > 0 ? "lag" : "", days: Math.abs(q.lag) } : { value: "", type: "FS", mode: "", days: 0 };
  });
  const [people, setPeople] = useState<string[]>([]);
  useEffect(() => { fetchEmployees().then((e) => setPeople(e.map((x) => x.name).filter(Boolean).sort())).catch(() => setPeople([])); }, []);
  const set = (patch: Partial<ApiSchedulePhase>) => setP((x) => ({ ...x, ...patch }));
  const key = (s?: string | null) => (s || "").trim().toLowerCase();

  const name = (p.name || "").trim();
  const count = catList.length + (oldName === null ? 1 : 0);
  const taken = !!name && (name === UNCATEGORISED || catList.some((c) => key(c) === key(name) && key(c) !== key(oldName)));
  const mine = useMemo(() => rows.filter((r) => oldName !== null && key(r.category) === key(oldName)), [rows, oldName]);
  const numbers = useMemo(() => wbsNumbers(rows, catList).task, [rows, catList]);
  // The schedule without this phase's own link: what a new link is checked against.
  const rest = useMemo(() => withPhaseLinks(rows, { phases: phases.filter((x) => key(x.name) !== key(oldName)) }), [rows, phases, oldName]);
  const loops = (l: PhaseLink) => phaseLinkTargets(rows, l).some((t) => mine.some((x) => x.id === t || wouldCycle(rest, x.id, t)));
  const getOptions = (): PickOption[] => [
    ...catList.filter((c) => key(c) !== key(oldName)).map((c) => ({
      id: `phase:${c}`, label: `${catList.indexOf(c) + 1}  ${c}`, group: "Phases",
      why: loops({ kind: "phase", ref: c, type: link.type, lag: 0 }) ? "It already waits on this phase" : "",
    })),
    ...rows.filter(isMilestonePoint).map((r) => ({
      id: `item:${r.id}`, label: `${numbers.get(r.id) ? `${numbers.get(r.id)} ` : ""}${r.name || "Untitled"}`, group: "Milestones", mark: <MilestoneMark icon={r.icon} size={9} color="#64748b" />,
      why: mine.some((x) => x.id === r.id) ? "It is in this phase" : loops({ kind: "item", ref: r.id, type: link.type, lag: 0 }) ? "It already waits on this phase" : "",
    })),
  ];
  const current = link.value.startsWith("phase:") ? (() => { const c = link.value.slice(6); const i = catList.findIndex((x) => key(x) === key(c)); return i >= 0 ? `${i + 1}  ${catList[i]}` : "A phase that was removed"; })()
    : link.value ? (() => { const r = rows.find((x) => x.id === link.value.slice(5)); return r ? `${numbers.get(r.id) ? `${numbers.get(r.id)} ` : ""}${r.name}` : "A milestone that was removed"; })() : "";

  const starts = mine.map((r) => parseDate(r.plannedStart)).filter((d): d is Date => !!d);
  const ends = mine.map((r) => parseDate(r.plannedEnd) || parseDate(r.plannedStart)).filter((d): d is Date => !!d);
  const from = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
  const to = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
  const target = p.finishMode === "manual" ? parseDate(p.targetFinish) : null;
  const late = !!target && !!to && to > target;

  const blocked = !name || taken || !p.color || (p.startMode === "manual" && !p.manualStart) || (p.finishMode === "manual" && !p.targetFinish);
  const save = () => {
    const pred: ApiSchedulePhase["pred"] = link.value
      ? { kind: link.value.startsWith("phase:") ? "phase" : "item", ref: link.value.slice(link.value.indexOf(":") + 1), type: link.type, lag: link.mode === "lead" ? -link.days : link.mode === "lag" ? link.days : 0 }
      : null;
    onSave({
      ...p, name, pred,
      manualStart: p.startMode === "manual" ? p.manualStart : "",
      targetFinish: p.finishMode === "manual" ? p.targetFinish : "",
    }, Math.max(1, Math.min(count, Math.round(no) || count)));
  };

  return (
    <SidePanel
      title={oldName === null ? "Add phase / category" : canEdit ? "Edit phase" : "Phase"}
      icon={<FolderTree size={15} />}
      narrow={narrow} onNarrow={onNarrow} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={`${footBtn} text-slate-500 hover:bg-slate-100`}>{canEdit ? "Cancel" : "Close"}</button>
        {canEdit && <button type="button" onClick={save} disabled={blocked} className={`${footBtn} bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:opacity-50`}>Save phase</button>}
      </>}
    >
      <fieldset disabled={!canEdit} className="space-y-5">
        <Section n={1} title="Basic information">
          <div className="grid grid-cols-[1fr_5.5rem] gap-3">
            <label className="block">
              <span className={lbl}>Phase name *</span>
              <input value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Phase 2 - Procurement" className={inp} autoFocus={oldName === null} />
            </label>
            <label className="block">
              <span className={lbl}>Number *</span>
              <input type="number" min={1} max={count} step={1} value={no || ""} onChange={(e) => setNo(Number(e.target.value) || 0)} className={inp} title="Its place in the schedule: 1 is first" />
            </label>
          </div>
          {taken && <p className="text-[11px] font-bold text-red-600">{name === UNCATEGORISED ? `"${UNCATEGORISED}" is kept for items without a phase.` : `"${name}" is already a phase.`}</p>}
          <label className="block">
            <span className={lbl}>Description / notes</span>
            <textarea value={p.description || ""} onChange={(e) => set({ description: e.target.value })} rows={2} className={`${inp} resize-y`} placeholder="What this phase covers" />
          </label>
          <div>
            <span className={lbl}>Colour *</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {PHASE_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => set({ color: c })} aria-label={`Colour ${c}`} aria-pressed={p.color === c} className={`h-6 w-6 rounded-full ring-offset-2 ${p.color === c ? "ring-2 ring-slate-900" : "hover:ring-2 hover:ring-slate-300"}`} style={{ background: c }} />
              ))}
              <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-500" title="Any other colour">
                <input type="color" value={p.color || PHASE_COLORS[0]} onChange={(e) => set({ color: e.target.value })} className="h-6 w-7 cursor-pointer rounded border border-slate-200 bg-white p-0" aria-label="Another colour" /> Other
              </label>
            </div>
            <span className={`mt-1 block ${hint}`}>Used for the phase's bar on the chart and its row in the table.</span>
          </div>
        </Section>

        <Section n={2} title="Schedule (optional)">
          <div>
            <span className={lbl}>Start date</span>
            <ModeChoice name="phase-start" mode={p.startMode === "manual" ? "manual" : "auto"} date={p.manualStart || ""} onChange={(mode, date) => set({ startMode: mode, manualStart: date })} />
          </div>
          <div>
            <span className={lbl}>Target finish date (optional)</span>
            <ModeChoice name="phase-finish" mode={p.finishMode === "manual" ? "manual" : "auto"} date={p.targetFinish || ""} min={p.startMode === "manual" ? p.manualStart : undefined} onChange={(mode, date) => set({ finishMode: mode, targetFinish: date })} />
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-2 text-xs text-slate-700">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">From its items</p>
            {from && to
              ? <p className="mt-1">Runs <b className="text-slate-900">{fmtDay(from)}</b> to <b className={late ? "text-red-600" : "text-slate-900"}>{fmtDay(to)}</b>, {daysBetween(from, to) + 1} days, {mine.length} item{mine.length === 1 ? "" : "s"}.{late ? ` That is ${daysBetween(target!, to)} day${daysBetween(target!, to) === 1 ? "" : "s"} past the target finish.` : ""}</p>
              : <p className={`mt-1 ${hint}`}>A phase runs from its first item's start to its last item's finish. It has none yet.</p>}
            {p.startMode === "manual" && <p className={`mt-1 ${hint}`}>None of its items will start before the date set here.</p>}
          </div>
        </Section>

        <Section n={3} title="Dependencies (optional)" note="A phase can have a predecessor if it needs to start after another phase or milestone. This is optional.">
          <div>
            <span className={lbl}>Predecessor</span>
            <div className="mt-1 flex items-center gap-1.5">
              <div className="min-w-0 flex-1"><ItemPicker value={link.value} current={current} getOptions={getOptions} onChange={(v) => setLink((l) => ({ ...l, value: v }))} placeholder="None" disabled={!canEdit} /></div>
              {link.value && canEdit && <button type="button" onClick={() => setLink({ value: "", type: "FS", mode: "", days: 0 })} title="Remove the predecessor" aria-label="Remove the predecessor" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>}
            </div>
          </div>
          {link.value && (
            <>
              <label className="block">
                <span className={lbl}>Relationship</span>
                <select value={link.type} onChange={(e) => setLink((l) => ({ ...l, type: e.target.value as LinkType }))} className={inp}>
                  <option value="FS">FS - Finish to start (starts after it finishes)</option>
                  <option value="SS">SS - Start to start (starts when it starts)</option>
                  <option value="FF">FF - Finish to finish (finishes when it finishes)</option>
                  <option value="SF">SF - Start to finish (finishes when it starts)</option>
                </select>
              </label>
              <LeadLag row={link} onChange={(x) => setLink((l) => ({ ...l, ...x }))} />
              <p className={hint}>
                {link.type === "FS" || link.type === "SS"
                  ? "Every item in this phase waits on it, so none can start before the link allows."
                  : "The phase cannot finish before the link allows: its last items (those nothing else in the phase follows) are timed to it."}
              </p>
            </>
          )}
        </Section>

        <Section n={4} title="Other details">
          <label className="block">
            <span className={lbl}>Status</span>
            <select value={p.status || "not_started"} onChange={(e) => set({ status: e.target.value as MilestoneStatus })} className={inp}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
          </label>
          <Chips label="Assigned to" value={p.assignedTo || []} onChange={(v) => set({ assignedTo: v })} suggestions={people} placeholder="Name (employee or anyone)" canEdit={canEdit} />
        </Section>
      </fieldset>
      <HowItWorks />
    </SidePanel>
  );
}
