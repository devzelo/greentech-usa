import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Briefcase, FileText, Users, Building2, Loader2, Eye, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchProjects, fetchAllDocuments, fetchEmployees, fetchCompanies, fetchUsers, documentUrl, getAuthUser, ApiProject, ApiGlobalDocument, ApiEmployee, type ApiCompany, type AdminUser, COMPANY_CATEGORIES, companyCategories } from "../../lib/api";
import DocumentViewer from "./DocumentViewer";

type Group = "Projects" | "Documents" | "Employees" | "Subcontractors" | "Directory" | "Users";
const catLabel = (c: string) => COMPANY_CATEGORIES.find((x) => x.v === c)?.label || c;
interface Hit {
  group: Group;
  label: string;
  sub?: string;
  to: string;
  icon: typeof Search;
  projectId?: string;
  year?: string;
  doc?: ApiGlobalDocument;   // set on Documents hits so they can be previewed in-app
}

const GROUPS: ("All" | Group)[] = ["All", "Projects", "Documents", "Directory", "Users", "Employees", "Subcontractors"];
const yearsOf = (...vals: (string | undefined)[]) => {
  const set = new Set<string>();
  for (const v of vals) { const m = String(v || "").match(/\b(20\d{2})\b/g); m?.forEach((y) => set.add(y)); }
  return set;
};

