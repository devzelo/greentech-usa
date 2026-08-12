import { Fragment, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, X, FileText, Upload, ChevronDown, ChevronRight, DollarSign, Link2, Wallet, Eye, Download } from "lucide-react";
import {
  fetchInvoices, addInvoice, updateInvoice, deleteInvoice,
  addInvoicePayment, deleteInvoicePayment, uploadPaymentReceipt, uploadInvoiceFile, deleteInvoiceFile,
  invoiceFromPO, fetchProcurementPOs, fetchVendors, attachmentUrl,
  invoicePaid, invoiceRemaining, fetchCompanies, COMPANY_CATEGORIES, fetchSignatories, fetchRfqs,
  type ApiInvoice, type ApiProcurementPO, type ApiVendor, type ApiCompany, type InvoiceLineItem, type InvoiceBank, type InvoiceInput, type ApiSignatory, type ApiRfq,
} from "../../lib/api";
import { buildPoPackage } from "../../lib/poPdf";
import { buildInvoicePdf } from "../../lib/invoicePdf";
import { downloadHtmlAsWord, htmlTable, escapeHtml } from "../../lib/wordExport";
import SaveStatus, { useSaveStatus } from "./SaveStatus";
import type { ProjectPdfInfo } from "../../lib/pdfProjectHeader";
import PdfPreviewModal from "./PdfPreviewModal";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import { useUnsavedGuard } from "../../lib/useUnsavedGuard";

// Invoice Sent / Invoice Received with real payments.
//   · Every invoice tracks its total, what's been paid, and what's left.
//   · Recording a payment on a RECEIVED invoice posts a matching row in Expenses automatically,
//     with the receipt attached — so paying a bill is tracked in one place.
//   · A vendor invoice on a Procurement PO can be pulled straight in ("From a purchase order").

const n = (s?: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });
const inp = "w-full px-2 py-1.5 rounded bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none text-xs font-medium";
const finp = "w-full bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10";

const STATUS_CLS: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-500",
  Sent: "bg-indigo-50 text-indigo-600",
  Unpaid: "bg-amber-50 text-amber-600",
  "Partially Paid": "bg-blue-50 text-blue-600",
  Paid: "bg-emerald-50 text-emerald-600",
  Overdue: "bg-red-50 text-red-600",
  Disputed: "bg-orange-50 text-orange-600",
  Rejected: "bg-red-50 text-red-600",
  Pending: "bg-amber-50 text-amber-600",
  Delayed: "bg-orange-50 text-orange-600",
  Cancelled: "bg-slate-100 text-slate-400",
};

const RECEIVER_KINDS = ["Client", "Contractor", "Lab", "Vendor", "Subcontractor", "Consultant", "Other"];
const BLANK_BANK: InvoiceBank = { name: "", accountName: "", accountNumber: "", iban: "", swift: "", routing: "" };
type BuilderDraft = {
  receiverKind: string; party: string; companyId: string; date: string; description: string;
  mode: "build" | "upload";
  lineItems: InvoiceLineItem[]; bank: InvoiceBank; terms: string;
  sections: Array<{ title: string; body: string }>; rfqId: string;
  signerName: string; signerTitle: string; signatureUrl: string; contractTotal: string;
};

