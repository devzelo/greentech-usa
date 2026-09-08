import { useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, Plus, ShieldCheck, Trash2, Wand2, X, Copy } from "lucide-react";
import {
  fetchProjects, fetchGuests, createGuest, updateGuest, removeGuest, getAuthUser,
  type ApiCompany, type ApiGuest, type GuestTabPermission,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";

// CR-P — manage a subcontractor/partner company's LOGIN + per-project tab access straight from
// its Directory profile. This is the same guest engine used inside a project (createGuest/
// updateGuest/fetchGuests): a company's tab access is per-project, so here we grant/manage it one
// project at a time on the projects the current admin owns. The login identity is the company's
// email. Custom per-project tabs aren't listed here — use the project's own grant-access wizard for
// those; this covers the standard tabs.
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
  { id: "proc-log", label: "Procurement · Master Log", indent: true },
  { id: "proc-boq", label: "Procurement · BOQ", indent: true },
  { id: "proc-submittals", label: "Procurement · Submittals", indent: true },
  { id: "proc-rfqs", label: "Procurement · RFQs", indent: true },
  { id: "proc-quotes", label: "Procurement · Quotes", indent: true },
  { id: "proc-po", label: "Procurement · Purchase Orders", indent: true },
  { id: "proc-shipment", label: "Procurement · Shipment", indent: true },
];

export type Perm = "none" | "view" | "edit";
const genPassword = (seed: number) => `Gt-${(seed % 9000 + 1000)}-${(seed * 7 % 9000 + 1000)}`;

