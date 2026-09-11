import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Building2, FileText, Receipt, Bell, PackageCheck, Loader2, Briefcase, ClipboardList,
  Quote as QuoteIcon, Truck, KanbanSquare, Mail, Phone, Globe, MapPin, Eye, Download,
} from "lucide-react";
import {
  fetchMyLinks, fetchMyTasks, fetchMyFiles, userFileUrl, withFileToken,
  type MyLinks, type ProfileTask, type UserFile,
} from "../../lib/api";
import { StatTile, ActivityRow, ProfileSection, jumpToSection } from "./profileBits";
import TaskMiniBoard from "./TaskMiniBoard";

// CR-P (16) — the self profile preview: the same clickable numbers + activity sections the admin
// sees on a user profile and the Directory shows on a company profile, but for the logged-in
// person. Subcontractor/partner logins also get their company's records (invoices, RFQs, quotes,
// shipments) and their own per-project sub-invoices. Everything is read-only here; rows deep-link
// into the project they belong to, and rows of deleted projects are blurred out.
export default function MyProfileOverview({ isGuest }: { isGuest: boolean }) {
  const [links, setLinks] = useState<MyLinks | null>(null);
  const [files, setFiles] = useState<UserFile[]>([]);
  const [tasks, setTasks] = useState<ProfileTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    fetchMyLinks().then(setLinks).catch(() => setLinks(null));
    fetchMyFiles().then(setFiles).catch(() => setFiles([]));
    fetchMyTasks().then(setTasks).catch(() => setTasks([])).finally(() => setTasksLoading(false));
  }, []);

  const projById = links?.projectNames || {};
  const hasCompany = !!links?.company;
  const counts = useMemo(() => ({
    projects: links?.projects.length ?? 0,
    agreements: links?.agreements.length ?? 0,
    invoices: (links?.invoices.length ?? 0) + (links?.subInvoices.length ?? 0),
    rfqs: links?.rfqs.length ?? 0,
    quotes: links?.quotes.length ?? 0,
    shipments: links?.shipments.length ?? 0,
    pos: links?.pos.length ?? 0,
    submittals: links?.submittals.length ?? 0,
    expenses: links?.expenses.length ?? 0,
    reminders: links?.reminders.length ?? 0,
    documents: files.length,
  }), [links, files]);

  const goTo = (key: string) => {
    setHighlight(key);
    jumpToSection("mp", key, setHighlight);
  };

  const company = links?.company;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="space-y-5">
      {/* The Directory company this login belongs to (subcontractors / partners) */}
      {company && (
        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-8 lg:p-10">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-16 h-16 rounded-2xl border border-slate-100 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
              {company.logoUrl ? <img src={withFileToken(company.logoUrl)} alt={company.name} className="w-full h-full object-contain" /> : <Building2 size={26} className="text-slate-300" />}
            </div>
            <div className="min-w-0 flex-grow">
              <h2 className="text-xl font-display font-bold text-slate-900 truncate">{company.name}</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Your company profile on GreenTech USA</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-3">
                {company.email && <p className="flex items-center gap-2 text-sm text-slate-600 min-w-0"><Mail size={14} className="text-slate-300 shrink-0" /><span className="truncate">{company.email}</span></p>}
                {company.phone && <p className="flex items-center gap-2 text-sm text-slate-600 min-w-0"><Phone size={14} className="text-slate-300 shrink-0" /><span className="truncate">{company.phone}</span></p>}
                {company.website && <p className="flex items-center gap-2 text-sm text-slate-600 min-w-0"><Globe size={14} className="text-slate-300 shrink-0" /><span className="truncate">{company.website}</span></p>}
                {company.address && <p className="flex items-center gap-2 text-sm text-slate-600 min-w-0"><MapPin size={14} className="text-slate-300 shrink-0" /><span className="truncate">{company.address}</span></p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clickable numbers — same behavior as the user/company profile previews */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
        <StatTile label="Projects" value={counts.projects} icon={Briefcase} cls="bg-indigo-50 text-indigo-600" onClick={() => goTo("projects")} />
        <StatTile label="Agreements" value={counts.agreements} icon={FileText} cls="bg-teal-50 text-teal-600" onClick={() => goTo("agreements")} />
        {(isGuest || counts.invoices > 0) && <StatTile label="Invoices" value={counts.invoices} icon={Receipt} cls="bg-emerald-50 text-emerald-600" onClick={() => goTo("invoices")} />}
        {hasCompany && <StatTile label="RFQs" value={counts.rfqs} icon={ClipboardList} cls="bg-blue-50 text-blue-600" onClick={() => goTo("rfqs")} />}
        {hasCompany && <StatTile label="Quotes" value={counts.quotes} icon={QuoteIcon} cls="bg-purple-50 text-purple-600" onClick={() => goTo("quotes")} />}
        {hasCompany && <StatTile label="Shipments" value={counts.shipments} icon={Truck} cls="bg-orange-50 text-orange-600" onClick={() => goTo("shipments")} />}
        <StatTile label="Purchase orders" value={counts.pos} icon={FileText} cls="bg-amber-50 text-amber-600" onClick={() => goTo("pos")} />
        <StatTile label="Submittals" value={counts.submittals} icon={PackageCheck} cls="bg-rose-50 text-rose-600" onClick={() => goTo("submittals")} />
        <StatTile label="Expenses" value={counts.expenses} icon={Receipt} cls="bg-lime-50 text-lime-600" onClick={() => goTo("expenses")} />
        <StatTile label="Reminders" value={counts.reminders} icon={Bell} cls="bg-sky-50 text-sky-600" onClick={() => goTo("reminders")} />
        <StatTile label="Tasks" value={tasks.length} icon={KanbanSquare} cls="bg-fuchsia-50 text-fuchsia-600" onClick={() => goTo("tasks")} />
        <StatTile label="Documents" value={counts.documents} icon={FileText} cls="bg-slate-100 text-slate-500" onClick={() => goTo("documents")} />
      </div>

      {/* Activity sections */}
      <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-8 lg:p-10">
        <h2 className="text-xl font-display font-bold text-slate-900 mb-1">My Activity</h2>
        <p className="text-xs text-slate-400 mb-6">Everything on the platform linked to you{company ? " or your company" : ""}. Click a number above to jump to its section, and click any row to open it inside its project.</p>
        {!links ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 size={16} className="animate-spin" /> Loading activity…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
            <ProfileSection prefix="mp" secKey="projects" title="My projects" count={counts.projects} icon={Building2} highlight={highlight}
              rows={links.projects.map((p) => <ActivityRow key={p._id} primary={p.name} secondary={p.status} projectId={p.projectId} self projById={projById} />)}
              emptyHint="No projects shared with you yet." />
            <ProfileSection prefix="mp" secKey="agreements" title="Agreements" count={counts.agreements} icon={FileText} highlight={highlight}
              rows={links.agreements.map((a) => (
                <ActivityRow key={a._id}
                  primary={[a.agreementNo, a.title || a.name || a.agreementType].filter(Boolean).join(" · ") || "Agreement"}
                  secondary={a.status || "—"}
                  projectId={a.ownerProjectId || undefined}
                  // CR-P (64) — a general agreement belongs to no project: open it on the Agreements
                  // page, where the party reads it and signs it.
                  to={a.ownerContextType === "general" ? `/dashboard/agreements?hl=ag-${a._id}` : undefined}
                  projById={projById} />
              ))}
              emptyHint="No agreements yet." />
            {(isGuest || counts.invoices > 0) && (
              <ProfileSection prefix="mp" secKey="invoices" title="Invoices" count={counts.invoices} icon={Receipt} highlight={highlight}
                rows={[
                  ...links.subInvoices.map((si) => <ActivityRow key={si._id} primary={si.description || "Invoice"} secondary={<>{si.amount || "—"}{si.approval ? ` · ${si.approval}` : ""}</>} projectId={si.projectId} query="tab=subs" projById={projById} />),
                  ...links.invoices.map((iv) => <ActivityRow key={iv._id} primary={<>#{iv.number} <span className="text-slate-400 font-medium">· {iv.type}</span></>} secondary={<>{iv.amount} · {iv.status}</>} projectId={iv.projectId} query="tab=finances" projById={projById} />),
                ]}
                emptyHint="No invoices yet." />
            )}
            {hasCompany && (
              <ProfileSection prefix="mp" secKey="rfqs" title="RFQs" count={counts.rfqs} icon={ClipboardList} highlight={highlight}
                rows={links.rfqs.map((r) => <ActivityRow key={r._id} primary={`RFQ #${r.rfqNo}`} secondary={<>{r.title ? `${r.title} · ` : ""}{r.status}</>} projectId={r.projectId} query="tab=procurement&proc=rfqs" projById={projById} />)}
                emptyHint="No RFQs yet." />
            )}
            {hasCompany && (
              <ProfileSection prefix="mp" secKey="quotes" title="Quotes" count={counts.quotes} icon={QuoteIcon} highlight={highlight}
                rows={links.quotes.map((q) => <ActivityRow key={q._id} primary={<>Quote{q.accepted ? " ✓" : ""}</>} secondary={<>{q.total || "—"}{q.status ? ` · ${q.status}` : ""}</>} projectId={q.projectId} query="tab=procurement&proc=quotes" projById={projById} />)}
                emptyHint="No quotes yet." />
            )}
            {hasCompany && (
              <ProfileSection prefix="mp" secKey="shipments" title="Shipments" count={counts.shipments} icon={Truck} highlight={highlight}
                rows={links.shipments.map((s) => <ActivityRow key={s._id} primary={s.name || "Shipment"} secondary={<>{s.status}{s.etaDate ? ` · ETA ${s.etaDate}` : ""}</>} projectId={s.projectId} query="tab=procurement&proc=shipment" projById={projById} />)}
                emptyHint="No shipments yet." />
            )}
            <ProfileSection prefix="mp" secKey="pos" title="Purchase orders" count={counts.pos} icon={FileText} highlight={highlight}
              rows={links.pos.map((po) => <ActivityRow key={po._id} primary={`PO #${po.poNo}`} secondary={<>{po.total || "—"} · {po.status}</>} projectId={po.projectId} query="tab=procurement&proc=po" projById={projById} />)}
              emptyHint="No purchase orders yet." />
            <ProfileSection prefix="mp" secKey="submittals" title="Submittals" count={counts.submittals} icon={PackageCheck} highlight={highlight}
              rows={links.submittals.map((s) => <ActivityRow key={s._id} primary={s.productName || "Submittal"} secondary={s.status || "—"} projectId={s.projectId} query="tab=procurement&proc=submittals" projById={projById} />)}
              emptyHint="No submittals yet." />
            <ProfileSection prefix="mp" secKey="expenses" title="Expenses" count={counts.expenses} icon={Receipt} highlight={highlight}
              rows={links.expenses.map((e) => <ActivityRow key={e._id} primary={e.description || "Expense"} secondary={<>{e.amount || "—"}{e.approval ? ` · ${e.approval}` : ""}</>} projectId={e.projectId} query="tab=finances" projById={projById} />)}
              emptyHint="No expenses yet." />
            <ProfileSection prefix="mp" secKey="reminders" title="Reminders" count={counts.reminders} icon={Bell} highlight={highlight}
              rows={links.reminders.map((r) => <ActivityRow key={r._id} primary={r.title || "Reminder"} secondary={<>{r.dueAt ? new Date(r.dueAt).toLocaleDateString() : ""}</>} projectId={r.projectId} projById={projById} />)}
              emptyHint="No reminders yet." />
          </div>
        )}
      </div>

      {/* Tasks */}
      <div id="mp-sec-tasks" className={`scroll-mt-24 bg-white rounded-[3rem] border border-slate-100 shadow-sm p-6 transition-all ${highlight === "tasks" ? "ring-2 ring-primary/40 ring-offset-2" : ""}`}>
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><KanbanSquare size={13} /> My tasks ({tasks.length})</p>
        <TaskMiniBoard tasks={tasks} loading={tasksLoading} />
      </div>

      {/* Documents */}
      <div id="mp-sec-documents" className={`scroll-mt-24 bg-white rounded-[3rem] border border-slate-100 shadow-sm p-8 transition-all ${highlight === "documents" ? "ring-2 ring-primary/40 ring-offset-2" : ""}`}>
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><FileText size={13} /> My documents ({files.length})</p>
        {files.length === 0 ? <p className="text-xs text-slate-400 italic">No documents on your profile yet.</p> : (
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
    </motion.div>
  );
}
