import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Loader2, Receipt, Search } from "lucide-react";
import { fetchProcurementPOs, fetchInvoices, attachmentUrl, invoicePaid, type ApiProcurementPO, type ApiInvoice } from "../../lib/api";
import FileActions from "./FileActions";
import { Fig } from "./FiguresPrivacy";

/**
 * CR-P (172)/(173) — Procurement > Invoices: every vendor invoice on the project's purchase orders
 * in one list (until now they were only visible inside each PO's Manage). The flow: the quote is
 * accepted, the purchase order goes out, the vendor sends the invoice (recorded and uploaded on the
 * PO), it is paid in Invoice Received, and the payment is recorded as an expense. Sort by any
 * column; each row opens its file, its PO or its entry in Invoice Received.
 */

const n = (s?: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });
const STATUS_CLS: Record<string, string> = {
  Paid: "bg-emerald-50 text-emerald-600",
  "Partially Paid": "bg-blue-50 text-blue-600",
  Unpaid: "bg-amber-50 text-amber-600",
  Overdue: "bg-red-50 text-red-600",
  Disputed: "bg-orange-50 text-orange-600",
};

type SortKey = "po" | "vendor" | "number" | "date" | "amount" | "left" | "status";
type Row = { po: ApiProcurementPO; inv?: ApiInvoice; vendor: string; number: string; date: string; amount: number; paid: number; left: number; status: string };

export default function ProcurementInvoices({ projectId, projectName, onGoToPO, onGoToReceived }: {
  projectId: string;
  projectName?: string;
  onGoToPO: () => void;
  onGoToReceived: () => void;
}) {
  const [pos, setPOs] = useState<ApiProcurementPO[]>([]);
  const [received, setReceived] = useState<ApiInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchProcurementPOs(projectId).catch(() => [] as ApiProcurementPO[]),
      fetchInvoices(projectId, "received").catch(() => [] as ApiInvoice[]),
    ]).then(([p, r]) => { setPOs(p); setReceived(r); }).finally(() => setLoading(false));
  }, [projectId]);

  const rows = useMemo<Row[]>(() => pos
    .filter((p) => p.invoiceNo?.trim() || n(p.invoiceAmount) || (p.attachments || []).some((a) => a.kind === "invoice"))
    .map((p) => {
      const inv = received.find((i) => i.poId === p._id);
      const amount = n(p.invoiceAmount) || (inv ? n(inv.amount) : 0);
      const paid = inv ? invoicePaid(inv) : 0;
      return { po: p, inv, vendor: p.vendorName || "", number: p.invoiceNo || "", date: p.invoiceDate || "", amount, paid, left: Math.max(0, amount - paid), status: inv ? inv.status : "Not sent" };
    }), [pos, received]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => !q || [r.po.poNo, r.vendor, r.number].some((v) => String(v || "").toLowerCase().includes(q)));
    const val = (r: Row): string | number => (sort.key === "po" ? n(r.po.poNo) || r.po.poNo : sort.key === "amount" ? r.amount : sort.key === "left" ? r.left : String(r[sort.key] || "").toLowerCase());
    return [...list].sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; });
  }, [rows, search, sort]);

  const totals = rows.reduce((t, r) => ({ amount: t.amount + r.amount, paid: t.paid + r.paid, left: t.left + r.left }), { amount: 0, paid: 0, left: 0 });
  const head = (key: SortKey | null, label: string, right = false) => (
    <th className={`px-3 py-3 font-bold text-slate-500 uppercase tracking-widest text-[10px] whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
      {key ? (
        <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))} className="inline-flex items-center gap-1 hover:text-slate-900">
          {label}{sort.key === key ? (sort.dir === 1 ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : <ArrowUpDown size={10} className="opacity-40" />}
        </button>
      ) : label}
    </th>
  );

  if (loading) return <div className="py-12 flex justify-center text-slate-300"><Loader2 size={22} className="animate-spin" /></div>;

  return (
    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-display font-bold text-slate-900 flex items-center gap-2"><Receipt size={18} className="text-primary" /> Vendor Invoices</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">Every invoice vendors sent on this project's purchase orders. Record and upload an invoice on its PO (Manage &gt; Vendor invoice); it goes to Invoice Received, where it is paid, and the payment is recorded in Expenses.</p>
        </div>
        <div className="relative shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PO, vendor, invoice #…" className="bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10 w-56" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100"><span className="text-lg font-display font-bold text-slate-700 leading-none">{rows.length}</span><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Invoices</span></span>
        <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/10"><span className="text-lg font-display font-bold text-primary leading-none"><Fig>{money(totals.amount)}</Fig></span><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total billed</span></span>
        <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100"><span className="text-lg font-display font-bold text-emerald-600 leading-none"><Fig>{money(totals.paid)}</Fig></span><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Paid</span></span>
        <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-100"><span className="text-lg font-display font-bold text-amber-600 leading-none"><Fig>{money(totals.left)}</Fig></span><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Payable</span></span>
      </div>

      <div className="overflow-x-auto border border-slate-100 rounded-2xl">
        <table className="w-full min-w-[980px] text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {head("po", "PO")}
              {head("vendor", "Vendor")}
              {head("number", "Invoice #")}
              {head("date", "Date")}
              {head("amount", "Amount", true)}
              {head("left", "Payable", true)}
              {head("status", "Status")}
              {head(null, "Invoice file")}
              {head(null, "")}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {shown.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400 italic">{rows.length ? "Nothing matches." : "No vendor invoices yet. They are recorded on each purchase order."}</td></tr>}
            {shown.map((r) => {
              const files = (r.po.attachments || []).filter((a) => a.kind === "invoice");
              return (
                <tr key={r.po._id} className="hover:bg-slate-50/40 align-top">
                  <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap">{r.po.poNo}{r.po.archived && <span className="ml-1 text-[9px] text-slate-400">(archived)</span>}</td>
                  <td className="px-3 py-2.5 text-slate-700">{r.vendor || "—"}</td>
                  <td className="px-3 py-2.5 font-bold text-slate-700">{r.number || <span className="text-slate-300 font-normal">—</span>}</td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.date || "—"}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-800 whitespace-nowrap">{r.amount ? money(r.amount) : "—"}</td>
                  <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${r.left > 0 ? "text-amber-600" : "text-slate-400"}`}>{r.inv ? money(r.left) : "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${STATUS_CLS[r.status] || "bg-slate-100 text-slate-500"}`} title={r.inv ? undefined : "Add the invoice number, amount and date on the PO to send it to Invoice Received"}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {files.length === 0 ? <span className="text-slate-300">—</span> : files.map((a) => (
                        <span key={a._id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-600">
                          <span className="max-w-[140px] truncate" title={a.name}>{a.name}</span>
                          <FileActions name={a.name} url={attachmentUrl(a.filePath)} projectName={projectName} size={12} />
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      <button onClick={onGoToPO} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-slate-600 text-[10px] font-bold hover:text-primary" title="Open Purchase Orders"><ExternalLink size={11} /> PO</button>
                      {r.inv && <button onClick={onGoToReceived} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary" title="Pay it in Finances > Invoice Received"><ExternalLink size={11} /> Invoice Received</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
