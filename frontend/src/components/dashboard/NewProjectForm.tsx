import { motion, AnimatePresence } from "motion/react";
import { useState, useRef, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createProject, updateProject, uploadProjectImage, uploadProjectContract, uploadProposalAsset, type ApiProject } from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";
import { toast } from "../../lib/toast";
import { SERVICE_CATEGORIES } from "../../data/services";
import { PROJECT_STATUSES, statusMeta } from "../../lib/projectStatus";
import { sanitizeMoney } from "../../lib/money";
import { COUNTRIES } from "../../lib/countryFlag";
import { EMPTY_SITE_ADDRESS, shortLocation, type SiteAddress } from "../../lib/address";
import {
  Upload, Download, Eye, FileText, FileImage, FileCode,
  Plus, X, MoreHorizontal, Search,
  Check, Users, Building2, FileSpreadsheet,
  Receipt, ShoppingCart, Truck, Scale, Wrench, Calendar,
  DollarSign, ChevronRight, AlertCircle, Globe
} from "lucide-react";

// ── Shared data ────────────────────────────────────────────────────────────

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

const TABS = [
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

// ── Sub-components ─────────────────────────────────────────────────────────

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

function UploadZone({ label }: { label: string }) {
  return (
    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group">
      <Upload size={22} className="text-slate-300 group-hover:text-primary transition-colors mb-3" />
      <p className="text-xs font-bold text-slate-400 group-hover:text-primary transition-colors">{label}</p>
    </div>
  );
}

function InputField({ label, placeholder, type = "text", value, onChange }: {
  label: string; placeholder?: string; type?: string;
  value?: string; onChange?: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
      />
    </div>
  );
}

function TableSection({
  headers, rows, onAdd, addLabel,
}: {
  headers: string[]; rows: string[][]; onAdd: () => void; addLabel: string;
}) {
  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="bg-slate-50/50 border-b border-slate-50">
            {headers.map((h) => (
              <th key={h} className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</th>
            ))}
            <th className="px-6 py-4" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50/30 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-6 py-4 text-sm font-medium text-slate-700">{cell}</td>
              ))}
              <td className="px-6 py-4 text-right">
                <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-600 transition-colors"><MoreHorizontal size={16} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className="px-6 py-4 border-t border-slate-50">
        <button onClick={onAdd} className="flex items-center gap-2 text-xs font-bold text-primary hover:underline">
          <Plus size={13} /> {addLabel}
        </button>
      </div>
    </div>
  );
}

type Phase = { name: string; start: string; end: string };

// ── Main component ─────────────────────────────────────────────────────────

