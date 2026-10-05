import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, CalendarClock, ListChecks } from "lucide-react";
import { REQUIREMENT_STATUSES, requirementStatus, type ProposalRequirement, type RequirementStatus, type RfpDetails } from "../../lib/api";

const inp = "w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
const lbl = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const STATUS_CLS: Record<RequirementStatus, string> = {
  compliant: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  "not-addressed": "bg-red-50 text-red-600",
  "n/a": "bg-slate-100 text-slate-500",
};

type RfpKey = keyof RfpDetails;

/**
 * Step 9 (spec 6 and 38) - the RFP's rules (due date, page limits, formatting and submission) and
 * its requirements, each linked to the section that answers it with a compliance status. The
 * Compliance Matrix section prints this list with the page numbers.
 */
export default function RfpCompliancePanel({ rfp, onRfpChange, requirements, onRequirementsChange, sections, canEdit, hasMatrix, onAddMatrix, defaultOpen = true }: {
  /** CR 354 - opened at once when it is just being added; folded when it already holds details. */
  defaultOpen?: boolean;
  rfp: RfpDetails;
  onRfpChange: (next: RfpDetails) => void;
  requirements: ProposalRequirement[];
  onRequirementsChange: (next: ProposalRequirement[]) => void;
  sections: Array<{ id: string; volume: "technical" | "financial"; label: string }>;
  canEdit: boolean;
  hasMatrix: boolean;
  onAddMatrix: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [paste, setPaste] = useState("");
  const setR = (k: RfpKey, v: string) => onRfpChange({ ...rfp, [k]: v });
  const setReq = (id: string, patch: Partial<ProposalRequirement>) =>
    onRequirementsChange(requirements.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      return { ...next, done: requirementStatus(next) === "compliant" };
    }));
  const addLines = () => {
    const lines = paste.split(/\n+/).map((x) => x.replace(/^[\s•\-*\d.)]+/, "").trim()).filter(Boolean);
    if (!lines.length) return;
    onRequirementsChange([...requirements, ...lines.map((label) => ({ id: uid(), label, done: false, status: "not-addressed" as const }))]);
    setPaste("");
  };
  const due = rfp.dueDate ? new Date(`${rfp.dueDate}T${rfp.dueTime || "23:59"}`) : null;
  const days = due && !isNaN(due.getTime()) ? Math.ceil((due.getTime() - Date.now()) / 86400000) : null;
  const counts = REQUIREMENT_STATUSES.map((s) => ({ ...s, n: requirements.filter((r) => requirementStatus(r) === s.v).length })).filter((c) => c.n > 0);

  const field = (k: RfpKey, label: string, props: { type?: string; placeholder?: string; numeric?: boolean } = {}) => (
    <label className="space-y-1">
      <span className={lbl}>{label}</span>
      <input type={props.type || "text"} inputMode={props.numeric ? "numeric" : undefined} value={rfp[k] || ""} onChange={(e) => setR(k, e.target.value)} disabled={!canEdit} placeholder={props.placeholder} className={inp} />
    </label>
  );

  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 text-left">
        <span className="font-display font-bold text-slate-900 text-base flex items-center gap-2">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} RFP details and compliance
          {/* CR 354 - "just for inside information... not going to be printed": a reminder for the writer. */}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-500" title="A reminder for whoever writes the proposal: due date, where it goes, the rules to follow. It is not printed (the Compliance Matrix section prints the requirements, if you add it).">Internal · not printed</span>
        </span>
        <span className="flex items-center gap-2 flex-wrap justify-end">
          {days !== null && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${days < 0 ? "bg-slate-100 text-slate-500" : days <= 3 ? "bg-red-50 text-red-600" : days <= 7 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
              {days < 0 ? "Past due" : days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`}
            </span>
          )}
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{requirements.length} requirement{requirements.length === 1 ? "" : "s"}</span>
        </span>
      </button>

      {open && (
        <div className="p-5 space-y-6">
          <div className="space-y-3">
            <p className={`${lbl} flex items-center gap-1.5`}><CalendarClock size={12} /> What the RFP says</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {field("dueDate", "Due date", { type: "date" })}
              {field("dueTime", "Due time", { type: "time" })}
              {field("timeZone", "Time zone", { placeholder: "e.g. CET, EST" })}
              {field("questionsDue", "Questions due", { type: "date" })}
              {field("pageLimitTechnical", "Technical page limit", { numeric: true, placeholder: "No limit" })}
              {field("pageLimitFinancial", "Financial page limit", { numeric: true, placeholder: "No limit" })}
              <label className="space-y-1">
                <span className={lbl}>Submission method</span>
                <select value={rfp.submissionMethod || ""} onChange={(e) => setR("submissionMethod", e.target.value)} disabled={!canEdit} className={inp}>
                  <option value="">Not set</option>
                  <option value="Email">Email</option>
                  <option value="Portal">Portal (SAM.gov, PIEE, ...)</option>
                  <option value="Hard copy">Hard copy</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              {field("submitTo", "Submit to", { placeholder: "Email, portal or address" })}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className={lbl}>Formatting rules</span>
                <textarea rows={2} value={rfp.formatting || ""} onChange={(e) => setR("formatting", e.target.value)} disabled={!canEdit} placeholder="Font, size, margins, file format, file size, file naming..." className={`${inp} resize-y`} />
              </label>
              <label className="space-y-1">
                <span className={lbl}>Other instructions</span>
                <textarea rows={2} value={rfp.instructions || ""} onChange={(e) => setR("instructions", e.target.value)} disabled={!canEdit} placeholder="Volumes, copies, signatures, what counts toward the page limit..." className={`${inp} resize-y`} />
              </label>
            </div>
            <p className="text-[10px] text-slate-400">The page limits are checked each time a volume is previewed or downloaded.</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className={`${lbl} flex items-center gap-1.5`}><ListChecks size={12} /> RFP requirements</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {counts.map((c) => <span key={c.v} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLS[c.v]}`}>{c.n} {c.label.toLowerCase()}</span>)}
              </div>
            </div>
            {!hasMatrix && canEdit && (
              <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl bg-primary/5 border border-primary/10 px-3 py-2 text-[11px] text-slate-600">
                <span>The technical proposal has no Compliance Matrix yet. It prints this list with the section and page where each requirement is answered.</span>
                <button onClick={onAddMatrix} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary shrink-0">Add the Compliance Matrix</button>
              </div>
            )}
            {requirements.length === 0 && <p className="text-xs text-slate-400">No requirements yet. Paste them from the RFP (for example Sections L and M), one per line.</p>}
            {requirements.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <th className="px-2 py-2 w-8">#</th>
                      <th className="px-2 py-2">Requirement</th>
                      <th className="px-2 py-2 w-28">RFP ref.</th>
                      <th className="px-2 py-2 w-56">Answered in</th>
                      <th className="px-2 py-2 w-44">Status</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {requirements.map((r, i) => {
                      const st = requirementStatus(r);
                      return (
                        <tr key={r.id} className="align-top">
                          <td className="px-2 py-2.5 text-slate-400 font-bold">{i + 1}</td>
                          <td className="px-2 py-1.5"><textarea rows={1} value={r.label} onChange={(e) => setReq(r.id, { label: e.target.value })} disabled={!canEdit} aria-label={`Requirement ${i + 1}`} className={`${inp} resize-y`} /></td>
                          <td className="px-2 py-1.5"><input value={r.rfpRef || ""} onChange={(e) => setReq(r.id, { rfpRef: e.target.value })} disabled={!canEdit} placeholder="L.5.2" aria-label="RFP reference" className={inp} /></td>
                          <td className="px-2 py-1.5">
                            <select
                              value={r.sectionId ? `${r.volume || "technical"}:${r.sectionId}` : ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                const at = v.indexOf(":");
                                setReq(r.id, v ? { volume: v.slice(0, at) as "technical" | "financial", sectionId: v.slice(at + 1) } : { volume: undefined, sectionId: "" });
                              }}
                              disabled={!canEdit}
                              aria-label="Answered in section"
                              className={inp}
                            >
                              <option value="">Not linked yet</option>
                              {sections.map((s) => <option key={`${s.volume}:${s.id}`} value={`${s.volume}:${s.id}`}>{s.label}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <select value={st} onChange={(e) => setReq(r.id, { status: e.target.value as RequirementStatus })} disabled={!canEdit} aria-label="Compliance status" className={`${inp} font-bold ${STATUS_CLS[st]}`}>
                              {REQUIREMENT_STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                            </select>
                          </td>
                          <td className="px-1 py-1.5">
                            {canEdit && <button onClick={() => onRequirementsChange(requirements.filter((x) => x.id !== r.id))} aria-label="Remove requirement" className="p-1.5 rounded text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {canEdit && (
              <div className="flex gap-2 items-start">
                <textarea rows={2} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Add requirements, one per line (paste straight from the RFP)" aria-label="New requirements" className={`${inp} flex-1 resize-y`} />
                <button onClick={addLines} disabled={!paste.trim()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-bold hover:bg-primary disabled:opacity-40"><Plus size={12} /> Add</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
