import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ProcurementRFQ, { quoteTotal } from "./ProcurementRFQ";
import ProcurementPO from "./ProcurementPO";
import AgreementsPanel from "./agreements/AgreementsPanel";
import InvoiceLedger from "./InvoiceLedger";
import MoneyInput from "./MoneyInput";
import type { ProjectPdfInfo } from "../../lib/pdfProjectHeader";
import {
  Archive, ArchiveRestore, ArrowDown, ArrowUp, Boxes, BadgeCheck, Building2, ChevronDown, ChevronRight, ClipboardCheck, Cog, Download, Eye, EyeOff, FileSpreadsheet, FileText,
  FileUp, Filter, GripVertical, Handshake, Printer, HardHat, HelpCircle, Loader2, Lock, MoreVertical, Paperclip, Package, PenTool, Pencil, Plus, Save, Search, Settings2, Trash2, Truck, Wrench, X,
} from "lucide-react";
import {
  createWorkPackage, deleteWorkPackage, fetchProjectAgreements, fetchRfqs, fetchWorkPackages, importWorkPackages, reorderWorkPackages, updateWorkPackage, withFileToken,
  createAgreement, fetchAgreements, fetchCompany, uploadDocument, documentUrl, attachmentUrl, fetchVendors,
  type ApiAgreement, type ApiChangeOrder, type ApiProject, type ApiRfq, type ApiWorkPackage, type ApiWorkSubtask, type WorkPackageInput, type WorkPackageStatus, type WorkPackageType,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import { useHighlight } from "../../lib/useHighlight";
import { setFiguresShown, useFiguresShown } from "../../lib/figuresPrivacy";
import { UNCATEGORISED, fmtDay, phasePercent } from "../../lib/projectSchedule";
import { Fig } from "./FiguresPrivacy";
import CompanyPicker from "./CompanyPicker";
import ToolMenu, { MENU_ITEM } from "./timeline/ToolMenu";
import { GREENTECH } from "../../lib/poPdf";
import PdfPreviewModal, { type PreviewAction } from "./PdfPreviewModal";
import ShareMenu from "./ShareMenu";
import type { PackageBar } from "../../lib/packageBar";
import type { WpReportRfq, WpReportSections } from "../../lib/workPackagesPdf";

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
  { v: "installation", label: "Installation", icon: Wrench }, { v: "controls", label: "Controls / BAS", icon: Cog }, { v: "lifting", label: "Crane / lifting", icon: Boxes },
  { v: "transport", label: "Tanker / transport", icon: Truck }, { v: "testing", label: "Testing", icon: ClipboardCheck }, { v: "commissioning", label: "Commissioning", icon: Settings2 },
  { v: "other", label: "Other", icon: Boxes },
];
const typeIcon = (t: WorkPackageType) => TYPES.find((x) => x.v === t)?.icon || Boxes;
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
// A scope line is not a BOQ item; it still needs an id of its own for the quotes.
const newLineId = () => Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, "0")).join("");

type ColKey = "rfq" | "quotes" | "winner" | "po" | "status" | "progress" | "original" | "changes" | "current" | "paid" | "remaining" | "remarks";
const COLS: Array<{ key: ColKey; label: string; help: string; money?: boolean }> = [
  { key: "rfq", label: "RFQ", help: "The request for quotation sent to vendors or subcontractors for this work" },
  { key: "quotes", label: "Quotes / offers", help: "The offers that came back on that RFQ" },
  { key: "winner", label: "Winner / responsible", help: "The company doing the work: the awarded quote, a company from the Directory, or GT / the JV for work done in-house" },
  { key: "po", label: "PO / agreement", help: "The purchase order or agreement the work is contracted under" },
  { key: "status", label: "Status", help: "Where the work stands" },
  { key: "progress", label: "Progress", help: "Typed, the average of the subtasks, or read from the schedule" },
  { key: "original", label: "Original value", help: "The contracted amount: the PO's total, the agreement's contract value, or the value typed on the package", money: true },
  { key: "changes", label: "Change orders", help: "Approved change orders on this package", money: true },
  { key: "current", label: "Total value (current)", help: "Original value plus approved change orders", money: true },
  { key: "paid", label: "Paid", help: "Payments recorded in Finances on the vendor's invoices for this PO or agreement, and approved expenses tagged to this package", money: true },
  { key: "remaining", label: "Remaining", help: "Current value minus paid", money: true },
  { key: "remarks", label: "Remarks", help: "A free note" },
];
const VIEW_KEY = "gt-work-packages-view";
type View = { hidden: ColKey[]; compact: boolean };
const loadView = (): View => { try { const v = JSON.parse(localStorage.getItem(VIEW_KEY) || "null"); return { hidden: Array.isArray(v?.hidden) ? v.hidden : [], compact: v?.compact === true }; } catch { return { hidden: [], compact: false }; } };

type Filters = { status: string; who: string; rfq: string; contract: string; changes: boolean };
const NO_FILTER: Filters = { status: "", who: "", rfq: "", contract: "", changes: false };

/** CR 328 (GT Comments 3, picture) - a PO's or agreement's state; Signed in green. */
const docState = (state: string) => state === "Signed"
  ? <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-px font-bold text-emerald-700 ring-1 ring-emerald-200"><BadgeCheck size={10} /> Signed</span>
  : <span className="rounded-full bg-slate-100 px-1.5 py-px font-semibold text-slate-500">{state === "InvoiceReceived" ? "Invoiced" : state === "PendingSignature" ? "Awaiting signature" : state}</span>;
