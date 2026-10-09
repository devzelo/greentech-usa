import { useEffect, useState } from "react";
import { Check, Loader2, Lock, RotateCcw, FileText, Receipt, Store, AlertTriangle } from "lucide-react";
import {
  fetchVendorOffers, acceptVendorOffer, reopenVendorOffer, fetchCompanyLogin, attachmentUrl,
  type ApiVendorOffer, type ApiVendorInvoice, type OfferKind,
} from "../../lib/api";
import { formatMoney } from "./MoneyInput";
import { toast } from "../../lib/toast";

/**
 * 2026-10-09 - GreenTech's view of what a vendor sent from its profile for a BOQ line or a work
 * package: its unit price, total and lead time, its documents and its invoices (those are in
 * Finances too, Pending until approved). Accept locks the figures; Reopen lets the vendor change
 * them again. Only for someone allowed to see the project's figures: otherwise it stays hidden.
 */
export default function VendorOfferPanel({ projectId, kind, refId, companyId, companyName, onChanged }: {
  projectId: string; kind: OfferKind; refId: string; companyId: string; companyName: string;
  onChanged?: () => void;
}) {
  const [state, setState] = useState<{ offer?: ApiVendorOffer; invoices: ApiVendorInvoice[] } | "hidden" | null>(null);
  const [hasLogin, setHasLogin] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => fetchVendorOffers(projectId, kind)
    .then((r) => setState({ offer: r.offers.find((o) => o.refId === refId && o.companyId === companyId), invoices: r.invoices.filter((i) => i.sourceRef?.refId === refId && i.companyId === companyId) }))
    .catch(() => setState("hidden"));
  useEffect(() => { setState(null); void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId, kind, refId, companyId]);
  useEffect(() => {
    let live = true;
    fetchCompanyLogin(companyId).then((l) => { if (live) setHasLogin(l.exists && !l.archived); }).catch(() => { if (live) setHasLogin(null); });
    return () => { live = false; };
  }, [companyId]);
  if (!companyId || state === "hidden") return null;

  const offer = state?.offer;
  const act = async (fn: typeof acceptVendorOffer, done: string) => {
    if (!offer) return;
    setBusy(true);
    try { await fn(projectId, offer._id); toast(done, "success"); await load(); onChanged?.(); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not update the offer.", "error"); }
    finally { setBusy(false); }
  };
  const lbl = "text-[10px] font-bold uppercase tracking-widest text-slate-400";
  const money = (v?: string) => (v ? formatMoney(v) : "-");

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><Store size={14} className="text-primary" /> {companyName || "The vendor"}'s offer</h4>
        {offer && (offer.status === "accepted"
          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700"><Lock size={10} /> Accepted{offer.acceptedByName ? ` by ${offer.acceptedByName}` : ""}</span>
          : <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">Sent{offer.submittedAt ? ` ${new Date(offer.submittedAt).toLocaleDateString()}` : ""}</span>)}
      </div>

      {state === null ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-400"><Loader2 size={12} className="animate-spin" /> Loading…</p>
      ) : !offer ? (
        <p className="mt-2 text-xs text-slate-500">Waiting for {companyName || "the vendor"} to enter a price. It shows in their profile, under this project.</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl bg-slate-50 px-3 py-2.5 sm:grid-cols-4">
            {kind === "boq" && <div><dt className={lbl}>Unit price</dt><dd className="text-sm font-bold tabular-nums text-slate-800">{money(offer.unitPrice)}</dd></div>}
            <div><dt className={lbl}>Total price</dt><dd className="text-sm font-bold tabular-nums text-slate-800">{money(offer.total)}</dd></div>
            <div><dt className={lbl}>Lead time</dt><dd className="text-sm font-bold text-slate-800">{offer.leadTime || "-"}</dd></div>
            {offer.notes && <div className="col-span-2 sm:col-span-4"><dt className={lbl}>Notes</dt><dd className="whitespace-pre-wrap text-xs text-slate-600">{offer.notes}</dd></div>}
          </dl>
          {offer.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {offer.attachments.map((a) => (
                <a key={a._id} href={attachmentUrl(a.filePath, a.name)} target="_blank" rel="noreferrer" title={a.name}
                  className="inline-flex max-w-full items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary">
                  <FileText size={11} className="shrink-0" /><span className="max-w-[14rem] truncate">{a.name}</span>
                </a>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-400">{offer.status === "accepted" ? "Accepted: the vendor can no longer change these figures." : "The vendor can change these figures until you accept them."}</p>
            {offer.status === "accepted"
              ? <button type="button" onClick={() => void act(reopenVendorOffer, "Reopened: the vendor can change the figures again.")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary disabled:opacity-50">{busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Reopen</button>
              : <button type="button" onClick={() => void act(acceptVendorOffer, "Offer accepted.")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Accept</button>}
          </div>
        </>
      )}

      {state && state !== "hidden" && state.invoices.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <p className={lbl}>Invoices sent from their profile</p>
          <ul className="mt-1 space-y-1">
            {state.invoices.map((iv) => (
              <li key={iv._id} className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <Receipt size={12} className="text-slate-400" />
                <span className="font-bold text-slate-700">{iv.number ? `Invoice ${iv.number}` : "Invoice"}</span>
                <span className="tabular-nums">{money(iv.amount)}</span>
                <span className="text-slate-400">{iv.date}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${iv.status === "Pending" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{iv.status === "Pending" ? "Pending approval" : iv.status}</span>
                {iv.attachments?.[0] && <a href={attachmentUrl(iv.attachments[0].filePath, iv.attachments[0].name)} target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">View</a>}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-slate-400">Approve or reject them in Finances, Invoice Received (set the status from Pending).</p>
        </div>
      )}

      {hasLogin === false && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {companyName || "This company"} has no login yet, so they cannot see this. Give them one in the Directory (the company's Access tab).
        </p>
      )}
    </section>
  );
}
