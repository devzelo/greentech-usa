import { useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import {
  fetchProjects, fetchGuests, createGuest, updateGuest, removeGuest, getAuthUser,
  type ApiGuest, type GuestTabPermission, type AdminUser,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import { TAB_ROWS, type Perm } from "./CompanyAccessManager";

// CR-P (12) — grant an EXISTING user (employee/admin) scoped per-project tab access, using the same
// unified guest mechanism as the directory. No password step: they already have a login. Every tab
// starts Hidden; switch the ones they should reach to View or Edit.
export default function UserAccessManager({ user }: { user: AdminUser }) {
  const { confirm, dialogs } = useDialogs();
  const myId = getAuthUser()?.id || "";
  const email = (user.email || "").trim();

  const [owned, setOwned] = useState<Array<{ id: string; name: string }>>([]);
  const [access, setAccess] = useState<Array<{ projectId: string; name: string; guest: ApiGuest }>>([]);
  // CR-P (16) — projects where this user is on the assigned team (set from the project workspace).
  // Shown here so both grant paths stay visible in one place.
  const [assigned, setAssigned] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  const [modalProject, setModalProject] = useState<{ id: string; name: string } | null>(null);
  const [existingGuest, setExistingGuest] = useState<ApiGuest | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [perms, setPerms] = useState<Record<string, Perm>>({});
  const [expiry, setExpiry] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyProject, setBusyProject] = useState<string | null>(null);
  const [pick, setPick] = useState("");

  const grantable = useMemo(() => owned, [owned]);

  const load = async () => {
    setLoading(true);
    try {
      const mine = await fetchProjects("mine");
      const ownedFull = mine.filter((p) => p.ownerId === myId);
      const ownedList = ownedFull.map((p) => ({ id: p.id, name: p.name }));
      setOwned(ownedList);
      setAssigned(user.empId
        ? ownedFull.filter((p) => (p.assignedEmployees || []).includes(user.empId!)).map((p) => ({ id: p.id, name: p.name }))
        : []);
      const found: Array<{ projectId: string; name: string; guest: ApiGuest }> = [];
      await Promise.all(ownedList.map(async (p) => {
        try {
          const guests = await fetchGuests(p.id);
          const g = guests.find((x) => String(x.userId) === String(user._id));
          if (g) found.push({ projectId: p.id, name: p.name, guest: g });
        } catch { /* not owner / no access — skip */ }
      }));
      setAccess(found);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not load access.", "error");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user._id, myId]);

  const openModal = async (projectId: string, name: string) => {
    setModalProject({ id: projectId, name });
    setModalLoading(true);
    setExpiry("");
    try {
      const guests = await fetchGuests(projectId);
      const g = guests.find((x) => String(x.userId) === String(user._id)) || null;
      setExistingGuest(g);
      const p: Record<string, Perm> = {};
      if (g) { Object.entries(g.tabPermissions || {}).forEach(([k, v]) => { p[k] = v; }); }
      else { TAB_ROWS.forEach((t) => { p[t.id] = "none"; }); }   // default every tab to Hidden
      setPerms(p);
      setExpiry(g?.expiresAt ? new Date(g.expiresAt).toISOString().slice(0, 10) : "");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not open access for this project.", "error");
      setModalProject(null);
    } finally { setModalLoading(false); }
  };
  const closeModal = () => { setModalProject(null); setExistingGuest(null); setPerms({}); setExpiry(""); };

  const resolveExpiry = (): string | null => {
    if (!expiry) return null;
    const days = expiry === "1w" ? 7 : expiry === "1m" ? 30 : expiry === "3m" ? 90 : 0;
    if (days) return new Date(Date.now() + days * 86400000).toISOString();
    const d = new Date(expiry);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  const save = async () => {
    if (!modalProject) return;
    if (!email) { toast("This user has no email on file.", "error"); return; }
    const tabPermissions: Record<string, GuestTabPermission> = {};
    Object.entries(perms).forEach(([k, v]) => { if (v === "view" || v === "edit") tabPermissions[k] = v; });
    setSaving(true);
    try {
      if (existingGuest) {
        await updateGuest(modalProject.id, existingGuest.userId, { tabPermissions, expiresAt: resolveExpiry() });
        toast("Access updated.", "success");
      } else {
        // No password: the backend reuses this user's existing account and just grants project access.
        await createGuest(modalProject.id, { name: user.name, email, tabPermissions, expiresAt: resolveExpiry() });
        toast(`${user.name || "User"} was given access to ${modalProject.name}.`, "success");
      }
      closeModal();
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save access.", "error");
    } finally { setSaving(false); }
  };

  const revoke = async (projectId: string, name: string, guest: ApiGuest) => {
    if (!(await confirm({ title: "Revoke access?", message: `Remove ${user.name || "this user"}'s access to "${name}".`, confirmLabel: "Revoke", cancelLabel: "Cancel", danger: true }))) return;
    setBusyProject(projectId);
    try { await removeGuest(projectId, guest.userId); await load(); toast("Access revoked.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not revoke access.", "error"); }
    finally { setBusyProject(null); }
  };

  const alreadyIds = new Set(access.map((a) => a.projectId));
  const pickOptions = grantable.filter((p) => !alreadyIds.has(p.id));
  const setPerm = (id: string, v: Perm) => setPerms((prev) => ({ ...prev, [id]: v }));

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5">
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><ShieldCheck size={17} /></div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">Project &amp; tab access</h3>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            Give {user.name || "this user"} scoped access to specific projects and control which tabs they can reach. They sign in with their existing login (<span className="font-bold text-slate-600">{email || "no email"}</span>) — no new password.
          </p>
        </div>
      </div>

      {/* Grant on a new project */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-50 pt-4">
        <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={!email || pickOptions.length === 0} className="flex-1 min-w-[12rem] bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-50">
          <option value="">{pickOptions.length === 0 ? "No other projects you own" : "Choose a project you own…"}</option>
          {pickOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="button" disabled={!pick || !email} onClick={() => { const p = grantable.find((x) => x.id === pick); if (p) { openModal(p.id, p.name); setPick(""); } }} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary disabled:opacity-40 shrink-0">
          <Plus size={14} /> Grant access
        </button>
      </div>

      {/* CR-P (16) — team assignments made from inside the project workspace, so this tab shows
          the full picture regardless of where access was granted. */}
      {!loading && assigned.length > 0 && (
        <div className="border-t border-slate-50 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Assigned to the project team</p>
          <div className="space-y-2">
            {assigned.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-slate-100 bg-slate-50/50">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
                  <p className="text-[11px] text-slate-400">Full project access as team member. Manage their tab visibility from the project workspace.</p>
                </div>
                <span className="shrink-0 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-widest">Assigned</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing access */}
      <div className="border-t border-slate-50 pt-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Projects with scoped access</p>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-xs py-6 justify-center"><Loader2 size={15} className="animate-spin" /> Loading…</div>
        ) : access.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No scoped project access yet. Grant some on a project above.</p>
        ) : (
          <div className="space-y-2">
            {access.map(({ projectId, name, guest }) => {
              const tabCount = Object.values(guest.tabPermissions || {}).filter((v) => v === "view" || v === "edit").length;
              return (
                <div key={projectId} className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-slate-100">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{name}</p>
                    <p className="text-[11px] text-slate-400">{tabCount} tab{tabCount === 1 ? "" : "s"}{guest.expiresAt ? ` · until ${new Date(guest.expiresAt).toLocaleDateString()}` : " · no expiry"}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => openModal(projectId, name)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200">Manage</button>
                    <button onClick={() => revoke(projectId, name, guest)} disabled={busyProject === projectId} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold hover:bg-red-100 disabled:opacity-50 inline-flex items-center gap-1">{busyProject === projectId ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Revoke</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Grant / edit modal — single step: tab access */}
      {modalProject && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => !saving && closeModal()} />
          <div className="relative bg-white rounded-[2rem] p-6 w-full max-w-lg shadow-2xl max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-display font-bold text-slate-900">{existingGuest ? "Manage access" : "Grant access"}</h3>
              <button onClick={() => !saving && closeModal()} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <p className="text-xs text-slate-400 mb-4">{user.name || email} on <span className="font-bold text-slate-600">{modalProject.name}</span></p>

            {modalLoading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 size={16} className="animate-spin" /> Loading…</div>
            ) : (
              <div className="overflow-y-auto pr-1 space-y-4">
                <div>
                  <p className="text-sm font-bold text-slate-700 mb-1">Tab access</p>
                  <p className="text-[10px] text-slate-400 mb-2">Every tab starts <span className="font-bold text-red-500">Hidden</span>. Switch the tabs they should reach to <span className="font-bold">View</span> (read) or <span className="font-bold">Edit</span> (change).</p>
                  <div className="space-y-2">
                    {TAB_ROWS.map((t) => {
                      const level = perms[t.id] || "none";
                      return (
                        <div key={t.id} className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border ${level === "none" ? "border-red-100 bg-red-50/40" : "border-slate-100 bg-slate-50"} ${t.indent ? "ml-5" : ""}`}>
                          <span className="text-xs font-bold text-slate-700 truncate">{t.indent ? "↳ " : ""}{t.label}</span>
                          <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-slate-100 shrink-0">
                            {([{ v: "none", l: "Hidden" }, { v: "view", l: "View" }, { v: "edit", l: "Edit" }] as const).map(({ v, l }) => (
                              <button key={v} type="button" onClick={() => setPerm(t.id, v)} className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${level === v ? (v === "edit" ? "bg-primary text-white" : v === "view" ? "bg-slate-900 text-white" : "bg-red-100 text-red-600") : "text-slate-400 hover:text-slate-700"}`}>{l}</button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700 mb-1">Access timeline</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {([{ v: "", l: "No expiry" }, { v: "1w", l: "1 week" }, { v: "1m", l: "1 month" }, { v: "3m", l: "3 months" }] as const).map(({ v, l }) => (
                      <button key={v || "none"} type="button" onClick={() => setExpiry(v)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${expiry === v ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-900"}`}>{l}</button>
                    ))}
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">or</span>
                    <input type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : ""} onChange={(e) => setExpiry(e.target.value)} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10" />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-4 mt-1 border-t border-slate-50">
              <button onClick={() => !saving && closeModal()} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold">Cancel</button>
              <button onClick={save} disabled={saving || modalLoading} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} {existingGuest ? "Save access" : "Grant access"}</button>
            </div>
          </div>
        </div>
      )}

      {dialogs}
    </div>
  );
}
