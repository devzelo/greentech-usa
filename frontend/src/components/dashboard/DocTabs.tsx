import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FolderOpen, KanbanSquare, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import DocSection from "./DocSection";
import { useDialogs } from "../../lib/useDialogs";
import { createTableRow, deleteTableRow, fetchDocuments, fetchTableRows, updateTableRow, type ApiTableRow } from "../../lib/api";

/**
 * CR-P (136)/(152) — a tab's document sections as tabs the project manager can shape: add a tab,
 * rename any tab, delete any tab (a built-in one can be put back). Each tab is an upload area with
 * descriptions and folders (DocSection). An optional lead tab (the Project Management task board)
 * comes first, styled apart from the document tabs.
 *
 * Changes are stored as ProjectTable rows under `tableKey`: { kind: "custom", label } for a tab
 * someone added (its files live in section "<prefix>-custom-<rowId>"), and { kind: "override",
 * ref, label, removed } to rename or remove a built-in one.
 */

export type DocTabDef = {
  id: string;
  label: string;
  section: string;
  /** Kept only for projects that already have files in it (a section being retired). */
  onlyIfFiles?: boolean;
};

type Tab = DocTabDef & { custom?: ApiTableRow; override?: ApiTableRow };

type LeadTab = { id: string; label: string; content: ReactNode; icon?: ReactNode };

