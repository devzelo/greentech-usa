import { useEffect, useRef, useState } from "react";
import { DirectoryPersonSelect, useDirectoryCompany } from "./DirectoryDetails";
import { Plus, Upload, Image as ImageIcon, X, Loader2, Eye, Save, RotateCcw, CheckCircle2, Wand2 } from "lucide-react";
import PdfFrame from "./PdfFrame";
import { fetchCompany, uploadProposalAsset, withFileToken, type ApiProject, type ProposalCover, type RfpDetails } from "../../lib/api";
import CompanyPicker from "./CompanyPicker";
import { toast } from "../../lib/toast";
import { COMPANY } from "../pdf/brand";
import { RESTRICTION_LEGEND, defaultSubmitter, CoverOnlyDocument } from "./ProposalPDF";

const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
const card = "bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4";

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// The three cover designs from the brand kit. The thumbnails are small sketches of each layout.
const GRAD_H = "linear-gradient(90deg, #10B981, #3B82F6)";
const GRAD_V = "linear-gradient(180deg, #10B981, #3B82F6)";
const COVER_STYLES: Array<{ id: NonNullable<ProposalCover["coverStyle"]>; label: string; hint: string }> = [
  { id: "hero", label: "Dark hero", hint: "Photo mosaic on dark. Uses up to 4 cover images." },
  { id: "formal", label: "Light formal", hint: "White page with detail cards. No photos." },
  { id: "panel", label: "Gradient panel", hint: "Brand gradient side panel and one photo." },
];
function CoverThumb({ id }: { id: string }) {
  if (id === "formal") return (
    <div className="w-full h-full bg-white flex flex-col">
      <div className="h-1" style={{ background: GRAD_H }} />
      <div className="px-1.5 pt-1.5"><div className="w-5 h-1.5 rounded-sm bg-slate-800" /></div>
      <div className="px-1.5 mt-3 space-y-0.5"><div className="w-8 h-1 rounded bg-slate-800" /><div className="w-6 h-1 rounded bg-slate-800" /></div>
      <div className="px-1.5 mt-2 grid grid-cols-2 gap-0.5"><div className="h-1.5 rounded-sm bg-slate-100 border-l border-emerald-500" /><div className="h-1.5 rounded-sm bg-slate-100 border-l border-emerald-500" /></div>
      <div className="mt-auto mx-1.5 mb-1.5 h-1.5 rounded-sm" style={{ background: GRAD_H }} />
    </div>
  );
  if (id === "panel") return (
    <div className="w-full h-full bg-white flex">
      <div className="w-2/5 h-full p-1 flex flex-col justify-between" style={{ background: GRAD_V }}><div className="w-3 h-1 rounded-sm bg-slate-800" /><div className="w-4 h-1 rounded bg-white/90" /></div>
      <div className="flex-1 p-1"><div className="h-4 rounded-sm bg-slate-300" /><div className="mt-2 space-y-0.5"><div className="h-0.5 bg-slate-200" /><div className="h-0.5 bg-slate-200" /><div className="h-0.5 bg-slate-200" /></div></div>
    </div>
  );
  return (
    <div className="w-full h-full bg-slate-900 flex flex-col">
      <div className="h-[45%] flex gap-px"><div className="w-3/5 bg-slate-500" /><div className="flex-1 flex flex-col gap-px"><div className="flex-1 bg-slate-400" /><div className="flex-1 bg-slate-500" /><div className="flex-1 bg-slate-400" /></div></div>
      <div className="px-1.5 mt-1.5 space-y-0.5"><div className="w-8 h-1 rounded bg-white" /><div className="w-6 h-1 rounded bg-white" /></div>
      <div className="mt-auto mx-1.5 mb-2 h-0.5" style={{ background: GRAD_H }} />
    </div>
  );
}

// Cover keys that hold text (the inputs below only ever write strings).
type TextCoverKey = { [K in keyof ProposalCover]-?: NonNullable<ProposalCover[K]> extends string ? K : never }[keyof ProposalCover];
type CoverFieldDef = { key: TextCoverKey; label: string; type?: string; placeholder?: string; list?: string[]; wide?: boolean };

const RESPONSE_OPTIONS = ["Response to Solicitation #", "Response to Request for Proposal", "Response to Request for Quotation", "Response to Invitation for Bid", "Response to Sources Sought"];
const REVISION_OPTIONS = ["Initial Proposal", "Revised Proposal", "Final Proposal Revision", "Best and Final Offer (BAFO)"];

