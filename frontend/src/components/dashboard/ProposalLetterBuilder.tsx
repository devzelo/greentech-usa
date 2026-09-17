import { useEffect, useState } from "react";
import { PDFViewer } from "@react-pdf/renderer";
import { Eye, Plus, X } from "lucide-react";
import {
  fetchSignatories, fetchStamps, uploadProposalAsset, withFileToken,
  type ApiProject, type ApiSignatory, type CompanyFile, type ProposalCover, type ProposalCoverLetter, type ProposalLetterhead, type ProposalSignatory,
} from "../../lib/api";
import { letterDefaults } from "../../lib/proposalLetter";
import RichTextEditor from "./RichTextEditor";
import { COMPANY } from "../pdf/brand";
import { OpeningPagesDocument, defaultSubmitter } from "./ProposalPDF";

// CR-P (93) - the transmittal letter, laid out as on the client's samples: Date, To, Subject,
// Dear ..., the paragraphs, Sincerely, then the signature with the company seal and the signer's
// name, title, company, mobile and email. The header fills itself from the cover page.

const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
const card = "bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4";
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

type HeaderKey = "date" | "toName" | "toTitle" | "toOffice" | "toAgency" | "toAddress" | "subject" | "salutation" | "closing";
const HEADER_FIELDS: Array<{ key: HeaderKey; label: string; type?: string; wide?: boolean }> = [
  { key: "date", label: "Date", type: "date" },
  { key: "toName", label: "To (name)" },
  { key: "toTitle", label: "Title" },
  { key: "toOffice", label: "Office" },
  { key: "toAgency", label: "Agency / client" },
  { key: "toAddress", label: "Address / location" },
  { key: "subject", label: "Subject", wide: true },
  { key: "salutation", label: "Salutation" },
  { key: "closing", label: "Closing" },
];

