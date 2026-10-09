import { useEffect, useState } from "react";
import SignaturePicker from "./SignaturePicker";
import PhoneInput from "./PhoneInput";
import PdfFrame from "./PdfFrame";
import DOMPurify from "dompurify";
import { Check, Eye, Loader2, Pencil, Plus, Undo2, X } from "lucide-react";
import {
  fetchSignatories, uploadProposalAsset, withFileToken,
  type ApiProject, type ApiSignatory, type ProposalCover, type ProposalCoverLetter, type ProposalLetterhead, type ProposalSignatory,
} from "../../lib/api";
import { letterDefaults } from "../../lib/proposalLetter";
import RichTextEditor from "./RichTextEditor";
import { COMPANY } from "../pdf/brand";
import { OpeningPagesDocument, defaultSubmitter } from "./ProposalPDF";
import { DirectoryPersonSelect, useDirectoryCompany } from "./DirectoryDetails";
import StampPicker from "./StampPicker";

// CR-P (93) - the cover letter (CR 358, was "transmittal letter"), laid out as on the client's samples: Date, To, Subject,
// Dear ..., the paragraphs, Sincerely, then the signature with the company seal and the signer's
// name, title, company, mobile and email. The header fills itself from the cover page.

// 2026-10-06 - compact: smaller boxes, four to a row, less padding.
const inp = "w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
const lbl = "text-[9px] font-bold text-slate-400 uppercase tracking-widest";
const card = "bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3";
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

type HeaderKey = "date" | "toName" | "toTitle" | "toOffice" | "toAgency" | "toAddress" | "subject" | "salutation" | "closing";
const HEADER_FIELDS: Array<{ key: HeaderKey; label: string; type?: string; span?: string }> = [
  { key: "date", label: "Date", type: "date" },
  { key: "toName", label: "To (name)" },
  { key: "toTitle", label: "Title" },
  { key: "toOffice", label: "Office" },
  { key: "toAgency", label: "Agency / client" },
  { key: "toAddress", label: "Address / location", span: "col-span-2 md:col-span-3" },
  { key: "subject", label: "Subject", span: "col-span-2 md:col-span-4" },
  { key: "salutation", label: "Salutation", span: "col-span-2" },
  { key: "closing", label: "Closing", span: "col-span-2" },
];

