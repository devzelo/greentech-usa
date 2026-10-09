import { useEffect, useMemo, useState } from "react";
import { formatPhone } from "../../lib/phone";
import { useSearchParams } from "react-router-dom";
import { Building2, Plus, Search, Pencil, Trash2, X, Archive, RotateCcw, Mail, Phone, Globe, MapPin, Loader2, Link2, Check, Eye, LayoutGrid, List as ListIcon, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import {
  fetchCompanies, updateCompany, deleteCompany,
  generateCompanyRegisterLink, resolveCompanyPending, syncCompaniesFromProjects,
  withFileToken,
  COMPANY_CATEGORIES, companyCategories, type ApiCompany, type CompanyInput, type CompanyCategory,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import { useRefreshSignal } from "../../lib/refreshBus";
import CompanyProfile from "./CompanyProfile";
import CompanyEditorModal, { BLANK_COMPANY } from "./CompanyEditorModal";

const inp = "w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/15 focus:bg-white";
const label = "block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1";
const catLabel = (c: CompanyCategory) => COMPANY_CATEGORIES.find((x) => x.v === c)?.label || c;
const CAT_CLS: Record<string, string> = {
  vendor: "bg-emerald-50 text-emerald-600", subcontractor: "bg-blue-50 text-blue-600", client: "bg-indigo-50 text-indigo-600",
  manufacturer: "bg-amber-50 text-amber-600", consultant: "bg-purple-50 text-purple-600", partner: "bg-teal-50 text-teal-600",
  supplier: "bg-orange-50 text-orange-600", other: "bg-slate-100 text-slate-500",
};

const BLANK = BLANK_COMPANY;

export default function Directory() {
  const { confirm, dialogs } = useDialogs();
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<"all" | CompanyCategory>("all");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid"); // CR-P-42
  const [editor, setEditor] = useState<{ id: string | null; draft: CompanyInput } | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);   // CR-P-43 — open a full profile view
  // CR-P-07 — company logo upload (returns a public URL stored in the draft's logoUrl).

  const openProfile = (c: ApiCompany) => setProfileId(c._id);

  const load = async () => {
    setLoading(true);
    try { setCompanies(await fetchCompanies(cat === "all" ? undefined : cat, showArchived)); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not load the directory.", "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cat, showArchived]);
  // CR-P (17) — the header Refresh button reloads the current tab's data in place instead of a full
  // page reload, so it stays on the tab you're viewing (a reload would reset it to "All").
  useRefreshSignal(load);
  // CR-P-06c — keep the Directory in sync with the platform automatically: on open, silently pull
  // in any clients / subcontractors / partners / vendors / manufacturers that exist in projects but
  // aren't in the Directory yet (idempotent — only adds what's missing), then refresh if it added any.
  useEffect(() => {
    syncCompaniesFromProjects().then(({ added }) => { if (added) load(); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // CR-P-43 — deep-link from a project's CompanyPicker ("Open in Directory"): preselect the category
  // tab and optionally open the New Company form prefilled, then clear the params.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const c = searchParams.get("category");
    const isNew = searchParams.get("new") === "1";
    const nm = searchParams.get("name") || "";
    const openId = searchParams.get("open");   // deep-link from global search: open this company's profile
    const validCat = c && COMPANY_CATEGORIES.some((x) => x.v === c) ? (c as CompanyCategory) : null;
    if (validCat) setCat(validCat);
    if (isNew) setEditor({ id: null, draft: { ...BLANK, category: validCat || "vendor", name: nm } });
    if (openId) setProfileId(openId);
    if (c || isNew || nm || openId) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      [c.name, c.email, c.phone, c.address, ...companyCategories(c).map(catLabel), ...(c.contactPersons || []).map((p) => `${p.name} ${p.email}`)]
        .join(" ").toLowerCase().includes(q));
  }, [companies, search]);

  // CR-P-42 — list-view column sorting.
  type SortKey = "name" | "category" | "email" | "phone" | "address";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  const sortedList = useMemo(() => {
    const val = (c: ApiCompany) => (sort.key === "category" ? catLabel(c.category) : c[sort.key] || "").toString().trim().toLowerCase();
    return [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (!av && !bv) return 0;
      if (!av) return 1; if (!bv) return -1;   // blanks always last
      const cmp = av.localeCompare(bv);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort]);
  const sortIcon = (key: SortKey) => sort.key === key ? (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="text-slate-300" />;

  // CR-P-43 — Directory tab flow: All, Clients, Subcontractors, Vendors, Partners, then the rest.
  const TAB_PRIORITY: CompanyCategory[] = ["client", "subcontractor", "vendor", "partner"];
  const orderedCats: CompanyCategory[] = [...TAB_PRIORITY, ...COMPANY_CATEGORIES.map((c) => c.v).filter((v) => !TAB_PRIORITY.includes(v))];

  const openNew = () => setEditor({ id: null, draft: { ...BLANK, category: cat === "all" ? "vendor" : cat } });
  const openEdit = (c: ApiCompany) => setEditor({ id: c._id, draft: { ...c } });
  // The form itself lives in CompanyEditorModal; we only fold the result back into the list.
  const onCompanySaved = (saved: ApiCompany) => {
    setCompanies((p) => (p.some((c) => c._id === saved._id) ? p.map((c) => (c._id === saved._id ? saved : c)) : [saved, ...p]));
    setEditor(null);
  };

  // CR-P-43 — confirm before archiving / restoring (delete already confirmed).
  const archive = async (c: ApiCompany, next: boolean): Promise<boolean> => {
    if (!(await confirm({
      title: next ? "Archive company?" : "Restore company?",
      message: next ? `Move "${c.name}" to the archived list. You can restore it anytime from the Archived view.` : `Restore "${c.name}" to the active directory.`,
      confirmLabel: next ? "Archive" : "Restore", cancelLabel: "Cancel", danger: next,
    }))) return false;
    try { await updateCompany(c._id, { archived: next }); setCompanies((p) => p.filter((x) => x._id !== c._id)); toast(next ? "Company archived." : "Company restored.", "success"); return true; }
    catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); return false; }
  };
  const remove = async (c: ApiCompany): Promise<boolean> => {
    if (!(await confirm({ title: "Delete company?", message: `Permanently remove "${c.name}" from the directory. This cannot be undone.`, confirmLabel: "Delete", cancelLabel: "Cancel", danger: true }))) return false;
    try { await deleteCompany(c._id); setCompanies((p) => p.filter((x) => x._id !== c._id)); toast("Company deleted.", "success"); return true; }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); return false; }
  };
  // CR-P-06d — generate + copy the vendor self-registration link.
  const copyLink = async (c: ApiCompany) => {
    try {
      const { token } = await generateCompanyRegisterLink(c._id);
      const url = `${window.location.origin}/company/register/${token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast("Registration link copied — send it to the company to fill in their own details.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not generate the link.", "error"); }
  };
  const resolvePending = async (c: ApiCompany, action: "approve" | "discard") => {
    try { const up = await resolveCompanyPending(c._id, action); setCompanies((p) => p.map((x) => (x._id === up._id ? up : x))); toast(action === "approve" ? "Update approved & applied." : "Pending update discarded.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
  };

  // Contact-person repeater helpers

  const profileCompany = profileId ? companies.find((c) => c._id === profileId) || null : null;

  return (
    <div className="space-y-6">
      {profileCompany ? (
        <CompanyProfile
          company={profileCompany}
          showArchived={showArchived}
          onBack={() => setProfileId(null)}
          onEdit={openEdit}
          onArchive={archive}
          onDelete={remove}
          onCopyLink={copyLink}
          onResolvePending={resolvePending}
        />
      ) : (
      <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 flex items-center gap-2"><Building2 className="text-primary" /> Directory</h1>
          <p className="text-sm text-slate-500 mt-1">Master list of vendors, subcontractors, clients, manufacturers, consultants and partners.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* CR-P-42 — grid / list view toggle */}
          <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-slate-100">
            <button onClick={() => setView("grid")} title="Grid view" className={`p-1.5 rounded-lg transition-all ${view === "grid" ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}><LayoutGrid size={16} /></button>
            <button onClick={() => setView("list")} title="List view" className={`p-1.5 rounded-lg transition-all ${view === "list" ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}><ListIcon size={16} /></button>
          </div>
          <button onClick={() => setShowArchived((v) => !v)} className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border ${showArchived ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-200 hover:text-slate-900"}`}><Archive size={13} /> {showArchived ? "Active" : "Archived"}</button>
          <button onClick={openNew} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gt-gradient text-white text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-transform"><Plus size={16} /> New company</button>
        </div>
      </div>

      {/* Category tabs (scrollable) + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 flex-grow">
          <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-max">
            {(["all", ...orderedCats] as const).map((v) => (
              <button key={v} onClick={() => setCat(v)} className={`px-3 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wide whitespace-nowrap shrink-0 transition-all ${cat === v ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}>
                {v === "all" ? "All" : catLabel(v)}
              </button>
            ))}
          </div>
        </div>
        <div className="relative shrink-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies…" className="w-full sm:w-64 bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/15" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="animate-spin" size={16} /> Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Building2 size={40} className="mx-auto mb-3 text-slate-200" />
          <p className="text-sm font-medium">{showArchived ? "No archived companies." : "No companies yet — add your first one."}</p>
        </div>
      ) : view === "list" ? (
        /* CR-P-42 — list view with row numbering */
        <div className="bg-white rounded-3xl sm:rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-50">
                  <th className="text-left px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-12">#</th>
                  {([["name", "Company"], ["category", "Category"], ["email", "Email"], ["phone", "Phone"], ["address", "Location"]] as const).map(([k, l]) => (
                    <th key={k} className="text-left px-4 py-4">
                      <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${sort.key === k ? "text-slate-700" : "text-slate-400 hover:text-slate-600"}`} title={`Sort by ${l}`}>{l} {sortIcon(k)}</button>
                    </th>
                  ))}
                  <th className="text-right px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sortedList.map((c, i) => (
                  <tr key={c._id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-xs font-bold text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                          {c.logoUrl ? <img src={withFileToken(c.logoUrl)} alt="" className="w-full h-full object-contain" /> : <Building2 size={15} className="text-slate-300" />}
                        </div>
                        <div className="min-w-0">
                          <button onClick={() => openProfile(c)} className="font-bold text-sm text-slate-900 group-hover:text-primary hover:underline text-left truncate" title="View profile">{c.name}</button>
                          {c.pendingUpdate && <span className="block text-[10px] font-bold text-amber-600">Update pending review</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{companyCategories(c).map((cat) => <span key={cat} className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${CAT_CLS[cat]}`}>{catLabel(cat)}</span>)}</div></td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate max-w-[16rem]">{c.email || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{formatPhone(c.phone) || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate max-w-[16rem]">{c.address || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button onClick={() => openProfile(c)} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-white" title="View profile"><Eye size={15} /></button>
                        <button onClick={() => copyLink(c)} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-white" title="Copy self-registration link"><Link2 size={15} /></button>
                        <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-white" title="Edit"><Pencil size={15} /></button>
                        <button onClick={() => archive(c, !showArchived)} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50" title={showArchived ? "Restore" : "Archive"}>{showArchived ? <RotateCcw size={15} /> : <Archive size={15} />}</button>
                        <button onClick={() => remove(c)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50" title="Delete"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div key={c._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all p-5 flex flex-col gap-3 group">
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => openProfile(c)} className="flex items-start gap-2.5 min-w-0 text-left" title="View profile">
                  <div className="w-10 h-10 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                    {c.logoUrl ? <img src={withFileToken(c.logoUrl)} alt="" className="w-full h-full object-contain" /> : <Building2 size={16} className="text-slate-300" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate group-hover:text-primary">{c.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">{companyCategories(c).map((cat) => <span key={cat} className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${CAT_CLS[cat]}`}>{catLabel(cat)}</span>)}</div>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openProfile(c)} className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50" title="View profile"><Eye size={15} /></button>
                  <button onClick={() => copyLink(c)} className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50" title="Copy self-registration link — the company fills in their own details"><Link2 size={15} /></button>
                  <button onClick={() => openEdit(c)} className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50" title="Edit"><Pencil size={15} /></button>
                  <button onClick={() => archive(c, !showArchived)} className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50" title={showArchived ? "Restore" : "Archive"}>{showArchived ? <RotateCcw size={15} /> : <Archive size={15} />}</button>
                  <button onClick={() => remove(c)} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50" title="Delete"><Trash2 size={15} /></button>
                </div>
              </div>
              {/* CR-P-06d — a self-submitted update awaiting GT review. */}
              {c.pendingUpdate && (
                <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  <span className="text-[11px] font-bold text-amber-700">
                    Company submitted an update for review.
                    {(c.pendingUpdate.submittedBy || c.pendingUpdate.submittedAt) && (
                      <span className="block font-medium text-amber-600/80 mt-0.5">
                        {c.pendingUpdate.submittedBy ? `By ${c.pendingUpdate.submittedBy}` : ""}
                        {c.pendingUpdate.submittedBy && c.pendingUpdate.submittedAt ? " · " : ""}
                        {c.pendingUpdate.submittedAt ? new Date(c.pendingUpdate.submittedAt).toLocaleString() : ""}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => resolvePending(c, "approve")} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-600"><Check size={11} /> Approve</button>
                    <button onClick={() => resolvePending(c, "discard")} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-slate-500 text-[10px] font-bold hover:text-red-600"><X size={11} /> Discard</button>
                  </div>
                </div>
              )}
              <div className="text-[12px] text-slate-500 space-y-1">
                {c.email && <p className="flex items-center gap-1.5 truncate"><Mail size={12} className="text-slate-300 shrink-0" /> {c.email}</p>}
                {c.phone && <p className="flex items-center gap-1.5 truncate"><Phone size={12} className="text-slate-300 shrink-0" /> {c.phone}</p>}
                {c.website && <p className="flex items-center gap-1.5 truncate"><Globe size={12} className="text-slate-300 shrink-0" /> {c.website}</p>}
                {c.address && <p className="flex items-start gap-1.5"><MapPin size={12} className="text-slate-300 shrink-0 mt-0.5" /> <span className="line-clamp-2">{c.address}</span></p>}
                {(c.contactPersons?.length || 0) > 0 && <p className="text-[11px] text-slate-400 pt-1">{c.contactPersons.length} contact person{c.contactPersons.length === 1 ? "" : "s"}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}

      {/* The Directory's company form — shared with the RFQ receiver list (CR-PR-08). */}
      {editor && (
        <CompanyEditorModal
          companyId={editor.id}
          initial={editor.draft}
          onSaved={onCompanySaved}
          onClose={() => setEditor(null)}
        />
      )}

      {dialogs}
    </div>
  );
}
