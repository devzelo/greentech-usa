import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X, Check, ChevronUp, ChevronDown, FolderSearch, Link2, Search, Loader2, ImageOff, ExternalLink } from "lucide-react";
import { withFileToken, CONTRACT_TYPES, type ApiProject, type ProposalSimilarProject } from "../../lib/api";
import { entryFromProject, blankEntry, projectTags, projectPhotos, periodOf, linkedProjectPool } from "../../lib/pastPerformance";
import DirectoryNameField from "./DirectoryNameField";
import MoneyInput from "./MoneyInput";
import { sanitizeMoney } from "../../lib/money";
import { DirectoryPersonSelect, useDirectoryCompany } from "./DirectoryDetails";

/** 2026-10-07 - a typed-in project's client is a Directory company; its contact is one of its people. */
function TypedClient({ e, canEdit, set }: { e: ProposalSimilarProject; canEdit: boolean; set: (p: Partial<ProposalSimilarProject>) => void }) {
  const co = useDirectoryCompany(e.clientCompanyId || "", e.client, "client");
  return (
    <>
      <div className="space-y-0.5"><span className={lbl}>Client / agency</span>
        <DirectoryNameField value={e.client} disabled={!canEdit} categories={["client"]} title="Client" placeholder="Pick from the Directory"
          onPick={(c) => set({ client: c.name, clientCompanyId: c._id, poc: "", pocEmail: "", pocPhone: "" })} onClear={() => set({ client: "", clientCompanyId: "", poc: "", pocEmail: "", pocPhone: "" })} />
      </div>
      <div className="space-y-0.5 md:col-span-2"><span className={lbl}>Client point of contact</span>
        <DirectoryPersonSelect company={co} value={e.poc || ""} disabled={!canEdit} placeholder="Choose the client's contact"
          onPick={(p) => set({ poc: p?.name || "", pocEmail: p?.email || co?.email || "", pocPhone: p?.phone || co?.phone || "" })} />
        {(e.pocEmail || e.pocPhone) && <p className="text-[10px] text-slate-400">{[e.pocEmail, e.pocPhone].filter(Boolean).join(" · ")}</p>}
      </div>
    </>
  );
}

const inp = "w-full bg-white border border-slate-100 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
const lbl = "text-[9px] font-bold text-slate-400 uppercase tracking-widest";

