import { motion } from "motion/react";
import {
  Search, Filter, LayoutGrid, List as ListIcon, FileText,
  ArrowUpRight, Globe, Clock, AlertCircle, X, Loader2, Archive, Handshake,
  Briefcase, FolderSearch, FileEdit
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchProjects, fetchProjectFinancials, getAuthUser, withFileToken, projectCategories, ApiProject, ProjectFinancials } from "../../lib/api";
import { pdf } from "@react-pdf/renderer";
import PortfolioReportPDF from "./PortfolioReportPDF";
import { effectiveEndDate } from "../../lib/projectSchedule";
import MilestoneTrack from "./MilestoneTrack";
import PdfPreviewModal from "./PdfPreviewModal";
import { useMeta } from "../../hooks/useMeta";
import { statusMeta, statusMatches, PROJECT_STATUSES } from "../../lib/projectStatus";
import { createPortal } from "react-dom";
import { WIP_CURRENT, WIP_OPPORTUNITY } from "../../lib/wip";
import { locationFlag } from "../../lib/countryFlag";
import FinanceStrip from "./FinanceStrip";
import { Fig, FiguresToggle } from "./FiguresPrivacy";
import AggregateBoard from "./AggregateBoard";
import ProjectActionsMenu from "./ProjectActionsMenu";
import { fiveFromFinancials, sumFive } from "../../lib/projectFinance";

// The colour-coded status key IS the filter (client request): "All" first, then one chip per
// status. Legacy values saved before the palette existed fold into their modern equivalent so
// old projects still appear under the right chip.

