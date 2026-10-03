import { useEffect, useMemo, useState } from "react";
import { Building2, ArrowLeft, Mail, Phone, Globe, MapPin, Pencil, Archive, RotateCcw, Trash2, Link2, Receipt, FileText, Truck, Award, BookOpen, Download, Eye, Upload, Loader2, Check, X, Landmark, Briefcase, ClipboardList, Quote as QuoteIcon, PackageCheck, Boxes, FilePen, Banknote } from "lucide-react";
import {
  fetchCompanyLinks, fetchCompanyProfileFiles, uploadCompanyProfileFile, deleteCompanyProfileFile,
  fetchCompanyTasks, companyFileUrl, withFileToken,
  COMPANY_CATEGORIES, companyCategories, type ApiCompany, type CompanyCategory, type CompanyLinks, type CompanyFile, type ProfileTask,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import { StatTile, ActivityRow, ProfileSection, jumpToSection } from "./profileBits";
import { logoAsPng } from "../../lib/logoImage";
import PdfPreviewModal from "./PdfPreviewModal";
import { fileName } from "../../lib/fileNames";
import TaskMiniBoard from "./TaskMiniBoard";
import CompanyAccessManager from "./CompanyAccessManager";

type ProfileTab = "activity" | "tasks" | "details" | "documents" | "access";

const catLabel = (c: CompanyCategory) => COMPANY_CATEGORIES.find((x) => x.v === c)?.label || c;
const CAT_CLS: Record<string, string> = {
  vendor: "bg-emerald-50 text-emerald-600", subcontractor: "bg-blue-50 text-blue-600", client: "bg-indigo-50 text-indigo-600",
  manufacturer: "bg-amber-50 text-amber-600", consultant: "bg-purple-50 text-purple-600", partner: "bg-teal-50 text-teal-600",
  supplier: "bg-orange-50 text-orange-600", other: "bg-slate-100 text-slate-500",
};

// CR-P-43 — a full, read-only company profile: identity + everything this company is involved
// with across the platform (projects, agreements, RFQs, quotes, POs, invoices, shipments,
// submittals) plus its documents. Opened from the Directory card / title.
// CR 328 - how a work package's status and a change order's amount read on the profile.
const WP_STATUS: Record<string, string> = { not_started: "Not started", in_progress: "In progress", complete: "Complete", on_hold: "On hold", cancelled: "Cancelled" };
const asMoney = (v?: string) => { if (v === undefined || v === null || v === "") return "-"; const n = Number(String(v).replace(/[^0-9.\-]/g, "")); return /^[\s$\d,.\-]+$/.test(String(v)) && Number.isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0 }) : String(v); };
const coAmount = (v?: number) => (v === undefined || v === null ? "-" : `${v >= 0 ? "+" : "-"}${Math.abs(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0 })}`);

