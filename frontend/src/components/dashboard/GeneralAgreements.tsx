import { Handshake } from "lucide-react";
import AgreementsPanel from "./agreements/AgreementsPanel";
import { GREENTECH } from "../../lib/poPdf";
import { useMeta } from "../../hooks/useMeta";

// General Agreements — company-level agreements that belong to no project and no employee.
// Example: GreenTech contracts another company for a piece of work. GreenTech's own details are
// filled in automatically; the other party is entered on the agreement. Same engine, same
// document, same draft → send → signed lifecycle as the project and employee agreements.
export default function GeneralAgreements() {
  useMeta({ title: "General Agreements", description: "Company agreements that aren't tied to a project or an employee." });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-primary mb-2">
          <Handshake size={18} /><span className="text-xs font-bold uppercase tracking-widest">Agreements</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">General Agreements</h1>
        <p className="text-sm text-slate-500 mt-1">
          Company agreements with an outside party — not tied to any project or employee. {GREENTECH.name}'s
          details are filled in for you; add the other party, then save as a draft or send it out.
          The other party has no login here, so share the PDF and upload the counter-signed copy when it returns.
        </p>
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm">
        <AgreementsPanel ctx={{ kind: "general" }} canManage />
      </div>
    </div>
  );
}
