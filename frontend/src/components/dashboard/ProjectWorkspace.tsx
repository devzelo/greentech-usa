import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Globe, Clock, ExternalLink, MapPin,
  Upload, Download, Eye, FileText, FileImage, FileCode,
  Plus, X, MoreHorizontal, ChevronRight, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Search,
  AlertCircle, Check, Users, Building2, FileSpreadsheet,
  Receipt, Truck, Scale, Wrench, Calendar,
  DollarSign, Loader2, MoreVertical, Copy, Edit2, Palette,
  BookmarkPlus, BookOpen, Trash2, Archive, Info, User, Save, Lock, Unlock, GitCompareArrows, RotateCcw,
  GanttChartSquare, FileDown, Printer, CheckCircle2, Library,
} from "lucide-react";
import { PDFDocument } from "pdf-lib";
import ShareMenu from "./ShareMenu";
import { fetchProject, updateProject, uploadProjectImage, fetchEmployees, fetchExpenses, addExpense, updateExpense, deleteExpense, fetchPurchaseOrders, addPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, fetchTemplates, createTemplate, updateTemplate, deleteTemplate, fetchDocuments, uploadDocument, deleteDocument, updateDocumentDescription, documentUrl,
fetchProcurementRows, createProcurementRow, updateProcurementRow, deleteProcurementRow, downloadProjectExport, downloadProposalDocx, getAuthUser, fetchProjects, fetchGuests, fetchGuestDirectory, createGuest, updateGuest, removeGuest, uploadGalleryFile, setDocumentPublic, ApiProject, ApiEmployee, ApiTemplate, ApiDocument, ApiProcurementRow, ApiGuest, GalleryItem } from "../../lib/api";
import type { ProposalContent, TechnicalProposalContent, FinancialProposalContent, ProposalCover, ProposalCoverLetter, ProposalBackCover, FinancialTable, FinancialColumn, FinancialColumnKind, FinancialAdjustment } from "../../lib/api";
import { uploadProposalAsset, uploadInlineImage, setProjectArchived } from "../../lib/api";
import DocumentViewer from "./DocumentViewer";
import ProcurementBOQ from "./ProcurementBOQ";
import ProcurementMasterLog from "./ProcurementMasterLog";
import ProcurementSubmittals from "./ProcurementSubmittals";
import ProcurementRFQ from "./ProcurementRFQ";
import ProcurementQuotes from "./ProcurementQuotes";
import ProcurementShipment from "./ProcurementShipment";
import ProcurementPO from "./ProcurementPO";
import { projectPdfInfo } from "../../lib/pdfProjectHeader";
import { PDFDownloadLink, BlobProvider, pdf } from "@react-pdf/renderer";
import { logoAsPng } from "../../lib/logoImage";
import ProjectReportPDF, { REPORT_SECTIONS, type ReportClient, type ReportSection, type ReportVendor } from "./ProjectReportPDF";
import PdfPreviewModal from "./PdfPreviewModal";
import PresenceBar from "./PresenceBar";
import SaveStatus, { useSaveStatus } from "./SaveStatus";
import BuilderActions from "./BuilderActions";
import HelpTip from "./HelpTip";
import ExportMenu from "./ExportMenu";
import { usePresence, useBuilderPresence } from "../../lib/usePresence";
import { proposalParts, type ProposalTeamResume } from "./ProposalPDF";
import { fetchResumeByEmp, fetchResumeByUser, fetchSubResume, fetchSubResumes, type ApiSubResume, type ApiExtension, projectCategories, CONTRACT_TYPES, uploadExpenseAttachment, deleteExpenseAttachment, attachmentUrl, uploadProcurementAttachment, deleteProcurementAttachment, type ApiExpense } from "../../lib/api";
import RichTextEditor from "./RichTextEditor";
import * as XLSX from "xlsx";
import DocSection from "./DocSection";
import SectionCard from "./SectionCard";
import ProjectInfoTab from "./ProjectInfoTab";
import TechnicalDocsTab from "./TechnicalDocsTab";
import SubcontractorResumes from "./SubcontractorResumes";
import CategoryMultiSelect from "./CategoryMultiSelect";
import ProposalProjectsEditor from "./ProposalProjectsEditor";
import EoiBuilder from "./EoiBuilder";
import type { EoiContent, RfpDetails } from "../../lib/api";
import RfpCompliancePanel from "./RfpCompliancePanel";
import SectionGroupTemplates from "./SectionGroupTemplates";
import { makeZip } from "../../lib/zip";
import { PROJECT_SECTION_KEYS, referencesOnly } from "../../lib/pastPerformance";
import { FINANCIAL_SECTION_LIBRARY, APPENDIX_LIBRARY } from "../../lib/proposalLibrary";
import { tableCalc, ADJUSTMENT_PRESETS } from "../../lib/pricing";

/** Step 7 - which proposal volume a section handler works on (both have sections). */
type Vol = "technical" | "financial";
import ResumePageBadge, { countResumePages, RESUME_PAGE_LIMIT } from "./ResumePageBadge";
import InvoiceLedger from "./InvoiceLedger";
import ReminderButton from "./ReminderButton";
import ProjectBoard from "./ProjectBoard";
import ProposalCoverBuilder from "./ProposalCoverBuilder";
import ProposalLetterBuilder from "./ProposalLetterBuilder";
import type { SectionAddOpts } from "./SectionLibraryPicker";
import { fetchProposalDocs, type ProposalSubsection, type ProposalAttachment, type ProposalDoc, type ProposalSimilarProject, type ProposalSection } from "../../lib/api";
import CompanyDocPicker from "./CompanyDocPicker";
import AvailableAttachments from "./AvailableAttachments";
import MinutesPanel from "./MinutesPanel";
import InsertSectionTemplate, { type InsertPayload } from "./InsertSectionTemplate";
import { expiryInfo, bestDocFor, docAttachment } from "../../lib/docExpiry";
import { isOriginalPageType, PAGE_TYPES } from "../../lib/proposalLibrary";
import ProposalSectionManager from "./ProposalSectionManager";
import SavedVersionsPanel from "./SavedVersionsPanel";
import RevisionCompare, { isComparable } from "./RevisionCompare";
import RevisionManage from "./RevisionManage";
import UploadExistingProposal, { autoRevisionTitle, type UploadMeta, type ProposalStream } from "./UploadExistingProposal";
import { useDialogs } from "../../lib/useDialogs";
import TimelineBar from "./timeline/TimelineBar";
import TimelineTab from "./timeline/TimelineTab";
import ClientInfoCard from "./ClientInfoCard";
import ClientPicker from "./ClientPicker";
import DocTabs from "./DocTabs";
import ExpenseLog from "./ExpenseLog";
import ProcurementInvoices from "./ProcurementInvoices";
import { effectiveEndDate } from "../../lib/projectSchedule";
import { useRefreshSignal } from "../../lib/refreshBus";
import { fetchSavedDocuments, fetchNextSavedVersion, saveDocumentVersion, updateSavedDocument, deleteSavedDocument, logSavedDocumentSend, attachmentUrl as savedDocUrl, type ApiSavedDocument, type SavedDocStatus } from "../../lib/api";
import { assembleProposalParts, downloadBlob, type PageCtx } from "../../lib/proposalExport";
import { fileName } from "../../lib/fileNames";
import { fetchSubInvoices, addSubInvoice, updateSubInvoice, deleteSubInvoice, uploadSubInvoiceAttachment, deleteSubInvoiceAttachment, type ApiSubInvoice } from "../../lib/api";
import { fetchInvoices, type ApiInvoice } from "../../lib/api";
import { fetchUsers, createReminder, type AdminUser } from "../../lib/api";
import { fetchVendors, addVendor, updateVendor, deleteVendor, uploadProjectContract, deleteProjectContract, fetchCompany, companyCategories, withFileToken, type ApiVendor, type ApiCompany } from "../../lib/api";
import CompanyPicker from "./CompanyPicker";
import YesNo from "./YesNo";
import { PROJECT_STATUSES, statusMeta } from "../../lib/projectStatus";
import { sanitizeMoney } from "../../lib/money";
import { locationFlag, flagForCountry } from "../../lib/countryFlag";
import { projectTimeZone } from "../../lib/countryTimeZone";
import LocalClock from "./LocalClock";
import AddressBox from "./AddressBox";
import ScrollableTabs from "./ScrollableTabs";
import FinanceStrip from "./FinanceStrip";
import { Fig } from "./FiguresPrivacy";
import { fiveFromRaw } from "../../lib/projectFinance";
import { EMPTY_SITE_ADDRESS, shortLocation, type SiteAddress } from "../../lib/address";
import type { ProjectStatus } from "../../lib/api";
import AgreementsPanel from "./agreements/AgreementsPanel";
import { type ProposalRequirement, type ApiResourceBlock, type ProposalContent as ProposalContentType, fetchProposalRevisions, createProposalRevision, deleteProposalRevision, type ApiProposalRevision } from "../../lib/api";
import { resolveProposalLayout, resolveFinancialLayout, FINANCIAL_BUILTINS, PROPOSAL_BUILTINS,fetchProposalTemplates, saveProposalTemplate, deleteProposalTemplate, resolveFinancialTables, defaultFinancialColumns, type ProposalSectionMeta, type ProposalLetterhead, type ApiProposalTemplate, type ProposalTemplateContent } from "../../lib/api";
import PortalMenu from "./PortalMenu";
import { useMeta } from "../../hooks/useMeta";
import { toast } from "../../lib/toast";

// ── Employee pool ──────────────────────────────────────────────────────────
const EMPLOYEE_POOL = [
  { id: "EMP-001", name: "John Partner" },
  { id: "EMP-002", name: "Sara Mensah" },
  { id: "EMP-003", name: "Kwame Ofori" },
  { id: "EMP-004", name: "Sara Mitchell" },
  { id: "EMP-005", name: "Mike Reynolds" },
  { id: "EMP-006", name: "Ama Boateng" },
  { id: "EMP-007", name: "David Chen" },
  { id: "EMP-008", name: "Lisa Torres" },
  { id: "EMP-009", name: "James Osei" },
  { id: "EMP-010", name: "Rachel Kim" },
];



const approvalBadgeClass = (s?: string) =>
  s === "approved" ? "bg-emerald-50 text-emerald-600"
  : s === "rejected" ? "bg-red-50 text-red-600"
  : "bg-amber-50 text-amber-600";
const approvalLabel = (s?: string) => (s === "approved" ? "Approved" : s === "rejected" ? "Rejected" : "Pending");

// Format a free-text money string as currency for display. Returns "" for non-numeric input
// so callers can fall back to the raw value. The stored value stays a plain string.
const fmtMoney = (value: unknown, currency?: string): string => {
  const num = parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!isFinite(num)) return "";
  const cur = (currency || "USD").toUpperCase();
  try { return num.toLocaleString(undefined, { style: "currency", currency: cur }); }
  catch { return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
};

// ── Reusable sub-components ────────────────────────────────────────────────

// Auto-growing textarea for multi-line Description / Remarks cells: wraps text, grows with
// content, Enter inserts a newline, and the value prints in full (whitespace-pre-wrap).
function AutoTextarea({ value, onChange, onBlur, className, disabled }: {
  value: string; onChange: (v: string) => void; onBlur?: (v: string) => void; className?: string; disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const resize = () => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } };
  useEffect(() => { resize(); }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      disabled={disabled}
      onChange={(e) => { onChange(e.target.value); resize(); }}
      onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
      className={`resize-none overflow-hidden whitespace-pre-wrap ${className || ""}`}
    />
  );
}

// Money input that shows a formatted currency value when blurred and the raw number while editing.
function MoneyInput({ value, currency, onChange, onBlur, className, disabled }: {
  value: string; currency?: string; onChange: (v: string) => void; onBlur?: (v: string) => void; className?: string; disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const display = focused ? value : (fmtMoney(value, currency) || value);
  return (
    <input
      value={display}
      disabled={disabled}
      inputMode="decimal"
      onFocus={() => setFocused(true)}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => { setFocused(false); onBlur?.(e.target.value); }}
      className={className}
    />
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h4 className="text-sm font-bold text-slate-700 uppercase tracking-widest">{title}</h4>
      <button className="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline">
        <Upload size={12} /> Upload
      </button>
    </div>
  );
}

function DocRow({ name, type, size, date }: { name: string; type: string; size: string; date: string; key?: string | number | null }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl hover:bg-white hover:shadow-sm transition-all group">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
        type === "pdf" ? "bg-red-50 text-red-500" :
        type === "dwg" || type === "cad" ? "bg-violet-50 text-violet-500" :
        type === "image" ? "bg-emerald-50 text-emerald-500" :
        "bg-blue-50 text-blue-500"
      }`}>
        {type === "image" ? <FileImage size={16} /> : type === "dwg" ? <FileCode size={16} /> : <FileText size={16} />}
      </div>
      <div className="flex-grow min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{name}</p>
        <p className="text-[10px] text-slate-400 font-medium">{size} · {date}</p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary transition-colors"><Eye size={14} /></button>
        <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary transition-colors"><Download size={14} /></button>
      </div>
    </div>
  );
}

// CR-P — one name + on/off switch row, shared by the per-tab "Access ▾" dropdown and the
// per-employee tab-access popup.
function AccessToggleRow({ label, sublabel, on, busy, indent, onToggle }: {
  label: string; sublabel?: string; on: boolean; busy?: boolean; indent?: boolean; onToggle: () => void; key?: string | number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      className={`w-full flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 ${indent ? "pl-5" : ""}`}
    >
      <span className="min-w-0 text-left">
        <span className="block text-xs font-bold text-slate-700 truncate">{indent ? "↳ " : ""}{label}</span>
        {sublabel && <span className="block text-[10px] text-slate-400 truncate">{sublabel}</span>}
      </span>
      <span className={`relative w-9 h-5 rounded-full transition-colors duration-300 flex-shrink-0 ${on ? "bg-indigo-500" : "bg-slate-200"}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${on ? "left-[1.125rem]" : "left-0.5"}`} />
      </span>
    </button>
  );
}


// ── Default tabs ───────────────────────────────────────────────────────────
// CR-PR-13 / CR 184 — Project Nature is no longer its own tab; it is part of Categories, shown in the About box at the top of Project Info.
// CR 276 (2026-09-22): Client Info is no longer a tab of its own. It only ever held the client's
// name and contact, so it is now the first (foldable) section inside Project Info. The permission
// key stays, so whoever could see it before still can, and whoever could not still cannot.
const CLIENT_PERM_TAB = { id: "client", label: "Client Info (in Project Info)", icon: Building2 };
const DEFAULT_TABS = [
  { id: "project-info", label: "Project Info", icon: FileText },
  { id: "proposals", label: "Proposals", icon: FileSpreadsheet },
  { id: "pm", label: "Project Management", icon: Calendar },
  { id: "tech-docs", label: "Technical Docs", icon: FileCode },
  { id: "subs", label: "Subcontractors & Employees", icon: Users },
  { id: "legal", label: "Legal Docs", icon: Scale },
  { id: "finances", label: "Finances", icon: DollarSign },
  // CR-P-31 — Purchase Orders removed from the main tabs; use Procurement → Purchase Orders.
  { id: "procurement", label: "Procurement & Submittals", icon: Truck },
];

// CR-P-30 — Expenses / Invoice Sent / Invoice Received live as sub-tabs under one "Finances" tab.
// Their perm ids stay the original tab ids so existing guest grants & backend guards keep working.
const FIN_SUBTABS = [
  { key: "expenses", permId: "expenses", label: "Expenses", icon: DollarSign },
  { key: "invoice-sent", permId: "invoice-sent", label: "Invoice Sent", icon: Receipt },
  { key: "invoice-received", permId: "invoice-received", label: "Invoice Received", icon: Receipt },
] as const;
type FinSub = (typeof FIN_SUBTABS)[number]["key"];
const FIN_PERM_BY_KEY: Record<string, string> = Object.fromEntries(FIN_SUBTABS.map((t) => [t.key, t.permId]));

// Procurement sub-tabs that can be granted to a guest (e.g. a logistics-company subcontractor)
// individually. Permission keys are stored in the guest's tabPermissions like any other tab.
const PROC_SUBTABS = [
  { key: "log", permId: "proc-log", label: "Master Log" },
  { key: "boq", permId: "proc-boq", label: "BOQ" },
  { key: "submittals", permId: "proc-submittals", label: "Submittals" },
  { key: "rfqs", permId: "proc-rfqs", label: "RFQs" },
  { key: "quotes", permId: "proc-quotes", label: "Quotes" },
  { key: "po", permId: "proc-po", label: "Purchase Orders" },
  // CR-P (172) — the vendor invoices on the POs; same access as Purchase Orders.
  { key: "invoices", permId: "proc-po", label: "Invoices" },
  { key: "shipment", permId: "proc-shipment", label: "Shipment" },
] as const;
const PROC_PERM_BY_KEY: Record<string, string> = Object.fromEntries(PROC_SUBTABS.map((t) => [t.key, t.permId]));

// ── Main component ─────────────────────────────────────────────────────────
export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Core data
  const [project, setProject] = useState<ApiProject | null>(null);
  useMeta({
    title: project?.name ? `${project.name} — Workspace` : `Project ${id || ""} — Workspace`,
    description: project?.description || "Project workspace — manage tabs, documents, finances, and team.",
  });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [financialLocked, setFinancialLocked] = useState(false); // CR-B-19b — Financial Proposal owner-only
  const [showReport, setShowReport] = useState(false);   // CR-P-01 — Quick Report popup preview
  /**
   * CR 286 (2026-09-23): Quick Report asks what to put in it first. Everything is ticked by
   * default; the choice is remembered, so the next report comes out like the last one. The client
   * (from the Directory, with their logo) and the vendors are fetched only when they are wanted.
   */
  const [reportPick, setReportPick] = useState(false);
  const [reportInclude, setReportInclude] = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("gt-report-sections") || "null");
      if (saved && typeof saved === "object") return saved as Record<string, boolean>;
    } catch { /* ignore */ }
    return Object.fromEntries(REPORT_SECTIONS.map((x) => [x.key, true]));
  });
  const [reportClient, setReportClient] = useState<ReportClient | undefined>();
  const [reportVendors, setReportVendors] = useState<ReportVendor[]>([]);
  const [reportBusy, setReportBusy] = useState(false);
  const presentUsers = usePresence(id ? `project:${id}` : null);   // CR-B-16 — who else is in this project
  const proposalPresent = useBuilderPresence(id ? `proposal:${id}` : null, "the Proposal builder"); // CR-B-01

  // Tabs
  const [activeTab, setActiveTab] = useState("project-info");
  // CR 191 — "Edit timeline" on the header card opens Project Management > Timeline / Milestones.
  const [pmFocus, setPmFocus] = useState<{ id: string; n: number } | undefined>(undefined);
  type FieldType = "text" | "textarea" | "number" | "date" | "url" | "email" | "select" | "checkbox" | "file";
  type CustomField = { fieldId: string; label: string; type: FieldType; options?: string[]; value?: string };
  type CustomTab = { id: string; label: string; icon: typeof Plus; color?: string; parentId?: string; notes?: string; fields?: CustomField[] };
  const [customTabs, setCustomTabs] = useState<CustomTab[]>([]);
  // Custom sub-tabs for the JV partner (each holds custom fields + a files section).
  type PartnerField = { fieldId: string; label: string; type: FieldType; value?: string; options?: string[] };
  type PartnerTab = { tabId: string; label: string; notes: string; fields: PartnerField[] };
  const [partnerTabs, setPartnerTabs] = useState<PartnerTab[]>([]);
  const [activePartnerTab, setActivePartnerTab] = useState<string>("");
  // Structured subcontractor agreements (name + description + agreement/offer/other docs).
  const [showAddTab, setShowAddTab] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [newTabColor, setNewTabColor] = useState<string>("");
  const [newTabParent, setNewTabParent] = useState<string>("");
  const [newTabFields, setNewTabFields] = useState<CustomField[]>([]);
  const [editingFieldsForTab, setEditingFieldsForTab] = useState<string | null>(null);
  // Add-tab wizard: "choose" (pick main vs sub) → "form" (enter details)
  const [addTabStep, setAddTabStep] = useState<"choose" | "form">("choose");
  const [addTabKind, setAddTabKind] = useState<"main" | "sub">("main");

  // ── Guests (owner only) ──
  const [guestsList, setGuestsList] = useState<ApiGuest[]>([]);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [editingGuest, setEditingGuest] = useState<ApiGuest | null>(null);
  const [guestStep, setGuestStep] = useState<1 | 2 | 3>(1);
  const [gFigures, setGFigures] = useState(false);   // financial figures access in the access wizard
  const [gName, setGName] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [gPassword, setGPassword] = useState("");
  const [gPerms, setGPerms] = useState<Record<string, "none" | "view" | "edit">>({});
  // Access timeline: "" = no expiry, "1w" / "1m" / "3m" presets, or a yyyy-mm-dd custom date.
  const [gExpiry, setGExpiry] = useState<string>("");
  const [gAlsoProjects, setGAlsoProjects] = useState<string[]>([]);
  const [gSaving, setGSaving] = useState(false);
  const [ownerProjects, setOwnerProjects] = useState<ApiProject[]>([]);
  const [guestDirectory, setGuestDirectory] = useState<{ userId: string; name: string; email: string }[]>([]);
  const [gExistingId, setGExistingId] = useState<string | null>(null);

  const FIELD_TYPES: { value: FieldType; label: string }[] = [
    { value: "text", label: "Text" },
    { value: "textarea", label: "Long Text" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "url", label: "URL" },
    { value: "email", label: "Email" },
    { value: "select", label: "Dropdown" },
    { value: "checkbox", label: "Checkbox" },
    { value: "file", label: "File" },
  ];
  const [tabMenuOpen, setTabMenuOpen] = useState<string | null>(null);
  const [tabMenuAnchor, setTabMenuAnchor] = useState<HTMLElement | null>(null);
  const openTabMenu = (e: { stopPropagation: () => void; currentTarget: HTMLElement }, tabId: string) => {
    e.stopPropagation();
    if (tabMenuOpen === tabId) {
      setTabMenuOpen(null);
      setTabMenuAnchor(null);
    } else {
      setTabMenuOpen(tabId);
      setTabMenuAnchor(e.currentTarget);
    }
  };
  const closeTabMenu = () => { setTabMenuOpen(null); setTabMenuAnchor(null); };
  const [renamingTab, setRenamingTab] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState<string | null>(null); // tabId we're saving
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateDesc, setSaveTemplateDesc] = useState("");
  // Edit Template modal
  const [editingTemplate, setEditingTemplate] = useState<ApiTemplate | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [tplFields, setTplFields] = useState<CustomField[]>([]);
  const [tplSaving, setTplSaving] = useState(false);

  // Per-tab Access & Sharing Control (Employees visibility).
  // `employeeIds` (when non-empty) restricts the tab to just those specific employees (CR-P-03);
  // otherwise the `employees` group toggle governs all assigned employees.
  const [tabAccess, setTabAccess] = useState<Record<string, { employees: boolean; employeeIds?: string[] }>>({});
  // CR-P — per-tab access controls: a compact "Access ▾" dropdown on each tab (toggle any person
  // on/off for that tab) plus a per-employee tab-access popup. Toggling persists immediately —
  // employees through the project's tabAccess, subcontractors/partners through their guest record.
  const [accessMenuOpen, setAccessMenuOpen] = useState(false);
  const [empAccessFor, setEmpAccessFor] = useState<string | null>(null);
  // Pending View / Edit / Hidden choices in the tab-access modal, keyed by tab id.
  const [empPerms, setEmpPerms] = useState<Record<string, "none" | "view" | "edit">>({});
  const [accessBusy, setAccessBusy] = useState<string | null>(null);

  // CR 184 — the About box (categories + description) at the top of Project Info. It edits the
  // same fields as Edit Identity, so the two always agree. Locked until Edit (CR-P (129)).
  const [aboutEditing, setAboutEditing] = useState(false);
  const [aboutSaving, setAboutSaving] = useState(false);
  const [aboutCats, setAboutCats] = useState<string[]>([]);
  const [aboutDesc, setAboutDesc] = useState("");
  // CR 277 - the key scope of work, edited as one bullet per line.
  const [aboutScope, setAboutScope] = useState("");

  // Client info (editable form on the Client Info tab)
  type ClientInfo = { name: string; reference: string; contactName: string; email: string; phone: string; country: string; address: string; notes: string; companyId: string };
  const [clientInfo, setClientInfo] = useState<ClientInfo>({
    name: "", reference: "", contactName: "", email: "", phone: "", country: "", address: "", notes: "", companyId: "",
  });
  // Marked unsaved, so the autosave and the leave-page warning cover the client too.
  const updateClient = (field: keyof ClientInfo, value: string) => { setClientInfo((prev) => ({ ...prev, [field]: value })); setDirty(true); };

  // §M — Joint Venture info (partner company for a JV project)
  type JVImage = { name: string; url: string };
  // Step 8 - plus the JV as its own registered entity (legal name, UEI, CAGE, address, combined logo).
  // CR-P (31) — `companyId` is the Directory company the partner was picked from.
  type JVInfo = { enabled: boolean; partnerName: string; partnerAddress: string; contactName: string; email: string; phone: string; lead: string; logo: string; notes: string; stamps: JVImage[]; signatures: JVImage[]; legalName: string; uei: string; cage: string; legalAddress: string; combinedLogo: string; companyId: string };
  const [jvInfo, setJvInfo] = useState<JVInfo>({ enabled: false, partnerName: "", partnerAddress: "", contactName: "", email: "", phone: "", lead: "", logo: "", notes: "", stamps: [], signatures: [], legalName: "", uei: "", cage: "", legalAddress: "", combinedLogo: "", companyId: "" });
  // Editing the JV record marks the workspace dirty so the unsaved-changes guard applies —
  // uploaded partner stamps/signatures only persist via Save Workspace / Save Identity.
  const updateJv = <K extends keyof JVInfo>(field: K, value: JVInfo[K]) => { setJvInfo((prev) => ({ ...prev, [field]: value })); setDirty(true); };
  // Uploaded assets live under token-guarded /uploads — resolve them the same way documents do.
  const assetSrc = (p?: string) => { if (!p) return ""; const s = p.replace(/^\/+/, ""); return s.startsWith("uploads/") ? attachmentUrl(s) : (p.startsWith("/") ? p : `/${p}`); };
  // §M — Joint Venture editor, reused in Project Identity and the Partners tab.
  const renderJVSection = (disabled: boolean) => (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-display font-bold text-slate-900">Joint Venture</h3>
          <YesNo label="Joint venture" value={jvInfo.enabled} disabled={disabled} onChange={(v) => updateJv("enabled", v)}
            yesTitle="A joint venture with a partner company" noTitle="A GreenTech-only project" />
        </div>
        <p className="text-xs text-slate-400 mt-1">Is this a joint venture with a partner company? No means a GreenTech-only project.</p>
      </div>
      {jvInfo.enabled && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* CR-P-43 — partner company comes from the Directory (partners category). */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Partner Company Name</label>
              {disabled ? (
                <input value={jvInfo.partnerName} disabled placeholder="e.g. ACCU Company"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none disabled:opacity-60" />
              ) : (
                <CompanyPicker
                  value={jvInfo.partnerName}
                  category="partner"
                  // Typing a different name breaks the Directory link until one is picked again.
                  onNameChange={(v) => { updateJv("partnerName", v); updateJv("companyId", ""); }}
                  onSelectCompany={(c) => {
                    updateJv("partnerName", c.name);
                    updateJv("companyId", c._id);   // CR-P (31)
                    const cp = c.contactPersons?.[0];
                    if (c.email || cp?.email) updateJv("email", c.email || cp?.email || "");
                    if (c.phone || cp?.phone) updateJv("phone", c.phone || cp?.phone || "");
                    if (cp?.name) updateJv("contactName", cp.name);
                    if (c.address) updateJv("partnerAddress", c.address);
                    // CR-P (31) — the partner's Directory logo becomes this project's JV
                    // letterhead, so every agreement and document inside the project uses it
                    // without anyone uploading a logo per project.
                    if (c.logoUrl) updateJv("logo", c.logoUrl);
                  }}
                  placeholder="Search or add a partner from the Directory…"
                />
              )}
            </div>
            {([
              { field: "contactName", label: "Person in Charge", placeholder: "Full name" },
              { field: "email", label: "Partner Email", placeholder: "contact@partner.com" },
              { field: "phone", label: "Partner Phone", placeholder: "+1 (555) 000-0000" },
            ] as const).map((f) => (
              <div key={f.field} className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{f.label}</label>
                <input value={jvInfo[f.field]} onChange={(e) => updateJv(f.field, e.target.value)} disabled={disabled} placeholder={f.placeholder}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-60" />
              </div>
            ))}
            {/* Partner logo — CR-P (31): filled in automatically from the Directory partner, so
                the JV letterhead for this project exists the moment the partner is chosen.
                Uploading here overrides it for this project only. */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Partner Logo <span className="font-medium normal-case text-slate-400">— pulled from the Directory partner; used as this project's JV letterhead</span></label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                  {jvInfo.logo ? <img src={assetSrc(jvInfo.logo)} alt="Partner logo" className="w-full h-full object-contain" /> : <FileImage size={20} className="text-slate-300" />}
                </div>
                {!disabled && (
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary cursor-pointer transition-colors">
                      {jvLogoUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {jvInfo.logo ? "Replace" : "Upload logo"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleJvLogoUpload(f); e.target.value = ""; }} disabled={jvLogoUploading} />
                    </label>
                    {jvInfo.logo && <button type="button" onClick={() => updateJv("logo", "")} className="text-[11px] font-bold text-red-500 hover:underline">Remove</button>}
                  </div>
                )}
              </div>
            </div>
            {/* Who is leading the project — GreenTech or the named partner */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project Lead</label>
              <select value={jvInfo.lead} onChange={(e) => updateJv("lead", e.target.value)} disabled={disabled}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-60">
                <option value="">— Who is leading? —</option>
                <option value="GreenTech USA">GreenTech USA</option>
                {jvInfo.partnerName.trim() && <option value={jvInfo.partnerName.trim()}>{jvInfo.partnerName.trim()}</option>}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Partner Address</label>
            <textarea rows={4} value={jvInfo.partnerAddress} onChange={(e) => updateJv("partnerAddress", e.target.value)} disabled={disabled} placeholder="Paste the full address exactly as written"
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all resize-none disabled:opacity-60" />
          </div>
          {/* Step 8 (items 114-118) - the JV as its own registered entity. Expressions of Interest
              and proposal covers print these, so a JV letter never falls back to GreenTech's details. */}
          <div className="rounded-2xl border border-slate-100 p-4 space-y-4">
            <div>
              <p className="text-xs font-bold text-slate-700">The JV entity</p>
              <p className="text-[11px] text-slate-400">The joint venture's own registration, used on Expressions of Interest and proposal covers.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {([
                { field: "legalName", label: "JV Legal Name", placeholder: jvInfo.partnerName ? `GreenTech USA - ${jvInfo.partnerName} JV` : "e.g. Green Tech-ACCU JV LLC" },
                { field: "uei", label: "JV UEI", placeholder: "e.g. DSZEZJK7H2T6" },
                { field: "cage", label: "JV CAGE Code", placeholder: "Optional" },
                { field: "legalAddress", label: "JV Registered Address", placeholder: "25214 Larks Ter, Chantilly, VA, USA" },
              ] as const).map((f) => (
                <div key={f.field} className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{f.label}</label>
                  <input value={jvInfo[f.field]} onChange={(e) => updateJv(f.field, e.target.value)} disabled={disabled} placeholder={f.placeholder}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-60" />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">JV Combined Logo <span className="font-medium normal-case text-slate-400">(both companies' marks; shown on the JV's EOIs)</span></label>
              <div className="flex items-center gap-3">
                <div className="w-28 h-16 rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                  {jvInfo.combinedLogo ? <img src={assetSrc(jvInfo.combinedLogo)} alt="JV combined logo" className="w-full h-full object-contain" /> : <FileImage size={20} className="text-slate-300" />}
                </div>
                {!disabled && (
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary cursor-pointer transition-colors">
                      {jvLogoUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {jvInfo.combinedLogo ? "Replace" : "Upload logo"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleJvLogoUpload(f, "combinedLogo"); e.target.value = ""; }} disabled={jvLogoUploading} />
                    </label>
                    {jvInfo.combinedLogo && <button type="button" onClick={() => updateJv("combinedLogo", "")} className="text-[11px] font-bold text-red-500 hover:underline">Remove</button>}
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Partner stamps & signatures — saved on the profile; the PO's partner section picks from these */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(["stamps", "signatures"] as const).map((kind) => (
              <div key={kind} className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{kind === "stamps" ? "Partner Stamps" : "Partner Signatures"} <span className="normal-case font-medium">— used on the PO document</span></label>
                <div className="flex flex-wrap items-center gap-2">
                  {jvInfo[kind].map((img, i) => (
                    <div key={i} className="relative group border border-slate-100 rounded-xl p-2 bg-slate-50">
                      <img src={assetSrc(img.url)} alt={img.name || kind} className="h-14 object-contain" />
                      {!disabled && (
                        <button type="button" title="Remove" onClick={() => { if (confirm("Remove this image? It is deleted from the partner profile.")) updateJv(kind, jvInfo[kind].filter((_, j) => j !== i)); }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                      )}
                    </div>
                  ))}
                  {jvInfo[kind].length === 0 && <span className="text-[11px] text-slate-400 italic">None yet.</span>}
                  {!disabled && (
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 text-slate-600 text-xs font-bold hover:border-primary hover:text-primary cursor-pointer">
                      {jvImgUploading === kind ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload
                      <input type="file" accept="image/*" className="hidden" disabled={jvImgUploading !== null} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleJvImageUpload(f, kind); e.target.value = ""; }} />
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 italic">Manage the partner and grant them a full-access login from the <strong>Partners</strong> tab under Subcontractors &amp; Employees.</p>
        </>
      )}
    </div>
  );

  // Employees
  const [employeePool, setEmployeePool] = useState<ApiEmployee[]>([]);
  // CR-P (76)/(77) — assigning is now an explicit step: open a picker, tick people, assign.
  const [empPickerOpen, setEmpPickerOpen] = useState(false);
  // CR-P (77) — assigning is two steps: pick the people, then the tabs they get (default Hidden).
  const [empAssignStep, setEmpAssignStep] = useState<1 | 2>(1);
  const [empAssignPerms, setEmpAssignPerms] = useState<Record<string, "none" | "view" | "edit">>({});
  const [empAssignBusy, setEmpAssignBusy] = useState(false);
  const [empAssignFigures, setEmpAssignFigures] = useState(true);   // GT staff see the figures by default
  const [empPicked, setEmpPicked] = useState<string[]>([]);
  const [assignedEmployees, setAssignedEmployees] = useState<string[]>([]);
  const [empSearch, setEmpSearch] = useState("");

  // Financial rows from DB
  type ExpenseRow = ApiExpense;
  type PORow = { _id: string; poNumber: string; vendor: string; amount: string; date: string; status: string };
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  // CR-PR-12 — the header Refresh button bumps this to re-pull the project, expenses,
  // POs and invoices, so the financial tiles catch up without losing unsaved workspace edits.
  const [reloadKey, setReloadKey] = useState(0);
  useRefreshSignal(useCallback(() => setReloadKey((k) => k + 1), []));
  const [attachmentPreview, setAttachmentPreview] = useState<{ name: string; url: string; fileType: string } | null>(null);
  const [poRows, setPoRows] = useState<PORow[]>([]);
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [previewDoc, setPreviewDoc] = useState<ApiDocument | null>(null);

  // Proposals meta — submission date + status per proposal
  type ProposalMeta = { submissionDate: string; status: string };
  const [proposals, setProposals] = useState<{ technical: ProposalMeta; financial: ProposalMeta }>({
    technical: { submissionDate: "", status: "Draft" },
    financial: { submissionDate: "", status: "Draft" },
  });
  // CR-P (83) - the lifecycle of one produced proposal revision, as Reza listed it:
// "is it sent, draft, completed, submitted, all those status items", plus the outcome.
const PROP_DOC_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-500" },
  // CR 203 - Final is the one status that must be unmistakable: solid green, not a pale tint.
  final: { label: "Final", cls: "bg-emerald-500 text-white" },
  completed: { label: "Completed", cls: "bg-teal-50 text-teal-700" },
  sent: { label: "Sent", cls: "bg-blue-50 text-blue-600" },
  submitted: { label: "Submitted", cls: "bg-amber-50 text-amber-700" },
  awarded: { label: "Awarded", cls: "bg-emerald-50 text-emerald-700" },
  "not-awarded": { label: "Not awarded", cls: "bg-red-50 text-red-600" },
};

  const PROPOSAL_STATUS_COLOR: Record<string, string> = {
    Draft: "bg-amber-50 text-amber-600",
    Ready: "bg-indigo-50 text-indigo-600",
    Submitted: "bg-blue-50 text-blue-600",
    Awarded: "bg-emerald-50 text-emerald-600",
    Rejected: "bg-red-50 text-red-500",
  };
  const [exporting, setExporting] = useState(false);

  // ── Proposal Builder ───────────────────────────────────────────────────────
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const emptyTechnical = (): TechnicalProposalContent => ({
    coverTitle: "", coverSubtitle: "", refNo: "", date: "",
    description: "", employees: [], similarProjects: [], timeline: [], sections: [],
  });
  const emptyFinancial = (): FinancialProposalContent => ({ currency: "$", notes: "", lineItems: [] });
  const emptyCover = (): ProposalCover => ({
    proposalTitle: "", projectName: "", solicitationNo: "", taskOrderNo: "", contractNo: "",
    clientName: "", dueDate: "", submissionDate: "", submittedTo: "", attentionTo: "", submittedBy: "",
    logoMode: "single", jvLogoUrl: "", images: [], coverStyle: "hero", subtitle: "", restrictionNotice: true,
  });
  const emptyCoverLetter = (): ProposalCoverLetter => ({ enabled: false, body: "", useEmailSignature: false, signatories: [] });
  const emptyBackCover = (): ProposalBackCover => ({ enabled: false, tagline: "", website: "", email: "", phone: "", address: "", social: "", marketing: "", images: [] });
  const [proposalSub, setProposalSub] = useState<"overview" | "eoi" | "technical" | "financial">("overview");
  // CR-B-19b — if the Financial Proposal is locked and the viewer isn't the owner, never leave them on it.
  useEffect(() => {
    const cu = getAuthUser();
    const owner = !!(project && cu && (project as ApiProject & { ownerId?: string }).ownerId === cu.id);
    if (financialLocked && !owner && proposalSub === "financial") setProposalSub("overview");
  }, [financialLocked, project, proposalSub]);
  const [proposalDocTab, setProposalDocTab] = useState<"cover" | "letter" | "builder" | "attachments" | "versions">("builder"); // inner tab inside Technical/Financial
  const [procSub, setProcSub] = useState<"boq" | "log" | "submittals" | "rfqs" | "quotes" | "po" | "invoices" | "shipment" | "legacy">("log"); // Procurement module sub-tab (default = Master Log overview)
  const [finSub, setFinSub] = useState<FinSub>("expenses"); // CR-P-30 — Finances module sub-tab
  const [highlightSubItem, setHighlightSubItem] = useState<string | undefined>(undefined); // §C9 — flash a submittal when jumped to from the BOQ
  const [openRfqId, setOpenRfqId] = useState<string | undefined>(undefined); // open a specific RFQ after creating it from the BOQ

  // Deep-link support for the "+ New" menu: /dashboard/projects/:id?tab=procurement&proc=rfqs
  useEffect(() => {
    let tab = searchParams.get("tab");
    const proc = searchParams.get("proc");
    const sub = searchParams.get("sub");   // Subcontractors & Employees sub-tab
    const fin = searchParams.get("fin");   // Finances sub-tab
    if (!tab && !proc && !sub && !fin) return;
    // CR-P-30 — legacy deep-links (?tab=expenses|invoice-sent|invoice-received) now open the
    // Finances tab on the matching sub-tab; every existing wired link keeps working.
    if (tab && (FIN_PERM_BY_KEY as Record<string, string>)[tab]) { setFinSub(tab as FinSub); tab = "finances"; }
    // CR 276 - Client Info became a section of Project Info; old links still land in the right place.
    if (tab === "client") tab = "project-info";
    if (fin) setFinSub(fin as FinSub);
    if (tab) setActiveTab(tab);
    if (proc) setProcSub(proc as typeof procSub);
    if (sub) setSubsSubTab(sub as "employees" | "subcontractors" | "partners" | "vendors");
    // Consume the params so the same destination can be opened again later (and so the user's
    // own tab clicks aren't snapped back by a stale query string).
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [showSectionList, setShowSectionList] = useState(false); // reorder-list panel (kept, hidden by default — on-box arrows are primary)
  const [technical, setTechnical] = useState<TechnicalProposalContent>(emptyTechnical());
  const [financial, setFinancial] = useState<FinancialProposalContent>(emptyFinancial());
  const [cover, setCover] = useState<ProposalCover>(emptyCover());                 // Technical cover
  const [coverFinancial, setCoverFinancial] = useState<ProposalCover>(emptyCover()); // Financial cover
  const [coverLetter, setCoverLetter] = useState<ProposalCoverLetter>(emptyCoverLetter());
  const [coverLetterFinancial, setCoverLetterFinancial] = useState<ProposalCoverLetter>(emptyCoverLetter());   // CR-P (93)
  const [eoi, setEoi] = useState<EoiContent>({});   // step 8 - the Expression of Interest (no revisions)
  const [rfp, setRfp] = useState<RfpDetails>({});   // step 9 - the RFP's dates, page limits and rules
  // Item 91 - the cover's own Save: set its status, then save once the new state has rendered.
  const [saveRequested, setSaveRequested] = useState(false);
  useEffect(() => {
    if (!saveRequested) return;
    setSaveRequested(false);
    void handleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveRequested]);
  const [backCover, setBackCover] = useState<ProposalBackCover>(emptyBackCover());
  const [letterhead, setLetterhead] = useState<ProposalLetterhead>("gt");
  const [customLetterheadUrl, setCustomLetterheadUrl] = useState("");
  // Proposal templates
  const [proposalTemplates, setProposalTemplates] = useState<ApiProposalTemplate[]>([]);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [propTplName, setPropTplName] = useState("");
  const [propTplDesc, setPropTplDesc] = useState("");
  const [proposalDownloading, setProposalDownloading] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [requirements, setRequirements] = useState<ProposalRequirement[]>([]);
  const [newReq, setNewReq] = useState("");
  const [revisions, setRevisions] = useState<ApiProposalRevision[]>([]);
  const [revLabel, setRevLabel] = useState("");
  const [revBusy, setRevBusy] = useState(false);
  // CR-B-21 — the NEXT Saved-Versions revision number per document, so "Mark as Final" can name it
  // in the confirmation. Both "Mark as Final" entry points file into the same SavedDocument stream.
  const [nextFinalVer, setNextFinalVer] = useState<{ technical: number; financial: number }>({ technical: 1, financial: 1 });
  // CR-P (82)-(87) — every saved revision of each proposal, so the overview can show a real table
  // instead of two status cards. Three streams: technical, financial, and the combined pack that is
  // what actually goes to the client.
  const [propDocs, setPropDocs] = useState<{ technical: ApiSavedDocument[]; financial: ApiSavedDocument[]; combined: ApiSavedDocument[] }>({ technical: [], financial: [], combined: [] });
  const [openRevs, setOpenRevs] = useState<Record<string, boolean>>({});   // which stream's older revisions are expanded
  // CR-P (85) - comparing two revisions of one stream. Opening from a row compares it with the
  // revision just before it (or just after, for the oldest).
  const [compareRevs, setCompareRevs] = useState<{ which: string; fromId: string; toId: string } | null>(null);
  // CR-P (86) - archived revisions (kept out of the table, listed in a fold under it) and the
  // revision open in the Manage window.
  const [archivedDocs, setArchivedDocs] = useState<{ technical: ApiSavedDocument[]; financial: ApiSavedDocument[]; combined: ApiSavedDocument[] }>({ technical: [], financial: [], combined: [] });
  const [showArchivedRevs, setShowArchivedRevs] = useState<Record<string, boolean>>({});
  const [manageDoc, setManageDoc] = useState<ApiSavedDocument | null>(null);
  const [uploadFor, setUploadFor] = useState<"technical" | "financial" | "combined" | null>(null);   // CR-P (88)
  const openCompare = (which: string, docs: ApiSavedDocument[], d: ApiSavedDocument) => {
    const pdfs = docs.filter(isComparable);   // newest first
    const at = pdfs.findIndex((x) => x._id === d._id);
    const older = pdfs[at + 1];
    if (older) setCompareRevs({ which, fromId: older._id, toId: d._id });
    else if (pdfs[at - 1]) setCompareRevs({ which, fromId: d._id, toId: pdfs[at - 1]._id });
  };
  // CR-P (88) - file a proposal that was produced outside the platform. It joins the same
  // revision stream, so an uploaded Rev 0 and a built Rev 1 sit in one history.
  // It carries the title, revision number, date and description it was issued with (item 88).
  // Errors are thrown back to the upload window, which shows them and keeps the form filled in.
  const uploadExistingProposal = async (which: "technical" | "financial" | "combined", file: File, meta: UploadMeta) => {
    if (!id) return;
    await saveDocumentVersion(
      id,
      {
        kind: "proposal", refId: which,
        title: meta.title || autoRevisionTitle(which, meta.revision),
        note: meta.note || "Uploaded, produced outside the platform",
        status: meta.status, version: meta.revision + 1, docDate: meta.docDate,
      },
      file,
      file.name,
    );
    await loadNextFinalVer();
    toast(`Uploaded and filed as Rev ${meta.revision}.`, "success");
  };

  // CR-P (106) - the financial cover is the technical cover with a different title. Copying it is
  // one action rather than re-entering the project name, RFP number and imagery by hand.
  const copyTechnicalCover = async () => {
    if (!(await brandedConfirm({
      title: "Copy the technical cover?",
      message: "The financial cover page is replaced with a copy of the technical one, with \"Technical\" changed to \"Financial\" in its title and volume. Anything already on the financial cover is lost.",
      confirmLabel: "Copy it across",
    }))) return;
    // It used to set a `title` field the cover does not have, so the copy kept "Technical".
    const swap = (s?: string) => (s || "").replace(/technical/gi, "Financial").trim();
    setCoverFinancial({ ...cover, proposalTitle: swap(cover.proposalTitle), volumeLabel: swap(cover.volumeLabel) });
    toast("Financial cover copied from the technical one.", "success");
  };

  // CR-P (87) - the combined pack: the technical and financial proposals merged into the single
  // file the client actually receives. Built from the latest revision of each.
  const buildCombinedProposal = async () => {
    if (!id) return;
    setProposalDownloading("combined");
    try {
      const [tech, fin] = await Promise.all([buildProposalBlob("technical", true), buildProposalBlob("financial", true)]);
      const merged = await PDFDocument.create();
      for (const blob of [tech, fin]) {
        const src = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((pg) => merged.addPage(pg));
      }
      const out = new Blob([await merged.save()], { type: "application/pdf" });
      const safe = fileName([project?.name, "Combined Proposal"], "").replace(/\.$/, "");

      // CR-P (112) - "the maximum file that they want most of the time is 30 megabytes per file...
      // if it is less than 30 we usually combine it together, or we just send it technical one PDF,
      // financial the second PDF." Over the limit, the merged file is useless for email, so we say
      // so rather than filing something that cannot be sent.
      const MAX_EMAIL_BYTES = 30 * 1024 * 1024;
      const overLimit = out.size > MAX_EMAIL_BYTES;
      const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;
      if (overLimit && !(await brandedConfirm({
        title: `The combined file is ${mb(out.size)}`,
        message: `Most clients cap attachments at 30 MB, so this merged pack is likely too big to email as one file. You can still file it, but consider sending the technical (${mb(tech.size)}) and financial (${mb(fin.size)}) PDFs separately, or use "ZIP latest" to send them in one ZIP file.`,
        confirmLabel: "File it anyway",
        danger: false,
      }))) { setProposalDownloading(null); return; }

      // CR-P (113) - record exactly WHAT went into this pack, so later you can tell whether the
      // client got technical only, financial only, or the combination, and which revisions.
      const techRev = Math.max(0, ((propDocs.technical[0]?.version) || 1) - 1);
      const finRev = Math.max(0, ((propDocs.financial[0]?.version) || 1) - 1);
      const note = `Technical Rev ${techRev} + Financial Rev ${finRev} · ${mb(out.size)}${overLimit ? " · over the 30 MB email limit" : ""}`;
      // CR-P (87) - the pack is a produced document, not a draft: drafts live in the builder tabs.
      await saveDocumentVersion(id, { kind: "proposal", refId: "combined", title: "Technical + Financial", note, status: "final" }, out, `${safe}.pdf`);
      await loadNextFinalVer();
      toast("Combined proposal created.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not combine the proposals.", "error"); }
    finally { setProposalDownloading(null); }
  };

  // CR-P (112) - "otherwise send the two PDFs in one email, or put them in a ZIP file". The two
  // volumes zipped, filed in the Combined stream (item 113: the note says which revisions went in)
  // and downloaded, ready to attach.
  const buildCombinedZip = async () => {
    if (!id) return;
    setProposalDownloading("combined-zip");
    try {
      const [tech, fin] = await Promise.all([buildProposalBlob("technical", true), buildProposalBlob("financial", true)]);
      const base = String(project?.name || "Project");
      const zip = makeZip([
        { name: fileName([base, "Technical Proposal"], "pdf"), data: new Uint8Array(await tech.arrayBuffer()) },
        { name: fileName([base, "Financial Proposal"], "pdf"), data: new Uint8Array(await fin.arrayBuffer()) },
      ]);
      const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;
      const techRev = Math.max(0, ((propDocs.technical[0]?.version) || 1) - 1);
      const finRev = Math.max(0, ((propDocs.financial[0]?.version) || 1) - 1);
      const note = `ZIP: Technical Rev ${techRev} + Financial Rev ${finRev} · ${mb(zip.size)}`;
      await saveDocumentVersion(id, { kind: "proposal", refId: "combined", title: "Technical + Financial (ZIP)", note, status: "final" }, zip, `${base}_Proposals.zip`);
      await loadNextFinalVer();
      downloadBlob(zip, fileName([base, "Proposals"], "zip"));
      toast("ZIP created, downloaded and filed under Combined Proposal.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not create the ZIP.", "error"); }
    finally { setProposalDownloading(null); }
  };

  // CR-P (83) - move one revision through its lifecycle from the table.
  const setProposalDocStatus = async (d: ApiSavedDocument, status: SavedDocStatus) => {
    if (!id) return;
    try { await updateSavedDocument(id, d._id, { status }); await loadNextFinalVer(); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not update the status.", "error"); }
  };
  // Item 110 - a revision's send log: who it went to, when and how. Recording one moves a draft /
  // final / completed revision to Sent.
  const logProposalSend = async (d: ApiSavedDocument, to: string, method: string, note = "", at?: string) => {
    if (!id) return;
    try { await logSavedDocumentSend(id, d._id, { to, method, note, at, markSent: true }); await loadNextFinalVer(); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not record the send.", "error"); throw err; }
  };

  // CR-P (86) - delete one revision. Asks first: a revision is a record of what went out.
  const removeProposalDoc = async (d: ApiSavedDocument) => {
    if (!id) return;
    if (!(await brandedConfirm({
      title: "Delete this revision?",
      message: `Revision ${Math.max(0, (d.version || 1) - 1)}${d.title ? ` (${d.title})` : ""} moves to the Recycle Bin (Archive & Bin), where it can be restored. Its revision number is not reused.`,
      confirmLabel: "Delete revision",
    }))) return;
    try { await deleteSavedDocument(id, d._id); await loadNextFinalVer(); toast("Revision moved to the recycle bin.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not delete.", "error"); }
  };

  // CR-P (86) - archive a revision: out of the table but kept, restorable from the "Archived" fold
  // under the table or from Archive & Bin.
  const archiveProposalDoc = async (d: ApiSavedDocument, next: boolean) => {
    if (!id) return;
    try {
      await updateSavedDocument(id, d._id, { archived: next });
      await loadNextFinalVer();
      toast(next ? `Rev ${Math.max(0, (d.version || 1) - 1)} archived. It is under "Archived" below the table, and in Archive & Bin.` : "Revision restored to the table.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not update the revision.", "error"); }
  };

  // CR-P (92) - reusable SECTION templates (distinct from whole-proposal templates). Stored as
  // proposal templates carrying a `section` marker, so no new collection was needed.
  const [sectionTemplates, setSectionTemplates] = useState<ApiProposalTemplate[]>([]);
  const [groupTemplates, setGroupTemplates] = useState<ApiProposalTemplate[]>([]);   // step 9b
  const loadSectionTemplates = async () => {
    try {
      const all = await fetchProposalTemplates();
      setSectionTemplates(all.filter((t) => (t.content as { section?: boolean } | undefined)?.section));
      setGroupTemplates(all.filter((t) => !!t.content?.group));
    } catch { /* the picker just stays empty */ }
  };
  useEffect(() => { void loadSectionTemplates(); }, []);
  // CR 200 - "Insert from template" from either source: another project's proposal, or the library.
  const [insertTarget, setInsertTarget] = useState<{ sectionId: string; metaId: string; vol: Vol; title: string } | null>(null);
  const insertSectionTemplate = async (p: InsertPayload) => {
    const t = insertTarget;
    if (!t) return;
    const current = sectionsOfVol(t.vol).find((x) => x.id === t.sectionId);
    const hasText = !!String(current?.body || "").replace(/<[^>]*>/g, "").trim();
    if (hasText && !(await brandedConfirm({
      title: "Replace what is written here?",
      message: `"${t.title || "This section"}" already has content. Inserting ${p.from} replaces it.`,
      confirmLabel: "Replace it",
      danger: true,
    }))) return;
    updateSectionRow(t.sectionId, "body", p.body, t.vol);
    if (p.copySubs && p.subsections.length) setSubsections(t.sectionId, p.subsections, t.vol);
    if (p.copyTitle && p.title) {
      updateSectionRow(t.sectionId, "heading", p.title, t.vol);
      setLayout(layoutOfVol(t.vol).map((m) => (m.id === t.metaId ? { ...m, title: p.title } : m)), t.vol);
    }
    setDirty(true);
    setInsertTarget(null);
    toast(`Inserted from ${p.from}. Edit the names and numbers for this project.`, "success");
  };
  const saveSectionAsTemplate = async (sec: { title?: string; body?: string }) => {
    if (!String(sec.body || "").trim()) { toast("Write something in the section first.", "info"); return; }
    const name = window.prompt("Name this section template", sec.title || "Section template");
    if (name === null || !name.trim()) return;
    try {
      await saveProposalTemplate({ name: name.trim(), description: "Section template", content: { section: true, body: sec.body } as never });
      await loadSectionTemplates();
      toast("Section template saved.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save the template.", "error"); }
  };

  const loadNextFinalVer = async () => {
    if (!id) return;
    try {
      const [t, f, c, nt, nf] = await Promise.all([
        fetchSavedDocuments(id, "proposal", "technical", true),
        fetchSavedDocuments(id, "proposal", "financial", true),
        fetchSavedDocuments(id, "proposal", "combined", true),
        // CR-P (84) - the real next number (deleted ones are never reused). Falls back to
        // "newest + 1" if the server cannot say.
        fetchNextSavedVersion(id, "proposal", "technical").catch(() => 0),
        fetchNextSavedVersion(id, "proposal", "financial").catch(() => 0),
      ]);
      setNextFinalVer({ technical: nt || ((t[0]?.version) || 0) + 1, financial: nf || ((f[0]?.version) || 0) + 1 });
      const live = (l: ApiSavedDocument[]) => l.filter((d) => !d.archived);
      const gone = (l: ApiSavedDocument[]) => l.filter((d) => d.archived);
      setPropDocs({ technical: live(t), financial: live(f), combined: live(c) });
      setArchivedDocs({ technical: gone(t), financial: gone(f), combined: gone(c) });
    } catch { /* ignore */ }
  };
  useEffect(() => { void loadNextFinalVer(); /* eslint-disable-next-line */ }, [id]);
  const [expenseSearch, setExpenseSearch] = useState(""); // per-tab search within the Expense Log
  // Preview modal: which proposal's PDF to render full-screen.
  const [proposalPreview, setProposalPreview] = useState<"technical" | "financial" | null>(null);
  // Other projects, for the "import past performance" picker.
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);
  // Full resumes of proposal team members — appended to the technical proposal PDF.
  const [teamResumes, setTeamResumes] = useState<ProposalTeamResume[]>([]);

  // Fetch each named team member's resume from their profile — by account id (works even with
  // no empId, e.g. admins), falling back to empId. Members without a saved resume are skipped.
  // Subcontractor people come from the subcontractor resume library instead (step 5). Keyed on
  // who is listed, not on the other cells, so typing a position or nationality doesn't refetch.
  const staffKey = technical.employees.map((e) => [e.id, e.userId || "", e.empId || "", e.subResumeId || "", e.subResumeId ? "" : e.name].join(":")).join("|");
  useEffect(() => {
    let cancelled = false;
    const rows = technical.employees.map((e) => {
      if (e.subResumeId) return { rowId: e.id, name: e.name, role: e.role, subResumeId: e.subResumeId, userId: "", empId: "" };
      const pool = employeePool.find((p) => (e.userId && p.id === e.userId) || (e.empId && p.empId === e.empId) || p.name === e.name);
      return { rowId: e.id, name: e.name, role: e.role, subResumeId: "", userId: e.userId || pool?.id || "", empId: e.empId || pool?.empId || "" };
    }).filter((r) => r.subResumeId || r.userId || r.empId);
    if (!rows.length) { setTeamResumes([]); return; }
    (async () => {
      const results = await Promise.all(rows.map(async (r): Promise<ProposalTeamResume | null> => {
        if (r.subResumeId) {
          const s = await fetchSubResume(r.subResumeId);
          return s ? { rowId: r.rowId, name: r.name, role: r.role, firm: s.subcontractorName, data: { resume: s, user: { name: s.personName, email: s.contact?.email || "", phone: s.contact?.phone || "", avatarUrl: s.photoUrl || "" } } } : null;
        }
        const data = (r.userId ? await fetchResumeByUser(r.userId) : null) || (r.empId ? await fetchResumeByEmp(r.empId) : null);
        return data ? { rowId: r.rowId, name: r.name, role: r.role, data } : null;
      }));
      if (!cancelled) setTeamResumes(results.filter((r): r is ProposalTeamResume => r !== null));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffKey, employeePool]);

  // Subcontractor staff picker: people from the subcontractor resume library.
  const [subStaffOpen, setSubStaffOpen] = useState(false);
  const [subStaffPool, setSubStaffPool] = useState<ApiSubResume[] | null>(null);
  const openSubStaffPicker = async () => {
    setSubStaffOpen(true);
    setSubStaffPool(null);
    try { setSubStaffPool(await fetchSubResumes()); } catch { setSubStaffPool([]); }
  };

  const setTech = <K extends keyof TechnicalProposalContent>(key: K, value: TechnicalProposalContent[K]) =>
    setTechnical((p) => ({ ...p, [key]: value }));
  const setFin = <K extends keyof FinancialProposalContent>(key: K, value: FinancialProposalContent[K]) =>
    setFinancial((p) => ({ ...p, [key]: value }));

  // ── Financial: fully editable multi-table pricing ────────────────────────────
  const fNum = (s: string) => parseFloat(String(s || "").replace(/[^0-9.-]/g, "")) || 0;
  const updateTables = (fn: (tables: FinancialTable[]) => FinancialTable[]) =>
    setFinancial((p) => ({ ...p, tables: fn(resolveFinancialTables(p)) }));
  const patchTable = (tid: string, patch: Partial<FinancialTable>) =>
    updateTables((t) => t.map((x) => (x.id === tid ? { ...x, ...patch } : x)));

  const addTable = () => updateTables((t) => [...t, { id: `t-${uid()}`, title: `Table ${t.length + 1}`, columns: defaultFinancialColumns().map((c) => ({ ...c, id: `c-${uid()}` })), rows: [] }]);
  const duplicateTable = (tid: string) => updateTables((t) => {
    const src = t.find((x) => x.id === tid);
    if (!src) return t;
    const colMap: Record<string, string> = {};
    const columns = src.columns.map((c) => { const nid = `c-${uid()}`; colMap[c.id] = nid; return { ...c, id: nid }; });
    const rows = src.rows.map((r) => ({ ...r, id: `r-${uid()}`, cells: Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [colMap[k] || k, v])) }));
    const idx = t.findIndex((x) => x.id === tid);
    const copy: FinancialTable = { id: `t-${uid()}`, title: `${src.title} (copy)`, columns, rows, adjustments: (src.adjustments || []).map((a) => ({ ...a, id: `a-${uid()}` })), optionYears: src.optionYears };
    return [...t.slice(0, idx + 1), copy, ...t.slice(idx + 1)];
  });
  const removeTable = (tid: string) => updateTables((t) => t.filter((x) => x.id !== tid));

  const addColumn = (tid: string) => patchTableById(tid, (tb) => ({ ...tb, columns: [...tb.columns, { id: `c-${uid()}`, label: "Column", kind: "text" }] }));
  const removeColumn = (tid: string, cid: string) => patchTableById(tid, (tb) => ({ ...tb, columns: tb.columns.filter((c) => c.id !== cid), rows: tb.rows.map((r) => { const { [cid]: _omit, ...rest } = r.cells; void _omit; return { ...r, cells: rest }; }) }));
  const setColumn = (tid: string, cid: string, patch: Partial<FinancialColumn>) => patchTableById(tid, (tb) => ({ ...tb, columns: tb.columns.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }));
  const addRow = (tid: string) => patchTableById(tid, (tb) => ({ ...tb, rows: [...tb.rows, { id: `r-${uid()}`, cells: {} }] }));
  const removeRow = (tid: string, rid: string) => patchTableById(tid, (tb) => ({ ...tb, rows: tb.rows.filter((r) => r.id !== rid) }));
  const setCell = (tid: string, rid: string, cid: string, value: string) => patchTableById(tid, (tb) => ({ ...tb, rows: tb.rows.map((r) => (r.id === rid ? { ...r, cells: { ...r.cells, [cid]: value } } : r)) }));
  function patchTableById(tid: string, fn: (tb: FinancialTable) => FinancialTable) { updateTables((t) => t.map((x) => (x.id === tid ? fn(x) : x))); }
  // Step 7b - phase headings, lines under a table (VAT, DBA, markup, discount), option years.
  const addGroupRow = (tid: string) => patchTableById(tid, (tb) => ({ ...tb, rows: [...tb.rows, { id: `r-${uid()}`, cells: {}, type: "group" as const, label: "" }] }));
  const setRowLabel = (tid: string, rid: string, label: string) => patchTableById(tid, (tb) => ({ ...tb, rows: tb.rows.map((r) => (r.id === rid ? { ...r, label } : r)) }));
  const addAdjustment = (tid: string, p: { label: string; mode: "percent" | "fixed"; value: string }) =>
    patchTableById(tid, (tb) => ({ ...tb, adjustments: [...(tb.adjustments || []), { id: `a-${uid()}`, ...p }] }));
  const setAdjustment = (tid: string, aid: string, patch: Partial<FinancialAdjustment>) =>
    patchTableById(tid, (tb) => ({ ...tb, adjustments: (tb.adjustments || []).map((a) => (a.id === aid ? { ...a, ...patch } : a)) }));
  const removeAdjustment = (tid: string, aid: string) => patchTableById(tid, (tb) => ({ ...tb, adjustments: (tb.adjustments || []).filter((a) => a.id !== aid) }));

  // Always calculated (step 7b): lines, adjustments and option years.
  const tableTotal = (tb: FinancialTable) => tableCalc(tb).grand;

  // Export one table to an .xlsx file.
  const exportTableExcel = (tb: FinancialTable) => {
    const header = tb.columns.map((c) => c.label);
    const calc = tableCalc(tb);
    // Phase headings export as a label row; calculated amounts export as their value.
    const data = tb.rows.map((r) => (r.type === "group"
      ? [r.label || "", ...tb.columns.slice(1).map(() => "")]
      : tb.columns.map((c) => (c.kind === "amount" && calc.isComputed(r) ? String(calc.amountOf(r)) : r.cells[c.id] ?? ""))));
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (tb.title || "Table").slice(0, 31).replace(/[\\/?*[\]]/g, ""));
    XLSX.writeFile(wb, `${(project?.name || "pricing").replace(/\s+/g, "_")}_${(tb.title || "table").replace(/\s+/g, "_")}.xlsx`);
  };

  // CR 197 - every price table in one workbook (a sheet each, with its total), for Export > Excel.
  const exportAllTablesExcel = () => {
    const tables = resolveFinancialTables(financial);
    if (!tables.length) { toast("There are no price tables to export.", "error"); return; }
    const wb = XLSX.utils.book_new();
    const used = new Set<string>();
    tables.forEach((tb, i) => {
      const calc = tableCalc(tb);
      const data = tb.rows.map((r) => (r.type === "group"
        ? [r.label || "", ...tb.columns.slice(1).map(() => "")]
        : tb.columns.map((c) => (c.kind === "amount" && calc.isComputed(r) ? calc.amountOf(r) : r.cells[c.id] ?? ""))));
      const pad = tb.columns.slice(2).map(() => "");
      const ws = XLSX.utils.aoa_to_sheet([tb.columns.map((c) => c.label), ...data, [], ["Total", "", ...pad.slice(0, -1), calc.grand]]);
      let name = (tb.title || `Table ${i + 1}`).slice(0, 28).replace(/[\\/?*[\]:]/g, "") || `Table ${i + 1}`;
      while (used.has(name)) name = `${name.slice(0, 25)} ${i + 1}`;
      used.add(name);
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, `${(project?.name || "project").replace(/[^a-z0-9._-]+/gi, "_")}_Financial_Proposal_Pricing.xlsx`);
  };

  // Import an Excel/CSV file as a NEW table (columns from the header row).
  const importFinancialExcel = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const headerRow = (aoa[0] || []) as unknown[];
      if (!headerRow.length) { toast("No rows found in that file.", "error"); return; }
      // Quantity and unit price columns are recognised, so an imported schedule calculates itself.
      const kindFor = (h: string): FinancialColumnKind => /amount|total|extended/i.test(h) ? "amount" : /qty|quantity/i.test(h) ? "qty" : /rate|price|cost/i.test(h) ? "rate" : "text";
      const columns: FinancialColumn[] = headerRow.map((h, i) => ({ id: `c-${uid()}`, label: String(h || `Column ${i + 1}`), kind: kindFor(String(h)) }));
      const rows = (aoa.slice(1) as unknown[][]).map((r) => ({ id: `r-${uid()}`, cells: Object.fromEntries(columns.map((c, i) => [c.id, String(r[i] ?? "")])) }))
        .filter((r) => Object.values(r.cells).some((v) => String(v).trim() !== ""));
      const title = file.name.replace(/\.[^.]+$/, "");
      updateTables((t) => [...t, { id: `t-${uid()}`, title, columns, rows }]);
      toast(`Imported "${title}" (${rows.length} rows).`, "success");
    } catch {
      toast("Could not read that file. Use a .xlsx or .csv export.", "error");
    }
  };

  // Technical proposal list helpers
  const addEmployeeRow = (name = "", role = "", empId = "", userId = "", extra: Partial<TechnicalProposalContent["employees"][number]> = {}) =>
    setTech("employees", [...technical.employees, { id: uid(), name, role, resumeName: "", empId, userId, ...extra }]);
  const updateEmployeeRow = (eid: string, field: "name" | "role" | "resumeName" | "firm" | "nationality" | "years", value: string) =>
    setTech("employees", technical.employees.map((e) => (e.id === eid ? { ...e, [field]: value } : e)));
  const setEmployeeKey = (eid: string, key: boolean) =>
    setTech("employees", technical.employees.map((e) => (e.id === eid ? { ...e, keyStaff: key } : e)));
  const removeEmployeeRow = (eid: string) => setTech("employees", technical.employees.filter((e) => e.id !== eid));

  // Step 6 - the projects listed in a Past Performance / Relevant Experience / References section.
  const setSectionProjects = (sid: string, projects: ProposalSimilarProject[], vol: Vol = "technical") =>
    patchSection(sid, { projects }, vol);
  // Item 102 - the optional recommendation / credit letters section goes right after past performance:
  // an external document (the letters as they are), after a separator page.
  const addLettersAfter = (afterMetaId: string) =>
    setTechnical((p) => {
      const newId = uid();
      const title = "Client Recommendation / Credit Letters";
      const meta: ProposalSectionMeta = {
        id: `m-${newId}`, kind: "custom", refId: newId, title, hidden: false,
        libraryKey: "appx-reference-letters", pageType: "external", divider: true,
        guide: "Client reference, recommendation or credit letters, inserted as they are after a separator page. Upload them, or pick them From Company Documents.",
      };
      const resolved = resolveProposalLayout(p);
      const at = resolved.findIndex((m) => m.id === afterMetaId);
      const layout = at < 0 ? [...resolved, meta] : [...resolved.slice(0, at + 1), meta, ...resolved.slice(at + 1)];
      return { ...p, sections: [...p.sections, { id: newId, heading: title, body: "" }], layout };
    });

  const addTimelineRow = () => setTech("timeline", [...technical.timeline, { phase: "", start: "", end: "" }]);
  const updateTimelineRow = (idx: number, field: "phase" | "start" | "end", value: string) =>
    setTech("timeline", technical.timeline.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  const removeTimelineRow = (idx: number) => setTech("timeline", technical.timeline.filter((_, i) => i !== idx));

  // Step 7 - section handlers work on either volume: the financial one has sections too.
  const sectionsOfVol = (vol: Vol) => (vol === "financial" ? financial.sections || [] : technical.sections);
  const setVolSections = (vol: Vol, fn: (all: ProposalSection[]) => ProposalSection[]) =>
    vol === "financial"
      ? setFinancial((p) => ({ ...p, sections: fn(p.sections || []) }))
      : setTechnical((p) => ({ ...p, sections: fn(p.sections) }));
  const patchSection = (sid: string, patch: Partial<ProposalSection>, vol: Vol = "technical") =>
    setVolSections(vol, (all) => all.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
  const updateSectionRow = (sid: string, field: "heading" | "body", value: string, vol: Vol = "technical") =>
    patchSection(sid, { [field]: value }, vol);
  // CR-B-18 — attach / remove pre-made files (resume/excel/pdf/picture) on a proposal section.
  // Proposal step 4 - company documents a proposal can pull in with no upload (item 104).
  const [companyDocs, setCompanyDocs] = useState<ProposalDoc[]>([]);
  useEffect(() => { fetchProposalDocs().then(setCompanyDocs).catch(() => {}); }, [id]);
  const [docPickFor, setDocPickFor] = useState<string | null>(null);   // section id the picker is open for
  const setSectionAttachments = (sid: string, atts: ProposalAttachment[], vol: Vol = "technical") =>
    patchSection(sid, { attachments: atts }, vol);
  // Spec 1 - unlimited subsections under a section, numbered in print (1.1, 1.2 / A.1, A.2).
  const setSubsections = (sid: string, subs: ProposalSubsection[], vol: Vol = "technical") =>
    patchSection(sid, { subsections: subs }, vol);
  const subsOf = (sid: string, vol: Vol = "technical") => sectionsOfVol(vol).find((s) => s.id === sid)?.subsections || [];
  const addSub = (sid: string, vol: Vol = "technical") => setSubsections(sid, [...subsOf(sid, vol), { id: uid(), heading: "", body: "" }], vol);
  const updateSub = (sid: string, subId: string, p: Partial<ProposalSubsection>, vol: Vol = "technical") =>
    setSubsections(sid, subsOf(sid, vol).map((x) => (x.id === subId ? { ...x, ...p } : x)), vol);
  const moveSub = (sid: string, k: number, dir: -1 | 1, vol: Vol = "technical") => {
    const a = subsOf(sid, vol).slice();
    const j = k + dir;
    if (j < 0 || j >= a.length) return;
    [a[k], a[j]] = [a[j], a[k]];
    setSubsections(sid, a, vol);
  };
  const removeSub = async (sid: string, subId: string, vol: Vol = "technical") => {
    const x = subsOf(sid, vol).find((y) => y.id === subId);
    const hasText = !!(x?.heading.trim() || (x?.body || "").replace(/<[^>]*>/g, "").trim());
    if (hasText && !(await brandedConfirm({ title: "Delete this subsection?", message: `"${x?.heading || "Untitled"}" and its text are removed.`, confirmLabel: "Delete subsection" }))) return;
    setSubsections(sid, subsOf(sid, vol).filter((y) => y.id !== subId), vol);
  };
  const uploadSectionDoc = async (sid: string, file: File, vol: Vol = "technical") => {
    if (!id) return;
    try {
      const { url } = await uploadProposalAsset(id, file);
      const s = sectionsOfVol(vol).find((x) => x.id === sid);
      setSectionAttachments(sid, [...(s?.attachments || []), { name: file.name, url }], vol);
      toast("File attached — remember to Save Workspace.", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Upload failed.", "error"); }
  };

  // ── Section engine (order / visibility / titles) ─────────────────────────────
  // Step 7 - every layout handler takes the volume (technical by default).
  type SecBox = { sections: ProposalSection[]; layout: ProposalSectionMeta[] };
  const layoutOfVol = (vol: Vol) => (vol === "financial" ? resolveFinancialLayout(financial) : resolveProposalLayout(technical));
  const editVol = (vol: Vol, fn: (b: SecBox) => Partial<SecBox> | null) =>
    vol === "financial"
      ? setFinancial((p) => { const r = fn({ sections: p.sections || [], layout: resolveProposalLayout({ sections: p.sections || [], layout: p.layout }, FINANCIAL_BUILTINS) }); return r ? { ...p, ...r } : p; })
      : setTechnical((p) => { const r = fn({ sections: p.sections, layout: resolveProposalLayout(p) }); return r ? { ...p, ...r } : p; });
  const setLayout = (next: ProposalSectionMeta[], vol: Vol = "technical") => editVol(vol, () => ({ layout: next }));
  // CR-B-19a — colleagues that can be tagged on a proposal section (notified via a reminder).
  const [projUsers, setProjUsers] = useState<AdminUser[]>([]);
  useEffect(() => { fetchUsers().then(setProjUsers).catch(() => {}); }, []);
  // CR 208/209 - everyone on this project: the default attendees of a meeting, and who can be named.
  const projectPeople = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id?: string; name: string; role?: string; company?: string }> = [];
    const push = (p: { id?: string; name: string; role?: string; company?: string }) => {
      const key = (p.name || "").trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(p);
    };
    // The people actually on this project: the owner, the assigned employees, the JV partner and
    // the subcontractor contacts. Not the whole staff list.
    if (project?.owner) push({ name: project.owner, role: "Project owner", company: "GreenTech USA" });
    assignedEmployees.forEach((empId) => {
      const e = employeePool.find((x) => x.empId === empId);
      if (e) push({ id: e.id, name: e.name, role: e.jobTitle || "", company: "GreenTech USA" });
    });
    if (jvInfo.enabled && jvInfo.partnerName) push({ name: jvInfo.contactName || jvInfo.partnerName, role: "JV partner", company: jvInfo.partnerName });
    (project?.subcontractors || []).forEach((sc) => push({ name: sc.contactName || sc.name, role: "Subcontractor", company: sc.name }));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.owner, project?.subcontractors, assignedEmployees, employeePool, jvInfo.enabled, jvInfo.partnerName, jvInfo.contactName]);

  const notifyMinuteMentions = (named: Array<{ id: string; name: string }>, context: string, note: string) => {
    // Only someone with an account can be told; a subcontractor contact is just a name on the page.
    const people = named.filter((u) => /^[0-9a-f]{24}$/i.test(u.id));
    if (!people.length) return;
    Promise.all(people.map((u) => createReminder({
      userId: u.id,
      title: `Mentioned in "${context}"`,
      notes: note,
      dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      link: id ? `/dashboard/projects/${id}` : "/dashboard",
      projectId: id || undefined,
      projectName: project?.name || "Project",
    })))
      .then(() => toast(`${people.map((u) => u.name).join(", ")} ${people.length > 1 ? "were" : "was"} notified.`, "success"))
      .catch(() => toast("Could not notify everyone mentioned.", "error"));
  };

  // CR 201 - whoever is mentioned in a section's note ("@Sarah please work on this part") is told,
  // with the note itself, as soon as the note is finished.
  const notifyMentions = (index: number, people: Array<{ id: string; name: string }>, note: string, vol: Vol = "technical") => {
    const secTitle = layoutOfVol(vol)[index]?.title || "Section";
    const volLabel = vol === "financial" ? "Financial" : "Technical";
    Promise.all(people.map((u) => createReminder({
      userId: u.id,
      title: `Mentioned in "${secTitle}" (${volLabel} Proposal)`,
      notes: note,
      dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      link: id ? `/dashboard/projects/${id}` : "/dashboard",
      projectId: id || undefined,
      projectName: project?.name || "Proposal",
    })))
      .then(() => toast(`${people.map((u) => u.name).join(", ")} ${people.length > 1 ? "were" : "was"} notified.`, "success"))
      .catch(() => toast("Could not notify everyone mentioned.", "error"));
  };
  // Reorder a section by index against the *resolved* layout (used by the on-box arrows).
  const moveProposalSection = (index: number, dir: -1 | 1, vol: Vol = "technical") => {
    const cur = layoutOfVol(vol);
    const j = index + dir;
    if (j < 0 || j >= cur.length) return;
    const next = cur.slice();
    [next[index], next[j]] = [next[j], next[index]];
    setLayout(next, vol);
  };
  // Add a custom section (optionally with a standard-section title) and append it to the layout.
  // Spec 2/5 - a section from the library carries its identity (libraryKey), guidance, page type and
  // appendix flag; a custom one is plain designed content.
  const addLayoutSection = (title: string, body = "", opts: SectionAddOpts = {}, vol: Vol = "technical") => {
    // Item 104 / spec 6 "Automatic Appendices": a library type pulls in the latest valid company
    // document of that type (e.g. Insurance Certificates → the current certificate), no upload step.
    const auto = opts.libraryKey ? bestDocFor(opts.libraryKey, companyDocs) : undefined;
    editVol(vol, (b) => {
      const newId = uid();
      const section = { id: newId, heading: title || "New Section", body, ...(auto ? { attachments: [docAttachment(auto)] } : {}) };
      const meta: ProposalSectionMeta = { id: `m-${newId}`, kind: "custom", refId: newId, title: title || "New Section", hidden: false, ...opts };
      return { sections: [...b.sections, section], layout: [...b.layout, meta] };
    });
    if (auto) {
      const ex = expiryInfo(auto.expiresAt);
      toast(`Attached from Company Documents: ${auto.name}${ex.state === "expired" ? `. ${ex.label}: replace it before sending.` : ""}`, ex.state === "expired" ? "error" : "success");
    }
  };
  const duplicateLayoutSection = (meta: ProposalSectionMeta, vol: Vol = "technical") =>
    editVol(vol, (b) => {
      const src = b.sections.find((s) => s.id === meta.refId);
      if (!src) return null;
      const newId = uid();
      const section = { id: newId, heading: `${src.heading} (copy)`, body: src.body, subsections: (src.subsections || []).map((x) => ({ ...x, id: uid() })) };
      const at = b.layout.findIndex((m) => m.id === meta.id);
      const newMeta: ProposalSectionMeta = { id: `m-${newId}`, kind: "custom", refId: newId, title: `${meta.title} (copy)`, hidden: meta.hidden, pageType: meta.pageType, appendix: meta.appendix, divider: meta.divider, libraryKey: meta.libraryKey, guide: meta.guide, rfpRef: meta.rfpRef };
      return { sections: [...b.sections, section], layout: [...b.layout.slice(0, at + 1), newMeta, ...b.layout.slice(at + 1)] };
    });
  // CR 204 - deleting a section or an appendix asks first, and says what goes with it.
  const removeLayoutSection = async (meta: ProposalSectionMeta, vol: Vol = "technical") => {
    const sec = sectionsOfVol(vol).find((s) => s.id === meta.refId);
    const words = String(sec?.body || "").replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
    const holds = [
      words ? `${words} word${words === 1 ? "" : "s"} of text` : "",
      sec?.subsections?.length ? `${sec.subsections.length} subsection${sec.subsections.length === 1 ? "" : "s"}` : "",
      sec?.attachments?.length ? `${sec.attachments.length} attached file${sec.attachments.length === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    const what = meta.appendix ? "appendix" : meta.kind === "blank" ? "blank page" : "section";
    if (!(await brandedConfirm({
      title: `Delete "${meta.title}"?`,
      message: holds.length
        ? `This ${what} holds ${holds.join(", ")}. Deleting it takes all of that out of the document, and it cannot be undone.`
        : `This ${what} is empty. It is taken out of the document.`,
      confirmLabel: `Delete ${what}`,
      danger: true,
    }))) return;
    editVol(vol, (b) => ({
      sections: b.sections.filter((s) => s.id !== meta.refId),
      layout: b.layout.filter((m) => m.id !== meta.id),
    }));
    setDirty(true);
    toast(`"${meta.title}" deleted.`, "success");
  };
  // CR 206 - include a company document: a new appendix carrying that file, printed as uploaded.
  const includeCompanyDoc = (doc: ProposalDoc, vol: Vol = "technical") => {
    editVol(vol, (b) => {
      const newId = uid();
      return {
        sections: [...b.sections, { id: newId, heading: doc.tabLabel || doc.name, body: "", attachments: [docAttachment(doc)] }],
        layout: [...b.layout, {
          id: `m-${newId}`, kind: "custom" as const, refId: newId, title: doc.tabLabel || doc.name,
          hidden: false, appendix: true, pageType: "external" as const, divider: true, libraryKey: doc.libraryKey,
        }],
      };
    });
    setDirty(true);
    toast(`"${doc.name}" added as an appendix. It prints exactly as uploaded.`, "success");
  };
  const addBlankPage = (vol: Vol = "technical") =>
    editVol(vol, (b) => ({
      layout: [...b.layout, { id: `blank-${uid()}`, kind: "blank" as const, title: "Blank page", hidden: false, letterhead: "none" as const }],
    }));
  // Step 9b (spec 1) - a selected group of sections saved as one template, inserted in one go.
  // Project uploads stay behind (they belong to this project); company documents travel with it.
  type GroupItem = NonNullable<ProposalTemplateContent["items"]>[number];
  const saveGroupTemplate = async (vol: Vol, name: string, metaIds: string[]) => {
    const secs = sectionsOfVol(vol);
    const items: GroupItem[] = layoutOfVol(vol).filter((m) => m.kind === "custom" && metaIds.includes(m.id)).map((m) => {
      const s = secs.find((x) => x.id === m.refId);
      return {
        meta: { kind: "custom", title: m.title, pageType: m.pageType, appendix: m.appendix, divider: m.divider, libraryKey: m.libraryKey, guide: m.guide, rfpRef: m.rfpRef, letterhead: m.letterhead, pageBreakBefore: m.pageBreakBefore },
        section: { heading: s?.heading || m.title, body: s?.body || "", subsections: s?.subsections || [], projects: s?.projects, attachments: (s?.attachments || []).filter((a) => !!a.companyFileId) },
      };
    });
    try {
      await saveProposalTemplate({ name, description: `Section group (${items.length})`, content: { group: true, volume: vol, items } });
      await loadSectionTemplates();
      toast(`Saved "${name}" with ${items.length} section${items.length === 1 ? "" : "s"}.`, "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save the group.", "error"); }
  };
  const insertGroupTemplate = (vol: Vol, t: ApiProposalTemplate) => {
    const items = t.content?.items || [];
    if (!items.length) { toast("That group is empty.", "info"); return; }
    editVol(vol, (b) => {
      const secs: ProposalSection[] = [];
      const metas: ProposalSectionMeta[] = [];
      for (const it of items) {
        const sid = uid();
        secs.push({
          id: sid, heading: it.section.heading || it.meta.title || "Section", body: it.section.body || "",
          subsections: (it.section.subsections || []).map((x) => ({ ...x, id: uid() })),
          ...(it.section.projects?.length ? { projects: it.section.projects.map((p) => ({ ...p, id: uid() })) } : {}),
          ...(it.section.attachments?.length ? { attachments: it.section.attachments } : {}),
        });
        metas.push({ ...it.meta, id: `m-${sid}`, kind: "custom", refId: sid, title: it.meta.title || it.section.heading || "Section", hidden: false });
      }
      return { sections: [...b.sections, ...secs], layout: [...b.layout, ...metas] };
    });
    toast(`Inserted ${items.length} section${items.length === 1 ? "" : "s"} from "${t.name}".`, "success");
  };
  const deleteGroupTemplate = async (t: ApiProposalTemplate) => {
    if (!(await brandedConfirm({ title: `Delete "${t.name}"?`, message: "The saved group is removed. Proposals that already used it keep their sections.", confirmLabel: "Delete group" }))) return;
    try { await deleteProposalTemplate(t._id); await loadSectionTemplates(); toast("Group deleted.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not delete the group.", "error"); }
  };
  // Item 91 - the cover's own Cancel: back to the cover as last saved.
  const cancelCover = async (vol: Vol) => {
    if (!(await brandedConfirm({ title: "Discard cover changes?", message: "The cover goes back to how it was last saved.", confirmLabel: "Discard changes" }))) return;
    const pc = (project?.proposalContent || {}) as ProposalContent;
    if (vol === "financial") setCoverFinancial({ ...emptyCover(), ...(pc.coverFinancial || pc.cover || {}) });
    else setCover({ ...emptyCover(), ...(pc.cover || {}) });
  };
  const saveCover = (vol: Vol, status: "draft" | "complete") => {
    (vol === "financial" ? setCoverFinancial : setCover)((c) => ({ ...c, status }));
    setDirty(true);
    setSaveRequested(true);
  };
  // Item 105 - the standard attachments list: the appendices a GT proposal carries (as in the
  // client's samples), each filled from Company Documents where a document of that type exists.
  const STANDARD_APPENDICES: Record<Vol, string[]> = {
    technical: ["appx-sam", "appx-company-registration", "appx-business-licenses", "appx-insurance", "appx-dba", "appx-reference-letters"],
    financial: ["appx-sam", "appx-bonding", "appx-insurance", "appx-dba"],
  };
  const addStandardAppendices = (vol: Vol) => {
    const have = new Set(layoutOfVol(vol).map((m) => m.libraryKey).filter(Boolean));
    const add = STANDARD_APPENDICES[vol]
      .map((k) => APPENDIX_LIBRARY.find((a) => a.key === k))
      .filter((a): a is NonNullable<typeof a> => !!a && !have.has(a.key));
    if (!add.length) { toast("The standard appendices are already in this volume.", "info"); return; }
    for (const a of add) addLayoutSection(a.title, "", { libraryKey: a.key, guide: a.hint, appendix: true, pageType: a.pageType || "external", divider: true }, vol);
    toast(`Added ${add.length} standard appendix section${add.length === 1 ? "" : "s"}.`, "success");
  };
  const insertResource = (b: ApiResourceBlock) => {
    addLayoutSection(b.title, b.body);
    setLibraryOpen(false);
    toast(`Inserted "${b.title}" as a section.`, "success");
  };

  // ── Requirement tracker (internal compliance checklist) ──────────────────────
  const addRequirement = () => {
    if (!newReq.trim()) return;
    setRequirements((r) => [...r, { id: uid(), label: newReq.trim(), done: false }]);
    setNewReq("");
  };
  const toggleRequirement = (rid: string) => setRequirements((r) => r.map((x) => (x.id === rid ? { ...x, done: !x.done } : x)));
  const removeRequirement = (rid: string) => setRequirements((r) => r.filter((x) => x.id !== rid));

  // ── Revision control + archive ───────────────────────────────────────────────
  const currentProposalSnapshot = (): ProposalContentType =>
    ({ cover, coverFinancial, coverLetter, coverLetterFinancial, backCover, letterhead, customLetterheadUrl, requirements, technical, financial, rfp });
  const applyProposalSnapshot = (c: ProposalContentType) => {
    setCover({ ...emptyCover(), ...(c.cover || {}) });
    setCoverFinancial({ ...emptyCover(), ...(c.coverFinancial || c.cover || {}) });
    setCoverLetter({ ...emptyCoverLetter(), ...(c.coverLetter || {}) });
    setCoverLetterFinancial({ ...emptyCoverLetter(), ...(c.coverLetterFinancial || {}) });
    // Item 117 - revisions never carry the EOI; only a full reload (Discard) restores it.
    if (c.eoi) setEoi(c.eoi);
    if (c.rfp) setRfp(c.rfp);
    setBackCover({ ...emptyBackCover(), ...(c.backCover || {}) });
    setLetterhead(c.letterhead || "gt");
    setCustomLetterheadUrl(c.customLetterheadUrl || "");
    setRequirements(c.requirements || []);
    setTechnical({ ...emptyTechnical(), ...(c.technical || {}) });
    setFinancial({ ...emptyFinancial(), ...(c.financial || {}) });
  };
  const loadRevisions = async () => {
    if (!id) return;
    try { setRevisions(await fetchProposalRevisions(id)); } catch { /* ignore */ }
  };
  useEffect(() => { if (id) void loadRevisions(); /* eslint-disable-next-line */ }, [id]);

  const saveRevision = async (archived: boolean) => {
    if (!id) return;
    if (archived && !confirm("Submit & archive this version? Archived versions are locked and kept permanently.")) return;
    setRevBusy(true);
    try {
      const label = revLabel.trim() || (archived ? "Final (submitted)" : `Version ${revisions.length + 1}`);
      await createProposalRevision(id, { label, content: currentProposalSnapshot(), archived });
      setRevLabel("");
      toast(archived ? "Version archived." : "Version saved.", "success");
      await loadRevisions();
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save version.", "error"); }
    finally { setRevBusy(false); }
  };
  const restoreRevision = (rev: ApiProposalRevision) => {
    if (!confirm(`Restore "${rev.label || "this version"}"? This replaces the current proposal content (it isn't saved until you click Save Workspace).`)) return;
    applyProposalSnapshot(rev.content || {});
    toast("Version restored — review and Save Workspace to keep it.", "success");
  };
  const removeRevision = async (rev: ApiProposalRevision) => {
    if (!id || !confirm(`Delete version "${rev.label || ""}"?`)) return;
    try { await deleteProposalRevision(id, rev._id); toast("Version deleted.", "success"); await loadRevisions(); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not delete.", "error"); }
  };
  // Keep a custom section's editor heading in sync with its layout title (rename happens in the manager).
  const layoutTitleFor = (sid: string, fallback: string) =>
    resolveProposalLayout(technical).find((m) => m.kind === "custom" && m.refId === sid)?.title || fallback;

  // ── Proposal templates ───────────────────────────────────────────────────────
  const loadProposalTemplates = async () => {
    try { setProposalTemplates(await fetchProposalTemplates()); } catch { /* ignore */ }
  };
  useEffect(() => { void loadProposalTemplates(); }, []);

  const applyTemplate = (tpl: ApiProposalTemplate) => {
    if (!confirm(`Apply "${tpl.name}"? This replaces the current proposal's cover, sections, and settings.`)) return;
    const c: ProposalTemplateContent = tpl.content || {};
    setLetterhead(c.letterhead || "gt");
    setCustomLetterheadUrl(c.customLetterheadUrl || "");
    if (c.technical) {
      setCover({ ...emptyCover(), ...(c.cover || {}) });
      setCoverFinancial({ ...emptyCover(), ...(c.cover || {}), proposalTitle: "Financial Proposal" });
      setCoverLetter({ ...emptyCoverLetter(), ...(c.coverLetter || {}) });
      setTechnical({ ...emptyTechnical(), ...c.technical });
      setFinancial({ ...emptyFinancial(), ...(c.financial || {}) });
    } else {
      // Built-in scaffold: build sections + layout from the title list.
      const titles = c.sectionTitles || [];
      const sections = titles.map((t) => ({ id: uid(), heading: t, body: "" }));
      const layout: ProposalSectionMeta[] = [
        ...PROPOSAL_BUILTINS.map((b) => ({ id: `b-${b.kind}`, kind: b.kind, title: b.title, hidden: false })),
        ...sections.map((s) => ({ id: `m-${s.id}`, kind: "custom" as const, refId: s.id, title: s.heading, hidden: false })),
      ];
      setTechnical({ ...emptyTechnical(), sections, layout });
    }
    toast(`Applied template "${tpl.name}". Remember to Save Workspace.`, "success");
  };

  const handleSaveProposalTemplate = async () => {
    if (!propTplName.trim()) { toast("Enter a template name.", "error"); return; }
    try {
      const content: ProposalTemplateContent = { cover, coverLetter, letterhead, customLetterheadUrl, technical, financial };
      await saveProposalTemplate({ name: propTplName.trim(), description: propTplDesc.trim(), content });
      toast("Template saved.", "success");
      setSaveTplOpen(false); setPropTplName(""); setPropTplDesc("");
      await loadProposalTemplates();
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save template.", "error"); }
  };

  const handleDeleteProposalTemplate = async (tpl: ApiProposalTemplate) => {
    if (!confirm(`Delete template "${tpl.name}"?`)) return;
    try { await deleteProposalTemplate(tpl._id); toast("Template deleted.", "success"); await loadProposalTemplates(); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not delete template.", "error"); }
  };

  const downloadProposalWord = async (which: "technical" | "financial") => {
    if (!id) return;
    setProposalDownloading(`${which}-docx`);
    try { await downloadProposalDocx(id, which); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not build the Word file.", "error"); }
    finally { setProposalDownloading(null); }
  };

  // Assemble the proposal PDF blob — optionally merging the section's uploaded attachments.
  const buildProposalBlob = async (which: "technical" | "financial", withAttachments: boolean): Promise<Blob> => {
    if (!project || !id) throw new Error("Project not loaded.");
    const logoUrl = `${window.location.origin}/gt-usa-logo-new.png`;
    // CR-P (94) - generated pages and each section's uploaded files, in document order.
    // Built as a function of the page context, so the contents can carry page numbers (two passes).
    const makeParts = (ctx: PageCtx) => proposalParts({ kind: which, project, cover: which === "financial" ? coverFinancial : cover, coverLetter: which === "financial" ? coverLetterFinancial : coverLetter, backCover, letterhead, customLetterheadUrl, technical, financial, logoUrl, resumes: teamResumes, requirements }, ctx);
    const atts = withAttachments ? await fetchDocuments(id, which === "technical" ? "proposals-technical" : "proposals-financial") : [];
    // Item 104 / spec 6 - warn when a company document in the proposal has expired.
    {
      const expired = (which === "technical" ? technical.sections : financial.sections || []).flatMap((s) => s.attachments || [])
        .filter((a) => a.companyFileId && expiryInfo(companyDocs.find((d) => d._id === a.companyFileId)?.expiresAt).state === "expired");
      if (expired.length) toast(`Expired document${expired.length === 1 ? "" : "s"} in this proposal: ${expired.map((a) => a.name).join(", ")}. Replace ${expired.length === 1 ? "it" : "them"} before sending.`, "error");
      // Item 98 - a resume is two pages at most.
      if (which === "technical" && technical.printResumes !== false && teamResumes.length) {
        const counts = await Promise.all(teamResumes.map(async (r) => ({ name: r.name, n: await countResumePages(r.data.resume, r.data.user).catch(() => 0) })));
        const long = counts.filter((c) => c.n > RESUME_PAGE_LIMIT);
        if (long.length) toast(`Resume${long.length === 1 ? "" : "s"} over ${RESUME_PAGE_LIMIT} pages: ${long.map((c) => `${c.name} (${c.n})`).join(", ")}. Shorten ${long.length === 1 ? "it" : "them"} in the resume builder.`, "info");
      }
    }
    const { blob, skipped } = await assembleProposalParts(makeParts, atts);
    if (skipped.length) toast(`Attached but couldn't embed (not PDF/image): ${skipped.join(", ")}`, "info");
    // Step 9 - the RFP's page limit for this volume (spec: "page-limit issues").
    const limit = parseInt(String(which === "technical" ? rfp.pageLimitTechnical : rfp.pageLimitFinancial || ""), 10) || 0;
    if (limit > 0) {
      const n = (await PDFDocument.load(await blob.arrayBuffer())).getPageCount();
      if (n > limit) toast(`The ${which} proposal is ${n} pages; the RFP allows ${limit}. Check what the RFP counts: covers, contents and resumes are often excluded.`, "error");
    }
    return blob;
  };

  // The preview shows the assembled file (section uploads in place, page numbers), rebuilt each
  // time the preview opens.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!proposalPreview) { setPreviewUrl(null); return; }
    let alive = true;
    let made: string | null = null;
    setPreviewUrl(null);
    buildProposalBlob(proposalPreview, false)
      .then((b) => { if (!alive) return; made = URL.createObjectURL(b); setPreviewUrl(made); })
      .catch((e) => { if (alive) { toast(e instanceof Error ? e.message : "Could not build the preview.", "error"); setProposalPreview(null); } });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalPreview]);

  // Build & download the proposal PDF — optionally merging the section's uploaded attachments.
  const downloadProposal = async (which: "technical" | "financial", withAttachments: boolean) => {
    if (!project || !id) return;
    const key = `${which}-${withAttachments}`;
    setProposalDownloading(key);
    try {
      const blob = await buildProposalBlob(which, withAttachments);
      // CR 265 - saved as the document reads: "Project C - Technical Proposal.pdf".
      downloadBlob(blob, fileName([project.name, `${which === "technical" ? "Technical" : "Financial"} Proposal`], "pdf"));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not build the PDF.", "error");
    } finally {
      setProposalDownloading(null);
    }
  };


  // Edit Project Identity modal (owner only)
  type IdentityForm = {
    name: string; clientName: string; status: string; category: string; categories: string[]; contractType: string; cpars: string; siteAddress: SiteAddress;
    description: string; reportNotes: string; fiscal: string; compliance: string; value: string;
    startDate: string; endDate: string; progress: number;
    disciplines: string; contractNo: string; contractYear: string; contractDate: string;
    // CR 289 - the solicitation number, and the Directory company the client was picked from.
    solicitationNo: string; clientCompanyId: string;
  };
  const [showEditIdentity, setShowEditIdentity] = useState(false);
  const [identityForm, setIdentityForm] = useState<IdentityForm>({
    name: "", clientName: "", status: "Planning", category: "", categories: [], contractType: "", cpars: "", siteAddress: EMPTY_SITE_ADDRESS,
    description: "", reportNotes: "", fiscal: "", compliance: "", value: "",
    startDate: "", endDate: "", progress: 0, disciplines: "", contractNo: "", contractYear: "", contractDate: "",
    solicitationNo: "", clientCompanyId: "",
  });
  const [identitySaving, setIdentitySaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [contractUploading, setContractUploading] = useState(false);
  // The signed contract lives on the project itself (one per project) — saved immediately,
  // not via Save Workspace, so the file can't be lost.
  const handleContractUpload = async (file: File) => {
    if (!id) return;
    setContractUploading(true);
    try { setProject(await uploadProjectContract(id, file)); toast("Contract uploaded.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
    finally { setContractUploading(false); }
  };
  const handleContractRemove = async () => {
    if (!id) return;
    if (!confirm("Remove the signed contract from this project? The file is deleted.")) return;
    try { setProject(await deleteProjectContract(id)); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not remove the contract.", "error"); }
  };
  const [jvLogoUploading, setJvLogoUploading] = useState(false);
  const [jvImgUploading, setJvImgUploading] = useState<"stamps" | "signatures" | null>(null);

  const openEditIdentity = () => {
    if (!project) return;
    setIdentityForm({
      name: project.name || "",
      clientName: project.clientInfo?.name || "",
      solicitationNo: project.solicitationNo || "",
      clientCompanyId: project.clientInfo?.companyId || "",
      status: project.status || "Planning",
      category: project.category || "",
      categories: projectCategories(project),
      contractType: project.contractType || "",
      cpars: project.cpars || "",
      siteAddress: {
        full: project.siteAddress?.full || "",
        line1: project.siteAddress?.line1 || "",
        city: project.siteAddress?.city || "",
        state: project.siteAddress?.state || "",
        postalCode: project.siteAddress?.postalCode || "",
        country: project.siteAddress?.country || "",
      },
      description: project.description || "",
      reportNotes: project.reportNotes || "",
      fiscal: project.fiscal || "",
      compliance: project.compliance || "",
      value: project.value || "",
      startDate: project.startDate || "",
      endDate: project.endDate || "",
      progress: project.progress ?? 0,
      disciplines: (project.disciplines || []).join(", "),
      contractNo: project.contractNo || "",
      contractYear: project.contractYear || "",
      contractDate: project.contractDate || "",
    });
    // The JV editor writes straight into the shared jvInfo state, so snapshot it — Cancel must
    // discard partner edits (including removed stamps/signatures) just like the other fields.
    jvSnapshot.current = JSON.parse(JSON.stringify(jvInfo)) as JVInfo;
    setShowEditIdentity(true);
  };
  const jvSnapshot = useRef<JVInfo | null>(null);
  const cancelEditIdentity = () => {
    if (jvSnapshot.current) setJvInfo(jvSnapshot.current);
    jvSnapshot.current = null;
    setShowEditIdentity(false);
  };

  const handleSaveIdentity = async () => {
    if (!id || !project) return;
    setIdentitySaving(true);
    try {
      const updated = await updateProject(id, {
        name: identityForm.name,
        // A renamed client is no longer the Directory company it was picked from (CR-P 127).
        clientInfo: { ...project.clientInfo, name: identityForm.clientName, companyId: identityForm.clientCompanyId },
        solicitationNo: identityForm.solicitationNo,
        status: identityForm.status as ApiProject["status"],
        category: identityForm.categories[0] || "",
        categories: identityForm.categories,
        contractType: identityForm.contractType,
        cpars: identityForm.cpars,
        location: shortLocation(identityForm.siteAddress, project.location),
        siteAddress: identityForm.siteAddress,
        description: identityForm.description,
        reportNotes: identityForm.reportNotes,
        fiscal: identityForm.fiscal,
        compliance: identityForm.compliance,
        value: identityForm.value,
        startDate: identityForm.startDate,
        endDate: identityForm.endDate,
        // With milestones set up, the progress is counted from them (CR-P 123) and not typed here.
        progress: project.schedule?.milestones?.length ? project.progress : Number(identityForm.progress) || 0,
        disciplines: identityForm.disciplines.split(",").map((d) => d.trim()).filter(Boolean),
        contractNo: identityForm.contractNo,
        contractYear: identityForm.contractYear,
        contractDate: identityForm.contractDate,
        jointVenture: jvInfo, // §M — JV now lives in Project Identity
      });
      setProject(updated);
      setClientInfo((prev) => ({ ...prev, name: identityForm.clientName, companyId: identityForm.clientCompanyId }));
      toast("Project identity updated.", "success");
      jvSnapshot.current = null; // saved — nothing to revert to
      setShowEditIdentity(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed.", "error");
    } finally {
      setIdentitySaving(false);
    }
  };

  // §M — upload the JV partner logo as a file (stored URL goes into jvInfo.logo).
  const handleJvLogoUpload = async (file: File, field: "logo" | "combinedLogo" = "logo") => {
    if (!id) return;
    if (file.size > 8 * 1024 * 1024) { toast("Logo must be under 8 MB.", "error"); return; }
    setJvLogoUploading(true);
    try { const { url } = await uploadProposalAsset(id, file); updateJv(field, url); toast(`${field === "logo" ? "Partner logo" : "JV combined logo"} uploaded. Remember to save.`, "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
    finally { setJvLogoUploading(false); }
  };
  // Upload a partner stamp or signature image onto the partner profile (picked from the PO).
  const handleJvImageUpload = async (file: File, kind: "stamps" | "signatures") => {
    if (!id) return;
    if (file.size > 8 * 1024 * 1024) { toast("Image must be under 8 MB.", "error"); return; }
    setJvImgUploading(kind);
    try {
      const { url } = await uploadProposalAsset(id, file);
      setJvInfo((prev) => ({ ...prev, [kind]: [...prev[kind], { name: file.name.replace(/\.[^.]+$/, ""), url }] }));
      setDirty(true);
      toast(`Partner ${kind === "stamps" ? "stamp" : "signature"} uploaded — remember to save.`, "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
    finally { setJvImgUploading(null); }
  };
  const handleProjectImageUpload = async (file: File) => {
    if (!id) return;
    if (file.size > 8 * 1024 * 1024) {
      toast("Image must be under 8 MB.", "error");
      return;
    }
    setImageUploading(true);
    try {
      const updated = await uploadProjectImage(id, file);
      setProject(updated);
      toast("Project image updated.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed.", "error");
    } finally {
      setImageUploading(false);
    }
  };

  const handleExport = async () => {
    if (!id) return;
    setExporting(true);
    try {
      await downloadProjectExport(id);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed.", "error");
    } finally {
      setExporting(false);
    }
  };

  // Subcontractors
  type SubContractor = { name: string; scope: string; subId: string; contact: string; email: string; phone: string; notes: string; invoiceAmount: string; userId: string; acceptedOfferId?: string; customTabs?: Array<{ tabId: string; label: string; parentId: string; notes: string }> };
  const [subcontractors, setSubcontractors] = useState<SubContractor[]>([]);
  const [subDocs, setSubDocs] = useState<Record<string, ApiDocument[]>>({});
  const [subInvoiceDocs, setSubInvoiceDocs] = useState<Record<string, ApiDocument[]>>({});
  const [editingSubIdx, setEditingSubIdx] = useState<number | null>(null);
  const [subForm, setSubForm] = useState<SubContractor>({ name: "", scope: "", subId: "", contact: "", email: "", phone: "", notes: "", invoiceAmount: "", userId: "" });
  const [showSubModal, setShowSubModal] = useState(false);
  // Subs & Employees tab: "employees" | "subcontractors", plus which subcontractor is open.
  const [subsSubTab, setSubsSubTab] = useState<"employees" | "subcontractors" | "partners" | "vendors">("employees");
  // Vendors (shared with the RFQ tab) — listed here so each vendor record can hold agreements.
  const [projVendors, setProjVendors] = useState<ApiVendor[]>([]);
  const [activeVendorId, setActiveVendorId] = useState<string | null>(null);
  const [newVendorName, setNewVendorName] = useState("");
  const [editVendorOpen, setEditVendorOpen] = useState(false); // CR-P-05 — vendor edit modal
  // CR-P-05 — add a vendor straight from the project (same shared supplier list as RFQ → Vendors).
  const addNewVendor = async () => {
    const name = newVendorName.trim();
    if (!name || !id) return;
    try {
      const v = await addVendor(id, { name });
      setProjVendors((p) => [...p, v]);
      setActiveVendorId(v._id);
      setNewVendorName("");
    } catch { /* ignore — surfaced by the empty state otherwise */ }
  };
  // CR-P-43 — add a project vendor chosen from the Directory (prefills the shared vendor record).
  const addVendorFromCompany = async (c: ApiCompany) => {
    if (!id) return;
    if (projVendors.some((v) => (v.name || "").trim().toLowerCase() === c.name.trim().toLowerCase())) { setNewVendorName(""); toast("That vendor is already on this project.", "error"); return; }
    try {
      const v = await addVendor(id, { name: c.name, contactName: c.contactPersons?.[0]?.name || "", email: c.email || c.contactPersons?.[0]?.email || "", phone: c.phone || c.contactPersons?.[0]?.phone || "" });
      setProjVendors((p) => [...p, v]);
      setActiveVendorId(v._id);
      setNewVendorName("");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not add vendor.", "error"); }
  };
  // CR-P-05 — edit a vendor's details in-place (the SAME shared record used in Procurement → RFQs).
  const patchVendorLocal = (vid: string, field: keyof ApiVendor, value: string) =>
    setProjVendors((p) => p.map((v) => (v._id === vid ? { ...v, [field]: value } : v)));
  const saveVendorField = (vid: string, field: keyof ApiVendor, value: string) => {
    if (!id) return;
    updateVendor(id, vid, { [field]: value } as Partial<ApiVendor>).catch((e) => toast(e instanceof Error ? e.message : "Could not save vendor.", "error"));
  };
  // CR-P (80) — a vendor's project login, matched by the vendor's email (like the JV partner's).
  const vendorGuest = (v: ApiVendor) =>
    (v.email ? guestsList.find((g) => g.email && g.email.toLowerCase() === (v.email || "").toLowerCase()) : undefined);
  const removeVendor = async (v: ApiVendor) => {
    if (!id) return;
    // CR-P (79)/(80) — the same question as removing someone from the team.
    if (!(await brandedConfirm({ title: "Are you sure you want to remove it?", message: `"${v.name || "vendor"}" is removed from this project's vendor list (Procurement → RFQs uses the same list) and its login loses access to this project. RFQs and POs already sent keep their copy.`, confirmLabel: "Remove", cancelLabel: "Cancel", danger: true }))) return;
    try {
      const g = vendorGuest(v);
      if (g) { await removeGuest(id, g.userId).catch(() => undefined); refreshGuests(); }
      await deleteVendor(id, v._id);
      setProjVendors((p) => { const next = p.filter((x) => x._id !== v._id); setActiveVendorId((cur) => (cur === v._id ? next[0]?._id || null : cur)); return next; });
      toast("Vendor removed.", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not remove the vendor.", "error"); }
  };
  useEffect(() => {
    if (subsSubTab !== "vendors" || !id) return;
    fetchVendors(id).then((v) => { setProjVendors(v); setActiveVendorId((cur) => cur && v.some((x) => x._id === cur) ? cur : v[0]?._id || null); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsSubTab, id]);
  const [activeSubIdx, setActiveSubIdx] = useState(0);
  // Per-subcontractor inner tabs (info / agreement / invoices / expenses / custom-<tabId>).
  const [subInnerTab, setSubInnerTab] = useState<string>("info");
  const [subCustomSub, setSubCustomSub] = useState<string>(""); // active sub-tab within a custom main tab
  const [subInvoices, setSubInvoices] = useState<ApiSubInvoice[]>([]); // all invoice rows for this project
  const [sentInvoices, setSentInvoices] = useState<ApiInvoice[]>([]);
  // CR-P (160) — invoices received: what is still owed counts as a payable in the expenses.
  const [receivedInvoices, setReceivedInvoices] = useState<ApiInvoice[]>([]); // "Invoice Sent" builder invoices (feed project income, CR-I-06/09)
  // When granting access from a subcontractor's tab, remember which one so we can link the login.
  const [grantingForSubIdx, setGrantingForSubIdx] = useState<number | null>(null);
  // The access modal is shared with the Partners tab — this flips its copy to say "Partner".
  const [grantingPartner, setGrantingPartner] = useState(false);
  // CR-P (80) — and to say "Vendor" when a vendor's login is being given access.
  const [grantingVendor, setGrantingVendor] = useState(false);
  const guestNoun = grantingPartner ? "Partner" : grantingVendor ? "Vendor" : "Subcontractor";
  const guestNounLc = guestNoun.toLowerCase();

  // Live financials for the Project Report PDF — income from subcontractor invoice
  // amounts, expenses from the Expenses tab. Declared after the states it reads.
  /**
   * CR 286 - gather what the ticked sections need before the preview opens: the client as the
   * Directory holds them (logo included, turned into a data URL so the PDF never waits on a
   * request), and this project's vendors.
   */
  const buildReport = async () => {
    if (!project) return;
    setReportBusy(true);
    try {
      const ci = project.clientInfo;
      const next: ReportClient = {
        name: ci?.name || "", contactName: ci?.contactName || "", email: ci?.email || "",
        phone: ci?.phone || "", address: ci?.address || "", location: ci?.country || "",
        reference: ci?.reference || "", notes: ci?.notes || "",
      };
      if (reportInclude.clientInfo !== false && ci?.companyId) {
        try {
          const c = await fetchCompany(ci.companyId);
          const cp = c.contactPersons?.[0];
          next.name = c.name || next.name;
          next.clientType = companyCategories(c).join(", ");
          next.contactName = cp?.name || next.contactName;
          next.role = cp?.role || "";
          next.email = c.email || cp?.email || next.email;
          next.phone = c.phone || cp?.phone || next.phone;
          next.address = c.address || next.address;
          next.website = c.website || "";
          // A logo that cannot be read is simply left out; it must never stop the report.
          if (c.logoUrl) {
            try { next.logo = await logoAsPng(withFileToken(c.logoUrl)); } catch { /* no logo in the report */ }
          }
        } catch { /* the saved client details stand */ }
      }
      setReportClient(next);
      if (reportInclude.vendors !== false && id) {
        try {
          const v = await fetchVendors(id);
          setReportVendors(v.map((x) => ({ name: x.name, contactName: x.contactName, email: x.email, phone: x.phone, city: x.city, country: x.country })));
        } catch { setReportVendors([]); }
      } else setReportVendors([]);
      try { localStorage.setItem("gt-report-sections", JSON.stringify(reportInclude)); } catch { /* ignore */ }
      setReportPick(false);
      setShowReport(true);
    } finally { setReportBusy(false); }
  };

  const reportFinancials = (() => {
    const n = (s: string) => parseFloat(String(s).replace(/[^0-9.-]/g, "")) || 0;
    const expenses = expenseRows.reduce((sum, e) => sum + (n(e.qty) || 1) * n(e.amount), 0);
    // Income = legacy subcontractor invoice tables + "Invoice Sent" builder invoices (CR-I-06/09).
    // Draft/Cancelled/Rejected sent invoices are not billed revenue (mirrors the backend endpoint).
    const NON_REVENUE = ["Draft", "Cancelled", "Canceled", "Rejected"];
    const income =
      subInvoices.reduce((sum, inv) => sum + n(inv.amount), 0) +
      sentInvoices.filter((inv) => !NON_REVENUE.includes(inv.status || "")).reduce((sum, inv) => sum + n(inv.amount), 0);
    return { income, expenses };
  })();

  // CR-P-15 — the 5-number financial overview shown on the project header + Expenses tab.
  const projectFive = fiveFromRaw(expenseRows, sentInvoices, receivedInvoices);

  const refreshSubDocs = async () => {
    if (!id) return;
    try {
      const docs = await fetchDocuments(id);
      const grouped: Record<string, ApiDocument[]> = {};
      const invoices: Record<string, ApiDocument[]> = {};
      for (const d of docs) {
        if (d.section?.startsWith("subinvoice-")) {
          const subId = d.section.slice("subinvoice-".length);
          (invoices[subId] = invoices[subId] || []).push(d);
        } else if (d.section?.startsWith("subcontractor-")) {
          const subId = d.section.slice("subcontractor-".length);
          (grouped[subId] = grouped[subId] || []).push(d);
        }
      }
      setSubDocs(grouped);
      setSubInvoiceDocs(invoices);
    } catch {
      /* ignore */
    }
  };

  const openAddSub = () => {
    setEditingSubIdx(null);
    setSubForm({ name: "", scope: "", subId: `SUB-${String(Date.now()).slice(-4)}`, contact: "", email: "", phone: "", notes: "", invoiceAmount: "", userId: "" });
    setShowSubModal(true);
  };

  const openEditSub = (idx: number) => {
    setEditingSubIdx(idx);
    setSubForm({ ...subcontractors[idx] });
    setShowSubModal(true);
  };

  const handleSaveSub = () => {
    if (!subForm.name.trim()) return;
    if (editingSubIdx !== null) {
      setSubcontractors((prev) => prev.map((s, i) => (i === editingSubIdx ? { ...subForm } : s)));
    } else {
      // CR-P (80) — the same flow as the employees: picked from the Directory, then straight on to
      // which tabs its login can see (every tab starts Hidden). No email means no login yet, so
      // that step waits until one is added.
      const idx = subcontractors.length;
      const added = { ...subForm };
      setSubcontractors((prev) => [...prev, added]);
      setActiveSubIdx(idx);
      if (isOwner && added.email.trim()) void openGrantAccessFor(idx, added);
    }
    setShowSubModal(false);
    setEditingSubIdx(null);
  };

  // CR-P (79)/(80) — "are you sure you want to remove it?", and removing a subcontractor also takes
  // away its login's access to this project (the same rule as removing an employee, CR-P (81)).
  const handleDeleteSub = async (idx: number) => {
    const sub = subcontractors[idx];
    if (!sub) return;
    if (!(await brandedConfirm({
      title: "Are you sure you want to remove it?",
      message: `"${sub.name}" is removed from this project, with its files here, and its login loses access to this project.`,
      confirmLabel: "Remove",
      danger: true,
    }))) return;
    const linked = (sub.userId ? guestsList.find((g) => g.userId === sub.userId) : undefined)
      || (sub.email ? guestsList.find((g) => g.email && g.email.toLowerCase() === sub.email.toLowerCase()) : undefined);
    if (linked && id) { try { await removeGuest(id, linked.userId); refreshGuests(); } catch { /* the record still goes */ } }
    // Delete agreements first
    const docs = subDocs[sub.subId] || [];
    for (const d of docs) {
      try { if (id) await deleteDocument(id, d._id); } catch { /* ignore */ }
    }
    setSubcontractors((prev) => prev.filter((_, i) => i !== idx));
    setSubDocs((prev) => {
      const copy = { ...prev };
      delete copy[sub.subId];
      return copy;
    });
  };

  // CR-P (69) — the "sub agreement bundle" flow (create a named bundle, attach agreement / offer /
  // other files) is gone. It was a second, weaker agreement system sitting next to the real builder
  // on the same tab. Agreements are created in AgreementsPanel and their files attach to sections.

  // CR-P (69) — the subcontractor "offers" upload / accept handlers that lived here went with the
  // bundle flow: nothing rendered them any more.

  // Subcontractor invoice: a dedicated upload section + an amount field that feeds project income.
  const handleUploadSubInvoice = async (subId: string, file: File) => {
    if (!id) return;
    try {
      await uploadDocument(id, file, `subinvoice-${subId}`);
      await refreshSubDocs();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed.", "error");
    }
  };
  const handleDeleteSubInvoice = async (docId: string) => {
    if (!id) return;
    if (!confirm("Delete this invoice file?")) return;
    try {
      await deleteDocument(id, docId);
      await refreshSubDocs();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    }
  };
  const updateSubInvoiceAmount = (idx: number, value: string) =>
    setSubcontractors((prev) => prev.map((s, i) => (i === idx ? { ...s, invoiceAmount: value } : s)));
  const persistSubcontractors = async () => {
    if (!id) return;
    try { await updateProject(id, { subcontractors } as Partial<ApiProject>); } catch { /* ignore */ }
  };
  // Set + persist the subcontractors array in one step (avoids stale-closure saves).
  const persistSubs = async (next: SubContractor[]) => {
    setSubcontractors(next);
    if (id) { try { await updateProject(id, { subcontractors: next } as Partial<ApiProject>); } catch { /* ignore */ } }
  };

  // ── Partner custom sub-tabs (About Partners) — custom tabs + custom fields, persisted at once ──
  const persistPartnerTabs = async (next: PartnerTab[]) => {
    setPartnerTabs(next);
    if (id) { try { await updateProject(id, { partnerTabs: next } as Partial<ApiProject>); } catch { /* ignore */ } }
  };
  const addPartnerTab = () => {
    const tabId = `ptab-${Date.now()}`;
    const next = [...partnerTabs, { tabId, label: "New tab", notes: "", fields: [] }];
    void persistPartnerTabs(next); setActivePartnerTab(tabId);
  };
  const renamePartnerTab = (tabId: string, label: string) => void persistPartnerTabs(partnerTabs.map((t) => t.tabId === tabId ? { ...t, label } : t));
  const removePartnerTab = (tabId: string) => {
    if (!confirm("Delete this partner tab and its custom fields?")) return;
    const next = partnerTabs.filter((t) => t.tabId !== tabId);
    void persistPartnerTabs(next);
    if (activePartnerTab === tabId) setActivePartnerTab(next[0]?.tabId || "");
  };
  const addPartnerField = (tabId: string) => void persistPartnerTabs(partnerTabs.map((t) => t.tabId === tabId ? { ...t, fields: [...t.fields, { fieldId: `pf-${Date.now()}`, label: "New field", type: "text" as FieldType, value: "", options: [] }] } : t));
  const updatePartnerField = (tabId: string, fieldId: string, patch: Partial<PartnerField>) => setPartnerTabs((prev) => prev.map((t) => t.tabId === tabId ? { ...t, fields: t.fields.map((f) => f.fieldId === fieldId ? { ...f, ...patch } : f) } : t));
  const savePartnerTabs = () => { if (id) updateProject(id, { partnerTabs } as Partial<ApiProject>).catch(() => {}); };
  const removePartnerField = (tabId: string, fieldId: string) => void persistPartnerTabs(partnerTabs.map((t) => t.tabId === tabId ? { ...t, fields: t.fields.filter((f) => f.fieldId !== fieldId) } : t));

  // ── Subcontractor invoice table (per-row, like expenses) ─────────────────────
  const addSubInvoiceRow = async (subId: string) => {
    if (!id) return;
    try { const row = await addSubInvoice(id, { subId }); setSubInvoices((p) => [...p, row]); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not add invoice.", "error"); }
  };
  const editSubInvoiceCell = (iid: string, field: "description" | "amount" | "remarks" | "date" | "approval", value: string) =>
    setSubInvoices((p) => p.map((r) => (r._id === iid ? { ...r, [field]: value } : r)));
  const saveSubInvoiceCell = (iid: string, field: string, value: string) => { if (id) updateSubInvoice(id, iid, { [field]: value }).catch(() => {}); };
  const setSubInvoiceApproval = (iid: string, value: string) => { editSubInvoiceCell(iid, "approval", value); saveSubInvoiceCell(iid, "approval", value); };
  const removeSubInvoiceRow = async (iid: string) => {
    if (!id || !confirm("Delete this invoice row?")) return;
    try { await deleteSubInvoice(id, iid); setSubInvoices((p) => p.filter((r) => r._id !== iid)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  const uploadSubInvoiceAtt = async (iid: string, file: File) => {
    if (!id) return;
    try { const row = await uploadSubInvoiceAttachment(id, iid, file); setSubInvoices((p) => p.map((r) => (r._id === iid ? row : r))); }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
  };
  const removeSubInvoiceAtt = async (iid: string, aid: string) => {
    if (!id) return;
    try { const row = await deleteSubInvoiceAttachment(id, iid, aid); setSubInvoices((p) => p.map((r) => (r._id === iid ? row : r))); }
    catch { /* ignore */ }
  };

  // ── Per-subcontractor custom tabs (files + notes, with sub-tabs) ─────────────
  const addSubCustomTab = (subIdx: number, parentId = "") => {
    const tabId = `sct-${uid()}`;
    const next = subcontractors.map((s, i) => i === subIdx
      ? { ...s, customTabs: [...(s.customTabs || []), { tabId, label: parentId ? "New sub-tab" : "New tab", parentId, notes: "" }] }
      : s);
    void persistSubs(next);
    if (!parentId) { setSubInnerTab(`custom-${tabId}`); setSubCustomSub(""); } else { setSubCustomSub(tabId); }
  };
  const renameSubCustomTab = (subIdx: number, tabId: string, label: string) =>
    setSubcontractors((prev) => prev.map((s, i) => i === subIdx ? { ...s, customTabs: (s.customTabs || []).map((t) => (t.tabId === tabId ? { ...t, label } : t)) } : s));
  const setSubCustomNotes = (subIdx: number, tabId: string, notes: string) =>
    setSubcontractors((prev) => prev.map((s, i) => i === subIdx ? { ...s, customTabs: (s.customTabs || []).map((t) => (t.tabId === tabId ? { ...t, notes } : t)) } : s));
  const deleteSubCustomTab = (subIdx: number, tabId: string) => {
    const tab = (subcontractors[subIdx]?.customTabs || []).find((t) => t.tabId === tabId);
    const isMain = !tab?.parentId;
    if (!confirm(isMain ? "Delete this tab and its sub-tabs?" : "Delete this sub-tab?")) return;
    const next = subcontractors.map((s, i) => i === subIdx
      ? { ...s, customTabs: (s.customTabs || []).filter((t) => t.tabId !== tabId && t.parentId !== tabId) }
      : s);
    void persistSubs(next);
    if (isMain) setSubInnerTab("info"); else setSubCustomSub("");
  };

  // Procurement Log
  const [procurementRows, setProcurementRows] = useState<ApiProcurementRow[]>([]);

  const refreshProcurement = async () => {
    if (!id) return;
    try {
      const rows = await fetchProcurementRows(id);
      setProcurementRows(rows);
    } catch {
      /* ignore */
    }
  };

  const handleAddProcurementRow = async () => {
    if (!id) return;
    try {
      const nextNo = String(procurementRows.length + 1);
      const row = await createProcurementRow(id, { itemNo: nextNo, submittal: "Not Required", currency: "USD" });
      setProcurementRows((prev) => [...prev, row]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add row.", "error");
    }
  };

  const handleUpdateProcurementCell = async (rid: string, field: keyof ApiProcurementRow, value: string) => {
    setProcurementRows((prev) => prev.map((r) => (r._id === rid ? { ...r, [field]: value } : r)));
    if (!id) return;
    try {
      await updateProcurementRow(id, rid, { [field]: value } as Partial<ApiProcurementRow>);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    }
  };

  const handleDeleteProcurementRow = async (rid: string) => {
    if (!id) return;
    if (!confirm("Delete this row?")) return;
    try {
      await deleteProcurementRow(id, rid);
      setProcurementRows((prev) => prev.filter((r) => r._id !== rid));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    }
  };

  const exportProcurementCsv = () => {
    if (procurementRows.length === 0) {
      alert("No rows to export.");
      return;
    }
    const headers = [
      "Item #", "Item Description", "Submittal", "Status", "Recommended Brand/Supplier",
      "QTY", "Unit", "Total", "Currency", "Order Date", "Payment", "Paid By", "Remarks",
    ];
    const escape = (v: string) => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [
      headers.join(","),
      ...procurementRows.map((r) =>
        [r.itemNo, r.description, r.submittal, r.status, r.recommendedBrand, r.qty, r.unit, r.total, r.currency, r.orderDate, r.payment, r.paidBy, r.remarks].map(escape).join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name || "procurement"}-log.csv`.replace(/\s+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  };

  const refreshTemplates = () => fetchTemplates().then(setTemplates).catch(() => undefined);
  // Recording/removing an invoice payment posts or removes an Expense — pull the tab back in sync.
  const refreshExpenses = () => { if (id) fetchExpenses(id).then(setExpenseRows).catch(() => {}); };

  const handleSaveTemplate = async (tabId: string) => {
    if (!saveTemplateName.trim()) return;
    const tab = customTabs.find((t) => t.id === tabId);
    if (!tab) return;
    const children = customTabs.filter((t) => t.parentId === tabId);
    try {
      const stripValues = (fs: CustomField[] | undefined) =>
        (fs || []).map((f) => ({ label: f.label, type: f.type, options: f.options || [] }));
      await createTemplate({
        name: saveTemplateName.trim(),
        description: saveTemplateDesc.trim(),
        tabs: [{
          label: tab.label,
          color: tab.color || "",
          notes: tab.notes || "",
          fields: stripValues(tab.fields),
          children: children.map((c) => ({
            label: c.label,
            color: c.color || "",
            notes: c.notes || "",
            fields: stripValues(c.fields),
          })),
        }],
      });
      setShowSaveTemplate(null);
      setSaveTemplateName("");
      setSaveTemplateDesc("");
      await refreshTemplates();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save template.", "error");
    }
  };

  const handleDeleteTemplate = async (tplId: string) => {
    if (!confirm("Delete this template?")) return;
    try {
      await deleteTemplate(tplId);
      await refreshTemplates();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    }
  };

  // ── Edit Template (fields of the saved template) ─────────────────────────────
  const openEditTemplate = (tpl: ApiTemplate) => {
    setEditingTemplate(tpl);
    setTplName(tpl.name);
    setTplDesc(tpl.description || "");
    // A template is one tab; surface its saved fields for editing.
    const primary = tpl.tabs?.[0];
    setTplFields((primary?.fields || []).map((f, i) => ({
      fieldId: `tf-${i}-${f.label}`,
      label: f.label || "",
      type: (f.type as FieldType) || "text",
      options: f.options || [],
      value: "",
    })));
  };

  const closeEditTemplate = () => {
    setEditingTemplate(null);
    setTplName("");
    setTplDesc("");
    setTplFields([]);
  };

  const addTplField = () =>
    setTplFields((prev) => [
      ...prev,
      { fieldId: `tf-${Date.now()}-${prev.length}`, label: "", type: "text", options: [], value: "" },
    ]);
  const updateTplField = (idx: number, patch: Partial<CustomField>) =>
    setTplFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  const removeTplField = (idx: number) =>
    setTplFields((prev) => prev.filter((_, i) => i !== idx));

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;
    if (!tplName.trim()) { toast("Template name is required.", "error"); return; }
    if (tplFields.some((f) => !f.label.trim())) { toast("Every field needs a label.", "error"); return; }
    setTplSaving(true);
    try {
      // Preserve the template's tab structure; only replace the primary tab's fields.
      const baseTabs = JSON.parse(JSON.stringify(editingTemplate.tabs || [])) as ApiTemplate["tabs"];
      const cleanedFields = tplFields.map((f) => ({
        label: f.label.trim(),
        type: f.type,
        options: f.type === "select" ? (f.options || []) : [],
      }));
      if (baseTabs.length === 0) {
        baseTabs.push({ label: tplName.trim(), color: "", notes: "", fields: cleanedFields, children: [] });
      } else {
        baseTabs[0].fields = cleanedFields;
      }
      await updateTemplate(editingTemplate._id, {
        name: tplName.trim(),
        description: tplDesc.trim(),
        tabs: baseTabs,
      });
      await refreshTemplates();
      toast("Template updated.", "success");
      closeEditTemplate();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update template.", "error");
    } finally {
      setTplSaving(false);
    }
  };

  // ── Guest management (owner only) ────────────────────────────────────────────
  const refreshGuests = () => { if (id) fetchGuests(id).then(setGuestsList).catch(() => setGuestsList([])); };

  const openCreateGuest = async () => {
    setEditingGuest(null);
    setGName(""); setGEmail(""); setGPassword(""); setGExistingId(null);
    // CR-P (77)/(80) — every tab starts Hidden: nothing is visible until the owner allows it.
    const initialPerms: Record<string, "none" | "view" | "edit"> = {};
    permTabsAll.forEach((t) => { initialPerms[t.id] = "none"; });
    setGPerms(initialPerms); setGAlsoProjects([]); setGExpiry(""); setGuestStep(1);
    setGFigures(false);   // an outside login does not see the financial figures unless switched on
    setGrantingForSubIdx(null); setGrantingPartner(false); setGrantingVendor(false);
    setShowGuestModal(true);
    // Load the owner's other projects (for "also assign") and the reusable guest list.
    try {
      const mine = await fetchProjects("mine");
      const cu = getAuthUser();
      setOwnerProjects(mine.filter((p) => p.ownerId === cu?.id && p.id !== id));
    } catch { setOwnerProjects([]); }
    try {
      const dir = await fetchGuestDirectory();
      // Exclude guests already on THIS project.
      const here = new Set(guestsList.map((g) => g.userId));
      setGuestDirectory(dir.filter((d) => !here.has(d.userId)));
    } catch { setGuestDirectory([]); }
  };

  // Open the access wizard pre-filled for a specific subcontractor record (and link on save).
  const openGrantAccessFor = async (idx: number, sub: SubContractor) => {
    await openCreateGuest();
    setGExistingId(null);
    setGName(sub.name || "");
    setGEmail(sub.email || "");
    setGrantingForSubIdx(idx);
  };

  // CR-P (80) — a vendor's login gets project access through the same wizard (tabs start Hidden).
  // The login is matched back to the vendor by its email, like the JV partner's.
  const openGrantAccessForVendor = async (v: ApiVendor) => {
    await openCreateGuest();
    setGExistingId(null);
    setGName(v.name || "");
    setGEmail(v.email || "");
    setGrantingVendor(true);
  };

  // Grant the JV PARTNER a login — reuses the subcontractor guest system, but pre-granted FULL
  // access to every project tab (partners can see everything).
  const openPartnerAccess = async () => {
    await openCreateGuest();
    setGExistingId(null);
    setGName(jvInfo.partnerName || jvInfo.contactName || "");
    setGEmail(jvInfo.email || "");
    const full: Record<string, "none" | "view" | "edit"> = {};
    permTabsAll.forEach((t) => { full[t.id] = "edit"; });
    setGPerms(full);
    setGrantingPartner(true);
    setGuestStep(2);
  };
  // The guest login linked to this project's JV partner (matched by the partner's email).
  const partnerGuest = jvInfo.email ? guestsList.find((g) => g.email && g.email.toLowerCase() === jvInfo.email.toLowerCase()) : undefined;
  const removePartnerAccess = async (g: ApiGuest) => {
    if (!id) return;
    if (!(await brandedConfirm({ title: "Are you sure you want to remove it?", message: `${g.name || g.email} loses their partner login to this project. Their records stay.`, confirmLabel: "Remove", danger: true }))) return;
    try { await removeGuest(id, g.userId); await refreshGuests(); toast("Partner access removed.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Failed to remove access.", "error"); }
  };

  // Revoke a subcontractor's login and unlink it from the record.
  const removeSubAccess = async (idx: number, g: ApiGuest) => {
    if (!id) return;
    if (!(await brandedConfirm({ title: "Are you sure you want to remove it?", message: `${g.name || g.email} loses their login access to this project. Their records stay.`, confirmLabel: "Remove", danger: true }))) return;
    try {
      await removeGuest(id, g.userId);
      const next = subcontractors.map((s, i) => (i === idx ? { ...s, userId: "" } : s));
      setSubcontractors(next);
      await updateProject(id, { subcontractors: next } as Partial<ApiProject>);
      await refreshGuests();
      toast("Access removed.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to remove access.", "error");
    }
  };

  // Pick an existing guest to reuse — prefill their identity, password not required.
  const selectExistingGuest = (g: { userId: string; name: string; email: string }) => {
    setGExistingId(g.userId);
    setGName(g.name); setGEmail(g.email); setGPassword("");
  };
  const clearExistingGuest = () => {
    setGExistingId(null);
    setGName(""); setGEmail(""); setGPassword("");
  };

  const closeEmpPicker = () => { setEmpPickerOpen(false); setEmpAssignStep(1); setEmpAssignPerms({}); setEmpPicked([]); setEmpAssignFigures(true); };
  // CR-P (76)/(77) — assign the ticked employees in one go: pick them, choose the tabs they get
  // (every tab Hidden until allowed), Save. Each person's tab grant is written BEFORE they join the
  // project, so a newly assigned employee never has a moment of full access.
  const assignPickedEmployees = async () => {
    if (!id || !empPicked.length) { closeEmpPicker(); return; }
    const people = empPicked.map((e) => employeePool.find((x) => x.empId === e)).filter((p): p is (typeof employeePool)[number] => !!p);
    // Tab access rides on the person's login; without an email there is nothing to attach it to,
    // and they would silently get the whole project.
    const noEmail = people.filter((p) => !p.email);
    if (noEmail.length) {
      toast(`${noEmail.map((p) => p.name).join(", ")} ${noEmail.length === 1 ? "has" : "have"} no email on their account, so their tab access cannot be set. Add an email in Users first.`, "error");
      return;
    }
    const perms: Record<string, "view" | "edit"> = {};
    for (const [tab, v] of Object.entries(empAssignPerms)) if (v === "view" || v === "edit") perms[tab] = v;
    setEmpAssignBusy(true);
    try {
      for (const p of people) {
        const existing = guestsList.find((g) => g.userId === p.id);
        if (existing) await updateGuest(id, existing.userId, { tabPermissions: perms });
        else await createGuest(id, { name: p.name, email: p.email, password: "", tabPermissions: perms });
      }
      const next = Array.from(new Set([...assignedEmployees, ...empPicked]));
      // Financial figures: the choice made in the tab step, per person.
      const figs = { ...(project?.figuresAccess || {}) };
      for (const p of people) if (p.id) figs[p.id] = empAssignFigures;
      await updateProject(id, { assignedEmployees: next, figuresAccess: figs } as Partial<ApiProject>);
      setAssignedEmployees(next);
      setProject((pr) => (pr ? { ...pr, figuresAccess: figs } : pr));
      await refreshGuests();
      toast(`${people.length} employee${people.length === 1 ? "" : "s"} assigned.`, "success");
      closeEmpPicker();
    } catch (err) { toast(err instanceof Error ? err.message : "Could not assign.", "error"); }
    finally { setEmpAssignBusy(false); }
  };
  // CR-P (79) — "we'll remove it from there. It will ask you are you sure you want to remove it?"
  const unassignEmployee = async (empIdStr: string, label: string) => {
    if (!id) return;
    if (!(await brandedConfirm({
      title: "Remove from this project?",
      message: `${label} loses access to this project. Their work stays where it is and comes back if you assign them again.`,
      confirmLabel: "Remove",
    }))) return;
    const next = assignedEmployees.filter((e) => e !== empIdStr);
    setAssignedEmployees(next);
    try {
      await updateProject(id, { assignedEmployees: next } as Partial<ApiProject>);
      // CR-P (81) — the server drops their tab-access grant with the assignment; reload the
      // grants so this screen agrees with it.
      await refreshGuests();
      toast("Removed from the project.", "success");
    }
    catch (err) { toast(err instanceof Error ? err.message : "Could not remove.", "error"); }
  };

  // Save the tab access chosen for an assigned employee. Tabs left Hidden are simply absent from
  // tabPermissions, which is exactly how the profile's Access page stores them. An employee with no
  // guest record yet is granted one here (no password: they already have a login).
  const saveEmpAccess = async (empIdStr: string) => {
    if (!id) return;
    const emp = employeePool.find((e) => e.empId === empIdStr);
    const guest = emp?.id ? guestsList.find((g) => g.userId === emp.id) : undefined;
    const merged: Record<string, "view" | "edit"> = {};
    for (const t of permTabsAll) {
      const v = empPerms[t.id] ?? (guest?.tabPermissions?.[t.id] as "view" | "edit" | undefined) ?? "none";
      if (v === "view" || v === "edit") merged[t.id] = v;
    }
    setAccessBusy(empIdStr);
    try {
      if (guest) await updateGuest(id, guest.userId, { tabPermissions: merged });
      else if (emp?.email) await createGuest(id, { name: emp.name, email: emp.email, password: "", tabPermissions: merged });
      else { toast("This employee has no email on their account, so scoped access cannot be granted.", "error"); return; }
      await refreshGuests();
      setEmpAccessFor(null); setEmpPerms({});
      toast("Tab access saved.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save access.", "error"); }
    finally { setAccessBusy(null); }
  };
  // Drop the scoped grant so the employee sees the whole project again.
  const restoreFullAccess = async (empIdStr: string) => {
    if (!id) return;
    const emp = employeePool.find((e) => e.empId === empIdStr);
    const guest = emp?.id ? guestsList.find((g) => g.userId === emp.id) : undefined;
    if (!guest) return;
    if (!(await brandedConfirm({
      title: "Restore full access?",
      message: `${emp?.name || empIdStr} will be able to see every tab on this project again.`,
      confirmLabel: "Restore full access",
      danger: false,
    }))) return;
    setAccessBusy(empIdStr);
    try { await removeGuest(id, guest.userId); await refreshGuests(); setEmpAccessFor(null); setEmpPerms({}); toast("Full access restored.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not restore access.", "error"); }
    finally { setAccessBusy(null); }
  };

  // Financial figures access (client request, 2026-09-11) — who sees this project's value and its
  // expense / income / profit totals. GT staff do unless switched off; outside logins (subs,
  // vendors, JV partners) only when switched on. The server applies the same rule.
  const figuresOn = (userId: string | undefined, external: boolean): boolean => {
    const set = userId ? project?.figuresAccess?.[userId] : undefined;
    return typeof set === "boolean" ? set : !external;
  };
  const setFigures = async (userId: string, on: boolean) => {
    if (!id || !userId) return;
    const next = { ...(project?.figuresAccess || {}), [userId]: on };
    try {
      await updateProject(id, { figuresAccess: next } as Partial<ApiProject>);
      setProject((p) => (p ? { ...p, figuresAccess: next } : p));
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save.", "error"); }
  };
  // The Hidden / View switch for one person's financial figures.
  const figuresSwitch = (on: boolean, pick: (v: boolean) => void) => (
    <span className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-bold shrink-0">
      {([[false, "Hidden"], [true, "View"]] as const).map(([v, label]) => (
        <button key={label} type="button" onClick={() => pick(v)}
          className={`px-2.5 py-1 ${on === v ? (v ? "bg-slate-900 text-white" : "bg-red-500 text-white") : "bg-white text-slate-500 hover:bg-slate-50"}`}>{label}</button>
      ))}
    </span>
  );
  const figuresRow = (on: boolean, pick: (v: boolean) => void, note: string) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-amber-100 bg-amber-50/60">
      <span className="min-w-0">
        <span className="block text-xs font-bold text-slate-700">Financial figures</span>
        <span className="block text-[10px] text-slate-500">{note}</span>
      </span>
      {figuresSwitch(on, pick)}
    </div>
  );
  const figuresBadge = <span className="ml-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold whitespace-nowrap" title="Sees the project value and the expense, income and profit totals">Figures</span>;

  const openEditGuest = (guest: ApiGuest, asPartner = false) => {
    setGrantingPartner(asPartner);
    setEditingGuest(guest);
    setGName(guest.name); setGEmail(guest.email); setGPassword("");
    const perms: Record<string, "none" | "view" | "edit"> = {};
    Object.entries(guest.tabPermissions || {}).forEach(([k, v]) => { perms[k] = v; });
    // Prefill the timeline as a custom date if one is set.
    setGExpiry(guest.expiresAt ? new Date(guest.expiresAt).toISOString().slice(0, 10) : "");
    setGPerms(perms); setGAlsoProjects([]); setGuestStep(2);
    // Financial figures: an employee's grant defaults to on, an outside login's to off.
    setGFigures(figuresOn(guest.userId, !employeePool.some((e) => e.id === guest.userId)));
    setShowGuestModal(true);
  };

  // Resolve the timeline choice to an ISO date (or null for "no expiry").
  const resolveExpiry = (): string | null => {
    if (!gExpiry) return null;
    const now = Date.now();
    const days = gExpiry === "1w" ? 7 : gExpiry === "1m" ? 30 : gExpiry === "3m" ? 90 : 0;
    if (days) return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
    const d = new Date(gExpiry); // custom yyyy-mm-dd
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  const closeGuestModal = () => {
    setShowGuestModal(false); setEditingGuest(null);
    setGName(""); setGEmail(""); setGPassword(""); setGPerms({}); setGAlsoProjects([]); setGExpiry(""); setGuestStep(1);
    setGExistingId(null); setGrantingForSubIdx(null); setGrantingPartner(false);
  };

  const setGuestPerm = (tabId: string, level: "none" | "view" | "edit") =>
    setGPerms((prev) => ({ ...prev, [tabId]: level }));

  const handleSaveGuest = async () => {
    if (!id) return;
    if (!editingGuest && !gExistingId && (!gEmail.trim() || !gPassword.trim())) {
      toast(`Email and password are required for a new ${guestNounLc}.`, "error"); return;
    }
    if (!editingGuest && gExistingId && !gEmail.trim()) {
      toast(`Select an existing ${guestNounLc} or create a new one.`, "error"); return;
    }
    // Build tabPermissions: drop "none".
    const tabPermissions: Record<string, "view" | "edit"> = {};
    Object.entries(gPerms).forEach(([k, v]) => { if (v === "view" || v === "edit") tabPermissions[k] = v; });
    const expiresAt = resolveExpiry();
    setGSaving(true);
    try {
      if (editingGuest) {
        await updateGuest(id, editingGuest.userId, {
          tabPermissions,
          name: gName.trim() || undefined,
          password: gPassword.trim() || undefined,
          expiresAt,
        });
        await setFigures(editingGuest.userId, gFigures);
        toast(`${guestNoun} updated.`, "success");
      } else {
        const created = await createGuest(id, {
          name: gName.trim() || gEmail.split("@")[0],
          email: gEmail.trim(),
          password: gPassword.trim(),
          tabPermissions,
          alsoAssignProjectIds: gAlsoProjects,
          expiresAt,
        });
        // If this was granted from a subcontractor's tab, link the login to that record
        // so their logged expenses attribute correctly.
        if (grantingForSubIdx !== null && created?.userId) {
          const next = subcontractors.map((s, idx) => (idx === grantingForSubIdx ? { ...s, userId: created.userId } : s));
          setSubcontractors(next);
          try { await updateProject(id, { subcontractors: next } as Partial<ApiProject>); } catch { /* ignore */ }
        }
        if (created?.userId) await setFigures(created.userId, gFigures);
        toast(`${guestNoun} created. Share the email & password manually.`, "success");
      }
      await refreshGuests();
      closeGuestModal();
    } catch (err) {
      toast(err instanceof Error ? err.message : `Failed to save ${guestNounLc}.`, "error");
    } finally {
      setGSaving(false);
    }
  };

  const handleRemoveGuest = async (userId: string) => {
    if (!id) return;
    if (!confirm("Remove this subcontractor from the project?")) return;
    try {
      await removeGuest(id, userId);
      await refreshGuests();
      toast("Subcontractor removed.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to remove subcontractor.", "error");
    }
  };

  // ── CR-P — Per-tab access helpers (used by the Access ▾ dropdown and the per-employee popup) ──
  // Effective visibility of an assigned employee on a tab (mirrors backend canViewTab for employees).
  const employeeCanSeeTab = (empId: string, tabId: string): boolean => {
    const cfg = tabAccess[tabId];
    if (!cfg) return true;
    if (cfg.employeeIds && cfg.employeeIds.length) return cfg.employeeIds.includes(empId);
    return cfg.employees !== false;
  };
  // Flip one employee on one tab, keeping the allowlist/group form tidy, and persist immediately.
  const toggleEmployeeTab = async (empId: string, tabId: string) => {
    const cur = tabAccess[tabId] ?? { employees: true };
    const assigned = assignedEmployees;
    let entry: { employees: boolean; employeeIds?: string[] };
    if (!(cur.employeeIds && cur.employeeIds.length)) {
      // Group mode: all-on → allowlist of everyone-but-this-one; all-off → allowlist of just this one.
      entry = cur.employees !== false
        ? { employees: true, employeeIds: assigned.filter((e) => e !== empId) }
        : { employees: true, employeeIds: [empId] };
    } else {
      const list = cur.employeeIds;
      const next = list.includes(empId) ? list.filter((e) => e !== empId) : [...list, empId];
      if (next.length === 0) entry = { employees: false, employeeIds: [] };                       // nobody
      else if (assigned.length && next.length === assigned.length && assigned.every((e) => next.includes(e)))
        entry = { employees: true, employeeIds: [] };                                             // everybody
      else entry = { employees: true, employeeIds: next };
    }
    const nextAccess = { ...tabAccess, [tabId]: entry };
    setTabAccess(nextAccess);
    if (!id) return;
    try { await updateProject(id, { tabAccess: nextAccess } as Partial<ApiProject>); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not save access.", "error"); }
  };
  // Subcontractors + partners are guests: on = view (kept as edit if already edit), off = hidden.
  const guestCanSeeTab = (g: ApiGuest, tabId: string): boolean => {
    const v = g.tabPermissions?.[tabId];
    return v === "view" || v === "edit";
  };
  const toggleGuestTab = async (g: ApiGuest, tabId: string) => {
    if (!id) return;
    const cur = g.tabPermissions || {};
    const on = cur[tabId] === "view" || cur[tabId] === "edit";
    const nextPerms: Record<string, "view" | "edit"> = { ...cur };
    if (on) delete nextPerms[tabId]; else nextPerms[tabId] = "view";
    setAccessBusy(g.userId);
    try { await updateGuest(id, g.userId, { tabPermissions: nextPerms }); await refreshGuests(); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not save access.", "error"); }
    finally { setAccessBusy(null); }
  };

  // ── Public Showcase (owner only) ─────────────────────────────────────────────
  const [showShowcaseModal, setShowShowcaseModal] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryLink, setGalleryLink] = useState("");
  const [showcaseDocs, setShowcaseDocs] = useState<ApiDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const refreshShowcaseDocs = () => {
    if (!id) return;
    setDocsLoading(true);
    fetchDocuments(id)
      .then((list) => setShowcaseDocs(list))
      .catch(() => setShowcaseDocs([]))
      .finally(() => setDocsLoading(false));
  };

  const persistGallery = async (next: GalleryItem[]) => {
    if (!id) return;
    try {
      const updated = await updateProject(id, { gallery: next } as Partial<ApiProject>);
      setProject(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save gallery.", "error");
    }
  };

  const handleGalleryUpload = async (file: File) => {
    if (!id) return;
    setGalleryUploading(true);
    try {
      const { url, type } = await uploadGalleryFile(id, file);
      await persistGallery([...((project?.gallery as GalleryItem[]) || []), { type, source: "upload", url, caption: "" }]);
      toast("Added to gallery.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed.", "error");
    } finally {
      setGalleryUploading(false);
    }
  };

  const handleAddGalleryLink = async () => {
    const url = galleryLink.trim();
    if (!url) return;
    await persistGallery([...((project?.gallery as GalleryItem[]) || []), { type: "video", source: "link", url, caption: "" }]);
    setGalleryLink("");
    toast("Video link added.", "success");
  };

  const removeGalleryItem = (i: number) => persistGallery(((project?.gallery as GalleryItem[]) || []).filter((_, idx) => idx !== i));
  const moveGalleryItem = (i: number, dir: -1 | 1) => {
    const arr = [...((project?.gallery as GalleryItem[]) || [])];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    persistGallery(arr);
  };
  const setGalleryCaption = (i: number, caption: string) =>
    persistGallery(((project?.gallery as GalleryItem[]) || []).map((g, idx) => (idx === i ? { ...g, caption } : g)));

  const toggleShowClientName = async () => {
    if (!id) return;
    try {
      const updated = await updateProject(id, { showClientName: project?.showClientName === false } as Partial<ApiProject>);
      setProject(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update.", "error");
    }
  };

  const toggleDocPublic = async (d: ApiDocument) => {
    if (!id) return;
    try {
      const updated = await setDocumentPublic(id, d._id, !d.public);
      setShowcaseDocs((prev) => prev.map((x) => (x._id === d._id ? { ...x, public: updated.public } : x)));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update.", "error");
    }
  };

  // Friendly label for a document's section id.
  const docSectionLabel = (section: string): string => {
    if (section.startsWith("subcontractor-")) return "Subcontractor";
    if (section.startsWith("custom-")) {
      const m = section.replace(/^custom-/, "").split("-field-")[0];
      return customTabs.find((c) => c.id === m)?.label || "Custom tab";
    }
    const map: Record<string, string> = {
      "project-info": "Project Info", "proposals": "Proposals", "pm": "Project Mgmt",
      "tech": "Technical", "legal": "Legal", "po": "Purchase Orders",
      "invoice-sent": "Invoice Sent", "invoice-received": "Invoice Received",
    };
    const key = Object.keys(map).find((k) => section.startsWith(k));
    return key ? map[key] : section.replace(/-/g, " ");
  };

  useEffect(() => {
    if (!id) return;
    // CR-P (16) — only the project fetch may decide "not found". The side lists are permission-
    // guarded per tab, so for a guest without (say) the Expenses or PO grant they return 403;
    // without per-call fallbacks one such 403 failed the whole bundle and the guest saw
    // "Project Not Found" on a project they DO have access to.
    Promise.all([
      fetchProject(id),
      fetchEmployees().catch(() => []),
      fetchExpenses(id).catch(() => []),
      fetchPurchaseOrders(id).catch(() => []),
      fetchSubInvoices(id).catch(() => [] as ApiSubInvoice[]),
      fetchInvoices(id, "sent").catch(() => [] as ApiInvoice[]),
      fetchInvoices(id, "received").catch(() => [] as ApiInvoice[]),
    ])
      .then(async ([proj, emps, expenses, pos, subInv, sentInv, recvInv]) => {
        setSubInvoices(subInv as ApiSubInvoice[]);
        setSentInvoices(sentInv as ApiInvoice[]);
        setReceivedInvoices(recvInv as ApiInvoice[]);
        refreshTemplates();
        setProject(proj);
        setIsPublished(proj.published);
        setFinancialLocked(!!proj.financialProposalLocked);
        setAssignedEmployees(proj.assignedEmployees ?? []);
        setCustomTabs((proj.customTabs ?? []).map((t) => ({
          id: t.tabId,
          label: t.label,
          icon: Plus,
          color: t.color || "",
          parentId: t.parentId || "",
          notes: t.notes || "",
          fields: (t.fields || []).map((f) => ({
            fieldId: f.fieldId,
            label: f.label,
            type: (f.type as FieldType) || "text",
            options: f.options || [],
            value: f.value || "",
          })),
        })));
        setPartnerTabs((proj.partnerTabs ?? []).map((t) => ({
          tabId: t.tabId, label: t.label, notes: t.notes || "",
          fields: (t.fields || []).map((f) => ({ fieldId: f.fieldId, label: f.label, type: (f.type as FieldType) || "text", options: f.options || [], value: f.value || "" })),
        })));
        setTabAccess(proj.tabAccess ?? {});
        setClientInfo({
          name: proj.clientInfo?.name || "",
          reference: proj.clientInfo?.reference || "",
          contactName: proj.clientInfo?.contactName || "",
          email: proj.clientInfo?.email || "",
          phone: proj.clientInfo?.phone || "",
          country: proj.clientInfo?.country || "",
          address: proj.clientInfo?.address || "",
          notes: proj.clientInfo?.notes || "",
          companyId: proj.clientInfo?.companyId || "",
        });
        setJvInfo({
          enabled: proj.jointVenture?.enabled || false,
          partnerName: proj.jointVenture?.partnerName || "",
          partnerAddress: proj.jointVenture?.partnerAddress || "",
          contactName: proj.jointVenture?.contactName || "",
          email: proj.jointVenture?.email || "",
          phone: proj.jointVenture?.phone || "",
          lead: proj.jointVenture?.lead || "",
          logo: proj.jointVenture?.logo || "",
          notes: proj.jointVenture?.notes || "",
          stamps: proj.jointVenture?.stamps || [],
          signatures: proj.jointVenture?.signatures || [],
          legalName: proj.jointVenture?.legalName || "",
          uei: proj.jointVenture?.uei || "",
          cage: proj.jointVenture?.cage || "",
          legalAddress: proj.jointVenture?.legalAddress || "",
          combinedLogo: proj.jointVenture?.combinedLogo || "",
          companyId: proj.jointVenture?.companyId || "",   // CR-P (31)
        });
        setProposals({
          technical: {
            submissionDate: proj.proposals?.technical?.submissionDate || "",
            status: proj.proposals?.technical?.status || "Draft",
          },
          financial: {
            submissionDate: proj.proposals?.financial?.submissionDate || "",
            status: proj.proposals?.financial?.status || "Draft",
          },
        });
        setTechnical({ ...emptyTechnical(), ...(proj.proposalContent?.technical ?? {}) });
        setFinancial({ ...emptyFinancial(), ...(proj.proposalContent?.financial ?? {}) });
        // Migrate older proposals (cover lived only on the technical block) into the shared cover.
        const savedCover = proj.proposalContent?.cover;
        const legacyTech = proj.proposalContent?.technical;
        const techCover = {
          ...emptyCover(),
          ...(savedCover ?? {}),
          ...(savedCover ? {} : {
            proposalTitle: legacyTech?.coverTitle || "",
            submissionDate: legacyTech?.date || "",
            solicitationNo: legacyTech?.refNo || "",
          }),
        };
        setCover(techCover);
        // Financial cover: use its own saved copy, else seed from the technical cover (~90% identical)
        // and default the title so the two documents are distinguishable.
        const savedFin = proj.proposalContent?.coverFinancial;
        setCoverFinancial({
          ...emptyCover(),
          ...(savedFin ?? techCover),
          proposalTitle: savedFin?.proposalTitle || "Financial Proposal",
        });
        setCoverLetter({ ...emptyCoverLetter(), ...(proj.proposalContent?.coverLetter ?? {}) });
        setCoverLetterFinancial({ ...emptyCoverLetter(), ...(proj.proposalContent?.coverLetterFinancial ?? {}) });
        setEoi(proj.proposalContent?.eoi ?? {});
        setRfp(proj.proposalContent?.rfp ?? {});
        setBackCover({ ...emptyBackCover(), ...(proj.proposalContent?.backCover ?? {}) });
        setLetterhead(proj.proposalContent?.letterhead ?? "gt");
        setCustomLetterheadUrl(proj.proposalContent?.customLetterheadUrl ?? "");
        setRequirements(proj.proposalContent?.requirements ?? []);
        setSubcontractors((proj.subcontractors ?? []).map((s) => ({
          name: s.name || "",
          scope: s.scope || "",
          subId: s.subId || "",
          contact: (s as { contact?: string }).contact || "",
          email: (s as { email?: string }).email || "",
          phone: (s as { phone?: string }).phone || "",
          notes: (s as { notes?: string }).notes || "",
          invoiceAmount: (s as { invoiceAmount?: string }).invoiceAmount || "",
          userId: (s as { userId?: string }).userId || "",
        })));
        refreshSubDocs();
        refreshProcurement();
        setEmployeePool(emps);
        setExpenseRows(expenses);
        setPoRows(pos);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloadKey]);

  // Load the guest list once the project is known and the viewer is its owner.
  useEffect(() => {
    if (!id || !project) return;
    const cu = getAuthUser();
    if (project.ownerId && cu && (project as ApiProject & { ownerId?: string }).ownerId === cu.id) {
      fetchGuests(id).then(setGuestsList).catch(() => setGuestsList([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, project?.ownerId]);

  // Load the project's documents when the Public Showcase modal opens.
  useEffect(() => {
    if (showShowcaseModal) refreshShowcaseDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showShowcaseModal]);

  const allTabsAll = [...DEFAULT_TABS, ...customTabs];
  // What can be granted: the tabs above plus Client Info, which is a section now (CR 276).
  const permTabsAll = [CLIENT_PERM_TAB, ...allTabsAll];

  // Reset all add-tab state and close the modal.
  const closeAddTab = () => {
    setShowAddTab(false);
    setEditingFieldsForTab(null);
    setNewTabName(""); setNewTabParent(""); setNewTabColor(""); setNewTabFields([]);
    setAddTabStep("choose"); setAddTabKind("main");
  };

  // Open the wizard at step 1 (choose main vs sub).
  const openAddTab = () => {
    setEditingFieldsForTab(null);
    setNewTabName(""); setNewTabParent(""); setNewTabColor(""); setNewTabFields([]);
    setAddTabKind("main"); setAddTabStep("choose");
    setShowAddTab(true);
  };

  // Open the wizard straight at the details step for a sub-tab of `parentId`.
  const openAddSubTab = (parentId: string) => {
    setEditingFieldsForTab(null);
    setNewTabName(""); setNewTabColor(""); setNewTabFields([]);
    setNewTabParent(parentId);
    setAddTabKind("sub"); setAddTabStep("form");
    setShowAddTab(true);
  };

  // Step 1 → step 2: user picked the tab kind.
  const chooseTabKind = (kind: "main" | "sub") => {
    setAddTabKind(kind);
    if (kind === "main") setNewTabParent("");
    setAddTabStep("form");
  };

  const handleAddTab = () => {
    if (!newTabName.trim()) return;
    if (!editingFieldsForTab && addTabKind === "sub" && !newTabParent) return;

    if (editingFieldsForTab) {
      // Editing an existing tab — just patch its fields
      setCustomTabs((prev) => prev.map((t) =>
        t.id === editingFieldsForTab
          ? { ...t, label: newTabName.trim(), color: newTabColor || t.color, fields: newTabFields }
          : t
      ));
    } else {
      const tabId = `custom-${Date.now()}`;
      setCustomTabs((prev) => [...prev, {
        id: tabId,
        label: newTabName.trim(),
        icon: Plus,
        color: newTabColor,
        parentId: newTabParent,
        notes: "",
        fields: newTabFields,
      }]);
      setActiveTab(tabId);
    }

    closeAddTab();
  };

  // Field builder helpers
  const addFieldDraft = () =>
    setNewTabFields((prev) => [
      ...prev,
      { fieldId: `f-${Date.now()}-${prev.length}`, label: "", type: "text", options: [], value: "" },
    ]);
  const updateFieldDraft = (idx: number, patch: Partial<CustomField>) =>
    setNewTabFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  const removeFieldDraft = (idx: number) =>
    setNewTabFields((prev) => prev.filter((_, i) => i !== idx));

  // Open the Add Tab modal in "edit fields" mode for an existing custom tab
  const openEditFields = (tabId: string) => {
    const tab = customTabs.find((t) => t.id === tabId);
    if (!tab) return;
    setEditingFieldsForTab(tabId);
    setNewTabName(tab.label);
    setNewTabColor(tab.color || "");
    setNewTabParent(tab.parentId || "");
    setNewTabFields(tab.fields || []);
    setAddTabKind(tab.parentId ? "sub" : "main");
    setAddTabStep("form");
    setShowAddTab(true);
    setTabMenuOpen(null); setTabMenuAnchor(null);
  };

  // Live-update a single field's value as the user types in the tab body
  const updateTabFieldValue = (tabId: string, fieldId: string, value: string) =>
    setCustomTabs((prev) =>
      prev.map((t) =>
        t.id !== tabId
          ? t
          : { ...t, fields: (t.fields || []).map((f) => (f.fieldId === fieldId ? { ...f, value } : f)) }
      )
    );

  const handleRemoveCustomTab = (tabId: string) => {
    // Remove the tab AND any sub-tabs (children) of it
    setCustomTabs((prev) => prev.filter((t) => t.id !== tabId && t.parentId !== tabId));
    if (activeTab === tabId) setActiveTab("project-info");
    setTabMenuOpen(null); setTabMenuAnchor(null);
  };

  const handleDuplicateTab = (tabId: string) => {
    const tab = customTabs.find((t) => t.id === tabId);
    if (!tab) return;
    const newId = `custom-${Date.now()}`;
    // Duplicate including fields, but reset their values
    const duplicatedFields = (tab.fields || []).map((f, i) => ({
      ...f,
      fieldId: `f-${Date.now()}-${i}`,
      value: "",
    }));
    setCustomTabs((prev) => [
      ...prev,
      { ...tab, id: newId, label: `${tab.label} (Copy)`, notes: tab.notes, fields: duplicatedFields },
    ]);
    setActiveTab(newId);
    setTabMenuOpen(null); setTabMenuAnchor(null);
  };

  const handleRenameTab = (tabId: string) => {
    if (!renameInput.trim()) return;
    setCustomTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, label: renameInput.trim() } : t)));
    setRenamingTab(null);
    setRenameInput("");
  };

  const handleSetColor = (tabId: string, color: string) => {
    setCustomTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, color } : t)));
    setTabMenuOpen(null); setTabMenuAnchor(null);
  };

  const insertTemplate = (tpl: ApiTemplate) => {
    const now = Date.now();
    const newTabs: CustomTab[] = [];
    const buildFields = (defs: Array<{ label: string; type: string; options?: string[] }> | undefined, prefix: string): CustomField[] =>
      (defs || []).map((f, k) => ({
        fieldId: `f-${prefix}-${k}`,
        label: f.label,
        type: (f.type as FieldType) || "text",
        options: f.options || [],
        value: "",
      }));
    tpl.tabs.forEach((parent, i) => {
      const parentId = `custom-${now}-${i}`;
      newTabs.push({
        id: parentId,
        label: parent.label,
        icon: Plus,
        color: parent.color || "",
        parentId: "",
        notes: parent.notes || "",
        fields: buildFields(parent.fields, `${now}-${i}`),
      });
      (parent.children || []).forEach((child, j) => {
        newTabs.push({
          id: `custom-${now}-${i}-${j}`,
          label: child.label,
          icon: Plus,
          color: child.color || "",
          parentId,
          notes: child.notes || "",
          fields: buildFields(child.fields, `${now}-${i}-${j}`),
        });
      });
    });
    setCustomTabs((prev) => [...prev, ...newTabs]);
    setShowTemplatesModal(false);
    if (newTabs[0]) setActiveTab(newTabs[0].id);
  };

  const currentUser = getAuthUser();
  const myEmpId = (currentUser as { empId?: string } | null)?.empId || "";
  const isOwner = !!(project && currentUser && (project as ApiProject & { ownerId?: string }).ownerId === currentUser.id);
  // A guest's per-tab permissions on this project ("view" | "edit").
  const myGuestEntry = (project?.guests || []).find((g) => g.userId === currentUser?.id);
  const myGuestPerms: Record<string, "view" | "edit"> = myGuestEntry?.tabPermissions || {};
  // CR-P (12) unified access: you're a "guest" here if you hold a guest entry on THIS project,
  // regardless of your global role — so a staff member granted scoped access is treated as one.
  // A subcontractor with no entry stays a guest too, so they remain locked out exactly as before.
  const isGuest = !isOwner && (!!myGuestEntry || (currentUser as { role?: string } | null)?.role === "subcontractor");
  const isAssigned = !isGuest && !!(project && myEmpId && assignedEmployees.includes(myEmpId));
  const guestHasAccess = isGuest && Object.keys(myGuestPerms).length > 0;
  const hasAnyAccess = isOwner || isAssigned || guestHasAccess;
  // Financial figures access — the server decides (lib/access canSeeFigures): the project value,
  // the finance strip, the expense totals and the Quick Report show only when it says yes.
  const canSeeFigures = project?.canSeeFigures !== false;
  // CR-P-30 — Finances sub-tab permissions (expenses / invoice-sent / invoice-received), mirroring
  // the procurement model. Defined here so the active-tab edit flag can honour a per-sub-tab grant.
  // hasAnyFinPerm must be declared BEFORE finPermFor runs (finNav calls it during this render) —
  // guests crashed with a use-before-initialization error when it lived further down.
  const hasAnyFinPerm = FIN_SUBTABS.some((s) => myGuestPerms[s.permId] === "view" || myGuestPerms[s.permId] === "edit");
  const finPermFor = (key: string): "none" | "view" | "edit" => {
    if (!isGuest) return (isOwner || isAssigned) ? "edit" : "view";
    const p = hasAnyFinPerm ? myGuestPerms[FIN_PERM_BY_KEY[key]] : myGuestPerms["finances"];
    return p === "edit" || p === "view" ? p : "none";
  };
  const finNav = FIN_SUBTABS.filter((t) => finPermFor(t.key) !== "none");
  const finActive: FinSub = finNav.some((t) => t.key === finSub) ? finSub : ((finNav[0]?.key as FinSub) || "expenses");

  const guestCanEditActive = isGuest && (myGuestPerms[activeTab] === "edit" || (activeTab === "finances" && finPermFor(finActive) === "edit"));
  const canEdit = isOwner || isAssigned || guestCanEditActive;  // edit content of the ACTIVE tab
  const canEditIdentity = isOwner;              // can edit project identity / A&S

  // CR-PR-13 / CR 184 — "About": what the project is, first thing on Project Info. Categories
  // (formerly also "Project Nature") as tags, then the description. Saves straight to the
  // project, the same fields Edit Identity uses.
  const openTimeline = () => {
    setActiveTab("pm");
    setPmFocus({ id: "timeline", n: Date.now() });
    setTimeout(() => document.getElementById("ws-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  // CR-P (126) — extensions of time. The whole schedule goes back, so the phases and any draft are kept.
  const saveExtensions = async (next: ApiExtension[], message: string) => {
    if (!id || !project) return;
    try {
      const u = await updateProject(id, { schedule: { ...(project.schedule || { milestones: [] }), milestones: project.schedule?.milestones || [], extensions: next } });
      setProject(u); toast(message, "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save the extension.", "error"); throw e; }
  };

  // CR 276 - folds away like the client section above it.
  // CR 277 - one labelled fact in the About / Client grids.
  const aboutField = (label: string, value: ReactNode) => (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 pt-px text-xs font-semibold text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-slate-800">{value || <span className="text-slate-300">-</span>}</span>
    </div>
  );

  const aboutCard = project && (
    <SectionCard
      title="About This Project"
      icon={<Info size={16} className="shrink-0 text-primary" />}
      storageKey={`gt-sec-about-${id || ""}`}
      actions={<>
        {!canEditIdentity ? null : !aboutEditing ? (
          <button
            onClick={() => { setAboutCats(projectCategories(project)); setAboutDesc(project.description || ""); setAboutScope((project.scopeOfWork || []).join("\n")); setAboutEditing(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[11px] font-bold hover:bg-primary transition-colors shrink-0"
          >
            <Edit2 size={12} /> Edit
          </button>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setAboutEditing(false)}
              disabled={aboutSaving}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!id) return;
                if (!(await brandedConfirm({ title: "Save project info?", message: "Are you sure you want to save these changes? The box locks again after saving.", confirmLabel: "Save", danger: false }))) return;
                setAboutSaving(true);
                try {
                  const scopeOfWork = aboutScope.split("\n").map((l) => l.replace(/^[-*\u2022]\s*/, '').trim()).filter(Boolean).slice(0, 60);
                  const u = await updateProject(id, { categories: aboutCats, category: aboutCats[0] || "", description: aboutDesc.trim(), scopeOfWork });
                  setProject(u); setAboutEditing(false);
                  toast("Project info saved.", "success");
                } catch (e) { toast(e instanceof Error ? e.message : "Could not save.", "error"); }
                finally { setAboutSaving(false); }
              }}
              disabled={aboutSaving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-[11px] font-bold hover:bg-primary/90 disabled:opacity-50"
            >
              {aboutSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
            </button>
          </div>
        )}
      </>}
    >
      <div className="space-y-3">
      {aboutEditing ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categories</p>
            <CategoryMultiSelect value={aboutCats} onChange={setAboutCats} />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Short description</p>
            <textarea
              value={aboutDesc}
              onChange={(e) => setAboutDesc(e.target.value)}
              rows={4}
              placeholder="What is this project about, in a sentence or two."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 leading-relaxed outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 resize-y"
            />
          </div>
          {/* CR 277 - the key scope of work, one line per bullet. */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Key scope of work</p>
            <textarea
              value={aboutScope}
              onChange={(e) => setAboutScope(e.target.value)}
              rows={6}
              placeholder={"One line per point, e.g.\nDismantle and remove existing chillers\nInstall two new YORK YVAA0213 chillers"}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 leading-relaxed outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 resize-y"
            />
            <p className="text-[10px] text-slate-400">Each line becomes a bullet.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-3 lg:divide-x lg:divide-slate-100">
          {/* What it is - from Project Identity. */}
          <div className="space-y-3">
            {aboutField("Project Title", project.name)}
            {aboutField("Project Location", project.siteAddress?.full || project.location)}
            {aboutField("Project Type", (
              <span className="flex flex-wrap gap-1.5">
                {projectCategories(project).map((c) => (
                  <span key={c} className="inline-flex items-center rounded-lg border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-bold text-primary">{c}</span>
                ))}
                {projectCategories(project).length === 0 && <span className="text-slate-300">-</span>}
              </span>
            ))}
            {aboutField("Contract Type", project.contractType)}
            {aboutField("Contract No.", project.contractNo)}
            {aboutField("Solicitation #", project.solicitationNo)}
            {aboutField("Status", project.status)}
          </div>

          {/* The description. */}
          <div className="lg:pl-8">
            <p className="mb-1.5 text-xs font-bold text-slate-500">Short Description</p>
            {project.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{project.description}</p>
            ) : (
              <p className="text-sm italic text-slate-400">
                No description yet.{canEditIdentity ? " Click Edit to describe the scope and the services we provide." : ""}
                {" "}An AI summary from the solicitation documents will fill this in a later phase.
              </p>
            )}
          </div>

          {/* CR 277 - the key scope of work, as bullets. */}
          <div className="lg:pl-8">
            <p className="mb-1.5 text-xs font-bold text-slate-500">Key Scope of Work</p>
            {(project.scopeOfWork || []).length ? (
              <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-slate-700 marker:text-primary">
                {(project.scopeOfWork || []).map((line, i) => <li key={`${line}-${i}`}>{line}</li>)}
              </ul>
            ) : (
              <p className="text-sm italic text-slate-400">Nothing listed yet.{canEditIdentity ? " Click Edit and add one point per line." : ""}</p>
            )}
          </div>
        </div>
      )}
      </div>
    </SectionCard>
  );
  // The editor for a custom (library or free) section, in either proposal volume (step 7).
  // CR 199 - jump from the contents list to a section's editor and flash it, so it is obvious where it went.
  const goToSection = (m: ProposalSectionMeta) => {
    const el = document.getElementById(`sec-${m.id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-primary/60", "rounded-[2rem]");
    setTimeout(() => el.classList.remove("ring-2", "ring-primary/60", "rounded-[2rem]"), 1600);
  };

  const customEditorFor = (m: ProposalSectionMeta, vol: Vol) => {
    // CR 203 - once its volume is marked Final, every box in this section is read-only.
    const canEdit = volCanEdit(vol);
    const s = sectionsOfVol(vol).find((x) => x.id === m.refId);
    if (!s) return null;
    // Spec 4 - Government forms and external documents are inserted as uploaded: no text
    // page of ours, so the editor is the upload, not a text box.
    const original = isOriginalPageType(m.pageType);
    const hasLetters = resolveProposalLayout(technical).some((x) => x.libraryKey === "appx-reference-letters");
    return (
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-2">
        {!!m.guide && (
          <p className="text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2"><span className="font-bold text-slate-600">What goes here: </span>{m.guide}</p>
        )}
        {original && (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-4 space-y-1.5">
            <p className="text-xs font-bold text-slate-700">{PAGE_TYPES.find((p) => p.v === m.pageType)?.label || "External document"}: inserted exactly as uploaded, never on our letterhead.</p>
            <p className="text-[11px] text-slate-500">{m.divider ? "A GT/JV separator page prints before it." : "No separator page. Turn one on with the divider icon in Sections."} Upload PDFs or images below; save Word or Excel files as PDF first.</p>
            {(s.attachments || []).length === 0 && <p className="text-[11px] font-bold text-amber-600">Nothing uploaded yet: this section prints {m.divider ? "only its separator page" : "nothing"}.</p>}
          </div>
        )}
        {/* CR-P (92) - a section can be seeded from a saved section template and any section can
            become one, so the standard wording is written once and reused. */}
        {canEdit && !original && (
          <div className="flex flex-wrap items-center gap-2 pb-1">
            {/* CR 198 - what "insert from template" actually does. */}
            <HelpTip title="Insert from template">
              Fills this section from one of two sources: any other project's proposal, section by section,
              or your own saved template library. Either way it replaces what is written here now, and you
              then edit the names and numbers. "Save as template" keeps this section's text for reuse.
            </HelpTip>
            {/* CR 200 - the two sources live behind one button. */}
            <button
              onClick={() => setInsertTarget({ sectionId: s.id, metaId: m.id, vol, title: m.title || s.heading || "" })}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
              title="Insert this section from another project's proposal or from a saved template"
            >
              <Library size={11} /> Insert from template
            </button>
            <button
              onClick={() => void saveSectionAsTemplate(s)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200"
              title="Save this section's content as a reusable template"
            >
              <Plus size={11} /> Save as template
            </button>
          </div>
        )}
        {!original && <RichTextEditor value={s.body} onChange={(html) => updateSectionRow(s.id, "body", html, vol)} disabled={!canEdit} placeholder="Section content…" minHeight={160} onImageUpload={id ? (file) => uploadInlineImage(id, file) : undefined} />}
        {/* Step 6 (spec 21-23) - these library sections list projects from our records. */}
        {!original && PROJECT_SECTION_KEYS.has(m.libraryKey || "") && (
          <div className="rounded-2xl border border-slate-100 p-4">
            <ProposalProjectsEditor
              title="Projects from our records"
              items={s.projects || []}
              onChange={(v) => setSectionProjects(s.id, v, vol)}
              canEdit={canEdit}
              currentProjectId={id}
              mode={referencesOnly(m.libraryKey) ? "references" : "sheets"}
              onAddLetters={vol === "technical" && m.libraryKey === "past-performance" ? () => addLettersAfter(m.id) : undefined}
              lettersAdded={hasLetters}
            />
          </div>
        )}
        {/* Spec 1 - unlimited subsections, numbered automatically in print (1.1, 1.2 / A.1, A.2). */}
        {!original && (
          <div className="space-y-3 pt-1">
            {(s.subsections || []).map((ss, k, arr) => (
              <div key={ss.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-primary shrink-0">Subsection {k + 1}</span>
                  <input value={ss.heading} onChange={(e) => updateSub(s.id, ss.id, { heading: e.target.value }, vol)} disabled={!canEdit} placeholder="Subsection title" aria-label={`Subsection ${k + 1} title`}
                    className="flex-1 min-w-0 bg-white border border-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60" />
                  {canEdit && (
                    <>
                      <button onClick={() => moveSub(s.id, k, -1, vol)} disabled={k === 0} aria-label="Move subsection up" className="p-1 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ChevronUp size={13} /></button>
                      <button onClick={() => moveSub(s.id, k, 1, vol)} disabled={k === arr.length - 1} aria-label="Move subsection down" className="p-1 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ChevronDown size={13} /></button>
                      <button onClick={() => void removeSub(s.id, ss.id, vol)} aria-label="Delete subsection" className="p-1 rounded text-slate-300 hover:text-red-500"><Trash2 size={12} /></button>
                    </>
                  )}
                </div>
                <RichTextEditor value={ss.body} onChange={(html) => updateSub(s.id, ss.id, { body: html }, vol)} disabled={!canEdit} placeholder="Subsection content…" minHeight={100} onImageUpload={id ? (file) => uploadInlineImage(id, file) : undefined} />
              </div>
            ))}
            {canEdit && (
              <button onClick={() => addSub(s.id, vol)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200"><Plus size={12} /> Add subsection</button>
            )}
          </div>
        )}
        {/* CR-B-18 — attach pre-made docs (resume/excel/pdf/picture) to this section. */}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {(s.attachments || []).map((a, ai) => (
              <span key={ai} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded border text-[10px] font-bold bg-white border-slate-100 text-slate-600">
                <a href={assetSrc(a.url)} target="_blank" rel="noreferrer" className="hover:text-primary max-w-[160px] truncate" title={a.name}><FileText size={10} className="inline mr-1" />{a.name}</a>
                {/* Item 104 - a company document out of date is flagged where it is used. */}
                {a.companyFileId && (() => {
                  const ex = expiryInfo(companyDocs.find((d) => d._id === a.companyFileId)?.expiresAt);
                  return ex.state === "expired" || ex.state === "expiring" ? <span className={`px-1.5 rounded-full text-[9px] ${ex.cls}`}>{ex.label}</span> : null;
                })()}
                <button onClick={() => setSectionAttachments(s.id, (s.attachments || []).filter((_, j) => j !== ai), vol)} className="text-slate-300 hover:text-red-500"><X size={11} /></button>
              </span>
            ))}
            <label className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-bold text-slate-600 hover:bg-slate-200 cursor-pointer" title="PDFs print right after this section, exactly as uploaded (no letterhead). Images get a page each. Word or Excel: save as PDF first.">
              <Upload size={11} /> Upload
              <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadSectionDoc(s.id, f, vol); e.target.value = ""; }} />
            </label>
            {/* Item 104 - pull a fixed document straight from Company Documents, no upload. */}
            <button onClick={() => setDocPickFor(s.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-[10px] font-bold text-primary hover:bg-primary/20" title="Tick documents from Company Documents to insert, as they are">
              <FileText size={11} /> From Company Documents
            </button>
            {docPickFor === s.id && (
              <CompanyDocPicker
                docs={companyDocs}
                suggestKey={m.libraryKey}
                already={new Set((s.attachments || []).map((a) => a.companyFileId || "").filter(Boolean))}
                onPick={(files) => setSectionAttachments(s.id, [...(s.attachments || []), ...files.map(docAttachment)], vol)}
                onClose={() => setDocPickFor(null)}
              />
            )}
            {/* CR-P (94) - these used to be stored but never printed. */}
            <span className="text-[10px] text-slate-400">PDFs print right after this section, as uploaded.</span>
          </div>
        )}
      </div>
    );
  };

  // Load everything on mount
  const canManage = isOwner || isAssigned;      // employee-level structural actions (add tabs, export)
  // CR 203 - a volume marked Final is locked: its status shows everywhere and editing needs a new revision.
  const finalOf = (v: "technical" | "financial") => (v === "financial" ? financial.finalized : technical.finalized);
  const openVolFinal = proposalSub === "technical" || proposalSub === "financial" ? finalOf(proposalSub) : undefined;
  // Unlock a volume for more work: the filed Final revision stays in the table as the record.
  const startNewRevision = async (which: "technical" | "financial") => {
    const mark = finalOf(which);
    if (!(await brandedConfirm({
      title: "Start a new revision?",
      message: `The ${which === "financial" ? "Financial" : "Technical"} Proposal is marked Final${mark ? ` (Rev ${mark.revision})` : ""}. That revision stays in the table as the record. This unlocks the builder so you can work on the next revision.`,
      confirmLabel: "Start a new revision",
    }))) return;
    if (which === "financial") setFin("finalized", undefined); else setTech("finalized", undefined);
    await handleSave(true, which === "financial" ? { financial: { ...financial, finalized: undefined } } : { technical: { ...technical, finalized: undefined } });
    toast("Unlocked. Edit and mark the next revision Final when it is ready.", "success");
  };
  const proposalCanEdit = canEdit && !openVolFinal;
  const volCanEdit = (v: Vol) => canEdit && !finalOf(v);
  // Visible tabs: owner sees all; guest sees granted tabs; employee sees tabs whose Employees toggle is on
  // A guest can reach Procurement if they have the module perm OR any procurement sub-tab perm.
  const hasAnyProcPerm = PROC_SUBTABS.some((s) => myGuestPerms[s.permId] === "view" || myGuestPerms[s.permId] === "edit");
  const allTabs = isOwner
    ? allTabsAll
    : isGuest
      ? allTabsAll.filter((t) => myGuestPerms[t.id] === "view" || myGuestPerms[t.id] === "edit" || (t.id === "procurement" && hasAnyProcPerm) || (t.id === "finances" && hasAnyFinPerm))
      : allTabsAll.filter((t) => {
          if (t.id === "showcase") return false;
          const cfg = tabAccess[t.id];
          // A per-employee allowlist (when set) wins: only listed employees see the tab.
          if (cfg?.employeeIds && cfg.employeeIds.length > 0) return !!myEmpId && cfg.employeeIds.includes(myEmpId);
          return (cfg?.employees ?? true) !== false;
        });

  // CR 276 - the Client Information section follows the old Client Info tab's permission.
  const canSeeClient = isOwner
    ? true
    : isGuest
      ? myGuestPerms["client"] === "view" || myGuestPerms["client"] === "edit"
      : (() => {
          const cfg = tabAccess["client"];
          if (cfg?.employeeIds && cfg.employeeIds.length > 0) return !!myEmpId && cfg.employeeIds.includes(myEmpId);
          return (cfg?.employees ?? true) !== false;
        })();

  // Per-procurement-sub-tab access for the current viewer. Staff get full edit; a guest gets exactly
  // what was granted (sub-tab perm, falling back to the module-level "procurement" perm).
  const procPermFor = (key: string): "none" | "view" | "edit" => {
    if (!isGuest) return canEdit ? "edit" : "view";
    // Once a guest has ANY explicit per-sub-tab grant, sub-tabs are governed solely by their own
    // perm (an absent perm = Hidden). Only legacy guests with no sub-tab perms fall back to the
    // module-level "procurement" grant — otherwise hiding a sub-tab would be overridden by it.
    const p = hasAnyProcPerm ? myGuestPerms[PROC_PERM_BY_KEY[key]] : myGuestPerms["procurement"];
    return p === "edit" || p === "view" ? p : "none";
  };
  const procVisible = (key: string) => (key === "legacy" ? false : procPermFor(key) !== "none");
  const procNav = ([
    { k: "log", label: "Master Log" }, { k: "boq", label: "BOQ" }, { k: "submittals", label: "Submittals" },
    { k: "rfqs", label: "RFQs" }, { k: "quotes", label: "Quotes" }, { k: "po", label: "Purchase Orders" },
    { k: "invoices", label: "Invoices" }, { k: "shipment", label: "Shipment" }, { k: "legacy", label: "Legacy Log" },
  ] as const).filter((t) => procVisible(t.k));
  const procActive = procNav.some((t) => t.k === procSub) ? procSub : (procNav[0]?.k || "log");

  // Sub-tab helpers — top-level = default tabs + custom tabs without a parentId
  const getParentId = (t: { id: string }) =>
    (customTabs.find((c) => c.id === t.id)?.parentId) || "";
  const topLevelTabs = allTabs.filter((t) => !getParentId(t));
  const childrenOf = (parentId: string) =>
    allTabs.filter((t) => getParentId(t) === parentId);
  const activeParentId = getParentId({ id: activeTab }) || activeTab;
  const activeChildren = childrenOf(activeParentId);

  // Tailwind-safe color map for tab stripes
  const TAB_COLOR_DOT: Record<string, string> = {
    red: "bg-red-500",
    orange: "bg-orange-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
    blue: "bg-blue-500",
    violet: "bg-violet-500",
    pink: "bg-pink-500",
    slate: "bg-slate-500",
  };
  const COLOR_OPTIONS = Object.keys(TAB_COLOR_DOT);

  const [saving, setSaving] = useState(false);
  // CR-B-14b — autosave status indicator for the proposal/workspace builder.
  const wsSave = useSaveStatus();
  // Confirm wrapper for the shared BuilderActions bar (this component uses window.confirm).
  // CR-B-21 — branded confirm modal (was window.confirm). Render {wsDialogs} once near the root.
  const { confirm: brandedConfirm, dialogs: wsDialogs } = useDialogs();
  const dlgConfirm = (o: { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => brandedConfirm({ ...o, message: o.message || "" });
  /** `override` writes a value that was just set in state, which this closure cannot see yet (CR 203). */
  const handleSave = async (silent = false, override?: Partial<ProposalContent>) => {
    if (!id || !project || !canEdit) return;
    setSaving(true);
    try {
      const payload: Partial<ApiProject> = {};
      if (canEditIdentity) {
        payload.published = isPublished;
        payload.financialProposalLocked = financialLocked;
        // Categories and description are saved by the About box or Edit Identity, never by
        // Save Workspace or the autosave (CR 184).
        payload.assignedEmployees = assignedEmployees;
        payload.tabAccess = tabAccess;
        payload.clientInfo = clientInfo;
        payload.jointVenture = jvInfo; // §M
      }
      payload.customTabs = customTabs.map((t) => ({
        tabId: t.id,
        label: t.label,
        notes: t.notes || "",
        color: t.color || "",
        parentId: t.parentId || "",
        fields: (t.fields || []).map((f) => ({
          fieldId: f.fieldId,
          label: f.label,
          type: f.type,
          options: f.options || [],
          value: f.value || "",
        })),
      }));
      payload.subcontractors = subcontractors;
      payload.proposals = proposals;
      payload.proposalContent = { cover, coverFinancial, coverLetter, coverLetterFinancial, backCover, letterhead, customLetterheadUrl, requirements, technical, financial, eoi, rfp, ...override } as ProposalContent;
      const updated = await wsSave.track(updateProject(id, payload));
      setProject(updated);
      setDirty(false); // I5 — workspace is now saved
      if (!silent) setClientLocked(true); // L1 — re-lock client info after a MANUAL save
      if (!silent) toast("Workspace saved.", "success");
    } catch (err) {
      if (!silent) toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  // CR 179: the website toggle saves on its own, so the project goes live (or comes off) at once
  // instead of waiting for Save Workspace.
  const [publishing, setPublishing] = useState(false);
  const togglePublished = async () => {
    if (!id || publishing) return;
    const next = !isPublished;
    setIsPublished(next);
    setPublishing(true);
    try {
      const u = await updateProject(id, { published: next });
      setProject(u);
      toast(next ? "Published. The project is now on the website." : "Removed from the website.", "success");
    } catch (e) {
      setIsPublished(!next);
      toast(e instanceof Error ? e.message : "Could not update the website setting.", "error");
    } finally {
      setPublishing(false);
    }
  };

  // L1 — Client Information locks after saving; an Edit button re-enables it (prevents accidental edits).
  const [clientLocked, setClientLocked] = useState(true);
  // I5 — warn before leaving/reloading with unsaved workspace edits (proposal builder etc.).
  const [dirty, setDirty] = useState(false);

  // CR 276 - the client's details, folded away when they are not needed. Same content as the old
  // Client Info tab, now the first section of Project Info.
  const clientSection = project && canSeeClient && (
    <SectionCard
      title="Client Information"
      icon={<Users size={16} className="shrink-0 text-primary" />}
      storageKey={`gt-sec-client-${id || ""}`}
      actions={!canEditIdentity ? (
        <span className="rounded-md bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">View only</span>
      ) : clientLocked ? (
        <button onClick={() => setClientLocked(false)} className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-primary"><Edit2 size={12} /> Edit</button>
      ) : (
        <button onClick={() => setClientLocked(true)} className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 transition-colors hover:bg-slate-200"><Lock size={12} /> Lock</button>
      )}
    >
      <div className="space-y-6">
        <p className="text-xs text-slate-400">{clientLocked ? <>Locked. Click <strong>Edit</strong> to change, then <strong>Save Workspace</strong>.</> : <>Editing - changes persist when you click <strong>Save Workspace</strong> at the top.</>}</p>
            {/* CR-P (127) — the client is picked from the Directory; its details show as a small
                information box (always from the Directory) instead of fields to type in. Only
                the reference and a note are the project's own. */}
            {canEditIdentity && !clientLocked && (
              <CompanyPicker
                label="Client from the Directory"
                value={clientInfo.name}
                category="client"
                // Typing a new name drops the old link until a company is picked.
                onNameChange={(v) => { setClientInfo((prev) => ({ ...prev, name: v, companyId: "" })); setDirty(true); }}
                onSelectCompany={(c) => {
                  const cp = c.contactPersons?.[0];
                  setClientInfo((prev) => ({
                    ...prev,
                    companyId: c._id,
                    name: c.name,
                    contactName: cp?.name || "",
                    email: c.email || cp?.email || "",
                    phone: c.phone || cp?.phone || "",
                    address: c.address || "",
                  }));
                  setDirty(true);
                }}
                placeholder="Search the Directory for the client…"
                hint="Not in the Directory? Type the name and add it, or use Open in Directory to create it with the full details, then pick it here."
              />
            )}
            <ClientInfoCard info={clientInfo} notes={clientInfo.notes} />
            {/* CR 277 - the project's own two fields; in the read view they are part of the card. */}
            {canEditIdentity && !clientLocked && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Reference Number</label>
                <input
                  type="text"
                  value={clientInfo.reference}
                  onChange={(e) => updateClient("reference", e.target.value)}
                  disabled={!canEditIdentity || clientLocked}
                  placeholder="e.g. USAID-GH-2026-012"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-3.5 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-60"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Note</label>
                <textarea
                  rows={2}
                  value={clientInfo.notes}
                  onChange={(e) => updateClient("notes", e.target.value)}
                  disabled={!canEditIdentity || clientLocked}
                  placeholder="Anything to remember about this client on this project..."
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-3.5 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all resize-none disabled:opacity-60"
                />
              </div>
            </div>
            )}
      </div>
    </SectionCard>
  );

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  // CR-B-14b — auto-save the workspace every 45s while there are unsaved changes (silent).
  useEffect(() => {
    if (!dirty || !canEdit) return;
    const t = setInterval(() => { if (!saving) void handleSave(true); }, 45000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, canEdit, saving]);
  // Any edit on the Proposals tab (which persists only on "Save Workspace") marks the workspace dirty.
  useEffect(() => {
    if (activeTab !== "proposals" || !canEdit) return;
    // Flag it *after* the event, never inside it: setting state from a capture-phase listener
    // re-renders before React has handled the field's own onChange, and that keystroke is lost.
    let queued = 0;
    const mark = () => { if (!queued) queued = window.setTimeout(() => { queued = 0; setDirty(true); }, 0); };
    window.addEventListener("input", mark, true);
    window.addEventListener("change", mark, true);
    return () => {
      if (queued) window.clearTimeout(queued);
      window.removeEventListener("input", mark, true);
      window.removeEventListener("change", mark, true);
    };
  }, [activeTab, canEdit]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-40 text-slate-300">
        <Loader2 size={40} className="animate-spin mb-4" />
        <p className="text-sm font-bold uppercase tracking-widest">Loading project...</p>
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-40 text-slate-300">
        <AlertCircle size={48} className="mb-4" />
        <h2 className="text-xl font-bold uppercase tracking-widest">Project Not Found</h2>
        <button onClick={() => navigate("/dashboard/all-projects")} className="mt-6 px-6 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-primary transition-all">
          Back to Projects
        </button>
      </div>
    );
  }

  // Outsiders (not owner, not assigned, not a guest with access) — access denied.
  if (!hasAnyAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-40 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mb-6">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-2xl font-display font-bold text-slate-900 mb-3">Access required</h2>
        <p className="text-sm text-slate-500 mb-1">
          You are not part of <span className="font-bold text-slate-900">{project.name}</span>.
        </p>
        <p className="text-sm text-slate-500 mb-8">
          Contact the owner <span className="font-bold text-slate-900">{project.owner || "—"}</span> to request access.
        </p>
        <button onClick={() => navigate("/dashboard/all-projects")} className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-primary transition-all">
          Back to Projects
        </button>
      </div>
    );
  }

  // If the current tab is no longer visible (e.g. owner disabled it for this assignee), fall back.
  if (!allTabs.find((t) => t.id === activeTab) && allTabs[0]) {
    setActiveTab(allTabs[0].id);
  }

  // Assignment is keyed on empId, so only users who have one are assignable here.
  const filteredEmployees = employeePool.filter(
    (e) =>
      e.empId &&
      (empSearch === "" ||
        e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
        e.empId.toLowerCase().includes(empSearch.toLowerCase()))
  );

  return (
    <div className="space-y-6 pb-20">
      {/* CR-P (76)/(77) — assign employees: step 1 search and tick, step 2 choose the tabs they get
          (View / Edit / Hidden, every tab Hidden until allowed), then Save. Manage access on their
          row changes it later. */}
      {empPickerOpen && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-12" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">
                {empAssignStep === 1 ? "Assign employees to this project" : `Tab access for ${empPicked.length === 1 ? (employeePool.find((e) => e.empId === empPicked[0])?.name || "1 employee") : `${empPicked.length} employees`}`}
                <span className="ml-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Step {empAssignStep} of 2</span>
              </p>
              <button onClick={closeEmpPicker} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            {empAssignStep === 2 ? (
              <div className="p-5 space-y-3">
                <p className="text-xs text-slate-500">Which tabs they can use on this project. Every tab starts <span className="font-bold">Hidden</span>: nothing is visible until you allow it.</p>
                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                  <span className="text-slate-400 uppercase tracking-widest mr-1">Set all</span>
                  {([["none", "Hidden"], ["view", "View"], ["edit", "Edit"]] as const).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setEmpAssignPerms(Object.fromEntries(allTabsAll.map((t) => [t.id, v])))} className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-400">{label}</button>
                  ))}
                </div>
                {figuresRow(empAssignFigures, setEmpAssignFigures, "Project value, expense and income totals, estimated profit. On by default for GT employees.")}
                <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                  {allTabsAll.map((t) => {
                    const isChild = !!(customTabs.find((c) => c.id === t.id)?.parentId);
                    const cur = empAssignPerms[t.id] || "none";
                    return (
                      <div key={t.id} className={`flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-50 ${isChild ? "pl-5" : ""}`}>
                        <span className="text-xs font-bold text-slate-700 truncate">{isChild ? "↳ " : ""}{t.label}</span>
                        <span className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-bold shrink-0">
                          {([["none", "Hidden"], ["view", "View"], ["edit", "Edit"]] as const).map(([v, label]) => (
                            <button
                              key={v} type="button"
                              onClick={() => setEmpAssignPerms((p) => ({ ...p, [t.id]: v }))}
                              className={`px-2.5 py-1 ${cur === v
                                ? (v === "none" ? "bg-red-500 text-white" : v === "view" ? "bg-slate-900 text-white" : "bg-emerald-600 text-white")
                                : "bg-white text-slate-500 hover:bg-slate-50"}`}
                            >{label}</button>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
            <div className="p-5 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={15} />
                <input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="Search by name or ID…" className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2.5 pl-9 pr-4 text-xs font-medium focus:ring-2 focus:ring-primary/10 outline-none" />
              </div>
              <div className="max-h-80 overflow-y-auto space-y-1">
                {filteredEmployees.filter((e) => e.empId && !assignedEmployees.includes(e.empId)).length === 0 && (
                  <p className="text-sm text-slate-400 italic text-center py-6">Everyone matching is already assigned.</p>
                )}
                {filteredEmployees.filter((e) => e.empId && !assignedEmployees.includes(e.empId)).map((emp) => {
                  const on = empPicked.includes(emp.empId);
                  return (
                    <label key={emp.empId} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer ${on ? "border-primary bg-primary/5" : "border-slate-100 hover:bg-slate-50"}`}>
                      <input type="checkbox" checked={on} onChange={(e) => setEmpPicked((p) => (e.target.checked ? [...p, emp.empId] : p.filter((x) => x !== emp.empId)))} className="w-3.5 h-3.5 accent-primary" />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-800 truncate">{emp.name}</span>
                        <span className="block text-[10px] text-slate-400">{[emp.jobTitle, emp.empId].filter(Boolean).join(" · ")}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Next you choose which tabs they can see. You can change it later with
                <span className="font-bold"> Manage access</span> on their row.
              </p>
            </div>
            )}
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
              {empAssignStep === 1 ? (
                <>
                  <button onClick={closeEmpPicker} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold">Cancel</button>
                  <button onClick={() => setEmpAssignStep(2)} disabled={!empPicked.length} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-primary disabled:opacity-50">Next: choose tabs</button>
                </>
              ) : (
                <>
                  <button onClick={() => setEmpAssignStep(1)} disabled={empAssignBusy} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold">Back</button>
                  <button onClick={() => void assignPickedEmployees()} disabled={empAssignBusy} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-primary disabled:opacity-50">{empAssignBusy ? "Saving..." : "Save"}</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {wsDialogs}
      {/* ── Header ── */}
      <div className="flex flex-col gap-5">
        {/* CR 192: contract time sits on its own at the top right, level with Back to Projects. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors font-bold text-xs uppercase tracking-widest w-fit sm:mt-2.5"
          >
            <ArrowLeft size={16} /> Back to Projects
          </button>
          {!isGuest && (
            <TimelineBar variant="time" project={project} canEdit={canManage} userName={currentUser?.name || ""} onSaveExtensions={saveExtensions} />
          )}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-5">
            {/* CR 295 - the GT project number, whole: four digits (year, then its place in that
                year). Numbers issued under the old <year>-NN scheme still read in full, smaller. */}
            <div
              title="GT project number"
              className={`w-14 h-14 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center text-primary font-bold flex-shrink-0 ${project.id.length > 5 ? "text-[11px]" : "text-lg"}`}
            >
              {project.id}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                {/* CR-P-04 — the country flag sits with the LOCATION line below (identical to the
                    My/All Projects and Overview tables), not beside the title. */}
                <h1 className="text-2xl font-display font-bold text-slate-900">{project.name}</h1>
                {/* CR-B-16 — live presence: who else is in this project right now. */}
                <PresenceBar users={presentUsers} />
                {/* Colour-coded status — the same palette as the projects table's status key. */}
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${statusMeta(project.status).badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusMeta(project.status).dot}`} /> {statusMeta(project.status).label}
                </span>
                {project.jointVenture?.enabled && !isGuest && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600" title={`Joint Venture with ${project.jointVenture.partnerName || "partner"}${project.jointVenture.lead ? ` · ${project.jointVenture.lead}` : ""}`}>
                    <Users size={11} /> JV{project.jointVenture.partnerName ? ` · ${project.jointVenture.partnerName}` : ""}
                  </span>
                )}
                {canManage && (
                  <button
                    onClick={openEditIdentity}
                    title={isOwner ? "Edit project identity" : "View project identity"}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50 transition-all"
                  >
                    {isOwner ? <Edit2 size={16} /> : <Eye size={16} />}
                  </button>
                )}
                {/* Set a personal reminder about this project — the notification links back here. */}
                <ReminderButton
                  compact
                  title={`Follow up on ${project.name}`}
                  contextLabel={`Project · ${project.name} (${project.id})`}
                  link={`/dashboard/projects/${project.id}`}
                  projectId={project.id}
                  projectName={project.name}
                />
              </div>
              {/* CR 182: subcontractors and vendors get the project name and their tabs only. */}
              {!isGuest && (<>
              <div className="flex flex-wrap items-center gap-2.5">
                {project.clientInfo?.name && (
                  <>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                      <User size={11} /> {project.clientInfo.name}
                    </span>
                    <span className="text-xs font-bold text-slate-300">·</span>
                  </>
                )}
                {/* CR 290 - the solicitation number rides here, where the categories used to. The
                    categories are already on the Project Info tab, under About This Project. */}
                {!!project.solicitationNo?.trim() && (
                  <>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400" title="The solicitation this project was bid under">
                      <FileText size={11} /> Solicitation #: {project.solicitationNo}
                    </span>
                    <span className="text-xs font-bold text-slate-300">·</span>
                  </>
                )}
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                  <MapPin size={11} /> <span className="text-[1.3em] leading-none align-middle">{flagForCountry(project.siteAddress?.country) || locationFlag(project.location)}</span> {shortLocation(project.siteAddress, project.location)}
                </span>
                <LocalClock
                  timeZone={projectTimeZone(project.siteAddress, project.location)}
                  place={shortLocation(project.siteAddress, project.location)}
                />
                {/* CR 295 - the GT number is the badge beside the title, so it is not repeated
                    here. This line carries the client's numbers. */}
                {project.contractNo && (
                  <>
                    <span className="text-xs font-bold text-slate-300">·</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest" title="Client contract number">Contract No: {project.contractNo}</span>
                  </>
                )}
                {project.contractFile && (
                  <>
                    <span className="text-xs font-bold text-slate-300">·</span>
                    <a href={attachmentUrl(project.contractFile.filePath)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-widest hover:underline" title={project.contractFile.name}>
                      <FileText size={11} /> Contract
                    </a>
                  </>
                )}
                {project.contractYear && (
                  <>
                    <span className="text-xs font-bold text-slate-300">·</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Year: {project.contractYear}</span>
                  </>
                )}
                {project.contractDate && (
                  <>
                    <span className="text-xs font-bold text-slate-300">·</span>
                    {/* CR 229 - the signing date, named as such, so it is never mistaken for the start. */}
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest" title="The date the contract was signed or awarded. The work starts on the start date.">Contract date: {project.contractDate}</span>
                  </>
                )}
                {project.endDate && (
                  <>
                    <span className="text-xs font-bold text-slate-300">·</span>
                    {/* CR-P (126) — after an extension the deadline is the new end date. */}
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400" title={effectiveEndDate(project) !== project.endDate ? `Original end date ${project.endDate}` : undefined}>
                      <Calendar size={11} /> Deadline: {effectiveEndDate(project)}
                      {effectiveEndDate(project) !== project.endDate && <span className="text-[10px] font-bold text-violet-600 bg-violet-50 rounded px-1.5 py-0.5">Extended</span>}
                    </span>
                  </>
                )}
                {project.value && canSeeFigures && (
                  <>
                    <span className="text-xs font-bold text-slate-300">·</span>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400" title="Project value / worth">
                      <DollarSign size={11} /> <Fig>{project.value}</Fig>
                    </span>
                  </>
                )}
              </div>

              </>)}
            </div>
          </div>

          <div className="flex flex-col gap-2 flex-shrink-0 items-stretch lg:items-end">
            {/* Row 1 — Public website controls (owner only), in a distinct "publish" format */}
            {isOwner && (
              <div className="flex flex-wrap items-center gap-2 bg-indigo-50/60 border border-indigo-100 rounded-xl px-3 py-1.5 lg:justify-end">
                <div className="flex items-center gap-2">
                  <Globe size={14} className={isPublished ? "text-indigo-500" : "text-slate-300"} />
                  <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">Preview on website</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isPublished}
                    disabled={publishing}
                    onClick={togglePublished}
                    title={isPublished ? "Live on the website. Click to remove it." : "Click to publish this project on the website."}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-300 focus:outline-none flex-shrink-0 disabled:opacity-60 ${isPublished ? "bg-indigo-500" : "bg-slate-200"}`}
                  >
                    <motion.span
                      layout
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md ${isPublished ? "left-5" : "left-0.5"}`}
                    />
                  </button>
                </div>
                <button
                  onClick={() => setShowShowcaseModal(true)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 hover:text-primary bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 shadow-sm transition-all"
                >
                  <FileImage size={13} /> Manage Showcase
                </button>
                <AnimatePresence>
                  {isPublished && (
                    <motion.a
                      href={`/projects?showcase=${id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 shadow-sm transition-all"
                    >
                      <ExternalLink size={13} /> View on website
                    </motion.a>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Row 2 — Project actions */}
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {canManage && (
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  title="Download a zip containing project data and all uploaded files"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:text-primary text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  {exporting ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                  {exporting ? "Preparing…" : "Export Project"}
                </button>
              )}

              {/* CR-P-01 — "Quick Report" opens a popup PDF preview (download/print from there). */}
              {canSeeFigures && !isGuest && (
                <button onClick={() => setReportPick(true)} className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:text-primary text-xs font-bold shadow-sm">
                  <FileText size={14} /> Quick Report
                </button>
              )}

              {canManage && (
                <button
                  onClick={async () => {
                    if (!id || !project) return;
                    try { const u = await setProjectArchived(id, !project.archived); setProject(u); toast(u.archived ? "Project archived — hidden from the lists." : "Project restored.", "success"); }
                    catch (e) { toast(e instanceof Error ? e.message : "Could not update.", "error"); }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:text-amber-600 text-xs font-bold shadow-sm"
                >
                  <Archive size={14} /> {project.archived ? "Restore" : "Archive"}
                </button>
              )}

              {(canManage || (isGuest && Object.values(myGuestPerms).includes("edit"))) && (
              <button
                onClick={() => handleSave()}
                disabled={!canEdit || saving}
                title={!canEdit ? "Switch to a tab you can edit to save." : ""}
                className={`px-3.5 py-1.5 rounded-lg font-bold text-[11px] shadow-lg transition-all active:scale-95 flex items-center gap-1.5 ${
                  !canEdit
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                    : "bg-slate-900 text-white shadow-slate-900/20 hover:bg-primary"
                }`}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? "Saving…" : "Save Workspace"}
              </button>
              )}
            </div>

            {/* Row 3 — Tab structure controls (below Save Workspace) */}
            {canManage && (
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <button
                  onClick={openAddTab}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border-2 border-dashed border-slate-200 bg-white text-slate-500 hover:text-primary hover:border-primary text-xs font-bold transition-all"
                >
                  <Plus size={14} /> Add Tab
                </button>
                <button
                  onClick={() => setShowTemplatesModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border-2 border-dashed border-slate-200 bg-white text-slate-500 hover:text-primary hover:border-primary text-xs font-bold transition-all"
                >
                  <BookOpen size={14} /> Templates
                </button>
              </div>
            )}
          </div>
        </div>
        {/* CR 192: progress on the milestones (work complete, the phases by date), apart from contract
            time; the full timeline is in Project Management > Timeline / Milestones. */}
        {!isGuest && (
          <TimelineBar
            variant="progress"
            project={project}
            canEdit={canManage}
            className="mt-4"
            onOpenTimeline={openTimeline}
            onSaveProgress={async (v) => {
              if (!id) return;
              try { const u = await updateProject(id, { progress: v }); setProject(u); toast(`Progress set to ${v}%.`, "success"); }
              catch (e) { toast(e instanceof Error ? e.message : "Could not save.", "error"); throw e; }
            }}
          />
        )}
        {/* CR-P-15 — five-number financial overview of this project */}
        {canSeeFigures && !isGuest && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <FinanceStrip five={projectFive} />
          </div>
        )}
      </div>

      {/* ── Tab Bar (top-level) — scrollable with arrows (CR-P-29) ── */}
      <div id="ws-tabs" className="scroll-mt-24" />
      <ScrollableTabs className="bg-white border border-slate-100 rounded-2xl sm:rounded-[1.5rem] shadow-sm">
        <div className="flex items-center gap-0.5 sm:gap-1 p-1 sm:p-1.5 min-w-max">
          {topLevelTabs.map((tab) => {
            const ct = customTabs.find((c) => c.id === tab.id);
            const isCustom = !!ct;
            const isActive = activeParentId === tab.id;
            return (
              <div key={tab.id} className="relative flex-shrink-0">
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:pr-3 rounded-lg font-bold text-[10px] sm:text-[11px] uppercase tracking-wide sm:tracking-widest transition-all whitespace-nowrap ${
                    isActive ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  {ct?.color && TAB_COLOR_DOT[ct.color] && (
                    <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 shrink-0 rounded-full ${TAB_COLOR_DOT[ct.color]}`} />
                  )}
                  <tab.icon size={13} className="shrink-0" /> {tab.label}
                  {isCustom && canManage && (
                    <span
                      onClick={(e) => openTabMenu(e, tab.id)}
                      className={`ml-1 p-0.5 rounded hover:bg-white/20 ${isActive ? "text-white/80" : "text-slate-400"} cursor-pointer`}
                    >
                      <MoreVertical size={12} />
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </ScrollableTabs>

      {/* ── Sub-tab Bar (if the active top-level has children) ── */}
      {activeChildren.length > 0 && (
        <div className="bg-slate-50 border border-slate-100 rounded-[1.5rem] px-3 py-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 min-w-max">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3">Sub-tabs:</span>
            {/* Parent itself (so user can click back to parent view) */}
            <button
              onClick={() => setActiveTab(activeParentId)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all ${
                activeTab === activeParentId ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/60"
              }`}
            >
              Overview
            </button>
            {activeChildren.map((sub) => {
              const ct = customTabs.find((c) => c.id === sub.id);
              const isActive = activeTab === sub.id;
              return (
                <div key={sub.id} className="relative">
                  <button
                    onClick={() => setActiveTab(sub.id)}
                    className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wide sm:tracking-widest transition-all whitespace-nowrap ${
                      isActive ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/60"
                    }`}
                  >
                    {ct?.color && TAB_COLOR_DOT[ct.color] && (
                      <span className={`w-2 h-2 shrink-0 rounded-full ${TAB_COLOR_DOT[ct.color]}`} />
                    )}
                    {sub.label}
                    {canManage && (
                      <span
                        onClick={(e) => openTabMenu(e, sub.id)}
                        className="ml-1 p-0.5 rounded hover:bg-slate-100 text-slate-400 cursor-pointer"
                      >
                        <MoreVertical size={11} />
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
            {canManage && (
              <button
                onClick={() => openAddSubTab(activeParentId)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-primary hover:bg-white/60 border-2 border-dashed border-slate-200 hover:border-primary ml-1"
              >
                <Plus size={11} /> Sub-tab
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── CR-P — Per-tab access dropdown (each person, grouped by role) — owner only ── */}
      {isOwner && (() => {
        const partnerG = partnerGuest;
        const subGuests = guestsList.filter((g) => !partnerG || g.userId !== partnerG.userId);
        const tabLabel = allTabs.find((t) => t.id === activeTab)?.label ?? "this tab";
        return (
          <div className="relative flex justify-end">
            <button
              type="button"
              onClick={() => setAccessMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white border border-slate-200 shadow-sm text-xs font-bold text-slate-600 hover:border-slate-300 transition-all"
            >
              <Users size={14} className="text-indigo-500" />
              <span>Access · <span className="text-slate-900">{tabLabel}</span></span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${accessMenuOpen ? "rotate-180" : ""}`} />
            </button>
            {accessMenuOpen && (
              <>
                <div className="fixed inset-0 z-[59]" onClick={() => setAccessMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-80 max-h-[65vh] overflow-y-auto bg-white border border-slate-100 rounded-2xl shadow-2xl z-[60] p-3">
                  <p className="text-[11px] text-slate-400 font-medium px-1 pb-2 border-b border-slate-50">
                    Who can see the <span className="font-bold text-slate-600">{tabLabel}</span> tab. Toggle anyone on or off.
                  </p>

                  {/* Employees */}
                  <div className="pt-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 mb-1">Employees</p>
                    {assignedEmployees.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic px-2 py-1">None assigned. Add them in Subcontractors &amp; Employees.</p>
                    ) : assignedEmployees.map((empId) => {
                      const emp = employeePool.find((e) => e.empId === empId);
                      return <AccessToggleRow key={empId} label={emp?.name ?? empId} sublabel={empId} on={employeeCanSeeTab(empId, activeTab)} onToggle={() => toggleEmployeeTab(empId, activeTab)} />;
                    })}
                  </div>

                  {/* Subcontractors */}
                  <div className="pt-2 mt-2 border-t border-slate-50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 mb-1">Subcontractors</p>
                    {subGuests.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic px-2 py-1">None with a login yet.</p>
                    ) : subGuests.map((g) => (
                      <AccessToggleRow key={g.userId} label={g.name || g.email} sublabel={g.email} busy={accessBusy === g.userId} on={guestCanSeeTab(g, activeTab)} onToggle={() => toggleGuestTab(g, activeTab)} />
                    ))}
                  </div>

                  {/* Partners */}
                  <div className="pt-2 mt-2 border-t border-slate-50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 mb-1">Partners</p>
                    {partnerG ? (
                      <AccessToggleRow label={partnerG.name || partnerG.email} sublabel={partnerG.email} busy={accessBusy === partnerG.userId} on={guestCanSeeTab(partnerG, activeTab)} onToggle={() => toggleGuestTab(partnerG, activeTab)} />
                    ) : (
                      <p className="text-[11px] text-slate-400 italic px-2 py-1">No partner login.</p>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-400 px-2 pt-3 mt-1 border-t border-slate-50">
                    Manage each person's full tab access in <span className="font-bold text-slate-500">Subcontractors &amp; Employees</span>.
                  </p>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="min-h-[500px]"
        >

          {/* CLIENT INFO */}
          {/* PROJECT INFO */}
          {activeTab === "project-info" && id && (
            <ProjectInfoTab
              projectId={id}
              canEdit={canEdit}
              isOwner={isOwner}
              projectInfo={projectPdfInfo(project)}
              clientName={project?.clientInfo?.name}
              header={<div className="space-y-4">{clientSection}{aboutCard}</div>}
            />
          )}

          {/* PROPOSALS */}
          {activeTab === "proposals" && id && project && (() => {
            // While the open volume is marked Final nothing in it can be changed (CR 203).
            const canEdit = proposalCanEdit;
            const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
            const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
            const logoUrl = `${window.location.origin}/gt-usa-logo-new.png`;
            const fmtMoney = (n: number) => `${n < 0 ? "-" : ""}${financial.currency || "$"}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

            const ActionButtons = ({ which }: { which: "technical" | "financial" }) => (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => { if (dirty && canEdit) void handleSave(true); setProposalPreview(which); }}  /* CR-B-14b — autosave before preview */
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors"
                >
                  <Eye size={13} /> Preview
                </button>
                {/* CR 197 - one Export button: PDF (with or without the attachments), Word, Excel, Print. */}
                <ExportMenu
                  options={[
                    { key: "pdf-full", label: "PDF with attachments", hint: "The whole proposal, uploaded files merged in (what goes to the client)", icon: <FileDown size={14} />, busy: proposalDownloading === `${which}-true`, onSelect: () => downloadProposal(which, true) },
                    { key: "pdf", label: "PDF", hint: "The generated pages only", icon: <FileDown size={14} />, busy: proposalDownloading === `${which}-false`, onSelect: () => downloadProposal(which, false) },
                    { key: "word", label: "Word (.docx)", hint: "An editable copy", icon: <FileText size={14} />, busy: proposalDownloading === `${which}-docx`, onSelect: () => downloadProposalWord(which) },
                    ...(which === "financial" ? [{ key: "excel", label: "Excel (.xlsx)", hint: "The price tables, one sheet each with totals", icon: <FileSpreadsheet size={14} />, onSelect: exportAllTablesExcel }] : []),
                    { key: "print", label: "Print", hint: "Opens the preview; print from its toolbar", icon: <Printer size={14} />, onSelect: () => { if (dirty && canEdit) void handleSave(true); setProposalPreview(which); } },
                  ]}
                />
                {/* CR 203 - a Final volume is locked; the only way on is a new revision. */}
                {finalOf(which) && canManage && (
                  <button
                    onClick={() => void startNewRevision(which)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary transition-colors"
                  >
                    <RotateCcw size={13} /> Start a new revision
                  </button>
                )}
                {/* CR-B-14a - the rest of the standard action set for the Proposal builder
                    (Save / Duplicate / Mark as Final / Discard / Reset, with confirmations). */}
                {canEdit && (
                  <BuilderActions
                    confirm={dlgConfirm}
                    saving={saving}
                    dirty={dirty}
                    onSave={() => handleSave()}
                    onDuplicate={() => saveRevision(false)}
                    markCompleteLabel="Mark as Final"
                    markCompleteTitle={`Mark the ${which === "financial" ? "Financial" : "Technical"} Proposal as Final?`}
                    /* CR-P (109) — "are you sure you want to save it as final? You cannot change it later." The
                       frozen copy is what went out, so it is explicitly immutable. */
                    markCompleteMessage={`This files a frozen copy as revision ${Math.max(0, nextFinalVer[which] - 1)} in the proposals table. That copy can never be changed: it is the record of what was produced. The proposal is then marked Final and locked, and you start a new revision when you want to work on it again.`}
                    onMarkComplete={async () => {
                      if (!id) return;
                      try {
                        const blob = await buildProposalBlob(which, true);
                        const safe = fileName([project.name, `${which === "financial" ? "Financial" : "Technical"} Proposal`], "").replace(/\.$/, "");
                        const doc = await saveDocumentVersion(id, { kind: "proposal", refId: which, title: revLabel.trim() || `${which === "financial" ? "Financial" : "Technical"} Proposal (Final)`, status: "final" }, blob, `${safe}.pdf`);
                        // CR 203 - the volume itself now reads Final and is locked until a new revision is started.
                        const mark = { revision: Math.max(0, doc.version - 1), at: new Date().toISOString(), by: currentUser?.name || "" };
                        if (which === "financial") setFin("finalized", mark); else setTech("finalized", mark);
                        // Save it straight away, so the status is still Final after a reload.
                        await handleSave(true, which === "financial" ? { financial: { ...financial, finalized: mark } } : { technical: { ...technical, finalized: mark } });
                        // CR-P (84) - name it the way the table does: Rev 0, Rev 1, ...
                        toast(`Marked as Final (Rev ${mark.revision}). The proposal is locked; start a new revision to keep editing.`, "success");
                        await loadNextFinalVer();
                      } catch (e) { toast(e instanceof Error ? e.message : "Could not mark final.", "error"); }
                    }}
                    onDiscard={() => { applyProposalSnapshot((project?.proposalContent as Record<string, unknown>) || {}); setDirty(false); }}
                    onReset={() => { applyProposalSnapshot({}); }}
                  />
                )}
              </div>
            );

            return (
            <div className="space-y-6">
              {/* Sub-tab bar */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-3 py-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
                <span className={`${lbl} px-3 shrink-0`}>Proposal:</span>
                {/* CR-B-01 — who else is in the Proposal builder right now. */}
                <PresenceBar users={proposalPresent} />
                {/* CR-B-14b — autosave status (Saving… / Saved / Last saved). */}
                <SaveStatus {...wsSave} className="ml-1" />
                {([
                  { k: "overview" as const, label: "Overview" },
                  { k: "eoi" as const, label: "Expression of Interest" },
                  { k: "technical" as const, label: "Technical Proposal" },
                  { k: "financial" as const, label: "Financial Proposal" },
                ]).map((t) => {
                  // CR-B-19b — when locked, only the owner may open the Financial Proposal.
                  const finBlocked = t.k === "financial" && financialLocked && !isOwner;
                  return (
                  <button
                    key={t.k}
                    onClick={() => { if (!finBlocked) setProposalSub(t.k); }}
                    disabled={finBlocked}
                    title={finBlocked ? "Financial Proposal is locked by the project owner." : ""}
                    className={`px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wide sm:tracking-widest transition-all whitespace-nowrap inline-flex items-center gap-1 ${
                      proposalSub === t.k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/60"
                    } ${finBlocked ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {t.k === "financial" && financialLocked && <Lock size={10} className="text-amber-500" />}
                    {t.label}
                    {(t.k === "technical" || t.k === "financial") && finalOf(t.k) && (
                      <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white" title={`Marked Final as Rev ${finalOf(t.k)!.revision}`}>Final</span>
                    )}
                  </button>
                  );
                })}
                {/* Owner toggle: lock/unlock the Financial Proposal (CR-B-19b). */}
                {isOwner && (
                  <button
                    onClick={() => setFinancialLocked((v) => !v)}
                    title={financialLocked ? "Financial Proposal is locked — click to unlock (remember to Save)" : "Lock the Financial Proposal to the owner (remember to Save)"}
                    className={`ml-auto shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${financialLocked ? "bg-amber-500 text-white" : "bg-white text-slate-500 border border-slate-200 hover:text-slate-900"}`}
                  >
                    {financialLocked ? <Lock size={11} /> : <Unlock size={11} />} {financialLocked ? "Financial Locked" : "Lock Financial"}
                  </button>
                )}
              </div>

              {/* Step 8 (items 114-117) - the Expression of Interest: one standard letter, no revisions.
                  It sees JV edits not yet saved, so the letter matches what is on screen. */}
              {proposalSub === "eoi" && project && (
                <EoiBuilder
                  project={{ ...project, jointVenture: { ...(project.jointVenture || {}), ...jvInfo } as ApiProject["jointVenture"] }}
                  cover={cover}
                  value={eoi}
                  onChange={(v) => { setEoi(v); setDirty(true); }}
                  onReset={() => void (async () => {
                    if (!(await brandedConfirm({ title: "Start a new EOI?", message: "The current Expression of Interest is replaced. EOIs keep no revisions.", confirmLabel: "Start a new EOI" }))) return;
                    setEoi({});
                    setDirty(true);
                  })()}
                  canEdit={canEdit}
                />
              )}

              {/* OVERVIEW */}
              {/* CR-P (82)-(87) - the overview used to be two status cards, which said nothing
                  about what had actually been produced. It is now a numbered table per stream:
                  Technical, Financial and the Combined pack that goes to the client. The newest
                  revision sits on the main row and older ones fold out underneath it. */}
              {proposalSub === "overview" && (
                <div className="space-y-6">
                  {/* Item 114 - the three ways to answer a solicitation, in the client's order. */}
                  {canEdit && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">1. Upload existing</p>
                        <p className="text-xs text-slate-500">A proposal produced outside the platform.</p>
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => setUploadFor("technical")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200"><Upload size={12} /> Technical</button>
                          {!(financialLocked && !isOwner) && <button onClick={() => setUploadFor("financial")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200"><Upload size={12} /> Financial</button>}
                          {/* CR 193: technical and financial in one file. */}
                          {!(financialLocked && !isOwner) && <button onClick={() => setUploadFor("combined")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200"><Upload size={12} /> Combined</button>}
                        </div>
                      </div>
                      <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">2. Expression of Interest</p>
                        <p className="text-xs text-slate-500">{eoi.updatedAt ? `Solicitation ${eoi.solicitationNo || cover.solicitationNo || "not set"} · updated ${new Date(eoi.updatedAt).toLocaleDateString()}` : "One standard letter, filled from the project."}</p>
                        <button onClick={() => setProposalSub("eoi")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><FileText size={12} /> {eoi.updatedAt ? "Open the EOI" : "Write an EOI"}</button>
                      </div>
                      <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">3. Proposal builder</p>
                        <p className="text-xs text-slate-500">Build the technical and financial volumes here.</p>
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => { setProposalSub("technical"); setProposalDocTab("builder"); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Plus size={12} /> Technical</button>
                          {!(financialLocked && !isOwner) && <button onClick={() => { setProposalSub("financial"); setProposalDocTab("builder"); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Plus size={12} /> Financial</button>}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Step 9 (spec 6, 38) - the RFP's rules and requirements; the Compliance Matrix prints them. */}
                  {(() => {
                    const tl = resolveProposalLayout(technical);
                    const fl = resolveFinancialLayout(financial);
                    const opts = [
                      ...tl.filter((m) => m.kind !== "blank").map((m) => ({ id: m.id, volume: "technical" as const, label: m.title })),
                      ...fl.filter((m) => m.kind !== "blank").map((m) => ({ id: m.id, volume: "financial" as const, label: `Financial: ${m.title}` })),
                    ];
                    return (
                      <RfpCompliancePanel
                        rfp={rfp}
                        onRfpChange={(v) => { setRfp(v); setDirty(true); }}
                        requirements={requirements}
                        onRequirementsChange={(v) => { setRequirements(v); setDirty(true); }}
                        sections={opts}
                        canEdit={canEdit}
                        hasMatrix={tl.some((m) => m.libraryKey === "compliance-matrix")}
                        onAddMatrix={() => {
                          addLayoutSection("Compliance Matrix", "", { libraryKey: "compliance-matrix", pageType: "designed", guide: "A table linking each solicitation requirement to the response: RFP Requirement, RFP Reference, Proposal Section, Page Number, Compliance Status. The rows come from Proposal overview, RFP details and compliance." });
                          toast("Compliance Matrix added to the technical proposal.", "success");
                        }}
                      />
                    );
                  })()}
                  {([
                    { which: "technical" as const, title: "Technical Proposal", section: "proposals-technical" },
                    { which: "financial" as const, title: "Financial Proposal", section: "proposals-financial" },
                    { which: "combined" as const, title: "Combined Proposal", section: "proposals-combined" },
                  ]).map((p) => {
                    // CR-B-19b - a locked Financial Proposal shows a placeholder to non-owners.
                    const finBlocked = p.which === "financial" && financialLocked && !isOwner;
                    if (finBlocked) return (
                      <div key={p.which} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center gap-3 min-h-[180px]">
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center"><Lock size={20} className="text-amber-500" /></div>
                        <h4 className="font-display font-bold text-slate-900 text-lg">{p.title}</h4>
                        <p className="text-xs text-slate-400 max-w-[16rem]">This section is locked by the project owner. Contact <strong className="text-slate-600">{project.owner || "the owner"}</strong> for access.</p>
                      </div>
                    );
                    const docs = propDocs[p.which] || [];          // newest first (server sorts by version desc)
                    const latest = docs[0];
                    // CR 203 - is this stream marked Final, and as which revision? The volume's own
                    // mark comes first; a revision filed as Final counts too (e.g. an uploaded one).
                    const volFinal = p.which !== "combined" ? finalOf(p.which) : undefined;
                    const finalRev = volFinal ? volFinal.revision
                      : latest?.status === "final" ? Math.max(0, (latest.version || 1) - 1)
                      : null;
                    const older = docs.slice(1);
                    const expanded = !!openRevs[p.which];
                    // CR-P (84) - "always start from revision zero": the first saved copy is Rev 0.
                    const revNo = (d: ApiSavedDocument) => Math.max(0, (d.version || 1) - 1);
                    return (
                      <div key={p.which} className={`bg-white rounded-[2rem] border shadow-sm overflow-hidden ${finalRev !== null ? "border-emerald-200" : "border-slate-100"}`}>
                        <div className={`flex items-center justify-between gap-3 flex-wrap px-5 py-3.5 border-b ${finalRev !== null ? "border-emerald-100 bg-emerald-50/60" : "border-slate-100"}`}>
                          <h4 className="font-display font-bold text-slate-900 text-base flex items-center gap-2">
                            {p.title}
                            {/* CR 203 - "it must clearly say Final and turn fully green". */}
                            {finalRev !== null && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-white" title={volFinal ? `Marked Final as Rev ${volFinal.revision}${volFinal.by ? ` by ${volFinal.by}` : ""}` : "The latest revision is filed as Final"}>
                                <CheckCircle2 size={11} /> Final · Rev {finalRev}
                              </span>
                            )}
                            {p.which === "financial" && financialLocked && <Lock size={13} className="text-amber-500" />}
                            {/* Item 91 - the cover's draft / complete status, at a glance. */}
                            {p.which !== "combined" && (() => {
                              const done = (p.which === "financial" ? coverFinancial : cover).status === "complete";
                              return <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{done ? "Cover complete" : "Cover draft"}</span>;
                            })()}
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{docs.length} revision{docs.length === 1 ? "" : "s"}</span>
                          </h4>
                          {canEdit && (
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* CR-P (88) - an already-awarded project's proposal is uploaded, not rebuilt. */}
                              <button onClick={() => setUploadFor(p.which)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200" title="Upload a proposal produced outside the platform">
                                <Upload size={12} /> Upload existing
                              </button>
                              {/* CR-P (89) - create opens the builder for this stream. */}
                              {p.which !== "combined" ? (
                                // Always lands on the Builder sub-tab, not whichever one (Cover, Saved Versions) was open last.
                                <button onClick={() => { setProposalSub(p.which); setProposalDocTab("builder"); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Plus size={12} /> Create proposal</button>
                              ) : (
                                <button onClick={() => void buildCombinedProposal()} disabled={proposalDownloading === "combined"} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary disabled:opacity-50" title="Merge the latest technical and financial proposals into one pack">
                                  <Plus size={12} /> {proposalDownloading === "combined" ? "Merging..." : "Combine latest"}
                                </button>
                              )}
                              {/* CR-P (112) - over 30 MB, the two PDFs go in one ZIP instead. */}
                              {p.which === "combined" && (
                                <button onClick={() => void buildCombinedZip()} disabled={proposalDownloading === "combined-zip"} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200 disabled:opacity-50" title="Put the latest technical and financial PDFs in one ZIP file (for packs over 30 MB)">
                                  <Download size={12} /> {proposalDownloading === "combined-zip" ? "Zipping..." : "ZIP latest"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* The table ALWAYS renders, headers included, even with nothing filed yet.
                            It used to be replaced by a single sentence when a stream was empty, so
                            on a fresh project the overview showed no table at all, which is the
                            opposite of what was asked for: "I want to see a table in here". */}
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[1040px] text-left">
                              <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-10">#</th>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Revision</th>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Title</th>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Created</th>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last modified</th>
                                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notes</th>
                                  <th className="px-3 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {docs.length === 0 && (
                                  <tr>
                                    <td colSpan={8} className="px-5 py-6 text-center text-xs text-slate-400 italic">
                                      {/* CR-P (87) - only produced proposals are listed; drafts stay in their own tab. */}
                                      Nothing filed yet. {p.which === "combined" ? "Combine the technical and financial proposals once both exist." : "Drafts stay in the builder tab. Use Mark as Final there to file Rev 0 here, or upload one that already exists."}
                                    </td>
                                  </tr>
                                )}
                                {[latest, ...(expanded ? older : [])].filter(Boolean).map((d, i) => (
                                  <tr key={d._id} className={d.status === "final" ? "bg-emerald-50/70 hover:bg-emerald-50" : i > 0 ? "bg-slate-50/20 hover:bg-slate-50/40" : "hover:bg-slate-50/40"}>
                                    <td className="px-4 py-2.5 text-[11px] font-bold text-slate-400 tabular-nums align-top">{i + 1}</td>
                                    <td className="px-3 py-2.5 align-top whitespace-nowrap">
                                      <span className={i === 0 ? "text-xs font-bold text-slate-800" : "text-xs font-bold text-slate-500"}>Rev {revNo(d)}</span>
                                      {i === 0 && older.length > 0 && <span className="ml-1.5 text-[9px] font-bold text-primary uppercase tracking-wide">current</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-xs text-slate-700 align-top max-w-[16rem] truncate" title={d.title}>{d.title || <span className="text-slate-300">-</span>}</td>
                                    <td className="px-3 py-2.5 align-top">
                                      {canEdit ? (
                                        <select
                                          value={d.status}
                                          onChange={(e) => void setProposalDocStatus(d, e.target.value as SavedDocStatus)}
                                          className={`text-[10px] font-bold rounded-full pl-2 pr-5 py-1 border-0 cursor-pointer ${PROP_DOC_STATUS[d.status]?.cls || "bg-slate-100 text-slate-500"}`}
                                        >
                                          {Object.entries(PROP_DOC_STATUS).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                                        </select>
                                      ) : (
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PROP_DOC_STATUS[d.status]?.cls || "bg-slate-100 text-slate-500"}`}>{PROP_DOC_STATUS[d.status]?.label || d.status}</span>
                                      )}
                                      {/* Item 110 - the latest send; the whole log is in the tooltip and in Manage. */}
                                      {!!d.sendLog?.length && (() => {
                                        const last = d.sendLog[d.sendLog.length - 1];
                                        return (
                                          <span className="block mt-1 text-[10px] text-slate-400 whitespace-nowrap" title={d.sendLog.map((x) => `${new Date(x.at).toLocaleString()} · ${x.method} · ${x.to}${x.byName ? ` (by ${x.byName})` : ""}`).join("\n")}>
                                            Sent to {last.to} · {new Date(last.at).toLocaleDateString()}{d.sendLog.length > 1 ? ` (+${d.sendLog.length - 1})` : ""}
                                          </span>
                                        );
                                      })()}
                                    </td>
                                    {/* CR-P (83) - created and last modified are separate columns, each with a name.
                                        Last modified moves with a status or note change; created never does. */}
                                    <td className="px-3 py-2.5 text-[11px] text-slate-500 align-top whitespace-nowrap">
                                      {/* CR-P (88) - an uploaded proposal shows the date it was issued, then when it was uploaded. */}
                                      {d.docDate ? new Date(`${d.docDate}T00:00:00`).toLocaleDateString() : d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "-"}
                                      {d.docDate && d.createdAt && <span className="block text-[10px] text-slate-400">uploaded {new Date(d.createdAt).toLocaleDateString()}</span>}
                                      {d.createdByName && <span className="block text-[10px] text-slate-400">by {d.createdByName}</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-[11px] text-slate-500 align-top whitespace-nowrap">
                                      {(d.updatedAt || d.createdAt) ? new Date(d.updatedAt || d.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "-"}
                                      {(d.updatedByName || d.createdByName) && <span className="block text-[10px] text-slate-400">by {d.updatedByName || d.createdByName}</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-[11px] text-slate-500 align-top max-w-[12rem] truncate" title={d.note}>{d.note || <span className="text-slate-300">-</span>}</td>
                                    <td className="px-3 py-2.5 align-top">
                                      {/* CR-P (85)/(86) - any revision can be opened or downloaded, not just the newest. */}
                                      <div className="flex items-center gap-1 justify-end">
                                        {/* CR-P (86) - Manage: title, notes and status of the (frozen) revision. */}
                                        {canEdit && (
                                          <button onClick={() => setManageDoc(d)} className="px-2.5 py-1 mr-0.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200">Manage</button>
                                        )}
                                        <button onClick={() => window.open(savedDocUrl(d.filePath), "_blank")} title="Preview this revision" aria-label={`Preview Rev ${revNo(d)}`} className="p-1.5 rounded text-slate-400 hover:text-primary"><Eye size={14} /></button>
                                        <a href={savedDocUrl(d.filePath)} download={d.fileName} title="Export (download this revision)" aria-label={`Export Rev ${revNo(d)}`} className="p-1.5 rounded text-slate-400 hover:text-primary"><Download size={14} /></a>
                                        {isComparable(d) && docs.filter(isComparable).length > 1 && (
                                          <button onClick={() => openCompare(p.which, docs, d)} title="Compare with another revision" aria-label={`Compare Rev ${revNo(d)} with another revision`} className="p-1.5 rounded text-slate-400 hover:text-primary"><GitCompareArrows size={14} /></button>
                                        )}
                                        <ShareMenu fileName={d.fileName} fileUrl={savedDocUrl(d.filePath)} size={14} onSent={(e) => void logProposalSend(d, e.to, "Email").catch(() => {})} />
                                        {canEdit && (
                                          <button onClick={() => void archiveProposalDoc(d, true)} title="Archive this revision" aria-label={`Archive Rev ${revNo(d)}`} className="p-1.5 rounded text-slate-300 hover:text-amber-500"><Archive size={13} /></button>
                                        )}
                                        {canEdit && (
                                          <button onClick={() => void removeProposalDoc(d)} title="Delete this revision (moves to the recycle bin)" aria-label={`Delete Rev ${revNo(d)}`} className="p-1.5 rounded text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {older.length > 0 && (
                              <button onClick={() => setOpenRevs((o) => ({ ...o, [p.which]: !expanded }))} className="w-full px-4 py-2 text-[11px] font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-1.5">
                                {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                {expanded ? "Hide older revisions" : `Show ${older.length} older revision${older.length === 1 ? "" : "s"}`}
                              </button>
                            )}
                            {/* CR-P (86) - archived revisions: out of the table, still here to open or restore. */}
                            {archivedDocs[p.which].length > 0 && (
                              <div className="border-t border-slate-100">
                                <button onClick={() => setShowArchivedRevs((o) => ({ ...o, [p.which]: !o[p.which] }))} className="w-full px-4 py-2 text-[11px] font-bold text-slate-400 hover:text-slate-900 hover:bg-slate-50 flex items-center justify-center gap-1.5">
                                  <Archive size={12} /> {showArchivedRevs[p.which] ? "Hide archived" : `Archived (${archivedDocs[p.which].length})`}
                                </button>
                                {showArchivedRevs[p.which] && (
                                  <ul className="divide-y divide-slate-50 bg-amber-50/20">
                                    {archivedDocs[p.which].map((d) => (
                                      <li key={d._id} className="flex items-center gap-3 px-5 py-2 text-xs">
                                        <span className="font-bold text-slate-500 whitespace-nowrap">Rev {revNo(d)}</span>
                                        <span className="text-slate-500 truncate flex-1 min-w-0" title={d.title}>{d.title || "-"}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PROP_DOC_STATUS[d.status]?.cls || "bg-slate-100 text-slate-500"}`}>{PROP_DOC_STATUS[d.status]?.label || d.status}</span>
                                        <button onClick={() => window.open(savedDocUrl(d.filePath), "_blank")} title="Preview this revision" aria-label={`Preview archived Rev ${revNo(d)}`} className="p-1.5 rounded text-slate-400 hover:text-primary"><Eye size={14} /></button>
                                        {canEdit && (
                                          <button onClick={() => void archiveProposalDoc(d, false)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 hover:text-slate-900 hover:bg-white"><RotateCcw size={11} /> Restore</button>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>

                        {compareRevs?.which === p.which && (
                          <RevisionCompare title={p.title} docs={docs} fromId={compareRevs.fromId} toId={compareRevs.toId} onClose={() => setCompareRevs(null)} />
                        )}
                        {uploadFor === p.which && (
                          <UploadExistingProposal
                            stream={p.which}
                            streams={(financialLocked && !isOwner ? ["technical"] : ["technical", "financial", "combined"]) as ProposalStream[]}
                            statuses={PROP_DOC_STATUS}
                            fetchNextVersion={(st) => fetchNextSavedVersion(id, "proposal", st)}
                            onUpload={(st, file, meta) => uploadExistingProposal(st, file, meta)}
                            onClose={() => setUploadFor(null)}
                          />
                        )}
                        {manageDoc && docs.some((x) => x._id === manageDoc._id) && (
                          <RevisionManage
                            doc={manageDoc}
                            statuses={PROP_DOC_STATUS}
                            onLogSend={async (e) => { await logProposalSend(manageDoc, e.to, e.method, e.note, e.at); toast("Send recorded.", "success"); }}
                            onOpenBuilder={manageDoc.refId === "technical" || manageDoc.refId === "financial"
                              ? () => { const which = manageDoc.refId as "technical" | "financial"; setManageDoc(null); setProposalSub(which); setProposalDocTab("builder"); }
                              : undefined}
                            onClose={() => setManageDoc(null)}
                            onSave={async (body) => {
                              if (!id) return;
                              try { await updateSavedDocument(id, manageDoc._id, body); await loadNextFinalVer(); toast("Revision updated.", "success"); }
                              catch (err) { toast(err instanceof Error ? err.message : "Could not save the revision.", "error"); throw err; }
                            }}
                          />
                        )}

                        {/* The old per-proposal block that sat here (submission date, overall status,
                            builder buttons, attachments) is gone: the table carries date and status
                            per revision, the buttons already live in the builder, and attachments
                            have their own sub-tab there. */}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Inner sub-tabs for each document: Cover Page / Builder */}
              {(proposalSub === "technical" || proposalSub === "financial") && (
                <div className="flex items-center gap-2">
                  {/* CR 198 - each tab says what it is for. */}
                  {([
                    { k: "cover" as const, label: "Cover Page", hint: "The front page: its style, the titles, the solicitation and client details, and the photos." },
                    { k: "letter" as const, label: "Transmittal Letter", hint: "The covering letter to the client, printed with the cover (page 1 or 2), signed by whoever you pick." },
                    { k: "builder" as const, label: "Builder", hint: "The body of the proposal: its sections, their content and their order." },
                    { k: "attachments" as const, label: "Attachments", hint: "Files that print at the end, or inside a section set to Government form or External." },
                    { k: "versions" as const, label: "Saved Versions", hint: "Every revision filed so far, including the ones marked Final. Older revisions stay for the record." },
                  ]).map((t) => (
                    <button
                      key={t.k}
                      onClick={() => setProposalDocTab(t.k)}
                      className={`px-4 py-1.5 rounded-lg font-bold text-[11px] transition-all inline-flex items-center gap-1.5 ${
                        proposalDocTab === t.k ? "bg-slate-900 text-white shadow" : "bg-white border border-slate-100 text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {t.label}
                      <HelpTip title={t.label} className={proposalDocTab === t.k ? "!text-white/70" : ""}>{t.hint}</HelpTip>
                    </button>
                  ))}
                </div>
              )}

              {/* CR-P (93) - the transmittal letter, one per volume, printed with the cover (CR 195: page 1 or 2). */}
              {(proposalSub === "technical" || proposalSub === "financial") && proposalDocTab === "letter" && (
                <ProposalLetterBuilder
                  projectId={id}
                  project={project}
                  cover={proposalSub === "financial" ? coverFinancial : cover}
                  letter={proposalSub === "financial" ? coverLetterFinancial : coverLetter}
                  onChange={(l) => { (proposalSub === "financial" ? setCoverLetterFinancial : setCoverLetter)(l); setDirty(true); }}
                  canEdit={canEdit}
                  volume={proposalSub}
                  letterhead={letterhead}
                  customLetterheadUrl={customLetterheadUrl}
                />
              )}

              {/* Proposal attachments, merged into the PDF (Download + attachments, Mark as Final). They
                  used to sit under the overview table; they belong with the document they go into. */}
              {(proposalSub === "technical" || proposalSub === "financial") && proposalDocTab === "attachments" && (
                <div className="space-y-6">
                {/* CR 206 - what the platform already holds for this proposal, pick what goes in. */}
                <AvailableAttachments
                  volume={proposalSub}
                  employees={technical.employees || []}
                  resumes={teamResumes}
                  printResumes={technical.printResumes !== false}
                  onPrintResumes={(on) => { setTech("printResumes", on); setDirty(true); }}
                  companyDocs={companyDocs}
                  attachedIds={new Set(sectionsOfVol(proposalSub).flatMap((sec) => (sec.attachments || []).map((a) => a.companyFileId || "")).filter(Boolean))}
                  onAddDoc={(d) => includeCompanyDoc(d, proposalSub)}
                  canEdit={canEdit}
                />
                <DocSection
                  projectId={id}
                  section={proposalSub === "technical" ? "proposals-technical" : "proposals-financial"}
                  title={`${proposalSub === "technical" ? "Technical" : "Financial"} Proposal - Attachments`}
                  canEdit={canEdit}
                  canPublish={isOwner}
                />
                </div>
              )}

              {/* TECHNICAL / FINANCIAL — Saved Versions (each document keeps its own history) */}
              {(proposalSub === "technical" || proposalSub === "financial") && proposalDocTab === "versions" && (
                <SavedVersionsPanel
                  heading={`Saved ${proposalSub === "technical" ? "Technical" : "Financial"} Proposal Versions`}
                  subtitle="Each save files a frozen PDF of this proposal (attachments merged) as the next revision in the proposals table. Work in progress stays here in the builder until you file it."
                  canEdit={canEdit}
                  formats={[{
                    label: "PDF", ext: "pdf",
                    baseName: `${(project.name || "project")}_${proposalSub === "technical" ? "Technical" : "Financial"}_Proposal`,
                    build: () => buildProposalBlob(proposalSub === "technical" ? "technical" : "financial", true),
                  }]}
                  // CR-P (84) - same stream as the overview table, so it numbers from Rev 0 too, and
                  // saving or deleting here keeps the overview's numbers in step.
                  zeroBased
                  finalOnly
                  fetchNextVersion={() => fetchNextSavedVersion(id, "proposal", proposalSub)}
                  fetchList={() => fetchSavedDocuments(id, "proposal", proposalSub)}
                  saveVersion={(file, fileName, meta) => saveDocumentVersion(id, { kind: "proposal", refId: proposalSub, title: meta.title, status: meta.status }, file, fileName).then(async (d) => { await loadNextFinalVer(); return d; })}
                  update={(docId, body) => updateSavedDocument(id, docId, body)}
                  remove={(docId) => deleteSavedDocument(id, docId).then(() => loadNextFinalVer())}
                  toast={toast}
                />
              )}

              {/* TECHNICAL — Cover Page */}
              {proposalSub === "technical" && proposalDocTab === "cover" && (
                <ProposalCoverBuilder
                  projectId={id}
                  project={project}
                  cover={cover}
                  onCoverChange={setCover}
                  volume="technical"
                  saving={saving}
                  onSave={(st) => saveCover("technical", st)}
                  onCancel={() => void cancelCover("technical")}
                  canEdit={canEdit}
                />
              )}

              {/* TECHNICAL — Builder */}
              {proposalSub === "technical" && proposalDocTab === "builder" && (() => {
                const techLayout = resolveProposalLayout(technical);
                const hasLetters = techLayout.some((m) => m.libraryKey === "appx-reference-letters");
                const pastPerfMetaId = techLayout.find((m) => m.kind === "pastPerformance")?.id || "";
                // Built-in section editors (rendered in document order below, each with on-box arrows).
                const descriptionEditor = (
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
                    <h4 className="font-bold text-slate-800 text-sm">Technical Description</h4>
                    <RichTextEditor value={technical.description} onChange={(html) => setTech("description", html)} disabled={!canEdit} placeholder="Describe the technical approach, methodology, scope of work…" minHeight={200} onImageUpload={id ? (file) => uploadInlineImage(id, file) : undefined} />
                  </div>
                );
                const personnelEditor = (
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-800 text-sm">Key Personnel</h4>
                      {canEdit && (
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => setShowEmployeePicker(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-bold hover:bg-indigo-100"><Users size={12} /> Import from team</button>
                          <button onClick={openSubStaffPicker} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-bold hover:bg-indigo-100"><Users size={12} /> Subcontractor staff</button>
                          <button onClick={() => addEmployeeRow()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200"><Plus size={12} /> Add</button>
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">Prints as the key staff table: Name, Position, Contractor/Subcontractor, Nationality and Years of Experience. Leave a cell blank to use the person's résumé.</p>
                    {technical.employees.length === 0 && <p className="text-xs text-slate-400">No personnel added yet.</p>}
                    {technical.employees.map((e) => {
                      const tr = teamResumes.find((t) => t.rowId === e.id);
                      const res = tr?.data.resume;
                      return (
                      <div key={e.id} className="rounded-2xl border border-slate-100 p-3 bg-slate-50/50 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1.2fr_1fr_auto] gap-2 items-center">
                          <input value={e.name} onChange={(ev) => updateEmployeeRow(e.id, "name", ev.target.value)} disabled={!canEdit} placeholder="Name" className={inp} />
                          <input value={e.role} onChange={(ev) => updateEmployeeRow(e.id, "role", ev.target.value)} disabled={!canEdit} placeholder={res?.title ? `Position (résumé: ${res.title})` : "Position on this project"} className={inp} />
                          <input value={e.firm || ""} onChange={(ev) => updateEmployeeRow(e.id, "firm", ev.target.value)} disabled={!canEdit} placeholder={tr?.firm || "GreenTech USA LLC"} title="Contractor / Subcontractor" className={inp} />
                          {canEdit && <button onClick={() => removeEmployeeRow(e.id)} className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_0.8fr_auto_1fr] gap-2 items-center">
                          <input value={e.nationality || ""} onChange={(ev) => updateEmployeeRow(e.id, "nationality", ev.target.value)} disabled={!canEdit} placeholder={res?.citizenship ? `Nationality (résumé: ${res.citizenship})` : "Nationality"} className={inp} />
                          <input value={e.years || ""} onChange={(ev) => updateEmployeeRow(e.id, "years", ev.target.value)} disabled={!canEdit} placeholder={res?.yearsOfExperience ? `Years (résumé: ${res.yearsOfExperience})` : "Years of experience"} className={inp} />
                          <select value={e.keyStaff === false ? "non" : "key"} onChange={(ev) => setEmployeeKey(e.id, ev.target.value === "key")} disabled={!canEdit} className={`${inp} md:w-40`}>
                            <option value="key">Key staff</option>
                            <option value="non">Non-key staff</option>
                          </select>
                          <span className={`text-[11px] font-bold flex items-center gap-1.5 px-2 ${tr ? "text-emerald-600" : "text-slate-400"}`} title="Resumes are pulled from each person's profile, or from the subcontractor resume library">
                            {tr ? <><Check size={13} /> {e.subResumeId ? "Subcontractor résumé" : "Résumé attached"}</> : e.subResumeId ? "Résumé not found" : "No résumé on profile"}
                          </span>
                          {tr && technical.printResumes !== false && <ResumePageBadge resume={tr.data.resume} person={tr.data.user} compact />}
                        </div>
                      </div>
                      );
                    })}
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer pt-1">
                      <input type="checkbox" checked={technical.printResumes !== false} onChange={(ev) => setTech("printResumes", ev.target.checked)} disabled={!canEdit} className="rounded" />
                      Print each person's résumé in the GreenTech format
                    </label>
                    <p className="text-[11px] text-slate-400">Résumés print in the "Resumes of Key Personnel" section when the layout has one, otherwise as the last appendix. Turn this off when the solicitation wants its own form, and upload that (for example SF 330) as a Government form section.</p>
                  </div>
                );
                // Step 6 (item 100) - past performance from our own project records.
                const pastPerfEditor = (
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                    <ProposalProjectsEditor
                      title="Past Performance"
                      items={technical.similarProjects}
                      onChange={(v) => setTech("similarProjects", v)}
                      canEdit={canEdit}
                      currentProjectId={id}
                      mode="sheets"
                      onAddLetters={() => addLettersAfter(pastPerfMetaId)}
                      lettersAdded={hasLetters}
                    />
                  </div>
                );
                const timelineEditor = (
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800 text-sm">Project Timeline</h4>
                      {canEdit && <button onClick={addTimelineRow} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200"><Plus size={12} /> Add phase</button>}
                    </div>
                    {technical.timeline.length === 0 && <p className="text-xs text-slate-400">No phases added yet.</p>}
                    {technical.timeline.map((t, i) => (
                      <div key={i} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-2">
                        <input value={t.phase} onChange={(ev) => updateTimelineRow(i, "phase", ev.target.value)} disabled={!canEdit} placeholder="Phase / Milestone" className={inp} />
                        <input type="date" value={t.start} onChange={(ev) => updateTimelineRow(i, "start", ev.target.value)} disabled={!canEdit} className={inp} />
                        <input type="date" value={t.end} onChange={(ev) => updateTimelineRow(i, "end", ev.target.value)} disabled={!canEdit} className={inp} />
                        {canEdit && <button onClick={() => removeTimelineRow(i)} className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>}
                      </div>
                    ))}
                  </div>
                );
                const customEditor = (m: ProposalSectionMeta) => customEditorFor(m, "technical");
                const editorFor = (m: ProposalSectionMeta) => {
                  switch (m.kind) {
                    case "description": return descriptionEditor;
                    case "personnel": return personnelEditor;
                    case "pastPerformance": return pastPerfEditor;
                    case "timeline": return timelineEditor;
                    case "custom": return customEditor(m);
                    default: return <div className="bg-white p-5 rounded-[2rem] border border-dashed border-slate-200 text-[11px] text-slate-400 italic">Blank page — no content (a spacer in the exported PDF).</div>;
                  }
                };
                return (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h3 className="flex items-center gap-2 text-xl font-display font-bold text-slate-900">
                      Technical Proposal
                      {/* CR 203 - the volume's own status. */}
                      {finalOf("technical")
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white"><CheckCircle2 size={12} /> Final · Rev {finalOf("technical")!.revision}</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">In progress</span>}
                    </h3>
                    <ActionButtons which="technical" />
                  </div>

                  {finalOf("technical") && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[11px] text-emerald-800">
                      <span>
                        <b>Marked Final as Rev {finalOf("technical")!.revision}</b>
                        {finalOf("technical")!.by ? ` by ${finalOf("technical")!.by}` : ""}
                        {finalOf("technical")!.at ? ` on ${new Date(finalOf("technical")!.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : ""}.
                        {" "}That copy is filed in the proposals table and cannot change. This builder is locked.
                      </span>
                      {canManage && <button onClick={() => void startNewRevision("technical")} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700">Start a new revision</button>}
                    </div>
                  )}
                  <div className="bg-primary/5 border border-primary/10 rounded-2xl px-4 py-3 text-[11px] text-slate-600 flex items-center justify-between gap-3 flex-wrap">
                    <span>Edit this document's cover page in the <strong>Cover Page</strong> sub-tab above. Reorder sections with the <strong>↑ ↓</strong> arrows on each box below; that is the order they print in.</span>
                    {/* Item 105 - the standard attachments list, in one click. */}
                    {canEdit && <button onClick={() => addStandardAppendices("technical")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary shrink-0"><Plus size={12} /> Add the standard appendices</button>}
                  </div>

                  {/* Section manager — Add section lives here; the reorder list is collapsed by default */}
                  <ProposalSectionManager
                    onGoTo={goToSection}
                    layout={techLayout}
                    onLayoutChange={setLayout}
                    onAdd={(title, opts) => addLayoutSection(title, "", opts)}
                    onAddBlank={addBlankPage}
                    onDuplicate={duplicateLayoutSection}
                    onRemove={(m) => void removeLayoutSection(m)}
                    canEdit={canEdit}
                    collapsed={!showSectionList}
                    onToggleCollapsed={() => setShowSectionList((v) => !v)}
                    users={projUsers.map((u) => ({ id: u.id, name: u.name }))}
                    onMention={(i, people, note) => notifyMentions(i, people, note)}
                    userName={getAuthUser()?.name}
                    numbering={technical.numbering || "numbers"}
                    onNumberingChange={(n) => setTech("numbering", n)}
                    levelName={technical.levelName || "Section"}
                    onLevelNameChange={(n) => setTech("levelName", n)}
                    appendixNumbering={technical.appendixNumbering || "numbers"}
                    onAppendixNumberingChange={(n) => setTech("appendixNumbering", n)}
                  />
                  <SectionGroupTemplates layout={techLayout} templates={groupTemplates} canEdit={canEdit}
                    onSave={(name, ids) => saveGroupTemplate("technical", name, ids)} onInsert={(t) => insertGroupTemplate("technical", t)} onDelete={deleteGroupTemplate} />

                  {/* Section editors in document order, each with on-box reorder arrows */}
                  {techLayout.map((m, i) => (
                    <div key={m.id} id={`sec-${m.id}`} className={`scroll-mt-24 transition-shadow ${m.hidden ? "opacity-50" : ""}`}>
                      <div className="flex items-center gap-2 mb-1 px-1">
                        {canEdit && (
                          <div className="flex items-center">
                            <button disabled={i === 0} onClick={() => moveProposalSection(i, -1)} title="Move up" className="p-1 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ArrowUp size={14} /></button>
                            <button disabled={i === techLayout.length - 1} onClick={() => moveProposalSection(i, 1)} title="Move down" className="p-1 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ArrowDown size={14} /></button>
                          </div>
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{i + 1}. {m.title}{m.hidden ? " · hidden" : ""}{m.divider ? " · divider page" : ""}</span>
                      </div>
                      {editorFor(m)}
                    </div>
                  ))}
                </div>
                );
              })()}

              {/* FINANCIAL BUILDER */}
              {/* FINANCIAL — Cover Page */}
              {proposalSub === "financial" && proposalDocTab === "cover" && (
                <div className="space-y-3">
                  {/* CR-P (106) - "you can duplicate the technical cover page and just change it to
                      financial. Everything is actually the same: project name, RFP number, pictures."
                      One click copies it across and renames the title, instead of retyping it. */}
                  {canEdit && (
                    <div className="flex items-center gap-2 flex-wrap bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                      <span className="text-[11px] text-slate-500">The financial cover is usually the technical one with a different title.</span>
                      <button onClick={() => void copyTechnicalCover()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary">
                        <Copy size={12} /> Copy from technical cover
                      </button>
                    </div>
                  )}
                  <ProposalCoverBuilder
                    projectId={id}
                    project={project}
                    cover={coverFinancial}
                    onCoverChange={setCoverFinancial}
                    volume="financial"
                    saving={saving}
                    onSave={(st) => saveCover("financial", st)}
                    onCancel={() => void cancelCover("financial")}
                    canEdit={canEdit}
                  />
                </div>
              )}

              {/* FINANCIAL — Builder */}
              {proposalSub === "financial" && proposalDocTab === "builder" && (() => {
                const finTables = resolveFinancialTables(financial);
                const grandTotal = finTables.reduce((s, tb) => s + tableTotal(tb), 0);
                const finLayout = resolveFinancialLayout(financial);
                // Step 7 - our own price table is the built-in "Price Schedule" section (item 107: optional).
                const pricingEditor = (
                <div className="space-y-6">
                  {/* Top controls */}
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-wrap items-end justify-between gap-3">
                    <div className="space-y-1.5">
                      <label className={lbl}>Currency</label>
                      <input value={financial.currency} onChange={(e) => setFin("currency", e.target.value)} disabled={!canEdit} placeholder="$" className={`${inp} w-24`} />
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-[11px] font-bold hover:bg-indigo-100 cursor-pointer">
                          <Upload size={13} /> Import Excel as table
                          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFinancialExcel(f); e.target.value = ""; }} />
                        </label>
                        <button onClick={addTable} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-800"><Plus size={13} /> Add table</button>
                      </div>
                    )}
                  </div>

                  {/* Pricing tables */}
                  {finTables.map((tb) => {
                    const calc = tableCalc(tb);
                    const total = calc.grand;
                    return (
                      <div key={tb.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <input value={tb.title} onChange={(e) => patchTable(tb.id, { title: e.target.value })} disabled={!canEdit} placeholder="Table title (e.g. Q1 2026)" className="text-sm font-bold text-slate-800 bg-transparent border-b border-transparent focus:border-primary/30 outline-none py-1 min-w-[10rem]" />
                          {canEdit && (
                            <div className="flex items-center gap-1">
                              <button onClick={() => exportTableExcel(tb)} title="Export to Excel" className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100"><FileSpreadsheet size={15} /></button>
                              <button onClick={() => duplicateTable(tb.id)} title="Duplicate table" className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100"><Copy size={15} /></button>
                              <button onClick={() => removeTable(tb.id)} title="Delete table" className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                            </div>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="text-xs border-separate border-spacing-0">
                            <thead>
                              <tr className="text-left text-slate-400">
                                {tb.columns.map((c) => (
                                  <th key={c.id} className="px-1 py-1 align-bottom">
                                    <input value={c.label} onChange={(e) => setColumn(tb.id, c.id, { label: e.target.value })} disabled={!canEdit} className="font-bold text-slate-600 bg-slate-50 rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-primary/10 min-w-[6rem]" />
                                    {canEdit && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <select value={c.kind} onChange={(e) => setColumn(tb.id, c.id, { kind: e.target.value as FinancialColumnKind })} className="text-[9px] font-bold text-slate-400 bg-white border border-slate-100 rounded px-1 py-0.5 outline-none">
                                          <option value="text">text</option><option value="number">number</option><option value="qty">quantity</option><option value="rate">unit price ($)</option><option value="amount">amount ($)</option>
                                        </select>
                                        <button onClick={() => removeColumn(tb.id, c.id)} title="Remove column" className="text-slate-300 hover:text-red-500"><X size={11} /></button>
                                      </div>
                                    )}
                                  </th>
                                ))}
                                {canEdit && <th className="px-1 align-bottom pb-1"><button onClick={() => addColumn(tb.id)} title="Add column" className="p-1 rounded text-slate-400 hover:text-primary hover:bg-slate-100"><Plus size={13} /></button></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {tb.rows.length === 0 && <tr><td colSpan={tb.columns.length + 1} className="px-2 py-5 text-center text-slate-400">No rows. Add a row, or import from Excel.</td></tr>}
                              {tb.rows.map((r, ri) => {
                                const del = canEdit && <td className="px-1 py-1"><button onClick={() => removeRow(tb.id, r.id)} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={13} /></button></td>;
                                // A phase heading: one label across the table; its lines get a subtotal.
                                if (r.type === "group") return (
                                  <tr key={r.id}>
                                    <td colSpan={tb.columns.length} className="px-1 py-1"><input value={r.label || ""} onChange={(e) => setRowLabel(tb.id, r.id, e.target.value)} disabled={!canEdit} placeholder="Phase heading, e.g. Phase 1 - Design" className={`${inp} font-bold !bg-emerald-50 text-emerald-800`} /></td>
                                    {del}
                                  </tr>
                                );
                                const next = tb.rows[ri + 1];
                                const g = calc.groups.find((x) => x.rows.some((y) => y.id === r.id));
                                const closes = !!g?.label && (!next || next.type === "group");
                                return [
                                  <tr key={r.id} className="hover:bg-slate-50/40">
                                    {tb.columns.map((c) => (
                                      <td key={c.id} className="px-1 py-1">
                                        {c.kind === "amount" && calc.isComputed(r)
                                          ? <div className="min-w-[5rem] px-3 py-2.5 text-right font-bold text-slate-700 bg-slate-50 rounded-xl" title="Quantity × unit price, calculated">{fmtMoney(calc.amountOf(r))}</div>
                                          : <input value={r.cells[c.id] || ""} onChange={(e) => setCell(tb.id, r.id, c.id, e.target.value)} disabled={!canEdit} className={`${inp} min-w-[5rem] ${c.kind === "amount" || c.kind === "rate" ? "text-right" : ""} ${c.kind === "amount" ? "font-bold" : ""}`} />}
                                      </td>
                                    ))}
                                    {del}
                                  </tr>,
                                  closes ? (
                                    <tr key={`${r.id}-subtotal`}>
                                      <td colSpan={tb.columns.length} className="px-3 py-1.5 text-right text-[11px] font-bold text-emerald-700">Subtotal, {g!.label || "phase"}: {fmtMoney(g!.subtotal)}</td>
                                      {canEdit && <td />}
                                    </tr>
                                  ) : null,
                                ];
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex items-center gap-4 flex-wrap">
                          {canEdit && <button onClick={() => addRow(tb.id)} className="flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline"><Plus size={12} /> Add line</button>}
                          {canEdit && <button onClick={() => addGroupRow(tb.id)} className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 hover:underline"><Plus size={12} /> Add phase heading</button>}
                          {!calc.computed && <span className="text-[10px] text-amber-600">Set one column to "quantity" and one to "unit price" and each line's amount calculates itself.</span>}
                        </div>

                        {/* Step 7b - lines under the table: VAT, DBA insurance, markup, discount. */}
                        <div className="rounded-2xl border border-slate-100 p-3 space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className={lbl}>Lines under the table</span>
                            {canEdit && (
                              <div className="flex gap-1.5 flex-wrap">
                                {ADJUSTMENT_PRESETS.map((p) => (
                                  <button key={p.label} onClick={() => addAdjustment(tb.id, p)} className="px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-bold text-slate-600 hover:bg-slate-200">+ {p.label}</button>
                                ))}
                              </div>
                            )}
                          </div>
                          {(tb.adjustments || []).length === 0 && <p className="text-[11px] text-slate-400">None. Add VAT, DBA insurance, a markup or a discount if the price needs one.</p>}
                          {(tb.adjustments || []).map((a) => (
                            <div key={a.id} className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_0.7fr_1fr_auto] gap-2 items-center">
                              <input value={a.label} onChange={(e) => setAdjustment(tb.id, a.id, { label: e.target.value })} disabled={!canEdit} aria-label="Line label" className={inp} />
                              <select value={a.mode} onChange={(e) => setAdjustment(tb.id, a.id, { mode: e.target.value as "percent" | "fixed" })} disabled={!canEdit} aria-label="Percent or fixed" className={inp}>
                                <option value="percent">% of the lines</option>
                                <option value="fixed">Fixed amount</option>
                              </select>
                              <input value={a.value} onChange={(e) => setAdjustment(tb.id, a.id, { value: e.target.value })} disabled={!canEdit} placeholder={a.mode === "percent" ? "15" : "-5000"} aria-label="Value" className={`${inp} text-right`} />
                              <span className="text-right text-xs font-bold text-slate-700">{fmtMoney(calc.adjustments.find((x) => x.id === a.id)?.amount || 0)}</span>
                              {canEdit ? <button onClick={() => removeAdjustment(tb.id, a.id)} aria-label="Remove line" className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={13} /></button> : <span />}
                            </div>
                          ))}
                        </div>

                        {/* Step 7b - base year plus option years with escalation (the PM sample). */}
                        <div className="rounded-2xl border border-slate-100 p-3 flex flex-wrap items-center gap-3">
                          <span className={lbl}>Option years</span>
                          <select value={tb.optionYears?.count || 0} onChange={(e) => patchTable(tb.id, { optionYears: { count: Number(e.target.value), escalation: tb.optionYears?.escalation || "3" } })} disabled={!canEdit} aria-label="Number of option years" className={`${inp} !w-24`}>
                            {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 0 ? "None" : n}</option>)}
                          </select>
                          {(tb.optionYears?.count || 0) > 0 && (
                            <>
                              <span className="text-[11px] text-slate-500">Escalation per year</span>
                              <input value={tb.optionYears?.escalation || ""} onChange={(e) => patchTable(tb.id, { optionYears: { count: tb.optionYears?.count || 0, escalation: e.target.value } })} disabled={!canEdit} placeholder="3" aria-label="Escalation percent per year" className={`${inp} !w-20 text-right`} />
                              <span className="text-[11px] text-slate-500">%</span>
                              <div className="w-full flex flex-wrap gap-2">
                                {calc.periods.map((p) => <span key={p.label} className="px-2.5 py-1 rounded-lg bg-slate-50 text-[11px] font-bold text-slate-600">{p.label}: {fmtMoney(p.total)}</span>)}
                              </div>
                            </>
                          )}
                        </div>

                        <div className="flex justify-end">
                          <div className="bg-slate-50 rounded-xl px-4 py-2 border-l-4 border-primary text-right">
                            {(calc.adjustments.length > 0 || calc.periods.length > 0) && (
                              <p className="text-[10px] text-slate-400">Lines {fmtMoney(calc.items)}{calc.adjustments.length > 0 ? ` · with the lines under the table ${fmtMoney(calc.total)}` : ""}</p>
                            )}
                            <span className={lbl}>{calc.periods.length ? `Total, base + ${calc.periods.length - 1} option year${calc.periods.length === 2 ? "" : "s"}` : "Total"}</span>
                            <span className="text-lg font-bold text-slate-900 ml-2">{fmtMoney(total)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {finTables.length > 1 && (
                    <div className="flex justify-end">
                      <div className="bg-slate-900 text-white rounded-2xl px-6 py-3">
                        <p className="text-[10px] uppercase tracking-widest text-slate-300">Grand Total — all tables</p>
                        <p className="text-xl font-bold">{fmtMoney(grandTotal)}</p>
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400">Totals are always calculated, never typed: a line's amount is quantity × unit price, phase headings get subtotals, and the lines under a table and its option years are added in. Use several tables for separate schedules (for example the base contract and O&amp;M); the grand total adds them up. Export any table to Excel.</p>

                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
                    <h4 className="font-bold text-slate-800 text-sm">Notes / Terms</h4>
                    <RichTextEditor value={financial.notes} onChange={(html) => setFin("notes", html)} disabled={!canEdit} placeholder="Payment terms, validity period, assumptions…" minHeight={120} onImageUpload={id ? (file) => uploadInlineImage(id, file) : undefined} />
                  </div>
                </div>
                );
                const finEditorFor = (m: ProposalSectionMeta) =>
                  m.kind === "pricing" ? pricingEditor
                  : m.kind === "custom" ? customEditorFor(m, "financial")
                  : <div className="bg-white p-5 rounded-[2rem] border border-dashed border-slate-200 text-[11px] text-slate-400 italic">Blank page, no content (a spacer in the exported PDF).</div>;
                const hasPriceForm = finLayout.some((m) => m.libraryKey === "fin-price-form");
                return (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h3 className="flex items-center gap-2 text-xl font-display font-bold text-slate-900">
                      Financial Proposal
                      {/* CR 203 - the volume's own status. */}
                      {finalOf("financial")
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white"><CheckCircle2 size={12} /> Final · Rev {finalOf("financial")!.revision}</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">In progress</span>}
                    </h3>
                    <ActionButtons which="financial" />
                  </div>

                  {/* Items 107 and 108 - the financial volume's order. */}
                  <div className="bg-primary/5 border border-primary/10 rounded-2xl px-4 py-3 text-[11px] text-slate-600 space-y-2">
                    <p>The order: the <strong>Letter</strong> tab first, then the client's standard price form (filled in Excel or Word, saved as PDF and uploaded as it is), then our own <strong>Price Schedule</strong> table if you need one (hide it with the eye icon in Sections if not), then appendices A, B, C, D.</p>
                    {canEdit && !hasPriceForm && (
                      <button onClick={() => addLayoutSection(FINANCIAL_SECTION_LIBRARY[0].title, "", { libraryKey: FINANCIAL_SECTION_LIBRARY[0].key, pageType: "government", divider: true, guide: FINANCIAL_SECTION_LIBRARY[0].hint }, "financial")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary">
                        <Upload size={12} /> Add the client's price form
                      </button>
                    )}
                    {/* Item 105 - the standard attachments list (SAM, bonding, insurance, DBA). */}
                    {canEdit && (
                      <button onClick={() => addStandardAppendices("financial")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-bold hover:border-primary hover:text-primary ml-2">
                        <Plus size={12} /> Add the standard appendices
                      </button>
                    )}
                  </div>

                  <ProposalSectionManager
                    onGoTo={goToSection}
                    volume="financial"
                    layout={finLayout}
                    onLayoutChange={(n) => setLayout(n, "financial")}
                    onAdd={(title, opts) => addLayoutSection(title, "", opts, "financial")}
                    onAddBlank={() => addBlankPage("financial")}
                    onDuplicate={(m) => duplicateLayoutSection(m, "financial")}
                    onRemove={(m) => void removeLayoutSection(m, "financial")}
                    canEdit={canEdit}
                    collapsed={!showSectionList}
                    onToggleCollapsed={() => setShowSectionList((v) => !v)}
                    users={projUsers.map((u) => ({ id: u.id, name: u.name }))}
                    onMention={(i, people, note) => notifyMentions(i, people, note, "financial")}
                    userName={getAuthUser()?.name}
                    numbering={financial.numbering || "letters"}
                    onNumberingChange={(n) => setFin("numbering", n)}
                    levelName={financial.levelName || "Section"}
                    onLevelNameChange={(n) => setFin("levelName", n)}
                    appendixNumbering={financial.appendixNumbering || "letters"}
                    onAppendixNumberingChange={(n) => setFin("appendixNumbering", n)}
                  />
                  <SectionGroupTemplates layout={finLayout} templates={groupTemplates} canEdit={canEdit}
                    onSave={(name, ids) => saveGroupTemplate("financial", name, ids)} onInsert={(t) => insertGroupTemplate("financial", t)} onDelete={deleteGroupTemplate} />

                  {finLayout.map((m, i) => (
                    <div key={m.id} id={`sec-${m.id}`} className={`scroll-mt-24 transition-shadow ${m.hidden ? "opacity-50" : ""}`}>
                      <div className="flex items-center gap-2 mb-1 px-1">
                        {canEdit && (
                          <div className="flex items-center">
                            <button disabled={i === 0} onClick={() => moveProposalSection(i, -1, "financial")} title="Move up" className="p-1 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ArrowUp size={14} /></button>
                            <button disabled={i === finLayout.length - 1} onClick={() => moveProposalSection(i, 1, "financial")} title="Move down" className="p-1 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ArrowDown size={14} /></button>
                          </div>
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{i + 1}. {m.title}{m.hidden ? " · hidden" : ""}{m.divider ? " · divider page" : ""}</span>
                      </div>
                      {finEditorFor(m)}
                    </div>
                  ))}
                </div>
                );
              })()}

              {/* PDF Preview modal */}
              {proposalPreview && (
                <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex flex-col">
                  <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100">
                    <h3 className="font-display font-bold text-slate-900 text-sm">
                      Preview — {proposalPreview === "technical" ? "Technical" : "Financial"} Proposal
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => downloadProposal(proposalPreview, false)}
                        disabled={proposalDownloading === `${proposalPreview}-false`}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 disabled:opacity-50"
                      >
                        <Download size={13} /> {proposalDownloading === `${proposalPreview}-false` ? "Preparing…" : "Download"}
                      </button>
                      <button
                        onClick={() => downloadProposal(proposalPreview, true)}
                        disabled={proposalDownloading === `${proposalPreview}-true`}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
                      >
                        <Download size={13} /> {proposalDownloading === `${proposalPreview}-true` ? "Merging…" : "+ Attachments"}
                      </button>
                      <button onClick={() => setProposalPreview(null)} className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><X size={16} /></button>
                    </div>
                  </div>
                  <div className="flex-1 bg-slate-200">
                    {/* CR-P (94) - the preview is the assembled file, so a section's uploaded client forms show in place. */}
                    {!previewUrl
                      ? <div className="flex items-center justify-center h-full text-slate-500 text-sm gap-2"><Loader2 className="animate-spin" size={18} /> Generating preview…</div>
                      : <iframe src={previewUrl} title="Proposal preview" className="w-full h-full border-0" />}
                  </div>
                </div>
              )}

              {/* Import-from-team picker */}
              {showEmployeePicker && (
                <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl p-6 w-full max-w-md max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-display font-bold text-slate-900">Add team members</h3>
                      <button onClick={() => setShowEmployeePicker(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} /></button>
                    </div>
                    {employeePool.length === 0 && <p className="text-xs text-slate-400">No team members found.</p>}
                    <div className="space-y-1">
                      {employeePool.map((emp) => (
                        <button key={emp.id || emp.empId || emp.name} onClick={() => { addEmployeeRow(emp.name, "", emp.empId, emp.id || ""); toast(`Added ${emp.name}.`, "success"); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left">
                          <span className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">{emp.name.charAt(0)}</span>
                          <div><p className="text-sm font-bold text-slate-800">{emp.name}</p><p className="text-[10px] text-slate-400 capitalize">{[emp.role, emp.empId].filter(Boolean).join(" · ") || "—"}</p></div>
                          <Plus size={14} className="ml-auto text-slate-300" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Subcontractor staff picker: people from the subcontractor resume library, this
                  project's subcontractors first. */}
              {subStaffOpen && (() => {
                const onProject = new Set(subcontractors.map((s) => s.name));
                const pool = (subStaffPool || []).slice().sort((a, b) =>
                  Number(onProject.has(b.subcontractorName)) - Number(onProject.has(a.subcontractorName))
                  || a.subcontractorName.localeCompare(b.subcontractorName) || a.personName.localeCompare(b.personName));
                return (
                  <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-display font-bold text-slate-900">Add subcontractor staff</h3>
                        <button onClick={() => setSubStaffOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} /></button>
                      </div>
                      <p className="text-[11px] text-slate-400 mb-4">Resumes built under a subcontractor (Subs & Employees tab), or by the partner in their own profile.</p>
                      {subStaffPool === null && <p className="text-xs text-slate-400">Loading…</p>}
                      {subStaffPool?.length === 0 && <p className="text-xs text-slate-400">No subcontractor resumes yet. Build them under a subcontractor in the Subs & Employees tab.</p>}
                      <div className="space-y-1">
                        {pool.map((r) => {
                          const added = technical.employees.some((e) => e.subResumeId === r._id);
                          return (
                            <button key={r._id} disabled={added} onClick={() => { addEmployeeRow(r.personName, r.assignmentOnProject || r.title, "", "", { firm: r.subcontractorName, subResumeId: r._id }); toast(`Added ${r.personName}.`, "success"); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left disabled:opacity-50">
                              <span className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-xs font-bold shrink-0">{(r.personName || "?").charAt(0)}</span>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{r.personName || "Untitled"}</p>
                                <p className="text-[10px] text-slate-400 truncate">{[r.subcontractorName, r.title].filter(Boolean).join(" · ")}{onProject.has(r.subcontractorName) ? "  ·  on this project" : ""}</p>
                              </div>
                              {added ? <Check size={14} className="ml-auto text-emerald-500" /> : <Plus size={14} className="ml-auto text-slate-300" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

            </div>
            );
          })()}

          {/* PROJECT MANAGEMENT */}
          {activeTab === "pm" && id && (
            /* CR-P (135)/(136) — the task board first (styled apart), then the document sections as
               tabs the project manager can add, rename and delete. Closeout Documents moved out
               (they live under Technical Docs); it stays only where files were already uploaded. */
            <DocTabs
              projectId={id}
              tableKey="pm-doc-tabs"
              sectionPrefix="pm"
              canEdit={canEdit}
              canManageTabs={canManage}
              canPublish={isOwner}
              focus={pmFocus}
              lead={[
                { id: "board", label: "Task Board", content: <ProjectBoard projectId={id} canEdit={canEdit} /> },
                // CR 188-192 — the project timeline, right after the board.
                {
                  id: "timeline", label: "Timeline / Milestones", icon: <GanttChartSquare size={16} />,
                  content: project ? (
                    <TimelineTab
                      project={project}
                      canEdit={canEdit}
                      userName={currentUser?.name || ""}
                      onSaveExtensions={saveExtensions}
                      onScheduleSaved={(schedule, progress) => setProject((p) => (p ? { ...p, schedule, progress: schedule.milestones.length ? progress : p.progress } : p))}
                    />
                  ) : null,
                },
              ]}
              // CR 208 - minutes written in the platform sit above the uploads in that tab.
              above={{
                "pm-meeting-minutes": id && project ? (
                  <MinutesPanel
                    projectId={id}
                    section="pm-meeting-minutes"
                    projectName={project.name}
                    projectNo={project.projectId}
                    kind="meeting"
                    canEdit={canEdit}
                    people={projectPeople}
                    onMention={notifyMinuteMentions}
                  />
                ) : null,
                // CR 209 - the same, for progress reports.
                "pm-progress-reports": id && project ? (
                  <MinutesPanel
                    projectId={id}
                    section="pm-progress-reports"
                    projectName={project.name}
                    projectNo={project.projectId}
                    kind="progress"
                    canEdit={canEdit}
                    people={projectPeople}
                    onMention={notifyMinuteMentions}
                  />
                ) : null,
              }}
              defaults={[
                { id: "pm-meeting-minutes", label: "Meeting Minutes", section: "pm-meeting-minutes" },
                { id: "pm-progress-reports", label: "Progress Reports", section: "pm-progress-reports" },
                { id: "pm-site-data", label: "Site Data", section: "pm-site-data" },
                { id: "pm-closeout", label: "Closeout Documents (old)", section: "pm-closeout", onlyIfFiles: true },
              ]}
            />
          )}

          {/* TECHNICAL DOCS */}
          {activeTab === "tech-docs" && id && (
            /* Technical Docs module: Drawings · Other Technical Docs · Contract Admin · Closeout. */
            <TechnicalDocsTab projectId={id} canEdit={canEdit} isOwner={isOwner} projectInfo={projectPdfInfo(project)} clientName={project?.clientInfo?.name} projectName={project?.name} />
          )}

          {/* SUBCONTRACTORS & EMPLOYEES */}
          {activeTab === "subs" && (
            <div className="space-y-6">
            {/* Sub-tab switcher: Assigned Employees | Subcontractors */}
            <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-max">
              {([
                { id: "employees" as const, label: "Assigned Employees", Icon: Users },
                { id: "subcontractors" as const, label: "Subcontractors", Icon: Building2 },
                ...(jvInfo.enabled ? [{ id: "partners" as const, label: "Partners", Icon: Building2 }] : []),
                // Vendors come from the shared supplier list behind the RFQ permission — hide the
                // tab from guests who can't read it rather than showing an empty, unactionable list.
                ...(!isGuest || myGuestPerms["proc-rfqs"] ? [{ id: "vendors" as const, label: "Vendors", Icon: Building2 }] : []),
              ]).map(({ id: sid, label, Icon }) => (
                <button
                  key={sid}
                  onClick={() => setSubsSubTab(sid)}
                  className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${subsSubTab === sid ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}
                >
                  <Icon size={14} className="shrink-0" /> {label}
                </button>
              ))}
            </div>
            </div>

            {/* ── ASSIGNED EMPLOYEES ── */}
            {/* CR-P (76)-(79) — the team tab used to render the WHOLE employee pool as a
                toggle list, so "assigned" and "not assigned" were mixed together and you could not
                see at a glance who was actually on the project. It now starts empty, you add people
                through an Assign employee picker, and the table lists only the assigned ones with
                their position and their access. */}
            {subsSubTab === "employees" && (
              <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-lg font-display font-bold text-slate-900 mb-1">Project team</h3>
                    <p className="text-xs font-medium text-slate-400">
                      {isOwner
                        ? "Only the employees assigned to this project appear here. Assign someone, then choose which tabs they can see."
                        : "Managed by the project owner. Only the owner can add or remove team members."}
                    </p>
                  </div>
                  {isOwner && (
                    <button onClick={() => { setEmpPickerOpen(true); setEmpSearch(""); setEmpPicked([]); setEmpAssignStep(1); setEmpAssignPerms({}); setEmpAssignFigures(true); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-bold hover:bg-primary shrink-0">
                      <Plus size={13} /> Assign employee
                    </button>
                  )}
                </div>

                {assignedEmployees.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-slate-400 bg-slate-50 rounded-3xl">
                    <Users size={30} className="mb-2" />
                    <p className="text-sm font-bold">Nobody assigned yet.</p>
                    <p className="text-xs mt-1">{isOwner ? "Click Assign employee to add someone to this project." : "The project owner has not assigned anyone yet."}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                    <table className="w-full min-w-[720px] text-left">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                          <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-10">#</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Position</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Employee ID</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Access</th>
                          {isOwner && <th className="px-3 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {assignedEmployees.map((empIdStr, i) => {
                          const emp = employeePool.find((e) => e.empId === empIdStr);
                          const isMe = empIdStr === myEmpId;
                          // A scoped guest record means restricted tab access; otherwise they get
                          // the normal assigned-employee view of the project.
                          const guest = emp?.id ? guestsList.find((g) => g.userId === emp.id) : undefined;
                          // A scoped grant (guests[].tabPermissions) wins; otherwise fall back to
                          // the per-tab allowlist, so the column always states what is really true.
                          const visibleTabCount = guest
                            ? allTabsAll.filter((t) => !!guest.tabPermissions?.[t.id]).length
                            : allTabsAll.filter((t) => employeeCanSeeTab(empIdStr, t.id)).length;
                          return (
                            <tr key={empIdStr} className="hover:bg-slate-50/40">
                              <td className="px-3 py-2.5 text-[11px] font-bold text-slate-400 tabular-nums align-top">{i + 1}</td>
                              <td className="px-3 py-2.5 align-top">
                                <span className="text-xs font-bold text-slate-800">{emp?.name ?? empIdStr}</span>
                                {isMe && <span className="ml-1.5 text-[9px] font-bold text-primary uppercase tracking-widest">(You)</span>}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-slate-600 align-top">{emp?.jobTitle || <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-2.5 text-[11px] font-bold text-slate-500 align-top tabular-nums">{empIdStr}</td>
                              {/* Tab access is managed right here, the same way the profile's
                                  Access page does it: how many of this project's tabs the person
                                  can currently see, and Manage access to change it. */}
                              <td className="px-3 py-2.5 align-top">
                                {!guest && visibleTabCount === allTabsAll.length ? (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold whitespace-nowrap">All tabs</span>
                                ) : visibleTabCount === 0 ? (
                                  <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold whitespace-nowrap">No tabs</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold whitespace-nowrap">{visibleTabCount} of {allTabsAll.length} tabs</span>
                                )}
                                {figuresOn(emp?.id, false) && figuresBadge}
                              </td>
                              {isOwner && (
                                <td className="px-3 py-2.5 align-top">
                                  <div className="flex items-center gap-1.5 justify-end">
                                    <button onClick={() => setEmpAccessFor(empIdStr)} title="Choose which tabs this person can see on this project" className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200">Manage access</button>
                                    {guest && (
                                      <button onClick={() => openEditGuest(guest)} title="Edit their scoped login" className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200">Login access</button>
                                    )}
                                    <button onClick={() => void unassignEmployee(empIdStr, emp?.name || empIdStr)} title="Remove from this project" className="p-1.5 rounded text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs font-bold text-slate-400">{assignedEmployees.length} assigned</p>
              </div>
            )}

            {/* ── SUBCONTRACTORS (each one is its own nested tab) ── */}
            {/* ── PARTNERS (JV) — reuses the subcontractor guest system for full-access login ── */}
            {subsSubTab === "partners" && (
              <div className="space-y-6">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                  <div>
                    <h3 className="text-lg font-display font-bold text-slate-900 mb-1">Joint Venture Partner</h3>
                    <p className="text-xs font-medium text-slate-400">The partner is set in <strong>Project Identity</strong>. Manage their info and grant a full-access login here.</p>
                  </div>
                  {!jvInfo.enabled ? (
                    <p className="text-sm text-slate-400 italic">No joint venture partner on this project. {isOwner ? <button onClick={() => setShowEditIdentity(true)} className="text-primary font-bold hover:underline">Enable it in Project Identity</button> : "Enable it in Project Identity."}</p>
                  ) : (
                    (() => {
                      const active = activePartnerTab || "overview";
                      const btn = (on: boolean) => `px-4 py-2 rounded-xl text-xs font-bold transition-all ${on ? "bg-slate-900 text-white shadow" : "bg-white border border-slate-100 text-slate-500 hover:text-slate-900"}`;
                      const pt = partnerTabs.find((t) => t.tabId === active);
                      return (
                      <>
                        {/* Partner subtab row — Overview first, then custom tabs; sits under the main tabs */}
                        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
                          <button onClick={() => setActivePartnerTab("overview")} className={btn(active === "overview")}>Overview</button>
                          {partnerTabs.map((t) => <button key={t.tabId} onClick={() => setActivePartnerTab(t.tabId)} className={btn(active === t.tabId)}>{t.label || "Tab"}</button>)}
                          {canEdit && <button onClick={addPartnerTab} className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-primary border border-dashed border-primary/30 hover:bg-primary/5"><Plus size={13} /> Add tab</button>}
                        </div>

                        {active === "overview" ? (
                          <div className="space-y-6">
                            {renderJVSection(!isOwner)}
                            {/* Partner login access — same guest mechanism as subcontractors, but full access */}
                            <div className="border-t border-slate-100 pt-6 space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <h4 className="text-sm font-bold text-slate-800">Partner login access</h4>
                                  <p className="text-[11px] text-slate-400">Partners can see everything on this project. Grant them a login just like a subcontractor.</p>
                                </div>
                                {isOwner && !partnerGuest && <button onClick={openPartnerAccess} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary shrink-0"><Plus size={13} /> Grant full access</button>}
                              </div>
                              {partnerGuest ? (
                                <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-2xl">
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">{partnerGuest.name || partnerGuest.email}</p>
                                    <p className="text-[11px] text-slate-400 truncate">{partnerGuest.email} · full access</p>
                                  </div>
                                  {isOwner && (
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button onClick={() => openEditGuest(partnerGuest, true)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200">Edit access</button>
                                      <button onClick={() => removePartnerAccess(partnerGuest)} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold hover:bg-red-100">Remove</button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-[11px] text-slate-400 italic">No partner login yet.{isOwner ? " Set the partner's email above, then Grant full access." : ""}</p>
                              )}
                            </div>
                            {/* Partner agreements — project-context adapter of the agreement engine */}
                            {id && (
                              <div className="border-t border-slate-100 pt-6">
                                <AgreementsPanel
                                  ctx={{ kind: "project", projectId: id, entityType: "partner", entityId: "jv" }}
                                  canManage={canEdit && !isGuest}
                                  // The partner's own login (matched by the JV email) signs in-app.
                                  canSign={isGuest && !!jvInfo.email && (getAuthUser()?.email || "").toLowerCase() === jvInfo.email.trim().toLowerCase()}
                                  defaults={{
                                    projectName: project?.name || "", projectNo: project?.id || "", projectLocation: project?.location || "",
                                    party2: { name: jvInfo.partnerName, contactName: jvInfo.contactName, address: jvInfo.partnerAddress, email: jvInfo.email, phone: jvInfo.phone, logoUrl: jvInfo.logo },
                                    jv: { name: jvInfo.partnerName, logoUrl: jvInfo.logo },
                                    contextLines: [
                                      { label: "Project", value: project?.name || "" },
                                      { label: "Project No", value: project?.id || "" },
                                      { label: "Location", value: project?.location || "" },
                                      ...(jvInfo.lead ? [{ label: "Project lead", value: jvInfo.lead }] : []),
                                    ],
                                  }}
                                />
                              </div>
                            )}
                            {isOwner && <p className="text-[11px] text-slate-400 italic">Remember to click <strong>Save Workspace</strong> at the top to persist partner info edits.</p>}
                          </div>
                        ) : !pt ? null : (
                          <div className="bg-slate-50 rounded-2xl p-4 space-y-4">
                            <div className="flex items-center justify-between gap-2">
                              {canEdit ? (
                                <input value={pt.label} onChange={(e) => renamePartnerTab(pt.tabId, e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/10" />
                              ) : <h4 className="text-sm font-bold text-slate-800">{pt.label}</h4>}
                              {canEdit && <button onClick={() => { removePartnerTab(pt.tabId); setActivePartnerTab("overview"); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold hover:bg-red-100"><Trash2 size={12} /> Delete tab</button>}
                            </div>
                            {/* Custom fields */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Custom fields</p>
                                {canEdit && <button onClick={() => addPartnerField(pt.tabId)} className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"><Plus size={11} /> Add field</button>}
                              </div>
                              {pt.fields.length === 0 ? (
                                <p className="text-[11px] text-slate-400 italic">No custom fields.{canEdit ? " Add one." : ""}</p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {pt.fields.map((f) => (
                                    <div key={f.fieldId} className="bg-white rounded-xl border border-slate-100 p-2.5 space-y-1.5">
                                      <div className="flex items-center gap-1.5">
                                        {canEdit ? <input value={f.label} onChange={(e) => updatePartnerField(pt.tabId, f.fieldId, { label: e.target.value })} onBlur={savePartnerTabs} placeholder="Field label" className="flex-grow bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[11px] font-bold outline-none" /> : <span className="flex-grow text-[11px] font-bold text-slate-600">{f.label}</span>}
                                        {canEdit && (
                                          <select value={f.type} onChange={(e) => { updatePartnerField(pt.tabId, f.fieldId, { type: e.target.value as typeof f.type }); savePartnerTabs(); }} className="bg-slate-50 border border-slate-100 rounded-lg px-1.5 py-1 text-[10px] font-bold outline-none">
                                            {(["text", "textarea", "number", "date", "email", "url", "select"] as const).map((tp) => <option key={tp} value={tp}>{tp}</option>)}
                                          </select>
                                        )}
                                        {canEdit && <button onClick={() => removePartnerField(pt.tabId, f.fieldId)} className="text-slate-300 hover:text-red-500"><X size={13} /></button>}
                                      </div>
                                      {f.type === "select" && canEdit && (
                                        <input value={(f.options || []).join(", ")} onChange={(e) => updatePartnerField(pt.tabId, f.fieldId, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} onBlur={savePartnerTabs} placeholder="Options (comma-separated)" className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[10px] outline-none" />
                                      )}
                                      {f.type === "textarea" ? (
                                        <textarea value={f.value || ""} disabled={!canEdit} onChange={(e) => updatePartnerField(pt.tabId, f.fieldId, { value: e.target.value })} onBlur={savePartnerTabs} rows={2} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-xs outline-none resize-y" />
                                      ) : f.type === "select" ? (
                                        <select value={f.value || ""} disabled={!canEdit} onChange={(e) => { updatePartnerField(pt.tabId, f.fieldId, { value: e.target.value }); savePartnerTabs(); }} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-xs outline-none">
                                          <option value="">—</option>
                                          {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                      ) : (
                                        <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"} value={f.value || ""} disabled={!canEdit} onChange={(e) => updatePartnerField(pt.tabId, f.fieldId, { value: e.target.value })} onBlur={savePartnerTabs} className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-xs outline-none" />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Files for this partner tab */}
                            {id && <DocSection projectId={id} section={`partner-${pt.tabId}`} title="Files" canEdit={canEdit} canPublish={isOwner} />}
                          </div>
                        )}
                      </>
                      );
                    })()
                  )}
                </div>
              </div>
            )}

            {/* ── VENDORS — project vendors (shared with the RFQ tab), each holding agreements ── */}
            {subsSubTab === "vendors" && (
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
                <div>
                  <h3 className="text-lg font-display font-bold text-slate-900 mb-1">Vendors</h3>
                  <p className="text-xs font-medium text-slate-400">Only the vendors on this project appear here (Procurement → RFQs uses the same list). Add one from the Directory; <strong>Manage access</strong> gives its login the tabs you choose. Agreements you create here belong to <strong>this project</strong>.</p>
                </div>
                {canEdit && !isGuest && (
                  <div className="max-w-sm">
                    <CompanyPicker
                      value={newVendorName}
                      category="vendor"
                      categories={["vendor", "manufacturer", "supplier"]}
                      onNameChange={setNewVendorName}
                      onSelectCompany={addVendorFromCompany}
                      placeholder="Search or add a vendor from the Directory…"
                      hint="Vendors come from the Directory. Pick one, quick-add, or open the Directory for the full form."
                      size="sm"
                    />
                  </div>
                )}
                {projVendors.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No vendors yet — add one above (it joins the shared list used in <strong>Procurement → RFQs → Vendors</strong>).</p>
                ) : (
                  <>
                    {/* CR-P (80) — the same table as the project team: who is on the project, their
                        access, and Manage access / Remove per row. Open shows the details below. */}
                    <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                      <table className="w-full min-w-[720px] text-left">
                        <thead>
                          <tr className="bg-slate-50/50 border-b border-slate-100">
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-10">#</th>
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name</th>
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contact</th>
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Access</th>
                            <th className="px-3 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {projVendors.map((v, idx) => {
                            const g = vendorGuest(v);
                            const tabs = g ? allTabsAll.filter((t) => !!g.tabPermissions?.[t.id]).length : 0;
                            return (
                              <tr key={v._id} className={activeVendorId === v._id ? "bg-primary/5" : "hover:bg-slate-50/40"}>
                                <td className="px-3 py-2.5 text-[11px] font-bold text-slate-400 tabular-nums">{idx + 1}</td>
                                <td className="px-3 py-2.5"><button onClick={() => setActiveVendorId(v._id)} className="text-xs font-bold text-slate-800 hover:text-primary text-left">{v.name || "Vendor"}</button></td>
                                <td className="px-3 py-2.5 text-xs text-slate-600">{[v.contactName, v.email].filter(Boolean).join(" · ") || <span className="text-slate-300">-</span>}</td>
                                <td className="px-3 py-2.5">
                                  {!g ? <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold whitespace-nowrap">No login</span>
                                    : tabs === 0 ? <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold whitespace-nowrap">No tabs</span>
                                    : <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold whitespace-nowrap">{tabs} of {allTabsAll.length} tabs</span>}
                                  {g && figuresOn(g.userId, true) && figuresBadge}
                                </td>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1.5 justify-end">
                                    <button onClick={() => setActiveVendorId(v._id)} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200">Open</button>
                                    {isOwner && !isGuest && (
                                      <button onClick={() => (g ? openEditGuest(g) : void openGrantAccessForVendor(v))} title="Choose which tabs this vendor's login can see" className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200">Manage access</button>
                                    )}
                                    {canEdit && !isGuest && (
                                      <button onClick={() => void removeVendor(v)} title="Remove from this project" className="p-1.5 rounded text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {(() => {
                      const v = projVendors.find((x) => x._id === activeVendorId);
                      if (!v || !id) return null;
                      // CR-P-05 — preview + edit the vendor's details in-place. This is the SAME shared
                      // Vendor record used in Procurement → RFQs, so edits sync both ways.
                      const vInp = "w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
                      const vLbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
                      const vEditable = canEdit && !isGuest;
                      const vField = (field: keyof ApiVendor, label: string, opts?: { type?: string; placeholder?: string }) => (
                        <div className="space-y-1">
                          <label className={vLbl}>{label}</label>
                          <input className={vInp} type={opts?.type || "text"} value={(v[field] as string) || ""} disabled={!vEditable} placeholder={opts?.placeholder || ""} onChange={(e) => patchVendorLocal(v._id, field, e.target.value)} onBlur={(e) => saveVendorField(v._id, field, e.target.value)} />
                        </div>
                      );
                      return (
                        <div className="space-y-4">
                          {/* CR-P-05 — read-only preview; Edit opens a modal. */}
                          <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl space-y-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <Building2 size={15} className="text-slate-400" />
                                <h4 className="text-sm font-bold text-slate-900">Vendor details</h4>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">· synced with Procurement → RFQs</span>
                              </div>
                              {vEditable && (
                                <div className="flex items-center gap-1.5">
                                  <button onClick={() => setEditVendorOpen(true)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 bg-white border border-slate-200 hover:text-primary"><Edit2 size={12} /> Edit</button>
                                  <button onClick={() => removeVendor(v)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={12} /> Delete</button>
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                              {[
                                ["Vendor name", v.name],
                                ["Contact person", v.contactName],
                                ["Email", v.email],
                                ["Phone", v.phone],
                                ["City", v.city],
                                ["Country", v.country],
                              ].map(([label, val]) => (
                                <div key={label} className="flex flex-col">
                                  <span className={vLbl}>{label}</span>
                                  <span className="text-xs font-medium text-slate-700">{val || <span className="text-slate-300">—</span>}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* CR-P-05 — vendor edit modal (edits the shared RFQ vendor record). */}
                          {vEditable && editVendorOpen && (
                            <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
                              <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />
                              <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
                                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                                  <div className="flex items-center gap-2">
                                    <Building2 size={16} className="text-primary" />
                                    <h3 className="text-base font-display font-bold text-slate-900">Edit vendor</h3>
                                  </div>
                                  <button onClick={() => setEditVendorOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} /></button>
                                </div>
                                <div className="p-5 space-y-3">
                                  <p className="text-[11px] text-slate-400">Changes save automatically to the <strong>shared</strong> vendor used in Procurement → RFQs.</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="sm:col-span-2">{vField("name", "Vendor name", { placeholder: "Vendor / supplier name" })}</div>
                                    {vField("contactName", "Contact person", { placeholder: "Attn." })}
                                    {vField("email", "Email", { type: "email", placeholder: "name@company.com" })}
                                    {vField("phone", "Phone", { placeholder: "+1 …" })}
                                    {vField("city", "City")}
                                    {vField("country", "Country")}
                                  </div>
                                </div>
                                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/60">
                                  <button onClick={() => removeVendor(v).then(() => setEditVendorOpen(false))} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 mr-auto"><Trash2 size={12} /> Delete vendor</button>
                                  <button onClick={() => setEditVendorOpen(false)} className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary">Done</button>
                                </div>
                              </div>
                            </div>
                          )}
                          <AgreementsPanel
                            ctx={{ kind: "project", projectId: id, entityType: "vendor", entityId: v._id }}
                            canManage={canEdit && !isGuest}
                            canSign={false}
                            defaults={{
                              projectName: project?.name || "", projectNo: project?.id || "", projectLocation: project?.location || "",
                              party2: { name: v.name, contactName: v.contactName, address: [v.city, v.country].filter(Boolean).join(", "), email: v.email, phone: v.phone, logoUrl: "" },
                              jv: { name: jvInfo.partnerName, logoUrl: jvInfo.logo },
                              contextLines: [
                                { label: "Project", value: project?.name || "" },
                                { label: "Project No", value: project?.id || "" },
                                { label: "Location", value: project?.location || "" },
                              ],
                            }}
                          />
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}

            {subsSubTab === "subcontractors" && (
              <div className="space-y-6">
                {/* CR-P (80) — the same flow as the project team: a table of the subcontractors on
                    this project, "Add subcontractor" (Directory pick, then tab access), and per row
                    Manage access and Remove with a confirmation. Open shows the record below. */}
                <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="text-lg font-display font-bold text-slate-900 mb-1">Subcontractors</h3>
                      <p className="text-xs font-medium text-slate-400">Only the subcontractors on this project appear here. Add one from the Directory, then choose which tabs its login can see.</p>
                    </div>
                    {canEdit && !isGuest && (
                      <button onClick={openAddSub} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-bold hover:bg-primary shrink-0">
                        <Plus size={13} /> Add subcontractor
                      </button>
                    )}
                  </div>
                  {subcontractors.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 text-slate-400 bg-slate-50 rounded-3xl">
                      <Building2 size={30} className="mb-2" />
                      <p className="text-sm font-bold">No subcontractors yet.</p>
                      {canEdit && !isGuest && <p className="text-xs mt-1">Click Add subcontractor to pick one from the Directory.</p>}
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                      <table className="w-full min-w-[720px] text-left">
                        <thead>
                          <tr className="bg-slate-50/50 border-b border-slate-100">
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-10">#</th>
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name</th>
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scope</th>
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contact</th>
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Access</th>
                            <th className="px-3 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {subcontractors.map((s, idx) => {
                            const g = (s.userId ? guestsList.find((x) => x.userId === s.userId) : undefined)
                              || (s.email ? guestsList.find((x) => x.email && x.email.toLowerCase() === s.email.toLowerCase()) : undefined);
                            const tabs = g ? allTabsAll.filter((t) => !!g.tabPermissions?.[t.id]).length : 0;
                            const active = Math.min(activeSubIdx, subcontractors.length - 1) === idx;
                            return (
                              <tr key={s.subId || idx} className={active ? "bg-primary/5" : "hover:bg-slate-50/40"}>
                                <td className="px-3 py-2.5 text-[11px] font-bold text-slate-400 tabular-nums align-top">{idx + 1}</td>
                                <td className="px-3 py-2.5 align-top">
                                  <button onClick={() => setActiveSubIdx(idx)} className="text-xs font-bold text-slate-800 hover:text-primary text-left">{s.name || "Unnamed"}</button>
                                  {s.subId && <span className="block text-[10px] text-slate-400">{s.subId}</span>}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-slate-600 align-top">{s.scope || <span className="text-slate-300">-</span>}</td>
                                <td className="px-3 py-2.5 text-xs text-slate-600 align-top">{[s.contact, s.email].filter(Boolean).join(" · ") || <span className="text-slate-300">-</span>}</td>
                                <td className="px-3 py-2.5 align-top">
                                  {!g ? <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold whitespace-nowrap">No login</span>
                                    : tabs === 0 ? <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold whitespace-nowrap">No tabs</span>
                                    : <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold whitespace-nowrap">{tabs} of {allTabsAll.length} tabs</span>}
                                  {g && figuresOn(g.userId, true) && figuresBadge}
                                </td>
                                <td className="px-3 py-2.5 align-top">
                                  <div className="flex items-center gap-1.5 justify-end">
                                    <button onClick={() => setActiveSubIdx(idx)} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200">Open</button>
                                    {isOwner && !isGuest && (
                                      <button onClick={() => (g ? openEditGuest(g) : void openGrantAccessFor(idx, s))} title="Choose which tabs this subcontractor's login can see" className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200">Manage access</button>
                                    )}
                                    {canEdit && !isGuest && (
                                      <button onClick={() => void handleDeleteSub(idx)} title="Remove from this project" className="p-1.5 rounded text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {subcontractors.length === 0 ? null : (() => {
                  const i = Math.min(activeSubIdx, subcontractors.length - 1);
                  const sub = subcontractors[i];
                  const docs = subDocs[sub.subId] || [];
                  // Prefer the hard link (login id stored on the record); fall back to email match.
                  const linked = (sub.userId ? guestsList.find((g) => g.userId === sub.userId) : undefined)
                    || (sub.email ? guestsList.find((g) => g.email && g.email.toLowerCase() === sub.email.toLowerCase()) : undefined);
                  const linkedUserId = sub.userId || linked?.userId || "";
                  const canManageSub = canEdit && !isGuest;
                  // A subcontractor with access to their Subs tab (view OR edit) may submit & edit their
                  // OWN invoices while still Pending — approval stays staff-only, enforced on the server.
                  const subHasInvoiceAccess = isGuest && (myGuestPerms["subs"] === "view" || myGuestPerms["subs"] === "edit");
                  const canAddInvoice = canManageSub || subHasInvoiceAccess;
                  const canEditInvoiceRow = (r: ApiSubInvoice) => canManageSub || (subHasInvoiceAccess && (r.approval || "pending") === "pending");
                  const n = (s: string) => parseFloat(String(s).replace(/[^0-9.-]/g, "")) || 0;
                  const invRows = subInvoices.filter((r) => r.subId === sub.subId);
                  const invTotal = invRows.reduce((sum, r) => sum + n(r.amount), 0);
                  const expRows = expenseRows.filter((e) =>
                    (linkedUserId && e.addedById === linkedUserId) ||
                    (sub.email && e.addedByEmail && e.addedByEmail.toLowerCase() === sub.email.toLowerCase()));
                  const expTotal = expRows.reduce((sum, e) => sum + (n(e.qty) || 1) * n(e.amount), 0);
                  const SHOW_SUB_CUSTOM_TABS = false; // custom subcontractor tabs hidden for now
                  const customMains = SHOW_SUB_CUSTOM_TABS ? (sub.customTabs || []).filter((t) => !t.parentId) : [];
                  const subInp = "bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/10";
                  const tabCls = (on: boolean) => `px-4 py-2 rounded-xl text-xs font-bold transition-all ${on ? "bg-slate-900 text-white shadow" : "bg-white border border-slate-100 text-slate-500 hover:text-slate-900"}`;
                  return (
                    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
                      {/* Inner tab bar */}
                      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
                        {[{ k: "info", label: "Info" }, { k: "agreement", label: "Agreements" }, { k: "invoices", label: "Invoices" }, { k: "expenses", label: "Expenses" }].map((t) => (
                          <button key={t.k} onClick={() => setSubInnerTab(t.k)} className={tabCls(subInnerTab === t.k)}>{t.label}</button>
                        ))}
                        {customMains.map((t) => (
                          <button key={t.tabId} onClick={() => { setSubInnerTab(`custom-${t.tabId}`); setSubCustomSub(""); }} className={tabCls(subInnerTab === `custom-${t.tabId}`)}>{t.label || "Tab"}</button>
                        ))}
                        {SHOW_SUB_CUSTOM_TABS && canManageSub && (
                          <button onClick={() => addSubCustomTab(i)} className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-primary border border-dashed border-primary/30 hover:bg-primary/5"><Plus size={13} /> Add tab</button>
                        )}
                      </div>

                      {/* INFO — details + login access */}
                      {subInnerTab === "info" && (
                        <div className="space-y-4">
                          <div className="p-4 bg-slate-50 rounded-2xl">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-900">{sub.name}</p>
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">{sub.subId}{sub.scope && ` · ${sub.scope}`}</p>
                                {(sub.contact || sub.email || sub.phone) && (<p className="text-xs text-slate-500 mt-1">{[sub.contact, sub.email, sub.phone].filter(Boolean).join(" · ")}</p>)}
                                {sub.notes && <p className="text-xs text-slate-500 mt-1 italic">{sub.notes}</p>}
                              </div>
                              {canManageSub && (
                                <div className="flex gap-1 flex-shrink-0">
                                  <button onClick={() => openEditSub(i)} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-white transition-all" title="Edit"><Edit2 size={14} /></button>
                                  <button onClick={() => handleDeleteSub(i)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-white transition-all" title="Delete"><Trash2 size={14} /></button>
                                </div>
                              )}
                            </div>
                          </div>
                          {!isGuest && (<SubcontractorResumes subcontractorName={sub.name} canManage={canManageSub} />)}
                          {isOwner && (
                            <div className="bg-slate-50 rounded-2xl p-4">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Login Access</p>
                                <div className="flex items-center gap-3">
                                  {linked ? (
                                    <>
                                      <button onClick={() => openEditGuest(linked)} className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"><Edit2 size={11} /> Edit access</button>
                                      <button onClick={() => removeSubAccess(i, linked)} className="text-[10px] font-bold text-red-500 hover:underline flex items-center gap-1"><Trash2 size={11} /> Remove</button>
                                    </>
                                  ) : (
                                    <button onClick={() => openGrantAccessFor(i, sub)} className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"><Plus size={11} /> Grant access</button>
                                  )}
                                </div>
                              </div>
                              {linked ? (
                                <p className="text-[11px] text-slate-500 mt-2">Has a login — {linked.email}{linked.expiresAt ? ` · access until ${new Date(linked.expiresAt).toLocaleDateString()}` : " · no expiry"}. Their logged expenses appear in the Expenses tab automatically.</p>
                              ) : (
                                <p className="text-[11px] text-slate-400 italic mt-2">No login yet. Grant access so this subcontractor can sign in and log their own expenses.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* AGREEMENTS — CR-P (69): the one shared agreement builder, the same engine
                          as the General Agreements page and the employee profile. */}
                      {subInnerTab === "agreement" && (
                        <div className="space-y-4">
                          {sub.scope && (
                            <div className="bg-slate-50 rounded-2xl p-4">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Scope</p>
                              <p className="text-sm text-slate-700">{sub.scope}</p>
                            </div>
                          )}
                          {/* Generated & signable agreements — the shared agreement engine. The sub's
                              linked login can review and sign these from their side. */}
                          {id && (
                            <AgreementsPanel
                              ctx={{ kind: "project", projectId: id, entityType: "subcontractor", entityId: sub.subId }}
                              canManage={canManageSub}
                              canSign={isGuest && linkedUserId === getAuthUser()?.id}
                              defaults={{
                                projectName: project?.name || "", projectNo: project?.id || "", projectLocation: project?.location || "",
                                party2: { name: sub.name, contactName: sub.contact || "", address: "", email: sub.email || "", phone: sub.phone || "", logoUrl: "" },
                                jv: { name: jvInfo.partnerName, logoUrl: jvInfo.logo },
                                contextLines: [
                                  { label: "Project", value: project?.name || "" },
                                  { label: "Project No", value: project?.id || "" },
                                  { label: "Location", value: project?.location || "" },
                                  ...(sub.scope ? [{ label: "Scope", value: sub.scope }] : []),
                                ],
                              }}
                            />
                          )}
                          {/* CR-P (69) — a second, weaker agreement system ("upload a bundle of
                              agreement / offer / other files") used to sit here under the real
                              builder, so one tab offered two different ways to make an agreement.
                              "You don't need this. Delete this completely. Use the exact same thing
                              in here." Files that belong to an agreement are now attached to its
                              sections in the builder above. */}
                        </div>
                      )}

                      {/* INVOICES — per-row table (item # · description · amount · remarks · date · attachments) */}
                      {subInnerTab === "invoices" && (
                        <div className="bg-slate-50 rounded-2xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><DollarSign size={11} /> Invoices ({invRows.length})</p>
                            {canAddInvoice && <button onClick={() => addSubInvoiceRow(sub.subId)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Plus size={12} /> Add invoice</button>}
                          </div>
                          <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
                            <table className="w-full min-w-[640px] text-xs">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                  {["#", "Description", "Amount", "Remarks", "Date", "Approval", "Attachments", ""].map((h) => (
                                    <th key={h} className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px] whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {invRows.length === 0 ? (
                                  <tr><td colSpan={8} className="px-3 py-6 text-center text-[11px] text-slate-400 italic">No invoices yet.{canAddInvoice ? " Click “Add invoice”." : ""}</td></tr>
                                ) : (
                                  invRows.map((r, ri) => (
                                    <tr key={r._id} className="hover:bg-slate-50/40 align-top">
                                      <td className="px-3 py-2 text-slate-400 font-bold text-[11px]">{ri + 1}</td>
                                      <td className="px-2 py-1.5">{canEditInvoiceRow(r) ? <AutoTextarea value={r.description} onChange={(v) => editSubInvoiceCell(r._id, "description", v)} onBlur={(v) => saveSubInvoiceCell(r._id, "description", v)} className={`${subInp} min-w-[12rem] w-full`} /> : <span className="font-bold text-slate-700 whitespace-pre-wrap">{r.description || "—"}</span>}</td>
                                      <td className="px-2 py-1.5">{canEditInvoiceRow(r) ? <MoneyInput value={r.amount} onChange={(v) => editSubInvoiceCell(r._id, "amount", v)} onBlur={(v) => saveSubInvoiceCell(r._id, "amount", v)} className={`${subInp} w-28`} /> : <span className="text-slate-700">{fmtMoney(r.amount) || r.amount || "—"}</span>}</td>
                                      <td className="px-2 py-1.5">{canEditInvoiceRow(r) ? <AutoTextarea value={r.remarks} onChange={(v) => editSubInvoiceCell(r._id, "remarks", v)} onBlur={(v) => saveSubInvoiceCell(r._id, "remarks", v)} className={`${subInp} min-w-[8rem] w-full`} /> : <span className="text-slate-600 whitespace-pre-wrap">{r.remarks || "—"}</span>}</td>
                                      <td className="px-2 py-1.5">{canEditInvoiceRow(r) ? <input type="date" value={r.date} onChange={(e) => editSubInvoiceCell(r._id, "date", e.target.value)} onBlur={(e) => saveSubInvoiceCell(r._id, "date", e.target.value)} className={`${subInp} w-36`} /> : <span className="text-slate-500">{r.date || "—"}</span>}</td>
                                      <td className="px-2 py-1.5">{canManageSub ? (
                                        <select value={r.approval || "pending"} onChange={(e) => setSubInvoiceApproval(r._id, e.target.value)} className={`${subInp} font-bold ${approvalBadgeClass(r.approval)}`}>
                                          <option value="pending">Pending</option>
                                          <option value="approved">Approved</option>
                                          <option value="rejected">Rejected</option>
                                        </select>
                                      ) : (
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${approvalBadgeClass(r.approval)}`}>{approvalLabel(r.approval)}</span>
                                      )}</td>
                                      <td className="px-2 py-1.5">
                                        <div className="flex flex-col gap-1">
                                          {(r.attachments || []).map((a) => (
                                            <div key={a._id} className="flex items-center gap-1">
                                              <button onClick={() => setAttachmentPreview({ name: a.name, url: attachmentUrl(a.filePath), fileType: a.fileType })} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 hover:text-primary max-w-[150px] truncate" title={a.name}><FileText size={10} /> {a.name}</button>
                                              {canEditInvoiceRow(r) && <button onClick={() => removeSubInvoiceAtt(r._id, a._id)} className="text-slate-300 hover:text-red-500"><X size={11} /></button>}
                                            </div>
                                          ))}
                                          {canEditInvoiceRow(r) && <label className="inline-flex items-center gap-1 text-[10px] font-bold text-primary cursor-pointer hover:underline"><Upload size={10} /> Add<input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSubInvoiceAtt(r._id, f); e.target.value = ""; }} /></label>}
                                          {!canEditInvoiceRow(r) && (r.attachments || []).length === 0 && <span className="text-slate-300">—</span>}
                                        </div>
                                      </td>
                                      <td className="px-2 py-1.5">{canEditInvoiceRow(r) && <button onClick={() => removeSubInvoiceRow(r._id)} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={13} /></button>}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                              {invRows.length > 0 && (
                                <tfoot>
                                  <tr className="border-t border-slate-100">
                                    <td />
                                    <td className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</td>
                                    <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap">{fmtMoney(invTotal)}</td>
                                    <td colSpan={5} />
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                          {canManageSub && <p className="text-[10px] text-slate-400 mt-2">This table's total is counted as invoiced income on the project &amp; portfolio reports.</p>}
                        </div>
                      )}

                      {/* EXPENSES — this subcontractor's logged expenses */}
                      {subInnerTab === "expenses" && (
                        <div className="bg-slate-50 rounded-2xl p-4">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><DollarSign size={11} /> Logged Expenses ({expRows.length})</p>
                          <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
                            <table className="w-full min-w-[560px] text-xs">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                  {["#", "Description", "Qty", "Unit Price", "Total Price", "Remarks", "Date", "Attachments", "Approval"].map((h) => (
                                    <th key={h} className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px] whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {expRows.length === 0 ? (
                                  <tr><td colSpan={9} className="px-3 py-6 text-center text-[11px] text-slate-400 italic">{linkedUserId ? "No expenses logged by this subcontractor yet." : "Grant a login (Info tab) — their logged expenses appear here automatically."}</td></tr>
                                ) : (
                                  expRows.map((e, ri) => (
                                    <tr key={e._id} className="hover:bg-slate-50/40 align-top">
                                      <td className="px-3 py-2 text-slate-400 font-bold text-[11px]">{ri + 1}</td>
                                      <td className="px-3 py-2 font-bold text-slate-700 whitespace-pre-wrap">{e.description || "—"}</td>
                                      <td className="px-3 py-2 text-slate-600">{e.qty || "—"}</td>
                                      <td className="px-3 py-2 text-slate-600">{fmtMoney(e.amount) || e.amount || "—"}</td>
                                      <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap">{fmtMoney((n(e.qty) || 1) * n(e.amount))}</td>
                                      <td className="px-3 py-2 text-slate-600 whitespace-pre-wrap">{e.remarks || "—"}</td>
                                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{e.date || "—"}</td>
                                      <td className="px-3 py-2">
                                        {(e.attachments || []).length === 0 ? (<span className="text-slate-300">—</span>) : (
                                          <div className="flex flex-col gap-1">
                                            {(e.attachments || []).map((a) => (
                                              <button key={a._id} onClick={() => setAttachmentPreview({ name: a.name, url: attachmentUrl(a.filePath), fileType: a.fileType })} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 hover:text-primary max-w-[150px] truncate" title={a.name}><FileText size={10} /> {a.name}</button>
                                            ))}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${approvalBadgeClass(e.approval)}`}>{e.approval || "pending"}</span>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                              {expRows.length > 0 && (
                                <tfoot>
                                  <tr className="border-t border-slate-100">
                                    <td colSpan={4} />
                                    <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap">{fmtMoney(expTotal)}</td>
                                    <td colSpan={4} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </div>
                      )}

                      {/* CUSTOM TABS — files + notes, with sub-tabs */}
                      {subInnerTab.startsWith("custom-") && (() => {
                        const mainId = subInnerTab.slice("custom-".length);
                        const main = (sub.customTabs || []).find((t) => t.tabId === mainId);
                        if (!main) return null;
                        const subTabs = (sub.customTabs || []).filter((t) => t.parentId === mainId);
                        const activeId = subCustomSub && subTabs.some((t) => t.tabId === subCustomSub) ? subCustomSub : (subTabs[0]?.tabId || mainId);
                        const activeTab = (sub.customTabs || []).find((t) => t.tabId === activeId) || main;
                        return (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              {canManageSub
                                ? <input value={main.label} onChange={(e) => renameSubCustomTab(i, main.tabId, e.target.value)} onBlur={persistSubcontractors} className="text-sm font-bold text-slate-800 bg-transparent border-b border-transparent focus:border-primary/30 outline-none py-1" />
                                : <p className="text-sm font-bold text-slate-800">{main.label}</p>}
                              {canManageSub && <button onClick={() => deleteSubCustomTab(i, main.tabId)} className="text-[10px] font-bold text-red-500 hover:underline flex items-center gap-1"><Trash2 size={11} /> Delete tab</button>}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {subTabs.map((t) => (
                                <button key={t.tabId} onClick={() => setSubCustomSub(t.tabId)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${activeId === t.tabId ? "bg-primary text-white" : "bg-slate-100 text-slate-500 hover:text-slate-900"}`}>{t.label || "Sub-tab"}</button>
                              ))}
                              {canManageSub && <button onClick={() => addSubCustomTab(i, main.tabId)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-primary border border-dashed border-primary/30 hover:bg-primary/5"><Plus size={12} /> Sub-tab</button>}
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                              {activeTab.tabId !== main.tabId && canManageSub && (
                                <input value={activeTab.label} onChange={(e) => renameSubCustomTab(i, activeTab.tabId, e.target.value)} onBlur={persistSubcontractors} className="text-xs font-bold text-slate-700 bg-white border border-slate-100 rounded-lg px-2 py-1 outline-none" />
                              )}
                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notes</label>
                                <textarea value={activeTab.notes || ""} onChange={(e) => setSubCustomNotes(i, activeTab.tabId, e.target.value)} onBlur={persistSubcontractors} disabled={!canManageSub} rows={3} placeholder="Notes for this tab…" className="mt-1 w-full bg-white border border-slate-100 rounded-xl p-2 text-xs outline-none focus:ring-2 focus:ring-primary/10 resize-none disabled:opacity-70" />
                              </div>
                              {id && <DocSection projectId={id} section={`subcontractor-${sub.subId}-tab-${activeTab.tabId}`} title="Files" canEdit={canManageSub} canPublish={isOwner} />}
                              {activeTab.tabId !== main.tabId && canManageSub && <button onClick={() => deleteSubCustomTab(i, activeTab.tabId)} className="text-[10px] font-bold text-red-500 hover:underline flex items-center gap-1"><Trash2 size={11} /> Delete sub-tab</button>}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>
            )}
            </div>
          )}

          {/* LEGAL DOCS */}
          {activeTab === "legal" && id && (
            /* CR-P (152) — the same tab system as Project Management. */
            <DocTabs
              projectId={id}
              tableKey="legal-doc-tabs"
              sectionPrefix="legal"
              canEdit={canEdit}
              canManageTabs={canManage}
              canPublish={isOwner}
              defaults={[
                { id: "legal-office-reg", label: "Local Office Registration", section: "legal-office-reg" },
                { id: "legal-iloc", label: "ILOC (Irrevocable Letter of Credit)", section: "legal-iloc" },
                { id: "legal-bond", label: "Bond Documents", section: "legal-bond" },
                { id: "legal-insurance", label: "Insurance Certificates", section: "legal-insurance" },
                { id: "legal-tax", label: "Tax Documents", section: "legal-tax" },
              ]}
            />
          )}

          {/* FINANCES — sub-tab bar (Expenses / Invoice Sent / Invoice Received). CR-P-30 */}
          {activeTab === "finances" && (
            <div className="bg-slate-50 border border-slate-100 rounded-2xl px-3 py-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 shrink-0">Finances:</span>
              {finNav.map((t) => (
                <button key={t.key} onClick={() => setFinSub(t.key)} className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wide sm:tracking-widest transition-all whitespace-nowrap ${finActive === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/60"}`}>
                  <t.icon size={12} className="shrink-0" /> {t.label}
                </button>
              ))}
            </div>
          )}

          {/* EXPENSES (Finances → Expenses) — CR-P (153)-(160): line-item expenses in a pop-up,
              Manage with approval / rejection reason / conversation, past expenses in bulk, status
              filter and sorting, and the payables from invoices received (read-only). */}
          {activeTab === "finances" && finActive === "expenses" && id && (
            <ExpenseLog
              projectId={id}
              rows={expenseRows}
              setRows={(fn) => setExpenseRows(fn)}
              received={receivedInvoices}
              onRefreshReceived={() => { fetchInvoices(id, "received").then(setReceivedInvoices).catch(() => {}); }}
              onOpenReceived={() => setFinSub("invoice-received")}
              canEdit={canEdit}
              canApprove={canManage}
              canSeeFigures={canSeeFigures}
              five={projectFive}
            />
          )}

          {/* PURCHASE ORDERS */}
          {activeTab === "po" && id && (
            <div className="space-y-6">
              <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-xl font-display font-bold text-slate-900">Purchase Orders</h3>
                    <p className="text-xs text-slate-400 mt-1">{poRows.length} PO{poRows.length === 1 ? "" : "s"} · auto-saves on blur.</p>
                  </div>
                  {canEdit && (
                    <button
                      onClick={async () => {
                        try {
                          const row = await addPurchaseOrder(id, { poNumber: "", vendor: "", amount: "", date: "", status: "Draft" }) as PORow;
                          setPoRows((p) => [...p, row]);
                        } catch (err) { toast(err instanceof Error ? err.message : "Failed", "error"); }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary"
                    >
                      <Plus size={13} /> New PO
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-y border-slate-100">
                        {["PO Number", "Vendor", "Amount", "Date", "Status", ""].map((h) => (
                          <th key={h} className="text-left px-3 py-3 font-bold text-slate-500 uppercase tracking-widest text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {poRows.length === 0 && (
                        <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400 italic">No purchase orders yet.</td></tr>
                      )}
                      {poRows.map((row) => {
                        const cell = (field: keyof PORow, type: "text" | "date" = "text") => (
                          <td className="px-1 py-1 align-top">
                            <input
                              type={type}
                              value={(row[field] as string) || ""}
                              onChange={(e) => setPoRows((prev) => prev.map((r) => (r._id === row._id ? { ...r, [field]: e.target.value } : r)))}
                              onBlur={(e) => updatePurchaseOrder(id, row._id, { [field]: e.target.value })}
                              disabled={!canEdit}
                              className="w-full px-2 py-1.5 rounded bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none text-xs font-medium"
                            />
                          </td>
                        );
                        const select = (field: keyof PORow, options: string[]) => (
                          <td className="px-1 py-1 align-top">
                            <select
                              value={(row[field] as string) || ""}
                              onChange={(e) => { setPoRows((prev) => prev.map((r) => (r._id === row._id ? { ...r, [field]: e.target.value } : r))); updatePurchaseOrder(id, row._id, { [field]: e.target.value }); }}
                              disabled={!canEdit}
                              className="w-full px-2 py-1.5 rounded bg-transparent hover:bg-slate-50 focus:bg-white outline-none text-xs font-medium"
                            >
                              {options.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </td>
                        );
                        return (
                          <tr key={row._id} className="hover:bg-slate-50/40">
                            {cell("poNumber")}
                            {cell("vendor")}
                            {cell("amount")}
                            {cell("date", "date")}
                            {select("status", ["Draft", "Ordered", "Received", "Paid", "Cancelled"])}
                            <td className="px-2 py-1 align-top">
                              {canEdit && (
                                <button onClick={async () => { if (confirm("Delete?")) { await deletePurchaseOrder(id, row._id); setPoRows((p) => p.filter((r) => r._id !== row._id)); } }} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50" title="Delete row"><Trash2 size={13} /></button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <DocSection projectId={id} section="po-documents" title="PO Documents" canEdit={canEdit} canPublish={isOwner} />
            </div>
          )}

          {/* INVOICE SENT / RECEIVED — one ledger component, with payments + totals */}
          {activeTab === "finances" && (finActive === "invoice-sent" || finActive === "invoice-received") && id && (
            <div className="space-y-6">
              <InvoiceLedger projectId={id} kind={finActive === "invoice-sent" ? "sent" : "received"} canEdit={canEdit} projectInfo={projectPdfInfo(project)} onExpensesChanged={refreshExpenses} clientName={project?.clientInfo?.name} clientCompanyId={project?.clientInfo?.companyId} projectValue={project?.value} onRowsChange={(list) => (finActive === "invoice-sent" ? setSentInvoices(list) : setReceivedInvoices(list))} />
              <DocSection
                projectId={id}
                section={finActive === "invoice-sent" ? "invoice-sent-documents" : "invoice-received-documents"}
                title={finActive === "invoice-sent" ? "Invoice Documents" : "Bill Documents"}
                canEdit={canEdit}
                canPublish={isOwner}
              />
            </div>
          )}

          {/* PROCUREMENT LOG */}
          {activeTab === "procurement" && (
            <div className="space-y-5">
              {/* Procurement module sub-tabs (a guest only sees the sub-tabs granted to them) */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-3 py-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 shrink-0">Procurement:</span>
                {procNav.map((t) => (
                  <button key={t.k} onClick={() => setProcSub(t.k)} className={`px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wide sm:tracking-widest transition-all whitespace-nowrap ${procActive === t.k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/60"}`}>{t.label}</button>
                ))}
              </div>

              {/* canEdit is per sub-tab: staff get full edit; a guest gets edit only where granted. */}
              {procActive === "boq" && id && <ProcurementBOQ projectId={id} canEdit={procPermFor("boq") === "edit"} projectInfo={projectPdfInfo(project)} onGoToSubmittals={(itemId) => { setHighlightSubItem(itemId); setProcSub("submittals"); }} onGoToRFQ={(rfqId) => { setOpenRfqId(rfqId); setProcSub("rfqs"); }} onGoToPO={() => setProcSub("po")} />}
              {procActive === "log" && id && <ProcurementMasterLog projectId={id} canEdit={procPermFor("log") === "edit"} projectInfo={projectPdfInfo(project)} />}
              {procActive === "submittals" && id && <ProcurementSubmittals projectId={id} canEdit={procPermFor("submittals") === "edit"} projectName={project?.name} clientName={project?.clientInfo?.name} highlightItemId={highlightSubItem} onHighlightDone={() => setHighlightSubItem(undefined)} />}
              {procActive === "rfqs" && id && <ProcurementRFQ projectId={id} canEdit={procPermFor("rfqs") === "edit"} projectInfo={projectPdfInfo(project)} onGoToPO={() => setProcSub("po")} openRfqId={openRfqId} onOpenedRfq={() => setOpenRfqId(undefined)} />}
              {procActive === "quotes" && id && <ProcurementQuotes projectId={id} canEdit={procPermFor("quotes") === "edit"} />}
              {procActive === "po" && id && <ProcurementPO projectId={id} canEdit={procPermFor("po") === "edit"} projectInfo={projectPdfInfo(project)} onGoToBOQ={() => setProcSub("boq")} onGoToRFQ={() => setProcSub("rfqs")} onGoToQuotes={() => setProcSub("quotes")} />}
              {procActive === "invoices" && id && <ProcurementInvoices projectId={id} projectName={project?.name} canEdit={procPermFor("po") === "edit"} onGoToPO={() => setProcSub("po")} onGoToReceived={() => { setActiveTab("finances"); setFinSub("invoice-received"); }} />}
              {procActive === "shipment" && id && <ProcurementShipment projectId={id} canEdit={procPermFor("shipment") === "edit"} projectInfo={projectPdfInfo(project)} />}

              {procActive === "legacy" && (
            <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-xl font-display font-bold text-slate-900">Procurement Log <span className="text-[11px] font-bold text-slate-400">(legacy)</span></h3>
                  <p className="text-xs font-medium text-slate-400 mt-1">
                    Track every material order. {procurementRows.length} row{procurementRows.length === 1 ? "" : "s"}.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={exportProcurementCsv}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold"
                  >
                    <Download size={13} /> Export CSV
                  </button>
                  {canEdit && (
                    <button
                      onClick={handleAddProcurementRow}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary transition-all"
                    >
                      <Plus size={13} /> Add Row
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto -mx-6">
                <table className="w-full min-w-[1500px] text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-y border-slate-100">
                      {[
                        "Item #", "Item Description", "Submittal", "Status",
                        "Recommended Brand/Supplier", "QTY", "Unit", "Total",
                        "Currency", "Order Date", "Payment", "Paid By", "Remarks",
                        "Attachments", "Added By", "",
                      ].map((h) => (
                        <th key={h} className="text-left px-3 py-3 font-bold text-slate-500 uppercase tracking-widest text-[10px] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {procurementRows.length === 0 && (
                      <tr>
                        <td colSpan={16} className="px-3 py-12 text-center text-slate-400 italic text-sm font-medium">
                          No rows yet. {canEdit ? <>Click <strong>Add Row</strong> to log your first procurement item.</> : "Nothing has been logged yet."}
                        </td>
                      </tr>
                    )}
                    {procurementRows.map((row) => {
                      const cell = (field: keyof ApiProcurementRow, type: "text" | "date" = "text", w?: string) => {
                        const common = `w-full px-2 py-1.5 rounded bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none text-xs font-medium ${w ? w : ""}`;
                        const set = (v: string) => setProcurementRows((prev) => prev.map((r) => (r._id === row._id ? { ...r, [field]: v } : r)));
                        const save = (v: string) => handleUpdateProcurementCell(row._id, field, v);
                        if (field === "description" || field === "remarks")
                          return <td className="px-1 py-1 align-top"><AutoTextarea value={(row[field] as string) || ""} onChange={set} onBlur={save} disabled={!canEdit} className={common} /></td>;
                        if (field === "total")
                          return <td className="px-1 py-1 align-top"><MoneyInput value={(row[field] as string) || ""} currency={row.currency} onChange={set} onBlur={save} disabled={!canEdit} className={common} /></td>;
                        return (
                          <td className="px-1 py-1 align-top">
                            <input type={type} value={(row[field] as string) || ""} onChange={(e) => set(e.target.value)} onBlur={(e) => save(e.target.value)} disabled={!canEdit} className={common} />
                          </td>
                        );
                      };
                      const select = (field: keyof ApiProcurementRow, options: string[]) => (
                        <td className="px-1 py-1 align-top">
                          <select
                            value={row[field] as string}
                            onChange={(e) => handleUpdateProcurementCell(row._id, field, e.target.value)}
                            disabled={!canEdit}
                            className="w-full min-w-[8.5rem] pl-2 pr-7 py-1.5 rounded bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none text-xs font-medium"
                          >
                            <option value="">—</option>
                            {options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>
                      );
                      return (
                        <tr key={row._id} className="hover:bg-slate-50/40">
                          {cell("itemNo")}
                          {cell("description")}
                          {select("submittal", ["Not Required", "To Be Submitted", "Submitted", "Approved", "Rejected"])}
                          {cell("status")}
                          {cell("recommendedBrand")}
                          {cell("qty")}
                          {cell("unit")}
                          {cell("total")}
                          {select("currency", ["USD", "EUR", "GBP", "GHS", "TRY", "SAR", "AED"])}
                          {cell("orderDate", "date")}
                          {cell("payment")}
                          {cell("paidBy")}
                          {cell("remarks")}
                          {/* Attachments */}
                          <td className="px-2 py-1 align-top">
                            <div className="flex flex-wrap items-center gap-1 min-w-[150px]">
                              {(row.attachments || []).map((a) => (
                                <span key={a._id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600">
                                  <button onClick={() => setAttachmentPreview({ name: a.name, url: attachmentUrl(a.filePath), fileType: a.fileType })} className="hover:text-primary max-w-[80px] truncate" title={a.name}>{a.name}</button>
                                  {canEdit && (
                                    <button onClick={async () => { if (!confirm(`Delete "${a.name}"? The attachment is removed for good.`)) return; try { const u = await deleteProcurementAttachment(id!, row._id, a._id); setProcurementRows((p) => p.map((r) => (r._id === row._id ? u : r))); } catch (err) { toast(err instanceof Error ? err.message : "Failed", "error"); } }} className="text-slate-300 hover:text-red-500"><X size={11} /></button>
                                  )}
                                </span>
                              ))}
                              {canEdit && (
                                <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-bold cursor-pointer hover:bg-primary">
                                  <Plus size={10} />
                                  <input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f || !id) return; try { const u = await uploadProcurementAttachment(id, row._id, f); setProcurementRows((p) => p.map((r) => (r._id === row._id ? u : r))); } catch (err) { toast(err instanceof Error ? err.message : "Upload failed", "error"); } }} />
                                </label>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top text-[11px] text-slate-500 whitespace-nowrap">{row.addedByName || "—"}{(row.addedByRole === "subcontractor" || row.addedByRole === "guest") ? " (subcontractor)" : ""}</td>
                          <td className="px-2 py-1 align-top">
                            {canEdit && (
                              <button
                                onClick={() => handleDeleteProcurementRow(row._id)}
                                className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"
                                title="Delete row"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {procurementRows.length > 0 && (
                <p className="text-[10px] text-slate-400 italic">
                  Edits auto-save when you tab out of a cell.
                </p>
              )}
            </div>
              )}
            </div>
          )}

          {/* CUSTOM TABS */}
          {(() => {
            const activeCustom = customTabs.find((ct) => ct.id === activeTab);
            if (!activeCustom || !id) return null;
            const fields = activeCustom.fields || [];
            const renderField = (f: CustomField) => {
              const baseCls = "w-full bg-slate-50 border border-slate-100 rounded-2xl p-3 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-60";
              switch (f.type) {
                case "textarea":
                  return (
                    <textarea
                      rows={4}
                      value={f.value || ""}
                      onChange={(e) => updateTabFieldValue(activeCustom.id, f.fieldId, e.target.value)}
                      disabled={!canEdit}
                      className={`${baseCls} resize-none`}
                    />
                  );
                case "select":
                  return (
                    <select
                      value={f.value || ""}
                      onChange={(e) => updateTabFieldValue(activeCustom.id, f.fieldId, e.target.value)}
                      disabled={!canEdit}
                      className={`${baseCls} appearance-none`}
                    >
                      <option value="">—</option>
                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  );
                case "checkbox":
                  return (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={f.value === "true"}
                        onChange={(e) => updateTabFieldValue(activeCustom.id, f.fieldId, e.target.checked ? "true" : "false")}
                        disabled={!canEdit}
                        className="w-5 h-5 rounded text-primary focus:ring-primary/30"
                      />
                      <span className="text-sm text-slate-700">{f.value === "true" ? "Yes" : "No"}</span>
                    </label>
                  );
                case "file":
                  return (
                    <DocSection
                      projectId={id}
                      section={`custom-${activeCustom.id}-field-${f.fieldId}`}
                      title={f.label || "File"}
                      canEdit={canEdit}
                      canPublish={isOwner}
                    />
                  );
                default:
                  return (
                    <input
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
                      value={f.value || ""}
                      onChange={(e) => updateTabFieldValue(activeCustom.id, f.fieldId, e.target.value)}
                      disabled={!canEdit}
                      className={baseCls}
                    />
                  );
              }
            };

            return (
              <div className="space-y-6">
                <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-display font-bold text-slate-900">{activeCustom.label}</h3>
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <button
                          onClick={() => openEditFields(activeCustom.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-primary text-[10px] font-bold uppercase tracking-widest"
                          title="Edit fields"
                        >
                          <Edit2 size={11} /> Edit Fields
                        </button>
                      )}
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full uppercase tracking-widest">Custom Tab</span>
                    </div>
                  </div>

                  {/* Custom fields grid */}
                  {fields.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {fields.map((f) => {
                        const fullWidth = f.type === "textarea" || f.type === "file";
                        return (
                          <div key={f.fieldId} className={`space-y-2 ${fullWidth ? "md:col-span-2" : ""}`}>
                            {f.type !== "file" && (
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {f.label || <span className="italic text-slate-300">(Unnamed field)</span>}
                              </label>
                            )}
                            {renderField(f)}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Notes textarea (always available) */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notes</label>
                    <textarea
                      rows={5}
                      value={activeCustom.notes || ""}
                      onChange={(e) =>
                        setCustomTabs((prev) =>
                          prev.map((t) => (t.id === activeCustom.id ? { ...t, notes: e.target.value } : t))
                        )
                      }
                      disabled={!canEdit}
                      placeholder="Add notes or content for this section..."
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all resize-none disabled:opacity-60"
                    />
                    <p className="text-[10px] text-slate-400">Click <strong>Save Workspace</strong> to persist {fields.length > 0 ? "fields and notes" : "notes"}.</p>
                  </div>
                </div>
                <DocSection projectId={id} section={`custom-${activeCustom.id}`} title="Files for this section" canEdit={canEdit} canPublish={isOwner} />
              </div>
            );
          })()}

        </motion.div>
      </AnimatePresence>

      {/* Add Tab Modal */}
      <AnimatePresence>
        {showAddTab && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-[2.5rem] p-10 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-display font-bold text-slate-900">
                  {editingFieldsForTab
                    ? "Edit Custom Tab"
                    : addTabStep === "choose"
                      ? "Add Tab"
                      : addTabKind === "sub"
                        ? "Add Sub-tab"
                        : "Add Main Tab"}
                </h3>
                <button
                  onClick={closeAddTab}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              {addTabStep === "choose" && !editingFieldsForTab ? (
                <div className="space-y-3 mb-8">
                  <p className="text-sm text-slate-500 font-medium">What would you like to add?</p>
                  <button
                    type="button"
                    onClick={() => chooseTabKind("main")}
                    className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-slate-100 hover:border-primary hover:bg-primary/5 text-left transition-all group"
                  >
                    <span className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 group-hover:bg-primary transition-colors"><Building2 size={20} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-900">Main Tab</span>
                      <span className="block text-xs text-slate-500 mt-0.5">A new top-level tab in this workspace.</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseTabKind("sub")}
                    className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-slate-100 hover:border-primary hover:bg-primary/5 text-left transition-all group"
                  >
                    <span className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 group-hover:bg-primary transition-colors"><ChevronRight size={20} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-900">Sub-tab</span>
                      <span className="block text-xs text-slate-500 mt-0.5">Nested under an existing main tab — you'll pick the parent next.</span>
                    </span>
                  </button>
                </div>
              ) : (
              <>
              <div className="space-y-4 mb-8">
                {(editingFieldsForTab || addTabKind === "sub") && (
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Select main tab{editingFieldsForTab ? "" : " *"}</label>
                    <select
                      value={newTabParent}
                      onChange={(e) => setNewTabParent(e.target.value)}
                      disabled={!!editingFieldsForTab}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none appearance-none disabled:opacity-60"
                    >
                      <option value="">{editingFieldsForTab ? "Top-level tab" : "Select a main tab…"}</option>
                      {[CLIENT_PERM_TAB, ...DEFAULT_TABS, ...customTabs.filter((c) => !c.parentId && c.id !== editingFieldsForTab)].map((t) => (
                        <option key={t.id} value={t.id}>↳ {t.label}</option>
                      ))}
                    </select>
                    {editingFieldsForTab && <p className="text-[10px] text-slate-400">Parent cannot be changed after creation.</p>}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Tab Name</label>
                  <input
                    type="text"
                    autoFocus
                    value={newTabName}
                    onChange={(e) => setNewTabName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTab()}
                    placeholder="e.g. Site Inspection Logs"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all text-sm font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Palette size={13} /> Color</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setNewTabColor("")}
                      className={`w-7 h-7 rounded-full border-2 ${!newTabColor ? "border-slate-900" : "border-slate-200"}`}
                      title="No color"
                    />
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewTabColor(c)}
                        className={`w-7 h-7 rounded-full ${TAB_COLOR_DOT[c]} border-2 ${newTabColor === c ? "border-slate-900" : "border-transparent"}`}
                      />
                    ))}
                  </div>
                </div>

                {/* Custom Fields Builder */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-bold text-slate-700">Custom Fields</label>
                      <p className="text-[10px] text-slate-400 mt-0.5">Define inputs that will appear inside this tab. Saved with templates.</p>
                    </div>
                    <button
                      type="button"
                      onClick={addFieldDraft}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-primary"
                    >
                      <Plus size={11} /> Add Field
                    </button>
                  </div>

                  {newTabFields.length === 0 && (
                    <p className="text-xs text-slate-400 italic py-2">No custom fields. This tab will only have the notes textarea.</p>
                  )}

                  <div className="space-y-3">
                    {newTabFields.map((f, idx) => (
                      <div key={f.fieldId} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-6">#{idx + 1}</span>
                          <input
                            type="text"
                            value={f.label}
                            onChange={(e) => updateFieldDraft(idx, { label: e.target.value })}
                            placeholder="Field label (e.g. Site Address)"
                            className="flex-grow bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10"
                          />
                          <select
                            value={f.type}
                            onChange={(e) => updateFieldDraft(idx, { type: e.target.value as FieldType })}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10"
                          >
                            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeFieldDraft(idx)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
                            title="Remove field"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {f.type === "select" && (
                          <div className="pl-8 space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dropdown Options</label>
                            <div className="flex flex-wrap gap-1.5">
                              {(f.options || []).map((opt, oi) => (
                                <span key={oi} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold rounded-lg px-2.5 py-1">
                                  {opt}
                                  <button
                                    type="button"
                                    onClick={() => updateFieldDraft(idx, { options: (f.options || []).filter((_, k) => k !== oi) })}
                                    className="hover:text-red-500"
                                  >
                                    <X size={11} />
                                  </button>
                                </span>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Type an option and press Enter…"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const v = (e.currentTarget.value || "").trim();
                                    if (!v) return;
                                    updateFieldDraft(idx, { options: [...(f.options || []), v] });
                                    e.currentTarget.value = "";
                                  }
                                }}
                                className="flex-grow bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                                  const v = (input.value || "").trim();
                                  if (!v) return;
                                  updateFieldDraft(idx, { options: [...(f.options || []), v] });
                                  input.value = "";
                                }}
                                className="px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary"
                              >
                                Add
                              </button>
                            </div>
                            {(f.options || []).length === 0 && (
                              <p className="text-[10px] text-amber-600 italic">Add at least one option, otherwise the dropdown will be empty when used.</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={editingFieldsForTab ? closeAddTab : () => setAddTabStep("choose")}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50 transition-all"
                >
                  {editingFieldsForTab ? "Cancel" : "Back"}
                </button>
                <button
                  onClick={handleAddTab}
                  disabled={!newTabName.trim() || (!editingFieldsForTab && addTabKind === "sub" && !newTabParent)}
                  className="flex-1 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-40"
                >
                  {editingFieldsForTab ? "Save Changes" : addTabKind === "sub" ? "Create Sub-tab" : "Create Tab"}
                </button>
              </div>
              </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Tab Modal */}
      <AnimatePresence>
        {renamingTab && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-display font-bold text-slate-900">Rename Tab</h3>
                <button onClick={() => setRenamingTab(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
              </div>
              <input
                autoFocus
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && renamingTab && handleRenameTab(renamingTab)}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none mb-8"
              />
              <div className="flex gap-3">
                <button onClick={() => setRenamingTab(null)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
                <button onClick={() => renamingTab && handleRenameTab(renamingTab)} disabled={!renameInput.trim()} className="flex-1 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg disabled:opacity-40">Rename</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Save as Template Modal */}
      <AnimatePresence>
        {showSaveTemplate && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white rounded-[2.5rem] p-10 w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-display font-bold text-slate-900">Save as Template</h3>
                  <p className="text-xs text-slate-400 mt-1">Reusable in any project. Captures the tab and all its sub-tabs.</p>
                </div>
                <button onClick={() => setShowSaveTemplate(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
              </div>
              <div className="space-y-4 mb-8">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Template Name</label>
                  <input autoFocus type="text" value={saveTemplateName} onChange={(e) => setSaveTemplateName(e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Description (optional)</label>
                  <textarea rows={3} value={saveTemplateDesc} onChange={(e) => setSaveTemplateDesc(e.target.value)} placeholder="When to use this template..." className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none resize-none" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowSaveTemplate(null)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
                <button onClick={() => showSaveTemplate && handleSaveTemplate(showSaveTemplate)} disabled={!saveTemplateName.trim()} className="flex-1 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg disabled:opacity-40">Save Template</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Per-tab actions menu (portal — escapes the tab bar's scroll container) */}
      <PortalMenu open={!!tabMenuOpen} anchor={tabMenuAnchor} onClose={closeTabMenu} width={216}>
        {tabMenuOpen && (() => {
          const ct = customTabs.find((c) => c.id === tabMenuOpen);
          if (!ct) return null;
          return (
            <>
              <button onClick={() => { setRenamingTab(ct.id); setRenameInput(ct.label); closeTabMenu(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-50 text-xs font-bold text-left">
                <Edit2 size={13} /> Rename
              </button>
              <button onClick={() => { handleDuplicateTab(ct.id); closeTabMenu(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-50 text-xs font-bold text-left">
                <Copy size={13} /> Duplicate
              </button>
              <button onClick={() => { openEditFields(ct.id); closeTabMenu(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-50 text-xs font-bold text-left">
                <Edit2 size={13} /> Edit fields
              </button>
              <div className="px-3 py-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Palette size={11} /> Color</p>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => { handleSetColor(ct.id, ""); }} className={`w-5 h-5 rounded-full border-2 ${!ct.color ? "border-slate-900" : "border-slate-200"}`} />
                  {COLOR_OPTIONS.map((c) => (
                    <button key={c} onClick={() => { handleSetColor(ct.id, c); }} className={`w-5 h-5 rounded-full ${TAB_COLOR_DOT[c]} border-2 ${ct.color === c ? "border-slate-900" : "border-transparent"}`} />
                  ))}
                </div>
              </div>
              <button onClick={() => { setShowSaveTemplate(ct.id); setSaveTemplateName(ct.label); closeTabMenu(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-50 text-xs font-bold text-left">
                <BookmarkPlus size={13} /> Save as template
              </button>
              <button onClick={() => { handleRemoveCustomTab(ct.id); closeTabMenu(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-red-50 text-xs font-bold text-left text-red-500">
                <Trash2 size={13} /> Delete tab
              </button>
            </>
          );
        })()}
      </PortalMenu>

      {/* Edit Project Identity Modal (owner only) */}
      <AnimatePresence>
        {showEditIdentity && project && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white rounded-[2rem] p-8 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-display font-bold text-slate-900">
                    {isOwner ? "Edit Project Identity" : "Project Identity"}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {isOwner
                      ? "Only the owner can change these fields."
                      : "Preview only. Only the owner can edit and update the project identity."}
                  </p>
                </div>
                <button onClick={cancelEditIdentity} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
              </div>

              {/* Image */}
              <div className="mb-6">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Project Image</p>
                <div className="flex items-center gap-4">
                  <div className="w-32 h-24 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 flex-shrink-0">
                    {project.image ? (
                      <img src={assetSrc(project.image)} alt={project.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <FileImage size={28} />
                      </div>
                    )}
                  </div>
                  {isOwner ? (
                    <div className="flex-grow space-y-2">
                      <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary cursor-pointer transition-colors">
                        {imageUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {imageUploading ? "Uploading…" : project.image ? "Replace image" : "Upload image"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleProjectImageUpload(f);
                            e.target.value = "";
                          }}
                          disabled={imageUploading}
                        />
                      </label>
                      <p className="text-[10px] text-slate-400">Shown on the public Projects page card. PNG/JPG up to 8 MB.</p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 italic">No image set by the owner yet.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project Name *</label>
                  <input
                    type="text"
                    value={identityForm.name}
                    onChange={(e) => setIdentityForm({ ...identityForm, name: e.target.value })}
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                {/* CR 289 - the client comes from the Directory here too, not typed twice. Picking one
                    fills the project's Client Information from that company's record. */}
                <div className="space-y-2 md:col-span-2">
                  {isOwner ? (
                    <ClientPicker
                      label="Client Name"
                      value={identityForm.clientName}
                      onNameChange={(v) => setIdentityForm((p) => ({ ...p, clientName: v, clientCompanyId: v.trim() === (project?.clientInfo?.name || "").trim() ? project?.clientInfo?.companyId || "" : "" }))}
                      onSelectCompany={(c) => {
                        setIdentityForm((p) => ({ ...p, clientName: c.name || "", clientCompanyId: c._id }));
                        const contact = c.contactPersons?.[0];
                        setClientInfo((prev) => ({
                          ...prev,
                          name: c.name || prev.name,
                          companyId: c._id,
                          contactName: contact?.name || prev.contactName,
                          email: c.email || contact?.email || prev.email,
                          phone: c.phone || contact?.phone || prev.phone,
                          address: c.address || prev.address,
                        }));
                      }}
                      placeholder="e.g. USAID Ghana"
                      hint="Pick the client from the Directory, or type a new name and add it. Their details fill the project's Client Information."
                    />
                  ) : (
                    <>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Name</label>
                      <input type="text" value={identityForm.clientName} disabled className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none disabled:opacity-70" />
                    </>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Solicitation #</label>
                  <input
                    type="text"
                    value={identityForm.solicitationNo}
                    onChange={(e) => setIdentityForm({ ...identityForm, solicitationNo: e.target.value })}
                    placeholder="e.g. 19GH5024R0007"
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-400">The solicitation or RFP number this project was bid under.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
                  <select
                    value={identityForm.status}
                    onChange={(e) => setIdentityForm({ ...identityForm, status: e.target.value })}
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {/* The colour-coded status set — the same one the projects table filters by. */}
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s} value={s}>{statusMeta(s).label}</option>
                    ))}
                    {identityForm.status && !PROJECT_STATUSES.includes(identityForm.status as ProjectStatus) && (
                      <option value={identityForm.status}>{statusMeta(identityForm.status).label} (current)</option>
                    )}
                  </select>
                </div>
                {/* Contract number + the year the project started — both surface on the projects table. */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contract Number</label>
                  <input
                    type="text"
                    value={identityForm.contractNo}
                    onChange={(e) => setIdentityForm({ ...identityForm, contractNo: e.target.value })}
                    placeholder="e.g. 72067421C00012"
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-400">The client's contract number (usually 9–10 characters or more). Shown beside the GT project number.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Year Started</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={identityForm.contractYear}
                    onChange={(e) => setIdentityForm({ ...identityForm, contractYear: e.target.value })}
                    placeholder={String(new Date().getFullYear())}
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-400">Follows the contract date. Drives the Year column on My Projects / All Projects; the GT number keeps the year it was issued under.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contract Date</label>
                  <input
                    type="date"
                    value={identityForm.contractDate}
                    onChange={(e) => {
                      const year = /^([0-9]{4})-/.exec(e.target.value)?.[1];
                      setIdentityForm({ ...identityForm, contractDate: e.target.value, ...(year ? { contractYear: year } : {}) });
                    }}
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-400">The exact date the contract was signed / awarded.</p>
                </div>
                {/* The signed contract document */}
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contract Document</label>
                  <div className="flex items-center gap-3 flex-wrap">
                    {project.contractFile ? (
                      <>
                        <a href={attachmentUrl(project.contractFile.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-xs font-bold text-slate-700 hover:text-primary max-w-[18rem] truncate">
                          <FileText size={14} /> {project.contractFile.name}
                          <span className="text-[10px] font-medium text-slate-400">{project.contractFile.size}</span>
                        </a>
                        {isOwner && <button type="button" onClick={handleContractRemove} className="text-[11px] font-bold text-red-500 hover:underline">Remove</button>}
                      </>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">No contract uploaded.</span>
                    )}
                    {isOwner && (
                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary cursor-pointer transition-colors">
                        {contractUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {project.contractFile ? "Replace" : "Upload contract"}
                        <input type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" disabled={contractUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleContractUpload(f); e.target.value = ""; }} />
                      </label>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">Saved on the project identity and previewable from here.</p>
                </div>
                {/* Item 101 - several services per project; proposals filter past performance by these. */}
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categories (Services)</label>
                  <CategoryMultiSelect value={identityForm.categories} onChange={(v) => setIdentityForm({ ...identityForm, categories: v })} disabled={!isOwner} />
                  <p className="text-[10px] text-slate-400">Pick every service this project covers. Proposals find past performance by these. The same list shows in About on Project Info.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contract Type</label>
                  <select
                    value={identityForm.contractType}
                    onChange={(e) => setIdentityForm({ ...identityForm, contractType: e.target.value })}
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <option value="">Not set</option>
                    {CONTRACT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                    {identityForm.contractType && !CONTRACT_TYPES.includes(identityForm.contractType) && <option value={identityForm.contractType}>{identityForm.contractType}</option>}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CPARS / Evaluation</label>
                  <select
                    value={identityForm.cpars}
                    onChange={(e) => setIdentityForm({ ...identityForm, cpars: e.target.value })}
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <option value="">Not set</option>
                    <option value="Yes">Yes, on file</option>
                    <option value="Pending">Pending</option>
                    <option value="No">No</option>
                  </select>
                  <p className="text-[10px] text-slate-400">Printed on this project's past-performance data sheet.</p>
                </div>
                {/* Project site address — feeds RFQ/PO delivery and the "City, Country 🇬🇭" header.
                    CR 186: pasted as one block, with the parts beside it. */}
                <div className="md:col-span-2">
                  <AddressBox label="Project site address" value={identityForm.siteAddress} onChange={(v) => setIdentityForm((f) => ({ ...f, siteAddress: v }))} disabled={!isOwner} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progress (%)</label>
                  <input
                    type="number" min={0} max={100}
                    value={project?.schedule?.milestones?.length ? project.progress : identityForm.progress}
                    onChange={(e) => setIdentityForm({ ...identityForm, progress: Number(e.target.value) })}
                    disabled={!isOwner || !!project?.schedule?.milestones?.length}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                  {!!project?.schedule?.milestones?.length && <p className="text-[10px] text-slate-400">Counted from the milestones (the Progress bar in the project).</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Start Date</label>
                  <input
                    type="date"
                    value={identityForm.startDate}
                    onChange={(e) => setIdentityForm({ ...identityForm, startDate: e.target.value })}
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">End Date</label>
                  <input
                    type="date"
                    value={identityForm.endDate}
                    onChange={(e) => setIdentityForm({ ...identityForm, endDate: e.target.value })}
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project Value / Worth</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={identityForm.value}
                    onChange={(e) => setIdentityForm({ ...identityForm, value: sanitizeMoney(e.target.value) })}
                    placeholder="e.g. $2,500,000"
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-400">Enter the full dollar amount (numbers only) — used for the All Projects total value.</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fiscal / Funding</label>
                  <input
                    type="text"
                    value={identityForm.fiscal}
                    onChange={(e) => setIdentityForm({ ...identityForm, fiscal: e.target.value })}
                    placeholder="e.g. USAID Regional Grant"
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Compliance</label>
                  <input
                    type="text"
                    value={identityForm.compliance}
                    onChange={(e) => setIdentityForm({ ...identityForm, compliance: e.target.value })}
                    placeholder="e.g. Passed Internal Audit"
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Disciplines (comma separated)</label>
                  <input
                    type="text"
                    value={identityForm.disciplines}
                    onChange={(e) => setIdentityForm({ ...identityForm, disciplines: e.target.value })}
                    placeholder="e.g. Civil Engineering, Hydrology, SCADA"
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</label>
                  <textarea
                    rows={4}
                    value={identityForm.description}
                    onChange={(e) => setIdentityForm({ ...identityForm, description: e.target.value })}
                    placeholder="Brief project description..."
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 resize-none disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                {/* Report notes — rich text (tables & pictures) rendered into the project report PDF. */}
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Report Notes &amp; Narrative <span className="text-slate-300 normal-case tracking-normal">— appears in the downloadable project report; supports tables &amp; pictures</span></label>
                  <RichTextEditor
                    value={identityForm.reportNotes}
                    onChange={(html) => setIdentityForm({ ...identityForm, reportNotes: html })}
                    disabled={!isOwner}
                    minHeight={140}
                    placeholder="Executive summary, status narrative, tables, photos…"
                    onImageUpload={id ? (file) => uploadInlineImage(id, file) : undefined}
                  />
                </div>
              </div>

              {/* §M — Joint Venture (moved here from the Client tab) */}
              <div className="border-t border-slate-100 pt-6 mb-6">
                {renderJVSection(!isOwner)}
              </div>

              {isOwner ? (
                <div className="flex gap-3">
                  <button onClick={cancelEditIdentity} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
                  <button
                    onClick={handleSaveIdentity}
                    disabled={identitySaving || !identityForm.name.trim()}
                    className="flex-1 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {identitySaving && <Loader2 size={14} className="animate-spin" />}
                    Save Identity
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-[11px] text-slate-500 italic text-center">
                    Only the project owner can edit and update the project identity.
                  </p>
                  <button onClick={cancelEditIdentity} className="w-full py-3 rounded-2xl bg-slate-900 text-white font-bold text-sm hover:bg-primary transition-colors">
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Subcontractor Add/Edit Modal */}
      <AnimatePresence>
        {showSubModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white rounded-[2.5rem] p-10 w-full max-w-xl shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-display font-bold text-slate-900">
                  {editingSubIdx !== null ? "Edit Subcontractor" : "Add Subcontractor"}
                </h3>
                <button onClick={() => setShowSubModal(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Company Name *</label>
                  <CompanyPicker
                    value={subForm.name}
                    category="subcontractor"
                    onNameChange={(v) => setSubForm((f) => ({ ...f, name: v }))}
                    onSelectCompany={(c) => setSubForm((f) => ({ ...f, name: c.name, contact: c.contactPersons?.[0]?.name || f.contact, email: c.email || c.contactPersons?.[0]?.email || f.email, phone: c.phone || c.contactPersons?.[0]?.phone || f.phone }))}
                    placeholder="Search or add a subcontractor from the Directory…"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Subcontractor ID</label>
                  <input
                    type="text"
                    value={subForm.subId}
                    onChange={(e) => setSubForm({ ...subForm, subId: e.target.value })}
                    placeholder="SUB-001"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none focus:bg-white focus:ring-4 focus:ring-primary/5"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scope of Work</label>
                  <input
                    type="text"
                    value={subForm.scope}
                    onChange={(e) => setSubForm({ ...subForm, scope: e.target.value })}
                    placeholder="e.g. Civil Works"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none focus:bg-white focus:ring-4 focus:ring-primary/5"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Primary Contact</label>
                  <input
                    type="text"
                    value={subForm.contact}
                    onChange={(e) => setSubForm({ ...subForm, contact: e.target.value })}
                    placeholder="Full name"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none focus:bg-white focus:ring-4 focus:ring-primary/5"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email</label>
                  <input
                    type="email"
                    value={subForm.email}
                    onChange={(e) => setSubForm({ ...subForm, email: e.target.value })}
                    placeholder="contact@vendor.com"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none focus:bg-white focus:ring-4 focus:ring-primary/5"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phone</label>
                  <input
                    type="tel"
                    value={subForm.phone}
                    onChange={(e) => setSubForm({ ...subForm, phone: e.target.value })}
                    placeholder="+1 (000) 000-0000"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none focus:bg-white focus:ring-4 focus:ring-primary/5"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notes</label>
                  <textarea
                    rows={3}
                    value={subForm.notes}
                    onChange={(e) => setSubForm({ ...subForm, notes: e.target.value })}
                    placeholder="Any relevant notes about this subcontractor..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none focus:bg-white focus:ring-4 focus:ring-primary/5 resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowSubModal(false)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
                <button onClick={handleSaveSub} disabled={!subForm.name.trim()} className="flex-1 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg disabled:opacity-40">
                  {editingSubIdx !== null ? "Save Changes" : "Add Subcontractor"}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 text-center mt-4">Remember to click <strong>Save Workspace</strong> to persist these changes.</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CR-P (69) — the legacy "create agreement bundle" modal is gone with the list it fed. */}

      {/* Universal Document Viewer */}
      <AnimatePresence>
        {previewDoc && (
          <DocumentViewer
            doc={{ name: previewDoc.name, url: documentUrl(previewDoc), fileType: previewDoc.fileType || (previewDoc.name.split(".").pop() || "") }}
            onClose={() => setPreviewDoc(null)}
          />
        )}
      </AnimatePresence>

      {/* Expense / row attachment viewer */}
      <AnimatePresence>
        {attachmentPreview && (
          <DocumentViewer doc={attachmentPreview} onClose={() => setAttachmentPreview(null)} />
        )}
      </AnimatePresence>

      {/* Templates Picker Modal */}
      <AnimatePresence>
        {showTemplatesModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white rounded-[2.5rem] p-10 w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-display font-bold text-slate-900">Insert from Template</h3>
                  <p className="text-xs text-slate-400 mt-1">Pick a saved template to add its tab structure to this project.</p>
                </div>
                <button onClick={() => setShowTemplatesModal(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
              </div>
              {templates.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm font-medium">
                  No templates yet. Save any custom tab as a template via its ··· menu.
                </div>
              ) : (
                <div className="space-y-3">
                  {templates.map((tpl) => (
                    <div key={tpl._id} className="flex items-center justify-between gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="min-w-0 flex-grow">
                        <p className="text-sm font-bold text-slate-900">{tpl.name}</p>
                        {tpl.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{tpl.description}</p>}
                        <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">
                          {tpl.tabs.length} tab{tpl.tabs.length !== 1 ? "s" : ""}
                          {tpl.tabs.reduce((acc, t) => acc + (t.children?.length || 0), 0) > 0 &&
                            ` · ${tpl.tabs.reduce((acc, t) => acc + (t.children?.length || 0), 0)} sub-tabs`}
                          {" · "} by {tpl.createdByName || "—"}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => insertTemplate(tpl)} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-primary transition-all">Insert</button>
                        {currentUser && tpl.createdBy === currentUser.id && (
                          <>
                            <button onClick={() => openEditTemplate(tpl)} title="Edit template" className="p-2 rounded-xl hover:bg-primary/10 text-slate-400 hover:text-primary transition-all"><Edit2 size={14} /></button>
                            <button onClick={() => handleDeleteTemplate(tpl._id)} title="Delete template" className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all"><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Template Modal */}
      <AnimatePresence>
        {editingTemplate && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white rounded-[2.5rem] p-10 w-full max-w-2xl shadow-2xl max-h-[88vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-display font-bold text-slate-900">Edit Template</h3>
                  <p className="text-xs text-slate-400 mt-1">Update the template's name, description, and saved fields.</p>
                </div>
                <button onClick={closeEditTemplate} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Template Name</label>
                  <input
                    type="text"
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Description</label>
                  <textarea
                    rows={2}
                    value={tplDesc}
                    onChange={(e) => setTplDesc(e.target.value)}
                    placeholder="When to use this template..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none resize-none focus:bg-white focus:ring-2 focus:ring-primary/10"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-bold text-slate-700">Fields</label>
                      <p className="text-[10px] text-slate-400 mt-0.5">The inputs saved in this template.</p>
                    </div>
                    <button onClick={addTplField} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-primary"><Plus size={11} /> Add Field</button>
                  </div>

                  {tplFields.length === 0 && (
                    <p className="text-xs text-slate-400 italic py-2">This template has no custom fields yet. Add one above.</p>
                  )}

                  {tplFields.map((f, idx) => (
                    <div key={f.fieldId} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-6">#{idx + 1}</span>
                        <input
                          type="text"
                          value={f.label}
                          onChange={(e) => updateTplField(idx, { label: e.target.value })}
                          placeholder="Field label (e.g. Site Address)"
                          className="flex-grow bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10"
                        />
                        <select
                          value={f.type}
                          onChange={(e) => updateTplField(idx, { type: e.target.value as FieldType })}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10"
                        >
                          {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeTplField(idx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
                          title="Remove field"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {f.type === "select" && (
                        <div className="pl-8 space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dropdown Options</label>
                          <div className="flex flex-wrap gap-1.5">
                            {(f.options || []).map((opt, oi) => (
                              <span key={oi} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold rounded-lg px-2.5 py-1">
                                {opt}
                                <button
                                  type="button"
                                  onClick={() => updateTplField(idx, { options: (f.options || []).filter((_, k) => k !== oi) })}
                                  className="hover:text-red-500"
                                >
                                  <X size={11} />
                                </button>
                              </span>
                            ))}
                          </div>
                          <input
                            type="text"
                            placeholder="Type an option and press Enter…"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const v = (e.currentTarget.value || "").trim();
                                if (!v) return;
                                updateTplField(idx, { options: [...(f.options || []), v] });
                                e.currentTarget.value = "";
                              }
                            }}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button onClick={closeEditTemplate} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
                <button onClick={handleUpdateTemplate} disabled={tplSaving || !tplName.trim()} className="flex-1 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg disabled:opacity-40 flex items-center justify-center gap-2">
                  {tplSaving && <Loader2 size={14} className="animate-spin" />}
                  {tplSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Public Showcase Modal (owner only) */}
      <AnimatePresence>
        {showShowcaseModal && isOwner && id && project && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 sm:p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-50 rounded-[2rem] shadow-2xl"
            >
              {/* Sticky header */}
              <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-7 py-5 bg-white border-b border-slate-100">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center flex-shrink-0"><Globe size={18} /></div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-display font-bold text-slate-900 truncate">Public Showcase</h2>
                    <p className="text-[11px] text-slate-400">Everything shown on this project's public “Learn More” page.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isPublished && (
                    <a href={`/projects?showcase=${id}`} target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 rounded-xl px-3 py-2"><ExternalLink size={14} /> Preview</a>
                  )}
                  <button onClick={() => setShowShowcaseModal(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
                </div>
              </div>

              <div className="p-6 sm:p-7 space-y-6">
                {/* Publish status */}
                <div className={`rounded-2xl p-4 border flex items-center gap-3 ${isPublished ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"}`}>
                  <Globe size={18} className={isPublished ? "text-emerald-600" : "text-amber-600"} />
                  <div>
                    <p className="text-sm font-bold text-slate-900">{isPublished ? "Published — visible on the website" : "Not published yet"}</p>
                    <p className="text-xs text-slate-500">{isPublished ? "This showcase is live. Use Preview to view it." : "Turn on “Preview on website” at the top to make this project public."}</p>
                  </div>
                </div>

                {/* Read-only identity preview */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">What the public sees</h3>
                    <button onClick={() => { setShowShowcaseModal(false); openEditIdentity(); }} className="text-xs font-bold text-primary hover:underline flex items-center gap-1.5"><Edit2 size={13} /> Edit in Identity</button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                    {([
                      ["Project name", project.name],
                      ["Status", project.status],
                      ["Category", projectCategories(project).join(", ")],
                      ["Location", project.location],
                      ["Timeline", `${project.startDate || "—"} → ${project.endDate || "—"}`],
                      ["Client", project.showClientName === false ? "Hidden" : (project.clientInfo?.name || "—")],
                    ] as const).map(([label, val]) => (
                      <div key={label}>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                        <p className="text-sm font-bold text-slate-900">{val || "—"}</p>
                      </div>
                    ))}
                  </div>
                  {project.description && (
                    <div className="mt-4 pt-4 border-t border-slate-50">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Description</p>
                      <p className="text-sm text-slate-600 leading-relaxed line-clamp-4">{project.description}</p>
                    </div>
                  )}
                </div>

                {/* Gallery manager */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-1">Gallery</h3>
                    <p className="text-xs text-slate-400">Images &amp; videos for the carousel. The first image is the project's card cover.</p>
                  </div>
                  {((project.gallery as GalleryItem[]) || []).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No media yet. Upload images/videos or add a video link below.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(project.gallery as GalleryItem[]).map((g, i) => (
                        <div key={`${g.url}-${i}`} className="flex gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                          <div className="w-20 h-16 rounded-lg overflow-hidden bg-slate-200 flex items-center justify-center flex-shrink-0">
                            {g.type === "image" ? <img src={assetSrc(g.url)} alt="" className="w-full h-full object-cover" /> : <Globe size={20} className="text-slate-400" />}
                          </div>
                          <div className="flex-grow min-w-0 flex flex-col">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-primary">{g.type}{g.source === "link" ? " · link" : ""}</span>
                              {i === 0 && g.type === "image" && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">· cover</span>}
                            </div>
                            <input defaultValue={g.caption || ""} onBlur={(e) => setGalleryCaption(i, e.target.value)} placeholder="Caption (optional)" className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-primary/10 mt-auto" />
                          </div>
                          <div className="flex flex-col items-center gap-0.5">
                            <button onClick={() => moveGalleryItem(i, -1)} disabled={i === 0} className="px-1.5 rounded text-slate-400 hover:text-primary disabled:opacity-30 text-sm font-bold">↑</button>
                            <button onClick={() => moveGalleryItem(i, 1)} disabled={i === (project.gallery || []).length - 1} className="px-1.5 rounded text-slate-400 hover:text-primary disabled:opacity-30 text-sm font-bold">↓</button>
                            <button onClick={() => removeGalleryItem(i)} className="p-1 rounded text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 pt-1">
                    <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary cursor-pointer transition-colors">
                      {galleryUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload image / video
                      <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleGalleryUpload(f); e.target.value = ""; }} disabled={galleryUploading} />
                    </label>
                    <div className="flex gap-2 flex-grow min-w-[220px]">
                      <input value={galleryLink} onChange={(e) => setGalleryLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddGalleryLink()} placeholder="Paste a YouTube / Vimeo link…" className="flex-grow bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-primary/10" />
                      <button onClick={handleAddGalleryLink} className="px-4 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200">Add link</button>
                    </div>
                  </div>
                </div>

                {/* Client name visibility */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Show client name publicly</h3>
                    <p className="text-xs text-slate-400 mt-0.5">When off, the client name is hidden in the public modal.</p>
                  </div>
                  <button onClick={toggleShowClientName} className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${project.showClientName !== false ? "bg-indigo-500" : "bg-slate-200"}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all ${project.showClientName !== false ? "left-5" : "left-0.5"}`} />
                  </button>
                </div>

                {/* Documents table */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100">
                  <div className="mb-4">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-1">Documents</h3>
                    <p className="text-xs text-slate-400">All files in this project. Toggle which ones appear on the public page (off by default).</p>
                  </div>
                  {docsLoading ? (
                    <div className="flex items-center gap-2 text-slate-300 text-xs py-4"><Loader2 size={14} className="animate-spin" /> Loading documents…</div>
                  ) : showcaseDocs.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No documents uploaded in this project yet.</p>
                  ) : (
                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                        <span className="flex-grow text-[10px] font-bold text-slate-400 uppercase tracking-widest">File</span>
                        <span className="w-28 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Section</span>
                        <span className="w-20 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Public</span>
                      </div>
                      <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                        {showcaseDocs.map((d) => (
                          <div key={d._id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60">
                            <FileText size={14} className="text-slate-400 flex-shrink-0" />
                            <span className="flex-grow min-w-0 text-xs font-bold text-slate-900 truncate" title={d.name}>{d.name}</span>
                            <span className="hidden sm:block w-28 text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{docSectionLabel(d.section)}</span>
                            <div className="w-20 flex justify-end">
                              <button onClick={() => toggleDocPublic(d)} className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${d.public ? "bg-emerald-500" : "bg-slate-200"}`} title={d.public ? "Visible on public page" : "Hidden"}>
                                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow ${d.public ? "left-[18px]" : "left-0.5"}`} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CR-P — Per-employee tab-access popup (owner picks which tabs one employee can access) */}
      {/* Tab access for one assigned employee — CR-P: the SAME View / Edit / Hidden model the
          profile's Access page uses, written to the project's guest permissions, rather than the
          binary on/off toggle this used to be. An assigned employee has the whole project until
          you deliberately limit them, and can be given it all back in one click. */}
      {empAccessFor && (() => {
        const empId = empAccessFor;
        const emp = employeePool.find((e) => e.empId === empId);
        const guest = emp?.id ? guestsList.find((g) => g.userId === emp.id) : undefined;
        const limited = !!guest;
        const permOf = (tabId: string): "none" | "view" | "edit" =>
          (empPerms[tabId] ?? (guest?.tabPermissions?.[tabId] as "view" | "edit" | undefined) ?? "none");
        const setPerm = (tabId: string, v: "none" | "view" | "edit") => setEmpPerms((p) => ({ ...p, [tabId]: v }));
        return (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => { setEmpAccessFor(null); setEmpPerms({}); }} />
            <div className="relative bg-white rounded-[2rem] p-6 w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-display font-bold text-slate-900">Tab access</h3>
                <button onClick={() => { setEmpAccessFor(null); setEmpPerms({}); }} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Which tabs <span className="font-bold text-slate-600">{emp?.name ?? empId}</span> can use on this project.
              </p>

              {!limited && (
                <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-3">
                  Right now they have <span className="font-bold">full access</span> to this project. Choose tabs below and
                  save to limit them; anything left Hidden will not be visible to them.
                </p>
              )}

              {/* Financial figures — saved straight away, apart from the tabs (saving the tabs
                  would also limit an employee who has full access). */}
              {emp?.id && (
                <div className="mb-3">
                  {figuresRow(figuresOn(emp.id, false), (v) => { void setFigures(emp.id, v).then(() => toast(v ? "They can see the financial figures." : "Financial figures hidden from them.", "success")); }, "Project value, expense and income totals, estimated profit. Saved straight away.")}
                </div>
              )}
              <div className="space-y-1 overflow-y-auto pr-1 flex-grow">
                {allTabsAll.map((t) => {
                  const isChild = !!(customTabs.find((c) => c.id === t.id)?.parentId);
                  const cur = permOf(t.id);
                  return (
                    <div key={t.id} className={`flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-50 ${isChild ? "pl-5" : ""}`}>
                      <span className="text-xs font-bold text-slate-700 truncate">{isChild ? "↳ " : ""}{t.label}</span>
                      <span className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-bold shrink-0">
                        {([["none", "Hidden"], ["view", "View"], ["edit", "Edit"]] as const).map(([v, label]) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setPerm(t.id, v)}
                            className={`px-2.5 py-1 ${cur === v
                              ? (v === "none" ? "bg-red-500 text-white" : v === "view" ? "bg-slate-900 text-white" : "bg-emerald-600 text-white")
                              : "bg-white text-slate-500 hover:bg-slate-50"}`}
                          >{label}</button>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 mt-2 border-t border-slate-100">
                {limited ? (
                  <button onClick={() => void restoreFullAccess(empId)} className="text-[11px] font-bold text-slate-500 hover:text-slate-900">Restore full access</button>
                ) : <span />}
                <div className="flex items-center gap-2">
                  <button onClick={() => { setEmpAccessFor(null); setEmpPerms({}); }} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold">Cancel</button>
                  <button onClick={() => void saveEmpAccess(empId)} disabled={accessBusy === empId} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary disabled:opacity-50">
                    {accessBusy === empId ? "Saving…" : "Save access"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Guest Access Wizard */}
      <AnimatePresence>
        {showGuestModal && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white rounded-[2.5rem] p-10 w-full max-w-2xl shadow-2xl max-h-[88vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-display font-bold text-slate-900">{editingGuest ? `Edit ${guestNoun} Access` : `Add ${guestNoun}`}</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {editingGuest ? `Update this ${guestNounLc}'s per-tab access and timeline.` : `Create a ${guestNounLc} login and choose what they can see and edit.`}
                  </p>
                </div>
                <button onClick={closeGuestModal} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
              </div>

              {/* Step 1 — Pick an existing guest or create a new one (create only) */}
              {!editingGuest && guestStep === 1 && (
                <div className="space-y-5">
                  {guestDirectory.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Select an existing {guestNounLc}</label>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {guestDirectory.map((g) => (
                          <button
                            key={g.userId}
                            type="button"
                            onClick={() => selectExistingGuest(g)}
                            className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all ${
                              gExistingId === g.userId ? "border-primary bg-primary/5" : "border-slate-100 bg-slate-50 hover:border-slate-200"
                            }`}
                          >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${gExistingId === g.userId ? "bg-primary text-white" : "bg-white border border-slate-100 text-slate-400"}`}>
                              {gExistingId === g.userId ? <Check size={16} /> : <User size={16} />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">{g.name || g.email}</p>
                              <p className="text-[11px] text-slate-500 truncate">{g.email}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400">Reuses their existing login — they'll be added to this project with the access you set next.</p>
                    </div>
                  )}

                  {gExistingId ? (
                    <button type="button" onClick={clearExistingGuest} className="text-xs font-bold text-primary hover:underline">
                      + Create a new {guestNounLc} instead
                    </button>
                  ) : (
                    <div className="space-y-4">
                      {guestDirectory.length > 0 && (
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Or create a new {guestNounLc}</p>
                      )}
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">{guestNoun} Name</label>
                        <input type="text" value={gName} onChange={(e) => setGName(e.target.value)} placeholder="e.g. Acme Electrical Co." className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Email *</label>
                        <input type="email" value={gEmail} onChange={(e) => setGEmail(e.target.value)} placeholder={`${guestNounLc}@example.com`} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Password *</label>
                        <div className="flex gap-2">
                          <input type="text" value={gPassword} onChange={(e) => setGPassword(e.target.value)} placeholder="Set a password to share" className="flex-grow bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10" />
                          <button type="button" onClick={() => setGPassword(`gt-${Math.abs(((gEmail || "sub").split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 100000)}-${(gName || "user").replace(/\s+/g, "").slice(0, 4).toLowerCase()}`)} className="px-4 rounded-2xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200">Generate</button>
                        </div>
                        <p className="text-[10px] text-slate-400">You'll share this email &amp; password with the {guestNounLc} manually.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2 — Per-tab access matrix */}
              {(editingGuest || guestStep === 2) && (
                <div className="space-y-4">
                  {editingGuest && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name</label>
                        <input type="text" value={gName} onChange={(e) => setGName(e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reset Password (optional)</label>
                        <input type="text" value={gPassword} onChange={(e) => setGPassword(e.target.value)} placeholder="Leave blank to keep" className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10" />
                      </div>
                    </div>
                  )}
                  {figuresRow(gFigures, setGFigures, `Project value, expense and income totals, estimated profit. Off by default for a ${guestNounLc}.`)}
                  <div>
                    <p className="text-sm font-bold text-slate-700 mb-1">Tab Access</p>
                    <p className="text-[10px] text-slate-400 mb-3">Hidden tabs are invisible to the {guestNounLc}. View = read &amp; preview only. Edit = can also upload/change content.</p>
                    <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                      {(() => {
                        const permRow = (rowId: string, label: string, indent: boolean) => {
                          const level = gPerms[rowId] || "none";
                          return (
                            <div key={rowId} className={`flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 ${indent ? "ml-5 bg-slate-50/60" : "bg-slate-50"}`}>
                              <span className="text-sm font-bold text-slate-700 truncate">{indent ? "↳ " : ""}{label}</span>
                              <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-slate-100 flex-shrink-0">
                                {([
                                  { v: "none", label: "Hidden" },
                                  { v: "view", label: "View" },
                                  { v: "edit", label: "Edit" },
                                ] as const).map(({ v, label: vl }) => (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() => setGuestPerm(rowId, v)}
                                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
                                      level === v
                                        ? v === "edit" ? "bg-primary text-white" : v === "view" ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"
                                        : "text-slate-400 hover:text-slate-700"
                                    }`}
                                  >
                                    {vl}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        };
                        return allTabsAll.flatMap((t) => {
                          const isChild = !!(customTabs.find((c) => c.id === t.id)?.parentId);
                          const rows = [permRow(t.id, t.label, isChild)];
                          // Procurement gets per-sub-tab rows so a guest (e.g. logistics company) can be limited to specific sub-tabs.
                          if (t.id === "procurement") {
                            // Invoices shares the Purchase Orders permission: one row for it.
                            for (const s of PROC_SUBTABS.filter((x, i, a) => a.findIndex((y) => y.permId === x.permId) === i)) rows.push(permRow(s.permId, `Procurement · ${s.label}`, true));
                          }
                          // CR-P-30 — Finances gets per-sub-tab rows (Expenses / Invoice Sent / Invoice Received).
                          if (t.id === "finances") {
                            for (const s of FIN_SUBTABS) rows.push(permRow(s.permId, `Finances · ${s.label}`, true));
                          }
                          return rows;
                        });
                      })()}
                    </div>
                  </div>

                  {/* Access timeline */}
                  <div>
                    <p className="text-sm font-bold text-slate-700 mb-1">Access Timeline</p>
                    <p className="text-[10px] text-slate-400 mb-3">How long this {guestNounLc} keeps access. After it passes, access is removed automatically.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {([
                        { v: "", label: "No expiry" },
                        { v: "1w", label: "1 week" },
                        { v: "1m", label: "1 month" },
                        { v: "3m", label: "3 months" },
                      ] as const).map(({ v, label }) => (
                        <button
                          key={v || "none"}
                          type="button"
                          onClick={() => setGExpiry(v)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${gExpiry === v ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-900"}`}
                        >
                          {label}
                        </button>
                      ))}
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">or</span>
                      <input
                        type="date"
                        value={/^\d{4}-\d{2}-\d{2}$/.test(gExpiry) ? gExpiry : ""}
                        onChange={(e) => setGExpiry(e.target.value)}
                        className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3 — Also assign to other projects (create only) */}
              {!editingGuest && guestStep === 3 && (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-slate-700">Assign to other projects (optional)</p>
                  <p className="text-[10px] text-slate-400">The same tab permissions will be applied. You can fine-tune each project later.</p>
                  {ownerProjects.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">You don't own any other projects.</p>
                  ) : (
                    <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                      {ownerProjects.map((p) => {
                        const checked = gAlsoProjects.includes(p.id);
                        return (
                          <label key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${checked ? "border-primary bg-primary/5" : "border-slate-100 bg-slate-50 hover:border-slate-200"}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setGAlsoProjects((prev) => checked ? prev.filter((x) => x !== p.id) : [...prev, p.id])}
                              className="w-4 h-4 accent-primary"
                            />
                            <span className="text-sm font-bold text-slate-700 truncate">{p.name}</span>
                            <span className="ml-auto text-[10px] font-bold text-slate-400 uppercase tracking-widest">{p.id}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex gap-3 mt-8">
                {editingGuest ? (
                  <>
                    <button onClick={closeGuestModal} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
                    <button onClick={handleSaveGuest} disabled={gSaving} className="flex-1 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg disabled:opacity-40 flex items-center justify-center gap-2">
                      {gSaving && <Loader2 size={14} className="animate-spin" />}{gSaving ? "Saving…" : "Save Changes"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => (guestStep === 1 ? closeGuestModal() : setGuestStep((s) => (s - 1) as 1 | 2 | 3))}
                      className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50"
                    >
                      {guestStep === 1 ? "Cancel" : "Back"}
                    </button>
                    {guestStep < 3 ? (
                      <button
                        onClick={() => {
                          if (guestStep === 1) {
                            if (gExistingId) {
                              if (!gEmail.trim()) { toast("Select an existing guest or create a new one.", "error"); return; }
                            } else if (!gEmail.trim() || !gPassword.trim()) {
                              toast(`Email and password are required for a new ${guestNounLc}.`, "error"); return;
                            }
                          }
                          setGuestStep((s) => (s + 1) as 1 | 2 | 3);
                        }}
                        className="flex-1 py-3 rounded-2xl bg-slate-900 text-white font-bold text-sm hover:bg-primary transition-all"
                      >
                        Next
                      </button>
                    ) : (
                      <button onClick={handleSaveGuest} disabled={gSaving} className="flex-1 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg disabled:opacity-40 flex items-center justify-center gap-2">
                        {gSaving && <Loader2 size={14} className="animate-spin" />}{gSaving ? "Creating…" : editingGuest ? "Save Changes" : `Create ${guestNoun}`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CR 286 - what goes in the report, asked before it is built. */}
      {reportPick && project && createPortal(
        <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={() => setReportPick(false)}>
          <div className="my-16 w-full max-w-lg rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileText size={15} className="text-primary" /> What goes in the report?</p>
              <button onClick={() => setReportPick(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X size={18} /></button>
            </div>
            <div className="max-h-[60vh] space-y-1 overflow-y-auto p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] text-slate-500">Everything is included unless you take it out.</p>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setReportInclude(Object.fromEntries(REPORT_SECTIONS.map((x) => [x.key, true])))} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary">All</button>
                  <button type="button" onClick={() => setReportInclude(Object.fromEntries(REPORT_SECTIONS.map((x) => [x.key, false])))} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary">None</button>
                </div>
              </div>
              {REPORT_SECTIONS.map((sec) => (
                <label key={sec.key} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-transparent p-2 hover:border-slate-100 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
                    checked={reportInclude[sec.key] !== false}
                    onChange={(e) => setReportInclude((p) => ({ ...p, [sec.key]: e.target.checked }))}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-800">{sec.label}</span>
                    <span className="block text-[11px] text-slate-400">{sec.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button onClick={() => setReportPick(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => void buildReport()} disabled={reportBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
                {reportBusy ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Build the report
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* CR-P-01 — Quick Report: popup PDF preview with download/print. */}
      {showReport && project && (
        <PdfPreviewModal
          title={`Quick Report · ${project.name || "Project"}`}
          fileName={fileName([project.name, "Report"], "pdf")}
          build={() => pdf(<ProjectReportPDF project={project} logoUrl={`${window.location.origin}/gt-logo-horizontal.png`} financials={reportFinancials} include={reportInclude as Partial<Record<ReportSection, boolean>>} client={reportClient} vendors={reportVendors} />).toBlob()}
          onClose={() => setShowReport(false)}
        />
      )}

      {/* CR 200 - insert a section from another project's proposal or from the saved library. */}
      {insertTarget && (
        <InsertSectionTemplate
          sectionTitle={insertTarget.title}
          currentProjectId={id || ""}
          templates={sectionTemplates}
          onInsert={(p) => void insertSectionTemplate(p)}
          onSaveTemplate={async (name, body) => {
            try {
              await saveProposalTemplate({ name, description: "Section template", content: { section: true, body } as never });
              await loadSectionTemplates();
              toast("Section template saved. It is available on every project.", "success");
            } catch (err) { toast(err instanceof Error ? err.message : "Could not save the template.", "error"); }
          }}
          onDeleteTemplate={async (t) => {
            if (!(await brandedConfirm({ title: `Delete "${t.name}"?`, message: "The template is removed for everyone. Sections already using it keep their text.", confirmLabel: "Delete template", danger: true }))) return;
            try { await deleteProposalTemplate(t._id); await loadSectionTemplates(); toast("Template deleted.", "success"); }
            catch (err) { toast(err instanceof Error ? err.message : "Could not delete the template.", "error"); }
          }}
          onClose={() => setInsertTarget(null)}
        />
      )}
    </div>
  );
}