const longDate = (s: string) => {
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

export default function ProposalLetterBuilder({
  projectId, project, cover, letter, onChange, canEdit, volume = "technical", letterhead, customLetterheadUrl, onSave,
}: {
  /** 2026-10-06 - Save: the proposal is saved and the letter goes back to its read view. */
  onSave?: () => Promise<unknown> | void;
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
  // 2026-10-06 - read view by default; Edit opens the form, Save keeps it, Cancel puts it back.
  const [editing, setEditing] = useState(false);
  const [before, setBefore] = useState<ProposalCoverLetter | null>(null);
  const [saving, setSaving] = useState(false);
  const startEdit = () => { setBefore(letter); setEditing(true); };
  const cancelEdit = () => { if (before) onChange(before); setEditing(false); };
  const save = async () => { setSaving(true); try { await onSave?.(); setEditing(false); } finally { setSaving(false); } };
  const edit = canEdit && editing;
  useEffect(() => {
    fetchSignatories().then(setStaff).catch(() => {});
  }, []);

  const d = letterDefaults(cover, project);
  // 2026-10-07 - the letter goes to one of the client's people in the Directory (the cover's client).
  const clientCo = useDirectoryCompany(
    cover.clientCompanyId || (!cover.clientName?.trim() ? project.clientInfo?.companyId : "") || "",
    cover.clientName?.trim() || project.clientInfo?.name || "", "client");
  const set = <K extends keyof ProposalCoverLetter>(k: K, v: ProposalCoverLetter[K]) => onChange({ ...letter, [k]: v });

  // Seals: the company's (Company Documents, Stamps tab) and, on a JV, the partner's.
  const jv = project.jointVenture?.enabled ? project.jointVenture : undefined;
  const partnerStamps = (jv?.stamps || []).map((s) => ({ name: `${jv?.partnerName || "Partner"}: ${s.name}`, url: s.url, note: "JV partner" }));

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

  const shown = (k: HeaderKey) => (letter[k] || "").trim() || d[k] || "";
  const toLines = [shown("toName"), shown("toTitle"), shown("toOffice"), shown("toAgency"), shown("toAddress")].filter(Boolean);
  const bodyEmpty = !letter.body.replace(/<[^>]*>/g, "").trim();

  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-slate-800 text-sm">Cover Letter</h4>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${letter.enabled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{letter.enabled ? (letter.position === "before-cover" ? "Included · page 1" : "Included · page 2") : "Not included"}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {edit && (
              <>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={letter.enabled} onChange={(e) => set("enabled", e.target.checked)} className="accent-emerald-600" />
                  Include
                </label>
                {/* CR 195 - which page the letter is. */}
                <select value={letter.position || "after-cover"} onChange={(e) => set("position", e.target.value as ProposalCoverLetter["position"])} disabled={!letter.enabled} aria-label="Letter position"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-50">
                  <option value="after-cover">Page 2, after the cover</option>
                  <option value="before-cover">Page 1, before the cover</option>
                </select>
              </>
            )}
            <button type="button" onClick={() => setPreview(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200"><Eye size={12} /> Preview</button>
            {canEdit && !editing && <button type="button" onClick={startEdit} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Pencil size={12} /> Edit</button>}
            {edit && (
              <>
                <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-50"><Undo2 size={12} /> Cancel</button>
                <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-60">{saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save</button>
              </>
            )}
          </div>
        </div>
        {preview && (
          <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex flex-col" onClick={() => setPreview(false)}>
            <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display font-bold text-slate-900 text-sm">Preview: cover page and cover letter ({letter.position === "before-cover" ? "letter first" : "letter after the cover"})</h3>
              <button type="button" onClick={() => setPreview(false)} aria-label="Close preview" className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><X size={16} /></button>
            </div>
            <div className="flex-1 bg-slate-200" onClick={(e) => e.stopPropagation()}>
              <PdfFrame>
                <OpeningPagesDocument volume={volume} cover={cover} coverLetter={letter} project={project} letterhead={letterhead} customLetterheadUrl={customLetterheadUrl} logoUrl={`${window.location.origin}/gt-usa-logo-new.png`} />
              </PdfFrame>
            </div>
          </div>
        )}

        {!edit ? (
          /* Read view: the letter as it prints, in a few lines. */
          <div className="grid grid-cols-1 gap-3 text-xs text-slate-700 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <dl className="space-y-1.5 rounded-xl bg-slate-50 px-3 py-2.5">
              <div><dt className={lbl}>Date</dt><dd className="font-semibold">{longDate(shown("date"))}</dd></div>
              <div><dt className={lbl}>To</dt><dd className="font-semibold leading-snug">{toLines.length ? toLines.map((l, i) => <span key={i} className="block">{l}</span>) : <span className="text-slate-400">Not set</span>}</dd></div>
              <div><dt className={lbl}>Signed by</dt><dd className="font-semibold">{letter.signatories.length ? letter.signatories.map((x) => `${x.name}${x.title ? `, ${x.title}` : ""}`).join("; ") : <span className="text-amber-600">No signatory yet</span>}</dd></div>
            </dl>
            <div className="min-w-0 space-y-1.5">
              <p><span className={lbl}>Subject </span><span className="font-semibold">{shown("subject") || <span className="text-slate-400">Not set</span>}</span></p>
              <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
                <p className="mb-1">{shown("salutation")}</p>
                {bodyEmpty ? <p className="italic text-slate-400">No letter body yet.{canEdit ? " Edit, then Insert the standard letter." : ""}</p> : <div className="[&_p]:mb-1.5" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(letter.body, { USE_PROFILES: { html: true } }) }} />}
                <p className="mt-1">{shown("closing")}</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[10px] text-slate-400">The header fills itself from the <strong>Cover Page</strong>; type in a box to change a line for this letter only, clear it to go back.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {HEADER_FIELDS.map((f) => {
                const id = `letter-${f.key}`;
                // 2026-10-07 - who it goes to is one of the client's people; their title, the agency
                // (the client) and its address come from the Directory, not typed.
                if (f.key === "toName") return (
                  <div key={f.key} className={`space-y-0.5 ${f.span || ""}`}>
                    <span className={lbl}>{f.label}</span>
                    <DirectoryPersonSelect company={clientCo} value={letter.toName || ""} placeholder={d.toName ? `As on the cover: ${d.toName}` : "The client's contact"}
                      onPick={(p) => onChange({ ...letter, toName: p?.name || "", toTitle: p?.role || "", ...(p && clientCo?.address ? { toAddress: clientCo.address } : {}) })} />
                  </div>
                );
                if (f.key === "toTitle" || f.key === "toAgency" || f.key === "toAddress") return (
                  <div key={f.key} className={`space-y-0.5 ${f.span || ""}`}>
                    <label htmlFor={id} className={lbl}>{f.label}</label>
                    <input id={id} value={(f.key === "toAgency" ? d.toAgency : letter[f.key] || d[f.key]) || ""} readOnly disabled title="From the Directory (the client and the person chosen)" className={inp} />
                  </div>
                );
                return (
                  <div key={f.key} className={`space-y-0.5 ${f.span || ""}`}>
                    <label htmlFor={id} className={lbl}>{f.label}</label>
                    <input id={id} type={f.type || "text"} value={letter[f.key] || ""} onChange={(e) => set(f.key, e.target.value)}
                      placeholder={f.type === "date" ? "" : d[f.key]} title={f.type === "date" && !letter.date ? `Empty: ${longDate(d.date)} (the cover's submission date, else today)` : undefined} className={inp} />
                  </div>
                );
              })}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className={lbl}>Letter body</span>
                <button type="button" onClick={insertStandard} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20"><Plus size={11} /> Insert the standard letter</button>
              </div>
              <RichTextEditor
                value={letter.body}
                onChange={(html) => set("body", html)}
                minHeight={160}
                placeholder="The letter's paragraphs: who you are, what is enclosed, why you are the right choice, and an offer to answer questions."
                onImageUpload={async (file) => (await uploadProposalAsset(projectId, file)).url}
              />
            </div>
            {/* Signed by and the seal, in the same card. */}
            <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={lbl}>Signed by</span>
                  <SignaturePicker mode="add" placeholder="Add signatory" ariaLabel="Add a signatory"
                    onPick={(p) => { if (p) set("signatories", [...letter.signatories, { id: uid(), name: p.name || "", title: p.title || "", signatureUrl: p.signatureUrl, email: p.email || "", phone: p.phone || "" }]); }} />
                </div>
                {letter.signatories.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">No signatory yet: their signature, title, email and phone come from their profile.</p>
                ) : letter.signatories.map((x) => (
                  <div key={x.id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-1.5">
                    <div className="w-16 h-9 shrink-0 rounded-md bg-white border border-slate-100 flex items-center justify-center overflow-hidden">
                      {x.signatureUrl ? <img src={withFileToken(x.signatureUrl)} alt={`${x.name} signature`} className="max-h-8 max-w-full object-contain" /> : <span className="text-[8px] text-slate-400 text-center px-1">No signature</span>}
                    </div>
                    <div className="grid flex-1 grid-cols-2 gap-1.5 md:grid-cols-4">
                      <input value={x.name} onChange={(e) => updateSig(x.id, { name: e.target.value })} placeholder="Name" aria-label="Signatory name" className={inp} />
                      <input value={x.title} onChange={(e) => updateSig(x.id, { title: e.target.value })} placeholder="Title" aria-label="Signatory title" className={inp} />
                      <PhoneInput value={x.phone || ""} onChange={(v) => updateSig(x.id, { phone: v })} placeholder="Mobile" aria-label="Signatory mobile" className={inp} />
                      <input value={x.email || ""} onChange={(e) => updateSig(x.id, { email: e.target.value })} placeholder="Email" aria-label="Signatory email" className={inp} />
                    </div>
                    <button onClick={() => removeSig(x.id)} aria-label={`Remove ${x.name}`} className="p-1 rounded-lg text-slate-300 hover:text-red-500"><X size={13} /></button>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <span className={lbl}>Company seal</span>
                {/* 2026-10-07 - one seal, from the Stamps folder (or the JV partner's), like the signature. */}
                <StampPicker value={letter.stampUrl || ""} onChange={(v) => set("stampUrl", v)} extra={partnerStamps} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