/** The documents of a package's change orders, one small icon each. */
const coDocs = (p: ApiWorkPackage) => {
  const docs = (p.changeOrders || []).filter((c) => c.document);
  return docs.length ? <span className="mt-0.5 flex flex-wrap gap-1">{docs.map((c) => <a key={c.id} href={attachmentUrl(c.document!, c.documentName)} target="_blank" rel="noreferrer" title={`${c.no}: ${c.documentName || "document"}`} className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-600 hover:underline"><Paperclip size={10} /> {c.no}</a>)}</span> : null;
};

/**
 * CR 345 - the package's agreement, filled from the package (its name, scope and company), linked to
 * the project; the package keeps its id.
 */
async function createPackageAgreement(project: ApiProject, f: { name?: string; description?: string; responsible?: ApiWorkPackage["responsible"] }, packageId: string, contractValue = "") {
  const name = (f.name || "").trim(), detail = (f.description || "").trim();
  const who = f.responsible || { kind: "company", companyId: "", name: "" };
  const c = who.kind === "company" && who.companyId ? await fetchCompany(who.companyId).catch(() => null) : null;
  return createAgreement({ kind: "general" }, {
    name, title: name, description: detail, agreementType: "Service", ownerPackageId: packageId, ...(contractValue ? { contractValue } : {}),
    linkedProjects: [{ id: project.id, name: project.name, location: project.location || "" }],
    partySnapshot: {
      party1: { name: GREENTECH.name, contactName: "", address: GREENTECH.address, email: GREENTECH.email, phone: GREENTECH.phone, logoUrl: "/gt-usa-logo-new.png" },
      party2: { name: c?.name || who.name, contactName: c?.contactPersons?.[0]?.name || "", address: c?.address || "", email: c?.email || "", phone: c?.phone || "", logoUrl: c?.logoUrl || "", companyId: c?._id || "" },
      extraParties: [], contextLines: [],
    },
  });
}

export default function WorkPackages({ project, canEdit, projectInfo }: { project: ApiProject; canEdit: boolean; projectInfo?: ProjectPdfInfo }) {
  const { confirm, dialogs } = useDialogs();
  const projectId = project.id;
  const [list, setList] = useState<ApiWorkPackage[] | null>(null);
  const [canMoney, setCanMoney] = useState(false);
  const [canUnlink, setCanUnlink] = useState(false);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  const [showArchived, setShowArchived] = useState(false);
  const [view, setViewState] = useState<View>(loadView);
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* ignore */ } };
  const [folded, setFolded] = useState<Set<string>>(new Set());
  // CR 379 / 380 - adding asks only for a name and a description; a package opens in its own window.
  const [adding, setAdding] = useState(false);
  const [win, setWin] = useState<{ id: string; tab: WinTab } | null>(null);
  const open = (p: ApiWorkPackage, tab: WinTab = "details") => setWin({ id: p._id, tab });
  const [busy, setBusy] = useState(false);
  const shown = useFiguresShown();
  // A link from elsewhere (a company's profile) can point at one package: ?hl=wp-<id>.
  const flash = useHighlight(list !== null);
  // CR 328 (GT Comments 3, page 1: "view, print, share ...") - the list and each package as a PDF.
  const [preview, setPreview] = useState<{ title: string; fileName: string; build: () => Promise<Blob>; actions?: PreviewAction[] } | null>(null);
  // 2026-10-07 - Create Report: one package's, or all of them (null: all).
  const [reportFor, setReportFor] = useState<{ one: ApiWorkPackage | null } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragFrom = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState("");

  const load = () => fetchWorkPackages(projectId).then((r) => { setList(r.packages); setCanMoney(r.canSeeFigures); setCanUnlink(!!r.canUnlink); }).catch((e) => { setList([]); toast(e instanceof Error ? e.message : "Could not load the work packages.", "error"); });
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
  /** A subtask changed: its package's status follows when progress comes from the subtasks (CR 384). */
  const patchSubtask = (p: ApiWorkPackage, id: string, t: Partial<ApiWorkSubtask>) => {
    const subtasks = p.subtasks.map((x) => {
      if (x.id !== id) return x;
      const next = { ...x, ...t };
      if ("status" in t && t.status === "complete") next.progress = 100;
      if ("progress" in t) next.status = (t.progress ?? 0) >= 100 ? "complete" : (t.progress ?? 0) > 0 ? "in_progress" : next.status === "complete" ? "in_progress" : next.status;
      return next;
    });
    const follow: WorkPackageInput = p.progressMode !== "schedule" && p.status !== "on_hold" && p.status !== "cancelled"
      ? { status: subtasks.every((x) => x.status === "complete") ? "complete" : subtasks.some((x) => x.status !== "not_started" || x.progress > 0) ? "in_progress" : "not_started" }
      : {};
    void patch(p, { subtasks, ...follow });
  };
  // CR 384 - a subtask added right under its package's row.
  const [newSub, setNewSub] = useState<{ id: string; name: string } | null>(null);
  const addSubtask = (p: ApiWorkPackage, name: string) => {
    if (!name.trim()) { setNewSub(null); return; }
    void patch(p, { subtasks: [...p.subtasks, { id: newId(), name: name.trim(), status: "not_started", progress: 0 }], ...(p.progressMode === "manual" ? { progressMode: "subtasks" } : {}) });
    setNewSub({ id: p._id, name: "" });
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
  const add = async (name: string, description: string): Promise<boolean> => {
    try {
      const p = await createWorkPackage(projectId, { name, description, progressMode: "manual", status: "not_started", responsible: { kind: "company", companyId: "", name: "" } });
      replace(p);
      toast(`"${p.name}" added. Open it to make its RFQ, take the quotes and write the agreement.`, "success");
      return true;
    } catch (e) { toast(e instanceof Error ? e.message : "Could not add it.", "error"); return false; }
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
  // 2026-10-07 - Create Report: a package's own, or one from all the work packages.
  const reportFile = (one: ApiWorkPackage | null) => one ? `${safeName(project.name)} - Work package ${numberOf.get(one._id) || ""} ${safeName(one.name)} - Report.pdf` : `${safeName(project.name)} - Work packages report.pdf`;
  const openReport = (one: ApiWorkPackage | null, sections: WpReportSections, onlyShown: boolean) => {
    const pkgs = one ? [one] : (onlyShown ? rows : live).filter((p) => !p.archived);
    const fileName = reportFile(one);
    let made: Blob | null = null;
    const build = async () => {
      const { buildWorkPackagesReport } = await import("../../lib/workPackagesPdf");
      const [rfqs, vendors] = sections.quotes
        ? await Promise.all([fetchRfqs(projectId, false, { all: true }).catch(() => [] as ApiRfq[]), fetchVendors(projectId).catch(() => [])])
        : [[] as ApiRfq[], []];
      const vendorName = (id: string) => vendors.find((v) => v._id === id)?.name || "Vendor";
      const rfqsOf = (p: ApiWorkPackage): WpReportRfq[] => rfqs.filter((r) => r.ownerPackageId === p._id || r._id === p.rfqId).map((r) => ({
        no: r.rfqNo, title: r.title || "", date: r.date, currency: r.currency || "USD",
        status: r.quotes.some((q) => q.status === "Awarded") ? "Awarded" : r.status || "Draft",
        quotes: r.quotes.map((q) => ({ vendor: vendorName(q.vendorId), total: quoteTotal(r, q), lead: q.leadTimeDays || "", status: q.status })),
      }));
      made = await buildWorkPackagesReport({
        ...pdfBase(), sections: { ...sections, money: sections.money && canMoney, summary: !one && sections.summary },
        items: pkgs.map((p) => ({ p, no: numberOf.get(p._id) || 0, progress: progressOf(p), rfqs: rfqsOf(p) })),
        note: !one && onlyShown && filtering ? `Filtered: ${pkgs.length} of ${live.filter((p) => !p.archived).length} work packages.` : "",
      });
      return made;
    };
    setPreview({
      title: one ? `Report · Work package ${numberOf.get(one._id) || ""}.0 ${one.name}` : `Work packages report · ${project.name}`,
      fileName, build,
      actions: canEdit ? [{ label: "Save to documents", onClick: async () => {
        try { await uploadDocument(projectId, new File([made || (await build())], fileName, { type: "application/pdf" }), "pm-work-packages", true, "Reports"); toast("Saved to the project's documents (Project Management, Reports).", "success"); }
        catch (e) { toast(e instanceof Error ? e.message : "Could not save it.", "error"); return false; }
        return false;
      } }] : undefined,
    });
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
      const { packages: made, unmatched } = await importWorkPackages(projectId, out);
      setList((l) => [...(l || []), ...made]);
      toast(`${made.length} work package${made.length === 1 ? "" : "s"} imported.${unmatched.length ? ` Not in the Directory, so left for you to pick: ${unmatched.join(", ")}.` : ""}`, unmatched.length ? "info" : "success");
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

  const cellOf = (p: ApiWorkPackage, k: ColKey): ReactNode => {
    const m = p.money;
    const pct = progressOf(p);
    switch (k) {
      case "rfq": return p.rfq ? <><button type="button" onClick={() => open(p, "rfq")} className={linkCls}><FileText size={11} /> {p.rfq.no}</button><span className="block whitespace-nowrap text-[10px] text-slate-400">{p.rfq.date ? fmtDay(p.rfq.date) : p.rfq.status}{p.rfq.vendors ? ` · ${p.rfq.vendors} vendor${p.rfq.vendors === 1 ? "" : "s"}` : ""}</span></> : <span className="text-slate-300">-</span>;
      case "quotes": return p.quotes.count ? <><button type="button" onClick={() => open(p, "quotes")} className={linkCls}><FileText size={11} /> {p.quotes.count} Quote{p.quotes.count === 1 ? "" : "s"}</button>
        {/* CR 328 (GT Comments 3, picture) - who quoted, one per line. */}
        {p.quotes.names.length > 0 && <ul className="mt-0.5 max-w-[11rem] list-disc pl-3.5 text-[10px] leading-snug text-slate-500 marker:text-slate-400">{p.quotes.names.slice(0, 4).map((n, i) => <li key={i} className="truncate" title={n}>{n}</li>)}{p.quotes.names.length > 4 && <li className="list-none -ml-3.5 text-slate-400">+{p.quotes.names.length - 4} more</li>}</ul>}</> : <span className="text-slate-300">-</span>;
      case "winner": return p.winner ? (
        <span className="flex items-start gap-2">
          {p.winner.logoUrl
            ? <img src={withFileToken(p.winner.logoUrl)} alt="" className="h-6 w-6 shrink-0 rounded-full border border-slate-100 object-contain" />
            : <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${p.winner.internal ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{p.winner.internal ? <Building2 size={12} /> : p.winner.name.charAt(0).toUpperCase()}</span>}
          <span className="min-w-0"><span className="flex items-center gap-1 font-semibold text-slate-800">{p.winner.name}{!!p.locks?.length && <Lock size={10} className="shrink-0 text-slate-400" aria-label="Locked" title={`Locked: ${p.locks[0].no} is ${p.locks[0].label}`} />}</span><span className="block max-w-[11rem] truncate text-[10px] text-slate-400" title={p.winner.place}>{p.winner.internal ? "Done in-house" : p.winner.place}</span></span>
        </span>
      ) : <span className="text-slate-300">-</span>;
      case "po": return p.po ? <><button type="button" onClick={() => open(p, "po")} className={linkCls}><FileText size={11} /> {p.po.no}</button><span className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[10px] text-slate-400">{docState(p.po.signed ? "Signed" : p.po.status)}{p.po.date ? fmtDay(p.po.date) : ""}</span></>
        : p.agreement ? <><button type="button" onClick={() => open(p, "agreement")} className={linkCls}><FileText size={11} /> {p.agreement.no}</button><span className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[10px] text-slate-400">{docState(p.agreement.status)}{p.agreement.date ? fmtDay(p.agreement.date) : ""}</span></>
        : <span className="text-slate-300">-</span>;
      case "status": return (
        <select disabled={!canEdit} value={p.status} onChange={(e) => void patch(p, { status: e.target.value as WorkPackageStatus, ...(e.target.value === "complete" && p.progressMode === "manual" ? { progress: 100 } : {}) })} aria-label={`Status of ${p.name}`} className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${STATUS[p.status].cls}`}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
      );
      case "progress": return (
        <span className="flex items-center gap-2" title={p.progressMode === "schedule" ? "Read from the schedule" : p.subtasks.length ? "The average of its subtasks" : "Typed"}>
          {p.progressMode === "manual" && !p.subtasks.length && canEdit
            ? <input type="number" min={0} max={100} step={5} key={p.progress} defaultValue={p.progress} onBlur={(e) => { const v = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))); if (v !== p.progress) void patch(p, { progress: v }); }} aria-label={`Progress of ${p.name}`} className="w-12 rounded-md border border-slate-200 px-1 py-0.5 text-right text-xs tabular-nums" />
            : <span className="w-9 text-right font-bold tabular-nums text-slate-800">{pct}%</span>}
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} /></span>
        </span>
      );
      case "original": return m && (m.original || m.source) ? <span className={`tabular-nums ${m.changes ? "text-slate-400 line-through" : "font-semibold text-slate-800"}`} title={m.source === "po" ? "The PO's total" : m.source === "agreement" ? "The agreement's contract value" : "The value typed on the package"}><Fig>{usd(m.original)}</Fig></span> : <span className="text-slate-300">-</span>;
      case "changes": return m && m.changeCount ? <><span className={`font-bold tabular-nums ${m.changes >= 0 ? "text-red-600" : "text-emerald-600"}`}><Fig>{m.changes >= 0 ? "+" : "-"}{usd(Math.abs(m.changes))}</Fig></span>{canEdit ? <button type="button" onClick={() => open(p, "money")} className="block text-[10px] font-bold text-blue-600 hover:underline">{m.changeCount} change order{m.changeCount === 1 ? "" : "s"}</button> : <span className="block text-[10px] text-slate-400">{m.changeCount} change order{m.changeCount === 1 ? "" : "s"}</span>}{coDocs(p)}</> : <span className="text-slate-300">-</span>;
      case "current": return m && (m.current || m.source) ? <span className="font-bold tabular-nums text-slate-900"><Fig>{usd(m.current)}</Fig></span> : <span className="text-slate-300">-</span>;
      case "paid": return m && (m.paid || m.source) ? <span className="tabular-nums text-slate-700"><Fig>{usd(m.paid)}</Fig></span> : <span className="text-slate-300">-</span>;
      case "remaining": return m && (m.current || m.source) ? <span className={`font-semibold tabular-nums ${m.remaining < 0 ? "text-red-600" : "text-slate-800"}`}><Fig>{usd(m.remaining)}</Fig></span> : <span className="text-slate-300">-</span>;
      case "remarks": return canEdit
        ? <textarea key={p.remarks} defaultValue={p.remarks} rows={view.compact ? 1 : 2} onBlur={(e) => { if (e.target.value.trim() !== p.remarks) void patch(p, { remarks: e.target.value }); }} placeholder="-" aria-label={`Remarks on ${p.name}`} className="w-48 resize-y rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-slate-600 hover:border-slate-200 focus:border-primary focus:bg-white focus:outline-none" />
        : <span className="block max-w-[14rem] text-[11px] text-slate-600">{p.remarks || "-"}</span>;
    }
  };

  return (
    <div className="space-y-3">
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
          <button type="button" onClick={() => setReportFor({ one: null })} disabled={!all.some((p) => !p.archived)} title="A report from all the work packages: the totals, then each package" className={btn}><FileText size={13} /> Create Report</button>
          {canEdit && <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"><Plus size={13} /> Add Work Package</button>}
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
                    data-hl={`wp-${p._id}`} id={`wp-${p._id}`}
                    className={`border-t border-slate-100 ${dragOver === p._id ? "bg-blue-50" : rowBg} ${p.archived ? "opacity-60" : ""} ${flash === `wp-${p._id}` ? "hl-flash" : ""}`}
                  >
                    <td className={`${td} sticky left-0 z-[1] ${dragOver === p._id ? "bg-blue-50" : amber ? "bg-amber-50" : "bg-white"}`}>
                      <span className="flex items-center gap-1 font-bold tabular-nums text-slate-800">
                        {canEdit && !filtering && <GripVertical size={12} className="cursor-grab text-slate-300" />}
                        {n ? `${n}.0` : "-"}
                        {p.subtasks.length > 0 && <button type="button" onClick={() => setFolded((s) => { const x = new Set(s); if (x.has(p._id)) x.delete(p._id); else x.add(p._id); return x; })} aria-label={isFolded ? "Show the subtasks" : "Fold the subtasks"} className="rounded p-0.5 text-slate-400 hover:bg-slate-100">{isFolded ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button>}
                      </span>
                    </td>
                    <td className={`${td} sticky left-16 z-[1] ${dragOver === p._id ? "bg-blue-50" : amber ? "bg-amber-50" : "bg-white"}`}>
                      <button type="button" onClick={() => open(p)} title="Open the package: details, RFQ, quotes, agreement, money" className="flex items-start gap-2 text-left">
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
                        <button type="button" onClick={() => open(p)} className={MENU_ITEM}><Pencil size={13} /> Open</button>
                        <button type="button" onClick={() => setPreview({ title: `Work package ${n || ""}.0 · ${p.name}`, fileName: sheetFile(p), build: () => sheetPdf(p) })} className={MENU_ITEM}><Printer size={13} /> Print package sheet</button>
                        <button type="button" onClick={() => setReportFor({ one: p })} className={MENU_ITEM}><FileText size={13} /> Create report</button>
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
                  {canEdit && !isFolded && !p.archived && (
                    <tr className="border-t border-slate-50 bg-slate-50/30">
                      <td className="sticky left-0 z-[1] bg-slate-50/30 px-3 py-1 pl-7 text-[11px] tabular-nums text-slate-300">{n ? `${n}.${p.subtasks.length + 1}` : ""}</td>
                      <td className="sticky left-16 z-[1] bg-slate-50/30 px-3 py-1 pl-8" colSpan={1}>
                        {newSub?.id === p._id ? (
                          <input autoFocus value={newSub.name} onChange={(e) => setNewSub({ id: p._id, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") addSubtask(p, newSub.name); if (e.key === "Escape") setNewSub(null); }} onBlur={() => addSubtask(p, newSub.name)} placeholder="Subtask name, then Enter" aria-label={`New subtask of ${p.name}`} className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] focus:border-primary focus:outline-none" />
                        ) : (
                          <button type="button" onClick={() => setNewSub({ id: p._id, name: "" })} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-primary"><Plus size={11} /> Add subtask</button>
                        )}
                      </td>
                      <td colSpan={cols.length + 1} />
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {canEdit && list !== null && (
              <tr className="border-t border-slate-100">
                <td colSpan={cols.length + 3} className="p-2">
                  <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-left text-xs hover:border-primary hover:bg-blue-50/40">
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

      {adding && <AddPackage onAdd={add} onClose={() => setAdding(false)} />}
      {win && (() => {
        const p = all.find((x) => x._id === win.id);
        if (!p) return null;
        return (
          <Fragment key={p._id}><PackageWindow
            pkg={p} no={`${numberOf.get(p._id) || p.order}.0`} project={project} projectInfo={projectInfo}
            canEdit={canEdit} canUnlink={canUnlink} canMoney={canMoney} confirm={confirm} tab={win.tab}
            sheet={{ fileName: sheetFile(p), build: () => sheetPdf(p), share: async () => shareFile(await sheetPdf(p), sheetFile(p)) }}
            onReport={() => setReportFor({ one: p })}
            onSaved={replace} onChanged={() => void load()} onClose={() => { setWin(null); void load(); }}
          /></Fragment>
        );
      })()}
      {/* At the page's root: a report made from inside a package's window shows above it. */}
      {preview && createPortal(<PdfPreviewModal title={preview.title} fileName={preview.fileName} build={preview.build} actions={preview.actions} onClose={() => setPreview(null)} />, document.body)}
      {reportFor && (
        <ReportPicker
          one={reportFor.one} canMoney={canMoney} shown={rows.filter((p) => !p.archived).length} total={live.filter((p) => !p.archived).length} filtering={filtering}
          onClose={() => setReportFor(null)}
          onBuild={(sections, onlyShown) => { const one = reportFor.one; setReportFor(null); openReport(one, sections, onlyShown); }}
        />
      )}
      {dialogs}
    </div>
  );
}

// ── Add: just a name and a short description (CR 379) ──
const lbl = "block text-[10px] font-bold uppercase tracking-widest text-slate-400";
const inp = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";
const hint = "text-[11px] leading-snug text-slate-500";

/**
 * CR 379 - "When you add a work [package], you don't need all of this. What is the name of it and
 * what is the description? ... So it will create a row." Everything else is done in its window.
 */
function AddPackage({ onAdd, onClose }: { onAdd: (name: string, description: string) => Promise<boolean>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { if (await onAdd(name.trim(), description.trim())) onClose(); } finally { setBusy(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label="Add work package" className="my-16 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Boxes size={15} className="text-blue-600" /> Add work package</p>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <label className="block"><span className={lbl}>Name *</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} placeholder="e.g. Crane Service (50 ton)" className={inp} /></label>
          <label className="block"><span className={lbl}>Short description</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inp} resize-y`} placeholder="What this package covers" /></label>
          <p className={hint}>It is added as a row. Open it to make its RFQ, take the quotes, choose the winner and write the agreement.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={busy || !name.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Create Report (2026-10-07): what goes in it ──
const REPORT_PARTS: Array<{ key: keyof WpReportSections; label: string; hint: string; allOnly?: boolean; money?: boolean }> = [
  { key: "summary", label: "Summary of all packages", hint: "The totals, then one line per package with its company, status and progress.", allOnly: true },
  { key: "details", label: "Description and who does it", hint: "What the package covers, the company doing it, and its RFQ, PO or agreement." },
  { key: "quotes", label: "RFQ and quotes", hint: "Each vendor's offer on the package's RFQ: lead time, and which one won." },
  { key: "subtasks", label: "Subtasks and deliverables", hint: "Each subtask with its status, progress, due date and person." },
  { key: "money", label: "Money and change orders", hint: "Contract value, change orders, paid and remaining.", money: true },
  { key: "remarks", label: "Remarks", hint: "The notes on each package." },
];

function ReportPicker({ one, canMoney, shown, total, filtering, onBuild, onClose }: {
  one: ApiWorkPackage | null; canMoney: boolean; shown: number; total: number; filtering: boolean;
  onBuild: (sections: WpReportSections, onlyShown: boolean) => void; onClose: () => void;
}) {
  const parts = REPORT_PARTS.filter((x) => (!x.allOnly || !one) && (!x.money || canMoney));
  const [pick, setPick] = useState<WpReportSections>({ summary: true, details: true, quotes: true, subtasks: true, money: canMoney, remarks: true });
  const [onlyShown, setOnlyShown] = useState(filtering);
  const none = !parts.some((x) => pick[x.key]);
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label="What goes in the report?" className="my-16 w-full max-w-lg rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileText size={15} className="text-primary" /> What goes in the report?</p>
            <p className="truncate text-[11px] text-slate-400">{one ? `Work package: ${one.name}` : "All the work packages"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X size={18} /></button>
        </div>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] text-slate-500">Everything is included unless you take it out.</p>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setPick((p) => ({ ...p, ...Object.fromEntries(parts.map((x) => [x.key, true])) }))} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary">All</button>
              <button type="button" onClick={() => setPick((p) => ({ ...p, ...Object.fromEntries(parts.map((x) => [x.key, false])) }))} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary">None</button>
            </div>
          </div>
          {parts.map((x) => (
            <label key={x.key} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-transparent p-2 hover:border-slate-100 hover:bg-slate-50">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500" checked={pick[x.key]} onChange={(e) => setPick((p) => ({ ...p, [x.key]: e.target.checked }))} />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-800">{x.label}</span>
                <span className="block text-[11px] text-slate-400">{x.key === "quotes" && canMoney ? "Each vendor's offer on the package's RFQ: total, lead time, and which one won." : x.hint}</span>
              </span>
            </label>
          ))}
          {!one && filtering && (
            <div className="mt-2 space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Which packages</p>
              <label className="flex cursor-pointer items-center gap-2"><input type="radio" checked={onlyShown} onChange={() => setOnlyShown(true)} className="accent-emerald-500" /> The {shown} shown (search and filters apply)</label>
              <label className="flex cursor-pointer items-center gap-2"><input type="radio" checked={!onlyShown} onChange={() => setOnlyShown(false)} className="accent-emerald-500" /> All {total} work packages</label>
            </div>
          )}
          {!one && !filtering && <p className="pt-1 text-[11px] text-slate-400">Covers all {total} work packages (archived ones are left out); each package starts on its own page after the summary.</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => onBuild(pick, !one && onlyShown)} disabled={none} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><FileText size={13} /> Create the report</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── The package's window (CR 380): everything about one package, step by step, in tabs ──
export type WinTab = "details" | "rfq" | "quotes" | "agreement" | "money" | "po";

const inputOf = (p: ApiWorkPackage): WorkPackageInput => ({
  name: p.name, description: p.description, type: p.type, responsible: p.responsible, rfqId: p.rfqId, poId: p.poId, agreementId: p.agreementId, status: p.status,
  progressMode: p.progressMode, progress: p.progress, scheduleRef: p.scheduleRef, subtasks: p.subtasks, budget: p.budget || 0, changeOrders: p.changeOrders, remarks: p.remarks,
});

function PackageWindow({ pkg, no, project, projectInfo, canEdit, canUnlink, canMoney, confirm, tab: initialTab, sheet, onReport, onSaved, onChanged, onClose }: {
  /** 2026-10-07 - this package's own report. */
  onReport: () => void;
  pkg: ApiWorkPackage; no: string; project: ApiProject; projectInfo?: ProjectPdfInfo; canEdit: boolean; canMoney: boolean;
  /** The package's sheet as a PDF: its file name, made on demand, and filed for sharing (its link). */
  sheet: { fileName: string; build: () => Promise<Blob>; share: () => Promise<string> };
  /** CR 328 - may unlink a signed document (the project's own team, not a guest). */
  canUnlink: boolean; confirm: ReturnType<typeof useDialogs>["confirm"];
  tab: WinTab;
  onSaved: (p: ApiWorkPackage) => void;
  /** Something inside it was made or changed (an RFQ, a quote, the agreement): the table reloads. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<WinTab>(initialTab);
  // 2026-10-07 - the open document's actions (RFQ, quotes, agreement, PO), drawn on the bottom bar.
  const [docBar, setDocBar] = useState<PackageBar | null>(null);
  const [sheetPreview, setSheetPreview] = useState(false);
  const [f, setF] = useState<WorkPackageInput>(() => inputOf(pkg));
  const [saved, setSaved] = useState(() => JSON.stringify(inputOf(pkg)));
  const dirty = JSON.stringify(f) !== saved;
  const [busy, setBusy] = useState(false);
  const set = (patch: WorkPackageInput) => setF((p) => ({ ...p, ...patch }));
  const who = f.responsible!;
  const subs = f.subtasks || [];
  const cos = f.changeOrders || [];
  const owner = { id: pkg._id, name: `${no} ${pkg.name}` };

  const save = async (): Promise<boolean> => {
    if (!canEdit) return true;
    setBusy(true);
    try {
      const p = await updateWorkPackage(project.id, pkg._id, f);
      onSaved(p);
      setF(inputOf(p)); setSaved(JSON.stringify(inputOf(p)));
      toast("Work package saved.", "success");
      return true;
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save.", "error"); return false; }
    finally { setBusy(false); }
  };
  const close = async () => {
    if (dirty && canEdit && !(await confirm({ title: "Close without saving?", message: "The changes to this package's details are lost.", confirmLabel: "Close", danger: true }))) return;
    onClose();
  };

  // ── Agreement (CR 383): the contract with the winner; its value is the package's money ──
  const [agr, setAgr] = useState<ApiAgreement | null | "loading">(pkg.agreementId ? "loading" : null);
  useEffect(() => {
    if (!pkg.agreementId) { setAgr(null); return; }
    setAgr("loading");
    void fetchAgreements({ kind: "general" }, false, { package: pkg._id }).catch(() => [] as ApiAgreement[]).then((list) => setAgr(list.find((a) => a._id === pkg.agreementId) || null));
  }, [pkg.agreementId, pkg._id]);
  const [makingAgr, setMakingAgr] = useState(false);
  const makeAgreement = async () => {
    setMakingAgr(true);
    try {
      // Filled from the winner: the company, and the accepted quote's total as the contract value.
      const rfqs = await fetchRfqs(project.id, false, { package: pkg._id }).catch(() => [] as ApiRfq[]);
      const won = rfqs.flatMap((r) => r.quotes.filter((q) => q.status === "Awarded").map((q) => ({ r, q })))[0];
      const value = won ? quoteTotal(won.r, won.q) : 0;
      const party = pkg.winner && !pkg.winner.internal ? { kind: "company" as const, companyId: pkg.winner.companyId, name: pkg.winner.name } : who;
      const ag = await createPackageAgreement(project, { name: f.name, description: f.description, responsible: party }, pkg._id, value ? String(Math.round(value * 100) / 100) : "");
      const p = await updateWorkPackage(project.id, pkg._id, { agreementId: ag._id });
      onSaved(p);
      set({ agreementId: ag._id }); setSaved((s) => JSON.stringify({ ...JSON.parse(s), agreementId: ag._id }));
      toast(`Agreement ${ag.agreementNo || ""} made with ${party.name || "the winner"}. Write and sign it below.`.replace("  ", " "), "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not make the agreement.", "error"); }
    finally { setMakingAgr(false); }
  };

  // ── Details ──
  const tasks = project.schedule?.milestones || [];
  const phases = [...new Set([...(project.schedule?.categories || []), ...tasks.map((m) => (m.category || "").trim()).filter(Boolean)])];
  const setSub = (i: number, t: Partial<ApiWorkSubtask>) => set({ subtasks: subs.map((x, j) => (j === i ? { ...x, ...t, ...(t.status === "complete" ? { progress: 100 } : {}) } : x)) });
  const moveSub = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= subs.length) return; const next = [...subs]; [next[i], next[j]] = [next[j], next[i]]; set({ subtasks: next }); };
  const setCo = (i: number, c: Partial<ApiChangeOrder>) => set({ changeOrders: cos.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  const [coUploading, setCoUploading] = useState("");
  const attachCo = async (id: string, file: File) => {
    setCoUploading(id);
    try {
      const doc = await uploadDocument(project.id, file, "pm-work-packages", false, "Change orders");
      setF((p) => ({ ...p, changeOrders: (p.changeOrders || []).map((x) => (x.id === id ? { ...x, document: doc.filePath, documentName: doc.name } : x)) }));
      toast("Document attached. Save the package to keep it.", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not upload the document.", "error"); }
    finally { setCoUploading(""); }
  };
  const approved = cos.filter((c) => c.status === "approved").reduce((a, c) => a + (Number(c.amount) || 0), 0);
  // CR 328 - a signed PO or agreement binds the package's company until it is unlinked.
  const locks = (pkg.locks || []).filter((l) => (l.kind === "po" ? f.poId === pkg.poId : f.agreementId === pkg.agreementId));
  const locked = locks.length > 0;
  const unlink = async (kind: "po" | "agreement") => {
    const l = locks.find((x) => x.kind === kind);
    if (!l) return;
    if (!(await confirm({ title: `Unlink ${l.no}?`, message: `${l.no} is ${l.label}. Unlinked, the package's company can be changed again; ${l.no} itself is not touched. The change is kept when you save the package.`, confirmLabel: "Unlink" }))) return;
    set(kind === "po" ? { poId: "" } : { agreementId: "" });
  };
  const looseCompany = who.kind === "company" && !!who.name.trim() && !who.companyId;
  const small = "rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-800 focus:border-primary focus:outline-none";
  const fromSubs = subs.length > 0 && f.progressMode !== "schedule";
  const subAvg = subs.length ? Math.round(subs.reduce((a, t) => a + (t.progress || 0), 0) / subs.length) : 0;

  const m = pkg.money;
  const hasRfq = !!pkg.rfq;
  const won = pkg.winner && pkg.winner.from === "quote";
  const TABS: Array<{ k: WinTab; n?: number; label: string; done?: boolean; show?: boolean }> = [
    { k: "details", label: "Details & progress" },
    { k: "rfq", n: 1, label: "RFQ", done: hasRfq },
    { k: "quotes", n: 2, label: "Quotes & winner", done: !!won },
    { k: "agreement", n: 3, label: "Agreement", done: !!pkg.agreement },
    // 2026-10-07 - "Invoice" (was Money): the contract's invoices, then its value and change orders.
    { k: "money", label: "Invoice", show: canMoney },
    { k: "po", label: "Purchase order", show: !!pkg.po },
  ];
  // The contract the package's invoices bill: its agreement, or an older package's PO.
  const agrDoc = agr && agr !== "loading" ? agr : null;
  const party2 = agrDoc?.partySnapshot?.party2;
  const invParty = pkg.winner && !pkg.winner.internal ? { name: pkg.winner.name, companyId: pkg.winner.companyId } : { name: party2?.name || "", companyId: party2?.companyId || "" };
  const contract = pkg.agreementId && pkg.agreement
    ? { agreementId: pkg.agreementId, label: [pkg.agreement.no, pkg.agreement.title].filter(Boolean).join(" · ") || "The agreement", party: invParty.name, companyId: invParty.companyId, total: m?.current || undefined }
    : pkg.poId && pkg.po
      ? { poId: pkg.poId, label: `Purchase order ${pkg.po.no}`, party: invParty.name, companyId: invParty.companyId }
      : null;
  // An invoice or payment logged here changes the package's Paid: the table reloads (not on the first load).
  const invSeen = useRef(false);
  const invoicesChanged = () => { if (invSeen.current) onChanged(); invSeen.current = true; };
  const card = "rounded-2xl border border-slate-100 bg-white p-4 shadow-sm";
  const docTab = tab === "rfq" || tab === "quotes" || tab === "agreement" || tab === "po";
  const barBtn = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-50";
  const barPrimary = "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50";

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-2 sm:p-4">
      <div role="dialog" aria-label={`Work package ${no} ${pkg.name}`} className="my-2 flex w-full max-w-7xl flex-col rounded-3xl bg-slate-50 shadow-2xl sm:my-4">
        {/* Header: the package at a glance, and its steps */}
        <div className="sticky top-0 z-20 rounded-t-3xl border-b border-slate-200 bg-white px-4 pt-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400"><Boxes size={12} /> Work package {no}</p>
              <h3 className="truncate font-display text-lg font-bold text-slate-900">{f.name || pkg.name}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                <span className={`rounded-md border px-1.5 py-0.5 font-bold ${STATUS[pkg.status].cls}`}>{STATUS[pkg.status].label}</span>
                <span className="inline-flex items-center gap-1.5 text-slate-500"><span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${pkg.progress >= 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${pkg.progress}%` }} /></span><b className="tabular-nums text-slate-700">{pkg.progress}%</b></span>
                {pkg.winner && <span className="inline-flex items-center gap-1 text-slate-500"><Building2 size={11} /> {pkg.winner.internal ? "In-house:" : won ? "Winner:" : "Company:"} <b className="text-slate-700">{pkg.winner.name}</b></span>}
                {canMoney && m && (m.current || m.source) ? <span className="text-slate-500">Current value <b className="tabular-nums text-slate-700"><Fig>{usd(m.current)}</Fig></b></span> : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={onReport} title="This package's report: details, quotes, subtasks, money" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-primary hover:text-primary"><FileText size={13} /> Create Report</button>
              <button type="button" onClick={() => void close()} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
            </div>
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {TABS.filter((t) => t.show !== false).map((t) => (
              <button key={t.k} type="button" onClick={() => setTab(t.k)} className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-bold transition-colors ${tab === t.k ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                {t.n && <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${t.done ? "bg-emerald-500 text-white" : tab === t.k ? "bg-primary text-white" : "bg-slate-200 text-slate-600"}`}>{t.done ? <BadgeCheck size={10} /> : t.n}</span>}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 p-3 sm:p-5">
          {tab === "details" && (
            <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <section className={`${card} space-y-3`}>
                  <h4 className="text-sm font-bold text-slate-800">Requirement</h4>
                  <label className="block"><span className={lbl}>Name *</span><input value={f.name} onChange={(e) => set({ name: e.target.value })} className={inp} /></label>
                  <label className="block"><span className={lbl}>Description</span><textarea value={f.description} onChange={(e) => set({ description: e.target.value })} rows={3} className={`${inp} resize-y`} placeholder="What this requirement covers" /></label>
                  <div>
                    <span className={lbl}>Type</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {TYPES.map((t) => <button key={t.v} type="button" onClick={() => set({ type: t.v })} aria-pressed={f.type === t.v} className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-bold ${f.type === t.v ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-primary"}`}><t.icon size={12} /> {t.label}</button>)}
                    </div>
                  </div>
                </section>
                <section className={`${card} space-y-3`}>
                  <h4 className="text-sm font-bold text-slate-800">Who does it</h4>
                  {locked && (
                    <p className="flex items-start gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600">
                      <Lock size={12} className="mt-0.5 shrink-0" />
                      <span>Locked: {locks.map((l) => `${l.no} is ${l.label}`).join(", and ")}. {canUnlink && canEdit ? locks.map((l) => <button key={l.kind} type="button" onClick={() => void unlink(l.kind)} className="ml-1 font-bold text-red-600 hover:underline">Unlink {l.no}</button>) : "Only the project's team can unlink it."}</span>
                    </p>
                  )}
                  <fieldset disabled={locked} className="space-y-3 disabled:opacity-70">
                    <div className="flex gap-1.5">
                      {([["company", "An outside company"], ["internal", "GT / JV (in-house)"]] as const).map(([k, l]) => (
                        <button key={k} type="button" onClick={() => set({ responsible: k === "internal" ? { kind: "internal", companyId: "", name: who.kind === "internal" ? who.name : "GT" } : { kind: "company", companyId: "", name: "" } })} aria-pressed={who.kind === k} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${who.kind === k ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-primary"}`}>{l}</button>
                      ))}
                    </div>
                    {who.kind === "company" ? (
                      <div>
                        <span className={lbl}>Company (from the Directory, optional)</span>
                        <div className="mt-1"><CompanyPicker size="sm" value={who.name} category="vendor" categories={["vendor", "subcontractor", "supplier", "manufacturer", "consultant"]} onNameChange={(v) => set({ responsible: { kind: "company", companyId: "", name: v } })} onSelectCompany={(c) => set({ responsible: { kind: "company", companyId: c._id, name: c.name } })} placeholder="Search the Directory" /></div>
                        {looseCompany
                          ? <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600">"{who.name}" is not picked from the Directory. Choose it from the list to save.</p>
                          : <p className={`mt-1 ${hint}`}>Usually left empty: the winner chosen in Quotes is the package's company.</p>}
                      </div>
                    ) : (
                      <label className="block"><span className={lbl}>Done by</span><input value={who.name} onChange={(e) => set({ responsible: { kind: "internal", companyId: "", name: e.target.value } })} placeholder="GT, or the JV's name" className={inp} /></label>
                    )}
                  </fieldset>
                </section>
                <section className={`${card} space-y-2`}>
                  <h4 className="text-sm font-bold text-slate-800">Remarks</h4>
                  <textarea value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} rows={3} className={`${inp} mt-0 resize-y`} placeholder="Anything worth noting about this package" aria-label="Remarks" />
                </section>
              </div>
              <section className={`${card} space-y-3`}>
                <h4 className="text-sm font-bold text-slate-800">Progress and subtasks</h4>
                <label className="block"><span className={lbl}>Status</span><select value={f.status} onChange={(e) => set({ status: e.target.value as WorkPackageStatus })} className={inp}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select></label>
                <div>
                  <span className={lbl}>Subtasks / deliverables</span>
                  <p className={`mt-0.5 ${hint}`}>Numbered {no.replace(/\.0$/, "")}.1, {no.replace(/\.0$/, "")}.2... under the package. With subtasks, the package's progress is worked out from them.</p>
                  <div className="mt-2 space-y-1.5">
                    {subs.map((t, i) => (
                      <div key={t.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-1.5">
                        <div className="flex items-center gap-1">
                          <span className="w-8 shrink-0 text-[11px] font-bold tabular-nums text-slate-400">{no.replace(/\.0$/, "")}.{i + 1}</span>
                          <input value={t.name} onChange={(e) => setSub(i, { name: e.target.value })} placeholder="Subtask, e.g. Civil design" aria-label="Subtask name" className={`${small} min-w-0 flex-1`} />
                          <button type="button" onClick={() => moveSub(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded p-1 text-slate-400 hover:bg-white disabled:opacity-30"><ArrowUp size={12} /></button>
                          <button type="button" onClick={() => moveSub(i, 1)} disabled={i === subs.length - 1} aria-label="Move down" className="rounded p-1 text-slate-400 hover:bg-white disabled:opacity-30"><ArrowDown size={12} /></button>
                          <button type="button" onClick={() => set({ subtasks: subs.filter((_, j) => j !== i) })} aria-label="Remove the subtask" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={12} /></button>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1 pl-9">
                          <select value={t.status} onChange={(e) => setSub(i, { status: e.target.value as WorkPackageStatus })} aria-label="Subtask status" className={small}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
                          <input type="number" min={0} max={100} step={5} value={t.progress} onChange={(e) => setSub(i, { progress: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })} aria-label="Subtask progress" className={`${small} w-14 text-right`} /><span className="text-[11px] text-slate-400">%</span>
                          <input type="date" value={t.dueDate || ""} onChange={(e) => setSub(i, { dueDate: e.target.value })} aria-label="Due date" className={small} />
                          <input value={t.assignee || ""} onChange={(e) => setSub(i, { assignee: e.target.value })} placeholder="Person" aria-label="Person" className={`${small} w-28`} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => set({ subtasks: [...subs, { id: newId(), name: "", status: "not_started", progress: 0 }], ...(f.progressMode === "manual" ? { progressMode: "subtasks" } : {}) })} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary"><Plus size={12} /> Add a subtask</button>
                </div>
                <div className="border-t border-slate-100 pt-3">
                  <span className={lbl}>Progress</span>
                  {fromSubs ? (
                    <p className="mt-1 text-xs text-slate-600"><b className="tabular-nums text-slate-900">{subAvg}%</b>, the average of its {subs.length} subtask{subs.length === 1 ? "" : "s"}.</p>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {([["manual", "Typed"], ["schedule", "From the schedule"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => set({ progressMode: k })} aria-pressed={f.progressMode === k} className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${f.progressMode === k ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-primary"}`}>{l}</button>)}
                    </div>
                  )}
                  {!fromSubs && f.progressMode === "manual" && <label className="mt-2 block"><span className={hint}>{f.progress}%</span><input type="range" min={0} max={100} step={5} value={f.progress} onChange={(e) => set({ progress: Number(e.target.value) })} className="w-full accent-blue-600" /></label>}
                  {f.progressMode === "schedule" && (
                    <label className="mt-2 block">
                      <span className={hint}>Task or phase of the current schedule</span>
                      <select value={f.scheduleRef?.id ? `${f.scheduleRef.kind}:${f.scheduleRef.id}` : ""} onChange={(e) => { const v = e.target.value; const k = v.slice(0, v.indexOf(":")); set({ scheduleRef: v ? { kind: k as "task" | "phase", id: v.slice(k.length + 1) } : { kind: "", id: "" } }); }} className={inp}>
                        <option value="">None</option>
                        {phases.length > 0 && <optgroup label="Phases">{phases.map((c) => <option key={c} value={`phase:${c}`}>{c}</option>)}</optgroup>}
                        <optgroup label="Tasks and milestones">{tasks.map((x) => <option key={x.id} value={`task:${x.id}`}>{x.name}</option>)}</optgroup>
                      </select>
                      {subs.length > 0 && <button type="button" onClick={() => set({ progressMode: "subtasks" })} className="mt-1 text-[11px] font-bold text-blue-600 hover:underline">Use the subtasks instead</button>}
                    </label>
                  )}
                </div>
              </section>
            </fieldset>
          )}

          {/* CR 381 - the RFQ in place: saved, then each vendor's copy downloaded or emailed one by one. */}
          {tab === "rfq" && (
            <ProcurementRFQ projectId={project.id} canEdit={canEdit} projectInfo={projectInfo} ownerPackage={owner} inline="request" onBar={setDocBar}
              seed={{ title: f.name, notes: f.description, lineItems: [{ itemId: newLineId(), description: f.name || pkg.name, qty: "1", unit: "lot", spec: f.description || "" }], vendorIds: [] }}
              onChanged={onChanged} />
          )}
          {/* CR 382 - each vendor's quote (its file and prices), and the winner. */}
          {tab === "quotes" && (
            <ProcurementRFQ projectId={project.id} canEdit={canEdit} projectInfo={projectInfo} ownerPackage={owner} inline="quotes" onBar={setDocBar}
              onGoToRequest={() => setTab("rfq")} onChanged={onChanged} onAwarded={() => setTab("agreement")} />
          )}
          {tab === "agreement" && (
            agr === "loading" ? (
              <p className="inline-flex items-center gap-2 p-6 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" /> Loading the agreement</p>
            ) : !agr ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <Handshake size={28} className="mx-auto text-slate-300" />
                <p className="mt-2 text-sm font-bold text-slate-700">No agreement for this package yet</p>
                <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">{won ? `Made with the winner, ${pkg.winner!.name}, with the accepted quote's total as the contract value. It is written and signed here, and its value is the package's money.` : "Choose the winner in Quotes first: the agreement is made with them, from their quote. Its value is the package's money."}</p>
                {canEdit && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {!won && <button type="button" onClick={() => setTab("quotes")} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:border-primary hover:text-primary"><FileText size={13} /> Go to Quotes</button>}
                    <button type="button" onClick={() => void makeAgreement()} disabled={makingAgr} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-50">{makingAgr ? <Loader2 size={13} className="animate-spin" /> : <Handshake size={13} />} {won ? `Create the agreement with ${pkg.winner!.name}` : "Create an agreement anyway"}</button>
                  </div>
                )}
              </div>
            ) : (
              <Fragment key={agr._id}><AgreementsPanel ctx={{ kind: "general" }} canManage={canEdit} onlyIds={[agr._id]} openId={agr._id} noCreate ownerPackageId={pkg._id} onBar={setDocBar} /></Fragment>
            )
          )}
          {tab === "money" && canMoney && (
            <div className="space-y-4">
            {contract
              ? <InvoiceLedger projectId={project.id} kind="received" canEdit={canEdit} projectInfo={projectInfo} contract={contract} onRowsChange={invoicesChanged} />
              : (
                <section className={`${card} flex flex-wrap items-center justify-between gap-3`}>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-800">Invoices on this contract</h4>
                    <p className={hint}>Invoices are logged against the package's contract. Make the agreement with the winner first (step 3), then add and log its invoices here.</p>
                  </div>
                  <button type="button" onClick={() => setTab("agreement")} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-primary">Go to the agreement</button>
                </section>
              )}
            <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className={`${card} space-y-3`}>
                <h4 className="text-sm font-bold text-slate-800">Contract value</h4>
                {m && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs text-slate-600">
                    <span>Original contract</span><b className="text-right tabular-nums text-slate-800"><Fig>{usd(m.original)}</Fig></b>
                    <span>Change orders</span><b className={`text-right tabular-nums ${m.changes > 0 ? "text-red-600" : m.changes < 0 ? "text-emerald-600" : "text-slate-800"}`}><Fig>{m.changes >= 0 ? "+" : "-"}{usd(Math.abs(m.changes))}</Fig></b>
                    <span className="font-bold text-slate-700">Current value</span><b className="text-right tabular-nums text-slate-900"><Fig>{usd(m.current)}</Fig></b>
                    <span>Paid</span><b className="text-right tabular-nums text-slate-800"><Fig>{usd(m.paid)}</Fig></b>
                    <span>Remaining</span><b className={`text-right tabular-nums ${m.remaining < 0 ? "text-red-600" : "text-slate-800"}`}><Fig>{usd(m.remaining)}</Fig></b>
                  </div>
                )}
                <p className={hint}>{m?.source === "agreement" ? "The original contract is the agreement's contract value; change it on the agreement." : m?.source === "po" ? "The original contract is the purchase order's total." : pkg.agreement ? "The agreement has no contract value yet: enter it on the agreement (Contract value) and it is used here." : "The original contract comes from the package's agreement. For work done in-house, type a budget instead."} Paid is the payments on the invoices above (they are in Finances too), plus approved expenses tagged to this package.</p>
                {!f.poId && !(m?.source === "agreement") && (
                  <label className="block"><span className={lbl}>Budget (in-house work, or until the agreement has a value)</span><MoneyInput value={f.budget || ""} onChange={(v) => set({ budget: Math.max(0, Number(v) || 0) })} className={inp} /></label>
                )}
              </section>
              <section className={`${card} space-y-2`}>
                <h4 className="text-sm font-bold text-slate-800">Change orders</h4>
                <p className={hint}>Each approved change order adds to (or takes from) the original contract: the original 4,000 plus 2,500 makes 6,500.</p>
                <div className="space-y-1.5">
                  {cos.map((c, i) => (
                    <div key={c.id} className="rounded-lg border border-amber-100 bg-amber-50/50 p-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <input value={c.no} onChange={(e) => setCo(i, { no: e.target.value })} placeholder="CO-01" aria-label="Change order number" className={`${small} w-20`} />
                        <input type="date" value={c.date} onChange={(e) => setCo(i, { date: e.target.value })} aria-label="Change order date" className={small} />
                        <MoneyInput allowNegative value={c.amount ?? ""} onChange={(v) => setCo(i, { amount: Number(v) || 0 })} placeholder="+ / - amount" aria-label="Change order amount" className={`${small} w-32 text-right`} />
                        <select value={c.status} onChange={(e) => setCo(i, { status: e.target.value as "proposed" | "approved" })} aria-label="Change order status" className={small}><option value="approved">Approved</option><option value="proposed">Proposed</option></select>
                        <button type="button" onClick={() => set({ changeOrders: cos.filter((_, j) => j !== i) })} aria-label="Remove the change order" className="ml-auto rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={12} /></button>
                      </div>
                      <input value={c.reason} onChange={(e) => setCo(i, { reason: e.target.value })} placeholder="Reason, e.g. changed to an 80 ton crane per site requirement" aria-label="Reason" className={`${small} mt-1 w-full`} />
                      <div className="mt-1 flex items-center gap-2 text-[11px]">
                        {c.document
                          ? <>
                              <a href={attachmentUrl(c.document, c.documentName)} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 font-bold text-blue-600 hover:underline"><Paperclip size={11} className="shrink-0" /> <span className="truncate">{c.documentName || "Document"}</span></a>
                              <button type="button" onClick={() => setCo(i, { document: "", documentName: "" })} aria-label="Remove the document" className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><X size={11} /></button>
                            </>
                          : <label className={`inline-flex cursor-pointer items-center gap-1 font-bold text-slate-500 hover:text-primary ${coUploading === c.id ? "pointer-events-none opacity-60" : ""}`}>
                              {coUploading === c.id ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />} Attach the change order document
                              <input type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void attachCo(c.id, file); }} />
                            </label>}
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => set({ changeOrders: [...cos, { id: newId(), no: `CO-${String(cos.length + 1).padStart(2, "0")}`, date: new Date().toISOString().slice(0, 10), reason: "", amount: 0, status: "approved" }] })} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary"><Plus size={12} /> Add change order</button>
                {cos.length > 0 && <p className={hint}>Approved change orders: <b className="text-slate-700"><Fig>{approved >= 0 ? "+" : "-"}{usd(Math.abs(approved))}</Fig></b>. Only approved ones count towards the current value (after saving).</p>}
              </section>
            </fieldset>
            </div>
          )}
          {/* A purchase order from before packages contracted by agreement: kept, shown here. */}
          {tab === "po" && pkg.po && (
            <ProcurementPO projectId={project.id} canEdit={canEdit} projectInfo={projectInfo} ownerPackage={owner} openPoId={pkg.po.id} onGoToRFQ={() => setTab("rfq")} onGoToQuotes={() => setTab("quotes")} onChanged={onChanged} onBar={setDocBar} />
          )}
        </div>

        {/* CR 357-style bottom bar: save and close without going back up. 2026-10-07: one bar for
            every tab, with what applies there: Cancel or Close, Save as Draft, Save, Preview,
            Download and Share (the RFQ, the quotes, the agreement, the PO, or the package itself). */}
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-2 rounded-b-3xl border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          {docTab ? (
            <>
              <span className="mr-auto min-w-0 max-w-full truncate text-[11px] text-slate-500" title={docBar?.note}>{docBar?.note || ""}</span>
              {docBar?.busy && <Loader2 size={14} className="animate-spin text-slate-400" />}
              {docBar?.preview && <button type="button" onClick={docBar.preview} disabled={docBar.busy} className={barBtn}><Eye size={13} /> Preview</button>}
              {docBar?.download && <button type="button" onClick={docBar.download} disabled={docBar.busy} className={barBtn}><Download size={13} /> Download</button>}
              {docBar?.share && <ShareMenu variant="button" fileName={docBar.share.fileName} fileUrl="" projectName={project.name} prepareFile={docBar.share.prepare} size={13} className={barBtn} />}
              {(docBar?.preview || docBar?.download || docBar?.share) && <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />}
              {docBar?.cancel
                ? <button type="button" onClick={docBar.cancel} className={barBtn}><X size={13} /> Cancel</button>
                : <button type="button" onClick={() => void close()} className={barBtn}>Close</button>}
              {docBar?.saveDraft && <button type="button" onClick={docBar.saveDraft} disabled={docBar.busy} className={barBtn}><FileText size={13} /> Save as Draft</button>}
              {docBar?.save && <button type="button" onClick={docBar.save} disabled={docBar.busy} className={barPrimary}><Save size={13} /> Save</button>}
            </>
          ) : (
            <>
              {dirty && canEdit
                ? <span className="mr-auto rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">Unsaved changes to the details or money</span>
                : <span className="mr-auto" />}
              <button type="button" onClick={() => setSheetPreview(true)} className={barBtn}><Eye size={13} /> Preview</button>
              <ShareMenu variant="button" fileName={sheet.fileName} fileUrl="" projectName={project.name} prepareFile={sheet.share} size={13} className={barBtn} />
              <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
              {dirty && canEdit && <button type="button" onClick={() => setF(JSON.parse(saved))} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Undo changes</button>}
              <button type="button" onClick={() => void close()} className={barBtn}>{dirty && canEdit ? <><X size={13} /> Cancel</> : "Close"}</button>
              {canEdit && <button type="button" onClick={() => void save()} disabled={busy || !dirty || !(f.name || "").trim() || looseCompany} className={barPrimary}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save</button>}
            </>
          )}
        </div>
        {sheetPreview && <PdfPreviewModal title={`Work package ${no} · ${pkg.name}`} fileName={sheet.fileName} build={sheet.build} onClose={() => setSheetPreview(false)} />}
      </div>
    </div>,
    document.body,
  );
}
