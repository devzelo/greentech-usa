import { Fragment, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Archive, ArchiveRestore, CalendarCheck2, CheckCircle2, ChevronDown, ChevronRight, Download, Eye, FileSpreadsheet, FileText, FileUp,
  Lock, MoreVertical, Paperclip, Pencil, Plus, Printer, Search, Send, Trash2, Upload, X, XCircle, CopyPlus, Loader2,
} from "lucide-react";
import type { ApiMilestone, ApiSchedulePhase, ApiScheduleRevision, ScheduleEntryDetails, ScheduleEntryStatus } from "../../../lib/api";
import { scheduleEntryFileUrl } from "../../../lib/api";
import { fmtDay, groupByCategory, parseDate, plannedDays, wbsNumbers, daysBetween } from "../../../lib/projectSchedule";
import { criticalPath, predLabel, predsOf } from "../../../lib/scheduleLinks";
import GanttChart, { GanttLegend, type GanttZoom } from "./GanttChart";
import ToolMenu, { MENU_ITEM } from "./ToolMenu";
import ShareMenu from "../ShareMenu";

/**
 * CR 300 (2026-09-25): the schedule register, in the three tabs a scheduler works from.
 *
 *   Baseline  the schedule the client approved: B1 at the start, B2 and B3 after each approved
 *             change. A draft until it is approved, locked for good after. The latest approved one
 *             is what the job is measured against.
 *   Current   the project manager's working schedule (the editor), headed by where it stands
 *             against the baseline.
 *   History   every schedule filed, sent or received: baselines, saved versions and schedules kept
 *             as files only, newest first, with their status, client and documents.
 *
 * CR 315 to 318 (2026-09-28): the baseline workflow (draft, submitted, approved and locked, the
 * passkey to delete one), a plain Save that files nothing, "Save for submittal / history", and
 * history records that open as the schedule itself and can be made Current again.
 */

export type Entry = ApiScheduleRevision;
export const kindOf = (e: Entry) => e.kind || "revision";
/** A baseline's number as people see it: B1 for the first (one filed before CR 315 counted from 0). */
export const baselineNumber = (e: Entry) => (e.b1 ? e.baselineNo ?? 1 : (e.baselineNo ?? 0) + 1);
/** A record kept as a file only: an uploaded schedule, or a baseline made outside the platform. */
export const isFileOnly = (e: Entry) => kindOf(e) === "upload" || (kindOf(e) === "baseline" && !e.milestones?.length);
/** Approved baselines are locked: nothing about them changes again. */
export const isLocked = (e: Entry) => kindOf(e) === "baseline" && e.status === "approved";
export const entryCode = (e: Entry) => (kindOf(e) === "baseline" ? `B${baselineNumber(e)}` : kindOf(e) === "upload" ? "File" : kindOf(e) === "submittal" ? "Saved" : `Rev ${e.version}`);
export function entryTitle(e: Entry): string {
  const k = kindOf(e);
  if (k === "baseline") return e.title && !/^Baseline B\d+$/.test(e.title) ? e.title : `Baseline B${baselineNumber(e)}`;
  if (k === "upload") return e.title || e.files?.[0]?.name || "Uploaded schedule";
  if (k === "submittal") return e.title || "Saved schedule";
  const own = e.title && e.title !== `Revision ${e.version}` ? e.title : `Revision ${e.version}`;
  // A revision of one of the old separate schedules says which.
  return e.scheduleName ? `${e.scheduleName}: ${own}` : own;
}
/** A schedule's planned finish: the latest planned end among its tasks. */
export function finishOf(ms: ApiMilestone[]): Date | null {
  const ends = ms.filter((m) => m.status !== "cancelled").map((m) => parseDate(m.plannedEnd) || parseDate(m.plannedStart)).filter((d): d is Date => !!d);
  return ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
}
/** The baseline in force: the highest-numbered approved one that is not archived. */
export function currentBaseline(entries: Entry[]): Entry | null {
  const b = entries.filter((e) => isLocked(e) && !e.archived).sort((x, y) => baselineNumber(y) - baselineNumber(x));
  return b[0] || null;
}
/** The baseline still going back and forth with the client, if there is one. */
export const draftBaseline = (entries: Entry[]): Entry | null => entries.find((e) => kindOf(e) === "baseline" && !isLocked(e) && !e.archived) || null;
const when = (v?: string) => (v ? fmtDay(v.slice(0, 10)) : "");

