import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Loader2, Trash2, Archive, ArchiveRestore, CheckCircle2, ArrowLeft, Calendar, MapPin, Users, ListChecks, Save, AtSign, Eye,
} from "lucide-react";
import {
  fetchMinutes, createMinute, updateMinute, deleteMinute, uploadDocument, documentUrl,
  type ApiMinute, type MinuteAttendee, type MinuteItem, type MinuteKind,
} from "../../lib/api";
import { buildMinutesPdf } from "../../lib/minutesPdf";
import RichTextEditor from "./RichTextEditor";
import ShareMenu from "./ShareMenu";
import HelpTip from "./HelpTip";
import PdfPreviewModal from "./PdfPreviewModal";
import AttendeePicker from "./AttendeePicker";
import { findMentions, type MentionUser } from "./MentionInput";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";

/**
 * CR 208 / 209: "Start new meeting" (and "Start new report"): minutes written in the platform
 * instead of uploaded, with agenda items and @mentions. Saving records the date, the project and
 * the attendees; each one can be shared, downloaded, archived or deleted. Uploads keep their own
 * area below this one.
 */

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const plain = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const dayLabel = (s?: string) => {
  if (!s) return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { dateStyle: "medium" });
};

export interface MinutesPanelProps {
  projectId: string;
  /** Where a shared PDF is filed, so the link lives with the rest of this tab's documents. */
  section: string;
  projectName: string;
  projectNo?: string;
  kind: MinuteKind;
  canEdit: boolean;
  /** Everyone on this project: the default attendees, and who can be @mentioned. */
  people: Array<{ id?: string; name: string; role?: string; company?: string }>;
  /** Tell someone they were named in a note (the same reminder the proposal sections send). */
  onMention?: (people: MentionUser[], context: string, note: string) => void;
}

