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

  // The agreements TABLE is the whole point of this page and it carries ten columns, so the page
  // runs much wider than the usual max-w-7xl and uses the space either side. The intro copy stays
  // narrow on purpose: full-width prose is unreadable, full-width tables are not.
  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-primary mb-2">
          <Handshake size={18} /><span className="text-xs font-bold uppercase tracking-widest">Agreements</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 flex items-center gap-2"><Handshake className="text-primary" /> General Agreements</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          Company agreements with an outside party — not tied to any project or employee. {GREENTECH.name}'s
          details are filled in for you; add the other party, then save as a draft or send it out.
          The other party has no login here, so share the PDF and upload the counter-signed copy when it returns.
        </p>
      </div>

      <div className="bg-white p-3 sm:p-5 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm">
        <AgreementsPanel ctx={{ kind: "general" }} canManage />
      </div>
    </div>
  );
}
