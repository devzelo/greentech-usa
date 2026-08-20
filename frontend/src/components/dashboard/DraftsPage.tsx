import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileEdit, Handshake, ClipboardList, Package, Loader2, Search, X, FolderOpen, ChevronRight } from "lucide-react";
import { fetchDrafts, type ApiDraft } from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";

// CR-P-18b — the Drafts page: everything saved as a draft INSIDE my projects (agreements,
// submittals, RFQs) as a sortable, filterable table. Draft PROJECTS live under the "Draft" status
// on My Projects / All Projects, so they're intentionally not here.
const KIND_META: Record<string, { label: string; icon: typeof Handshake; cls: string }> = {
  agreement: { label: "Agreement", icon: Handshake, cls: "bg-indigo-50 text-indigo-600" },
  submittal: { label: "Submittal", icon: ClipboardList, cls: "bg-amber-50 text-amber-600" },
  rfq: { label: "RFQ", icon: Package, cls: "bg-emerald-50 text-emerald-600" },
};
const metaFor = (k: string) => KIND_META[k] || { label: k, icon: FileEdit, cls: "bg-slate-100 text-slate-500" };
const timeAgo = (iso?: string) => {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};

type SortKey = "type" | "title" | "project" | "updated";

export default function DraftsPage() {
  useMeta({ title: "Drafts", description: "Unfinished drafts across your projects — agreements, submittals and RFQs." });
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<ApiDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindF, setKindF] = useState<"all" | string>("all");
  const [projectF, setProjectF] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "updated", dir: -1 });

  useEffect(() => {
    fetchDrafts("mine").then((d) => setDrafts(d.filter((x) => x.kind !== "project"))).catch(() => setDrafts([])).finally(() => setLoading(false));
  }, []);

  const kinds = useMemo(() => Array.from(new Set(drafts.map((d) => d.kind))), [drafts]);
  const projects = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of drafts) if (d.projectId) m.set(d.projectId, d.projectName || d.projectId);
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [drafts]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: 1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = drafts.filter((d) =>
      (kindF === "all" || d.kind === kindF) &&
      (projectF === "all" || d.projectId === projectF) &&
      (!q || d.title.toLowerCase().includes(q) || (d.projectName || "").toLowerCase().includes(q)),
    );
    const val = (d: ApiDraft): string => sort.key === "type" ? metaFor(d.kind).label
      : sort.key === "title" ? d.title.toLowerCase()
      : sort.key === "project" ? (d.projectName || "").toLowerCase()
      : String(d.updatedAt || "");
    rows = [...rows].sort((a, b) => { const av = val(a), bv = val(b); return av < bv ? -sort.dir : av > bv ? sort.dir : 0; });
    return rows;
  }, [drafts, kindF, projectF, search, sort]);

  const filtersActive = kindF !== "all" || projectF !== "all" || !!search.trim();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary mb-2"><FileEdit size={18} /><span className="text-xs font-bold uppercase tracking-widest">Drafts</span></div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">Drafts</h1>
          <p className="text-sm text-slate-500 mt-1">{loading ? "Loading…" : `${drafts.length} unfinished draft${drafts.length === 1 ? "" : "s"} across your projects. Draft projects are under the Draft status on My Projects.`}</p>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search drafts…" className="bg-white border border-slate-100 rounded-xl py-2.5 pl-10 pr-8 text-xs font-medium outline-none focus:ring-4 focus:ring-primary/5 w-56 shadow-sm" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X size={13} /></button>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">Type</span>
        <div className="flex items-center gap-1 bg-white border border-slate-100 rounded-xl p-1 shadow-sm">
          {["all", ...kinds].map((k) => (
            <button key={k} onClick={() => setKindF(k)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${kindF === k ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}>{k === "all" ? "All" : metaFor(k).label}</button>
          ))}
        </div>
        {projects.length > 0 && (
          <select value={projectF} onChange={(e) => setProjectF(e.target.value)} className="bg-white border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 outline-none shadow-sm">
            <option value="all">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {filtersActive && <button onClick={() => { setKindF("all"); setProjectF("all"); setSearch(""); }} className="text-[10px] font-bold text-slate-400 hover:text-slate-700 px-1">Clear</button>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-300"><Loader2 size={28} className="animate-spin" /></div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 bg-white rounded-[2rem] border border-slate-100">
          <FileEdit size={38} className="mb-3" />
          <p className="font-bold text-sm">{drafts.length === 0 ? "No drafts — you're all caught up." : "No drafts match."}</p>
          <p className="text-xs mt-1">Agreements, submittals and RFQs saved as drafts show here to finish later.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-50">
                  {([["type", "Type"], ["title", "Title"], ["project", "Project"], ["updated", "Last updated"]] as [SortKey, string][]).map(([k, label]) => (
                    <th key={k} className="text-left px-6 py-4"><button onClick={() => toggleSort(k)} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-700">{label}{arrow(k)}</button></th>
                  ))}
                  <th className="text-right px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {shown.map((d) => {
                  const m = metaFor(d.kind);
                  return (
                    <tr key={`${d.kind}-${d.id}`} onClick={() => navigate(d.link)} className="group hover:bg-slate-50/50 transition-colors cursor-pointer">
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${m.cls}`}><m.icon size={12} /> {m.label}</span>
                      </td>
                      <td className="px-6 py-4"><span className="text-sm font-bold text-slate-800 group-hover:text-primary transition-colors">{d.title}</span></td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-600">{d.projectName || "—"}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500 whitespace-nowrap">{timeAgo(d.updatedAt)}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 group-hover:text-primary"><FolderOpen size={13} /> Finish <ChevronRight size={13} /></span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
