import { useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plus, ShieldCheck, Trash2, Wand2, X } from "lucide-react";
import {
  fetchProjects, fetchGuests, createGuest, updateGuest, removeGuest, getAuthUser,
  fetchCompanyLogin, saveCompanyLogin, fetchCompanyProjectAccess,
  type ApiCompany, type ApiGuest, type GuestTabPermission, type ApiCompanyLogin, type ApiCompanyProjectAccess,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";

/**
 * CR-P: a subcontractor or partner company's login and its per-project tab access, managed from the
 * Directory profile.
 *
 * CR 266 (2026-09-22): the two are separate. The login is created once at the top of this card and
 * can be updated later; project access is granted as often as needed, to several projects at a
 * time, and never asks for a password again.
 */
export const TAB_ROWS: { id: string; label: string; indent?: boolean }[] = [
  { id: "client", label: "Client Info" },
  { id: "project-info", label: "Project Info" },
  { id: "proposals", label: "Proposals" },
  { id: "pm", label: "Project Management" },
  { id: "tech-docs", label: "Technical Docs" },
  { id: "subs", label: "Subcontractors & Employees" },
  { id: "legal", label: "Legal Docs" },
  { id: "finances", label: "Finances" },
  { id: "expenses", label: "Finances · Expenses", indent: true },
  { id: "invoice-sent", label: "Finances · Invoice Sent", indent: true },
  { id: "invoice-received", label: "Finances · Invoice Received", indent: true },
  { id: "procurement", label: "Procurement & Submittals" },
  { id: "proc-boq", label: "Procurement · BOQ", indent: true },
  { id: "proc-submittals", label: "Procurement · Submittals", indent: true },
  { id: "proc-rfqs", label: "Procurement · RFQs", indent: true },
  { id: "proc-quotes", label: "Procurement · Quotes", indent: true },
  { id: "proc-po", label: "Procurement · Purchase Orders", indent: true },
  { id: "proc-shipment", label: "Procurement · Shipment", indent: true },
];

export type Perm = "none" | "view" | "edit";
const genPassword = () => `Gt-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`;

export default function CompanyAccessManager({ company }: {
  company: ApiCompany;
  /** Kept for the caller; the access list now comes from the server. */
  involvedProjects?: Array<{ projectId: string; name: string; status?: string }>;
}) {
  const { confirm, dialogs } = useDialogs();
  const myId = getAuthUser()?.id || "";
  const email = (company.email || "").trim();

  const [login, setLogin] = useState<ApiCompanyLogin | null>(null);
  const [owned, setOwned] = useState<Array<{ id: string; name: string }>>([]);
  const [access, setAccess] = useState<ApiCompanyProjectAccess[]>([]);
  const [loading, setLoading] = useState(true);

  // The login card.
  const [pw, setPw] = useState("");
  const [pwOpen, setPwOpen] = useState(false);
  const [savingLogin, setSavingLogin] = useState(false);

  // Granting access: one modal, any number of projects, no password.
  const [grantOpen, setGrantOpen] = useState(false);
  const [editProject, setEditProject] = useState<ApiCompanyProjectAccess | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [perms, setPerms] = useState<Record<string, Perm>>({});
  const [expiry, setExpiry] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyProject, setBusyProject] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [who, granted, mine] = await Promise.all([
        fetchCompanyLogin(company._id).catch(() => ({ exists: false, email }) as ApiCompanyLogin),
        fetchCompanyProjectAccess(company._id).catch(() => [] as ApiCompanyProjectAccess[]),
        fetchProjects("mine").catch(() => []),
      ]);
      setLogin(who);
      setAccess(granted);
      setOwned(mine.filter((p) => p.ownerId === myId).map((p) => ({ id: p.id, name: p.name })));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not load access.", "error");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [company._id, myId]);

  const copy = async (text: string, label: string) => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast(`${label} copied.`, "success"); }
    catch { toast(text, "info"); }
  };

  // ── The login, made once ──
  const submitLogin = async () => {
    if (!email) { toast("Add an email to this company first (Edit) - the login uses it.", "error"); return; }
    if (!login?.exists && pw.trim().length < 6) { toast("Set a password of at least 6 characters.", "error"); return; }
    setSavingLogin(true);
    try {
      const saved = await saveCompanyLogin(company._id, { email, password: pw.trim() || undefined });
      setLogin(saved);
      toast(login?.exists ? "Password updated. Send it to them." : "Login created. Send the email and password to them.", "success");
      setPwOpen(false);
      if (!login?.exists) setPwOpen(true);   // keep the new password on screen to copy
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save the login.", "error"); }
    finally { setSavingLogin(false); }
  };

  // ── Project access, granted as often as needed ──
  const grantedIds = useMemo(() => new Set(access.map((a) => a.projectId)), [access]);
  const grantable = owned.filter((p) => !grantedIds.has(p.id));

  const openGrant = () => {
    setEditProject(null);
    setChosen([]);
    const p: Record<string, Perm> = {};
    TAB_ROWS.forEach((t) => { p[t.id] = "none"; });
    setPerms(p);
    setExpiry("");
    setGrantOpen(true);
  };
  const openEdit = (a: ApiCompanyProjectAccess) => {
    setEditProject(a);
    setChosen([a.projectId]);
    const p: Record<string, Perm> = {};
    TAB_ROWS.forEach((t) => { p[t.id] = (a.tabPermissions?.[t.id] as Perm) || "none"; });
    setPerms(p);
    setExpiry(a.expiresAt ? new Date(a.expiresAt).toISOString().slice(0, 10) : "");
    setGrantOpen(true);
  };
  const closeGrant = () => { setGrantOpen(false); setEditProject(null); setChosen([]); setPerms({}); setExpiry(""); };

  const resolveExpiry = (): string | null => {
    if (!expiry) return null;
    const days = expiry === "1w" ? 7 : expiry === "1m" ? 30 : expiry === "3m" ? 90 : 0;
    if (days) return new Date(Date.now() + days * 86400000).toISOString();
    const d = new Date(expiry);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  const saveGrant = async () => {
    if (!login?.exists) { toast("Create the login first.", "error"); return; }
    if (!chosen.length) { toast("Choose at least one project.", "error"); return; }
    const tabPermissions: Record<string, GuestTabPermission> = {};
    Object.entries(perms).forEach(([k, v]) => { if (v === "view" || v === "edit") tabPermissions[k] = v; });
    setSaving(true);
    try {
      if (editProject) {
        const guests = await fetchGuests(editProject.projectId);
        const g = guests.find((x: ApiGuest) => x.email?.toLowerCase() === email.toLowerCase());
        if (!g) throw new Error("That access is no longer there. Reload and grant it again.");
        await updateGuest(editProject.projectId, g.userId, { tabPermissions, expiresAt: resolveExpiry() });
        toast(`Access to ${editProject.name} updated.`, "success");
      } else {
        // One call carries the first project and the rest ride along, so no password is ever asked
        // for again: the login already exists and is reused by email.
        const [first, ...others] = chosen;
        await createGuest(first, {
          name: company.name, email, tabPermissions, expiresAt: resolveExpiry(),
          companyId: company._id, alsoAssignProjectIds: others,
        });
        toast(`Access granted on ${chosen.length} project${chosen.length === 1 ? "" : "s"}.`, "success");
      }
      closeGrant();
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save access.", "error");
    } finally { setSaving(false); }
  };

  const revoke = async (a: ApiCompanyProjectAccess) => {
    if (!(await confirm({ title: "Revoke access?", message: `Remove ${company.name}'s access to "${a.name}". Their login stays, along with any other project they can reach.`, confirmLabel: "Revoke", cancelLabel: "Cancel", danger: true }))) return;
    setBusyProject(a.projectId);
    try {
      const guests = await fetchGuests(a.projectId);
      const g = guests.find((x: ApiGuest) => x.email?.toLowerCase() === email.toLowerCase());
      if (g) await removeGuest(a.projectId, g.userId);
      await load();
      toast("Access revoked.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not revoke access.", "error"); }
    finally { setBusyProject(null); }
  };

  const setPerm = (id: string, v: Perm) => setPerms((prev) => ({ ...prev, [id]: v }));
  const allOn = (v: Perm) => setPerms(() => Object.fromEntries(TAB_ROWS.map((t) => [t.id, v])) as Record<string, Perm>);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5">
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><ShieldCheck size={17} /></div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">Login &amp; project access</h3>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            One login for {company.name}, then access to as many projects as you like. The login uses{" "}
            {email ? <span className="font-bold text-slate-600">{email}</span> : <span className="text-red-500 font-bold">no email yet - add one via Edit</span>}.
          </p>
        </div>
      </div>

      {/* Step 1: the login, created once. */}
      <div className={`rounded-2xl border p-4 ${login?.exists ? "border-emerald-100 bg-emerald-50/40" : "border-amber-200 bg-amber-50/50"}`}>
        {loading ? (
          <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={14} className="animate-spin" /> Checking the login…</p>
        ) : login?.exists ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700"><Check size={14} /> Login active</span>
              <span className="text-xs font-semibold text-slate-600">{login.email}</span>
              <button type="button" onClick={() => copy(login.email, "Email")} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-primary" title="Copy email"><Copy size={12} /></button>
              <span className="text-[11px] text-slate-400">· access to {access.length} project{access.length === 1 ? "" : "s"}</span>
              <button type="button" onClick={() => { setPwOpen((v) => !v); setPw(""); }} className="ml-auto rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary">
                {pwOpen ? "Cancel" : "Reset password"}
              </button>
            </div>
            {pwOpen && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" className="min-w-[12rem] flex-1 rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/10" />
                <button type="button" onClick={() => setPw(genPassword())} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 hover:text-primary"><Wand2 size={13} /> Generate</button>
                <button type="button" onClick={() => copy(pw, "Password")} disabled={!pw} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 disabled:opacity-40"><Copy size={13} /> Copy</button>
                <button type="button" onClick={() => void submitLogin()} disabled={savingLogin || !pw.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-40">
                  {savingLogin ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Save password
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-xs font-bold text-amber-800">No login yet</p>
            <p className="mt-0.5 text-[11px] text-amber-700">Create it once here. After that, granting a project never asks for a password again.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password for this company" className="min-w-[12rem] flex-1 rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/10" />
              <button type="button" onClick={() => setPw(genPassword())} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 hover:text-primary"><Wand2 size={13} /> Generate</button>
              <button type="button" onClick={() => copy(pw, "Password")} disabled={!pw} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 disabled:opacity-40"><Copy size={13} /> Copy</button>
              <button type="button" onClick={() => void submitLogin()} disabled={savingLogin || !email} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-40">
                {savingLogin ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Create login
              </button>
            </div>
          </>
        )}
      </div>

      {/* Step 2: project access, as many times as needed. */}
      <div className="border-t border-slate-50 pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Projects with access</p>
          <button
            type="button"
            onClick={openGrant}
            disabled={!login?.exists || grantable.length === 0}
            title={!login?.exists ? "Create the login first" : grantable.length === 0 ? "They already reach every project you own" : "Grant access to one or more projects"}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-primary disabled:opacity-40"
          >
            <Plus size={13} /> Grant access
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400"><Loader2 size={15} className="animate-spin" /> Loading…</div>
        ) : access.length === 0 ? (
          <p className="text-xs italic text-slate-400">No project access yet.{login?.exists ? " Use Grant access above." : " Create the login first, then grant access."}</p>
        ) : (
          <div className="space-y-2">
            {access.map((a) => {
              const tabCount = Object.values(a.tabPermissions || {}).filter((v) => v === "view" || v === "edit").length;
              return (
                <div key={a.projectId} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{a.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {tabCount} tab{tabCount === 1 ? "" : "s"}{a.expiresAt ? ` · until ${new Date(a.expiresAt).toLocaleDateString()}` : " · no expiry"}
                      {!a.owned && " · owned by someone else"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => openEdit(a)} disabled={!a.owned} title={a.owned ? "Change what they see" : "Only the project's owner can change this"} className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-40">Manage</button>
                    <button onClick={() => void revoke(a)} disabled={busyProject === a.projectId || !a.owned} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-100 disabled:opacity-40">
                      {busyProject === a.projectId ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Grant / manage: projects and tabs only, never a password. */}
      {grantOpen && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => !saving && closeGrant()} />
          <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-slate-900">{editProject ? `Manage ${editProject.name}` : "Grant project access"}</h3>
              <button onClick={() => !saving && closeGrant()} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <p className="mb-3 text-xs text-slate-400">{company.name} signs in with <span className="font-bold text-slate-600">{email}</span>. This only decides what they can reach.</p>

            <div className="space-y-4 overflow-y-auto pr-1">
              {!editProject && (
                <div>
                  <p className="mb-1 text-sm font-bold text-slate-700">Projects</p>
                  <p className="mb-2 text-[10px] text-slate-400">Tick every project this applies to. They all get the tab access below.</p>
                  <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-xl border border-slate-100 p-1.5">
                    {grantable.map((p) => {
                      const on = chosen.includes(p.id);
                      return (
                        <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${on ? "bg-emerald-50 font-semibold text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}>
                          <input type="checkbox" checked={on} className="accent-emerald-600" onChange={() => setChosen((c) => (on ? c.filter((x) => x !== p.id) : [...c, p.id]))} />
                          <span className="flex-1 truncate">{p.name}</span>
                        </label>
                      );
                    })}
                    {grantable.length === 0 && <p className="px-2 py-2 text-[11px] italic text-slate-400">They already reach every project you own.</p>}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-700">Tab access</p>
                  <span className="flex gap-1">
                    <button type="button" onClick={() => allOn("view")} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-slate-900">All view</button>
                    <button type="button" onClick={() => allOn("none")} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-slate-900">All hidden</button>
                  </span>
                </div>
                <p className="mb-2 text-[10px] text-slate-400">Every tab starts <span className="font-bold text-red-500">Hidden</span>. Switch the ones they should reach to <span className="font-bold">View</span> or <span className="font-bold">Edit</span>.</p>
                <div className="space-y-2">
                  {TAB_ROWS.map((t) => {
                    const level = perms[t.id] || "none";
                    return (
                      <div key={t.id} className={`flex items-center justify-between gap-3 rounded-xl border p-2.5 ${level === "none" ? "border-red-100 bg-red-50/40" : "border-slate-100 bg-slate-50"} ${t.indent ? "ml-5" : ""}`}>
                        <span className="truncate text-xs font-bold text-slate-700">{t.indent ? "↳ " : ""}{t.label}</span>
                        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-100 bg-white p-1">
                          {([{ v: "none", l: "Hidden" }, { v: "view", l: "View" }, { v: "edit", l: "Edit" }] as const).map(({ v, l }) => (
                            <button key={v} type="button" onClick={() => setPerm(t.id, v)} className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition-all ${level === v ? (v === "edit" ? "bg-primary text-white" : v === "view" ? "bg-slate-900 text-white" : "bg-red-100 text-red-600") : "text-slate-400 hover:text-slate-700"}`}>{l}</button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-1 text-sm font-bold text-slate-700">Access timeline</p>
                <div className="flex flex-wrap items-center gap-2">
                  {([{ v: "", l: "No expiry" }, { v: "1w", l: "1 week" }, { v: "1m", l: "1 month" }, { v: "3m", l: "3 months" }] as const).map(({ v, l }) => (
                    <button key={v || "none"} type="button" onClick={() => setExpiry(v)} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${expiry === v ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-900"}`}>{l}</button>
                  ))}
                  <span className="ml-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">or</span>
                  <input type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : ""} onChange={(e) => setExpiry(e.target.value)} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10" />
                </div>
              </div>
            </div>

            <div className="mt-1 flex items-center justify-between gap-2 border-t border-slate-50 pt-4">
              <button onClick={() => !saving && closeGrant()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-500">Cancel</button>
              <button onClick={() => void saveGrant()} disabled={saving || (!editProject && chosen.length === 0)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-white disabled:opacity-40">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {editProject ? "Save access" : `Grant on ${chosen.length || 0} project${chosen.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogs}
    </div>
  );
}