/**
 * Step 6 (items 100 to 102): the projects in a Past Performance, Relevant Experience or Project
 * References section, picked from our own project records (filtered by category / nature).
 * 2026-10-06: a picked project stays linked to its Project Info, which is what prints (one page per
 * project); only the photo, the value and the order are chosen here. Typed-in projects are edited
 * here. `mode="references"` opens with the reference table (spec 23) instead of the summary table.
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

  // The project list is needed for the picker and to show the linked projects as they are now
  // (archived ones too, as the print reads them).
  const needPool = pickerOpen || items.some((e) => !!e.projectId);
  useEffect(() => {
    if (!needPool || pool) return;
    linkedProjectPool().then(setPool).catch(() => setPool([]));
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
  const toggleProject = (p: ApiProject) => {
    const at = items.findIndex((e) => e.projectId === p.id);
    onChange(at >= 0 ? items.filter((_, k) => k !== at) : [...items, entryFromProject(p)]);
  };

  // Candidates: every other project that is not a draft, finished work first, newest first.
  const candidates = useMemo(() => (pool || [])
    .filter((p) => p.id !== currentProjectId && p.status !== "Draft" && !p.archived)
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
            {sheets ? "Prints a summary table" : "Prints a reference table (project, client, contract number, value, dates, point of contact and location)"}
            , then one page per project, numbered #1, #2, #3. Pick the 3 to 5 most relevant projects.
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
        const linked = !!e.projectId;
        // A linked entry shows, and prints, the record as it is now (withLiveProjects at print time).
        const v = rec ? entryFromProject(rec, e) : e;
        const missing = linked && pool !== null && !rec;
        const photos = rec ? projectPhotos(rec) : e.photo ? [e.photo] : [];
        const scope = v.scope || [];
        return (
          <div key={e.id} className="rounded-2xl border border-slate-100 p-4 space-y-2.5 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              {linked
                ? <p className="flex-1 min-w-0 px-1 text-sm font-bold text-slate-800 truncate">{v.name || "Untitled project"}</p>
                : <input value={e.name} onChange={(ev) => set(i, { name: ev.target.value })} disabled={!canEdit} placeholder="Project name" className={`${inp} text-sm font-bold`} />}
              {linked
                ? <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600" title="Printed from the project's Project Info"><Link2 size={11} /> Linked to Project Info</span>
                : <span className="shrink-0 text-[10px] font-bold text-slate-400">Typed in</span>}
              {canEdit && (
                <div className="flex items-center shrink-0">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1.5 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ChevronUp size={14} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" className="p-1.5 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ChevronDown size={14} /></button>
                  <button onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="Remove" className="p-1.5 rounded text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                </div>
              )}
            </div>

            {linked ? (
              <>
                <p className="text-[11px] text-slate-400">
                  {missing
                    ? "This project record is no longer available. The copy saved with the proposal prints."
                    : <>Everything below comes from the project's Project Info and prints as it is when the proposal is built. To change it, edit the project.{" "}
                        <a href={`/dashboard/projects/${encodeURIComponent(e.projectId || "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-bold text-primary hover:underline">Open project <ExternalLink size={10} /></a></>}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
                  {([
                    ["Client / agency", v.client], ["Location", v.location], ["Contract no.", v.contractNo],
                    ["Period of performance", periodOf(v)], ["Status", v.status], ["Contract type", v.contractType],
                    ["Work type", v.workType], ["CPARS / evaluation", v.cpars === "Yes" ? "Yes, on file" : v.cpars],
                    ["Client point of contact", [v.poc, v.pocEmail, v.pocPhone].filter(Boolean).join(" · ")],
                  ] as Array<[string, string | undefined]>).map(([l, val]) => (
                    <div key={l} className="min-w-0">
                      <p className={lbl}>{l}</p>
                      <p className="text-xs font-medium text-slate-700 break-words">{val?.trim() || "-"}</p>
                    </div>
                  ))}
                  <div className="min-w-0">
                    <p className={lbl}>Contract value</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-slate-700">{v.value?.trim() || "-"}</p>
                      <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500" title="Item 100: the total amount is optional">
                        <input type="checkbox" checked={e.showValue !== false} onChange={(ev) => set(i, { showValue: ev.target.checked })} disabled={!canEdit} className="rounded" /> Print
                      </label>
                    </div>
                  </div>
                </div>
                <div>
                  <p className={lbl}>Description of work</p>
                  <p className="text-xs text-slate-600 whitespace-pre-line line-clamp-4">{v.summary?.trim() || "No description in Project Info yet."}</p>
                </div>
                <div>
                  <p className={lbl}>Key scope of work</p>
                  {scope.length === 0
                    ? <p className="text-xs text-slate-400">No key scope in Project Info yet (About This Project).</p>
                    : (
                      <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 text-xs text-slate-600 list-disc pl-4">
                        {scope.slice(0, 8).map((line, k) => <li key={k}>{line}</li>)}
                        {scope.length > 8 && <li className="list-none -ml-4 text-slate-400">and {scope.length - 8} more</li>}
                      </ul>
                    )}
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
                      <MoneyInput value={e.value} onChange={(v) => set(i, { value: sanitizeMoney(v) })} disabled={!canEdit} className={inp} aria-label="Contract value" />
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
                  {/* 2026-10-07 - the client and its contact come from the Directory. */}
                  <TypedClient e={e} canEdit={canEdit} set={(p) => set(i, p)} />
                  <label className="space-y-0.5"><span className={lbl}>CPARS / evaluation</span>
                    <select value={e.cpars || ""} onChange={(ev) => set(i, { cpars: ev.target.value })} disabled={!canEdit} className={inp}>
                      <option value="">Not stated</option>
                      <option value="Yes">Yes, on file</option>
                      <option value="Pending">Pending</option>
                      <option value="No">No</option>
                    </select>
                  </label>
                </div>

                <label className="block space-y-0.5"><span className={lbl}>Description of work</span>
                  <textarea value={e.summary} onChange={(ev) => set(i, { summary: ev.target.value })} disabled={!canEdit} rows={3} className={`${inp} resize-y`} />
                </label>
                <label className="block space-y-0.5"><span className={lbl}>Key scope of work (one per line)</span>
                  <textarea value={(e.scope || []).join("\n")} disabled={!canEdit} rows={3} className={`${inp} resize-y`}
                    onChange={(ev) => set(i, { scope: ev.target.value.split("\n").map((l) => l.replace(/^[-*\u2022]\s*/, "")) })}
                    onBlur={(ev) => set(i, { scope: ev.target.value.split("\n").map((l) => l.replace(/^[-*\u2022]\s*/, "").trim()).filter(Boolean) })} />
                </label>
              </>
            )}

            {/* Item 100 - "an optional picture": from the project's own gallery, beside the information table. */}
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className={lbl}>Photo</span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                  <input type="checkbox" checked={e.showPhoto !== false} onChange={(ev) => set(i, { showPhoto: ev.target.checked })} disabled={!canEdit || !v.photo} className="rounded" /> Print the photo
                </span>
              </div>
              {photos.length === 0
                ? <p className="text-[11px] text-slate-400 flex items-center gap-1"><ImageOff size={12} /> {linked ? "This project has no photos. Add them in its Showcase gallery." : "Only projects from our records bring photos."}</p>
                : (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {photos.map((url) => (
                      <button key={url} type="button" disabled={!canEdit} onClick={() => set(i, { photo: url, showPhoto: true })}
                        className={`relative shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 ${v.photo === url ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}>
                        <img src={withFileToken(url)} alt="" className="w-full h-full object-cover" />
                        {v.photo === url && <span className="absolute top-1 right-1 bg-primary text-white rounded-full p-0.5"><Check size={9} /></span>}
                      </button>
                    ))}
                  </div>
                )}
            </div>
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