export default function NewProjectForm() {
  useMeta({ title: "Register New Project", description: "Start a new project — set identity, client info, timeline, and team." });
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("nature");
  const [customTabs, setCustomTabs] = useState<{ id: string; label: string; icon: typeof Plus }[]>([]);
  const [showAddTab, setShowAddTab] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // The signed contract, uploaded right after the project is created (needs the new projectId).
  const [contractFile, setContractFile] = useState<File | null>(null);

  // Identity
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [contractNo, setContractNo] = useState("");
  const [contractYear, setContractYear] = useState(String(new Date().getFullYear()));
  const [status, setStatus] = useState("Proposal");
  const [desc, setDesc] = useState("");
  const [siteAddr, setSiteAddr] = useState<SiteAddress>(EMPTY_SITE_ADDRESS);
  const setAddr = <K extends keyof SiteAddress>(k: K, v: SiteAddress[K]) => setSiteAddr((p) => ({ ...p, [k]: v }));
  const [isPublished, setIsPublished] = useState(false);
  const [progress, setProgress] = useState(0);
  const [projectValue, setProjectValue] = useState("");
  const [fiscal, setFiscal] = useState("");
  const [compliance, setCompliance] = useState("");
  const [disciplinesInput, setDisciplinesInput] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImagePick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast("Please pick an image file.", "error"); return; }
    if (f.size > 8 * 1024 * 1024) { toast("Image must be under 8 MB.", "error"); return; }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const clearImage = () => { setImageFile(null); setImagePreview(""); };

  // Joint Venture — mirrors the JV block in the project-identity editor. Partner assets
  // (logo, stamps, signatures) can only upload once the project exists, so we stash the
  // files here and upload them right after createProject returns a projectId.
  type JVImage = { name: string; url: string };
  type JVCreate = {
    enabled: boolean; partnerName: string; partnerAddress: string;
    contactName: string; email: string; phone: string; lead: string; notes: string;
  };
  const [jv, setJv] = useState<JVCreate>({
    enabled: false, partnerName: "", partnerAddress: "",
    contactName: "", email: "", phone: "", lead: "", notes: "",
  });
  const updateJv = <K extends keyof JVCreate>(field: K, value: JVCreate[K]) =>
    setJv((prev) => ({ ...prev, [field]: value }));
  const [jvLogoFile, setJvLogoFile] = useState<File | null>(null);
  const [jvLogoPreview, setJvLogoPreview] = useState("");
  const [jvStamps, setJvStamps] = useState<{ file: File; preview: string }[]>([]);
  const [jvSignatures, setJvSignatures] = useState<{ file: File; preview: string }[]>([]);

  const pickJvLogo = (f: File) => {
    if (!f.type.startsWith("image/")) { toast("Please pick an image file.", "error"); return; }
    if (f.size > 8 * 1024 * 1024) { toast("Logo must be under 8 MB.", "error"); return; }
    setJvLogoFile(f);
    setJvLogoPreview(URL.createObjectURL(f));
  };
  const clearJvLogo = () => { setJvLogoFile(null); setJvLogoPreview(""); };
  const addJvImage = (f: File, kind: "stamps" | "signatures") => {
    if (!f.type.startsWith("image/")) { toast("Please pick an image file.", "error"); return; }
    if (f.size > 8 * 1024 * 1024) { toast("Image must be under 8 MB.", "error"); return; }
    const item = { file: f, preview: URL.createObjectURL(f) };
    (kind === "stamps" ? setJvStamps : setJvSignatures)((p) => [...p, item]);
  };
  const removeJvImage = (kind: "stamps" | "signatures", i: number) =>
    (kind === "stamps" ? setJvStamps : setJvSignatures)((p) => p.filter((_, j) => j !== i));

  // Project Nature
  const [selectedNature, setSelectedNature] = useState<string[]>([]);
  const [customNatureInput, setCustomNatureInput] = useState("");
  const [customNatureTypes, setCustomNatureTypes] = useState<string[]>([]);

  // Client Info
  const [clientName, setClientName] = useState("");
  const [clientRef, setClientRef] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientCountry, setClientCountry] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientNotes, setClientNotes] = useState("");

  // Timeline (inside PM tab)
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [phases, setPhases] = useState<Phase[]>([
    { name: "Design & Planning", start: "", end: "" },
    { name: "Procurement", start: "", end: "" },
  ]);

  // Employees
  const [assignedEmployees, setAssignedEmployees] = useState<string[]>([]);
  const [empSearch, setEmpSearch] = useState("");

  // Financial tables
  const [expenseRows, setExpenseRows] = useState<string[][]>([]);
  const [poRows, setPoRows] = useState<string[][]>([]);
  const [invoiceSentRows, setInvoiceSentRows] = useState<string[][]>([]);
  const [invoiceRecRows, setInvoiceRecRows] = useState<string[][]>([]);

  const allTabs = [...TABS, ...customTabs];

  const durationMonths =
    startDate && endDate
      ? Math.max(0, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24 * 30)))
      : null;

  const toggleNature = (type: string) =>
    setSelectedNature((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]);

  const addCustomNature = () => {
    if (!customNatureInput.trim()) return;
    setCustomNatureTypes((p) => [...p, customNatureInput.trim()]);
    setCustomNatureInput("");
  };

  const addPhase = () => setPhases((p) => [...p, { name: "", start: "", end: "" }]);
  const removePhase = (i: number) => setPhases((p) => p.filter((_, idx) => idx !== i));
  const updatePhase = (i: number, field: keyof Phase, val: string) =>
    setPhases((p) => p.map((ph, idx) => (idx === i ? { ...ph, [field]: val } : ph)));

  const toggleEmployee = (empId: string) =>
    setAssignedEmployees((prev) => prev.includes(empId) ? prev.filter((e) => e !== empId) : [...prev, empId]);

  const handleAddTab = () => {
    if (!newTabName.trim()) return;
    const tabId = `custom-${Date.now()}`;
    setCustomTabs((prev) => [...prev, { id: tabId, label: newTabName.trim(), icon: Plus }]);
    setNewTabName("");
    setShowAddTab(false);
    setActiveTab(tabId);
  };

  const handleRemoveCustomTab = (tabId: string) => {
    setCustomTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTab === tabId) setActiveTab("nature");
  };

  const filteredEmployees = EMPLOYEE_POOL.filter(
    (e) => empSearch === "" || e.name.toLowerCase().includes(empSearch.toLowerCase()) || e.id.toLowerCase().includes(empSearch.toLowerCase())
  );

  const [creating, setCreating] = useState(false);
  // asDraft — the "Save as draft" action files the project under Drafts regardless of the
  // status picked in the form, so half-finished projects never look live.
  const handleCreate = async (asDraft = false) => {
    setCreating(true);
    try {
      const project = await createProject({
        name: title,
        category,
        contractNo,
        contractYear,
        status: (asDraft ? "Draft" : status) as ApiProject["status"],
        location: shortLocation(siteAddr),
        siteAddress: siteAddr,
        description: desc,
        published: isPublished,
        progress: Number(progress) || 0,
        startDate,
        endDate,
        value: projectValue,
        fiscal,
        compliance,
        disciplines: disciplinesInput.split(",").map((d) => d.trim()).filter(Boolean),
        projectNature: { selected: selectedNature, custom: customNatureTypes },
        clientInfo: {
          name: clientName, reference: clientRef, contactName: clientContact,
          email: clientEmail, phone: clientPhone, country: clientCountry,
          address: clientAddress, notes: clientNotes,
        },
        timeline: { phases },
        assignedEmployees,
      });

      // Upload image after creation (needs the new projectId)
      if (imageFile) {
        try {
          await uploadProjectImage(project.id, imageFile);
        } catch (err) {
          toast(err instanceof Error ? err.message : "Image upload failed.", "error");
        }
      }

      // Uploading the signed contract needs the new projectId too.
      if (contractFile) {
        try { await uploadProjectContract(project.id, contractFile); }
        catch (err) { toast(err instanceof Error ? err.message : "Contract upload failed.", "error"); }
      }

      // Joint Venture — partner assets can only upload once the project exists, so upload
      // them now and save the JV record. Skipped entirely for GreenTech-only projects.
      if (jv.enabled) {
        try {
          let logo = "";
          if (jvLogoFile) { const { url } = await uploadProposalAsset(project.id, jvLogoFile); logo = url; }
          const stamps: JVImage[] = [];
          for (const s of jvStamps) {
            const { url } = await uploadProposalAsset(project.id, s.file);
            stamps.push({ name: s.file.name.replace(/\.[^.]+$/, ""), url });
          }
          const signatures: JVImage[] = [];
          for (const s of jvSignatures) {
            const { url } = await uploadProposalAsset(project.id, s.file);
            signatures.push({ name: s.file.name.replace(/\.[^.]+$/, ""), url });
          }
          await updateProject(project.id, { jointVenture: { ...jv, logo, stamps, signatures } });
        } catch (err) {
          toast(err instanceof Error ? err.message : "Project created, but saving the Joint Venture details failed.", "error");
        }
      }

      toast(asDraft ? `Saved as a draft — project ${project.id}.` : `Project ${project.id} created.`, "success");
      navigate(asDraft ? "/dashboard/drafts" : `/dashboard/projects/${project.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create project.", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 mb-1">Register New Project</h1>
          <p className="text-sm text-slate-400 font-medium">Fill in the sections below — all fields are optional except the project title.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="px-5 py-3 rounded-2xl border border-slate-200 text-slate-500 font-bold text-sm hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => handleCreate(true)}
            disabled={!title.trim() || creating}
            title="File this under Drafts — you can finish it later"
            className="px-5 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save as draft
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!title.trim()}
            className="bg-gt-gradient text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            Create Project <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ── Identity Card ── */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 space-y-6">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Project Identity</h2>

        {/* Image picker */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project Image</label>
          <div className="flex items-center gap-4">
            <div className="w-32 h-24 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 flex-shrink-0">
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300 text-[10px] font-bold uppercase tracking-widest">No image</div>
              )}
            </div>
            <div className="flex-grow space-y-2">
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary cursor-pointer transition-colors"
                >
                  {imagePreview ? "Replace image" : "Upload image"}
                </button>
                {imagePreview && (
                  <button type="button" onClick={clearImage} className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50">
                    Remove
                  </button>
                )}
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
              </div>
              <p className="text-[10px] text-slate-400">Shown on the public Projects page card. PNG/JPG up to 8 MB.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project Name *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Ghana Municipal WTP Upgrade"
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Name</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. USAID Ghana"
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
            <p className="text-[10px] text-slate-400">Also fills the Client Information tab.</p>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white outline-none appearance-none"
            >
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{statusMeta(s).label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contract Number</label>
            <input
              type="text"
              value={contractNo}
              onChange={(e) => setContractNo(e.target.value)}
              placeholder="e.g. 72067421C00012"
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
            <p className="text-[10px] text-slate-400">The client's contract number. Your internal project number (e.g. {new Date().getFullYear()}-01) is assigned automatically.</p>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Year Started</label>
            <input
              type="number"
              value={contractYear}
              onChange={(e) => setContractYear(e.target.value)}
              placeholder={String(new Date().getFullYear())}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
            <p className="text-[10px] text-slate-400">Also sets the year in the internal project number.</p>
          </div>
          {/* The signed contract document — uploaded as soon as the project is created. */}
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contract Document</label>
            <div className="flex items-center gap-3 flex-wrap">
              {contractFile
                ? <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-xs font-bold text-slate-700 max-w-[20rem] truncate">{contractFile.name}</span>
                : <span className="text-[11px] text-slate-400 italic">No contract selected.</span>}
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary cursor-pointer transition-colors">
                {contractFile ? "Replace" : "Choose contract"}
                <input type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setContractFile(f); e.target.value = ""; }} />
              </label>
              {contractFile && <button type="button" onClick={() => setContractFile(null)} className="text-[11px] font-bold text-red-500 hover:underline">Remove</button>}
            </div>
            <p className="text-[10px] text-slate-400">Saved on the project identity and previewable from the project.</p>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category (Service)</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white outline-none appearance-none"
            >
              <option value="">Select a service…</option>
              {category && !SERVICE_CATEGORIES.includes(category) && (
                <option value={category}>{category} (current)</option>
              )}
              {SERVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          {/* Project site address — structured so RFQ/PO delivery and the project header can reuse it. */}
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Country</label>
            <select
              value={siteAddr.country}
              onChange={(e) => setAddr("country", e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white outline-none appearance-none"
            >
              <option value="">Select a country…</option>
              {siteAddr.country && !COUNTRIES.some((c) => c.name === siteAddr.country) && (
                <option value={siteAddr.country}>{siteAddr.country} (current)</option>
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
              value={siteAddr.state}
              onChange={(e) => setAddr("state", e.target.value)}
              placeholder="e.g. Greater Accra"
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">City</label>
            <input
              type="text"
              value={siteAddr.city}
              onChange={(e) => setAddr("city", e.target.value)}
              placeholder="e.g. Accra"
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Exact Address</label>
            <input
              type="text"
              value={siteAddr.line1}
              onChange={(e) => setAddr("line1", e.target.value)}
              placeholder="Street address"
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Postal / ZIP Code</label>
            <input
              type="text"
              value={siteAddr.postalCode}
              onChange={(e) => setAddr("postalCode", e.target.value)}
              placeholder="e.g. 00233"
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progress (%)</label>
            <input
              type="number"
              min={0} max={100}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project Value / Worth</label>
            <input
              type="text"
              inputMode="decimal"
              value={projectValue}
              onChange={(e) => setProjectValue(sanitizeMoney(e.target.value))}
              placeholder="e.g. $2,500,000"
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
            <p className="text-[10px] text-slate-400">Enter the full dollar amount (numbers only) — used for the All Projects total value.</p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fiscal / Funding</label>
            <input
              type="text"
              value={fiscal}
              onChange={(e) => setFiscal(e.target.value)}
              placeholder="e.g. USAID Regional Grant"
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Compliance</label>
            <input
              type="text"
              value={compliance}
              onChange={(e) => setCompliance(e.target.value)}
              placeholder="e.g. Passed Internal Audit"
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Disciplines (comma separated)</label>
            <input
              type="text"
              value={disciplinesInput}
              onChange={(e) => setDisciplinesInput(e.target.value)}
              placeholder="e.g. Civil Engineering, Hydrology, SCADA"
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</label>
            <textarea
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Brief project description..."
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all resize-none"
            />
          </div>
          <div className="md:col-span-2 flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-2xl">
            <div className="flex items-center gap-3">
              <Globe size={18} className={isPublished ? "text-indigo-500" : "text-slate-300"} />
              <div>
                <p className="text-sm font-bold text-slate-700">Preview on website</p>
                <p className="text-[11px] text-slate-400 font-medium">Make this project visible on the public-facing site</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPublished((v) => !v)}
              className={`relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none flex-shrink-0 ${isPublished ? "bg-indigo-500" : "bg-slate-200"}`}
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md ${isPublished ? "left-6" : "left-0.5"}`}
              />
            </button>
          </div>
        </div>

        {/* ── Joint Venture ── */}
        <div className="border-t border-slate-100 pt-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-display font-bold text-slate-900">Joint Venture</h3>
              <p className="text-xs text-slate-400 mt-1">Is this a GreenTech project, or a joint venture with a partner company?</p>
            </div>
            <label className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer ${jv.enabled ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600"}`}>
              <input type="checkbox" checked={jv.enabled} onChange={(e) => updateJv("enabled", e.target.checked)} />
              {jv.enabled ? "Joint Venture" : "GreenTech only"}
            </label>
          </div>
          {jv.enabled && (
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
                    <input
                      value={jv[f.field]}
                      onChange={(e) => updateJv(f.field, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                    />
                  </div>
                ))}
                {/* Partner logo */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Partner Logo</label>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                      {jvLogoPreview ? <img src={jvLogoPreview} alt="Partner logo" className="w-full h-full object-contain" /> : <FileImage size={20} className="text-slate-300" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary cursor-pointer transition-colors">
                        <Upload size={13} /> {jvLogoPreview ? "Replace" : "Upload logo"}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickJvLogo(f); e.target.value = ""; }} />
                      </label>
                      {jvLogoPreview && <button type="button" onClick={clearJvLogo} className="text-[11px] font-bold text-red-500 hover:underline">Remove</button>}
                    </div>
                  </div>
                </div>
                {/* Who is leading the project */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project Lead</label>
                  <select
                    value={jv.lead}
                    onChange={(e) => updateJv("lead", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all appearance-none"
                  >
                    <option value="">— Who is leading? —</option>
                    <option value="GreenTech USA">GreenTech USA</option>
                    {jv.partnerName.trim() && <option value={jv.partnerName.trim()}>{jv.partnerName.trim()}</option>}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Partner Address</label>
                <textarea
                  rows={2}
                  value={jv.partnerAddress}
                  onChange={(e) => updateJv("partnerAddress", e.target.value)}
                  placeholder="Full address…"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all resize-none"
                />
              </div>
              {/* Partner stamps & signatures */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(["stamps", "signatures"] as const).map((kind) => {
                  const list = kind === "stamps" ? jvStamps : jvSignatures;
                  return (
                    <div key={kind} className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {kind === "stamps" ? "Partner Stamps" : "Partner Signatures"} <span className="normal-case font-medium">— used on the PO document</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        {list.map((img, i) => (
                          <div key={i} className="relative group border border-slate-100 rounded-xl p-2 bg-slate-50">
                            <img src={img.preview} alt={kind} className="h-14 object-contain" />
                            <button
                              type="button"
                              title="Remove"
                              onClick={() => removeJvImage(kind, i)}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                            >×</button>
                          </div>
                        ))}
                        {list.length === 0 && <span className="text-[11px] text-slate-400 italic">None yet.</span>}
                        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 text-slate-600 text-xs font-bold hover:border-primary hover:text-primary cursor-pointer">
                          <Upload size={13} /> Upload
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addJvImage(f, kind); e.target.value = ""; }} />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 italic">Add the partner and grant them a full-access login later from the <strong>Partners</strong> tab under Subcontractors &amp; Employees.</p>
            </>
          )}
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="sticky top-0 z-10 bg-slate-50 pb-2 -mx-6 px-6 lg:-mx-10 lg:px-10 pt-1">
      <div className="bg-white border border-slate-100 rounded-[1.5rem] shadow-sm overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 p-1.5 min-w-max">
          {allTabs.map((tab) => (
            <div key={tab.id} className="relative group flex-shrink-0">
              <button
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all whitespace-nowrap ${
                  activeTab === tab.id ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <tab.icon size={14} /> {tab.label}
              </button>
              {customTabs.find((ct) => ct.id === tab.id) && (
                <button
                  onClick={() => handleRemoveCustomTab(tab.id)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full items-center justify-center hidden group-hover:flex"
                >
                  <X size={9} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setShowAddTab(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-widest text-slate-400 hover:text-primary hover:bg-primary/5 transition-all whitespace-nowrap flex-shrink-0 border-2 border-dashed border-slate-200 hover:border-primary ml-1"
          >
            <Plus size={13} /> Add Tab
          </button>
        </div>
      </div>
      </div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="min-h-[400px]"
        >

          {/* PROJECT NATURE */}
          {activeTab === "nature" && (
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-10">
              <div>
                <h3 className="text-xl font-display font-bold text-slate-900 mb-2">Project Nature</h3>
                <p className="text-slate-400 text-sm font-medium">Select one or more types that describe this project's scope.</p>
              </div>
              <div className="flex flex-wrap gap-4">
                {[...PROJECT_NATURE_TYPES, ...customNatureTypes].map((type) => (
                  <button
                    key={type}
                    onClick={() => toggleNature(type)}
                    className={`flex items-center gap-3 px-6 py-4 rounded-2xl font-bold text-sm transition-all border-2 ${
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
                  <button onClick={addCustomNature} className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-primary transition-all active:scale-95">Add</button>
                </div>
              </div>
            </div>
          )}

          {/* CLIENT INFO */}
          {activeTab === "client" && (
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
              <h3 className="text-xl font-display font-bold text-slate-900">Client Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputField label="Client / Organization Name" placeholder="e.g. USAID Ghana" value={clientName} onChange={setClientName} />
                <InputField label="Client Reference Number" placeholder="e.g. USAID-GH-2026-012" value={clientRef} onChange={setClientRef} />
                <InputField label="Primary Contact Name" placeholder="Full name" value={clientContact} onChange={setClientContact} />
                <InputField label="Contact Email" placeholder="contact@client.org" type="email" value={clientEmail} onChange={setClientEmail} />
                <InputField label="Contact Phone" placeholder="+1 (555) 000-0000" type="tel" value={clientPhone} onChange={setClientPhone} />
                <InputField label="Country / Region" placeholder="e.g. Accra, Ghana" value={clientCountry} onChange={setClientCountry} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Address</label>
                <textarea rows={3} value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Full mailing address..." className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all resize-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notes</label>
                <textarea rows={3} value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} placeholder="Any relevant notes about the client relationship..." className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all resize-none" />
              </div>
            </div>
          )}

          {/* PROJECT INFO */}
          {activeTab === "project-info" && (
            <div className="space-y-6">
              {[
                { title: "RFP (Request for Proposal)", docs: [] },
                { title: "Specifications", docs: [] },
                { title: "Bidding Documents", docs: [] },
                { title: "Change Orders", docs: [] },
                { title: "Other Project Docs", docs: [] },
              ].map((section) => (
                <div key={section.title} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <SectionHeader title={section.title} />
                  <div className="space-y-3">
                    {section.docs.map((d: { name: string; type: string; size: string; date: string }) => <DocRow key={d.name} name={d.name} type={d.type} size={d.size} date={d.date} />)}
                    <UploadZone label={`Upload ${section.title}`} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PROPOSALS */}
          {activeTab === "proposals" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[
                { title: "Technical Proposal", status: "Draft", statusColor: "bg-amber-50 text-amber-600" },
                { title: "Financial Proposal", status: "Draft", statusColor: "bg-amber-50 text-amber-600" },
              ].map((p) => (
                <div key={p.title} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-display font-bold text-slate-900 text-lg">{p.title}</h4>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${p.statusColor}`}>{p.status}</span>
                  </div>
                  <UploadZone label={`Upload ${p.title}`} />
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-50">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Submission Date</label>
                      <input type="date" className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary/10" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
                      <select className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm outline-none appearance-none">
                        <option>Draft</option><option>Ready</option><option>Submitted</option><option>Awarded</option><option>Rejected</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PROJECT MANAGEMENT */}
          {activeTab === "pm" && (
            <div className="space-y-6">
              {/* Timeline */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                <h3 className="text-xl font-display font-bold text-slate-900">Project Timeline</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Start Date</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target Completion</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all" />
                  </div>
                </div>
                {durationMonths !== null && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-5 bg-primary/5 border border-primary/20 rounded-2xl flex items-center gap-4">
                    <Calendar size={20} className="text-primary flex-shrink-0" />
                    <p className="text-sm font-bold text-slate-700">Estimated duration: <span className="text-primary">{durationMonths} months</span></p>
                  </motion.div>
                )}
                <div className="border-t border-slate-50 pt-6">
                  <div className="flex items-center justify-between mb-5">
                    <h4 className="text-sm font-bold text-slate-700">Project Phases</h4>
                    <button type="button" onClick={addPhase} className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"><Plus size={13} /> Add Phase</button>
                  </div>
                  <div className="space-y-3">
                    {phases.map((phase, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-12 gap-3 items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="col-span-12 md:col-span-5">
                          <input type="text" value={phase.name} onChange={(e) => updatePhase(i, "name", e.target.value)} placeholder="Phase name" className="w-full bg-white border border-slate-100 rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-primary/10 outline-none" />
                        </div>
                        <div className="col-span-5 md:col-span-3">
                          <input type="date" value={phase.start} onChange={(e) => updatePhase(i, "start", e.target.value)} className="w-full bg-white border border-slate-100 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary/10" />
                        </div>
                        <div className="col-span-5 md:col-span-3">
                          <input type="date" value={phase.end} onChange={(e) => updatePhase(i, "end", e.target.value)} className="w-full bg-white border border-slate-100 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary/10" />
                        </div>
                        <div className="col-span-2 md:col-span-1 flex justify-end">
                          <button type="button" onClick={() => removePhase(i)} disabled={phases.length <= 1} className="p-2 rounded-xl hover:bg-red-50 hover:text-red-500 text-slate-300 transition-all disabled:opacity-0"><X size={15} /></button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>

              {/* PM Docs */}
              {[
                { title: "Schedules", label: "Upload Schedules" },
                { title: "Meeting Minutes", label: "Upload Meeting Minutes" },
                { title: "Progress Reports", label: "Upload Progress Reports" },
                { title: "Site Data", label: "Upload Site Data" },
                { title: "Closeout Documents", label: "Upload Closeout Documents" },
              ].map((section) => (
                <div key={section.title} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <SectionHeader title={section.title} />
                  <UploadZone label={section.label} />
                </div>
              ))}
            </div>
          )}

          {/* TECHNICAL DOCS */}
          {activeTab === "tech-docs" && (
            <div className="space-y-6">
              {[
                { title: "Drawings" },
                { title: "Technical Reports" },
                { title: "Lab Test Results" },
                { title: "Bill of Quantities (BOQ)" },
              ].map((section) => (
                <div key={section.title} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <SectionHeader title={section.title} />
                  <UploadZone label={`Upload ${section.title}`} />
                </div>
              ))}
            </div>
          )}

          {/* SUBCONTRACTORS & EMPLOYEES */}
          {activeTab === "subs" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Employee Assignment */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-display font-bold text-slate-900 mb-1">Assign Employees</h3>
                  <p className="text-xs font-medium text-slate-400">Toggle employees to assign or remove them from this project.</p>
                </div>
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
                    const assigned = assignedEmployees.includes(emp.id);
                    return (
                      <div
                        key={emp.id}
                        onClick={() => toggleEmployee(emp.id)}
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
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{emp.id}</p>
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
                  {assignedEmployees.length} of {EMPLOYEE_POOL.length} employees assigned
                </div>
              </div>

              {/* Subcontractors */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-display font-bold text-slate-900 mb-1">Subcontractors</h3>
                    <p className="text-xs font-medium text-slate-400">Track subcontracted firms and their scope.</p>
                  </div>
                  <button className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"><Plus size={13} /> Add</button>
                </div>
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-5 flex items-center gap-4 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group">
                  <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center group-hover:bg-primary/10 transition-all">
                    <Plus size={16} className="text-slate-400 group-hover:text-primary transition-colors" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-600 group-hover:text-primary transition-colors">Add Subcontractor</p>
                    <p className="text-[10px] text-slate-400">Company, contact, scope of work</p>
                  </div>
                </div>
                <div className="border-t border-slate-50 pt-6">
                  <SectionHeader title="Subcontractor Agreements" />
                  <UploadZone label="Upload subcontractor contracts / agreements" />
                </div>
              </div>
            </div>
          )}

          {/* LEGAL DOCS */}
          {activeTab === "legal" && (
            <div className="space-y-6">
              {[
                "Local Office Registration",
                "ILOC (Irrevocable Letter of Credit)",
                "Bond Documents",
                "Insurance Certificates",
                "Tax Documents",
              ].map((title) => (
                <div key={title} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <SectionHeader title={title} />
                  <UploadZone label={`Upload ${title}`} />
                </div>
              ))}
            </div>
          )}

          {/* EXPENSES */}
          {activeTab === "expenses" && (
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-display font-bold text-slate-900">Expense Log</h3>
                <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary transition-all">
                  <Plus size={13} /> Add Expense
                </button>
              </div>
              <TableSection
                headers={["Description", "Date", "Amount", "Category"]}
                rows={expenseRows}
                onAdd={() => setExpenseRows((p) => [...p, ["New Expense", "", "$0.00", "General"]])}
                addLabel="Add expense row"
              />
            </div>
          )}

          {/* PURCHASE ORDERS */}
          {activeTab === "po" && (
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-display font-bold text-slate-900">Purchase Orders</h3>
                  <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary transition-all">
                    <Plus size={13} /> New PO
                  </button>
                </div>
                <TableSection
                  headers={["PO Number", "Vendor", "Amount", "Date", "Status"]}
                  rows={poRows}
                  onAdd={() => setPoRows((p) => [...p, ["PO-NEW", "", "$0.00", "", "Draft"]])}
                  addLabel="Add purchase order"
                />
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <SectionHeader title="PO Documents" />
                <UploadZone label="Upload signed PO documents" />
              </div>
            </div>
          )}

          {/* INVOICE SENT */}
          {activeTab === "invoice-sent" && (
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-display font-bold text-slate-900">Invoices Sent</h3>
                  <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary transition-all">
                    <Plus size={13} /> New Invoice
                  </button>
                </div>
                <TableSection
                  headers={["Invoice #", "Client", "Amount", "Date Sent", "Status"]}
                  rows={invoiceSentRows}
                  onAdd={() => setInvoiceSentRows((p) => [...p, ["INV-NEW", "", "$0.00", "", "Draft"]])}
                  addLabel="Add invoice"
                />
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <SectionHeader title="Invoice Documents" />
                <UploadZone label="Upload invoice PDFs" />
              </div>
            </div>
          )}

          {/* INVOICE RECEIVED */}
          {activeTab === "invoice-received" && (
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-display font-bold text-slate-900">Bills Received</h3>
                  <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary transition-all">
                    <Plus size={13} /> Log Bill
                  </button>
                </div>
                <TableSection
                  headers={["Bill #", "Vendor", "Amount", "Date Received", "Status"]}
                  rows={invoiceRecRows}
                  onAdd={() => setInvoiceRecRows((p) => [...p, ["BILL-NEW", "", "$0.00", "", "Unpaid"]])}
                  addLabel="Add bill"
                />
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <SectionHeader title="Bill Documents" />
                <UploadZone label="Upload received invoices / bills" />
              </div>
            </div>
          )}

          {/* PROCUREMENT & SUBMITTALS */}
          {activeTab === "procurement" && (
            <div className="space-y-6">
              {[
                "Catalogues",
                "Shipping & Logistics",
                "Bill of Quantities (BOQ)",
                "Vendor List",
                "Submittal Register",
              ].map((sectionTitle) => (
                <div key={sectionTitle} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <SectionHeader title={sectionTitle} />
                  <UploadZone label={`Upload ${sectionTitle}`} />
                </div>
              ))}
            </div>
          )}

          {/* CUSTOM TABS */}
          {customTabs.find((ct) => ct.id === activeTab) && (
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-display font-bold text-slate-900">
                  {customTabs.find((ct) => ct.id === activeTab)?.label}
                </h3>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full uppercase tracking-widest">Custom Tab</span>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notes</label>
                <textarea rows={5} placeholder="Add notes or content for this section..." className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all resize-none" />
              </div>
              <UploadZone label="Upload files for this section" />
            </div>
          )}

        </motion.div>
      </AnimatePresence>

      {/* ── Bottom Create Button ── */}
      <div className="flex justify-end pt-4 border-t border-slate-100">
        <button
          onClick={() => setShowConfirm(true)}
          disabled={!title.trim()}
          className="bg-gt-gradient text-white px-10 py-4 rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          Create Project &amp; Open Workspace <ChevronRight size={18} />
        </button>
      </div>

      {/* ── Add Tab Modal ── */}
      <AnimatePresence>
        {showAddTab && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddTab(false)} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-display font-bold text-slate-900">Add Custom Tab</h3>
                <button onClick={() => setShowAddTab(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"><X size={18} /></button>
              </div>
              <div className="space-y-2 mb-8">
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
              <div className="flex gap-3">
                <button onClick={() => setShowAddTab(false)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50 transition-all">Cancel</button>
                <button onClick={handleAddTab} disabled={!newTabName.trim()} className="flex-1 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-40">Create Tab</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Confirm Create Modal ── */}
      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowConfirm(false)} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white rounded-[2.5rem] p-10 w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-display font-bold text-slate-900">Create Project?</h3>
                <button onClick={() => setShowConfirm(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"><X size={18} /></button>
              </div>
              <div className="bg-slate-50 rounded-[2rem] p-6 divide-y divide-slate-100 mb-8">
                {[
                  { label: "Title", value: title },
                  { label: "Category", value: category },
                  { label: "Status", value: status },
                  { label: "Location", value: shortLocation(siteAddr) || "—" },
                  { label: "Project Value", value: projectValue || "—" },
                  { label: "Nature", value: selectedNature.length ? selectedNature.join(", ") : "Not selected" },
                  { label: "Client", value: clientName || "—" },
                  { label: "Joint Venture", value: jv.enabled ? (jv.partnerName ? `Yes — ${jv.partnerName}` : "Yes") : "No (GreenTech only)" },
                  { label: "Start Date", value: startDate || "—" },
                  { label: "Team", value: assignedEmployees.length ? `${assignedEmployees.length} assigned` : "None" },
                  { label: "Website Preview", value: isPublished ? "Enabled" : "Disabled" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{row.label}</span>
                    <span className="text-sm font-bold text-slate-900 text-right max-w-[60%] truncate">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowConfirm(false)} disabled={creating} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50 transition-all disabled:opacity-50">Cancel</button>
                <button onClick={() => handleCreate(false)} disabled={creating} className="flex-1 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:hover:scale-100">
                  {creating ? "Creating…" : <><AlertCircle size={16} className="opacity-70" /> Confirm & Create</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Cancel — discards everything typed so far */}
        {showCancelConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCancelConfirm(false)} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl">
              <h3 className="text-xl font-display font-bold text-slate-900 mb-2">Discard this project?</h3>
              <p className="text-sm text-slate-500 mb-6">Nothing has been saved yet. Everything you've filled in will be lost — use <strong>Save as draft</strong> if you want to finish it later.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowCancelConfirm(false)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50 transition-all">Keep editing</button>
                <button onClick={() => navigate("/dashboard/my-projects")} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-all">Discard</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
