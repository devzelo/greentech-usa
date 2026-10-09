import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Boxes, ClipboardList, Pencil, Check, X, Loader2, Upload, FileText, Trash2, Receipt, Lock, MapPin, Send } from "lucide-react";
import {
  fetchMyVendorWork, saveMyOffer, uploadMyOfferFile, deleteMyOfferFile, sendMyInvoice, withdrawMyInvoice, attachmentUrl,
  type MyVendorWork, type ApiVendorOffer, type ApiVendorInvoice, type OfferKind,
} from "../../lib/api";
import MoneyInput, { formatMoney, parseMoney } from "./MoneyInput";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";

/**
 * 2026-10-09 - the vendor's side of "when you add a vendor or a company in the BOQ or in the work
 * package, it shows up in their profile under the same project, so they can add their unit price,
 * total price and lead time, or upload documents or an invoice." Read first; Edit opens the
 * figures, Save sends them. Figures can change until GreenTech accepts them.
 */
const card = "rounded-2xl border border-slate-100 bg-white p-4";
const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10";
const lbl = "text-[10px] font-bold uppercase tracking-widest text-slate-400";
const btn = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary disabled:opacity-50";
const money = (v?: string) => (v ? formatMoney(v) : "");

const INVOICE_TONE: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700", Unpaid: "bg-blue-50 text-blue-700", "Partially Paid": "bg-indigo-50 text-indigo-700",
  Paid: "bg-emerald-50 text-emerald-700", Rejected: "bg-red-50 text-red-700", Disputed: "bg-red-50 text-red-700", Cancelled: "bg-slate-100 text-slate-500",
};
const invoiceLabel = (s: string) => (s === "Pending" ? "Waiting for approval" : s === "Unpaid" ? "Approved, to be paid" : s);

function OfferChip({ offer }: { offer?: ApiVendorOffer }) {
  if (!offer) return <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">Waiting for your price</span>;
  if (offer.status === "accepted") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700"><Lock size={10} /> Accepted</span>;
  return <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">Sent to GreenTech</span>;
}

