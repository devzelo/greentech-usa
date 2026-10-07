import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { fetchStandardAppendices, saveStandardAppendices, type StandardAppendixItem } from "../../lib/api";
import { APPENDIX_LIBRARY } from "../../lib/proposalLibrary";
import { toast } from "../../lib/toast";

/**
 * Item 105, made editable on 2026-10-07: the appendices a GT proposal carries, added in one click
 * next to "Add section". The pencil edits the list (company-wide: every proposal uses it), from
 * the Appendix Library or with appendices of our own.
 */
type Vol = "technical" | "financial";
type Lists = Record<Vol, StandardAppendixItem[]>;

// The list as it was before anyone edited it (as in the client's sample proposals).
const DEFAULT_KEYS: Record<Vol, string[]> = {
  technical: ["appx-sam", "appx-company-registration", "appx-business-licenses", "appx-insurance", "appx-dba", "appx-reference-letters"],
  financial: ["appx-sam", "appx-bonding", "appx-insurance", "appx-dba"],
};
const fromKeys = (keys: string[]): StandardAppendixItem[] =>
  keys.map((k) => APPENDIX_LIBRARY.find((a) => a.key === k)).filter((a): a is NonNullable<typeof a> => !!a).map((a) => ({ key: a.key, title: a.title }));
const defaultLists = (): Lists => ({ technical: fromKeys(DEFAULT_KEYS.technical), financial: fromKeys(DEFAULT_KEYS.financial) });
/** A library entry shows its current library title (renames there follow). */
const titleOf = (it: StandardAppendixItem) => (it.key && APPENDIX_LIBRARY.find((a) => a.key === it.key)?.title) || it.title;
const sameItem = (a: StandardAppendixItem, b: StandardAppendixItem) =>
  a.key || b.key ? a.key === b.key : a.title.trim().toLowerCase() === b.title.trim().toLowerCase();

export default function StandardAppendices({ volume, onAdd }: {
  volume: Vol;
  /** Adds these to the volume (skipping the ones it already has). */
  onAdd: (items: StandardAppendixItem[]) => void;
}) {
  const [lists, setLists] = useState<Lists | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchStandardAppendices()
      .then((s) => { if (alive) setLists(s && Array.isArray(s.technical) && Array.isArray(s.financial) ? { technical: s.technical, financial: s.financial } : defaultLists()); })
      .catch(() => { if (alive) setLists(defaultLists()); });
    return () => { alive = false; };
  }, []);
  const list = lists?.[volume] || [];
  return (
    <>
      <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-200 bg-white">
        <button type="button" disabled={!lists} onClick={() => onAdd(list)}
          title={list.length ? `Adds: ${list.map(titleOf).join(", ")}` : "The list is empty: edit it with the pencil"}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 hover:text-primary disabled:opacity-50">
          <Plus size={12} /> Add standard appendices
        </button>
        <button type="button" disabled={!lists} onClick={() => setEditing(true)} title="Edit the standard appendices list" aria-label="Edit the standard appendices list"
          className="flex items-center border-l border-slate-200 px-2.5 text-slate-400 hover:bg-slate-50 hover:text-primary disabled:opacity-50">
          <Pencil size={12} />
        </button>
      </div>
      {editing && lists && (
        <EditDialog volume={volume} lists={lists} onClose={() => setEditing(false)}
          onSaved={(next) => { setLists(next); setEditing(false); }} />
      )}
    </>
  );
}

function EditDialog({ volume, lists, onClose, onSaved }: { volume: Vol; lists: Lists; onClose: () => void; onSaved: (l: Lists) => void }) {
  const [draft, setDraft] = useState<StandardAppendixItem[]>(lists[volume]);
  const [own, setOwn] = useState("");
  const [saving, setSaving] = useState(false);
  const label = volume === "financial" ? "financial" : "technical";
  const left = APPENDIX_LIBRARY.filter((a) => !draft.some((d) => d.key === a.key));
  const move = (i: number, dir: -1 | 1) => setDraft((d) => {
    const j = i + dir;
    if (j < 0 || j >= d.length) return d;
    const n = d.slice();
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const addOwn = () => {
    const title = own.trim();
    if (!title) return;
    if (draft.some((d) => sameItem(d, { title }) || titleOf(d).toLowerCase() === title.toLowerCase())) { toast(`"${title}" is already in the list.`, "info"); return; }
    setDraft((d) => [...d, { title }]);
    setOwn("");
  };
  const save = async () => {
    setSaving(true);
    try {
      const next = { ...lists, [volume]: draft };
      const s = await saveStandardAppendices({ technical: next.technical, financial: next.financial });
      toast(`The standard appendices for ${label} proposals are saved. Every project uses this list.`, "success");
      onSaved({ technical: s.technical || next.technical, financial: s.financial || next.financial });
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save the list.", "error"); }
    finally { setSaving(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label="Edit the standard appendices" className="my-12 flex max-h-[85vh] w-full max-w-xl flex-col rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">Standard appendices: {label} proposal</p>
            <p className="mt-0.5 text-[11px] text-slate-500">What <b>Add standard appendices</b> puts in a {label} proposal, in this order. The list is shared: every project uses it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
          <ol className="space-y-1.5">
            {draft.length === 0 && <li className="rounded-xl border border-dashed border-slate-200 py-5 text-center text-xs italic text-slate-400">The list is empty. Add appendices below.</li>}
            {draft.map((it, i) => (
              <li key={`${it.key || "own"}-${it.title}`} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="w-5 shrink-0 text-center text-[11px] font-bold text-slate-400">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800" title={titleOf(it)}>{titleOf(it)}</span>
                {!it.key && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">Our own</span>}
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${titleOf(it)} up`} className="rounded p-1.5 text-slate-400 hover:bg-white hover:text-slate-900 disabled:opacity-30"><ArrowUp size={13} /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === draft.length - 1} aria-label={`Move ${titleOf(it)} down`} className="rounded p-1.5 text-slate-400 hover:bg-white hover:text-slate-900 disabled:opacity-30"><ArrowDown size={13} /></button>
                <button type="button" onClick={() => setDraft((d) => d.filter((_, k) => k !== i))} aria-label={`Remove ${titleOf(it)} from the list`} className="rounded p-1.5 text-slate-300 hover:bg-white hover:text-red-500"><Trash2 size={13} /></button>
              </li>
            ))}
          </ol>

          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Add from the Appendix Library</p>
            <select value="" disabled={!left.length} aria-label="Add an appendix from the library"
              onChange={(e) => { const a = APPENDIX_LIBRARY.find((x) => x.key === e.target.value); if (a) setDraft((d) => [...d, { key: a.key, title: a.title }]); }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-primary/15">
              <option value="">{left.length ? "Choose an appendix to add" : "Every library appendix is in the list"}</option>
              {left.map((a) => <option key={a.key} value={a.key}>{a.title}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Or one of our own</p>
            <div className="flex gap-2">
              <input value={own} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOwn(); } }}
                placeholder="e.g. Firm's Quality Control Plan" aria-label="Your own appendix title"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/15" />
              <button type="button" onClick={addOwn} disabled={!own.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-primary disabled:opacity-40"><Plus size={12} /> Add</button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-6 py-3">
          <button type="button" onClick={() => setDraft(defaultLists()[volume])} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <RotateCcw size={12} /> Back to the default list
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-50">
              {saving && <Loader2 size={13} className="animate-spin" />} Save the list
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
