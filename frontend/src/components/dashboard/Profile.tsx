import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, Mail, User, Eye, EyeOff, Save, Phone, IdCard, Loader2, CheckCircle2, AlertCircle, Archive, Calendar, Send, Briefcase, PenLine, Upload } from "lucide-react";
import { motion } from "motion/react";
import { fetchMe, updateMe, changePassword as apiChangePassword, uploadAvatar, uploadSignature, attachmentUrl, fetchBackupPreview, sendBackupNow, setAuthUser, getAuthUser, fetchMyExpenses, ApiUser, BackupPreview, MyExpense } from "../../lib/api";
import AdminAnnouncements from "./AdminAnnouncements";
import { useMeta } from "../../hooks/useMeta";
import { toast } from "../../lib/toast";
import ResumeBuilder from "./ResumeBuilder";
import AgreementsPanel from "./agreements/AgreementsPanel";
import PartnerProfileSection from "./PartnerProfileSection";

export default function Profile() {
  useMeta({ title: "My Profile", description: "Update your name, phone, employee ID, avatar, and password." });
  const [me, setMe] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [empId, setEmpId] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Password change
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  // Backup preferences
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [backupDay, setBackupDay] = useState(1);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupSending, setBackupSending] = useState(false);

  // Subcontractor: their own logged expenses across projects.
  const [myExpenses, setMyExpenses] = useState<MyExpense[]>([]);

  const loadBackupPreview = async () => {
    try {
      const p = await fetchBackupPreview();
      setBackupPreview(p);
    } catch {
      /* ignore */
    }
  };

  const handleSaveBackupPrefs = async () => {
    setBackupSaving(true);
    try {
      const updated = await updateMe({ backupEnabled, backupDay });
      setMe(updated);
      toast("Backup preferences saved.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setBackupSaving(false);
    }
  };

  const handleSendBackupNow = async () => {
    setBackupSending(true);
    try {
      const result = await sendBackupNow();
      if (result.sent) {
        toast(`Backup email sent — ${result.projectCount} project${result.projectCount === 1 ? "" : "s"}.`, "success");
        // Refresh user so lastBackupSent updates
        try { const updated = await fetchMe(); setMe(updated); } catch { /* ignore */ }
      } else {
        toast(result.reason || "Email could not be sent.", "info");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to send.", "error");
    } finally {
      setBackupSending(false);
    }
  };

  useEffect(() => {
    fetchMe()
      .then((u) => {
        setMe(u);
        setName(u.name || "");
        setPhone(u.phone || "");
        setEmpId(u.empId || "");
        setBackupEnabled(u.backupEnabled !== false);
        setBackupDay(u.backupDay || 1);
        if (u.role === "subcontractor") fetchMyExpenses().then(setMyExpenses).catch(() => setMyExpenses([]));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load profile."))
      .finally(() => setLoading(false));
    loadBackupPreview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMe({ name, phone, empId });
      setMe(updated);
      // Refresh localStorage so header/welcome banner reflects the change
      const stored = getAuthUser();
      if (stored) {
        setAuthUser({ ...stored, name: updated.name, phone: updated.phone, empId: updated.empId });
      }
      setIsEditing(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (!me) return;
    setName(me.name || "");
    setPhone(me.phone || "");
    setEmpId(me.empId || "");
    setError(null);
    setIsEditing(false);
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Avatar must be under 5 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const updated = await uploadAvatar(file);
      setMe(updated);
      const stored = getAuthUser();
      if (stored) setAuthUser({ ...stored, avatarUrl: updated.avatarUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const [sigUploading, setSigUploading] = useState(false);
  const handleSignatureChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Signature must be under 5 MB."); return; }
    setSigUploading(true); setError(null);
    try { setMe(await uploadSignature(file)); }
    catch (err) { setError(err instanceof Error ? err.message : "Upload failed."); }
    finally { setSigUploading(false); }
  };

  const handleChangePassword = async () => {
    setPwError(null);
    if (!currentPw || !newPw) return;
    if (newPw !== confirmPw) {
      setPwError("Passwords do not match.");
      return;
    }
    if (newPw.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    setPwSaving(true);
    try {
      await apiChangePassword(currentPw, newPw);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setPwSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-slate-300">
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-400">
        <AlertCircle size={32} className="mb-3" />
        <p className="text-sm font-bold">{error || "Profile unavailable."}</p>
      </div>
    );
  }

  const initial = (me.name || me.email).charAt(0).toUpperCase();
  const isGuest = me.role === "subcontractor";

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      {/* Profile Card — the feature card, left of the top row (bento) */}
      <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-8 lg:p-10 lg:col-span-1">
        <div className="flex items-center justify-between mb-10">
          <h1 className="text-2xl font-display font-bold text-slate-900">My Profile</h1>
          {isGuest ? (
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg uppercase tracking-widest">Subcontractor</span>
          ) : !isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-primary transition-all active:scale-95"
            >
              Edit Profile
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={handleCancelEdit}
                className="px-5 py-2.5 border border-slate-200 text-slate-500 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-gt-gradient text-white rounded-xl font-bold text-xs shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
              </button>
            </div>
          )}
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative group">
            <div className="w-28 h-28 rounded-[2rem] bg-gt-gradient p-1 shadow-xl">
              {me.avatarUrl ? (
                <img src={me.avatarUrl} alt="Avatar" className="w-full h-full rounded-[1.7rem] border-4 border-white object-cover" />
              ) : (
                <div className="w-full h-full rounded-[1.7rem] border-4 border-white bg-white flex items-center justify-center text-3xl font-bold text-primary">
                  {initial}
                </div>
              )}
            </div>
            {isEditing && (
              <>
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={uploading}
                  title="Change photo"
                  className="absolute -bottom-2 -right-2 bg-white p-2 rounded-xl shadow-lg border border-slate-100 text-primary hover:scale-110 transition-transform disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </>
            )}
          </div>
          {savedFlash && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs font-bold text-emerald-500 mt-4 flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Profile saved
            </motion.p>
          )}
          {error && (
            <p className="text-xs font-bold text-red-500 mt-4 flex items-center gap-1.5">
              <AlertCircle size={13} /> {error}
            </p>
          )}
        </div>

        {/* Fields */}
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <User size={12} /> Name
            </label>
            {isEditing ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
              />
            ) : (
              <p className="text-lg font-bold text-slate-900 px-1">{me.name || "—"}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <Mail size={12} /> Email
            </label>
            <p className="text-sm font-medium text-slate-600 px-1">{me.email}</p>
            <p className="text-[10px] text-slate-400 px-1">Email cannot be changed. Contact your administrator if needed.</p>
          </div>

          {!isGuest && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <Phone size={12} /> Phone
            </label>
            {isEditing ? (
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (000) 000-0000"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium text-slate-700 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
              />
            ) : (
              <p className="text-sm font-medium text-slate-600 px-1">{me.phone || "—"}</p>
            )}
          </div>
          )}

          {!isGuest && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <IdCard size={12} /> Employee ID
            </label>
            {isEditing ? (
              <input
                type="text"
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
                placeholder="EMP-XXX"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium text-slate-700 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
              />
            ) : (
              <p className="text-sm font-medium text-slate-600 px-1">{me.empId || "—"}</p>
            )}
            <p className="text-[10px] text-slate-400 px-1">Used to surface projects assigned to you.</p>
          </div>
          )}

          {/* Signature — staff sign purchase orders with it; subcontractors and partners sign
              their agreements with it. Everyone needs to be able to upload one. */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <PenLine size={12} /> Signature
            </label>
            <div className="flex items-center gap-3">
              <div className="w-40 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden">
                {me.signatureUrl ? <img src={attachmentUrl((me.signatureUrl || "").replace(/^\/+/, ""))} alt="Signature" className="max-h-full max-w-full object-contain" /> : <span className="text-[10px] text-slate-400 italic">No signature</span>}
              </div>
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-200">
                {sigUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {me.signatureUrl ? "Replace" : "Upload"}
                <input type="file" accept="image/*" className="hidden" onChange={handleSignatureChange} />
              </label>
            </div>
            <p className="text-[10px] text-slate-400 px-1">
              {isGuest
                ? "Used when you sign an agreement sent to you. Use a transparent PNG for best results."
                : "Uploaded to sign purchase orders and agreements. Use a transparent PNG for best results."}
            </p>
          </div>
        </div>
      </div>

      {/* Subcontractor — their own logged expenses across projects */}
      {isGuest && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-10 lg:col-span-2"
        >
          <h2 className="text-xl font-display font-bold text-slate-900 mb-1">My Logged Expenses</h2>
          <p className="text-xs text-slate-400 mb-6">Expenses you've added across the projects shared with you. Only you and the project team can see these.</p>
          {myExpenses.length === 0 ? (
            <p className="text-sm text-slate-400 italic">You haven't logged any expenses yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-100">
                    {["Project", "Description", "Qty", "Unit Price", "Total", "Date", "Approval"].map((h) => (
                      <th key={h} className="text-left px-3 py-3 font-bold text-slate-500 uppercase tracking-widest text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {myExpenses.map((e) => {
                    const n = (s: string) => parseFloat(String(s).replace(/[^0-9.-]/g, "")) || 0;
                    const total = (n(e.qty) || 1) * n(e.amount);
                    return (
                      <tr key={e._id} className="hover:bg-slate-50/40">
                        <td className="px-3 py-2.5 font-bold text-slate-700">{e.projectName}</td>
                        <td className="px-3 py-2.5 text-slate-600">{e.description || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-600">{e.qty || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-600">{e.amount || "—"}</td>
                        <td className="px-3 py-2.5 font-bold text-slate-900">{total ? total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                        <td className="px-3 py-2.5 text-slate-500">{e.date || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${
                            e.approval === "approved" ? "bg-emerald-50 text-emerald-600"
                            : e.approval === "rejected" ? "bg-red-50 text-red-600"
                            : "bg-amber-50 text-amber-600"
                          }`}>{e.approval || "pending"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* Partner Profile — self-hides unless this user is a JV partner on some project. */}
      <PartnerProfileSection />

      {/* My Agreements — the employee side of the agreement engine: review, sign or reject
          agreements sent from User Management. */}
      {!isGuest && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-8 lg:p-10 lg:col-span-2"
        >
          <h2 className="text-xl font-display font-bold text-slate-900 mb-1">My Agreements</h2>
          <p className="text-xs text-slate-400 mb-6">Agreements sent to you by GreenTech. Review each one, then sign or reject it — your saved signature above is used when you sign.</p>
          {getAuthUser()?.id && <AgreementsPanel ctx={{ kind: "user", userId: getAuthUser()!.id }} canManage={false} canSign />}
        </motion.div>
      )}

      {!isGuest && (<>
      {/* Change Password — right column, top (bento) */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-8 lg:p-10 lg:col-span-2"
      >
        <h2 className="text-xl font-display font-bold text-slate-900 mb-8">Change Password</h2>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current Password</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="Enter current password"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pr-12 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">New Password</label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pr-12 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Repeat new password"
                className={`w-full bg-slate-50 border rounded-2xl p-4 pr-12 text-sm font-medium focus:bg-white focus:ring-4 outline-none transition-all ${
                  confirmPw && newPw !== confirmPw ? "border-red-200 focus:ring-red-100" : "border-slate-100 focus:ring-primary/5"
                }`}
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmPw && newPw !== confirmPw && (
              <p className="text-xs text-red-500 font-bold">Passwords do not match</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-8 gap-4">
          {pwSaved && (
            <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Password updated
            </motion.p>
          )}
          {pwError && (
            <p className="text-xs font-bold text-red-500 flex items-center gap-1.5">
              <AlertCircle size={13} /> {pwError}
            </p>
          )}
          <button
            onClick={handleChangePassword}
            disabled={pwSaving || !currentPw || !newPw || newPw !== confirmPw}
            className="ml-auto flex items-center gap-2 px-8 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-primary transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pwSaving && <Loader2 size={14} className="animate-spin" />}
            Update Password
          </button>
        </div>
      </motion.div>

      {/* Backup Preferences — full-width band under the top row (bento) */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-8 lg:p-10 lg:col-span-3"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2">
              <Archive size={20} className="text-primary" /> Monthly Backup
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Get an email each month with secure download links to every project you own or are assigned to.
            </p>
          </div>
          {me.lastBackupSent && (
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Last sent: {new Date(me.lastBackupSent).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Enable + Day of month */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-50 rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-700">Automatic monthly backup</p>
              <p className="text-[11px] text-slate-400 mt-1">Toggle the recurring email on or off.</p>
            </div>
            <button
              type="button"
              onClick={() => setBackupEnabled((v) => !v)}
              className={`relative w-12 h-6 rounded-full transition-colors duration-300 flex-shrink-0 ${backupEnabled ? "bg-indigo-500" : "bg-slate-300"}`}
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md ${backupEnabled ? "left-6" : "left-0.5"}`}
              />
            </button>
          </div>

          <div className="bg-slate-50 rounded-2xl p-5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
              <Calendar size={11} /> Day of month
            </label>
            <select
              value={backupDay}
              onChange={(e) => setBackupDay(Number(e.target.value))}
              disabled={!backupEnabled}
              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}{d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : d === 21 ? "st" : d === 22 ? "nd" : d === 23 ? "rd" : "th"} of each month
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 mt-2">Sent at 09:00 server time on the selected day.</p>
          </div>
        </div>

        {/* Preview of projects */}
        <div className="border border-slate-100 rounded-2xl overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Briefcase size={11} /> Projects in your next backup ({backupPreview?.projects.length ?? "…"})
            </p>
            {backupPreview && !backupPreview.emailConfigured && (
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">SMTP not configured</span>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {!backupPreview && (
              <div className="px-5 py-6 text-center text-slate-300"><Loader2 size={16} className="animate-spin inline" /></div>
            )}
            {backupPreview && backupPreview.projects.length === 0 && (
              <div className="px-5 py-8 text-center text-xs text-slate-400 italic">You aren&apos;t on any projects yet — nothing to back up.</div>
            )}
            {backupPreview && backupPreview.projects.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/50">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{p.name}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    {p.id} · {p.status}{p.location ? ` · ${p.location}` : ""}
                  </p>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md ${p.role === "owner" ? "bg-primary/10 text-primary" : "bg-indigo-50 text-indigo-600"}`}>
                  {p.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleSaveBackupPrefs}
            disabled={backupSaving}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-sm font-bold hover:bg-primary transition-all disabled:opacity-50"
          >
            {backupSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Preferences
          </button>
          <button
            onClick={handleSendBackupNow}
            disabled={backupSending}
            title="Send the backup email to your inbox right now"
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gt-gradient text-white rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all disabled:opacity-50"
          >
            {backupSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send Backup Now
          </button>
        </div>
      </motion.div>

      {/* Resume Builder — full width (bento) */}
      <div className="lg:col-span-3"><ResumeBuilder me={me} /></div>

      {/* Admin-only: manage the public-site announcements banner — full width */}
      {me.role === "admin" && <div className="lg:col-span-3"><AdminAnnouncements /></div>}
      </>)}
      </div>
    </div>
  );
}
