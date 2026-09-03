import { useEffect, useRef, useState } from "react";
import { CalendarClock, Check } from "lucide-react";

// CR-P (15) — a modern date + time picker. Time is chosen in 15-minute steps (00/15/30/45), and the
// popover has an explicit OK to confirm. `value`/`onChange` use the native datetime-local string
// "YYYY-MM-DDTHH:mm" so it drops into the existing reminder forms unchanged.
const pad = (n: number) => String(n).padStart(2, "0");
const MINUTES = [0, 15, 30, 45];

function parse(v: string): { date: string; h: number; m: number } {
  const d = new Date(v);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return { date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, h: 9, m: 0 };
  }
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, h: d.getHours(), m: Math.floor(d.getMinutes() / 15) * 15 };
}

export default function DateTimePicker({ value, onChange, className = "" }: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => parse(value));
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const display = value && !isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "Pick date & time";

  const h12 = draft.h % 12 || 12;
  const ampm: "AM" | "PM" = draft.h < 12 ? "AM" : "PM";
  const setHour12 = (h: number) => setDraft((d) => ({ ...d, h: ampm === "PM" ? (h % 12) + 12 : h % 12 }));
  const setAmpm = (ap: "AM" | "PM") => setDraft((d) => ({ ...d, h: ap === "PM" ? (d.h % 12) + 12 : d.h % 12 }));

  const confirm = () => { if (draft.date) onChange(`${draft.date}T${pad(draft.h)}:${pad(draft.m)}`); setOpen(false); };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => { setDraft(parse(value)); setOpen((v) => !v); }}
        className={`w-full flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-left hover:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all ${className}`}
      >
        <span className={value && !isNaN(new Date(value).getTime()) ? "text-slate-800" : "text-slate-400"}>{display}</span>
        <CalendarClock size={16} className="text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-[60] mt-2 w-72 bg-white border border-slate-100 rounded-2xl shadow-2xl p-4 space-y-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Date</p>
            <input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Time</p>
            <div className="flex items-center gap-2">
              <select value={h12} onChange={(e) => setHour12(Number(e.target.value))} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="font-bold text-slate-400">:</span>
              <div className="flex gap-1">
                {MINUTES.map((m) => (
                  <button key={m} type="button" onClick={() => setDraft((d) => ({ ...d, m }))} className={`px-2.5 py-2 rounded-lg text-xs font-bold transition-all ${draft.m === m ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{pad(m)}</button>
                ))}
              </div>
              <div className="flex gap-1 ml-auto">
                {(["AM", "PM"] as const).map((ap) => (
                  <button key={ap} type="button" onClick={() => setAmpm(ap)} className={`px-2.5 py-2 rounded-lg text-xs font-bold transition-all ${ampm === ap ? "bg-primary text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{ap}</button>
                ))}
              </div>
            </div>
          </div>
          <button type="button" onClick={confirm} className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90"><Check size={15} /> OK</button>
        </div>
      )}
    </div>
  );
}
