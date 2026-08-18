import { useEffect, useState, type ReactNode } from "react";
import { FileText, Plus, Trash2, Save, Loader2, Download, X, Pencil, Library, Search, ArrowUp, ArrowDown, Eye } from "lucide-react";
import { PDFDownloadLink, PDFViewer } from "@react-pdf/renderer";
import {
  fetchSubResumes, createSubResume, updateSubResume, deleteSubResume,
  ApiSubResume, SubResumeInput,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import ResumePDF from "./ResumePDF";
import { ConfirmDialog } from "./Dialogs";

const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-sm font-medium text-slate-700 focus:bg-white focus:ring-2 focus:ring-primary/10 outline-none transition-all";
const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
const overlay = "absolute inset-0 bg-slate-950/40 backdrop-blur-sm";

type Draft = Omit<ApiSubResume, "_id" | "updatedAt">;

const emptyDraft = (subcontractorName: string): Draft => ({
  personName: "", subcontractorName, title: "", summary: "", citizenship: "",
  assignmentOnProject: "", yearsOfExperience: "", remark: "", showPhoto: true,
  contact: { email: "", phone: "", location: "" }, photoUrl: "",
  experience: [], projects: [], education: [], skills: [], certifications: [], languages: [], customSections: [],
});

function updateAt<T>(list: T[], i: number, patch: Partial<NoInfer<T>>): T[] {
  return list.map((item, idx) => (idx === i ? { ...item, ...patch } : item));
}
function removeAt<T>(list: T[], i: number): T[] {
  return list.filter((_, idx) => idx !== i);
}
function moveAt<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
function rowShell(rowKey: number, onRemove: () => void, children: ReactNode) {
  return (
    <div key={rowKey} className="relative bg-white border border-slate-100 rounded-xl p-3 mb-2">
      <button onClick={onRemove} title="Remove" className="absolute top-2 right-2 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-slate-50"><Trash2 size={12} /></button>
      {children}
    </div>
  );
}

export default function SubcontractorResumes({ subcontractorName, canManage }: { subcontractorName: string; canManage: boolean }) {
  const [resumes, setResumes] = useState<ApiSubResume[]>([]);
  const [loading, setLoading] = useState(true);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(subcontractorName));
  const [skillsText, setSkillsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewDraft, setPreviewDraft] = useState(false);

  const [libOpen, setLibOpen] = useState(false);
  const [libQuery, setLibQuery] = useState("");
  const [libResults, setLibResults] = useState<ApiSubResume[]>([]);
  const [libLoading, setLibLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ApiSubResume | null>(null);

  const load = async () => {
    setLoading(true);
    try { setResumes(await fetchSubResumes({ subName: subcontractorName })); }
    catch { /* keep empty */ }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [subcontractorName]);

  const openNew = () => {
    setEditingId(null);
    setDraft(emptyDraft(subcontractorName));
    setSkillsText("");
    setEditorOpen(true);
  };
  const openEdit = (r: ApiSubResume) => {
    const { _id, updatedAt, ...rest } = r; void _id; void updatedAt;
    setEditingId(r._id);
    setDraft({ ...emptyDraft(subcontractorName), ...rest, subcontractorName });
    setSkillsText((r.skills || []).join(", "));
    setEditorOpen(true);
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (!draft.personName.trim()) { toast("Enter the person's name.", "error"); return; }
    setSaving(true);
    try {
      const body: SubResumeInput = { ...draft, skills: skillsText.split(",").map((s) => s.trim()).filter(Boolean) };
      if (editingId) { await updateSubResume(editingId, body); toast("Resume saved.", "success"); }
      else { await createSubResume(body); toast("Resume created.", "success"); }
      setEditorOpen(false);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally { setSaving(false); }
  };

  const runLibSearch = async () => {
    setLibLoading(true);
    try { setLibResults(await fetchSubResumes({ q: libQuery })); }
    catch { setLibResults([]); }
    finally { setLibLoading(false); }
  };
  useEffect(() => { if (libOpen) void runLibSearch(); /* eslint-disable-next-line */ }, [libOpen]);

  const reuse = async (r: ApiSubResume) => {
    try {
      const { _id, updatedAt, ...rest } = r; void _id; void updatedAt;
      await createSubResume({ ...rest, subcontractorName }); // clone into THIS subcontractor
      toast(`Reused "${r.personName}" here.`, "success");
      setLibOpen(false);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not reuse resume.", "error");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try { await deleteSubResume(deleteTarget._id); toast("Resume deleted.", "success"); setDeleteTarget(null); await load(); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); setDeleteTarget(null); }
  };

  return (
    <div className="bg-slate-50 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <FileText size={11} /> Resumes ({resumes.length})
        </p>
        {canManage && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setLibQuery(""); setLibOpen(true); }} className="text-[10px] font-bold text-slate-500 hover:text-primary flex items-center gap-1"><Library size={11} /> Reuse</button>
            <button onClick={openNew} className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"><Plus size={11} /> New resume</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-6 flex justify-center text-slate-300"><Loader2 size={18} className="animate-spin" /></div>
      ) : resumes.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic">No resumes yet.{canManage ? " Build one in the GreenTech format, or reuse an existing one." : ""}</p>
      ) : (
        <div className="space-y-1.5">
          {resumes.map((r) => (
            <div key={r._id} className="flex items-center gap-2 p-2.5 bg-white rounded-lg border border-slate-100">
              <FileText size={13} className="text-primary flex-shrink-0" />
              <div className="min-w-0 flex-grow">
                <p className="text-xs font-bold text-slate-800 truncate">{r.personName || "Untitled"}</p>
                {r.title && <p className="text-[10px] text-slate-400 truncate">{r.title}</p>}
              </div>
              <PDFDownloadLink
                document={<ResumePDF resume={r} person={{ name: r.personName, email: r.contact?.email, phone: r.contact?.phone, avatarUrl: r.photoUrl }} logoUrl={`${window.location.origin}/gt-usa-logo-new.png`} />}
                fileName={`${(r.personName || "resume").replace(/\s+/g, "_")}_Resume.pdf`}
                className="p-1.5 rounded text-slate-400 hover:text-primary"
                title="Download PDF"
              >
                {({ loading: l }) => (l ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />)}
              </PDFDownloadLink>
              {canManage && <button onClick={() => openEdit(r)} className="p-1.5 rounded text-slate-400 hover:text-primary" title="Edit"><Pencil size={13} /></button>}
              {canManage && <button onClick={() => setDeleteTarget(r)} className="p-1.5 rounded text-slate-400 hover:text-red-500" title="Delete"><X size={13} /></button>}
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      {editorOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div className={overlay} />
          <div className="relative bg-white rounded-[2rem] p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-display font-bold text-slate-900">{editingId ? "Edit resume" : "New resume"} <span className="text-slate-400 font-medium">· {subcontractorName}</span></h3>
              <button onClick={() => setEditorOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1"><label className={lbl}>Full name</label><input className={inp} value={draft.personName} onChange={(e) => set("personName", e.target.value)} placeholder="Person's name" /></div>
              <div className="space-y-1"><label className={lbl}>Job title</label><input className={inp} value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Web Designer" /></div>
              <div className="space-y-1"><label className={lbl}>Citizenship / Residency</label><input className={inp} value={draft.citizenship} onChange={(e) => set("citizenship", e.target.value)} placeholder="e.g. U.S. Citizen" /></div>
              <div className="space-y-1"><label className={lbl}>Location</label><input className={inp} value={draft.contact.location} onChange={(e) => set("contact", { ...draft.contact, location: e.target.value })} placeholder="City, Country" /></div>
              <div className="space-y-1"><label className={lbl}>Email</label><input className={inp} value={draft.contact.email} onChange={(e) => set("contact", { ...draft.contact, email: e.target.value })} placeholder="email@example.com" /></div>
              <div className="space-y-1"><label className={lbl}>Phone</label><input className={inp} value={draft.contact.phone} onChange={(e) => set("contact", { ...draft.contact, phone: e.target.value })} placeholder="+1 (000) 000-0000" /></div>
              <div className="space-y-1"><label className={lbl}>Assignment on this project</label><input className={inp} value={draft.assignmentOnProject || ""} onChange={(e) => set("assignmentOnProject", e.target.value)} placeholder="e.g. Project Manager" /></div>
              <div className="space-y-1"><label className={lbl}>Years of experience</label><input className={inp} value={draft.yearsOfExperience || ""} onChange={(e) => set("yearsOfExperience", e.target.value)} placeholder="e.g. +19" /></div>
              <div className="space-y-1 md:col-span-2"><label className={lbl}>Remark</label><textarea rows={2} className={`${inp} resize-none`} value={draft.remark || ""} onChange={(e) => set("remark", e.target.value)} placeholder="e.g. SME of HVAC, WTP & WWTP…" /></div>
              <div className="space-y-1 md:col-span-2"><label className={lbl}>Professional summary</label><textarea rows={3} className={`${inp} resize-none`} value={draft.summary} onChange={(e) => set("summary", e.target.value)} placeholder="Short paragraph…" /></div>
            </div>
            <label className="flex items-center gap-2 mt-3 text-xs font-medium text-slate-600 cursor-pointer">
              <input type="checkbox" checked={draft.showPhoto !== false} onChange={(e) => set("showPhoto", e.target.checked)} className="rounded" />
              Include photo on the resume PDF
            </label>

            {/* Work experience */}
            <div className="flex items-center justify-between mt-6 mb-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Work Experience</h4>
              <button onClick={() => set("experience", [...draft.experience, { company: "", role: "", start: "", end: "", description: "" }])} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200"><Plus size={11} /> Add</button>
            </div>
            {draft.experience.map((e, i) => rowShell(i, () => set("experience", removeAt(draft.experience, i)), (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
                <input className={inp} value={e.role} onChange={(ev) => set("experience", updateAt(draft.experience, i, { role: ev.target.value }))} placeholder="Role" />
                <input className={inp} value={e.company} onChange={(ev) => set("experience", updateAt(draft.experience, i, { company: ev.target.value }))} placeholder="Company" />
                <input className={inp} value={e.start} onChange={(ev) => set("experience", updateAt(draft.experience, i, { start: ev.target.value }))} placeholder="Start" />
                <input className={inp} value={e.end} onChange={(ev) => set("experience", updateAt(draft.experience, i, { end: ev.target.value }))} placeholder="End / Present" />
                <textarea rows={2} className={`${inp} resize-none md:col-span-2`} value={e.description} onChange={(ev) => set("experience", updateAt(draft.experience, i, { description: ev.target.value }))} placeholder="Description…" />
              </div>
            )))}

            {/* Relevant Projects */}
            <div className="flex items-center justify-between mt-6 mb-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">List of Relevant Projects</h4>
              <button onClick={() => set("projects", [...draft.projects, { name: "", role: "", start: "", end: "", description: "" }])} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200"><Plus size={11} /> Add</button>
            </div>
            {draft.projects.map((p, i) => rowShell(i, () => set("projects", removeAt(draft.projects, i)), (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
                <input className={`${inp} md:col-span-2`} value={p.name} onChange={(ev) => set("projects", updateAt(draft.projects, i, { name: ev.target.value }))} placeholder="Project name" />
                <input className={inp} value={p.employer || ""} onChange={(ev) => set("projects", updateAt(draft.projects, i, { employer: ev.target.value }))} placeholder="Employer" />
                <input className={inp} value={p.client || ""} onChange={(ev) => set("projects", updateAt(draft.projects, i, { client: ev.target.value }))} placeholder="Client" />
                <input className={inp} value={p.solicitationNo || ""} onChange={(ev) => set("projects", updateAt(draft.projects, i, { solicitationNo: ev.target.value }))} placeholder="Solicitation #" />
                <input className={inp} value={p.contractNo || ""} onChange={(ev) => set("projects", updateAt(draft.projects, i, { contractNo: ev.target.value }))} placeholder="Contract #" />
                <input className={inp} value={p.start} onChange={(ev) => set("projects", updateAt(draft.projects, i, { start: ev.target.value }))} placeholder="Start" />
                <input className={inp} value={p.end} onChange={(ev) => set("projects", updateAt(draft.projects, i, { end: ev.target.value }))} placeholder="End" />
                <input className={inp} value={p.cost || ""} onChange={(ev) => set("projects", updateAt(draft.projects, i, { cost: ev.target.value }))} placeholder="Cost (e.g. $246,451)" />
                <textarea rows={2} className={`${inp} resize-none md:col-span-2`} value={p.description} onChange={(ev) => set("projects", updateAt(draft.projects, i, { description: ev.target.value }))} placeholder="Scope / description…" />
              </div>
            )))}

            {/* Education */}
            <div className="flex items-center justify-between mt-6 mb-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Education</h4>
              <button onClick={() => set("education", [...draft.education, { school: "", degree: "", field: "", start: "", end: "" }])} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200"><Plus size={11} /> Add</button>
            </div>
            {draft.education.map((e, i) => rowShell(i, () => set("education", removeAt(draft.education, i)), (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
                <input className={inp} value={e.degree} onChange={(ev) => set("education", updateAt(draft.education, i, { degree: ev.target.value }))} placeholder="Degree" />
                <input className={inp} value={e.field} onChange={(ev) => set("education", updateAt(draft.education, i, { field: ev.target.value }))} placeholder="Field" />
                <input className={`${inp} md:col-span-2`} value={e.school} onChange={(ev) => set("education", updateAt(draft.education, i, { school: ev.target.value }))} placeholder="School / University" />
                <input className={inp} value={e.start} onChange={(ev) => set("education", updateAt(draft.education, i, { start: ev.target.value }))} placeholder="Start year" />
                <input className={inp} value={e.end} onChange={(ev) => set("education", updateAt(draft.education, i, { end: ev.target.value }))} placeholder="End year" />
              </div>
            )))}

            {/* Certifications */}
            <div className="flex items-center justify-between mt-6 mb-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Certifications</h4>
              <button onClick={() => set("certifications", [...draft.certifications, { name: "", issuer: "", year: "" }])} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200"><Plus size={11} /> Add</button>
            </div>
            {draft.certifications.map((c, i) => rowShell(i, () => set("certifications", removeAt(draft.certifications, i)), (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pr-6">
                <input className={inp} value={c.name} onChange={(ev) => set("certifications", updateAt(draft.certifications, i, { name: ev.target.value }))} placeholder="Certification" />
                <input className={inp} value={c.issuer} onChange={(ev) => set("certifications", updateAt(draft.certifications, i, { issuer: ev.target.value }))} placeholder="Issued by" />
                <input className={inp} value={c.year} onChange={(ev) => set("certifications", updateAt(draft.certifications, i, { year: ev.target.value }))} placeholder="Year" />
              </div>
            )))}

            {/* Skills + languages */}
            <div className="mt-6 space-y-1">
              <label className={lbl}>Skills (comma separated)</label>
              <input className={inp} value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="e.g. AutoCAD, Project Management" />
            </div>
            <div className="flex items-center justify-between mt-6 mb-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Languages</h4>
              <button onClick={() => set("languages", [...draft.languages, { name: "", level: "" }])} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200"><Plus size={11} /> Add</button>
            </div>
            {draft.languages.map((l, i) => rowShell(i, () => set("languages", removeAt(draft.languages, i)), (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
                <input className={inp} value={l.name} onChange={(ev) => set("languages", updateAt(draft.languages, i, { name: ev.target.value }))} placeholder="Language" />
                <input className={inp} value={l.level} onChange={(ev) => set("languages", updateAt(draft.languages, i, { level: ev.target.value }))} placeholder="Level" />
              </div>
            )))}

            {/* Custom sections — addable anywhere; reorder with the up/down arrows */}
            <div className="flex items-center justify-between mt-6 mb-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Extra Sections</h4>
              <button onClick={() => set("customSections", [...draft.customSections, { heading: "", body: "" }])} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200"><Plus size={11} /> Add section</button>
            </div>
            {draft.customSections.map((s, i) => rowShell(i, () => set("customSections", removeAt(draft.customSections, i)), (
              <div className="space-y-2 pr-6">
                <div className="flex items-center gap-2">
                  <div className="flex items-center">
                    <button disabled={i === 0} onClick={() => set("customSections", moveAt(draft.customSections, i, -1))} title="Move up" className="p-1 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ArrowUp size={12} /></button>
                    <button disabled={i === draft.customSections.length - 1} onClick={() => set("customSections", moveAt(draft.customSections, i, 1))} title="Move down" className="p-1 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ArrowDown size={12} /></button>
                  </div>
                  <input className={inp} value={s.heading} onChange={(ev) => set("customSections", updateAt(draft.customSections, i, { heading: ev.target.value }))} placeholder="Section heading (e.g. Awards)" />
                </div>
                <textarea rows={3} className={`${inp} resize-none`} value={s.body} onChange={(ev) => set("customSections", updateAt(draft.customSections, i, { body: ev.target.value }))} placeholder="Content…" />
              </div>
            )))}

            <div className="flex flex-wrap gap-3 mt-8">
              <button onClick={() => setEditorOpen(false)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
              <button onClick={() => setPreviewDraft(true)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 flex items-center justify-center gap-2"><Eye size={15} /> Preview</button>
              <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {editingId ? "Save resume" : "Create resume"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reuse-from-library picker */}
      {libOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div className={overlay} />
          <div className="relative bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-display font-bold text-slate-900">Reuse a resume</h3>
              <button onClick={() => setLibOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <div className="relative mb-4">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={libQuery}
                onChange={(e) => setLibQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void runLibSearch(); }}
                placeholder="Search by person, subcontractor, or title…"
                className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/10"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-slate-400 mb-3">Pick an existing resume to copy into <strong>{subcontractorName}</strong> — useful when the same person works across projects.</p>
            {libLoading ? (
              <div className="py-8 flex justify-center text-slate-300"><Loader2 size={18} className="animate-spin" /></div>
            ) : libResults.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">No resumes found.</p>
            ) : (
              <div className="space-y-1.5">
                {libResults.map((r) => (
                  <button key={r._id} onClick={() => reuse(r)} className="w-full flex items-center gap-2 p-2.5 bg-slate-50 hover:bg-primary/5 rounded-lg border border-slate-100 text-left transition-colors">
                    <FileText size={13} className="text-primary flex-shrink-0" />
                    <div className="min-w-0 flex-grow">
                      <p className="text-xs font-bold text-slate-800 truncate">{r.personName || "Untitled"}</p>
                      <p className="text-[10px] text-slate-400 truncate">{[r.subcontractorName, r.title].filter(Boolean).join(" · ")}</p>
                    </div>
                    <Plus size={13} className="text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview modal — renders the in-progress draft */}
      {previewDraft && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-6">
          <div className={overlay} />
          <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-display font-bold text-slate-900">Resume Preview</h3>
              <button onClick={() => setPreviewDraft(false)} className="text-xs font-bold text-slate-500 hover:text-slate-900">Close</button>
            </div>
            <div className="flex-grow">
              <PDFViewer width="100%" height="100%" showToolbar>
                <ResumePDF
                  resume={{ ...draft, skills: skillsText.split(",").map((s) => s.trim()).filter(Boolean) }}
                  person={{ name: draft.personName, email: draft.contact?.email, phone: draft.contact?.phone, avatarUrl: draft.photoUrl }}
                  logoUrl={`${window.location.origin}/gt-usa-logo-new.png`}
                />
              </PDFViewer>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete resume?"
        message={`Permanently remove ${deleteTarget?.personName || "this"}'s resume.`}
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
