import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2, ArrowLeft, Mail, Phone, Globe, MapPin, Pencil, Archive, RotateCcw, Trash2, Link2,
  Receipt, FileText, Truck, Award, BookOpen, Download, Eye, Upload, Loader2, Check, X, Landmark,
  Briefcase, ClipboardList, Quote as QuoteIcon, PackageCheck, ExternalLink,
} from "lucide-react";
import {
  fetchCompanyLinks, fetchCompanyProfileFiles, uploadCompanyProfileFile, deleteCompanyProfileFile,
  companyFileUrl, withFileToken,
  COMPANY_CATEGORIES, type ApiCompany, type CompanyCategory, type CompanyLinks, type CompanyFile,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";

const catLabel = (c: CompanyCategory) => COMPANY_CATEGORIES.find((x) => x.v === c)?.label || c;
const CAT_CLS: Record<string, string> = {
  vendor: "bg-emerald-50 text-emerald-600", subcontractor: "bg-blue-50 text-blue-600", client: "bg-indigo-50 text-indigo-600",
  manufacturer: "bg-amber-50 text-amber-600", consultant: "bg-purple-50 text-purple-600", partner: "bg-teal-50 text-teal-600",
  supplier: "bg-orange-50 text-orange-600", other: "bg-slate-100 text-slate-500",
};

// CR-P-43 — a full, read-only company profile: identity + everything this company is involved
// with across the platform (projects, agreements, RFQs, quotes, POs, invoices, shipments,
// submittals) plus its documents. Opened from the Directory card / title.
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
  const navigate = useNavigate();
  const { confirm } = useDialogs();
  const [tab, setTab] = useState<"activity" | "details" | "documents">("activity");
  const [links, setLinks] = useState<CompanyLinks | null>(null);
  const [files, setFiles] = useState<CompanyFile[]>([]);
  const [docType, setDocType] = useState("catalogue");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setLinks(null); setFiles([]);
    fetchCompanyLinks(company._id).then(setLinks).catch(() => setLinks({ invoices: [], rfqs: [], pos: [] }));
    fetchCompanyProfileFiles(company._id).then(setFiles).catch(() => setFiles([]));
  }, [company._id]);

  const uploadDoc = async (file: File) => {
    setUploading(true);
    try { await uploadCompanyProfileFile(company._id, file, docType); setFiles(await fetchCompanyProfileFiles(company._id)); toast("Document uploaded.", "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Upload failed.", "error"); }
    finally { setUploading(false); }
  };
  const removeDoc = async (f: CompanyFile) => {
    if (!(await confirm({ title: "Delete document?", message: `Remove "${f.name}" from this company profile?`, confirmLabel: "Delete", cancelLabel: "Cancel", danger: true }))) return;
    try { await deleteCompanyProfileFile(company._id, f._id); setFiles((p) => p.filter((x) => x._id !== f._id)); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not delete.", "error"); }
  };
  const docIcon = (t?: string) => t === "catalogue" ? <BookOpen size={14} className="text-amber-500 shrink-0" /> : t === "certification" ? <Award size={14} className="text-emerald-500 shrink-0" /> : <FileText size={14} className="text-slate-400 shrink-0" />;

  const openProject = (projectId?: string) => { if (projectId) navigate(`/dashboard/projects/${projectId}`); };

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
    documents: files.length,
  }), [links, files]);

  const stat = (label: string, value: number, Icon: typeof Building2, cls: string) => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-2.5 flex items-center gap-2.5">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cls}`}><Icon size={15} /></div>
      <div className="min-w-0"><p className="text-lg font-bold text-slate-900 leading-none tabular-nums">{value}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate">{label}</p></div>
    </div>
  );

  const contactRow = (Icon: typeof Mail, value?: string, href?: string) => value ? (
    <p className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
      <Icon size={14} className="text-slate-300 shrink-0" />
      {href ? <a href={href} target="_blank" rel="noreferrer" className="hover:text-primary truncate">{value}</a> : <span className="truncate">{value}</span>}
    </p>
  ) : null;

  // A compact, optionally project-linked activity row.
  const linkRow = (key: string, primary: ReactNode, secondary: ReactNode, projectId?: string) => (
    <button key={key} onClick={() => openProject(projectId)} disabled={!projectId}
      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-100 text-xs text-left ${projectId ? "hover:border-primary/30 hover:bg-primary/5 cursor-pointer group" : "cursor-default"}`}>
      <span className="font-bold text-slate-700 truncate flex items-center gap-1.5 min-w-0">{primary}</span>
      <span className="text-slate-500 shrink-0 flex items-center gap-1.5">{secondary}{projectId && <ExternalLink size={11} className="text-slate-300 group-hover:text-primary" />}</span>
    </button>
  );

  const section = (title: string, count: number, Icon: typeof Building2, rows: ReactNode[], emptyHint: string) => (
    <div>
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Icon size={13} /> {title} ({count})</p>
      {count === 0 ? <p className="text-xs text-slate-400 italic">{emptyHint}</p> : <div className="space-y-1.5">{rows}</div>}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Top bar: back + actions */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to directory</button>
        <div className="flex items-center gap-1.5">
          <button onClick={() => onCopyLink(company)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 text-xs font-bold hover:text-primary"><Link2 size={14} /> Copy link</button>
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
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${CAT_CLS[company.category]}`}>{catLabel(company.category)}</span>
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
        {stat("Projects", counts.projects, Briefcase, "bg-indigo-50 text-indigo-600")}
        {stat("Agreements", counts.agreements, FileText, "bg-teal-50 text-teal-600")}
        {stat("RFQs", counts.rfqs, ClipboardList, "bg-blue-50 text-blue-600")}
        {stat("Quotes", counts.quotes, QuoteIcon, "bg-purple-50 text-purple-600")}
        {stat("Purchase orders", counts.pos, FileText, "bg-amber-50 text-amber-600")}
        {stat("Invoices", counts.invoices, Receipt, "bg-emerald-50 text-emerald-600")}
        {stat("Shipments", counts.shipments, Truck, "bg-orange-50 text-orange-600")}
        {stat("Submittals", counts.submittals, PackageCheck, "bg-rose-50 text-rose-600")}
        {stat("Documents", counts.documents, BookOpen, "bg-slate-100 text-slate-500")}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-max">
        {([["activity", "Activity"], ["details", "Details"], ["documents", `Documents (${counts.documents})`]] as const).map(([v, l]) => (
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
              {section("Projects involved", counts.projects, Building2,
                (links.projects || []).map((p) => linkRow(p._id, p.name, p.status, p.projectId)),
                "Not linked to any project yet.")}
              {section("Agreements", counts.agreements, FileText,
                (links.agreements || []).map((a) => linkRow(a._id, a.name || "Agreement", a.status || "—", a.projectId)),
                "No agreements with this company yet.")}
              {section("RFQs", counts.rfqs, ClipboardList,
                links.rfqs.map((r) => linkRow(r._id, `RFQ #${r.rfqNo}`, <>{r.title ? `${r.title} · ` : ""}{r.status}</>, r.projectId)),
                "No RFQs sent to this company yet.")}
              {section("Quotes", counts.quotes, QuoteIcon,
                (links.quotes || []).map((q) => linkRow(q._id, <>Quote{q.accepted ? " ✓" : ""}</>, <>{q.total || "—"}{q.status ? ` · ${q.status}` : ""}</>, q.projectId)),
                "No quotes received from this company yet.")}
              {section("Purchase orders", counts.pos, FileText,
                links.pos.map((po) => linkRow(po._id, `PO #${po.poNo}`, <>{po.total || "—"} · {po.status}</>, po.projectId)),
                "No purchase orders for this company yet.")}
              {section("Invoices", counts.invoices, Receipt,
                links.invoices.map((iv) => linkRow(iv._id, <>#{iv.number} <span className="text-slate-400 font-medium">· {iv.type}</span></>, <>{iv.amount} · {iv.status}</>, iv.projectId)),
                "No invoices linked to this company yet.")}
              {section("Shipments", counts.shipments, Truck,
                (links.shipments || []).map((s) => linkRow(s._id, s.name || "Shipment", <>{s.status}{s.etaDate ? ` · ETA ${s.etaDate}` : ""}</>, s.projectId)),
                "No shipments handled by this company yet.")}
              {section("Submittals", counts.submittals, PackageCheck,
                (links.submittals || []).map((s) => linkRow(s._id, s.productName || "Submittal", s.status || "—", s.projectId)),
                "No submittals for this company's products yet.")}
            </div>
          )}
          <p className="text-[10px] text-slate-400 mt-6">Records link here automatically when this company is chosen on an invoice / RFQ / PO / agreement / shipment, or matches a product's manufacturer. Click any row to open its project.</p>
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
      {tab === "documents" && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><FileText size={13} /> Documents, catalogues &amp; certifications ({files.length})</p>
            <div className="flex items-center gap-1.5 shrink-0">
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className="text-[11px] font-bold rounded-lg border border-slate-200 px-2 py-1.5 bg-white text-slate-600 cursor-pointer" title="What kind of document is this?">
                <option value="catalogue">Catalogue</option>
                <option value="certification">Certification</option>
                <option value="document">Document</option>
                <option value="other">Other</option>
              </select>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary cursor-pointer">
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload
                <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadDoc(f); e.target.value = ""; }} />
              </label>
            </div>
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
    </div>
  );
}
