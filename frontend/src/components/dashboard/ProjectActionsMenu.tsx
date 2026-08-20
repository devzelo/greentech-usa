import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, FolderOpen, Link2, Copy, Archive, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { setProjectArchived, createProject, deleteProject, type ApiProject } from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";

// The 3-dot actions menu on project rows/cards (CR-P-26): Open, Copy link, Duplicate, Archive/
// Restore, Delete. Staff-only actions are hidden when !canManage.
export default function ProjectActionsMenu({
  project, canManage, archivedView, onMutate, variant = "button",
}: {
  project: ApiProject;
  canManage: boolean;
  archivedView: boolean;
  onMutate: (updater: (prev: ApiProject[]) => ApiProject[]) => void;
  variant?: "button" | "overlay";
}) {
  const navigate = useNavigate();
  const { confirm, dialogs } = useDialogs();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => setOpen(false);

  const copyLink = async () => {
    close();
    const url = `${window.location.origin}/dashboard/projects/${project.id}`;
    try { await navigator.clipboard.writeText(url); toast("Project link copied.", "success"); }
    catch { toast(url, "info"); }
  };

  const duplicate = async () => {
    close();
    setBusy(true);
    try {
      const dup = await createProject({
        name: `${project.name} (copy)`,
        category: project.category, contractNo: "", contractYear: project.contractYear, contractDate: project.contractDate,
        status: "Draft" as ApiProject["status"], location: project.location, siteAddress: project.siteAddress,
        description: project.description, value: project.value, fiscal: project.fiscal, compliance: project.compliance,
        disciplines: project.disciplines, projectNature: project.projectNature, clientInfo: project.clientInfo,
        jointVenture: project.jointVenture,
      });
      onMutate((prev) => [dup, ...prev]);
      toast("Project duplicated as a draft.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not duplicate.", "error"); }
    finally { setBusy(false); }
  };

  const toggleArchive = async () => {
    close();
    const next = !project.archived;
    setBusy(true);
    try {
      const u = await setProjectArchived(project.id, next);
      // Leaves the current view if it no longer belongs (archived vs active).
      if (u.archived !== archivedView) onMutate((prev) => prev.filter((x) => x.id !== project.id));
      else onMutate((prev) => prev.map((x) => (x.id === project.id ? u : x)));
      toast(next ? "Project archived." : "Project restored.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    close();
    if (!(await confirm({ title: "Delete project?", message: `"${project.name}" and its data will be removed. This cannot be undone here.`, confirmLabel: "Delete" }))) return;
    setBusy(true);
    try {
      await deleteProject(project.id);
      onMutate((prev) => prev.filter((x) => x.id !== project.id));
      toast("Project deleted.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not delete.", "error"); }
    finally { setBusy(false); }
  };

  // Overlay: the whole control is absolutely placed at the card's top-right (the parent card is
  // `relative`), so the dropdown escapes the image's overflow-hidden. Button: inline.
  const wrapperCls = variant === "overlay" ? "absolute top-3 right-3 z-20" : "relative inline-block";
  const trigger = variant === "overlay"
    ? "p-2 rounded-lg bg-white/85 backdrop-blur text-slate-600 hover:text-slate-900 shadow-md transition-colors"
    : "p-2 rounded-xl border border-slate-100 hover:bg-white hover:shadow-sm text-slate-400 hover:text-slate-900 transition-all";

  const Item = ({ icon: Icon, label, onClick, danger }: { icon: typeof FolderOpen; label: string; onClick: () => void; danger?: boolean }) => (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-bold text-left ${danger ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50"}`}>
      <Icon size={14} className={danger ? "text-red-500" : "text-slate-400"} /> {label}
    </button>
  );

  return (
    <div className={wrapperCls}>
      <button onClick={() => setOpen((v) => !v)} className={trigger} title="More actions" disabled={busy} aria-label="More actions">
        {busy ? <Loader2 size={variant === "overlay" ? 18 : 18} className="animate-spin" /> : <MoreHorizontal size={variant === "overlay" ? 18 : 18} />}
      </button>

      {open && (
        <>
          {/* Click-away catcher (menus close on outside click, unlike modals). */}
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={close} />
          <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-100 rounded-xl shadow-2xl p-1.5 z-50">
            <Item icon={FolderOpen} label="Open project" onClick={() => { close(); navigate(`/dashboard/projects/${project.id}`); }} />
            <Item icon={Link2} label="Copy link" onClick={copyLink} />
            {canManage && <Item icon={Copy} label="Duplicate" onClick={duplicate} />}
            {canManage && <Item icon={project.archived ? RotateCcw : Archive} label={project.archived ? "Restore" : "Archive"} onClick={toggleArchive} />}
            {canManage && <div className="my-1 border-t border-slate-100" />}
            {canManage && <Item icon={Trash2} label="Delete" onClick={remove} danger />}
          </div>
        </>
      )}
      {dialogs}
    </div>
  );
}