export default function InvoiceLedger({ projectId, kind, canEdit, projectInfo, onExpensesChanged }: {
  projectId: string; kind: "sent" | "received"; canEdit: boolean;
  projectInfo?: ProjectPdfInfo;
  /** Called after a payment posts/removes an expense, so the Expenses tab can reload. */
  onExpensesChanged?: () => void;
}) {
  const isSent = kind === "sent";
  const [rows, setRows] = useState<ApiInvoice[]>([]);
  const [pos, setPOs] = useState<ApiProcurementPO[]>([]);
  const [vendors, setVendors] = useState<ApiVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<ApiInvoice | null>(null);
  const [pay, setPay] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), method: "Bank transfer", reference: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [poPicker, setPoPicker] = useState(false);
  // The PO document opened from a linked-PO chip in the table.
  const [poPreview, setPoPreview] = useState<{ title: string; fileName: string; build: () => Promise<Blob> } | null>(null);
  // New-invoice popup (Invoice Sent) — the client asked for a form instead of an inline blank row.
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState({ number: "", party: "", description: "", amount: "", date: new Date().toISOString().slice(0, 10) });
  const { confirm, dialogs } = useDialogs();

  // ── Invoice builder (CR-I-03/04/07) ─────────────────────────────────────────
  const [builderId, setBuilderId] = useState<string | null>(null);
  const [bDraft, setBDraft] = useState<BuilderDraft | null>(null);
  // CR-B-20 — while the invoice builder is open, warn before closing the window / leaving the site.
  useUnsavedGuard(!!builderId);
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [signatories, setSignatories] = useState<ApiSignatory[]>([]);
  const [rfqList, setRfqList] = useState<ApiRfq[]>([]);
  const [receiverPickerOpen, setReceiverPickerOpen] = useState(false);
  const [recvSearch, setRecvSearch] = useState("");
  useEffect(() => {
    fetchCompanies().then(setCompanies).catch(() => {});
    fetchSignatories().then(setSignatories).catch(() => {});
    fetchRfqs(projectId).then(setRfqList).catch(() => {});
  }, [projectId]);
  // Distinct saved banks from prior invoices (CR-I-04 bank dropdown) + templates (CR-I-07).
  const savedBanks = (() => { const seen = new Set<string>(); const out: InvoiceBank[] = []; for (const r of rows) { const b = r.bank; if (b?.name && !seen.has(b.name)) { seen.add(b.name); out.push(b); } } return out; })();
  const templates = rows.filter((r) => r.isTemplate);
  const saveAsTemplate = async (inv: ApiInvoice) => {
    try { const srv = await updateInvoice(projectId, inv._id, { isTemplate: !inv.isTemplate }); patch(srv); toast(srv.isTemplate ? "Saved as a reusable template." : "Removed from templates.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Failed.", "error"); }
  };
  const newFromTemplate = async (t: ApiInvoice) => {
    try {
      const row = await addInvoice(projectId, {
        type: kind, party: t.party, receiverKind: t.receiverKind, companyId: t.companyId, description: t.description,
        amount: t.amount, date: new Date().toISOString().slice(0, 10), status: isSent ? "Draft" : "Unpaid",
        lineItems: t.lineItems, bank: t.bank, terms: t.terms, sections: t.sections, signerName: t.signerName,
        signerTitle: t.signerTitle, signatureUrl: t.signatureUrl, contractTotal: t.contractTotal, isTemplate: false,
      });
      setRows((p) => [...p, row]); setNewOpen(false); openBuilder(row); toast(`New invoice #${row.number} from template.`, "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Failed.", "error"); }
  };

  const lineTotal = (items: InvoiceLineItem[]) => items.reduce((s, it) => s + n(it.qty) * n(it.unitPrice), 0);
  const openBuilder = (inv: ApiInvoice) => {
    setBuilderId(inv._id);
    setBDraft({
      receiverKind: inv.receiverKind || "", party: inv.party || "", companyId: inv.companyId || "",
      date: inv.date || new Date().toISOString().slice(0, 10), description: inv.description || "",
      mode: (inv.lineItems && inv.lineItems.length) || !(inv.attachments?.length) ? "build" : "upload",
      lineItems: inv.lineItems?.length ? inv.lineItems : [{ description: "", qty: "1", unitPrice: "" }],
      bank: inv.bank ? { ...inv.bank } : { ...BLANK_BANK }, terms: inv.terms || "",
      sections: inv.sections ? inv.sections.map((s) => ({ ...s })) : [], rfqId: inv.rfqId || "",
      signerName: inv.signerName || "", signerTitle: inv.signerTitle || "", signatureUrl: inv.signatureUrl || "",
      contractTotal: inv.contractTotal || "",
    });
  };
  const setB = (p: Partial<BuilderDraft>) => setBDraft((d) => (d ? { ...d, ...p } : d));
  // Build the update payload from the current builder draft (shared by manual save + autosave).
  const invoiceBody = (d: BuilderDraft): InvoiceInput => {
    const body: InvoiceInput = {
      receiverKind: d.receiverKind, party: d.party.trim(), companyId: d.companyId,
      date: d.date, description: d.description,
      lineItems: d.mode === "build" ? d.lineItems : [],
      bank: d.bank, terms: d.terms, sections: d.sections, rfqId: d.rfqId,
      signerName: d.signerName, signerTitle: d.signerTitle, signatureUrl: d.signatureUrl,
      contractTotal: d.contractTotal,
    };
    if (d.mode === "build") body.amount = String(lineTotal(d.lineItems));
    return body;
  };
  const saveBuilder = async (status?: string) => {
    if (!builderId || !bDraft) return;
    setSaving(true);
    const body = invoiceBody(bDraft);
    if (status) body.status = status;   // CR-I-01 — Save as Draft / Send set the status
    try { const srv = await updateInvoice(projectId, builderId, body); patch(srv); setBuilderId(null); setBDraft(null); toast(status === "Sent" ? "Invoice sent." : "Invoice saved.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Save failed.", "error"); }
    finally { setSaving(false); }
  };
  // CR-B-14b — silent autosave of the invoice builder every 45s while it's open, with a status badge.
  const invSave = useSaveStatus();
  const autoSaveInvRef = useRef<() => void>(() => {});
  autoSaveInvRef.current = () => {
    if (!builderId || !bDraft || saving) return;
    void invSave.track(updateInvoice(projectId, builderId, invoiceBody(bDraft))).then((srv) => patch(srv)).catch(() => {});
  };
  useEffect(() => {
    if (!builderId) return;
    const t = setInterval(() => autoSaveInvRef.current(), 45000);
    return () => clearInterval(t);
  }, [builderId]);
  const duplicateInvoice = async (inv: ApiInvoice) => {
    try {
      const row = await addInvoice(projectId, {
        type: kind, party: inv.party, receiverKind: inv.receiverKind, companyId: inv.companyId,
        description: inv.description, amount: inv.amount, date: new Date().toISOString().slice(0, 10),
        status: isSent ? "Draft" : "Unpaid", lineItems: inv.lineItems, bank: inv.bank, terms: inv.terms,
        signerName: inv.signerName, signerTitle: inv.signerTitle, signatureUrl: inv.signatureUrl, contractTotal: inv.contractTotal,
      });
      setRows((p) => [...p, row]); openBuilder(row); toast(`Duplicated as #${row.number}.`, "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not duplicate.", "error"); }
  };
  // Pick a receiver from the Companies Directory → fills the party + kind.
  const pickReceiver = (c: ApiCompany) => {
    const kindMap: Record<string, string> = { client: "Client", subcontractor: "Subcontractor", vendor: "Vendor", consultant: "Consultant", contractor: "Contractor" };
    setB({ party: c.name, companyId: c._id, receiverKind: kindMap[c.category] || "Other" });
    setReceiverPickerOpen(false);
  };

  const viewPO = (po: ApiProcurementPO) => setPoPreview({
    title: `Purchase Order ${po.poNo}${po.vendorName ? ` · ${po.vendorName}` : ""}`,
    fileName: `PO_${po.poNo}.pdf`,
    build: async () => (await buildPoPackage(po, vendors.find((v) => v._id === po.vendorId), projectInfo)).blob,
  });

  const heading = isSent ? "Invoices Sent" : "Invoices Received";
  const partyLabel = isSent ? "Client" : "Vendor / Subcontractor";
  const numLabel = isSent ? "Invoice #" : "Bill #";
  const dateLabel = isSent ? "Date sent" : "Date received";
  const statusOpts = isSent
    ? ["Draft", "Sent", "Pending", "Delayed", "Unpaid", "Partially Paid", "Paid", "Overdue", "Rejected", "Cancelled"]
    : ["Pending", "Delayed", "Unpaid", "Partially Paid", "Paid", "Overdue", "Disputed", "Rejected", "Cancelled"];

  const load = async () => {
    setLoading(true);
    try {
      const [inv, p, v] = await Promise.all([
        fetchInvoices(projectId, kind),
        fetchProcurementPOs(projectId).catch(() => [] as ApiProcurementPO[]),
        fetchVendors(projectId).catch(() => [] as ApiVendor[]),
      ]);
      setRows(inv); setPOs(p); setVendors(v);
    } catch { /* keep */ } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [projectId, kind]);

  const patch = (inv: ApiInvoice) => setRows((p) => p.map((x) => (x._id === inv._id ? inv : x)));
  const edit = (id: string, field: keyof ApiInvoice, value: string) =>
    setRows((p) => p.map((r) => (r._id === id ? { ...r, [field]: value } : r)));
  const save = (id: string, field: keyof ApiInvoice, value: string) =>
    updateInvoice(projectId, id, { [field]: value })
      // Merge only the saved field plus the server-derived status — replacing the whole row
      // would clobber whatever the user is typing in another cell right now.
      .then((srv) => setRows((p) => p.map((r) => (r._id === id ? { ...r, [field]: srv[field], status: srv.status } : r))))
      .catch((err) => toast(err instanceof Error ? err.message : "Save failed.", "error"));

  // Totals across the whole tab — the client asked for these at the top.
  const total = rows.reduce((s, r) => s + n(r.amount), 0);
  const paid = rows.reduce((s, r) => s + invoicePaid(r), 0);
  const remaining = Math.max(0, total - paid);

  // CR-I-01/T1 — export the ledger to CSV (opens in Excel). PDF export lives per-invoice in the builder.
  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [numLabel, partyLabel, "Kind", dateLabel, "Amount", "Paid", "Remaining", "Status"];
    const lines = rows.map((r) => [r.number, r.party, r.receiverKind || "", r.date, n(r.amount), invoicePaid(r), invoiceRemaining(r), r.status].map(esc).join(","));
    const csv = [header.map(esc).join(","), ...lines].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${heading.replace(/\s+/g, "_")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // New invoice via a form popup (client request) — fill the fields, then it's added as a row.
  const openNew = () => {
    setDraft({ number: "", party: "", description: "", amount: "", date: new Date().toISOString().slice(0, 10) });
    setNewOpen(true);
  };
  const submitNew = async () => {
    setSaving(true);
    try {
      const row = await addInvoice(projectId, {
        type: kind, number: draft.number.trim(), party: draft.party.trim(),
        description: draft.description.trim(), amount: draft.amount.trim(), date: draft.date,
        status: isSent ? "Sent" : "Unpaid",
      });
      setRows((p) => [...p, row]); setNewOpen(false);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not add.", "error"); }
    finally { setSaving(false); }
  };
  const removeRow = async (row: ApiInvoice) => {
    if (!(await confirm({ title: "Delete invoice?", message: "Its payments and the expenses they created are removed too.", confirmLabel: "Delete" }))) return;
    try { await deleteInvoice(projectId, row._id); setRows((p) => p.filter((r) => r._id !== row._id)); onExpensesChanged?.(); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  const pullFromPO = async (po: ApiProcurementPO) => {
    if (!n(po.invoiceAmount) && !n(po.total)) { toast(`PO ${po.poNo} has no invoice amount yet — add it on the PO first.`, "error"); return; }
    try {
      const inv = await invoiceFromPO(projectId, po._id);
      setRows((p) => (p.some((r) => r._id === inv._id) ? p.map((r) => (r._id === inv._id ? inv : r)) : [...p, inv]));
      setPoPicker(false); setOpenId(inv._id);
      toast(`Invoice for PO ${po.poNo} added.`, "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not pull the PO invoice.", "error"); }
  };
  const openPay = (row: ApiInvoice) => {
    setPay({ amount: String(invoiceRemaining(row) || ""), date: new Date().toISOString().slice(0, 10), method: "Bank transfer", reference: "", notes: "" });
    setPayFor(row);
  };
  const submitPay = async () => {
    if (!payFor) return;
    if (!n(pay.amount)) { toast("Enter the amount paid.", "error"); return; }
    setSaving(true);
    try {
      patch(await addInvoicePayment(projectId, payFor._id, pay));
      if (!isSent) onExpensesChanged?.();
      toast(isSent ? "Payment recorded." : "Payment recorded — added to Expenses.", "success");
      setPayFor(null);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not record the payment.", "error"); }
    finally { setSaving(false); }
  };
  const removePayment = async (row: ApiInvoice, pid: string) => {
    if (!(await confirm({ title: "Remove payment?", message: "The linked expense row is removed too.", confirmLabel: "Remove" }))) return;
    try { patch(await deleteInvoicePayment(projectId, row._id, pid)); onExpensesChanged?.(); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not remove.", "error"); }
  };

  if (loading) return <div className="py-12 flex justify-center text-slate-300"><Loader2 size={22} className="animate-spin" /></div>;

  return (
    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-xl font-display font-bold text-slate-900">{heading}</h3>
          <p className="text-xs font-medium text-slate-400 mt-1">
            {rows.length} invoice{rows.length === 1 ? "" : "s"}. Record payments against each one — what's paid and what's left is worked out for you.
            {!isSent && " Every payment is also logged in Expenses with its receipt."}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {rows.length > 0 && (
            <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50" title="Export the ledger to CSV (opens in Excel)"><Download size={13} /> Export Excel</button>
          )}
          {canEdit && !isSent && (
            <button onClick={() => setPoPicker(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50"><Link2 size={13} /> From a purchase order</button>
          )}
          {canEdit && <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary"><Plus size={13} /> {isSent ? "New invoice" : "Log invoice"}</button>}
        </div>
      </div>

      {/* Totals — how much was invoiced, paid and is still outstanding */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-lg font-display font-bold text-slate-700 leading-none">{rows.length}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Invoices</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/10">
            <span className="text-lg font-display font-bold text-primary leading-none">{money(total)}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{isSent ? "Total invoiced" : "Total billed"}</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100">
            <span className="text-lg font-display font-bold text-emerald-600 leading-none">{money(paid)}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{isSent ? "Received" : "Paid"}</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-100">
            <span className="text-lg font-display font-bold text-amber-600 leading-none">{money(remaining)}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Remaining</span>
          </span>
        </div>
      )}

      <div className="overflow-x-auto border border-slate-100 rounded-2xl">
        <table className="w-full min-w-[1000px] text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="w-8 px-3 py-3" />
              {[numLabel, partyLabel, "Description", "Total", "Paid", "Remaining", dateLabel, "Status", ""].map((h) => (
                <th key={h} className="text-left px-3 py-3 font-bold text-slate-500 uppercase tracking-widest text-[10px] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-400 italic">No invoices yet.</td></tr>}
            {rows.map((row) => {
              const isOpen = openId === row._id;
              const rPaid = invoicePaid(row), rLeft = invoiceRemaining(row);
              const po = pos.find((p) => p._id === row.poId);
              return (
                <Fragment key={row._id}>
                  <tr className="hover:bg-slate-50/40 align-top">
                    <td className="px-3 py-2"><button onClick={() => setOpenId(isOpen ? null : row._id)} className="text-slate-400 hover:text-slate-900">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></td>
                    <td className="px-1 py-1"><input className={inp} value={row.number} disabled={!canEdit} onChange={(e) => edit(row._id, "number", e.target.value)} onBlur={(e) => save(row._id, "number", e.target.value)} /></td>
                    <td className="px-1 py-1">
                      <input className={inp} value={row.party} disabled={!canEdit} onChange={(e) => edit(row._id, "party", e.target.value)} onBlur={(e) => save(row._id, "party", e.target.value)} />
                      {po && <button onClick={() => viewPO(po)} title={`Open the PO ${po.poNo} document`} className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/5 border border-primary/15 text-[9px] font-bold text-primary hover:bg-primary hover:text-white transition-colors"><Eye size={9} /> PO {po.poNo}</button>}
                    </td>
                    <td className="px-1 py-1"><input className={inp} value={row.description} disabled={!canEdit} onChange={(e) => edit(row._id, "description", e.target.value)} onBlur={(e) => save(row._id, "description", e.target.value)} placeholder="—" /></td>
                    <td className="px-1 py-1"><input className={`${inp} font-bold`} value={row.amount} disabled={!canEdit} onChange={(e) => edit(row._id, "amount", e.target.value)} onBlur={(e) => save(row._id, "amount", e.target.value)} placeholder="0.00" /></td>
                    <td className="px-3 py-2 font-bold text-emerald-600 whitespace-nowrap">{rPaid ? money(rPaid) : "—"}</td>
                    <td className={`px-3 py-2 font-bold whitespace-nowrap ${rLeft > 0 ? "text-amber-600" : "text-slate-400"}`}>{n(row.amount) ? money(rLeft) : "—"}</td>
                    <td className="px-1 py-1"><input type="date" className={inp} value={row.date} disabled={!canEdit} onChange={(e) => edit(row._id, "date", e.target.value)} onBlur={(e) => save(row._id, "date", e.target.value)} /></td>
                    <td className="px-1 py-1">
                      <select className={`${inp} font-bold`} value={row.status} disabled={!canEdit} onChange={(e) => { edit(row._id, "status", e.target.value); save(row._id, "status", e.target.value); }}>
                        {statusOpts.map((o) => <option key={o} value={o}>{o}</option>)}
                        {!statusOpts.includes(row.status) && <option value={row.status}>{row.status}</option>}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && <button onClick={() => openBuilder(row)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-primary hover:text-white" title="Open the full invoice builder — line items, bank, signature, payment application"><FileText size={11} /> Builder</button>}
                        {canEdit && <button onClick={() => duplicateInvoice(row)} className="p-1.5 rounded text-slate-300 hover:text-primary" title="Duplicate this invoice"><Plus size={13} /></button>}
                        {canEdit && <button onClick={() => openPay(row)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-bold hover:bg-emerald-100" title={isSent ? "Record an amount received from the client" : "Record a payment made"}><Wallet size={11} /> {isSent ? "Received" : "Pay"}</button>}
                        {canEdit && <button onClick={() => removeRow(row)} className="p-1.5 rounded text-slate-300 hover:text-red-500" title="Delete"><Trash2 size={13} /></button>}
                      </div>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="bg-slate-50/40">
                      <td colSpan={10} className="px-6 py-4 space-y-3">
                        {/* Payments */}
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Payments ({row.payments.length})</p>
                          {row.payments.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic">No payments recorded yet.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {row.payments.map((p) => (
                                <div key={p._id} className="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-slate-100 px-3 py-2">
                                  <span className="text-xs font-bold text-emerald-700">{money(n(p.amount))}</span>
                                  <span className="text-[11px] text-slate-500">{p.date}</span>
                                  {p.method && <span className="text-[11px] text-slate-500">· {p.method}</span>}
                                  {p.reference && <span className="text-[11px] text-slate-400">· ref {p.reference}</span>}
                                  {p.notes && <span className="text-[11px] text-slate-400 truncate max-w-[16rem]">· {p.notes}</span>}
                                  {p.expenseId && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-500 uppercase tracking-wider">In Expenses</span>}
                                  <div className="flex items-center gap-1.5 ml-auto">
                                    {p.attachments.map((a) => (
                                      <a key={a._id} href={attachmentUrl(a.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline max-w-[10rem] truncate" title={a.name}><FileText size={10} />{a.name}</a>
                                    ))}
                                    {canEdit && (
                                      <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 cursor-pointer hover:bg-slate-200" title="Upload the receipt / proof">
                                        <Upload size={10} /> Receipt
                                        <input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { patch(await uploadPaymentReceipt(projectId, row._id, p._id, f)); } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); } } e.target.value = ""; }} />
                                      </label>
                                    )}
                                    {canEdit && <button onClick={() => removePayment(row, p._id)} className="text-slate-300 hover:text-red-500"><X size={12} /></button>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* The invoice document itself */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Invoice document</span>
                          {row.attachments.map((a) => (
                            <span key={a._id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-white border border-slate-100 text-[10px] font-bold text-slate-600">
                              <a href={attachmentUrl(a.filePath)} target="_blank" rel="noreferrer" className="hover:text-primary max-w-[12rem] truncate inline-flex items-center gap-1" title={a.name}><FileText size={10} />{a.name}</a>
                              {canEdit && <button onClick={async () => { try { patch(await deleteInvoiceFile(projectId, row._id, a._id)); } catch { /* ignore */ } }} className="text-slate-300 hover:text-red-500"><X size={11} /></button>}
                            </span>
                          ))}
                          {row.attachments.length === 0 && <span className="text-[11px] text-slate-400 italic">none</span>}
                          {canEdit && (
                            <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 cursor-pointer hover:bg-slate-200">
                              <Upload size={10} /> Upload
                              <input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { patch(await uploadInvoiceFile(projectId, row._id, f)); } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); } } e.target.value = ""; }} />
                            </label>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-100 bg-slate-50/60">
                <td colSpan={4} className="px-3 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Totals</td>
                <td className="px-3 py-2.5 font-bold text-slate-900 whitespace-nowrap">{money(total)}</td>
                <td className="px-3 py-2.5 font-bold text-emerald-600 whitespace-nowrap">{money(paid)}</td>
                <td className="px-3 py-2.5 font-bold text-amber-600 whitespace-nowrap">{money(remaining)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {dialogs}
      {poPreview && <PdfPreviewModal title={poPreview.title} fileName={poPreview.fileName} build={poPreview.build} onClose={() => setPoPreview(null)} />}

      {/* CR-I-03/04/07 — the full invoice builder */}
      {builderId && bDraft && (() => {
        const cur = rows.find((r) => r._id === builderId);
        const thisAmount = bDraft.mode === "build" ? lineTotal(bDraft.lineItems) : n(cur?.amount);
        const contract = n(bDraft.contractTotal);
        const prevInvoiced = rows.filter((r) => r._id !== builderId).reduce((s, r) => s + n(r.amount), 0);
        const totalInvoiced = prevInvoiced + thisAmount;
        const balance = contract ? contract - totalInvoiced : 0;
        return (
          <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl my-6">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
                <div className="flex items-center gap-3 min-w-0">
                  <h3 className="text-base font-bold text-slate-900 truncate">{isSent ? "Invoice" : "Bill"} #{cur?.number} — builder</h3>
                  {/* CR-B-14b — autosave status. */}
                  <SaveStatus {...invSave} />
                </div>
                <button onClick={() => { setBuilderId(null); setBDraft(null); }} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                {/* Receiver (CR-I-03) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{isSent ? "Send to" : "From"} — type
                    <select className={`${finp} mt-1 font-bold`} value={bDraft.receiverKind} onChange={(e) => setB({ receiverKind: e.target.value })}>
                      <option value="">Choose…</option>{RECEIVER_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select></label>
                  <label className="sm:col-span-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{isSent ? "Receiver" : "Sender"} name
                    <div className="flex items-center gap-1.5 mt-1">
                      <input className={finp} value={bDraft.party} onChange={(e) => setB({ party: e.target.value })} placeholder="Company / person to bill" />
                      <button onClick={() => { setReceiverPickerOpen(true); setRecvSearch(""); }} className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary"><FileText size={11} /> Directory</button>
                    </div></label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Date<input type="date" className={`${finp} mt-1`} value={bDraft.date} onChange={(e) => setB({ date: e.target.value })} /></label>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reference / description<input className={`${finp} mt-1`} value={bDraft.description} onChange={(e) => setB({ description: e.target.value })} placeholder="e.g. Progress claim #2" /></label>
                </div>

                {/* Build vs upload (CR-I-04) */}
                <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[11px] font-bold">
                  {(["build", "upload"] as const).map((m) => (
                    <button key={m} onClick={() => setB({ mode: m })} className={`px-3 py-1.5 ${bDraft.mode === m ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{m === "build" ? "Build line items" : "Upload invoice"}</button>
                  ))}
                </div>

                {bDraft.mode === "build" ? (
                  <div className="border border-slate-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-[9px] uppercase tracking-widest text-slate-400"><tr>
                        <th className="text-left px-2 py-2 w-28">Date</th><th className="text-left px-3 py-2">Description</th><th className="text-left px-2 py-2 w-16">Qty</th><th className="text-left px-2 py-2 w-24">Unit price</th><th className="text-right px-3 py-2 w-28">Total</th><th className="text-left px-2 py-2 w-32">Remarks</th><th className="w-8" />
                      </tr></thead>
                      <tbody>
                        {bDraft.lineItems.map((it, i) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-2 py-1"><input type="date" className={inp} value={it.date || ""} onChange={(e) => setB({ lineItems: bDraft.lineItems.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} /></td>
                            <td className="px-2 py-1"><input className={inp} value={it.description} onChange={(e) => setB({ lineItems: bDraft.lineItems.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} placeholder="Item / service" /></td>
                            <td className="px-2 py-1"><input className={inp} value={it.qty} onChange={(e) => setB({ lineItems: bDraft.lineItems.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })} /></td>
                            <td className="px-2 py-1"><input className={inp} value={it.unitPrice} onChange={(e) => setB({ lineItems: bDraft.lineItems.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)) })} placeholder="0.00" /></td>
                            <td className="px-3 py-1 text-right font-bold text-slate-700 whitespace-nowrap">{money(n(it.qty) * n(it.unitPrice))}</td>
                            <td className="px-2 py-1"><input className={inp} value={it.remarks || ""} onChange={(e) => setB({ lineItems: bDraft.lineItems.map((x, j) => (j === i ? { ...x, remarks: e.target.value } : x)) })} placeholder="—" /></td>
                            <td className="px-2 py-1 text-right"><button onClick={() => setB({ lineItems: bDraft.lineItems.filter((_, j) => j !== i) })} className="text-slate-300 hover:text-red-500"><X size={13} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-100 bg-slate-50/60">
                          <td colSpan={4} className="px-3 py-2"><button onClick={() => setB({ lineItems: [...bDraft.lineItems, { description: "", qty: "1", unitPrice: "", date: "", remarks: "" }] })} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"><Plus size={12} /> Add line</button></td>
                          <td className="px-3 py-2 text-right font-display font-bold text-primary whitespace-nowrap">{money(lineTotal(bDraft.lineItems))}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                    <p className="text-[11px] font-bold text-slate-500">Uploaded invoice file(s)</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {(cur?.attachments || []).map((a) => (
                        <a key={a._id} href={attachmentUrl(a.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:text-primary"><FileText size={10} /> {a.name}</a>
                      ))}
                      {(cur?.attachments || []).length === 0 && <span className="text-[10px] text-slate-400 italic">No file yet.</span>}
                      <label className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary cursor-pointer"><Upload size={11} /> Upload<input type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f && cur) { try { const srv = await uploadInvoiceFile(projectId, cur._id, f); patch(srv); } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); } } e.target.value = ""; }} /></label>
                    </div>
                    <p className="text-[10px] text-slate-400">Enter the invoice total on the row after uploading (or switch to “Build line items”).</p>
                  </div>
                )}

                {/* Bank information (CR-I-04) */}
                <details className="bg-slate-50 rounded-2xl p-4">
                  <summary className="text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer">Bank information</summary>
                  {savedBanks.length > 0 && (
                    <select className={`${finp} mt-3 font-bold`} value="" onChange={(e) => { const b = savedBanks.find((x) => x.name === e.target.value); if (b) setB({ bank: { ...b } }); }}>
                      <option value="">Choose a saved bank… (fills the block)</option>
                      {savedBanks.map((b, i) => <option key={i} value={b.name}>{b.name}{b.accountNumber ? ` · ${b.accountNumber}` : ""}</option>)}
                    </select>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                    <input className={finp} placeholder="Bank name" value={bDraft.bank.name} onChange={(e) => setB({ bank: { ...bDraft.bank, name: e.target.value } })} />
                    <input className={finp} placeholder="Account name" value={bDraft.bank.accountName} onChange={(e) => setB({ bank: { ...bDraft.bank, accountName: e.target.value } })} />
                    <input className={finp} placeholder="Account number" value={bDraft.bank.accountNumber} onChange={(e) => setB({ bank: { ...bDraft.bank, accountNumber: e.target.value } })} />
                    <input className={finp} placeholder="IBAN" value={bDraft.bank.iban} onChange={(e) => setB({ bank: { ...bDraft.bank, iban: e.target.value } })} />
                    <input className={finp} placeholder="SWIFT/BIC" value={bDraft.bank.swift} onChange={(e) => setB({ bank: { ...bDraft.bank, swift: e.target.value } })} />
                    <input className={finp} placeholder="Routing" value={bDraft.bank.routing} onChange={(e) => setB({ bank: { ...bDraft.bank, routing: e.target.value } })} />
                  </div>
                </details>

                {/* Extra sections (CR-I-04 "add sections as needed") */}
                <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Additional sections</p><button onClick={() => setB({ sections: [...bDraft.sections, { title: "", body: "" }] })} className="text-[11px] font-bold text-primary hover:underline">+ Add section</button></div>
                  {bDraft.sections.length === 0 && <p className="text-[11px] text-slate-400 italic">None. Add T&amp;C detail, scope notes, etc.</p>}
                  {bDraft.sections.map((s, i) => (
                    <div key={i} className="space-y-1 border-l-2 border-primary/30 pl-2">
                      <div className="flex items-center gap-1.5"><input className={`${finp} font-bold`} placeholder="Section title" value={s.title} onChange={(e) => setB({ sections: bDraft.sections.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /><button onClick={() => setB({ sections: bDraft.sections.filter((_, j) => j !== i) })} className="text-slate-300 hover:text-red-500 shrink-0"><X size={15} /></button></div>
                      <textarea rows={2} className={`${finp} resize-y`} placeholder="Section content" value={s.body} onChange={(e) => setB({ sections: bDraft.sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} />
                    </div>
                  ))}
                </div>

                {/* CR-I-08 — link a received bill to an RFQ (in addition to the PO link). */}
                {!isSent && rfqList.length > 0 && (
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Linked RFQ
                    <select className={`${finp} mt-1`} value={bDraft.rfqId} onChange={(e) => setB({ rfqId: e.target.value })}>
                      <option value="">None</option>
                      {rfqList.map((r) => <option key={r._id} value={r._id}>RFQ #{r.rfqNo}{r.title ? ` · ${r.title}` : ""}</option>)}
                    </select></label>
                )}

                {/* T&C + signature (CR-I-04) */}
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Terms &amp; conditions<textarea rows={2} className={`${finp} mt-1 resize-y`} value={bDraft.terms} onChange={(e) => setB({ terms: e.target.value })} placeholder="Payment due within 30 days…" /></label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Signatory
                    <select className={`${finp} mt-1`} value={signatories.find((s) => s.name === bDraft.signerName && s.signatureUrl === bDraft.signatureUrl)?.id || ""} onChange={(e) => { const s = signatories.find((x) => x.id === e.target.value); if (s) setB({ signerName: s.name, signerTitle: s.title || "", signatureUrl: s.signatureUrl || "" }); }}>
                      <option value="">Choose…</option>{signatories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></label>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Signer name<input className={`${finp} mt-1`} value={bDraft.signerName} onChange={(e) => setB({ signerName: e.target.value })} /></label>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Signer title<input className={`${finp} mt-1`} value={bDraft.signerTitle} onChange={(e) => setB({ signerTitle: e.target.value })} /></label>
                </div>

                {/* Payment Application (CR-I-07) */}
                <div className="bg-primary/[0.04] border border-primary/15 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Payment Application</p>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">Total contract<input className={`${finp} w-32`} value={bDraft.contractTotal} onChange={(e) => setB({ contractTotal: e.target.value })} placeholder="0.00" /></label>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="bg-white rounded-xl p-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Contract</p><p className="text-sm font-bold text-slate-800">{money(contract)}</p></div>
                    <div className="bg-white rounded-xl p-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Previously invoiced</p><p className="text-sm font-bold text-slate-800">{money(prevInvoiced)}</p></div>
                    <div className="bg-white rounded-xl p-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">This invoice</p><p className="text-sm font-bold text-primary">{money(thisAmount)}</p></div>
                    <div className="bg-white rounded-xl p-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Balance to finish</p><p className={`text-sm font-bold ${balance < 0 ? "text-red-600" : "text-slate-800"}`}>{money(balance)}</p></div>
                  </div>
                  <p className="text-[10px] text-slate-400">{rows.length} invoice{rows.length === 1 ? "" : "s"} on this project · Total invoiced to date {money(totalInvoiced)}.</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-3xl">
                <div className="flex items-center gap-2">
                  <button onClick={() => cur && duplicateInvoice(cur)} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 inline-flex items-center gap-1.5"><Plus size={13} /> Duplicate</button>
                  <button onClick={() => cur && saveAsTemplate(cur)} className={`px-3 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 ${cur?.isTemplate ? "border-primary text-primary bg-primary/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{cur?.isTemplate ? "★ Template" : "Save as template"}</button>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => {
                    const merged: ApiInvoice = { ...(cur as ApiInvoice), receiverKind: bDraft.receiverKind, party: bDraft.party, date: bDraft.date, description: bDraft.description, lineItems: bDraft.mode === "build" ? bDraft.lineItems : [], amount: bDraft.mode === "build" ? String(lineTotal(bDraft.lineItems)) : cur?.amount || "", bank: bDraft.bank, terms: bDraft.terms, signerName: bDraft.signerName, signerTitle: bDraft.signerTitle, signatureUrl: bDraft.signatureUrl, contractTotal: bDraft.contractTotal };
                    setPoPreview({ title: `${isSent ? "Invoice" : "Bill"} #${cur?.number}`, fileName: `Invoice_${cur?.number || "draft"}.pdf`, build: () => buildInvoicePdf(merged, { projectInfo, allInvoices: rows }) });
                  }} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 inline-flex items-center gap-1.5"><Eye size={13} /> Preview PDF</button>
                  {/* CR-B-14a — Word export. */}
                  <button onClick={() => {
                    const lt = bDraft.mode === "build" ? lineTotal(bDraft.lineItems) : n(cur?.amount);
                    const rows = (bDraft.mode === "build" ? bDraft.lineItems : []).map((it) => [it.date || "", it.description || "", it.qty || "", it.unitPrice || "", money(n(it.qty) * n(it.unitPrice)), it.remarks || ""]);
                    const body = `<h1>${isSent ? "Invoice" : "Bill"} #${escapeHtml(cur?.number || "")}</h1>`
                      + `<p class="muted">${escapeHtml(bDraft.receiverKind || "")} · ${escapeHtml(bDraft.party || "")} · ${escapeHtml(bDraft.date || "")}</p>`
                      + (bDraft.description ? `<p>${escapeHtml(bDraft.description)}</p>` : "")
                      + (rows.length ? htmlTable(["Date", "Description", "Qty", "Unit price", "Total", "Remarks"], rows, [2, 3, 4]) : "")
                      + `<p class="right"><strong>Total: ${escapeHtml(money(lt))}</strong></p>`
                      + (bDraft.terms ? `<h2>Terms</h2><p>${escapeHtml(bDraft.terms)}</p>` : "")
                      + (bDraft.bank?.name ? `<h2>Bank information</h2><p>${escapeHtml(bDraft.bank.name)}<br/>${escapeHtml(bDraft.bank.accountName || "")} ${escapeHtml(bDraft.bank.accountNumber || "")}<br/>${escapeHtml(bDraft.bank.iban || "")} ${escapeHtml(bDraft.bank.swift || "")}</p>` : "")
                      + (bDraft.signerName ? `<p style="margin-top:24pt">_________________________<br/>${escapeHtml(bDraft.signerName)}${bDraft.signerTitle ? `, ${escapeHtml(bDraft.signerTitle)}` : ""}</p>` : "");
                    downloadHtmlAsWord(`Invoice ${cur?.number || ""}`, body, `Invoice_${cur?.number || "draft"}`);
                  }} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 inline-flex items-center gap-1.5"><FileText size={13} /> Word</button>
                  {/* CR-B-14a — confirm before closing so changes aren't lost accidentally. */}
                  <button onClick={async () => { if (await confirm({ title: "Are you sure you want to close?", message: "Any unsaved changes to this invoice will be lost.", confirmLabel: "Close", cancelLabel: "Keep editing", danger: true })) { setBuilderId(null); setBDraft(null); } }} disabled={saving} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold disabled:opacity-50">Close</button>
                  <button onClick={() => saveBuilder("Draft")} disabled={saving} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 disabled:opacity-50">Save as Draft</button>
                  <button onClick={() => saveBuilder()} disabled={saving} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary disabled:opacity-50 inline-flex items-center gap-1.5">{saving && <Loader2 size={13} className="animate-spin" />} Save</button>
                  {isSent && <button onClick={() => saveBuilder("Sent")} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/80 disabled:opacity-50">Send</button>}
                </div>
              </div>

              {/* Receiver picker (Directory) */}
              {receiverPickerOpen && (
                <div className="absolute inset-0 z-30 flex items-start justify-center bg-slate-900/40 rounded-3xl p-4 overflow-y-auto" onClick={() => setReceiverPickerOpen(false)}>
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-6" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100"><h4 className="text-sm font-bold text-slate-900">Choose from Directory</h4><button onClick={() => setReceiverPickerOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button></div>
                    <div className="p-3 space-y-2">
                      <input value={recvSearch} onChange={(e) => setRecvSearch(e.target.value)} placeholder="Search…" className={finp} />
                      {companies.length === 0 && <p className="text-xs text-slate-400 italic">No companies yet — add them under Directory in the left menu.</p>}
                      <div className="max-h-72 overflow-y-auto space-y-1">
                        {companies.filter((c) => { const q = recvSearch.trim().toLowerCase(); return !q || `${c.name} ${c.category}`.toLowerCase().includes(q); }).map((c) => (
                          <button key={c._id} onClick={() => pickReceiver(c)} className="w-full text-left px-3 py-2 rounded-xl border border-slate-100 hover:bg-slate-50">
                            <p className="text-sm font-bold text-slate-800">{c.name}</p><p className="text-[10px] text-slate-400 uppercase tracking-wide">{COMPANY_CATEGORIES.find((x) => x.v === c.category)?.label || c.category}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* New invoice — a form popup instead of a blank inline row */}
      {newOpen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-16" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">{isSent ? "New invoice" : "Log invoice"}</p>
              <button onClick={() => setNewOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              {/* CR-I-07 — start from a saved template. */}
              {templates.length > 0 && (
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Start from a template
                  <select className={`${finp} mt-1 font-bold`} value="" onChange={(e) => { const t = templates.find((x) => x._id === e.target.value); if (t) newFromTemplate(t); }}>
                    <option value="">Blank invoice</option>
                    {templates.map((t) => <option key={t._id} value={t._id}>#{t.number} · {t.party || "template"}</option>)}
                  </select></label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{numLabel} <span className="font-medium normal-case text-slate-400">— leave blank to auto-number ({isSent ? "9001, 9002…" : "4001, 4002…"})</span>
                  <input className={`${finp} mt-1`} value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} placeholder={isSent ? "Auto (e.g. 9001)" : "Auto (e.g. 4001)"} /></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{dateLabel}
                  <input type="date" className={`${finp} mt-1`} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
              </div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">{partyLabel}
                <input className={`${finp} mt-1`} value={draft.party} onChange={(e) => setDraft({ ...draft, party: e.target.value })} placeholder={isSent ? "Client name" : "Vendor / subcontractor"} /></label>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description
                <textarea rows={2} className={`${finp} mt-1 resize-y`} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What is this invoice for?" /></label>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Amount
                <input className={`${finp} mt-1 font-bold`} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="0.00" /></label>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setNewOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Cancel</button>
                <button onClick={submitNew} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{saving && <Loader2 size={12} className="animate-spin" />} Add invoice</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record a payment */}
      {payFor && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-16" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <div>
                <p className="text-sm font-bold text-slate-900">{isSent ? "Record a payment received" : "Record a payment made"}</p>
                <p className="text-[10px] text-slate-400">{payFor.number || "Invoice"}{payFor.party ? ` · ${payFor.party}` : ""} · {money(n(payFor.amount))} total, {money(invoiceRemaining(payFor))} outstanding</p>
              </div>
              <button onClick={() => setPayFor(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Amount paid
                  <input className={`${finp} mt-1 font-bold`} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} placeholder="0.00" /></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date
                  <input type="date" className={`${finp} mt-1`} value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Method
                  <select className={`${finp} mt-1`} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                    {["Bank transfer", "Cheque", "Cash", "Card", "Other"].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reference
                  <input className={`${finp} mt-1`} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="Transfer / cheque no." /></label>
              </div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Proof / remarks
                <textarea rows={2} className={`${finp} mt-1 resize-y`} value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} placeholder="e.g. Paid against invoice 2214, cleared 12 Aug" /></label>
              <p className="text-[11px] text-slate-400">
                {isSent ? "Upload the remittance advice after saving." : "This payment is also added to the Expenses tab. Upload the receipt after saving."}
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setPayFor(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Cancel</button>
                <button onClick={submitPay} disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{saving ? <Loader2 size={12} className="animate-spin" /> : <DollarSign size={12} />} Record payment</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pull a vendor invoice in from a purchase order */}
      {poPicker && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-16" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <div>
                <p className="text-sm font-bold text-slate-900">Invoice from a purchase order</p>
                <p className="text-[10px] text-slate-400">Pulls the vendor's invoice number, amount and date from the PO.</p>
              </div>
              <button onClick={() => setPoPicker(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 max-h-80 overflow-y-auto space-y-1">
              {pos.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-6">No purchase orders in this project yet.</p>
              ) : pos.map((po) => {
                const already = rows.some((r) => r.poId === po._id);
                return (
                  <button key={po._id} onClick={() => pullFromPO(po)} disabled={already} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 text-left border border-transparent hover:border-slate-100 disabled:opacity-50 disabled:hover:bg-transparent">
                    <div className="min-w-0 flex-grow">
                      <p className="text-sm font-bold text-slate-800">PO {po.poNo} · {po.vendorName || "vendor"}</p>
                      <p className="text-[10px] font-bold text-slate-400">{po.invoiceNo ? `Invoice ${po.invoiceNo} · ` : ""}{money(n(po.invoiceAmount || po.total))}{already ? " · already added" : ""}</p>
                    </div>
                    {!already && <Plus size={15} className="text-slate-300 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
