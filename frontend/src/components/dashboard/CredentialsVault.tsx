import { useEffect, useMemo, useState } from "react";
import {
  Check, Copy, Eye, EyeOff, ExternalLink, KeyRound, Loader2, Pencil, Plus, Search, Share2, Trash2, X,
} from "lucide-react";
import {
  fetchCredentials, fetchCredential, createCredential, updateCredential, deleteCredential, fetchCredentialPeople,
  getAuthUser, type ApiCredential, type ApiCredentialPerson, type CredentialInput,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";

/**
 * CR 263 (2026-09-22): the logins for the websites the team uses, kept beside the classified files
 * and behind the same PIN. A searchable list; an entry opens read-only with a copy button on every
 * field and turns into a form only when Edit is pressed. An entry belongs to whoever saved it and
 * can be shared with named colleagues.
 */

const BLANK: CredentialInput = { platform: "", url: "", username: "", password: "", hint: "", notes: "", sharedWith: [] };

function CopyField({ label, value, mask = false }: { label: string; value: string; mask?: boolean }) {
  const [shown, setShown] = useState(!mask);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { toast("Could not copy.", "error"); }
  };
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <div className="flex items-center gap-2">
        <p className={`min-w-0 flex-1 break-all text-xs font-semibold text-slate-800 ${mask && !shown ? "tracking-widest" : ""}`}>
          {value ? (mask && !shown ? "••••••••••" : value) : <span className="font-medium italic text-slate-300">not set</span>}
        </p>
        {mask && value && (
          <button type="button" onClick={() => setShown((v) => !v)} title={shown ? "Hide" : "Show"} className="rounded p-1 text-slate-400 hover:bg-white hover:text-primary">
            {shown ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
        {value && (
          <button type="button" onClick={() => void copy()} title={`Copy ${label.toLowerCase()}`} className="rounded p-1 text-slate-400 hover:bg-white hover:text-primary">
            {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function CredentialsVault({ onClose }: { onClose?: () => void }) {
  const me = getAuthUser();
  const { confirm, dialogs } = useDialogs();
  const [list, setList] = useState<ApiCredential[]>([]);
  const [people, setPeople] = useState<ApiCredentialPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<ApiCredential | null>(null);   // the entry being viewed (with its password)
  const [editing, setEditing] = useState<CredentialInput & { _id?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setList(await fetchCredentials());
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the credentials."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { fetchCredentialPeople().then(setPeople).catch(() => setPeople([])); }, []);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return list;
    return list.filter((c) => `${c.platform} ${c.username} ${c.url} ${c.hint} ${c.notes} ${c.ownerName}`.toLowerCase().includes(n));
  }, [list, q]);

  const openEntry = async (c: ApiCredential) => {
    setBusyId(c._id);
    try { setOpen(await fetchCredential(c._id)); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not open the entry.", "error"); }
    finally { setBusyId(""); }
  };

  const startEdit = (c?: ApiCredential) => {
    setEditing(c
      ? { _id: c._id, platform: c.platform, url: c.url, username: c.username, password: "", hint: c.hint, notes: c.notes, sharedWith: c.sharedWith }
      : { ...BLANK });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.platform?.trim()) { toast("Name the platform.", "error"); return; }
    setSaving(true);
    try {
      const saved = editing._id ? await updateCredential(editing._id, editing) : await createCredential(editing);
      setList((p) => (editing._id ? p.map((c) => (c._id === saved._id ? saved : c)) : [...p, saved]));
      setEditing(null);
      // Re-open the entry so it shows read-only with the new values.
      if (open?._id === saved._id) void openEntry(saved);
      toast(editing._id ? "Saved." : `${saved.platform} saved.`, "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save.", "error"); }
    finally { setSaving(false); }
  };

  const remove = async (c: ApiCredential) => {
    if (!(await confirm({ title: `Delete ${c.platform}?`, message: "The login is removed for everyone it was shared with.", confirmLabel: "Delete", danger: true }))) return;
    try {
      await deleteCredential(c._id);
      setList((p) => p.filter((x) => x._id !== c._id));
      if (open?._id === c._id) setOpen(null);
      toast("Deleted.", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Could not delete.", "error"); }
  };

  const nameOf = (id: string) => people.find((p) => p._id === id)?.name || "Someone";
  const inp = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10";

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <KeyRound size={15} className="text-amber-500" />
        <h3 className="flex-1 text-sm font-bold text-slate-900">Website credentials <span className="text-[11px] font-bold text-slate-400">({list.length})</span></h3>
        <button type="button" onClick={() => startEdit()} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-primary">
          <Plus size={12} /> Add
        </button>
        {onClose && <button type="button" onClick={onClose} title="Hide" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X size={16} /></button>}
      </div>

      <label className="relative block border-b border-slate-100 px-3 py-2">
        <Search size={13} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search platform, user, note..." className={`${inp} pl-7`} />
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-xs font-bold text-slate-400"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        ) : error ? (
          <p className="px-2 py-6 text-center text-xs font-semibold text-red-600">{error}</p>
        ) : shown.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-slate-400">{list.length ? "Nothing matches that." : "No logins saved yet."}</p>
        ) : (
          <ul className="space-y-1">
            {shown.map((c) => (
              <li key={c._id}>
                <div className="flex items-center gap-2 rounded-xl border border-slate-100 px-2.5 py-2 hover:border-primary/30 hover:bg-slate-50/60">
                  <button type="button" onClick={() => void openEntry(c)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-xs font-bold text-slate-800">{c.platform}</span>
                    <span className="block truncate text-[10px] text-slate-500">{c.username || "no username"}{c.ownerId !== me?.id ? ` · from ${c.ownerName}` : ""}</span>
                  </button>
                  {c.sharedWith.length > 0 && (
                    <span title={`Shared with ${c.sharedWith.map(nameOf).join(", ")}`} className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                      <Share2 size={9} /> {c.sharedWith.length}
                    </span>
                  )}
                  {busyId === c._id && <Loader2 size={12} className="animate-spin text-slate-400" />}
                  <button type="button" onClick={() => startEdit(c)} title="Edit" className="rounded p-1 text-slate-400 hover:bg-white hover:text-primary"><Pencil size={12} /></button>
                  {(c.ownerId === me?.id || me?.role === "admin") && (
                    <button type="button" onClick={() => void remove(c)} title="Delete" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={12} /></button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Saved state: read-only, every field with its own copy button. */}
      {open && !editing && (
        <div className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={() => setOpen(null)}>
          <div className="my-20 w-full max-w-md rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><KeyRound size={15} className="text-amber-500" /> {open.platform}</p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => startEdit(open)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary"><Pencil size={12} /> Edit</button>
                <button type="button" onClick={() => setOpen(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X size={18} /></button>
              </div>
            </div>
            <div className="space-y-2 p-5">
              {open.url && (
                <a href={/^https?:\/\//i.test(open.url) ? open.url : `https://${open.url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline">
                  <ExternalLink size={12} /> {open.url}
                </a>
              )}
              <CopyField label="Platform" value={open.platform} />
              <CopyField label="Username" value={open.username} />
              <CopyField label="Password" value={open.password || ""} mask />
              <CopyField label="Hint" value={open.hint} />
              {open.notes && <CopyField label="Notes" value={open.notes} />}
              <p className="text-[10px] text-slate-400">
                Saved by {open.ownerName || "unknown"}
                {open.sharedWith.length > 0 ? ` · shared with ${open.sharedWith.map(nameOf).join(", ")}` : " · not shared"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Edit state: the same entry as a form. */}
      {editing && (
        <div className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={() => setEditing(null)}>
          <div className="my-20 w-full max-w-md rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <p className="text-sm font-bold text-slate-900">{editing._id ? `Edit ${editing.platform}` : "New login"}</p>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X size={18} /></button>
            </div>
            <div className="space-y-3 p-5">
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Platform</span>
                <input autoFocus value={editing.platform || ""} onChange={(e) => setEditing({ ...editing, platform: e.target.value })} placeholder="e.g. SAM.gov" className={`${inp} mt-1`} /></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Website</span>
                <input value={editing.url || ""} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="e.g. sam.gov" className={`${inp} mt-1`} /></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Username</span>
                <input value={editing.username || ""} onChange={(e) => setEditing({ ...editing, username: e.target.value })} autoComplete="off" className={`${inp} mt-1`} /></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Password</span>
                <input type="text" value={editing.password || ""} onChange={(e) => setEditing({ ...editing, password: e.target.value })} autoComplete="new-password"
                  placeholder={editing._id ? "Leave blank to keep the saved password" : ""} className={`${inp} mt-1 font-mono`} /></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Hint</span>
                <input value={editing.hint || ""} onChange={(e) => setEditing({ ...editing, hint: e.target.value })} placeholder="e.g. security question answer, which email it is under" className={`${inp} mt-1`} /></label>
              <label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Notes</span>
                <textarea rows={2} value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className={`${inp} mt-1 resize-y`} /></label>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Share with</span>
                <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-xl border border-slate-100 p-1.5">
                  {people.filter((p) => p._id !== me?.id).map((p) => {
                    const on = (editing.sharedWith || []).includes(p._id);
                    return (
                      <label key={p._id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs ${on ? "bg-emerald-50 font-semibold text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}>
                        <input type="checkbox" checked={on} className="accent-emerald-600"
                          onChange={() => setEditing({ ...editing, sharedWith: on ? (editing.sharedWith || []).filter((x) => x !== p._id) : [...(editing.sharedWith || []), p._id] })} />
                        <span className="flex-1 truncate">{p.name || p.email}</span>
                        <span className="text-[9px] uppercase tracking-wider text-slate-400">{p.role}</span>
                      </label>
                    );
                  })}
                  {people.length <= 1 && <p className="px-2 py-2 text-[11px] italic text-slate-400">No one else to share with yet.</p>}
                </div>
                <p className="text-[10px] text-slate-400">Shared colleagues still need the classified PIN to open it.</p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditing(null)} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-50">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {editing._id ? "Save changes" : "Save login"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {dialogs}
    </div>
  );
}
