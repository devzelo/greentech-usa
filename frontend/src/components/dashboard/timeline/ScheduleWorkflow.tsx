import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BookmarkCheck, CheckCircle2, FileUp, KeyRound, Loader2, Lock, Paperclip, X } from "lucide-react";
import { fetchClassifiedAccess, type ApiScheduleRevision } from "../../../lib/api";
import { fmtDay, toIso } from "../../../lib/projectSchedule";
import { entryCode, entryTitle, kindOf } from "./ScheduleRegister";

/**
 * CR 315 to 318 (2026-09-28): the dialogs of the schedule's workflow.
 *
 *   Approve a baseline            the approval date and the contractual completion, then it is locked
 *   Passkey                       deleting a locked baseline asks for the passkey
 *   Save for submittal / history  a dated snapshot of Current, titled by week, by month or one-off
 */

const inp = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20";
const lbl = "text-[10px] font-bold uppercase tracking-widest text-slate-400";

function Shell({ title, icon, onClose, children, footer, width = "max-w-lg" }: { title: string; icon: ReactNode; onClose: () => void; children: ReactNode; footer: ReactNode; width?: string }) {
  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`my-12 w-full ${width} rounded-3xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">{icon} {title}</p>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}
const cancelBtn = "rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50";
const goBtn = "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50";

// ── Approve a baseline ──
export interface ApproveDetails { approvedAt: string; contractCompletion: string; relatedDocument: string; copyToCurrent: boolean }
export function ApproveDialog({ entry, contractCompletion, differs, unsaved, onSubmit, onClose }: {
  entry: ApiScheduleRevision;
  contractCompletion: string;
  /** Current no longer holds the schedule this baseline froze. */
  differs: boolean;
  unsaved: boolean;
  onSubmit: (d: ApproveDetails, files: File[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const [f, setF] = useState<ApproveDetails>({ approvedAt: toIso(new Date()), contractCompletion: entry.contractCompletion || contractCompletion, relatedDocument: entry.relatedDocument || "", copyToCurrent: true });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const hasTable = entry.milestones.length > 0;
  const go = async () => { setBusy(true); try { if (await onSubmit({ ...f, copyToCurrent: f.copyToCurrent && differs && hasTable }, files)) onClose(); } finally { setBusy(false); } };
  return (
    <Shell title={`Approve baseline ${entryCode(entry)}`} icon={<CheckCircle2 size={15} className="text-emerald-600" />} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={cancelBtn}>Cancel</button>
        <button type="button" onClick={() => void go()} disabled={busy || !f.approvedAt} className={`${goBtn} bg-emerald-600 hover:bg-emerald-700`}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />} Approve and lock</button>
      </>}>
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
        Once approved, <b>{entryCode(entry)} · {entryTitle(entry)}</b> is locked: it can be viewed, printed, shared and exported, and never edited. Deleting it needs the passkey.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1"><span className={lbl}>Approval date *</span><input type="date" value={f.approvedAt} onChange={(ev) => setF({ ...f, approvedAt: ev.target.value })} className={inp} /></label>
        <label className="block space-y-1"><span className={lbl}>Contractual completion</span><input type="date" value={f.contractCompletion} onChange={(ev) => setF({ ...f, contractCompletion: ev.target.value })} className={inp} /></label>
      </div>
      <label className="block space-y-1">
        <span className={lbl}>Related document</span>
        <input value={f.relatedDocument} onChange={(ev) => setF({ ...f, relatedDocument: ev.target.value })} placeholder="e.g. the client's approval letter, transmittal no." className={inp} />
      </label>
      <div className="space-y-1">
        <span className={lbl}>Approval letter (optional)</span>
        {files.map((x, i) => (
          <p key={i} className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-2 py-1 text-[11px]">
            <FileUp size={12} className="text-emerald-600" /><span className="min-w-0 flex-1 truncate">{x.name}</span>
            <button type="button" onClick={() => setFiles((p) => p.filter((_, k) => k !== i))} className="font-bold text-slate-500 hover:text-red-600">Remove</button>
          </p>
        ))}
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs font-bold text-slate-500 hover:border-primary hover:text-primary">
          <Paperclip size={13} /> Attach a file
          <input type="file" multiple className="hidden" onChange={(ev) => { const list = Array.from<File>(ev.target.files || []); if (list.length) setFiles((p) => [...p, ...list]); ev.target.value = ""; }} />
        </label>
      </div>
      {hasTable && differs && (
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[11px] text-slate-700">
          <input type="checkbox" checked={f.copyToCurrent} onChange={(ev) => setF({ ...f, copyToCurrent: ev.target.checked })} className="mt-0.5 accent-blue-600" />
          <span>
            <b>Start Current again from this baseline.</b> Current has changed since this baseline was made. Ticked, Current becomes an editable copy of the approved baseline, and what it holds now is filed in History first.
            {unsaved && <span className="mt-0.5 block font-bold text-amber-700">Edits not yet saved in Current are not part of that record.</span>}
          </span>
        </label>
      )}
      {hasTable && !differs && <p className="text-[11px] text-slate-500">Current already holds this schedule, so it carries on from the approved baseline as it is.</p>}
    </Shell>
  );
}

// ── The passkey ──
export function PasskeyDialog({ entry, onSubmit, onClose }: { entry: ApiScheduleRevision; onSubmit: (passkey: string) => Promise<boolean>; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  // Whether a passkey exists at all; until one is set only an administrator may delete.
  const [access, setAccess] = useState<{ hasPin: boolean; isAdmin: boolean } | null>(null);
  useEffect(() => { fetchClassifiedAccess().then((a) => setAccess({ hasPin: a.hasPin, isAdmin: a.isAdmin })).catch(() => setAccess({ hasPin: true, isAdmin: false })); }, []);
  const noKey = !!access && !access.hasPin;
  const stuck = noKey && !access!.isAdmin;
  const go = async () => { setBusy(true); try { if (await onSubmit(pin)) onClose(); else setPin(""); } finally { setBusy(false); } };
  return (
    <Shell title={`Delete locked baseline ${entryCode(entry)}`} icon={<KeyRound size={15} className="text-red-600" />} onClose={onClose} width="max-w-sm"
      footer={<>
        <button type="button" onClick={onClose} className={cancelBtn}>Cancel</button>
        <button type="button" onClick={() => void go()} disabled={busy || !access || stuck || (!noKey && pin.length < 4)} className={`${goBtn} bg-red-600 hover:bg-red-700`}>{busy && <Loader2 size={13} className="animate-spin" />} Delete baseline</button>
      </>}>
      <p className="text-xs text-slate-600"><b>{entryCode(entry)} · {entryTitle(entry)}</b> is an approved, locked baseline. It goes to the Recycle Bin, where it can be restored; its files stay in Schedule files.</p>
      {stuck ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">No passkey has been set yet. An administrator sets it on the Classified Documents page, or can delete this baseline themselves.</p>
      ) : noKey ? (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-600">No passkey has been set yet, so only an administrator can delete a locked baseline. Set one on the Classified Documents page to let project managers do it.</p>
      ) : (
        <label className="block space-y-1">
          <span className={lbl}>Passkey</span>
          <input type="password" inputMode="numeric" autoComplete="off" autoFocus value={pin} onChange={(ev) => setPin(ev.target.value.replace(/\D/g, "").slice(0, 12))} onKeyDown={(ev) => { if (ev.key === "Enter" && pin.length >= 4) void go(); }} placeholder="The PIN used for classified documents" className={inp} />
        </label>
      )}
    </Shell>
  );
}

// ── Save for submittal / history ──
export type Cadence = "weekly" | "monthly" | "oneoff";
export interface SubmittalDetails { title: string; period: string; cadence: Cadence; seq: number; note: string; submittedToClient: boolean; dataDate: string }
const CADENCES: Array<{ v: Cadence; label: string; hint: string }> = [
  { v: "weekly", label: "Weekly", hint: "Week 1, Week 2..." },
  { v: "monthly", label: "Monthly", hint: "By month" },
  { v: "oneoff", label: "One-off", hint: "Update 1, 2..." },
];
const iso = (d: Date) => toIso(d);
const monday = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
const local = (v: string) => { const [y, m, d] = v.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };

export function SubmittalDialog({ entries, unsaved, onSubmit, onClose }: {
  /** The register, to carry on the rhythm and the numbering from the last record. */
  entries: ApiScheduleRevision[];
  unsaved: boolean;
  onSubmit: (d: SubmittalDetails) => Promise<boolean>;
  onClose: () => void;
}) {
  const past = useMemo(() => entries.filter((e) => kindOf(e) === "submittal" && !!e.cadence && (e.seq || 0) > 0), [entries]);
  const nextSeq = (c: Cadence) => past.filter((e) => e.cadence === c).reduce((n, e) => Math.max(n, e.seq || 0), 0) + 1;
  const today = new Date();
  // The PM picks the rhythm once; after that it follows the last record.
  const [cadence, setCadence] = useState<Cadence>(() => (past[0]?.cadence as Cadence) || "weekly");
  const [week, setWeek] = useState(iso(monday(today)));
  const [month, setMonth] = useState(iso(today).slice(0, 7));
  const [day, setDay] = useState(iso(today));
  const [seq, setSeq] = useState(() => nextSeq((past[0]?.cadence as Cadence) || "weekly"));
  const [title, setTitle] = useState("");
  const [typed, setTyped] = useState(false);
  const [note, setNote] = useState("");
  const [toClient, setToClient] = useState(false);
  const [busy, setBusy] = useState(false);

  const monthName = (() => { const d = local(`${month}-01`); return isNaN(d.getTime()) ? month : d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }); })();
  const auto = cadence === "weekly" ? `Week ${seq} update` : cadence === "monthly" ? `${monthName} update` : `Update ${seq}`;
  const shown = typed ? title : auto;
  const weekEnd = (() => { const s = local(week); return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6); })();
  const period = cadence === "weekly" ? `${fmtDay(week)} to ${fmtDay(iso(weekEnd))}` : cadence === "monthly" ? monthName : fmtDay(day);
  const pick = (c: Cadence) => { setCadence(c); setSeq(nextSeq(c)); setTyped(false); };
  const go = async () => {
    setBusy(true);
    try {
      const dataDate = cadence === "oneoff" ? day : iso(today);
      if (await onSubmit({ title: shown.trim() || auto, period, cadence, seq, note: note.trim(), submittedToClient: toClient, dataDate })) onClose();
    } finally { setBusy(false); }
  };
  return (
    <Shell title="Save for submittal / history" icon={<BookmarkCheck size={15} className="text-blue-600" />} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={cancelBtn}>Cancel</button>
        <button type="button" onClick={() => void go()} disabled={busy || !shown.trim()} className={`${goBtn} bg-blue-600 hover:bg-blue-700`}>{busy ? <Loader2 size={13} className="animate-spin" /> : <BookmarkCheck size={13} />} Save to history</button>
      </>}>
      <p className="rounded-xl bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
        A locked, dated copy of the current schedule is filed in History. Current itself carries on as it is.{unsaved ? " Your unsaved edits are saved first." : ""}
      </p>
      <div className="space-y-1">
        <span className={lbl}>How often</span>
        <div className="grid grid-cols-3 gap-1.5">
          {CADENCES.map((c) => (
            <button key={c.v} type="button" onClick={() => pick(c.v)} aria-pressed={cadence === c.v} className={`rounded-xl border px-2 py-1.5 text-left ${cadence === c.v ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:border-primary"}`}>
              <span className={`block text-xs font-bold ${cadence === c.v ? "text-blue-700" : "text-slate-700"}`}>{c.label}</span>
              <span className="block text-[10px] text-slate-400">{c.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <label className="block space-y-1">
          <span className={lbl}>Schedule title / version</span>
          <input value={shown} onChange={(ev) => { setTyped(true); setTitle(ev.target.value); }} className={inp} />
        </label>
        {cadence !== "monthly" && (
          <label className="block space-y-1">
            <span className={lbl}>{cadence === "weekly" ? "Week no." : "Update no."}</span>
            <input type="number" min={1} step={1} value={seq || ""} onChange={(ev) => { setSeq(Math.max(1, Math.round(Number(ev.target.value) || 1))); setTyped(false); }} className={inp} />
          </label>
        )}
      </div>
      <label className="block space-y-1">
        <span className={lbl}>{cadence === "weekly" ? "Reporting period: week starting" : cadence === "monthly" ? "Reporting period: month" : "Date"}</span>
        {cadence === "weekly" ? <input type="date" value={week} onChange={(ev) => setWeek(ev.target.value || week)} className={inp} />
          : cadence === "monthly" ? <input type="month" value={month} onChange={(ev) => { setMonth(ev.target.value || month); setTyped(false); }} className={inp} />
          : <input type="date" value={day} onChange={(ev) => setDay(ev.target.value || day)} className={inp} />}
        <span className="block text-[11px] text-slate-500">Filed as: <b className="text-slate-700">{period}</b></span>
      </label>
      <label className="block space-y-1">
        <span className={lbl}>Notes</span>
        <textarea value={note} onChange={(ev) => setNote(ev.target.value)} rows={2} maxLength={500} placeholder="What changed, what the client should know" className={inp} />
      </label>
      <div className="space-y-1">
        <span className={lbl}>Submitted to client</span>
        <div className="flex gap-1.5">
          {[[true, "Yes"], [false, "No"]].map(([v, l]) => (
            <button key={String(l)} type="button" onClick={() => setToClient(v as boolean)} aria-pressed={toClient === v} className={`rounded-lg border px-4 py-1.5 text-xs font-bold ${toClient === v ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-primary"}`}>{l as string}</button>
          ))}
        </div>
      </div>
    </Shell>
  );
}
