import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Archive, Trash2, RotateCcw, Loader2, Briefcase, Handshake, FileText, ClipboardList,
  Package, Building2, ExternalLink, X,
} from "lucide-react";
import {
  fetchArchiveItems, fetchRecycleItems, restoreArchiveItem, restoreRecycleItem, purgeRecycleItem,
  type ApiBinItem,
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
};
const metaFor = (k: string) => KIND_META[k] || { label: k, icon: FileText, cls: "bg-slate-100 text-slate-500" };
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

  const restoreArchive = async (it: ApiBinItem) => {
    setBusy(it.id);
    try { await restoreArchiveItem(it.kind, it.id); setArchive((p) => p.filter((x) => x.id !== it.id)); toast(`${metaFor(it.kind).label} restored.`, "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not restore.", "error"); }
    finally { setBusy(null); }
  };
  const restoreDeleted = async (it: ApiBinItem) => {
    setBusy(it.id);
    try { await restoreRecycleItem(it.id); setRecycle((p) => p.filter((x) => x.id !== it.id)); toast(`${metaFor(it.kind).label} restored.`, "success"); }
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
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-primary mb-2"><Archive size={18} /><span className="text-xs font-bold uppercase tracking-widest">Archive & Recycle Bin</span></div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">Archive &amp; Recycle Bin</h1>
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
        <div className="space-y-2">
          {items.map((it) => {
            const m = metaFor(it.kind);
            return (
              <div key={`${it.kind}-${it.id}`} className="bg-white rounded-2xl border border-slate-100 p-3 sm:p-4 flex items-center gap-3">
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${m.cls}`}><m.icon size={16} /></span>
                <div className="min-w-0 flex-grow">
                  <p className="text-sm font-bold text-slate-800 truncate">{it.name}</p>
                  <p className="text-[10px] text-slate-400 font-medium truncate">
                    <span className="uppercase tracking-widest font-bold">{m.label}</span>
                    {it.projectName ? ` · ${it.projectName}` : ""}
                    {tab === "recycle" ? `${it.deletedByName ? ` · by ${it.deletedByName}` : ""}${it.deletedAt ? ` · ${timeAgo(it.deletedAt)}` : ""}` : (it.subtitle ? ` · ${it.subtitle}` : "")}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {tab === "archive" && it.link && (
                    <button onClick={() => navigate(it.link!)} title="Open" className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50"><ExternalLink size={15} /></button>
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
              </div>
            );
          })}
        </div>
      )}

      {dialogs}
    </div>
  );
}
