import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlusCircle, ChevronDown, ChevronRight, Search, FolderOpen, X, Building2, FileSpreadsheet, ShoppingCart, Receipt, Users, DollarSign, Truck, FileText, Package, UserPlus, ClipboardList, HardHat, Handshake } from "lucide-react";
import { fetchProjects, getAuthUser, type ApiProject } from "../../lib/api";

// The "+ New" menu. Every entry lands the user on the exact tab (and sub-tab) where that record
// is created. Entries that exist in more than one place — agreements, most of all — first ask
// WHICH kind, then route accordingly.
type Dest =
  | { scope: "global"; to: string }
  | { scope: "project"; dest: (id: string) => string };

type Variant = { key: string; label: string; hint: string; adminOnly?: boolean } & Dest;
type RecordDef = { key: string; label: string; icon: typeof PlusCircle } & (Dest | { scope: "choose"; variants: Variant[] });

const P = (path: string) => (id: string) => `/dashboard/projects/${id}${path}`;

const GENERAL: RecordDef[] = [
  { key: "project", label: "New Project", icon: FolderOpen, scope: "global", to: "/dashboard/new-project" },
  { key: "employee", label: "New Employee", icon: UserPlus, scope: "global", to: "/dashboard/users" },
  {
    key: "agreement", label: "New Agreement", icon: Handshake, scope: "choose",
    variants: [
      { key: "general", label: "General agreement", hint: "Company agreement with an outside party — no project", scope: "global", to: "/dashboard/agreements" },
      { key: "employee", label: "Employee agreement", hint: "From the employee's profile in User Management", scope: "global", to: "/dashboard/users", adminOnly: true },
      { key: "subcontractor", label: "Subcontractor agreement", hint: "Inside a project, on the subcontractor's record", scope: "project", dest: P("?tab=subs&sub=subcontractors") },
      { key: "vendor", label: "Vendor agreement", hint: "Inside a project, on the vendor's record", scope: "project", dest: P("?tab=subs&sub=vendors") },
      { key: "partner", label: "Partner agreement", hint: "Inside a project, on the JV partner", scope: "project", dest: P("?tab=subs&sub=partners") },
    ],
  },
];

// Project-scoped records — the user must select an existing project first.
const PROJECT_RECORDS: RecordDef[] = [
  { key: "proposal", label: "New Proposal", icon: FileSpreadsheet, scope: "project", dest: P("?tab=proposals") },
  { key: "boq", label: "New BOQ", icon: ClipboardList, scope: "project", dest: P("?tab=procurement&proc=boq") },
  { key: "rfq", label: "New RFQ", icon: Package, scope: "project", dest: P("?tab=procurement&proc=rfqs") },
  { key: "po", label: "New Purchase Order", icon: ShoppingCart, scope: "project", dest: P("?tab=procurement&proc=po") },
  { key: "vendor", label: "New Vendor", icon: Building2, scope: "project", dest: P("?tab=procurement&proc=rfqs") },
  { key: "subcontractor", label: "New Subcontractor", icon: HardHat, scope: "project", dest: P("?tab=subs&sub=subcontractors") },
  {
    key: "invoice", label: "New Invoice", icon: Receipt, scope: "choose",
    variants: [
      { key: "sent", label: "Invoice sent", hint: "An invoice you're sending to the client", scope: "project", dest: P("?tab=invoice-sent") },
      { key: "received", label: "Invoice received", hint: "A bill received from a vendor or subcontractor", scope: "project", dest: P("?tab=invoice-received") },
    ],
  },
  { key: "expense", label: "New Expense", icon: DollarSign, scope: "project", dest: P("?tab=expenses") },
  { key: "shipment", label: "New Shipment", icon: Truck, scope: "project", dest: P("?tab=procurement&proc=shipment") },
  { key: "document", label: "New Document", icon: FileText, scope: "project", dest: P("?tab=tech-docs") },
  { key: "client", label: "New Client", icon: Users, scope: "project", dest: P("?tab=client") },
];

