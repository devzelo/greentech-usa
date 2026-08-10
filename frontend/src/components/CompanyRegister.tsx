import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CheckCircle2, Building2, Plus, X } from "lucide-react";
import { fetchPublicCompany, submitPublicCompany, type PublicCompany } from "../lib/api";

// Public vendor self-registration page (client CR-P-06d). No login — opened via a secure
// token link GT sends. Submissions land in a pending buffer GT approves before they replace
// verified data (especially banking).
const inp = "w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/15 focus:bg-white";
const label = "block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1";

export default function CompanyRegister() {
  const { token = "" } = useParams();
  const [data, setData] = useState<PublicCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetchPublicCompany(token)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "This link is invalid or has expired."))
      .finally(() => setLoading(false));
  }, [token]);

  const set = (patch: Partial<PublicCompany>) => setData((d) => (d ? { ...d, ...patch } : d));
  const cps = () => data?.contactPersons || [];
  const setCps = (list: PublicCompany["contactPersons"]) => set({ contactPersons: list });

  const submit = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await submitPublicCompany(token, data);
      setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not submit — please try again."); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;
  if (error && !data) return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div><Building2 size={40} className="mx-auto mb-3 text-slate-300" /><p className="text-slate-600 font-bold">{error}</p></div>
    </div>
  );
  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center bg-slate-50">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-10 max-w-md">
        <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-500" />
        <h1 className="text-xl font-bold text-slate-900">Thank you!</h1>
        <p className="text-sm text-slate-500 mt-2">Your details were submitted to GreenTech USA for review. Banking and other sensitive changes are verified before they take effect.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Building2 className="text-primary" />
          <div>
            <h1 className="text-xl font-display font-bold text-slate-900">Company registration</h1>
            <p className="text-xs text-slate-500">Update your company's details for GreenTech USA. Your changes are reviewed before they take effect.</p>
          </div>
        </div>
        {data && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-4">
            {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2">{error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={label}>Company name</label><input className={inp} value={data.name} onChange={(e) => set({ name: e.target.value })} /></div>
              <div><label className={label}>Category</label><input className={`${inp} opacity-70`} value={data.category} disabled /></div>
              <div><label className={label}>Email</label><input className={inp} value={data.email} onChange={(e) => set({ email: e.target.value })} /></div>
              <div><label className={label}>Phone</label><input className={inp} value={data.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className={label}>Website</label><input className={inp} value={data.website} onChange={(e) => set({ website: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className={label}>Address</label><textarea rows={2} className={inp} value={data.address} onChange={(e) => set({ address: e.target.value })} /></div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between"><p className={label + " mb-0"}>Contact persons</p><button onClick={() => setCps([...cps(), { name: "", role: "", email: "", phone: "" }])} className="text-[11px] font-bold text-primary hover:underline">+ Add contact</button></div>
              {cps().map((p, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                  <input className={`${inp} py-1.5`} placeholder="Name" value={p.name} onChange={(e) => setCps(cps().map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <input className={`${inp} py-1.5`} placeholder="Role" value={p.role} onChange={(e) => setCps(cps().map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
                  <input className={`${inp} py-1.5`} placeholder="Email" value={p.email} onChange={(e) => setCps(cps().map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                  <div className="flex items-center gap-1"><input className={`${inp} py-1.5`} placeholder="Phone" value={p.phone} onChange={(e) => setCps(cps().map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} /><button onClick={() => setCps(cps().filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500 shrink-0"><X size={15} /></button></div>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <p className={label + " mb-0"}>Banking &amp; tax <span className="font-medium normal-case text-amber-600">— reviewed before it takes effect</span></p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input className={`${inp} py-1.5`} placeholder="Bank name" value={data.banking.name} onChange={(e) => set({ banking: { ...data.banking, name: e.target.value } })} />
                <input className={`${inp} py-1.5`} placeholder="Account name" value={data.banking.accountName} onChange={(e) => set({ banking: { ...data.banking, accountName: e.target.value } })} />
                <input className={`${inp} py-1.5`} placeholder="Account number" value={data.banking.accountNumber} onChange={(e) => set({ banking: { ...data.banking, accountNumber: e.target.value } })} />
                <input className={`${inp} py-1.5`} placeholder="IBAN" value={data.banking.iban} onChange={(e) => set({ banking: { ...data.banking, iban: e.target.value } })} />
                <input className={`${inp} py-1.5`} placeholder="SWIFT/BIC" value={data.banking.swift} onChange={(e) => set({ banking: { ...data.banking, swift: e.target.value } })} />
                <input className={`${inp} py-1.5`} placeholder="Routing" value={data.banking.routing} onChange={(e) => set({ banking: { ...data.banking, routing: e.target.value } })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className={`${inp} py-1.5`} placeholder="Tax ID" value={data.tax.taxId} onChange={(e) => set({ tax: { ...data.tax, taxId: e.target.value } })} />
                <input className={`${inp} py-1.5`} placeholder="Registration no." value={data.tax.registrationNo} onChange={(e) => set({ tax: { ...data.tax, registrationNo: e.target.value } })} />
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={submit} disabled={saving} className="px-6 py-2.5 rounded-xl bg-gt-gradient text-white text-sm font-bold shadow-lg shadow-primary/20 disabled:opacity-50 inline-flex items-center gap-2">{saving && <Loader2 size={14} className="animate-spin" />} <Plus size={16} /> Submit for review</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
