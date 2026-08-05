import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Globe, Clock, ExternalLink, MapPin,
  Upload, Download, Eye, FileText, FileImage, FileCode,
  Plus, X, MoreHorizontal, ChevronRight, ChevronDown, ArrowUp, ArrowDown, Search,
  AlertCircle, Check, Users, Building2, FileSpreadsheet,
  Receipt, ShoppingCart, Truck, Scale, Wrench, Calendar,
  DollarSign, Loader2, MoreVertical, Copy, Edit2, Palette,
  BookmarkPlus, BookOpen, Trash2, Archive, Info, User, Save, Lock,
} from "lucide-react";
import { fetchProject, updateProject, uploadProjectImage, fetchEmployees, fetchExpenses, addExpense, updateExpense, deleteExpense, fetchPurchaseOrders, addPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, fetchTemplates, createTemplate, updateTemplate, deleteTemplate, fetchDocuments, uploadDocument, deleteDocument, updateDocumentDescription, documentUrl,
fetchSubAgreements, createSubAgreement, deleteSubAgreement, uploadSubAgreementFile, deleteSubAgreementFile, type ApiSubAgreement, type SubAgreementDocKind, fetchProcurementRows, createProcurementRow, updateProcurementRow, deleteProcurementRow, downloadProjectExport, downloadProposalDocx, getAuthUser, fetchProjects, fetchGuests, fetchGuestDirectory, createGuest, updateGuest, removeGuest, uploadGalleryFile, setDocumentPublic, ApiProject, ApiEmployee, ApiTemplate, ApiDocument, ApiProcurementRow, ApiGuest, GalleryItem } from "../../lib/api";
import type { ProposalContent, TechnicalProposalContent, FinancialProposalContent, ProposalCover, ProposalCoverLetter, ProposalBackCover, FinancialTable, FinancialColumn, FinancialColumnKind } from "../../lib/api";
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
import { PDFDownloadLink, BlobProvider } from "@react-pdf/renderer";
import ProjectReportPDF from "./ProjectReportPDF";
import ProposalPDF, { type ProposalTeamResume } from "./ProposalPDF";
import { fetchResumeByEmp, fetchResumeByUser, uploadExpenseAttachment, deleteExpenseAttachment, attachmentUrl, uploadProcurementAttachment, deleteProcurementAttachment, type ApiExpense } from "../../lib/api";
import RichTextEditor from "./RichTextEditor";
import * as XLSX from "xlsx";
import DocSection from "./DocSection";
import ProjectInfoTab from "./ProjectInfoTab";
import TechnicalDocsTab from "./TechnicalDocsTab";
import SubcontractorResumes from "./SubcontractorResumes";
import InvoiceLedger from "./InvoiceLedger";
import ReminderButton from "./ReminderButton";
import ProposalCoverBuilder from "./ProposalCoverBuilder";
import ProposalSectionManager from "./ProposalSectionManager";
import SavedVersionsPanel from "./SavedVersionsPanel";
import { fetchSavedDocuments, saveDocumentVersion, updateSavedDocument, deleteSavedDocument } from "../../lib/api";
import { assembleProposalPdf, downloadBlob } from "../../lib/proposalExport";
import { fetchSubInvoices, addSubInvoice, updateSubInvoice, deleteSubInvoice, uploadSubInvoiceAttachment, deleteSubInvoiceAttachment, type ApiSubInvoice } from "../../lib/api";
import { fetchVendors, uploadProjectContract, deleteProjectContract, type ApiVendor } from "../../lib/api";
import { PROJECT_STATUSES, statusMeta } from "../../lib/projectStatus";
import { sanitizeMoney } from "../../lib/money";
import { locationFlag, flagForCountry, COUNTRIES } from "../../lib/countryFlag";
import { EMPTY_SITE_ADDRESS, shortLocation, type SiteAddress } from "../../lib/address";
import type { ProjectStatus } from "../../lib/api";
import AgreementsPanel from "./agreements/AgreementsPanel";
import { type ProposalRequirement, type ApiResourceBlock, type ProposalContent as ProposalContentType, fetchProposalRevisions, createProposalRevision, deleteProposalRevision, type ApiProposalRevision } from "../../lib/api";
import { resolveProposalLayout, PROPOSAL_BUILTINS, fetchProposalTemplates, saveProposalTemplate, deleteProposalTemplate, resolveFinancialTables, defaultFinancialColumns, type ProposalSectionMeta, type ProposalLetterhead, type ApiProposalTemplate, type ProposalTemplateContent } from "../../lib/api";
import PortalMenu from "./PortalMenu";
import { useMeta } from "../../hooks/useMeta";
import { toast } from "../../lib/toast";
import { SERVICE_CATEGORIES } from "../../data/services";

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