export default function CompanyProfile({
  company, onBack, onEdit, onArchive, onDelete, onCopyLink, onResolvePending, showArchived,
}: {
  company: ApiCompany;
  onBack: () => void;
  onEdit: (c: ApiCompany) => void;
  onArchive: (c: ApiCompany, next: boolean) => Promise<boolean> | void;
  onDelete: (c: ApiCompany) => Promise<boolean> | void;
  onCopyLink: (c: ApiCompany) => void;
  onResolvePending?: (c: ApiCompany, action: "approve" | "discard") => void;
  showArchived: boolean;
}) {
  const { confirm, dialogs } = useDialogs();
  const [tab, setTab] = useState<ProfileTab>("activity");
  const [highlight, setHighlight] = useState<string | null>(null);   // CR-P (11) — stat-tile jump
  // CR-P — subcontractors & partners can be given a scoped login + tab access (a "user role"),
  // so their profile gets an Access tab. CR-P (72) — "the same for users, subcontractors and
  // vendors": vendors (and suppliers / manufacturers, the vendor categories) get it too, now that a
  // vendor's login can be given project tabs. Clients and other categories still don't log in.
  const canHaveLogin = companyCategories(company).some((c) => ["subcontractor", "partner", "vendor", "supplier", "manufacturer"].includes(c));
  const [links, setLinks] = useState<CompanyLinks | null>(null);
  const [files, setFiles] = useState<CompanyFile[]>([]);
  const [tasks, setTasks] = useState<ProfileTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [docType, setDocType] = useState("catalogue");
  const [uploading, setUploading] = useState(false);
  // CR-P-43 — upload modal (choose type, then file, then upload).
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  useEffect(() => {
    setLinks(null); setFiles([]); setTasks([]); setTasksLoading(true);
    fetchCompanyLinks(company._id).then(setLinks).catch(() => setLinks({ invoices: [], rfqs: [], pos: [] }));
    fetchCompanyProfileFiles(company._id).then(setFiles).catch(() => setFiles([]));
    fetchCompanyTasks(company._id).then(setTasks).catch(() => setTasks([])).finally(() => setTasksLoading(false));
  }, [company._id]);

  const submitUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      await uploadCompanyProfileFile(company._id, uploadFile, docType);
      setFiles(await fetchCompanyProfileFiles(company._id));
      toast("Document uploaded.", "success");
      setUploadOpen(false); setUploadFile(null); setDocType("catalogue");
    } catch (e) { toast(e instanceof Error ? e.message : "Upload failed.", "error"); }
    finally { setUploading(false); }
  };
  const removeDoc = async (f: CompanyFile) => {
    if (!(await confirm({ title: "Delete document?", message: `Remove "${f.name}" from this company profile?`, confirmLabel: "Delete", cancelLabel: "Cancel", danger: true }))) return;
    try { await deleteCompanyProfileFile(company._id, f._id); setFiles((p) => p.filter((x) => x._id !== f._id)); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not delete.", "error"); }
  };
  const docIcon = (t?: string) => t === "catalogue" ? <BookOpen size={14} className="text-amber-500 shrink-0" /> : t === "certification" ? <Award size={14} className="text-emerald-500 shrink-0" /> : <FileText size={14} className="text-slate-400 shrink-0" />;

  // projectId → name for every project this company is linked to; a referenced id missing here
  // means that project was deleted (its rows are blurred and can't be opened).
  const projById: Record<string, string> = {};
  for (const p of links?.projects || []) if (p.projectId) projById[p.projectId] = p.name;

  // Clicking a stat tile jumps to its section (Documents is its own tab), with a brief highlight.
  // Tiles/rows/sections come from profileBits (CR-P 16).
  const goTo = (key: string) => {
    if (key === "documents") { setTab("documents"); return; }
    setTab("activity");
    setHighlight(key);
    jumpToSection("cp", key, setHighlight);
  };

  // Counts for the stat tiles.
  const counts = useMemo(() => ({
    projects: links?.projects?.length ?? 0,
    agreements: links?.agreements?.length ?? 0,
    rfqs: links?.rfqs.length ?? 0,
    quotes: links?.quotes?.length ?? 0,
    pos: links?.pos.length ?? 0,
    invoices: links?.invoices.length ?? 0,
    shipments: links?.shipments?.length ?? 0,
    submittals: links?.submittals?.length ?? 0,
    workPackages: links?.workPackages?.length ?? 0,
    changeOrders: links?.changeOrders?.length ?? 0,
    payments: links?.payments?.length ?? 0,
    documents: files.length,
  }), [links, files]);

  // CR 267 - the full report: the profile itself and everything in the platform that names it.
  const [reportOpen, setReportOpen] = useState(false);
  const pname = (id?: string) => (id ? projById[id] || id : "-");
  const buildReport = async () => {
    const { buildProfileReportPdf } = await import("../../lib/profileReportPdf");
    // CR 307 - the logo beside the name; the report still prints if it cannot be read.
    let logo: string | undefined;
    if (company.logoUrl) {
      try { logo = await logoAsPng(withFileToken(company.logoUrl)); } catch { logo = undefined; }
    }
    return buildProfileReportPdf({
      kind: "company",
      name: company.name,
      logo,
      subtitle: company.category || "",
      fields: [
        ["Category", company.category || ""],
        ["Email", company.email || ""],
        ["Phone", company.phone || ""],
        ["Website", company.website || ""],
        ["Address", company.address || ""],
        ["Contacts", (company.contactPersons || []).map((c) => [c.name, c.role, c.email, c.phone].filter(Boolean).join(" / ")).join(" | ")],
        ["Tax ID", company.tax?.taxId || ""],
        ["Registration no.", company.tax?.registrationNo || ""],
        ["Bank", [company.banking?.bankName, company.banking?.accountName, company.banking?.iban].filter(Boolean).join(" · ")],
        ["Notes", company.notes || ""],
      ],
      stats: [
        ["Projects", String(counts.projects)],
        ["Agreements", String(counts.agreements)],
        ["POs", String(counts.pos)],
        ["Invoices", String(counts.invoices)],
        ["Submittals", String(counts.submittals)],
        ["Documents", String(counts.documents)],
      ],
      sections: [
        {
          title: "Projects",
          columns: [{ label: "Project", w: 240, wrap: true }, { label: "No.", w: 110 }, { label: "Status", w: 118 }],
          rows: (links?.projects || []).map((p) => [p.name, p.projectId, p.status]),
        },
        {
          title: "Agreements",
          columns: [{ label: "Agreement", w: 250, wrap: true }, { label: "Project", w: 120, wrap: true }, { label: "Status", w: 98 }],
          rows: (links?.agreements || []).map((a) => [a.name, pname(a.projectId), a.status]),
        },
        {
          title: "RFQs",
          columns: [{ label: "RFQ", w: 90 }, { label: "Title", w: 180, wrap: true }, { label: "Project", w: 110, wrap: true }, { label: "Status", w: 88 }],
          rows: (links?.rfqs || []).map((r) => [r.rfqNo, r.title, pname(r.projectId), r.status]),
        },
        {
          title: "Quotes",
          columns: [{ label: "Quote for RFQ", w: 150 }, { label: "Total", w: 120, align: "right" }, { label: "Project", w: 110, wrap: true }, { label: "Status", w: 88 }],
          rows: (links?.quotes || []).map((q) => [q.rfqId, q.total, pname(q.projectId), q.accepted ? "Accepted" : q.status]),
        },
        {
          title: "Purchase orders",
          columns: [{ label: "PO", w: 100 }, { label: "Vendor", w: 170, wrap: true }, { label: "Total", w: 90, align: "right" }, { label: "Project", w: 108, wrap: true }],
          rows: (links?.pos || []).map((p) => [p.poNo, p.vendorName, p.total, pname(p.projectId)]),
        },
        {
          title: "Invoices",
          columns: [{ label: "Number", w: 96 }, { label: "Type", w: 84 }, { label: "Amount", w: 92, align: "right" }, { label: "Date", w: 88 }, { label: "Status", w: 108 }],
          rows: (links?.invoices || []).map((i) => [i.number, i.type, i.amount, i.date, i.status]),
        },
        {
          title: "Work packages",
          columns: [{ label: "Work package", w: 220, wrap: true }, { label: "Project", w: 120, wrap: true }, { label: "Status", w: 78 }, { label: "Progress", w: 50, align: "right" }],
          rows: (links?.workPackages || []).map((w) => [w.name, pname(w.projectId), WP_STATUS[w.status] || w.status, `${w.progress}%`]),
        },
        {
          title: "Change orders",
          columns: [{ label: "Change order", w: 70 }, { label: "Work package", w: 150, wrap: true }, { label: "Reason", w: 140, wrap: true }, { label: "Amount", w: 70, align: "right" }, { label: "Status", w: 38 }],
          rows: (links?.changeOrders || []).map((c) => [c.no, `${c.packageName} (${pname(c.projectId)})`, c.reason, coAmount(c.amount), c.status === "approved" ? "OK" : "Prop."]),
        },
        {
          title: "Payments",
          columns: [{ label: "Date", w: 80 }, { label: "Invoice", w: 110 }, { label: "Amount", w: 90, align: "right" }, { label: "Method", w: 100, wrap: true }, { label: "Project", w: 88, wrap: true }],
          rows: (links?.payments || []).map((p) => [p.date, `#${p.invoiceNo} (${p.type})`, asMoney(p.amount), [p.method, p.reference].filter(Boolean).join(" · "), pname(p.projectId)]),
        },
        {
          title: "Submittals",
          columns: [{ label: "Product", w: 200, wrap: true }, { label: "Manufacturer", w: 150, wrap: true }, { label: "Status", w: 118 }],
          rows: (links?.submittals || []).map((s) => [s.productName, s.manufacturer, s.status]),
        },
        {
          title: "Shipments",
          columns: [{ label: "Shipment", w: 150, wrap: true }, { label: "Agency", w: 150, wrap: true }, { label: "Arrival", w: 80 }, { label: "Status", w: 88 }],
          rows: (links?.shipments || []).map((s) => [s.name, s.agencyName, s.etaDate, s.status]),
        },
        {
          title: "Documents on file",
          columns: [{ label: "Document", w: 250, wrap: true }, { label: "Type", w: 110 }, { label: "Size", w: 108 }],
          rows: files.map((d) => [d.name, d.fileType || "", d.size || ""]),
        },
      ],
    });
  };

  const contactRow = (Icon: typeof Mail, value?: string, href?: string) => value ? (
    <p className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
      <Icon size={14} className="text-slate-300 shrink-0" />
      {href ? <a href={href} target="_blank" rel="noreferrer" className="hover:text-primary truncate">{value}</a> : <span className="truncate">{value}</span>}
    </p>
  ) : null;

  return (
    <div className="space-y-5">
      {/* Top bar: back + actions */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to directory</button>
        <div className="flex items-center gap-1.5">
          <button onClick={() => onCopyLink(company)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 text-xs font-bold hover:text-primary"><Link2 size={14} /> Copy link</button>
          {/* CR 267 - everything held for this profile, as one document. */}
          <button onClick={() => setReportOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 text-xs font-bold hover:text-primary"><FileText size={14} /> Report</button>
          <button onClick={() => onEdit(company)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 text-xs font-bold hover:text-primary"><Pencil size={14} /> Edit</button>
          <button onClick={() => onArchive(company, !showArchived)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 text-xs font-bold hover:text-amber-600">{showArchived ? <><RotateCcw size={14} /> Restore</> : <><Archive size={14} /> Archive</>}</button>
          <button onClick={() => onDelete(company)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 text-xs font-bold hover:text-red-500"><Trash2 size={14} /> Delete</button>
        </div>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-20 h-20 rounded-2xl border border-slate-100 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
            {company.logoUrl ? <img src={withFileToken(company.logoUrl)} alt={company.name} className="w-full h-full object-contain" /> : <Building2 size={30} className="text-slate-300" />}
          </div>
          <div className="min-w-0 flex-grow">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-display font-bold text-slate-900 truncate">{company.name}</h1>
              {companyCategories(company).map((cat) => <span key={cat} className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${CAT_CLS[cat]}`}>{catLabel(cat)}</span>)}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-3">
              {contactRow(Mail, company.email, company.email ? `mailto:${company.email}` : undefined)}
              {contactRow(Phone, company.phone, company.phone ? `tel:${company.phone}` : undefined)}
              {contactRow(Globe, company.website, company.website ? (company.website.startsWith("http") ? company.website : `https://${company.website}`) : undefined)}
              {contactRow(MapPin, company.address)}
            </div>
          </div>
        </div>

        {/* Pending self-submitted update (CR-P-06d) */}
        {company.pendingUpdate && onResolvePending && (
          <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-4">
            <span className="text-[11px] font-bold text-amber-700">
              This company submitted an update for review.
              {(company.pendingUpdate.submittedBy || company.pendingUpdate.submittedAt) && (
                <span className="block font-medium text-amber-600/80 mt-0.5">
                  {company.pendingUpdate.submittedBy ? `By ${company.pendingUpdate.submittedBy}` : ""}
                  {company.pendingUpdate.submittedBy && company.pendingUpdate.submittedAt ? " · " : ""}
                  {company.pendingUpdate.submittedAt ? new Date(company.pendingUpdate.submittedAt).toLocaleString() : ""}
                </span>
              )}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => onResolvePending(company, "approve")} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-600"><Check size={11} /> Approve</button>
              <button onClick={() => onResolvePending(company, "discard")} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-slate-500 text-[10px] font-bold hover:text-red-600"><X size={11} /> Discard</button>
            </div>
          </div>
        )}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <StatTile label="Projects" value={counts.projects} icon={Briefcase} cls="bg-indigo-50 text-indigo-600" onClick={() => goTo("projects")} />
        <StatTile label="Agreements" value={counts.agreements} icon={FileText} cls="bg-teal-50 text-teal-600" onClick={() => goTo("agreements")} />
        <StatTile label="RFQs" value={counts.rfqs} icon={ClipboardList} cls="bg-blue-50 text-blue-600" onClick={() => goTo("rfqs")} />
        <StatTile label="Quotes" value={counts.quotes} icon={QuoteIcon} cls="bg-purple-50 text-purple-600" onClick={() => goTo("quotes")} />
        <StatTile label="Purchase orders" value={counts.pos} icon={FileText} cls="bg-amber-50 text-amber-600" onClick={() => goTo("pos")} />
        <StatTile label="Invoices" value={counts.invoices} icon={Receipt} cls="bg-emerald-50 text-emerald-600" onClick={() => goTo("invoices")} />
        <StatTile label="Shipments" value={counts.shipments} icon={Truck} cls="bg-orange-50 text-orange-600" onClick={() => goTo("shipments")} />
        <StatTile label="Submittals" value={counts.submittals} icon={PackageCheck} cls="bg-rose-50 text-rose-600" onClick={() => goTo("submittals")} />
        {/* CR 328 - GT Comments 3, page 1: a company's change orders and payments appear on its profile, with its work packages. */}
        <StatTile label="Work packages" value={counts.workPackages} icon={Boxes} cls="bg-sky-50 text-sky-600" onClick={() => goTo("workPackages")} />
        <StatTile label="Change orders" value={counts.changeOrders} icon={FilePen} cls="bg-yellow-50 text-yellow-700" onClick={() => goTo("changeOrders")} />
        <StatTile label="Payments" value={counts.payments} icon={Banknote} cls="bg-lime-50 text-lime-700" onClick={() => goTo("payments")} />
        <StatTile label="Documents" value={counts.documents} icon={BookOpen} cls="bg-slate-100 text-slate-500" onClick={() => goTo("documents")} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-max">
        {([
          ["activity", "Activity"],
          ["tasks", `Tasks (${tasks.length})`],
          ["details", "Details"],
          ["documents", `Documents (${counts.documents})`],
          ...(canHaveLogin ? [["access", "Access"] as [ProfileTab, string]] : []),
        ] as Array<[ProfileTab, string]>).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === v ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}>{l}</button>
        ))}
      </div>

      {/* ── Activity ─────────────────────────────────────────────── */}
      {tab === "activity" && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          {!links ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 size={16} className="animate-spin" /> Loading activity…</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
              <ProfileSection prefix="cp" secKey="projects" title="Projects involved" count={counts.projects} icon={Building2} highlight={highlight}
                rows={(links.projects || []).map((p) => <ActivityRow key={p._id} primary={p.name} secondary={p.status} projectId={p.projectId} self projById={projById} />)}
                emptyHint="Not linked to any project yet." />
              <ProfileSection prefix="cp" secKey="agreements" title="Agreements" count={counts.agreements} icon={FileText} highlight={highlight}
                rows={(links.agreements || []).map((a) => <ActivityRow key={a._id} primary={a.name || "Agreement"} secondary={a.status || "—"} projectId={a.projectId} projById={projById} />)}
                emptyHint="No agreements with this company yet." />
              <ProfileSection prefix="cp" secKey="rfqs" title="RFQs" count={counts.rfqs} icon={ClipboardList} highlight={highlight}
                rows={links.rfqs.map((r) => <ActivityRow key={r._id} primary={`RFQ #${r.rfqNo}`} secondary={<>{r.title ? `${r.title} · ` : ""}{r.status}</>} projectId={r.projectId} query="tab=procurement&proc=rfqs" projById={projById} />)}
                emptyHint="No RFQs sent to this company yet." />
              <ProfileSection prefix="cp" secKey="quotes" title="Quotes" count={counts.quotes} icon={QuoteIcon} highlight={highlight}
                rows={(links.quotes || []).map((q) => <ActivityRow key={q._id} primary={<>Quote{q.accepted ? " ✓" : ""}</>} secondary={<>{q.total || "—"}{q.status ? ` · ${q.status}` : ""}</>} projectId={q.projectId} query="tab=procurement&proc=quotes" projById={projById} />)}
                emptyHint="No quotes received from this company yet." />
              <ProfileSection prefix="cp" secKey="pos" title="Purchase orders" count={counts.pos} icon={FileText} highlight={highlight}
                rows={links.pos.map((po) => <ActivityRow key={po._id} primary={`PO #${po.poNo}`} secondary={<>{po.total || "—"} · {po.status}</>} projectId={po.projectId} query="tab=procurement&proc=po" projById={projById} />)}
                emptyHint="No purchase orders for this company yet." />
              <ProfileSection prefix="cp" secKey="invoices" title="Invoices" count={counts.invoices} icon={Receipt} highlight={highlight}
                rows={links.invoices.map((iv) => <ActivityRow key={iv._id} primary={<>#{iv.number} <span className="text-slate-400 font-medium">· {iv.type}</span></>} secondary={<>{iv.amount} · {iv.status}</>} projectId={iv.projectId} query="tab=finances" projById={projById} />)}
                emptyHint="No invoices linked to this company yet." />
              <ProfileSection prefix="cp" secKey="shipments" title="Shipments" count={counts.shipments} icon={Truck} highlight={highlight}
                rows={(links.shipments || []).map((s) => <ActivityRow key={s._id} primary={s.name || "Shipment"} secondary={<>{s.status}{s.etaDate ? ` · ETA ${s.etaDate}` : ""}</>} projectId={s.projectId} query="tab=procurement&proc=shipment" projById={projById} />)}
                emptyHint="No shipments handled by this company yet." />
              <ProfileSection prefix="cp" secKey="submittals" title="Submittals" count={counts.submittals} icon={PackageCheck} highlight={highlight}
                rows={(links.submittals || []).map((s) => <ActivityRow key={s._id} primary={s.productName || "Submittal"} secondary={s.status || "—"} projectId={s.projectId} query="tab=procurement&proc=submittals" projById={projById} />)}
                emptyHint="No submittals for this company's products yet." />
              <ProfileSection prefix="cp" secKey="workPackages" title="Work packages" count={counts.workPackages} icon={Boxes} highlight={highlight}
                rows={(links.workPackages || []).map((w) => <ActivityRow key={w._id} primary={<>{w.name}{w.archived ? <span className="text-slate-400 font-medium"> · archived</span> : null}</>} secondary={<>{WP_STATUS[w.status] || w.status} · {w.progress}%</>} projectId={w.projectId} query={`tab=pm&pm=work-packages&hl=wp-${w._id}`} projById={projById} />)}
                emptyHint="No work packages given to this company yet." />
              <ProfileSection prefix="cp" secKey="changeOrders" title="Change orders" count={counts.changeOrders} icon={FilePen} highlight={highlight}
                rows={(links.changeOrders || []).map((c) => <ActivityRow key={c._id} primary={<>{c.no} <span className="text-slate-400 font-medium">· {c.packageName}</span></>} secondary={<>{coAmount(c.amount)} · {c.status === "approved" ? "Approved" : "Proposed"}{c.reason ? ` · ${c.reason}` : ""}</>} projectId={c.projectId} query={`tab=pm&pm=work-packages&hl=wp-${c.packageId}`} projById={projById} />)}
                emptyHint="No change orders on this company's work packages." />
              <ProfileSection prefix="cp" secKey="payments" title="Payments" count={counts.payments} icon={Banknote} highlight={highlight}
                rows={(links.payments || []).map((p) => <ActivityRow key={p._id} primary={<>{asMoney(p.amount)} <span className="text-slate-400 font-medium">· #{p.invoiceNo}</span></>} secondary={<>{p.date || "—"}{p.method ? ` · ${p.method}` : ""}{p.reference ? ` · ${p.reference}` : ""}</>} projectId={p.projectId} query="tab=finances" projById={projById} />)}
                emptyHint="No payments recorded on this company's invoices yet." />
            </div>
          )}
          <p className="text-[10px] text-slate-400 mt-6">Records link here automatically when this company is chosen on an invoice / RFQ / PO / agreement / shipment / work package, or matches a product's manufacturer. Click any row to open its project.</p>
        </div>
      )}

      {/* ── Details ──────────────────────────────────────────────── */}
      {tab === "details" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Contact persons ({company.contactPersons?.length || 0})</p>
              {(company.contactPersons?.length || 0) === 0 ? <p className="text-xs text-slate-400 italic">None recorded.</p> : (
                <div className="space-y-2">{company.contactPersons.map((p, i) => (
                  <div key={i} className="rounded-xl border border-slate-100 px-3 py-2">
                    <p className="text-sm font-bold text-slate-800">{p.name || "—"} {p.role && <span className="text-[11px] font-medium text-slate-400">· {p.role}</span>}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                      {p.email && <a href={`mailto:${p.email}`} className="text-xs text-slate-500 hover:text-primary flex items-center gap-1"><Mail size={11} /> {p.email}</a>}
                      {p.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone size={11} /> {p.phone}</span>}
                    </div>
                  </div>
                ))}</div>
              )}
            </div>
            {company.notes && (
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Notes</p>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{company.notes}</p>
              </div>
            )}
          </div>
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Landmark size={13} /> Banking &amp; tax</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {([["Bank", company.banking?.bankName], ["Account name", company.banking?.accountName], ["Account no.", company.banking?.accountNumber], ["IBAN", company.banking?.iban], ["SWIFT/BIC", company.banking?.swift], ["Routing", company.banking?.routing], ["Tax ID", company.tax?.taxId], ["Registration no.", company.tax?.registrationNo]] as const).map(([k, v]) => (
                <div key={k}><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{k}</p><p className="text-slate-700 font-medium break-words">{v || "—"}</p></div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Documents ────────────────────────────────────────────── */}
      {tab === "tasks" && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4">
          <TaskMiniBoard tasks={tasks} loading={tasksLoading} />
        </div>
      )}

      {tab === "documents" && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><FileText size={13} /> Documents, catalogues &amp; certifications ({files.length})</p>
            <button onClick={() => { setUploadFile(null); setDocType("catalogue"); setUploadOpen(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary shrink-0"><Upload size={12} /> Upload</button>
          </div>
          {files.length === 0 ? <p className="text-xs text-slate-400 italic">No documents yet — upload catalogues, certifications, or other company documents.</p> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{files.map((f) => (
              <div key={f._id} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-slate-100 text-xs">
                <span className="flex items-center gap-2 min-w-0">
                  {docIcon(f.docType)}
                  <span className="font-bold text-slate-700 truncate" title={f.name}>{f.name}</span>
                  <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-bold uppercase tracking-wide">{f.docType}</span>
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <a href={companyFileUrl(f)} target="_blank" rel="noreferrer" className="p-1 rounded text-slate-400 hover:text-primary" title="View"><Eye size={14} /></a>
                  <a href={companyFileUrl(f)} download={f.name} className="p-1 rounded text-slate-400 hover:text-primary" title="Download"><Download size={14} /></a>
                  <button onClick={() => removeDoc(f)} className="p-1 rounded text-slate-400 hover:text-red-500" title="Delete"><Trash2 size={14} /></button>
                </span>
              </div>
            ))}</div>
          )}
        </div>
      )}

      {/* ── Access (subcontractor / partner only) ────────────────── */}
      {tab === "access" && canHaveLogin && (
        <CompanyAccessManager company={company} involvedProjects={(links?.projects || []).map((p) => ({ projectId: p.projectId, name: p.name, status: p.status }))} />
      )}

      {/* CR-P-43 — upload modal: choose type, then file, then upload. No click-outside-to-close. */}
      {uploadOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Upload document</h3>
              <button onClick={() => { if (!uploading) { setUploadOpen(false); setUploadFile(null); } }} disabled={uploading} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Document type</p>
                <div className="grid grid-cols-2 gap-2">
                  {([["catalogue", "Catalogue"], ["certification", "Certification"], ["document", "Document"], ["other", "Other"]] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setDocType(v)} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${docType === v ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                      {docIcon(v)} {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">File</p>
                <label className="flex flex-col items-center justify-center gap-1.5 px-4 py-6 rounded-2xl border-2 border-dashed border-slate-200 hover:border-primary/40 hover:bg-slate-50 cursor-pointer text-center">
                  <Upload size={20} className="text-slate-400" />
                  {uploadFile ? <span className="text-xs font-bold text-slate-700 break-all">{uploadFile.name}</span> : <span className="text-xs text-slate-400">Click to choose a file</span>}
                  <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFile(f); e.target.value = ""; }} />
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
              <button onClick={() => { setUploadOpen(false); setUploadFile(null); }} disabled={uploading} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold disabled:opacity-50">Cancel</button>
              <button onClick={submitUpload} disabled={!uploadFile || uploading} className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-primary disabled:opacity-40 inline-flex items-center gap-1.5">{uploading && <Loader2 size={14} className="animate-spin" />} Upload</button>
            </div>
          </div>
        </div>
      )}

      {reportOpen && (
        <PdfPreviewModal
          title={`${company.name} · profile report`}
          fileName={fileName([company.name, "Profile report"], "pdf")}
          build={buildReport}
          onClose={() => setReportOpen(false)}
          fitOption={{ note: `${company.name} · profile report` }}
        />
      )}
      {dialogs}
    </div>
  );
}
