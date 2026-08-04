import { useRef, useState } from "react";
import { Plus, Upload, Image as ImageIcon, X, Loader2 } from "lucide-react";
import { uploadProposalAsset, type ApiProject, type ProposalCover } from "../../lib/api";
import { toast } from "../../lib/toast";

const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
const card = "bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4";

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const COVER_FIELDS: Array<{ key: keyof ProposalCover; label: string; type?: string }> = [
  { key: "proposalTitle", label: "Proposal Title" },
  { key: "projectName", label: "Project Name" },
  { key: "solicitationNo", label: "Solicitation Number" },
  { key: "taskOrderNo", label: "Task Order Number" },
  { key: "contractNo", label: "Contract Number" },
  { key: "clientName", label: "Client Name" },
  { key: "dueDate", label: "Proposal Due Date", type: "date" },
  { key: "submissionDate", label: "Date of Submission", type: "date" },
  { key: "submittedTo", label: "Submitted To" },
  { key: "attentionTo", label: "Attention To" },
  { key: "submittedBy", label: "Submitted By" },
];

export default function ProposalCoverBuilder({
  projectId, project, cover, onCoverChange, canEdit,
}: {
  projectId: string;
  project: ApiProject;
  cover: ProposalCover;
  onCoverChange: (next: ProposalCover) => void;
  canEdit: boolean;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);
  const jvInput = useRef<HTMLInputElement>(null);

  const setCover = <K extends keyof ProposalCover>(k: K, v: ProposalCover[K]) => onCoverChange({ ...cover, [k]: v });
  const galleryImages = (project.gallery || []).filter((g) => g.type === "image");

  const doUpload = async (file: File, slot: string): Promise<string | null> => {
    setUploading(slot);
    try {
      const { url } = await uploadProposalAsset(projectId, file);
      return url;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed.", "error");
      return null;
    } finally { setUploading(null); }
  };

  const addUploadedCoverImage = async (file: File) => {
    const url = await doUpload(file, "cover-image");
    if (url) setCover("images", [...cover.images, { id: uid(), url }]);
  };
  const addGalleryImage = (url: string) => {
    if (cover.images.some((im) => im.url === url)) { toast("Already added.", "info"); return; }
    setCover("images", [...cover.images, { id: uid(), url }]);
    setGalleryOpen(false);
  };
  const removeCoverImage = (imgId: string) => setCover("images", cover.images.filter((im) => im.id !== imgId));

  return (
    <div className="space-y-6">
      {/* ── Cover Page ───────────────────────────────────────────────── */}
      <div className={card}>
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-slate-800 text-sm">Cover Page</h4>
          <span className="text-[10px] text-slate-400">This cover is specific to this document</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {COVER_FIELDS.map((f) => (
            <div key={String(f.key)} className="space-y-1.5">
              <label className={lbl}>{f.label}</label>
              <input
                type={f.type || "text"}
                value={(cover[f.key] as string) || ""}
                onChange={(e) => setCover(f.key, e.target.value as ProposalCover[typeof f.key])}
                disabled={!canEdit}
                placeholder={f.key === "projectName" ? project.name : f.key === "clientName" ? (project.clientInfo?.name || "") : ""}
                className={inp}
              />
            </div>
          ))}
        </div>

        {/* Logos */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <label className={lbl}>Logo</label>
          <div className="flex flex-wrap items-center gap-2">
            {(["single", "dual"] as const).map((m) => (
              <button
                key={m}
                onClick={() => canEdit && setCover("logoMode", m)}
                disabled={!canEdit}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${cover.logoMode === m ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              >
                {m === "single" ? "GreenTech only" : "Joint Venture (dual)"}
              </button>
            ))}
          </div>
          {cover.logoMode === "dual" && (
            <div className="flex items-center gap-3">
              {cover.jvLogoUrl ? (
                <div className="relative">
                  <img src={cover.jvLogoUrl} alt="JV logo" className="h-12 w-auto object-contain rounded-lg border border-slate-100 bg-white p-1" />
                  {canEdit && <button onClick={() => setCover("jvLogoUrl", "")} className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow text-slate-400 hover:text-red-500"><X size={12} /></button>}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">No partner logo yet.</p>
              )}
              {canEdit && (
                <button onClick={() => jvInput.current?.click()} disabled={uploading === "jv"} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200">
                  {uploading === "jv" ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload partner logo
                </button>
              )}
              <input ref={jvInput} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const u = await doUpload(f, "jv"); if (u) setCover("jvLogoUrl", u); } e.target.value = ""; }} />
            </div>
          )}
        </div>

        {/* Cover images */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className={lbl}>Cover Images (3–4 recommended)</label>
            {canEdit && (
              <div className="flex gap-2">
                <button onClick={() => setGalleryOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-bold hover:bg-indigo-100"><ImageIcon size={12} /> From project gallery</button>
                <button onClick={() => imgInput.current?.click()} disabled={uploading === "cover-image"} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200">{uploading === "cover-image" ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload</button>
                <input ref={imgInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addUploadedCoverImage(f); e.target.value = ""; }} />
              </div>
            )}
          </div>
          {cover.images.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic">No cover images yet. They appear on the proposal cover, and can be changed per proposal.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {cover.images.map((im) => (
                <div key={im.id} className="relative w-28 h-20 rounded-xl overflow-hidden border border-slate-100 bg-slate-50">
                  <img src={im.url} alt="" className="w-full h-full object-cover" />
                  {canEdit && <button onClick={() => removeCoverImage(im.id)} className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 text-slate-500 hover:text-red-500"><X size={12} /></button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Gallery picker modal */}
      {galleryOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div onClick={() => setGalleryOpen(false)} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-[2rem] p-8 w-full max-w-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-display font-bold text-slate-900">Pick from project gallery</h3>
              <button onClick={() => setGalleryOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            {galleryImages.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-6 text-center">No images in this project's gallery yet. Upload images in the project gallery first, or use “Upload”.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {galleryImages.map((g, i) => (
                  <button key={i} onClick={() => addGalleryImage(g.url)} className="relative aspect-video rounded-xl overflow-hidden border border-slate-100 hover:ring-4 hover:ring-primary/20 transition-all">
                    <img src={g.url} alt="" className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 right-1 bg-white/90 rounded-full p-1 text-primary"><Plus size={12} /></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
