import { useEffect, useState, type ReactNode } from "react";
import { fileName } from "../../lib/fileNames";
import { pdf } from "@react-pdf/renderer";
import PdfFrame from "./PdfFrame";
import { Eye, Download, RotateCcw, Plus, Trash2, X, Loader2, FileText, ChevronDown, ChevronRight, Check, PenLine } from "lucide-react";
import { fetchSigners, fetchStamps, withFileToken, type ApiProject, type ApiSigner, type CompanyFile, type EoiBodyKey, type EoiContent, type ProposalCover } from "../../lib/api";
import { eoiDefaults, resolveEoi, eoiStandardText, EOI_BODY_PARTS, EOI_STANDARD_BULLETS, EOI_PROJECT_TYPES } from "../../lib/eoi";
import { COMPANY } from "../../lib/brandTokens";
import EoiPDF from "../pdf/EoiPDF";

const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";

type TextKey = "solicitationNo" | "projectTitle" | "projectType" | "location" | "country" | "recipientName" | "recipientTitle" | "agency" | "bondingPercent" | "pocName" | "pocPhone" | "pocEmail";
type PartKey = "letter" | "body" | "experience" | "company" | "signature";

/** CR 360 - every part of the EOI opens and closes, like the letter. */
function Part({ title, note, open, onToggle, children, right }: { title: string; note?: ReactNode; open: boolean; onToggle: () => void; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="bg-white rounded-[2rem] border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-6 py-4">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {open ? <ChevronDown size={16} className="shrink-0 text-slate-400" /> : <ChevronRight size={16} className="shrink-0 text-slate-400" />}
          <span className="min-w-0">
            <span className="block font-bold text-slate-800 text-sm">{title}</span>
            {note && !open && <span className="block truncate text-[11px] text-slate-400">{note}</span>}
          </span>
        </button>
        {right}
      </div>
      {open && <div className="space-y-4 border-t border-slate-50 px-6 pb-6 pt-4">{children}</div>}
    </section>
  );
}

/**
 * Step 8 (items 114-117) - the Expression of Interest page. One fixed letter (the client's GT_EOI
 * wording), filled from the project and the Cover Page. Every box shows the value it will print as;
 * typing overrides it for this EOI. No revisions: "Start a new EOI" replaces it.
 *
 * CR 359 to 363 (2026-10-05): the body can be edited, every part folds, the signer is any GreenTech
 * user with the signature (and block) of their choice, the stamps come from Classified Documents,
 * and the preview prints the signature and the stamps.
 */