export default function ProjectList({ mode }: { mode: "my" | "all" | "drafts" }) {
  useMeta({
    title: mode === "my" ? "My Projects" : mode === "drafts" ? "Drafts" : "All Projects",
    description:
      mode === "my"
        ? "Projects you own or are assigned to."
        : mode === "drafts"
        ? "Your private draft projects — visible only to you."
        : "All projects across the platform.",
  });
  const role = getAuthUser()?.role;
  const isGuest = role === "subcontractor";
  const isStaff = role === "admin" || role === "employee";  // who may see project values
  // "All" + every colour-coded status; guests never see drafts.
  const statusOptions = ["All", ...PROJECT_STATUSES.filter((s) => !isGuest || s !== "Draft")];
  const [view, setView] = useState<"grid" | "list">("list");
  const [wsTab, setWsTab] = useState<"projects" | "board">("projects");   // CR-P — My Workspace tabs
  const [search, setSearch] = useState("");
  // Deep-link: /dashboard/all-projects?status=Active pre-selects a status chip (Overview cards).
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status");
  const [statusFilter, setStatusFilter] = useState(initialStatus && PROJECT_STATUSES.includes(initialStatus as never) ? initialStatus : "All");
  const [archivedView, setArchivedView] = useState(false);
  const [jvOnly, setJvOnly] = useState(false);   // CR-P-23 — show only JV (joint-venture) projects
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [financials, setFinancials] = useState<Record<string, ProjectFinancials>>({});
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false); // CR-P-01 — Quick Report popup PDF preview
  /**
   * CR 311 (2026-09-25): Quick Report asks which report first. Internal is the portfolio report, for
   * the stages ticked (Draft and On hold are never in it). WIP is the work-in-progress report for
   * banks and bonding companies: current and completed contracts, future opportunities, or both.
   */
  const INTERNAL_STAGES = ["Proposal", "BidSubmitted", "Active", "Warranty", "Closed", "Lost"];
  const [reportAsk, setReportAsk] = useState(false);
  const [reportType, setReportType] = useState<"internal" | "wip">("internal");
  const [stages, setStages] = useState<string[]>(["Proposal", "BidSubmitted", "Active", "Warranty", "Closed"]);
  const [wipParts, setWipParts] = useState({ current: true, opportunities: true });
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const scope = archivedView ? "archived" : mode === "my" ? "mine" : mode === "drafts" ? "drafts" : "all";
    fetchProjects(scope)
      .then((ps) => {
        setProjects(ps);
        // Load income/expense totals for the portfolio report (best-effort), only for the projects
        // whose figures this person may see. The server applies the same rule.
        const withFigures = ps.filter((p) => p.canSeeFigures !== false).map((p) => p.id);
        if (withFigures.length) {
          fetchProjectFinancials(withFigures).then(setFinancials).catch(() => setFinancials({}));
        }
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, archivedView]);

  const filteredRaw = projects.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      search.trim() === "" ||
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.contractNo || "").toLowerCase().includes(q) ||
      (p.contractYear || "").toLowerCase().includes(q) ||
      projectCategories(p).join(" ").toLowerCase().includes(q) ||
      (p.clientInfo?.name || "").toLowerCase().includes(q) ||
      (p.location || "").toLowerCase().includes(q);
    return matchesSearch && statusMatches(statusFilter, p.status) && (!jvOnly || !!p.jointVenture?.enabled);
  });
  // §O — click a column header to sort the project list.
  type SortKey = "name" | "status" | "progress" | "category" | "client" | "year" | "contractNo" | "deadline";
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  const sortArrow = (key: string) => (sort?.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");
  const sortVal = (p: ApiProject, key: SortKey): string | number =>
    key === "progress" ? (p.progress ?? 0)
    : key === "year" ? (p.contractYear || "")
    : key === "deadline" ? effectiveEndDate(p)
    : key === "client" ? (p.clientInfo?.name || "").toLowerCase()
    : key === "contractNo" ? (p.contractNo || "").toLowerCase()
    : String((p as unknown as Record<string, unknown>)[key] || "").toLowerCase();
  // CR 262 - with no column picked, both lists are newest project first, by creation date.
  const byCreated = (a: ApiProject, b: ApiProject) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  const filtered = sort
    ? [...filteredRaw].sort((a, b) => {
        const av = sortVal(a, sort.key), bv = sortVal(b, sort.key);
        return av < bv ? -sort.dir : av > bv ? sort.dir : 0;
      })
    : [...filteredRaw].sort(byCreated);
  // A deadline that has passed on a project that isn't finished yet.
  const overdue = (p: ApiProject) =>
    !!effectiveEndDate(p) && effectiveEndDate(p) < new Date().toLocaleDateString("en-CA") &&
    !["Closed", "Completed", "Lost"].includes(p.status);

  // Portfolio value totals for All Projects (staff only): all = GT-only + JV.
  const money = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const nval = (s?: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
  const valueTotals = (() => {
    let total = 0, jv = 0;
    for (const p of filtered) {
      const v = nval(p.value);
      total += v;
      if (p.jointVenture?.enabled) jv += v;
    }
    return { total, jv, gt: total - jv };
  })();
  const showValues = mode === "all" && isStaff;
  // CR-P-15 / CR-P-33 — five-number financial overview totalled across the shown projects. Shown on
  // All Projects and My Projects (staff); on My Projects it sums only the user's own projects.
  const showFinance = (mode === "all" || mode === "my") && isStaff;
  // Quick Report — it carries project values and finances, so it covers only the projects whose
  // financial figures this person may see (the server marks each project; GT staff by default,
  // outside logins only where GT has switched the figures on for them). With none, no button.
  const reportProjects = filtered.filter((p) => p.canSeeFigures !== false);
  const internalProjects = reportProjects.filter((p) => stages.some((st) => statusMatches(st, p.status)));
  const stageCount = (st: string) => reportProjects.filter((p) => statusMatches(st, p.status)).length;
  const fiveTotals = sumFive(filtered.map((p) => fiveFromFinancials(financials[p.id])));

  return (
    <div className="space-y-6">
      {/* Header — title/description on the left, report + search + view on the right. */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 mb-2 flex items-center gap-2">
            {mode === "my" ? <Briefcase className="text-primary" /> : mode === "drafts" ? <FileEdit className="text-primary" /> : <FolderSearch className="text-primary" />}
            {mode === "my" ? "My Workspace" : mode === "drafts" ? "My Drafts" : "Global Project Directory"}
          </h1>
          <p className="text-slate-500 font-medium">
            {mode === "drafts"
              ? "Your private drafts — only you can see these until you change the status."
              : `Manage and monitor ${mode === "my" ? "your active" : "all authorized"} engineering projects.`}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap md:justify-end shrink-0">
          {/* CR-P-01 — "Quick Report" opens a popup PDF preview (download/print from there). */}
          {reportProjects.length > 0 && mode !== "drafts" && (
            <button onClick={() => setReportAsk(true)} className="cursor-pointer flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-100 bg-white text-slate-700 hover:text-primary text-xs font-bold shadow-sm">
              <FileText size={13} /> Quick Report
            </button>
          )}
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-hover:text-primary transition-colors" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, number or location..."
              className="bg-white border border-slate-100 rounded-xl py-2.5 pl-10 pr-8 text-xs font-medium focus:ring-4 focus:ring-primary/5 outline-none w-40 sm:w-64 shadow-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors">
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex bg-white border border-slate-100 rounded-xl p-1 shadow-sm">
            <button onClick={() => setView("grid")} title="Grid view" className={`p-1.5 rounded-lg transition-all ${view === "grid" ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-900"}`}>
              <LayoutGrid size={18} />
            </button>
            <button onClick={() => setView("list")} title="List view" className={`p-1.5 rounded-lg transition-all ${view === "list" ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-900"}`}>
              <ListIcon size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* CR-P — My Workspace tabs: My Projects | Project Management (cross-project board). */}
      {mode === "my" && (
        <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-max">
          {([["projects", "My Projects"], ["board", "Project Management"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setWsTab(v)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${wsTab === v ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}>{l}</button>
          ))}
        </div>
      )}

      {mode === "my" && wsTab === "board" ? (
        <AggregateBoard />
      ) : (
      <>
      {/* The financial figures as one block: a header row (title left, the Show / Hide financial
          numbers switch right), then the portfolio value and the five-number overview under it. */}
      {(showValues || showFinance) && !loading && (
      <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Financial overview</p>
        <FiguresToggle variant="inline" />
      </div>
      {/* Portfolio value — All Projects, staff only. Total = GT-only + JV. */}
      {showValues && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-baseline gap-1.5 px-4 py-2 rounded-xl bg-primary/5 border border-primary/10">
            <span className="text-lg font-display font-bold text-primary leading-none"><Fig>{money(valueTotals.total)}</Fig></span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total value of all projects</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 px-4 py-2 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-lg font-display font-bold text-slate-700 leading-none"><Fig>{money(valueTotals.gt)}</Fig></span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">GT projects value</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-100">
            <span className="text-lg font-display font-bold text-indigo-600 leading-none"><Fig>{money(valueTotals.jv)}</Fig></span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">JV projects value</span>
          </span>
        </div>
      )}

      {/* CR-P-15/33 — five-number financial overview across the shown projects (My & All Projects). */}
      {showFinance && <FinanceStrip five={fiveTotals} />}
      </div>
      )}

      {/* Status filters — their own row under the header. The colour key IS the filter. */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">Filter by status</span>
        <div className="flex items-center gap-1 flex-wrap bg-white border border-slate-100 rounded-xl p-1 shadow-sm">
          {statusOptions.map((s) => {
            const on = statusFilter === s;
            const sm = s === "All" ? null : statusMeta(s);
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                title={sm ? `Show only ${sm.label}` : "Show every project"}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  on ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {sm && <span className={`w-2 h-2 rounded-full ${sm.dot}`} />}
                {sm ? sm.label : "All"}
              </button>
            );
          })}
        </div>
        {/* CR-P-23 — JV filter: show only joint-venture projects. */}
        <button
          onClick={() => setJvOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border shadow-sm ${jvOnly ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-slate-400 border-slate-100 hover:text-slate-900"}`}
          title={jvOnly ? "Show all projects" : "Show only Joint Venture projects"}
        >
          <Handshake size={12} /> {jvOnly ? "Viewing JV" : "JV Projects"}
        </button>
        {/* Archived view toggle — staff only; archived projects are hidden from the normal lists. */}
        {isStaff && mode !== "drafts" && (
          <button
            onClick={() => setArchivedView((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border shadow-sm ${archivedView ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-400 border-slate-100 hover:text-slate-900"}`}
            title={archivedView ? "Back to active projects" : "Show archived projects"}
          >
            <Archive size={12} /> {archivedView ? "Viewing archived" : "Archived"}
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-32 text-slate-300">
          <Loader2 size={32} className="animate-spin" />
        </div>
      )}

      {!loading && (
        <>
          {(search || statusFilter !== "All") && (
            <p className="text-xs font-bold text-slate-400">
              Showing {filtered.length} of {projects.length} projects
              {statusFilter !== "All" && ` · Status: ${statusFilter}`}
              {search && ` · Search: "${search}"`}
            </p>
          )}

          {filtered.length === 0 && (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-20 flex flex-col items-center text-slate-300">
              <Filter size={40} className="mb-4" />
              <p className="font-bold text-lg uppercase tracking-widest">No Projects Found</p>
              <p className="text-sm font-medium text-slate-400 mt-2">Try adjusting your search or filter.</p>
              <button
                onClick={() => { setSearch(""); setStatusFilter("All"); }}
                className="mt-6 px-6 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-primary transition-all"
              >
                Clear Filters
              </button>
            </div>
          )}

          {/* List View */}
          {filtered.length > 0 && view === "list" && (
            <div className="bg-white rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-50">
                    <th className="text-left px-4 sm:px-8 py-3 sm:py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><button onClick={() => toggleSort("name")} className="uppercase tracking-widest hover:text-slate-700">Project / Contract{sortArrow("name")}</button></th>
                    <th className="text-left px-4 sm:px-6 py-3 sm:py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><button onClick={() => toggleSort("category")} className="uppercase tracking-widest hover:text-slate-700">Category{sortArrow("category")}</button></th>
                    <th className="text-left px-4 sm:px-6 py-3 sm:py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><button onClick={() => toggleSort("client")} className="uppercase tracking-widest hover:text-slate-700">Client{sortArrow("client")}</button></th>
                    <th className="text-left px-4 sm:px-6 py-3 sm:py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><button onClick={() => toggleSort("year")} className="uppercase tracking-widest hover:text-slate-700">Year{sortArrow("year")}</button></th>
                    <th className="text-left px-4 sm:px-6 py-3 sm:py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><button onClick={() => toggleSort("deadline")} className="uppercase tracking-widest hover:text-slate-700">Deadline{sortArrow("deadline")}</button></th>
                    <th className="text-left px-4 sm:px-6 py-3 sm:py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><button onClick={() => toggleSort("status")} className="uppercase tracking-widest hover:text-slate-700">Status{sortArrow("status")}</button></th>
                    <th className="text-left px-4 sm:px-6 py-3 sm:py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><button onClick={() => toggleSort("progress")} className="uppercase tracking-widest hover:text-slate-700">Progress{sortArrow("progress")}</button></th>
                    <th className="text-right px-4 sm:px-8 py-3 sm:py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((p) => {
                    const sm = statusMeta(p.status);
                    return (
                    <tr key={p.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 sm:px-8 py-4 sm:py-6">
                        <div className="flex items-center gap-4">
                          <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${sm.dot}`} title={sm.label} />
                          <div className="flex flex-col min-w-0">
                            <button onClick={() => navigate(`/dashboard/projects/${p.id}`)} className="text-left font-bold text-slate-900 group-hover:text-primary hover:text-primary hover:underline transition-colors truncate cursor-pointer" title="Open project">{p.name}</button>
                            {/* Both numbers: our internal project number and the client's contract number. */}
                            <span className="text-[10px] text-slate-400 font-medium">
                              No {p.id}{p.contractNo ? ` · Contract ${p.contractNo}` : ""} · Lead: {p.owner}
                            </span>
                            {p.location && <span className="text-[10px] text-slate-500 font-bold">{locationFlag(p.location) && <span className="text-[1.3em] leading-none align-middle mr-0.5">{locationFlag(p.location)}</span>}{p.location}</span>}
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {/* CR-P-23 — flag JV projects on the table. */}
                              {p.jointVenture?.enabled && <span className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[9px] font-bold w-fit" title={p.jointVenture.partnerName ? `Joint Venture with ${p.jointVenture.partnerName}` : "Joint Venture project"}><Handshake size={10} /> JV{p.jointVenture.partnerName ? ` · ${p.jointVenture.partnerName}` : ""}</span>}
                              {p.published && <span className="mt-0.5 inline-flex items-center gap-1 text-[9px] font-bold text-indigo-500 w-fit"><Globe size={10} /> Live on Site</span>}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 sm:py-6 text-xs font-bold text-slate-600">{projectCategories(p).join(", ") || "—"}</td>
                      <td className="px-4 sm:px-6 py-4 sm:py-6 text-xs font-medium text-slate-600">{p.clientInfo?.name || "—"}</td>
                      <td className="px-4 sm:px-6 py-4 sm:py-6 text-xs font-bold text-slate-500">{p.contractYear || "—"}</td>
                      <td className="px-4 sm:px-6 py-4 sm:py-6 text-xs font-bold whitespace-nowrap">
                        {p.endDate
                          ? <span className={overdue(p) ? "text-red-600" : "text-slate-500"} title={effectiveEndDate(p) !== p.endDate ? `Extended; original end date ${p.endDate}` : undefined}>{effectiveEndDate(p)}{overdue(p) ? " ⚠" : ""}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 sm:px-6 py-4 sm:py-6">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${sm.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} /> {sm.label}
                        </span>
                      </td>
                      {/* CR-P (120)-(125) — the milestones, not only the percentage. */}
                      <td className="px-4 sm:px-6 py-4 sm:py-6"><MilestoneTrack project={p} compact /></td>
                      <td className="px-4 sm:px-8 py-4 sm:py-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => navigate(`/dashboard/projects/${p.id}`)}
                            className="py-2 px-4 rounded-xl bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-primary transition-all"
                          >
                            Manage
                          </button>
                          <ProjectActionsMenu project={p} canManage={isStaff} archivedView={archivedView} onMutate={setProjects} />
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Grid View */}
          {filtered.length > 0 && view === "grid" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filtered.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="relative bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm hover:shadow-xl transition-all group"
                >
                  {/* CR-P-25 — the project's identity picture as a cover on the grid card. The menu
                      sits on the CARD (not inside the image) so its dropdown isn't clipped. */}
                  {p.image ? (
                    <>
                      <div className="-mx-8 -mt-8 mb-6 h-44 overflow-hidden rounded-t-[2.5rem] bg-slate-100">
                        <img src={withFileToken(p.image)} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                      <ProjectActionsMenu project={p} canManage={isStaff} archivedView={archivedView} onMutate={setProjects} variant="overlay" />
                    </>
                  ) : (
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300">
                        <Clock size={28} />
                      </div>
                      <ProjectActionsMenu project={p} canManage={isStaff} archivedView={archivedView} onMutate={setProjects} />
                    </div>
                  )}
                  <button onClick={() => navigate(`/dashboard/projects/${p.id}`)} className="text-left w-full cursor-pointer" title="Open project">
                    <h3 className="text-xl font-display font-bold text-slate-900 mb-1 group-hover:text-primary hover:text-primary hover:underline transition-colors line-clamp-1">{p.name}</h3>
                  </button>
                  {/* Both numbers, same as the list view. */}
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">
                    No {p.id}{p.contractNo ? ` · Contract ${p.contractNo}` : ""}
                  </p>
                  <div className="mb-3 flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${statusMeta(p.status).badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusMeta(p.status).dot}`} /> {statusMeta(p.status).label}
                    </span>
                    {/* CR-P-23 — JV badge. */}
                    {p.jointVenture?.enabled && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold border border-indigo-100" title={p.jointVenture.partnerName ? `Joint Venture with ${p.jointVenture.partnerName}` : "Joint Venture project"}><Handshake size={11} /> JV</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 font-medium mb-5">
                    {projectCategories(p).length > 0 && <span><span className="text-slate-400">Category:</span> <span className="font-bold text-slate-700">{projectCategories(p).join(", ")}</span></span>}
                    {p.clientInfo?.name && <span><span className="text-slate-400">Client:</span> <span className="font-bold text-slate-700">{p.clientInfo.name}</span></span>}
                    {p.contractYear && <span><span className="text-slate-400">Year:</span> <span className="font-bold text-slate-700">{p.contractYear}</span></span>}
                    {p.endDate && <span title={effectiveEndDate(p) !== p.endDate ? `Extended; original end date ${p.endDate}` : undefined}><span className="text-slate-400">Deadline:</span> <span className={`font-bold ${overdue(p) ? "text-red-600" : "text-slate-700"}`}>{effectiveEndDate(p)}{overdue(p) ? " ⚠" : ""}</span></span>}
                  </div>

                  <div className="mb-6"><MilestoneTrack project={p} /></div>

                  <div className="space-y-3 pt-5 border-t border-slate-50">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400 font-medium">Lead</span>
                      <span className="text-slate-900 font-bold">{p.owner}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400 font-medium">Location</span>
                      <span className="font-bold text-slate-700 truncate max-w-[10rem]">{locationFlag(p.location) && <span className="mr-1 text-[1.3em] leading-none align-middle">{locationFlag(p.location)}</span>}{p.location || "—"}</span>
                    </div>
                  </div>

                  <div className="mt-8">
                    <button
                      onClick={() => navigate(`/dashboard/projects/${p.id}`)}
                      className="w-full bg-slate-50 group-hover:bg-gt-gradient group-hover:text-white py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                    >
                      Open Project Workspace <ArrowUpRight size={14} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
      </>
      )}

      {/* CR 311 - which report, and what goes in it. */}
      {reportAsk && createPortal(
        <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setReportAsk(false); }}>
          <div className="my-16 w-full max-w-lg rounded-3xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileText size={15} className="text-primary" /> Quick Report</p>
              <p className="text-[11px] text-slate-500">{reportProjects.length} project{reportProjects.length === 1 ? "" : "s"} in the list you are looking at.</p>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-2">
                {([["internal", "Internal", "The portfolio report, for the team"], ["wip", "Work in progress (WIP)", "For banks, sureties and bonding companies"]] as const).map(([k, t, h]) => (
                  <button key={k} type="button" onClick={() => setReportType(k)}
                    className={`rounded-2xl border p-3 text-left transition-colors ${reportType === k ? "border-primary bg-emerald-50/60 ring-2 ring-primary/20" : "border-slate-200 hover:border-slate-300"}`}>
                    <span className="block text-sm font-bold text-slate-900">{t}</span>
                    <span className="block text-[11px] text-slate-500">{h}</span>
                  </button>
                ))}
              </div>
              {reportType === "internal" ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Stages to include</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {INTERNAL_STAGES.map((st) => (
                      <label key={st} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <input type="checkbox" className="accent-emerald-500" checked={stages.includes(st)} onChange={(e) => setStages((cur) => (e.target.checked ? [...cur, st] : cur.filter((x) => x !== st)))} />
                        <span className="flex-1">{statusMeta(st).label}</span>
                        <span className="text-[10px] text-slate-400">{stageCount(st)}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400">Drafts and projects on hold are never in the report.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tables to include</p>
                  {([["current", "Current and completed contracts", WIP_CURRENT], ["opportunities", "Future opportunities (proposals out)", WIP_OPPORTUNITY]] as const).map(([k, t, list]) => (
                    <label key={k} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <input type="checkbox" className="accent-emerald-500" checked={wipParts[k]} onChange={(e) => setWipParts((cur) => ({ ...cur, [k]: e.target.checked }))} />
                      <span className="flex-1">{t}</span>
                      <span className="text-[10px] text-slate-400">{reportProjects.filter((p) => list.some((st) => statusMatches(st, p.status))).length}</span>
                    </label>
                  ))}
                  <p className="text-[10px] text-slate-400">A large landscape table (11 x 17 in), one line per contract, to copy into each bank&apos;s own form. Profit, change orders, cost to complete, funded value and chance of winning come from each project&apos;s bank report figures.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button type="button" onClick={() => setReportAsk(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button"
                disabled={reportType === "internal" ? !internalProjects.length : !wipParts.current && !wipParts.opportunities}
                onClick={() => { setReportAsk(false); setShowReport(true); }}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-40">
                {reportType === "internal" && !internalProjects.length ? "No projects in those stages" : "Create report"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* CR-P-01 — Quick Report: popup PDF preview with download/print. */}
      {showReport && reportType === "wip" && (
        <PdfPreviewModal
          title={`Work in progress report · ${mode === "my" ? "My Projects" : "All Projects"}`}
          fileName={`GreenTech_WIP_Report_${new Date().toISOString().slice(0, 10)}.pdf`}
          build={async () => {
            const { buildWipReportPdf } = await import("../../lib/wipReportPdf");
            return buildWipReportPdf({ projects: reportProjects, financials, current: wipParts.current, opportunities: wipParts.opportunities, scope: mode === "my" ? "my projects" : "all projects" });
          }}
          onClose={() => setShowReport(false)}
        />
      )}
      {showReport && reportType === "internal" && (
        <PdfPreviewModal
          title={mode === "my" ? "Quick Report · My Projects" : "Quick Report · All Projects"}
          fileName={`Portfolio_${mode === "my" ? "MyProjects" : "AllProjects"}_Report.pdf`}
          build={() => pdf(
            <PortfolioReportPDF
              projects={internalProjects}
              financials={financials}
              logoUrl={`${window.location.origin}/gt-logo-horizontal.png`}
              scope={mode === "my" ? "My Projects" : "All Projects"}
            />
          ).toBlob()}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
