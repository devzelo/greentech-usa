import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UserPlus, Pencil, Trash2, KeyRound, X, Shield, Mail, IdCard, Phone, Loader2, Search, Handshake, Wand2, Upload, FileText, Download, Eye, Archive, RotateCcw, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import {
  fetchUsers, createUser, updateUser, adminResetPassword, deleteUser, setUserArchived,
  getAuthUser, AdminUser,
  fetchUserFiles, uploadUserFile, deleteUserFile, userFileUrl, type UserFile,
} from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";
import { toast } from "../../lib/toast";
import { ConfirmDialog } from "./Dialogs";
import AgreementsPanel from "./agreements/AgreementsPanel";
import UserProfile from "./UserProfile";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "employee", label: "Employee" },
];

const roleBadge = (role: string) => {
  switch (role) {
    case "admin": return "bg-primary/10 text-primary";
    case "subcontractor": return "bg-amber-100 text-amber-700";
    default: return "bg-slate-100 text-slate-600";
  }
};

const overlay = "absolute inset-0 bg-slate-950/40 backdrop-blur-sm";
const panel = "relative bg-white rounded-[2.5rem] p-8 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto";
const field = "w-full bg-slate-50 border border-slate-100 rounded-2xl p-3.5 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all text-sm font-medium";

interface FormState { name: string; email: string; personalEmail: string; password: string; role: string; empId: string; phone: string; }
const emptyForm: FormState = { name: "", email: "", personalEmail: "", password: "", role: "employee", empId: "", phone: "" };