const PROJECT_NATURE_TYPES = [
  "IDIQ", "Preventive Maintenance (PM)", "WWTP", "WTP", "HVAC", "Laboratory Service",
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


// ── Default tabs ───────────────────────────────────────────────────────────
const DEFAULT_TABS = [
  { id: "nature", label: "Project Nature", icon: Wrench },
  { id: "client", label: "Client Info", icon: Building2 },
  { id: "project-info", label: "Project Info", icon: FileText },
  { id: "proposals", label: "Proposals", icon: FileSpreadsheet },
  { id: "pm", label: "Project Management", icon: Calendar },
  { id: "tech-docs", label: "Technical Docs", icon: FileCode },
  { id: "subs", label: "Subcontractors & Employees", icon: Users },
  { id: "legal", label: "Legal Docs", icon: Scale },
  { id: "expenses", label: "Expenses", icon: DollarSign },
  { id: "po", label: "Purchase Orders", icon: ShoppingCart },
  { id: "invoice-sent", label: "Invoice Sent", icon: Receipt },
  { id: "invoice-received", label: "Invoice Received", icon: Receipt },
  { id: "procurement", label: "Procurement & Submittals", icon: Truck },
];

// Procurement sub-tabs that can be granted to a guest (e.g. a logistics-company subcontractor)
// individually. Permission keys are stored in the guest's tabPermissions like any other tab.
const PROC_SUBTABS = [
  { key: "log", permId: "proc-log", label: "Master Log" },
  { key: "boq", permId: "proc-boq", label: "BOQ" },
  { key: "submittals", permId: "proc-submittals", label: "Submittals" },
  { key: "rfqs", permId: "proc-rfqs", label: "RFQs" },
  { key: "quotes", permId: "proc-quotes", label: "Quotes" },
  { key: "po", permId: "proc-po", label: "Purchase Orders" },
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

  // Tabs
  const [activeTab, setActiveTab] = useState("nature");
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
  const [subAgreements, setSubAgreements] = useState<ApiSubAgreement[]>([]);
  const [agreementModal, setAgreementModal] = useState<{ subId: string } | null>(null);
  const [agrForm, setAgrForm] = useState<{ name: string; description: string; agreement: File | null; offer: File | null; others: File[] }>({ name: "", description: "", agreement: null, offer: null, others: [] });
  const [agrSaving, setAgrSaving] = useState(false);
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

  // Per-tab Access & Sharing Control (Employees visibility)
  const [tabAccess, setTabAccess] = useState<Record<string, { employees: boolean }>>({});
  const currentAccess = tabAccess[activeTab] ?? { employees: true };
  const toggleAccess = () =>
    setTabAccess((prev) => ({
      ...prev,
      [activeTab]: { employees: !currentAccess.employees },
    }));

  // Project Nature
  const [selectedNature, setSelectedNature] = useState<string[]>([]);
  const [customNatureInput, setCustomNatureInput] = useState("");
  const [customNatureTypes, setCustomNatureTypes] = useState<string[]>([]);

  // Client info (editable form on the Client Info tab)
  type ClientInfo = { name: string; reference: string; contactName: string; email: string; phone: string; country: string; address: string; notes: string };
  const [clientInfo, setClientInfo] = useState<ClientInfo>({
    name: "", reference: "", contactName: "", email: "", phone: "", country: "", address: "", notes: "",
  });
  const updateClient = (field: keyof ClientInfo, value: string) =>
    setClientInfo((prev) => ({ ...prev, [field]: value }));

  // §M — Joint Venture info (partner company for a JV project)
  type JVImage = { name: string; url: string };
  type JVInfo = { enabled: boolean; partnerName: string; partnerAddress: string; contactName: string; email: string; phone: string; lead: string; logo: string; notes: string; stamps: JVImage[]; signatures: JVImage[] };
  const [jvInfo, setJvInfo] = useState<JVInfo>({ enabled: false, partnerName: "", partnerAddress: "", contactName: "", email: "", phone: "", lead: "", logo: "", notes: "", stamps: [], signatures: [] });
  // Editing the JV record marks the workspace dirty so the unsaved-changes guard applies —
  // uploaded partner stamps/signatures only persist via Save Workspace / Save Identity.
  const updateJv = <K extends keyof JVInfo>(field: K, value: JVInfo[K]) => { setJvInfo((prev) => ({ ...prev, [field]: value })); setDirty(true); };
  // Uploaded assets live under token-guarded /uploads — resolve them the same way documents do.
  const assetSrc = (p?: string) => { if (!p) return ""; const s = p.replace(/^\/+/, ""); return s.startsWith("uploads/") ? attachmentUrl(s) : (p.startsWith("/") ? p : `/${p}`); };
  // §M — Joint Venture editor, reused in Project Identity and the Partners tab.
  const renderJVSection = (disabled: boolean) => (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-display font-bold text-slate-900">Joint Venture</h3>
          <p className="text-xs text-slate-400 mt-1">Is this a GreenTech project, or a joint venture with a partner company?</p>
        </div>
        <label className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer ${jvInfo.enabled ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600"} ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
          <input type="checkbox" checked={jvInfo.enabled} disabled={disabled} onChange={(e) => updateJv("enabled", e.target.checked)} />
          {jvInfo.enabled ? "Joint Venture" : "GreenTech only"}
        </label>
      </div>
      {jvInfo.enabled && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {([
              { field: "partnerName", label: "Partner Company Name", placeholder: "e.g. ACCU Company" },
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
            {/* Partner logo — a chosen file, not a link */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Partner Logo</label>
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
            <textarea rows={2} value={jvInfo.partnerAddress} onChange={(e) => updateJv("partnerAddress", e.target.value)} disabled={disabled} placeholder="Full address…"
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all resize-none disabled:opacity-60" />
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
                        <button type="button" title="Remove" onClick={() => updateJv(kind, jvInfo[kind].filter((_, j) => j !== i))}
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
  const [assignedEmployees, setAssignedEmployees] = useState<string[]>([]);
  const [empSearch, setEmpSearch] = useState("");

  // Financial rows from DB
  type ExpenseRow = ApiExpense;
  type PORow = { _id: string; poNumber: string; vendor: string; amount: string; date: string; status: string };
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
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
  const PROPOSAL_STATUSES = ["Draft", "Ready", "Submitted", "Awarded", "Rejected"];
  const PROPOSAL_STATUS_COLOR: Record<string, string> = {
    Draft: "bg-amber-50 text-amber-600",
    Ready: "bg-indigo-50 text-indigo-600",
    Submitted: "bg-blue-50 text-blue-600",
    Awarded: "bg-emerald-50 text-emerald-600",
    Rejected: "bg-red-50 text-red-500",
  };
  const updateProposalField = (
    which: "technical" | "financial",
    field: keyof ProposalMeta,
    value: string,
  ) => setProposals((prev) => ({ ...prev, [which]: { ...prev[which], [field]: value } }));
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
    logoMode: "single", jvLogoUrl: "", images: [],
  });
  const emptyCoverLetter = (): ProposalCoverLetter => ({ enabled: false, body: "", useEmailSignature: false, signatories: [] });
  const emptyBackCover = (): ProposalBackCover => ({ enabled: false, tagline: "", website: "", email: "", phone: "", address: "", social: "", marketing: "", images: [] });
  const [proposalSub, setProposalSub] = useState<"overview" | "technical" | "financial">("overview");
  const [proposalDocTab, setProposalDocTab] = useState<"cover" | "builder" | "versions">("builder"); // inner tab inside Technical/Financial
  const [procSub, setProcSub] = useState<"boq" | "log" | "submittals" | "rfqs" | "quotes" | "po" | "shipment" | "legacy">("log"); // Procurement module sub-tab (default = Master Log overview)
  const [highlightSubItem, setHighlightSubItem] = useState<string | undefined>(undefined); // §C9 — flash a submittal when jumped to from the BOQ
  const [openRfqId, setOpenRfqId] = useState<string | undefined>(undefined); // open a specific RFQ after creating it from the BOQ

  // Deep-link support for the "+ New" menu: /dashboard/projects/:id?tab=procurement&proc=rfqs
  useEffect(() => {
    const tab = searchParams.get("tab");
    const proc = searchParams.get("proc");
    const sub = searchParams.get("sub");   // Subcontractors & Employees sub-tab
    if (!tab && !proc && !sub) return;
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
  const [expenseSearch, setExpenseSearch] = useState(""); // per-tab search within the Expense Log
  // Preview modal: which proposal's PDF to render full-screen.
  const [proposalPreview, setProposalPreview] = useState<"technical" | "financial" | null>(null);
  // Other projects, for the "import past performance" picker.
  const [otherProjects, setOtherProjects] = useState<ApiProject[]>([]);
  const [showSimilarPicker, setShowSimilarPicker] = useState(false);
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);
  // Full resumes of proposal team members — appended to the technical proposal PDF.
  const [teamResumes, setTeamResumes] = useState<ProposalTeamResume[]>([]);

  // Fetch each named team member's resume from their profile — by account id (works even with
  // no empId, e.g. admins), falling back to empId. Members without a saved resume are skipped.
  useEffect(() => {
    let cancelled = false;
    const rows = technical.employees.map((e) => {
      const pool = employeePool.find((p) => (e.userId && p.id === e.userId) || (e.empId && p.empId === e.empId) || p.name === e.name);
      return { name: e.name, role: e.role, userId: e.userId || pool?.id || "", empId: e.empId || pool?.empId || "" };
    }).filter((r) => r.userId || r.empId);
    if (!rows.length) { setTeamResumes([]); return; }
    (async () => {
      const results = await Promise.all(rows.map(async (r) => {
        const data = (r.userId ? await fetchResumeByUser(r.userId) : null) || (r.empId ? await fetchResumeByEmp(r.empId) : null);
        return data ? { name: r.name, role: r.role, data } : null;
      }));
      if (!cancelled) setTeamResumes(results.filter((r): r is ProposalTeamResume => r !== null));
    })();
    return () => { cancelled = true; };
  }, [technical.employees, employeePool]);

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
    const rows = src.rows.map((r) => ({ id: `r-${uid()}`, cells: Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [colMap[k] || k, v])) }));
    const idx = t.findIndex((x) => x.id === tid);
    const copy: FinancialTable = { id: `t-${uid()}`, title: `${src.title} (copy)`, columns, rows };
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

  const tableTotal = (tb: FinancialTable) => {
    const amtCols = tb.columns.filter((c) => c.kind === "amount").map((c) => c.id);
    return tb.rows.reduce((sum, r) => sum + amtCols.reduce((s, cid) => s + fNum(r.cells[cid] || ""), 0), 0);
  };

  // Export one table to an .xlsx file.
  const exportTableExcel = (tb: FinancialTable) => {
    const header = tb.columns.map((c) => c.label);
    const data = tb.rows.map((r) => tb.columns.map((c) => r.cells[c.id] ?? ""));
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (tb.title || "Table").slice(0, 31).replace(/[\\/?*[\]]/g, ""));
    XLSX.writeFile(wb, `${(project?.name || "pricing").replace(/\s+/g, "_")}_${(tb.title || "table").replace(/\s+/g, "_")}.xlsx`);
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
      const kindFor = (h: string): FinancialColumnKind => /amount|total/i.test(h) ? "amount" : /qty|rate|price|cost|unit/i.test(h) ? "number" : "text";
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
  const addEmployeeRow = (name = "", role = "", empId = "", userId = "") =>
    setTech("employees", [...technical.employees, { id: uid(), name, role, resumeName: "", empId, userId }]);
  const updateEmployeeRow = (eid: string, field: "name" | "role" | "resumeName", value: string) =>
    setTech("employees", technical.employees.map((e) => (e.id === eid ? { ...e, [field]: value } : e)));
  const removeEmployeeRow = (eid: string) => setTech("employees", technical.employees.filter((e) => e.id !== eid));

  const addSimilarRow = (data?: Partial<{ name: string; client: string; value: string; year: string; summary: string }>) =>
    setTech("similarProjects", [...technical.similarProjects, { id: uid(), name: "", client: "", value: "", year: "", summary: "", ...data }]);
  const updateSimilarRow = (sid: string, field: "name" | "client" | "value" | "year" | "summary", value: string) =>
    setTech("similarProjects", technical.similarProjects.map((s) => (s.id === sid ? { ...s, [field]: value } : s)));
  const removeSimilarRow = (sid: string) => setTech("similarProjects", technical.similarProjects.filter((s) => s.id !== sid));

  const addTimelineRow = () => setTech("timeline", [...technical.timeline, { phase: "", start: "", end: "" }]);
  const updateTimelineRow = (idx: number, field: "phase" | "start" | "end", value: string) =>
    setTech("timeline", technical.timeline.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  const removeTimelineRow = (idx: number) => setTech("timeline", technical.timeline.filter((_, i) => i !== idx));

  const updateSectionRow = (sid: string, field: "heading" | "body", value: string) =>
    setTech("sections", technical.sections.map((s) => (s.id === sid ? { ...s, [field]: value } : s)));

  // ── Section engine (order / visibility / titles) ─────────────────────────────
  const setLayout = (next: ProposalSectionMeta[]) => setTech("layout", next);
  // Reorder a section by index against the *resolved* layout (used by the on-box arrows).
  const moveProposalSection = (index: number, dir: -1 | 1) => {
    const cur = resolveProposalLayout(technical);
    const j = index + dir;
    if (j < 0 || j >= cur.length) return;
    const next = cur.slice();
    [next[index], next[j]] = [next[j], next[index]];
    setLayout(next);
  };
  // Add a custom section (optionally with a standard-section title) and append it to the layout.
  const addLayoutSection = (title: string, body = "") =>
    setTechnical((p) => {
      const newId = uid();
      const section = { id: newId, heading: title || "New Section", body };
      const layout = [...resolveProposalLayout(p), { id: `m-${newId}`, kind: "custom" as const, refId: newId, title: title || "New Section", hidden: false }];
      return { ...p, sections: [...p.sections, section], layout };
    });
  const duplicateLayoutSection = (meta: ProposalSectionMeta) =>
    setTechnical((p) => {
      const src = p.sections.find((s) => s.id === meta.refId);
      if (!src) return p;
      const newId = uid();
      const section = { id: newId, heading: `${src.heading} (copy)`, body: src.body };
      const resolved = resolveProposalLayout(p);
      const at = resolved.findIndex((m) => m.id === meta.id);
      const newMeta = { id: `m-${newId}`, kind: "custom" as const, refId: newId, title: `${meta.title} (copy)`, hidden: meta.hidden };
      const layout = [...resolved.slice(0, at + 1), newMeta, ...resolved.slice(at + 1)];
      return { ...p, sections: [...p.sections, section], layout };
    });
  const removeLayoutSection = (meta: ProposalSectionMeta) =>
    setTechnical((p) => ({
      ...p,
      sections: p.sections.filter((s) => s.id !== meta.refId),
      layout: resolveProposalLayout(p).filter((m) => m.id !== meta.id),
    }));
  const addBlankPage = () =>
    setTechnical((p) => ({
      ...p,
      layout: [...resolveProposalLayout(p), { id: `blank-${uid()}`, kind: "blank" as const, title: "Blank page", hidden: false, letterhead: "none" as const }],
    }));
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
    ({ cover, coverFinancial, coverLetter, backCover, letterhead, customLetterheadUrl, requirements, technical, financial });
  const applyProposalSnapshot = (c: ProposalContentType) => {
    setCover({ ...emptyCover(), ...(c.cover || {}) });
    setCoverFinancial({ ...emptyCover(), ...(c.coverFinancial || c.cover || {}) });
    setCoverLetter({ ...emptyCoverLetter(), ...(c.coverLetter || {}) });
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
    const el = (
      <ProposalPDF kind={which} project={project} cover={which === "financial" ? coverFinancial : cover} coverLetter={coverLetter} backCover={backCover} letterhead={letterhead} customLetterheadUrl={customLetterheadUrl} technical={technical} financial={financial} logoUrl={logoUrl} resumes={teamResumes} />
    );
    const atts = withAttachments ? await fetchDocuments(id, which === "technical" ? "proposals-technical" : "proposals-financial") : [];
    const { blob, skipped } = await assembleProposalPdf(el, atts);
    if (skipped.length) toast(`Attached but couldn't embed (not PDF/image): ${skipped.join(", ")}`, "info");
    return blob;
  };

  // Build & download the proposal PDF — optionally merging the section's uploaded attachments.
  const downloadProposal = async (which: "technical" | "financial", withAttachments: boolean) => {
    if (!project || !id) return;
    const key = `${which}-${withAttachments}`;
    setProposalDownloading(key);
    try {
      const blob = await buildProposalBlob(which, withAttachments);
      const fileBase = (project.name || "project").replace(/\s+/g, "_");
      downloadBlob(blob, `${fileBase}_${which === "technical" ? "Technical" : "Financial"}_Proposal.pdf`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not build the PDF.", "error");
    } finally {
      setProposalDownloading(null);
    }
  };

  // Open the "import past performance" picker, loading the project list on demand.
  const openSimilarPicker = async () => {
    setShowSimilarPicker(true);
    if (otherProjects.length === 0) {
      try { setOtherProjects(await fetchProjects("all")); } catch { /* non-fatal */ }
    }
  };
  const importSimilarProject = (p: ApiProject) => {
    addSimilarRow({
      name: p.name,
      client: p.clientInfo?.name || p.owner || "",
      value: "",
      year: (p.endDate || p.startDate || "").slice(0, 4),
      summary: p.description || "",
    });
    toast(`Added "${p.name}" to similar projects.`, "success");
  };

  // Edit Project Identity modal (owner only)
  type IdentityForm = {
    name: string; clientName: string; status: string; category: string; siteAddress: SiteAddress;
    description: string; reportNotes: string; fiscal: string; compliance: string; value: string;
    startDate: string; endDate: string; progress: number;
    disciplines: string; contractNo: string; contractYear: string;
  };
  const [showEditIdentity, setShowEditIdentity] = useState(false);
  const [identityForm, setIdentityForm] = useState<IdentityForm>({
    name: "", clientName: "", status: "Planning", category: "", siteAddress: EMPTY_SITE_ADDRESS,
    description: "", reportNotes: "", fiscal: "", compliance: "", value: "",
    startDate: "", endDate: "", progress: 0, disciplines: "", contractNo: "", contractYear: "",
  });
  const setAddr = <K extends keyof SiteAddress>(k: K, v: SiteAddress[K]) =>
    setIdentityForm((f) => ({ ...f, siteAddress: { ...f.siteAddress, [k]: v } }));
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
      status: project.status || "Planning",
      category: project.category || "",
      siteAddress: {
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
        clientInfo: { ...project.clientInfo, name: identityForm.clientName },
        status: identityForm.status as ApiProject["status"],
        category: identityForm.category,
        location: shortLocation(identityForm.siteAddress, project.location),
        siteAddress: identityForm.siteAddress,
        description: identityForm.description,
        reportNotes: identityForm.reportNotes,
        fiscal: identityForm.fiscal,
        compliance: identityForm.compliance,
        value: identityForm.value,
        startDate: identityForm.startDate,
        endDate: identityForm.endDate,
        progress: Number(identityForm.progress) || 0,
        disciplines: identityForm.disciplines.split(",").map((d) => d.trim()).filter(Boolean),
        contractNo: identityForm.contractNo,
        contractYear: identityForm.contractYear,
        jointVenture: jvInfo, // §M — JV now lives in Project Identity
      });
      setProject(updated);
      setClientInfo((prev) => ({ ...prev, name: identityForm.clientName }));
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
  const handleJvLogoUpload = async (file: File) => {
    if (!id) return;
    if (file.size > 8 * 1024 * 1024) { toast("Logo must be under 8 MB.", "error"); return; }
    setJvLogoUploading(true);
    try { const { url } = await uploadProposalAsset(id, file); updateJv("logo", url); toast("Partner logo uploaded — remember to save.", "success"); }
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
  const [subOfferDocs, setSubOfferDocs] = useState<Record<string, ApiDocument[]>>({}); // §L — offer files per subId
  const [editingSubIdx, setEditingSubIdx] = useState<number | null>(null);
  const [subForm, setSubForm] = useState<SubContractor>({ name: "", scope: "", subId: "", contact: "", email: "", phone: "", notes: "", invoiceAmount: "", userId: "" });
  const [showSubModal, setShowSubModal] = useState(false);
  // Subs & Employees tab: "employees" | "subcontractors", plus which subcontractor is open.
  const [subsSubTab, setSubsSubTab] = useState<"employees" | "subcontractors" | "partners" | "vendors">("employees");
  // Vendors (shared with the RFQ tab) — listed here so each vendor record can hold agreements.
  const [projVendors, setProjVendors] = useState<ApiVendor[]>([]);
  const [activeVendorId, setActiveVendorId] = useState<string | null>(null);
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
  // When granting access from a subcontractor's tab, remember which one so we can link the login.
  const [grantingForSubIdx, setGrantingForSubIdx] = useState<number | null>(null);
  // The access modal is shared with the Partners tab — this flips its copy to say "Partner".
  const [grantingPartner, setGrantingPartner] = useState(false);
  const guestNoun = grantingPartner ? "Partner" : "Subcontractor";
  const guestNounLc = grantingPartner ? "partner" : "subcontractor";

  // Live financials for the Project Report PDF — income from subcontractor invoice
  // amounts, expenses from the Expenses tab. Declared after the states it reads.
  const reportFinancials = (() => {
    const n = (s: string) => parseFloat(String(s).replace(/[^0-9.-]/g, "")) || 0;
    const expenses = expenseRows.reduce((sum, e) => sum + (n(e.qty) || 1) * n(e.amount), 0);
    const income = subInvoices.reduce((sum, inv) => sum + n(inv.amount), 0);
    return { income, expenses };
  })();

  const refreshSubDocs = async () => {
    if (!id) return;
    try {
      const docs = await fetchDocuments(id);
      const grouped: Record<string, ApiDocument[]> = {};
      const invoices: Record<string, ApiDocument[]> = {};
      const offers: Record<string, ApiDocument[]> = {};
      for (const d of docs) {
        if (d.section?.startsWith("subinvoice-")) {
          const subId = d.section.slice("subinvoice-".length);
          (invoices[subId] = invoices[subId] || []).push(d);
        } else if (d.section?.startsWith("suboffer-")) {
          const subId = d.section.slice("suboffer-".length);
          (offers[subId] = offers[subId] || []).push(d);
        } else if (d.section?.startsWith("subcontractor-")) {
          const subId = d.section.slice("subcontractor-".length);
          (grouped[subId] = grouped[subId] || []).push(d);
        }
      }
      setSubDocs(grouped);
      setSubInvoiceDocs(invoices);
      setSubOfferDocs(offers);
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
      setSubcontractors((prev) => [...prev, { ...subForm }]);
    }
    setShowSubModal(false);
    setEditingSubIdx(null);
  };

  const handleDeleteSub = async (idx: number) => {
    const sub = subcontractors[idx];
    if (!sub) return;
    if (!confirm(`Delete subcontractor "${sub.name}" and remove their agreements?`)) return;
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

  const handleUploadSubAgreement = async (subId: string, file: File) => {
    if (!id) return;
    try {
      await uploadDocument(id, file, `subcontractor-${subId}`);
      await refreshSubDocs();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed.", "error");
    }
  };

  // Structured agreements: create with name + description, then attach the agreement / offer / other
  // documents. Offers & agreements are merged into this one flow; many agreements per subcontractor.
  const refreshSubAgreements = () => { if (id) fetchSubAgreements(id).then(setSubAgreements).catch(() => {}); };
  useEffect(() => { refreshSubAgreements(); /* eslint-disable-next-line */ }, [id]);
  const openAgreementModal = (subId: string) => { setAgrForm({ name: "", description: "", agreement: null, offer: null, others: [] }); setAgreementModal({ subId }); };
  const submitAgreement = async () => {
    if (!id || !agreementModal) return;
    if (!agrForm.name.trim()) { toast("Give the agreement a name.", "error"); return; }
    setAgrSaving(true);
    try {
      const created = await createSubAgreement(id, agreementModal.subId, agrForm.name.trim(), agrForm.description.trim());
      const uploads: Array<[File, SubAgreementDocKind]> = [];
      if (agrForm.agreement) uploads.push([agrForm.agreement, "agreement"]);
      if (agrForm.offer) uploads.push([agrForm.offer, "offer"]);
      for (const f of agrForm.others) uploads.push([f, "other"]);
      for (const [file, kind] of uploads) { try { await uploadSubAgreementFile(id, created._id, file, kind); } catch { /* keep going */ } }
      refreshSubAgreements();
      setAgreementModal(null);
      toast("Agreement created.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not create agreement.", "error"); }
    finally { setAgrSaving(false); }
  };
  const removeAgreement = async (aid: string) => {
    if (!id || !confirm("Delete this agreement and its documents?")) return;
    try { await deleteSubAgreement(id, aid); refreshSubAgreements(); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  const removeAgreementFile = async (aid: string, fid: string) => {
    if (!id) return;
    try { const updated = await deleteSubAgreementFile(id, aid, fid); setSubAgreements((p) => p.map((a) => a._id === aid ? updated : a)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };

  const handleDeleteSubAgreement = async (docId: string) => {
    if (!id) return;
    if (!confirm("Delete this agreement file?")) return;
    try {
      await deleteDocument(id, docId);
      await refreshSubDocs();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    }
  };

  // §L — Subcontractor offers: upload negotiation offers, accept one (gates Agreement & Scope).
  const handleUploadSubOffer = async (subId: string, file: File) => {
    if (!id) return;
    try { await uploadDocument(id, file, `suboffer-${subId}`); await refreshSubDocs(); }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
  };
  const handleDeleteSubOffer = async (subIdx: number, docId: string) => {
    if (!id) return;
    if (!confirm("Delete this offer file?")) return;
    try {
      await deleteDocument(id, docId);
      // If the accepted offer was deleted, clear the acceptance.
      if (subcontractors[subIdx]?.acceptedOfferId === docId) {
        persistSubs(subcontractors.map((s, i) => i === subIdx ? { ...s, acceptedOfferId: "" } : s));
      }
      await refreshSubDocs();
    } catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  // Accept ONE offer (the agreed one). Accepting a new offer replaces the previous acceptance.
  const acceptSubOffer = (subIdx: number, docId: string) => {
    const cur = subcontractors[subIdx]?.acceptedOfferId;
    persistSubs(subcontractors.map((s, i) => i === subIdx ? { ...s, acceptedOfferId: cur === docId ? "" : docId } : s));
  };

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
    // Default every tab to "view" — owner downgrades to Hidden or upgrades to Edit.
    const initialPerms: Record<string, "none" | "view" | "edit"> = {};
    allTabsAll.forEach((t) => { initialPerms[t.id] = "view"; });
    setGPerms(initialPerms); setGAlsoProjects([]); setGExpiry(""); setGuestStep(1);
    setGrantingForSubIdx(null); setGrantingPartner(false);
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

  // Grant the JV PARTNER a login — reuses the subcontractor guest system, but pre-granted FULL
  // access to every project tab (partners can see everything).
  const openPartnerAccess = async () => {
    await openCreateGuest();
    setGExistingId(null);
    setGName(jvInfo.partnerName || jvInfo.contactName || "");
    setGEmail(jvInfo.email || "");
    const full: Record<string, "none" | "view" | "edit"> = {};
    allTabsAll.forEach((t) => { full[t.id] = "edit"; });
    setGPerms(full);
    setGrantingPartner(true);
    setGuestStep(2);
  };
  // The guest login linked to this project's JV partner (matched by the partner's email).
  const partnerGuest = jvInfo.email ? guestsList.find((g) => g.email && g.email.toLowerCase() === jvInfo.email.toLowerCase()) : undefined;
  const removePartnerAccess = async (g: ApiGuest) => {
    if (!id) return;
    if (!confirm(`Remove ${g.name || g.email}'s partner login to this project?`)) return;
    try { await removeGuest(id, g.userId); await refreshGuests(); toast("Partner access removed.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Failed to remove access.", "error"); }
  };

  // Revoke a subcontractor's login and unlink it from the record.
  const removeSubAccess = async (idx: number, g: ApiGuest) => {
    if (!id) return;
    if (!confirm(`Remove ${g.name || g.email}'s login access to this project?`)) return;
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

  const openEditGuest = (guest: ApiGuest, asPartner = false) => {
    setGrantingPartner(asPartner);
    setEditingGuest(guest);
    setGName(guest.name); setGEmail(guest.email); setGPassword("");
    const perms: Record<string, "none" | "view" | "edit"> = {};
    Object.entries(guest.tabPermissions || {}).forEach(([k, v]) => { perms[k] = v; });
    // Prefill the timeline as a custom date if one is set.
    setGExpiry(guest.expiresAt ? new Date(guest.expiresAt).toISOString().slice(0, 10) : "");
    setGPerms(perms); setGAlsoProjects([]); setGuestStep(2);
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

  // Load everything on mount
  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetchProject(id),
      fetchEmployees(),
      fetchExpenses(id),
      fetchPurchaseOrders(id),
      fetchSubInvoices(id).catch(() => [] as ApiSubInvoice[]),
    ])
      .then(async ([proj, emps, expenses, pos, subInv]) => {
        setSubInvoices(subInv as ApiSubInvoice[]);
        refreshTemplates();
        setProject(proj);
        setIsPublished(proj.published);
        setSelectedNature(proj.projectNature?.selected ?? []);
        setCustomNatureTypes(proj.projectNature?.custom ?? []);
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
  }, [id]);

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
    if (activeTab === tabId) setActiveTab("nature");
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

  const toggleEmployee = (empId: string) =>
    setAssignedEmployees((prev) =>
      prev.includes(empId) ? prev.filter((e) => e !== empId) : [...prev, empId]
    );

  const addCustomNature = () => {
    if (!customNatureInput.trim()) return;
    setCustomNatureTypes((prev) => [...prev, customNatureInput.trim()]);
    setCustomNatureInput("");
  };

  const currentUser = getAuthUser();
  const myEmpId = (currentUser as { empId?: string } | null)?.empId || "";
  const isGuest = (currentUser as { role?: string } | null)?.role === "subcontractor";
  const isOwner = !!(project && currentUser && (project as ApiProject & { ownerId?: string }).ownerId === currentUser.id);
  // A guest's per-tab permissions on this project ("view" | "edit").
  const myGuestPerms: Record<string, "view" | "edit"> =
    (project?.guests || []).find((g) => g.userId === currentUser?.id)?.tabPermissions || {};
  const isAssigned = !isGuest && !!(project && myEmpId && assignedEmployees.includes(myEmpId));
  const guestHasAccess = isGuest && Object.keys(myGuestPerms).length > 0;
  const hasAnyAccess = isOwner || isAssigned || guestHasAccess;
  const guestCanEditActive = isGuest && myGuestPerms[activeTab] === "edit";
  const canEdit = isOwner || isAssigned || guestCanEditActive;  // edit content of the ACTIVE tab
  const canEditIdentity = isOwner;              // can edit project identity / A&S
  const canManage = isOwner || isAssigned;      // employee-level structural actions (add tabs, export)
  // Visible tabs: owner sees all; guest sees granted tabs; employee sees tabs whose Employees toggle is on
  // A guest can reach Procurement if they have the module perm OR any procurement sub-tab perm.
  const hasAnyProcPerm = PROC_SUBTABS.some((s) => myGuestPerms[s.permId] === "view" || myGuestPerms[s.permId] === "edit");
  const allTabs = isOwner
    ? allTabsAll
    : isGuest
      ? allTabsAll.filter((t) => myGuestPerms[t.id] === "view" || myGuestPerms[t.id] === "edit" || (t.id === "procurement" && hasAnyProcPerm))
      : allTabsAll.filter((t) => t.id !== "showcase" && (tabAccess[t.id]?.employees ?? true) !== false);

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
    { k: "shipment", label: "Shipment" }, { k: "legacy", label: "Legacy Log" },
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
  const handleSave = async () => {
    if (!id || !project || !canEdit) return;
    setSaving(true);
    try {
      const payload: Partial<ApiProject> = {};
      if (canEditIdentity) {
        payload.published = isPublished;
        payload.projectNature = { selected: selectedNature, custom: customNatureTypes };
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
      payload.proposalContent = { cover, coverFinancial, coverLetter, backCover, letterhead, customLetterheadUrl, requirements, technical, financial } as ProposalContent;
      const updated = await updateProject(id, payload);
      setProject(updated);
      setDirty(false); // I5 — workspace is now saved
      setClientLocked(true); // L1 — re-lock client info after a save
      toast("Workspace saved.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  // L1 — Client Information locks after saving; an Edit button re-enables it (prevents accidental edits).
  const [clientLocked, setClientLocked] = useState(true);
  // I5 — warn before leaving/reloading with unsaved workspace edits (proposal builder etc.).
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  // Any edit on the Proposals tab (which persists only on "Save Workspace") marks the workspace dirty.
  useEffect(() => {
    if (activeTab !== "proposals" || !canEdit) return;
    const mark = () => setDirty(true);
    window.addEventListener("input", mark, true);
    window.addEventListener("change", mark, true);
    return () => { window.removeEventListener("input", mark, true); window.removeEventListener("change", mark, true); };
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
      {/* ── Header ── */}
      <div className="flex flex-col gap-5">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors font-bold text-xs uppercase tracking-widest w-fit"
        >
          <ArrowLeft size={16} /> Back to Projects
        </button>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center text-primary font-bold text-lg flex-shrink-0">
              {project.id.split("-")[1]}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                <h1 className="text-2xl font-display font-bold text-slate-900">{project.name}</h1>
                {/* Colour-coded status — the same palette as the projects table's status key. */}
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${statusMeta(project.status).badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusMeta(project.status).dot}`} /> {statusMeta(project.status).label}
                </span>
                {project.jointVenture?.enabled && (
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
                />
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {project.clientInfo?.name && (
                  <>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                      <User size={11} /> {project.clientInfo.name}
                    </span>
                    <span className="text-xs font-bold text-slate-300">·</span>
                  </>
                )}
                {project.category && (
                  <>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                      <Building2 size={11} /> {project.category}
                    </span>
                    <span className="text-xs font-bold text-slate-300">·</span>
                  </>
                )}
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                  <MapPin size={11} /> <span className="text-[1.3em] leading-none align-middle">{flagForCountry(project.siteAddress?.country) || locationFlag(project.location)}</span> {shortLocation(project.siteAddress, project.location)}
                </span>
                <span className="text-xs font-bold text-slate-300">·</span>
                {/* Two numbers: our internal project number, and the client's contract number. */}
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest" title="Internal project number">Project No: {id}</span>
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
                {project.endDate && (
                  <>
                    <span className="text-xs font-bold text-slate-300">·</span>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                      <Calendar size={11} /> Deadline: {project.endDate}
                    </span>
                  </>
                )}
                {project.value && (
                  <>
                    <span className="text-xs font-bold text-slate-300">·</span>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400" title="Project value / worth">
                      <DollarSign size={11} /> {project.value}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 flex-shrink-0 items-stretch lg:items-end">
            {/* Row 1 — Public website controls (owner only), in a distinct "publish" format */}
            {isOwner && (
              <div className="flex flex-wrap items-center gap-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl px-4 py-2 lg:justify-end">
                <div className="flex items-center gap-3">
                  <Globe size={16} className={isPublished ? "text-indigo-500" : "text-slate-300"} />
                  <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Preview on website</span>
                  <button
                    type="button"
                    onClick={() => setIsPublished((v) => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-300 focus:outline-none flex-shrink-0 ${isPublished ? "bg-indigo-500" : "bg-slate-200"}`}
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
                  className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-primary bg-white border border-indigo-200 rounded-xl px-4 py-2 shadow-sm transition-all"
                >
                  <FileImage size={15} /> Manage Showcase
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
                      className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-white border border-indigo-200 rounded-xl px-4 py-2 shadow-sm transition-all"
                    >
                      <ExternalLink size={15} /> View on website
                    </motion.a>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Row 2 — Project actions */}
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              {canManage && (
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  title="Download a zip containing project data and all uploaded files"
                  className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl border border-slate-200 bg-white text-slate-700 hover:text-primary text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  {exporting ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                  {exporting ? "Preparing…" : "Export Project"}
                </button>
              )}

              {!isGuest && (
                <PDFDownloadLink
                  document={<ProjectReportPDF project={project} logoUrl={`${window.location.origin}/gt-logo-horizontal.png`} financials={reportFinancials} />}
                  fileName={`${(project.name || "project").replace(/\s+/g, "_")}_Report.pdf`}
                >
                  {({ loading }) => (
                    <span className="cursor-pointer flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl border border-slate-200 bg-white text-slate-700 hover:text-primary text-xs font-bold shadow-sm">
                      <FileText size={14} />
                      {loading ? "Preparing…" : "Create Report"}
                    </span>
                  )}
                </PDFDownloadLink>
              )}

              {canManage && (
                <button
                  onClick={async () => {
                    if (!id || !project) return;
                    try { const u = await setProjectArchived(id, !project.archived); setProject(u); toast(u.archived ? "Project archived — hidden from the lists." : "Project restored.", "success"); }
                    catch (e) { toast(e instanceof Error ? e.message : "Could not update.", "error"); }
                  }}
                  className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl border border-slate-200 bg-white text-slate-700 hover:text-amber-600 text-xs font-bold shadow-sm"
                >
                  <Archive size={14} /> {project.archived ? "Restore" : "Archive"}
                </button>
              )}

              {(canManage || (isGuest && Object.values(myGuestPerms).includes("edit"))) && (
              <button
                onClick={handleSave}
                disabled={!canEdit || saving}
                title={!canEdit ? "Switch to a tab you can edit to save." : ""}
                className={`px-4 sm:px-7 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm shadow-lg transition-all active:scale-95 flex items-center gap-2 ${
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
              <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                <button
                  onClick={openAddTab}
                  className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl border-2 border-dashed border-slate-200 bg-white text-slate-500 hover:text-primary hover:border-primary text-xs font-bold transition-all"
                >
                  <Plus size={14} /> Add Tab
                </button>
                <button
                  onClick={() => setShowTemplatesModal(true)}
                  className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl border-2 border-dashed border-slate-200 bg-white text-slate-500 hover:text-primary hover:border-primary text-xs font-bold transition-all"
                >
                  <BookOpen size={14} /> Templates
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab Bar (top-level) ── */}
      <div className="bg-white border border-slate-100 rounded-2xl sm:rounded-[1.5rem] shadow-sm overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-0.5 sm:gap-1 p-1 sm:p-1.5 min-w-max">
          {topLevelTabs.map((tab) => {
            const ct = customTabs.find((c) => c.id === tab.id);
            const isCustom = !!ct;
            const isActive = activeParentId === tab.id;
            return (
              <div key={tab.id} className="relative flex-shrink-0">
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:pl-3 sm:pr-4 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-[10px] sm:text-[11px] uppercase tracking-wide sm:tracking-widest transition-all whitespace-nowrap ${
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
      </div>

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

      {/* ── Access & Sharing Control (per-tab) — owner only ── */}
      {isOwner && (
      <div className="bg-white border border-slate-100 rounded-[1.5rem] shadow-sm px-6 py-4 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Access &amp; Sharing Control</h4>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            Manage visibility for the{" "}
            <span className="text-slate-700 font-bold">
              {allTabs.find((t) => t.id === activeTab)?.label ?? "current"}
            </span>{" "}
            tab.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => canEditIdentity && toggleAccess()}
            disabled={!canEditIdentity}
            title={!canEditIdentity ? "Only the project owner can change this." : ""}
            className={`flex items-center gap-3 px-4 py-2 rounded-2xl border transition-all ${
              currentAccess.employees ? "bg-white border-slate-200 shadow-sm" : "bg-slate-50 border-slate-100"
            } ${!canEditIdentity ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <Users size={14} className={currentAccess.employees ? "text-indigo-500" : "text-slate-400"} />
            <span className={`text-xs font-bold ${currentAccess.employees ? "text-slate-700" : "text-slate-400"}`}>
              Employees
            </span>
            <span
              className={`relative w-9 h-5 rounded-full transition-colors duration-300 flex-shrink-0 ${
                currentAccess.employees ? "bg-indigo-500" : "bg-slate-200"
              }`}
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md ${
                  currentAccess.employees ? "left-[1.125rem]" : "left-0.5"
                }`}
              />
            </span>
          </button>
        </div>
      </div>
      )}

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

          {/* PROJECT NATURE */}
          {activeTab === "nature" && (
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-10">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-display font-bold text-slate-900 mb-2">Project Nature</h3>
                  <p className="text-slate-400 text-sm font-medium">Select one or more project types that apply to this engagement.</p>
                </div>
                {!canEditIdentity && (
                  <span className="px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 flex-shrink-0">View only</span>
                )}
              </div>
              <div className="flex flex-wrap gap-4">
                {[...PROJECT_NATURE_TYPES, ...customNatureTypes].map((type) => (
                  <button
                    key={type}
                    disabled={!canEditIdentity}
                    onClick={() => {
                      if (!canEditIdentity) return;
                      setSelectedNature((prev) =>
                        prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
                      );
                    }}
                    className={`flex items-center gap-3 px-6 py-4 rounded-2xl font-bold text-sm transition-all border-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                      selectedNature.includes(type)
                        ? "border-primary bg-primary/5 text-primary shadow-lg shadow-primary/10"
                        : "border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {selectedNature.includes(type) && <Check size={15} />}
                    {type}
                  </button>
                ))}
              </div>
              {canEditIdentity && (
                <div className="border-t border-slate-50 pt-8">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Add Custom Type</p>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={customNatureInput}
                      onChange={(e) => setCustomNatureInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addCustomNature()}
                      placeholder="Type new project category..."
                      className="flex-grow bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                    />
                    <button
                      onClick={addCustomNature}
                      className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-primary transition-all active:scale-95"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CLIENT INFO */}
          {activeTab === "client" && (
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-display font-bold text-slate-900">Client Information</h3>
                  <p className="text-xs text-slate-400 mt-1">{clientLocked ? <>Locked. Click <strong>Edit</strong> to change, then <strong>Save Workspace</strong>.</> : <>Editing — changes persist when you click <strong>Save Workspace</strong> at the top.</>}</p>
                </div>
                {!canEditIdentity ? (
                  <span className="px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500">View only</span>
                ) : clientLocked ? (
                  <button onClick={() => setClientLocked(false)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary transition-colors"><Edit2 size={13} /> Edit</button>
                ) : (
                  <button onClick={() => setClientLocked(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors"><Lock size={13} /> Lock</button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {([
                  { field: "name", label: "Client / Organization Name", type: "text", placeholder: "e.g. USAID Ghana" },
                  { field: "reference", label: "Client Reference Number", type: "text", placeholder: "e.g. USAID-GH-2026-012" },
                  { field: "contactName", label: "Primary Contact Name", type: "text", placeholder: "Full name" },
                  { field: "email", label: "Contact Email", type: "email", placeholder: "contact@client.org" },
                  { field: "phone", label: "Contact Phone", type: "tel", placeholder: "+1 (555) 000-0000" },
                  { field: "country", label: "Country / Region", type: "text", placeholder: "e.g. Accra, Ghana" },
                ] as const).map((f) => (
                  <div key={f.field} className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{f.label}</label>
                    <input
                      type={f.type}
                      value={clientInfo[f.field]}
                      onChange={(e) => updateClient(f.field, e.target.value)}
                      disabled={!canEditIdentity || clientLocked}
                      placeholder={f.placeholder}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all disabled:opacity-60"
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Address</label>
                <textarea
                  rows={3}
                  value={clientInfo.address}
                  onChange={(e) => updateClient("address", e.target.value)}
                  disabled={!canEditIdentity || clientLocked}
                  placeholder="Full mailing address..."
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all resize-none disabled:opacity-60"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notes</label>
                <textarea
                  rows={3}
                  value={clientInfo.notes}
                  onChange={(e) => updateClient("notes", e.target.value)}
                  disabled={!canEditIdentity || clientLocked}
                  placeholder="Any relevant notes about the client relationship..."
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all resize-none disabled:opacity-60"
                />
              </div>

            </div>
          )}

          {/* PROJECT INFO */}
          {activeTab === "project-info" && id && (
            <ProjectInfoTab projectId={id} canEdit={canEdit} isOwner={isOwner} projectInfo={projectPdfInfo(project)} clientName={project?.clientInfo?.name} />
          )}

          {/* PROPOSALS */}
          {activeTab === "proposals" && id && project && (() => {
            const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
            const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
            const logoUrl = `${window.location.origin}/gt-usa-logo-new.png`;
            const fmtMoney = (n: number) => `${financial.currency || "$"}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

            const ActionButtons = ({ which }: { which: "technical" | "financial" }) => (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setProposalSub(which)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  <Edit2 size={13} /> {canEdit ? "Open builder" : "Open"}
                </button>
                <button
                  onClick={() => setProposalPreview(which)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors"
                >
                  <Eye size={13} /> Preview
                </button>
                <button
                  onClick={() => downloadProposal(which, false)}
                  disabled={proposalDownloading === `${which}-false`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  <Download size={13} /> {proposalDownloading === `${which}-false` ? "Preparing…" : "Download PDF"}
                </button>
                <button
                  onClick={() => downloadProposal(which, true)}
                  disabled={proposalDownloading === `${which}-true`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors disabled:opacity-50"
                  title="Merge this proposal's uploaded attachments into one PDF"
                >
                  <Download size={13} /> {proposalDownloading === `${which}-true` ? "Merging…" : "Download + attachments"}
                </button>
                <button
                  onClick={() => downloadProposalWord(which)}
                  disabled={proposalDownloading === `${which}-docx`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors disabled:opacity-50"
                  title="Export as an editable Word document"
                >
                  <FileText size={13} /> {proposalDownloading === `${which}-docx` ? "Preparing…" : "Word (.docx)"}
                </button>
              </div>
            );

            return (
            <div className="space-y-6">
              {/* Sub-tab bar */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-3 py-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
                <span className={`${lbl} px-3 shrink-0`}>Proposal:</span>
                {([
                  { k: "overview" as const, label: "Overview" },
                  { k: "technical" as const, label: "Technical Proposal" },
                  { k: "financial" as const, label: "Financial Proposal" },
                ]).map((t) => (
                  <button
                    key={t.k}
                    onClick={() => setProposalSub(t.k)}
                    className={`px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wide sm:tracking-widest transition-all whitespace-nowrap ${
                      proposalSub === t.k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/60"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* OVERVIEW */}
              {proposalSub === "overview" && (
                <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {([
                    { which: "technical" as const, title: "Technical Proposal", section: "proposals-technical" },
                    { which: "financial" as const, title: "Financial Proposal", section: "proposals-financial" },
                  ]).map((p) => (
                    <div key={p.which} className="space-y-4">
                      <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-display font-bold text-slate-900 text-lg">{p.title}</h4>
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${PROPOSAL_STATUS_COLOR[proposals[p.which].status] || "bg-slate-100 text-slate-500"}`}>
                            {proposals[p.which].status || "Draft"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className={lbl}>Submission Date</label>
                            <input type="date" value={proposals[p.which].submissionDate} onChange={(e) => updateProposalField(p.which, "submissionDate", e.target.value)} disabled={!canEdit} className={inp} />
                          </div>
                          <div className="space-y-1.5">
                            <label className={lbl}>Status</label>
                            <select value={proposals[p.which].status} onChange={(e) => updateProposalField(p.which, "status", e.target.value)} disabled={!canEdit} className={`${inp} appearance-none`}>
                              {PROPOSAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                        <ActionButtons which={p.which} />
                        <p className="text-[10px] text-slate-400">Build the proposal in its tab, then <strong>Preview</strong> or <strong>Download PDF</strong>. Edits persist when you click <strong>Save Workspace</strong>.</p>
                      </div>
                      <DocSection projectId={id} section={p.section} title={`${p.title} — Attachments`} canEdit={canEdit} canPublish={isOwner} />
                    </div>
                  ))}
                </div>
                </div>
              )}

              {/* Inner sub-tabs for each document: Cover Page / Builder */}
              {(proposalSub === "technical" || proposalSub === "financial") && (
                <div className="flex items-center gap-2">
                  {([
                    { k: "cover" as const, label: "Cover Page" },
                    { k: "builder" as const, label: "Builder" },
                    { k: "versions" as const, label: "Saved Versions" },
                  ]).map((t) => (
                    <button
                      key={t.k}
                      onClick={() => setProposalDocTab(t.k)}
                      className={`px-4 py-1.5 rounded-lg font-bold text-[11px] transition-all ${
                        proposalDocTab === t.k ? "bg-slate-900 text-white shadow" : "bg-white border border-slate-100 text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {/* TECHNICAL / FINANCIAL — Saved Versions (each document keeps its own history) */}
              {(proposalSub === "technical" || proposalSub === "financial") && proposalDocTab === "versions" && (
                <SavedVersionsPanel
                  heading={`Saved ${proposalSub === "technical" ? "Technical" : "Financial"} Proposal Versions`}
                  subtitle="Freeze a PDF copy of this proposal (with attachments merged). Preview, print, or download any revision — including the one sent to the client."
                  canEdit={canEdit}
                  formats={[{
                    label: "PDF", ext: "pdf",
                    baseName: `${(project.name || "project")}_${proposalSub === "technical" ? "Technical" : "Financial"}_Proposal`,
                    build: () => buildProposalBlob(proposalSub === "technical" ? "technical" : "financial", true),
                  }]}
                  fetchList={() => fetchSavedDocuments(id, "proposal", proposalSub)}
                  saveVersion={(file, fileName, meta) => saveDocumentVersion(id, { kind: "proposal", refId: proposalSub, title: meta.title, status: meta.status }, file, fileName)}
                  update={(docId, body) => updateSavedDocument(id, docId, body)}
                  remove={(docId) => deleteSavedDocument(id, docId).then(() => {})}
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
                  canEdit={canEdit}
                />
              )}

              {/* TECHNICAL — Builder */}
              {proposalSub === "technical" && proposalDocTab === "builder" && (() => {
                const techLayout = resolveProposalLayout(technical);
                // Built-in section editors (rendered in document order below, each with on-box arrows).
                const descriptionEditor = (
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
                    <h4 className="font-bold text-slate-800 text-sm">Technical Description</h4>
                    <RichTextEditor value={technical.description} onChange={(html) => setTech("description", html)} disabled={!canEdit} placeholder="Describe the technical approach, methodology, scope of work…" minHeight={200} onImageUpload={id ? (file) => uploadInlineImage(id, file) : undefined} />
                  </div>
                );
                const personnelEditor = (
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800 text-sm">Key Personnel</h4>
                      {canEdit && (
                        <div className="flex gap-2">
                          <button onClick={() => setShowEmployeePicker(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-bold hover:bg-indigo-100"><Users size={12} /> Import from team</button>
                          <button onClick={() => addEmployeeRow()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200"><Plus size={12} /> Add</button>
                        </div>
                      )}
                    </div>
                    {technical.employees.length === 0 && <p className="text-xs text-slate-400">No personnel added yet.</p>}
                    {technical.employees.map((e) => {
                      const hasResume = teamResumes.some((tr) => tr.name === e.name);
                      return (
                      <div key={e.id} className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr_auto] gap-2 items-center">
                        <input value={e.name} onChange={(ev) => updateEmployeeRow(e.id, "name", ev.target.value)} disabled={!canEdit} placeholder="Name" className={inp} />
                        <input value={e.role} onChange={(ev) => updateEmployeeRow(e.id, "role", ev.target.value)} disabled={!canEdit} placeholder="Role / Title" className={inp} />
                        <span className={`text-[11px] font-bold flex items-center gap-1.5 px-2 ${hasResume ? "text-emerald-600" : "text-slate-400"}`} title="Resumes are pulled automatically from each person's profile and attached to the PDF">
                          {hasResume ? <><Check size={13} /> Résumé attached</> : "No résumé on profile"}
                        </span>
                        {canEdit && <button onClick={() => removeEmployeeRow(e.id)} className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>}
                      </div>
                      );
                    })}
                  </div>
                );
                const pastPerfEditor = (
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800 text-sm">Similar Projects / Past Performance</h4>
                      {canEdit && (
                        <div className="flex gap-2">
                          <button onClick={openSimilarPicker} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-bold hover:bg-indigo-100"><Download size={12} /> Import project</button>
                          <button onClick={() => addSimilarRow()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200"><Plus size={12} /> Add</button>
                        </div>
                      )}
                    </div>
                    {technical.similarProjects.length === 0 && <p className="text-xs text-slate-400">No reference projects added yet.</p>}
                    {technical.similarProjects.map((s) => (
                      <div key={s.id} className="rounded-2xl border border-slate-100 p-4 space-y-2 bg-slate-50/50">
                        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_0.8fr_0.6fr_auto] gap-2">
                          <input value={s.name} onChange={(ev) => updateSimilarRow(s.id, "name", ev.target.value)} disabled={!canEdit} placeholder="Project name" className={inp} />
                          <input value={s.client} onChange={(ev) => updateSimilarRow(s.id, "client", ev.target.value)} disabled={!canEdit} placeholder="Client" className={inp} />
                          <input value={s.value} onChange={(ev) => updateSimilarRow(s.id, "value", ev.target.value)} disabled={!canEdit} placeholder="Value" className={inp} />
                          <input value={s.year} onChange={(ev) => updateSimilarRow(s.id, "year", ev.target.value)} disabled={!canEdit} placeholder="Year" className={inp} />
                          {canEdit && <button onClick={() => removeSimilarRow(s.id)} className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>}
                        </div>
                        <textarea value={s.summary} onChange={(ev) => updateSimilarRow(s.id, "summary", ev.target.value)} disabled={!canEdit} placeholder="Short summary of the work performed…" rows={2} className={`${inp} resize-none`} />
                      </div>
                    ))}
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
                const customEditor = (refId?: string) => {
                  const s = technical.sections.find((x) => x.id === refId);
                  if (!s) return null;
                  return (
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-2">
                      <RichTextEditor value={s.body} onChange={(html) => updateSectionRow(s.id, "body", html)} disabled={!canEdit} placeholder="Section content…" minHeight={160} onImageUpload={id ? (file) => uploadInlineImage(id, file) : undefined} />
                    </div>
                  );
                };
                const editorFor = (m: ProposalSectionMeta) => {
                  switch (m.kind) {
                    case "description": return descriptionEditor;
                    case "personnel": return personnelEditor;
                    case "pastPerformance": return pastPerfEditor;
                    case "timeline": return timelineEditor;
                    case "custom": return customEditor(m.refId);
                    default: return <div className="bg-white p-5 rounded-[2rem] border border-dashed border-slate-200 text-[11px] text-slate-400 italic">Blank page — no content (a spacer in the exported PDF).</div>;
                  }
                };
                return (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h3 className="text-xl font-display font-bold text-slate-900">Technical Proposal</h3>
                    <ActionButtons which="technical" />
                  </div>

                  <div className="bg-primary/5 border border-primary/10 rounded-2xl px-4 py-3 text-[11px] text-slate-600">
                    Edit this document's cover page in the <strong>Cover Page</strong> sub-tab above. Reorder sections with the <strong>↑ ↓</strong> arrows on each box below — that's the order they print in.
                  </div>

                  {/* Section manager — Add section lives here; the reorder list is collapsed by default */}
                  <ProposalSectionManager
                    layout={techLayout}
                    onLayoutChange={setLayout}
                    onAdd={addLayoutSection}
                    onAddBlank={addBlankPage}
                    onDuplicate={duplicateLayoutSection}
                    onRemove={removeLayoutSection}
                    canEdit={canEdit}
                    collapsed={!showSectionList}
                    onToggleCollapsed={() => setShowSectionList((v) => !v)}
                  />

                  {/* Section editors in document order, each with on-box reorder arrows */}
                  {techLayout.map((m, i) => (
                    <div key={m.id} className={m.hidden ? "opacity-50" : ""}>
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
                <ProposalCoverBuilder
                  projectId={id}
                  project={project}
                  cover={coverFinancial}
                  onCoverChange={setCoverFinancial}
                  canEdit={canEdit}
                />
              )}

              {/* FINANCIAL — Builder */}
              {proposalSub === "financial" && proposalDocTab === "builder" && (() => {
                const finTables = resolveFinancialTables(financial);
                const grandTotal = finTables.reduce((s, tb) => s + tableTotal(tb), 0);
                return (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h3 className="text-xl font-display font-bold text-slate-900">Financial Proposal</h3>
                    <ActionButtons which="financial" />
                  </div>

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
                    const total = tableTotal(tb);
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
                                          <option value="text">text</option><option value="number">number</option><option value="amount">amount ($)</option>
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
                              {tb.rows.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50/40">
                                  {tb.columns.map((c) => (
                                    <td key={c.id} className="px-1 py-1"><input value={r.cells[c.id] || ""} onChange={(e) => setCell(tb.id, r.id, c.id, e.target.value)} disabled={!canEdit} className={`${inp} min-w-[5rem] ${c.kind === "amount" ? "text-right font-bold" : ""}`} /></td>
                                  ))}
                                  {canEdit && <td className="px-1 py-1"><button onClick={() => removeRow(tb.id, r.id)} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={13} /></button></td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          {canEdit ? <button onClick={() => addRow(tb.id)} className="flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline"><Plus size={12} /> Add row</button> : <span />}
                          <div className="bg-slate-50 rounded-xl px-4 py-2 border-l-4 border-primary">
                            <span className={lbl}>Total</span> <span className="text-lg font-bold text-slate-900 ml-2">{fmtMoney(total)}</span>
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

                  <p className="text-[10px] text-slate-400">Columns set to <strong>amount ($)</strong> are summed for each table total. Add multiple tables for quarterly/phased pricing; duplicate to reuse a layout; export any table to Excel.</p>

                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
                    <h4 className="font-bold text-slate-800 text-sm">Notes / Terms</h4>
                    <RichTextEditor value={financial.notes} onChange={(html) => setFin("notes", html)} disabled={!canEdit} placeholder="Payment terms, validity period, assumptions…" minHeight={120} onImageUpload={id ? (file) => uploadInlineImage(id, file) : undefined} />
                  </div>
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
                    <BlobProvider document={<ProposalPDF kind={proposalPreview} project={project} cover={proposalPreview === "financial" ? coverFinancial : cover} coverLetter={coverLetter} backCover={backCover} letterhead={letterhead} customLetterheadUrl={customLetterheadUrl} technical={technical} financial={financial} logoUrl={logoUrl} resumes={teamResumes} />}>
                      {({ url, loading }) => (loading || !url)
                        ? <div className="flex items-center justify-center h-full text-slate-500 text-sm gap-2"><Loader2 className="animate-spin" size={18} /> Generating preview…</div>
                        : <iframe src={url} title="Proposal preview" className="w-full h-full border-0" />}
                    </BlobProvider>
                  </div>
                </div>
              )}

              {/* Import-from-team picker */}
              {showEmployeePicker && (
                <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowEmployeePicker(false)}>
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

              {/* Import past-performance project picker */}
              {showSimilarPicker && (
                <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowSimilarPicker(false)}>
                  <div className="bg-white rounded-3xl p-6 w-full max-w-lg max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-display font-bold text-slate-900">Import a past project</h3>
                      <button onClick={() => setShowSimilarPicker(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} /></button>
                    </div>
                    {otherProjects.length === 0 && <p className="text-xs text-slate-400">Loading projects…</p>}
                    <div className="space-y-1">
                      {otherProjects.filter((p) => p.id !== id).map((p) => (
                        <button key={p.id} onClick={() => { importSimilarProject(p); setShowSimilarPicker(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left">
                          <FileText size={16} className="text-slate-400 shrink-0" />
                          <div className="min-w-0"><p className="text-sm font-bold text-slate-800 truncate">{p.name}</p><p className="text-[10px] text-slate-400 truncate">{p.clientInfo?.name || p.category || p.id}</p></div>
                          <Download size={14} className="ml-auto text-slate-300 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            );
          })()}

          {/* PROJECT MANAGEMENT */}
          {activeTab === "pm" && id && (
            <div className="space-y-6">
              {[
                { sid: "pm-schedules", title: "Schedules" },
                { sid: "pm-meeting-minutes", title: "Meeting Minutes" },
                { sid: "pm-progress-reports", title: "Progress Reports" },
                { sid: "pm-site-data", title: "Site Data" },
                { sid: "pm-closeout", title: "Closeout Documents" },
              ].map((s) => (
                <DocSection key={s.sid} projectId={id} section={s.sid} title={s.title} canEdit={canEdit} canPublish={isOwner} />
              ))}
            </div>
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
            {subsSubTab === "employees" && (
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-display font-bold text-slate-900 mb-1">
                    {isOwner ? "Assign Employees" : "Project Team"}
                  </h3>
                  <p className="text-xs font-medium text-slate-400">
                    {isOwner
                      ? "Toggle employees to assign or remove them from this project."
                      : "Managed by the project owner. Only the owner can add or remove team members."}
                  </p>
                </div>

                {isOwner ? (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={15} />
                      <input
                        type="text"
                        value={empSearch}
                        onChange={(e) => setEmpSearch(e.target.value)}
                        placeholder="Search by name or ID..."
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2.5 pl-9 pr-4 text-xs font-medium focus:ring-2 focus:ring-primary/10 outline-none"
                      />
                    </div>
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {filteredEmployees.map((emp) => {
                        const assigned = assignedEmployees.includes(emp.empId);
                        return (
                          <div
                            key={emp.empId}
                            onClick={() => toggleEmployee(emp.empId)}
                            className={`flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                              assigned ? "border-primary bg-primary/5" : "border-slate-100 bg-slate-50 hover:border-slate-200"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${assigned ? "bg-primary text-white" : "bg-white border border-slate-100 text-slate-400"}`}>
                                {assigned ? <Check size={14} /> : emp.name[0]}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-900">{emp.name}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{emp.empId}</p>
                              </div>
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${assigned ? "text-primary" : "text-slate-300"}`}>
                              {assigned ? "Assigned" : "Unassigned"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="pt-4 border-t border-slate-50 text-xs font-bold text-slate-400">
                      {assignedEmployees.length} of {employeePool.filter((e) => e.empId).length} employees assigned
                    </div>
                  </>
                ) : (
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {assignedEmployees.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No team members assigned yet.</p>
                    ) : (
                      assignedEmployees.map((empIdStr) => {
                        const emp = employeePool.find((e) => e.empId === empIdStr);
                        const isMe = empIdStr === myEmpId;
                        return (
                          <div
                            key={empIdStr}
                            className="flex items-center justify-between p-4 rounded-2xl border-2 border-primary/30 bg-primary/5"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold bg-primary text-white">
                                <Check size={14} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-900">
                                  {emp?.name ?? empIdStr}
                                  {isMe && <span className="ml-2 text-[10px] font-bold text-primary uppercase tracking-widest">(You)</span>}
                                </p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{empIdStr}</p>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Assigned</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
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
                                    projectName: project?.name || "", projectNo: project?.id || "",
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
                  <p className="text-xs font-medium text-slate-400">GreenTech's shared supplier list (managed in Procurement → RFQs). Agreements you create here belong to <strong>this project</strong>. Vendors have no login, so download the agreement, share it outside the platform, and upload the counter-signed copy when it returns.</p>
                </div>
                {projVendors.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No vendors yet. Add them in <strong>Procurement → RFQs → Vendors</strong>.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {projVendors.map((v) => (
                        <button key={v._id} onClick={() => setActiveVendorId(v._id)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeVendorId === v._id ? "bg-slate-900 text-white shadow" : "bg-white border border-slate-100 text-slate-500 hover:text-slate-900"}`}>
                          <Building2 size={13} /> {v.name || "Vendor"}
                        </button>
                      ))}
                    </div>
                    {(() => {
                      const v = projVendors.find((x) => x._id === activeVendorId);
                      if (!v || !id) return null;
                      return (
                        <div className="space-y-4">
                          <div className="p-4 bg-slate-50 rounded-2xl">
                            <p className="text-sm font-bold text-slate-900">{v.name}</p>
                            <p className="text-xs text-slate-500 mt-1">{[[v.city, v.country].filter(Boolean).join(", "), v.contactName && `Attn: ${v.contactName}`, v.email, v.phone].filter(Boolean).join(" · ") || "No contact details yet — edit the vendor in Procurement → RFQs."}</p>
                          </div>
                          <AgreementsPanel
                            ctx={{ kind: "project", projectId: id, entityType: "vendor", entityId: v._id }}
                            canManage={canEdit && !isGuest}
                            canSign={false}
                            defaults={{
                              projectName: project?.name || "", projectNo: project?.id || "",
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
                {/* Nested subcontractor pills */}
                <div className="flex flex-wrap items-center gap-2">
                  {subcontractors.map((s, idx) => (
                    <button
                      key={s.subId || idx}
                      onClick={() => setActiveSubIdx(idx)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${Math.min(activeSubIdx, subcontractors.length - 1) === idx ? "bg-slate-900 text-white shadow" : "bg-white border border-slate-100 text-slate-500 hover:text-slate-900"}`}
                    >
                      <Building2 size={13} /> {s.name || "Unnamed"}
                    </button>
                  ))}
                  {canEdit && !isGuest && (
                    <button onClick={openAddSub} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-primary border border-dashed border-primary/30 hover:bg-primary/5">
                      <Plus size={13} /> Add subcontractor
                    </button>
                  )}
                </div>

                {subcontractors.length === 0 ? (
                  <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm text-center text-sm text-slate-400 italic">
                    No subcontractors yet.{canEdit ? " Click “Add subcontractor” to create the first one." : ""}
                  </div>
                ) : (() => {
                  const i = Math.min(activeSubIdx, subcontractors.length - 1);
                  const sub = subcontractors[i];
                  const docs = subDocs[sub.subId] || [];
                  const offerDocs = subOfferDocs[sub.subId] || [];              // §L
                  const hasAcceptedOffer = !!sub.acceptedOfferId && offerDocs.some((d) => d._id === sub.acceptedOfferId);
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

                      {/* AGREEMENTS — offers & agreements merged; create multiple named agreements */}
                      {subInnerTab === "agreement" && (() => {
                        const myAgreements = subAgreements.filter((a) => a.subId === sub.subId);
                        const KIND_LABEL: Record<string, string> = { agreement: "Agreement", offer: "Offer", other: "Other" };
                        return (
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
                                projectName: project?.name || "", projectNo: project?.id || "",
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
                          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><FileText size={11} /> Uploaded agreements &amp; offers ({myAgreements.length})</p>
                            {canEdit && <button onClick={() => openAgreementModal(sub.subId)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Plus size={12} /> Upload bundle</button>}
                          </div>
                          {myAgreements.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic">No agreements yet.{canEdit ? " Click “Create agreement”." : ""}</p>
                          ) : (
                            <div className="space-y-2.5">
                              {myAgreements.map((a) => (
                                <div key={a._id} className="bg-slate-50 rounded-2xl p-4 space-y-2">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-bold text-slate-800">{a.name || "Agreement"}</p>
                                      {a.description && <p className="text-[11px] text-slate-500 mt-0.5 whitespace-pre-wrap">{a.description}</p>}
                                    </div>
                                    {canEdit && <button onClick={() => removeAgreement(a._id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-white shrink-0" title="Delete agreement"><Trash2 size={14} /></button>}
                                  </div>
                                  {a.documents.length === 0 ? (
                                    <p className="text-[10px] text-slate-400 italic">No documents attached.</p>
                                  ) : (
                                    <div className="flex flex-col gap-1.5">
                                      {a.documents.map((d) => (
                                        <div key={d._id} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100">
                                          <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 ${d.kind === "agreement" ? "bg-emerald-50 text-emerald-600" : d.kind === "offer" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"}`}>{KIND_LABEL[d.kind]}</span>
                                          <a href={attachmentUrl(d.filePath)} target="_blank" rel="noreferrer" className="text-xs font-bold text-slate-700 hover:text-primary truncate flex-grow" title={d.name}>{d.name}</a>
                                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{d.size}</span>
                                          <a href={attachmentUrl(d.filePath)} download={d.name} className="p-1 rounded text-slate-400 hover:text-primary" title="Download"><Download size={12} /></a>
                                          {canEdit && <button onClick={() => removeAgreementFile(a._id, d._id)} className="p-1 rounded text-slate-400 hover:text-red-500" title="Remove file"><X size={12} /></button>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        );
                      })()}

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
            <div className="space-y-6">
              {[
                { sid: "legal-office-reg", title: "Local Office Registration" },
                { sid: "legal-iloc", title: "ILOC (Irrevocable Letter of Credit)" },
                { sid: "legal-bond", title: "Bond Documents" },
                { sid: "legal-insurance", title: "Insurance Certificates" },
                { sid: "legal-tax", title: "Tax Documents" },
              ].map((s) => (
                <DocSection key={s.sid} projectId={id} section={s.sid} title={s.title} canEdit={canEdit} canPublish={isOwner} />
              ))}
            </div>
          )}

          {/* EXPENSES */}
          {activeTab === "expenses" && id && (
            <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-xl font-display font-bold text-slate-900">Expense Log</h3>
                  <p className="text-xs text-slate-400 mt-1">{expenseRows.length} expense{expenseRows.length === 1 ? "" : "s"} · auto-saves on blur.</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={expenseSearch} onChange={(e) => setExpenseSearch(e.target.value)} placeholder="Search expenses…" className="bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10 w-44" />
                  </div>
                  {canEdit && (
                    <button
                      onClick={async () => {
                        try {
                          const row = await addExpense(id, { description: "", date: "", qty: "1", amount: "", remarks: "" }) as ExpenseRow;
                          setExpenseRows((p) => [...p, row]);
                        } catch (err) { toast(err instanceof Error ? err.message : "Failed", "error"); }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary"
                    >
                      <Plus size={13} /> Add Expense
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-y border-slate-100">
                      {["#", "Description", "Qty", "Unit Price", "Total Price", "Remarks", "Date", "Attachments", "Added By", "Approval", ""].map((h) => (
                        <th key={h} className="text-left px-3 py-3 font-bold text-slate-500 uppercase tracking-widest text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {expenseRows.length === 0 && (
                      <tr><td colSpan={11} className="px-3 py-10 text-center text-slate-400 italic">No expenses yet.</td></tr>
                    )}
                    {expenseRows
                      .filter((r) => !expenseSearch.trim() || [r.description, r.remarks, r.addedByName].some((v) => String(v || "").toLowerCase().includes(expenseSearch.toLowerCase())))
                      .map((row, idx) => {
                      const cell = (field: "description" | "date" | "qty" | "amount" | "remarks", type: "text" | "date" = "text", width = "") => {
                        const common = `${width} px-2 py-1.5 rounded bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none text-xs font-medium`;
                        const set = (v: string) => setExpenseRows((prev) => prev.map((r) => (r._id === row._id ? { ...r, [field]: v } : r)));
                        const save = (v: string) => updateExpense(id, row._id, { [field]: v });
                        if (field === "description" || field === "remarks")
                          return <td className="px-1 py-1 align-top"><AutoTextarea value={(row[field] as string) || ""} onChange={set} onBlur={save} disabled={!canEdit} className={`${common} w-full`} /></td>;
                        if (field === "amount")
                          return <td className="px-1 py-1 align-top"><MoneyInput value={(row[field] as string) || ""} onChange={set} onBlur={save} disabled={!canEdit} className={common} /></td>;
                        return (
                          <td className="px-1 py-1 align-top">
                            <input type={type} value={(row[field] as string) || ""} onChange={(e) => set(e.target.value)} onBlur={(e) => save(e.target.value)} disabled={!canEdit} className={common} />
                          </td>
                        );
                      };
                      const n = (s: string) => parseFloat(String(s).replace(/[^0-9.-]/g, "")) || 0;
                      const total = n(row.qty) * n(row.amount);
                      return (
                        <tr key={row._id} className="hover:bg-slate-50/40">
                          <td className="px-3 py-2 align-top text-slate-400 font-bold text-[11px]">{idx + 1}</td>
                          {cell("description", "text", "w-44")}
                          {cell("qty", "text", "w-14")}
                          {cell("amount", "text", "w-24")}
                          <td className="px-3 py-2 align-top font-bold text-slate-700 whitespace-nowrap">{total ? fmtMoney(total) : "—"}</td>
                          {cell("remarks", "text", "w-40")}
                          {cell("date", "date", "w-32")}
                          {/* Attachments */}
                          <td className="px-2 py-1 align-top">
                            <div className="flex flex-wrap items-center gap-1">
                              {(row.attachments || []).map((a) => (
                                <span key={a._id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600">
                                  <button onClick={() => setAttachmentPreview({ name: a.name, url: attachmentUrl(a.filePath), fileType: a.fileType })} className="hover:text-primary max-w-[80px] truncate" title={a.name}>{a.name}</button>
                                  {canEdit && (
                                    <button onClick={async () => { try { const u = await deleteExpenseAttachment(id, row._id, a._id); setExpenseRows((p) => p.map((r) => (r._id === row._id ? u : r))); } catch (err) { toast(err instanceof Error ? err.message : "Failed", "error"); } }} className="text-slate-300 hover:text-red-500"><X size={11} /></button>
                                  )}
                                </span>
                              ))}
                              {canEdit && (
                                <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-bold cursor-pointer hover:bg-primary">
                                  <Plus size={10} />
                                  <input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { const u = await uploadExpenseAttachment(id, row._id, f); setExpenseRows((p) => p.map((r) => (r._id === row._id ? u : r))); } catch (err) { toast(err instanceof Error ? err.message : "Upload failed", "error"); } }} />
                                </label>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top text-[11px] text-slate-500 whitespace-nowrap">{row.addedByName || "—"}{(row.addedByRole === "subcontractor" || row.addedByRole === "guest") ? " (subcontractor)" : ""}</td>
                          {/* Approval — employees/owners manage it; subcontractors only see the status */}
                          <td className="px-2 py-1 align-top">
                            {canManage ? (
                              <select
                                value={row.approval || "pending"}
                                onChange={(e) => {
                                  const v = e.target.value as ExpenseRow["approval"];
                                  setExpenseRows((prev) => prev.map((r) => (r._id === row._id ? { ...r, approval: v } : r)));
                                  updateExpense(id, row._id, { approval: v }).catch((err) => toast(err instanceof Error ? err.message : "Failed", "error"));
                                }}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold capitalize outline-none cursor-pointer border-0 ${approvalBadgeClass(row.approval)}`}
                              >
                                <option value="pending">Pending</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                              </select>
                            ) : (
                              <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${approvalBadgeClass(row.approval)}`}>{row.approval || "pending"}</span>
                            )}
                          </td>
                          <td className="px-2 py-1 align-top">
                            {canEdit && (
                              <button onClick={async () => { if (confirm("Delete?")) { await deleteExpense(id, row._id); setExpenseRows((p) => p.filter((r) => r._id !== row._id)); } }} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50" title="Delete row"><Trash2 size={13} /></button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
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
          {(activeTab === "invoice-sent" || activeTab === "invoice-received") && id && (
            <div className="space-y-6">
              <InvoiceLedger projectId={id} kind={activeTab === "invoice-sent" ? "sent" : "received"} canEdit={canEdit} projectInfo={projectPdfInfo(project)} onExpensesChanged={refreshExpenses} />
              <DocSection
                projectId={id}
                section={activeTab === "invoice-sent" ? "invoice-sent-documents" : "invoice-received-documents"}
                title={activeTab === "invoice-sent" ? "Invoice Documents" : "Bill Documents"}
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
              {procActive === "submittals" && id && <ProcurementSubmittals projectId={id} canEdit={procPermFor("submittals") === "edit"} highlightItemId={highlightSubItem} onHighlightDone={() => setHighlightSubItem(undefined)} />}
              {procActive === "rfqs" && id && <ProcurementRFQ projectId={id} canEdit={procPermFor("rfqs") === "edit"} projectInfo={projectPdfInfo(project)} onGoToPO={() => setProcSub("po")} openRfqId={openRfqId} onOpenedRfq={() => setOpenRfqId(undefined)} />}
              {procActive === "quotes" && id && <ProcurementQuotes projectId={id} canEdit={procPermFor("quotes") === "edit"} />}
              {procActive === "po" && id && <ProcurementPO projectId={id} canEdit={procPermFor("po") === "edit"} projectInfo={projectPdfInfo(project)} />}
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
                                    <button onClick={async () => { try { const u = await deleteProcurementAttachment(id!, row._id, a._id); setProcurementRows((p) => p.map((r) => (r._id === row._id ? u : r))); } catch (err) { toast(err instanceof Error ? err.message : "Failed", "error"); } }} className="text-slate-300 hover:text-red-500"><X size={11} /></button>
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
              onClick={closeAddTab}
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
                      {[...DEFAULT_TABS, ...customTabs.filter((c) => !c.parentId && c.id !== editingFieldsForTab)].map((t) => (
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRenamingTab(null)} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSaveTemplate(null)} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={cancelEditIdentity} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
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
                      <img src={project.image} alt={project.name} className="w-full h-full object-cover" />
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
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Name</label>
                  <input
                    type="text"
                    value={identityForm.clientName}
                    onChange={(e) => setIdentityForm({ ...identityForm, clientName: e.target.value })}
                    placeholder="e.g. USAID Ghana"
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-400">Saved to the project's Client Information.</p>
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
                  <p className="text-[10px] text-slate-400">The client's contract number (usually 9–10 characters or more). Shown alongside the internal project number.</p>
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
                  <p className="text-[10px] text-slate-400">Drives the Year column on My Projects / All Projects.</p>
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
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category (Service)</label>
                  <select
                    value={identityForm.category}
                    onChange={(e) => setIdentityForm({ ...identityForm, category: e.target.value })}
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed appearance-none"
                  >
                    <option value="">Select a service…</option>
                    {identityForm.category && !SERVICE_CATEGORIES.includes(identityForm.category) && (
                      <option value={identityForm.category}>{identityForm.category} (current)</option>
                    )}
                    {SERVICE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {/* Project site address — feeds RFQ/PO delivery and the "City, Country 🇬🇭" header. */}
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Country</label>
                  <select
                    value={identityForm.siteAddress.country}
                    onChange={(e) => setAddr("country", e.target.value)}
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed appearance-none"
                  >
                    <option value="">Select a country…</option>
                    {identityForm.siteAddress.country && !COUNTRIES.some((c) => c.name === identityForm.siteAddress.country) && (
                      <option value={identityForm.siteAddress.country}>{identityForm.siteAddress.country} (current)</option>
                    )}
                    {COUNTRIES.map((c) => (
                      <option key={c.iso} value={c.name}>{c.flag} {c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">State / Province</label>
                  <input
                    type="text"
                    value={identityForm.siteAddress.state}
                    onChange={(e) => setAddr("state", e.target.value)}
                    placeholder="e.g. Greater Accra"
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">City</label>
                  <input
                    type="text"
                    value={identityForm.siteAddress.city}
                    onChange={(e) => setAddr("city", e.target.value)}
                    placeholder="e.g. Accra"
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Exact Address</label>
                  <input
                    type="text"
                    value={identityForm.siteAddress.line1}
                    onChange={(e) => setAddr("line1", e.target.value)}
                    placeholder="Street address"
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Postal / ZIP Code</label>
                  <input
                    type="text"
                    value={identityForm.siteAddress.postalCode}
                    onChange={(e) => setAddr("postalCode", e.target.value)}
                    placeholder="e.g. 00233"
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progress (%)</label>
                  <input
                    type="number" min={0} max={100}
                    value={identityForm.progress}
                    onChange={(e) => setIdentityForm({ ...identityForm, progress: Number(e.target.value) })}
                    disabled={!isOwner}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-70 disabled:cursor-not-allowed"
                  />
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSubModal(false)} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
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
                  <input
                    type="text"
                    autoFocus
                    value={subForm.name}
                    onChange={(e) => setSubForm({ ...subForm, name: e.target.value })}
                    placeholder="e.g. AccraBuild Engineering Ltd."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none focus:bg-white focus:ring-4 focus:ring-primary/5"
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

      {/* Create Agreement modal — name, description, agreement/offer/other documents */}
      {agreementModal && (() => {
        const fileRow = (label: string, hint: string, file: File | null, onPick: (f: File | null) => void) => (
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-[11px] font-bold text-slate-600 cursor-pointer hover:bg-slate-200 shrink-0"><Upload size={12} /> Choose file<input type="file" className="hidden" onChange={(e) => { onPick(e.target.files?.[0] || null); e.target.value = ""; }} /></label>
              {file ? <span className="text-[11px] font-bold text-slate-600 truncate flex items-center gap-1">{file.name}<button onClick={() => onPick(null)} className="text-slate-300 hover:text-red-500"><X size={12} /></button></span> : <span className="text-[10px] text-slate-400 italic">{hint}</span>}
            </div>
          </div>
        );
        return (
          <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={() => !agrSaving && setAgreementModal(null)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
                <p className="text-sm font-bold text-slate-900">Create agreement</p>
                <button onClick={() => !agrSaving && setAgreementModal(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name *</label>
                  <input autoFocus value={agrForm.name} onChange={(e) => setAgrForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Civil Works Contract" className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/10" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</label>
                  <textarea rows={2} value={agrForm.description} onChange={(e) => setAgrForm((p) => ({ ...p, description: e.target.value }))} placeholder="Short description of this agreement…" className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/10 resize-y" />
                </div>
                {fileRow("Agreement document", "The signed agreement", agrForm.agreement, (f) => setAgrForm((p) => ({ ...p, agreement: f })))}
                {fileRow("Offer document", "The accepted offer", agrForm.offer, (f) => setAgrForm((p) => ({ ...p, offer: f })))}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Other documents</label>
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-[11px] font-bold text-slate-600 cursor-pointer hover:bg-slate-200 w-fit"><Upload size={12} /> Add files<input type="file" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) setAgrForm((p) => ({ ...p, others: [...p.others, ...fs] })); e.target.value = ""; }} /></label>
                  {agrForm.others.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {agrForm.others.map((f, i) => <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-600">{f.name}<button onClick={() => setAgrForm((p) => ({ ...p, others: p.others.filter((_, idx) => idx !== i) }))} className="text-slate-300 hover:text-red-500"><X size={11} /></button></span>)}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setAgreementModal(null)} disabled={agrSaving} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold disabled:opacity-50">Cancel</button>
                  <button onClick={submitAgreement} disabled={agrSaving || !agrForm.name.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50">{agrSaving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create agreement</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTemplatesModal(false)} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeEditTemplate} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowShowcaseModal(false)} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
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
                      ["Category", project.category],
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
                            {g.type === "image" ? <img src={g.url} alt="" className="w-full h-full object-cover" /> : <Globe size={20} className="text-slate-400" />}
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

      {/* Guest Access Wizard */}
      <AnimatePresence>
        {showGuestModal && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeGuestModal} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
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
                            for (const s of PROC_SUBTABS) rows.push(permRow(s.permId, `Procurement · ${s.label}`, true));
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
    </div>
  );
}