export default function MinutesPanel({ projectId, section, projectName, projectNo, kind, canEdit, people, onMention }: MinutesPanelProps) {
  const isProgress = kind === "progress";
  const NOUN = isProgress ? "progress report" : "meeting";
  const { confirm, dialogs } = useDialogs();
  const [rows, setRows] = useState<ApiMinute[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState<ApiMinute | null>(null);   // the one being written
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const dirty = useRef(false);

  const mentionUsers = useMemo<MentionUser[]>(() => people.filter((p) => p.name).map((p) => ({ id: p.id || p.name, name: p.name })), [people]);

  const load = async () => {
    try { setRows(await fetchMinutes(projectId, kind, showArchived)); }
    catch { setRows([]); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId, kind, showArchived]);

  const patch = (p: Partial<ApiMinute>) => { dirty.current = true; setOpen((m) => (m ? { ...m, ...p } : m)); };
  const patchItem = (id: string, p: Partial<MinuteItem>) =>
    patch({ items: (open?.items || []).map((it) => (it.id === id ? { ...it, ...p } : it)) });

  const startNew = async () => {
    const draft: Partial<ApiMinute> & { kind: MinuteKind } = {
      kind,
      title: isProgress ? `Progress report - ${dayLabel(today())}` : `Project meeting - ${dayLabel(today())}`,
      date: today(),
      time: isProgress ? "" : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      period: isProgress ? "" : undefined,
      // "On save it records the date, project and attendees automatically": the project's people
      // are on it from the start, and anyone can be unticked.
      attendees: people.map<MinuteAttendee>((p) => ({ userId: p.id, name: p.name, role: p.role || "", company: p.company || "", present: true })),
      // A report opens with the parts every progress report has; a meeting with one empty item.
      items: (isProgress
        ? ["Work completed this period", "Work planned for the next period", "Progress against the schedule", "Issues, risks and delays", "Health, safety and environment"]
        : ["Agenda item 1"]
      ).map((title) => ({ id: uid(), title, notes: "", actions: [] })),
      summary: "",
      status: "draft",
    };
    setBusy("new");
    try {
      const created = await createMinute(projectId, draft);
      setRows((r) => [created, ...(r || [])]);
      setOpen(created);
      dirty.current = false;
    } catch (e) { toast(e instanceof Error ? e.message : `Could not start the ${NOUN}.`, "error"); }
    finally { setBusy(""); }
  };

  const save = async (m: ApiMinute, extra: Partial<ApiMinute> = {}, silent = false) => {
    setSaving(true);
    try {
      // Anyone newly named in a note is told, once, with the note (CR 201's rule, same idea here).
      const text = [m.summary, ...m.items.map((i) => i.notes)].map(plain).join(" ");
      const named = findMentions(text, mentionUsers);
      const fresh = named.filter((u) => !(m.mentioned || []).includes(u.name));
      const body = { ...m, ...extra, mentioned: named.map((u) => u.name) };
      const saved = await updateMinute(projectId, m._id, body);
      setRows((r) => (r || []).map((x) => (x._id === saved._id ? saved : x)));
      setOpen((cur) => (cur && cur._id === saved._id ? saved : cur));
      dirty.current = false;
      if (fresh.length && onMention) onMention(fresh, saved.title || NOUN, plain(text).slice(0, 300));
      if (!silent) toast(`${isProgress ? "Report" : "Minutes"} saved.`, "success");
      return saved;
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save.", "error"); return null; }
    finally { setSaving(false); }
  };

  const remove = async (m: ApiMinute) => {
    if (!(await confirm({
      title: `Delete "${m.title || NOUN}"?`,
      message: "It goes to the recycle bin with everything written in it.",
      confirmLabel: "Delete",
      danger: true,
    }))) return;
    try {
      await deleteMinute(projectId, m._id);
      setRows((r) => (r || []).filter((x) => x._id !== m._id));
      if (open?._id === m._id) setOpen(null);
      toast("Deleted.", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not delete.", "error"); }
  };

  const setArchived = async (m: ApiMinute, archived: boolean) => {
    try {
      await updateMinute(projectId, m._id, { archived });
      setRows((r) => (r || []).filter((x) => x._id !== m._id));
      if (open?._id === m._id) setOpen(null);
      toast(archived ? "Archived." : "Back in the list.", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not archive.", "error"); }
  };

  const pdfName = (m: ApiMinute) => `${(m.title || NOUN).replace(/[^a-z0-9._-]+/gi, "_")}.pdf`;
  // CR 250 - the printed look before saving, before marking final and before printing.
  const [preview, setPreview] = useState<{ m: ApiMinute; final?: boolean } | null>(null);
  const previewModal = preview && (
    <PdfPreviewModal
      title={preview.m.title || (isProgress ? "Progress report" : "Meeting minutes")}
      fileName={pdfName(preview.m)}
      build={() => buildMinutesPdf({ minute: preview.m, projectName, projectNo })}
      onClose={() => setPreview(null)}
      hint={preview.final ? "Check the printed version. Once final it is shown as final to everyone." : undefined}
      actions={canEdit && open?._id === preview.m._id ? [
        ...(preview.final ? [] : [{ label: "Save", icon: <Save size={12} />, onClick: async () => !!(await save(preview.m)) }]),
        ...(preview.m.status !== "final" ? [{ label: "Mark as final", icon: <CheckCircle2 size={12} />, tone: "final" as const, onClick: async () => !!(await save(preview.m, { status: "final" })) }] : []),
      ] : undefined}
    />
  );


  // ── One record, open for writing ──────────────────────────────────────────
  if (open) {
    const m = open;
    const mentioned = findMentions([m.summary, ...m.items.map((i) => i.notes)].map(plain).join(" "), mentionUsers);
    const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/10";
    const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
    return (
      <div className="space-y-5">
        {dialogs}
      {previewModal}
        {previewModal}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => { void (dirty.current ? save(m, {}, true) : null); setOpen(null); }} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-primary">
            <ArrowLeft size={13} /> All {isProgress ? "reports" : "minutes"}
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {m.status === "final"
              ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-white"><CheckCircle2 size={11} /> Final</span>
              : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-amber-700">Draft</span>}
            {canEdit && (
              <button onClick={() => void save(m)} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-[11px] font-bold text-white hover:bg-primary disabled:opacity-50">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
              </button>
            )}
            {canEdit && m.status !== "final" && (
              <button onClick={() => setPreview({ m, final: true })} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 px-3 py-2 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50">
                <CheckCircle2 size={12} /> Mark as final
              </button>
            )}
            <button onClick={() => setPreview({ m })} title="The printed version: print, send or download it, save it or mark it final" className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-200">
              <Eye size={12} /> Preview
            </button>
            {canEdit && (
              <button onClick={() => void setArchived(m, true)} title="Archive" className="rounded-lg p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-600"><Archive size={14} /></button>
            )}
            {canEdit && (
              <button onClick={() => void remove(m)} title="Delete" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <input value={m.title} onChange={(e) => patch({ title: e.target.value })} disabled={!canEdit} placeholder={isProgress ? "Report title" : "Meeting title"} aria-label="Title"
            className="w-full bg-transparent text-lg font-display font-bold text-slate-900 outline-none" />
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1"><span className={lbl}>{isProgress ? "Report date" : "Date"}</span>
              <input type="date" value={m.date || ""} onChange={(e) => patch({ date: e.target.value })} disabled={!canEdit} className={inp} /></label>
            {isProgress ? (
              <label className="space-y-1 md:col-span-2"><span className={lbl}>Period covered</span>
                <input value={m.period || ""} onChange={(e) => patch({ period: e.target.value })} disabled={!canEdit} placeholder="e.g. Week 12, or 1 to 31 May 2026" className={inp} /></label>
            ) : (
              <>
                <label className="space-y-1"><span className={lbl}>Time</span>
                  <input value={m.time || ""} onChange={(e) => patch({ time: e.target.value })} disabled={!canEdit} placeholder="10:00" className={inp} /></label>
                <label className="space-y-1"><span className={lbl}>Location</span>
                  <input value={m.location || ""} onChange={(e) => patch({ location: e.target.value })} disabled={!canEdit} placeholder="Site office, Teams, ..." className={inp} /></label>
              </>
            )}
            <div className="space-y-1">
              <span className={lbl}>Project</span>
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">{projectName}{projectNo ? ` · ${projectNo}` : ""}</p>
            </div>
          </div>

          {/* Attendees: the project's people, ticked. */}
          <div className="rounded-2xl border border-slate-100">
            <p className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <Users size={12} /> {isProgress ? "People this concerns" : "Attendees"} ({m.attendees.filter((a) => a.present !== false).length} of {m.attendees.length})
              <HelpTip title={isProgress ? "People" : "Attendees"}>Everyone on this project is here from the start. Untick anyone who was not there. Add someone picks from the team, the staff and the Directory, or takes a name for a visitor.</HelpTip>
            </p>
            <ul className="divide-y divide-slate-50">
              {m.attendees.map((a, i) => (
                <li key={a.userId || `row-${i}`} className="flex items-center gap-3 px-4 py-2">
                  <input type="checkbox" checked={a.present !== false} disabled={!canEdit} onChange={(e) => patch({ attendees: m.attendees.map((x, k) => (k === i ? { ...x, present: e.target.checked } : x)) })} className="accent-emerald-600" />
                  <input value={a.name} disabled={!canEdit} onChange={(e) => patch({ attendees: m.attendees.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} className="min-w-0 flex-1 bg-transparent text-xs font-bold text-slate-800 outline-none" aria-label="Name" />
                  <input value={a.role || ""} disabled={!canEdit} onChange={(e) => patch({ attendees: m.attendees.map((x, k) => (k === i ? { ...x, role: e.target.value } : x)) })} placeholder="Role" className="w-32 bg-transparent text-[11px] text-slate-500 outline-none" aria-label="Role" />
                  <input value={a.company || ""} disabled={!canEdit} onChange={(e) => patch({ attendees: m.attendees.map((x, k) => (k === i ? { ...x, company: e.target.value } : x)) })} placeholder="Company" className="w-36 bg-transparent text-[11px] text-slate-500 outline-none" aria-label="Company" />
                  {canEdit && <button onClick={() => patch({ attendees: m.attendees.filter((_, k) => k !== i) })} title="Remove" className="rounded p-1 text-slate-300 hover:text-rose-500"><Trash2 size={12} /></button>}
                </li>
              ))}
            </ul>
            {canEdit && (
              <AttendeePicker team={people} taken={m.attendees.map((a) => a.name)} onAdd={(a) => patch({ attendees: [...m.attendees, a] })} />
            )}
          </div>

          <div className="space-y-1">
            <span className={lbl}>{isProgress ? "Summary" : "Purpose"}</span>
            <RichTextEditor value={m.summary} onChange={(html) => patch({ summary: html })} disabled={!canEdit} placeholder={isProgress ? "How the period went, in a few lines..." : "Why the meeting was held..."} minHeight={90} />
          </div>
        </div>

        {/* Agenda / report items */}
        {m.items.map((it, i) => (
          <div key={it.id} className="space-y-3 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">{i + 1}.</span>
              <input value={it.title} onChange={(e) => patchItem(it.id, { title: e.target.value })} disabled={!canEdit} placeholder={isProgress ? "What this part covers" : "Agenda item"} className="flex-1 bg-transparent text-sm font-bold text-slate-800 outline-none" aria-label={`Item ${i + 1} title`} />
              {canEdit && <button onClick={() => patch({ items: m.items.filter((x) => x.id !== it.id) })} title="Remove this item" className="rounded p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={13} /></button>}
            </div>
            <RichTextEditor value={it.notes} onChange={(html) => patchItem(it.id, { notes: html })} disabled={!canEdit} placeholder="What was said, decided or done. Type @ and a name to bring someone in." minHeight={110} />
            <div className="rounded-2xl border border-slate-100">
              <p className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400"><ListChecks size={12} /> Actions</p>
              <ul className="divide-y divide-slate-50">
                {it.actions.map((a, k) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <input type="checkbox" checked={!!a.done} disabled={!canEdit} onChange={(e) => patchItem(it.id, { actions: it.actions.map((x, j) => (j === k ? { ...x, done: e.target.checked } : x)) })} className="accent-emerald-600" />
                    <input value={a.text} disabled={!canEdit} onChange={(e) => patchItem(it.id, { actions: it.actions.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })} placeholder="What needs doing" className={`min-w-[12rem] flex-1 bg-transparent text-xs outline-none ${a.done ? "text-slate-400 line-through" : "text-slate-700"}`} aria-label="Action" />
                    <select value={a.ownerName || ""} disabled={!canEdit} onChange={(e) => { const p = people.find((x) => x.name === e.target.value); patchItem(it.id, { actions: it.actions.map((x, j) => (j === k ? { ...x, ownerName: e.target.value, ownerUserId: p?.id } : x)) }); }} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600" aria-label="Owner">
                      <option value="">Owner...</option>
                      {people.map((p) => <option key={p.id || p.name} value={p.name}>{p.name}</option>)}
                    </select>
                    <input type="date" value={a.due || ""} disabled={!canEdit} onChange={(e) => patchItem(it.id, { actions: it.actions.map((x, j) => (j === k ? { ...x, due: e.target.value } : x)) })} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600" aria-label="Due date" />
                    {canEdit && <button onClick={() => patchItem(it.id, { actions: it.actions.filter((_, j) => j !== k) })} title="Remove" className="rounded p-1 text-slate-300 hover:text-rose-500"><Trash2 size={12} /></button>}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <button onClick={() => patchItem(it.id, { actions: [...it.actions, { id: uid(), text: "", done: false }] })} className="m-3 inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200">
                  <Plus size={11} /> Add an action
                </button>
              )}
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {canEdit && (
            <button onClick={() => patch({ items: [...m.items, { id: uid(), title: "", notes: "", actions: [] }] })} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-200">
              <Plus size={12} /> Add {isProgress ? "a part" : "an agenda item"}
            </button>
          )}
          {mentioned.length > 0 && (
            <p className="inline-flex items-center gap-1.5 text-[11px] text-slate-500"><AtSign size={12} className="text-primary" /> Notified on save: {mentioned.map((u) => u.name).join(", ")}</p>
          )}
        </div>
      </div>
    );
  }

  // ── The list ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      {dialogs}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            {isProgress ? "Progress reports written here" : "Meetings written here"}
            <HelpTip title={isProgress ? "Progress reports" : "Meeting minutes"}>
              Write them in the platform instead of uploading a file: parts or agenda items, actions with an
              owner and a due date, and @mentions that tell people. Saving records the date, the project and
              who was there. Each one can be downloaded or shared as a PDF, archived or deleted.
            </HelpTip>
          </h4>
          <p className="mt-0.5 text-[10px] text-slate-400">Uploads and folders are unchanged, below.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowArchived((v) => !v)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-200">
            <Archive size={12} /> {showArchived ? "Current" : "Archived"}
          </button>
          {canEdit && !showArchived && (
            <button onClick={() => void startNew()} disabled={busy === "new"} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-[11px] font-bold text-white hover:bg-primary disabled:opacity-50">
              {busy === "new" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Start new {isProgress ? "report" : "meeting"}
            </button>
          )}
        </div>
      </div>

      {rows === null && <p className="flex items-center gap-2 py-6 text-xs text-slate-400"><Loader2 size={13} className="animate-spin" /> Loading...</p>}
      {rows?.length === 0 && (
        <p className="py-6 text-center text-xs italic text-slate-400">
          {showArchived ? `Nothing archived.` : `No ${isProgress ? "reports" : "minutes"} written here yet. "Start new ${isProgress ? "report" : "meeting"}" writes one in the platform; uploaded files stay below.`}
        </p>
      )}
      <ul className="divide-y divide-slate-50">
        {(rows || []).map((m) => {
          const actions = m.items.reduce((n, it) => n + it.actions.length, 0);
          const openActions = m.items.reduce((n, it) => n + it.actions.filter((a) => !a.done).length, 0);
          return (
            <li key={m._id} className="flex flex-wrap items-center gap-3 py-2.5">
              <button onClick={() => setOpen(m)} className="min-w-0 flex-1 text-left">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-xs font-bold text-slate-800">{m.title || (isProgress ? "Progress report" : "Meeting")}</span>
                  {m.status === "final"
                    ? <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Final</span>
                    : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Draft</span>}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
                  <span className="inline-flex items-center gap-1"><Calendar size={10} /> {dayLabel(m.date) || "-"}{isProgress && m.period ? ` · ${m.period}` : ""}</span>
                  {!isProgress && !!m.location && <span className="inline-flex items-center gap-1"><MapPin size={10} /> {m.location}</span>}
                  <span className="inline-flex items-center gap-1"><Users size={10} /> {m.attendees.filter((a) => a.present !== false).length}</span>
                  {actions > 0 && <span className="inline-flex items-center gap-1"><ListChecks size={10} /> {openActions} of {actions} open</span>}
                  <span>by {m.createdByName || "-"}</span>
                </span>
              </button>
              <div className="flex items-center gap-1">
                <button onClick={() => setPreview({ m })} title="Preview: print, send or download" className="rounded p-1.5 text-slate-400 hover:text-primary">
                  <Eye size={13} />
                </button>
                {/* Sharing needs a link: the PDF is filed in this section's documents, then shared. */}
                <ShareMenu
                  fileName={pdfName(m)}
                  fileUrl=""
                  projectName={projectName}
                  size={13}
                  prepareFile={async () => {
                    const blob = await buildMinutesPdf({ minute: m, projectName, projectNo });
                    const doc = await uploadDocument(projectId, new File([blob], pdfName(m), { type: "application/pdf" }), section, true);
                    return documentUrl(doc);
                  }}
                />
                {canEdit && (
                  <button onClick={() => void setArchived(m, !m.archived)} title={m.archived ? "Put back" : "Archive"} className="rounded p-1.5 text-slate-300 hover:text-amber-500">
                    {m.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                  </button>
                )}
                {canEdit && <button onClick={() => void remove(m)} title="Delete" className="rounded p-1.5 text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