export default function UserManagement() {
  useMeta({ title: "User Management", description: "Add, edit, and remove employee accounts and reset passwords." });
  const me = getAuthUser();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);   // CR-P-58
  type SortKey = "empId" | "name" | "email" | "role" | "phone";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "empId", dir: "asc" });

  // Create / edit modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = creating
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  // CR-P-57 — admin-uploaded documents on the user being edited.
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Reset-password modal
  const [pwTarget, setPwTarget] = useState<AdminUser | null>(null);
  const [newPw, setNewPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  // Employee agreements modal — the user-context adapter of the agreement engine.
  const [agreementsFor, setAgreementsFor] = useState<AdminUser | null>(null);
  // CR-P-57 — clicking a user's name opens their full profile (activity + documents).
  const [profileUser, setProfileUser] = useState<AdminUser | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await fetchUsers(showArchived));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load users.", "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [showArchived]);

  // CR-P-58 — deactivate (archive) / reactivate an account.
  const toggleArchive = async (u: AdminUser) => {
    const next = !u.archived;
    try {
      await setUserArchived(u._id, next);
      toast(next ? `${u.name} deactivated — they can no longer sign in.` : `${u.name} reactivated.`, "success");
      setProfileUser((cur) => (cur && cur._id === u._id ? null : cur));
      await load();
    } catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
  };
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  const sortIcon = (key: SortKey) => sort.key === key ? (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="text-slate-300" />;

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setUserFiles([]); setEditorOpen(true); };
  const openEdit = (u: AdminUser) => {
    setEditingId(u._id);
    setForm({ name: u.name, email: u.email, personalEmail: u.personalEmail || "", password: "", role: u.role, empId: u.empId || "", phone: u.phone || "" });
    setUserFiles([]);
    fetchUserFiles(u._id).then(setUserFiles).catch(() => setUserFiles([]));
    setEditorOpen(true);
  };
  // CR-P-57 — upload / delete a document on the user being edited (admin only).
  const uploadDoc = async (file: File) => {
    if (!editingId) return;
    setUploadingDoc(true);
    try { const f = await uploadUserFile(editingId, file); setUserFiles((p) => [f, ...p]); toast("Document uploaded.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
    finally { setUploadingDoc(false); }
  };
  const removeDoc = async (f: UserFile) => {
    if (!editingId) return;
    try { await deleteUserFile(editingId, f._id); setUserFiles((p) => p.filter((x) => x._id !== f._id)); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not delete.", "error"); }
  };

  const saveUser = async () => {
    if (!form.name.trim() || !form.email.trim()) { toast("Name and email are required.", "error"); return; }
    if (!editingId && form.password.length < 8) { toast("Password must be at least 8 characters.", "error"); return; }
    setSaving(true);
    try {
      if (editingId) {
        const up = await updateUser(editingId, { name: form.name, email: form.email, personalEmail: form.personalEmail, role: form.role, empId: form.empId, phone: form.phone });
        setProfileUser((cur) => (cur && cur._id === editingId ? up : cur));  // keep an open profile in sync
        toast("User updated.", "success");
      } else {
        await createUser({ name: form.name, email: form.email, personalEmail: form.personalEmail, password: form.password, role: form.role, empId: form.empId, phone: form.phone });
        toast("User created.", "success");
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  const submitReset = async () => {
    if (!pwTarget) return;
    if (newPw.length < 8) { toast("Password must be at least 8 characters.", "error"); return; }
    setPwSaving(true);
    try {
      await adminResetPassword(pwTarget._id, newPw);
      toast(`Password reset for ${pwTarget.name}.`, "success");
      setPwTarget(null);
      setNewPw("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Reset failed.", "error");
    } finally {
      setPwSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const delId = deleteTarget._id;
      await deleteUser(delId);
      toast("User deleted.", "success");
      setProfileUser((cur) => (cur && cur._id === delId ? null : cur));  // close the profile if it was open
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
      setDeleteTarget(null);
    }
  };

  // CR-P-56 — next available employee ID (EMP-###), based on existing IDs. Editable afterwards.
  const nextEmpId = () => {
    let max = 0;
    for (const u of users) { const m = /(\d+)\s*$/.exec(u.empId || ""); if (m) max = Math.max(max, parseInt(m[1], 10)); }
    return `EMP-${String(max + 1).padStart(3, "0")}`;
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) => [u.name, u.email, u.empId, u.role].some((v) => (v || "").toLowerCase().includes(q)))
    : users;
  // CR-P-58 — column sorting.
  const sorted = [...filtered].sort((a, b) => {
    const val = (u: AdminUser) => String((sort.key === "empId" ? u.empId : sort.key === "name" ? u.name : sort.key === "email" ? u.email : sort.key === "role" ? u.role : u.phone) || "").trim().toLowerCase();
    const av = val(a), bv = val(b);
    if (!av && !bv) return 0; if (!av) return 1; if (!bv) return -1;
    const c = av.localeCompare(bv, undefined, { numeric: true });
    return sort.dir === "asc" ? c : -c;
  });

  return (
    <div className="max-w-6xl mx-auto">
      {profileUser ? (
        <UserProfile
          user={profileUser}
          isSelf={me?.id === profileUser._id}
          onBack={() => setProfileUser(null)}
          onEdit={(u) => openEdit(u)}
          onResetPassword={(u) => { setPwTarget(u); setNewPw(""); }}
          onDelete={(u) => setDeleteTarget(u)}
        />
      ) : (
      <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-primary mb-2">
            <Shield size={18} />
            <span className="text-xs font-bold uppercase tracking-widest">Admin</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500 mt-1">Add or remove employee accounts, change roles, and reset passwords.</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button onClick={() => setShowArchived((v) => !v)} className={`inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-sm font-bold border ${showArchived ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-200 hover:text-slate-900"}`}><Archive size={16} /> {showArchived ? "Active" : "Archived"}</button>
          <button onClick={openCreate} className="bg-gt-gradient text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"><UserPlus size={18} /> Add User</button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, role…"
          className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm font-medium outline-none focus:ring-4 focus:ring-primary/5"
        />
      </div>

      {/* List — sortable table (CR-P-58) */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-16 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
        ) : sorted.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-sm">No {showArchived ? "archived " : ""}users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100">
                  {([["empId", "Employee ID"], ["name", "Name"], ["email", "Business email"], ["role", "Role"], ["phone", "Phone"]] as const).map(([k, l]) => (
                    <th key={k} className="px-4 py-3">
                      <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${sort.key === k ? "text-slate-700" : "text-slate-400 hover:text-slate-600"}`} title={`Sort by ${l}`}>{l} {sortIcon(k)}</button>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((u) => {
                  const isSelf = me?.id === u._id;
                  return (
                    <tr key={u._id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-xs font-bold text-slate-500 whitespace-nowrap tabular-nums">{u.empId || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-gt-gradient p-0.5 shrink-0">
                            {u.avatarUrl
                              ? <img src={u.avatarUrl} className="w-full h-full rounded-full border-2 border-white object-cover" alt="" />
                              : <div className="w-full h-full rounded-full border-2 border-white bg-white flex items-center justify-center text-xs font-bold text-primary">{(u.name || u.email || "?").charAt(0).toUpperCase()}</div>}
                          </div>
                          <div className="min-w-0">
                            <button onClick={() => setProfileUser(u)} className="font-bold text-sm text-slate-900 hover:text-primary hover:underline text-left truncate block" title="View profile">{u.name || u.email}</button>
                            {isSelf && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">You</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 truncate max-w-[16rem]">{u.email}</td>
                      <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${roleBadge(u.role)}`}>{u.role}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{u.phone || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button onClick={() => setAgreementsFor(u)} title="Agreements — create, send & track this employee's agreements" className="p-2 rounded-xl text-slate-400 hover:bg-primary/5 hover:text-primary transition-colors"><Handshake size={15} /></button>
                          <button onClick={() => openEdit(u)} title="Edit" className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"><Pencil size={15} /></button>
                          <button onClick={() => { setPwTarget(u); setNewPw(""); }} title="Reset password" className="p-2 rounded-xl text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"><KeyRound size={15} /></button>
                          <button onClick={() => toggleArchive(u)} disabled={isSelf && !u.archived} title={u.archived ? "Reactivate — allow sign-in" : "Deactivate — block sign-in"} className="p-2 rounded-xl text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed">{u.archived ? <RotateCcw size={15} /> : <Archive size={15} />}</button>
                          <button onClick={() => setDeleteTarget(u)} disabled={isSelf} title={isSelf ? "You can't delete your own account" : "Delete"} className="p-2 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* Create / Edit modal */}
      <AnimatePresence>
        {editorOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={overlay} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className={panel}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-display font-bold text-slate-900">{editingId ? "Edit User" : "Add User"}</h3>
                <button onClick={() => setEditorOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Personal information</p>
                <div>
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5"><span>Full name</span></label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Reza Esfandiari" className={field} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5"><Mail size={13} /> Business email <span className="font-medium text-slate-400 normal-case">(login)</span></label>
                    <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@greentech-usa.com" className={field} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5"><Mail size={13} /> Personal email</label>
                    <input value={form.personalEmail} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} placeholder="Optional" className={field} />
                  </div>
                </div>
                {!editingId && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5"><KeyRound size={13} /> Temp password</label>
                    <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" className={field} />
                    <p className="text-[11px] text-slate-400 mt-1">The employee can change this later from their profile.</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5"><Shield size={13} /> Role</label>
                    <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={field}>
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5"><IdCard size={13} /> Employee ID</label>
                    <div className="flex gap-2">
                      <input value={form.empId} onChange={(e) => setForm({ ...form, empId: e.target.value })} placeholder="EMP-011" className={field} />
                      <button type="button" onClick={() => setForm({ ...form, empId: nextEmpId() })} title="Auto-generate the next ID (still editable)" className="shrink-0 px-3 rounded-2xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 inline-flex items-center gap-1.5"><Wand2 size={14} /> Auto</button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5"><Phone size={13} /> Phone</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Optional" className={field} />
                </div>

                {/* CR-P-57 — admin can attach any document to the user. */}
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><FileText size={13} /> Documents {userFiles.length > 0 && <span className="text-slate-400">({userFiles.length})</span>}</label>
                    {editingId && (
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary cursor-pointer">
                        {uploadingDoc ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload
                        <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadDoc(f); e.target.value = ""; }} />
                      </label>
                    )}
                  </div>
                  {!editingId ? (
                    <p className="text-[11px] text-slate-400 italic">Create the user first, then upload documents from Edit.</p>
                  ) : userFiles.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No documents yet. Upload contracts, IDs, or any file.</p>
                  ) : (
                    <div className="space-y-1.5">{userFiles.map((f) => (
                      <div key={f._id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-100 text-xs">
                        <span className="flex items-center gap-1.5 min-w-0"><FileText size={13} className="text-slate-400 shrink-0" /><span className="font-bold text-slate-700 truncate" title={f.name}>{f.name}</span>{f.size && <span className="text-slate-400 shrink-0">· {f.size}</span>}</span>
                        <span className="flex items-center gap-1 shrink-0">
                          <a href={userFileUrl(f)} target="_blank" rel="noreferrer" className="p-1 rounded text-slate-400 hover:text-primary" title="View"><Eye size={13} /></a>
                          <a href={userFileUrl(f)} download={f.name} className="p-1 rounded text-slate-400 hover:text-primary" title="Download"><Download size={13} /></a>
                          <button onClick={() => removeDoc(f)} className="p-1 rounded text-slate-400 hover:text-red-500" title="Delete"><Trash2 size={13} /></button>
                        </span>
                      </div>
                    ))}</div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={() => setEditorOpen(false)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
                <button onClick={saveUser} disabled={saving} className="flex-1 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <Loader2 size={16} className="animate-spin" />} {editingId ? "Save changes" : "Create user"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset-password modal */}
      <AnimatePresence>
        {pwTarget && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={overlay} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl">
              <div className="flex items-start gap-4 mb-6">
                <span className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><KeyRound size={20} /></span>
                <div className="min-w-0">
                  <h3 className="text-lg font-display font-bold text-slate-900">Reset password</h3>
                  <p className="text-sm text-slate-500 mt-1 truncate">For <strong>{pwTarget.name}</strong> ({pwTarget.email})</p>
                </div>
              </div>
              <input
                type="text"
                autoFocus
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void submitReset(); if (e.key === "Escape") setPwTarget(null); }}
                placeholder="New password (min 8 characters)"
                className={field + " mb-2"}
              />
              <p className="text-[11px] text-slate-400 mb-6">Share this new password with the employee securely.</p>
              <div className="flex gap-3">
                <button onClick={() => setPwTarget(null)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
                <button onClick={submitReset} disabled={pwSaving} className="flex-1 py-3 rounded-2xl bg-amber-500 text-white font-bold text-sm shadow-lg shadow-amber-500/20 hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2">
                  {pwSaving && <Loader2 size={16} className="animate-spin" />} Set password
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Employee agreements — user-context adapter (admin creates/sends; employee signs from Profile) */}
      <AnimatePresence>
        {agreementsFor && (
          <div className="fixed inset-0 z-[200] flex items-start justify-center p-6 overflow-y-auto">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={overlay} />
            <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }} className="relative bg-white rounded-[2.5rem] p-8 w-full max-w-3xl shadow-2xl my-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2"><Handshake size={18} className="text-primary" /> {agreementsFor.name}'s agreements</h3>
                  <p className="text-xs text-slate-400 mt-1">Employee agreements live on the employee profile. {agreementsFor.name.split(" ")[0]} reviews and signs from their own Profile page.</p>
                </div>
                <button onClick={() => setAgreementsFor(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
              </div>
              <AgreementsPanel
                ctx={{ kind: "user", userId: agreementsFor._id }}
                canManage
                defaults={{
                  party2: { name: agreementsFor.name, email: agreementsFor.email, phone: agreementsFor.phone || "", contactName: agreementsFor.name },
                  contextLines: [
                    { label: "Role", value: agreementsFor.role },
                    ...(agreementsFor.empId ? [{ label: "Employee ID", value: agreementsFor.empId }] : []),
                    { label: "Salary", value: "" },
                    { label: "Pay schedule", value: "" },
                  ],
                }}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete user?"
        message={`This permanently removes ${deleteTarget?.name || "this user"}'s account. This cannot be undone.`}
        confirmLabel="Delete user"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
