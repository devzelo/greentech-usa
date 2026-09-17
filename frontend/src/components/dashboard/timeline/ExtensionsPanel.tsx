import { useState } from "react";
import { CalendarPlus, Loader2, Trash2, X } from "lucide-react";
import type { ApiExtension } from "../../../lib/api";
import { useDialogs } from "../../../lib/useDialogs";
import { DAY, fmtDate, humanGap, newMilestoneId, parseDate, sortedExtensions, toIso } from "../../../lib/projectSchedule";

/**
 * CR-P (126): approved extensions of time: the new deadline and why. Most construction projects
 * are extended at least once; the latest extension is the deadline the timeline counts down to.
 */
export default function ExtensionsPanel({ endDate, extensions = [], canEdit, onSave, userName = "" }: {
  endDate?: string;
  extensions?: ApiExtension[];
  canEdit: boolean;
  onSave?: (next: ApiExtension[], message: string) => Promise<void>;
  userName?: string;
}) {
  const { confirm, dialogs } = useDialogs();
  const [adding, setAdding] = useState(false);
  const [newEnd, setNewEnd] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const origEnd = parseDate(endDate);
  const all = sortedExtensions(extensions);
  const inEffect = origEnd ? all.filter((e) => parseDate(e.endDate)! > origEnd) : all;
  const end = inEffect.length ? parseDate(inEffect[inEffect.length - 1].endDate)! : origEnd;

  const gapFor = (e: ApiExtension, i: number) => {
    const prevExt = i > 0 ? parseDate(all[i - 1].endDate)! : origEnd;
    const prev = prevExt && origEnd && prevExt > origEnd ? prevExt : origEnd;
    const d = parseDate(e.endDate)!;
    return prev && d > prev ? `+${humanGap(prev, d)}` : prev ? "not in effect (on or before the end date)" : "";
  };

  const newEndDate = parseDate(newEnd);
  const valid = !!newEndDate && (!end || newEndDate > end);
  const saveNew = async () => {
    if (!onSave || !newEndDate || !valid) return;
    setSaving(true);
    try {
      const next = [...all, { id: newMilestoneId(), endDate: toIso(newEndDate), reason: reason.trim(), addedAt: toIso(new Date()), addedBy: userName }];
      await onSave(next, `Extension added: new deadline ${fmtDate(newEndDate)}.`);
      setAdding(false); setNewEnd(""); setReason("");
    } catch { /* the caller shows the error */ } finally { setSaving(false); }
  };
  const remove = async (e: ApiExtension) => {
    if (!onSave) return;
    if (!(await confirm({ title: "Remove extension?", message: `Remove the extension to ${fmtDate(parseDate(e.endDate)!)}? The deadline goes back to the one before it.`, confirmLabel: "Remove", danger: true }))) return;
    try { await onSave(all.filter((x) => x.id !== e.id), "Extension removed."); } catch { /* shown by the caller */ }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Extensions of time</p>
        {canEdit && onSave && !adding && (
          <button type="button" onClick={() => setAdding(true)} disabled={!origEnd} title={origEnd ? "" : "Set the contract deadline first"} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-[11px] font-bold hover:bg-violet-100 disabled:opacity-50">
            <CalendarPlus size={12} /> Add extension
          </button>
        )}
      </div>
      {all.length === 0 && !adding && <p className="text-[11px] text-slate-400">No extension. If the client approves extra time, add it here with the new deadline.</p>}
      {all.length > 0 && (
        <ol className="space-y-1">
          {all.map((e, i) => {
            const on = !origEnd || parseDate(e.endDate)! > origEnd;
            return (
              <li key={e.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs rounded-lg px-3 py-1.5 ${on ? "bg-violet-50/60" : "bg-slate-50 text-slate-400"}`}>
                <span className="font-bold text-violet-700">#{i + 1}</span>
                <span className="font-bold text-slate-800">To {fmtDate(parseDate(e.endDate)!)}</span>
                <span className={`font-bold ${on ? "text-violet-700" : "text-slate-400"}`}>{gapFor(e, i)}</span>
                {e.reason && <span className="text-slate-500">{e.reason}</span>}
                <span className="text-[10px] text-slate-400 ml-auto">{[e.addedBy, e.addedAt && parseDate(e.addedAt) && fmtDate(parseDate(e.addedAt)!)].filter(Boolean).join(" · ")}</span>
                {canEdit && onSave && (
                  <button type="button" onClick={() => remove(e)} className="p-1 rounded text-slate-400 hover:text-red-600" title="Remove"><Trash2 size={12} /></button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {adding && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
          <label className="text-[11px] font-bold text-slate-600">
            New deadline
            <input type="date" value={newEnd} min={end ? toIso(new Date(end.getTime() + DAY)) : undefined} onChange={(e) => setNewEnd(e.target.value)} className="block mt-1 px-2 py-1 rounded-lg border border-slate-200 text-sm text-slate-800 bg-white" />
          </label>
          <label className="text-[11px] font-bold text-slate-600 flex-grow min-w-[12rem]">
            Reason (optional)
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Modification 2, scope change" className="block w-full mt-1 px-2 py-1 rounded-lg border border-slate-200 text-sm text-slate-800 bg-white" />
          </label>
          <span className="text-xs font-bold text-violet-700 pb-1.5 min-w-[6rem]">
            {newEndDate && end && newEndDate > end ? `+${humanGap(end, newEndDate)}` : newEndDate ? "Must be after the current deadline" : ""}
          </span>
          <button type="button" onClick={saveNew} disabled={saving || !valid} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50">
            {saving && <Loader2 size={12} className="animate-spin" />} Save extension
          </button>
          <button type="button" onClick={() => { setAdding(false); setNewEnd(""); setReason(""); }} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700" title="Cancel"><X size={14} /></button>
        </div>
      )}
      {dialogs}
    </div>
  );
}
