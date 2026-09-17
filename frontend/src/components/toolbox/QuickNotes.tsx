import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2, Plus, StickyNote } from "lucide-react";
import { createStickyNote, deleteStickyNote, fetchStickyNotes, updateStickyNote, type ApiStickyNote } from "../../lib/api";
import { toast } from "../../lib/toast";
import ExportActions from "./ExportActions";

// Quick Notes: a scratchpad kept in this browser, and saved notes (the same personal notes as on
// the Reminders page). Any note can be saved to a project as a branded PDF.

const SCRATCH_KEY = "gt-toolbox-scratch";

async function noteToPdf(text: string, title: string): Promise<File> {
  const [{ PDFDocument }, brand] = await Promise.all([import("pdf-lib"), import("../../lib/pdfBrand")]);
  const doc = await PDFDocument.create();
  const b = await brand.loadBrand(doc);
  const X = brand.GUTTER, W = brand.LETTER.w - brand.GUTTER * 2;
  const newPage = () => brand.brandPage(doc, b, brand.LETTER, title);
  let f = newPage();
  f.y = brand.titleBlock(f.page, b, { x: X, y: f.y, w: W, eyebrow: "Note", title, meta: [["Date", new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })]] });
  f = brand.flowText(f, text, { x: X, w: W, font: b.regular, size: 10.5, lineHeight: 15, color: brand.C.slate, newPage });
  brand.stampPageNumbers(doc, b);
  const bytes = await doc.save();
  return new File([bytes], `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "note"}.pdf`, { type: "application/pdf" });
}

const titleOf = (text: string) => (text.trim().split("\n")[0] || "Note").slice(0, 60);

export default function QuickNotes() {
  const [view, setView] = useState<"scratch" | "saved">("scratch");
  const [scratch, setScratch] = useState(() => { try { return localStorage.getItem(SCRATCH_KEY) || ""; } catch { return ""; } });
  useEffect(() => { try { localStorage.setItem(SCRATCH_KEY, scratch); } catch { /* ignore */ } }, [scratch]);

  const [notes, setNotes] = useState<ApiStickyNote[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (view !== "saved" || notes) return;
    fetchStickyNotes().then(setNotes).catch(() => setNotes([]));
  }, [view, notes]);
  useEffect(() => { const t = timers.current; return () => Object.values(t).forEach(clearTimeout); }, []);

  const keepScratch = async () => {
    if (!scratch.trim()) return;
    setBusy(true);
    try {
      const n = await createStickyNote({ text: scratch });
      setNotes((p) => (p ? [n, ...p] : p));
      setScratch("");
      toast("Note saved. It is also on your Reminders page.", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save the note.", "error"); }
    finally { setBusy(false); }
  };
  const addNote = async () => {
    setBusy(true);
    try { const n = await createStickyNote({ text: "" }); setNotes((p) => [n, ...(p || [])]); setOpenId(n._id); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not add a note.", "error"); }
    finally { setBusy(false); }
  };
  const edit = (id: string, text: string) => {
    setNotes((p) => p && p.map((n) => (n._id === id ? { ...n, text } : n)));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => { updateStickyNote(id, { text }).catch(() => toast("Could not save the note.", "error")); }, 600);
  };
  const remove = async (id: string) => {
    try { await deleteStickyNote(id); setNotes((p) => p && p.filter((n) => n._id !== id)); setOpenId(null); toast("Note moved to Deleted notes (Reminders page).", "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not delete the note.", "error"); }
  };

  const tab = (k: typeof view, label: string) => (
    <button type="button" onClick={() => { setView(k); setOpenId(null); }} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${view === k ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>
  );
  const area = "w-full resize-y rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2 text-sm leading-relaxed text-slate-800 focus:border-amber-400 focus:outline-none";
  const open = notes?.find((n) => n._id === openId);

  return (
    <div className="space-y-2">
      <div className="flex gap-1">{tab("scratch", "Scratchpad")}{tab("saved", "Saved notes")}</div>

      {view === "scratch" && (
        <>
          <textarea value={scratch} onChange={(e) => setScratch(e.target.value)} rows={9} placeholder="Quick notes. Kept in this browser until you clear them." className={area} />
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={keepScratch} disabled={busy || !scratch.trim()} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-40">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <StickyNote size={12} />} Keep as saved note
            </button>
          </div>
          <ExportActions
            getFile={() => noteToPdf(scratch, titleOf(scratch))}
            copyText={() => scratch}
            onDelete={() => setScratch("")}
            deleteLabel="Clear"
            actions={["copy", "download", "attach", "share", "delete"]}
            disabled={!scratch.trim()}
            version={scratch}
          />
        </>
      )}

      {view === "saved" && !open && (
        <>
          <button type="button" onClick={addNote} disabled={busy} className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-1.5 text-[11px] font-bold text-slate-500 hover:border-primary hover:text-primary">
            <Plus size={12} /> New note
          </button>
          {!notes ? <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-slate-400" /></div> : notes.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">No saved notes yet.</p>
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {notes.map((n) => (
                <li key={n._id}>
                  <button type="button" onClick={() => setOpenId(n._id)} className="w-full rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-1.5 text-left hover:border-amber-300">
                    <span className="block truncate text-xs font-bold text-slate-800">{titleOf(n.text) || "Empty note"}</span>
                    <span className="block text-[10px] text-slate-400">{n.updatedAt ? new Date(n.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {view === "saved" && open && (
        <>
          <button type="button" onClick={() => setOpenId(null)} className="inline-flex items-center gap-0.5 text-[11px] font-bold text-slate-500 hover:text-primary"><ChevronLeft size={13} /> All notes</button>
          <textarea autoFocus value={open.text} onChange={(e) => edit(open._id, e.target.value)} rows={9} placeholder="Write your note. It saves as you type." className={area} />
          <ExportActions
            getFile={() => noteToPdf(open.text, titleOf(open.text))}
            copyText={() => open.text}
            onDelete={() => void remove(open._id)}
            actions={["copy", "download", "attach", "share", "delete"]}
            disabled={!open.text.trim()}
            version={open.text}
          />
          <p className="text-[10px] text-slate-400">Download, Attach and Share make a PDF of the note on the GreenTech letterhead.</p>
        </>
      )}
    </div>
  );
}