export default function NewRecordMenu() {
  const navigate = useNavigate();
  const isAdmin = getAuthUser()?.role === "admin";
  const [open, setOpen] = useState(false);
  const [chooser, setChooser] = useState<RecordDef | null>(null);   // "which kind?" step
  const [picker, setPicker] = useState<{ label: string; dest: (id: string) => string } | null>(null);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [pSearch, setPSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const openProjectPicker = (label: string, dest: (id: string) => string) => {
    setPicker({ label, dest }); setPSearch(""); setLoading(true);
    fetchProjects("all").then(setProjects).catch(() => setProjects([])).finally(() => setLoading(false));
  };
  const go = (label: string, d: Dest) => {
    if (d.scope === "global") navigate(d.to);
    else openProjectPicker(label, d.dest);
  };
  const choose = (r: RecordDef) => {
    setOpen(false);
    if (r.scope === "choose") { setChooser(r); return; }
    go(r.label, r);
  };
  const pickProject = (id: string) => { const p = picker; setPicker(null); if (p) navigate(p.dest(id)); };

  const visible = (r: RecordDef) => r.key !== "employee" || isAdmin;
  const filteredProjects = projects.filter((p) => !pSearch.trim()
    || p.name.toLowerCase().includes(pSearch.toLowerCase())
    || p.id.toLowerCase().includes(pSearch.toLowerCase())
    || (p.contractNo || "").toLowerCase().includes(pSearch.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-gt-gradient text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-primary/20 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"
      >
        <PlusCircle size={16} /> <span className="hidden sm:inline">New</span> <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-100 rounded-2xl shadow-2xl p-2 z-50 max-h-[70vh] overflow-y-auto">
          <p className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">General</p>
          {GENERAL.filter(visible).map((r) => (
            <button key={r.key} onClick={() => choose(r)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-bold text-slate-700 hover:bg-slate-50">
              <r.icon size={14} className="text-primary" /> <span className="flex-grow text-left">{r.label}</span>
              {r.scope === "choose" && <ChevronRight size={13} className="text-slate-300" />}
            </button>
          ))}
          <div className="my-1.5 border-t border-slate-100" />
          <p className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">For a project</p>
          {PROJECT_RECORDS.map((r) => (
            <button key={r.key} onClick={() => choose(r)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-bold text-slate-700 hover:bg-slate-50">
              <r.icon size={14} className="text-slate-400" /> <span className="flex-grow text-left">{r.label}</span>
              {r.scope === "choose" && <ChevronRight size={13} className="text-slate-300" />}
            </button>
          ))}
        </div>
      )}

      {/* "Which kind?" step — e.g. an agreement can be general, employee, sub, vendor or partner */}
      {chooser && chooser.scope === "choose" && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={() => setChooser(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-16" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <div>
                <p className="text-sm font-bold text-slate-900">{chooser.label}</p>
                <p className="text-[10px] text-slate-400">What kind? We'll take you straight to the right place.</p>
              </div>
              <button onClick={() => setChooser(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-1.5">
              {chooser.variants.filter((v) => !v.adminOnly || isAdmin).map((v) => (
                <button
                  key={v.key}
                  onClick={() => { const label = `${chooser.label} · ${v.label}`; setChooser(null); go(label, v); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-left border border-transparent hover:border-slate-100"
                >
                  <div className="min-w-0 flex-grow">
                    <p className="text-sm font-bold text-slate-800">{v.label}</p>
                    <p className="text-[11px] text-slate-400">{v.hint}</p>
                  </div>
                  <ChevronRight size={15} className="text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Project picker for project-scoped records */}
      {picker && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={() => setPicker(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-16" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <div><p className="text-sm font-bold text-slate-900">{picker.label}</p><p className="text-[10px] text-slate-400">Select the project this record belongs to.</p></div>
              <button onClick={() => setPicker(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input autoFocus value={pSearch} onChange={(e) => setPSearch(e.target.value)} placeholder="Search projects…" className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/10" />
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1">
                {loading ? (
                  <p className="text-sm text-slate-400 italic text-center py-6">Loading projects…</p>
                ) : filteredProjects.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-slate-400 italic">{projects.length === 0 ? "No projects yet — create a project first." : "No projects match."}</p>
                    {projects.length === 0 && <button onClick={() => { setPicker(null); navigate("/dashboard/new-project"); }} className="mt-3 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold">Create a project</button>}
                  </div>
                ) : filteredProjects.map((p) => (
                  <button key={p.id} onClick={() => pickProject(p.id)} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 text-left border border-transparent hover:border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><FolderOpen size={15} /></div>
                    <div className="min-w-0 flex-grow"><p className="text-sm font-bold text-slate-800 truncate">{p.name}</p><p className="text-[10px] font-bold text-slate-400">No {p.id}{p.contractNo ? ` · Contract ${p.contractNo}` : ""}{p.category ? ` · ${p.category}` : ""}</p></div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
