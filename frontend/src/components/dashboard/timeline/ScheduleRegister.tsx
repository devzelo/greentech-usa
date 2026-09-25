import { Fragment, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Archive, ArchiveRestore, CalendarCheck2, CheckCircle2, ChevronDown, ChevronRight, Download, Eye, FileSpreadsheet, FileText, FileUp,
  Lock, MoreVertical, Paperclip, Pencil, Plus, Printer, Search, Send, Trash2, Upload, X, XCircle, FolderOpen, Loader2,
} from "lucide-react";
import type { ApiMilestone, ApiScheduleRevision, ScheduleEntryDetails, ScheduleEntryStatus } from "../../../lib/api";
import { scheduleEntryFileUrl } from "../../../lib/api";
import { fmtDay, groupByCategory, parseDate, plannedDays, wbsNumbers, daysBetween } from "../../../lib/projectSchedule";
import { criticalPath, predLabel, predsOf } from "../../../lib/scheduleLinks";
import GanttChart, { GanttLegend, type GanttZoom } from "./GanttChart";
import ToolMenu, { MENU_ITEM } from "./ToolMenu";
import ShareMenu from "../ShareMenu";

/**
 * CR 300 (2026-09-25): the schedule register, in the three tabs a scheduler works from.
 *
 *   Baseline  the approved schedules, frozen: B0 at the start, B1 and B2 after each approved change.
 *             The latest one is what the job is measured against. Their tasks can never be edited.
 *   Current   the live schedule (the editor), headed by where it stands against the baseline, with
 *             the earlier revisions below it.
 *   History   every schedule sent or received: baselines, revisions and schedules kept as files
 *             only, newest first, with their status, client and documents.
 *
 * Every entry has the same actions wherever it is shown: Preview, Print, Export, Share, Edit,
 * Archive and Delete.
 */

export type Entry = ApiScheduleRevision;
export const kindOf = (e: Entry) => e.kind || "revision";
export const entryCode = (e: Entry) => (kindOf(e) === "baseline" ? `B${e.baselineNo ?? 0}` : kindOf(e) === "upload" ? "File" : `Rev ${e.version}`);
export function entryTitle(e: Entry): string {
  const k = kindOf(e);
  if (k === "baseline") return e.title && e.title !== `Baseline B${e.baselineNo ?? 0}` ? e.title : `Baseline B${e.baselineNo ?? 0}`;
  if (k === "upload") return e.title || e.files?.[0]?.name || "Uploaded schedule";
  return e.title && e.title !== `Revision ${e.version}` ? e.title : `Revision ${e.version}`;
}
/** A schedule's planned finish: the latest planned end among its tasks. */
export function finishOf(ms: ApiMilestone[]): Date | null {
  const ends = ms.filter((m) => m.status !== "cancelled").map((m) => parseDate(m.plannedEnd) || parseDate(m.plannedStart)).filter((d): d is Date => !!d);
  return ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
}
/** The baseline in force: the highest-numbered one not archived, an approved one before any other. */
export function currentBaseline(entries: Entry[]): Entry | null {
  const b = entries.filter((e) => kindOf(e) === "baseline" && !e.archived).sort((x, y) => (y.baselineNo ?? 0) - (x.baselineNo ?? 0));
  return b.find((e) => (e.status || "approved") === "approved") || b[0] || null;
}
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
  load?: (e: Entry) => void;
  fileName: (e: Entry) => string;
  projectName: string;
}