// Grouped the way the client's sample covers read: what the document is, which solicitation it
// answers, who it is for, who to address, and who submits it.
const COVER_GROUPS: Array<{ title: string; fields: CoverFieldDef[] }> = [
  { title: "Document", fields: [
    { key: "proposalTitle", label: "Proposal Title", wide: true },
    { key: "volumeLabel", label: "Volume", placeholder: "e.g. Vol. II: Technical Proposal" },
    { key: "revisionLabel", label: "Revision", placeholder: "e.g. Final Proposal Revision", list: REVISION_OPTIONS },
  ] },
  { title: "Solicitation", fields: [
    { key: "responseLabel", label: "Response label", placeholder: "Response to Solicitation #", list: RESPONSE_OPTIONS },
    { key: "solicitationNo", label: "Solicitation Number", placeholder: "e.g. RFP# 19GE5025R0001" },
    { key: "taskOrderNo", label: "Task Order Number" },
    { key: "contractNo", label: "Contract Number" },
    { key: "dueDate", label: "Submittal Due Date", type: "date" },
    { key: "submissionDate", label: "Date of Submission", type: "date" },
  ] },
  { title: "Client", fields: [
    { key: "clientName", label: "Client Name" },
    { key: "location", label: "Location", placeholder: "e.g. U.S. Embassy Manila, Philippines" },
    { key: "projectName", label: "Project Name" },
    { key: "submittedTo", label: "Submitted To", placeholder: "e.g. Contracting Officer, RPSO Frankfurt" },
  ] },
  { title: "Attention", fields: [
    { key: "attentionTo", label: "Name", placeholder: "e.g. Ms. Joanna Catsamaki" },
    { key: "attentionRole", label: "Role", placeholder: "e.g. Contracting Specialist" },
    { key: "attentionEmail", label: "Email", type: "email" },
  ] },
  { title: "Submitted by", fields: [
    { key: "submittedBy", label: "Submitted By", wide: true },
  ] },
];

