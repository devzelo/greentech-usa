import { useEffect, useState } from "react";
import { X, Search, Plus, Pencil, Trash2, Loader2, Library, ArrowRight } from "lucide-react";
import {
  fetchResourceBlocks, createResourceBlock, updateResourceBlock, deleteResourceBlock,
  RESOURCE_CATEGORIES, type ApiResourceBlock,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import RichTextEditor from "./RichTextEditor";
import { ConfirmDialog } from "./Dialogs";

const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/10";
const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";

export default function ResourceLibrary({
  open, onClose, onInsert, canEdit,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (block: ApiResourceBlock) => void;
  canEdit: boolean;
}) {
  const [blocks, setBlocks] = useState<ApiResourceBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");

  const [editing, setEditing] = useState<ApiResourceBlock | null>(null); // block being edited
  const [creating, setCreating] = useState(false);
  const [fTitle, setFTitle] = useState("");
  const [fCat, setFCat] = useState("Other");
  const [fBody, setFBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiResourceBlock | null>(null);

  const load = async () => {
    setLoading(true);
    try { setBlocks(await fetchResourceBlocks({ q, category: cat })); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open) void load(); /* eslint-disable-next-line */ }, [open, cat]);

  if (!open) return null;

  const startCreate = () => { setCreating(true); setEditing(null); setFTitle(""); setFCat("Other"); setFBody(""); };
  const startEdit = (b: ApiResourceBlock) => { setEditing(b); setCreating(false); setFTitle(b.title); setFCat(b.category); setFBody(b.body); };
  const closeForm = () => { setCreating(false); setEditing(null); };

  const save = async () => {
    if (!fTitle.trim()) { toast("Enter a title.", "error"); return; }
    setSaving(true);
    try {
      if (editing) { await updateResourceBlock(editing._id, { title: fTitle, category: fCat, body: fBody }); toast("Resource updated.", "success"); }
      else { await createResourceBlock({ title: fTitle, category: fCat, body: fBody }); toast("Resource saved.", "success"); }
      closeForm();
      await load();
    } catch (err) { toast(err instanceof Error ? err.message : "Save failed.", "error"); }
    finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try { await deleteResourceBlock(deleteTarget._id); toast("Resource deleted.", "success"); setDeleteTarget(null); await load(); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); setDeleteTarget(null); }
  };

  const formOpen = creating || !!editing;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-[2rem] p-8 w-full max-w-3xl shadow-2xl max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-display font-bold text-slate-900 flex items-center gap-2"><Library size={18} className="text-primary" /> Resource Library</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>

        {formOpen ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className={lbl}>Title</label><input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="e.g. Standard QA/QC Methodology" className={inp} /></div>
              <div className="space-y-1.5"><label className={lbl}>Category</label><select value={fCat} onChange={(e) => setFCat(e.target.value)} className={inp}>{RESOURCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            </div>
            <div className="space-y-1.5"><label className={lbl}>Content</label><RichTextEditor value={fBody} onChange={setFBody} placeholder="Reusable content…" minHeight={180} /></div>
            <div className="flex gap-3">
              <button onClick={closeForm} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2">{saving && <Loader2 size={15} className="animate-spin" />} {editing ? "Save changes" : "Save resource"}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-grow min-w-[180px]">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void load(); }} placeholder="Search resources…" className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/10" />
              </div>
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm font-medium outline-none">
                <option value="All">All categories</option>
                {RESOURCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {canEdit && <button onClick={startCreate} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"><Plus size={14} /> New</button>}
            </div>

            {loading ? (
              <div className="py-10 flex justify-center text-slate-300"><Loader2 size={20} className="animate-spin" /></div>
            ) : blocks.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-8 text-center">No resources yet.{canEdit ? " Click “New” to create a reusable block." : ""}</p>
            ) : (
              <div className="space-y-1.5">
                {blocks.map((b) => (
                  <div key={b._id} className="flex items-center gap-2 p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50">
                    <div className="min-w-0 flex-grow">
                      <p className="text-sm font-bold text-slate-800 truncate">{b.title}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest">{b.category}</p>
                    </div>
                    {canEdit && <button onClick={() => startEdit(b)} className="p-1.5 rounded text-slate-400 hover:text-primary" title="Edit"><Pencil size={14} /></button>}
                    {canEdit && <button onClick={() => setDeleteTarget(b)} className="p-1.5 rounded text-slate-400 hover:text-red-500" title="Delete"><Trash2 size={14} /></button>}
                    <button onClick={() => onInsert(b)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary/20" title="Insert into proposal as a section">Insert <ArrowRight size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <ConfirmDialog open={!!deleteTarget} title="Delete resource?" message={`Permanently remove "${deleteTarget?.title || "this"}".`} confirmLabel="Delete" onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
      </div>
    </div>
  );
}
