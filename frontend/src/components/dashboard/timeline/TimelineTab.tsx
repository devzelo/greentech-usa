import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, ArrowDown, ArrowUp, BookmarkCheck, SlidersHorizontal, CalendarCheck2, CalendarRange, ChevronDown, Diamond, FolderPlus, ChevronRight, ListTodo, Copy, Download, Eraser, Eye, FileSpreadsheet, FileUp, Flag, GripVertical, History, Import, Link2, ListChecks, Loader2,
  Pencil, Plus, Printer, Save, Search, StickyNote, Trash2, Undo2, X,
} from "lucide-react";
import {
  discardTimelineDraft, fetchProjects, fetchTimelineRevisions, createScheduleBaseline, createScheduleUpload, updateScheduleEntry, deleteScheduleEntry, scheduleEntryFileUrl, type ScheduleEntryDetails, type ScheduleEntryStatus, saveTimelinePlain, saveTimelineDraft, saveTimelineRow, uploadDocument, documentUrl, fetchAnnouncements, approveScheduleBaseline, createScheduleSubmittal, makeScheduleCurrent,
  type ApiExtension, type ApiMilestone, type ApiProject, type ApiSchedulePhase, type ApiScheduleRevision, type MilestoneStatus,
} from "../../../lib/api";
import { toast } from "../../../lib/toast";
import { useDialogs } from "../../../lib/useDialogs";
import {
  CUSTOM_KEY, MASTER_PHASES, STATUS_META, STATUS_ORDER, addDuration, daysBetween, delayDays, endForDuration, normalizeDurations, plannedDays, effectiveEndDate, fmtDay, isMilestonePoint,
  newMilestoneId, planSchedule, parseDate, phaseColor, phasePercent, startSlip, statusPatch, toIso, effectiveDays, timelineChanges, defaultCategoryFor, groupByCategory,
  UNCATEGORISED, categoryList, wbsNumbers, type DurationUnit,
} from "../../../lib/projectSchedule";
import ShareMenu from "../ShareMenu";
import TimelineBar from "./TimelineBar";
import GanttChart, { GanttLegend, GANTT_ZOOMS, type GanttZoom } from "./GanttChart";
import { ItemForm, MilestoneMark, PhaseForm, phaseColorOf } from "./ScheduleForms";
import DisplayOptions from "./DisplayOptions";
import { barOn, loadDisplay, saveDisplay, shownColumns, type ColKey, type ScheduleDisplay } from "../../../lib/scheduleDisplay";
import ToolMenu, { MENU_ITEM } from "./ToolMenu";
import {
  BaselineTab, CurrentSummary, EntryDialog, FrozenSchedule, HistoryTab, baselineNumber, currentBaseline, draftBaseline, entryCode, entryTitle, isFileOnly, isLocked, kindOf,
  type EntryDialogMode, type EntryHandlers,
} from "./ScheduleRegister";
import { ApproveDialog, PasskeyDialog, SubmittalDialog, type ApproveDetails, type SubmittalDetails } from "./ScheduleWorkflow";
import { readScheduleFile, scheduleTemplate, type ImportResult } from "../../../lib/scheduleImport";
import { criticalPath, dependentsOf, overrunsDeadline, parsePreds, predLabel, predsOf, relinkAll, setScheduleHolidays, withItem, withPreds, wouldCycle, type PlanContext, type Pred } from "../../../lib/scheduleLinks";
import { TIMELINE_PAPERS, type TimelinePaper } from "../../../lib/timelinePdf";
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
  inc: true,   // CR 322 - made under the inclusive day count
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
  // CR 314 (2026-09-28): one schedule per project. The separate schedules beside the master are
  // gone; what they were for (printing part of the job) is done by showing only some phases. The
  // ones that existed are filed in History by the server, so nothing is lost.
  const sched = undefined;
  const scheduleName = "Project schedule";
  // CR 322 - rows saved under the old day count are read into the new one (dates unchanged).
  const live = useMemo(() => normalizeDurations(project.schedule?.milestones || []), [project.schedule]);
  const liveCats = useMemo(() => project.schedule?.categories || [], [project.schedule]);
  const draft = project.schedule?.draft || null;
  const [rows, setRows] = useState<ApiMilestone[]>(live);
  const [base, setBase] = useState<ApiMilestone[]>(live);        // what the rows are compared with
  // The schedule's categories, in order, like BOQ sections: named, renamable, kept when empty.
  const [cats, setCats] = useState<string[]>(liveCats);
  const [baseCats, setBaseCats] = useState<string[]>(liveCats);
  const catList = useMemo(() => categoryList(cats, rows), [cats, rows]);
  // CR 321 - each phase's details (colour, dates set by hand, what it waits on), by name.
  const livePhases = useMemo(() => project.schedule?.phaseInfo || [], [project.schedule]);
  const [phases, setPhases] = useState<ApiSchedulePhase[]>(livePhases);
  const [basePhases, setBasePhases] = useState<ApiSchedulePhase[]>(livePhases);
  const [editing, setEditing] = useState<ApiMilestone | null>(null);
  // The forms' side panel: one at a time, a task or milestone, or a phase (null = a new one).
  const [phaseEdit, setPhaseEdit] = useState<{ name: string | null } | null>(null);
  const [panelNarrow, setPanelNarrow] = useState(false);
  /**
   * CR 323 - the display options: columns, what is written on the bars, float, actual dates, the
   * phases in view and the colours. Kept per person and per project. CR 319 - the critical
   * highlight and float are two separate switches among them, with a button each on the toolbar.
   */
  const [display, setDisplayState] = useState<ScheduleDisplay>(() => loadDisplay(project.id));
  const setDisplay = (d: ScheduleDisplay) => { setDisplayState(d); saveDisplay(project.id, d); };
  useEffect(() => { setDisplayState(loadDisplay(project.id)); }, [project.id]);
  const [displayOpen, setDisplayOpen] = useState(false);
  const showCritical = barOn(display, "critical");
  const showFloat = display.float;
  const toggleCritical = () => setDisplay({ ...display, bars: display.bars.map((x) => (x.key === "critical" ? { ...x, on: !x.on } : x)) });
  const toggleFloat = () => setDisplay({ ...display, float: !display.float });
  const cols = shownColumns(display);
  const hiddenPhases = new Set(display.hiddenPhases);
  const openItem = (m: ApiMilestone) => { setPhaseEdit(null); setPanelNarrow(false); setEditing(m); };
  const openPhase = (name: string | null) => { setEditing(null); setPanelNarrow(false); setPhaseEdit({ name }); };
  const [view, setView] = useState<View>("all");
  const [pickerOpen, setPickerOpen] = useState(live.length === 0);
  const [pickQuery, setPickQuery] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "draft" | "pdf" | "import">("");
  // CR 300 - the register: baselines, saved versions and uploaded schedules, newest first.
  const [register, setRegister] = useState<ApiScheduleRevision[]>([]);
  // CR 315 to 317 - the workflow's dialogs: approve a baseline, the passkey, save for history.
  const [approving, setApproving] = useState<ApiScheduleRevision | null>(null);
  const [passkeyFor, setPasskeyFor] = useState<ApiScheduleRevision | null>(null);
  const [submittalOpen, setSubmittalOpen] = useState(false);
  type RegTab = "baseline" | "current" | "history";
  const [regTab, setRegTabState] = useState<RegTab>(() => { try { const v = localStorage.getItem("gt-schedule-tab"); return v === "baseline" || v === "history" ? v : "current"; } catch { return "current"; } });
  const setRegTab = (t: RegTab) => { setRegTabState(t); try { localStorage.setItem("gt-schedule-tab", t); } catch { /* ignore */ } };
  const [entryDialog, setEntryDialog] = useState<EntryDialogMode | null>(null);
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
  useEffect(() => {
    setCats((cur) => (JSON.stringify(cur) === JSON.stringify(baseCats) ? liveCats : cur));
    setBaseCats(liveCats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCats]);
  useEffect(() => {
    setPhases((cur) => (JSON.stringify(cur) === JSON.stringify(basePhases) ? livePhases : cur));
    setBasePhases(livePhases);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePhases]);
  const catsChanged = JSON.stringify(catList) !== JSON.stringify(categoryList(baseCats, base));
  const phasesChanged = JSON.stringify(phases) !== JSON.stringify(basePhases);
  const dirty = !same(rows, base) || catsChanged || phasesChanged;
  // Rows last parked as a draft: leaving the page with exactly those needs no warning.
  const [draftRows, setDraftRows] = useState<ApiMilestone[] | null>(null);
  const unsaved = dirty && !(draftRows && same(rows, draftRows));

  useEffect(() => {
    if (!unsaved) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [unsaved]);

  const takeRegister = (raw: ApiScheduleRevision[]) => {
    const all = raw.map((e) => ({ ...e, milestones: normalizeDurations(e.milestones || []) }));
    setRegister(all);
  };
  const loadRevisions = () => fetchTimelineRevisions(project.id, sched).then(takeRegister).catch(() => takeRegister([]));
  // Opening another schedule starts clean on that schedule's own tasks, categories and revisions.
  useEffect(() => {
    setRows(live); setBase(live); setCats(liveCats); setBaseCats(liveCats); setPhases(livePhases); setBasePhases(livePhases);
    setLoadedFrom(""); setCreating(false); setDraftRows(null); setEditing(null); setPhaseEdit(null); setCollapsed(new Set());
    setRegister([]);
    void loadRevisions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const today = new Date();
  const contractStart = project.startDate || project.contractDate || "";
  const deadline = effectiveEndDate(project);
  const usedKeys = rows.map((r) => r.key || "").filter((k) => k && k !== CUSTOM_KEY);
  /**
   * CR 321 - what the schedule asks of its items beyond their own links: a phase that waits on
   * another, dates set by hand, and the project start for an item with nothing to wait on.
   * CR 322 - the holidays a task may leave out are the platform's own list.
   */
  const [holidayTick, setHolidayTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchAnnouncements().then((list) => {
      if (!alive) return;
      const days: string[] = [];
      for (const a of list) {
        if (a.kind !== "holiday") continue;
        const s = parseDate(a.date), e = parseDate(a.endDate) || s;
        for (let d = s, n = 0; d && e && d <= e && n < 60; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), n++) days.push(toIso(d));
      }
      setScheduleHolidays(days);
      setHolidayTick((t) => t + 1);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const planCtx = useMemo<PlanContext>(() => ({ phases, projectStart: contractStart }), [phases, contractStart, holidayTick]);

  // ── Editing ──
  const update = (id: string, patch: Partial<ApiMilestone>) => setRows((p) => {
    const edited = p.map((r) => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch };
    // CR 321 - a start typed in the table is a date set by hand, unless the task follows its links.
    if ("plannedStart" in patch && (next.startMode === "manual" || (next.startMode === "auto" && !predsOf(next).length))) { next.startMode = "manual"; next.manualStart = patch.plannedStart || ""; }
    // A phase entered by duration keeps its length when the start moves.
    if (("plannedStart" in patch || "durationValue" in patch || "durationUnit" in patch) && next.durationValue && next.plannedStart) {
      next.plannedEnd = toIso(endForDuration(parseDate(next.plannedStart)!, next.durationValue, (next.durationUnit || "days") as DurationUnit));
    }
    if ("plannedEnd" in patch) next.durationValue = 0;
    // CR 294 - a milestone is a marker: no length, so its finish is its start.
    if (next.isMilestone) { next.durationValue = 0; next.plannedEnd = next.plannedStart || next.plannedEnd; }
    if ("status" in patch && patch.status === "completed") next.percent = 100;
    if ("percent" in patch) {
      if ((patch.percent ?? 0) >= 100 && next.status !== "cancelled") next.status = "completed";
      else if ((patch.percent ?? 0) > 0 && next.status === "not_started") next.status = "in_progress";
      else if ((patch.percent ?? 0) < 100 && next.status === "completed") next.status = "in_progress";
    }
    if ("actualEnd" in patch && patch.actualEnd && next.status !== "cancelled") { next.status = "completed"; next.percent = 100; }
    if ("actualStart" in patch && patch.actualStart && next.status === "not_started") next.status = "in_progress";
    return next;
    });
    /**
     * CR 294 - the schedule is a chain: when a task's planned dates, length or link change, every
     * task hanging off it is worked out again, and so on down the line. Actuals, status and the
     * rest do not move anything, so the chain is only walked when it has to be.
     */
    const movesTheChain = ["plannedStart", "plannedEnd", "durationValue", "durationUnit", "dependsOn", "linkType", "lagDays", "predecessors", "isMilestone"]
      .some((k) => k in patch);
    if (!movesTheChain) return edited;
    const next = relinkAll(edited, planCtx);
    // Say so once when a change pushes work past the contract deadline; it is allowed, but not quietly.
    const moved = [id, ...dependentsOf(next, id)];
    const over = next.filter((m) => moved.includes(m.id) && overrunsDeadline(m, deadline) > 0);
    if (over.length) {
      const worst = Math.max(...over.map((m) => overrunsDeadline(m, deadline)));
      toast(`${over.length === 1 ? `"${over[0].name}" runs` : `${over.length} tasks run`} past the contract deadline, by up to ${worst} day${worst === 1 ? "" : "s"}. Extend the contract time or shorten the work.`, "error");
    }
    return next;
  });
  const applyEditor = (m: ApiMilestone, successors: Pred[]) => {
    // CR 294 - a task saved from the editor carries the chain with it, the same as an edit in the
    // table: anything waiting on it is worked out again. CR 321 - its successors are written onto
    // the items that follow it.
    setRows((p) => relinkAll(withItem(p, m, successors), planCtx));
    setEditing(null); setCreating(true);
  };
  /**
   * CR 321 - a phase saved from its form: its name (the category its items carry), its number (its
   * place in the list) and the rest of its details. Renaming it carries its items and any phase
   * that waits on it; then the schedule is worked through again, since its link or its start may
   * have moved.
   */
  const savePhase = (info: ApiSchedulePhase, number: number) => {
    const old = phaseEdit?.name ?? null;
    const k = (s?: string | null) => (s || "").trim().toLowerCase();
    const names = old === null ? [...catList] : catList.filter((c) => k(c) !== k(old));
    names.splice(Math.max(0, Math.min(names.length, number - 1)), 0, info.name);
    const renamed = old !== null && old !== info.name;
    const nextPhases = [
      ...phases.filter((x) => k(x.name) !== k(old ?? info.name)).map((x) => (renamed && x.pred?.kind === "phase" && k(x.pred.ref) === k(old) ? { ...x, pred: { ...x.pred, ref: info.name } } : x)),
      info,
    ];
    const nextRows = renamed ? rows.map((m) => (k(m.category) === k(old) ? { ...m, category: info.name } : m)) : rows;
    setCats(names); setPhases(nextPhases);
    setRows(relinkAll(nextRows, { phases: nextPhases, projectStart: contractStart }));
    setCreating(true); setPhaseEdit(null);
  };
  /**
   * CR 300 - bars dragged on the chart. A task tied to others starts where its links put it, so
   * moving it changes the links' lag instead; a free task simply takes new dates. Either way the
   * chain after it follows, the same as an edit in the table.
   */
  const shiftDate = (v: string | undefined, days: number) => { const d = parseDate(v); return d ? toIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)) : v; };
  const dragMove = (m: ApiMilestone, days: number) => {
    const preds = predsOf(m);
    if (preds.length) update(m.id, { predecessors: preds.map((p) => ({ ...p, lag: p.lag + days })), dependsOn: "", linkType: "FS", lagDays: 0 });
    else if (m.durationValue) update(m.id, { plannedStart: shiftDate(m.plannedStart, days) });
    else update(m.id, { plannedStart: shiftDate(m.plannedStart, days), plannedEnd: shiftDate(m.plannedEnd || m.plannedStart, days) });
  };
  const dragResize = (m: ApiMilestone, days: number) => {
    const s = parseDate(m.plannedStart), e = parseDate(m.plannedEnd) || s;
    if (!s || !e) return;
    const end = new Date(e.getFullYear(), e.getMonth(), e.getDate() + days);
    update(m.id, { plannedEnd: toIso(end < s ? s : end) });
  };
  const remove = async (m: ApiMilestone) => {
    if (hasData(m) && !(await confirm({ title: `Remove "${m.name}"?`, message: "Its dates, progress and notes are removed from this timeline when you save.", confirmLabel: "Remove", danger: true }))) return;
    // A task that followed the removed one stands alone rather than hanging off a ghost.
    const nextPhases = phases.some((x) => x.pred?.kind === "item" && x.pred.ref === m.id) ? phases.map((x) => (x.pred?.kind === "item" && x.pred.ref === m.id ? { ...x, pred: null } : x)) : phases;
    if (nextPhases !== phases) setPhases(nextPhases);
    setRows((p) => relinkAll(p.filter((r) => r.id !== m.id).map((r) => (predsOf(r).some((q) => q.id === m.id) ? withPreds(r, predsOf(r).filter((q) => q.id !== m.id)) : r)), { phases: nextPhases, projectStart: contractStart }));
    if (editing?.id === m.id) setEditing(null);
  };
  const move = (from: number, to: number) => setRows((p) => {
    if (to < 0 || to >= p.length || from === to) return p;
    const next = [...p];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    return next;
  });
  // Where items ticked in the side panel (or added from the toolbar) go: a chosen category, or each
  // phase's usual one. Either way the task lands on the schedule that is open.
  const [addTo, setAddTo] = useState("");
  const catFor = (key: string, name: string) => addTo || defaultCategoryFor(key, name);
  const togglePhase = async (key: string, name: string) => {
    const existing = rows.find((r) => r.key === key);
    if (existing) await remove(existing);
    else { setRows((p) => [...p, blank(key, name, catFor(key, name))]); setCreating(true); }
  };
  /**
   * CR 321 - the Add menu's three forms. A new task or milestone opens blank, on "auto": its dates
   * come from the links picked in the form, or from the project start when it has none.
   */
  const addTask = (category = addTo) => openItem({ ...blank(CUSTOM_KEY, "", category), startMode: "auto", priority: "normal" });
  const addMilestone = (category = addTo) => openItem({ ...blank(CUSTOM_KEY, "", category), startMode: "auto", isMilestone: true, icon: "diamond" });
  const addCustom = () => addTask();

  // ── Phases, like BOQ sections: add, edit, order, delete, and add an item inside one ──
  // Items without a phase sit under "Other"; naming that group makes it a phase.
  const renameCategory = async (c: string) => {
    const name = (await prompt({ title: `Rename "${c}"`, label: "Category name", initialValue: c === UNCATEGORISED ? "" : c, confirmLabel: "Rename" }))?.trim();
    if (!name || name === c) return;
    const inIt = (m: ApiMilestone) => ((m.category || "").trim() || UNCATEGORISED) === c;
    setRows((p) => p.map((m) => (inIt(m) ? { ...m, category: name } : m)));
    setCats(c === UNCATEGORISED ? [...catList, name] : catList.map((x) => (x === c ? name : x)));
  };
  const moveCategory = (c: string, dir: -1 | 1) => {
    const i = catList.indexOf(c), j = i + dir;
    if (i < 0 || j < 0 || j >= catList.length) return;
    const next = [...catList];
    [next[i], next[j]] = [next[j], next[i]];
    setCats(next);
  };
  const deleteCategory = async (c: string) => {
    const inIt = (m: ApiMilestone) => ((m.category || "").trim() || UNCATEGORISED) === c;
    const n = rows.filter(inIt).length;
    if (n && !(await confirm({ title: `Delete "${c}"?`, message: `The category and its ${n} milestone${n === 1 ? "" : "s"} are taken off this schedule when you save. Records already in History keep them.`, confirmLabel: "Delete category", danger: true }))) return;
    const gone = new Set(rows.filter(inIt).map((m) => m.id));
    // Whatever waited on the phase, or on one of its items, stands alone.
    const nextPhases = phases.filter((x) => x.name.toLowerCase() !== c.toLowerCase())
      .map((x) => (x.pred && (x.pred.kind === "phase" ? x.pred.ref.toLowerCase() === c.toLowerCase() : gone.has(x.pred.ref)) ? { ...x, pred: null } : x));
    setPhases(nextPhases);
    setRows((p) => relinkAll(p.filter((m) => !inIt(m)).map((r) => (predsOf(r).some((q) => gone.has(q.id)) ? withPreds(r, predsOf(r).filter((q) => !gone.has(q.id))) : r)), { phases: nextPhases, projectStart: contractStart }));
    setCats(catList.filter((x) => x !== c));
    if (phaseEdit?.name === c) setPhaseEdit(null);
  };
  const addInCategory = (c: string) => addTask(c === UNCATEGORISED ? "" : c);
  const sortByDate = () => setRows((p) => [...p].sort((a, b) => (parseDate(a.plannedStart)?.getTime() ?? Infinity) - (parseDate(b.plannedStart)?.getTime() ?? Infinity)));

  // ── Save / draft / cancel ──
  /** The schedule as the server now holds it, taken as Current's clean state. */
  const takeSchedule = (sc: NonNullable<ApiProject["schedule"]>, progress: number) => {
    const r = normalizeDurations(sc.milestones || []);
    onScheduleSaved(sc, progress);
    setRows(r); setBase(r); setCats(sc.categories || []); setBaseCats(sc.categories || []); setPhases(sc.phaseInfo || []); setBasePhases(sc.phaseInfo || []);
    setLoadedFrom(""); setDraftRows(null);
  };
  /**
   * CR 317 (2026-09-28): a plain Save updates Current and nothing else. It used to ask for a
   * confirmation and file a numbered revision each time; a record is now filed on purpose, with
   * "Save for submittal / history" or a baseline.
   */
  const save = async (quiet = false): Promise<boolean> => {
    const bad = rows.find((r) => { const s = parseDate(r.plannedStart), e = parseDate(r.plannedEnd); return s && e && e < s; });
    if (bad) { toast(`"${bad.name}" ends before it starts. Fix its dates first.`, "error"); return false; }
    setBusy("save");
    try {
      const r = await saveTimelinePlain(project.id, rows, catList, phases);
      takeSchedule(r.schedule, r.progress);
      if (!quiet) toast("Saved. To keep a dated copy, use Save for submittal / history.", "success");
      return true;
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save the schedule.", "error"); return false; }
    finally { setBusy(""); }
  };
  // CR 235 - save one task: its edits go live straight away, without filing a revision.
  const baseRow = (id: string) => base.find((r) => r.id === id);
  const rowDirty = (m: ApiMilestone) => { const b = baseRow(m.id); return !b || JSON.stringify(b) !== JSON.stringify(m); };
  const [rowBusy, setRowBusy] = useState("");
  const saveRow = async (m: ApiMilestone) => {
    const s = parseDate(m.plannedStart), e = parseDate(m.plannedEnd);
    if (s && e && e < s) { toast(`"${m.name}" ends before it starts. Fix its dates first.`, "error"); return; }
    setRowBusy(m.id);
    try {
      const r = await saveTimelineRow(project.id, m, sched);
      const saved = r.milestone;
      setBase((p) => (p.some((x) => x.id === saved.id) ? p.map((x) => (x.id === saved.id ? saved : x)) : [...p, saved]));
      setRows((p) => p.map((x) => (x.id === saved.id ? saved : x)));
      onScheduleSaved(r.schedule, r.progress);
      toast(`"${saved.name}" saved.`, "success");
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
      const r = await saveTimelineDraft(project.id, rows, sched, catList, phases);
      onScheduleSaved(r.schedule, r.progress);
      setDraftRows(rows); setLoadedFrom("Draft");
      toast("Saved as a draft. The live timeline has not changed until you Save.", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save the draft.", "error"); }
    finally { setBusy(""); }
  };
  const cancel = async () => {
    if (unsaved && !(await confirm({ title: "Discard changes?", message: "Your edits since the last save will be lost.", confirmLabel: "Discard", danger: true }))) return;
    setRows(base); setCats(baseCats); setPhases(basePhases); setLoadedFrom(""); setEditing(null); setPhaseEdit(null);
  };
  const openDraft = () => { if (draft) { const dr = normalizeDurations(draft.milestones); setRows(dr); setCats(draft.categories || categoryList([], dr)); setPhases(draft.phaseInfo || []); setDraftRows(dr); setLoadedFrom("Draft"); } };
  const dropDraft = async () => {
    if (!(await confirm({ title: "Delete the draft?", message: "The saved draft is removed. The live timeline stays as it is.", confirmLabel: "Delete draft", danger: true }))) return;
    try { const r = await discardTimelineDraft(project.id, sched); onScheduleSaved(r.schedule, r.progress); setDraftRows(null); if (loadedFrom === "Draft") { setRows(base); setLoadedFrom(""); } toast("Draft deleted.", "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not delete the draft.", "error"); }
  };

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
  /**
   * CR 300 - what Preview, Print, Download and Share work on: the live schedule, or a frozen entry
   * (a baseline or an earlier revision) picked from the register.
   */
  const [subject, setSubject] = useState<ApiScheduleRevision | null>(null);
  // CR 323 - print and export follow what is shown: only the phases in view.
  const inView = (list: ApiMilestone[]) => (display.hiddenPhases.length ? list.filter((m) => !display.hiddenPhases.includes((m.category || "").trim() || UNCATEGORISED)) : list);
  const outRows = subject ? subject.milestones : inView(rows);
  const outCats = subject ? (subject.categories?.length ? subject.categories : categoryList([], subject.milestones)) : catList;
  const pdfInput = (label: string) => ({
    projectName: project.name, projectNo: project.id, clientName: project.clientInfo?.name, contractStart, deadline,
    originalDeadline: project.endDate, milestones: outRows, categories: outCats, phaseInfo: subject ? subject.phaseInfo : phases, version: label, scheduleName, remarks: printRemarks,
    zoom, actual: printActual && display.actual, paper, overview: printOverview, critical: showCritical, float: showFloat,
  });
  const versionLabel = subject
    ? `${entryCode(subject)} · ${entryTitle(subject)}`
    : dirty ? "Unsaved changes" : "";
  const buildPdf = async () => {
    const { buildTimelinePdf } = await import("../../../lib/timelinePdf");
    return buildTimelinePdf(pdfInput(versionLabel));
  };
  const safe = (v: string) => v.replace(/[\\/:*?"<>|]/g, "_");
  const fileName = subject
    ? `${safe(project.name)} - ${scheduleName} ${safe(entryCode(subject))} ${safe(entryTitle(subject))}.pdf`
    : `${safe(project.name)} - ${scheduleName} ${toIso(today)}.pdf`;
  const downloadPdf = async () => {
    setBusy("pdf");
    try {
      const { buildTimelinePdf } = await import("../../../lib/timelinePdf");
      const blob = await buildTimelinePdf(pdfInput(versionLabel));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { toast(e instanceof Error ? e.message : "Could not build the PDF.", "error"); }
    finally { setBusy(""); }
  };
  // CR 245 / 250 - Print opens a preview of the whole schedule (summary, table and chart on 18" x 24"),
  // with Print, Send, Download and "Fit to one page".
  const [previewOpen, setPreviewOpen] = useState(false);
  // CR 273 - the remark is an internal note, so printing it is decided before anything is built:
  // Preview and Download both ask first, then carry the answer into the document.
  const [zoom, setZoom] = useState<GanttZoom>("month");
  const [askRemarks, setAskRemarks] = useState<null | "preview" | "download">(null);
  /**
   * CR 288 - two more answers before anything is built: whether the Actual dates go in (they are
   * the site's record, not always for the reader), and which sheet to print on. A weekly chart of
   * a long job runs over several 24" x 18" sheets; the bigger drawing sizes fit it on one, so the
   * number of sheets each one needs is worked out and shown beside it.
   */
  const [printActual, setPrintActual] = useState(true);
  // CR 299 - the overview strip from the top of the schedule, printed after the chart.
  const [printOverview, setPrintOverview] = useState(true);
  const [paper, setPaper] = useState<TimelinePaper>("wide");
  const [sheetCounts, setSheetCounts] = useState<Record<TimelinePaper, number> | null>(null);
  useEffect(() => {
    if (!askRemarks) return;
    let alive = true;
    void (async () => {
      const { chartSheets } = await import("../../../lib/timelinePdf");
      const base = { milestones: outRows, contractStart, deadline, originalDeadline: project.endDate, zoom };
      const next = {
        wide: chartSheets({ ...base, paper: "wide" }),
        ansie: chartSheets({ ...base, paper: "ansie" }),
        a2: chartSheets({ ...base, paper: "a2" }),
      };
      if (alive) setSheetCounts(next);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askRemarks, outRows, zoom, contractStart, deadline]);
  const printPdf = () => { setSubject(null); setAskRemarks("preview"); };
  const startDownload = () => { setSubject(null); setAskRemarks("download"); };
  const goAhead = () => {
    const next = askRemarks;
    setAskRemarks(null);
    // The answers are already in state: the boxes and the paper size were set in the dialog.
    if (next === "preview") setPreviewOpen(true);
    else if (next === "download") void downloadPdf();
  };
  // Sharing files the PDF under Project Management > Schedules, then shares that copy.
  const sharePdf = async () => {
    const blob = await buildPdf();
    const doc = await uploadDocument(project.id, new File([blob], fileName, { type: "application/pdf" }), SCHEDULE_SECTION, true, "Shared");
    return documentUrl(doc);
  };
  // CR 300 - the live schedule or any entry from the register, with the scheduler's columns: the
  // 1.1 numbers, the type, the links and the float.
  const downloadCsv = (entry?: ApiScheduleRevision) => {
    const list = entry ? entry.milestones : inView(rows);
    const cats = entry ? (entry.categories?.length ? entry.categories : categoryList([], entry.milestones)) : catList;
    const nums = wbsNumbers(list, cats);
    const cp = criticalPath(list, entry ? { phases: entry.phaseInfo } : planCtx);
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ["#", "Phase", "Task / milestone", "Type", "Description", "Planned start", "Planned end", "Duration (days)", "Predecessors", "Float (days)", "Critical", "Baseline start", "Baseline end", "Actual start", "Actual end", "Status", "% complete", "Days late", "Responsible", "Notes"];
    const ordered = groupByCategory(list.map((m) => ({ m })), cats).flatMap((g) => g.items.map((x) => x.m));
    const lines = ordered.map((m) => {
      const ps = parseDate(m.plannedStart), pe = parseDate(m.plannedEnd);
      const fl = cp.float.get(m.id);
      return [nums.task.get(m.id) || "", m.category || "", m.name, m.isMilestone ? "Milestone" : "Task", m.description, m.plannedStart, m.isMilestone ? m.plannedStart : m.plannedEnd, m.isMilestone ? 0 : ps && pe ? daysBetween(ps, pe) : "",
        predsOf(m).map((q) => predLabel(q, nums.task.get(q.id) || "?")).join(", "), fl ?? "", fl !== undefined && fl <= 0 ? "Yes" : "",
        m.baselineStart, m.baselineEnd, m.actualStart, m.actualEnd, STATUS_META[m.status || "not_started"].label, phasePercent(m), delayDays(m, today) || "", (m.responsible || []).join("; "), m.notes].map(esc).join(",");
    });
    const blob = new Blob(["\ufeff" + [head.join(","), ...lines].join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = (entry ? fileNameFor(entry) : fileName).replace(/\.pdf$/, ".csv"); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  // ── CR 300 - the register: baselines, revisions and schedules kept as files ──
  const fileNameFor = (e: ApiScheduleRevision) => `${safe(project.name)} - ${scheduleName} ${safe(entryCode(e))} ${safe(entryTitle(e))}.pdf`;
  const tidy = (e: ApiScheduleRevision): ApiScheduleRevision => ({ ...e, milestones: normalizeDurations(e.milestones || []) });
  const replaceEntry = (raw: ApiScheduleRevision) => {
    const e = tidy(raw);
    setRegister((p) => (p.some((x) => x._id === e._id) ? p.map((x) => (x._id === e._id ? { ...e, scheduleName: x.scheduleName } : x)) : [e, ...p]));
  };
  const curBase = useMemo(() => currentBaseline(register), [register]);
  // The latest dated copy of Current filed in History.
  const lastFiled = useMemo(() => register.find((e) => (kindOf(e) === "submittal" || kindOf(e) === "revision") && !e.scheduleId && !e.archived) || null, [register]);
  const overallPct = useMemo(() => planSchedule(rows, contractStart, new Date(), deadline).progress, [rows, contractStart, deadline]); // eslint-disable-line react-hooks/exhaustive-deps
  const baselineMap = useMemo(
    () => (curBase ? new Map(curBase.milestones.map((m) => [m.id, { s: m.plannedStart || "", e: m.plannedEnd || m.plannedStart || "" }])) : undefined),
    [curBase],
  );
  const catsOf = (e: ApiScheduleRevision) => (e.categories?.length ? e.categories : categoryList([], e.milestones));
  const entryPdf = async (e: ApiScheduleRevision) => {
    const { buildTimelinePdf } = await import("../../../lib/timelinePdf");
    return buildTimelinePdf({ ...pdfInput(""), milestones: e.milestones, categories: catsOf(e), version: `${entryCode(e)} · ${entryTitle(e)}` });
  };
  // A file-only entry opens its file; the rest are drawn from their frozen tasks.
  const openEntryFile = (e: ApiScheduleRevision, download: boolean) => {
    const f = e.files?.[0];
    if (!f) { toast("No file is attached to this entry.", "info"); return; }
    if (download) { const a = document.createElement("a"); a.href = scheduleEntryFileUrl(f, true); a.click(); }
    else window.open(scheduleEntryFileUrl(f), "_blank", "noopener");
  };
  const entryOut = (e: ApiScheduleRevision, how: "preview" | "download") => {
    if (isFileOnly(e)) { openEntryFile(e, how === "download"); return; }
    setSubject(e); setAskRemarks(how);
  };
  const registerFolder = (kind: string) => `${scheduleName}/${kind === "baseline" ? "Baselines" : "Submissions"}`;
  const uploadAll = async (files: File[], kind: string) => {
    const ids: string[] = [];
    for (const f of files) ids.push((await uploadDocument(project.id, f, SCHEDULE_SECTION, false, registerFolder(kind)))._id);
    if (files.length) filesRef.current?.reload();
    return ids;
  };
  const nextBaseline = register.filter((e) => kindOf(e) === "baseline").reduce((n, e) => Math.max(n, baselineNumber(e)), 0) + 1;
  const draftBase = useMemo(() => draftBaseline(register), [register]);
  /**
   * CR 315 - a baseline is made from Current (saved first, so it is what the PM sees) or uploaded
   * as a file. With one already approved, a new revision is asked for on purpose: B2, B3...
   */
  const startBaseline = async (upload: boolean) => {
    if (!draftBase && curBase && !(await confirm({
      title: `${entryCode(curBase)} is already approved`,
      message: `This project already has approved baseline ${entryCode(curBase)}. Create a new revision?\n\nUse this when the client has formally changed the scope. It will be B${nextBaseline}, a draft until the client approves it. ${entryCode(curBase)} stays for reference.`,
      confirmLabel: `Create B${nextBaseline}`,
      danger: false,
    }))) return;
    if (!upload) {
      if (!rows.length) { toast("The schedule is empty. Add its tasks first.", "error"); return; }
      if ((dirty || loadedFrom) && !(await save(true))) return;
    }
    setEntryDialog({ mode: upload ? "baseline-upload" : "baseline" });
  };
  const submitEntry = async (details: ScheduleEntryDetails, newFiles: File[], keep: string[]): Promise<boolean> => {
    const state = entryDialog;
    if (!state) return false;
    try {
      if (state.mode === "baseline" || state.mode === "baseline-upload") {
        const upload = state.mode === "baseline-upload";
        const ids = await uploadAll(newFiles, "baseline");
        let entry = await createScheduleBaseline(project.id, { ...details, upload, files: ids }, sched);
        // The baseline is filed as a PDF with it, so it can be sent to the client as it is.
        if (!upload) {
          try {
            const blob = await entryPdf(tidy(entry));
            const doc = await uploadDocument(project.id, new File([blob], fileNameFor(entry), { type: "application/pdf" }), SCHEDULE_SECTION, false, registerFolder("baseline"));
            entry = await updateScheduleEntry(project.id, entry._id, { files: [doc._id, ...ids] }, sched);
            filesRef.current?.reload();
          } catch { /* the baseline stands without its PDF; Download makes one */ }
        }
        replaceEntry(entry);
        setRegTab("baseline");
        toast(`Baseline ${entryCode(entry)} saved as a draft. Send it to the client; approve it here once they agree.`, "success");
      } else if (state.mode === "upload") {
        const ids = await uploadAll(newFiles, "upload");
        const entry = await createScheduleUpload(project.id, { ...details, files: ids }, sched);
        setRegister((p) => [entry, ...p]);
        toast(`"${entryTitle(entry)}" added to the schedule history.`, "success");
      } else {
        const ids = await uploadAll(newFiles, kindOf(state.entry));
        replaceEntry(await updateScheduleEntry(project.id, state.entry._id, { ...details, files: [...keep, ...ids] }, state.entry.scheduleId || undefined));
        toast("Details saved.", "success");
      }
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save.", "error");
      return false;
    }
  };
  // Current against a record: the same schedule, or one that has moved on since.
  const sig = (ms: ApiMilestone[]) => JSON.stringify(ms.map((m) => [m.id, m.name, m.plannedStart || "", m.plannedEnd || "", m.actualStart || "", m.actualEnd || "", m.percent || 0]));
  /** CR 315 / 316 - the client approved the baseline: it is locked, and Current can start again from it. */
  const approveBaseline = async (d: ApproveDetails, files: File[]): Promise<boolean> => {
    const e = approving;
    if (!e) return false;
    try {
      const ids = await uploadAll(files, "baseline");
      const r = await approveScheduleBaseline(project.id, e._id, { ...d, files: ids });
      replaceEntry(r.entry);
      if (r.filed) replaceEntry(r.filed);
      if (r.replaced) { takeSchedule(r.schedule, r.progress); setEditing(null); setPhaseEdit(null); }
      toast(`Baseline ${entryCode(r.entry)} approved and locked.${r.replaced ? " Current now starts from it; what it held is in History." : ""}`, "success");
      return true;
    } catch (err) { toast(err instanceof Error ? err.message : "Could not approve it.", "error"); return false; }
  };
  /** CR 317 - a locked, dated snapshot of Current, filed in History (Current is saved first). */
  const saveSubmittal = async (d: SubmittalDetails): Promise<boolean> => {
    if ((dirty || loadedFrom) && !(await save(true))) return false;
    try {
      let entry = await createScheduleSubmittal(project.id, { ...d, client: project.clientInfo?.name || "" });
      try {
        const { doc } = await fileSnapshot(entry.title || d.title, entry.milestones);
        entry = await updateScheduleEntry(project.id, entry._id, { files: [doc._id] });
      } catch { /* the record stands without its PDF; Export PDF makes one */ }
      replaceEntry(entry);
      toast(`"${entryTitle(entry)}" filed in History${d.submittedToClient ? ", marked as submitted to the client" : ""}.`, "success");
      return true;
    } catch (err) { toast(err instanceof Error ? err.message : "Could not file it.", "error"); return false; }
  };
  /** CR 318 - an editable copy of a record becomes Current. The record stays locked. */
  const makeCurrent = async (e: ApiScheduleRevision) => {
    if (isFileOnly(e)) return;
    const name = `${entryCode(e)} · ${entryTitle(e)}`;
    if (!(await confirm({
      title: "Create current schedule from this version?",
      message: `An editable copy of ${name} becomes Current. The record itself stays locked.\n\nWhat Current holds now is filed in History first, so it is not lost.${dirty ? "\n\nYour unsaved edits in Current are NOT kept. Cancel and Save first if you need them." : ""}`,
      confirmLabel: "Make it Current",
      danger: false,
    }))) return;
    try {
      const r = await makeScheduleCurrent(project.id, e._id);
      if (r.filed) replaceEntry(r.filed);
      takeSchedule(r.schedule, r.progress);
      setEditing(null); setPhaseEdit(null);
      setRegTab("current");
      toast(`Current is now a copy of ${name}.${r.filed ? " The schedule it replaced is in History." : ""}`, "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not make it Current.", "error"); }
  };
  const dropEntry = (e: ApiScheduleRevision) => setRegister((p) => p.filter((x) => x._id !== e._id));
  const handlers: EntryHandlers = {
    canEdit,
    projectName: project.name,
    fileName: (e) => (isFileOnly(e) ? e.files?.[0]?.name || fileNameFor(e) : fileNameFor(e)),
    preview: (e) => entryOut(e, "preview"),
    print: (e) => entryOut(e, "preview"),
    downloadPdf: (e) => entryOut(e, "download"),
    downloadExcel: (e) => downloadCsv(e),
    share: async (e) => {
      const f = e.files?.[0];
      if (f) return scheduleEntryFileUrl(f);
      const doc = await uploadDocument(project.id, new File([await entryPdf(e)], fileNameFor(e), { type: "application/pdf" }), SCHEDULE_SECTION, true, "Shared");
      return documentUrl(doc);
    },
    edit: (e) => setEntryDialog({ mode: "edit", entry: e }),
    setStatus: (e, st: ScheduleEntryStatus) => {
      updateScheduleEntry(project.id, e._id, { status: st }, e.scheduleId || undefined)
        .then((x) => { replaceEntry(x); toast(`${entryCode(x)} marked ${st}.`, "success"); })
        .catch((err) => toast(err instanceof Error ? err.message : "Could not update it.", "error"));
    },
    archive: (e) => {
      updateScheduleEntry(project.id, e._id, { archived: !e.archived }, e.scheduleId || undefined)
        .then((x) => { replaceEntry(x); toast(x.archived ? `${entryCode(x)} archived. Tick "Show archived" to see it, or restore it from the Archive.` : `${entryCode(x)} restored.`, "success"); })
        .catch((err) => toast(err instanceof Error ? err.message : "Could not update it.", "error"));
    },
    remove: async (e) => {
      // CR 315 - a locked baseline is only deleted with the passkey.
      if (isLocked(e)) { setPasskeyFor(e); return; }
      if (!(await confirm({
        title: `Delete ${entryCode(e)} · ${entryTitle(e)}?`,
        message: "It goes to the Recycle Bin, where it can be restored. Its files stay in Schedule files.",
        confirmLabel: "Delete",
        danger: true,
      }))) return;
      try {
        await deleteScheduleEntry(project.id, e._id, e.scheduleId || undefined);
        dropEntry(e);
        toast(`${entryCode(e)} deleted. Restore it from the Recycle Bin if needed.`, "success");
      } catch (err) { toast(err instanceof Error ? err.message : "Could not delete it.", "error"); }
    },
    approve: (e) => setApproving(e),
    makeCurrent: (e) => void makeCurrent(e),
  };
  const deleteLocked = async (passkey: string): Promise<boolean> => {
    const e = passkeyFor;
    if (!e) return false;
    try {
      await deleteScheduleEntry(project.id, e._id, e.scheduleId || undefined, passkey);
      dropEntry(e);
      toast(`${entryCode(e)} deleted. Restore it from the Recycle Bin if needed.`, "success");
      return true;
    } catch (err) { toast(err instanceof Error ? err.message : "Could not delete it.", "error"); return false; }
  };
  const frozen = (e: ApiScheduleRevision) => (
    <FrozenSchedule milestones={e.milestones} categories={catsOf(e)} phases={e.phaseInfo} contractStart={contractStart} deadline={deadline} originalDeadline={project.endDate} zoom={zoom}
      baseline={kindOf(e) === "baseline" ? new Map() : baselineMap} />
  );

  // ── CR 244 - every revision is filed as a PDF in its schedule's folder ──
  const filesRef = useRef<ScheduleFilesHandle>(null);
  const [filedTo, setFiledTo] = useState("");
  const fileSnapshot = async (title: string, milestones: ApiMilestone[]) => {
    const { buildTimelinePdf } = await import("../../../lib/timelinePdf");
    const blob = await buildTimelinePdf({ ...pdfInput(title), milestones, categories: catList, phaseInfo: phases });
    const name = `${scheduleName} - ${safe(title)}.pdf`;
    const doc = await uploadDocument(project.id, new File([blob], name, { type: "application/pdf" }), SCHEDULE_SECTION, false, registerFolder("submittal"));
    setFiledTo(scheduleName);
    filesRef.current?.reload();
    return { name, doc };
  };
  // ── CR 237 - a schedule is created on purpose, and can be cleared in one go ──
  const [creating, setCreating] = useState(false);
  const started = rows.length > 0 || catList.length > 0 || creating || !!loadedFrom;
  const startCreate = () => { setCreating(true); setPickerOpen(true); };
  // CR 285 - the schedule is weeks of work, so clearing it asks twice: what it does, then one last
  // check with the count spelled out again.
  const clearSchedule = async () => {
    const n = `${rows.length} task${rows.length === 1 ? "" : "s"}`;
    if (!(await confirm({
      title: "Clear the whole schedule?",
      message: `All ${n} are taken off this schedule, categories included. Nothing changes until you Save, and every record in History is kept.`,
      confirmLabel: "Continue",
      danger: true,
    }))) return;
    if (!(await confirm({
      title: "Last check",
      message: `This empties the schedule: ${n} gone from the table and the chart. Save afterwards and it is the version people see. Load an earlier version from Versions to get it back.`,
      confirmLabel: `Yes, clear all ${rows.length}`,
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

  // CR 269 - how tightly the chart's time axis is packed.
  // CR 270 - the remarks are internal notes, so printing them is a choice made at the preview.
  const [printRemarks, setPrintRemarks] = useState(false);

  // ── CR 240 - long schedules: fold a category away ──
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCategory = (c: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

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
  // Grouped by category (empty categories still show, so milestones can be added to them) once the
  // schedule has any; a flat list otherwise.
  const hasCategories = catList.length > 0;
  const groups = (hasCategories ? groupByCategory(shown, catList, view === "all") : [{ category: "", items: shown }]).filter((g) => !display.hiddenPhases.includes(g.category));
  /**
   * CR 300 - the schedule's structure, as a scheduler reads it: each phase numbered 1, 2, 3 with
   * its tasks and milestones counting under it (1.1, 1.2), worked out from the full list so a
   * filtered view keeps every row's number; and the critical path, the tasks with no float.
   */
  const wbs = useMemo(() => wbsNumbers(rows, catList), [rows, catList]);
  const cpm = useMemo(() => criticalPath(rows, planCtx), [rows, planCtx]);
  const idOfNumber = (n: string) => { for (const [id, num] of wbs.task) if (num === n) return id; return undefined; };
  /** A phase's figures, rolled up from its tasks. */
  const phaseRollup = (items: ApiMilestone[], category: string) => {
    const starts = items.map((m) => parseDate(m.plannedStart)).filter((d): d is Date => !!d);
    const ends = items.map((m) => parseDate(m.plannedEnd) || parseDate(m.plannedStart)).filter((d): d is Date => !!d);
    const from = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
    const to = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
    const aStarts = items.map((m) => parseDate(m.actualStart)).filter((d): d is Date => !!d);
    const allDone = items.length > 0 && items.every((m) => parseDate(m.actualEnd));
    const aEnds = allDone ? items.map((m) => parseDate(m.actualEnd)!) : [];
    const floats = items.map((m) => cpm.float.get(m.id)).filter((f): f is number => f !== undefined);
    const live = items.filter((m) => m.status !== "cancelled");
    const done = live.filter((m) => m.status === "completed").length;
    const started = live.some((m) => m.status === "in_progress" || m.status === "completed" || phasePercent(m) > 0);
    // Links into the phase from elsewhere, e.g. Procurement starting after 1.3 Design Approval.
    const inside = new Set(items.map((m) => m.id));
    const incoming: string[] = [];
    for (const m of items) for (const q of predsOf(m)) {
      if (inside.has(q.id)) continue;
      const lab = wbs.task.get(q.id);
      if (lab && !incoming.includes(lab)) incoming.push(lab);
    }
    return {
      number: wbs.phase.get(category) || "",
      from, to,
      days: from && to ? Math.max(1, daysBetween(from, to) + 1) : null,
      actualFrom: aStarts.length ? new Date(Math.min(...aStarts.map((d) => d.getTime()))) : null,
      actualTo: aEnds.length ? new Date(Math.max(...aEnds.map((d) => d.getTime()))) : null,
      float: floats.length ? Math.min(...floats) : null,
      pct: items.length ? Math.round(items.reduce((a, m) => a + phasePercent(m), 0) / items.length) : 0,
      status: (!live.length ? "not_started" : done === live.length ? "completed" : started ? "in_progress" : "not_started") as MilestoneStatus,
      late: items.filter((m) => m.status !== "completed" && m.status !== "cancelled" && delayDays(m, today) > 0).length,
      incoming,
    };
  };
  /** Type the Predecessors cell: "1.2, 2.1SS+3d". Unknown numbers and loops are refused, not guessed. */
  const setPredText = (m: ApiMilestone, text: string): boolean => {
    const { preds, unknown } = parsePreds(text, idOfNumber);
    if (unknown.length) { toast(`No task numbered ${unknown.join(", ")}. Use the numbers in the # column, e.g. 1.2 or 2.1SS+3d.`, "error"); return false; }
    const loop = preds.find((q) => q.id === m.id || wouldCycle(rows, m.id, q.id));
    if (loop) { toast(`${wbs.task.get(loop.id) || "That task"} already waits on this one, so it cannot come before it.`, "error"); return false; }
    update(m.id, withPreds(m, preds));
    return true;
  };
  const thL = "px-2 py-2 text-left", thR = "px-2 py-2 text-right";
  const HEAD: Record<ColKey, ReactNode> = {
    id: <th key="id" className={thL}>#</th>,
    name: <th key="name" className={thL}>Task name</th>,
    type: <th key="type" className={thL}>Type</th>,
    start: <th key="start" className={thL}>Start</th>,
    finish: <th key="finish" className={thL}>Finish</th>,
    actualStart: <th key="actualStart" className={`${thL} bg-sky-50 text-sky-800`} title="Only entered when it differs from the plan">Actual start</th>,
    actualFinish: <th key="actualFinish" className={`${thL} bg-sky-50 text-sky-800`} title="Only entered when it differs from the plan">Actual finish</th>,
    duration: <th key="duration" className={thR}>Duration</th>,
    predecessors: <th key="predecessors" className={thL} title="The tasks this one waits on, by number. 1.2 means it starts after 1.2 finishes; add SS, FF or SF for the other link types and +3d or -2d for a lag.">Predecessors</th>,
    relationship: <th key="relationship" className={thL} title="FS finish to start, SS start to start, FF finish to finish, SF start to finish">Relationship</th>,
    float: <th key="float" className={thR} title="Float: how many days a task can slip before the project finish moves. Worked out automatically; it cannot be typed.">Float</th>,
    critical: <th key="critical" className={thL} title="Critical: Yes when the task has no float, so any delay to it delays the project. Worked out automatically; it cannot be set by hand.">Critical</th>,
    status: <th key="status" className={thL}>Status</th>,
    assigned: <th key="assigned" className={thL}>Assigned to</th>,
    tags: <th key="tags" className={thL}>Tags</th>,
    percent: <th key="percent" className={thL}>% complete</th>,
  };
  const previewProject: ApiProject = { ...project, schedule: { ...(project.schedule || { milestones: [] }), milestones: rows } };
  const pickList = MASTER_PHASES.filter((p) => p.name.toLowerCase().includes(pickQuery.trim().toLowerCase()));

  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-primary hover:text-primary disabled:opacity-50";
  const cell = "px-2 py-2 align-middle";
  const dateInp = "w-[7.6rem] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-700 hover:border-slate-200 focus:border-primary focus:bg-white focus:outline-none disabled:hover:border-transparent";

  // The forms sit down the right-hand side; on a wide screen the schedule makes room for them.
  const panelOpen = !!editing || !!phaseEdit;
  return (
    <div className={`space-y-4 transition-[margin] ${panelOpen ? (panelNarrow ? "sm:mr-9" : "xl:mr-[29rem]") : ""}`}>
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

      {/* CR 300 - the schedule's three views: the approved baselines, the live schedule, and the
          history of every schedule sent or received. */}
      <div role="tablist" aria-label="Schedule views" className="flex items-center gap-1 border-b border-slate-200">
        {([["baseline", "Baseline", register.filter((e) => kindOf(e) === "baseline" && !e.archived).length], ["current", "Current", 0], ["history", "History", register.filter((e) => !e.archived).length]] as Array<["baseline" | "current" | "history", string, number]>).map(([k, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={regTab === k} onClick={() => setRegTab(k)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-bold transition-colors ${regTab === k ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-900"}`}>
            {label}{n > 0 && <span className={`rounded-full px-1.5 text-[10px] ${regTab === k ? "bg-primary/10" : "bg-slate-100"}`}>{n}</span>}
          </button>
        ))}
        {curBase && regTab !== "baseline" && <span className="ml-auto hidden text-[11px] text-slate-400 sm:inline">Measured against baseline <b className="text-slate-600">{entryCode(curBase)}</b></span>}
      </div>

      {regTab === "baseline" && <BaselineTab entries={register} h={handlers} onCreate={() => void startBaseline(false)} onUpload={() => void startBaseline(true)} frozen={frozen} />}
      {regTab === "history" && (
        <HistoryTab entries={register} h={handlers} onUpload={() => setEntryDialog({ mode: "upload" })} currentBaselineId={curBase?._id} frozen={frozen} />
      )}

      {/* CR 237 - no schedule yet: create one on purpose, instead of a half-empty editor. */}
      {regTab === "current" && !started && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
          <Flag size={30} className="mx-auto text-slate-300" />
          <p className="mt-3 font-display text-lg font-bold text-slate-900">No schedule yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            {!canEdit
              ? "The project manager has not created this schedule yet."
                : "Create the project schedule: pick the phases and tasks, group them by category, or import a schedule prepared in Excel."}
          </p>
          {canEdit && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={startCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary"><Plus size={13} /> Create schedule</button>
              <button type="button" onClick={() => openPhase(null)} className={btn}><FolderPlus size={13} /> Add a phase</button>
              <button type="button" onClick={() => xlsInput.current?.click()} className={btn}><FileUp size={13} /> Import from Excel</button>
              <button type="button" onClick={() => setImportOpen(true)} className={btn}><Import size={13} /> Copy from another project</button>
              <button type="button" onClick={() => void downloadTemplate()} className={btn}><FileSpreadsheet size={13} /> Excel template</button>
            </div>
          )}
        </div>
      )}

      {regTab === "current" && started && (
      <div className="space-y-4">
        <CurrentSummary
          label={loadedFrom ? `${loadedFrom} (open in the editor)` : lastFiled ? `last filed as "${entryTitle(lastFiled)}"` : project.schedule?.savedAt || live.length ? "working schedule" : "Not saved yet"}
          dataDate={(project.schedule?.savedAt || "").slice(0, 10)}
          finish={cpm.finish}
          progress={overallPct}
          baseline={curBase}
          dirty={dirty}
        />
        {/* CR 268, extended 2026-09-22: one bar for the whole schedule. It stays at the top of the
            page while you scroll the table AND the timeline chart, because the actions belong to
            both (the chart is part of the same schedule). */}
        <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-bold text-slate-900">Phases & Milestones</h3>
            {hasCategories && (
              <button type="button" onClick={() => setCollapsed((s) => (s.size ? new Set() : new Set(groups.map((g) => g.category))))} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:text-primary">
                {collapsed.size ? "Expand all" : "Collapse all"}
              </button>
            )}
            {loadedFrom && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Editing: {loadedFrom}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="relative">
              <select value={view} onChange={(e) => setView(e.target.value as View)} className={`${btn} appearance-none pr-7`}>
                {VIEWS.map(([k, l]) => <option key={k} value={k}>View: {l}</option>)}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
            </label>

            <button type="button" onClick={() => setDisplayOpen(true)} className={btn} title="Choose the columns, what is written on the bars, the phases in view and the colours">
              <SlidersHorizontal size={13} /> Display options{display.hiddenPhases.length ? ` (${catList.length - display.hiddenPhases.filter((c) => catList.includes(c)).length}/${catList.length} phases)` : ""}
            </button>

            {/* CR 300 - the critical path, the tasks with no float, marked in red; off for a plain view. */}
            <button
              type="button"
              onClick={toggleCritical}
              aria-pressed={showCritical}
              title={showCritical ? "The critical path is in red: the chain of tasks that sets the finish date. Worked out automatically. Click to hide it." : "Show the critical path: the chain of tasks where any delay moves the project finish. Worked out automatically."}
              className={`${btn} ${showCritical ? "!border-red-200 !bg-red-50 !text-red-600" : ""}`}
            >
              <span className={`h-2 w-3.5 rounded-sm ${showCritical ? "bg-red-500" : "bg-slate-300"}`} /> Critical path{showCritical && cpm.critical.size ? ` (${cpm.critical.size})` : ""}
            </button>

            <button
              type="button"
              onClick={toggleFloat}
              aria-pressed={showFloat}
              title={showFloat ? "Float is drawn after each bar: the days a task can slip without moving the finish. Click to hide it." : "Show float on the chart: the days each task can slip without moving the project finish. Worked out automatically."}
              className={`${btn} ${showFloat ? "!border-sky-200 !bg-sky-50 !text-sky-700" : ""}`}
            >
              <span className={`h-2 w-3.5 rounded-sm border border-dashed ${showFloat ? "border-sky-500 bg-sky-100" : "border-slate-300"}`} /> Float
            </button>

            {/* CR 284 - Preview is the one people reach for on every pass over a schedule, so it sits
                in the bar itself rather than two clicks inside Export. Print stays in the menu; it
                opens the same preview, with the printer a click away. */}
            <button type="button" onClick={printPdf} className={btn} title="See the schedule as it will print">
              <Eye size={13} /> Preview
            </button>

            {/* Everything that produces a file or a printout. */}
            <ToolMenu label="Export" icon={<Download size={13} />}>
              <button type="button" onClick={printPdf} className={MENU_ITEM}><Printer size={13} /> Print</button>
              <button type="button" onClick={startDownload} disabled={busy === "pdf"} className={MENU_ITEM}>
                {busy === "pdf" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download PDF
              </button>
              <button type="button" onClick={() => downloadCsv()} className={MENU_ITEM}><FileSpreadsheet size={13} /> Download for Excel</button>
              <div className="my-1 border-t border-slate-100" />
              <ShareMenu variant="button" fileName={fileName} fileUrl="" projectName={project.name} prepareFile={sharePdf} className={MENU_ITEM} />
            </ToolMenu>

            {/* CR 285 - one blue Add holding every way of putting something on the schedule,
                milestone first. Clearing the schedule is not one of them: it undoes the lot, so it
                stands apart, in red, and asks twice. */}
            {canEdit && (
              <>
                <ToolMenu label="Add" icon={<Plus size={13} />} tone="solid">
                  <button type="button" onClick={() => openPhase(null)} className={MENU_ITEM}><FolderPlus size={13} /> Phase</button>
                  <button type="button" onClick={() => addTask()} className={MENU_ITEM}><ListTodo size={13} /> Task</button>
                  <button type="button" onClick={() => addMilestone()} className={MENU_ITEM}><Diamond size={13} /> Milestone</button>
                  <div className="my-1 border-t border-slate-100" />
                  <button type="button" onClick={() => xlsInput.current?.click()} disabled={busy === "import"} className={MENU_ITEM}>
                    {busy === "import" ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />} Import from Excel
                  </button>
                  <button type="button" onClick={() => setImportOpen(true)} className={MENU_ITEM}><Import size={13} /> Import from another project</button>
                  <button type="button" onClick={() => void downloadTemplate()} className={MENU_ITEM}><FileSpreadsheet size={13} /> Excel template</button>
                </ToolMenu>
                {/* CR 317 - the three ways to save: Current only, a dated record in History, or the baseline. */}
                <ToolMenu label="Save" icon={<Save size={13} />} title="Save, save for submittal / history, or save as baseline">
                  <button type="button" onClick={() => void save()} disabled={!!busy || (!dirty && !loadedFrom)} className={MENU_ITEM} title="Updates Current. Nothing is filed in History."><Save size={13} /> Save</button>
                  <button type="button" onClick={() => (rows.length ? setSubmittalOpen(true) : toast("The schedule is empty. Add its tasks first.", "error"))} className={MENU_ITEM} title="Files a locked, dated copy in History"><BookmarkCheck size={13} /> Save for submittal / history</button>
                  <button type="button" onClick={() => void startBaseline(false)} className={MENU_ITEM} title="Create the baseline from the current schedule"><CalendarCheck2 size={13} /> Save as baseline</button>
                </ToolMenu>
                {rows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void clearSchedule()}
                    title="Take every phase and milestone off this schedule"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600 transition-colors hover:border-red-400 hover:bg-red-100"
                  >
                    <Eraser size={13} /> Clear schedule
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col lg:flex-row">
          {/* Master list */}
          {canEdit && (
            <aside className={`shrink-0 border-b border-slate-100 lg:border-b-0 lg:border-r ${pickerOpen ? "lg:w-64" : "lg:w-12"}`}>
              <button type="button" onClick={() => setPickerOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50" title={pickerOpen ? "Hide the list" : "Select phases / milestones"}>
                {pickerOpen ? <><span className="flex items-center gap-1.5"><ListChecks size={14} className="text-primary" /> Select phases / milestones</span><ChevronDown size={14} className="text-slate-400" /></> : <ListChecks size={16} className="mx-auto text-primary" />}
              </button>
              {pickerOpen && (
                <div className="px-3 pb-3">
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Add to category
                    <select value={addTo} onChange={(e) => setAddTo(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-slate-700 focus:border-primary focus:outline-none">
                      <option value="">Each item's usual category</option>
                      {catList.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
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
            {rows.length === 0 && catList.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Flag size={28} className="mx-auto text-slate-300" />
                <p className="mt-2 text-sm font-bold text-slate-700">No phases yet</p>
                <p className="mt-1 text-xs text-slate-500">{canEdit ? "Tick the phases that apply on the left, add a custom one, or import them from a similar project." : "The project manager has not set up the timeline yet."}</p>
              </div>
            ) : (
              <div className="max-h-[72vh] overflow-auto">
                <table className="w-full text-xs" style={{ minWidth: 330 + cols.length * 96 }}>
                  {/* CR 323 - the columns are a choice: which show, and in what order (Display options). */}
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-[0_1px_0_#e2e8f0]">
                    <tr>
                      <th className="w-8" />
                      {cols.map((k) => HEAD[k])}
                      <th className="px-2 py-2 text-center" title="The project manager's note on this task. Internal, never printed.">Remark</th>
                      <th className="px-2 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => {
                      const folded = collapsed.has(g.category);
                      const ph = phaseRollup(g.items.map(({ m }) => m), g.category);
                      const phCritical = showCritical && ph.float !== null && ph.float <= 0;
                      // CR 321 - the phase's own record: its colour, and a finish target set by hand.
                      const info = phases.find((x) => x.name.toLowerCase() === g.category.toLowerCase());
                      const phColor = phaseColorOf(phases, g.category, catList.indexOf(g.category));
                      const target = info?.finishMode === "manual" ? parseDate(info.targetFinish) : null;
                      const pastTarget = !!target && !!ph.to && ph.to > target;
                      const linkNo = !info?.pred ? "" : info.pred.kind === "phase" ? wbs.phase.get(catList.find((c) => c.toLowerCase() === info.pred!.ref.toLowerCase()) || "") || "" : wbs.task.get(info.pred.ref) || "";
                      const phLink = info?.pred && linkNo ? predLabel({ id: "", type: info.pred.type, lag: info.pred.lag }, `${info.pred.kind === "phase" ? "Phase " : ""}${linkNo}`) : "";
                      const P: Record<ColKey, ReactNode> = {
                        id: <td key="id" className={`${cell} font-bold text-slate-800`}>{ph.number}</td>,
                        name: (
                          <td key="name" className={`${cell} min-w-[13rem]`}>
                            <button type="button" onClick={() => toggleCategory(g.category)} className="flex items-center gap-1.5 text-left" title={folded ? "Show its tasks" : "Fold its tasks away"}>
                              {folded ? <ChevronRight size={14} className="shrink-0 text-slate-500" /> : <ChevronDown size={14} className="shrink-0 text-slate-500" />}
                              {g.category !== UNCATEGORISED && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: phColor }} />}
                              <span className="font-bold text-slate-900" title={info?.description || undefined}>{g.category}</span>
                              <span className="text-[10px] font-semibold text-slate-400">{g.items.length}</span>
                              {ph.late > 0 && <span className="rounded-full bg-red-50 px-1.5 text-[9px] font-bold text-red-600">{ph.late} late</span>}
                            </button>
                          </td>
                        ),
                        type: <td key="type" className={cell}><span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200">Phase</span></td>,
                        start: <td key="start" className={`${cell} font-bold text-slate-800`}>{ph.from ? fmtDay(ph.from) : "-"}</td>,
                        finish: <td key="finish" className={`${cell} font-bold ${pastTarget ? "text-red-600" : "text-slate-800"}`} title={pastTarget ? `Past the phase's target finish of ${fmtDay(target)}` : target ? `Target finish ${fmtDay(target)}` : undefined}>{ph.to ? fmtDay(ph.to) : "-"}</td>,
                        actualStart: <td key="actualStart" className={`${cell} text-slate-600`}>{ph.actualFrom ? fmtDay(ph.actualFrom) : ""}</td>,
                        actualFinish: <td key="actualFinish" className={`${cell} text-slate-600`}>{ph.actualTo ? fmtDay(ph.actualTo) : ""}</td>,
                        duration: <td key="duration" className={`${cell} text-right font-bold tabular-nums text-slate-800`}>{ph.days !== null ? `${ph.days} days` : "-"}</td>,
                        predecessors: <td key="predecessors" className={`${cell} text-[11px] text-slate-500`} title={phLink ? "What the phase itself waits on, then the links into it from the tasks of other phases" : "Links into this phase from the tasks of other phases"}>{phLink && <b className="font-bold text-slate-700">{phLink}{ph.incoming.length ? ", " : ""}</b>}{ph.incoming.length ? ph.incoming.join(", ") : phLink ? "" : "-"}</td>,
                        relationship: <td key="relationship" className={`${cell} text-[11px] text-slate-500`}>{info?.pred && linkNo ? info.pred.type : "-"}</td>,
                        float: <td key="float" className={`${cell} text-right text-slate-300`}>-</td>,
                        critical: <td key="critical" className={`${cell} text-slate-300`}>-</td>,
                        status: <td key="status" className={cell}><span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${STATUS_META[info?.status && info.status !== "not_started" ? info.status : ph.status].chip}`}>{STATUS_META[info?.status && info.status !== "not_started" ? info.status : ph.status].label}</span></td>,
                        assigned: <td key="assigned" className={`${cell} max-w-[12rem] truncate text-[11px] text-slate-600`} title={(info?.assignedTo || []).join(", ")}>{(info?.assignedTo || []).join(", ") || "-"}</td>,
                        tags: <td key="tags" className={cell} />,
                        percent: (
                          <td key="percent" className={cell}>
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-right text-xs font-bold tabular-nums text-slate-700">{ph.pct}%</span>
                              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200"><span className={`block h-full rounded-full ${ph.pct >= 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${ph.pct}%` }} /></span>
                            </div>
                          </td>
                        ),
                      };
                      return (
                      <Fragment key={g.category || "all"}>
                        {/* CR 300 - a phase is a row of its own: numbered, typed, with its figures rolled up from its tasks.
                            CR 324 - tinted with the phase's colour. */}
                        {g.category && (
                          <tr className="border-t border-slate-200" style={{ background: g.category === UNCATEGORISED ? "#f8fafc" : `${phColor}14`, boxShadow: phCritical ? `inset 3px 0 0 ${display.colors.critical}` : undefined }}>
                            <td className="pl-2" />
                            {cols.map((k) => P[k])}
                            <td className={cell} />
                            <td className={`${cell} text-right`}>
                              {canEdit && (
                                <div className="inline-flex items-center gap-0.5">
                                  <button type="button" onClick={() => addInCategory(g.category)} title={`Add a task or milestone to ${g.category}`} className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-1 text-[10px] font-bold text-blue-600 shadow-sm ring-1 ring-slate-200 hover:bg-blue-50"><Plus size={11} /> Task</button>
                                  <button type="button" onClick={() => (g.category === UNCATEGORISED ? void renameCategory(g.category) : openPhase(g.category))} title={g.category === UNCATEGORISED ? "Name this group to make it a phase" : "Edit this phase"} className="rounded p-1 text-slate-400 hover:bg-white hover:text-primary"><Pencil size={12} /></button>
                                  {g.category !== UNCATEGORISED && <button type="button" onClick={() => moveCategory(g.category, -1)} disabled={catList.indexOf(g.category) <= 0} title="Move up" className="rounded p-1 text-slate-400 hover:bg-white disabled:opacity-30"><ArrowUp size={12} /></button>}
                                  {g.category !== UNCATEGORISED && <button type="button" onClick={() => moveCategory(g.category, 1)} disabled={catList.indexOf(g.category) >= catList.length - 1} title="Move down" className="rounded p-1 text-slate-400 hover:bg-white disabled:opacity-30"><ArrowDown size={12} /></button>}
                                  <button type="button" onClick={() => void deleteCategory(g.category)} title="Delete this phase" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={12} /></button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                        {g.category && !folded && g.items.length === 0 && (
                          <tr className="border-t border-slate-100">
                            <td colSpan={cols.length + 3} className="px-10 py-3 text-[11px] italic text-slate-400">
                              No tasks in {g.category} yet.{canEdit && <> <button type="button" onClick={() => addInCategory(g.category)} className="font-bold not-italic text-blue-600 hover:underline">Add one</button>, or tick items on the left with "Add to category" set to {g.category}.</>}
                            </td>
                          </tr>
                        )}
                        {!folded && g.items.map(({ m, index }) => {
                      const d = plannedDays(m);
                      const late = delayDays(m, today);
                      const slip = startSlip(m);
                      const moved = (m.baselineStart && m.baselineStart !== m.plannedStart) || (m.baselineEnd && m.baselineEnd !== m.plannedEnd);
                      const pct = phasePercent(m);
                      const isMs = !!m.isMilestone || isMilestonePoint(m);
                      const fl = cpm.float.get(m.id);
                      const crit = showCritical && fl !== undefined && fl <= 0;
                      const preds = predsOf(m);
                      const predText = preds.map((q) => { const n = wbs.task.get(q.id); return n ? predLabel(q, n) : ""; }).filter(Boolean).join(", ");
                      const C: Record<ColKey, ReactNode> = {
                        id: <td key="id" className={`${cell} tabular-nums text-slate-500`}>{wbs.task.get(m.id) || index + 1}</td>,
                        name: (
                          <td key="name" className={`${cell} min-w-[13rem]`}>
                            <button type="button" onClick={() => openItem(m)} className={`flex items-start gap-2 text-left ${g.category ? "pl-4" : ""}`}>
                              {isMs
                                ? <MilestoneMark icon={m.icon} size={11} color={display.colors.milestone} className="mt-0.5" />
                                : <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: crit ? display.colors.critical : display.colors.normal }} />}
                              <span>
                                <span className="block font-semibold text-slate-800 hover:text-primary">{m.name}</span>
                                {!cols.includes("assigned") && m.responsible?.length ? (
                                  <span className="block max-w-[16rem] truncate text-[10px] text-slate-400">{m.responsible.join(", ")}</span>
                                ) : null}
                              </span>
                            </button>
                          </td>
                        ),
                        type: (
                          <td key="type" className={cell}>
                            {/* CR 300 - Task or Milestone; a milestone has no length, so its end follows its start. */}
                            <select
                              disabled={!canEdit}
                              value={isMs ? "milestone" : "task"}
                              onChange={(e) => update(m.id, e.target.value === "milestone" ? { isMilestone: true } : { isMilestone: false })}
                              className={`rounded-md border px-1 py-0.5 text-[10px] font-bold ${isMs ? "border-slate-300 bg-slate-100 text-slate-800" : "border-blue-200 bg-blue-50 text-blue-700"}`}
                            >
                              <option value="task">Task</option>
                              <option value="milestone">Milestone</option>
                            </select>
                          </td>
                        ),
                        start: (
                          <td key="start" className={cell}>
                            <input type="date" disabled={!canEdit} value={m.plannedStart || ""} onChange={(e) => update(m.id, { plannedStart: e.target.value })} className={dateInp} />
                            {moved && m.baselineStart !== m.plannedStart && <span className="block px-1 text-[10px] text-slate-400" title="Baseline start">was {fmtDay(m.baselineStart)}</span>}
                          </td>
                        ),
                        finish: (
                          <td key="finish" className={cell}>
                            <input type="date" disabled={!canEdit || isMs} value={m.plannedEnd || ""} min={m.plannedStart || undefined} onChange={(e) => update(m.id, { plannedEnd: e.target.value })} className={`${dateInp} ${overrunsDeadline(m, deadline) > 0 ? "!text-red-600 font-bold" : ""}`} title={isMs ? "A milestone ends the day it starts" : overrunsDeadline(m, deadline) > 0 ? `${overrunsDeadline(m, deadline)} days past the contract deadline` : undefined} />
                            {moved && m.baselineEnd !== m.plannedEnd && <span className="block px-1 text-[10px] text-slate-400" title="Baseline end">was {fmtDay(m.baselineEnd)}</span>}
                          </td>
                        ),
                        actualStart: (
                          <td key="actualStart" className={`${cell} bg-sky-50/50`}>
                            <input type="date" disabled={!canEdit} value={m.actualStart || ""} onChange={(e) => update(m.id, { actualStart: e.target.value })} className={`${dateInp} ${slip > 0 ? "!text-red-600 font-bold" : ""}`} />
                          </td>
                        ),
                        actualFinish: (
                          <td key="actualFinish" className={`${cell} bg-sky-50/50`}>
                            <input type="date" disabled={!canEdit} value={m.actualEnd || ""} min={m.actualStart || undefined} onChange={(e) => update(m.id, { actualEnd: e.target.value })} className={`${dateInp} ${late > 0 && m.actualEnd ? "!text-red-600 font-bold" : ""}`} />
                            {late > 0 && <span className="block px-1 text-[10px] font-bold text-red-600">{late} day{late === 1 ? "" : "s"} late</span>}
                          </td>
                        ),
                        duration: (
                          <td key="duration" className={`${cell} text-right tabular-nums text-slate-600`}>
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
                        ),
                        predecessors: (
                          <td key="predecessors" className={cell}>
                            <input
                              key={`${m.id}-${predText}`}
                              disabled={!canEdit}
                              defaultValue={predText}
                              placeholder="-"
                              onBlur={(e) => { if (e.target.value.trim() !== predText && !setPredText(m, e.target.value)) e.target.value = predText; }}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { (e.target as HTMLInputElement).value = predText; (e.target as HTMLInputElement).blur(); } }}
                              title="The tasks this one waits on, by number: 1.2, 2.1SS, 3.3FS+5d, 1.3FF-2d"
                              className="w-24 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[11px] tabular-nums text-slate-700 hover:border-slate-200 focus:border-primary focus:bg-white focus:outline-none disabled:hover:border-transparent"
                            />
                          </td>
                        ),
                        relationship: <td key="relationship" className={`${cell} text-[11px] tabular-nums text-slate-600`} title="Finish to start, start to start, finish to finish or start to finish, for each predecessor in turn">{preds.length ? preds.map((q) => q.type).join(", ") : "-"}</td>,
                        float: (
                          <td key="float" className={`${cell} text-right font-bold tabular-nums ${fl === undefined ? "text-slate-300" : fl <= 0 ? "text-red-600" : "text-emerald-600"}`} title={fl === undefined ? "No dates yet" : fl <= 0 ? "Critical: any delay here moves the project finish" : `Can slip ${fl} day${fl === 1 ? "" : "s"} before the project finish moves`}>
                            {fl === undefined ? "-" : fl}
                          </td>
                        ),
                        // CR 319 - read-only: the system decides what is critical.
                        critical: <td key="critical" className={`${cell} text-[11px] font-bold ${fl === undefined ? "text-slate-300" : fl <= 0 ? "text-red-600" : "text-slate-500"}`}>{fl === undefined ? "-" : fl <= 0 ? "Yes" : "No"}</td>,
                        status: (
                          <td key="status" className={cell}>
                            <select disabled={!canEdit} value={m.status || "not_started"} onChange={(e) => update(m.id, statusPatch(m, e.target.value as MilestoneStatus))} className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${STATUS_META[m.status || "not_started"].chip}`}>
                              {STATUS_ORDER.map((s2) => <option key={s2} value={s2}>{STATUS_META[s2].label}</option>)}
                            </select>
                          </td>
                        ),
                        assigned: <td key="assigned" className={`${cell} max-w-[12rem] truncate text-[11px] text-slate-600`} title={(m.responsible || []).join(", ")}>{(m.responsible || []).join(", ") || "-"}</td>,
                        tags: <td key="tags" className={cell}><span className="flex flex-wrap gap-1">{(m.tags || []).map((t) => <span key={t} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{t}</span>)}</span></td>,
                        percent: (
                          <td key="percent" className={cell}>
                            <div className="flex items-center gap-2">
                              <input type="number" min={0} max={100} step={5} disabled={!canEdit} value={pct} onChange={(e) => update(m.id, { percent: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })} className="w-12 rounded-md border border-slate-200 px-1 py-0.5 text-right text-xs tabular-nums disabled:border-transparent" />
                              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} /></span>
                            </div>
                          </td>
                        ),
                      };
                      return (
                        <tr
                          key={m.id}
                          draggable={canEdit && view === "all"}
                          onDragStart={() => { dragFrom.current = index; }}
                          onDragOver={(e: DragEvent) => { if (dragFrom.current !== null) { e.preventDefault(); setDragOver(index); } }}
                          onDragLeave={() => setDragOver((v) => (v === index ? null : v))}
                          onDrop={(e) => { e.preventDefault(); if (dragFrom.current !== null) move(dragFrom.current, index); dragFrom.current = null; setDragOver(null); }}
                          onDragEnd={() => { dragFrom.current = null; setDragOver(null); }}
                          className={`border-t border-slate-100 ${dragOver === index ? "bg-blue-50" : crit ? "bg-red-50/30 hover:bg-red-50/60" : "hover:bg-slate-50/60"}`}
                          style={crit ? { boxShadow: `inset 3px 0 0 ${display.colors.critical}` } : undefined}
                        >
                          <td className="pl-2 text-slate-300">{canEdit && view === "all" && <GripVertical size={14} className="cursor-grab" />}</td>
                          {cols.map((k) => C[k])}
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
                                <button type="button" onClick={() => void saveRow(m)} disabled={rowBusy === m.id} title="Save this task now" className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-1.5 py-1 text-[10px] font-bold text-white hover:bg-primary disabled:opacity-50">
                                  {rowBusy === m.id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save
                                </button>
                              )}
                              <button type="button" onClick={() => openItem(m)} title={canEdit ? "Edit" : "View"} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-primary"><Pencil size={13} /></button>
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
                    {shown.length === 0 && <tr><td colSpan={cols.length + 3} className="px-4 py-6 text-center text-slate-400">Nothing in this view.</td></tr>}
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
            <h3 className="font-display text-base font-bold text-slate-900">Gantt chart</h3>
            {/* CR 269 - how much of the calendar fits on screen: months, weeks or single days. */}
            <div className="flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Chart zoom">
              {GANTT_ZOOMS.map(([k, label]) => (
                <button key={k} type="button" onClick={() => setZoom(k)} className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${zoom === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                  {label}
                </button>
              ))}
            </div>
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
          {/* CR 238 - the chart follows the table's grouping. CR 300 - a folded phase keeps its summary bar. */}
          <GanttChart
            rows={groups.flatMap((g) => (collapsed.has(g.category) ? [] : g.items.map((s) => s.m)))}
            sections={hasCategories ? groups.map((g) => ({ category: g.category, items: g.items.map((s) => s.m), folded: collapsed.has(g.category), number: wbs.phase.get(g.category), color: g.category === UNCATEGORISED ? undefined : phaseColorOf(phases, g.category, catList.indexOf(g.category)) })) : undefined}
            contractStart={contractStart}
            deadline={deadline}
            originalDeadline={project.endDate}
            zoom={zoom}
            baseline={baselineMap}
            cpm={cpm}
            showCritical={showCritical}
            showFloat={showFloat}
            showActual={display.actual}
            bars={display.bars}
            colors={display.colors}
            stepper
            numbers={wbs.task}
            onMove={canEdit ? dragMove : undefined}
            onResize={canEdit ? dragResize : undefined}
            onOpen={openItem}
          />
          <GanttLegend colors={display.colors} />
        </div>
      )}
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
            <button type="button" onClick={() => void save()} disabled={!!busy || (!dirty && !loadedFrom)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-primary disabled:opacity-50">
              {busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
            </button>
          </div>
        </div>
      )}

      {/* CR 321 - the three forms, as a panel beside the schedule. Keyed, so opening another item starts clean. */}
      {editing && (
        <Fragment key={editing.id}><ItemForm
          kind={editing.isMilestone || isMilestonePoint(editing) ? "milestone" : "task"}
          initial={editing}
          isNew={!rows.some((r) => r.id === editing.id)}
          canEdit={canEdit}
          rows={rows}
          catList={catList}
          ctx={planCtx}
          deadline={deadline}
          narrow={panelNarrow}
          onNarrow={setPanelNarrow}
          onSave={applyEditor}
          onClose={() => setEditing(null)}
        /></Fragment>
      )}
      {phaseEdit && (
        <Fragment key={phaseEdit.name ?? "new-phase"}><PhaseForm
          initial={phases.find((x) => x.name.toLowerCase() === (phaseEdit.name || "").toLowerCase()) || { name: phaseEdit.name || "" }}
          oldName={phaseEdit.name}
          number={phaseEdit.name === null ? catList.length + 1 : catList.indexOf(phaseEdit.name) + 1}
          catList={catList}
          rows={rows}
          phases={phases}
          canEdit={canEdit}
          narrow={panelNarrow}
          onNarrow={setPanelNarrow}
          onSave={savePhase}
          onClose={() => setPhaseEdit(null)}
        /></Fragment>
      )}
      {importOpen && <ImportPanel currentId={project.id} onPick={importFrom} onClose={() => setImportOpen(false)} />}
      {dialogs}
      {entryDialog && (
        <EntryDialog
          state={entryDialog}
          defaults={{ client: project.clientInfo?.name || "", contractCompletion: deadline || "", nextBaseline, draft: draftBase }}
          onSubmit={submitEntry}
          onClose={() => setEntryDialog(null)}
        />
      )}

      {displayOpen && <DisplayOptions value={display} onChange={setDisplay} phases={catList} onClose={() => setDisplayOpen(false)} />}
      {approving && (
        <ApproveDialog entry={approving} contractCompletion={deadline || ""} differs={sig(base) !== sig(approving.milestones)} unsaved={dirty}
          onSubmit={approveBaseline} onClose={() => setApproving(null)} />
      )}
      {passkeyFor && <PasskeyDialog entry={passkeyFor} onSubmit={deleteLocked} onClose={() => setPasskeyFor(null)} />}
      {submittalOpen && <SubmittalDialog entries={register} unsaved={dirty || !!loadedFrom} onSubmit={saveSubmittal} onClose={() => setSubmittalOpen(false)} />}

      {/* CR 275 - no "fit to one page" here: the schedule runs section by section down the sheet
          and carries on to the next page when it runs out, which is what was asked for. */}
      {previewOpen && (
        <PdfPreviewModal title={`${scheduleName}${subject ? ` · ${entryCode(subject)}` : ""} · ${project.name}`} fileName={fileName} build={buildPdf} onClose={() => { setPreviewOpen(false); setSubject(null); }}
          toggles={[{ key: "remarks", label: "Print remarks", title: "Print each row's remark in its own column on that row", icon: <StickyNote size={12} />, value: printRemarks, onChange: setPrintRemarks }]}
          rebuildKey={printRemarks ? "remarks" : "plain"}
          actions={canEdit && !subject && (dirty || !!loadedFrom) ? [{ label: "Save", icon: <Save size={12} />, onClick: () => save() }] : undefined}
          hint={canEdit && !subject && (dirty || !!loadedFrom) ? "This is how the schedule will print. Save it from here once it looks right." : undefined} />
      )}

      {/* CR 241 / 244 - the schedule files, by schedule, searchable. */}
      <ScheduleFiles ref={filesRef} projectId={project.id} projectName={project.name} canEdit={canEdit} highlight={filedTo} />

      {/* CR 273 - before anything is built: does this print carry the remarks? */}
      {askRemarks && createPortal(
        <div className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={() => setAskRemarks(null)}>
          <div className="my-24 w-full max-w-sm rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <StickyNote size={15} className="text-amber-500" /> {askRemarks === "preview" ? "Preview the schedule" : "Download the schedule"}
              </p>
              <button onClick={() => setAskRemarks(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X size={18} /></button>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-xs text-slate-600">What goes on the printed schedule?</p>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-primary">
                <input type="checkbox" checked={printRemarks} onChange={(e) => setPrintRemarks(e.target.checked)} className="accent-emerald-600" />
                <span>Remarks column<span className="block text-[10px] font-medium text-slate-400">The project manager's internal notes.</span></span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-primary">
                <input type="checkbox" checked={printActual} onChange={(e) => setPrintActual(e.target.checked)} className="accent-emerald-600" />
                <span>Actual start and end dates<span className="block text-[10px] font-medium text-slate-400">What really happened, beside the planned dates.</span></span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-primary">
                <input type="checkbox" checked={printOverview} onChange={(e) => setPrintOverview(e.target.checked)} className="accent-emerald-600" />
                <span>Timeline overview<span className="block text-[10px] font-medium text-slate-400">The dates, time left and phases, as at the top of the schedule. Printed after the chart.</span></span>
              </label>

              {/* CR 288 - the sheet, with what the chart costs on each at the chosen zoom. */}
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Paper size (landscape)</p>
                <div className="space-y-1">
                  {(Object.keys(TIMELINE_PAPERS) as TimelinePaper[]).map((k) => {
                    const n = sheetCounts?.[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setPaper(k)}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold transition-colors ${paper === k ? "border-primary bg-emerald-50/60 text-slate-800" : "border-slate-200 text-slate-600 hover:border-primary"}`}
                      >
                        <span>{TIMELINE_PAPERS[k].label}<span className="ml-1.5 text-[10px] font-medium text-slate-400">{TIMELINE_PAPERS[k].hint}</span></span>
                        {n !== undefined && (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${n <= 1 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                            {n <= 1 ? "chart fits on one" : `${n} sheets`}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-[10px] text-slate-400">
                The chart prints at the zoom you have chosen: {GANTT_ZOOMS.find(([k]) => k === zoom)?.[1].toLowerCase()}, across the whole timeline.
                {sheetCounts && sheetCounts[paper] > 1 && ` It needs ${sheetCounts[paper]} sheets at this size; a larger sheet above holds it on one.`}
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setAskRemarks(null)} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
                <button onClick={() => goAhead()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary">
                  {askRemarks === "preview" ? <><Printer size={13} /> Open the preview</> : <><Download size={13} /> Download</>}
                </button>
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
              {(imported.linked > 0 || imported.unmatchedLinks > 0) && (
                <p className="text-[10px] text-slate-500">
                  {imported.linked} link{imported.linked === 1 ? "" : "s"} read from the Predecessors column{imported.unmatchedLinks > 0 ? `; ${imported.unmatchedLinks} named no task in the sheet and were left out` : ""}.
                </p>
              )}
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
