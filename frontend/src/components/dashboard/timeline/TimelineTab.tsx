import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronDown, Copy, Download, FileSpreadsheet, Flag, GripVertical, History, Import, ListChecks, Loader2,
  Pencil, Plus, Printer, Save, Search, Trash2, Undo2, X,
} from "lucide-react";
import {
  discardTimelineDraft, fetchProjects, fetchTimelineRevisions, saveTimeline, saveTimelineDraft, uploadDocument, documentUrl,
  type ApiExtension, type ApiMilestone, type ApiProject, type ApiScheduleRevision, type MilestoneStatus,
} from "../../../lib/api";
import { toast } from "../../../lib/toast";
import { useDialogs } from "../../../lib/useDialogs";
import {
  CUSTOM_KEY, MASTER_PHASES, STATUS_META, STATUS_ORDER, addDuration, daysBetween, delayDays, effectiveEndDate, fmtDay, isMilestonePoint,
  newMilestoneId, parseDate, phaseColor, phasePercent, startSlip, toIso, type DurationUnit,
} from "../../../lib/projectSchedule";
import ShareMenu from "../ShareMenu";
import TimelineBar from "./TimelineBar";
import GanttChart, { GanttLegend } from "./GanttChart";
import PhaseEditor from "./PhaseEditor";

/**
 * CR 188-192 + Reza's "Project Timeline – Phases & Milestones": Project Management >
 * Timeline / Milestones. The PM picks the phases that apply from the master list (or adds custom
 * ones), gives each planned and actual dates, status, % complete, responsible people and notes,
 * and reorders them. Phases overlap freely. Edits stay local until Save (a numbered version) or
 * Save as draft; Cancel drops them. Printable, downloadable and shareable as a PDF.
 */

type View = "all" | "active" | "late" | "upcoming" | "completed";
const VIEWS: Array<[View, string]> = [["all", "All milestones"], ["active", "In progress"], ["late", "Late"], ["upcoming", "Not started"], ["completed", "Completed"]];

const same = (a: ApiMilestone[], b: ApiMilestone[]) => JSON.stringify(a) === JSON.stringify(b);
const blank = (key: string, name: string): ApiMilestone => ({
  id: newMilestoneId(), key, name, description: "", plannedStart: "", plannedEnd: "", baselineStart: "", baselineEnd: "",
  actualStart: "", actualEnd: "", durationValue: 0, durationUnit: "days", status: "not_started", percent: 0, responsible: [], notes: "",
});
const hasData = (m: ApiMilestone) => !!(m.plannedStart || m.plannedEnd || m.actualStart || m.actualEnd || m.notes || (m.percent ?? 0) > 0 || m.responsible?.length);

