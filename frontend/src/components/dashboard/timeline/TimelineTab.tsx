import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Download, Eraser, FileSpreadsheet, FileUp, Flag, GripVertical, History, Import, ListChecks, Loader2,
  Pencil, Plus, Printer, Save, Search, StickyNote, Trash2, Undo2, X,
} from "lucide-react";
import {
  discardTimelineDraft, fetchProjects, fetchTimelineRevisions, saveTimeline, saveTimelineDraft, saveTimelineRow, uploadDocument, documentUrl,
  fetchDocuments, saveScheduleSubs, type ApiSubSchedule,
  type ApiExtension, type ApiMilestone, type ApiProject, type ApiScheduleRevision, type MilestoneStatus,
} from "../../../lib/api";
import { toast } from "../../../lib/toast";
import { useDialogs } from "../../../lib/useDialogs";
import {
  CUSTOM_KEY, MASTER_PHASES, STATUS_META, STATUS_ORDER, addDuration, daysBetween, delayDays, effectiveEndDate, fmtDay, isMilestonePoint,
  newMilestoneId, parseDate, phaseColor, phasePercent, startSlip, statusPatch, toIso, effectiveDays, timelineChanges, defaultCategoryFor, groupByCategory,
  SCHEDULE_CATEGORIES, UNCATEGORISED, type DurationUnit,
} from "../../../lib/projectSchedule";
import ShareMenu from "../ShareMenu";
import TimelineBar from "./TimelineBar";
import GanttChart, { GanttLegend } from "./GanttChart";
import PhaseEditor from "./PhaseEditor";
import { readScheduleFile, scheduleTemplate, type ImportResult } from "../../../lib/scheduleImport";
import ScheduleFiles, { SCHEDULE_SECTION, type ScheduleFilesHandle } from "./ScheduleFiles";
import PdfPreviewModal from "../PdfPreviewModal";

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
const blank = (key: string, name: string, category = defaultCategoryFor(key, name)): ApiMilestone => ({
  id: newMilestoneId(), key, name, description: "", plannedStart: "", plannedEnd: "", baselineStart: "", baselineEnd: "",
  actualStart: "", actualEnd: "", durationValue: 0, durationUnit: "days", status: "not_started", percent: 0, responsible: [], notes: "",
  category,
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
  // CR 242 / 243 - which schedule is open: the master, or one drawn from it by category.
  const [subs, setSubs] = useState<ApiSubSchedule[]>(project.schedule?.subs || []);
  const [activeSub, setActiveSub] = useState("");
  const sub = subs.find((x) => x.id === activeSub) || null;
  const scheduleName = sub ? sub.name : "Master schedule";
  const inScope = (m: ApiMilestone) => !sub || sub.categories.includes((m.category || "").trim() || UNCATEGORISED);

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
    // CR 236 - list what changed since the last revision (row saves included) and save that as the
    // revision's note, instead of asking the PM to remember it.
    const since = revisions?.[0]?.milestones || [];
    const changes = timelineChanges(since, rows);
    if (!changes.length && revisions?.length) { toast("Nothing has changed since the last revision.", "info"); return; }
    const shownChanges = changes.length ? changes : ["First version of this timeline"];
    const list = shownChanges.slice(0, 14).map((c) => `• ${c}`).join("\n") + (shownChanges.length > 14 ? `\n• and ${shownChanges.length - 14} more` : "");
    if (!(await confirm({
      title: `Save revision ${(revisions?.[0]?.version || 0) + 1}?`,
      message: `In this revision:\n${list}`,
      confirmLabel: "Save revision",
      danger: false,
    }))) return;
    const note = shownChanges.join("; ").slice(0, 500);
    setBusy("save");
    try {
      const r = await saveTimeline(project.id, rows, note);
      onScheduleSaved(r.schedule, r.progress);
      setRows(r.schedule.milestones); setBase(r.schedule.milestones); setLoadedFrom(""); setDraftRows(null);
      setRevisions((p) => [r.revision, ...(p || [])]);
      // CR 244 - file the revision as a PDF in the Master schedule folder, and say where it went.
      try {
        const name = await fileRevision("Master schedule", r.revision.version, r.schedule.milestones);
        toast(`Saved as revision ${r.revision.version}. Filed in Schedule files › Master schedule as "${name}".`, "success");
      } catch {
        toast(`Saved as revision ${r.revision.version}. The PDF could not be filed; use PDF to download it.`, "info");
      }
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save the timeline.", "error"); }
    finally { setBusy(""); }
  };
  // CR 235 - save one task: its edits go live straight away, without filing a revision.
  // Changes not yet filed as a revision (row saves included).
  const sinceRevision = useMemo(
    () => (revisions ? timelineChanges(revisions[0]?.milestones || [], rows).length : 0),
    [revisions, rows],
  );
  const baseRow = (id: string) => base.find((r) => r.id === id);
  const rowDirty = (m: ApiMilestone) => { const b = baseRow(m.id); return !b || JSON.stringify(b) !== JSON.stringify(m); };
  const [rowBusy, setRowBusy] = useState("");
  const saveRow = async (m: ApiMilestone) => {
    const s = parseDate(m.plannedStart), e = parseDate(m.plannedEnd);
    if (s && e && e < s) { toast(`"${m.name}" ends before it starts. Fix its dates first.`, "error"); return; }
    setRowBusy(m.id);
    try {
      const r = await saveTimelineRow(project.id, m);
      const saved = r.milestone;
      setBase((p) => (p.some((x) => x.id === saved.id) ? p.map((x) => (x.id === saved.id ? saved : x)) : [...p, saved]));
      setRows((p) => p.map((x) => (x.id === saved.id ? saved : x)));
      onScheduleSaved(r.schedule, r.progress);
      toast(`"${saved.name}" saved. Save the timeline when you are done to file a revision.`, "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save this row.", "error"); }
    finally { setRowBusy(""); }
  };
  // CR 234 - the project manager's note on a task: internal, never printed.
  const [noteFor, setNoteFor] = useState<ApiMilestone | null>(null);
  const [noteText, setNoteText] = useState("");
  const openNote = (m: ApiMilestone) => { setNoteFor(m); setNoteText(m.notes || ""); };
  const saveNote = async () => {
    if (!noteFor) return;
    const next = { ...(rows.find((x) => x.id === noteFor.id) || noteFor), notes: noteText.trim() };
    update(noteFor.id, { notes: next.notes });
    setNoteFor(null);
    if (canEdit) await saveRow(next);
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
      ...blank(m.key || CUSTOM_KEY, m.name, m.category || defaultCategoryFor(m.key, m.name)), description: m.description || "", plannedStart: mv(m.plannedStart), plannedEnd: mv(m.plannedEnd),
      durationValue: m.durationValue || 0, durationUnit: m.durationUnit || "days", responsible: [],
    }))]);
    setImportOpen(false);
    toast(`${incoming.length} phase${incoming.length === 1 ? "" : "s"} copied from ${src.name}${shift ? `, moved ${shift > 0 ? "+" : ""}${shift} days to this project's start` : ""}. Review and save.`, "success");
  };

  // ── Output ──
  const pdfInput = (label: string) => ({
    projectName: project.name, projectNo: project.id, clientName: project.clientInfo?.name, contractStart, deadline,
    originalDeadline: project.endDate, milestones: rows.filter(inScope), version: label, scheduleName,
  });
  const versionLabel = dirty ? "Unsaved changes" : revisions?.[0] ? `Version ${revisions[0].version}` : "";
  const buildPdf = async () => {
    const { buildTimelinePdf } = await import("../../../lib/timelinePdf");
    return buildTimelinePdf(pdfInput(versionLabel));
  };
  const fileName = `${project.name.replace(/[\\/:*?"<>|]/g, "_")} - ${scheduleName} ${toIso(today)}.pdf`;
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
  // CR 245 / 250 - Print opens a preview of the whole schedule (summary, table and chart on 18" x 24"),
  // with Print, Send, Download and "Fit to one page".
  const [previewOpen, setPreviewOpen] = useState(false);
  const printPdf = () => setPreviewOpen(true);
  // Sharing files the PDF under Project Management > Schedules, then shares that copy.
  const sharePdf = async () => {
    const blob = await buildPdf();
    const doc = await uploadDocument(project.id, new File([blob], fileName, { type: "application/pdf" }), SCHEDULE_SECTION, true, "Shared");
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

  // ── CR 242 / 243 - the master schedule and the sub-schedules drawn from it by category ──
  const [subDialog, setSubDialog] = useState<{ id?: string; name: string; categories: string[] } | null>(null);
  const allCategories = useMemo(() => {
    const used = rows.map((m) => (m.category || "").trim()).filter(Boolean);
    return [...new Set([...used, ...SCHEDULE_CATEGORIES])];
  }, [rows]);
  // Suggest the categories a schedule's name implies ("Design schedule" -> Design).
  const guessCategories = (name: string) => {
    const n = name.toLowerCase();
    return allCategories.filter((c) => {
      const lc = c.toLowerCase();
      if (/bid/.test(n)) return /bid|award|pre-award/.test(lc);
      if (/design/.test(n)) return /design/.test(lc);
      if (/construct/.test(n)) return /mobiliz|construct|testing/.test(lc);
      if (/procure/.test(n)) return /procure/.test(lc);
      return false;
    });
  };
  const saveSubs = async (next: ApiSubSchedule[], message: string) => {
    try {
      const r = await saveScheduleSubs(project.id, next);
      setSubs(r.schedule.subs || next);
      onScheduleSaved(r.schedule, r.progress);
      toast(message, "success");
      return r.schedule.subs || next;
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save the schedule list.", "error"); return null; }
  };
  const submitSubDialog = async () => {
    if (!subDialog) return;
    const name = subDialog.name.trim();
    if (!name) { toast("Name the schedule.", "error"); return; }
    if (!subDialog.categories.length) { toast("Pick at least one category from the master schedule.", "error"); return; }
    const entry: ApiSubSchedule = { id: subDialog.id || `s${Date.now().toString(36)}`, name, categories: subDialog.categories };
    const next = subDialog.id ? subs.map((x) => (x.id === subDialog.id ? entry : x)) : [...subs, entry];
    const saved = await saveSubs(next, subDialog.id ? `${name} updated.` : `${name} created from the master schedule.`);
    if (saved) { setActiveSub(entry.id); setSubDialog(null); }
  };
  const deleteSub = async (x: ApiSubSchedule) => {
    if (!(await confirm({ title: `Delete ${x.name}?`, message: "Only this sub-schedule goes. Its tasks stay on the master schedule, and its saved revisions stay in Schedule files.", confirmLabel: "Delete", danger: true }))) return;
    const saved = await saveSubs(subs.filter((s2) => s2.id !== x.id), `${x.name} deleted.`);
    if (saved) { setActiveSub(""); setSubDialog(null); }
  };

  // ── CR 244 - every revision is filed as a PDF in its schedule's folder ──
  const filesRef = useRef<ScheduleFilesHandle>(null);
  const [filedTo, setFiledTo] = useState("");
  const fileRevision = async (folder: string, revision: number, milestones: ApiMilestone[]) => {
    const { buildTimelinePdf } = await import("../../../lib/timelinePdf");
    const blob = await buildTimelinePdf({ ...pdfInput(`Revision ${revision}`), milestones, scheduleName: folder });
    const name = `${folder} - Revision ${revision}.pdf`;
    await uploadDocument(project.id, new File([blob], name, { type: "application/pdf" }), SCHEDULE_SECTION, false, folder);
    setFiledTo(folder);
    filesRef.current?.reload();
    return name;
  };
  const saveSubRevision = async () => {
    if (!sub) return;
    if (dirty) { toast("Save the master schedule first, so this schedule is filed from saved tasks.", "error"); return; }
    setBusy("pdf");
    try {
      const existing = (await fetchDocuments(project.id, SCHEDULE_SECTION)).filter((d) => (d.folder || "").split("/")[0] === sub.name).length;
      const name = await fileRevision(sub.name, existing + 1, rows.filter(inScope));
      toast(`Saved to Schedule files › ${sub.name} as "${name}".`, "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not file the schedule.", "error"); }
    finally { setBusy(""); }
  };

  // ── CR 237 - a schedule is created on purpose, and can be cleared in one go ──
  const [creating, setCreating] = useState(false);
  const started = rows.length > 0 || creating || !!loadedFrom;
  const startCreate = () => { setCreating(true); setPickerOpen(true); };
  const clearSchedule = async () => {
    if (!(await confirm({
      title: "Clear the whole schedule?",
      message: `All ${rows.length} task${rows.length === 1 ? "" : "s"} are taken off this schedule. Nothing changes until you Save, and every saved revision is kept.`,
      confirmLabel: "Clear schedule",
      danger: true,
    }))) return;
    setRows([]); setCreating(true); setPickerOpen(true);
    toast("Schedule cleared. Add tasks or import them, then Save.", "success");
  };

  // ── CR 239 - import from Excel ──
  const xlsInput = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<(ImportResult & { fileName: string }) | null>(null);
  const readExcel = async (file: File) => {
    setBusy("import");
    try {
      const r = await readScheduleFile(file);
      if (!r.milestones.length) { toast("No tasks found. The sheet needs a Task / Milestone column (download the template to see the layout).", "error"); return; }
      setImported({ ...r, fileName: file.name });
    } catch (e) { toast(e instanceof Error ? e.message : "Could not read that file.", "error"); }
    finally { setBusy(""); }
  };
  const applyImport = (mode: "replace" | "add") => {
    if (!imported) return;
    setRows((p) => (mode === "replace" ? imported.milestones : [...p, ...imported.milestones]));
    setCreating(true);
    toast(`${imported.milestones.length} task${imported.milestones.length === 1 ? "" : "s"} imported from ${imported.fileName}. Review, then Save.`, "success");
    setImported(null);
  };
  const downloadTemplate = async () => {
    const blob = await scheduleTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "Schedule template.xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  // ── CR 240 - long schedules: fold a category away ──
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCategory = (c: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  // ── View ──
  const shown = rows
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => {
      if (!inScope(m)) return false;             // CR 243 - a sub-schedule shows only its categories
      if (view === "all") return true;
      if (view === "completed") return m.status === "completed" || phasePercent(m) >= 100;
      if (view === "late") return delayDays(m, today) > 0;
      if (view === "active") return m.status === "in_progress" || (phasePercent(m) > 0 && phasePercent(m) < 100);
      return (m.status || "not_started") === "not_started" && phasePercent(m) === 0;
    });
  // CR 238 - grouped by category when any task has one; a flat list otherwise.
  const hasCategories = rows.some((m) => (m.category || "").trim());
  const groups = hasCategories ? groupByCategory(shown) : [{ category: "", items: shown }];
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

      {/* Hidden file input for the Excel import (CR 239). */}
      <input ref={xlsInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readExcel(f); e.target.value = ""; }} />

      {/* CR 237 - no schedule yet: create one on purpose, instead of a half-empty editor. */}
      {!started && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
          <Flag size={30} className="mx-auto text-slate-300" />
          <p className="mt-3 font-display text-lg font-bold text-slate-900">No schedule yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            {canEdit
              ? "Create the project schedule: pick the phases and tasks, group them by category, or import a schedule prepared in Excel."
              : "The project manager has not created the schedule yet."}
          </p>
          {canEdit && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={startCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary"><Plus size={13} /> Create schedule</button>
              <button type="button" onClick={() => xlsInput.current?.click()} className={btn}><FileUp size={13} /> Import from Excel</button>
              <button type="button" onClick={() => setImportOpen(true)} className={btn}><Import size={13} /> Copy from another project</button>
              <button type="button" onClick={() => void downloadTemplate()} className={btn}><FileSpreadsheet size={13} /> Excel template</button>
            </div>
          )}
        </div>
      )}

      {/* CR 242 / 243 - the master schedule and the schedules drawn from it, as tabs. */}
      {started && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-100 bg-slate-50 p-1.5">
          {[{ id: "", name: "Master schedule", categories: [] as string[] }, ...subs].map((x) => {
            const on = activeSub === x.id;
            return (
              <span key={x.id || "master"} className={`inline-flex items-center rounded-xl ${on ? "bg-white shadow-sm ring-1 ring-primary/20" : ""}`}>
                <button type="button" onClick={() => setActiveSub(x.id)} className={`px-3 py-1.5 text-xs font-bold ${on ? "text-slate-900" : "text-slate-500 hover:text-slate-900"}`}>
                  {x.name}
                  {x.id && <span className="ml-1.5 text-[10px] font-semibold text-slate-400">{rows.filter((m) => x.categories.includes((m.category || "").trim() || UNCATEGORISED)).length}</span>}
                </button>
                {x.id && on && canEdit && (
                  <button type="button" onClick={() => setSubDialog({ id: x.id, name: x.name, categories: x.categories })} title="Rename, change categories or delete" className="mr-1 rounded p-1 text-slate-400 hover:text-primary"><Pencil size={11} /></button>
                )}
              </span>
            );
          })}
          {canEdit && (
            <button type="button" onClick={() => setSubDialog({ name: "", categories: [] })} className="inline-flex items-center gap-1 rounded-xl border border-dashed border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-500 hover:border-primary hover:text-primary">
              <Plus size={12} /> New schedule from the master
            </button>
          )}
          {sub && (
            <span className="ml-auto flex items-center gap-2 pr-1 text-[11px] text-slate-500">
              Categories: <b className="text-slate-700">{sub.categories.join(", ")}</b>
              {canEdit && (
                <button type="button" onClick={() => void saveSubRevision()} disabled={busy === "pdf"} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-primary disabled:opacity-50">
                  {busy === "pdf" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save revision
                </button>
              )}
            </span>
          )}
        </div>
      )}

      {started && <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-bold text-slate-900">Phases & Milestones</h3>
            {hasCategories && (
              <button type="button" onClick={() => setCollapsed((s) => (s.size ? new Set() : new Set(groups.map((g) => g.category))))} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:text-primary">
                {collapsed.size ? "Expand all" : "Collapse all"}
              </button>
            )}
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
            <button type="button" onClick={printPdf} className={btn}><Printer size={13} /> Preview / Print</button>
            <button type="button" onClick={downloadPdf} disabled={busy === "pdf"} className={btn}><Download size={13} /> PDF</button>
            <button type="button" onClick={downloadCsv} className={btn} title="Download for Excel"><FileSpreadsheet size={13} /> Excel</button>
            <ShareMenu variant="button" fileName={fileName} fileUrl="" projectName={project.name} prepareFile={sharePdf} />
            {canEdit && (
              <>
                <button type="button" onClick={() => xlsInput.current?.click()} disabled={busy === "import"} className={btn} title="Import tasks from an Excel sheet (download the template for the columns)">
                  {busy === "import" ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />} Import from Excel
                </button>
                <button type="button" onClick={() => setImportOpen(true)} className={btn}><Import size={13} /> Import from project</button>
                {rows.length > 0 && <button type="button" onClick={() => void clearSchedule()} className={btn} title="Take every task off this schedule"><Eraser size={13} /> Clear</button>}
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
              <div className="max-h-[72vh] overflow-auto">
                <table className="w-full min-w-[980px] text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-[0_1px_0_#e2e8f0]">
                    <tr>
                      <th rowSpan={2} className="w-8" />
                      <th rowSpan={2} className="px-2 py-2 text-left">#</th>
                      <th rowSpan={2} className="px-2 py-2 text-left">Phase / milestone</th>
                      <th colSpan={2} className="border-l border-slate-100 px-2 pt-2 text-center">Planned</th>
                      <th colSpan={2} className="border-l border-sky-100 bg-sky-50 px-2 pt-2 text-center text-sky-800" title="Only entered when it differs from the plan">Actual</th>
                      <th rowSpan={2} className="border-l border-slate-100 px-2 py-2 text-right">Duration</th>
                      <th rowSpan={2} className="px-2 py-2 text-left">Status</th>
                      <th rowSpan={2} className="px-2 py-2 text-left">% complete</th>
                      <th rowSpan={2} className="px-2 py-2 text-center" title="The project manager's note on this task. Internal, never printed.">Remark</th>
                      <th rowSpan={2} className="px-2 py-2 text-right">Actions</th>
                    </tr>
                    <tr className="normal-case tracking-normal">
                      <th className="border-l border-slate-100 px-2 pb-2 text-left font-semibold">Start</th>
                      <th className="px-2 pb-2 text-left font-semibold">End</th>
                      <th className="border-l border-sky-100 bg-sky-50 px-2 pb-2 text-left font-semibold text-sky-800">Start</th>
                      <th className="bg-sky-50 px-2 pb-2 text-left font-semibold text-sky-800">End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => {
                      const folded = collapsed.has(g.category);
                      const starts = g.items.map(({ m }) => parseDate(m.plannedStart)).filter((d): d is Date => !!d);
                      const ends = g.items.map(({ m }) => parseDate(m.plannedEnd)).filter((d): d is Date => !!d);
                      const gFrom = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
                      const gTo = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
                      const gPct = g.items.length ? Math.round(g.items.reduce((s2, { m }) => s2 + phasePercent(m), 0) / g.items.length) : 0;
                      const gLate = g.items.filter(({ m }) => m.status !== "completed" && m.status !== "cancelled" && delayDays(m, today) > 0).length;
                      return (
                      <Fragment key={g.category || "all"}>
                        {g.category && (
                          <tr className="border-t border-slate-200 bg-slate-100/80">
                            <td colSpan={12} className="px-2 py-1.5">
                              <button type="button" onClick={() => toggleCategory(g.category)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 text-left">
                                {folded ? <ChevronRight size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700">{g.category}</span>
                                <span className="text-[10px] font-bold text-slate-400">{g.items.length} task{g.items.length === 1 ? "" : "s"}</span>
                                {gFrom && gTo && <span className="text-[10px] text-slate-500">{fmtDay(gFrom)} to {fmtDay(gTo)}</span>}
                                <span className="text-[10px] font-bold text-slate-500">{gPct}% complete</span>
                                {gLate > 0 && <span className="text-[10px] font-bold text-red-600">{gLate} late</span>}
                              </button>
                            </td>
                          </tr>
                        )}
                        {!folded && g.items.map(({ m, index }) => {
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
                                {m.responsible?.length ? (
                                  <span className="block max-w-[16rem] truncate text-[10px] text-slate-400">{m.responsible.join(", ")}</span>
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
                          <td className={`${cell} border-l border-sky-100 bg-sky-50/50`}>
                            <input type="date" disabled={!canEdit} value={m.actualStart || ""} onChange={(e) => update(m.id, { actualStart: e.target.value })} className={`${dateInp} ${slip > 0 ? "!text-red-600 font-bold" : ""}`} />
                          </td>
                          <td className={`${cell} bg-sky-50/50`}>
                            <input type="date" disabled={!canEdit} value={m.actualEnd || ""} min={m.actualStart || undefined} onChange={(e) => update(m.id, { actualEnd: e.target.value })} className={`${dateInp} ${late > 0 && m.actualEnd ? "!text-red-600 font-bold" : ""}`} />
                            {late > 0 && <span className="block px-1 text-[10px] font-bold text-red-600">{late} day{late === 1 ? "" : "s"} late</span>}
                          </td>
                          <td className={`${cell} border-l border-slate-50 text-right tabular-nums text-slate-600`}>
                            {(() => {
                              const ed = effectiveDays(m);
                              if (ed.days === null) return "-";
                              return (
                                <span title={ed.actual ? `From the actual dates (planned ${d ?? "-"} days)` : "From the planned dates"}>
                                  {ed.days} day{ed.days === 1 ? "" : "s"}
                                  {ed.actual && <span className="block text-[9px] font-bold uppercase tracking-wide text-sky-700">actual</span>}
                                </span>
                              );
                            })()}
                          </td>
                          <td className={cell}>
                            <select disabled={!canEdit} value={m.status || "not_started"} onChange={(e) => update(m.id, statusPatch(m, e.target.value as MilestoneStatus))} className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${STATUS_META[m.status || "not_started"].chip}`}>
                              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                            </select>
                          </td>
                          <td className={cell}>
                            <div className="flex items-center gap-2">
                              <input type="number" min={0} max={100} step={5} disabled={!canEdit} value={pct} onChange={(e) => update(m.id, { percent: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })} className="w-12 rounded-md border border-slate-200 px-1 py-0.5 text-right text-xs tabular-nums disabled:border-transparent" />
                              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} /></span>
                            </div>
                          </td>
                          <td className={`${cell} text-center`}>
                            <button
                              type="button"
                              onClick={() => openNote(m)}
                              title={m.notes ? m.notes : canEdit ? "Add a note (internal, not printed)" : "No note"}
                              aria-label={m.notes ? `Note on ${m.name}` : `Add a note to ${m.name}`}
                              className={`rounded p-1 ${m.notes ? "text-amber-500 hover:bg-amber-50" : "text-slate-300 hover:bg-slate-100 hover:text-slate-500"}`}
                            >
                              <StickyNote size={14} fill={m.notes ? "currentColor" : "none"} />
                            </button>
                          </td>
                          <td className={`${cell} text-right`}>
                            <div className="inline-flex items-center gap-0.5">
                              {canEdit && rowDirty(m) && (
                                <button type="button" onClick={() => void saveRow(m)} disabled={rowBusy === m.id} title="Save this task now (no revision is filed)" className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-1.5 py-1 text-[10px] font-bold text-white hover:bg-primary disabled:opacity-50">
                                  {rowBusy === m.id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save
                                </button>
                              )}
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
                      </Fragment>
                      );
                    })}
                    {shown.length === 0 && <tr><td colSpan={12} className="px-4 py-6 text-center text-slate-400">Nothing in this view.</td></tr>}
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
      </div>}

      {rows.some((m) => m.plannedStart && m.plannedEnd) && (
        <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-bold text-slate-900">Timeline chart</h3>
            {/* CR 232 - "late" means the same as on the header: past its planned end and not done.
                Phases that are finished but finished late are counted apart. */}
            {(() => {
              const lateNow = rows.filter((m) => m.status !== "completed" && m.status !== "cancelled" && delayDays(m, today) > 0).length;
              const finishedLate = rows.filter((m) => m.status === "completed" && delayDays(m, today) > 0).length;
              return (
                <>
                  {lateNow > 0 && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600" title="Past the planned end and not completed"><AlertTriangle size={12} /> {lateNow} late</span>}
                  {finishedLate > 0 && <span className="text-[11px] font-bold text-amber-600" title="Completed after the planned end">{finishedLate} finished late</span>}
                </>
              );
            })()}
          </div>
          {/* CR 238 - the chart follows the table's grouping, folded categories left out. */}
          <GanttChart rows={groups.flatMap((g) => (collapsed.has(g.category) ? [] : g.items.map((s) => s.m)))} contractStart={contractStart} deadline={deadline} originalDeadline={project.endDate} />
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
            {/* CR 235 / 236 - rows saved one by one are live but not yet a revision: Save stays on
                until they are filed. */}
            <button type="button" onClick={save} disabled={!!busy || (!dirty && !loadedFrom && !sinceRevision)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-primary disabled:opacity-50">
              {busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
            </button>
          </div>
        </div>
      )}

      {editing && <PhaseEditor initial={editing} isNew={!rows.some((r) => r.id === editing.id)} usedKeys={usedKeys} canEdit={canEdit} onSave={applyEditor} onClose={() => setEditing(null)} />}
      {versionsOpen && <VersionsPanel revisions={revisions} canEdit={canEdit} onLoad={loadVersion} onClose={() => setVersionsOpen(false)} />}
      {importOpen && <ImportPanel currentId={project.id} onPick={importFrom} onClose={() => setImportOpen(false)} />}
      {dialogs}

      {previewOpen && (
        <PdfPreviewModal title={`${scheduleName} · ${project.name}`} fileName={fileName} build={buildPdf} onClose={() => setPreviewOpen(false)} fitOption={{ note: `${scheduleName} · ${project.name}` }} />
      )}

      {/* CR 241 / 244 - the schedule files, by schedule, searchable. */}
      <ScheduleFiles ref={filesRef} projectId={project.id} projectName={project.name} canEdit={canEdit} highlight={filedTo} />

      {/* CR 243 - make or change a schedule drawn from the master. */}
      {subDialog && createPortal(
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={() => setSubDialog(null)}>
          <div className="my-20 w-full max-w-lg rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <p className="text-sm font-bold text-slate-900">{subDialog.id ? `Edit ${subDialog.name}` : "New schedule from the master"}</p>
              <button onClick={() => setSubDialog(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Name</span>
                <input value={subDialog.name} onChange={(e) => setSubDialog({ ...subDialog, name: e.target.value })} placeholder="e.g. Design schedule" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
              </label>
              {!subDialog.id && (
                <div className="flex flex-wrap gap-1.5">
                  {["Bidding schedule", "Design schedule", "Construction schedule", "Procurement schedule"].filter((n) => !subs.some((x) => x.name === n)).map((n) => (
                    <button key={n} type="button" onClick={() => setSubDialog({ ...subDialog, name: n, categories: subDialog.categories.length ? subDialog.categories : guessCategories(n) })} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-primary/10 hover:text-primary">{n}</button>
                  ))}
                </div>
              )}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Categories it takes from the master</span>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {[...allCategories, ...(rows.some((m) => !(m.category || "").trim()) ? [UNCATEGORISED] : [])].map((c) => {
                    const count = rows.filter((m) => ((m.category || "").trim() || UNCATEGORISED) === c).length;
                    const on = subDialog.categories.includes(c);
                    return (
                      <label key={c} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${on ? "bg-primary/5 font-semibold text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}>
                        <input type="checkbox" checked={on} onChange={() => setSubDialog({ ...subDialog, categories: on ? subDialog.categories.filter((x) => x !== c) : [...subDialog.categories, c] })} className="accent-emerald-600" />
                        <span className="flex-1">{c}</span>
                        <span className="text-[10px] text-slate-400">{count}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400">It holds no tasks of its own: it always shows the master schedule's latest dates for these categories.</p>
              </div>
              <div className="flex items-center justify-between gap-2">
                {subDialog.id ? <button type="button" onClick={() => void deleteSub(subs.find((x) => x.id === subDialog.id)!)} className="text-[11px] font-bold text-rose-600 hover:underline">Delete this schedule</button> : <span />}
                <div className="flex gap-2">
                  <button onClick={() => setSubDialog(null)} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
                  <button onClick={() => void submitSubDialog()} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary">{subDialog.id ? "Save" : "Create schedule"}</button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* CR 239 - what the Excel file holds, before it touches the schedule. */}
      {imported && createPortal(
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={() => setImported(null)}>
          <div className="my-20 w-full max-w-2xl rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileUp size={15} className="text-primary" /> Import {imported.fileName}</p>
              <button onClick={() => setImported(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X size={18} /></button>
            </div>
            <div className="space-y-3 p-5 text-xs text-slate-600">
              <p>
                <b className="text-slate-900">{imported.milestones.length} task{imported.milestones.length === 1 ? "" : "s"}</b>
                {imported.categories.length ? <> in <b className="text-slate-900">{imported.categories.length} categor{imported.categories.length === 1 ? "y" : "ies"}</b></> : null}
                {imported.skipped ? `, ${imported.skipped} row${imported.skipped === 1 ? "" : "s"} without a name skipped` : ""}.
                {" "}Headings read from row {imported.headerRow}.
              </p>
              {imported.categories.length > 0 && <p className="text-[11px] text-slate-500">{imported.categories.join(" · ")}</p>}
              <div className="max-h-64 overflow-auto rounded-xl border border-slate-100">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="px-2 py-1.5">Category</th><th className="px-2 py-1.5">Task</th><th className="px-2 py-1.5">Start</th><th className="px-2 py-1.5">Finish</th><th className="px-2 py-1.5">Status</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {imported.milestones.slice(0, 40).map((m) => (
                      <tr key={m.id}><td className="px-2 py-1 text-slate-500">{m.category || "-"}</td><td className="px-2 py-1 font-semibold text-slate-800">{m.name}</td><td className="px-2 py-1">{fmtDay(m.plannedStart) || "-"}</td><td className="px-2 py-1">{fmtDay(m.plannedEnd) || "-"}</td><td className="px-2 py-1">{STATUS_META[m.status || "not_started"].label}</td></tr>
                    ))}
                  </tbody>
                </table>
                {imported.milestones.length > 40 && <p className="px-2 py-1.5 text-[10px] text-slate-400">and {imported.milestones.length - 40} more</p>}
              </div>
              {imported.unknownColumns.length > 0 && <p className="text-[10px] text-slate-400">Columns not used: {imported.unknownColumns.join(", ")}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button type="button" onClick={() => void downloadTemplate()} className="text-[11px] font-bold text-primary hover:underline">Download the template</button>
                <div className="flex gap-2">
                  <button onClick={() => setImported(null)} className="rounded-xl px-3 py-2 font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
                  {rows.length > 0 && <button onClick={() => applyImport("add")} className="rounded-xl border border-slate-200 px-3 py-2 font-bold text-slate-700 hover:bg-slate-50">Add to the schedule</button>}
                  <button onClick={() => applyImport("replace")} className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-primary">{rows.length > 0 ? "Replace the schedule" : "Import"}</button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* CR 234 - the project manager's note on one task. Internal, never printed. */}
      {noteFor && createPortal(
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={() => setNoteFor(null)}>
          <div className="my-24 w-full max-w-md rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><StickyNote size={15} className="text-amber-500" /> Note on {noteFor.name}</p>
              <button onClick={() => setNoteFor(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X size={18} /></button>
            </div>
            <div className="space-y-3 p-5">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                disabled={!canEdit}
                rows={5}
                autoFocus
                placeholder="e.g. Design end moved from 16 Aug to 23 Sep per the client's letter of 2 Aug."
                className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="text-[11px] text-slate-400">For the project manager only. It stays with this task and is never printed.</p>
              {canEdit && (
                <div className="flex justify-end gap-2">
                  <button onClick={() => setNoteFor(null)} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
                  <button onClick={() => void saveNote()} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary">Save note</button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
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
