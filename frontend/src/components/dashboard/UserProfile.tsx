import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Pencil, KeyRound, Trash2, Mail, Phone, IdCard, Briefcase, Shield, Building2,
  FileText, Receipt, Bell, Eye, Download, Loader2, ExternalLink, PackageCheck,
} from "lucide-react";
import { fetchUserLinks, fetchUserFiles, userFileUrl, withFileToken, type AdminUser, type UserLinks, type UserFile } from "../../lib/api";

const roleBadge = (role: string) =>
  role === "admin" ? "bg-primary/10 text-primary" : role === "subcontractor" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600";
const initials = (name: string) => (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

// CR-P-57 — admin view of a user's full profile: identity + everything related to them across the
// platform (projects, agreements, POs, submittals, expenses, reminders) + admin-uploaded documents.
export default function UserProfile({
  user, onBack, onEdit, onResetPassword, onDelete, isSelf,
}: {
  user: AdminUser;
  onBack: () => void;
  onEdit: (u: AdminUser) => void;
  onResetPassword: (u: AdminUser) => void;
  onDelete: (u: AdminUser) => void;
  isSelf: boolean;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"activity" | "documents">("activity");
  const [links, setLinks] = useState<UserLinks | null>(null);
  const [files, setFiles] = useState<UserFile[]>([]);

  useEffect(() => {
    setLinks(null); setFiles([]);
    fetchUserLinks(user._id).then(setLinks).catch(() => setLinks({ projects: [], agreements: [], expenses: [], reminders: [], submittals: [], pos: [] }));
    fetchUserFiles(user._id).then(setFiles).catch(() => setFiles([]));
  }, [user._id]);

  const openProject = (projectId?: string) => { if (projectId) navigate(`/dashboard/projects/${projectId}`); };
  const counts = useMemo(() => ({
    projects: links?.projects.length ?? 0,
    agreements: links?.agreements.length ?? 0,
    pos: links?.pos.length ?? 0,
    submittals: links?.submittals.length ?? 0,
    expenses: links?.expenses.length ?? 0,
    reminders: links?.reminders.length ?? 0,
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
      {href ? <a href={href} className="hover:text-primary truncate">{value}</a> : <span className="truncate">{value}</span>}
    </p>
  ) : null;
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
      <div className="flex items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to users</button>
        <div className="flex items-center gap-1.5">
          <button onClick={() => onEdit(user)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 text-xs font-bold hover:text-primary"><Pencil size={14} /> Edit</button>
          <button onClick={() => onResetPassword(user)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 text-xs font-bold hover:text-amber-600"><KeyRound size={14} /> Reset password</button>
          <button onClick={() => onDelete(user)} disabled={isSelf} title={isSelf ? "You can't delete your own account" : ""} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 text-xs font-bold hover:text-red-500 disabled:opacity-40"><Trash2 size={14} /> Delete</button>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-20 h-20 rounded-2xl border border-slate-100 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
            {user.avatarUrl ? <img src={withFileToken(user.avatarUrl)} alt={user.name} className="w-full h-full object-cover" /> : <span className="text-2xl font-display font-bold text-slate-400">{initials(user.name)}</span>}
          </div>
          <div className="min-w-0 flex-grow">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-display font-bold text-slate-900 truncate">{user.name}</h1>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${roleBadge(user.role)}`}><Shield size={11} /> {user.role}</span>
              {user.empId && <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500"><IdCard size={11} /> {user.empId}</span>}
            </div>
            {user.jobTitle && <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5"><Briefcase size={13} className="text-slate-300" /> {user.jobTitle}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-3">
              {contactRow(Mail, user.email, user.email ? `mailto:${user.email}` : undefined)}
              {contactRow(Mail, user.personalEmail, user.personalEmail ? `mailto:${user.personalEmail}` : undefined)}
              {contactRow(Phone, user.phone, user.phone ? `tel:${user.phone}` : undefined)}
            </div>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {stat("Projects", counts.projects, Building2, "bg-indigo-50 text-indigo-600")}
        {stat("Agreements", counts.agreements, FileText, "bg-teal-50 text-teal-600")}
        {stat("Purchase orders", counts.pos, FileText, "bg-amber-50 text-amber-600")}
        {stat("Submittals", counts.submittals, PackageCheck, "bg-rose-50 text-rose-600")}
        {stat("Expenses", counts.expenses, Receipt, "bg-emerald-50 text-emerald-600")}
        {stat("Reminders", counts.reminders, Bell, "bg-blue-50 text-blue-600")}
        {stat("Documents", counts.documents, FileText, "bg-slate-100 text-slate-500")}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-max">
        {([["activity", "Activity"], ["documents", `Documents (${counts.documents})`]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === v ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}>{l}</button>
        ))}
      </div>

      {tab === "activity" && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          {!links ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 size={16} className="animate-spin" /> Loading activity…</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
              {section("Projects", counts.projects, Building2,
                links.projects.map((p) => linkRow(p._id, p.name, p.status, p._id)),
                "Not on any project yet.")}
              {section("Agreements", counts.agreements, FileText,
                links.agreements.map((a) => linkRow(a._id, a.name || a.agreementType, a.status || "—", a.ownerProjectId)),
                "No agreements linked to this user.")}
              {section("Purchase orders", counts.pos, FileText,
                links.pos.map((po) => linkRow(po._id, `PO #${po.poNo}`, <>{po.total || "—"} · {po.status}</>, po.projectId)),
                "No purchase orders added by this user.")}
              {section("Submittals", counts.submittals, PackageCheck,
                links.submittals.map((s) => linkRow(s._id, s.productName || "Submittal", s.status || "—", s.projectId)),
                "No submittals added by this user.")}
              {section("Expenses", counts.expenses, Receipt,
                links.expenses.map((e) => linkRow(e._id, e.description || "Expense", <>{e.amount || "—"}{e.approval ? ` · ${e.approval}` : ""}</>, e.projectId)),
                "No expenses submitted by this user.")}
              {section("Reminders", counts.reminders, Bell,
                links.reminders.map((r) => linkRow(r._id, r.title || "Reminder", <>{r.projectName || ""}{r.dueAt ? ` · ${new Date(r.dueAt).toLocaleDateString()}` : ""}</>, r.projectId)),
                "No reminders for this user.")}
            </div>
          )}
          <p className="text-[10px] text-slate-400 mt-6">Projects, agreements, expenses and reminders are linked by account; purchase orders and submittals are matched by name. Click a row to open its project.</p>
        </div>
      )}

      {tab === "documents" && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-3"><FileText size={13} /> Documents ({files.length})</p>
          {files.length === 0 ? <p className="text-xs text-slate-400 italic">No documents yet. Add them from Edit &rarr; Documents.</p> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{files.map((f) => (
              <div key={f._id} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-slate-100 text-xs">
                <span className="flex items-center gap-2 min-w-0"><FileText size={14} className="text-slate-400 shrink-0" /><span className="font-bold text-slate-700 truncate" title={f.name}>{f.name}</span>{f.size && <span className="text-slate-400 shrink-0">· {f.size}</span>}</span>
                <span className="flex items-center gap-1 shrink-0">
                  <a href={userFileUrl(f)} target="_blank" rel="noreferrer" className="p-1 rounded text-slate-400 hover:text-primary" title="View"><Eye size={14} /></a>
                  <a href={userFileUrl(f)} download={f.name} className="p-1 rounded text-slate-400 hover:text-primary" title="Download"><Download size={14} /></a>
                </span>
              </div>
            ))}</div>
          )}
        </div>
      )}
    </div>
  );
}
