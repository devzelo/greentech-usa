import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import {
  Plus, Pencil, Trash2, Upload, Eye, Download, Loader2, FolderOpen,
  List as ListIcon, LayoutGrid, ChevronRight, Archive, RotateCcw,
} from "lucide-react";
import {
  fetchCompanyTabs, createCompanyTab, renameCompanyTab, deleteCompanyTab,
  fetchCompanyFiles, uploadCompanyFile, deleteCompanyFile, setCompanyFileArchived, companyFileUrl, updateCompanyFile,
  CompanyTab, CompanyFile,
} from "../../lib/api";
import { APPENDIX_LIBRARY } from "../../lib/proposalLibrary";
import { expiryInfo } from "../../lib/docExpiry";
import { createPortal } from "react-dom";

// Proposal step 4 - what a document is (Appendix Library type), its version and expiry, shown as a
// badge so an expiring insurance certificate is seen before it goes into a proposal.
const typeTitle = (key?: string) => APPENDIX_LIBRARY.find((a) => a.key === key)?.title || "";
function ExpiryBadge({ f }: { f: CompanyFile }) {
  const ex = expiryInfo(f.expiresAt);
  if (ex.state === "none") return null;
  return <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full ${ex.cls}`}>{ex.label}</span>;
}

function DocMetaDialog({ file, onClose, onSaved }: { file: CompanyFile; onClose: () => void; onSaved: (f: CompanyFile) => void }) {
  const [libraryKey, setLibraryKey] = useState(file.libraryKey || "");
  const [version, setVersion] = useState(file.version || "");
  const [expiresAt, setExpiresAt] = useState(file.expiresAt || "");
  const [busy, setBusy] = useState(false);
  const inp = "w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-primary/20";
  const save = async () => {
    setBusy(true);
    try { onSaved(await updateCompanyFile(file._id, { libraryKey, version: version.trim(), expiresAt })); toast("Saved.", "success"); onClose(); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not save.", "error"); }
    finally { setBusy(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[160] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Details for ${file.name}`} className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-16" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-3">
          <h3 className="font-display font-bold text-slate-900 text-base">Document details</h3>
          <p className="text-[11px] text-slate-400 truncate" title={file.name}>{file.name}</p>
        </div>
        <div className="px-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="doc-type" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Document type</label>
            <select id="doc-type" value={libraryKey} onChange={(e) => setLibraryKey(e.target.value)} className={`${inp} appearance-none`}>
              <option value="">Not set</option>
              {APPENDIX_LIBRARY.map((a) => <option key={a.key} value={a.key}>{a.title}</option>)}
            </select>
            <p className="text-[10px] text-slate-400">A proposal appendix of this type attaches the latest valid document automatically.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="doc-version" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Version</label>
              <input id="doc-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 2026" className={inp} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="doc-expiry" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Expires</label>
              <input id="doc-expiry" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inp} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-50">Cancel</button>
          <button onClick={() => void save()} disabled={busy} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary disabled:opacity-40">{busy ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
import { iconFor, colorFor, classifyForFilter, formatDate } from "./fileHelpers";
import DocumentViewer from "./DocumentViewer";
import ShareMenu from "./ShareMenu";
import { PromptDialog, ConfirmDialog } from "./Dialogs";
import { toast } from "../../lib/toast";
import { useTableSort, SortTh } from "../../lib/useTableSort";

