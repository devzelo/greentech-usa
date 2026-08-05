import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  Search, Download, Eye, FileText, FileImage, FileCode, FileSpreadsheet,
  File, Loader2, List as ListIcon, LayoutGrid,
  Building2, FolderOpen, Lock, ShieldAlert, ChevronsUpDown, ArrowUp, ArrowDown,
  Folder, ChevronRight, Home,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchAllDocuments, updateDocumentDescription, fetchFolderNotes, setFolderNote, documentUrl, getAuthUser, ApiGlobalDocument } from "../../lib/api";
import { sectionToPath } from "../../lib/docTree";
import DocumentViewer from "./DocumentViewer";
import ShareMenu from "./ShareMenu";
import CompanyDocs from "./CompanyDocs";
import ClassifiedDocs from "./ClassifiedDocs";
import { useMeta } from "../../hooks/useMeta";

// Two views only (client spec): LIST (same style as My Projects / All Projects) and COLUMN/grid.
// The search + type filters apply to both, at every level (folders and files).
type ViewMode = "list" | "grid";

const TYPE_OPTIONS = ["All Types", "pdf", "docx", "xlsx", "image", "other"];

function classifyForFilter(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "pdf") return "pdf";
  if (e === "docx" || e === "doc") return "docx";
  if (e === "xlsx" || e === "xls" || e === "csv") return "xlsx";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(e)) return "image";
  return "other";
}

function iconFor(ext: string) {
  const cat = classifyForFilter(ext);
  if (cat === "image") return <FileImage size={20} />;
  if (cat === "pdf") return <FileText size={20} />;
  if (cat === "docx") return <FileText size={20} />;
  if (cat === "xlsx") return <FileSpreadsheet size={20} />;
  if (["dwg", "cad"].includes(ext.toLowerCase())) return <FileCode size={20} />;
  return <File size={20} />;
}