const longDate = (s: string) => {
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

export default function ProposalLetterBuilder({
  projectId, project, cover, letter, onChange, canEdit, volume = "technical", letterhead, customLetterheadUrl,
}: {
  volume?: "technical" | "financial";
  letterhead?: ProposalLetterhead;
  customLetterheadUrl?: string;
  projectId: string;
  project: ApiProject;
  cover: ProposalCover;
  letter: ProposalCoverLetter;
  onChange: (next: ProposalCoverLetter) => void;
  canEdit: boolean;
}) {
  const [staff, setStaff] = useState<ApiSignatory[]>([]);
  const [preview, setPreview] = useState(false);
  const [stamps, setStamps] = useState<CompanyFile[]>([]);
  useEffect(() => {
    fetchSignatories().then(setStaff).catch(() => {});
    fetchStamps().then(setStamps).catch(() => {});
  }, []);

  const d = letterDefaults(cover, project);
  const set = <K extends keyof ProposalCoverLetter>(k: K, v: ProposalCoverLetter[K]) => onChange({ ...letter, [k]: v });

  // Seals: the company's (Company Documents, Stamps tab) and, on a JV, the partner's.
  const jv = project.jointVenture?.enabled ? project.jointVenture : undefined;
  const sealChoices = [
    ...stamps.map((s) => ({ name: s.name, url: s.url })),
    ...(jv?.stamps || []).map((s) => ({ name: `${jv?.partnerName || "Partner"}: ${s.name}`, url: s.url })),
  ];

  const addSignatory = (staffId: string) => {
    const s = staff.find((x) => x.id === staffId);
    if (!s) return;
    set("signatories", [...letter.signatories, { id: uid(), name: s.name, title: s.jobTitle || "", signatureUrl: s.signatureUrl || "", email: s.email || "", phone: s.phone || "" }]);
  };
  const updateSig = (sid: string, patch: Partial<ProposalSignatory>) => set("signatories", letter.signatories.map((s) => (s.id === sid ? { ...s, ...patch } : s)));

  // Item 105 - the standard transmittal letter, written from the cover page (and the JV's own
  // registration on a JV). Every word stays editable afterwards.
  const insertStandard = () => {
    if (letter.body.replace(/<[^>]*>/g, "").trim() && !window.confirm("Replace the letter body with the standard letter?")) return;
    const jvEntity = project.jointVenture?.enabled ? project.jointVenture : undefined;
    const firm = (cover.submittedBy || "").trim() || defaultSubmitter(project);
    const uei = jvEntity ? jvEntity.uei || "" : COMPANY.uei;
    const cage = jvEntity ? jvEntity.cage || "" : COMPANY.cage;
    const sol = (cover.solicitationNo || "").trim();
    const title = (cover.proposalTitle || project.name || "").trim();
    const where = (cover.location || "").trim();
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const paras = [
      `${firm} is pleased to submit the enclosed proposal ${sol ? `in response to Solicitation No. ${sol} ` : ""}for ${title}${where ? `, ${where}` : ""}.`,
      `${firm} is a U.S. contractor headquartered in Virginia with extensive experience in the design-build, construction, operation and maintenance of water, wastewater and building systems for the U.S. Department of State, USAID and other international clients. We have reviewed the solicitation, its amendments and all of its requirements, and our proposal responds to each of them.`,
      `Our offer remains valid for the period stated in the solicitation.${uei ? ` ${firm} is registered and active in SAM.gov (UEI ${uei}${cage ? `, CAGE ${cage}` : ""}).` : ""}`,
      "Should you need any clarification, please contact the undersigned. We appreciate the opportunity to be considered and look forward to working with you.",
    ];
    set("body", paras.map((p) => `<p>${esc(p)}</p>`).join(""));
  };
  const removeSig = (sid: string) => set("signatories", letter.signatories.filter((s) => s.id !== sid));

  return (
    <div className="space-y-6">
      <div className={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h4 className="font-bold text-slate-800 text-sm">Transmittal Letter</h4>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={letter.enabled} onChange={(e) => set("enabled", e.target.checked)} disabled={!canEdit} className="accent-emerald-600" />
              Include in the proposal
            </label>
            {/* CR 195 - which page the letter is. */}
            <select
              value={letter.position || "after-cover"}
              onChange={(e) => set("position", e.target.value as ProposalCoverLetter["position"])}
              disabled={!canEdit || !letter.enabled}
              aria-label="Letter position"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-50"
            >
              <option value="after-cover">Page 2, after the cover</option>
              <option value="before-cover">Page 1, before the cover</option>
            </select>
            <button type="button" onClick={() => setPreview(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200">
              <Eye size={12} /> Preview letter
            </button>
          </div>
        </div>
        {!letter.enabled && <p className="text-[11px] font-bold text-amber-600">Not included yet: tick "Include in the proposal" for the letter to print.</p>}
        {preview && (
          <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex flex-col" onClick={() => setPreview(false)}>
            <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display font-bold text-slate-900 text-sm">Preview: cover and transmittal letter ({letter.position === "before-cover" ? "letter first" : "letter after the cover"})</h3>
              <button type="button" onClick={() => setPreview(false)} aria-label="Close preview" className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><X size={16} /></button>
            </div>
            <div className="flex-1 bg-slate-200" onClick={(e) => e.stopPropagation()}>
              <PDFViewer width="100%" height="100%" showToolbar>
                <OpeningPagesDocument volume={volume} cover={cover} coverLetter={letter} project={project} letterhead={letterhead} customLetterheadUrl={customLetterheadUrl} logoUrl={`${window.location.origin}/gt-usa-logo-new.png`} />
              </PDFViewer>
            </div>
          </div>
        )}
        <p className="text-[11px] text-slate-500">
          The header fills itself from the <strong>Cover Page</strong>. Type in a box to change a line for this letter only; clear it to go back to the cover's value.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {HEADER_FIELDS.map((f) => {
            const id = `letter-${f.key}`;
            return (
              <div key={f.key} className={`space-y-1.5 ${f.wide ? "md:col-span-2" : ""}`}>
                <label htmlFor={id} className={lbl}>{f.label}</label>
                <input
                  id={id}
                  type={f.type || "text"}
                  value={letter[f.key] || ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  disabled={!canEdit}
                  placeholder={f.type === "date" ? "" : d[f.key]}
                  className={inp}
                />
                {f.type === "date" && !letter.date && <p className="text-[10px] text-slate-400">Empty: {longDate(d.date)} (the cover's submission date, else today)</p>}
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className={lbl}>Letter body</span>
            {canEdit && (
              <button type="button" onClick={insertStandard} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary/20">
                <Plus size={12} /> Insert the standard letter
              </button>
            )}
          </div>
          <RichTextEditor
            value={letter.body}
            onChange={(html) => set("body", html)}
            disabled={!canEdit}
            minHeight={220}
            placeholder="The letter's paragraphs: who you are, what is enclosed, why you are the right choice, and an offer to answer questions."
            onImageUpload={async (file) => (await uploadProposalAsset(projectId, file)).url}
          />
        </div>
      </div>

      <div className={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h4 className="font-bold text-slate-800 text-sm">Signed by</h4>
          {canEdit && (
            <select
              value=""
              onChange={(e) => { addSignatory(e.target.value); e.target.value = ""; }}
              className={`${inp} w-auto appearance-none`}
              aria-label="Add a signatory"
            >
              <option value="">+ Add signatory...</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.jobTitle ? ` · ${s.jobTitle}` : ""}</option>)}
            </select>
          )}
        </div>
        {letter.signatories.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic">No signatory yet. Add one: their signature image, title, email and phone come from their profile and can be edited here.</p>
        ) : (
          <div className="space-y-3">
            {letter.signatories.map((s) => (
              <div key={s.id} className="flex items-start gap-3 p-3 rounded-2xl border border-slate-100 bg-slate-50/50">
                <div className="w-24 h-14 shrink-0 rounded-lg bg-white border border-slate-100 flex items-center justify-center overflow-hidden">
                  {s.signatureUrl ? <img src={withFileToken(s.signatureUrl)} alt={`${s.name} signature`} className="max-h-12 max-w-full object-contain" /> : <span className="text-[9px] text-slate-400 text-center px-1">No signature on profile</span>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                  <input value={s.name} onChange={(e) => updateSig(s.id, { name: e.target.value })} disabled={!canEdit} placeholder="Name" aria-label="Signatory name" className={inp} />
                  <input value={s.title} onChange={(e) => updateSig(s.id, { title: e.target.value })} disabled={!canEdit} placeholder="Title, e.g. Director or JV Representative" aria-label="Signatory title" className={inp} />
                  <input value={s.phone || ""} onChange={(e) => updateSig(s.id, { phone: e.target.value })} disabled={!canEdit} placeholder="Mobile" aria-label="Signatory mobile" className={inp} />
                  <input value={s.email || ""} onChange={(e) => updateSig(s.id, { email: e.target.value })} disabled={!canEdit} placeholder="Email" aria-label="Signatory email" className={inp} />
                </div>
                {canEdit && <button onClick={() => removeSig(s.id)} aria-label={`Remove ${s.name}`} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500"><X size={14} /></button>}
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-slate-100 pt-4 space-y-2">
          <span className={lbl}>Company seal</span>
          {sealChoices.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic">No seals yet. Upload the company seal in Company Documents, under the Stamps tab.</p>
          ) : (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Company seal">
              <button
                type="button"
                role="radio"
                aria-checked={!letter.stampUrl}
                disabled={!canEdit}
                onClick={() => set("stampUrl", "")}
                className={`h-16 px-3 rounded-xl border text-[11px] font-bold ${!letter.stampUrl ? "border-primary ring-2 ring-primary/20 text-slate-800" : "border-slate-100 text-slate-400 hover:border-slate-300"}`}
              >
                None
              </button>
              {sealChoices.map((s) => {
                const on = letter.stampUrl === s.url;
                return (
                  <button
                    key={s.url}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!canEdit}
                    onClick={() => set("stampUrl", s.url)}
                    title={s.name}
                    className={`h-16 w-16 rounded-xl border bg-white p-1.5 ${on ? "border-primary ring-2 ring-primary/20" : "border-slate-100 hover:border-slate-300"}`}
                  >
                    <img src={withFileToken(s.url)} alt={s.name} className="w-full h-full object-contain" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {canEdit && letter.signatories.length === 0 && staff.length === 0 && (
        <p className="text-[11px] text-slate-400 flex items-center gap-1.5"><Plus size={12} /> Staff appear in the signatory list once they exist in User Management.</p>
      )}
    </div>
  );
}
