import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Briefcase, Clock, CheckCircle2, Globe, FileEdit,
  ArrowUpRight, Loader2
} from "lucide-react";
import { fetchProjects, getAuthUser, ApiProject } from "../../lib/api";
import { statusMeta, statusMatches } from "../../lib/projectStatus";
import { useMeta } from "../../hooks/useMeta";

export default function DashboardOverview() {
  useMeta({ title: "Dashboard Overview", description: "Your project dashboard — track ongoing work, completed projects, and drafts." });
  const navigate = useNavigate();
  const [mine, setMine] = useState<ApiProject[]>([]);
  const [all, setAll] = useState<ApiProject[]>([]);
  const [drafts, setDrafts] = useState<ApiProject[]>([]);
  const [loading, setLoading] = useState(true);
  const user = getAuthUser();
  const firstName = (user?.name || "there").split(" ")[0];

  useEffect(() => {
    Promise.all([fetchProjects("mine"), fetchProjects("all"), fetchProjects("drafts")])
      .then(([m, a, d]) => {
        setMine(m);
        setAll(a);
        setDrafts(d);
      })
      .finally(() => setLoading(false));
  }, []);

  const ongoing  = all.filter((p) => statusMatches("Active", p.status)).length;
  const completed = all.filter((p) => statusMatches("Closed", p.status)).length;
  const live     = all.filter((p) => p.published).length;

  const stats = [
    { label: "My Projects",  value: String(mine.length),   icon: Briefcase,    color: "bg-blue-50 text-blue-600",    trend: "Owned or assigned", to: "/dashboard/my-projects" },
    { label: "Ongoing",      value: String(ongoing),       icon: Clock,        color: "bg-amber-50 text-amber-600",  trend: "Active across all",  to: "/dashboard/all-projects" },
    { label: "Completed",    value: String(completed),     icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600", trend: "Total history",   to: "/dashboard/all-projects" },
    { label: "Live on Site", value: String(live),          icon: Globe,        color: "bg-indigo-50 text-indigo-600", trend: "Publicly visible", to: "/dashboard/all-projects" },
    { label: "Drafts",       value: String(drafts.length), icon: FileEdit,     color: "bg-violet-50 text-violet-600", trend: "Private to you",     to: "/dashboard/drafts" },
  ];

  // A deadline that has passed on a project that isn't finished yet (same rule as the project tables).
  const overdue = (p: ApiProject) =>
    !!p.endDate && p.endDate < new Date().toLocaleDateString("en-CA") &&
    !["Closed", "Completed", "Lost"].includes(p.status);

  // Recent = latest projects across all
  const recent = all.slice(0, 5);

  return (
    <div className="space-y-10">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900 mb-2">Welcome back, {firstName}!</h1>
        <p className="text-slate-500 font-medium">Here&apos;s what&apos;s happening with your projects today.</p>
      </div>

      {/* Stats Grid — compact KPI cards (icon + value on one row, trend below) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => navigate(stat.to)}
            className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg hover:border-white transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${stat.color} flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0`}>
                <stat.icon size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-display font-bold text-slate-900 leading-none">
                  {loading ? <Loader2 size={18} className="animate-spin text-slate-300" /> : stat.value}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate mt-1">{stat.label}</p>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 italic truncate">{stat.trend}</span>
              <ArrowUpRight size={14} className="text-slate-300 flex-shrink-0 group-hover:text-primary transition-colors" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Recent Projects */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-4">
          <h2 className="text-xl font-display font-bold text-slate-900">Recent Projects</h2>
          <button onClick={() => navigate("/dashboard/all-projects")} className="text-sm font-bold text-primary hover:underline">
            View all projects
          </button>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-300">
              <Loader2 size={28} className="animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-50">
                    <th className="text-left px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project / Contract</th>
                    <th className="text-left px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category</th>
                    <th className="text-left px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client</th>
                    <th className="text-left px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Year</th>
                    <th className="text-left px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Deadline</th>
                    <th className="text-left px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="text-right px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recent.map((project) => {
                    const sm = statusMeta(project.status);
                    return (
                    <tr
                      key={project.id}
                      onClick={() => navigate(`/dashboard/projects/${project.id}`)}
                      className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                    >
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className={`w-1.5 h-9 rounded-full flex-shrink-0 ${sm.dot}`} title={sm.label} />
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-slate-900 group-hover:text-primary transition-colors truncate">{project.name}</span>
                            {/* Internal project number + the client's contract number. */}
                            <span className="text-[10px] text-slate-400 font-medium">
                              No {project.id}{project.contractNo ? ` · Contract ${project.contractNo}` : ""}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-xs font-bold text-slate-600">{project.category || "—"}</td>
                      <td className="px-6 py-5 text-xs font-medium text-slate-600">{project.clientInfo?.name || "—"}</td>
                      <td className="px-6 py-5 text-xs font-bold text-slate-500">{project.contractYear || "—"}</td>
                      <td className="px-6 py-5 text-xs font-bold whitespace-nowrap">
                        {project.endDate
                          ? <span className={overdue(project) ? "text-red-600" : "text-slate-500"}>{project.endDate}{overdue(project) ? " ⚠" : ""}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${sm.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} /> {sm.label}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button className="p-2 rounded-lg hover:bg-white hover:shadow-sm text-slate-400 hover:text-primary transition-all">
                          <ArrowUpRight size={18} />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