export default function EoiBuilder({ project, cover, value, onChange, onReset, canEdit }: {
  project: ApiProject;
  cover: ProposalCover | undefined;
  value: EoiContent;
  onChange: (next: EoiContent) => void;
  onReset: () => void;
  canEdit: boolean;
}) {
  const [signers, setSigners] = useState<ApiSigner[]>([]);
  const [stamps, setStamps] = useState<CompanyFile[]>([]);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<PartKey, boolean>>({ letter: true, body: false, experience: false, company: false, signature: true });
  const toggle = (k: PartKey) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  useEffect(() => {
    fetchSigners().then(setSigners).catch(() => {});
    fetchStamps().then(setStamps).catch(() => {});
  }, []);

  const set = <K extends keyof EoiContent>(k: K, v: EoiContent[K]) => onChange({ ...value, [k]: v, updatedAt: new Date().toISOString() });
  const d = eoiDefaults(project, cover, value.firm, value.signatory);
  const r = resolveEoi(value, project, cover);
  const std = eoiStandardText(r);
  const jvOn = !!project.jointVenture?.enabled && !!project.jointVenture.partnerName;
  const bullets = value.bullets ?? EOI_STANDARD_BULLETS;
  const setBullets = (b: string[]) => set("bullets", b);
  const jv = jvOn ? project.jointVenture : undefined;
  const sealChoices = [
    ...stamps.map((x) => ({ name: x.name, url: x.url })),
    ...(jv?.stamps || []).map((x) => ({ name: `${jv?.partnerName || "Partner"}: ${x.name}`, url: x.url })),
  ];
  const chosenStamps = value.stampUrls ?? (value.stampUrl ? [value.stampUrl] : []);
  const toggleStamp = (url: string) => {
    const next = chosenStamps.includes(url) ? chosenStamps.filter((u) => u !== url) : [...chosenStamps, url];
    onChange({ ...value, stampUrls: next, stampUrl: next[0] || "", updatedAt: new Date().toISOString() });
  };

  // CR 361 - who signs: any GreenTech user; then which of their signatures (each with its block).
  const signer = signers.find((x) => x.id === value.signatory?.userId) || signers.find((x) => x.name === value.signatory?.name);
  const pickSignature = (u: ApiSigner, sigId?: string) => {
    const sg = u.signatures.find((x) => x.id === sigId) || u.signatures.find((x) => x.isDefault) || u.signatures[0];
    set("signatory", {
      userId: u.id, signatureId: sg?.id || "",
      name: sg?.name || u.name, title: sg?.title || u.jobTitle || "", signatureUrl: sg?.url || "",
      email: sg?.email || u.email || "", phone: sg?.phone || u.phone || "", website: sg?.website || "", address: sg?.address || "",
    });
  };
  const setSig = (patch: Partial<NonNullable<EoiContent["signatory"]>>) => value.signatory && set("signatory", { ...value.signatory, ...patch });

  // CR 359 - a paragraph changed for this EOI; back to the standard text when it matches again.
  const setBody = (k: EoiBodyKey, text: string) => {
    const body = { ...(value.body || {}) };
    if (!text.trim() || text === std[k]) delete body[k]; else body[k] = text;
    set("body", Object.keys(body).length ? body : undefined);
  };
  const changed = Object.keys(value.body || {}).length;

  const field = (k: TextKey, label: string, opts: { wide?: boolean; list?: string } = {}) => (
    <div className={`space-y-1.5 ${opts.wide ? "md:col-span-2" : ""}`}>
      <label htmlFor={`eoi-${k}`} className={lbl}>{label}</label>
      <input id={`eoi-${k}`} value={value[k] || ""} onChange={(e) => set(k, e.target.value)} disabled={!canEdit} placeholder={String(d[k] || "")} list={opts.list} className={inp} />
    </div>
  );

  const download = async () => {
    setBusy(true);
    try {
      const blob = await pdf(<EoiPDF r={r} projectName={project.name} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName([project.name, "EOI", r.solicitationNo], "pdf");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } finally { setBusy(false); }
  };

  const missing = [!r.solicitationNo && "solicitation number", !r.recipientName && "recipient", !r.signatory && "signatory", r.jv && !r.firmUei && "the JV's UEI"].filter(Boolean) as string[];
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => setPreview(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200"><Eye size={13} /> Preview</button>
      <button onClick={() => void download()} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-bold hover:bg-primary disabled:opacity-50">{busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download PDF</button>
      {canEdit && <button onClick={onReset} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-500 text-[11px] font-bold hover:text-slate-900"><RotateCcw size={13} /> Start a new EOI</button>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-xl font-display font-bold text-slate-900">Expression of Interest</h3>
          <p className="text-[11px] text-slate-400">For {project.name}. One letter with the standard EOI wording; change any field or paragraph for this EOI. No revisions: a new EOI replaces this one.</p>
        </div>
        {actions}
      </div>

      {missing.length > 0 && (
        <p className="text-[11px] font-bold text-amber-700 bg-amber-50 rounded-xl px-3 py-2">Still to fill in: {missing.join(", ")}.</p>
      )}

      <Part title="The letter" note={[r.solicitationNo && `Solicitation ${r.solicitationNo}`, r.projectTitle, r.recipientName].filter(Boolean).join(" · ")} open={open.letter} onToggle={() => toggle("letter")}>
        <p className="text-[11px] text-slate-500">Every box shows what prints: the project and the <strong>Cover Page</strong> fill it. Type to change a line for this EOI; clear it to go back.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="eoi-date" className={lbl}>Date</label>
            <input id="eoi-date" type="date" value={value.date || ""} onChange={(e) => set("date", e.target.value)} disabled={!canEdit} className={inp} />
            {!value.date && <p className="text-[10px] text-slate-400">Empty: today.</p>}
          </div>
          {field("solicitationNo", "Solicitation No.")}
          {field("projectTitle", "Project", { wide: true })}
          {field("projectType", "Project type", { list: "eoi-types" })}
          {field("location", "Location")}
          {field("country", "Country (for the local permits sentence)")}
          {field("agency", "Announced by (office / agency)")}
          {field("recipientName", "Recipient")}
          {field("recipientTitle", "Recipient's title")}
          <div className="space-y-1.5">
            <label htmlFor="eoi-firm" className={lbl}>Submitted by</label>
            <select id="eoi-firm" value={value.firm || (d.jv ? "jv" : "gt")} onChange={(e) => set("firm", e.target.value as "gt" | "jv")} disabled={!canEdit} className={inp}>
              <option value="gt">GreenTech USA LLC</option>
              {jvOn && <option value="jv">{d.jv ? d.firmName : "The joint venture"}</option>}
            </select>
          </div>
          {field("bondingPercent", "ILC / bonding capacity (% of contract value)")}
        </div>
        <datalist id="eoi-types">{EOI_PROJECT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
      </Part>

      {/* CR 359 - "we have to make sure that we have access to the body also". */}
      <Part title="Body of the letter" note={changed ? `${changed} paragraph${changed === 1 ? "" : "s"} changed for this EOI` : "The standard wording. Open to edit the body."} open={open.body} onToggle={() => toggle("body")}
        right={!open.body && canEdit ? <button type="button" onClick={() => toggle("body")} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary"><PenLine size={12} /> Edit body</button> : undefined}>
        <p className="text-[11px] text-slate-500">Most of the time the standard wording stays. Change a paragraph only when this solicitation needs it; the fields above (firm, solicitation, location...) are already filled into the standard text.</p>
        {EOI_BODY_PARTS.map(({ key, label }) => {
          const own = value.body?.[key];
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`eoi-body-${key}`} className={lbl}>{label}</label>
                {own && canEdit && <button type="button" onClick={() => setBody(key, "")} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-900"><RotateCcw size={11} /> Back to the standard text</button>}
              </div>
              <textarea id={`eoi-body-${key}`} value={own ?? std[key]} onChange={(e) => setBody(key, e.target.value)} disabled={!canEdit} rows={key === "about" ? 4 : 3} className={`${inp} resize-y leading-relaxed ${own ? "ring-1 ring-amber-200" : ""}`} />
              {own && <p className="text-[10px] font-bold text-amber-700">Changed for this EOI</p>}
            </div>
          );
        })}
      </Part>

      <Part title={'"We have direct experience in:"'} note={`${bullets.length} line${bullets.length === 1 ? "" : "s"}${value.bullets ? ", changed" : ", the standard list"}`} open={open.experience} onToggle={() => toggle("experience")}
        right={open.experience && canEdit && value.bullets ? <button onClick={() => set("bullets", undefined)} className="text-[11px] font-bold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"><RotateCcw size={11} /> Back to the standard list</button> : undefined}>
        <p className="text-[11px] text-slate-500">The standard list. Change it only when the solicitation calls for different experience.</p>
        <div className="space-y-2">
          {bullets.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-primary font-bold">•</span>
              <input value={b} onChange={(e) => setBullets(bullets.map((x, k) => (k === i ? e.target.value : x)))} disabled={!canEdit} aria-label={`Experience ${i + 1}`} className={inp} />
              {canEdit && <button onClick={() => setBullets(bullets.filter((_, k) => k !== i))} aria-label="Remove" className="p-1.5 rounded text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>}
            </div>
          ))}
          {canEdit && <button onClick={() => setBullets([...bullets, ""])} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline"><Plus size={12} /> Add a line</button>}
        </div>
      </Part>

      <Part title="Company details" note={[r.firmName, r.pocName && `Contact: ${r.pocName}`].filter(Boolean).join(" · ")} open={open.company} onToggle={() => toggle("company")}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
          <div className="rounded-xl bg-slate-50 px-3 py-2"><span className={lbl}>Firm name</span><p className="font-bold text-slate-700">{r.firmName || "-"}</p></div>
          <div className="rounded-xl bg-slate-50 px-3 py-2"><span className={lbl}>UEI</span><p className="font-bold text-slate-700">{r.firmUei || <span className="text-amber-600">Not set</span>}</p></div>
          <div className="rounded-xl bg-slate-50 px-3 py-2"><span className={lbl}>Address</span><p className="font-bold text-slate-700">{r.firmAddress || "-"}</p></div>
        </div>
        {r.jv && <p className="text-[10px] text-slate-400">The JV's legal name, UEI, address and combined logo come from Project Identity → Joint Venture.</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {field("pocName", "Point of contact")}
          {field("pocPhone", "Telephone")}
          {field("pocEmail", "Email")}
        </div>
        <p className="text-[10px] text-slate-400">Empty: the signer's name, phone and email.</p>
      </Part>

      <Part title="Signature and stamps" note={[r.signatory ? `Signed by ${r.signatory.name}${r.signatory.title ? `, ${r.signatory.title}` : ""}` : "No signer yet", chosenStamps.length ? `${chosenStamps.length} stamp${chosenStamps.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")} open={open.signature} onToggle={() => toggle("signature")}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="eoi-signer" className={lbl}>Signed by</label>
              <select id="eoi-signer" value={signer?.id || ""} onChange={(e) => { const u = signers.find((x) => x.id === e.target.value); if (u) pickSignature(u); else set("signatory", undefined); }} disabled={!canEdit} className={inp}>
                <option value="">{value.signatory && !signer ? value.signatory.name : "Choose who signs..."}</option>
                {signers.map((u) => <option key={u.id} value={u.id}>{u.name}{u.jobTitle ? ` · ${u.jobTitle}` : ""}{u.signatures.length ? "" : " (no signature yet)"}</option>)}
              </select>
              <p className="text-[10px] text-slate-400">Anyone at GreenTech. Signatures and their blocks are kept in each person's Profile, Signatures.</p>
            </div>
            {/* "if he has three signatures I can choose which one" */}
            {signer && signer.signatures.length > 0 && (
              <div className="space-y-1.5">
                <span className={lbl}>Signature</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {signer.signatures.map((sg) => {
                    const on = value.signatory?.signatureId === sg.id || (!value.signatory?.signatureId && value.signatory?.signatureUrl === sg.url);
                    return (
                      <button key={sg.id} type="button" disabled={!canEdit} onClick={() => pickSignature(signer, sg.id)} className={`flex items-center gap-2 rounded-xl border bg-white p-2 text-left ${on ? "border-primary ring-2 ring-primary/20" : "border-slate-100 hover:border-slate-300"}`}>
                        <span className="flex h-10 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50"><img src={withFileToken(sg.url)} alt="" className="max-h-9 max-w-full object-contain" /></span>
                        <span className="min-w-0"><span className="block truncate text-[11px] font-bold text-slate-800">{sg.name || sg.label || signer.name}</span><span className="block truncate text-[10px] text-slate-500">{sg.title || "No title"}</span></span>
                        {on && <Check size={13} className="ml-auto shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {signer && signer.signatures.length === 0 && <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">{signer.name} has no signature yet: it is added in their Profile, Signatures. The letter prints their name without one.</p>}
          </div>
          <div className="space-y-3">
            {value.signatory ? (
              <div className="space-y-1.5">
                <span className={lbl}>Signature block (as it prints; change it for this EOI)</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input value={value.signatory.name} onChange={(e) => setSig({ name: e.target.value })} disabled={!canEdit} placeholder="Name" aria-label="Signer name" className={inp} />
                  <input value={value.signatory.title} onChange={(e) => setSig({ title: e.target.value })} disabled={!canEdit} placeholder="Title, e.g. Managing Director" aria-label="Signer title" className={inp} />
                  <input value={value.signatory.phone} onChange={(e) => setSig({ phone: e.target.value })} disabled={!canEdit} placeholder="Phone" aria-label="Signer phone" className={inp} />
                  <input value={value.signatory.email} onChange={(e) => setSig({ email: e.target.value })} disabled={!canEdit} placeholder="Email" aria-label="Signer email" className={inp} />
                  <input value={value.signatory.website || ""} onChange={(e) => setSig({ website: e.target.value })} disabled={!canEdit} placeholder={COMPANY.website} aria-label="Website" className={inp} />
                  <input value={value.signatory.address || ""} onChange={(e) => setSig({ address: e.target.value })} disabled={!canEdit} placeholder="Address (optional)" aria-label="Address" className={inp} />
                </div>
                {canEdit && <button onClick={() => set("signatory", undefined)} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-red-600"><X size={12} /> Remove the signer</button>}
              </div>
            ) : <p className="text-[11px] text-slate-400">Choose who signs: their name, title and contact details fill in here.</p>}
            {/* CR 362 - "which seal you want to add?": the company stamps kept in Classified Documents. */}
            <div className="space-y-1.5">
              <span className={lbl}>Stamps / seals (optional, from Classified Documents › Stamps)</span>
              <div className="flex flex-wrap gap-2">
                {sealChoices.length === 0 && <p className="text-[11px] text-slate-400">No stamps yet. Add them in Documents › Classified › Stamps.</p>}
                {sealChoices.map((x) => {
                  const on = chosenStamps.includes(x.url);
                  return (
                    <button key={x.url} type="button" disabled={!canEdit} onClick={() => toggleStamp(x.url)} title={x.name} aria-pressed={on}
                      className={`relative h-16 w-16 rounded-xl border bg-white p-1 ${on ? "border-primary ring-2 ring-primary/20" : "border-slate-100 hover:border-slate-300"}`}>
                      <img src={withFileToken(x.url)} alt={x.name} className="w-full h-full object-contain" />
                      {on && <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white"><Check size={10} /></span>}
                    </button>
                  );
                })}
              </div>
              {chosenStamps.length > 0 && <p className="text-[10px] text-slate-400">{chosenStamps.length} chosen: printed beside the signature.</p>}
            </div>
          </div>
        </div>
      </Part>

      {/* CR 357 - the same actions at the bottom. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-[11px] font-bold text-slate-500">Expression of Interest</span>
        {actions}
      </div>

      {preview && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex flex-col" onClick={() => setPreview(false)}>
          <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-slate-900 text-sm flex items-center gap-2"><FileText size={14} /> Preview: Expression of Interest</h3>
            <button onClick={() => setPreview(false)} aria-label="Close preview" className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><X size={16} /></button>
          </div>
          <div className="flex-1 bg-slate-200" onClick={(e) => e.stopPropagation()}>
            <PdfFrame><EoiPDF r={r} projectName={project.name} /></PdfFrame>
          </div>
        </div>
      )}
    </div>
  );
}