export default function DocTabs({ projectId, tableKey, sectionPrefix, defaults, canEdit, canManageTabs, canPublish, lead, focus, above }: {
  projectId: string;
  tableKey: string;
  sectionPrefix: string;
  defaults: DocTabDef[];
  canEdit: boolean;
  canManageTabs: boolean;
  canPublish?: boolean;
  /** Tabs with their own content shown before the document tabs (the task board, the timeline). */
  lead?: LeadTab | LeadTab[];
  /** Open this tab (a new `n` opens it again). */
  focus?: { id: string; n: number };
  /** CR 208/209 - content shown above a tab's uploads, keyed by tab id (minutes, reports). */
  above?: Record<string, ReactNode>;
}) {
  const leads: LeadTab[] = lead ? (Array.isArray(lead) ? lead : [lead]) : [];
  const { prompt, confirm, dialogs } = useDialogs();
  const [rows, setRows] = useState<ApiTableRow[]>([]);
  const [active, setActive] = useState(focus?.id || leads[0]?.id || defaults[0]?.id || "");
  useEffect(() => { if (focus?.id) setActive(focus.id); }, [focus?.id, focus?.n]);
  const [withFiles, setWithFiles] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try { setRows(await fetchTableRows(projectId, tableKey)); } catch { /* ignore */ }
  }, [projectId, tableKey]);
  useEffect(() => { load(); }, [load]);

  // A retired built-in section still shows where it holds files, so nothing uploaded is lost.
  useEffect(() => {
    let alive = true;
    for (const d of defaults.filter((x) => x.onlyIfFiles)) {
      fetchDocuments(projectId, d.section).then((list) => { if (alive) setWithFiles((p) => ({ ...p, [d.id]: list.length > 0 })); }).catch(() => {});
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const overrideOf = (id: string) => rows.find((r) => r.data?.kind === "override" && r.data?.ref === id);

  const { tabs, removed } = useMemo(() => {
    const tabs: Tab[] = [];
    const removed: Tab[] = [];
    for (const d of defaults) {
      if (d.onlyIfFiles && !withFiles[d.id]) continue;
      const o = rows.find((r) => r.data?.kind === "override" && r.data?.ref === d.id);
      const t: Tab = { ...d, label: o?.data?.label || d.label, override: o };
      (o?.data?.removed === "1" ? removed : tabs).push(t);
    }
    for (const r of rows.filter((x) => x.data?.kind === "custom")) {
      tabs.push({ id: `c:${r._id}`, label: r.data?.label || "Untitled", section: `${sectionPrefix}-custom-${r._id}`, custom: r });
    }
    return { tabs, removed };
  }, [defaults, rows, withFiles, sectionPrefix]);

  const current = tabs.find((t) => t.id === active);
  const activeLead = leads.find((l) => l.id === active);
  const onLead = !!activeLead;
  // The open tab was deleted: fall back to the first one.
  const firstId = leads[0]?.id || tabs[0]?.id;
  useEffect(() => {
    if (!onLead && !current && firstId) setActive(firstId);
  }, [onLead, current, firstId]);

  const upsertOverride = async (id: string, patch: Record<string, string>) => {
    const o = overrideOf(id);
    const data = { kind: "override", ref: id, label: o?.data?.label || "", removed: o?.data?.removed || "", ...patch };
    const r = o ? await updateTableRow(projectId, o._id, { data }) : await createTableRow(projectId, tableKey, data);
    setRows((p) => (o ? p.map((x) => (x._id === r._id ? r : x)) : [...p, r]));
  };

  const addTab = async () => {
    const label = await prompt({ title: "New tab", label: "Tab name", placeholder: "e.g. Permits", confirmLabel: "Create" });
    if (!label || !label.trim()) return;
    try { const r = await createTableRow(projectId, tableKey, { kind: "custom", label: label.trim() }); setRows((p) => [...p, r]); setActive(`c:${r._id}`); }
    catch { /* ignore */ }
  };
  const renameTab = async (t: Tab) => {
    const label = await prompt({ title: "Rename tab", label: "Tab name", initialValue: t.label, confirmLabel: "Save" });
    if (label === null || !label.trim()) return;
    try {
      if (t.custom) { const u = await updateTableRow(projectId, t.custom._id, { data: { ...t.custom.data, label: label.trim() } }); setRows((p) => p.map((x) => (x._id === u._id ? u : x))); }
      else await upsertOverride(t.id, { label: label.trim() });
    } catch { /* ignore */ }
  };
  const deleteTab = async (t: Tab) => {
    const msg = t.custom
      ? `Delete the "${t.label}" tab? Its files stay on the server, but the tab is removed.`
      : `Remove the "${t.label}" tab from this project? Its files are kept, and the tab can be put back from "Removed tabs".`;
    if (!(await confirm({ title: "Delete tab?", message: msg, confirmLabel: "Delete", danger: true }))) return;
    try {
      if (t.custom) { await deleteTableRow(projectId, t.custom._id); setRows((p) => p.filter((x) => x._id !== t.custom!._id)); }
      else await upsertOverride(t.id, { removed: "1" });
    } catch { /* ignore */ }
  };
  const restoreTab = async (t: Tab) => {
    try { await upsertOverride(t.id, { removed: "" }); setActive(t.id); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {leads.map((l, i) => (
          <button
            key={l.id}
            onClick={() => setActive(l.id)}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border transition-all ${i === leads.length - 1 ? "mr-1" : ""} ${active === l.id ? "bg-emerald-500 border-emerald-500 text-white shadow" : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"}`}
          >
            {l.icon ?? <KanbanSquare size={16} />} {l.label}
          </button>
        ))}
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActive(t.id)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${active === t.id ? "bg-slate-900 text-white shadow" : "bg-white border border-slate-100 text-slate-500 hover:text-slate-900"}`}>
            <FolderOpen size={12} /> {t.label}
          </button>
        ))}
        {canManageTabs && (
          <button onClick={addTab} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 border-dashed border-slate-200 text-slate-500 hover:text-primary hover:border-primary">
            <Plus size={12} /> Add tab
          </button>
        )}
      </div>

      {canManageTabs && (current || removed.length > 0) && !onLead && (
        <div className="flex flex-wrap items-center justify-between gap-2 -mt-2">
          <p className="text-[11px] text-slate-400">
            {removed.length > 0 && (
              <>Removed tabs:{" "}
                {removed.map((t, i) => (
                  <span key={t.id}>{i > 0 && ", "}{t.label} <button onClick={() => restoreTab(t)} className="inline-flex items-center gap-0.5 font-bold text-primary hover:underline"><RotateCcw size={10} /> put back</button></span>
                ))}
              </>
            )}
          </p>
          {current && (
            <div className="flex items-center gap-1">
              <button onClick={() => renameTab(current)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 hover:bg-slate-100"><Pencil size={11} /> Rename</button>
              <button onClick={() => deleteTab(current)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-rose-500 hover:bg-rose-50"><Trash2 size={11} /> Delete</button>
            </div>
          )}
        </div>
      )}

      {activeLead ? activeLead.content : current ? (
        <div className="space-y-6">
          {above?.[current.id]}
          <DocSection key={current.section} projectId={projectId} section={current.section} title={current.label} canEdit={canEdit} canPublish={canPublish} />
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-8">No tabs yet.{canManageTabs ? " Use Add tab to create one." : ""}</p>
      )}

      {dialogs}
    </div>
  );
}
