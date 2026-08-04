import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { FileText, Plus, Trash2, Save, Loader2, Download, FolderPlus, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Eye } from "lucide-react";
import { PDFDownloadLink, PDFViewer, pdf } from "@react-pdf/renderer";
import {
  fetchMyResume, saveMyResume,
  fetchSavedResumes, saveResumeVersion, updateSavedResume, deleteSavedResume,
  ApiResume, ResumeSystemProject, ApiUser,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import ResumePDF from "./ResumePDF";
import SavedVersionsPanel from "./SavedVersionsPanel";

const EMPTY: ApiResume = {
  title: "", summary: "", citizenship: "",
  assignmentOnProject: "", yearsOfExperience: "", remark: "", showPhoto: true,
  contact: { email: "", phone: "", location: "" },
  photoUrl: "",
  experience: [], projects: [], education: [],
  skills: [], certifications: [], languages: [], customSections: [],
};

function moveAt<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-medium text-slate-700 focus:bg-white focus:ring-2 focus:ring-primary/10 outline-none transition-all";
const label = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";

function SectionHead({ title, onAdd, addLabel = "Add" }: { title: string; onAdd?: () => void; addLabel?: string }) {
  return (
    <div className="flex items-center justify-between mt-8 mb-3">
      <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">{title}</h3>
      {onAdd && (
        <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200">
          <Plus size={12} /> {addLabel}
        </button>
      )}
    </div>
  );
}

function updateAt<T>(list: T[], i: number, patch: Partial<NoInfer<T>>): T[] {
  return list.map((item, idx) => (idx === i ? { ...item, ...patch } : item));
}

function removeAt<T>(list: T[], i: number): T[] {
  return list.filter((_, idx) => idx !== i);
}

// Called as a function (not JSX) so the React key lands on an intrinsic <div>.
function rowShell(rowKey: number, onRemove: () => void, children: ReactNode) {
  return (
    <div key={rowKey} className="relative bg-slate-50/60 border border-slate-100 rounded-2xl p-4 mb-3">
      <button onClick={onRemove} title="Remove" className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-white">
        <Trash2 size={13} />
      </button>
      {children}
    </div>
  );
}

export default function ResumeBuilder({ me }: { me: ApiUser }) {
  const [resume, setResume] = useState<ApiResume>(EMPTY);
  const [systemProjects, setSystemProjects] = useState<ResumeSystemProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [skillsText, setSkillsText] = useState("");

  useEffect(() => {
    fetchMyResume()
      .then(({ resume: r, systemProjects: sp }) => {
        const merged = { ...EMPTY, ...r, contact: { ...EMPTY.contact, ...(r.contact || {}) } };
        setResume(merged);
        setSkillsText((merged.skills || []).join(", "));
        setSystemProjects(sp);
      })
      .catch(() => { /* keep empty resume */ })
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof ApiResume>(key: K, value: ApiResume[K]) =>
    setResume((r) => ({ ...r, [key]: value }));

  const addSystemProject = (sp: ResumeSystemProject) => {
    set("projects", [
      ...resume.projects,
      { name: sp.name, role: "", start: sp.startDate, end: sp.endDate, description: sp.category, projectId: sp.id },
    ]);
    toast(`Added "${sp.name}" to project experience.`, "success");
  };
  const unusedSystemProjects = systemProjects.filter(
    (sp) => !resume.projects.some((p) => p.projectId === sp.id)
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const skills = skillsText.split(",").map((s) => s.trim()).filter(Boolean);
      const toSave = { ...resume, skills };
      const saved = await saveMyResume(toSave);
      setResume({ ...EMPTY, ...saved, contact: { ...EMPTY.contact, ...(saved.contact || {}) } });
      toast("Resume saved.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save resume.", "error");
    } finally {
      setSaving(false);
    }
  };

  const hasContent = !!(resume.title || resume.summary || resume.experience.length || resume.projects.length || resume.education.length || resume.skills.length);
  const pdfResume = { ...resume, skills: skillsText.split(",").map((s) => s.trim()).filter(Boolean) };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-10"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2">
            <FileText size={20} className="text-primary" /> My Resume
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Build it once — download it as a branded PDF, and it's automatically included when you're named in a technical proposal.
          </p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-50">
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {loading && open && (
        <div className="flex items-center justify-center py-10 text-slate-300"><Loader2 size={22} className="animate-spin" /></div>
      )}

      {!loading && open && (
        <div className="mt-8">
          {/* Basics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <label className={label}>Job Title</label>
              <input className={inp} value={resume.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Senior Civil Engineer" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className={label}>Professional Summary</label>
              <textarea rows={3} className={`${inp} resize-none`} value={resume.summary} onChange={(e) => set("summary", e.target.value)} placeholder="A short paragraph about your experience and strengths…" />
            </div>
            <div className="space-y-2">
              <label className={label}>Contact Email</label>
              <input className={inp} value={resume.contact.email} onChange={(e) => set("contact", { ...resume.contact, email: e.target.value })} placeholder={me.email} />
            </div>
            <div className="space-y-2">
              <label className={label}>Contact Phone</label>
              <input className={inp} value={resume.contact.phone} onChange={(e) => set("contact", { ...resume.contact, phone: e.target.value })} placeholder={me.phone || "+1 (000) 000-0000"} />
            </div>
            <div className="space-y-2">
              <label className={label}>Location</label>
              <input className={inp} value={resume.contact.location} onChange={(e) => set("contact", { ...resume.contact, location: e.target.value })} placeholder="City, Country" />
            </div>
            <div className="space-y-2">
              <label className={label}>Citizenship / Residency</label>
              <input className={inp} value={resume.citizenship || ""} onChange={(e) => set("citizenship", e.target.value)} placeholder="e.g. U.S. Citizen" />
            </div>
            <div className="space-y-2">
              <label className={label}>Assignment on this project</label>
              <input className={inp} value={resume.assignmentOnProject || ""} onChange={(e) => set("assignmentOnProject", e.target.value)} placeholder="e.g. Project Manager" />
            </div>
            <div className="space-y-2">
              <label className={label}>Years of experience</label>
              <input className={inp} value={resume.yearsOfExperience || ""} onChange={(e) => set("yearsOfExperience", e.target.value)} placeholder="e.g. +19" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className={label}>Remark</label>
              <textarea rows={2} className={`${inp} resize-none`} value={resume.remark || ""} onChange={(e) => set("remark", e.target.value)} placeholder="e.g. U.S. Citizen, Subject Matter Expert (SME) of HVAC, WTP & WWTP O&M…" />
            </div>
          </div>
          <label className="flex items-center gap-2 mt-3 text-xs font-medium text-slate-600 cursor-pointer">
            <input type="checkbox" checked={resume.showPhoto !== false} onChange={(e) => set("showPhoto", e.target.checked)} className="rounded" />
            Include photo on the resume PDF
          </label>
          <p className="text-[10px] text-slate-400 mt-2">When the photo is enabled, your profile photo is used automatically. Email/phone fall back to your profile details if left empty.</p>

          {/* Work experience */}
          <SectionHead title="Other Professional Experience" onAdd={() => set("experience", [...resume.experience, { company: "", role: "", start: "", end: "", description: "" }])} />
          {resume.experience.length === 0 && <p className="text-xs text-slate-400 italic">Nothing yet — add your previous roles.</p>}
          {resume.experience.map((e, i) => rowShell(i, () => set("experience", removeAt(resume.experience, i)), (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-8">
                <input className={inp} value={e.role} onChange={(ev) => set("experience", updateAt(resume.experience, i, { role: ev.target.value }))} placeholder="Role / position" />
                <input className={inp} value={e.company} onChange={(ev) => set("experience", updateAt(resume.experience, i, { company: ev.target.value }))} placeholder="Company" />
                <input className={inp} value={e.start} onChange={(ev) => set("experience", updateAt(resume.experience, i, { start: ev.target.value }))} placeholder="Start (e.g. 2019)" />
                <input className={inp} value={e.end} onChange={(ev) => set("experience", updateAt(resume.experience, i, { end: ev.target.value }))} placeholder="End (or Present)" />
                <textarea rows={2} className={`${inp} resize-none md:col-span-2`} value={e.description} onChange={(ev) => set("experience", updateAt(resume.experience, i, { description: ev.target.value }))} placeholder="What you did there…" />
              </div>
          )))}

          {/* Project experience */}
          <SectionHead title="List of Relevant Projects" onAdd={() => set("projects", [...resume.projects, { name: "", role: "", start: "", end: "", description: "" }])} />
          {unusedSystemProjects.length > 0 && (
            <div className="mb-3 p-4 bg-primary/5 border border-primary/10 rounded-2xl">
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-1.5"><FolderPlus size={11} /> Company projects you're assigned to — click to add</p>
              <div className="flex flex-wrap gap-2">
                {unusedSystemProjects.map((sp) => (
                  <button key={sp.id} onClick={() => addSystemProject(sp)} className="px-3 py-1.5 rounded-lg bg-white border border-primary/20 text-xs font-bold text-slate-700 hover:bg-primary hover:text-white transition-colors">
                    + {sp.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {resume.projects.length === 0 && <p className="text-xs text-slate-400 italic">Nothing yet — add projects you worked on.</p>}
          {resume.projects.map((p, i) => rowShell(i, () => set("projects", removeAt(resume.projects, i)), (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-8">
                <input className={`${inp} md:col-span-2`} value={p.name} onChange={(ev) => set("projects", updateAt(resume.projects, i, { name: ev.target.value }))} placeholder="Project name" />
                <input className={inp} value={p.employer || ""} onChange={(ev) => set("projects", updateAt(resume.projects, i, { employer: ev.target.value }))} placeholder="Employer (e.g. GreenTech)" />
                <input className={inp} value={p.role} onChange={(ev) => set("projects", updateAt(resume.projects, i, { role: ev.target.value }))} placeholder="Your role on it" />
                <input className={inp} value={p.client || ""} onChange={(ev) => set("projects", updateAt(resume.projects, i, { client: ev.target.value }))} placeholder="Client (e.g. US Dept. of State)" />
                <input className={inp} value={p.cost || ""} onChange={(ev) => set("projects", updateAt(resume.projects, i, { cost: ev.target.value }))} placeholder="Cost (e.g. $246,451)" />
                <input className={inp} value={p.solicitationNo || ""} onChange={(ev) => set("projects", updateAt(resume.projects, i, { solicitationNo: ev.target.value }))} placeholder="Solicitation #" />
                <input className={inp} value={p.contractNo || ""} onChange={(ev) => set("projects", updateAt(resume.projects, i, { contractNo: ev.target.value }))} placeholder="Contract #" />
                <div className="flex gap-3">
                  <input className={inp} value={p.start} onChange={(ev) => set("projects", updateAt(resume.projects, i, { start: ev.target.value }))} placeholder="Start" />
                  <input className={inp} value={p.end} onChange={(ev) => set("projects", updateAt(resume.projects, i, { end: ev.target.value }))} placeholder="End" />
                </div>
                <textarea rows={2} className={`${inp} resize-none md:col-span-2`} value={p.description} onChange={(ev) => set("projects", updateAt(resume.projects, i, { description: ev.target.value }))} placeholder="Scope / description…" />
              </div>
              {p.projectId && <p className="text-[9px] font-bold text-primary uppercase tracking-widest mt-2">From company projects · {p.projectId}</p>}
            </>
          )))}

          {/* Education */}
          <SectionHead title="Education" onAdd={() => set("education", [...resume.education, { school: "", degree: "", field: "", start: "", end: "" }])} />
          {resume.education.length === 0 && <p className="text-xs text-slate-400 italic">Nothing yet — add your degrees.</p>}
          {resume.education.map((e, i) => rowShell(i, () => set("education", removeAt(resume.education, i)), (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-8">
                <input className={inp} value={e.degree} onChange={(ev) => set("education", updateAt(resume.education, i, { degree: ev.target.value }))} placeholder="Degree (e.g. BSc)" />
                <input className={inp} value={e.field} onChange={(ev) => set("education", updateAt(resume.education, i, { field: ev.target.value }))} placeholder="Field (e.g. Civil Engineering)" />
                <input className={`${inp} md:col-span-2`} value={e.school} onChange={(ev) => set("education", updateAt(resume.education, i, { school: ev.target.value }))} placeholder="School / university" />
                <input className={inp} value={e.start} onChange={(ev) => set("education", updateAt(resume.education, i, { start: ev.target.value }))} placeholder="Start year" />
                <input className={inp} value={e.end} onChange={(ev) => set("education", updateAt(resume.education, i, { end: ev.target.value }))} placeholder="End year" />
              </div>
          )))}

          {/* Skills */}
          <SectionHead title="Skills" />
          <input className={inp} value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="Comma separated — e.g. AutoCAD, Project Management, Hydrology" />

          {/* Certifications */}
          <SectionHead title="Certifications & Licenses" onAdd={() => set("certifications", [...resume.certifications, { name: "", issuer: "", year: "" }])} />
          {resume.certifications.length === 0 && <p className="text-xs text-slate-400 italic">Nothing yet.</p>}
          {resume.certifications.map((c, i) => rowShell(i, () => set("certifications", removeAt(resume.certifications, i)), (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-8">
                <input className={inp} value={c.name} onChange={(ev) => set("certifications", updateAt(resume.certifications, i, { name: ev.target.value }))} placeholder="Certification" />
                <input className={inp} value={c.issuer} onChange={(ev) => set("certifications", updateAt(resume.certifications, i, { issuer: ev.target.value }))} placeholder="Issued by" />
                <input className={inp} value={c.year} onChange={(ev) => set("certifications", updateAt(resume.certifications, i, { year: ev.target.value }))} placeholder="Year" />
              </div>
          )))}

          {/* Languages */}
          <SectionHead title="Languages" onAdd={() => set("languages", [...resume.languages, { name: "", level: "" }])} />
          {resume.languages.length === 0 && <p className="text-xs text-slate-400 italic">Nothing yet.</p>}
          {resume.languages.map((l, i) => rowShell(i, () => set("languages", removeAt(resume.languages, i)), (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-8">
                <input className={inp} value={l.name} onChange={(ev) => set("languages", updateAt(resume.languages, i, { name: ev.target.value }))} placeholder="Language" />
                <input className={inp} value={l.level} onChange={(ev) => set("languages", updateAt(resume.languages, i, { level: ev.target.value }))} placeholder="Level (e.g. Fluent)" />
              </div>
          )))}

          {/* Custom sections — addable anywhere; reorder with the up/down arrows */}
          <SectionHead title="Extra Sections" onAdd={() => set("customSections", [...resume.customSections, { heading: "", body: "" }])} addLabel="Add section" />
          {resume.customSections.length === 0 && <p className="text-xs text-slate-400 italic">Optional — e.g. Awards, Publications, Volunteering. Use ↑ ↓ to position them anywhere.</p>}
          {resume.customSections.map((s, i) => rowShell(i, () => set("customSections", removeAt(resume.customSections, i)), (
              <div className="space-y-3 pr-8">
                <div className="flex items-center gap-2">
                  <div className="flex items-center">
                    <button disabled={i === 0} onClick={() => set("customSections", moveAt(resume.customSections, i, -1))} title="Move up" className="p-1 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ArrowUp size={13} /></button>
                    <button disabled={i === resume.customSections.length - 1} onClick={() => set("customSections", moveAt(resume.customSections, i, 1))} title="Move down" className="p-1 rounded text-slate-400 hover:text-slate-900 disabled:opacity-20"><ArrowDown size={13} /></button>
                  </div>
                  <input className={inp} value={s.heading} onChange={(ev) => set("customSections", updateAt(resume.customSections, i, { heading: ev.target.value }))} placeholder="Section heading (e.g. Awards)" />
                </div>
                <textarea rows={3} className={`${inp} resize-none`} value={s.body} onChange={(ev) => set("customSections", updateAt(resume.customSections, i, { body: ev.target.value }))} placeholder="Content…" />
              </div>
          )))}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 mt-10">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-sm font-bold hover:bg-primary transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Resume
            </button>
            {hasContent && (
              <button onClick={() => setShowPreview(true)} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 rounded-2xl text-sm font-bold hover:bg-slate-200 transition-all">
                <Eye size={14} /> Preview
              </button>
            )}
            {hasContent && (
              <PDFDownloadLink
                document={
                  <ResumePDF
                    resume={pdfResume}
                    person={{ name: me.name, email: me.email, phone: me.phone, avatarUrl: me.avatarUrl }}
                    logoUrl={`${window.location.origin}/gt-usa-logo-new.png`}
                  />
                }
                fileName={`${(me.name || "resume").replace(/\s+/g, "_")}_Resume.pdf`}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gt-gradient text-white rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
              >
                {({ loading: pdfLoading }) => (
                  <>{pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download PDF</>
                )}
              </PDFDownloadLink>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-3 text-center">Only you and the admin can see your resume. Save before downloading so the PDF matches.</p>

          <div className="mt-6">
            <SavedVersionsPanel
              heading="Saved Resume Versions"
              subtitle="Freeze a PDF copy of your resume. Preview, print, or download any past version anytime."
              canEdit
              formats={[{
                label: "PDF", ext: "pdf", baseName: `${(me.name || "resume").replace(/\s+/g, "_")}_Resume`,
                build: () => pdf(<ResumePDF resume={pdfResume} person={{ name: me.name, email: me.email, phone: me.phone, avatarUrl: me.avatarUrl }} logoUrl={`${window.location.origin}/gt-usa-logo-new.png`} />).toBlob(),
              }]}
              fetchList={() => fetchSavedResumes()}
              saveVersion={(file, fileName, meta) => saveResumeVersion({ title: meta.title, status: meta.status }, file, fileName)}
              update={(docId, body) => updateSavedResume(docId, body)}
              remove={(docId) => deleteSavedResume(docId).then(() => {})}
              toast={toast}
            />
          </div>
        </div>
      )}

      {/* Preview modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div onClick={() => setShowPreview(false)} className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-display font-bold text-slate-900">Resume Preview</h3>
              <button onClick={() => setShowPreview(false)} className="text-xs font-bold text-slate-500 hover:text-slate-900">Close</button>
            </div>
            <div className="flex-grow">
              <PDFViewer width="100%" height="100%" showToolbar>
                <ResumePDF
                  resume={pdfResume}
                  person={{ name: me.name, email: me.email, phone: me.phone, avatarUrl: me.avatarUrl }}
                  logoUrl={`${window.location.origin}/gt-usa-logo-new.png`}
                />
              </PDFViewer>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
