import { useEffect, useRef, useState } from "react";
import { StickyNote as StickyIcon, Plus, Trash2, Loader2 } from "lucide-react";
import { fetchStickyNotes, createStickyNote, updateStickyNote, deleteStickyNote, type ApiStickyNote } from "../../lib/api";
import { toast } from "../../lib/toast";

// CR-P-63 — personal sticky notes on the Reminders page. Each note auto-saves (debounced while
// typing, and on blur) and is kept until the owner deletes it.
export default function StickyNotes() {
  const [notes, setNotes] = useState<ApiStickyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    fetchStickyNotes().then(setNotes).catch(() => setNotes([])).finally(() => setLoading(false));
    return () => { Object.values(timers.current).forEach(clearTimeout); };
  }, []);

  const add = async () => {
    setAdding(true);
    try { const n = await createStickyNote({ text: "" }); setNotes((p) => [n, ...p]); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not add note.", "error"); }
    finally { setAdding(false); }
  };
  const edit = (id: string, text: string) => {
    setNotes((p) => p.map((n) => (n._id === id ? { ...n, text } : n)));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => { updateStickyNote(id, { text }).catch(() => {}); }, 700);
  };
  const saveNow = (id: string, text: string) => { clearTimeout(timers.current[id]); updateStickyNote(id, { text }).catch(() => {}); };
  const remove = async (id: string) => {
    clearTimeout(timers.current[id]);
    try { await deleteStickyNote(id); setNotes((p) => p.filter((n) => n._id !== id)); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not delete.", "error"); }
  };

  return (
    <aside className="lg:sticky lg:top-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5"><StickyIcon size={14} className="text-amber-500" /> Sticky notes</p>
        <button onClick={add} disabled={adding} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary disabled:opacity-50">{adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={13} />} Add</button>
      </div>
      {loading ? (
        <div className="flex justify-center py-8 text-slate-300"><Loader2 size={18} className="animate-spin" /></div>
      ) : notes.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic bg-amber-50/60 border border-dashed border-amber-200 rounded-2xl p-4 text-center">No notes yet. Add one — it saves automatically as you type.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n._id} className="rounded-2xl border border-amber-200 bg-amber-50 shadow-sm p-3">
              <textarea
                value={n.text}
                onChange={(e) => edit(n._id, e.target.value)}
                onBlur={(e) => saveNow(n._id, e.target.value)}
                rows={4}
                placeholder="Write a note…"
                className="w-full bg-transparent resize-y text-sm text-slate-700 outline-none placeholder:text-amber-700/40 leading-relaxed"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[9px] font-bold text-amber-600/70 uppercase tracking-wide">Auto-saved</span>
                <button onClick={() => remove(n._id)} className="p-1 rounded text-amber-600/60 hover:text-red-500" title="Delete note"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
