import { Fragment, useEffect, useState } from "react";
import { Boxes, FileText, Handshake, Loader2, Package, X } from "lucide-react";
import { fetchAgreements, type AgreementCtx, type ApiAgreement, type RfqLineItem } from "../../lib/api";
import type { ProjectPdfInfo } from "../../lib/pdfProjectHeader";
import ProcurementRFQ from "./ProcurementRFQ";
import ProcurementPO from "./ProcurementPO";
import AgreementsPanel from "./agreements/AgreementsPanel";

/**
 * CR 345 - a work package's own RFQs, quotes, POs and agreement, opened right in the Work Packages
 * tab ("it shouldn't take me to Procurement; these documents are different; they should be
 * created, saved and shown under the work package"). The builders are Procurement's and the
 * agreements module's (GT Comments 3: "reused rather than creating separate systems"), shown here
 * for this package only; what is made here belongs to the package and stays out of Procurement.
 */
export type WorkspaceTab = "rfq" | "po" | "agreement";
export type WorkspaceOpen = {
  tab: WorkspaceTab;
  rfqId?: string;
  poId?: string;
  /** Open the Create RFQ window at once, starting from the package. */
  newRfq?: { title?: string; notes?: string; lineItems?: RfqLineItem[]; vendorIds?: string[] };
};

export default function PackageWorkspace({ projectId, projectInfo, canEdit, pkg, open, onCreateAgreement, onClose }: {
  projectId: string;
  projectInfo?: ProjectPdfInfo;
  canEdit: boolean;
  pkg: { id: string; no: string; name: string; agreementId: string };
  open: WorkspaceOpen;
  /** Makes the package's agreement (filled from the package) and returns its id. */
  onCreateAgreement: () => Promise<string | null>;
  /** `changed`: something was made or changed (the table reloads). */
  onClose: (changed: boolean) => void;
}) {
  const [tab, setTab] = useState<WorkspaceTab>(open.tab);
  const [rfqId, setRfqId] = useState(open.rfqId);
  const [poId, setPoId] = useState(open.poId);
  const [changed, setChanged] = useState(false);
  const [agreementId, setAgreementId] = useState(pkg.agreementId);
  const owner = { id: pkg.id, name: `${pkg.no} ${pkg.name}` };

  // The agreement's own home (General Agreements, or a project's agreements) decides how it is opened.
  const [agr, setAgr] = useState<{ ctx: AgreementCtx; ag: ApiAgreement } | null | "none" | "loading">(agreementId ? "loading" : "none");
  useEffect(() => {
    if (!agreementId) { setAgr("none"); return; }
    setAgr("loading");
    // CR 347 - the package's own agreement only.
    void fetchAgreements({ kind: "general" }, false, { package: pkg.id }).catch(() => [] as ApiAgreement[]).then((list) => {
      const ag = list.find((a) => a._id === agreementId);
      setAgr(ag ? { ctx: { kind: "general" }, ag } : "none");
    });
  }, [agreementId, projectId]);
  const [makingAgr, setMakingAgr] = useState(false);
  const makeAgreement = async () => {
    setMakingAgr(true);
    try { const id = await onCreateAgreement(); if (id) { setAgreementId(id); setChanged(true); } }
    finally { setMakingAgr(false); }
  };

  const TABS: Array<{ k: WorkspaceTab; label: string; icon: typeof FileText }> = [
    { k: "rfq", label: "RFQs & quotes", icon: FileText },
    { k: "po", label: "Purchase orders", icon: Package },
    { k: "agreement", label: "Agreement", icon: Handshake },
  ];

  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center bg-slate-900/50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-7xl my-4" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-20 rounded-t-3xl border-b border-slate-200 bg-white px-5 sm:px-6 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 inline-flex items-center gap-1.5"><Boxes size={12} /> Work package</p>
              <h3 className="text-lg font-display font-bold text-slate-900 truncate">{pkg.no} {pkg.name}</h3>
              <p className="text-[11px] text-slate-400">Its own RFQs, quotes, purchase orders and agreement, made and kept here in the package.</p>
            </div>
            <button onClick={() => onClose(changed)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)} className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-bold transition-colors ${tab === t.k ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                <t.icon size={13} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 sm:p-5">
          {tab === "rfq" && (
            <ProcurementRFQ
              projectId={projectId} canEdit={canEdit} projectInfo={projectInfo}
              ownerPackage={owner}
              openRfqId={rfqId} onOpenedRfq={() => setRfqId(undefined)}
              startNew={!!open.newRfq} seed={open.newRfq}
              onGoToPO={(id) => { setPoId(id); setTab("po"); }}
              onChanged={() => setChanged(true)}
            />
          )}
          {tab === "po" && (
            <ProcurementPO
              projectId={projectId} canEdit={canEdit} projectInfo={projectInfo}
              ownerPackage={owner}
              openPoId={poId} onOpenedPo={() => setPoId(undefined)}
              onGoToRFQ={() => setTab("rfq")} onGoToQuotes={() => setTab("rfq")}
              onChanged={() => setChanged(true)}
            />
          )}
          {tab === "agreement" && (
            agr === "loading" ? (
              <p className="p-6 text-sm text-slate-400 inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading the agreement</p>
            ) : agr === "none" || !agr ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <Handshake size={28} className="mx-auto text-slate-300" />
                <p className="mt-2 text-sm font-bold text-slate-700">No agreement for this package yet</p>
                <p className="mt-1 text-xs text-slate-400">Make one here: it is filled from the package (its name, scope and company) and written and signed right here.</p>
                {canEdit && <button onClick={() => void makeAgreement()} disabled={makingAgr} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-50">{makingAgr ? <Loader2 size={13} className="animate-spin" /> : <Handshake size={13} />} Create an agreement for this package</button>}
              </div>
            ) : (
              <Fragment key={agr.ag._id}><AgreementsPanel ctx={agr.ctx} canManage={canEdit} onlyIds={[agr.ag._id]} openId={agr.ag._id} noCreate ownerPackageId={pkg.id} /></Fragment>
            )
          )}
        </div>
      </div>
    </div>
  );
}
