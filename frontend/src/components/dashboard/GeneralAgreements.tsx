import { Handshake } from "lucide-react";
import AgreementsPanel from "./agreements/AgreementsPanel";
import { GREENTECH } from "../../lib/poPdf";
import { getAuthUser } from "../../lib/api";
import { useMeta } from "../../hooks/useMeta";

// General Agreements — company-level agreements that belong to no project and no employee.
// Example: GreenTech contracts another company for a piece of work. GreenTech's own details are
// filled in automatically; the other party is entered on the agreement. Same engine, same
// document, same draft → share → signed lifecycle as the project and employee agreements.
//
// CR-P (58)/(64) — an outside party with a login lands here too (the share notification links
// here). They get the same table, read-only, holding only what was shared with them, with Sign
// and Reject on the rows waiting for them.
export default function GeneralAgreements() {
  const isParty = getAuthUser()?.role === "subcontractor";
  useMeta({
    title: isParty ? "Agreements" : "General Agreements",
    description: isParty ? "Agreements GreenTech has shared with you." : "Company agreements that aren't tied to a project or an employee.",
  });

  // The agreements TABLE is the whole point of this page and it carries ten columns, so the page
  // runs much wider than the usual max-w-7xl and uses the space either side. The intro copy stays
  // narrow on purpose: full-width prose is unreadable, full-width tables are not.
  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-primary mb-2">
          <Handshake size={18} /><span className="text-xs font-bold uppercase tracking-widest">Agreements</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 flex items-center gap-2">
          <Handshake className="text-primary" /> {isParty ? "Agreements shared with you" : "General Agreements"}
        </h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          {isParty ? (
            <>Agreements {GREENTECH.name} has shared with you. Preview one to read it, then sign or reject it
              from its row. Your default signature from your profile is used when you sign.</>
          ) : (
            <>Company agreements with an outside party, not tied to any project or employee. {GREENTECH.name}'s
              details are filled in for you; add the other parties, then share it with them from its row.
              A party with a login reviews and signs it from their own account. For anyone else, upload the
              signed copy in Manage when it comes back.</>
          )}
        </p>
      </div>

      <div className="bg-white p-3 sm:p-5 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm">
        <AgreementsPanel ctx={{ kind: "general" }} canManage={!isParty} />
      </div>
    </div>
  );
}