function colorFor(ext: string) {
  const cat = classifyForFilter(ext);
  if (cat === "pdf") return "bg-red-50 text-red-500";
  if (cat === "docx") return "bg-blue-50 text-blue-500";
  if (cat === "xlsx") return "bg-emerald-50 text-emerald-500";
  if (cat === "image") return "bg-amber-50 text-amber-500";
  return "bg-slate-100 text-slate-500";
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function sectionLabel(section: string) {
  const p = sectionToPath(section);
  return [p.tab, p.subtab, p.section].filter(Boolean).join(" › ");
}
// A stable key for a leaf group within a tab (subtab + section).
function groupKey(section: string) {
  const p = sectionToPath(section);
  return `${p.subtab || ""}|||${p.section}`;
}
function groupLabel(section: string) {
  const p = sectionToPath(section);
  return p.subtab ? `${p.subtab} › ${p.section}` : p.section;
}

// ── Company documents (fixed, admin-managed) ────────────────────────────────
const COMPANY_DETAILS: { label: string; value: string }[] = [
  { label: "Legal Name", value: "GreenTech USA" },
  { label: "Headquarters", value: "Chantilly, Virginia, USA" },
  { label: "Established", value: "2020" },
  { label: "UEI", value: "FYR1QQSL3SM7" },
  { label: "CAGE / NCAGE", value: "8ZJ10" },
  { label: "Email", value: "info@gt-usa.com" },
  { label: "Phone", value: "+1-125-258-3525" },
  { label: "Website", value: "www.gt-usa.com" },
];

export default function Documents() {
  useMeta({ title: "Documents", description: "Browse project files and official company documents." });
  const isGuest = getAuthUser()?.role === "subcontractor";
  const isAdmin = getAuthUser()?.role === "admin";
  const [tab, setTab] = useState<"projects" | "company" | "classified">("projects");
  const navigate = useNavigate();
  const [docs, setDocs] = useState<ApiGlobalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [view, setView] = useState<ViewMode>("list");
  const [selected, setSelected] = useState<ApiGlobalDocument | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // Folder-drill navigation: pick a project → tab → section group. Null = top level.
  const [browse, setBrowse] = useState<{ pid?: string; tabId?: string; group?: string }>({});
  const [searchParams, setSearchParams] = useSearchParams();

  // Per-file description — editable inline, saved on blur. Guests never edit (read-only view).
  const canEditDocs = getAuthUser()?.role !== "subcontractor";
  const saveDescription = (d: ApiGlobalDocument, description: string) => {
    if ((d.description || "") === description) return;
    setDocs((prev) => prev.map((x) => (x._id === d._id ? { ...x, description } : x)));
    updateDocumentDescription(d.projectId, d._id, description).catch(() => {});
  };

  // Per-folder description (virtual folders: project / tab / section-group), keyed by
  // `${projectId}::${folderKey}`. Same inline-edit-on-blur behaviour as files.
  const [folderNotes, setFolderNotes] = useState<Record<string, string>>({});
  const folderNoteKey = (projectId: string, folderKey: string) => `${projectId}::${folderKey}`;
  const saveFolderNote = (projectId: string, folderKey: string, description: string) => {
    const k = folderNoteKey(projectId, folderKey);
    if ((folderNotes[k] || "") === description) return;
    setFolderNotes((prev) => ({ ...prev, [k]: description }));
    setFolderNote(projectId, folderKey, description).catch(() => {});
  };

  useEffect(() => {
    fetchAllDocuments()
      .then(setDocs)
      .finally(() => setLoading(false));
    fetchFolderNotes()
      .then((notes) => setFolderNotes(Object.fromEntries(notes.map((n) => [`${n.projectId}::${n.folderKey}`, n.description]))))
      .catch(() => {});
  }, []);

  // Deep-link from global search: ?focus=<docId> opens the document and flashes its row.
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus || !docs.length) return;
    const doc = docs.find((d) => d._id === focus);
    if (doc) {
      setTab("projects");
      setSearch(""); setTypeFilter("All Types");
      setBrowse({ pid: doc.projectId, tabId: sectionToPath(doc.section).tabId, group: groupKey(doc.section) });
      setSelected(doc);
      setHighlightId(doc._id);
      setTimeout(() => {
        document.getElementById(`doc-${doc._id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      setTimeout(() => setHighlightId(null), 3000);
    }
    searchParams.delete("focus");
    setSearchParams(searchParams, { replace: true });
  }, [docs, searchParams, setSearchParams]);

  // Base set honouring the type filter — folder counts & leaves derive from this.
  const byType = useMemo(
    () => docs.filter((d) => typeFilter === "All Types" || classifyForFilter(d.fileType) === typeFilter),
    [docs, typeFilter],
  );

  const searching = !!search.trim();
  // Flat search results (across every project/tab) when the search box is used.
  const filtered = useMemo(() => {
    if (!searching) return byType;
    const q = search.toLowerCase();
    return byType.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      d.projectName.toLowerCase().includes(q) ||
      sectionLabel(d.section).toLowerCase().includes(q));
  }, [byType, searching, search]);

  // ── Folder-drill levels ──────────────────────────────────────────────
  const projectFolders = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    byType.forEach((d) => { const e = m.get(d.projectId) || { name: d.projectName, count: 0 }; e.count++; m.set(d.projectId, e); });
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => a.name.localeCompare(b.name));
  }, [byType]);
  const tabFolders = useMemo(() => {
    if (!browse.pid) return [];
    const m = new Map<string, { label: string; count: number }>();
    byType.filter((d) => d.projectId === browse.pid).forEach((d) => { const p = sectionToPath(d.section); const e = m.get(p.tabId) || { label: p.tab, count: 0 }; e.count++; m.set(p.tabId, e); });
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => a.label.localeCompare(b.label));
  }, [byType, browse.pid]);
  const groupFolders = useMemo(() => {
    if (!browse.pid || !browse.tabId) return [];
    const m = new Map<string, { label: string; count: number }>();
    byType.filter((d) => d.projectId === browse.pid && sectionToPath(d.section).tabId === browse.tabId).forEach((d) => { const k = groupKey(d.section); const e = m.get(k) || { label: groupLabel(d.section), count: 0 }; e.count++; m.set(k, e); });
    return Array.from(m.entries()).map(([key, v]) => ({ key, ...v })).sort((a, b) => a.label.localeCompare(b.label));
  }, [byType, browse.pid, browse.tabId]);
  const leafDocs = useMemo(
    () => byType.filter((d) => d.projectId === browse.pid && sectionToPath(d.section).tabId === browse.tabId && groupKey(d.section) === browse.group),
    [byType, browse],
  );
  const browseProjectName = projectFolders.find((p) => p.id === browse.pid)?.name || browse.pid;
  const browseTabLabel = tabFolders.find((t) => t.id === browse.tabId)?.label || browse.tabId;
  const browseGroupLabel = groupFolders.find((g) => g.key === browse.group)?.label;

  // §O — click a column header to sort the list. Every column is sortable.
  type DocSortKey = "name" | "projectName" | "origin" | "size" | "uploadedAt";
  const [sort, setSort] = useState<{ key: DocSortKey; dir: 1 | -1 } | null>(null);
  const toggleSort = (key: DocSortKey) =>
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  const sizeToBytes = (s: string) => {
    const m = String(s || "").match(/([\d.]+)\s*(B|KB|MB|GB|TB)?/i);
    if (!m) return 0;
    const mult: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
    return (parseFloat(m[1]) || 0) * (mult[(m[2] || "B").toUpperCase()] || 1);
  };
  const sortVal = (d: typeof filtered[number], key: DocSortKey): string | number => {
    switch (key) {
      case "name": return (d.name || "").toLowerCase();
      case "projectName": return (d.projectName || "").toLowerCase();
      case "origin": return sectionLabel(d.section).toLowerCase();
      case "size": return sizeToBytes(d.size);
      case "uploadedAt": return d.uploadedAt || "";
    }
  };
  // Rows shown in the file views: flat search results, or the drilled-into leaf.
  const viewSource = searching ? filtered : leafDocs;
  const sorted = useMemo(() => {
    if (!sort) return viewSource;
    const arr = [...viewSource];
    arr.sort((a, b) => {
      const av = sortVal(a, sort.key), bv = sortVal(b, sort.key);
      return av < bv ? -sort.dir : av > bv ? sort.dir : 0;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewSource, sort]);
  const sortIcon = (key: DocSortKey) => sort?.key === key
    ? (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
    : <ChevronsUpDown size={11} className="text-slate-300" />;
  const SortTh = ({ label, k, align = "left" }: { label: string; k: DocSortKey; align?: "left" | "right" }) => (
    <th className={`text-${align} px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest`}>
      <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-widest hover:text-slate-700 ${sort?.key === k ? "text-slate-700" : ""}`}>{label} {sortIcon(k)}</button>
    </th>
  );

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 mb-2">Documents</h1>
        <p className="text-slate-500 font-medium">
          {tab === "company"
            ? "Official GreenTech USA company documents — organized into tabs you control."
            : tab === "classified"
              ? "Restricted, confidential documents."
              : loading
                ? "Loading documents…"
                : `${byType.length} file${byType.length === 1 ? "" : "s"} across ${projectFolders.length} project${projectFolders.length === 1 ? "" : "s"} — browse by project, tab, and section.`}
        </p>
      </div>

      {/* Sub-tabs — horizontally scrollable strip so nothing is ever cut off on mobile. */}
      <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-max">
          <button
            onClick={() => setTab("projects")}
            className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${tab === "projects" ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}
          >
            <FolderOpen size={14} className="shrink-0" /> Project<span className="hidden sm:inline"> Documents</span>
          </button>
          {!isGuest && (
            <button
              onClick={() => setTab("company")}
              className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${tab === "company" ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}
            >
              <Building2 size={14} className="shrink-0" /> Company<span className="hidden sm:inline"> Documents</span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setTab("classified")}
              className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${tab === "classified" ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}
            >
              <ShieldAlert size={14} className="shrink-0" /> Classified<span className="hidden sm:inline"> Documents</span>
            </button>
          )}
        </div>
      </div>

      {tab === "projects" && (
      <>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files or projects…"
              className="bg-white border border-slate-100 rounded-xl py-2.5 pl-10 pr-4 text-xs font-medium focus:ring-4 focus:ring-primary/5 outline-none w-40 sm:w-72 shadow-sm"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-xs font-bold uppercase tracking-widest text-slate-600 outline-none shadow-sm cursor-pointer"
          >
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-slate-100">
            {([
              { id: "list", Icon: ListIcon, label: "List view" },
              { id: "grid", Icon: LayoutGrid, label: "Column view" },
            ] as const).map(({ id, Icon, label }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                title={label}
                className={`p-2 rounded-lg transition-all ${view === id ? "bg-slate-900 text-white" : "text-slate-400 hover:text-slate-900"}`}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>

      {/* Searching deliberately looks across ALL projects, so say so — the breadcrumb is hidden
          and results would otherwise look like they belong to the folder you were standing in. */}
      {searching && (
        <p className="text-[11px] font-bold text-slate-400">Searching across all projects · {sorted.length} result{sorted.length === 1 ? "" : "s"}</p>
      )}

      {/* Breadcrumb — project › tab › section. Hidden while searching (flat results). */}
      {!searching && (
        <nav className="flex items-center gap-1.5 flex-wrap text-xs font-bold">
          <button onClick={() => setBrowse({})} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${!browse.pid ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}><Home size={13} /> All Projects</button>
          {browse.pid && (<><ChevronRight size={13} className="text-slate-300" /><button onClick={() => setBrowse({ pid: browse.pid })} className={`px-2.5 py-1.5 rounded-lg ${!browse.tabId ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{browseProjectName}</button></>)}
          {browse.tabId && (<><ChevronRight size={13} className="text-slate-300" /><button onClick={() => setBrowse({ pid: browse.pid, tabId: browse.tabId })} className={`px-2.5 py-1.5 rounded-lg ${!browse.group ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{browseTabLabel}</button></>)}
          {browse.group && (<><ChevronRight size={13} className="text-slate-300" /><span className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white">{browseGroupLabel}</span></>)}
        </nav>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-32 text-slate-300">
          <Loader2 size={32} className="animate-spin" />
        </div>
      ) : !searching && !browse.group ? (
        // ── Folder browser ──
        (() => {
          // Each virtual folder carries the (projectId, folderKey) its description is stored under.
          const folders = !browse.pid
            ? projectFolders.map((p) => ({ id: p.id, label: p.name, count: p.count, projectId: p.id, folderKey: "project", onOpen: () => setBrowse({ pid: p.id }) }))
            : !browse.tabId
              ? tabFolders.map((t) => ({ id: t.id, label: t.label, count: t.count, projectId: browse.pid!, folderKey: `tab:${t.id}`, onOpen: () => setBrowse({ pid: browse.pid, tabId: t.id }) }))
              : groupFolders.map((g) => ({ id: g.key, label: g.label, count: g.count, projectId: browse.pid!, folderKey: `group:${g.key}`, onOpen: () => setBrowse({ pid: browse.pid, tabId: browse.tabId, group: g.key }) }));
          if (folders.length === 0) return (
            <div className="flex flex-col items-center justify-center py-32 text-slate-400"><FolderOpen size={40} className="mb-3" /><p className="font-bold text-sm">No documents here yet.</p></div>
          );
          // The list/column toggle applies to the folder levels too: LIST renders the same
          // table style as My Projects / All Projects; COLUMN renders the folder cards.
          if (view === "list") return (
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-50">
                      <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name</th>
                      <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</th>
                      <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Files</th>
                      <th className="text-right px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {folders.map((f) => (
                      <tr key={f.id} className="group hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={f.onOpen}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary"><Folder size={18} /></div>
                            {/* A real button so the folder drill-down is keyboard reachable. */}
                            <button onClick={(e) => { e.stopPropagation(); f.onOpen(); }} className="font-bold text-sm text-slate-900 group-hover:text-primary truncate text-left">{f.label}</button>
                          </div>
                        </td>
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          {canEditDocs ? (
                            <input
                              defaultValue={folderNotes[folderNoteKey(f.projectId, f.folderKey)] || ""}
                              onBlur={(e) => saveFolderNote(f.projectId, f.folderKey, e.target.value)}
                              placeholder="Add a description…"
                              className="w-full min-w-[10rem] bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary/20 rounded px-2 py-1.5 text-xs font-medium text-slate-600 outline-none"
                            />
                          ) : (
                            <span className="text-xs text-slate-500">{folderNotes[folderNoteKey(f.projectId, f.folderKey)] || "—"}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-400">{f.count} file{f.count === 1 ? "" : "s"}</td>
                        <td className="px-6 py-4 text-right"><ChevronRight size={16} className="text-slate-300 group-hover:text-primary inline-block" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {folders.map((f) => (
                <div key={f.id} className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg hover:border-primary/30 transition-all p-5 space-y-3">
                  <button onClick={f.onOpen} className="w-full flex items-center gap-4 text-left">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary/10 text-primary flex-shrink-0"><Folder size={22} /></div>
                    <div className="min-w-0 flex-grow">
                      <p className="font-bold text-sm text-slate-900 group-hover:text-primary truncate">{f.label}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{f.count} file{f.count === 1 ? "" : "s"}</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-primary flex-shrink-0" />
                  </button>
                  {canEditDocs ? (
                    <input
                      defaultValue={folderNotes[folderNoteKey(f.projectId, f.folderKey)] || ""}
                      onBlur={(e) => saveFolderNote(f.projectId, f.folderKey, e.target.value)}
                      placeholder="Add a description…"
                      className="w-full bg-slate-50 hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-primary/20 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 outline-none"
                    />
                  ) : folderNotes[folderNoteKey(f.projectId, f.folderKey)] ? (
                    <p className="text-[11px] text-slate-500">{folderNotes[folderNoteKey(f.projectId, f.folderKey)]}</p>
                  ) : null}
                </div>
              ))}
            </div>
          );
        })()
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-slate-400">
          <FileText size={40} className="mb-3" />
          <p className="font-bold text-sm">No documents match your filters.</p>
        </div>
      ) : view === "list" ? (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-50">
                  <SortTh label="Name" k="name" />
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</th>
                  <SortTh label="Project" k="projectName" />
                  <SortTh label="Origin" k="origin" />
                  <SortTh label="Size" k="size" />
                  <SortTh label="Uploaded" k="uploadedAt" />
                  <th className="text-right px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map((d) => (
                  <tr key={d._id} id={`doc-${d._id}`} className={`group hover:bg-slate-50/50 transition-colors ${highlightId === d._id ? "bg-amber-50" : ""}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colorFor(d.fileType)}`}>
                          {iconFor(d.fileType)}
                        </div>
                        <button
                          onClick={() => setSelected(d)}
                          className="font-bold text-sm text-slate-900 group-hover:text-primary text-left truncate"
                        >
                          {d.name}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {canEditDocs ? (
                        <input
                          defaultValue={d.description || ""}
                          onBlur={(e) => saveDescription(d, e.target.value)}
                          placeholder="Add a description…"
                          className="w-full min-w-[10rem] bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary/20 rounded px-2 py-1.5 text-xs font-medium text-slate-600 outline-none"
                        />
                      ) : (
                        <span className="text-xs text-slate-500">{d.description || "—"}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/dashboard/projects/${d.projectId}`)}
                        className="text-xs font-bold text-slate-600 hover:text-primary"
                      >
                        {d.projectName}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{sectionLabel(d.section)}</span>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-400">{d.size}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">{formatDate(d.uploadedAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setSelected(d)} className="p-2 rounded-lg hover:bg-white text-slate-400 hover:text-primary transition-all" title="Preview"><Eye size={16} /></button>
                        <a href={documentUrl(d)} download={d.name} className="p-2 rounded-lg hover:bg-white text-slate-400 hover:text-primary transition-all" title="Download"><Download size={16} /></a>
                        <ShareMenu fileName={d.name} fileUrl={documentUrl(d)} projectName={d.projectName} size={16} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // Column view — the same info the list carries (name, project, origin, size, date, actions)
        // as a grid of cards.
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {sorted.map((d) => (
            <div key={d._id} id={`doc-${d._id}`} className={`bg-white rounded-2xl border shadow-sm hover:shadow-lg transition-all p-5 flex flex-col gap-3 group ${highlightId === d._id ? "border-primary ring-2 ring-primary/30" : "border-slate-100"}`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorFor(d.fileType)}`}>
                {iconFor(d.fileType)}
              </div>
              <button onClick={() => setSelected(d)} className="text-left flex-grow">
                <p className="font-bold text-sm text-slate-900 group-hover:text-primary line-clamp-2 break-all">{d.name}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{d.projectName}</p>
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-0.5">{sectionLabel(d.section)}</p>
              </button>
              {/* Per-file description — right under the name, editable inline. */}
              {canEditDocs ? (
                <input
                  defaultValue={d.description || ""}
                  onBlur={(e) => saveDescription(d, e.target.value)}
                  placeholder="Add a description…"
                  className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-100 focus:ring-2 focus:ring-primary/20 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-600 outline-none"
                />
              ) : d.description ? (
                <p className="text-[11px] text-slate-500">{d.description}</p>
              ) : null}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-[10px] font-bold text-slate-400">{d.size} · {formatDate(d.uploadedAt)}</span>
                <div className="flex gap-1">
                  <button onClick={() => setSelected(d)} className="p-1.5 rounded hover:bg-slate-50 text-slate-400 hover:text-primary"><Eye size={14} /></button>
                  <a href={documentUrl(d)} download={d.name} className="p-1.5 rounded hover:bg-slate-50 text-slate-400 hover:text-primary"><Download size={14} /></a>
                  <ShareMenu fileName={d.name} fileUrl={documentUrl(d)} projectName={d.projectName} size={14} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}

      {tab === "company" && !isGuest && (
        <>
          {/* Company details — read-only */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-display font-bold text-slate-900">Company Details</h2>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><Lock size={12} /> Admin-managed</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-5">
              {COMPANY_DETAILS.map((d) => (
                <div key={d.label}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{d.label}</p>
                  <p className="text-sm font-bold text-slate-900 break-words">{d.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Company files — tabbed, user-managed */}
          <CompanyDocs />
        </>
      )}

      {tab === "classified" && isAdmin && <ClassifiedDocs />}

      <AnimatePresence>
        {selected && (
          <DocumentViewer
            doc={{ name: selected.name, url: documentUrl(selected), fileType: selected.fileType || (selected.name.split(".").pop() || "") }}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
