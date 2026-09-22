import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Pencil, KeyRound, Trash2, Mail, Phone, IdCard, Briefcase, Shield, Building2,
  FileText, Receipt, Bell, Eye, Download, Loader2, PackageCheck, MapPin,
} from "lucide-react";
import { fetchUserLinks, fetchUserFiles, fetchUserTasks, userFileUrl, withFileToken, type AdminUser, type UserLinks, type UserFile, type ProfileTask } from "../../lib/api";
import { StatTile, ActivityRow, ProfileSection, jumpToSection } from "./profileBits";
import PdfPreviewModal from "./PdfPreviewModal";
import { fileName } from "../../lib/fileNames";
import TaskMiniBoard from "./TaskMiniBoard";
import UserAccessManager from "./UserAccessManager";

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
  const [tab, setTab] = useState<"activity" | "tasks" | "documents" | "access">("activity");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [links, setLinks] = useState<UserLinks | null>(null);
  const [files, setFiles] = useState<UserFile[]>([]);
  const [tasks, setTasks] = useState<ProfileTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  useEffect(() => {
    setLinks(null); setFiles([]); setTasks([]); setTasksLoading(true);
    fetchUserLinks(user._id).then(setLinks).catch(() => setLinks({ projects: [], agreements: [], expenses: [], reminders: [], submittals: [], pos: [] }));
    fetchUserFiles(user._id).then(setFiles).catch(() => setFiles([]));
    fetchUserTasks(user._id).then(setTasks).catch(() => setTasks([])).finally(() => setTasksLoading(false));
  }, [user._id]);

  // projectId → name for every project the user's items reference; a referenced id missing here
  // means that project was deleted (row is blurred and can't be opened).
  const projById = links?.projectNames || {};
  const counts = useMemo(() => ({
    projects: links?.projects.length ?? 0,
    agreements: links?.agreements.length ?? 0,
    pos: links?.pos.length ?? 0,
    submittals: links?.submittals.length ?? 0,
    expenses: links?.expenses.length ?? 0,
    reminders: links?.reminders.length ?? 0,
    documents: files.length,
  }), [links, files]);

  // Clicking a stat tile jumps to its section: most live under the Activity tab (scroll + brief
  // highlight); Documents is its own tab. Tiles/rows/sections come from profileBits (CR-P 16).
  const goTo = (key: "projects" | "agreements" | "pos" | "submittals" | "expenses" | "reminders" | "documents") => {
    if (key === "documents") { setTab("documents"); return; }
    setTab("activity");
    setHighlight(key);
    jumpToSection("up", key, setHighlight);
  };
  // CR 267 - the full report for this person: their details and everything that names them.
  const [reportOpen, setReportOpen] = useState(false);
  const pname = (id?: string) => (id ? projById[id] || id : "-");
  const buildReport = async () => {
    const { buildProfileReportPdf } = await import("../../lib/profileReportPdf");
    return buildProfileReportPdf({
      kind: "person",
      name: user.name || user.email,
      subtitle: [user.jobTitle, user.role].filter(Boolean).join(" · "),
      fields: [
        ["Role", user.role || ""],
        ["Job title", user.jobTitle || ""],
        ["Employee ID", user.empId || ""],
        ["Work email", user.email || ""],
        ["Personal email", user.personalEmail || ""],
        ["Phone", user.phone || ""],
        ["Home address", user.homeAddress || ""],
        ["Account", user.archived ? "Deactivated" : "Active"],
      ],
      stats: [
        ["Projects", String(counts.projects)],
        ["Agreements", String(counts.agreements)],
        ["POs", String(counts.pos)],
        ["Submittals", String(counts.submittals)],
        ["Expenses", String(counts.expenses)],
        ["Documents", String(counts.documents)],
      ],
      sections: [
        {
          title: "Projects",
          columns: [{ label: "Project", w: 220, wrap: true }, { label: "Location", w: 130, wrap: true }, { label: "Status", w: 118 }],
          rows: (links?.projects || []).map((p) => [p.name, p.location || "", p.status]),
        },
        {
          title: "Agreements",
          columns: [{ label: "Agreement", w: 220, wrap: true }, { label: "Type", w: 110 }, { label: "Project", w: 110, wrap: true }, { label: "Status", w: 28 }],
          rows: (links?.agreements || []).map((a) => [a.title || a.name, a.agreementType, pname(a.ownerProjectId), a.status]),
        },
        {
          title: "Purchase orders",
          columns: [{ label: "PO", w: 100 }, { label: "Vendor", w: 170, wrap: true }, { label: "Total", w: 90, align: "right" }, { label: "Project", w: 108, wrap: true }],
          rows: (links?.pos || []).map((p) => [p.poNo, p.vendorName, p.total, pname(p.projectId)]),
        },
        {
          title: "Submittals",
          columns: [{ label: "Product", w: 250, wrap: true }, { label: "Project", w: 130, wrap: true }, { label: "Status", w: 88 }],
          rows: (links?.submittals || []).map((x) => [x.productName, pname(x.projectId), x.status]),
        },
        {
          title: "Expenses",
          columns: [{ label: "Description", w: 200, wrap: true }, { label: "Amount", w: 90, align: "right" }, { label: "Project", w: 100, wrap: true }, { label: "Approval", w: 78 }],
          rows: (links?.expenses || []).map((e) => [e.description, e.amount, pname(e.projectId), e.approval || ""]),
        },
        {
          title: "Reminders",
          columns: [{ label: "Reminder", w: 250, wrap: true }, { label: "Due", w: 110 }, { label: "Project", w: 108, wrap: true }],
          rows: (links?.reminders || []).map((x) => [x.title, x.dueAt ? new Date(x.dueAt).toLocaleString() : "", x.projectName || pname(x.projectId)]),
        },
        {
          title: "Tasks",
          columns: [{ label: "Task", w: 250, wrap: true }, { label: "Project", w: 110, wrap: true }, { label: "Status", w: 108 }],
          rows: tasks.map((t) => [t.title, t.projectName || "", t.status || ""]),
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
      {href ? <a href={href} className="hover:text-primary truncate">{value}</a> : <span className="truncate">{value}</span>}
    </p>
  ) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to users</button>
        <div className="flex items-center gap-1.5">
          {/* CR 267 - everything held for this person, as one document. */}
          <button onClick={() => setReportOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 text-xs font-bold hover:text-primary"><FileText size={14} /> Report</button>
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
              {contactRow(MapPin, user.homeAddress)}
            </div>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        <StatTile label="Projects" value={counts.projects} icon={Building2} cls="bg-indigo-50 text-indigo-600" onClick={() => goTo("projects")} />
        <StatTile label="Agreements" value={counts.agreements} icon={FileText} cls="bg-teal-50 text-teal-600" onClick={() => goTo("agreements")} />
        <StatTile label="Purchase orders" value={counts.pos} icon={FileText} cls="bg-amber-50 text-amber-600" onClick={() => goTo("pos")} />
        <StatTile label="Submittals" value={counts.submittals} icon={PackageCheck} cls="bg-rose-50 text-rose-600" onClick={() => goTo("submittals")} />
        <StatTile label="Expenses" value={counts.expenses} icon={Receipt} cls="bg-emerald-50 text-emerald-600" onClick={() => goTo("expenses")} />
        <StatTile label="Reminders" value={counts.reminders} icon={Bell} cls="bg-blue-50 text-blue-600" onClick={() => goTo("reminders")} />
        <StatTile label="Documents" value={counts.documents} icon={FileText} cls="bg-slate-100 text-slate-500" onClick={() => goTo("documents")} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-max">
        {([["activity", "Activity"], ["tasks", `Tasks (${tasks.length})`], ["documents", `Documents (${counts.documents})`], ["access", "Access"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === v ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}>{l}</button>
        ))}
      </div>

      {tab === "activity" && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          {!links ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 size={16} className="animate-spin" /> Loading activity…</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
              <ProfileSection prefix="up" secKey="projects" title="Projects" count={counts.projects} icon={Building2} highlight={highlight}
                rows={links.projects.map((p) => <ActivityRow key={p._id} primary={p.name} secondary={p.status} projectId={p.projectId} self projById={projById} />)}
                emptyHint="Not on any project yet." />
              <ProfileSection prefix="up" secKey="agreements" title="Agreements" count={counts.agreements} icon={FileText} highlight={highlight}
                rows={links.agreements.map((a) => <ActivityRow key={a._id} primary={a.name || a.agreementType} secondary={a.status || "—"} projectId={a.ownerProjectId} projById={projById} />)}
                emptyHint="No agreements linked to this user." />
              <ProfileSection prefix="up" secKey="pos" title="Purchase orders" count={counts.pos} icon={FileText} highlight={highlight}
                rows={links.pos.map((po) => <ActivityRow key={po._id} primary={`PO #${po.poNo}`} secondary={<>{po.total || "—"} · {po.status}</>} projectId={po.projectId} query="tab=procurement&proc=po" projById={projById} />)}
                emptyHint="No purchase orders added by this user." />
              <ProfileSection prefix="up" secKey="submittals" title="Submittals" count={counts.submittals} icon={PackageCheck} highlight={highlight}
                rows={links.submittals.map((s) => <ActivityRow key={s._id} primary={s.productName || "Submittal"} secondary={s.status || "—"} projectId={s.projectId} query="tab=procurement&proc=submittals" projById={projById} />)}
                emptyHint="No submittals added by this user." />
              <ProfileSection prefix="up" secKey="expenses" title="Expenses" count={counts.expenses} icon={Receipt} highlight={highlight}
                rows={links.expenses.map((e) => <ActivityRow key={e._id} primary={e.description || "Expense"} secondary={<>{e.amount || "—"}{e.approval ? ` · ${e.approval}` : ""}</>} projectId={e.projectId} query="tab=finances" projById={projById} />)}
                emptyHint="No expenses submitted by this user." />
              <ProfileSection prefix="up" secKey="reminders" title="Reminders" count={counts.reminders} icon={Bell} highlight={highlight}
                rows={links.reminders.map((r) => <ActivityRow key={r._id} primary={r.title || "Reminder"} secondary={<>{r.dueAt ? new Date(r.dueAt).toLocaleDateString() : ""}</>} projectId={r.projectId} projById={projById} />)}
                emptyHint="No reminders for this user." />
            </div>
          )}
          <p className="text-[10px] text-slate-400 mt-6">Projects, agreements, expenses and reminders are linked by account; purchase orders and submittals are matched by name. Click a row to open its project.</p>
        </div>
      )}

      {tab === "tasks" && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4">
          <TaskMiniBoard tasks={tasks} loading={tasksLoading} />
        </div>
      )}

      {tab === "access" && <UserAccessManager user={user} />}

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
      {reportOpen && (
        <PdfPreviewModal
          title={`${user.name || user.email} · profile report`}
          fileName={fileName([user.name || user.email, "Profile report"], "pdf")}
          build={buildReport}
          onClose={() => setReportOpen(false)}
          fitOption={{ note: `${user.name || user.email} · profile report` }}
        />
      )}
    </div>
  );
}
