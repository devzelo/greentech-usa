import { useMemo, useState } from "react";
import { Search, FileText, User, Check, Plus, AlertTriangle } from "lucide-react";
import type { ProposalDoc, ProposalEmployee } from "../../lib/api";
import type { ProposalTeamResume } from "./ProposalPDF";
import { APPENDIX_LIBRARY } from "../../lib/proposalLibrary";
import { expiryInfo } from "../../lib/docExpiry";
import HelpTip from "./HelpTip";

/**
 * CR 206: "Show the available attachments (resumes, templates) in the attachment list so we can
 * pick which to include." Everything the platform already holds for this proposal, in one list:
 * the team's resumes and the company documents. Uploading your own stays below, unchanged.
 */

const typeTitle = (key?: string) => APPENDIX_LIBRARY.find((a) => a.key === key)?.title || "";

export default function AvailableAttachments({ volume, employees, resumes, printResumes, onPrintResumes, companyDocs, attachedIds, onAddDoc, canEdit }: {
  volume: "technical" | "financial";
  employees: ProposalEmployee[];
  resumes: ProposalTeamResume[];
  printResumes: boolean;
  onPrintResumes: (on: boolean) => void;
  companyDocs: ProposalDoc[];
  attachedIds: Set<string>;
  onAddDoc: (doc: ProposalDoc) => void;
  canEdit: boolean;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();

  const people = useMemo(() => employees.map((e) => ({
    e,
    r: resumes.find((x) => x.rowId === e.id) || resumes.find((x) => !x.rowId && x.name === e.name),
  })).filter(({ e }) => !needle || `${e.name} ${e.role}`.toLowerCase().includes(needle)), [employees, resumes, needle]);

  const docs = useMemo(() => companyDocs
    .filter((d) => !d.archived)
    .filter((d) => !needle || `${d.name} ${d.tabLabel || ""} ${typeTitle(d.libraryKey)}`.toLowerCase().includes(needle))
    .slice()
    .sort((a, b) => (a.tabLabel || "").localeCompare(b.tabLabel || "") || a.name.localeCompare(b.name)),
  [companyDocs, needle]);

  const withResume = people.filter((p) => p.r).length;

  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            Available to include
            <HelpTip title="Available to include">
              What the platform already holds for this proposal: the resumes of the people on this
              project and the company's documents (registration, insurance, licences, certificates).
              Pick what goes in; upload anything else below.
            </HelpTip>
          </h4>
          <p className="mt-0.5 text-[10px] text-slate-400">Nothing here is uploaded again: the current file is pulled in when the proposal prints.</p>
        </div>
        <label className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20 md:max-w-xs">
          <Search size={14} className="text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people and documents" className="flex-1 text-xs outline-none" aria-label="Search what is available" />
        </label>
      </div>

      {/* Resumes: only the technical volume prints them. */}
      {volume === "technical" && (
        <div className="rounded-2xl border border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Key personnel resumes ({withResume} of {people.length} on file)</p>
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
              <input type="checkbox" checked={printResumes} onChange={(e) => onPrintResumes(e.target.checked)} disabled={!canEdit} className="accent-emerald-600" />
              Print the resumes in this proposal
            </label>
          </div>
          <ul className="divide-y divide-slate-50">
            {people.length === 0 && <li className="px-4 py-5 text-center text-xs italic text-slate-400">Nobody on the key personnel list yet{needle ? " matches" : ""}. Add people in the builder.</li>}
            {people.map(({ e, r }) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <User size={13} className={r ? "shrink-0 text-primary" : "shrink-0 text-slate-300"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-slate-800">{e.name || "Unnamed"}</span>
                  <span className="block text-[10px] text-slate-400">
                    {[e.role || r?.data.resume.title, e.firm || r?.firm, e.keyStaff === false ? "Non-key staff" : "Key staff"].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {r
                  ? <span className={`shrink-0 text-[10px] font-bold ${printResumes ? "text-emerald-600" : "text-slate-400"}`}>{printResumes ? "Resume included" : "Resume on file"}</span>
                  : <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-amber-600"><AlertTriangle size={11} /> No resume on file</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Company documents: added as an appendix that prints the current file as it is. */}
      <div className="rounded-2xl border border-slate-100">
        <p className="border-b border-slate-100 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Company documents ({docs.length})</p>
        <ul className="max-h-[22rem] divide-y divide-slate-50 overflow-y-auto">
          {docs.length === 0 && <li className="px-4 py-5 text-center text-xs italic text-slate-400">No company documents{needle ? " match" : " yet. Upload them in Company Documents"}.</li>}
          {docs.map((d) => {
            const already = attachedIds.has(d._id);
            const ex = expiryInfo(d.expiresAt);
            return (
              <li key={d._id} className="flex items-center gap-3 px-4 py-2.5">
                <FileText size={13} className="shrink-0 text-slate-300" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-slate-800">{d.name}</span>
                  <span className="block text-[10px] text-slate-400">
                    {[d.tabLabel, typeTitle(d.libraryKey), d.version ? `Version ${d.version}` : ""].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {ex.state !== "none" && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${ex.cls}`}>{ex.label}</span>}
                {already
                  ? <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-emerald-600"><Check size={12} /> In this proposal</span>
                  : canEdit && (
                    <button onClick={() => onAddDoc(d)} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-200">
                      <Plus size={11} /> Include
                    </button>
                  )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
