import { useState } from "react";
import { CalendarClock, CalendarPlus, ChevronDown, ChevronUp, AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import type { ApiExtension } from "../../lib/api";
import { useDialogs } from "../../lib/useDialogs";
import { DAY, humanGap, newMilestoneId, parseDate, sortedExtensions, toIso } from "../../lib/projectSchedule";

/**
 * CR-PR-14 — how much contract time is left on a project.
 *
 * This is NOT progress on the work: it only measures the calendar between the start date and the
 * deadline. Collapsed it is a single line (bar + time left); clicking expands it to the full
 * picture — both dates, percentages, and a "Today" marker on the track.
 *
 * CR-P (126) — most projects are extended past the original end date. Approved extensions are
 * recorded here (the new deadline and why); the bar then runs to the new deadline, with the time
 * added shown in a different colour after the original end date.
 */

const fmt = (d: Date) => d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

export default function ContractTimeline({ startDate, endDate, extensions = [], canEdit = false, onSaveExtensions, userName = "", className = "" }: {
  /** Contract / start date. Falls back to nothing shown if absent. */
  startDate?: string;
  /** The original deadline. Required — with no deadline there is no time to count down. */
  endDate?: string;
  extensions?: ApiExtension[];
  canEdit?: boolean;
  onSaveExtensions?: (next: ApiExtension[], message: string) => Promise<void>;
  userName?: string;
  className?: string;
}) {
  const { confirm, dialogs } = useDialogs();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newEnd, setNewEnd] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const start = parseDate(startDate);
  const origEnd = parseDate(endDate);
  if (!origEnd) return null;                       // nothing to count down to

  // Every extension on record, and the ones in effect (after the original end date). Saves always
  // send the full list, so an extension is never lost when the original end date moves past it.
  const all = sortedExtensions(extensions);
  const exts = all.filter((e) => parseDate(e.endDate)! > origEnd);
  const end = exts.length ? parseDate(exts[exts.length - 1].endDate)! : origEnd;
  const extended = exts.length > 0;

  const now = new Date();
  // Whole days only, so the bar moves once a day rather than by the millisecond.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const overdue = today > end;
  const total = start ? Math.max(1, end.getTime() - start.getTime()) : 0;
  const done = start ? today.getTime() - start.getTime() : 0;
  const pct = start ? Math.min(100, Math.max(0, (done / total) * 100)) : overdue ? 100 : 0;
  // Where the original deadline sits on the (extended) track.
  const origPct = start && extended ? Math.min(100, Math.max(0, ((origEnd.getTime() - start.getTime()) / total) * 100)) : 100;

  const left = overdue ? humanGap(end, today) : humanGap(today, end);
  const headline = overdue ? `${left} overdue` : `${left} remaining`;

  const barColor = overdue ? "bg-red-500" : pct > 85 ? "bg-amber-500" : "bg-primary";

  // The track: the extension zone tinted after the original deadline; elapsed time drawn over it,
  // in the extension colour once it runs past the original deadline.
  const Track = ({ tall }: { tall?: boolean }) => (
    <div className={`relative ${tall ? "h-2.5" : "h-2 flex-grow min-w-[4rem]"} rounded-full bg-slate-100 overflow-hidden`}>
      {extended && start && <div className="absolute inset-y-0 right-0 bg-violet-100" style={{ left: `${origPct}%` }} />}
      <div className={`absolute inset-y-0 left-0 ${barColor}`} style={{ width: `${start ? Math.min(pct, origPct) : 100}%` }} />
      {extended && start && pct > origPct && (
        <div className={`absolute inset-y-0 ${overdue ? "bg-red-500" : "bg-violet-500"}`} style={{ left: `${origPct}%`, width: `${pct - origPct}%` }} />
      )}
      {extended && start && <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${origPct}%` }} title={`Original end date ${fmt(origEnd)}`} />}
    </div>
  );

  // The time an extension added beyond the deadline before it (the original end date at least).
  const gapFor = (e: ApiExtension, i: number) => {
    const prevExt = i > 0 ? parseDate(all[i - 1].endDate)! : origEnd;
    const prev = prevExt > origEnd ? prevExt : origEnd;
    const d = parseDate(e.endDate)!;
    return d > prev ? `+${humanGap(prev, d)}` : "not in effect (on or before the end date)";
  };

  const newEndDate = parseDate(newEnd);
  const saveNew = async () => {
    if (!onSaveExtensions || !newEndDate) return;
    setSaving(true);
    try {
      const next = [...all, { id: newMilestoneId(), endDate: toIso(newEndDate), reason: reason.trim(), addedAt: toIso(new Date()), addedBy: userName }];
      await onSaveExtensions(next, `Extension added: new end date ${fmt(newEndDate)}.`);
      setAdding(false); setNewEnd(""); setReason("");
    } catch { /* the workspace shows the error */ } finally { setSaving(false); }
  };
  const remove = async (e: ApiExtension) => {
    if (!onSaveExtensions) return;
    if (!(await confirm({ title: "Remove extension?", message: `Remove the extension to ${fmt(parseDate(e.endDate)!)}? The deadline goes back to the one before it.`, confirmLabel: "Remove", danger: true }))) return;
    try { await onSaveExtensions(all.filter((x) => x.id !== e.id), "Extension removed."); } catch { /* shown by the workspace */ }
  };

  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>
      {/* Collapsed: one line — click anywhere to see the detail. */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
        title={open ? "Hide contract timeline" : "Show contract timeline"}
      >
        <CalendarClock size={14} className={overdue ? "text-red-500 shrink-0" : "text-slate-400 shrink-0"} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0 hidden sm:inline">Contract time</span>
        <Track />
        {extended && (
          <span className="text-[10px] font-bold text-violet-700 bg-violet-50 rounded-full px-2 py-0.5 shrink-0 hidden md:inline" title={`Original end date ${fmt(origEnd)}`}>
            Extended{exts.length > 1 ? ` ×${exts.length}` : ""}
          </span>
        )}
        <span className={`text-xs font-bold shrink-0 ${overdue ? "text-red-600" : "text-slate-700"}`}>
          {overdue && <AlertTriangle size={11} className="inline mb-0.5 mr-1" />}{headline}
        </span>
        {open ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
      </button>

      {/* Expanded: the full picture. */}
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-50">
          <div className="flex items-end gap-4 sm:gap-6">
            <div className="shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Start date</p>
              <p className="text-sm font-bold text-slate-900">{start ? fmt(start) : "—"}</p>
            </div>

            <div className="flex-grow min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-bold text-slate-500">{start ? `${Math.round(pct)}% elapsed` : "No start date set"}</span>
                <span className={`text-sm font-bold ${overdue ? "text-red-600" : "text-slate-900"}`}>{headline}</span>
              </div>
              {/* Track with a Today marker sitting at the elapsed position. */}
              <div className="relative">
                <Track tall />
                {start && !overdue && (
                  <div className="absolute -top-1 -bottom-1 w-px bg-slate-700" style={{ left: `${pct}%` }} title="Today" />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-[11px] font-bold text-slate-500">{start ? `${Math.round(100 - pct)}% remaining` : ""}</span>
                <span className="text-[10px] text-slate-400">Auto-updates daily</span>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{extended ? "New end date" : "End date"}</p>
              <p className={`text-sm font-bold ${overdue ? "text-red-600" : extended ? "text-violet-700" : "text-slate-900"}`}>{fmt(end)}</p>
              {extended && <p className="text-[11px] text-slate-400 line-through" title="Original end date">{fmt(origEnd)}</p>}
            </div>
          </div>

          {/* CR-P (126) — the extensions of time. */}
          {(all.length > 0 || canEdit) && (
            <div className="mt-4 pt-3 border-t border-slate-50">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Extensions of time</p>
                {canEdit && onSaveExtensions && !adding && (
                  <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-[11px] font-bold hover:bg-violet-100">
                    <CalendarPlus size={12} /> Add extension
                  </button>
                )}
              </div>
              {all.length === 0 && !adding && <p className="text-[11px] text-slate-400">No extension. If the client approves extra time, add it here with the new end date.</p>}
              {all.length > 0 && (
                <ol className="space-y-1">
                  {all.map((e, i) => (
                    <li key={e.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs rounded-lg px-3 py-1.5 ${parseDate(e.endDate)! > origEnd ? "bg-violet-50/50" : "bg-slate-50 text-slate-400"}`}>
                      <span className="font-bold text-violet-700">#{i + 1}</span>
                      <span className="font-bold text-slate-800">To {fmt(parseDate(e.endDate)!)}</span>
                      <span className={`font-bold ${parseDate(e.endDate)! > origEnd ? "text-violet-700" : "text-slate-400"}`}>{gapFor(e, i)}</span>
                      {e.reason && <span className="text-slate-500">{e.reason}</span>}
                      <span className="text-[10px] text-slate-400 ml-auto">{[e.addedBy, e.addedAt && fmt(parseDate(e.addedAt)!)].filter(Boolean).join(" · ")}</span>
                      {canEdit && onSaveExtensions && (
                        <button onClick={() => remove(e)} className="p-1 rounded text-slate-400 hover:text-red-600" title="Remove"><Trash2 size={12} /></button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {adding && (
                <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
                  <label className="text-[11px] font-bold text-slate-600">
                    New end date
                    <input type="date" value={newEnd} min={toIso(new Date(end.getTime() + DAY))} onChange={(e) => setNewEnd(e.target.value)} className="block mt-1 px-2 py-1 rounded-lg border border-slate-200 text-sm text-slate-800 bg-white" />
                  </label>
                  <label className="text-[11px] font-bold text-slate-600 flex-grow min-w-[12rem]">
                    Reason (optional)
                    <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Modification 2, scope change" className="block w-full mt-1 px-2 py-1 rounded-lg border border-slate-200 text-sm text-slate-800 bg-white" />
                  </label>
                  <span className="text-xs font-bold text-violet-700 pb-1.5 min-w-[6rem]">
                    {newEndDate && newEndDate > end ? `+${humanGap(end, newEndDate)}` : newEndDate ? "Must be after the current end date" : ""}
                  </span>
                  <button onClick={saveNew} disabled={saving || !newEndDate || newEndDate <= end} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50">
                    {saving && <Loader2 size={12} className="animate-spin" />} Save extension
                  </button>
                  <button onClick={() => { setAdding(false); setNewEnd(""); setReason(""); }} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700" title="Cancel"><X size={14} /></button>
                </div>
              )}
            </div>
          )}

          <p className="text-[10px] text-slate-400 mt-3">Calendar time between the start and end dates — not a measure of work completed.</p>
        </div>
      )}
      {dialogs}
    </div>
  );
}