/** One BOQ line or work package: its details, the company's figures, documents and invoices. */
function WorkRow({ kind, refId, title, details, qty, offer, invoices, onChanged }: {
  kind: OfferKind; refId: string; title: string; details: ReactNode; qty?: string;
  offer?: ApiVendorOffer; invoices: ApiVendorInvoice[]; onChanged: () => void;
}) {
  const { confirm, dialogs } = useDialogs();
  const locked = offer?.status === "accepted";
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ unitPrice: "", total: "", leadTime: "", notes: "" });
  const [totalTyped, setTotalTyped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [inv, setInv] = useState<{ number: string; amount: string; date: string; notes: string; file: File | null } | null>(null);
  const qtyN = parseMoney(qty || "");

  const startEdit = () => {
    setF({ unitPrice: offer?.unitPrice || "", total: offer?.total || "", leadTime: offer?.leadTime || "", notes: offer?.notes || "" });
    setTotalTyped(!!offer?.total && !!offer?.unitPrice && Math.abs(parseMoney(offer.unitPrice) * qtyN - parseMoney(offer.total)) > 0.005);
    setEdit(true);
  };
  // The total follows the unit price times the quantity, until it is typed by hand.
  const setUnit = (v: string) => setF((p) => ({ ...p, unitPrice: v, total: !totalTyped && qtyN && v ? String(Math.round(parseMoney(v) * qtyN * 100) / 100) : p.total }));
  const save = async () => {
    if (!f.unitPrice && !f.total) { toast("Enter a unit price or a total.", "error"); return; }
    setBusy(true);
    try { await saveMyOffer(kind, refId, f); setEdit(false); toast("Sent to GreenTech USA.", "success"); onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not save.", "error"); }
    finally { setBusy(false); }
  };
  const addFile = async (file: File) => {
    setUploading(true);
    try { await uploadMyOfferFile(kind, refId, file); toast("Document added.", "success"); onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : "Upload failed.", "error"); }
    finally { setUploading(false); }
  };
  const removeFile = async (fid: string, name: string) => {
    if (!(await confirm({ title: "Remove this document?", message: `${name} is taken off this line.`, confirmLabel: "Remove" }))) return;
    try { await deleteMyOfferFile(kind, refId, fid); onChanged(); } catch (e) { toast(e instanceof Error ? e.message : "Could not remove it.", "error"); }
  };
  const sendInvoice = async () => {
    if (!inv) return;
    if (!inv.file) { toast("Attach the invoice file.", "error"); return; }
    if (!(parseMoney(inv.amount) > 0)) { toast("Enter the invoice amount.", "error"); return; }
    setBusy(true);
    try { await sendMyInvoice(kind, refId, inv, inv.file); setInv(null); toast("Invoice sent. GreenTech will review it.", "success"); onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not send the invoice.", "error"); }
    finally { setBusy(false); }
  };
  const withdraw = async (iv: ApiVendorInvoice) => {
    if (!(await confirm({ title: "Withdraw this invoice?", message: `${iv.number ? `Invoice ${iv.number}` : "The invoice"} is taken back before GreenTech reviews it.`, confirmLabel: "Withdraw" }))) return;
    try { await withdrawMyInvoice(iv._id); onChanged(); } catch (e) { toast(e instanceof Error ? e.message : "Could not withdraw it.", "error"); }
  };

  return (
    <div className={card}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap break-words text-sm font-bold text-slate-800">{title}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">{details}</div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2"><OfferChip offer={offer} /></div>
      </div>

      {/* The figures: read first, Edit to change (until accepted). */}
      {!edit ? (
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            {kind === "boq" && <div><dt className={lbl}>Unit price</dt><dd className="text-sm font-bold tabular-nums text-slate-800">{money(offer?.unitPrice) || "-"}</dd></div>}
            <div><dt className={lbl}>Total price</dt><dd className="text-sm font-bold tabular-nums text-slate-800">{money(offer?.total) || "-"}</dd></div>
            <div><dt className={lbl}>Lead time</dt><dd className="text-sm font-bold text-slate-800">{offer?.leadTime || "-"}</dd></div>
            {offer?.notes && <div className="col-span-2 sm:col-span-1"><dt className={lbl}>Notes</dt><dd className="whitespace-pre-wrap text-xs text-slate-600">{offer.notes}</dd></div>}
          </dl>
          {locked
            ? <p className="text-[11px] text-slate-500">Accepted by GreenTech{offer?.acceptedAt ? ` on ${new Date(offer.acceptedAt).toLocaleDateString()}` : ""}. Ask them to reopen it to change it.</p>
            : <button type="button" onClick={startEdit} className={btn}><Pencil size={12} /> {offer ? "Edit" : "Enter prices"}</button>}
        </div>
      ) : (
        <div className="mt-3 space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {kind === "boq" && (
              <label className="space-y-1"><span className={lbl}>Unit price{qty ? ` (per ${qty.replace(/[\d.,\s]+/g, "") || "unit"})` : ""}</span>
                <MoneyInput value={f.unitPrice} onChange={setUnit} className={inp} placeholder="$0.00" /></label>
            )}
            <label className="space-y-1"><span className={lbl}>Total price</span>
              <MoneyInput value={f.total} onChange={(v) => { setTotalTyped(true); setF((p) => ({ ...p, total: v })); }} className={inp} placeholder="$0.00" /></label>
            <label className="space-y-1"><span className={lbl}>Lead time</span>
              <input value={f.leadTime} onChange={(e) => setF((p) => ({ ...p, leadTime: e.target.value }))} placeholder="e.g. 30 days, 6 weeks" maxLength={60} className={inp} /></label>
          </div>
          {kind === "boq" && qtyN > 0 && !totalTyped && <p className="text-[11px] text-slate-500">The total is the unit price times {qty}; type over it to change it.</p>}
          <label className="block space-y-1"><span className={lbl}>Notes (optional)</span>
            <textarea value={f.notes} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} rows={2} maxLength={2000} placeholder="Validity, what is included, delivery terms" className={`${inp} resize-y`} /></label>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setEdit(false)} disabled={busy} className={btn}><X size={12} /> Cancel</button>
            <button type="button" onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-primary disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save and send
            </button>
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(offer?.attachments || []).map((a) => (
          <span key={a._id} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600">
            <FileText size={11} className="shrink-0" />
            <a href={attachmentUrl(a.filePath, a.name)} target="_blank" rel="noreferrer" className="max-w-[14rem] truncate hover:text-primary" title={a.name}>{a.name}</a>
            {!locked && <button type="button" onClick={() => void removeFile(a._id, a.name)} aria-label={`Remove ${a.name}`} className="rounded p-0.5 text-slate-300 hover:text-red-500"><Trash2 size={11} /></button>}
          </span>
        ))}
        <label className={`${btn} cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}>
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Add document
          <input type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.txt" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void addFile(file); }} />
        </label>
        <button type="button" onClick={() => setInv(inv ? null : { number: "", amount: offer?.total || "", date: new Date().toISOString().slice(0, 10), notes: "", file: null })} className={btn}><Receipt size={12} /> Send invoice</button>
      </div>

      {/* A new invoice */}
      {inv && (
        <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1"><span className={lbl}>Invoice number</span><input value={inv.number} onChange={(e) => setInv({ ...inv, number: e.target.value })} maxLength={60} className={inp} /></label>
            <label className="space-y-1"><span className={lbl}>Amount</span><MoneyInput value={inv.amount} onChange={(v) => setInv({ ...inv, amount: v })} className={inp} placeholder="$0.00" /></label>
            <label className="space-y-1"><span className={lbl}>Date</span><input type="date" value={inv.date} onChange={(e) => setInv({ ...inv, date: e.target.value })} className={inp} /></label>
          </div>
          <label className="block space-y-1"><span className={lbl}>Notes (optional)</span><input value={inv.notes} onChange={(e) => setInv({ ...inv, notes: e.target.value })} maxLength={500} placeholder="What the invoice covers" className={inp} /></label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className={`${btn} cursor-pointer`}>
              <Upload size={12} /> {inv.file ? inv.file.name : "Attach the invoice"}
              <input type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => { const file = e.target.files?.[0] || null; e.target.value = ""; setInv({ ...inv, file }); }} />
            </label>
            <span className="flex gap-2">
              <button type="button" onClick={() => setInv(null)} disabled={busy} className={btn}><X size={12} /> Cancel</button>
              <button type="button" onClick={() => void sendInvoice()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send invoice
              </button>
            </span>
          </div>
        </div>
      )}

      {/* The invoices sent for it */}
      {invoices.length > 0 && (
        <ul className="mt-3 space-y-1">
          {invoices.map((iv) => (
            <li key={iv._id} className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              <Receipt size={12} className="text-slate-400" />
              <span className="font-bold text-slate-700">{iv.number ? `Invoice ${iv.number}` : "Invoice"}</span>
              <span className="tabular-nums">{money(iv.amount)}</span>
              <span className="text-slate-400">{iv.date}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${INVOICE_TONE[iv.status] || "bg-slate-100 text-slate-500"}`}>{invoiceLabel(iv.status)}</span>
              {iv.attachments?.[0] && <a href={attachmentUrl(iv.attachments[0].filePath, iv.attachments[0].name)} target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">View</a>}
              {iv.status === "Pending" && <button type="button" onClick={() => void withdraw(iv)} className="font-bold text-slate-400 hover:text-red-500">Withdraw</button>}
            </li>
          ))}
        </ul>
      )}
      {dialogs}
    </div>
  );
}

