import { useEffect, useState } from "react";
import { fileName } from "../../lib/fileNames";
import { PDFViewer, pdf } from "@react-pdf/renderer";
import { Eye, Download, RotateCcw, Plus, Trash2, X, Loader2, FileText } from "lucide-react";
import { fetchSignatories, fetchStamps, withFileToken, type ApiProject, type ApiSignatory, type CompanyFile, type EoiContent, type ProposalCover } from "../../lib/api";
import { eoiDefaults, resolveEoi, EOI_STANDARD_BULLETS, EOI_PROJECT_TYPES } from "../../lib/eoi";
import EoiPDF from "../pdf/EoiPDF";

const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
const card = "bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4";

type TextKey = "solicitationNo" | "projectTitle" | "projectType" | "location" | "country" | "recipientName" | "recipientTitle" | "agency" | "bondingPercent" | "pocName" | "pocPhone" | "pocEmail";

/**
 * Step 8 (items 114-117) - the Expression of Interest page. One fixed letter (the client's GT_EOI
 * wording), filled from the project and the Cover Page. Every box shows the value it will print as;
 * typing overrides it for this EOI. No revisions: "Start a new EOI" replaces it.
 */
export default function EoiBuilder({ project, cover, value, onChange, onReset, canEdit }: {
  project: ApiProject;
  cover: ProposalCover | undefined;
  value: EoiContent;
  onChange: (next: EoiContent) => void;
  onReset: () => void;
  canEdit: boolean;
}) {
  const [staff, setStaff] = useState<ApiSignatory[]>([]);
  const [stamps, setStamps] = useState<CompanyFile[]>([]);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetchSignatories().then(setStaff).catch(() => {});
    fetchStamps().then(setStamps).catch(() => {});
  }, []);

  const set = <K extends keyof EoiContent>(k: K, v: EoiContent[K]) => onChange({ ...value, [k]: v, updatedAt: new Date().toISOString() });
  const d = eoiDefaults(project, cover, value.firm, value.signatory);
  const r = resolveEoi(value, project, cover);
  const jvOn = !!project.jointVenture?.enabled && !!project.jointVenture.partnerName;
  const bullets = value.bullets ?? EOI_STANDARD_BULLETS;
  const setBullets = (b: string[]) => set("bullets", b);
  const jv = jvOn ? project.jointVenture : undefined;
  const sealChoices = [
    ...stamps.map((x) => ({ name: x.name, url: x.url })),
    ...(jv?.stamps || []).map((x) => ({ name: `${jv?.partnerName || "Partner"}: ${x.name}`, url: x.url })),
  ];

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-xl font-display font-bold text-slate-900">Expression of Interest</h3>
          <p className="text-[11px] text-slate-400">For {project.name}. One letter with the standard EOI wording; only the fields below change. No revisions: a new EOI replaces this one.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPreview(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200"><Eye size={13} /> Preview</button>
          <button onClick={() => void download()} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-bold hover:bg-primary disabled:opacity-50">{busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download PDF</button>
          {canEdit && <button onClick={onReset} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-500 text-[11px] font-bold hover:text-slate-900"><RotateCcw size={13} /> Start a new EOI</button>}
        </div>
      </div>

      {missing.length > 0 && (
        <p className="text-[11px] font-bold text-amber-700 bg-amber-50 rounded-xl px-3 py-2">Still to fill in: {missing.join(", ")}.</p>
      )}

      <div className={card}>
        <h4 className="font-bold text-slate-800 text-sm">The letter</h4>
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
      </div>

      <div className={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h4 className="font-bold text-slate-800 text-sm">"We have direct experience in:"</h4>
          {canEdit && value.bullets && <button onClick={() => set("bullets", undefined)} className="text-[11px] font-bold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"><RotateCcw size={11} /> Back to the standard list</button>}
        </div>
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
      </div>

      <div className={card}>
        <h4 className="font-bold text-slate-800 text-sm">Company details and signature</h4>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="eoi-sig" className={lbl}>Signed by</label>
            <select
              id="eoi-sig"
              value={staff.find((x) => x.name === value.signatory?.name)?.id || ""}
              onChange={(e) => {
                const x = staff.find((y) => y.id === e.target.value);
                set("signatory", x ? { name: x.name, title: x.jobTitle || "", signatureUrl: x.signatureUrl || "", email: x.email || "", phone: x.phone || "" } : undefined);
              }}
              disabled={!canEdit}
              className={inp}
            >
              <option value="">{value.signatory ? value.signatory.name : "Choose a signatory..."}</option>
              {staff.map((x) => <option key={x.id} value={x.id}>{x.name}{x.jobTitle ? ` · ${x.jobTitle}` : ""}</option>)}
            </select>
            {value.signatory && (
              <div className="flex items-center gap-3 pt-1">
                <div className="w-24 h-12 rounded-lg bg-white border border-slate-100 flex items-center justify-center overflow-hidden">
                  {value.signatory.signatureUrl ? <img src={withFileToken(value.signatory.signatureUrl)} alt="Signature" className="max-h-10 max-w-full object-contain" /> : <span className="text-[9px] text-slate-400 px-1 text-center">No signature on profile</span>}
                </div>
                <input value={value.signatory.title} onChange={(e) => set("signatory", { ...value.signatory!, title: e.target.value })} disabled={!canEdit} placeholder="Title, e.g. JV Director" aria-label="Signatory title" className={inp} />
                {canEdit && <button onClick={() => set("signatory", undefined)} aria-label="Remove signatory" className="p-1.5 rounded text-slate-300 hover:text-red-500"><X size={13} /></button>}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <span className={lbl}>Seal (optional)</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!canEdit} onClick={() => set("stampUrl", "")} className={`h-14 px-3 rounded-xl border text-[11px] font-bold ${!value.stampUrl ? "border-primary ring-2 ring-primary/20 text-slate-800" : "border-slate-100 text-slate-400"}`}>None</button>
              {sealChoices.map((x) => (
                <button key={x.url} type="button" disabled={!canEdit} onClick={() => set("stampUrl", x.url)} title={x.name}
                  className={`h-14 w-14 rounded-xl border bg-white p-1 ${value.stampUrl === x.url ? "border-primary ring-2 ring-primary/20" : "border-slate-100 hover:border-slate-300"}`}>
                  <img src={withFileToken(x.url)} alt={x.name} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex flex-col" onClick={() => setPreview(false)}>
          <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-slate-900 text-sm flex items-center gap-2"><FileText size={14} /> Preview: Expression of Interest</h3>
            <button onClick={() => setPreview(false)} aria-label="Close preview" className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><X size={16} /></button>
          </div>
          <div className="flex-1 bg-slate-200" onClick={(e) => e.stopPropagation()}>
            <PDFViewer width="100%" height="100%" showToolbar><EoiPDF r={r} projectName={project.name} /></PDFViewer>
          </div>
        </div>
      )}
    </div>
  );
}
