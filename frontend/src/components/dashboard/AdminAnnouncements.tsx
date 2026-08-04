import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Megaphone, Plus, Trash2, Loader2, CalendarDays, Sparkles, Eye, EyeOff, ChevronDown } from "lucide-react";
import { fetchAllAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, seedHolidayAnnouncements, type ApiAnnouncement } from "../../lib/api";
import { toast } from "../../lib/toast";

const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10";
const EMPTY = { emoji: "📣", title: "", message: "", date: "", endDate: "", kind: "holiday" as ApiAnnouncement["kind"] };

// A curated palette of context images (emoji glyphs) to pick from, grouped so admins can quickly
// find something relevant to the announcement's category.
const GLYPHS: { group: string; items: string[] }[] = [
  { group: "Holidays", items: ["🎆", "🎇", "🎄", "🎅", "🕊️", "🇺🇸", "🎖️", "🦃", "🕎", "🪔", "🌙", "🐣", "❤️", "🍀"] },
  { group: "Celebration", items: ["🎉", "🎊", "🥳", "🍾", "🎈", "✨", "🏆", "🎁", "👏", "🌟"] },
  { group: "News & Updates", items: ["📣", "📢", "📰", "🗞️", "🔔", "⚡", "🚀", "💡", "🆕", "📌", "🤖", "📈"] },
  { group: "Events", items: ["📅", "🗓️", "🤝", "🎤", "🎫", "🏗️", "👷", "🌍", "💧", "♻️", "🏢", "🔧"] },
];

// Admin-only manager for the public hero announcements banner.
export default function AdminAnnouncements() {
  const [items, setItems] = useState<ApiAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = () => { fetchAllAnnouncements().then(setItems).catch(() => setItems([])).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!draft.title.trim()) { toast("Give the announcement a title.", "error"); return; }
    setSaving(true);
    try { const a = await createAnnouncement(draft); setItems((p) => [...p, a]); setDraft({ ...EMPTY }); toast("Announcement added.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not add.", "error"); }
    finally { setSaving(false); }
  };
  const patch = async (a: ApiAnnouncement, body: Partial<ApiAnnouncement>) => {
    setItems((p) => p.map((x) => x._id === a._id ? { ...x, ...body } : x));
    try { await updateAnnouncement(a._id, body); } catch { toast("Save failed.", "error"); load(); }
  };
  const remove = async (a: ApiAnnouncement) => {
    if (!confirm(`Delete "${a.title}"?`)) return;
    setItems((p) => p.filter((x) => x._id !== a._id));
    try { await deleteAnnouncement(a._id); } catch { toast("Delete failed.", "error"); load(); }
  };
  const seed = async () => {
    setSeeding(true);
    try { const r = await seedHolidayAnnouncements(); toast(r.added ? `Added ${r.added} holiday(s) for ${r.year}.` : "Holidays already present.", "success"); load(); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not seed.", "error"); }
    finally { setSeeding(false); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-10">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2"><Megaphone size={20} className="text-primary" /> Public Announcements</h2>
          <p className="text-xs text-slate-400 mt-1">Shown in the glass banner on the public website hero. Holidays, notices, or events.</p>
        </div>
        <button onClick={seed} disabled={seeding} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 shrink-0">
          {seeding ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Load this year's holidays
        </button>
      </div>

      {/* Add form */}
      <div className="bg-slate-50 rounded-2xl p-4 mb-6 space-y-2">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {/* Image picker — choose a context glyph from a curated, grouped palette */}
          <div className="relative">
            <button type="button" onClick={() => setPickerOpen((o) => !o)} title="Choose an image" className={`${inp} text-center text-xl hover:bg-white flex items-center justify-center gap-1`}>
              <span>{draft.emoji || "📣"}</span><ChevronDown size={12} className="text-slate-400" />
            </button>
            {pickerOpen && (
              <>
                <button type="button" className="fixed inset-0 z-10 cursor-default" onClick={() => setPickerOpen(false)} aria-label="Close picker" />
                <div className="absolute z-20 mt-1 left-0 w-72 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 space-y-3">
                  {GLYPHS.map((g) => (
                    <div key={g.group}>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">{g.group}</p>
                      <div className="grid grid-cols-7 gap-1">
                        {g.items.map((e) => (
                          <button key={e} type="button" onClick={() => { setDraft((d) => ({ ...d, emoji: e })); setPickerOpen(false); }}
                            className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center hover:bg-slate-100 ${draft.emoji === e ? "bg-primary/10 ring-1 ring-primary" : ""}`}>{e}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-slate-100">
                    <input className={inp} value={draft.emoji} maxLength={4} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} placeholder="…or paste a custom emoji" />
                  </div>
                </div>
              </>
            )}
          </div>
          <input className={`${inp} md:col-span-3`} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title (e.g. Merry Christmas)" />
          <select className={`${inp} font-bold`} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ApiAnnouncement["kind"] })}>
            <option value="holiday">Holiday</option>
            <option value="news">News</option>
            <option value="event">Event</option>
          </select>
          <button onClick={add} disabled={saving} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
          </button>
        </div>
        <input className={inp} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} placeholder="Message / greeting (optional)" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500">Show on <input type="date" className={inp} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500">Until <input type="date" className={inp} value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} /></label>
          <p className="text-[10px] text-slate-400 md:col-span-1">Shows <strong>only</strong> on the date. Set “Until” for a custom multi-day notice.</p>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-8 flex justify-center text-slate-300"><Loader2 size={20} className="animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-6">No announcements yet. Add one above or load this year's holidays.</p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a._id} className={`flex items-center gap-3 p-3 rounded-2xl border ${a.active ? "border-slate-100 bg-white" : "border-slate-100 bg-slate-50 opacity-60"}`}>
              <span className="text-2xl w-8 text-center shrink-0">{a.emoji || "📣"}</span>
              <div className="min-w-0 flex-grow">
                <p className="text-sm font-bold text-slate-800 truncate">{a.title} <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300 ml-1">{a.kind}</span></p>
                {a.message && <p className="text-[11px] text-slate-500 truncate">{a.message}</p>}
              </div>
              {a.date && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 whitespace-nowrap"><CalendarDays size={11} /> {new Date(a.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}{a.endDate ? ` → ${new Date(a.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}</span>}
              <button onClick={() => patch(a, { active: !a.active })} title={a.active ? "Shown — click to hide" : "Hidden — click to show"} className={`p-1.5 rounded-lg ${a.active ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-slate-100"}`}>
                {a.active ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button onClick={() => remove(a)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