export default function TimelineTab({ project, canEdit, userName = "", onScheduleSaved, onSaveExtensions }: {
  project: ApiProject;
  canEdit: boolean;
  userName?: string;
  /** Called with the saved schedule so the workspace (header bar, lists) updates without a reload. */
  onScheduleSaved: (schedule: NonNullable<ApiProject["schedule"]>, progress: number) => void;
  onSaveExtensions?: (next: ApiExtension[], message: string) => Promise<void>;
}) {
  const { confirm, prompt, dialogs } = useDialogs();
  const live = useMemo(() => project.schedule?.milestones || [], [project.schedule]);
  const draft = project.schedule?.draft || null;
  const [rows, setRows] = useState<ApiMilestone[]>(live);
  const [base, setBase] = useState<ApiMilestone[]>(live);        // what the rows are compared with
  const [editing, setEditing] = useState<ApiMilestone | null>(null);
  const [view, setView] = useState<View>("all");
  const [pickerOpen, setPickerOpen] = useState(live.length === 0);
  const [pickQuery, setPickQuery] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "draft" | "pdf" | "import">("");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [revisions, setRevisions] = useState<ApiScheduleRevision[] | null>(null);
  const [loadedFrom, setLoadedFrom] = useState("");                // "Draft" / "Version 3" when loaded into the editor
  const [importOpen, setImportOpen] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Take the live timeline when it changes elsewhere and nothing is being edited here.
  useEffect(() => {
    setRows((cur) => (same(cur, base) ? live : cur));
    setBase(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  const dirty = !same(rows, base);
  // Rows last parked as a draft: leaving the page with exactly those needs no warning.
  const [draftRows, setDraftRows] = useState<ApiMilestone[] | null>(null);
  const unsaved = dirty && !(draftRows && same(rows, draftRows));

  useEffect(() => {
    if (!unsaved) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [unsaved]);

  const loadRevisions = () => fetchTimelineRevisions(project.id).then(setRevisions).catch(() => setRevisions([]));
  useEffect(() => { void loadRevisions(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [project.id]);

  const today = new Date();
  const contractStart = project.startDate || project.contractDate || "";
  const deadline = effectiveEndDate(project);
  const usedKeys = rows.map((r) => r.key || "").filter((k) => k && k !== CUSTOM_KEY);

  // ── Editing ──
  const update = (id: string, patch: Partial<ApiMilestone>) => setRows((p) => p.map((r) => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch };
    // A phase entered by duration keeps its length when the start moves.
    if ("plannedStart" in patch && next.durationValue && next.plannedStart) {
      next.plannedEnd = toIso(addDuration(parseDate(next.plannedStart)!, next.durationValue, (next.durationUnit || "days") as DurationUnit));
    }
    if ("plannedEnd" in patch) next.durationValue = 0;
    if ("status" in patch && patch.status === "completed") next.percent = 100;
    if ("percent" in patch) {
      if ((patch.percent ?? 0) >= 100 && next.status !== "cancelled") next.status = "completed";
      else if ((patch.percent ?? 0) > 0 && next.status === "not_started") next.status = "in_progress";
      else if ((patch.percent ?? 0) < 100 && next.status === "completed") next.status = "in_progress";
    }
    if ("actualEnd" in patch && patch.actualEnd && next.status !== "cancelled") { next.status = "completed"; next.percent = 100; }
    if ("actualStart" in patch && patch.actualStart && next.status === "not_started") next.status = "in_progress";
    return next;
  }));
  const applyEditor = (m: ApiMilestone) => {
    setRows((p) => (p.some((r) => r.id === m.id) ? p.map((r) => (r.id === m.id ? m : r)) : [...p, m]));
    setEditing(null);
  };
  const remove = async (m: ApiMilestone) => {
    if (hasData(m) && !(await confirm({ title: `Remove "${m.name}"?`, message: "Its dates, progress and notes are removed from this timeline when you save.", confirmLabel: "Remove", danger: true }))) return;
    setRows((p) => p.filter((r) => r.id !== m.id));
  };
  const move = (from: number, to: number) => setRows((p) => {
    if (to < 0 || to >= p.length || from === to) return p;
    const next = [...p];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    return next;
  });
  const togglePhase = async (key: string, name: string) => {
    const existing = rows.find((r) => r.key === key);
    if (existing) await remove(existing);
    else setRows((p) => [...p, blank(key, name)]);
  };
  const addCustom = () => setEditing(blank(CUSTOM_KEY, ""));
  const addMilestone = () => {
    const next = MASTER_PHASES.find((p) => !usedKeys.includes(p.key));
    setEditing(next ? blank(next.key, next.name) : blank(CUSTOM_KEY, ""));
  };
  const sortByDate = () => setRows((p) => [...p].sort((a, b) => (parseDate(a.plannedStart)?.getTime() ?? Infinity) - (parseDate(b.plannedStart)?.getTime() ?? Infinity)));

  // ── Save / draft / cancel ──
  const save = async () => {
    const bad = rows.find((r) => { const s = parseDate(r.plannedStart), e = parseDate(r.plannedEnd); return s && e && e < s; });
    if (bad) { toast(`"${bad.name}" ends before it starts. Fix its dates first.`, "error"); return; }
    const note = await prompt({ title: "Save timeline", label: "What changed? (optional, kept with this version)", placeholder: "e.g. Monthly update: design finished, delivery moved to June", confirmLabel: "Save version" });
    if (note === null) return;
    setBusy("save");
    try {
      const r = await saveTimeline(project.id, rows, note);
      onScheduleSaved(r.schedule, r.progress);
      setRows(r.schedule.milestones); setBase(r.schedule.milestones); setLoadedFrom(""); setDraftRows(null);
      setRevisions((p) => [r.revision, ...(p || [])]);
      toast(`Timeline saved as version ${r.revision.version}.`, "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save the timeline.", "error"); }
    finally { setBusy(""); }
  };
  const saveDraft = async () => {
    setBusy("draft");
    try {
      const r = await saveTimelineDraft(project.id, rows);
      onScheduleSaved(r.schedule, r.progress);
      setDraftRows(rows); setLoadedFrom("Draft");
      toast("Saved as a draft. The live timeline has not changed until you Save.", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save the draft.", "error"); }
    finally { setBusy(""); }
  };
  const cancel = async () => {
    if (unsaved && !(await confirm({ title: "Discard changes?", message: "Your edits since the last save will be lost.", confirmLabel: "Discard", danger: true }))) return;
    setRows(base); setLoadedFrom("");
  };
  const openDraft = () => { if (draft) { setRows(draft.milestones); setDraftRows(draft.milestones); setLoadedFrom("Draft"); } };
  const dropDraft = async () => {
    if (!(await confirm({ title: "Delete the draft?", message: "The saved draft is removed. The live timeline stays as it is.", confirmLabel: "Delete draft", danger: true }))) return;
    try { const r = await discardTimelineDraft(project.id); onScheduleSaved(r.schedule, r.progress); setDraftRows(null); if (loadedFrom === "Draft") { setRows(base); setLoadedFrom(""); } toast("Draft deleted.", "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not delete the draft.", "error"); }
  };
  const loadVersion = (v: ApiScheduleRevision) => { setRows(v.milestones); setLoadedFrom(`Version ${v.version}`); setVersionsOpen(false); toast(`Version ${v.version} loaded. Save to make it the live timeline again.`, "success"); };

  // ── Import from another project ──
  const importFrom = async (src: ApiProject) => {
    const srcStart = parseDate(src.startDate || src.contractDate), myStart = parseDate(contractStart);
    const shift = srcStart && myStart ? daysBetween(srcStart, myStart) : 0;
    const mv = (v?: string) => { const d = parseDate(v); return d ? toIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + shift)) : ""; };
    const incoming = (src.schedule?.milestones || []).filter((m) => m.key === CUSTOM_KEY || !usedKeys.includes(m.key || ""));
    if (!incoming.length) { toast("That project has no phases this timeline doesn't already have.", "error"); return; }
    setRows((p) => [...p, ...incoming.map((m) => ({
      ...blank(m.key || CUSTOM_KEY, m.name), description: m.description || "", plannedStart: mv(m.plannedStart), plannedEnd: mv(m.plannedEnd),
      durationValue: m.durationValue || 0, durationUnit: m.durationUnit || "days", responsible: [],
    }))]);
    setImportOpen(false);
    toast(`${incoming.length} phase${incoming.length === 1 ? "" : "s"} copied from ${src.name}${shift ? `, moved ${shift > 0 ? "+" : ""}${shift} days to this project's start` : ""}. Review and save.`, "success");
  };

  // ── Output ──
  const pdfInput = (label: string) => ({
    projectName: project.name, projectNo: project.id, clientName: project.clientInfo?.name, contractStart, deadline,
    originalDeadline: project.endDate, milestones: rows, version: label,
  });
  const versionLabel = dirty ? "Unsaved changes" : revisions?.[0] ? `Version ${revisions[0].version}` : "";
  const buildPdf = async () => {
    const { buildTimelinePdf } = await import("../../../lib/timelinePdf");
    return buildTimelinePdf(pdfInput(versionLabel));
  };
  const fileName = `${project.name.replace(/[\\/:*?"<>|]/g, "_")} - Timeline ${toIso(today)}.pdf`;
  const downloadPdf = async () => {
    setBusy("pdf");
    try {
      const blob = await buildPdf();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { toast(e instanceof Error ? e.message : "Could not build the PDF.", "error"); }
    finally { setBusy(""); }
  };
  const printPdf = async () => {
    const win = window.open("", "_blank");
    setBusy("pdf");
    try {
      const blob = await buildPdf();
      const { showPdfInTab } = await import("../../../lib/reportPdf");
      showPdfInTab(win, blob);
    } catch (e) { win?.close(); toast(e instanceof Error ? e.message : "Could not build the PDF.", "error"); }
    finally { setBusy(""); }
  };
  // Sharing files the PDF under Project Management > Schedules, then shares that copy.
  const sharePdf = async () => {
    const blob = await buildPdf();
    const doc = await uploadDocument(project.id, new File([blob], fileName, { type: "application/pdf" }), "pm-schedules", true);
    return documentUrl(doc);
  };
  const downloadCsv = () => {
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ["#", "Phase / milestone", "Description", "Planned start", "Planned end", "Baseline start", "Baseline end", "Actual start", "Actual end", "Duration (days)", "Status", "% complete", "Days late", "Responsible", "Notes"];
    const lines = rows.map((m, i) => {
      const ps = parseDate(m.plannedStart), pe = parseDate(m.plannedEnd);
      return [i + 1, m.name, m.description, m.plannedStart, m.plannedEnd, m.baselineStart, m.baselineEnd, m.actualStart, m.actualEnd, ps && pe ? daysBetween(ps, pe) : "", STATUS_META[m.status || "not_started"].label, phasePercent(m), delayDays(m, today) || "", (m.responsible || []).join("; "), m.notes].map(esc).join(",");
    });
    const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = fileName.replace(/\.pdf$/, ".csv"); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  // ── View ──
  const shown = rows
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => {
      if (view === "all") return true;
      if (view === "completed") return m.status === "completed" || phasePercent(m) >= 100;
      if (view === "late") return delayDays(m, today) > 0;
      if (view === "active") return m.status === "in_progress" || (phasePercent(m) > 0 && phasePercent(m) < 100);
      return (m.status || "not_started") === "not_started" && phasePercent(m) === 0;
    });
  const previewProject: ApiProject = { ...project, schedule: { ...(project.schedule || { milestones: [] }), milestones: rows } };
  const pickList = MASTER_PHASES.filter((p) => p.name.toLowerCase().includes(pickQuery.trim().toLowerCase()));

  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-primary hover:text-primary disabled:opacity-50";
  const cell = "px-2 py-2 align-middle";
  const dateInp = "w-[7.6rem] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-700 hover:border-slate-200 focus:border-primary focus:bg-white focus:outline-none disabled:hover:border-transparent";

  return (
    <div className="space-y-4">
      <TimelineBar project={previewProject} canEdit={canEdit} onSaveExtensions={onSaveExtensions} userName={userName} />

      {draft && !loadedFrom && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <span><b>A draft is waiting</b>{draft.savedBy ? ` from ${draft.savedBy}` : ""}{draft.savedAt ? `, saved ${new Date(draft.savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : ""}. It is not live yet.</span>
          {canEdit && (
            <span className="flex gap-1.5">
              <button type="button" onClick={openDraft} className="rounded-lg bg-amber-600 px-2.5 py-1 font-bold text-white hover:bg-amber-700">Open draft</button>
              <button type="button" onClick={dropDraft} className="rounded-lg border border-amber-300 px-2.5 py-1 font-bold hover:bg-amber-100">Delete draft</button>
            </span>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-bold text-slate-900">Phases & Milestones</h3>
            {loadedFrom && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Editing: {loadedFrom}</span>}
            {!loadedFrom && revisions?.[0] && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Version {revisions[0].version}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="relative">
              <select value={view} onChange={(e) => setView(e.target.value as View)} className={`${btn} appearance-none pr-7`}>
                {VIEWS.map(([k, l]) => <option key={k} value={k}>View: {l}</option>)}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
            </label>
            <button type="button" onClick={() => { setVersionsOpen(true); void loadRevisions(); }} className={btn}><History size={13} /> Versions{revisions?.length ? ` (${revisions.length})` : ""}</button>
            <button type="button" onClick={printPdf} disabled={busy === "pdf"} className={btn}>{busy === "pdf" ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} Print</button>
            <button type="button" onClick={downloadPdf} disabled={busy === "pdf"} className={btn}><Download size={13} /> PDF</button>
            <button type="button" onClick={downloadCsv} className={btn} title="Download for Excel"><FileSpreadsheet size={13} /> Excel</button>
            <ShareMenu variant="button" fileName={fileName} fileUrl="" projectName={project.name} prepareFile={sharePdf} />
            {canEdit && (
              <>
                <button type="button" onClick={() => setImportOpen(true)} className={btn}><Import size={13} /> Import from project</button>
                <button type="button" onClick={addMilestone} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"><Plus size={13} /> Add milestone</button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row">
          {/* Master list */}
          {canEdit && (
            <aside className={`shrink-0 border-b border-slate-100 lg:border-b-0 lg:border-r ${pickerOpen ? "lg:w-64" : "lg:w-12"}`}>
              <button type="button" onClick={() => setPickerOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50" title={pickerOpen ? "Hide the list" : "Select phases / milestones"}>
                {pickerOpen ? <><span className="flex items-center gap-1.5"><ListChecks size={14} className="text-primary" /> Select phases / milestones</span><ChevronDown size={14} className="text-slate-400" /></> : <ListChecks size={16} className="mx-auto text-primary" />}
              </button>
              {pickerOpen && (
                <div className="px-3 pb-3">
                  <label className="relative block">
                    <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} placeholder="Search milestone..." className="w-full rounded-lg border border-slate-200 py-1.5 pl-7 pr-2 text-xs focus:border-primary focus:outline-none" />
                  </label>
                  <ul className="mt-2 max-h-[26rem] space-y-0.5 overflow-y-auto pr-1">
                    {pickList.map((p) => {
                      const on = usedKeys.includes(p.key);
                      return (
                        <li key={p.key}>
                          <label className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-xs text-slate-700 hover:bg-slate-50">
                            <input type="checkbox" checked={on} onChange={() => void togglePhase(p.key, p.name)} className="mt-0.5 accent-blue-600" />
                            <span className={on ? "font-semibold text-slate-900" : ""}>{p.name}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <button type="button" onClick={addCustom} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-blue-300 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50">
                    <Plus size={12} /> Custom / manual phase
                  </button>
                </div>
              )}
            </aside>
          )}

          {/* Table */}
          <div className="min-w-0 flex-1">
            {rows.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Flag size={28} className="mx-auto text-slate-300" />
                <p className="mt-2 text-sm font-bold text-slate-700">No phases yet</p>
                <p className="mt-1 text-xs text-slate-500">{canEdit ? "Tick the phases that apply on the left, add a custom one, or import them from a similar project." : "The project manager has not set up the timeline yet."}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-xs">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th rowSpan={2} className="w-8" />
                      <th rowSpan={2} className="px-2 py-2 text-left">#</th>
                      <th rowSpan={2} className="px-2 py-2 text-left">Phase / milestone</th>
                      <th colSpan={2} className="border-l border-slate-100 px-2 pt-2 text-center">Planned</th>
                      <th colSpan={2} className="border-l border-slate-100 px-2 pt-2 text-center">Actual</th>
                      <th rowSpan={2} className="border-l border-slate-100 px-2 py-2 text-right">Duration</th>
                      <th rowSpan={2} className="px-2 py-2 text-left">Status</th>
                      <th rowSpan={2} className="px-2 py-2 text-left">% complete</th>
                      <th rowSpan={2} className="px-2 py-2 text-right">Actions</th>
                    </tr>
                    <tr className="normal-case tracking-normal">
                      <th className="border-l border-slate-100 px-2 pb-2 text-left font-semibold">Start</th>
                      <th className="px-2 pb-2 text-left font-semibold">End</th>
                      <th className="border-l border-slate-100 px-2 pb-2 text-left font-semibold">Start</th>
                      <th className="px-2 pb-2 text-left font-semibold">End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(({ m, index }) => {
                      const ps = parseDate(m.plannedStart), pe = parseDate(m.plannedEnd);
                      const d = ps && pe ? daysBetween(ps, pe) : null;
                      const late = delayDays(m, today);
                      const slip = startSlip(m);
                      const moved = (m.baselineStart && m.baselineStart !== m.plannedStart) || (m.baselineEnd && m.baselineEnd !== m.plannedEnd);
                      const color = phaseColor(m, index);
                      const pct = phasePercent(m);
                      return (
                        <tr
                          key={m.id}
                          draggable={canEdit && view === "all"}
                          onDragStart={() => { dragFrom.current = index; }}
                          onDragOver={(e: DragEvent) => { if (dragFrom.current !== null) { e.preventDefault(); setDragOver(index); } }}
                          onDragLeave={() => setDragOver((v) => (v === index ? null : v))}
                          onDrop={(e) => { e.preventDefault(); if (dragFrom.current !== null) move(dragFrom.current, index); dragFrom.current = null; setDragOver(null); }}
                          onDragEnd={() => { dragFrom.current = null; setDragOver(null); }}
                          className={`border-t border-slate-100 ${dragOver === index ? "bg-blue-50" : "hover:bg-slate-50/60"}`}
                        >
                          <td className="pl-2 text-slate-300">{canEdit && view === "all" && <GripVertical size={14} className="cursor-grab" />}</td>
                          <td className={`${cell} text-slate-400`}>{index + 1}</td>
                          <td className={`${cell} min-w-[13rem]`}>
                            <button type="button" onClick={() => setEditing(m)} className="flex items-start gap-2 text-left">
                              {isMilestonePoint(m) ? <Flag size={13} className="mt-0.5 shrink-0" style={{ color }} /> : <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />}
                              <span>
                                <span className="block font-semibold text-slate-800 hover:text-primary">{m.name}</span>
                                {(m.responsible?.length || m.notes) ? (
                                  <span className="block max-w-[16rem] truncate text-[10px] text-slate-400">{[m.responsible?.join(", "), m.notes].filter(Boolean).join(" · ")}</span>
                                ) : null}
                              </span>
                            </button>
                          </td>
                          <td className={`${cell} border-l border-slate-50`}>
                            <input type="date" disabled={!canEdit} value={m.plannedStart || ""} onChange={(e) => update(m.id, { plannedStart: e.target.value })} className={dateInp} />
                            {moved && m.baselineStart !== m.plannedStart && <span className="block px-1 text-[10px] text-slate-400" title="Baseline start">was {fmtDay(m.baselineStart)}</span>}
                          </td>
                          <td className={cell}>
                            <input type="date" disabled={!canEdit} value={m.plannedEnd || ""} min={m.plannedStart || undefined} onChange={(e) => update(m.id, { plannedEnd: e.target.value })} className={dateInp} />
                            {moved && m.baselineEnd !== m.plannedEnd && <span className="block px-1 text-[10px] text-slate-400" title="Baseline end">was {fmtDay(m.baselineEnd)}</span>}
                          </td>
                          <td className={`${cell} border-l border-slate-50`}>
                            <input type="date" disabled={!canEdit} value={m.actualStart || ""} onChange={(e) => update(m.id, { actualStart: e.target.value })} className={`${dateInp} ${slip > 0 ? "!text-red-600 font-bold" : ""}`} />
                          </td>
                          <td className={cell}>
                            <input type="date" disabled={!canEdit} value={m.actualEnd || ""} min={m.actualStart || undefined} onChange={(e) => update(m.id, { actualEnd: e.target.value })} className={`${dateInp} ${late > 0 && m.actualEnd ? "!text-red-600 font-bold" : ""}`} />
                            {late > 0 && <span className="block px-1 text-[10px] font-bold text-red-600">{late} day{late === 1 ? "" : "s"} late</span>}
                          </td>
                          <td className={`${cell} border-l border-slate-50 text-right tabular-nums text-slate-600`}>{d === null ? "-" : `${d} day${d === 1 ? "" : "s"}`}</td>
                          <td className={cell}>
                            <select disabled={!canEdit} value={m.status || "not_started"} onChange={(e) => update(m.id, { status: e.target.value as MilestoneStatus })} className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${STATUS_META[m.status || "not_started"].chip}`}>
                              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                            </select>
                          </td>
                          <td className={cell}>
                            <div className="flex items-center gap-2">
                              <input type="number" min={0} max={100} step={5} disabled={!canEdit} value={pct} onChange={(e) => update(m.id, { percent: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })} className="w-12 rounded-md border border-slate-200 px-1 py-0.5 text-right text-xs tabular-nums disabled:border-transparent" />
                              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} /></span>
                            </div>
                          </td>
                          <td className={`${cell} text-right`}>
                            <div className="inline-flex items-center gap-0.5">
                              <button type="button" onClick={() => setEditing(m)} title={canEdit ? "Edit" : "View"} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-primary"><Pencil size={13} /></button>
                              {canEdit && (
                                <>
                                  <button type="button" onClick={() => move(index, index - 1)} disabled={index === 0} title="Move up" className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={13} /></button>
                                  <button type="button" onClick={() => move(index, index + 1)} disabled={index === rows.length - 1} title="Move down" className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={13} /></button>
                                  <button type="button" onClick={() => void remove(m)} title="Remove" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {shown.length === 0 && <tr><td colSpan={11} className="px-4 py-6 text-center text-slate-400">Nothing in this view.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            {rows.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
                <span className="flex items-center gap-3">
                  {canEdit && <span className="inline-flex items-center gap-1"><GripVertical size={12} /> Drag rows to reorder</span>}
                  {canEdit && <button type="button" onClick={sortByDate} className="font-bold text-slate-500 hover:text-primary">Sort by planned start</button>}
                </span>
                <span>Dates can overlap; phases do not depend on each other. Red actual dates are later than the baseline.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {rows.some((m) => m.plannedStart && m.plannedEnd) && (
        <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-bold text-slate-900">Timeline chart</h3>
            {rows.some((m) => delayDays(m, today) > 0) && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600"><AlertTriangle size={12} /> {rows.filter((m) => delayDays(m, today) > 0).length} late</span>}
          </div>
          <GanttChart rows={shown.map((s) => s.m)} contractStart={contractStart} deadline={deadline} originalDeadline={project.endDate} />
          <GanttLegend />
        </div>
      )}

      {/* Save bar */}
      {canEdit && (dirty || loadedFrom) && (
        <div className="sticky bottom-3 z-[60] flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur">
          <p className="text-xs font-bold text-slate-700">{!unsaved && loadedFrom === "Draft" ? "Draft saved. Save to make it the live timeline." : dirty ? "You have unsaved changes to the timeline." : `${loadedFrom} is open in the editor.`}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={cancel} disabled={!!busy} className={btn}><Undo2 size={13} /> Cancel</button>
            {loadedFrom === "Draft" && draft && <button type="button" onClick={dropDraft} disabled={!!busy} className={btn}><Trash2 size={13} /> Delete draft</button>}
            <button type="button" onClick={saveDraft} disabled={!!busy || !unsaved} className={btn}>{busy === "draft" ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />} Save as draft</button>
            <button type="button" onClick={save} disabled={!!busy || (!dirty && !loadedFrom)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-primary disabled:opacity-50">
              {busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
            </button>
          </div>
        </div>
      )}

      {editing && <PhaseEditor initial={editing} isNew={!rows.some((r) => r.id === editing.id)} usedKeys={usedKeys} canEdit={canEdit} onSave={applyEditor} onClose={() => setEditing(null)} />}
      {versionsOpen && <VersionsPanel revisions={revisions} canEdit={canEdit} onLoad={loadVersion} onClose={() => setVersionsOpen(false)} />}
      {importOpen && <ImportPanel currentId={project.id} onPick={importFrom} onClose={() => setImportOpen(false)} />}
      {dialogs}
    </div>
  );
}

function VersionsPanel({ revisions, canEdit, onLoad, onClose }: { revisions: ApiScheduleRevision[] | null; canEdit: boolean; onLoad: (v: ApiScheduleRevision) => void; onClose: () => void }) {
  const [open, setOpen] = useState<string>("");
  return (
    <div className="fixed inset-0 z-[200] flex justify-end bg-slate-900/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="flex items-center gap-2 font-display text-base font-bold text-slate-900"><History size={16} /> Timeline versions</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!revisions ? <Loader2 className="mx-auto animate-spin text-slate-400" /> : revisions.length === 0 ? (
            <p className="text-center text-xs text-slate-400">No saved versions yet. Each Save keeps one.</p>
          ) : (
            <ol className="space-y-2">
              {revisions.map((v, i) => (
                <li key={v._id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-800">Version {v.version}{i === 0 && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Live</span>}</p>
                    <span className="text-[11px] font-bold text-blue-600">{v.progress}% complete</span>
                  </div>
                  <p className="text-[11px] text-slate-500">{new Date(v.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}{v.savedBy ? ` · ${v.savedBy}` : ""} · {v.milestones.length} phases</p>
                  {v.note && <p className="mt-1 text-xs text-slate-700">{v.note}</p>}
                  <div className="mt-2 flex gap-1.5">
                    <button type="button" onClick={() => setOpen(open === v._id ? "" : v._id)} className="rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary">{open === v._id ? "Hide" : "View"}</button>
                    {canEdit && i > 0 && <button type="button" onClick={() => onLoad(v)} className="rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary">Load into editor</button>}
                  </div>
                  {open === v._id && (
                    <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                      {v.milestones.map((m, k) => (
                        <li key={m.id} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="flex min-w-0 items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: phaseColor(m, k) }} /><span className="truncate">{m.name}</span></span>
                          <span className="shrink-0 text-slate-500">{m.plannedStart ? `${fmtDay(m.plannedStart)} to ${fmtDay(m.plannedEnd)}` : "no dates"} · {phasePercent(m)}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportPanel({ currentId, onPick, onClose }: { currentId: string; onPick: (p: ApiProject) => void; onClose: () => void }) {
  const [projects, setProjects] = useState<ApiProject[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    fetchProjects("all").then((ps) => setProjects(ps.filter((p) => p.id !== currentId && (p.schedule?.milestones?.length || 0) > 0))).catch(() => setProjects([]));
  }, [currentId]);
  const list = (projects || []).filter((p) => `${p.name} ${p.id}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="my-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-display text-base font-bold text-slate-900">Import phases from a project</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-5">
          <p className="text-xs text-slate-500">Copies that project's phases with their planned dates, moved to this project's contract start. Actual dates, progress and people are not copied.</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          {!projects ? <Loader2 className="mx-auto animate-spin text-slate-400" /> : list.length === 0 ? (
            <p className="text-center text-xs text-slate-400">No other project has a timeline yet.</p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto">
              {list.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onPick(p)} className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left hover:border-primary hover:bg-emerald-50/40">
                    <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{p.name}</span><span className="text-[11px] text-slate-400">{p.id}</span></span>
                    <span className="shrink-0 text-[11px] font-bold text-slate-500">{p.schedule?.milestones?.length} phases</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