export default function VendorWorkSection() {
  const [data, setData] = useState<MyVendorWork | null>(null);
  const load = () => fetchMyVendorWork().then(setData).catch(() => setData({ company: null, projects: [], offers: [], invoices: [] }));
  useEffect(() => { void load(); }, []);
  // A notification links here (#vendor-work): bring the section into view once it is drawn.
  useEffect(() => {
    if (data && window.location.hash === "#vendor-work") document.getElementById("vendor-work")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data]);
  if (!data?.company) return null;

  const offerOf = (kind: OfferKind, refId: string) => data.offers.find((o) => o.kind === kind && o.refId === refId);
  const invoicesOf = (kind: OfferKind, refId: string) => data.invoices.filter((i) => i.sourceRef?.kind === kind && i.sourceRef?.refId === refId);
  const all = data.projects.flatMap((p) => [...p.items.map((i) => offerOf("boq", i._id)), ...p.packages.map((w) => offerOf("package", w._id))]);
  const waiting = all.filter((o) => !o).length;

  return (
    <section id="vendor-work" className="scroll-mt-24 rounded-[3rem] border border-slate-100 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-900">Your work with GreenTech USA</h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">The BOQ lines and work packages GreenTech has given {data.company.name}, by project. Enter your unit price, total and lead time, add documents, and send your invoices. You can change your figures until GreenTech accepts them.</p>
        </div>
        {all.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="rounded-xl bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-700">{waiting} to price</span>
            <span className="rounded-xl bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">{all.filter((o) => o?.status === "accepted").length} accepted</span>
          </div>
        )}
      </div>

      {data.projects.length === 0 ? (
        <p className="mt-6 text-xs italic text-slate-400">Nothing yet. When GreenTech names {data.company.name} on a BOQ line or a work package, it shows here.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {data.projects.map((p) => (
            <div key={p.projectId} className="rounded-3xl border border-slate-100 bg-slate-50/60 p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-display text-base font-bold text-slate-900">{p.name}</h3>
                <span className="text-[11px] font-bold text-slate-400">{p.projectId}</span>
                {p.location && <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><MapPin size={11} /> {p.location}</span>}
              </div>
              {p.items.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500"><ClipboardList size={13} /> BOQ lines ({p.items.length})</p>
                  {p.items.map((it) => (
                    <Fragment key={it._id}><WorkRow kind="boq" refId={it._id} title={it.description || "BOQ line"} qty={[it.qty, it.unit].filter(Boolean).join(" ")}
                      offer={offerOf("boq", it._id)} invoices={invoicesOf("boq", it._id)} onChanged={() => void load()}
                      details={<>
                        {it.category && <span>{it.category}</span>}
                        {(it.qty || it.unit) && <span>Qty <b className="text-slate-700">{[it.qty, it.unit].filter(Boolean).join(" ")}</b></span>}
                        {(it.brand || it.model) && <span>Brand {[it.brand, it.model].filter(Boolean).join(" ")}</span>}
                        {it.spec && <span className="whitespace-pre-wrap">Spec: {it.spec}</span>}
                        {it.needOnSiteDate && <span>Needed on site <b className="text-slate-700">{it.needOnSiteDate}</b></span>}
                      </>} /></Fragment>
                  ))}
                </div>
              )}
              {p.packages.length > 0 && (
                <div className={`space-y-2 ${p.items.length ? "mt-4" : ""}`}>
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500"><Boxes size={13} /> Work packages ({p.packages.length})</p>
                  {p.packages.map((w) => (
                    <Fragment key={w._id}><WorkRow kind="package" refId={w._id} title={w.name} offer={offerOf("package", w._id)} invoices={invoicesOf("package", w._id)} onChanged={() => void load()}
                      details={<>{w.description && <span className="whitespace-pre-wrap">{w.description}</span>}</>} /></Fragment>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