const STATUS: Record<ScheduleEntryStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-600" },
  submitted: { label: "Submitted", cls: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-600" },
};
const KIND: Record<string, { label: string; cls: string }> = {
  baseline: { label: "Baseline", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  revision: { label: "Revision", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  upload: { label: "File", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  submittal: { label: "Saved schedule", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
};
export const StatusPill = ({ s }: { s?: ScheduleEntryStatus }) => {
  const m = STATUS[s || "draft"];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${m.cls}`}>{m.label}</span>;
};

/** What the tab does for an entry. The tab owns the PDF, the uploads and the API calls. */
export interface EntryHandlers {
  canEdit: boolean;
  preview: (e: Entry) => void;
  print: (e: Entry) => void;
  downloadPdf: (e: Entry) => void;
  downloadExcel: (e: Entry) => void;
  share: (e: Entry) => Promise<string>;
  edit: (e: Entry) => void;
  setStatus: (e: Entry, s: ScheduleEntryStatus) => void;
  archive: (e: Entry) => void;
  remove: (e: Entry) => void;
  /** CR 315 - the client approved a baseline: ask for the approval details, then lock it. */
  approve: (e: Entry) => void;
  /** CR 318 - an editable copy of this record becomes Current. */
  makeCurrent: (e: Entry) => void;
  fileName: (e: Entry) => string;
  projectName: string;
}

/** The row of actions every entry carries. `compact` folds all but Preview into the ⋮ menu. */
export function EntryActions({ e, h, compact = false }: { e: Entry; h: EntryHandlers; compact?: boolean }) {
  const file = isFileOnly(e);
  const base = kindOf(e) === "baseline";
  const locked = isLocked(e);
  const menu = (
    <>
      {compact && <button type="button" onClick={() => h.preview(e)} className={MENU_ITEM}><Eye size={13} /> Preview</button>}
      <button type="button" onClick={() => h.print(e)} className={MENU_ITEM}><Printer size={13} /> Print</button>
      <button type="button" onClick={() => h.downloadPdf(e)} className={MENU_ITEM}><Download size={13} /> {file ? "Download" : "Download PDF"}</button>
      {!file && <button type="button" onClick={() => h.downloadExcel(e)} className={MENU_ITEM}><FileSpreadsheet size={13} /> Download for Excel</button>}
      {!file && h.canEdit && <button type="button" onClick={() => h.makeCurrent(e)} className={MENU_ITEM} title="An editable copy becomes Current. This record stays as it is."><CopyPlus size={13} /> Create current schedule from this version</button>}
      {h.canEdit && (
        <>
          <div className="my-1 border-t border-slate-100" />
          {/* CR 315 - an approved baseline is locked: no details, no status, only archive and (with the passkey) delete. */}
          {!locked && <button type="button" onClick={() => h.edit(e)} className={MENU_ITEM}><Pencil size={13} /> Edit details</button>}
          {!locked && e.status !== "submitted" && <button type="button" onClick={() => h.setStatus(e, "submitted")} className={MENU_ITEM}><Send size={13} /> Mark submitted</button>}
          {!locked && base && <button type="button" onClick={() => h.approve(e)} className={MENU_ITEM}><CheckCircle2 size={13} /> Approve and lock</button>}
          {!base && e.status !== "approved" && <button type="button" onClick={() => h.setStatus(e, "approved")} className={MENU_ITEM}><CheckCircle2 size={13} /> Mark approved</button>}
          {!locked && e.status !== "rejected" && <button type="button" onClick={() => h.setStatus(e, "rejected")} className={MENU_ITEM}><XCircle size={13} /> Mark rejected</button>}
          <div className="my-1 border-t border-slate-100" />
          <button type="button" onClick={() => h.archive(e)} className={MENU_ITEM}>{e.archived ? <><ArchiveRestore size={13} /> Restore from archive</> : <><Archive size={13} /> Archive</>}</button>
          <button type="button" onClick={() => h.remove(e)} className={`${MENU_ITEM} !text-red-600 hover:!bg-red-50`}><Trash2 size={13} /> {locked ? "Delete (needs the passkey)" : "Delete"}</button>
        </>
      )}
    </>
  );
  const btn = "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary";
  return (
    <span className="inline-flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
      {!compact && <button type="button" onClick={() => h.preview(e)} className={btn}><Eye size={12} /> Preview</button>}
      <ShareMenu
        variant={compact ? "icon" : "button"}
        size={12}
        fileName={h.fileName(e)}
        fileUrl=""
        projectName={h.projectName}
        prepareFile={() => h.share(e)}
        className={compact ? "rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary" : btn}
      />
      <ToolMenu label="More actions" icon={<MoreVertical size={14} />} tone="ghost">{menu}</ToolMenu>
    </span>
  );
}

/** A frozen schedule, read only: its table, then its chart. */
export function FrozenSchedule({ milestones, categories = [], phases, contractStart, deadline, originalDeadline, zoom, baseline }: {
  milestones: ApiMilestone[]; categories?: string[]; phases?: ApiSchedulePhase[]; contractStart?: string; deadline?: string; originalDeadline?: string; zoom: GanttZoom;
  baseline?: Map<string, { s: string; e: string }>;
}) {
  const wbs = useMemo(() => wbsNumbers(milestones, categories), [milestones, categories]);
  const cpm = useMemo(() => criticalPath(milestones, { phases }), [milestones, phases]);
  const groups = useMemo(() => groupByCategory(milestones.map((m) => ({ m })), categories), [milestones, categories]);
  const grouped = categories.length > 0 || milestones.some((m) => m.category);
  const th = "px-2 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-slate-400";
  const td = "px-2 py-1 text-[11px] text-slate-700";
  return (
    <div className="space-y-3">
      <div className="max-h-80 overflow-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[720px]">
          <thead className="sticky top-0 bg-slate-50">
            <tr><th className={th}>#</th><th className={th}>Task</th><th className={th}>Type</th><th className={th}>Start</th><th className={th}>Finish</th><th className={`${th} text-right`}>Days</th><th className={th}>Predecessors</th><th className={`${th} text-right`}>Float</th><th className={`${th} text-right`}>%</th></tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.category}>
                {grouped && (
                  <tr className="border-t border-slate-100 bg-blue-50/60">
                    <td className={`${td} font-bold text-blue-700`}>{wbs.phase.get(g.category)}</td>
                    <td className={`${td} font-bold text-blue-900`} colSpan={8}>{g.category}</td>
                  </tr>
                )}
                {g.items.map(({ m }) => {
                  const ms = !!m.isMilestone;
                  const fl = cpm.float.get(m.id);
                  const crit = fl !== undefined && fl <= 0;
                  return (
                    <tr key={m.id} className="border-t border-slate-50">
                      <td className={`${td} tabular-nums text-slate-400`}>{wbs.task.get(m.id)}</td>
                      <td className={`${td} font-semibold`}>{m.name}</td>
                      <td className={td}>
                        <span className="inline-flex items-center gap-1">
                          {ms ? <span className="h-2 w-2 rotate-45 bg-slate-900" /> : <span className={`h-2 w-2 rounded-sm ${crit ? "bg-red-600" : "bg-blue-600"}`} />}
                          {ms ? "Milestone" : "Task"}
                        </span>
                      </td>
                      <td className={td}>{fmtDay(m.plannedStart) || "-"}</td>
                      <td className={td}>{ms ? "-" : fmtDay(m.plannedEnd) || "-"}</td>
                      <td className={`${td} text-right tabular-nums`}>{ms ? 0 : plannedDays(m) ?? "-"}</td>
                      <td className={`${td} tabular-nums`}>{predsOf(m).map((p) => predLabel(p, wbs.task.get(p.id) || "?")).join(", ") || "-"}</td>
                      <td className={`${td} text-right tabular-nums ${crit ? "font-bold text-red-600" : "text-slate-500"}`}>{fl === undefined ? "-" : fl}</td>
                      <td className={`${td} text-right tabular-nums`}>{m.percent ?? 0}</td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <GanttChart
        rows={milestones}
        sections={grouped ? groups.map((g) => ({ category: g.category, items: g.items.map((x) => x.m), number: wbs.phase.get(g.category) })) : undefined}
        contractStart={contractStart}
        deadline={deadline}
        originalDeadline={originalDeadline}
        zoom={zoom}
        cpm={cpm}
        numbers={wbs.task}
        baseline={baseline}
      />
      <GanttLegend />
    </div>
  );
}

// ── Baseline tab ─────────────────────────────────────────────────────────────────────────────
export function BaselineTab({ entries, h, onCreate, onUpload, frozen }: {
  entries: Entry[]; h: EntryHandlers; onCreate: () => void; onUpload: () => void;
  frozen: (e: Entry) => ReactNode;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const all = entries.filter((e) => kindOf(e) === "baseline").sort((a, b) => baselineNumber(b) - baselineNumber(a));
  const list = all.filter((e) => showArchived || !e.archived);
  const cur = currentBaseline(entries);
  const draft = draftBaseline(entries);
  const [open, setOpen] = useState<string>("");
  const act = "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900">Baselines</h3>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            The baseline is the schedule the client approved: the reference that progress and delays are measured against. It is a draft while it goes back and forth with the client, and locked once approved. A new one (B2, B3...) follows each formal change of scope.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {all.some((e) => e.archived) && (
            <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
            </label>
          )}
          {h.canEdit && (
            <>
              <button type="button" onClick={onUpload} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-primary hover:text-primary" title="A baseline made outside the platform (Primavera, MS Project): filed with its file, without a live table">
                <Upload size={13} /> Upload baseline
              </button>
              <button type="button" onClick={onCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700">
                <Plus size={13} /> {draft ? `Update draft ${entryCode(draft)} from current schedule` : "Create baseline from current schedule"}
              </button>
            </>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
          <Lock size={26} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm font-bold text-slate-800">No baseline yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">Build the first schedule in Current, then create Baseline B1 from it. It stays a draft while the client reviews it; once they approve it, it is locked, so the finished job can be compared with what was agreed.</p>
        </div>
      ) : list.map((e) => {
        const isCur = cur?._id === e._id;
        const locked = isLocked(e);
        const file = isFileOnly(e);
        const superseded = locked && !!cur && !isCur && baselineNumber(e) < baselineNumber(cur);
        const fin = finishOf(e.milestones);
        const expanded = open === e._id;
        return (
          <div key={e._id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${isCur ? "border-blue-200 ring-1 ring-blue-100" : !locked ? "border-amber-200" : "border-slate-100"} ${e.archived ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-start gap-4 px-4 py-3">
              <button type="button" onClick={() => setOpen(expanded ? "" : e._id)} className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl font-display text-lg font-bold ${isCur ? "bg-blue-600 text-white" : !locked ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`} title={expanded ? "Hide the schedule" : "Show the schedule"}>
                {entryCode(e)}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-slate-900">{entryTitle(e)}</p>
                  {isCur && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">Current approved baseline</span>}
                  <StatusPill s={e.status} />
                  {superseded && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Superseded by {entryCode(cur!)}</span>}
                  {file && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">Uploaded file</span>}
                  {e.archived && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Archived</span>}
                  {locked && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400" title="An approved baseline can be viewed, printed, shared and exported, never edited"><Lock size={10} /> Locked</span>}
                </div>
                {e.description && <p className="mt-0.5 text-xs text-slate-600">{e.description}</p>}
                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-4">
                  <div><dt className="text-slate-400">{locked ? "Approval date" : e.status === "submitted" ? "Sent to the client" : "Saved"}</dt><dd className="font-semibold text-slate-700">{(locked ? when(e.approvedAt) : e.status === "submitted" ? when(e.submittedAt) : when(e.createdAt)) || "-"}</dd></div>
                  <div><dt className="text-slate-400">Contractual completion</dt><dd className="font-semibold text-slate-700">{when(e.contractCompletion) || "-"}</dd></div>
                  <div><dt className="text-slate-400">Planned finish</dt><dd className="font-semibold text-slate-700">{fin ? fmtDay(fin) : "-"}</dd></div>
                  <div><dt className="text-slate-400">Related document</dt><dd className="truncate font-semibold text-slate-700" title={e.relatedDocument}>{e.relatedDocument || "-"}</dd></div>
                </dl>
                {/* A draft's next steps sit on the card, in the order they happen. */}
                {!locked && h.canEdit && !e.archived && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {e.status !== "submitted" && <button type="button" onClick={() => h.setStatus(e, "submitted")} className={`${act} border border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary`}><Send size={12} /> Mark sent to the client</button>}
                    <button type="button" onClick={() => h.approve(e)} className={`${act} bg-emerald-600 text-white hover:bg-emerald-700`}><CheckCircle2 size={12} /> Client approved: lock it</button>
                    <span className="text-[11px] text-slate-500">{file ? "Upload it again to replace this draft." : "To change it, edit the schedule in Current and save it as the baseline again: that replaces this draft."}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <EntryActions e={e} h={h} />
                <button type="button" onClick={() => setOpen(expanded ? "" : e._id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label={expanded ? "Hide the schedule" : "Show the schedule"}>
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              </div>
            </div>
            {expanded && <div className="border-t border-slate-100 bg-slate-50/40 p-3">{file ? <EntryFiles e={e} projectName={h.projectName} /> : frozen(e)}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** The files filed with a record. */
function EntryFiles({ e, projectName }: { e: Entry; projectName: string }) {
  const files = e.files || [];
  if (!files.length) return <p className="px-2 py-3 text-center text-xs text-slate-400">No file is attached.</p>;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
      {files.map((f) => (
        <li key={f.docId} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
          <FileText size={13} className="shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{f.name}</span>
          <span className="shrink-0 text-slate-400">{f.size}{f.uploadedAt ? ` · ${when(f.uploadedAt)}` : ""}{f.uploadedBy ? ` · ${f.uploadedBy}` : ""}</span>
          <a href={scheduleEntryFileUrl(f)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold text-slate-600 hover:bg-slate-100 hover:text-primary"><Eye size={11} /> Open</a>
          <a href={scheduleEntryFileUrl(f, true)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold text-slate-600 hover:bg-slate-100 hover:text-primary"><Download size={11} /> Download</a>
          <ShareMenu size={11} fileName={f.name} fileUrl={scheduleEntryFileUrl(f)} projectName={projectName} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-primary" />
        </li>
      ))}
    </ul>
  );
}

// ── Current tab: the header card, and the earlier revisions under the editor ──────────────────
export function CurrentSummary({ label, dataDate, finish, progress, baseline, dirty }: {
  label: string; dataDate: string; finish: Date | null; progress: number; baseline: Entry | null; dirty: boolean;
}) {
  // `dataDate` is the day Current was last saved.
  const bFinish = baseline ? finishOf(baseline.milestones) : null;
  const variance = finish && bFinish ? daysBetween(bFinish, finish) : null;
  const cell = "rounded-xl bg-slate-50 px-3 py-2";
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarCheck2 size={16} className="text-emerald-600" />
        <h3 className="font-display text-base font-bold text-slate-900">Current schedule · {label}</h3>
        {dirty && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Unsaved changes</span>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
        <div className={cell}><p className="text-slate-400">Last saved</p><p className="font-bold text-slate-800">{dataDate ? fmtDay(dataDate) : "-"}</p></div>
        <div className={cell}><p className="text-slate-400">Project completion</p><p className="font-bold text-slate-800">{finish ? fmtDay(finish) : "-"}</p></div>
        <div className={cell}>
          <p className="text-slate-400">Progress</p>
          <div className="mt-1 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} /></div><span className="font-bold text-slate-800">{progress}%</span></div>
        </div>
        <div className={cell} title={baseline ? `Planned finish ${bFinish ? fmtDay(bFinish) : "-"} in ${entryCode(baseline)}` : "Once a baseline is approved, Current is compared against it"}>
          <p className="text-slate-400">Compared to {baseline ? `baseline ${entryCode(baseline)}` : "baseline"}</p>
          <p className={`font-bold ${variance === null ? "text-slate-400" : variance > 0 ? "text-red-600" : variance < 0 ? "text-emerald-600" : "text-slate-800"}`}>
            {variance === null ? "No approved baseline yet" : variance === 0 ? "On the baseline" : `${variance > 0 ? "+" : ""}${variance} day${Math.abs(variance) === 1 ? "" : "s"}${variance > 0 ? " late" : " early"}`}
          </p>
        </div>
      </div>
    </div>
  );
}

export function EarlierRevisions({ entries, h, frozen }: { entries: Entry[]; h: EntryHandlers; frozen: (e: Entry) => ReactNode }) {
  const [openList, setOpenList] = useState(false);
  const [open, setOpen] = useState("");
  if (!entries.length) return null;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <button type="button" onClick={() => setOpenList((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        {openList ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
        <span className="font-display text-sm font-bold text-slate-900">Earlier revisions</span>
        <span className="text-[11px] font-semibold text-slate-400">{entries.length}</span>
      </button>
      {openList && (
        <div className="space-y-2 border-t border-slate-100 p-3">
          {entries.map((e) => {
            const expanded = open === e._id;
            return (
              <div key={e._id} className={`rounded-xl border border-slate-100 ${e.archived ? "opacity-70" : ""}`}>
                <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <button type="button" onClick={() => setOpen(expanded ? "" : e._id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                    <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{entryCode(e)}</span>
                    <span className="truncate text-xs font-bold text-slate-800">{entryTitle(e)}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{when(e.createdAt)}{e.savedBy ? ` · ${e.savedBy}` : ""} · {e.progress}%</span>
                    <StatusPill s={e.status} />
                  </button>
                  <EntryActions e={e} h={h} />
                </div>
                {e.note && <p className="px-9 pb-2 text-[11px] text-slate-500">{e.note}</p>}
                {expanded && <div className="border-t border-slate-100 bg-slate-50/40 p-3">{frozen(e)}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── History tab: every schedule sent or received ─────────────────────────────────────────────
export function HistoryTab({ entries, h, onUpload, currentBaselineId, frozen }: {
  entries: Entry[]; h: EntryHandlers; onUpload: () => void; currentBaselineId?: string;
  /** A record's schedule, read only: its table and its chart as saved. */
  frozen: (e: Entry) => ReactNode;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [docsOpen, setDocsOpen] = useState("");
  const [viewing, setViewing] = useState("");
  const live = entries.filter((e) => showArchived || !e.archived);
  // The day a record is filed under: the day its figures are measured to, else the day it was saved.
  const dayOf = (e: Entry) => e.dataDate || (e.createdAt || "").slice(0, 10);
  const saved = (e: Entry) => kindOf(e) === "submittal" || kindOf(e) === "revision";
  const shown = live.filter((e) => {
    if (kind !== "all" && (kind === "saved" ? !saved(e) : kindOf(e) !== kind)) return false;
    if (status !== "all" && (e.status || "draft") !== status) return false;
    if (from && dayOf(e) < from) return false;
    if (to && dayOf(e) > to) return false;
    const text = `${entryCode(e)} ${entryTitle(e)} ${e.period || ""} ${e.description || ""} ${e.note || ""} ${e.client || ""} ${e.submittedBy || ""} ${e.savedBy || ""} ${(e.files || []).map((f) => f.name).join(" ")}`.toLowerCase();
    return !q.trim() || text.includes(q.trim().toLowerCase());
  });
  const stats = [
    { label: "Total records", n: live.length, cls: "text-slate-900" },
    { label: "Baselines", n: live.filter((e) => kindOf(e) === "baseline").length, cls: "text-blue-700" },
    { label: "Saved versions", n: live.filter(saved).length, cls: "text-emerald-700" },
    { label: "Submitted", n: live.filter((e) => e.status === "submitted").length, cls: "text-amber-700" },
    { label: "Approved", n: live.filter((e) => e.status === "approved").length, cls: "text-emerald-700" },
  ];
  const th = "px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-slate-400";
  const td = "px-3 py-2 text-xs text-slate-700 align-middle";
  const sel = "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600 outline-none focus:border-primary";
  const rowBtn = "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900">Schedule history</h3>
          <p className="mt-0.5 text-xs text-slate-500">Every schedule filed, sent to or received from the client, newest first. Open one to see it exactly as it was saved.</p>
        </div>
        {h.canEdit && (
          <button type="button" onClick={onUpload} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700">
            <Upload size={13} /> Upload new schedule
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm">
            <p className={`font-display text-xl font-bold ${s.cls}`}>{s.n}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, version, period, client, person or file" className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary" />
        </label>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={sel} aria-label="Type">
          <option value="all">All types</option><option value="baseline">Baselines</option><option value="saved">Saved versions</option><option value="upload">Uploaded files</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel} aria-label="Status">
          <option value="all">Any status</option>
          {(Object.keys(STATUS) as ScheduleEntryStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
        <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">From <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={sel} aria-label="From date" /></label>
        <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">to <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={sel} aria-label="To date" /></label>
        <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[980px]">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Type</th><th className={th}>Schedule</th><th className={th}>Date</th><th className={th}>Period</th><th className={th}>Saved by</th>
              <th className={th}>Status</th><th className={th}>Client</th><th className={th}>Documents</th><th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-xs text-slate-400">{entries.length ? "Nothing matches." : "No schedules recorded yet. Each baseline, each schedule saved for submittal or history, and each uploaded schedule is listed here."}</td></tr>
            )}
            {shown.map((e) => {
              const k = KIND[kindOf(e)];
              const files = e.files || [];
              const tag = e._id === currentBaselineId ? "Current baseline" : "";
              const file = isFileOnly(e);
              const open = viewing === e._id;
              return (
                <Fragment key={e._id}>
                  <tr className={`border-t border-slate-100 hover:bg-slate-50/60 ${e.archived ? "opacity-60" : ""}`}>
                    <td className={td}><span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ${k.cls}`}>{entryCode(e)}</span></td>
                    <td className={`${td} max-w-[320px]`}>
                      <p className="flex items-center gap-1.5 font-bold text-slate-900">
                        {!file && <button type="button" onClick={() => setViewing(open ? "" : e._id)} aria-expanded={open} title={open ? "Hide the schedule" : "View the schedule as it was saved"} className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-primary">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>}
                        {isLocked(e) && <Lock size={11} className="shrink-0 text-slate-400" />}
                        <span className="truncate">{entryTitle(e)}</span>
                        {tag && <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">{tag}</span>}
                        {e.archived && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">Archived</span>}
                      </p>
                      <p className="truncate text-[11px] text-slate-500" title={e.description || e.note}>{e.description || e.note || `${k.label} · saved ${when(e.createdAt)}`}</p>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{when(dayOf(e)) || <span className="text-slate-300">-</span>}</td>
                    <td className={td}>{e.period || <span className="text-slate-300">-</span>}</td>
                    <td className={td}>{e.submittedBy || e.savedBy || <span className="text-slate-300">-</span>}</td>
                    <td className={td}><StatusPill s={e.status} /></td>
                    <td className={td}>{e.client || <span className="text-slate-300">-</span>}</td>
                    <td className={td}>
                      <button type="button" onClick={() => setDocsOpen(docsOpen === e._id ? "" : e._id)} disabled={!files.length} className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline disabled:text-slate-300 disabled:no-underline">
                        <Paperclip size={12} /> {files.length ? `View documents (${files.length})` : "None"}
                      </button>
                    </td>
                    <td className={`${td} text-right`}><EntryActions e={e} h={h} compact /></td>
                  </tr>
                  {/* CR 318 - a record, opened, is the schedule itself: table, chart, float and critical path as saved. */}
                  {open && !file && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={9} className="space-y-2 px-3 pb-3 pt-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="mr-auto inline-flex items-center gap-1 text-[11px] font-bold text-slate-500"><Lock size={11} /> Read only, exactly as saved{e.savedBy ? ` by ${e.savedBy}` : ""} on {when(e.createdAt)}</span>
                          <button type="button" onClick={() => h.preview(e)} className={rowBtn}><Eye size={12} /> Preview</button>
                          <button type="button" onClick={() => h.downloadPdf(e)} className={rowBtn}><Download size={12} /> Export PDF</button>
                          <button type="button" onClick={() => h.downloadExcel(e)} className={rowBtn}><FileSpreadsheet size={12} /> Export Excel</button>
                          {h.canEdit && <button type="button" onClick={() => h.makeCurrent(e)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700"><CopyPlus size={12} /> Create current schedule from this version</button>}
                        </div>
                        {e.note && <p className="text-[11px] text-slate-600"><b>Notes:</b> {e.note}</p>}
                        {frozen(e)}
                      </td>
                    </tr>
                  )}
                  {docsOpen === e._id && files.length > 0 && (
                    <tr className="bg-slate-50/60">
                      <td />
                      <td colSpan={8} className="px-3 pb-3">
                        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
                          {files.map((f) => (
                            <li key={f.docId} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                              <FileText size={13} className="shrink-0 text-slate-400" />
                              <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{f.name}</span>
                              <span className="shrink-0 text-slate-400">{f.size}{f.uploadedAt ? ` · ${when(f.uploadedAt)}` : ""}{f.uploadedBy ? ` · ${f.uploadedBy}` : ""}</span>
                              <a href={scheduleEntryFileUrl(f)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold text-slate-600 hover:bg-slate-100 hover:text-primary"><Eye size={11} /> Open</a>
                              <a href={scheduleEntryFileUrl(f, true)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold text-slate-600 hover:bg-slate-100 hover:text-primary"><Download size={11} /> Download</a>
                              <ShareMenu size={11} fileName={f.name} fileUrl={scheduleEntryFileUrl(f)} projectName={h.projectName} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-primary" />
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── The one dialog for creating a baseline, uploading a schedule, and editing any entry ──────
export type EntryDialogMode = { mode: "baseline" } | { mode: "baseline-upload" } | { mode: "upload" } | { mode: "edit"; entry: Entry };
export function EntryDialog({ state, defaults, onSubmit, onClose }: {
  state: EntryDialogMode;
  /** `draft` is the baseline still with the client, which a new save replaces. */
  defaults: { client: string; contractCompletion: string; nextBaseline: number; draft: Entry | null };
  onSubmit: (details: ScheduleEntryDetails, newFiles: File[], keepFiles: string[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const e = state.mode === "edit" ? state.entry : null;
  const newBase = state.mode === "baseline" || state.mode === "baseline-upload";
  const needFile = state.mode === "upload" || state.mode === "baseline-upload";
  const kind = e ? kindOf(e) : newBase ? "baseline" : "upload";
  const today = new Date().toISOString().slice(0, 10);
  const d = defaults.draft;
  const [f, setF] = useState<ScheduleEntryDetails>(() => e ? {
    title: entryTitle(e), description: e.description || "", status: e.status || "draft", approvedAt: e.approvedAt || "", contractCompletion: e.contractCompletion || "",
    submittedAt: e.submittedAt || "", dataDate: e.dataDate || "", client: e.client || "", relatedDocument: e.relatedDocument || "",
  } : newBase ? {
    // A draft in hand keeps its details; the first baseline is named for what it is.
    title: d ? entryTitle(d) : defaults.nextBaseline === 1 ? "Original schedule" : "", description: d?.description || "",
    contractCompletion: d?.contractCompletion || defaults.contractCompletion, client: d?.client || defaults.client, relatedDocument: d?.relatedDocument || "",
  } : {
    title: "", description: "", status: "submitted", submittedAt: today, client: defaults.client, relatedDocument: "", dataDate: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [keep, setKeep] = useState<string[]>(() => (e?.files || []).map((x) => x.docId));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));
  const inp = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20";
  const lbl = "text-[10px] font-bold uppercase tracking-widest text-slate-400";
  const code = d ? entryCode(d) : `B${defaults.nextBaseline}`;
  const heading = state.mode === "baseline" ? (d ? `Update draft baseline ${code}` : `Create baseline ${code} from current schedule`)
    : state.mode === "baseline-upload" ? (d ? `Replace draft baseline ${code} with a file` : `Upload baseline ${code}`)
    : state.mode === "upload" ? "Upload a schedule" : `Edit ${entryCode(e!)} details`;
  const submit = async () => {
    if (needFile && !files.length) return;
    setBusy(true);
    try { if (await onSubmit(f, files, keep)) onClose(); } finally { setBusy(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="my-12 w-full max-w-xl rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">{kind === "baseline" ? <CalendarCheck2 size={15} className="text-blue-600" /> : kind === "upload" ? <FileUp size={15} className="text-violet-600" /> : <Pencil size={15} className="text-emerald-600" />} {heading}</p>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-5">
          {newBase && (
            <p className="rounded-xl bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
              {state.mode === "baseline"
                ? "The current schedule is copied as a draft baseline. Send it to the client; if they ask for changes, edit Current and save it as the baseline again."
                : "For a baseline made outside the platform (Primavera, MS Project): it is filed with its file, without a live table."}
              {d ? <b> This replaces draft {code}: the earlier round is not kept.</b> : " Once the client approves it, it is locked."}
            </p>
          )}
          {state.mode === "edit" && kind === "baseline" && (
            <p className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-600"><Pencil size={12} /> These are the draft's details. Its tasks and dates are changed by saving Current as the baseline again.</p>
          )}
          <label className="block space-y-1">
            <span className={lbl}>Title</span>
            <input autoFocus value={f.title || ""} onChange={(ev) => set({ title: ev.target.value })} placeholder={kind === "baseline" ? "e.g. Modification 02 - Additional scope & 30-day extension" : kind === "upload" ? "e.g. Monthly update, September" : ""} className={inp} />
          </label>
          <label className="block space-y-1">
            <span className={lbl}>Description</span>
            <textarea value={f.description || ""} onChange={(ev) => set({ description: ev.target.value })} rows={2} className={inp} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {/* A baseline's status moves by its own steps (sent, approved), never from a list. */}
            {kind !== "baseline" && (
              <label className="block space-y-1">
                <span className={lbl}>Status</span>
                <select value={f.status || "draft"} onChange={(ev) => set({ status: ev.target.value as ScheduleEntryStatus })} className={inp}>
                  {(Object.keys(STATUS) as ScheduleEntryStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
                </select>
              </label>
            )}
            <label className="block space-y-1">
              <span className={lbl}>Client</span>
              <input value={f.client || ""} onChange={(ev) => set({ client: ev.target.value })} className={inp} />
            </label>
            {kind === "baseline" ? (
              <label className="block space-y-1"><span className={lbl}>Contractual completion</span><input type="date" value={f.contractCompletion || ""} onChange={(ev) => set({ contractCompletion: ev.target.value })} className={inp} /></label>
            ) : (
              <>
                <label className="block space-y-1"><span className={lbl}>Submission date</span><input type="date" value={f.submittedAt || ""} onChange={(ev) => set({ submittedAt: ev.target.value })} className={inp} /></label>
                <label className="block space-y-1"><span className={lbl}>Data date</span><input type="date" value={f.dataDate || ""} onChange={(ev) => set({ dataDate: ev.target.value })} className={inp} /></label>
                {f.status === "approved" && <label className="col-span-2 block space-y-1"><span className={lbl}>Approval date</span><input type="date" value={f.approvedAt || ""} onChange={(ev) => set({ approvedAt: ev.target.value })} className={inp} /></label>}
              </>
            )}
          </div>
          <label className="block space-y-1">
            <span className={lbl}>Related document</span>
            <input value={f.relatedDocument || ""} onChange={(ev) => set({ relatedDocument: ev.target.value })} placeholder="e.g. Modification 02, RFI-014, transmittal no." className={inp} />
          </label>
          <div className="space-y-1">
            <span className={lbl}>{needFile ? (newBase ? "Baseline file" : "Schedule file") : "Files"}</span>
            {e && (e.files || []).length > 0 && (
              <ul className="space-y-1">
                {(e.files || []).map((x) => (
                  <li key={x.docId} className={`flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1 text-[11px] ${keep.includes(x.docId) ? "" : "line-through opacity-50"}`}>
                    <FileText size={12} className="text-slate-400" /><span className="min-w-0 flex-1 truncate">{x.name}</span>
                    <button type="button" onClick={() => setKeep((k) => (k.includes(x.docId) ? k.filter((y) => y !== x.docId) : [...k, x.docId]))} className="font-bold text-slate-500 hover:text-red-600">{keep.includes(x.docId) ? "Remove" : "Keep"}</button>
                  </li>
                ))}
              </ul>
            )}
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((x, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-2 py-1 text-[11px]">
                    <FileUp size={12} className="text-emerald-600" /><span className="min-w-0 flex-1 truncate">{x.name}</span>
                    <button type="button" onClick={() => setFiles((p) => p.filter((_, k) => k !== i))} className="font-bold text-slate-500 hover:text-red-600">Remove</button>
                  </li>
                ))}
              </ul>
            )}
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-xs font-bold text-slate-500 hover:border-primary hover:text-primary">
              <Paperclip size={13} /> {needFile ? "Choose the schedule file (PDF, Excel, P6, MS Project)" : "Attach files (transmittal, approval letter...)"}
              <input type="file" multiple className="hidden" onChange={(ev) => { const list = Array.from(ev.target.files || []); if (list.length) setFiles((p) => [...p, ...list]); ev.target.value = ""; }} />
            </label>
            {state.mode === "baseline" && <p className="text-[10px] text-slate-400">A PDF of the baseline is filed with it automatically.</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={busy || (needFile && !files.length)} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy && <Loader2 size={13} className="animate-spin" />}
            {newBase ? <>{state.mode === "baseline" ? <Plus size={13} /> : <Upload size={13} />} {d ? `Replace draft ${code}` : `Save as draft ${code}`}</> : state.mode === "upload" ? <><Upload size={13} /> Add to history</> : "Save details"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
