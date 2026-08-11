import { useState } from "react";
import { BellPlus, Loader2, X } from "lucide-react";
import { createReminder } from "../../lib/api";
import { toast } from "../../lib/toast";

// Drop this next to ANY record — a BOQ, an RFQ, a PO, an agreement, a proposal — to let the
// user set a personal reminder about it. `link` deep-links the notification back to the record.
//
//   <ReminderButton title="Send RFQ 7001 to vendors" contextLabel="Project · Riyadh Metro"
//                   link={`/dashboard/projects/${id}?tab=procurement&proc=rfqs`} />

const QUICK: Array<{ label: string; minutes: number }> = [
  { label: "In 1 hour", minutes: 60 },
  { label: "Tomorrow", minutes: 60 * 24 },
  { label: "Next week", minutes: 60 * 24 * 7 },
  { label: "Next month", minutes: 60 * 24 * 30 },
];

// A datetime-local value for `minutes` from now, in the browser's own timezone.
export function localDateTime(minutes = 0): string {
  const d = new Date(Date.now() + minutes * 60_000);
  d.setSeconds(0, 0);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inp = "w-full bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10";

export default function ReminderButton({ title, contextLabel, link, compact }: {
  title?: string; contextLabel?: string; link?: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", notes: "", dueAt: localDateTime(60), emailEnabled: false });

  const start = () => {
    setForm({ title: title || "", notes: "", dueAt: localDateTime(60), emailEnabled: false });
    setOpen(true);
  };
  const save = async (minutes?: number) => {
    if (!form.title.trim()) { toast("Give the reminder a title.", "error"); return; }
    if (minutes === undefined && isNaN(new Date(form.dueAt).getTime())) { toast("Pick a valid date and time.", "error"); return; }
    setSaving(true);
    try {
      await createReminder({
        title: form.title.trim(),
        notes: form.notes,
        dueAt: new Date(minutes !== undefined ? Date.now() + minutes * 60_000 : form.dueAt).toISOString(),
        link: link || "",
        contextLabel: contextLabel || "",
        emailEnabled: form.emailEnabled,
      });
      toast("Reminder set.", "success");
      setOpen(false);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not set the reminder.", "error"); }
    finally { setSaving(false); }
  };

  return (
    <>
      <button
        onClick={start}
        title="Set a reminder about this"
        className={compact
          ? "p-1.5 rounded text-slate-400 hover:text-primary"
          : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold hover:border-primary hover:text-primary"}
      >
        <BellPlus size={compact ? 14 : 12} />{!compact && " Remind me"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-16" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2"><BellPlus size={16} className="text-primary" /><p className="text-sm font-bold text-slate-900">Set a reminder</p></div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              {contextLabel && <p className="text-[11px] text-slate-400">About: <span className="font-bold text-slate-600">{contextLabel}</span></p>}
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">What to remind you about
                <input className={`${inp} mt-1`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Send RFQ 7001 to vendors" /></label>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notes
                <textarea rows={2} className={`${inp} mt-1 resize-y`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Quick options</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK.map((q) => (
                    <button key={q.label} disabled={saving} onClick={() => save(q.minutes)} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-primary hover:text-white disabled:opacity-50">{q.label}</button>
                  ))}
                </div>
              </div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Or pick a date &amp; time
                <input type="datetime-local" className={`${inp} mt-1`} value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></label>
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                <input type="checkbox" checked={form.emailEnabled} onChange={(e) => setForm({ ...form, emailEnabled: e.target.checked })} />
                Also email me
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Cancel</button>
                <button onClick={() => save()} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{saving && <Loader2 size={12} className="animate-spin" />} Set reminder</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
