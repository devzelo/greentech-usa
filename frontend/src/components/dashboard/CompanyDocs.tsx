import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useUrlState } from "../../hooks/useUrlState";
import { AnimatePresence } from "motion/react";
import {
  Plus, Pencil, Trash2, Upload, Eye, Download, Loader2, FolderOpen,
  List as ListIcon, LayoutGrid, ChevronRight, Archive, RotateCcw, KeyRound, Folder, FolderPlus, FolderUp, CornerLeftUp,
} from "lucide-react";
import {
  fetchCompanyTabs, createCompanyTab, renameCompanyTab, deleteCompanyTab,
  fetchCompanyFiles, uploadCompanyFile, deleteCompanyFile, setCompanyFileArchived, companyFileUrl, updateCompanyFile,
  createCompanyFolder, renameCompanyFolder, deleteCompanyFolder,
  CompanyTab, CompanyFile,
} from "../../lib/api";
import { APPENDIX_LIBRARY } from "../../lib/proposalLibrary";
import { expiryInfo } from "../../lib/docExpiry";
import { createPortal } from "react-dom";

// CR 306 - folder paths inside a tab ("A/B": B inside A).
const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const nameOf = (p: string) => p.split("/").pop() || p;
const within = (folder: string, root: string) => folder === root || folder.startsWith(`${root}/`);

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

