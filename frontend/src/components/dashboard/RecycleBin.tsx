import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Archive, Trash2, RotateCcw, Loader2, Briefcase, Handshake, FileText, ClipboardList,
  Package, Building2, ExternalLink, X, Users, Truck, Receipt, Megaphone,
} from "lucide-react";
import {
  fetchArchiveItems, fetchRecycleItems, restoreArchiveItem, restoreRecycleItem, purgeRecycleItem,
  COMPANY_CATEGORIES, type ApiBinItem,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import { useMeta } from "../../hooks/useMeta";
import { useDialogs } from "../../lib/useDialogs";

const KIND_META: Record<string, { label: string; icon: typeof Briefcase; cls: string }> = {
  project: { label: "Project", icon: Briefcase, cls: "bg-blue-50 text-blue-600" },
  agreement: { label: "Agreement", icon: Handshake, cls: "bg-indigo-50 text-indigo-600" },
  document: { label: "Document", icon: FileText, cls: "bg-sky-50 text-sky-600" },
  submittal: { label: "Submittal", icon: ClipboardList, cls: "bg-amber-50 text-amber-600" },
  rfq: { label: "RFQ", icon: Package, cls: "bg-emerald-50 text-emerald-600" },
  company: { label: "Company", icon: Building2, cls: "bg-violet-50 text-violet-600" },
  // CR-P — everything else that now snapshots to the recycle bin on delete.
  user: { label: "User", icon: Users, cls: "bg-blue-50 text-blue-600" },
  vendor: { label: "Vendor", icon: Building2, cls: "bg-emerald-50 text-emerald-600" },
  invoice: { label: "Invoice", icon: Receipt, cls: "bg-emerald-50 text-emerald-600" },
  "sub-invoice": { label: "Sub-invoice", icon: Receipt, cls: "bg-emerald-50 text-emerald-600" },
  po: { label: "Purchase order", icon: FileText, cls: "bg-amber-50 text-amber-600" },
  shipment: { label: "Shipment", icon: Truck, cls: "bg-orange-50 text-orange-600" },
  "sub-agreement": { label: "Sub-agreement", icon: Handshake, cls: "bg-indigo-50 text-indigo-600" },
  "technical-doc": { label: "Technical doc", icon: FileText, cls: "bg-sky-50 text-sky-600" },
  "rfp-document": { label: "RFP document", icon: FileText, cls: "bg-sky-50 text-sky-600" },
  "project-request": { label: "Request", icon: ClipboardList, cls: "bg-amber-50 text-amber-600" },
  "project-table": { label: "Table", icon: FileText, cls: "bg-slate-100 text-slate-500" },
  "proposal-template": { label: "Proposal template", icon: FileText, cls: "bg-indigo-50 text-indigo-600" },
  "proposal-revision": { label: "Proposal revision", icon: FileText, cls: "bg-indigo-50 text-indigo-600" },
  "resource-block": { label: "Resource block", icon: FileText, cls: "bg-slate-100 text-slate-500" },
  "sub-resume": { label: "Resume", icon: FileText, cls: "bg-slate-100 text-slate-500" },
  template: { label: "Template", icon: FileText, cls: "bg-slate-100 text-slate-500" },
  announcement: { label: "Announcement", icon: Megaphone, cls: "bg-rose-50 text-rose-600" },
  "board-task": { label: "Board task", icon: ClipboardList, cls: "bg-blue-50 text-blue-600" },
  "board-column": { label: "Board column", icon: ClipboardList, cls: "bg-blue-50 text-blue-600" },
  "procurement-section": { label: "Procurement section", icon: Package, cls: "bg-amber-50 text-amber-600" },
  "procurement-item": { label: "Procurement item", icon: Package, cls: "bg-amber-50 text-amber-600" },
  // CR-P (86) — a filed proposal revision (a frozen PDF from the proposals table), and other saved versions.
  "saved-proposal": { label: "Filed proposal", icon: FileText, cls: "bg-indigo-50 text-indigo-600" },
  "saved-document": { label: "Saved version", icon: FileText, cls: "bg-slate-100 text-slate-500" },
};
const metaFor = (k: string) => KIND_META[k] || { label: k, icon: FileText, cls: "bg-slate-100 text-slate-500" };

// CR-P (74) — the Category column says WHAT the item is: a PDF or a Word document rather than just
// "Document", and a vendor or a manufacturer rather than just "Company".
const FILE_KINDS = new Set(["document", "technical-doc", "rfp-document", "saved-document", "saved-proposal"]);
const fileType = (name: string): string => {
  const ext = ((name || "").includes(".") ? name.split(".").pop() || "" : "").toLowerCase();
  if (ext === "pdf") return "PDF document";
  if (["doc", "docx", "rtf", "odt"].includes(ext)) return "Word document";
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "Excel file";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(ext)) return "Image";
  if (["dwg", "dxf"].includes(ext)) return "Drawing";
  if (["zip", "rar", "7z"].includes(ext)) return "Compressed file";
  return "";
};
const categoryOf = (it: ApiBinItem): string => {
  const m = metaFor(it.kind);
  if (FILE_KINDS.has(it.kind)) return fileType(it.name) || m.label;
  if (it.kind === "company" || it.kind === "vendor") {
    const first = (it.subtitle || "").split(/[·,]/)[0].trim().toLowerCase();
    return COMPANY_CATEGORIES.find((c) => c.v === first)?.label || m.label;
  }
  return m.label;
};
const timeAgo = (iso?: string) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};