export default function ProposalCoverBuilder({
  projectId, project, cover, onCoverChange, canEdit, volume = "technical", onSave, onCancel, saving = false, rfp,
}: {
  /** CR 367 - the RFP details (due date, where it is submitted), which the cover follows. */
  rfp?: RfpDetails;
  projectId: string;
  project: ApiProject;
  cover: ProposalCover;
  onCoverChange: (next: ProposalCover) => void;
  canEdit: boolean;
  // Item 91 - the cover's own preview, Save (complete), Save as draft and Cancel.
  volume?: "technical" | "financial";
  onSave?: (status: "draft" | "complete") => void;
  onCancel?: () => void;
  saving?: boolean;
}) {
  const [preview, setPreview] = useState(false);
  // CR-P (91) — the project decides this, once. The cover follows it and keeps itself in step, so
  // a project switched to a joint venture later does not leave old proposals on a single logo.
  const isJvProject = !!project.jointVenture?.enabled;
  const jvProjectLogo = project.jointVenture?.logo || "";
  useEffect(() => {
    const wantMode = isJvProject ? "dual" : "single";
    const wantLogo = isJvProject ? (cover.jvLogoUrl || jvProjectLogo) : "";
    if (cover.logoMode !== wantMode || cover.jvLogoUrl !== wantLogo) {
      onCoverChange({ ...cover, logoMode: wantMode, jvLogoUrl: wantLogo });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJvProject, jvProjectLogo]);
  // CR 368 - the logos come from the Directory: the client's company, and the JV partner's, when the
  // cover has none of its own yet.
  const clientCompanyId = project.clientInfo?.companyId || "";
  const partnerCompanyId = project.jointVenture?.companyId || "";
  useEffect(() => {
    let live = true;
    void (async () => {
      const patch: Partial<ProposalCover> = {};
      if (!cover.clientLogoUrl && clientCompanyId) { const c = await fetchCompany(clientCompanyId).catch(() => null); if (c?.logoUrl) patch.clientLogoUrl = c.logoUrl; }
      if (isJvProject && !cover.jvLogoUrl && !jvProjectLogo && partnerCompanyId) { const c = await fetchCompany(partnerCompanyId).catch(() => null); if (c?.logoUrl) patch.jvLogoUrl = c.logoUrl; }
      // The JV mode is set again here: this lands after the mode sync above and would otherwise undo it.
      if (live && Object.keys(patch).length) onCoverChange({ ...cover, logoMode: isJvProject ? "dual" : "single", jvLogoUrl: patch.jvLogoUrl || (isJvProject ? cover.jvLogoUrl || jvProjectLogo : ""), ...patch });
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientCompanyId, partnerCompanyId, isJvProject]);

  const [uploading, setUploading] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);
  const jvInput = useRef<HTMLInputElement>(null);
  const clientLogoInput = useRef<HTMLInputElement>(null);

  const setCover = <K extends keyof ProposalCover>(k: K, v: ProposalCover[K]) => onCoverChange({ ...cover, [k]: v });
  // 2026-10-07 - the cover's client in the Directory (the project's client when the cover names none).
  const clientCo = useDirectoryCompany(
    cover.clientCompanyId || (!cover.clientName?.trim() ? project.clientInfo?.companyId : "") || "",
    cover.clientName?.trim() || project.clientInfo?.name || "", "client");
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
  // Item 105 - the standard cover (from the client's samples). Fills only what is empty.
  const applyStandard = () => {
    onCoverChange({
      ...cover,
      coverStyle: cover.coverStyle || "hero",
      responseLabel: cover.responseLabel || "Response to Solicitation #",
      revisionLabel: cover.revisionLabel || "Initial Proposal",
      volumeLabel: cover.volumeLabel || (volume === "financial" ? "Vol. II: Financial Proposal" : "Vol. I: Technical Proposal"),
      restrictionNotice: true,
      submittedBy: cover.submittedBy || defaultSubmitter(project),
      clientName: cover.clientName || project.clientInfo?.name || "",
      projectName: cover.projectName || project.name,
      // CR 367 - what the RFP details already say.
      dueDate: cover.dueDate || rfp?.dueDate || "",
      submittedTo: cover.submittedTo || (rfp?.submitTo && !/@|https?:/.test(rfp.submitTo) ? rfp.submitTo : "") || "",
      images: cover.images.length ? cover.images : galleryImages.slice(0, 4).map((g) => ({ id: uid(), url: g.url })),
    });
    toast("Standard cover applied. Empty fields were filled; nothing you typed was changed.", "success");
  };

  return (
    <div className="space-y-6">
      {/* ── Cover Page ───────────────────────────────────────────────── */}
      <div className={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-slate-800 text-sm">Cover Page</h4>
            {/* Item 91 - the cover has its own draft / complete status. */}
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${cover.status === "complete" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {cover.status === "complete" ? "Complete" : "Draft"}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && <button type="button" onClick={applyStandard} title="Fill the empty fields the way the standard cover reads" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary/20"><Wand2 size={12} /> Standard cover</button>}
            <button type="button" onClick={() => setPreview(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200"><Eye size={12} /> Preview cover</button>
            {canEdit && onCancel && <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-[11px] font-bold hover:text-slate-900"><RotateCcw size={12} /> Cancel</button>}
            {canEdit && onSave && <button type="button" onClick={() => onSave("draft")} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200 disabled:opacity-50">{saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save as draft</button>}
            {canEdit && onSave && <button type="button" onClick={() => onSave("complete")} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary disabled:opacity-50">{saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Save</button>}
          </div>
        </div>
        <p className="text-[10px] text-slate-400">This cover is specific to this document. "Save" marks it complete, "Save as draft" keeps it a draft; both save the workspace. Cancel goes back to the last saved cover.</p>
        {preview && (
          <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex flex-col" onClick={() => setPreview(false)}>
            <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display font-bold text-slate-900 text-sm">Preview: {volume === "financial" ? "Financial" : "Technical"} Proposal cover</h3>
              <button type="button" onClick={() => setPreview(false)} aria-label="Close preview" className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><X size={16} /></button>
            </div>
            <div className="flex-1 bg-slate-200" onClick={(e) => e.stopPropagation()}>
              <PdfFrame><CoverOnlyDocument volume={volume} cover={cover} project={project} /></PdfFrame>
            </div>
          </div>
        )}

        {/* Cover design, from the brand kit. The data below fills whichever style is chosen. */}
        <div className="space-y-2">
          <label className={lbl}>Cover style</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Cover style">
            {COVER_STYLES.map((s) => {
              const on = (cover.coverStyle || "hero") === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!canEdit}
                  onClick={() => setCover("coverStyle", s.id)}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl border text-left transition-all disabled:opacity-60 ${on ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "border-slate-100 hover:border-slate-300 bg-white"}`}
                >
                  <span className="w-12 h-16 shrink-0 rounded-md overflow-hidden border border-slate-200 shadow-sm"><CoverThumb id={s.id} /></span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-800">{s.label}</span>
                    <span className="block text-[10px] text-slate-500 leading-snug">{s.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {COVER_GROUPS.map((g) => (
          <div key={g.title} className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-[11px] font-bold text-slate-700">{g.title}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {g.fields.map((f) => {
                const id = `cover-${f.key}`;
                const placeholder = f.key === "projectName" ? project.name
                  : f.key === "clientName" ? (project.clientInfo?.name || "")
                  : f.key === "dueDate" ? (rfp?.dueDate || "")
                  : f.key === "submittedTo" && rfp?.submitTo ? `From the RFP: ${rfp.submitTo}`
                  : f.key === "submittedBy" ? defaultSubmitter(project)
                  : (f.placeholder || "");
                // CR 367 - the client is picked from the Directory; its logo comes with it.
                if (f.key === "clientName") return (
                  <div key={f.key} className="space-y-1.5">
                    <span className={lbl}>{f.label} (from the Directory)</span>
                    {canEdit ? (
                      <CompanyPicker size="sm" value={cover.clientName || ""} category="client"
                        onNameChange={(v) => onCoverChange({ ...cover, clientName: v, clientCompanyId: v === cover.clientName ? cover.clientCompanyId : "" })}
                        onSelectCompany={(c) => onCoverChange({ ...cover, clientName: c.name, clientCompanyId: c._id, ...(c.logoUrl ? { clientLogoUrl: c.logoUrl } : {}) })}
                        placeholder={placeholder || "Search the Directory"} />
                    ) : <input id={id} value={cover.clientName || ""} disabled placeholder={placeholder} className={inp} />}
                  </div>
                );
                // 2026-10-07 - the Attention is one of the client's people in the Directory; the role
                // and email come with the person chosen.
                if (f.key === "attentionTo") return (
                  <div key={f.key} className="space-y-1.5">
                    <span className={lbl}>{f.label} (the client's people)</span>
                    {canEdit
                      ? <DirectoryPersonSelect company={clientCo} value={cover.attentionTo || ""} placeholder="Choose the client's contact"
                          onPick={(p) => onCoverChange({ ...cover, attentionTo: p?.name || "", attentionRole: p?.role || "", attentionEmail: p?.email || "" })} />
                      : <input id={id} value={cover.attentionTo || ""} disabled className={inp} />}
                  </div>
                );
                if (f.key === "attentionRole" || f.key === "attentionEmail") return (
                  <div key={f.key} className="space-y-1.5">
                    <label htmlFor={id} className={lbl}>{f.label}</label>
                    <input id={id} value={(cover[f.key] as string | undefined) || ""} readOnly disabled title="From the person chosen in the Directory" className={inp} />
                  </div>
                );
                return (
                  <div key={f.key} className={`space-y-1.5 ${f.wide ? "md:col-span-2" : ""}`}>
                    <label htmlFor={id} className={lbl}>{f.label}</label>
                    <input
                      id={id}
                      type={f.type || "text"}
                      list={f.list ? `${id}-list` : undefined}
                      value={(cover[f.key] as string | undefined) || ""}
                      onChange={(e) => setCover(f.key, e.target.value as ProposalCover[typeof f.key])}
                      disabled={!canEdit}
                      placeholder={placeholder}
                      className={inp}
                    />
                    {f.list && <datalist id={`${id}-list`}>{f.list.map((o) => <option key={o} value={o} />)}</datalist>}
                  </div>
                );
              })}
            </div>

            {g.title === "Document" && (
              <div className="space-y-1.5">
                <label htmlFor="cover-subtitle" className={lbl}>Subtitle</label>
                <textarea
                  id="cover-subtitle"
                  value={cover.subtitle || ""}
                  onChange={(e) => setCover("subtitle", e.target.value)}
                  disabled={!canEdit}
                  rows={2}
                  placeholder="One or two lines under the title, e.g. Design and construction of wastewater treatment upgrades at the Chancery."
                  className={`${inp} resize-y`}
                />
              </div>
            )}

            {/* The client's seal or logo, printed opposite ours on the cover (the samples show the agency seal). */}
            {g.title === "Client" && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className={lbl}>Client logo or seal</span>
                {cover.clientLogoUrl ? (
                  <div className="relative">
                    <img src={withFileToken(cover.clientLogoUrl)} alt="Client logo" className="h-12 w-auto object-contain rounded-lg border border-slate-100 bg-white p-1" />
                    {canEdit && <button onClick={() => setCover("clientLogoUrl", "")} aria-label="Remove client logo" className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow text-slate-400 hover:text-red-500"><X size={12} /></button>}
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-400 italic">None yet.</span>
                )}
                {canEdit && (
                  <button onClick={() => clientLogoInput.current?.click()} disabled={uploading === "client-logo"} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200">
                    {uploading === "client-logo" ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload
                  </button>
                )}
                <input ref={clientLogoInput} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const u = await doUpload(f, "client-logo"); if (u) setCover("clientLogoUrl", u); } e.target.value = ""; }} />
              </div>
            )}

            {/* Contact details print automatically, so they are never retyped (or mistyped) per proposal. */}
            {g.title === "Submitted by" && (
              <>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-[11px] text-slate-600 space-y-1">
                  <p className="font-bold text-slate-700">Printed on the cover automatically</p>
                  <p>{COMPANY.name}: {COMPANY.phone} · {COMPANY.email} · {COMPANY.website} · UEI {COMPANY.uei} · CAGE {COMPANY.cage}</p>
                  {isJvProject && (
                    <p>
                      {project.jointVenture?.partnerName || "JV partner"}: {[project.jointVenture?.phone, project.jointVenture?.email, project.jointVenture?.partnerAddress].filter(Boolean).join(" · ") || "no contact details yet"}
                      <span className="text-slate-400"> (from Project Identity)</span>
                    </p>
                  )}
                </div>
                <label className="flex items-start gap-2 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={cover.restrictionNotice !== false} onChange={(e) => setCover("restrictionNotice", e.target.checked)} disabled={!canEdit} className="accent-emerald-600 mt-0.5" />
                  <span>
                    Print the data-restriction notice on the cover
                    <span className="block font-normal text-slate-400">"{RESTRICTION_LEGEND}"</span>
                  </span>
                </label>
              </>
            )}
          </div>
        ))}

        {/* Logos — CR-P (91): whether this is a joint venture is decided ONCE, when the project is
            created, so the cover must not ask again: "this project, we're going to choose it at the
            beginning, whether it's joint venture or not... so it's not a question here." The mode is
            read from the project, and the partner logo comes from the project's JV partner (which
            itself comes from the Directory), so nothing is re-uploaded per proposal. */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <label className={lbl}>Logo</label>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold">
              {isJvProject ? `Joint venture${project.jointVenture?.partnerName ? ` with ${project.jointVenture.partnerName}` : ""} — both logos` : "GreenTech only"}
            </span>
            <span className="text-[10px] text-slate-400 italic">Set in Project Identity, not here.</span>
          </div>
          {/* CR 368 - a JV project's cover shows the partner's logo: this cover's own, else the JV's. */}
          {isJvProject && (
            <div className="flex items-center gap-3">
              {cover.jvLogoUrl || jvProjectLogo ? (
                <div className="relative">
                  <img src={withFileToken(cover.jvLogoUrl || jvProjectLogo)} alt="Partner logo" className="h-12 w-auto object-contain rounded-lg border border-slate-100 bg-white p-1" />
                  {canEdit && !!cover.jvLogoUrl && <button onClick={() => setCover("jvLogoUrl", "")} title="Use the JV's own logo again" className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow text-slate-400 hover:text-red-500"><X size={12} /></button>}
                  {!cover.jvLogoUrl && <span className="mt-0.5 block text-[10px] text-slate-400">From the JV (Project Identity)</span>}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">No partner logo yet: add it to the JV in Project Identity, or upload one for this cover.</p>
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
                  <img src={withFileToken(im.url)} alt="" className="w-full h-full object-cover" />
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
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
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
                    <img src={withFileToken(g.url)} alt="" className="w-full h-full object-cover" />
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
