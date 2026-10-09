import { useState } from "react";
import PhoneInput from "./PhoneInput";
import { Building2, X, Loader2, Landmark, Upload } from "lucide-react";
import {
  createCompany, updateCompany, uploadCompanyLogo, withFileToken,
  COMPANY_CATEGORIES, type ApiCompany, type CompanyInput, type CompanyCategory,
} from "../../lib/api";
import { toast } from "../../lib/toast";

const inp = "w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/15 focus:bg-white";
const label = "block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1";

export const BLANK_COMPANY: CompanyInput = {
  name: "", category: "vendor", categories: ["vendor"], logoUrl: "", address: "", phone: "", email: "", website: "",
  contactPersons: [], banking: { bankName: "", accountName: "", accountNumber: "", iban: "", swift: "", routing: "" },
  tax: { taxId: "", registrationNo: "" }, notes: "", archived: false,
};

/**
 * The Companies Directory create/edit form.
 *
 * Lives on its own so anywhere that needs a company can open the real Directory form
 * instead of a cut-down copy — the RFQ receiver list does exactly that, keeping its own
 * modal open underneath and attaching whatever gets saved (CR-PR-08).
 */
export default function CompanyEditorModal({
  companyId = null, initial, onSaved, onClose,
}: {
  /** Existing company to edit; null/omitted creates a new one. */
  companyId?: string | null;
  /** Starting values — e.g. a name typed elsewhere, or the category to default to. */
  initial?: Partial<CompanyInput>;
  onSaved: (company: ApiCompany) => void;
  onClose: () => void;
}) {
  const [draft, setDraftState] = useState<CompanyInput>(() => {
    const merged = { ...BLANK_COMPANY, ...initial };
    // Legacy records / callers may pass only `category`; derive the multi-select set from it.
    const cats = merged.categories && merged.categories.length ? merged.categories : (merged.category ? [merged.category] : []);
    return { ...merged, categories: cats, category: cats[0] || merged.category };
  });
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  const setDraft = (patch: Partial<CompanyInput>) => setDraftState((d) => ({ ...d, ...patch }));
  // Toggle a category on/off; keep `category` as the primary (first selected).
  const toggleCat = (v: CompanyCategory) => setDraftState((d) => {
    const cur = d.categories || [];
    const next = cur.includes(v) ? cur.filter((c) => c !== v) : [...cur, v];
    return { ...d, categories: next, category: next[0] || d.category };
  });
  const cps = () => draft.contactPersons || [];
  const setCps = (list: ApiCompany["contactPersons"]) => setDraft({ contactPersons: list });

  const uploadLogo = async (file: File) => {
    setLogoUploading(true);
    try { const { url } = await uploadCompanyLogo(file); setDraft({ logoUrl: url }); }
    catch (e) { toast(e instanceof Error ? e.message : "Logo upload failed.", "error"); }
    finally { setLogoUploading(false); }
  };

  const save = async () => {
    if (!String(draft.name || "").trim()) { toast("Enter a company name.", "error"); return; }
    if (!(draft.categories && draft.categories.length)) { toast("Pick at least one category.", "error"); return; }
    setSaving(true);
    try {
      const saved = companyId ? await updateCompany(companyId, draft) : await createCompany(draft);
      toast("Company saved.", "success");
      onSaved(saved);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save the company.", "error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
          <h3 className="text-base font-bold text-slate-900">{companyId ? "Edit company" : "New company"}</h3>
          <button onClick={onClose} disabled={saving} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* CR-P-07 — company logo. */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
              {draft.logoUrl ? <img src={withFileToken(draft.logoUrl)} alt="Logo" className="w-full h-full object-contain" /> : <Building2 size={22} className="text-slate-300" />}
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary cursor-pointer">
                {logoUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {draft.logoUrl ? "Change logo" : "Upload logo"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = ""; }} />
              </label>
              {draft.logoUrl && <button onClick={() => setDraft({ logoUrl: "" })} className="text-[11px] font-bold text-slate-400 hover:text-red-500">Remove</button>}
            </div>
          </div>
          <div><label className={label}>Company name *</label><input className={inp} value={draft.name || ""} onChange={(e) => setDraft({ name: e.target.value })} placeholder="e.g. Nexans Cables" /></div>
          <div>
            <label className={label}>Categories</label>
            <div className="flex flex-wrap gap-1.5">
              {COMPANY_CATEGORIES.map((o) => {
                const on = (draft.categories || []).includes(o.v);
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => toggleCat(o.v)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${on ? "bg-primary text-white border-primary" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">Pick one or more — a company can be in several (e.g. Client and Consultant). The first selected is its primary category.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className={label}>Email</label><input className={inp} value={draft.email || ""} onChange={(e) => setDraft({ email: e.target.value })} /></div>
            <div><label className={label}>Phone</label><PhoneInput className={inp} value={draft.phone || ""} onChange={(v) => setDraft({ phone: v })} /></div>
            <div><label className={label}>Website</label><input className={inp} value={draft.website || ""} onChange={(e) => setDraft({ website: e.target.value })} /></div>
          </div>
          <div><label className={label}>Address</label><textarea rows={4} className={`${inp} resize-y`} placeholder="Paste the full address exactly as written" value={draft.address || ""} onChange={(e) => setDraft({ address: e.target.value })} /></div>

          {/* Contact persons */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className={label + " mb-0"}>Contact persons</p>
              <button onClick={() => setCps([...cps(), { name: "", role: "", email: "", phone: "" }])} className="text-[11px] font-bold text-primary hover:underline">+ Add contact</button>
            </div>
            {cps().length === 0 && <p className="text-[11px] text-slate-400 italic">None yet.</p>}
            {cps().map((p, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                <input className={`${inp} py-1.5`} placeholder="Name" value={p.name} onChange={(e) => setCps(cps().map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className={`${inp} py-1.5`} placeholder="Role" value={p.role} onChange={(e) => setCps(cps().map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
                <input className={`${inp} py-1.5`} placeholder="Email" value={p.email} onChange={(e) => setCps(cps().map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                <div className="flex items-center gap-1">
                  <PhoneInput className={`${inp} py-1.5`} placeholder="Phone" value={p.phone} onChange={(v) => setCps(cps().map((x, j) => (j === i ? { ...x, phone: v } : x)))} />
                  <button onClick={() => setCps(cps().filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500 shrink-0"><X size={15} /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Banking + tax */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className={label + " mb-0 flex items-center gap-1.5"}><Landmark size={12} /> Banking &amp; tax</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input className={`${inp} py-1.5`} placeholder="Bank name" value={draft.banking?.bankName || ""} onChange={(e) => setDraft({ banking: { ...draft.banking!, bankName: e.target.value } })} />
              <input className={`${inp} py-1.5`} placeholder="Account name" value={draft.banking?.accountName || ""} onChange={(e) => setDraft({ banking: { ...draft.banking!, accountName: e.target.value } })} />
              <input className={`${inp} py-1.5`} placeholder="Account number" value={draft.banking?.accountNumber || ""} onChange={(e) => setDraft({ banking: { ...draft.banking!, accountNumber: e.target.value } })} />
              <input className={`${inp} py-1.5`} placeholder="IBAN" value={draft.banking?.iban || ""} onChange={(e) => setDraft({ banking: { ...draft.banking!, iban: e.target.value } })} />
              <input className={`${inp} py-1.5`} placeholder="SWIFT/BIC" value={draft.banking?.swift || ""} onChange={(e) => setDraft({ banking: { ...draft.banking!, swift: e.target.value } })} />
              <input className={`${inp} py-1.5`} placeholder="Routing" value={draft.banking?.routing || ""} onChange={(e) => setDraft({ banking: { ...draft.banking!, routing: e.target.value } })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input className={`${inp} py-1.5`} placeholder="Tax ID" value={draft.tax?.taxId || ""} onChange={(e) => setDraft({ tax: { ...draft.tax!, taxId: e.target.value } })} />
              <input className={`${inp} py-1.5`} placeholder="Registration no." value={draft.tax?.registrationNo || ""} onChange={(e) => setDraft({ tax: { ...draft.tax!, registrationNo: e.target.value } })} />
            </div>
          </div>

          <div><label className={label}>Notes</label><textarea rows={2} className={inp} value={draft.notes || ""} onChange={(e) => setDraft({ notes: e.target.value })} /></div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-3xl">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold disabled:opacity-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-primary disabled:opacity-50 inline-flex items-center gap-1.5">{saving && <Loader2 size={14} className="animate-spin" />} Save</button>
        </div>
      </div>
    </div>
  );
}
