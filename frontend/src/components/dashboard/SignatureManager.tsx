import { useEffect, useState, type ChangeEvent } from "react";
import { motion } from "motion/react";
import { PenLine, Upload, Trash2, Loader2, CheckCircle2, Star } from "lucide-react";
import { fetchMySignatures, uploadMySignature, updateMySignature, deleteMySignature, attachmentUrl, type ApiSignature } from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";

// CR-P (16) — the signatures card: several named signatures per account (a company login keeps
// one per signer person), with a chosen default. The default is what POs and agreements use, and
// when signing an agreement the signer can pick any of them.
export default function SignatureManager() {
  const { confirm, dialogs } = useDialogs();
  const [sigs, setSigs] = useState<ApiSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetchMySignatures().then(setSigs).catch(() => setSigs([])).finally(() => setLoading(false));
  }, []);

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast("Signature image must be under 5 MB.", "error"); return; }
    setUploading(true);
    try {
      setSigs(await uploadMySignature(file, label.trim()));
      setLabel("");
      toast("Signature added.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
    finally { setUploading(false); }
  };

  const makeDefault = async (s: ApiSignature) => {
    if (s.isDefault) return;
    setBusyId(s.id);
    try { setSigs(await updateMySignature(s.id, { isDefault: true })); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
    finally { setBusyId(null); }
  };

  const remove = async (s: ApiSignature) => {
    if (!(await confirm({ title: "Remove signature?", message: `Delete the signature${s.label ? ` for "${s.label}"` : ""}? Documents already signed with it keep their copy.`, confirmLabel: "Delete", cancelLabel: "Cancel", danger: true }))) return;
    setBusyId(s.id);
    try { setSigs(await deleteMySignature(s.id)); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not delete.", "error"); }
    finally { setBusyId(null); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-8 lg:p-10">
      <h2 className="text-xl font-display font-bold text-slate-900 mb-1 flex items-center gap-2"><PenLine size={20} className="text-primary" /> Signatures</h2>
      <p className="text-xs text-slate-400 mb-6">Upload one signature per signer, with their name. The starred one is your default: it is used on purchase orders and offered first when signing an agreement. Use transparent PNGs for best results.</p>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center"><Loader2 size={16} className="animate-spin" /> Loading signatures…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {sigs.length === 0 && <p className="text-xs text-slate-400 italic col-span-full">No signatures yet. Add the first one below; it becomes the default.</p>}
          {sigs.map((s) => (
            <div key={s.id} className={`rounded-2xl border p-3 ${s.isDefault ? "border-primary/40 bg-primary/[0.03]" : "border-slate-100"}`}>
              <div className="h-16 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden mb-2">
                <img src={attachmentUrl(s.url.replace(/^\/+/, ""))} alt={s.label || "Signature"} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-700 truncate">{s.label || "Unnamed signer"}</span>
                  {s.isDefault && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary"><CheckCircle2 size={10} /> Default</span>}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  {!s.isDefault && (
                    <button onClick={() => makeDefault(s)} disabled={busyId === s.id} title="Use as default" className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 disabled:opacity-40">
                      {busyId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
                    </button>
                  )}
                  <button onClick={() => remove(s)} disabled={busyId === s.id} title="Delete" className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40">
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add a signature: name the signer, then choose the image */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-grow space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Signer name</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Who does this signature belong to?"
            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-3.5 text-sm font-medium text-slate-700 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
          />
        </div>
        <label className={`inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold cursor-pointer transition-all shrink-0 ${uploading ? "bg-slate-100 text-slate-400" : "bg-slate-900 text-white hover:bg-primary active:scale-95"}`}>
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Add signature
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {dialogs}
    </motion.div>
  );
}
