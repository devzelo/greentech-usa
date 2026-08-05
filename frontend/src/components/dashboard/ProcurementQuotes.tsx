import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, FileText, ArrowUp, ArrowDown, ChevronsUpDown, Package, CheckCircle2 } from "lucide-react";
import {
  fetchRfqs, fetchVendors, fetchProcurementItems, fetchProcurementSections, attachmentUrl,
  type ApiRfq, type ApiVendor, type ApiProcurementItem, type ApiProcurementSection,
} from "../../lib/api";

const n = (s: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (v: number) => (v > 0 ? v.toLocaleString(undefined, { style: "currency", currency: "USD" }) : "—");

// Read-only aggregation: every item we requested quotes for, with EVERY vendor's quote (price + the
// uploaded quotation document) shown on the same row. Accepted quote is green, the rest are gray.
type QuoteCell = { vendorId: string; vendorName: string; rfqNo: string; unitPrice: string; total: number; accepted: boolean; docs: { name: string; filePath: string }[] };
type Row = { item: ApiProcurementItem | undefined; itemId: string; boqNo: number; description: string; brand: string; modelNo: string; spec: string; unit: string; qty: string; quotes: QuoteCell[] };

export default function ProcurementQuotes({ projectId }: { projectId: string; canEdit: boolean }) {
  const [rfqs, setRfqs] = useState<ApiRfq[]>([]);
  const [vendors, setVendors] = useState<ApiVendor[]>([]);
  const [items, setItems] = useState<ApiProcurementItem[]>([]);
  const [sections, setSections] = useState<ApiProcurementSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: "boqNo" | "description" | "brand" | "modelNo" | "spec" | "vendors"; dir: 1 | -1 } | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchRfqs(projectId), fetchVendors(projectId), fetchProcurementItems(projectId).catch(() => []), fetchProcurementSections(projectId).catch(() => [])])
      .then(([r, v, it, s]) => { setRfqs(r); setVendors(v); setItems(it); setSections(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const vendorName = (vid: string) => vendors.find((v) => v._id === vid)?.name || "Vendor";
  // Continuous BOQ numbering (same as the other tabs).
  const boqNo = useMemo(() => {
    const map: Record<string, number> = {};
    let k = 0;
    for (const s of sections) for (const it of items.filter((x) => x.sectionId === s._id)) if (it.status !== "Cancelled") map[it._id] = ++k;
    return map;
  }, [sections, items]);

  // Build one row per item that appears in any RFQ, gathering all its vendor quotes.
  const rows = useMemo<Row[]>(() => {
    const byItem = new Map<string, Row>();
    for (const rfq of rfqs) {
      for (const li of rfq.lineItems) {
        if (!li.itemId) continue;
        let row = byItem.get(li.itemId);
        if (!row) {
          const it = items.find((x) => x._id === li.itemId);
          row = { item: it, itemId: li.itemId, boqNo: boqNo[li.itemId] || 0, description: li.description || it?.description || "—", brand: it?.manufacturer || "", modelNo: it?.modelNo || "", spec: li.spec || it?.spec || "", unit: li.unit || it?.unit || "", qty: li.qty || it?.qty || "", quotes: [] };
          byItem.set(li.itemId, row);
        }
        // Show a cell for EVERY vendor the RFQ was sent to (not only those that replied/were accepted).
        for (const q of rfq.quotes) {
          const ql = q.lineItems.find((x) => x.itemId === li.itemId);
          const unitPrice = ql?.unitPrice || "";
          const docs = (q.attachments || []).map((a) => ({ name: a.name, filePath: a.filePath }));
          row.quotes.push({ vendorId: q.vendorId, vendorName: vendorName(q.vendorId), rfqNo: rfq.rfqNo, unitPrice, total: n(li.qty) * n(unitPrice), accepted: q.status === "Awarded", docs });
        }
      }
    }
    return Array.from(byItem.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqs, items, boqNo, vendors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.description, r.brand, r.modelNo, r.spec, r.quotes.map((c) => c.vendorName).join(" ")].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [rows, search]);

  const sortVal = (r: Row): string | number => {
    switch (sort?.key) {
      case "boqNo": return r.boqNo;
      case "brand": return r.brand.toLowerCase();
      case "modelNo": return r.modelNo.toLowerCase();
      case "spec": return r.spec.toLowerCase();
      case "vendors": return r.quotes.map((c) => c.vendorName).sort().join(",").toLowerCase();
      default: return r.description.toLowerCase();
    }
  };
  const sorted = useMemo(() => {
    if (!sort) return [...filtered].sort((a, b) => a.boqNo - b.boqNo);
    return [...filtered].sort((a, b) => { const av = sortVal(a), bv = sortVal(b); return av < bv ? -sort.dir : av > bv ? sort.dir : 0; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort]);
  const toggleSort = (key: typeof sort extends null ? never : NonNullable<typeof sort>["key"]) =>
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  const arrow = (key: string) => (sort?.key === key ? (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ChevronsUpDown size={11} className="text-slate-300" />);
  const Th = ({ label, k }: { label: string; k: NonNullable<typeof sort>["key"] }) => (
    <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]"><button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase tracking-widest hover:text-slate-700">{label} {arrow(k)}</button></th>
  );

  if (loading) return <div className="py-12 flex justify-center text-slate-300"><Loader2 size={22} className="animate-spin" /></div>;

  return (
    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
      <div>
        <h3 className="text-xl font-display font-bold text-slate-900">Quotes</h3>
        <p className="text-xs font-medium text-slate-400 mt-1">Every quote sent to vendors, grouped by item — <span className="font-bold text-emerald-600">accepted</span> quotes are highlighted, the rest are shown in gray. Quotation documents are saved to Documents (Procurement → Quotes) automatically.</p>
      </div>

      {rows.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-grow">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by description, model, spec or vendor…" className="w-full bg-slate-50 border border-slate-100 rounded-lg pl-9 pr-3 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10" />
          </div>
          {search && <button onClick={() => setSearch("")} className="text-[11px] font-bold text-slate-500 hover:text-slate-900 px-2">Clear</button>}
          <span className="text-[10px] text-slate-400">{sorted.length} of {rows.length}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400"><Package size={36} className="mb-3" /><p className="font-bold text-sm">No quotes yet.</p><p className="text-xs">Send RFQs and enter vendor prices to see them here.</p></div>
      ) : (
        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
          <table className="w-full min-w-[820px] text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <Th label="BOQ #" k="boqNo" />
                <Th label="Description" k="description" />
                <Th label="Brand" k="brand" />
                <Th label="Model" k="modelNo" />
                <Th label="Spec" k="spec" />
                <Th label="Vendor Quotes" k="vendors" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map((r) => (
                <tr key={r.itemId} className="hover:bg-slate-50/40 align-top">
                  <td className="px-3 py-2 font-bold text-slate-400 whitespace-nowrap">{r.boqNo || "—"}</td>
                  <td className="px-3 py-2 font-bold text-slate-700">{r.description}<span className="text-slate-400 font-medium"> · {[r.qty, r.unit].filter(Boolean).join(" ")}</span></td>
                  <td className="px-3 py-2 text-slate-500">{r.brand || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{r.modelNo || "—"}</td>
                  <td className="px-3 py-2 text-slate-500 max-w-[10rem] truncate" title={r.spec}>{r.spec || "—"}</td>
                  <td className="px-3 py-2">
                    {r.quotes.length === 0 ? <span className="text-slate-300 italic">No quotes</span> : (
                      <div className="flex flex-col gap-1.5">
                        {r.quotes.map((c, i) => (
                          <div key={`${c.vendorId}-${c.rfqNo}-${i}`} className={`flex flex-wrap items-center gap-2 px-2 py-1 rounded-lg border ${c.accepted ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-100"}`}>
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${c.accepted ? "text-emerald-700" : "text-slate-600"}`}>
                              {c.accepted && <CheckCircle2 size={11} className="text-emerald-600" />}{c.vendorName}<span className={`font-medium ${c.accepted ? "text-emerald-500" : "text-slate-400"}`}>RFQ {c.rfqNo}</span>
                            </span>
                            {c.accepted && <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[8px] font-bold uppercase tracking-widest">Accepted</span>}
                            <span className={`text-[11px] font-bold ${c.accepted ? "text-emerald-700" : "text-slate-700"}`}>{c.unitPrice ? `${money(n(c.unitPrice))}/ea` : "—"}{c.total > 0 ? <span className="text-slate-400 font-medium"> · {money(c.total)}</span> : null}</span>
                            {c.docs.map((d, di) => (
                              <a key={di} href={attachmentUrl(d.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline max-w-[130px] truncate" title={d.name}><FileText size={10} />{d.name}</a>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
