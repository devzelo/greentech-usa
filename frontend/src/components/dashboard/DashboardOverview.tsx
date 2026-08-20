import { motion } from "motion/react";
import { useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Briefcase, Clock, CheckCircle2, FileEdit, Lightbulb, ArrowUpRight, Loader2,
  Bell, AlarmClock, TrendingUp, TrendingDown, DollarSign, FolderPlus, Handshake,
  Building2, FileText, ClipboardList, Package, ChevronRight, Share2,
} from "lucide-react";
import {
  fetchProjects, fetchProjectFinancials, fetchDrafts, fetchReminders, fetchNotifications,
  getAuthUser, ApiProject, ProjectFinancials, ApiDraft, ApiReminder, ApiNotification,
} from "../../lib/api";
import { statusMeta, statusMatches } from "../../lib/projectStatus";
import { locationFlag } from "../../lib/countryFlag";
import { useMeta } from "../../hooks/useMeta";

const money = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const todayStr = () => new Date().toLocaleDateString("en-CA");
const isToday = (iso: string) => { const d = new Date(iso); return !isNaN(d.getTime()) && d.toLocaleDateString("en-CA") === todayStr(); };
const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};

// Card accent palettes — the four project cards borrow the status-filter colours so the Overview
// reads the same as My Projects / All Projects; drafts get their own violet.
const ACCENT: Record<string, { bg: string; text: string; bar: string }> = {
  blue:    { bg: "bg-blue-50",    text: "text-blue-600",    bar: "bg-blue-400" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", bar: "bg-emerald-500" },
  yellow:  { bg: "bg-yellow-50",  text: "text-yellow-600",  bar: "bg-yellow-400" },
  slate:   { bg: "bg-slate-100",  text: "text-slate-600",   bar: "bg-slate-400" },
  violet:  { bg: "bg-violet-50",  text: "text-violet-600",  bar: "bg-violet-400" },
};

const DRAFT_META: Record<ApiDraft["kind"], { label: string; icon: typeof Briefcase; cls: string }> = {
  project:    { label: "Project",   icon: Briefcase,     cls: "bg-blue-50 text-blue-600" },
  agreement:  { label: "Agreement", icon: Handshake,     cls: "bg-indigo-50 text-indigo-600" },
  submittal:  { label: "Submittal", icon: ClipboardList, cls: "bg-amber-50 text-amber-600" },
  rfq:        { label: "RFQ",       icon: Package,       cls: "bg-emerald-50 text-emerald-600" },
};

export default function DashboardOverview() {
  useMeta({ title: "Overview", description: "Your project dashboard — track ongoing work, activity, drafts and finances." });
  const navigate = useNavigate();
  const user = getAuthUser();
  const isAdmin = user?.role === "admin";
  const isStaff = user?.role === "admin" || user?.role === "employee";
  const firstName = (user?.name || "there").split(" ")[0];
  // Only admins have the All Projects page; everyone else stays in My Projects.
  const projectsBase = isAdmin ? "/dashboard/all-projects" : "/dashboard/my-projects";

  // CR-P-16 — the Overview reflects THIS user's own projects only (owned or assigned), not the
  // whole platform. Every number, the finances and Recent Projects come from "my projects".
  const [mine, setMine] = useState<ApiProject[]>([]);
  const [financials, setFinancials] = useState<Record<string, ProjectFinancials>>({});
  const [reminders, setReminders] = useState<ApiReminder[]>([]);
  const [notifs, setNotifs] = useState<ApiNotification[]>([]);
  const [drafts, setDrafts] = useState<ApiDraft[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchProjects("mine").catch(() => [] as ApiProject[]),
      fetchDrafts("mine").catch(() => [] as ApiDraft[]),
      fetchReminders().catch(() => [] as ApiReminder[]),
      fetchNotifications(true).catch(() => ({ items: [] as ApiNotification[], unread: 0 })),
    ]).then(([m, d, r, n]) => {
      setMine(m); setDrafts(d); setReminders(r); setNotifs(n.items);
      if (isStaff && m.length) fetchProjectFinancials(m.map((p) => p.id)).then(setFinancials).catch(() => {});
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = (filter: string) => mine.filter((p) => statusMatches(filter, p.status)).length;
  const cards = [
    { label: "My Projects", value: mine.length, accent: "blue", icon: Briefcase, trend: "Owned or assigned", onClick: () => navigate("/dashboard/my-projects") },
    { label: "Active / Ongoing", value: count("Active"), accent: "emerald", icon: Clock, trend: "In progress", onClick: () => navigate("/dashboard/my-projects?status=Active") },
    { label: "Proposal / Opportunity", value: count("Proposal"), accent: "yellow", icon: Lightbulb, trend: "Pipeline", onClick: () => navigate("/dashboard/my-projects?status=Proposal") },
    { label: "Completed / Closed", value: count("Closed"), accent: "slate", icon: CheckCircle2, trend: "Delivered", onClick: () => navigate("/dashboard/my-projects?status=Closed") },
    { label: "Drafts", value: drafts.length, accent: "violet", icon: FileEdit, trend: "Unfinished", onClick: () => document.getElementById("overview-drafts")?.scrollIntoView({ behavior: "smooth", block: "center" }) },
  ];

  const fin = (Object.values(financials) as ProjectFinancials[]).reduce(
    (acc, f) => ({ income: acc.income + (f.income || 0), expenses: acc.expenses + (f.expenses || 0) }),
    { income: 0, expenses: 0 },
  );
  const profit = fin.income - fin.expenses;

  const quickActions = [
    { label: "New Project", icon: FolderPlus, to: "/dashboard/new-project" },
    { label: "New Agreement", icon: Handshake, to: "/dashboard/agreements" },
    { label: "New Reminder", icon: AlarmClock, to: "/dashboard/reminders" },
    { label: "Directory", icon: Building2, to: "/dashboard/directory" },
    { label: "Documents", icon: FileText, to: "/dashboard/documents" },
    { label: isAdmin ? "All Projects" : "My Projects", icon: Briefcase, to: projectsBase },
  ];

  const recent = mine.slice(0, 6);

  const openReminders = reminders
    .filter((r) => r.status === "Pending" || r.status === "InProgress")
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const remOverdue = (r: ApiReminder) => new Date(r.dueAt).getTime() < Date.now();

  const notifIcon = (n: ApiNotification) => n.type === "reminder" ? <AlarmClock size={14} /> : n.type === "assignment" ? <FolderPlus size={14} /> : <Share2 size={14} />;
  const notifCls = (n: ApiNotification) => n.type === "reminder" ? "bg-amber-50 text-amber-500" : n.type === "assignment" ? "bg-indigo-50 text-indigo-500" : "bg-emerald-50 text-emerald-500";

  const openDraft = (d: ApiDraft) => navigate(d.link);

  return (
    <div className="space-y-8">
      {/* Welcome + KPI cards, side by side (cards fill the space beside the greeting). */}
      <div className="flex flex-col xl:flex-row xl:items-stretch gap-5">
        <div className="xl:w-56 shrink-0 flex flex-col justify-center">
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 mb-1.5">Welcome back, {firstName}!</h1>
          <p className="text-slate-500 font-medium text-sm">Here&apos;s what&apos;s happening with your projects today.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 flex-grow">
          {cards.map((c, i) => {
            const a = ACCENT[c.accent];
            return (
              <motion.button
                key={c.label}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                onClick={c.onClick}
                className="relative text-left bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all group overflow-hidden"
              >
                <span className={`absolute top-0 left-0 h-full w-1.5 ${a.bar}`} />
                <div className="flex items-center gap-2.5 pl-1">
                  <div className={`w-9 h-9 rounded-xl ${a.bg} ${a.text} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                    <c.icon size={18} />
                  </div>
                  <p className={`text-2xl font-display font-bold ${a.text} leading-none`}>
                    {loading ? <Loader2 size={16} className="animate-spin text-slate-300" /> : c.value}
                  </p>
                </div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate mt-2 pl-1">{c.label}</p>
                <div className="mt-1 flex items-center justify-between pl-1">
                  <span className="text-[10px] font-bold text-slate-300 italic truncate">{c.trend}</span>
                  <ArrowUpRight size={13} className="text-slate-300 flex-shrink-0 group-hover:text-primary transition-colors" />
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Quick actions — jump straight to the most-used creates & modules. */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">Quick actions</span>
        {quickActions.map((q) => (
          <Link key={q.label} to={q.to} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-100 shadow-sm text-xs font-bold text-slate-600 hover:text-primary hover:border-primary/20 hover:-translate-y-0.5 transition-all">
            <q.icon size={14} className="text-primary" /> {q.label}
          </Link>
        ))}
      </div>

      {/* General information — portfolio finances (staff only), mirroring All Projects' top bar. */}
      {isStaff && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">General information · My Finances</h2>
            <button onClick={() => navigate("/dashboard/my-projects")} className="text-xs font-bold text-primary hover:underline">My projects</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><TrendingUp size={20} /></div>
              <div><p className="text-xl font-display font-bold text-slate-900 leading-none">{loading ? "—" : money(fin.income)}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total income</p></div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center"><TrendingDown size={20} /></div>
              <div><p className="text-xl font-display font-bold text-slate-900 leading-none">{loading ? "—" : money(fin.expenses)}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total expenses</p></div>
            </div>
            <div className={`rounded-2xl border shadow-sm p-4 flex items-center gap-3 ${profit >= 0 ? "bg-primary/5 border-primary/10" : "bg-red-50 border-red-100"}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${profit >= 0 ? "bg-primary/10 text-primary" : "bg-red-100 text-red-600"}`}><DollarSign size={20} /></div>
              <div><p className={`text-xl font-display font-bold leading-none ${profit >= 0 ? "text-primary" : "text-red-600"}`}>{loading ? "—" : money(profit)}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{profit >= 0 ? "Net profit" : "Net loss"}</p></div>
            </div>
          </div>
        </div>
      )}

      {/* Three columns: Recent Projects · Reminders & Notifications · Drafts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Column 1 — Recent Projects (compact: project / contract only) ── */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5 flex flex-col h-[30rem]">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Briefcase size={16} className="text-primary" /> Recent Projects</h3>
            <button onClick={() => navigate("/dashboard/my-projects")} className="text-[11px] font-bold text-primary hover:underline">View all</button>
          </div>
          <div className="flex-1 overflow-y-auto scroll-slim -mr-2 pr-2">
          {loading ? <div className="py-10 flex justify-center text-slate-300"><Loader2 size={22} className="animate-spin" /></div>
          : recent.length === 0 ? <p className="text-xs text-slate-400 italic py-6 text-center">No projects yet.</p>
          : (
            <div className="space-y-1.5">
              {recent.map((project) => {
                const sm = statusMeta(project.status);
                return (
                  <button key={project.id} onClick={() => navigate(`/dashboard/projects/${project.id}`)} className="w-full text-left flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 hover:border-slate-200 transition-colors group">
                    <span className={`w-1.5 h-9 rounded-full flex-shrink-0 ${sm.dot}`} title={sm.label} />
                    <span className="min-w-0 flex-grow">
                      <span className="flex items-center gap-1.5">
                        <span className="block text-xs font-bold text-slate-800 truncate group-hover:text-primary transition-colors">{project.name}</span>
                        {/* CR-P-23 — JV projects are flagged here too. */}
                        {project.jointVenture?.enabled && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[8px] font-bold flex-shrink-0" title={project.jointVenture.partnerName ? `Joint Venture with ${project.jointVenture.partnerName}` : "Joint Venture project"}><Handshake size={8} /> JV</span>}
                      </span>
                      <span className="block text-[10px] text-slate-400 font-medium truncate">No {project.id}{project.contractNo ? ` · Contract ${project.contractNo}` : ""}</span>
                      {project.location && <span className="block text-[10px] text-slate-500 font-bold truncate">{locationFlag(project.location) && <span className="text-[1.15em] leading-none align-middle mr-0.5">{locationFlag(project.location)}</span>}{project.location}</span>}
                    </span>
                    <ArrowUpRight size={15} className="text-slate-300 group-hover:text-primary flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
          </div>
        </div>

        {/* ── Column 2 — Reminders & Notifications (today first) ── */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5 flex flex-col h-[30rem]">
          <div className="flex items-center justify-between mb-1 shrink-0">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Bell size={16} className="text-primary" /> Reminders &amp; Notifications</h3>
            <Link to="/dashboard/reminders" className="text-[11px] font-bold text-primary hover:underline">Open</Link>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 shrink-0">Today · {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p>

          <div className="flex-1 overflow-y-auto scroll-slim -mr-2 pr-2">
          {loading ? <div className="py-10 flex justify-center text-slate-300"><Loader2 size={22} className="animate-spin" /></div> : (
            <div className="space-y-3">
              {/* Reminders */}
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><AlarmClock size={11} /> Reminders</p>
                {openReminders.length === 0 ? <p className="text-[11px] text-slate-400 italic px-1 py-1">No open reminders.</p>
                : (
                  <div className="space-y-1.5">
                    {openReminders.slice(0, 4).map((r) => {
                      const over = remOverdue(r);
                      return (
                        <button key={r._id} onClick={() => navigate(r.link || "/dashboard/reminders")} className={`w-full text-left flex items-start gap-2.5 p-2 rounded-xl border transition-colors ${over ? "border-red-200 bg-red-50/40 hover:bg-red-50" : "border-slate-100 hover:bg-slate-50"}`}>
                          <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${over ? "bg-red-500" : isToday(r.dueAt) ? "bg-amber-400" : "bg-slate-300"}`} />
                          <span className="min-w-0 flex-grow">
                            <span className="block text-xs font-bold text-slate-800 truncate">{r.title}</span>
                            <span className={`block text-[10px] font-bold ${over ? "text-red-500" : "text-slate-400"}`}>{over ? "Overdue · " : isToday(r.dueAt) ? "Today · " : ""}{new Date(r.dueAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Notifications */}
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Bell size={11} /> Notifications <Link to="/dashboard/reminders?view=notifications" className="ml-auto text-primary hover:underline normal-case tracking-normal">See all</Link></p>
                {notifs.length === 0 ? <p className="text-[11px] text-slate-400 italic px-1 py-1">You&apos;re all caught up.</p>
                : (
                  <div className="space-y-1.5">
                    {notifs.slice(0, 4).map((n) => (
                      <button key={n._id} onClick={() => n.link && navigate(n.link)} className={`w-full text-left flex items-start gap-2.5 p-2 rounded-xl border transition-colors ${n.read ? "border-slate-100 hover:bg-slate-50" : "border-primary/20 bg-primary/[0.03] hover:bg-primary/5"}`}>
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${notifCls(n)}`}>{notifIcon(n)}</span>
                        <span className="min-w-0 flex-grow">
                          <span className="block text-xs font-bold text-slate-800 truncate">{n.title}</span>
                          <span className="block text-[10px] text-slate-400 truncate">{n.message}</span>
                        </span>
                        <span className="text-[9px] font-bold text-slate-300 flex-shrink-0 whitespace-nowrap">{isToday(n.createdAt) ? "Today" : timeAgo(n.createdAt)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </div>

        {/* ── Column 3 — Drafts ── */}
        <div id="overview-drafts" className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5 flex flex-col h-[30rem]">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><FileEdit size={16} className="text-primary" /> Drafts</h3>
            <span className="text-[11px] font-bold text-slate-400">{drafts.length} item{drafts.length === 1 ? "" : "s"}</span>
          </div>
          <div className="flex-1 overflow-y-auto scroll-slim -mr-2 pr-2">
          {loading ? <div className="py-10 flex justify-center text-slate-300"><Loader2 size={22} className="animate-spin" /></div>
          : drafts.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <FileEdit size={30} className="mx-auto mb-2" />
              <p className="font-bold text-xs">No drafts — you&apos;re all caught up.</p>
              <p className="text-[10px] mt-1">Projects, agreements, submittals &amp; RFQs saved as drafts show here.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {drafts.map((d) => {
                const dm = DRAFT_META[d.kind];
                return (
                  <button key={`${d.kind}-${d.id}`} onClick={() => openDraft(d)} className="w-full text-left flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 hover:border-slate-200 transition-colors group">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${dm.cls}`}><dm.icon size={15} /></span>
                    <div className="min-w-0 flex-grow">
                      <p className="text-xs font-bold text-slate-800 truncate group-hover:text-primary transition-colors">{d.title}</p>
                      <p className="text-[10px] text-slate-400 font-medium truncate">
                        <span className="uppercase tracking-widest font-bold">{dm.label}</span>
                        {d.projectName ? ` · ${d.projectName}` : ""}{d.updatedAt ? ` · ${timeAgo(d.updatedAt)}` : ""}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-primary shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