export default function GlobalSearch() {
  const navigate = useNavigate();
  const isAdmin = getAuthUser()?.role === "admin";
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [docs, setDocs] = useState<ApiGlobalDocument[]>([]);
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [typeF, setTypeF] = useState<"All" | Group>("All");
  const [projectF, setProjectF] = useState("All");
  const [yearF, setYearF] = useState("All");
  // In-app document preview opened straight from a search result.
  const [preview, setPreview] = useState<{ name: string; url: string; fileType: string } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const ensureLoaded = async () => {
    if (loaded) return;
    setLoading(true);
    // Each source is fetched independently: the Directory and Users lists are permissioned, so a
    // non-admin's 403 there must not wipe out projects/docs/employees.
    const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => { try { return await fn(); } catch { return fallback; } };
    try {
      const [p, d, e, c, u] = await Promise.all([
        safe(() => fetchProjects("all"), [] as ApiProject[]),
        safe(() => fetchAllDocuments(), [] as ApiGlobalDocument[]),
        safe(() => fetchEmployees(), [] as ApiEmployee[]),
        safe(() => fetchCompanies(), [] as ApiCompany[]),
        safe(() => fetchUsers(), [] as AdminUser[]),
      ]);
      setProjects(p); setDocs(d); setEmployees(e); setCompanies(c); setUsers(u);
      setLoaded(true);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const projectOptions = useMemo(() => projects.map((p) => ({ id: p.id, name: p.name })), [projects]);
  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => yearsOf(p.startDate, p.endDate).forEach((y) => set.add(y)));
    docs.forEach((d) => { const y = new Date(d.uploadedAt).getFullYear(); if (!isNaN(y)) set.add(String(y)); });
    return Array.from(set).sort().reverse();
  }, [projects, docs]);

  const results: Hit[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const hits: Hit[] = [];
    const projYears = new Map<string, Set<string>>();
    projects.forEach((p) => projYears.set(p.id, yearsOf(p.startDate, p.endDate)));

    for (const p of projects) {
      if (p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle) || (p.location || "").toLowerCase().includes(needle)) {
        hits.push({ group: "Projects", label: p.name, sub: `${p.id} · ${p.location || "—"}`, to: `/dashboard/projects/${p.id}`, icon: Briefcase, projectId: p.id });
      }
      for (const s of p.subcontractors || []) {
        if (s.name && s.name.toLowerCase().includes(needle)) {
          hits.push({ group: "Subcontractors", label: s.name, sub: `${s.scope || "—"} · ${p.name}`, to: `/dashboard/projects/${p.id}?tab=subs`, icon: Building2, projectId: p.id });
        }
      }
    }
    for (const d of docs) {
      // CR 292 - the description counts too: "SAM.gov registration, current" finds the file even
      // when the name is spelled differently.
      const hay = `${d.name} ${d.projectName} ${d.description || ""}`.toLowerCase();
      if (hay.includes(needle)) {
        const y = new Date(d.uploadedAt).getFullYear();
        const company = d.scope === "company";
        hits.push({
          group: "Documents",
          label: d.name,
          sub: company ? `Company Documents · ${d.tabLabel || ""}`.trim() : d.projectName,
          to: company ? `/dashboard/documents?tab=company&focus=${d._id}&ctab=${d.tabId || ""}` : `/dashboard/documents?focus=${d._id}`,
          icon: FileText,
          projectId: d.projectId,
          year: isNaN(y) ? undefined : String(y),
          doc: d,
        });
      }
    }
    for (const e of employees) {
      if (e.name.toLowerCase().includes(needle) || e.empId.toLowerCase().includes(needle)) {
        // Open the employee's own profile (admins only — that page is admin-gated); otherwise fall
        // back to their projects overview.
        const to = isAdmin && e.id ? `/dashboard/users?open=${e.id}` : `/dashboard/all-projects`;
        hits.push({ group: "Employees", label: e.name, sub: e.empId, to, icon: Users });
      }
    }
    // Directory companies — subcontractors, consultants, vendors, partners, clients, etc.
    // Matchable by name, email, phone, the category label, or a contact person.
    for (const c of companies) {
      const cats = companyCategories(c).map(catLabel);
      const contactMatch = (c.contactPersons || []).some((p) => `${p.name} ${p.email}`.toLowerCase().includes(needle));
      if (c.name.toLowerCase().includes(needle) || (c.email || "").toLowerCase().includes(needle) || (c.phone || "").toLowerCase().includes(needle) || cats.some((l) => l.toLowerCase().includes(needle)) || contactMatch) {
        hits.push({ group: "Directory", label: c.name, sub: `${cats.join(", ")}${c.email ? ` · ${c.email}` : ""}`, to: `/dashboard/directory?open=${c._id}`, icon: Building2 });
      }
    }
    // Platform users (login accounts) — by name, email, employee ID or role.
    for (const u of users) {
      if (u.name.toLowerCase().includes(needle) || (u.email || "").toLowerCase().includes(needle) || (u.empId || "").toLowerCase().includes(needle) || (u.role || "").toLowerCase().includes(needle)) {
        hits.push({ group: "Users", label: u.name || u.email, sub: `${u.role}${u.empId ? ` · ${u.empId}` : ""}`, to: `/dashboard/users?open=${u._id}`, icon: Users });
      }
    }

    // Apply filters. Directory/Users/Employees are not project- or year-scoped, so any project or
    // year filter hides them.
    return hits.filter((h) => {
      if (typeF !== "All" && h.group !== typeF) return false;
      const nonProject = h.group === "Employees" || h.group === "Directory" || h.group === "Users";
      if (projectF !== "All") {
        if (nonProject || h.projectId !== projectF) return false;
      }
      if (yearF !== "All") {
        if (h.group === "Documents") { if (h.year !== yearF) return false; }
        else if (nonProject) return false;
        else if (h.projectId) { if (!projYears.get(h.projectId)?.has(yearF)) return false; }
      }
      return true;
    }).slice(0, 60);
  }, [q, projects, docs, employees, companies, users, typeF, projectF, yearF, isAdmin]);

  const grouped = useMemo(() => {
    const map = new Map<Group, Hit[]>();
    for (const h of results) { if (!map.has(h.group)) map.set(h.group, []); map.get(h.group)!.push(h); }
    return Array.from(map.entries());
  }, [results]);

  const filtersActive = typeF !== "All" || projectF !== "All" || yearF !== "All";

  return (
    <div ref={wrapperRef} className="relative hidden md:flex">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-primary transition-colors" size={16} />
      <input
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); ensureLoaded(); }}
        placeholder="Search projects, docs, directory, people…"
        className="bg-slate-50 border border-slate-100 rounded-full py-2 pl-10 pr-4 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none w-28 sm:w-48 lg:w-80 transition-all"
      />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 max-h-[520px] overflow-y-auto z-50 w-[26rem]">
          {/* Filters */}
          <div className="p-3 border-b border-slate-100 space-y-2 sticky top-0 bg-white z-10">
            <div className="flex flex-wrap gap-1">
              {GROUPS.map((g) => (
                <button key={g} onClick={() => setTypeF(g)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${typeF === g ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{g}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <select value={projectF} onChange={(e) => setProjectF(e.target.value)} className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-[11px] font-medium outline-none">
                <option value="All">All projects</option>
                {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={yearF} onChange={(e) => setYearF(e.target.value)} className="w-28 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-[11px] font-medium outline-none">
                <option value="All">All years</option>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              {filtersActive && <button onClick={() => { setTypeF("All"); setProjectF("All"); setYearF("All"); }} className="text-[10px] font-bold text-slate-400 hover:text-slate-700 px-1">Clear</button>}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-300"><Loader2 size={18} className="animate-spin" /></div>
          ) : !q.trim() ? (
            <div className="py-8 px-6 text-center text-xs text-slate-400 font-medium">Type to search{filtersActive ? " (filters applied)" : ""}…</div>
          ) : grouped.length === 0 ? (
            <div className="py-8 px-6 text-center text-xs text-slate-400 font-medium">No results for "{q}".</div>
          ) : (
            grouped.map(([group, hits]) => (
              <div key={group} className="py-2">
                <p className="px-4 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{group} ({hits.length})</p>
                {hits.map((h, i) => {
                  const Icon = h.icon;
                  const goTo = () => { navigate(h.to); setOpen(false); setQ(""); };
                  // Documents get two actions: preview in-app (right there) or jump to the file's
                  // location in the Documents module. Everything else is a single navigate.
                  if (h.doc) {
                    const openPreview = () => { setPreview({ name: h.doc!.name, url: h.doc!.url || documentUrl(h.doc!), fileType: h.doc!.fileType || h.doc!.name.split(".").pop() || "" }); setOpen(false); };
                    return (
                      <div key={`${group}-${i}`} className="w-full flex items-center gap-2 px-2 pr-3 py-1 hover:bg-slate-50 transition-colors group/row">
                        <button onClick={openPreview} className="min-w-0 flex-grow flex items-center gap-3 px-2 py-1.5 text-left" title="Preview here">
                          <span className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-primary flex-shrink-0"><Icon size={14} /></span>
                          <span className="min-w-0 flex-grow">
                            <span className="block text-xs font-bold text-slate-900 truncate">{h.label}</span>
                            {h.sub && <span className="block text-[10px] text-slate-400 truncate">{h.sub}</span>}
                          </span>
                        </button>
                        <button onClick={openPreview} title="Preview here" className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-white flex-shrink-0"><Eye size={15} /></button>
                        <button onClick={goTo} title="Open file location" className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-white flex-shrink-0"><ArrowUpRight size={15} /></button>
                      </div>
                    );
                  }
                  return (
                    <button key={`${group}-${i}`} onClick={goTo} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors">
                      <span className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-primary flex-shrink-0"><Icon size={14} /></span>
                      <span className="min-w-0 flex-grow">
                        <span className="block text-xs font-bold text-slate-900 truncate">{h.label}</span>
                        {h.sub && <span className="block text-[10px] text-slate-400 truncate">{h.sub}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}

      {/* In-app preview of a document opened from a search result. */}
      {preview && <DocumentViewer doc={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
