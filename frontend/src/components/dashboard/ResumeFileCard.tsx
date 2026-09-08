import { useState, type ChangeEvent } from "react";
import { motion } from "motion/react";
import { FileUser, Upload, Trash2, Loader2, Eye, Download } from "lucide-react";
import { uploadMyResumeFile, deleteMyResumeFile, attachmentUrl, type ApiResumeFile } from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";

// CR-P (16) — a plain uploaded resume/CV on the profile, available to every role (the staff
// resume builder stays separate). Uploading again replaces the previous file.
export default function ResumeFileCard({ initial }: { initial?: ApiResumeFile }) {
  const { confirm, dialogs } = useDialogs();
  const [resume, setResume] = useState<ApiResumeFile | null>(initial?.filePath ? initial : null);
  const [busy, setBusy] = useState(false);

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 32 * 1024 * 1024) { toast("Resume must be under 32 MB.", "error"); return; }
    setBusy(true);
    try {
      setResume(await uploadMyResumeFile(file));
      toast("Resume uploaded.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!(await confirm({ title: "Remove resume?", message: "Delete the uploaded resume from your profile?", confirmLabel: "Delete", cancelLabel: "Cancel", danger: true }))) return;
    setBusy(true);
    try { await deleteMyResumeFile(); setResume(null); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not delete.", "error"); }
    finally { setBusy(false); }
  };

  const fileUrl = resume ? attachmentUrl(resume.filePath.replace(/^\/+/, "")) : "";

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-8 lg:p-10">
      <h2 className="text-xl font-display font-bold text-slate-900 mb-1 flex items-center gap-2"><FileUser size={20} className="text-primary" /> Resume</h2>
      <p className="text-xs text-slate-400 mb-6">Upload your resume or company profile document so the GreenTech team always has your latest version.</p>

      {resume ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 px-4 py-3">
          <span className="flex items-center gap-2.5 min-w-0">
            <FileUser size={18} className="text-slate-400 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-700 truncate" title={resume.name}>{resume.name}</span>
              {resume.size && <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">{resume.size}</span>}
            </span>
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <a href={fileUrl} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50" title="View"><Eye size={15} /></a>
            <a href={fileUrl} download={resume.name} className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50" title="Download"><Download size={15} /></a>
            <label className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50 cursor-pointer" title="Replace">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              <input type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={handleUpload} disabled={busy} />
            </label>
            <button onClick={remove} disabled={busy} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40" title="Delete"><Trash2 size={15} /></button>
          </span>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-2xl border-2 border-dashed border-slate-200 hover:border-primary/40 hover:bg-slate-50 cursor-pointer text-center transition-colors">
          {busy ? <Loader2 size={22} className="text-slate-400 animate-spin" /> : <Upload size={22} className="text-slate-400" />}
          <span className="text-xs font-bold text-slate-500">Click to upload your resume</span>
          <span className="text-[10px] text-slate-400">PDF or Word, up to 32 MB</span>
          <input type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={handleUpload} disabled={busy} />
        </label>
      )}

      {dialogs}
    </motion.div>
  );
}
