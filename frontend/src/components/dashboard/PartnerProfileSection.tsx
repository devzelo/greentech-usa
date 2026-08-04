import { useEffect, useState } from "react";
import { Building2, Loader2, Upload, X, Save, PenLine, Stamp } from "lucide-react";
import {
  fetchProjects, updatePartnerProfile, uploadPartnerAsset, attachmentUrl, getAuthUser,
  type ApiProject, type PartnerProfileInput,
} from "../../lib/api";
import { toast } from "../../lib/toast";

// Shown on a JV partner's own Profile page: they edit their partner profile (name, contact,
// email, phone, address, logo) and manage their stamps & signatures — per project. It edits the
// same jointVenture record the staff Partners tab shows, so both stay in sync. The signature
// managed here is what appears when the partner signs an agreement.

const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/10";
type JVImg = { name: string; url: string };
type Form = { partnerName: string; contactName: string; email: string; phone: string; partnerAddress: string; logo: string; stamps: JVImg[]; signatures: JVImg[] };

const resolveImg = (u: string) => (u.startsWith("uploads") || u.includes("/uploads/")) ? attachmentUrl(u.replace(/^\/+/, "")) : u;

export default function PartnerProfileSection() {
  const myEmail = (getAuthUser()?.email || "").toLowerCase();
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "stamps" | "signatures" | null>(null);

  useEffect(() => {
    // A partner's JV projects = projects shared with them where the JV email matches their login.
    fetchProjects("mine")
      .then((ps) => {
        const mine = ps.filter((p) => p.jointVenture?.enabled && (p.jointVenture.email || "").toLowerCase() === myEmail);
        setProjects(mine);
        if (mine.length) setActiveId(mine[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = projects.find((x) => x.id === activeId);
    if (!p?.jointVenture) { setForm(null); return; }
    const jv = p.jointVenture;
    setForm({
      partnerName: jv.partnerName || "", contactName: jv.contactName || "", email: jv.email || "",
      phone: jv.phone || "", partnerAddress: jv.partnerAddress || "", logo: jv.logo || "",
      stamps: (jv.stamps || []).map((s) => ({ ...s })), signatures: (jv.signatures || []).map((s) => ({ ...s })),
    });
  }, [activeId, projects]);

  if (loading) return null;               // nothing to show while we check
  if (projects.length === 0) return null; // not a partner on any project — hide the whole section

  const upload = async (file: File, target: "logo" | "stamps" | "signatures") => {
    if (!activeId || !form) return;
    setUploading(target);
    try {
      const { url } = await uploadPartnerAsset(activeId, file);
      if (target === "logo") setForm({ ...form, logo: url });
      else setForm({ ...form, [target]: [...form[target], { name: file.name.replace(/\.[^.]+$/, ""), url }] });
    } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
    finally { setUploading(null); }
  };
  const save = async () => {
    if (!activeId || !form) return;
    setSaving(true);
    try {
      const body: PartnerProfileInput = { ...form };
      const jv = await updatePartnerProfile(activeId, body);
      setProjects((prev) => prev.map((p) => (p.id === activeId ? { ...p, jointVenture: { ...p.jointVenture!, ...jv } } : p)));
      toast("Partner profile saved. Your stamps & signature are linked to the project's Partners tab.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save.", "error"); }
    finally { setSaving(false); }
  };

  const imgList = (target: "stamps" | "signatures", label: string, Icon: typeof Stamp) => form && (
    <div className="space-y-2">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Icon size={12} /> {label}</label>
      <div className="flex flex-wrap items-center gap-2">
        {form[target].map((img, i) => (
          <div key={i} className="relative group border border-slate-100 rounded-xl p-2 bg-slate-50">
            <img src={resolveImg(img.url)} alt={img.name || label} className="h-14 object-contain" />
            <button type="button" title="Remove" onClick={() => setForm({ ...form, [target]: form[target].filter((_, j) => j !== i) })}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none opacity-0 group-hover:opacity-100 transition-opacity">×</button>
          </div>
        ))}
        {form[target].length === 0 && <span className="text-[11px] text-slate-400 italic">None yet.</span>}
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 text-slate-600 text-xs font-bold hover:border-primary hover:text-primary cursor-pointer">
          {uploading === target ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload
          <input type="file" accept="image/*" className="hidden" disabled={uploading !== null} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, target); e.target.value = ""; }} />
        </label>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-8 lg:p-10 lg:col-span-2">
      <div className="flex items-center gap-2 mb-1">
        <Building2 size={18} className="text-primary" />
        <h2 className="text-xl font-display font-bold text-slate-900">Partner Profile</h2>
      </div>
      <p className="text-xs text-slate-400 mb-6">Manage your company details, stamps and signature. These are linked to each project's Partners tab, and your signature is used when you sign an agreement.</p>

      {projects.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {projects.map((p) => (
            <button key={p.id} onClick={() => setActiveId(p.id)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${activeId === p.id ? "bg-slate-900 text-white shadow" : "bg-slate-50 text-slate-500 hover:text-slate-900"}`}>{p.name}</button>
          ))}
        </div>
      )}

      {form && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Company name
              <input className={`${inp} mt-1`} value={form.partnerName} onChange={(e) => setForm({ ...form, partnerName: e.target.value })} /></label>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Person in charge
              <input className={`${inp} mt-1`} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></label>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email
              <input className={`${inp} mt-1`} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phone
              <input className={`${inp} mt-1`} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          </div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Address
            <textarea rows={2} className={`${inp} mt-1 resize-y`} value={form.partnerAddress} onChange={(e) => setForm({ ...form, partnerAddress: e.target.value })} /></label>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Company logo</label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                {form.logo ? <img src={resolveImg(form.logo)} alt="Logo" className="w-full h-full object-contain" /> : <Building2 size={20} className="text-slate-300" />}
              </div>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer">
                {uploading === "logo" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {form.logo ? "Replace" : "Upload logo"}
                <input type="file" accept="image/*" className="hidden" disabled={uploading !== null} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "logo"); e.target.value = ""; }} />
              </label>
              {form.logo && <button type="button" onClick={() => setForm({ ...form, logo: "" })} className="text-[11px] font-bold text-red-500 hover:underline">Remove</button>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
            {imgList("stamps", "Stamps", Stamp)}
            {imgList("signatures", "Signatures", PenLine)}
          </div>

          <div className="flex justify-end">
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg shadow-primary/20 disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save partner profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
