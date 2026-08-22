import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, Plus, Search, Pencil, Trash2, X, Archive, RotateCcw, Mail, Phone, Globe, MapPin, Loader2, Landmark, Link2, Check, Upload, Eye, LayoutGrid, List as ListIcon, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import {
  fetchCompanies, createCompany, updateCompany, deleteCompany,
  generateCompanyRegisterLink, resolveCompanyPending, syncCompaniesFromProjects,
  uploadCompanyLogo, withFileToken,
  COMPANY_CATEGORIES, type ApiCompany, type CompanyInput, type CompanyCategory,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import CompanyProfile from "./CompanyProfile";

const inp = "w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/15 focus:bg-white";
const label = "block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1";
const catLabel = (c: CompanyCategory) => COMPANY_CATEGORIES.find((x) => x.v === c)?.label || c;
const CAT_CLS: Record<string, string> = {
  vendor: "bg-emerald-50 text-emerald-600", subcontractor: "bg-blue-50 text-blue-600", client: "bg-indigo-50 text-indigo-600",
  manufacturer: "bg-amber-50 text-amber-600", consultant: "bg-purple-50 text-purple-600", partner: "bg-teal-50 text-teal-600",
  supplier: "bg-orange-50 text-orange-600", other: "bg-slate-100 text-slate-500",
};

const BLANK: CompanyInput = {
  name: "", category: "vendor", logoUrl: "", address: "", phone: "", email: "", website: "",
  contactPersons: [], banking: { bankName: "", accountName: "", accountNumber: "", iban: "", swift: "", routing: "" },
  tax: { taxId: "", registrationNo: "" }, notes: "", archived: false,
};

export default function Directory() {
  const { confirm, dialogs } = useDialogs();
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<"all" | CompanyCategory>("all");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid"); // CR-P-42
  const [editor, setEditor] = useState<{ id: string | null; draft: CompanyInput } | null>(null);
  const [saving, setSaving] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);   // CR-P-43 — open a full profile view
  // CR-P-07 — company logo upload (returns a public URL stored in the draft's logoUrl).
  const [logoUploading, setLogoUploading] = useState(false);
  const uploadLogo = async (file: File) => {
    setLogoUploading(true);
    try { const { url } = await uploadCompanyLogo(file); setDraft({ logoUrl: url }); }
    catch (e) { toast(e instanceof Error ? e.message : "Logo upload failed.", "error"); }
    finally { setLogoUploading(false); }
  };
  const openProfile = (c: ApiCompany) => setProfileId(c._id);

  const load = async () => {
    setLoading(true);
    try { setCompanies(await fetchCompanies(cat === "all" ? undefined : cat, showArchived)); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not load the directory.", "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cat, showArchived]);
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
    const validCat = c && COMPANY_CATEGORIES.some((x) => x.v === c) ? (c as CompanyCategory) : null;
    if (validCat) setCat(validCat);
    if (isNew) setEditor({ id: null, draft: { ...BLANK, category: validCat || "vendor", name: nm } });
    if (c || isNew || nm) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      [c.name, c.email, c.phone, c.address, ...(c.contactPersons || []).map((p) => `${p.name} ${p.email}`)]
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

  const openNew = () => setEditor({ id: null, draft: { ...BLANK, category: cat === "all" ? "vendor" : cat } });
  const openEdit = (c: ApiCompany) => setEditor({ id: c._id, draft: { ...c } });
  const setDraft = (patch: Partial<CompanyInput>) => setEditor((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));

  const save = async () => {
    if (!editor) return;
    if (!String(editor.draft.name || "").trim()) { toast("Enter a company name.", "error"); return; }
    setSaving(true);
    try {
      if (editor.id) { const up = await updateCompany(editor.id, editor.draft); setCompanies((p) => p.map((c) => (c._id === up._id ? up : c))); }
      else { const nw = await createCompany(editor.draft); setCompanies((p) => [nw, ...p]); }
      toast("Company saved.", "success");
      setEditor(null);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save the company.", "error"); }
    finally { setSaving(false); }
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
  const cps = () => editor?.draft.contactPersons || [];
  const setCps = (list: ApiCompany["contactPersons"]) => setDraft({ contactPersons: list });

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
            {(["all", ...COMPANY_CATEGORIES.map((c) => c.v)] as const).map((v) => (
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
                    <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${CAT_CLS[c.category]}`}>{catLabel(c.category)}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-600 truncate max-w-[16rem]">{c.email || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{c.phone || "—"}</td>
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
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${CAT_CLS[c.category]}`}>{catLabel(c.category)}</span>
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

      {/* Editor modal */}
      {editor && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
              <h3 className="text-base font-bold text-slate-900">{editor.id ? "Edit company" : "New company"}</h3>
              <button onClick={() => setEditor(null)} disabled={saving} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* CR-P-07 — company logo. */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                  {editor.draft.logoUrl ? <img src={withFileToken(editor.draft.logoUrl)} alt="Logo" className="w-full h-full object-contain" /> : <Building2 size={22} className="text-slate-300" />}
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary cursor-pointer">
                    {logoUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {editor.draft.logoUrl ? "Change logo" : "Upload logo"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = ""; }} />
                  </label>
                  {editor.draft.logoUrl && <button onClick={() => setDraft({ logoUrl: "" })} className="text-[11px] font-bold text-slate-400 hover:text-red-500">Remove</button>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2"><label className={label}>Company name *</label><input className={inp} value={editor.draft.name || ""} onChange={(e) => setDraft({ name: e.target.value })} placeholder="e.g. Nexans Cables" /></div>
                <div><label className={label}>Category</label>
                  <select className={`${inp} font-semibold`} value={editor.draft.category} onChange={(e) => setDraft({ category: e.target.value as CompanyCategory })}>
                    {COMPANY_CATEGORIES.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className={label}>Email</label><input className={inp} value={editor.draft.email || ""} onChange={(e) => setDraft({ email: e.target.value })} /></div>
                <div><label className={label}>Phone</label><input className={inp} value={editor.draft.phone || ""} onChange={(e) => setDraft({ phone: e.target.value })} /></div>
                <div><label className={label}>Website</label><input className={inp} value={editor.draft.website || ""} onChange={(e) => setDraft({ website: e.target.value })} /></div>
              </div>
              <div><label className={label}>Address</label><textarea rows={2} className={inp} value={editor.draft.address || ""} onChange={(e) => setDraft({ address: e.target.value })} /></div>

              {/* Contact persons */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className={label + " mb-0"}>Contact persons</p>
                  <button onClick={() => setCps([...cps(), { name: "", role: "", email: "", phone: "" }])} className="text-[11px] font-bold text-primary hover:underline">+ Add contact</button>
                </div>
                {cps().length === 0 && <p className="text-[11px] text-slate-400 italic">None yet.</p>}
                {cps().map((p, i) => (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                    <input className={`${inp} py-1.5`} placeholder="Name" value={p.name} onChange={(e) => setCps(cps().map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <input className={`${inp} py-1.5`} placeholder="Role" value={p.role} onChange={(e) => setCps(cps().map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
                    <input className={`${inp} py-1.5`} placeholder="Email" value={p.email} onChange={(e) => setCps(cps().map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                    <div className="flex items-center gap-1">
                      <input className={`${inp} py-1.5`} placeholder="Phone" value={p.phone} onChange={(e) => setCps(cps().map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
                      <button onClick={() => setCps(cps().filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500 shrink-0"><X size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Banking + tax */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                <p className={label + " mb-0 flex items-center gap-1.5"}><Landmark size={12} /> Banking &amp; tax</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input className={`${inp} py-1.5`} placeholder="Bank name" value={editor.draft.banking?.bankName || ""} onChange={(e) => setDraft({ banking: { ...editor.draft.banking!, bankName: e.target.value } })} />
                  <input className={`${inp} py-1.5`} placeholder="Account name" value={editor.draft.banking?.accountName || ""} onChange={(e) => setDraft({ banking: { ...editor.draft.banking!, accountName: e.target.value } })} />
                  <input className={`${inp} py-1.5`} placeholder="Account number" value={editor.draft.banking?.accountNumber || ""} onChange={(e) => setDraft({ banking: { ...editor.draft.banking!, accountNumber: e.target.value } })} />
                  <input className={`${inp} py-1.5`} placeholder="IBAN" value={editor.draft.banking?.iban || ""} onChange={(e) => setDraft({ banking: { ...editor.draft.banking!, iban: e.target.value } })} />
                  <input className={`${inp} py-1.5`} placeholder="SWIFT/BIC" value={editor.draft.banking?.swift || ""} onChange={(e) => setDraft({ banking: { ...editor.draft.banking!, swift: e.target.value } })} />
                  <input className={`${inp} py-1.5`} placeholder="Routing" value={editor.draft.banking?.routing || ""} onChange={(e) => setDraft({ banking: { ...editor.draft.banking!, routing: e.target.value } })} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input className={`${inp} py-1.5`} placeholder="Tax ID" value={editor.draft.tax?.taxId || ""} onChange={(e) => setDraft({ tax: { ...editor.draft.tax!, taxId: e.target.value } })} />
                  <input className={`${inp} py-1.5`} placeholder="Registration no." value={editor.draft.tax?.registrationNo || ""} onChange={(e) => setDraft({ tax: { ...editor.draft.tax!, registrationNo: e.target.value } })} />
                </div>
              </div>

              <div><label className={label}>Notes</label><textarea rows={2} className={inp} value={editor.draft.notes || ""} onChange={(e) => setDraft({ notes: e.target.value })} /></div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-3xl">
              <button onClick={() => setEditor(null)} disabled={saving} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold disabled:opacity-50">Cancel</button>
              <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-primary disabled:opacity-50 inline-flex items-center gap-1.5">{saving && <Loader2 size={14} className="animate-spin" />} Save</button>
            </div>
          </div>
        </div>
      )}

      {dialogs}
    </div>
  );
}