export default function CompanyDocs({ kind = "company", banner }: { kind?: "company" | "classified"; banner?: ReactNode } = {}) {
  const [tabs, setTabs] = useState<CompanyTab[]>([]);
  const [loadingTabs, setLoadingTabs] = useState(true);
  const [activeMain, setActiveMain] = useState<string>("");
  const [activeSub, setActiveSub] = useState<string>("");
  const [files, setFiles] = useState<CompanyFile[]>([]);
  // CR 211 - the documents table sorts by any column.
  const sort = useTableSort<CompanyFile>(files, {
    name: (f) => f.name,
    description: (f) => f.description,
    type: (f) => f.libraryKey || f.fileType,
    addedBy: (f) => f.uploadedByName,
    date: (f) => f.createdAt,
  });
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [view, setView] = useState<"grid" | "list">("list");   // CR-P-07 — default to the list preview
  const [showArchived, setShowArchived] = useState(false); // CR-P-39
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ name: string; url: string; fileType: string } | null>(null);
  // Branded dialogs (replace browser prompt/confirm)
  const [tabDialog, setTabDialog] = useState<{ mode: "addMain" | "addSub" | "rename"; tab?: CompanyTab } | null>(null);
  const [confirmTab, setConfirmTab] = useState<CompanyTab | null>(null);
  const [confirmFile, setConfirmFile] = useState<CompanyFile | null>(null);
  const [metaFile, setMetaFile] = useState<CompanyFile | null>(null);   // proposal step 4 - type/version/expiry

  const mains = useMemo(() => tabs.filter((t) => !t.parentId), [tabs]);
  const subsOf = (parentId: string) => tabs.filter((t) => t.parentId === parentId);
  const activeSubs = useMemo(() => (activeMain ? subsOf(activeMain) : []), [tabs, activeMain]);
  // The tab whose files we show: a chosen sub-tab, or the main tab if it has none.
  const currentTabId = activeSubs.length > 0 ? activeSub : activeMain;
  const currentLabel = tabs.find((t) => t.tabId === currentTabId)?.label || "";

  const loadTabs = async (preferMain?: string) => {
    setLoadingTabs(true);
    try {
      const t = await fetchCompanyTabs(kind);
      setTabs(t);
      const firstMain = preferMain || t.find((x) => !x.parentId)?.tabId || "";
      setActiveMain((cur) => (cur && t.some((x) => x.tabId === cur) ? cur : firstMain));
    } finally {
      setLoadingTabs(false);
    }
  };

  useEffect(() => { loadTabs(); }, []);

  // When the active main changes, auto-select its first sub-tab (if any).
  useEffect(() => {
    const subs = activeMain ? tabs.filter((t) => t.parentId === activeMain) : [];
    setActiveSub(subs.length > 0 ? subs[0].tabId : "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMain, tabs.length]);

  // Load files whenever the resolved current tab changes.
  useEffect(() => {
    if (!currentTabId) { setFiles([]); return; }
    let cancelled = false;
    setLoadingFiles(true);
    fetchCompanyFiles({ kind, tab: currentTabId, archived: showArchived })
      .then((f) => { if (!cancelled) setFiles(f); })
      .catch(() => { if (!cancelled) setFiles([]); })
      .finally(() => { if (!cancelled) setLoadingFiles(false); });
    return () => { cancelled = true; };
  }, [currentTabId, showArchived]);

  const refreshFiles = async () => {
    if (!currentTabId) return;
    setFiles(await fetchCompanyFiles({ kind, tab: currentTabId, archived: showArchived }));
  };

  // CR-P-39 — archive / restore a file (leaves the current view).
  const archiveFile = async (f: CompanyFile, next: boolean) => {
    try {
      await setCompanyFileArchived(f._id, next);
      setFiles((prev) => prev.filter((x) => x._id !== f._id));
      toast(next ? "File archived." : "File restored.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
  };

  // ── Tab actions (driven by branded dialogs) ─────────────────────────────────
  const submitTabDialog = async (label: string) => {
    const dialog = tabDialog;
    if (!dialog) return;
    setTabDialog(null);
    try {
      if (dialog.mode === "rename" && dialog.tab) {
        if (label === dialog.tab.label) return;
        await renameCompanyTab(dialog.tab.tabId, label);
        await loadTabs(activeMain);
        toast("Renamed.", "success");
      } else if (dialog.mode === "addMain") {
        const tab = await createCompanyTab(label, "", kind);
        await loadTabs(tab.tabId);
        toast(`Added "${label}".`, "success");
      } else if (dialog.mode === "addSub" && activeMain) {
        const tab = await createCompanyTab(label, activeMain, kind);
        await loadTabs(activeMain);
        setActiveSub(tab.tabId);
        toast(`Added "${label}".`, "success");
      }
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save tab.", "error"); }
  };

  const confirmDeleteTab = async () => {
    const tab = confirmTab;
    if (!tab) return;
    setConfirmTab(null);
    const isMain = !tab.parentId;
    try {
      await deleteCompanyTab(tab.tabId);
      await loadTabs(isMain ? "" : activeMain);
      toast(`Deleted "${tab.label}".`, "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not delete.", "error"); }
  };

  // ── File actions ─────────────────────────────────────────────────────────
  const handleUpload = async (file: File) => {
    if (!currentTabId) { toast("Pick a tab first.", "info"); return; }
    setUploading(true);
    try {
      await uploadCompanyFile(file, { kind, tabId: currentTabId });
      await refreshFiles();
      toast("File uploaded.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
    finally { setUploading(false); }
  };

  const confirmDeleteFile = async () => {
    const f = confirmFile;
    if (!f) return;
    setConfirmFile(null);
    try {
      await deleteCompanyFile(f._id);
      setFiles((prev) => prev.filter((x) => x._id !== f._id));
      toast("File removed.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not delete.", "error"); }
  };

  const openPreview = (f: CompanyFile) =>
    setPreview({ name: f.name, url: companyFileUrl(f), fileType: f.fileType || (f.name.split(".").pop() || "") });

  if (loadingTabs) {
    return <div className="flex items-center justify-center py-32 text-slate-300"><Loader2 size={32} className="animate-spin" /></div>;
  }

  const activeMainTab = tabs.find((t) => t.tabId === activeMain);
  const activeSubTab = tabs.find((t) => t.tabId === activeSub);

  return (
    <div className="space-y-5">
      {banner}
      {/* Main tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {mains.map((t) => (
          <div key={t.tabId} className="flex items-center group">
            <button
              onClick={() => setActiveMain(t.tabId)}
              className={`flex items-center gap-2 pl-4 pr-3 py-2.5 rounded-xl text-xs font-bold transition-all ${activeMain === t.tabId ? "bg-slate-900 text-white shadow" : "bg-white border border-slate-100 text-slate-500 hover:text-slate-900"}`}
            >
              <FolderOpen size={14} /> {t.label}
              {activeMain === t.tabId && (
                <span className="flex items-center gap-0.5 ml-1">
                  <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setTabDialog({ mode: "rename", tab: t }); }} className="p-0.5 rounded hover:bg-white/20" title="Rename"><Pencil size={11} /></span>
                  <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setConfirmTab(t); }} className="p-0.5 rounded hover:bg-white/20" title="Delete"><Trash2 size={11} /></span>
                </span>
              )}
            </button>
          </div>
        ))}
        <button onClick={() => setTabDialog({ mode: "addMain" })} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-primary border border-dashed border-primary/30 hover:bg-primary/5">
          <Plus size={14} /> New tab
        </button>
      </div>

      {/* Sub tabs (for the active main) */}
      {activeMain && (
        <div className="flex items-center gap-2 flex-wrap pl-1">
          <ChevronRight size={14} className="text-slate-300" />
          {activeSubs.map((t) => (
            <button
              key={t.tabId}
              onClick={() => setActiveSub(t.tabId)}
              className={`flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${activeSub === t.tabId ? "bg-primary text-white" : "bg-slate-100 text-slate-500 hover:text-slate-900"}`}
            >
              {t.label}
              {activeSub === t.tabId && (
                <span className="flex items-center gap-0.5">
                  <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setTabDialog({ mode: "rename", tab: t }); }} className="p-0.5 rounded hover:bg-white/20" title="Rename"><Pencil size={10} /></span>
                  <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setConfirmTab(t); }} className="p-0.5 rounded hover:bg-white/20" title="Delete"><Trash2 size={10} /></span>
                </span>
              )}
            </button>
          ))}
          <button onClick={() => setTabDialog({ mode: "addSub" })} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-primary border border-dashed border-primary/30 hover:bg-primary/5">
            <Plus size={12} /> Sub-tab
          </button>
        </div>
      )}

      {/* Files toolbar */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <h2 className="text-lg font-display font-bold text-slate-900">
          {currentLabel ? `${activeMainTab?.label}${activeSubTab && activeSubTab.tabId !== activeMain ? ` › ${activeSubTab.label}` : ""}` : (kind === "classified" ? "Classified Files" : "Company Files")}
          <span className="text-slate-400 ml-2 text-sm font-medium">({files.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          {/* CR-P-39 — view archived files */}
          <button onClick={() => setShowArchived((v) => !v)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border shadow-sm transition-all ${showArchived ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-400 border-slate-100 hover:text-slate-900"}`} title={showArchived ? "Back to active files" : "Show archived files"}>
            <Archive size={13} /> {showArchived ? "Viewing archived" : "Archived"}
          </button>
          {!showArchived && (
          <label className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${currentTabId ? "bg-gt-gradient text-white shadow-lg shadow-primary/20 hover:scale-105" : "bg-slate-100 text-slate-300 cursor-not-allowed"}`}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
            <input type="file" className="hidden" disabled={!currentTabId || uploading} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleUpload(f); }} />
          </label>
          )}
          <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-slate-100">
            {([{ id: "grid", Icon: LayoutGrid }, { id: "list", Icon: ListIcon }] as const).map(({ id, Icon }) => (
              <button key={id} onClick={() => setView(id)} className={`p-2 rounded-lg transition-all ${view === id ? "bg-slate-900 text-white" : "text-slate-400 hover:text-slate-900"}`}>
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Files */}
      {loadingFiles ? (
        <div className="flex items-center justify-center py-24 text-slate-300"><Loader2 size={28} className="animate-spin" /></div>
      ) : !currentTabId ? (
        <div className="text-center py-20 text-slate-400 text-sm font-medium">Select or create a tab to see its files.</div>
      ) : files.length === 0 ? (
        <div className="text-center py-20 text-slate-400 text-sm font-medium">No files in this tab yet. Use Upload to add one.</div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map((f) => {
            const isImage = classifyForFilter(f.fileType) === "image";
            return (
              <div key={f._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col group">
                <button onClick={() => openPreview(f)} className="aspect-[16/9] bg-slate-50 flex items-center justify-center overflow-hidden">
                  {isImage ? (
                    <img src={companyFileUrl(f)} alt={f.name} className="w-full h-full object-contain p-5 group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${colorFor(f.fileType)}`}>{iconFor(f.fileType)}</div>
                  )}
                </button>
                <div className="p-4 flex flex-col gap-1.5 flex-grow">
                  <p className="font-bold text-sm text-slate-900 line-clamp-1 break-all">{f.name}</p>
                  {!!f.description && <p className="text-xs text-slate-500 line-clamp-2 flex-grow">{f.description}</p>}
                  {(!!f.libraryKey || !!f.expiresAt) && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {!!f.libraryKey && <span className="text-[10px] font-bold text-slate-500">{typeTitle(f.libraryKey)}{f.version ? ` · v${f.version}` : ""}</span>}
                      <ExpiryBadge f={f} />
                    </div>
                  )}
                  <div className="flex items-center gap-1 pt-2 mt-auto border-t border-slate-50">
                    <button onClick={() => openPreview(f)} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-primary px-2 py-1"><Eye size={14} /> Preview</button>
                    <a href={companyFileUrl(f)} download={f.name} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50" title="Download"><Download size={14} /></a>
                    <ShareMenu fileName={f.name} fileUrl={companyFileUrl(f)} size={14} />
                    <button onClick={() => setMetaFile(f)} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50" title="Type, version and expiry"><Pencil size={14} /></button>
                    <button onClick={() => archiveFile(f, !f.archived)} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-50" title={f.archived ? "Restore" : "Archive"}>{f.archived ? <RotateCcw size={14} /> : <Archive size={14} />}</button>
                    <button onClick={() => setConfirmFile(f)} className="ml-auto p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-slate-50" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-50">
                  {/* CR 211 - every column sorts. */}
                  <SortTh sort={sort} className="w-12">#</SortTh>
                  <SortTh sort={sort} col="name">Name</SortTh>
                  <SortTh sort={sort} col="description">Description</SortTh>
                  <SortTh sort={sort} col="type">Type &amp; expiry</SortTh>
                  <SortTh sort={sort} col="addedBy">Added by</SortTh>
                  <SortTh sort={sort} col="date">Date</SortTh>
                  <SortTh sort={sort} align="right">Actions</SortTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sort.rows.map((f, i) => (
                  <tr key={f._id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-xs font-bold text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colorFor(f.fileType)}`}>{iconFor(f.fileType)}</div>
                        <button onClick={() => openPreview(f)} className="font-bold text-sm text-slate-900 group-hover:text-primary text-left truncate">{f.name}</button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">{f.description || "—"}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-1">
                        {f.libraryKey ? <span className="text-[11px] font-bold text-slate-600">{typeTitle(f.libraryKey)}{f.version ? ` · v${f.version}` : ""}</span> : <span className="text-[11px] text-slate-300">Not set</span>}
                        <ExpiryBadge f={f} />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-400">{f.uploadedByName || "—"}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">{f.createdAt ? formatDate(f.createdAt) : "—"}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openPreview(f)} className="p-2 rounded-lg hover:bg-white text-slate-400 hover:text-primary" title="Preview"><Eye size={16} /></button>
                        <a href={companyFileUrl(f)} download={f.name} className="p-2 rounded-lg hover:bg-white text-slate-400 hover:text-primary" title="Download"><Download size={16} /></a>
                        <ShareMenu fileName={f.name} fileUrl={companyFileUrl(f)} size={16} />
                        <button onClick={() => setMetaFile(f)} className="p-2 rounded-lg hover:bg-white text-slate-400 hover:text-primary" title="Type, version and expiry"><Pencil size={16} /></button>
                        <button onClick={() => archiveFile(f, !f.archived)} className="p-2 rounded-lg hover:bg-white text-slate-400 hover:text-amber-600" title={f.archived ? "Restore" : "Archive"}>{f.archived ? <RotateCcw size={16} /> : <Archive size={16} />}</button>
                        <button onClick={() => setConfirmFile(f)} className="p-2 rounded-lg hover:bg-white text-slate-400 hover:text-red-500" title="Delete"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {preview && <DocumentViewer doc={preview} onClose={() => setPreview(null)} />}
      </AnimatePresence>

      {metaFile && (
        <DocMetaDialog file={metaFile} onClose={() => setMetaFile(null)} onSaved={(nf) => setFiles((prev) => prev.map((x) => (x._id === nf._id ? { ...x, ...nf } : x)))} />
      )}

      <PromptDialog
        open={!!tabDialog}
        title={tabDialog?.mode === "rename" ? "Rename Tab" : tabDialog?.mode === "addSub" ? "Add Sub-tab" : "Add Main Tab"}
        label="Tab Name"
        placeholder="e.g. Insurance Certificates"
        initialValue={tabDialog?.mode === "rename" ? tabDialog.tab?.label || "" : ""}
        confirmLabel={tabDialog?.mode === "rename" ? "Save" : "Add"}
        onCancel={() => setTabDialog(null)}
        onSubmit={submitTabDialog}
      />
      <ConfirmDialog
        open={!!confirmTab}
        title={`Delete "${confirmTab?.label || ""}"?`}
        message={confirmTab && !confirmTab.parentId ? "This removes the tab, all its sub-tabs, and their files. This cannot be undone." : "This removes the tab and its files. This cannot be undone."}
        confirmLabel="Delete tab"
        onCancel={() => setConfirmTab(null)}
        onConfirm={confirmDeleteTab}
      />
      <ConfirmDialog
        open={!!confirmFile}
        title={`Delete "${confirmFile?.name || ""}"?`}
        message="This file will be permanently removed."
        confirmLabel="Delete file"
        onCancel={() => setConfirmFile(null)}
        onConfirm={confirmDeleteFile}
      />
    </div>
  );
}
