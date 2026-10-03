import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Archive, ArchiveRestore, ArrowDown, ArrowUp, Boxes, Building2, ChevronDown, ChevronRight, ClipboardCheck, Cog, Download, Eye, EyeOff, FileSpreadsheet, FileText,
  FileUp, Filter, GripVertical, Printer, HardHat, HelpCircle, Loader2, MoreVertical, Package, PenTool, Pencil, Plus, Search, Settings2, Trash2, Truck, Wrench, X,
} from "lucide-react";
import {
  createWorkPackage, deleteWorkPackage, fetchProcurementPOs, fetchProjectAgreements, fetchRfqs, fetchWorkPackages, importWorkPackages, reorderWorkPackages, updateWorkPackage, withFileToken,
  createAgreement, createManualPO, createProcurementPO, createRfq, fetchAgreements, fetchCompany, updateProcurementPO, updateRfq, uploadDocument, documentUrl,
  type ApiAgreement, type ApiChangeOrder, type ApiProcurementPO, type ApiProject, type ApiRfq, type ApiWorkPackage, type ApiWorkSubtask, type WorkPackageInput, type WorkPackageStatus, type WorkPackageType,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import { setFiguresShown, useFiguresShown } from "../../lib/figuresPrivacy";
import { UNCATEGORISED, fmtDay, phasePercent } from "../../lib/projectSchedule";
import { Fig } from "./FiguresPrivacy";
import CompanyPicker from "./CompanyPicker";
import ToolMenu, { MENU_ITEM } from "./timeline/ToolMenu";
import { Fold, Section, SidePanel } from "./timeline/ScheduleForms";
import { GREENTECH } from "../../lib/poPdf";
import PdfPreviewModal from "./PdfPreviewModal";
import ShareMenu from "./ShareMenu";

/**
 * CR 328 (2026-09-28): Work Packages. The project manager's master list of everything the project
 * has to get done, one line each: who is doing it, under which RFQ, from which quotes, on which PO
 * or agreement, how far along it is, and the money.
 *
 * The RFQ, quotes, PO, agreement and payments are the existing Procurement, agreement and Finance
 * records. They are linked, never copied: the table reads them, and they are changed where they
 * live. Money follows the figures privacy switch, and is not sent at all to someone who may not
 * see the project's figures.
 */

const STATUS: Record<WorkPackageStatus, { label: string; cls: string }> = {
  not_started: { label: "Not started", cls: "border-slate-200 bg-slate-50 text-slate-600" },
  in_progress: { label: "In progress", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  complete: { label: "Complete", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  on_hold: { label: "On hold", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  cancelled: { label: "Cancelled", cls: "border-slate-200 bg-slate-100 text-slate-400" },
};
const STATUSES = Object.keys(STATUS) as WorkPackageStatus[];
const TYPES: Array<{ v: WorkPackageType; label: string; icon: typeof Package }> = [
  { v: "design", label: "Design", icon: PenTool }, { v: "equipment", label: "Equipment", icon: Package }, { v: "civil", label: "Civil", icon: HardHat },
  { v: "installation", label: "Installation", icon: Wrench }, { v: "controls", label: "Controls / BAS", icon: Cog }, { v: "lifting", label: "Lifting", icon: Boxes },
  { v: "transport", label: "Transport", icon: Truck }, { v: "testing", label: "Testing", icon: ClipboardCheck }, { v: "commissioning", label: "Commissioning", icon: Settings2 },
  { v: "other", label: "Other", icon: Boxes },
];
const typeIcon = (t: WorkPackageType) => TYPES.find((x) => x.v === t)?.icon || Boxes;
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

type ColKey = "rfq" | "quotes" | "winner" | "po" | "status" | "progress" | "original" | "changes" | "current" | "paid" | "remaining" | "remarks";
const COLS: Array<{ key: ColKey; label: string; help: string; money?: boolean }> = [
  { key: "rfq", label: "RFQ", help: "The request for quotation sent to vendors or subcontractors for this work" },
  { key: "quotes", label: "Quotes / offers", help: "The offers that came back on that RFQ" },
  { key: "winner", label: "Winner / responsible", help: "The company doing the work: the awarded quote, a company from the Directory, or GT / the JV for work done in-house" },
  { key: "po", label: "PO / agreement", help: "The purchase order or agreement the work is contracted under" },
  { key: "status", label: "Status", help: "Where the work stands" },
  { key: "progress", label: "Progress", help: "Typed, the average of the subtasks, or read from the schedule" },
  { key: "original", label: "Original value", help: "The contracted amount: the PO's total, or the value typed on the package", money: true },
  { key: "changes", label: "Change orders", help: "Approved change orders on this package", money: true },
  { key: "current", label: "Total value (current)", help: "Original value plus approved change orders", money: true },
  { key: "paid", label: "Paid", help: "Payments recorded in Finances on the vendor's invoices for this PO or agreement", money: true },
  { key: "remaining", label: "Remaining", help: "Current value minus paid", money: true },
  { key: "remarks", label: "Remarks", help: "A free note" },
];
const VIEW_KEY = "gt-work-packages-view";
type View = { hidden: ColKey[]; compact: boolean };
const loadView = (): View => { try { const v = JSON.parse(localStorage.getItem(VIEW_KEY) || "null"); return { hidden: Array.isArray(v?.hidden) ? v.hidden : [], compact: v?.compact === true }; } catch { return { hidden: [], compact: false }; } };

type Filters = { status: string; who: string; rfq: string; contract: string; changes: boolean };
const NO_FILTER: Filters = { status: "", who: "", rfq: "", contract: "", changes: false };

export default function WorkPackages({ project, canEdit }: { project: ApiProject; canEdit: boolean }) {
  const { confirm, dialogs } = useDialogs();
  const projectId = project.id;
  const [list, setList] = useState<ApiWorkPackage[] | null>(null);
  const [canMoney, setCanMoney] = useState(false);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  const [showArchived, setShowArchived] = useState(false);
  const [view, setViewState] = useState<View>(loadView);
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* ignore */ } };
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ApiWorkPackage | "new" | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = useFiguresShown();
  // CR 328 (GT Comments 3, page 1: "view, print, share ...") - the list and each package as a PDF.
  const [preview, setPreview] = useState<{ title: string; fileName: string; build: () => Promise<Blob> } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragFrom = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState("");

  const load = () => fetchWorkPackages(projectId).then((r) => { setList(r.packages); setCanMoney(r.canSeeFigures); }).catch((e) => { setList([]); toast(e instanceof Error ? e.message : "Could not load the work packages.", "error"); });
  useEffect(() => { setList(null); void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  // Progress read from the schedule, for a package linked to one of its tasks or phases.
  const schedule = project.schedule?.milestones || [];
  const progressOf = (p: ApiWorkPackage): number => {
    if (p.progressMode !== "schedule" || !p.scheduleRef?.id) return p.progress;
    if (p.scheduleRef.kind === "task") { const m = schedule.find((x) => x.id === p.scheduleRef.id); return m ? phasePercent(m) : p.progress; }
    const items = schedule.filter((m) => ((m.category || "").trim() || UNCATEGORISED) === p.scheduleRef.id);
    return items.length ? Math.round(items.reduce((a, m) => a + phasePercent(m), 0) / items.length) : p.progress;
  };

  const replace = (p: ApiWorkPackage) => setList((l) => (l ? (l.some((x) => x._id === p._id) ? l.map((x) => (x._id === p._id ? p : x)) : [...l, p]) : [p]));
  const patch = async (p: ApiWorkPackage, body: WorkPackageInput, quiet = true) => {
    try { replace(await updateWorkPackage(projectId, p._id, body)); if (!quiet) toast("Saved.", "success"); return true; }
    catch (e) { toast(e instanceof Error ? e.message : "Could not save.", "error"); return false; }
  };
  /** A subtask changed: its package's status follows when progress comes from the subtasks. */
  const patchSubtask = (p: ApiWorkPackage, id: string, t: Partial<ApiWorkSubtask>) => {
    const subtasks = p.subtasks.map((x) => {
      if (x.id !== id) return x;
      const next = { ...x, ...t };
      if ("status" in t && t.status === "complete") next.progress = 100;
      if ("progress" in t) next.status = (t.progress ?? 0) >= 100 ? "complete" : (t.progress ?? 0) > 0 ? "in_progress" : next.status === "complete" ? "in_progress" : next.status;
      return next;
    });
    const follow: WorkPackageInput = p.progressMode === "subtasks" && p.status !== "on_hold" && p.status !== "cancelled"
      ? { status: subtasks.every((x) => x.status === "complete") ? "complete" : subtasks.some((x) => x.status !== "not_started" || x.progress > 0) ? "in_progress" : "not_started" }
      : {};
    void patch(p, { subtasks, ...follow });
  };

  const all = list || [];
  const live = all.filter((p) => showArchived || !p.archived);
  const needle = q.trim().toLowerCase();
  const rows = live.filter((p) => {
    if (needle && !`${p.name} ${p.description} ${p.winner?.name || ""} ${p.rfq?.no || ""} ${p.po?.no || ""} ${p.agreement?.no || ""} ${p.remarks} ${p.subtasks.map((t) => t.name).join(" ")}`.toLowerCase().includes(needle)) return false;
    if (filters.status && p.status !== filters.status) return false;
    if (filters.who && (p.winner?.name || "") !== filters.who) return false;
    if (filters.rfq && (filters.rfq === "with") !== !!p.rfq) return false;
    if (filters.contract && (filters.contract === "with") !== !!(p.po || p.agreement)) return false;
    if (filters.changes && !p.changeOrders.length) return false;
    return true;
  });
  const filtering = !!needle || JSON.stringify(filters) !== JSON.stringify(NO_FILTER);
  const filterCount = [filters.status, filters.who, filters.rfq, filters.contract, filters.changes ? "x" : ""].filter(Boolean).length;
  const numberOf = useMemo(() => new Map(all.filter((p) => !p.archived).map((p, i) => [p._id, i + 1])), [all]);
  const cols = COLS.filter((c) => !view.hidden.includes(c.key) && (!c.money || canMoney));
  const totals = rows.reduce((a, p) => (p.money ? { original: a.original + p.money.original, changes: a.changes + p.money.changes, current: a.current + p.money.current, paid: a.paid + p.money.paid, remaining: a.remaining + p.money.remaining } : a), { original: 0, changes: 0, current: 0, paid: 0, remaining: 0 });

  const move = async (id: string, to: number) => {
    const ids = all.map((p) => p._id);
    const from = ids.indexOf(id);
    if (from < 0 || to < 0 || to >= ids.length || from === to) return;
    const next = [...all];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setList(next);
    try { await reorderWorkPackages(projectId, next.map((p) => p._id)); } catch { toast("Could not save the order.", "error"); void load(); }
  };
  const remove = async (p: ApiWorkPackage) => {
    if (!(await confirm({ title: `Delete "${p.name}"?`, message: "It goes to the Recycle Bin, where it can be restored. Its RFQ, PO, agreement and invoices are not touched.", confirmLabel: "Delete", danger: true }))) return;
    try { await deleteWorkPackage(projectId, p._id); setList((l) => (l || []).filter((x) => x._id !== p._id)); toast("Work package deleted.", "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not delete it.", "error"); }
  };
  const save = async (body: WorkPackageInput): Promise<boolean> => {
    setBusy(true);
    try {
      if (editing === "new") replace(await createWorkPackage(projectId, body));
      else if (editing) replace(await updateWorkPackage(projectId, editing._id, body));
      setEditing(null);
      toast(editing === "new" ? "Work package added." : "Work package saved.", "success");
      return true;
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save.", "error"); return false; }
    finally { setBusy(false); }
  };

  // ── PDF: the rows shown, and one package's sheet ──
  const safeName = (v: string) => v.replace(/[\\/:*?"<>|]/g, "_");
  const listFile = `${safeName(project.name)} - Work packages.pdf`;
  const sheetFile = (p: ApiWorkPackage) => `${safeName(project.name)} - Work package ${numberOf.get(p._id) || ""} ${safeName(p.name)}.pdf`;
  const pdfBase = () => ({ projectName: project.name, projectNo: project.id, clientName: project.clientInfo?.name || "", money: canMoney, masked: !shown });
  const listPdf = async () => {
    const { buildWorkPackagesPdf } = await import("../../lib/workPackagesPdf");
    return buildWorkPackagesPdf({
      ...pdfBase(),
      packages: rows.map((p) => ({ p, no: numberOf.get(p._id) || 0, progress: progressOf(p) })),
      note: filtering ? `Filtered: ${rows.length} of ${live.length} work packages.` : "",
    });
  };
  const sheetPdf = async (p: ApiWorkPackage) => {
    const { buildWorkPackageSheet } = await import("../../lib/workPackagesPdf");
    return buildWorkPackageSheet({ ...pdfBase(), item: { p, no: numberOf.get(p._id) || 0, progress: progressOf(p) } });
  };
  const download = async (blob: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  // Shared as a file in the project's documents (Project Management), as the schedule is.
  const shareFile = async (blob: Blob, name: string) => documentUrl(await uploadDocument(projectId, new File([blob], name, { type: "application/pdf" }), "pm-work-packages", true, "Shared"));

  // ── Excel: out, and in ──
  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const head = ["#", "Work package", "Description", "RFQ", "Quotes", "Winner / responsible", "PO / agreement", "Status", "Progress %", ...(canMoney ? ["Original value", "Change orders", "Total value", "Paid", "Remaining"] : []), "Remarks"];
    const out: unknown[][] = [head];
    rows.forEach((p) => {
      const n = numberOf.get(p._id) || "";
      out.push([`${n}.0`, p.name, p.description, p.rfq?.no || "", p.quotes.names.join(", "), p.winner?.name || "", p.po?.no || p.agreement?.no || "", STATUS[p.status].label, progressOf(p), ...(canMoney && p.money ? [p.money.original, p.money.changes, p.money.current, p.money.paid, p.money.remaining] : canMoney ? ["", "", "", "", ""] : []), p.remarks]);
      p.subtasks.forEach((t, i) => out.push([`${n}.${i + 1}`, t.name, "", "", "", t.assignee || "", "", STATUS[t.status].label, t.progress, ...(canMoney ? ["", "", "", "", ""] : []), ""]));
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(out), "Work packages");
    const blob = new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${project.name} - Work packages.xlsx`.replace(/[\\/:*?"<>|]/g, "_"); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  /** A sheet with the columns Work package, Description, Responsible, Status, Progress; a row numbered 1.1 is a subtask of the package above it. */
  const importExcel = async (file: File) => {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
      const head = (grid[0] || []).map((h) => String(h).trim().toLowerCase());
      const at = (...names: string[]) => head.findIndex((h) => names.some((n) => h.startsWith(n)));
      const iNo = at("#", "no"), iName = at("work package", "name", "requirement", "task"), iDesc = at("description"), iWho = at("winner", "responsible"), iStatus = at("status"), iPct = at("progress"), iRem = at("remark");
      if (iName < 0) { toast('The sheet needs a "Work package" column.', "error"); return; }
      const statusOf = (v: unknown): WorkPackageStatus => { const s = String(v).toLowerCase(); return s.includes("complete") ? "complete" : s.includes("progress") ? "in_progress" : s.includes("hold") ? "on_hold" : s.includes("cancel") ? "cancelled" : "not_started"; };
      const pctOf = (v: unknown) => { const n = Number(String(v).replace("%", "")); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n <= 1 && n > 0 && String(v).includes(".") ? n * 100 : n))) : 0; };
      const out: WorkPackageInput[] = [];
      for (const r of grid.slice(1)) {
        const name = String(r[iName] ?? "").trim();
        if (!name) continue;
        const no = iNo >= 0 ? String(r[iNo] ?? "").trim() : "";
        const sub = /^\d+\.[1-9]\d*$/.test(no);
        if (sub && out.length) { (out[out.length - 1].subtasks ||= []).push({ id: newId(), name, status: statusOf(r[iStatus]), progress: pctOf(r[iPct]) }); out[out.length - 1].progressMode = "subtasks"; continue; }
        const who = iWho >= 0 ? String(r[iWho] ?? "").trim() : "";
        out.push({
          name, description: iDesc >= 0 ? String(r[iDesc] ?? "").trim() : "", status: statusOf(r[iStatus]), progress: pctOf(r[iPct]), remarks: iRem >= 0 ? String(r[iRem] ?? "").trim() : "",
          responsible: /^(gt|greentech|jv|internal)/i.test(who) ? { kind: "internal", companyId: "", name: who } : { kind: "company", companyId: "", name: who },
        });
      }
      if (!out.length) { toast("No work packages were found in that sheet.", "error"); return; }
      const made = await importWorkPackages(projectId, out);
      setList((l) => [...(l || []), ...made]);
      toast(`${made.length} work package${made.length === 1 ? "" : "s"} imported.`, "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not read that file.", "error"); }
    finally { setBusy(false); }
  };

  const base = `/dashboard/projects/${projectId}`;
  const th = "whitespace-nowrap px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500";
  const td = `px-3 ${view.compact ? "py-1.5" : "py-2.5"} align-top text-xs text-slate-700`;
  const linkCls = "inline-flex items-center gap-1 whitespace-nowrap font-bold text-blue-600 hover:underline";
  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-primary hover:text-primary disabled:opacity-50";
  const sel = "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-primary focus:outline-none";
  const eye = canMoney && (
    <button type="button" onClick={() => setFiguresShown(!shown)} title={shown ? "Hide the figures" : "Show the figures"} aria-label={shown ? "Hide the figures" : "Show the figures"} className="ml-1 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
      {shown ? <Eye size={11} /> : <EyeOff size={11} />}
    </button>
  );
  const who = [...new Set(live.map((p) => p.winner?.name || "").filter(Boolean))].sort();
  const panelOpen = !!editing;

  const cellOf = (p: ApiWorkPackage, k: ColKey): ReactNode => {
    const m = p.money;
    const pct = progressOf(p);
    switch (k) {
      case "rfq": return p.rfq ? <><Link to={`${base}?tab=procurement&proc=rfqs&rfq=${p.rfq.id}`} className={linkCls}><FileText size={11} /> {p.rfq.no}</Link><span className="block whitespace-nowrap text-[10px] text-slate-400">{p.rfq.date ? fmtDay(p.rfq.date) : p.rfq.status}{p.rfq.vendors ? ` · ${p.rfq.vendors} vendor${p.rfq.vendors === 1 ? "" : "s"}` : ""}</span></> : <span className="text-slate-300">-</span>;
      case "quotes": return p.quotes.count ? <><Link to={`${base}?tab=procurement&proc=quotes`} className={linkCls}>{p.quotes.count} Quote{p.quotes.count === 1 ? "" : "s"}</Link><span className="block max-w-[11rem] text-[10px] leading-snug text-slate-400">{p.quotes.names.join(", ")}</span></> : <span className="text-slate-300">-</span>;
      case "winner": return p.winner ? (
        <span className="flex items-start gap-2">
          {p.winner.logoUrl
            ? <img src={withFileToken(p.winner.logoUrl)} alt="" className="h-6 w-6 shrink-0 rounded-full border border-slate-100 object-contain" />
            : <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${p.winner.internal ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{p.winner.internal ? <Building2 size={12} /> : p.winner.name.charAt(0).toUpperCase()}</span>}
          <span className="min-w-0"><span className="block font-semibold text-slate-800">{p.winner.name}</span><span className="block max-w-[11rem] truncate text-[10px] text-slate-400" title={p.winner.place}>{p.winner.internal ? "Done in-house" : p.winner.place}</span></span>
        </span>
      ) : <span className="text-slate-300">-</span>;
      case "po": return p.po ? <><Link to={`${base}?tab=procurement&proc=po&po=${p.po.id}`} className={linkCls}><FileText size={11} /> {p.po.no}</Link><span className="block text-[10px] text-slate-400">{p.po.signed ? "Signed" : p.po.status}{p.po.date ? ` · ${fmtDay(p.po.date)}` : ""}</span></>
        : p.agreement ? <><Link to={p.agreement.general ? `/dashboard/agreements?hl=ag-${p.agreement.id}` : `${base}?tab=subs`} className={linkCls}><FileText size={11} /> {p.agreement.no}</Link><span className="block text-[10px] text-slate-400">{p.agreement.status}{p.agreement.date ? ` · ${fmtDay(p.agreement.date)}` : ""}</span></>
        : <span className="text-slate-300">-</span>;
      case "status": return (
        <select disabled={!canEdit} value={p.status} onChange={(e) => void patch(p, { status: e.target.value as WorkPackageStatus, ...(e.target.value === "complete" && p.progressMode === "manual" ? { progress: 100 } : {}) })} aria-label={`Status of ${p.name}`} className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${STATUS[p.status].cls}`}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
      );
      case "progress": return (
        <span className="flex items-center gap-2" title={p.progressMode === "subtasks" ? "The average of its subtasks" : p.progressMode === "schedule" ? "Read from the schedule" : "Typed"}>
          {p.progressMode === "manual" && canEdit
            ? <input type="number" min={0} max={100} step={5} key={p.progress} defaultValue={p.progress} onBlur={(e) => { const v = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))); if (v !== p.progress) void patch(p, { progress: v }); }} aria-label={`Progress of ${p.name}`} className="w-12 rounded-md border border-slate-200 px-1 py-0.5 text-right text-xs tabular-nums" />
            : <span className="w-9 text-right font-bold tabular-nums text-slate-800">{pct}%</span>}
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} /></span>
        </span>
      );
      case "original": return m && (m.original || m.source) ? <span className={`tabular-nums ${m.changes ? "text-slate-400 line-through" : "font-semibold text-slate-800"}`} title={m.source === "po" ? "The PO's total" : "The value typed on the package"}><Fig>{usd(m.original)}</Fig></span> : <span className="text-slate-300">-</span>;
      case "changes": return m && m.changeCount ? <><span className={`font-bold tabular-nums ${m.changes >= 0 ? "text-red-600" : "text-emerald-600"}`}><Fig>{m.changes >= 0 ? "+" : "-"}{usd(Math.abs(m.changes))}</Fig></span>{canEdit ? <button type="button" onClick={() => { setNarrow(false); setEditing(p); }} className="block text-[10px] font-bold text-blue-600 hover:underline">{m.changeCount} change order{m.changeCount === 1 ? "" : "s"}</button> : <span className="block text-[10px] text-slate-400">{m.changeCount} change order{m.changeCount === 1 ? "" : "s"}</span>}</> : <span className="text-slate-300">-</span>;
      case "current": return m && (m.current || m.source) ? <span className="font-bold tabular-nums text-slate-900"><Fig>{usd(m.current)}</Fig></span> : <span className="text-slate-300">-</span>;
      case "paid": return m && (m.paid || m.source) ? <span className="tabular-nums text-slate-700"><Fig>{usd(m.paid)}</Fig></span> : <span className="text-slate-300">-</span>;
      case "remaining": return m && (m.current || m.source) ? <span className={`font-semibold tabular-nums ${m.remaining < 0 ? "text-red-600" : "text-slate-800"}`}><Fig>{usd(m.remaining)}</Fig></span> : <span className="text-slate-300">-</span>;
      case "remarks": return canEdit
        ? <textarea key={p.remarks} defaultValue={p.remarks} rows={view.compact ? 1 : 2} onBlur={(e) => { if (e.target.value.trim() !== p.remarks) void patch(p, { remarks: e.target.value }); }} placeholder="-" aria-label={`Remarks on ${p.name}`} className="w-48 resize-y rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-slate-600 hover:border-slate-200 focus:border-primary focus:bg-white focus:outline-none" />
        : <span className="block max-w-[14rem] text-[11px] text-slate-600">{p.remarks || "-"}</span>;
    }
  };

  return (
    <div className={`space-y-3 transition-[margin] ${panelOpen ? (narrow ? "sm:mr-9" : "xl:mr-[29rem]") : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900">Work Packages</h3>
          <p className="mt-0.5 text-xs text-slate-500">Manage all project requirements, procurement, subcontractors, and progress.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search work packages" className="w-52 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:border-primary" />
          </label>
          <ToolMenu label={filterCount ? `Filter (${filterCount})` : "Filter"} icon={<Filter size={13} />}>
            <div className="space-y-2 p-1.5" onClick={(e) => e.stopPropagation()}>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">Status
                <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={`${sel} mt-1 normal-case tracking-normal`}><option value="">Any</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
              </label>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">Responsible
                <select value={filters.who} onChange={(e) => setFilters({ ...filters, who: e.target.value })} className={`${sel} mt-1 normal-case tracking-normal`}><option value="">Anyone</option>{who.map((w) => <option key={w} value={w}>{w}</option>)}</select>
              </label>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">RFQ
                <select value={filters.rfq} onChange={(e) => setFilters({ ...filters, rfq: e.target.value })} className={`${sel} mt-1 normal-case tracking-normal`}><option value="">Either</option><option value="with">With an RFQ</option><option value="without">Without an RFQ</option></select>
              </label>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">PO / agreement
                <select value={filters.contract} onChange={(e) => setFilters({ ...filters, contract: e.target.value })} className={`${sel} mt-1 normal-case tracking-normal`}><option value="">Either</option><option value="with">With a PO or agreement</option><option value="without">Without one</option></select>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={filters.changes} onChange={(e) => setFilters({ ...filters, changes: e.target.checked })} className="accent-blue-600" /> Has change orders</label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-blue-600" /> Show archived</label>
              {filterCount > 0 && <button type="button" onClick={() => setFilters(NO_FILTER)} className="text-[11px] font-bold text-slate-500 hover:text-primary">Clear the filters</button>}
            </div>
          </ToolMenu>
          <ToolMenu label="Export" icon={<Download size={13} />}>
            <button type="button" onClick={() => setPreview({ title: `Work packages · ${project.name}`, fileName: listFile, build: listPdf })} className={MENU_ITEM}><Printer size={13} /> Print / preview</button>
            <button type="button" onClick={() => void listPdf().then((b) => download(b, listFile)).catch(() => toast("Could not make the PDF.", "error"))} className={MENU_ITEM}><Download size={13} /> Download PDF</button>
            <button type="button" onClick={() => void exportExcel()} className={MENU_ITEM}><FileSpreadsheet size={13} /> Download for Excel</button>
            <ShareMenu variant="button" fileName={listFile} fileUrl="" projectName={project.name} prepareFile={async () => shareFile(await listPdf(), listFile)} className={MENU_ITEM} />
            <div className="my-1 border-t border-slate-100" />
            {canEdit && <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className={MENU_ITEM}><FileUp size={13} /> Import from Excel</button>}
          </ToolMenu>
          <ToolMenu label="View" icon={<Settings2 size={13} />}>
            <div className="space-y-1 p-1.5" onClick={(e) => e.stopPropagation()}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Columns</p>
              {COLS.filter((c) => !c.money || canMoney).map((c) => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={!view.hidden.includes(c.key)} onChange={(e) => setView({ ...view, hidden: e.target.checked ? view.hidden.filter((k) => k !== c.key) : [...view.hidden, c.key] })} className="accent-blue-600" /> {c.label}</label>
              ))}
              <div className="my-1 border-t border-slate-100" />
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={view.compact} onChange={(e) => setView({ ...view, compact: e.target.checked })} className="accent-blue-600" /> Compact rows</label>
            </div>
          </ToolMenu>
          {canEdit && <button type="button" onClick={() => { setNarrow(false); setEditing("new"); }} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"><Plus size={13} /> Add Work Package</button>}
        </div>
      </div>
      <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importExcel(f); e.target.value = ""; }} />

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-xs" style={{ minWidth: 420 + cols.length * 130 }}>
          <thead className="bg-slate-50 shadow-[0_1px_0_#e2e8f0]">
            <tr>
              <th className={`${th} sticky left-0 z-10 w-16 bg-slate-50`}>#</th>
              <th className={`${th} sticky left-16 z-10 min-w-[16rem] bg-slate-50`}>Work package / requirement</th>
              {cols.map((c) => (
                <th key={c.key} className={`${th} ${c.money ? "text-right" : ""}`}>
                  <span className={`inline-flex items-center gap-1 ${c.money ? "justify-end" : ""}`}>{c.label}<span title={c.help}><HelpCircle size={10} className="text-slate-300" /></span>{(c.key === "original" || c.key === "paid" || c.key === "remaining") && eye}</span>
                </th>
              ))}
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list === null && <tr><td colSpan={cols.length + 3} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="mx-auto animate-spin" /></td></tr>}
            {list !== null && rows.length === 0 && (
              <tr><td colSpan={cols.length + 3} className="px-4 py-10 text-center text-xs text-slate-400">{filtering ? "Nothing matches." : "No work packages yet. List what the project has to get done: design, equipment packages, civil work, installation, a crane service, testing..."}</td></tr>
            )}
            {rows.map((p) => {
              const n = numberOf.get(p._id);
              const Icon = typeIcon(p.type);
              const isFolded = folded.has(p._id);
              const amber = !!p.changeOrders.length;
              const rowBg = amber ? "bg-amber-50/60" : "bg-white";
              const at = all.findIndex((x) => x._id === p._id);
              return (
                <Fragment key={p._id}>
                  <tr
                    draggable={canEdit && !filtering}
                    onDragStart={() => { dragFrom.current = p._id; }}
                    onDragOver={(e) => { if (dragFrom.current) { e.preventDefault(); setDragOver(p._id); } }}
                    onDragLeave={() => setDragOver((v) => (v === p._id ? "" : v))}
                    onDrop={(e) => { e.preventDefault(); if (dragFrom.current) void move(dragFrom.current, at); dragFrom.current = null; setDragOver(""); }}
                    onDragEnd={() => { dragFrom.current = null; setDragOver(""); }}
                    className={`border-t border-slate-100 ${dragOver === p._id ? "bg-blue-50" : rowBg} ${p.archived ? "opacity-60" : ""}`}
                  >
                    <td className={`${td} sticky left-0 z-[1] ${dragOver === p._id ? "bg-blue-50" : amber ? "bg-amber-50" : "bg-white"}`}>
                      <span className="flex items-center gap-1 font-bold tabular-nums text-slate-800">
                        {canEdit && !filtering && <GripVertical size={12} className="cursor-grab text-slate-300" />}
                        {n ? `${n}.0` : "-"}
                        {p.subtasks.length > 0 && <button type="button" onClick={() => setFolded((s) => { const x = new Set(s); if (x.has(p._id)) x.delete(p._id); else x.add(p._id); return x; })} aria-label={isFolded ? "Show the subtasks" : "Fold the subtasks"} className="rounded p-0.5 text-slate-400 hover:bg-slate-100">{isFolded ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button>}
                      </span>
                    </td>
                    <td className={`${td} sticky left-16 z-[1] ${dragOver === p._id ? "bg-blue-50" : amber ? "bg-amber-50" : "bg-white"}`}>
                      <button type="button" onClick={() => { setNarrow(false); setEditing(p); }} className="flex items-start gap-2 text-left">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Icon size={13} /></span>
                        <span className="min-w-0">
                          <span className="block font-bold text-slate-900 hover:text-primary">{p.name}{p.archived && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">Archived</span>}</span>
                          {p.description && !view.compact && <span className="block max-w-[22rem] text-[11px] leading-snug text-slate-500">{p.description}</span>}
                        </span>
                      </button>
                    </td>
                    {cols.map((c) => <td key={c.key} className={`${td} ${c.money ? "text-right" : ""}`}>{cellOf(p, c.key)}</td>)}
                    <td className={`${td} text-right`}>
                      <ToolMenu label={`Actions for ${p.name}`} icon={<MoreVertical size={14} />} tone="ghost">
                        <button type="button" onClick={() => { setNarrow(false); setEditing(p); }} className={MENU_ITEM}><Pencil size={13} /> {canEdit ? "Open / edit" : "Open"}</button>
                        <button type="button" onClick={() => setPreview({ title: `Work package ${n || ""}.0 · ${p.name}`, fileName: sheetFile(p), build: () => sheetPdf(p) })} className={MENU_ITEM}><Printer size={13} /> Print package sheet</button>
                        <ShareMenu variant="button" fileName={sheetFile(p)} fileUrl="" projectName={project.name} prepareFile={async () => shareFile(await sheetPdf(p), sheetFile(p))} className={MENU_ITEM} />
                        {canEdit && (
                          <>
                            <button type="button" onClick={() => void move(p._id, at - 1)} disabled={at <= 0 || filtering} className={MENU_ITEM}><ArrowUp size={13} /> Move up</button>
                            <button type="button" onClick={() => void move(p._id, at + 1)} disabled={at >= all.length - 1 || filtering} className={MENU_ITEM}><ArrowDown size={13} /> Move down</button>
                            <div className="my-1 border-t border-slate-100" />
                            <button type="button" onClick={() => void patch(p, { archived: !p.archived }, false)} className={MENU_ITEM}>{p.archived ? <><ArchiveRestore size={13} /> Restore from archive</> : <><Archive size={13} /> Archive</>}</button>
                            <button type="button" onClick={() => void remove(p)} className={`${MENU_ITEM} !text-red-600 hover:!bg-red-50`}><Trash2 size={13} /> Delete</button>
                          </>
                        )}
                      </ToolMenu>
                    </td>
                  </tr>
                  {!isFolded && p.subtasks.map((t, i) => (
                    <tr key={t.id} className="border-t border-slate-50 bg-slate-50/50">
                      <td className="sticky left-0 z-[1] bg-slate-50 px-3 py-1.5 pl-7 text-[11px] tabular-nums text-slate-500">{n ? `${n}.${i + 1}` : ""}</td>
                      <td className="sticky left-16 z-[1] bg-slate-50 px-3 py-1.5 pl-8 text-[11px] text-slate-700"><span className="flex items-center gap-1.5"><FileText size={11} className="shrink-0 text-slate-400" />{t.name}{t.assignee && <span className="text-[10px] text-slate-400">· {t.assignee}</span>}{t.dueDate && <span className="text-[10px] text-slate-400">· due {fmtDay(t.dueDate)}</span>}</span></td>
                      {cols.map((c) => (
                        <td key={c.key} className={`px-3 py-1.5 text-[11px] ${c.money ? "text-right" : ""}`}>
                          {c.key === "status" ? (
                            <select disabled={!canEdit} value={t.status} onChange={(e) => patchSubtask(p, t.id, { status: e.target.value as WorkPackageStatus })} aria-label={`Status of ${t.name}`} className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${STATUS[t.status].cls}`}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
                          ) : c.key === "progress" ? (
                            <span className="flex items-center gap-2">
                              {canEdit ? <input type="number" min={0} max={100} step={5} key={t.progress} defaultValue={t.progress} onBlur={(e) => { const v = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))); if (v !== t.progress) patchSubtask(p, t.id, { progress: v }); }} aria-label={`Progress of ${t.name}`} className="w-12 rounded-md border border-slate-200 bg-white px-1 py-0.5 text-right text-[11px] tabular-nums" /> : <span className="w-9 text-right tabular-nums">{t.progress}%</span>}
                              <span className="h-1 w-16 overflow-hidden rounded-full bg-slate-200"><span className={`block h-full rounded-full ${t.progress >= 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${t.progress}%` }} /></span>
                            </span>
                          ) : <span className="text-slate-300">-</span>}
                        </td>
                      ))}
                      <td />
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            {canEdit && list !== null && (
              <tr className="border-t border-slate-100">
                <td colSpan={cols.length + 3} className="p-2">
                  <button type="button" onClick={() => { setNarrow(false); setEditing("new"); }} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-left text-xs hover:border-primary hover:bg-blue-50/40">
                    <Plus size={14} className="text-blue-600" /><b className="text-slate-800">Add new work package</b><span className="text-slate-400">Add a new requirement, task, or service for this project.</span>
                  </button>
                </td>
              </tr>
            )}
          </tbody>
          {canMoney && rows.length > 0 && cols.some((c) => c.money) && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-800">
                <td className="sticky left-0 z-[1] bg-slate-50 px-3 py-2" />
                <td className="sticky left-16 z-[1] bg-slate-50 px-3 py-2">Totals{filtering ? " (rows shown)" : ""}</td>
                {cols.map((c) => (
                  <td key={c.key} className={`px-3 py-2 tabular-nums ${c.money ? "text-right" : ""}`}>
                    {c.key === "original" ? <Fig>{usd(totals.original)}</Fig> : c.key === "changes" ? (totals.changes ? <Fig>{totals.changes >= 0 ? "+" : "-"}{usd(Math.abs(totals.changes))}</Fig> : "-") : c.key === "current" ? <Fig>{usd(totals.current)}</Fig> : c.key === "paid" ? <Fig>{usd(totals.paid)}</Fig> : c.key === "remaining" ? <Fig>{usd(totals.remaining)}</Fig> : ""}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editing && (
        <Fragment key={editing === "new" ? "new" : editing._id}>
          <PackageForm pkg={editing === "new" ? null : editing} project={project} canEdit={canEdit} canMoney={canMoney} busy={busy} narrow={narrow} onNarrow={setNarrow} onSave={save} onClose={() => setEditing(null)} onLinked={(x) => { replace(x); setEditing(null); }} />
        </Fragment>
      )}
      {preview && <PdfPreviewModal title={preview.title} fileName={preview.fileName} build={preview.build} onClose={() => setPreview(null)} />}
      {dialogs}
    </div>
  );
}

// ── Add / edit: the side panel ──
const lbl = "block text-[10px] font-bold uppercase tracking-widest text-slate-400";
const inp = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";
const hint = "text-[11px] leading-snug text-slate-500";

function PackageForm({ pkg, project, canEdit, canMoney, busy, narrow, onNarrow, onSave, onClose, onLinked }: {
  pkg: ApiWorkPackage | null; project: ApiProject; canEdit: boolean; canMoney: boolean; busy: boolean; narrow: boolean; onNarrow: (v: boolean) => void;
  onSave: (body: WorkPackageInput) => Promise<boolean>; onClose: () => void;
  /** CR 328 - the package, saved with a record just made for it (an RFQ, a PO, an agreement). */
  onLinked: (p: ApiWorkPackage) => void;
}) {
  const navigate = useNavigate();
  const [f, setF] = useState<WorkPackageInput>(() => pkg ? {
    name: pkg.name, description: pkg.description, type: pkg.type, responsible: pkg.responsible, rfqId: pkg.rfqId, poId: pkg.poId, agreementId: pkg.agreementId, status: pkg.status,
    progressMode: pkg.progressMode, progress: pkg.progress, scheduleRef: pkg.scheduleRef, subtasks: pkg.subtasks, budget: pkg.budget || 0, changeOrders: pkg.changeOrders, remarks: pkg.remarks,
  } : {
    name: "", description: "", type: "other", responsible: { kind: "company", companyId: "", name: "" }, rfqId: "", poId: "", agreementId: "", status: "not_started",
    progressMode: "manual", progress: 0, scheduleRef: { kind: "", id: "" }, subtasks: [], budget: 0, changeOrders: [], remarks: "",
  });
  const set = (patch: WorkPackageInput) => setF((p) => ({ ...p, ...patch }));
  const who = f.responsible!;
  const subs = f.subtasks || [];
  const cos = f.changeOrders || [];
  // The project's RFQs, POs and agreements, to link one that already exists.
  const [rfqs, setRfqs] = useState<ApiRfq[]>([]);
  const [pos, setPos] = useState<ApiProcurementPO[]>([]);
  const [agrs, setAgrs] = useState<ApiAgreement[]>([]);
  useEffect(() => {
    fetchRfqs(project.id).then(setRfqs).catch(() => setRfqs([]));
    fetchProcurementPOs(project.id).then(setPos).catch(() => setPos([]));
    // The project's own agreements, and the General Agreements that cover this project (GT
    // Comments 3: "Existing RFQ, PO, and Agreement builders from Procurement and General
    // Agreements should be reused").
    Promise.all([
      fetchProjectAgreements(project.id).catch(() => [] as ApiAgreement[]),
      fetchAgreements({ kind: "general" }).then((l) => l.filter((a) => (a.linkedProjects || []).some((lp) => lp.id === project.id))).catch(() => [] as ApiAgreement[]),
    ]).then(([own, general]) => setAgrs([...own, ...general]));
  }, [project.id]);

  /**
   * CR 328 (GT Comments 3, page 1: "Work Package → RFQ → Vendor Quotes → Selection/Winner →
   * PO/Agreement ... Existing RFQ, PO, and Agreement builders ... should be reused"). The record is
   * made by the same Procurement and agreement endpoints as always, filled in from the package,
   * linked to it, and opened where it lives to carry on there. The package is saved with it, so
   * nothing typed in this form is lost.
   */
  const [making, setMaking] = useState<"" | "rfq" | "po" | "agreement">("");
  const scope = () => ({ name: (f.name || "").trim(), detail: (f.description || "").trim() });
  // A scope line is not a BOQ item; it still needs an id of its own for the quotes and the PO.
  const newLineId = () => Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const linkAndOpen = async (patch: WorkPackageInput, to: string, message: string) => {
    const saved = await updateWorkPackage(project.id, pkg!._id, { ...f, ...patch });
    onLinked(saved);
    toast(message, "success");
    navigate(to);
  };
  const makeRfq = async () => {
    if (!pkg) return;
    setMaking("rfq");
    try {
      const { name, detail } = scope();
      const rfq = await createRfq(project.id, { title: name, notes: detail, lineItems: [{ itemId: newLineId(), description: name, qty: "1", unit: "lot", spec: detail }] });
      // The company the package is meant for is the first one the request goes to.
      if (who.kind === "company" && who.companyId) {
        const c = await fetchCompany(who.companyId).catch(() => null);
        await updateRfq(project.id, rfq._id, { recipients: [{ companyId: who.companyId, name: c?.name || who.name, category: c?.category || "vendor", expectsQuote: true }] }).catch(() => undefined);
      }
      await linkAndOpen({ rfqId: rfq._id }, `${base}?tab=procurement&proc=rfqs&rfq=${rfq._id}`, `RFQ ${rfq.rfqNo} made for this package. Add the vendors and send it from Procurement.`);
    } catch (e) { toast(e instanceof Error ? e.message : "Could not make the RFQ.", "error"); }
    finally { setMaking(""); }
  };
  const linkedRfq = rfqs.find((r) => r._id === f.rfqId);
  const awarded = linkedRfq?.quotes?.find((q) => q.status === "Awarded");
  const makePo = async () => {
    if (!pkg) return;
    setMaking("po");
    try {
      const { name } = scope();
      // From the awarded quote, the normal Procurement way; without one, a PO for the package's
      // company with the package as its line, priced in the PO editor.
      let po = linkedRfq && awarded
        ? await createProcurementPO(project.id, linkedRfq._id, awarded._id)
        : await createManualPO(project.id, who.kind === "company" ? who.name : "");
      if (!(linkedRfq && awarded)) po = await updateProcurementPO(project.id, po._id, { lineItems: [{ itemId: "", description: name, qty: "1", unit: "lot", unitPrice: "" }] });
      await linkAndOpen({ poId: po._id }, `${base}?tab=procurement&proc=po&po=${po._id}`, `${po.poNo} made for this package.${linkedRfq && awarded ? "" : " Add its price in Procurement."}`);
    } catch (e) { toast(e instanceof Error ? e.message : "Could not make the PO.", "error"); }
    finally { setMaking(""); }
  };
  const makeAgreement = async () => {
    if (!pkg) return;
    setMaking("agreement");
    try {
      const { name, detail } = scope();
      const c = who.kind === "company" && who.companyId ? await fetchCompany(who.companyId).catch(() => null) : null;
      const ag = await createAgreement({ kind: "general" }, {
        name, title: name, description: detail, agreementType: "Service",
        linkedProjects: [{ id: project.id, name: project.name, location: project.location || "" }],
        partySnapshot: {
          party1: { name: GREENTECH.name, contactName: "", address: GREENTECH.address, email: GREENTECH.email, phone: GREENTECH.phone, logoUrl: "/gt-usa-logo-new.png" },
          party2: { name: c?.name || who.name, contactName: c?.contactPersons?.[0]?.name || "", address: c?.address || "", email: c?.email || "", phone: c?.phone || "", logoUrl: c?.logoUrl || "", companyId: c?._id || "" },
          extraParties: [], contextLines: [],
        },
      });
      await linkAndOpen({ agreementId: ag._id }, `/dashboard/agreements?hl=ag-${ag._id}`, `Agreement ${ag.agreementNo || ""} made for this package. Write it and send it from General Agreements.`.replace("  ", " "));
    } catch (e) { toast(e instanceof Error ? e.message : "Could not make the agreement.", "error"); }
    finally { setMaking(""); }
  };
  const base = `/dashboard/projects/${project.id}`;
  const tasks = project.schedule?.milestones || [];
  const phases = [...new Set([...(project.schedule?.categories || []), ...tasks.map((m) => (m.category || "").trim()).filter(Boolean)])];
  const setSub = (i: number, t: Partial<ApiWorkSubtask>) => set({ subtasks: subs.map((x, j) => (j === i ? { ...x, ...t, ...(t.status === "complete" ? { progress: 100 } : {}) } : x)) });
  const moveSub = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= subs.length) return; const next = [...subs]; [next[i], next[j]] = [next[j], next[i]]; set({ subtasks: next }); };
  const setCo = (i: number, c: Partial<ApiChangeOrder>) => set({ changeOrders: cos.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  const approved = cos.filter((c) => c.status === "approved").reduce((a, c) => a + (Number(c.amount) || 0), 0);
  const outside = who.kind === "company";
  const small = "rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-800 focus:border-primary focus:outline-none";
  const linkBtn = "inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline";

  return (
    <SidePanel
      title={pkg ? (canEdit ? "Edit work package" : "Work package") : "Add work package"}
      icon={<Boxes size={15} />}
      narrow={narrow} onNarrow={onNarrow} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">{canEdit ? "Cancel" : "Close"}</button>
        {canEdit && <button type="button" onClick={() => void onSave(f)} disabled={busy || !(f.name || "").trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />} Save work package</button>}
      </>}
    >
      <fieldset disabled={!canEdit} className="space-y-5">
        <Section n={1} title="Requirement">
          <label className="block"><span className={lbl}>Name *</span><input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Crane Service (50 ton)" className={inp} autoFocus={!pkg} /></label>
          <label className="block"><span className={lbl}>Description</span><textarea value={f.description} onChange={(e) => set({ description: e.target.value })} rows={2} className={`${inp} resize-y`} placeholder="What this requirement covers" /></label>
          <div>
            <span className={lbl}>Type</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {TYPES.map((t) => <button key={t.v} type="button" onClick={() => set({ type: t.v })} aria-pressed={f.type === t.v} className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-bold ${f.type === t.v ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-primary"}`}><t.icon size={12} /> {t.label}</button>)}
            </div>
          </div>
        </Section>

        <Section n={2} title="Who does it">
          <div className="flex gap-1.5">
            {([["company", "An outside company"], ["internal", "GT / JV (in-house)"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => set({ responsible: k === "internal" ? { kind: "internal", companyId: "", name: who.kind === "internal" ? who.name : "GT" } : { kind: "company", companyId: "", name: "" } })} aria-pressed={who.kind === k} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${who.kind === k ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-primary"}`}>{l}</button>
            ))}
          </div>
          {outside ? (
            <div>
              <span className={lbl}>Company (from the Directory)</span>
              <div className="mt-1"><CompanyPicker size="sm" value={who.name} category="vendor" categories={["vendor", "subcontractor", "supplier", "manufacturer", "consultant"]} onNameChange={(v) => set({ responsible: { kind: "company", companyId: "", name: v } })} onSelectCompany={(c) => set({ responsible: { kind: "company", companyId: c._id, name: c.name } })} placeholder="Search the Directory, or add a company to it" /></div>
              <p className={`mt-1 ${hint}`}>{who.name && !who.companyId ? "Pick it from the list (or add it to the Directory from the list) so the company is a Directory record." : "Leave it empty until a quote is awarded: the winner of the linked RFQ then shows here."}</p>
            </div>
          ) : (
            <label className="block"><span className={lbl}>Done by</span><input value={who.name} onChange={(e) => set({ responsible: { kind: "internal", companyId: "", name: e.target.value } })} placeholder="GT, or the JV's name" className={inp} /></label>
          )}
        </Section>

        {outside && (
          <Section n={3} title="Commercial" note="Make the RFQ, the PO or the agreement from here, or link one that already exists. They are the usual Procurement and agreement records: the table follows them (quotes, winner, value, payments).">
            {!pkg && <p className={`rounded-lg bg-amber-50 px-2.5 py-1.5 ${hint} text-amber-800`}>Save the package first; its RFQ, PO and agreement can then be made from here.</p>}
            {/* RFQ */}
            <div>
              <span className={lbl}>RFQ</span>
              <select value={f.rfqId} onChange={(e) => set({ rfqId: e.target.value })} className={inp} aria-label="RFQ"><option value="">None</option>{rfqs.map((r) => <option key={r._id} value={r._id}>{r.rfqNo}{r.title ? ` · ${r.title}` : ""}{r.status ? ` (${r.status})` : ""}</option>)}</select>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {f.rfqId
                  ? <Link to={`${base}?tab=procurement&proc=rfqs&rfq=${f.rfqId}`} className={linkBtn}><FileText size={11} /> Open the RFQ</Link>
                  : pkg && canEdit && <button type="button" onClick={() => void makeRfq()} disabled={!!making || !scope().name} className={`${linkBtn} disabled:opacity-50`}>{making === "rfq" ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create an RFQ for this package</button>}
              </div>
              {!f.rfqId && pkg && <p className={`mt-0.5 ${hint}`}>A draft RFQ with this package as its line (1 lot){who.companyId ? `, sent to ${who.name}` : ""}. Vendors are added and it is sent from Procurement.</p>}
            </div>
            {/* PO */}
            <div>
              <span className={lbl}>Purchase order</span>
              <select value={f.poId} onChange={(e) => set({ poId: e.target.value })} className={inp} aria-label="Purchase order"><option value="">None</option>{pos.map((p) => <option key={p._id} value={p._id}>{p.poNo} · {p.vendorName}{p.total ? ` · ${p.total}` : ""}</option>)}</select>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {f.poId
                  ? <Link to={`${base}?tab=procurement&proc=po&po=${f.poId}`} className={linkBtn}><FileText size={11} /> Open the PO</Link>
                  : pkg && canEdit && <button type="button" onClick={() => void makePo()} disabled={!!making || !scope().name} className={`${linkBtn} disabled:opacity-50`}>{making === "po" ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create a PO for this package</button>}
              </div>
              {!f.poId && pkg && <p className={`mt-0.5 ${hint}`}>{linkedRfq && awarded ? `From the quote awarded on RFQ ${linkedRfq.rfqNo}, with its prices.` : linkedRfq ? `No quote is awarded on RFQ ${linkedRfq.rfqNo} yet: award one in Procurement first, or make a PO now and price it there.` : "A PO for the package's company with the package as its line; the price is added in Procurement."}</p>}
            </div>
            {/* Agreement */}
            <div>
              <span className={lbl}>Agreement</span>
              <select value={f.agreementId} onChange={(e) => set({ agreementId: e.target.value })} className={inp} aria-label="Agreement"><option value="">None</option>{agrs.map((a) => <option key={a._id} value={a._id}>{a.agreementNo || a.name}{a.title ? ` · ${a.title}` : ""} ({a.status}){a.ownerContextType === "general" ? " · General" : ""}</option>)}</select>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {f.agreementId
                  ? <Link to={agrs.find((a) => a._id === f.agreementId)?.ownerContextType === "general" ? `/dashboard/agreements?hl=ag-${f.agreementId}` : `${base}?tab=subs`} className={linkBtn}><FileText size={11} /> Open the agreement</Link>
                  : pkg && canEdit && <button type="button" onClick={() => void makeAgreement()} disabled={!!making || !scope().name} className={`${linkBtn} disabled:opacity-50`}>{making === "agreement" ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Create an agreement for this package</button>}
              </div>
              {!f.agreementId && pkg && <p className={`mt-0.5 ${hint}`}>A General Agreement for this project with {who.name || "the package's company"} as the other party, titled with the package's name. It is written and sent from General Agreements.</p>}
            </div>
          </Section>
        )}

        <Section n={outside ? 4 : 3} title="Progress">
          <label className="block"><span className={lbl}>Status</span><select value={f.status} onChange={(e) => set({ status: e.target.value as WorkPackageStatus })} className={inp}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select></label>
          <div>
            <span className={lbl}>How progress is measured</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {([["manual", "Typed"], ["subtasks", "From its subtasks"], ["schedule", "From the schedule"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => set({ progressMode: k })} aria-pressed={f.progressMode === k} className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${f.progressMode === k ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-primary"}`}>{l}</button>)}
            </div>
          </div>
          {f.progressMode === "manual" && <label className="block"><span className={lbl}>Progress: {f.progress}%</span><input type="range" min={0} max={100} step={5} value={f.progress} onChange={(e) => set({ progress: Number(e.target.value) })} className="mt-2 w-full accent-blue-600" /></label>}
          {f.progressMode === "schedule" && (
            <label className="block">
              <span className={lbl}>Task or phase of the current schedule (optional)</span>
              <select value={f.scheduleRef?.id ? `${f.scheduleRef.kind}:${f.scheduleRef.id}` : ""} onChange={(e) => { const v = e.target.value; const k = v.slice(0, v.indexOf(":")); set({ scheduleRef: v ? { kind: k as "task" | "phase", id: v.slice(k.length + 1) } : { kind: "", id: "" } }); }} className={inp}>
                <option value="">None</option>
                {phases.length > 0 && <optgroup label="Phases">{phases.map((c) => <option key={c} value={`phase:${c}`}>{c}</option>)}</optgroup>}
                <optgroup label="Tasks and milestones">{tasks.map((m) => <option key={m.id} value={`task:${m.id}`}>{m.name}</option>)}</optgroup>
              </select>
              {!tasks.length && <span className={`mt-1 block ${hint}`}>The project has no schedule yet.</span>}
            </label>
          )}
          <div>
            <span className={lbl}>Subtasks / deliverables</span>
            <div className="mt-1 space-y-1.5">
              {subs.map((t, i) => (
                <div key={t.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-1.5">
                  <div className="flex items-center gap-1">
                    <input value={t.name} onChange={(e) => setSub(i, { name: e.target.value })} placeholder="Subtask" aria-label="Subtask name" className={`${small} min-w-0 flex-1`} />
                    <button type="button" onClick={() => moveSub(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded p-1 text-slate-400 hover:bg-white disabled:opacity-30"><ArrowUp size={12} /></button>
                    <button type="button" onClick={() => moveSub(i, 1)} disabled={i === subs.length - 1} aria-label="Move down" className="rounded p-1 text-slate-400 hover:bg-white disabled:opacity-30"><ArrowDown size={12} /></button>
                    <button type="button" onClick={() => set({ subtasks: subs.filter((_, j) => j !== i) })} aria-label="Remove the subtask" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={12} /></button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <select value={t.status} onChange={(e) => setSub(i, { status: e.target.value as WorkPackageStatus })} aria-label="Subtask status" className={small}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
                    <input type="number" min={0} max={100} step={5} value={t.progress} onChange={(e) => setSub(i, { progress: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })} aria-label="Subtask progress" className={`${small} w-14 text-right`} /><span className="text-[11px] text-slate-400">%</span>
                    <input type="date" value={t.dueDate || ""} onChange={(e) => setSub(i, { dueDate: e.target.value })} aria-label="Due date" className={small} />
                    <input value={t.assignee || ""} onChange={(e) => setSub(i, { assignee: e.target.value })} placeholder="Person" aria-label="Person" className={`${small} w-24`} />
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => set({ subtasks: [...subs, { id: newId(), name: "", status: "not_started", progress: 0 }], ...(subs.length === 0 && f.progressMode === "manual" ? { progressMode: "subtasks" } : {}) })} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary"><Plus size={12} /> Add a subtask</button>
          </div>
        </Section>

        {canMoney && (
          <Section n={outside ? 5 : 4} title="Money" note="The original value is the linked PO's total. Without a PO (an agreement, or work done in-house), type the contract value or budget here. Paid is read from the payments recorded in Finances and cannot be typed.">
            <label className="block">
              <span className={lbl}>{f.poId ? "Contract value / budget (not used: the PO's total applies)" : "Contract value / budget"}</span>
              <input type="number" min={0} step="any" value={f.budget || ""} onChange={(e) => set({ budget: Math.max(0, Number(e.target.value) || 0) })} disabled={!!f.poId} placeholder="0" className={inp} />
            </label>
            <div>
              <span className={lbl}>Change orders</span>
              <div className="mt-1 space-y-1.5">
                {cos.map((c, i) => (
                  <div key={c.id} className="rounded-lg border border-amber-100 bg-amber-50/50 p-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <input value={c.no} onChange={(e) => setCo(i, { no: e.target.value })} placeholder="CO-01" aria-label="Change order number" className={`${small} w-20`} />
                      <input type="date" value={c.date} onChange={(e) => setCo(i, { date: e.target.value })} aria-label="Change order date" className={small} />
                      <input type="number" step="any" value={c.amount ?? ""} onChange={(e) => setCo(i, { amount: Number(e.target.value) || 0 })} placeholder="+ / - amount" aria-label="Change order amount" className={`${small} w-28 text-right`} />
                      <select value={c.status} onChange={(e) => setCo(i, { status: e.target.value as "proposed" | "approved" })} aria-label="Change order status" className={small}><option value="approved">Approved</option><option value="proposed">Proposed</option></select>
                      <button type="button" onClick={() => set({ changeOrders: cos.filter((_, j) => j !== i) })} aria-label="Remove the change order" className="ml-auto rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={12} /></button>
                    </div>
                    <input value={c.reason} onChange={(e) => setCo(i, { reason: e.target.value })} placeholder="Reason, e.g. changed to an 80 ton crane per site requirement" aria-label="Reason" className={`${small} mt-1 w-full`} />
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => set({ changeOrders: [...cos, { id: newId(), no: `CO-${String(cos.length + 1).padStart(2, "0")}`, date: new Date().toISOString().slice(0, 10), reason: "", amount: 0, status: "approved" }] })} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary"><Plus size={12} /> Add change order</button>
              {cos.length > 0 && <p className={`mt-1 ${hint}`}>Approved change orders: <b className="text-slate-700"><Fig>{approved >= 0 ? "+" : "-"}{usd(Math.abs(approved))}</Fig></b>. Only approved ones count towards the current value.</p>}
            </div>
            {pkg?.money && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-2 text-xs text-slate-600">
                <span>Original</span><b className="text-right tabular-nums text-slate-800"><Fig>{usd(pkg.money.original)}</Fig></b>
                <span>Current value</span><b className="text-right tabular-nums text-slate-800"><Fig>{usd(pkg.money.current)}</Fig></b>
                <span>Paid</span><b className="text-right tabular-nums text-slate-800"><Fig>{usd(pkg.money.paid)}</Fig></b>
                <span>Remaining</span><b className="text-right tabular-nums text-slate-800"><Fig>{usd(pkg.money.remaining)}</Fig></b>
              </div>
            )}
          </Section>
        )}

        <Section n={(outside ? 5 : 4) + (canMoney ? 1 : 0)} title="Remarks">
          <textarea value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} rows={3} className={`${inp} mt-0 resize-y`} placeholder="Anything worth noting about this package" aria-label="Remarks" />
        </Section>
      </fieldset>
      <Fold title="How this list works">
        <p className={hint}>Work package, then RFQ, vendor quotes, selection of the winner, PO or agreement, execution and progress, payments, completion. The RFQ, quotes, PO, agreement and payments stay where they are made; this list links to them and reads them, so nothing is entered twice.</p>
      </Fold>
    </SidePanel>
  );
}
