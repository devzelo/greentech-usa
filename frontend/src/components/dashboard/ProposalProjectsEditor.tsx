import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X, Check, ChevronUp, ChevronDown, RefreshCw, FolderSearch, Link2, Search, Loader2, ImageOff } from "lucide-react";
import { fetchProjects, withFileToken, CONTRACT_TYPES, type ApiProject, type ProposalSimilarProject } from "../../lib/api";
import { entryFromProject, blankEntry, projectTags, projectPhotos, periodOf } from "../../lib/pastPerformance";
import { toast } from "../../lib/toast";

const inp = "w-full bg-white border border-slate-100 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
const lbl = "text-[9px] font-bold text-slate-400 uppercase tracking-widest";

/**
 * Step 6 (items 100 to 102): the projects in a Past Performance, Relevant Experience or Project
 * References section, picked from our own project records (filtered by category / nature), filled
 * from the record and editable here. `mode="references"` is the one-table layout (spec 23).
 */
export default function ProposalProjectsEditor({ title, items, onChange, canEdit, currentProjectId, mode, onAddLetters, lettersAdded }: {
  title: string;
  items: ProposalSimilarProject[];
  onChange: (items: ProposalSimilarProject[]) => void;
  canEdit: boolean;
  currentProjectId?: string;
  mode: "sheets" | "references";
  onAddLetters?: () => void;   // item 102 - optional recommendation / credit letters section after this one
  lettersAdded?: boolean;
}) {
  const [pool, setPool] = useState<ApiProject[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tag, setTag] = useState("");
  const [q, setQ] = useState("");

  // The project list is needed for the picker, photo choices and Refresh.
  const needPool = pickerOpen || items.some((e) => !!e.projectId);
  useEffect(() => {
    if (!needPool || pool) return;
    fetchProjects("all").then(setPool).catch(() => setPool([]));
  }, [needPool, pool]);
  const byId = useMemo(() => new Map((pool || []).map((p) => [p.id, p])), [pool]);

  const set = (i: number, patch: Partial<ProposalSimilarProject>) => onChange(items.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const refresh = (i: number) => {
    const p = byId.get(items[i].projectId || "");
    if (!p) { toast("That project record is no longer available.", "error"); return; }
    onChange(items.map((e, k) => (k === i ? entryFromProject(p, e) : e)));
    toast(`Refreshed from the "${p.name}" record.`, "success");
  };
  const toggleProject = (p: ApiProject) => {
    const at = items.findIndex((e) => e.projectId === p.id);
    onChange(at >= 0 ? items.filter((_, k) => k !== at) : [...items, entryFromProject(p)]);
  };

  // Candidates: every other project that is not a draft, finished work first, newest first.
  const candidates = useMemo(() => (pool || [])
    .filter((p) => p.id !== currentProjectId && p.status !== "Draft")
    .sort((a, b) => Number(["Completed", "Closed", "Warranty"].includes(b.status)) - Number(["Completed", "Closed", "Warranty"].includes(a.status))
      || (b.endDate || b.startDate || "").localeCompare(a.endDate || a.startDate || "")), [pool, currentProjectId]);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of candidates) for (const t of projectTags(p)) m.set(t, (m.get(t) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [candidates]);
  const shown = candidates.filter((p) => (!tag || projectTags(p).includes(tag))
    && (!q.trim() || `${p.name} ${p.clientInfo?.name || ""} ${p.location} ${p.contractNo}`.toLowerCase().includes(q.trim().toLowerCase())));

  const sheets = mode === "sheets";
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h4 className="font-bold text-slate-800 text-sm">{title}</h4>
          <p className="text-[11px] text-slate-400">
            {sheets ? "Prints a summary table, then a one-page data sheet for each project." : "Prints one reference table: project, client, contract number, value, dates, point of contact and location."}
            {" "}Pick the 3 to 5 most relevant projects.
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setPickerOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-bold hover:bg-indigo-100"><FolderSearch size={12} /> From our projects</button>
            <button onClick={() => onChange([...items, blankEntry()])} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200"><Plus size={12} /> Add manually</button>
          </div>
        )}
      </div>
      {items.length > 5 && <p className="text-[11px] font-bold text-amber-600">{items.length} projects: solicitations usually ask for 3 to 5.</p>}
      {items.length === 0 && <p className="text-xs text-slate-400">No projects yet.</p>}

      {items.map((e, i) => {
        const rec = e.projectId ? byId.get(e.projectId) : undefined;
        const photos = rec ? projectPhotos(rec) : e.photo ? [e.photo] : [];
        return (
          <div key={e.id} className="rounded-2xl border border-slate-100 p-4 space-y-2.5 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <input value={e.name} onChange={(ev) => set(i, { name: ev.target.value })} disabled={!canEdit} placeholder="Project name" className={`${inp} text-sm font-bold`} />
              {e.projectId
                ? <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600" title="Filled from our project record"><Link2 size={11} /> Record</span>
                : <span className="shrink-0 text-[10px] font-bold text-slate-400">Typed in</span>}
              {canEdit && (
                <div className="flex items-center shrink-0">
                  {e.projectId && <button onClick={() => refresh(i)} title="Refresh from the project record (replaces the fields below)" className="p-1.5 rounded text-slate-400 hover:text-primary"><RefreshCw size={13} /></button>}
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1.5 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ChevronUp size={14} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" className="p-1.5 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ChevronDown size={14} /></button>
                  <button onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="Remove" className="p-1.5 rounded text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <label className="space-y-0.5"><span className={lbl}>Client / agency</span><input value={e.client} onChange={(ev) => set(i, { client: ev.target.value })} disabled={!canEdit} className={inp} /></label>
              <label className="space-y-0.5"><span className={lbl}>Location</span><input value={e.location || ""} onChange={(ev) => set(i, { location: ev.target.value })} disabled={!canEdit} className={inp} /></label>
              <label className="space-y-0.5"><span className={lbl}>Contract no.</span><input value={e.contractNo || ""} onChange={(ev) => set(i, { contractNo: ev.target.value })} disabled={!canEdit} className={inp} /></label>
              <label className="space-y-0.5"><span className={lbl}>Start</span><input value={e.start || ""} onChange={(ev) => set(i, { start: ev.target.value })} disabled={!canEdit} placeholder="yyyy-mm" className={inp} /></label>
              <label className="space-y-0.5"><span className={lbl}>End</span><input value={e.end || ""} onChange={(ev) => set(i, { end: ev.target.value })} disabled={!canEdit} placeholder="yyyy-mm, blank if ongoing" className={inp} /></label>
              <label className="space-y-0.5"><span className={lbl}>Status</span>
                <select value={e.status || "Completed"} onChange={(ev) => set(i, { status: ev.target.value })} disabled={!canEdit} className={inp}>
                  <option value="Completed">Completed</option>
                  <option value="Ongoing">Ongoing</option>
                </select>
              </label>
              <label className="space-y-0.5"><span className={lbl}>Contract value</span>
                <div className="flex items-center gap-2">
                  <input value={e.value} onChange={(ev) => set(i, { value: ev.target.value })} disabled={!canEdit} className={inp} />
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 shrink-0" title="Item 100: the total amount is optional">
                    <input type="checkbox" checked={e.showValue !== false} onChange={(ev) => set(i, { showValue: ev.target.checked })} disabled={!canEdit} className="rounded" /> Print
                  </span>
                </div>
              </label>
              <label className="space-y-0.5"><span className={lbl}>Contract type</span>
                <input value={e.contractType || ""} onChange={(ev) => set(i, { contractType: ev.target.value })} disabled={!canEdit} list="pp-contract-types" className={inp} />
              </label>
              <label className="space-y-0.5"><span className={lbl}>Work type</span><input value={e.workType || ""} onChange={(ev) => set(i, { workType: ev.target.value })} disabled={!canEdit} className={inp} /></label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <label className="space-y-0.5"><span className={lbl}>Client point of contact</span><input value={e.poc || ""} onChange={(ev) => set(i, { poc: ev.target.value })} disabled={!canEdit} className={inp} /></label>
              <label className="space-y-0.5"><span className={lbl}>POC email</span><input value={e.pocEmail || ""} onChange={(ev) => set(i, { pocEmail: ev.target.value })} disabled={!canEdit} className={inp} /></label>
              <label className="space-y-0.5"><span className={lbl}>POC phone</span><input value={e.pocPhone || ""} onChange={(ev) => set(i, { pocPhone: ev.target.value })} disabled={!canEdit} className={inp} /></label>
              <label className="space-y-0.5"><span className={lbl}>CPARS / evaluation</span>
                <select value={e.cpars || ""} onChange={(ev) => set(i, { cpars: ev.target.value })} disabled={!canEdit} className={inp}>
                  <option value="">Not stated</option>
                  <option value="Yes">Yes, on file</option>
                  <option value="Pending">Pending</option>
                  <option value="No">No</option>
                </select>
              </label>
            </div>

            {sheets && (
              <>
                {/* Item 100 - "an optional picture": from the project's own gallery. */}
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className={lbl}>Photo</span>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                      <input type="checkbox" checked={e.showPhoto !== false} onChange={(ev) => set(i, { showPhoto: ev.target.checked })} disabled={!canEdit || !e.photo} className="rounded" /> Print the photo
                    </span>
                  </div>
                  {photos.length === 0
                    ? <p className="text-[11px] text-slate-400 flex items-center gap-1"><ImageOff size={12} /> {e.projectId ? "This project has no photos. Add them in its Showcase gallery." : "Only projects from our records bring photos."}</p>
                    : (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {photos.map((url) => (
                          <button key={url} type="button" disabled={!canEdit} onClick={() => set(i, { photo: url, showPhoto: true })}
                            className={`relative shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 ${e.photo === url ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}>
                            <img src={withFileToken(url)} alt="" className="w-full h-full object-cover" />
                            {e.photo === url && <span className="absolute top-1 right-1 bg-primary text-white rounded-full p-0.5"><Check size={9} /></span>}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
                <label className="block space-y-0.5"><span className={lbl}>Description of the work (printed on the data sheet)</span>
                  <textarea value={e.summary} onChange={(ev) => set(i, { summary: ev.target.value })} disabled={!canEdit} rows={3} className={`${inp} resize-y`} />
                </label>
              </>
            )}
          </div>
        );
      })}
      <datalist id="pp-contract-types">{CONTRACT_TYPES.map((c) => <option key={c} value={c} />)}</datalist>

      {onAddLetters && canEdit && (
        <button onClick={onAddLetters} disabled={lettersAdded} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200 disabled:opacity-60">
          {lettersAdded ? <><Check size={12} /> Recommendation / credit letters section is in the layout</> : <><Plus size={12} /> Add a recommendation / credit letters section after this</>}
        </button>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPickerOpen(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl max-h-[82vh] flex flex-col" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-slate-900">Add from our projects</h3>
              <button onClick={() => setPickerOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} /></button>
            </div>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Search by name, client, location or contract number" className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10" autoFocus />
            </div>
            {/* Item 100 - filter by the project's nature / category, or show all. */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button onClick={() => setTag("")} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${!tag ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>All ({candidates.length})</button>
              {tagCounts.map(([t, n]) => (
                <button key={t} onClick={() => setTag(tag === t ? "" : t)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${tag === t ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>{t} ({n})</button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {pool === null && <p className="text-xs text-slate-400 flex items-center gap-2 py-4"><Loader2 size={13} className="animate-spin" /> Loading projects…</p>}
              {pool !== null && shown.length === 0 && <p className="text-xs text-slate-400 py-4">No projects match.</p>}
              {shown.map((p) => {
                const on = items.some((e) => e.projectId === p.id);
                const tags = projectTags(p);
                return (
                  <button key={p.id} onClick={() => toggleProject(p)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border ${on ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-slate-50"}`}>
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary text-white" : "border-slate-300"}`}>{on && <Check size={12} />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{[p.clientInfo?.name, p.location, periodOf(entryFromProject(p)), p.value].filter(Boolean).join(" · ")}</p>
                      {tags.length > 0 && <p className="text-[10px] text-primary/80 font-bold truncate">{tags.join(" · ")}</p>}
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">{p.status}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
              <span className={`text-[11px] font-bold ${items.length > 5 ? "text-amber-600" : "text-slate-500"}`}>{items.length} in this section. Pick 3 to 5.</span>
              <button onClick={() => setPickerOpen(false)} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