export default function RecycleBin() {
  useMeta({ title: "Archive & Recycle Bin", description: "Restore archived or deleted items across the platform." });
  const navigate = useNavigate();
  const { confirm, dialogs } = useDialogs();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: "archive" | "recycle" = searchParams.get("tab") === "recycle" ? "recycle" : "archive";
  const setTab = (t: "archive" | "recycle") => setSearchParams(t === "recycle" ? { tab: "recycle" } : {}, { replace: true });

  const [archive, setArchive] = useState<ApiBinItem[]>([]);
  const [recycle, setRecycle] = useState<ApiBinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, r] = await Promise.all([fetchArchiveItems().catch(() => []), fetchRecycleItems().catch(() => [])]);
      setArchive(a); setRecycle(r);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const items = tab === "archive" ? archive : recycle;

  // CR-P (73) — "Agreement restored. It should take us, it should give us like a link." A restore
  // that only says "done" leaves you hunting for where the thing went, so the toast carries an
  // Open action straight to it.
  const restoredToast = (it: ApiBinItem, link?: string) => {
    const where = link || it.link;
    toast(
      `${metaFor(it.kind).label} restored${it.origin ? ` to ${it.origin}` : ""}.`,
      "success",
      where ? { action: { label: "Open", onClick: () => navigate(where) } } : undefined,
    );
  };
  const restoreArchive = async (it: ApiBinItem) => {
    setBusy(it.id);
    try {
      const r = await restoreArchiveItem(it.kind, it.id, it.link || "");
      setArchive((p) => p.filter((x) => x.id !== it.id));
      restoredToast(it, r?.link);
    }
    catch (err) { toast(err instanceof Error ? err.message : "Could not restore.", "error"); }
    finally { setBusy(null); }
  };
  const restoreDeleted = async (it: ApiBinItem) => {
    setBusy(it.id);
    try {
      const r = await restoreRecycleItem(it.id);
      setRecycle((p) => p.filter((x) => x.id !== it.id));
      restoredToast(it, r?.link);
    }
    catch (err) { toast(err instanceof Error ? err.message : "Could not restore.", "error"); }
    finally { setBusy(null); }
  };
  const purge = async (it: ApiBinItem) => {
    if (!(await confirm({ title: "Delete permanently?", message: `"${it.name}" and its files will be permanently removed. This cannot be undone.`, confirmLabel: "Delete forever" }))) return;
    setBusy(it.id);
    try { await purgeRecycleItem(it.id); setRecycle((p) => p.filter((x) => x.id !== it.id)); toast("Permanently deleted.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not delete.", "error"); }
    finally { setBusy(null); }
  };

  const counts = useMemo(() => ({ archive: archive.length, recycle: recycle.length }), [archive, recycle]);

  return (
    // CR-P (74)/(75) — wider than the old card list, because it is a six-column table now.
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 flex items-center gap-2"><Trash2 className="text-primary" /> Archive &amp; Recycle Bin</h1>
        <p className="text-sm text-slate-500 mt-1">Restore anything you archived or deleted across the platform.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-max">
        {([["archive", "Archive", Archive, counts.archive], ["recycle", "Recycle Bin", Trash2, counts.recycle]] as const).map(([v, label, Icon, n]) => (
          <button key={v} onClick={() => setTab(v)} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${tab === v ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}>
            <Icon size={14} />{label}
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${tab === v ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{n}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-300"><Loader2 size={28} className="animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 bg-white rounded-[2rem] border border-slate-100">
          {tab === "archive" ? <Archive size={38} className="mb-3" /> : <Trash2 size={38} className="mb-3" />}
          <p className="font-bold text-sm">{tab === "archive" ? "Nothing archived." : "Recycle bin is empty."}</p>
          <p className="text-xs mt-1">{tab === "archive" ? "Archived projects, agreements, submittals, RFQs and companies show here." : "Deleted projects, agreements, documents and submittals show here."}</p>
        </div>
      ) : (
        // CR-P (74)/(75) — a table with a Category column and an Original location column.
        // "Add a column here to just categorize what is this... and then the second tab should be
        // original location, so before we restore it, I can find it."
        <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-10">#</th>
                <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Item</th>
                <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category</th>
                <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Original location</th>
                <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tab === "recycle" ? "Deleted" : "Last change"}</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((it, i) => {
                const m = metaFor(it.kind);
                return (
                  <tr key={`${it.kind}-${it.id}`} className="hover:bg-slate-50/40">
                    <td className="px-3 py-2.5 text-[11px] font-bold text-slate-400 tabular-nums align-top">{i + 1}</td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${m.cls}`}><m.icon size={14} /></span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate max-w-[18rem]" title={it.name}>{it.name}</p>
                          {it.subtitle && <p className="text-[10px] text-slate-400 truncate max-w-[18rem]">{it.subtitle}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${m.cls}`}>{categoryOf(it)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-600 align-top">
                      {it.origin || it.projectName || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-500 align-top whitespace-nowrap">
                      {tab === "recycle"
                        ? <>{it.deletedAt ? timeAgo(it.deletedAt) : "—"}{it.deletedByName ? <span className="block text-[10px] text-slate-400">by {it.deletedByName}</span> : null}</>
                        : (it.updatedAt ? timeAgo(it.updatedAt) : "—")}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex items-center gap-1.5 justify-end">
                        {it.link && (
                          <button onClick={() => navigate(it.link!)} title="Open where it lives" className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50"><ExternalLink size={15} /></button>
                        )}
                        <button
                          onClick={() => (tab === "archive" ? restoreArchive(it) : restoreDeleted(it))}
                          disabled={busy === it.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary disabled:opacity-50"
                        >
                          {busy === it.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Restore
                        </button>
                        {tab === "recycle" && (
                          <button onClick={() => purge(it)} disabled={busy === it.id} title="Delete permanently" className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50"><X size={16} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialogs}
    </div>
  );
}
