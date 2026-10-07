import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Images, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { addMyGalleryPictures, fetchMyGallery, saveMyGallery, withFileToken, type ApiProfilePicture } from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";

/**
 * 2026-10-08 - "allow all users to add multiple pictures (a gallery) in their profile, with a title /
 * description for each. Pictures will be used in creating Employee or Contractor ID cards, profile
 * reports or company profiles." A button beside the name opens the gallery: a read view first, then
 * Edit (add several at once, title and description, order, remove) and Save, like every document.
 */
type DraftPic = { key: string; id?: string; url: string; file?: File; title: string; description: string };
const MAX = 60;

export default function ProfileGallery() {
  const [list, setList] = useState<ApiProfilePicture[] | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftPic[] | null>(null);   // non-null while editing
  const [saving, setSaving] = useState(false);
  const { confirm, dialogs } = useDialogs();
  useEffect(() => { fetchMyGallery().then(setList).catch(() => setList([])); }, []);

  const pics = list || [];
  const startEdit = () => setDraft(pics.map((p) => ({ key: p.id, id: p.id, url: p.url, title: p.title, description: p.description })));
  const dropPreviews = (d: DraftPic[] | null) => d?.forEach((x) => { if (x.file) URL.revokeObjectURL(x.url); });
  const dirty = !!draft && (draft.length !== pics.length || draft.some((d, i) => d.file || d.id !== pics[i]?.id || d.title !== pics[i]?.title || d.description !== pics[i]?.description));
  /** False when the user keeps editing. */
  const stopEdit = async (): Promise<boolean> => {
    if (dirty && !(await confirm({ title: "Discard the changes?", message: "The gallery stays as it was last saved.", confirmLabel: "Discard changes", danger: true }))) return false;
    dropPreviews(draft); setDraft(null);
    return true;
  };
  const close = async () => { if (draft && !(await stopEdit())) return; setOpen(false); };

  const addFiles = (files: FileList | null) => {
    const picked = Array.from<File>(files || []).filter((f) => ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(f.type));
    if (!picked.length || !draft) return;
    const room = MAX - draft.length;
    if (picked.length > room) toast(`A gallery keeps up to ${MAX} pictures: ${room > 0 ? `only the first ${room} were added` : "remove some first"}.`, "error");
    setDraft([...draft, ...picked.slice(0, Math.max(0, room)).map((file) => ({ key: `new-${file.name}-${Math.random()}`, url: URL.createObjectURL(file), file, title: "", description: "" }))]);
  };
  const setPic = (i: number, p: Partial<DraftPic>) => setDraft((d) => d && d.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, dir: -1 | 1) => setDraft((d) => {
    if (!d) return d;
    const j = i + dir;
    if (j < 0 || j >= d.length) return d;
    const n = d.slice();
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const remove = (i: number) => setDraft((d) => { if (!d) return d; const x = d[i]; if (x?.file) URL.revokeObjectURL(x.url); return d.filter((_, j) => j !== i); });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const fresh = draft.filter((d) => d.file);
      const idOf = new Map<string, string>();
      if (fresh.length) {
        const r = await addMyGalleryPictures(fresh.map((d) => d.file!), fresh.map((d) => ({ title: d.title.trim(), description: d.description.trim() })));
        fresh.forEach((d, i) => { if (r.created[i]) idOf.set(d.key, r.created[i]); });
      }
      const items = draft.map((d) => ({ id: d.id || idOf.get(d.key) || "", title: d.title.trim(), description: d.description.trim() })).filter((x) => x.id);
      const saved = await saveMyGallery(items);
      setList(saved);
      dropPreviews(draft); setDraft(null);
      toast("Gallery saved.", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save the gallery.", "error"); }
    finally { setSaving(false); }
  };

  const src = (d: { url: string; file?: File }) => (d.file ? d.url : withFileToken(d.url));
  const inp = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/15";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Your picture gallery (for ID cards, profile reports and company profiles)"
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary">
        {pics.length > 0
          ? <span className="flex -space-x-1.5">{pics.slice(0, 3).map((p) => <img key={p.id} src={withFileToken(p.url)} alt="" className="h-5 w-5 rounded-md border border-white object-cover" />)}</span>
          : <Images size={13} />}
        Picture gallery{list ? ` · ${pics.length}` : ""}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) void close(); }}>
          <div role="dialog" aria-label="Picture gallery" className="my-8 flex w-full max-w-4xl flex-col rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-3xl border-b border-slate-100 bg-white px-6 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-base font-bold text-slate-900"><Images size={17} className="text-primary" /> Picture gallery</p>
                <p className="text-[11px] text-slate-400">Used for ID cards, profile reports and company profiles. {draft ? "Give each picture a title and a description if you like." : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                {!draft
                  ? <button type="button" onClick={startEdit} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-primary"><Pencil size={13} /> Edit</button>
                  : <>
                      <button type="button" onClick={() => void stopEdit()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><X size={13} /> Cancel</button>
                      <button type="button" onClick={() => void save()} disabled={saving || !dirty} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save</button>
                    </>}
                <button type="button" onClick={() => void close()} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
              </div>
            </div>

            <div className="p-6">
              {!draft ? (
                pics.length === 0
                  ? <p className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">No pictures yet. Click <b>Edit</b> to add some.</p>
                  : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {pics.map((p) => (
                        <figure key={p.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                          <a href={withFileToken(p.url)} target="_blank" rel="noreferrer" title="Open the full picture"><img src={withFileToken(p.url)} alt={p.title || "Picture"} className="aspect-[4/3] w-full object-cover" /></a>
                          <figcaption className="space-y-0.5 px-3 py-2">
                            <p className={`truncate text-xs font-bold ${p.title ? "text-slate-800" : "italic text-slate-400"}`} title={p.title}>{p.title || "No title"}</p>
                            {p.description && <p className="line-clamp-3 text-[11px] leading-snug text-slate-500">{p.description}</p>}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
              ) : (
                <div className="space-y-4">
                  <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 py-5 text-sm font-bold text-slate-500 hover:border-primary hover:text-primary ${draft.length >= MAX ? "pointer-events-none opacity-50" : ""}`}>
                    <Plus size={16} /> Add pictures <span className="font-medium text-slate-400">(several at once; {draft.length} of {MAX})</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                  </label>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {draft.map((d, i) => (
                      <div key={d.key} className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                        <div className="relative">
                          <img src={src(d)} alt="" className="aspect-[4/3] w-full object-cover" />
                          {d.file && <span className="absolute left-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">New</span>}
                          <div className="absolute right-2 top-2 flex gap-1">
                            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier" className="rounded-lg bg-white/90 p-1.5 text-slate-600 shadow hover:text-primary disabled:opacity-40"><ArrowLeft size={13} /></button>
                            <button type="button" onClick={() => move(i, 1)} disabled={i === draft.length - 1} aria-label="Move later" className="rounded-lg bg-white/90 p-1.5 text-slate-600 shadow hover:text-primary disabled:opacity-40"><ArrowRight size={13} /></button>
                            <button type="button" onClick={() => remove(i)} aria-label="Remove the picture" className="rounded-lg bg-white/90 p-1.5 text-slate-500 shadow hover:text-red-600"><Trash2 size={13} /></button>
                          </div>
                        </div>
                        <div className="space-y-1.5 p-3">
                          <input value={d.title} onChange={(e) => setPic(i, { title: e.target.value })} placeholder="Title (optional)" aria-label="Title" maxLength={160} className={`${inp} font-semibold`} />
                          <textarea value={d.description} onChange={(e) => setPic(i, { description: e.target.value })} placeholder="Description (optional)" aria-label="Description" rows={2} maxLength={1000} className={`${inp} resize-y`} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {draft.length === 0 && <p className="text-center text-xs text-slate-400">The gallery is empty. Add pictures above.</p>}
                </div>
              )}
            </div>
          </div>
          {/* The discard question shows over this window. */}
          {dialogs}
        </div>,
        document.body,
      )}
    </>
  );
}