export default function CompanyDocs({ kind = "company", banner, focus }: {
  kind?: "company" | "classified";
  banner?: ReactNode;
  /** CR 292 - a file the global search sent us to: open its tab and flash its row. */
  focus?: { fileId: string; tabId: string } | null;
} = {}) {
  // CR 263 - the website credentials sit beside the sub-tabs, on the classified page only.
  const [tabs, setTabs] = useState<CompanyTab[]>([]);
  const [loadingTabs, setLoadingTabs] = useState(true);
  const [files, setFiles] = useState<CompanyFile[]>([]);
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
  /**
   * CR 305 (2026-09-25): the open tab and sub-tab are in the address (?ct= and ?cs=), so a refresh
   * keeps you in, say, Insurance, and Back returns to the tab you came from. A tab that no longer
   * exists falls back to the first one.
   */
  const url = useUrlState();
  const ctParam = url.get("ct"), csParam = url.get("cs");
  const activeMain = mains.some((t) => t.tabId === ctParam) ? ctParam : (mains[0]?.tabId || "");
  const activeSubs = useMemo(() => (activeMain ? subsOf(activeMain) : []), [tabs, activeMain]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeSub = activeSubs.some((t) => t.tabId === csParam) ? csParam : (activeSubs[0]?.tabId || "");
  const setActiveMain = (id: string) => url.set({ ct: id, cs: "", cf: "" });
  const setActiveSub = (id: string) => url.set({ ct: activeMain, cs: id, cf: "" });
  // The tab whose files we show: a chosen sub-tab, or the main tab if it has none.
  const currentTabId = activeSubs.length > 0 ? activeSub : activeMain;
  const currentLabel = tabs.find((t) => t.tabId === currentTabId)?.label || "";

  /**
   * CR 306 (2026-09-25): folders inside a tab. The folder you are in is in the address too (?cf=),
   * with its path shown and each level clickable. Folders come from the tab's own list (made with
   * New folder) and from the files' folders (an uploaded folder brings its own).
   */
  const folder = url.get("cf");
  const openFolder = (f: string) => url.set({ cf: f });
  const curTab = tabs.find((t) => t.tabId === currentTabId);
  const allFolders = useMemo(() => {
    const out = new Set<string>();
    const add = (path: string) => { const parts = path.split("/"); for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join("/")); };
    (curTab?.folders || []).forEach(add);
    files.forEach((f) => { if (f.folder) add(f.folder); });
    return out;
  }, [curTab, files]);
  const childFolders = useMemo(
    () => [...allFolders].filter((p) => parentOf(p) === folder).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [allFolders, folder],
  );
  const filesIn = (path: string) => files.filter((f) => within(f.folder || "", path)).length;
  const here = useMemo(() => files.filter((f) => (f.folder || "") === folder), [files, folder]);
  // CR 211 - the documents table sorts by any column.
  const sort = useTableSort<CompanyFile>(here, {
    name: (f) => f.name,
    description: (f) => f.description,
    type: (f) => f.libraryKey || f.fileType,
    addedBy: (f) => f.uploadedByName,
    date: (f) => f.createdAt,
  });
  const [folderDialog, setFolderDialog] = useState<{ mode: "new" | "rename"; path?: string } | null>(null);
  const [confirmFolder, setConfirmFolder] = useState("");
  const [folderProgress, setFolderProgress] = useState("");
  const replaceTab = (t: CompanyTab) => setTabs((prev) => prev.map((x) => (x.tabId === t.tabId ? t : x)));

  const loadTabs = async (preferMain?: string) => {
    setLoadingTabs(true);
    try {
      const t = await fetchCompanyTabs(kind);
      setTabs(t);
      // A tab just added opens; otherwise the address keeps what was open.
      if (preferMain && preferMain !== ctParam) url.set({ ct: preferMain, cs: "" });
    } finally {
      setLoadingTabs(false);
    }
  };

  useEffect(() => { loadTabs(); }, []);

  // CR 292 - arriving from the search: select the tab the file is filed under, then mark the row.
  const [flashId, setFlashId] = useState("");
  useEffect(() => {
    if (!focus?.tabId || !tabs.length) return;
    const tab = tabs.find((t) => t.tabId === focus.tabId);
    if (!tab) return;
    url.set(tab.parentId ? { ct: tab.parentId, cs: tab.tabId, cf: "" } : { ct: tab.tabId, cs: "", cf: "" }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.tabId, tabs]);
  useEffect(() => {
    const hit = focus?.fileId ? files.find((f) => f._id === focus.fileId) : undefined;
    if (!hit) return;
    // The file may sit in a folder: open it first so the row is there to flash.
    if ((hit.folder || "") !== folder) url.set({ cf: hit.folder || "" }, { replace: true });
    setFlashId(hit._id);
    const t1 = setTimeout(() => document.getElementById(`cfile-${focus.fileId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    const t2 = setTimeout(() => setFlashId(""), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [focus?.fileId, files]);

  // A main tab opens on its first sub-tab: worked out from the address, no effect needed.

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
        await loadTabs();
        toast("Renamed.", "success");
      } else if (dialog.mode === "addMain") {
        const tab = await createCompanyTab(label, "", kind);
        await loadTabs(tab.tabId);
        toast(`Added "${label}".`, "success");
      } else if (dialog.mode === "addSub" && activeMain) {
        const tab = await createCompanyTab(label, activeMain, kind);
        await loadTabs();
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
      await loadTabs();
      // The deleted tab leaves the address; the first remaining one opens in its place.
      if (isMain ? tab.tabId === activeMain : tab.tabId === activeSub) url.set(isMain ? { ct: "", cs: "", cf: "" } : { cs: "", cf: "" }, { replace: true });
      toast(`Deleted "${tab.label}".`, "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not delete.", "error"); }
  };

  // ── File actions ─────────────────────────────────────────────────────────
  // Into the folder you are in; several at once.
  const handleUpload = async (list: File[]) => {
    if (!currentTabId) { toast("Pick a tab first.", "info"); return; }
    if (!list.length) return;
    setUploading(true);
    try {
      for (let i = 0; i < list.length; i++) {
        if (list.length > 1) setFolderProgress(`Uploading ${i + 1} of ${list.length}`);
        await uploadCompanyFile(list[i], { kind, tabId: currentTabId, folder });
      }
      await refreshFiles();
      toast(list.length === 1 ? "File uploaded." : `${list.length} files uploaded.`, "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
    finally { setUploading(false); setFolderProgress(""); }
  };
  /**
   * CR 306 - Upload folder: every file in the chosen folder and its subfolders, each landing in
   * the same folder here (inside the one you are in). System clutter (.DS_Store, Thumbs.db) stays out.
   */
  const handleFolderUpload = async (list: File[]) => {
    if (!currentTabId || !list.length) return;
    const wanted = list.filter((f) => !/^(\.ds_store|thumbs\.db|desktop\.ini)$/i.test(f.name) && !f.name.startsWith("~$"));
    if (!wanted.length) { toast("That folder has no files to upload.", "info"); return; }
    if (wanted.length > 300) { toast(`That folder has ${wanted.length} files; upload up to 300 at a time.`, "error"); return; }
    const top = (wanted[0].webkitRelativePath || "").split("/")[0] || "";
    setUploading(true);
    let done = 0;
    try {
      for (const f of wanted) {
        const dir = (f.webkitRelativePath || f.name).split("/").slice(0, -1).join("/");
        setFolderProgress(`Uploading ${done + 1} of ${wanted.length}`);
        await uploadCompanyFile(f, { kind, tabId: currentTabId, folder: [folder, dir].filter(Boolean).join("/") });
        done++;
      }
      await refreshFiles();
      toast(`${done} file${done === 1 ? "" : "s"} uploaded${top ? ` into "${top}"` : ""}.`, "success");
    } catch (err) {
      await refreshFiles().catch(() => undefined);
      toast(`${done} of ${wanted.length} uploaded. ${err instanceof Error ? err.message : "The rest failed."}`, "error");
    } finally { setUploading(false); setFolderProgress(""); }
  };
  const submitFolderDialog = async (name: string) => {
    const d = folderDialog;
    setFolderDialog(null);
    if (!d || !currentTabId) return;
    const clean = name.replace(/[\\/]+/g, " ").trim();
    if (!clean) return;
    try {
      if (d.mode === "new") {
        const path = [folder, clean].filter(Boolean).join("/");
        replaceTab(await createCompanyFolder(currentTabId, path));
        toast(`Folder "${clean}" made. Open it to upload into it.`, "success");
      } else if (d.path) {
        const to = [parentOf(d.path), clean].filter(Boolean).join("/");
        if (to === d.path) return;
        replaceTab(await renameCompanyFolder(currentTabId, d.path, to));
        await refreshFiles();
        toast("Folder renamed.", "success");
      }
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save the folder.", "error"); }
  };
  const removeFolder = async () => {
    const path = confirmFolder;
    setConfirmFolder("");
    if (!path || !currentTabId) return;
    try {
      replaceTab(await deleteCompanyFolder(currentTabId, path));
      toast("Folder removed.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not remove the folder.", "error"); }
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
      {/* CR 305 - where you are, as a path: Documents > Company documents > Insurance > Policies. */}
      <nav aria-label="Path" className="flex flex-wrap items-center gap-1 text-[11px] font-bold text-slate-400">
        <span>Documents</span>
        <ChevronRight size={12} className="text-slate-300" />
        <span className={activeMainTab ? "" : "text-slate-700"}>{kind === "classified" ? "Classified documents" : "Company documents"}</span>
        {activeMainTab && (
          <>
            <ChevronRight size={12} className="text-slate-300" />
            <span className={activeSubTab ? "" : "text-slate-700"}>{activeMainTab.label}</span>
          </>
        )}
        {activeSubTab && (<><ChevronRight size={12} className="text-slate-300" />
          {folder
            ? <button type="button" onClick={() => openFolder("")} className="rounded px-1 hover:bg-slate-100 hover:text-slate-700">{activeSubTab.label}</button>
            : <span className="text-slate-700">{activeSubTab.label}</span>}
        </>)}
        {!activeSubTab && activeMainTab && folder && <button type="button" onClick={() => openFolder("")} className="rounded px-1 hover:bg-slate-100 hover:text-slate-700">(top)</button>}
        {folder && folder.split("/").map((part, i, all) => {
          const path = all.slice(0, i + 1).join("/");
          return (
            <span key={path} className="inline-flex items-center gap-1">
              <ChevronRight size={12} className="text-slate-300" />
              {i < all.length - 1
                ? <button type="button" onClick={() => openFolder(path)} className="rounded px-1 hover:bg-slate-100 hover:text-slate-700">{part}</button>
                : <span className="inline-flex items-center gap-1 text-slate-700"><Folder size={11} /> {part}</span>}
            </span>
          );
        })}
      </nav>
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

      {/* CR 366 - the files have the whole width; the website credentials open from a button beside
          the PIN (Documents, Classified). */}
      <div>
      <div className="min-w-0 space-y-5">
      {/* Files toolbar */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <h2 className="text-lg font-display font-bold text-slate-900">
          {folder ? folder.split("/").pop() : currentLabel ? `${activeMainTab?.label}${activeSubTab && activeSubTab.tabId !== activeMain ? ` › ${activeSubTab.label}` : ""}` : (kind === "classified" ? "Classified Files" : "Company Files")}
          <span className="text-slate-400 ml-2 text-sm font-medium">({here.length})</span>
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {folder && (
            <button onClick={() => openFolder(parentOf(folder))} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border border-slate-100 bg-white text-slate-500 shadow-sm hover:text-slate-900" title="Up one folder">
              <CornerLeftUp size={13} /> Up
            </button>
          )}
          {folderProgress && <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary"><Loader2 size={12} className="animate-spin" /> {folderProgress}</span>}
          {!showArchived && currentTabId && (
            <>
              <button onClick={() => setFolderDialog({ mode: "new" })} disabled={uploading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border border-slate-100 bg-white text-slate-600 shadow-sm hover:text-primary disabled:opacity-50" title={folder ? `New folder inside "${folder.split("/").pop()}"` : "New folder in this tab"}>
                <FolderPlus size={13} /> New folder
              </button>
              <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border shadow-sm cursor-pointer ${uploading ? "border-slate-100 bg-slate-100 text-slate-300" : "border-slate-100 bg-white text-slate-600 hover:text-primary"}`} title="Upload a whole folder, keeping its subfolders">
                <FolderUp size={13} /> Upload folder
                {/* webkitdirectory lets the browser pick a folder; its files come with their paths. */}
                <input type="file" className="hidden" multiple disabled={uploading}
                  ref={(el) => { if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); } }}
                  onChange={(e) => { const l = Array.from<File>(e.target.files || []); e.target.value = ""; void handleFolderUpload(l); }} />
              </label>
            </>
          )}
          {/* CR-P-39 — view archived files */}
          <button onClick={() => setShowArchived((v) => !v)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border shadow-sm transition-all ${showArchived ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-400 border-slate-100 hover:text-slate-900"}`} title={showArchived ? "Back to active files" : "Show archived files"}>
            <Archive size={13} /> {showArchived ? "Viewing archived" : "Archived"}
          </button>
          {!showArchived && (
          <label className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${currentTabId ? "bg-gt-gradient text-white shadow-lg shadow-primary/20 hover:scale-105" : "bg-slate-100 text-slate-300 cursor-not-allowed"}`}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
            <input type="file" multiple className="hidden" disabled={!currentTabId || uploading} onChange={(e) => { const l = Array.from<File>(e.target.files || []); e.target.value = ""; void handleUpload(l); }} />
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

      {/* CR 306 - the folders in the folder you are in */}
      {!loadingFiles && currentTabId && childFolders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {childFolders.map((path) => {
            const n = filesIn(path);
            return (
              <div key={path} className="group flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm hover:border-primary/40">
                <button type="button" onClick={() => openFolder(path)} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={`Open ${path}`}>
                  <Folder size={20} className="shrink-0 text-amber-500" fill="currentColor" fillOpacity={0.15} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-slate-800">{nameOf(path)}</span>
                    <span className="block text-[10px] text-slate-400">{n} file{n === 1 ? "" : "s"}</span>
                  </span>
                </button>
                <span className="flex shrink-0 items-center opacity-60 group-hover:opacity-100">
                  <button type="button" onClick={() => setFolderDialog({ mode: "rename", path })} className="rounded p-1 text-slate-400 hover:text-primary" title="Rename folder"><Pencil size={12} /></button>
                  <button type="button" onClick={() => setConfirmFolder(path)} className="rounded p-1 text-slate-400 hover:text-red-500" title={n ? "Only an empty folder can be removed" : "Remove folder"}><Trash2 size={12} /></button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Files */}
      {loadingFiles ? (
        <div className="flex items-center justify-center py-24 text-slate-300"><Loader2 size={28} className="animate-spin" /></div>
      ) : !currentTabId ? (
        <div className="text-center py-20 text-slate-400 text-sm font-medium">Select or create a tab to see its files.</div>
      ) : here.length === 0 ? (
        childFolders.length ? null : <div className="text-center py-20 text-slate-400 text-sm font-medium">{folder ? "This folder is empty. Use Upload or Upload folder to add files here." : "No files in this tab yet. Use Upload, Upload folder or New folder."}</div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {here.map((f) => {
            const isImage = classifyForFilter(f.fileType) === "image";
            return (
              <div key={f._id} id={`cfile-${f._id}`} className={`bg-white rounded-2xl border shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col group ${flashId === f._id ? "border-amber-300 ring-2 ring-amber-300" : "border-slate-100"}`}>
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
                  <tr key={f._id} id={`cfile-${f._id}`} className={`group transition-colors ${flashId === f._id ? "bg-amber-50 ring-2 ring-amber-300" : "hover:bg-slate-50/50"}`}>
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
                    {/* CR 365 - the actions stay in view on the right, with a Delete that says so. */}
                    <td className={`sticky right-0 px-4 py-4 text-right ${flashId === f._id ? "bg-amber-50" : "bg-white group-hover:bg-slate-50"}`}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openPreview(f)} className="p-2 rounded-lg hover:bg-white text-slate-400 hover:text-primary" title="Preview"><Eye size={16} /></button>
                        <a href={companyFileUrl(f)} download={f.name} className="p-2 rounded-lg hover:bg-white text-slate-400 hover:text-primary" title="Download"><Download size={16} /></a>
                        <ShareMenu fileName={f.name} fileUrl={companyFileUrl(f)} size={16} />
                        <button onClick={() => setMetaFile(f)} className="p-2 rounded-lg hover:bg-white text-slate-400 hover:text-primary" title="Type, version and expiry"><Pencil size={16} /></button>
                        <button onClick={() => archiveFile(f, !f.archived)} className="p-2 rounded-lg hover:bg-white text-slate-400 hover:text-amber-600" title={f.archived ? "Restore" : "Archive"}>{f.archived ? <RotateCcw size={16} /> : <Archive size={16} />}</button>
                        <button onClick={() => setConfirmFile(f)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-red-500 hover:bg-red-50" title="Delete"><Trash2 size={14} /> Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </div>
      </div>

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
      <PromptDialog
        open={!!folderDialog}
        title={folderDialog?.mode === "rename" ? "Rename folder" : "New folder"}
        label="Folder name"
        placeholder="e.g. Chase Bank"
        initialValue={folderDialog?.mode === "rename" ? nameOf(folderDialog.path || "") : ""}
        confirmLabel={folderDialog?.mode === "rename" ? "Save" : "Make folder"}
        onCancel={() => setFolderDialog(null)}
        onSubmit={submitFolderDialog}
      />
      <ConfirmDialog
        open={!!confirmFolder}
        title={`Remove the folder "${nameOf(confirmFolder)}"?`}
        message={filesIn(confirmFolder) ? `It still holds ${filesIn(confirmFolder)} file(s). Move or delete them first; only an empty folder can be removed.` : "The folder is empty, so nothing else is removed."}
        confirmLabel="Remove folder"
        onCancel={() => setConfirmFolder("")}
        onConfirm={removeFolder}
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