export default function CompanyAccessManager({ company, involvedProjects }: {
  company: ApiCompany;
  involvedProjects: Array<{ projectId: string; name: string; status?: string }>;
}) {
  const { confirm, dialogs } = useDialogs();
  const myId = getAuthUser()?.id || "";
  const email = (company.email || "").trim();

  const [owned, setOwned] = useState<Array<{ id: string; name: string }>>([]);
  const [access, setAccess] = useState<Array<{ projectId: string; name: string; guest: ApiGuest }>>([]);
  const [loading, setLoading] = useState(true);

  // Grant/edit modal state.
  const [modalProject, setModalProject] = useState<{ id: string; name: string } | null>(null);
  const [modalStep, setModalStep] = useState<1 | 2>(1);   // CR-P — step 1 tab access, step 2 login
  const [existingGuest, setExistingGuest] = useState<ApiGuest | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [perms, setPerms] = useState<Record<string, Perm>>({});
  const [expiry, setExpiry] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyProject, setBusyProject] = useState<string | null>(null);
  const [pick, setPick] = useState("");

  // Which owned projects are grantable — everything the admin owns.
  const grantable = useMemo(() => owned, [owned]);

  const load = async () => {
    setLoading(true);
    try {
      const mine = await fetchProjects("mine");
      const ownedList = mine.filter((p) => p.ownerId === myId).map((p) => ({ id: p.id, name: p.name }));
      setOwned(ownedList);
      // Show existing access on the projects this company is already involved with AND the admin
      // owns (bounded — no need to scan every project). Match the guest by the company's email.
      const ownedIds = new Set(ownedList.map((p) => p.id));
      const relevant = involvedProjects.filter((p) => ownedIds.has(p.projectId));
      const found: Array<{ projectId: string; name: string; guest: ApiGuest }> = [];
      await Promise.all(relevant.map(async (p) => {
        try {
          const guests = await fetchGuests(p.projectId);
          const g = guests.find((x) => x.email && email && x.email.toLowerCase() === email.toLowerCase());
          if (g) found.push({ projectId: p.projectId, name: p.name, guest: g });
        } catch { /* not owner / no access — skip */ }
      }));
      setAccess(found);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not load access.", "error");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [company._id, myId]);

  const openModal = async (projectId: string, name: string) => {
    setModalProject({ id: projectId, name });
    setModalStep(1);
    setModalLoading(true);
    setPassword(""); setExpiry("");
    try {
      const guests = await fetchGuests(projectId);
      const g = guests.find((x) => x.email && email && x.email.toLowerCase() === email.toLowerCase()) || null;
      setExistingGuest(g);
      const p: Record<string, Perm> = {};
      if (g) { Object.entries(g.tabPermissions || {}).forEach(([k, v]) => { p[k] = v; }); }
      else { TAB_ROWS.forEach((t) => { p[t.id] = "none"; }); }   // CR-P — default every tab to Hidden
      setPerms(p);
      setExpiry(g?.expiresAt ? new Date(g.expiresAt).toISOString().slice(0, 10) : "");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not open access for this project.", "error");
      setModalProject(null);
    } finally { setModalLoading(false); }
  };
  const closeModal = () => { setModalProject(null); setModalStep(1); setExistingGuest(null); setPerms({}); setPassword(""); setExpiry(""); };
  const copy = async (text: string, label: string) => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast(`${label} copied.`, "success"); }
    catch { toast(text, "info"); }
  };

  const resolveExpiry = (): string | null => {
    if (!expiry) return null;
    const days = expiry === "1w" ? 7 : expiry === "1m" ? 30 : expiry === "3m" ? 90 : 0;
    if (days) return new Date(Date.now() + days * 86400000).toISOString();
    const d = new Date(expiry);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  const save = async () => {
    if (!modalProject) return;
    if (!email) { toast("Add an email to this company first (Edit) — the login uses it.", "error"); return; }
    if (!existingGuest && !password.trim()) { toast("Set a password for the new login.", "error"); return; }
    const tabPermissions: Record<string, GuestTabPermission> = {};
    Object.entries(perms).forEach(([k, v]) => { if (v === "view" || v === "edit") tabPermissions[k] = v; });
    setSaving(true);
    try {
      if (existingGuest) {
        await updateGuest(modalProject.id, existingGuest.userId, { tabPermissions, password: password.trim() || undefined, expiresAt: resolveExpiry() });
        toast("Access updated.", "success");
      } else {
        // CR-P (16) — companyId hard-links the login to this Directory company and also creates
        // the project's subcontractor row, so the project workspace sees the grant too.
        await createGuest(modalProject.id, { name: company.name, email, password: password.trim(), tabPermissions, expiresAt: resolveExpiry(), companyId: company._id });
        toast("Login created & access granted. Share the email and password with them.", "success");
      }
      closeModal();
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save access.", "error");
    } finally { setSaving(false); }
  };

  const revoke = async (projectId: string, name: string, guest: ApiGuest) => {
    if (!(await confirm({ title: "Revoke access?", message: `Remove ${company.name}'s login access to "${name}". They will no longer be able to sign in to this project.`, confirmLabel: "Revoke", cancelLabel: "Cancel", danger: true }))) return;
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
          <h3 className="text-sm font-bold text-slate-900">Login &amp; tab access</h3>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            Give {company.name} a scoped login and control which tabs they can see, per project. The login uses{" "}
            {email ? <span className="font-bold text-slate-600">{email}</span> : <span className="text-red-500 font-bold">no email yet — add one via Edit</span>}.
          </p>
        </div>
      </div>

      {/* Grant on a new project */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-50 pt-4">
        <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={!email || pickOptions.length === 0} className="flex-1 min-w-[12rem] bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-50">
          <option value="">{pickOptions.length === 0 ? "No other projects you own" : "Choose a project you own…"}</option>
          {pickOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button
          type="button"
          disabled={!pick || !email}
          onClick={() => { const p = grantable.find((x) => x.id === pick); if (p) { openModal(p.id, p.name); setPick(""); } }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary disabled:opacity-40 shrink-0"
        >
          <Plus size={14} /> Grant access
        </button>
      </div>

      {/* Existing access */}
      <div className="border-t border-slate-50 pt-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Projects with access</p>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-xs py-6 justify-center"><Loader2 size={15} className="animate-spin" /> Loading…</div>
        ) : access.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No login yet. Grant access on a project above to create one.</p>
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

      {/* Grant / edit modal — step 1 tab access, step 2 login */}
      {modalProject && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => !saving && closeModal()} />
          <div className="relative bg-white rounded-[2rem] p-6 w-full max-w-lg shadow-2xl max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-display font-bold text-slate-900">{existingGuest ? "Manage access" : "Grant access"}</h3>
              <button onClick={() => !saving && closeModal()} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <p className="text-xs text-slate-400 mb-3">{company.name} on <span className="font-bold text-slate-600">{modalProject.name}</span></p>

            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-4">
              {([[1, "Tab access"], [2, "Login"]] as const).map(([n, label], idx) => (
                <div key={n} className="flex items-center gap-2 flex-1">
                  <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${modalStep === n ? "bg-primary text-white" : modalStep > n ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>{n}</span>
                  <span className={`text-[11px] font-bold ${modalStep === n ? "text-slate-800" : "text-slate-400"}`}>{label}</span>
                  {idx === 0 && <span className="h-px flex-grow bg-slate-100" />}
                </div>
              ))}
            </div>

            {modalLoading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 size={16} className="animate-spin" /> Loading…</div>
            ) : modalStep === 1 ? (
              <div className="overflow-y-auto pr-1 space-y-4">
                {/* Tab grid — default Hidden (red alert) */}
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

                {/* Expiry */}
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
            ) : (
              <div className="overflow-y-auto pr-1 space-y-4">
                <p className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  Copy the email {existingGuest ? "(and a new password if you reset it) " : "and password "}below and share {existingGuest ? "them" : "them"} with <span className="font-bold">{company.name}</span> so they can sign in.
                </p>
                {/* Email */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Login email</label>
                  <div className="flex gap-2 mt-1.5">
                    <input readOnly value={email} className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-sm font-medium text-slate-600 outline-none" />
                    <button type="button" onClick={() => copy(email, "Email")} disabled={!email} className="inline-flex items-center gap-1.5 px-3 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200 disabled:opacity-40"><Copy size={13} /> Copy</button>
                  </div>
                </div>
                {/* Password */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{existingGuest ? "Reset password (optional)" : "Password"}</label>
                  <div className="flex gap-2 mt-1.5">
                    <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={existingGuest ? "Leave blank to keep current" : "Set a password"} className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10" />
                    <button type="button" onClick={() => setPassword(genPassword(company.name.length + (existingGuest ? 3 : 7) + TAB_ROWS.length))} className="inline-flex items-center gap-1.5 px-3 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200"><Wand2 size={13} /> Generate</button>
                    <button type="button" onClick={() => copy(password, "Password")} disabled={!password} className="inline-flex items-center gap-1.5 px-3 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200 disabled:opacity-40"><Copy size={13} /> Copy</button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-4 mt-1 border-t border-slate-50">
              {modalStep === 1
                ? <button onClick={() => !saving && closeModal()} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold">Cancel</button>
                : <button onClick={() => setModalStep(1)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold">← Back</button>}
              {modalStep === 1 ? (
                <button onClick={() => setModalStep(2)} disabled={modalLoading} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-primary disabled:opacity-40">Next: Login →</button>
              ) : (
                <button onClick={save} disabled={saving || modalLoading} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} {existingGuest ? "Save access" : "Create login"}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {dialogs}
    </div>
  );
}