/** The row of actions every entry carries. `compact` folds all but Preview into the ⋮ menu. */
export function EntryActions({ e, h, compact = false }: { e: Entry; h: EntryHandlers; compact?: boolean }) {
  const file = kindOf(e) === "upload";
  const menu = (
    <>
      {compact && <button type="button" onClick={() => h.preview(e)} className={MENU_ITEM}><Eye size={13} /> Preview</button>}
      <button type="button" onClick={() => h.print(e)} className={MENU_ITEM}><Printer size={13} /> Print</button>
      <button type="button" onClick={() => h.downloadPdf(e)} className={MENU_ITEM}><Download size={13} /> {file ? "Download" : "Download PDF"}</button>
      {!file && <button type="button" onClick={() => h.downloadExcel(e)} className={MENU_ITEM}><FileSpreadsheet size={13} /> Download for Excel</button>}
      {kindOf(e) === "revision" && h.load && h.canEdit && <button type="button" onClick={() => h.load!(e)} className={MENU_ITEM}><FolderOpen size={13} /> Load into the editor</button>}
      {h.canEdit && (
        <>
          <div className="my-1 border-t border-slate-100" />
          <button type="button" onClick={() => h.edit(e)} className={MENU_ITEM}><Pencil size={13} /> Edit details</button>
          {e.status !== "submitted" && <button type="button" onClick={() => h.setStatus(e, "submitted")} className={MENU_ITEM}><Send size={13} /> Mark submitted</button>}
          {e.status !== "approved" && <button type="button" onClick={() => h.setStatus(e, "approved")} className={MENU_ITEM}><CheckCircle2 size={13} /> Mark approved</button>}
          {e.status !== "rejected" && <button type="button" onClick={() => h.setStatus(e, "rejected")} className={MENU_ITEM}><XCircle size={13} /> Mark rejected</button>}
          <div className="my-1 border-t border-slate-100" />
          <button type="button" onClick={() => h.archive(e)} className={MENU_ITEM}>{e.archived ? <><ArchiveRestore size={13} /> Restore from archive</> : <><Archive size={13} /> Archive</>}</button>
          <button type="button" onClick={() => h.remove(e)} className={`${MENU_ITEM} !text-red-600 hover:!bg-red-50`}><Trash2 size={13} /> Delete</button>
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
export function FrozenSchedule({ milestones, categories = [], contractStart, deadline, originalDeadline, zoom, baseline }: {
  milestones: ApiMilestone[]; categories?: string[]; contractStart?: string; deadline?: string; originalDeadline?: string; zoom: GanttZoom;
  baseline?: Map<string, { s: string; e: string }>;
}) {
  const wbs = useMemo(() => wbsNumbers(milestones, categories), [milestones, categories]);
  const cpm = useMemo(() => criticalPath(milestones), [milestones]);
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
                          {ms ? <span className="h-2 w-2 rotate-45 bg-red-500" /> : <span className={`h-2 w-2 rounded-sm ${crit ? "bg-red-500" : "bg-emerald-500"}`} />}
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
export function BaselineTab({ entries, h, onCreate, frozen }: {
  entries: Entry[]; h: EntryHandlers; onCreate: () => void;
  frozen: (e: Entry) => ReactNode;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const all = entries.filter((e) => kindOf(e) === "baseline").sort((a, b) => (b.baselineNo ?? 0) - (a.baselineNo ?? 0));
  const list = all.filter((e) => showArchived || !e.archived);
  const cur = currentBaseline(entries);
  const [open, setOpen] = useState<string>("");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900">Baselines</h3>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            A baseline is the approved schedule, frozen and kept as the reference. The first goes to the client for approval at the start; a new one follows each approved change. The current schedule is measured against the latest.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {all.some((e) => e.archived) && (
            <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
            </label>
          )}
          {h.canEdit && (
            <button type="button" onClick={onCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700">
              <Plus size={13} /> Create new baseline
            </button>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
          <Lock size={26} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm font-bold text-slate-800">No baseline yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">Once the schedule is agreed, freeze it as Baseline B0. It never changes after that, so the finished job can be compared with what was approved.</p>
        </div>
      ) : list.map((e) => {
        const isCur = cur?._id === e._id;
        const fin = finishOf(e.milestones);
        const expanded = open === e._id;
        return (
          <div key={e._id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${isCur ? "border-blue-200 ring-1 ring-blue-100" : "border-slate-100"} ${e.archived ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-start gap-4 px-4 py-3">
              <button type="button" onClick={() => setOpen(expanded ? "" : e._id)} className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl font-display text-lg font-bold ${isCur ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`} title={expanded ? "Hide the schedule" : "Show the schedule"}>
                {entryCode(e)}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-slate-900">{entryTitle(e)}</p>
                  {isCur && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">Current approved baseline</span>}
                  <StatusPill s={e.status} />
                  {e.archived && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Archived</span>}
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400" title="A baseline's tasks and dates can never be edited"><Lock size={10} /> Locked</span>
                </div>
                {e.description && <p className="mt-0.5 text-xs text-slate-600">{e.description}</p>}
                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-4">
                  <div><dt className="text-slate-400">Approval date</dt><dd className="font-semibold text-slate-700">{when(e.approvedAt) || "-"}</dd></div>
                  <div><dt className="text-slate-400">Contractual completion</dt><dd className="font-semibold text-slate-700">{when(e.contractCompletion) || "-"}</dd></div>
                  <div><dt className="text-slate-400">Planned finish</dt><dd className="font-semibold text-slate-700">{fin ? fmtDay(fin) : "-"}</dd></div>
                  <div><dt className="text-slate-400">Related document</dt><dd className="truncate font-semibold text-slate-700" title={e.relatedDocument}>{e.relatedDocument || "-"}</dd></div>
                </dl>
              </div>
              <div className="flex items-center gap-1">
                <EntryActions e={e} h={h} />
                <button type="button" onClick={() => setOpen(expanded ? "" : e._id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label={expanded ? "Hide the schedule" : "Show the schedule"}>
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              </div>
            </div>
            {expanded && <div className="border-t border-slate-100 bg-slate-50/40 p-3">{frozen(e)}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Current tab: the header card, and the earlier revisions under the editor ──────────────────
export function CurrentSummary({ label, dataDate, finish, progress, baseline, dirty }: {
  label: string; dataDate: string; finish: Date | null; progress: number; baseline: Entry | null; dirty: boolean;
}) {
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
        <div className={cell}><p className="text-slate-400">Data date</p><p className="font-bold text-slate-800">{dataDate ? fmtDay(dataDate) : "-"}</p></div>
        <div className={cell}><p className="text-slate-400">Project completion</p><p className="font-bold text-slate-800">{finish ? fmtDay(finish) : "-"}</p></div>
        <div className={cell}>
          <p className="text-slate-400">Progress</p>
          <div className="mt-1 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} /></div><span className="font-bold text-slate-800">{progress}%</span></div>
        </div>
        <div className={cell} title={baseline ? `Planned finish ${bFinish ? fmtDay(bFinish) : "-"} in ${entryCode(baseline)}` : "Freeze a baseline to compare against it"}>
          <p className="text-slate-400">Compared to {baseline ? `baseline ${entryCode(baseline)}` : "baseline"}</p>
          <p className={`font-bold ${variance === null ? "text-slate-400" : variance > 0 ? "text-red-600" : variance < 0 ? "text-emerald-600" : "text-slate-800"}`}>
            {variance === null ? "No baseline yet" : variance === 0 ? "On the baseline" : `${variance > 0 ? "+" : ""}${variance} day${Math.abs(variance) === 1 ? "" : "s"}${variance > 0 ? " late" : " early"}`}
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
export function HistoryTab({ entries, h, onUpload, currentRevisionId, currentBaselineId }: {
  entries: Entry[]; h: EntryHandlers; onUpload: () => void; currentRevisionId?: string; currentBaselineId?: string;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [docsOpen, setDocsOpen] = useState("");
  const live = entries.filter((e) => showArchived || !e.archived);
  const shown = live.filter((e) => {
    if (kind !== "all" && kindOf(e) !== kind) return false;
    if (status !== "all" && (e.status || "draft") !== status) return false;
    const text = `${entryCode(e)} ${entryTitle(e)} ${e.description || ""} ${e.note || ""} ${e.client || ""} ${e.submittedBy || ""} ${e.savedBy || ""} ${(e.files || []).map((f) => f.name).join(" ")}`.toLowerCase();
    return !q.trim() || text.includes(q.trim().toLowerCase());
  });
  const stats = [
    { label: "Total records", n: live.length, cls: "text-slate-900" },
    { label: "Baselines", n: live.filter((e) => kindOf(e) === "baseline").length, cls: "text-blue-700" },
    { label: "Revisions", n: live.filter((e) => kindOf(e) === "revision").length, cls: "text-emerald-700" },
    { label: "Submitted", n: live.filter((e) => e.status === "submitted").length, cls: "text-amber-700" },
    { label: "Approved", n: live.filter((e) => e.status === "approved").length, cls: "text-emerald-700" },
  ];
  const th = "px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-slate-400";
  const td = "px-3 py-2 text-xs text-slate-700 align-middle";
  const sel = "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600 outline-none focus:border-primary";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900">Schedule history</h3>
          <p className="mt-0.5 text-xs text-slate-500">Every schedule sent to or received from the client, newest first, with the files that went with it.</p>
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, client, person or file" className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary" />
        </label>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={sel} aria-label="Type">
          <option value="all">All types</option><option value="baseline">Baselines</option><option value="revision">Revisions</option><option value="upload">Files</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel} aria-label="Status">
          <option value="all">Any status</option>
          {(Object.keys(STATUS) as ScheduleEntryStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[900px]">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Type</th><th className={th}>Schedule</th><th className={th}>Submitted</th><th className={th}>Submitted by</th>
              <th className={th}>Status</th><th className={th}>Client</th><th className={th}>Documents</th><th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-xs text-slate-400">{entries.length ? "Nothing matches." : "No schedules recorded yet. Each Save, each baseline and each uploaded schedule is listed here."}</td></tr>
            )}
            {shown.map((e) => {
              const k = KIND[kindOf(e)];
              const files = e.files || [];
              const tag = e._id === currentRevisionId ? "Current" : e._id === currentBaselineId ? "Current baseline" : "";
              return (
                <Fragment key={e._id}>
                  <tr className={`border-t border-slate-100 hover:bg-slate-50/60 ${e.archived ? "opacity-60" : ""}`}>
                    <td className={td}><span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ${k.cls}`}>{entryCode(e)}</span></td>
                    <td className={`${td} max-w-[320px]`}>
                      <p className="flex items-center gap-1.5 font-bold text-slate-900">
                        <span className="truncate">{entryTitle(e)}</span>
                        {tag && <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">{tag}</span>}
                        {e.archived && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">Archived</span>}
                      </p>
                      <p className="truncate text-[11px] text-slate-500" title={e.description || e.note}>{e.description || e.note || `${k.label} · saved ${when(e.createdAt)}`}</p>
                    </td>
                    <td className={td}>{when(e.submittedAt) || <span className="text-slate-300">-</span>}</td>
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
                  {docsOpen === e._id && files.length > 0 && (
                    <tr className="bg-slate-50/60">
                      <td />
                      <td colSpan={7} className="px-3 pb-3">
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
export type EntryDialogMode = { mode: "baseline" } | { mode: "upload" } | { mode: "edit"; entry: Entry };
export function EntryDialog({ state, revisions, defaults, onSubmit, onClose }: {
  state: EntryDialogMode;
  /** The saved revisions a baseline can be frozen from, newest first. */
  revisions: Entry[];
  defaults: { client: string; contractCompletion: string; nextBaseline: number; unsaved: boolean };
  onSubmit: (details: ScheduleEntryDetails & { fromId?: string }, newFiles: File[], keepFiles: string[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const e = state.mode === "edit" ? state.entry : null;
  const kind = e ? kindOf(e) : state.mode === "baseline" ? "baseline" : "upload";
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<ScheduleEntryDetails & { fromId?: string }>(() => e ? {
    title: entryTitle(e), description: e.description || "", status: e.status || "draft", approvedAt: e.approvedAt || "", contractCompletion: e.contractCompletion || "",
    submittedAt: e.submittedAt || "", dataDate: e.dataDate || "", client: e.client || "", relatedDocument: e.relatedDocument || "",
  } : state.mode === "baseline" ? {
    title: defaults.nextBaseline === 0 ? "Original approved schedule" : "", description: "", status: "approved", approvedAt: today,
    contractCompletion: defaults.contractCompletion, client: defaults.client, relatedDocument: "", fromId: "",
  } : {
    title: "", description: "", status: "submitted", submittedAt: today, client: defaults.client, relatedDocument: "", dataDate: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [keep, setKeep] = useState<string[]>(() => (e?.files || []).map((x) => x.docId));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));
  const inp = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20";
  const lbl = "text-[10px] font-bold uppercase tracking-widest text-slate-400";
  const heading = state.mode === "baseline" ? `Create baseline B${defaults.nextBaseline}` : state.mode === "upload" ? "Upload a schedule" : `Edit ${entryCode(e!)} details`;
  const submit = async () => {
    if (state.mode === "upload" && !files.length) return;
    setBusy(true);
    try { if (await onSubmit(f, files, keep)) onClose(); } finally { setBusy(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="my-12 w-full max-w-xl rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">{kind === "baseline" ? <Lock size={15} className="text-blue-600" /> : kind === "upload" ? <FileUp size={15} className="text-violet-600" /> : <Pencil size={15} className="text-emerald-600" />} {heading}</p>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-5">
          {state.mode === "baseline" && (
            <>
              <p className="rounded-xl bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
                The schedule is copied as it stands and locked: its tasks and dates can never be edited afterwards. The current schedule is then compared with it.
              </p>
              <label className="block space-y-1">
                <span className={lbl}>Freeze</span>
                <select value={f.fromId || ""} onChange={(ev) => set({ fromId: ev.target.value })} className={inp}>
                  <option value="">The live schedule, as last saved{defaults.unsaved ? " (unsaved edits are left out)" : ""}</option>
                  {revisions.map((r) => <option key={r._id} value={r._id}>{entryCode(r)} · {entryTitle(r)} · {when(r.createdAt)}</option>)}
                </select>
              </label>
            </>
          )}
          {state.mode === "edit" && kind === "baseline" && (
            <p className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-600"><Lock size={12} /> The baseline's tasks and dates stay locked. Only these details change.</p>
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
            <label className="block space-y-1">
              <span className={lbl}>Status</span>
              <select value={f.status || "draft"} onChange={(ev) => set({ status: ev.target.value as ScheduleEntryStatus })} className={inp}>
                {(Object.keys(STATUS) as ScheduleEntryStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className={lbl}>Client</span>
              <input value={f.client || ""} onChange={(ev) => set({ client: ev.target.value })} className={inp} />
            </label>
            {kind === "baseline" ? (
              <>
                <label className="block space-y-1"><span className={lbl}>Approval date</span><input type="date" value={f.approvedAt || ""} onChange={(ev) => set({ approvedAt: ev.target.value })} className={inp} /></label>
                <label className="block space-y-1"><span className={lbl}>Contractual completion</span><input type="date" value={f.contractCompletion || ""} onChange={(ev) => set({ contractCompletion: ev.target.value })} className={inp} /></label>
              </>
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
            <span className={lbl}>{state.mode === "upload" ? "Schedule file" : "Files"}</span>
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
              <Paperclip size={13} /> {state.mode === "upload" ? "Choose the schedule file (PDF, Excel, P6, MS Project)" : "Attach files (transmittal, approval letter...)"}
              <input type="file" multiple className="hidden" onChange={(ev) => { const list = Array.from(ev.target.files || []); if (list.length) setFiles((p) => [...p, ...list]); ev.target.value = ""; }} />
            </label>
            {state.mode !== "edit" && kind === "baseline" && <p className="text-[10px] text-slate-400">A PDF of the frozen schedule is filed with it automatically.</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={busy || (state.mode === "upload" && !files.length)} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy && <Loader2 size={13} className="animate-spin" />}
            {state.mode === "baseline" ? <><Lock size={13} /> Freeze as B{defaults.nextBaseline}</> : state.mode === "upload" ? <><Upload size={13} /> Add to history</> : "Save details"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
