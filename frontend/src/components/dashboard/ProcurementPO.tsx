import { Fragment, useEffect, useState } from "react";
import { Loader2, Trash2, ChevronRight, ChevronDown, Download, Upload, X, FileText, Plus, Eye, Search, Settings2, FileDown, Stamp, PenLine, Check, FileCheck2, Receipt, Archive, RotateCcw } from "lucide-react";
import {
  fetchProcurementPOs, createProcurementPO, createManualPO, updateProcurementPO, deleteProcurementPO, setProcurementPOArchived,
  uploadPOAttachment, deletePOAttachment, fetchRfqs, fetchVendors, attachmentUrl,
  fetchProcurementItems, fetchProcurementSections, uploadDocument,
  fetchSignatories, fetchStamps, uploadPOPartyImage, attachPOFile, fetchSubmittals, invoiceFromPO, fetchInvoices,
  type ApiProcurementPO, type ApiRfq, type ApiVendor, type ApiProcurementItem, type ApiProcurementSection,
  type ApiSignatory, type CompanyFile, type ApiSubmittal,
} from "../../lib/api";
import { fetchSavedDocuments, saveDocumentVersion, updateSavedDocument, deleteSavedDocument } from "../../lib/api";
import { buildPoPackage } from "../../lib/poPdf";
import { downloadHtmlAsWord, htmlTable, escapeHtml } from "../../lib/wordExport";
import { AddressPicker } from "./AddressPicker";
import type { ProjectPdfInfo } from "../../lib/pdfProjectHeader";
import { downloadBlob } from "../../lib/proposalExport";
import { toast } from "../../lib/toast";
import PresenceBar from "./PresenceBar";
import { useBuilderPresence } from "../../lib/usePresence";
import { useDialogs } from "../../lib/useDialogs";
import PdfPreviewModal from "./PdfPreviewModal";
import SavedVersionsPanel from "./SavedVersionsPanel";

const n = (s: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });
const inp = "w-full bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10";
const STATUSES = ["Sent", "Confirmed", "InvoiceReceived", "Paid"] as const;
const statusCls: Record<string, string> = { Sent: "bg-amber-50 text-amber-600", Confirmed: "bg-blue-50 text-blue-600", InvoiceReceived: "bg-indigo-50 text-indigo-600", Paid: "bg-emerald-50 text-emerald-600" };

export default function ProcurementPO({ projectId, canEdit, projectInfo, onGoToBOQ, onGoToRFQ, onGoToQuotes }: { projectId: string; canEdit: boolean; projectInfo?: ProjectPdfInfo; onGoToBOQ?: () => void; onGoToRFQ?: () => void; onGoToQuotes?: () => void }) {
  const present = useBuilderPresence(projectId ? `po:${projectId}` : null, "Purchase Orders"); // CR-B-01
  const [pos, setPOs] = useState<ApiProcurementPO[]>([]);
  const [rfqs, setRfqs] = useState<ApiRfq[]>([]);
  const [vendors, setVendors] = useState<ApiVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newPoMenu, setNewPoMenu] = useState(false); // CR-PR-06 — "+New PO" dropdown
  const [preview, setPreview] = useState<{ title: string; fileName: string; build: () => Promise<Blob> } | null>(null);
  const [search, setSearch] = useState("");
  const [manageId, setManageId] = useState<string | null>(null); // §A1 — actions via popup
  const [items, setItems] = useState<ApiProcurementItem[]>([]);   // for category grouping + BOQ numbering
  const [sections, setSections] = useState<ApiProcurementSection[]>([]);
  const [secNames, setSecNames] = useState<Record<string, string>>({});
  const [savingDoc, setSavingDoc] = useState<string | null>(null);
  const [signatories, setSignatories] = useState<ApiSignatory[]>([]);
  const [stamps, setStamps] = useState<CompanyFile[]>([]);
  const [submittals, setSubmittals] = useState<ApiSubmittal[]>([]);
  const [stampPickerFor, setStampPickerFor] = useState<string | null>(null); // po id whose stamp picker is open
  // Partner-side picker: choose a signature/stamp saved on the partner's profile (JV settings).
  const [partnerPicker, setPartnerPicker] = useState<{ pid: string; target: "signature" | "stamp" } | null>(null);
  const { confirm, dialogs } = useDialogs();
  const hasPartner = !!projectInfo?.partner;

  const load = async () => {
    setLoading(true);
    try {
      const [p, r, v, it, secs, sig, stmp, subs, recInv] = await Promise.all([
        fetchProcurementPOs(projectId, showArchived), fetchRfqs(projectId), fetchVendors(projectId),
        fetchProcurementItems(projectId).catch(() => []), fetchProcurementSections(projectId).catch(() => []),
        fetchSignatories().catch(() => []), fetchStamps().catch(() => []), fetchSubmittals(projectId).catch(() => []),
        // Which POs already have an invoice on the Invoice Received tab — drives the button state.
        fetchInvoices(projectId, "received").catch(() => []),
      ]);
      setPOs(p); setRfqs(r); setVendors(v); setItems(it); setSections(secs); setSecNames(Object.fromEntries(secs.map((s) => [s._id, s.name])));
      setSignatories(sig); setStamps(stmp); setSubmittals(subs);
      setRaisedPoIds(new Set(recInv.map((i) => i.poId).filter(Boolean)));
    }
    catch { /* keep */ } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [projectId, showArchived]);
  const archivePO = async (pid: string, next: boolean) => {
    try { await setProcurementPOArchived(projectId, pid, next); setPOs((p) => p.filter((x) => x._id !== pid)); }
    catch { /* ignore */ }
  };

  // Awarded quotes that don't yet have a PO.
  const awardable = rfqs.flatMap((rfq) => rfq.quotes.filter((q) => q.status === "Awarded" && !pos.some((p) => p.quoteId === q._id)).map((q) => ({ rfq, quote: q })));

  const vendorName = (vid: string) => vendors.find((v) => v._id === vid)?.name || "Vendor";

  // BOQ item number(s) a PO/RFQ relates to — same continuous numbering as BOQ & Submittals.
  // POs are identified by these instead of a separate 8000 sequence.
  const boqNo: Record<string, number> = {};
  { let k = 0; for (const s of sections) for (const it of items.filter((x) => x.sectionId === s._id)) if (it.status !== "Cancelled") boqNo[it._id] = ++k; }
  const refNosOf = (lineItems: { itemId?: string }[]) => lineItems.map((li) => (li.itemId ? boqNo[li.itemId] : undefined)).filter((x): x is number => !!x).sort((a, b) => a - b);
  const poRef = (po: ApiProcurementPO) => refNosOf(po.lineItems).join(", ");            // BOQ item numbers "1, 2", "" if unlinked
  const rfqRef = (rfq: ApiRfq) => refNosOf(rfq.lineItems).join(", ");                   // for the "convert to PO" chip

  // Search across PO number, vendor, and line-item descriptions.
  const visiblePOs = pos.filter((po) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    if ([po.poNo, poRef(po), po.vendorName || vendorName(po.vendorId), po.invoiceNo].some((v) => String(v || "").toLowerCase().includes(q))) return true;
    if (po.lineItems.some((li) => String(li.description || "").toLowerCase().includes(q))) return true;
    return false;
  });
  // Universal-table: click-to-sort columns.
  const [sort, setSort] = useState<{ key: "poNo" | "boq" | "vendor" | "total" | "status"; dir: 1 | -1 } | null>(null);
  const toggleSort = (key: "poNo" | "boq" | "vendor" | "total" | "status") => setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  const sortArrow = (key: string) => (sort?.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");
  // Default order: latest PO on top (highest poNo). A column sort overrides it.
  const sortedPOs = !sort
    ? [...visiblePOs].sort((a, b) => (Number(b.poNo) || 0) - (Number(a.poNo) || 0))
    : [...visiblePOs].sort((a, b) => {
        const val = (p: ApiProcurementPO) => sort.key === "poNo" ? (Number(p.poNo) || 0) : sort.key === "boq" ? (refNosOf(p.lineItems)[0] || 0) : sort.key === "total" ? n(p.total) : sort.key === "status" ? p.status : String(p.vendorName || vendorName(p.vendorId)).toLowerCase();
        const av = val(a), bv = val(b);
        return av < bv ? -sort.dir : av > bv ? sort.dir : 0;
      });
  const patch = (pid: string, p: Partial<ApiProcurementPO>) => setPOs((prev) => prev.map((x) => x._id === pid ? { ...x, ...p } : x));
  // Resolve a stored signature/stamp path (token-guarded uploads or a public asset) to an <img> src.
  const imgSrc = (p?: string) => { if (!p) return ""; const s = p.replace(/^\/+/, ""); return s.startsWith("uploads/") ? attachmentUrl(s) : (p.startsWith("/") ? p : `/${p}`); };

  // Auto-save the current PO document into the project documents — runs on creation so the
  // document exists there whether or not "Save to documents" is ever clicked. Best-effort.
  const autoSavePoDoc = async (po: ApiProcurementPO) => {
    try {
      const { blob } = await buildPoPackage(po, vendors.find((v) => v._id === po.vendorId), projectInfo);
      await uploadDocument(projectId, new File([blob], `PO_${po.poNo}.pdf`, { type: "application/pdf" }), "procurement-po", true);
    } catch { /* best-effort */ }
  };
  // CR-PR-06 — a manual PO (not from a BOQ/quote); opens straight into the editor.
  const createManual = async () => {
    setNewPoMenu(false);
    try { const po = await createManualPO(projectId); setPOs((p) => [po, ...p]); setOpenId(po._id); void autoSavePoDoc(po); toast(`Manual PO ${po.poNo} created — add the vendor and line items.`, "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not create the PO.", "error"); }
  };
  const createPO = async (rfqId: string, quoteId: string) => {
    try { const po = await createProcurementPO(projectId, rfqId, quoteId); setPOs((p) => [...p, po]); setOpenId(po._id); void autoSavePoDoc(po); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not create PO.", "error"); }
  };
  const save = (pid: string, field: "terms" | "termsMode" | "notes" | "shipTo" | "deliveryMethod" | "status" | "invoiceNo" | "invoiceAmount" | "invoiceDate" | "partnerSignerName" | "partnerSignerEmail" | "partnerSignerPhone", value: string) => {
    updateProcurementPO(projectId, pid, { [field]: value }).then((po) => patch(pid, po)).catch((err) => toast(err instanceof Error ? err.message : "Save failed.", "error"));
  };
  // Pick the GreenTech signer from staff who have a signature on file.
  const selectSigner = async (pid: string, s: ApiSignatory | null) => {
    try {
      const po = await updateProcurementPO(projectId, pid, s
        ? { signerName: s.name, signerEmail: s.email, signerPhone: s.phone, signerTitle: s.jobTitle, signatureUrl: s.signatureUrl }
        : { signerName: "", signerEmail: "", signerPhone: "", signerTitle: "", signatureUrl: "" });
      patch(pid, po);
    } catch (err) { toast(err instanceof Error ? err.message : "Save failed.", "error"); }
  };
  const pickStamp = async (pid: string, stampPath: string) => {
    try { patch(pid, await updateProcurementPO(projectId, pid, { stampUrl: stampPath })); setStampPickerFor(null); }
    catch (err) { toast(err instanceof Error ? err.message : "Save failed.", "error"); }
  };
  const uploadPartyImg = async (pid: string, file: File, target: "signature" | "stamp") => {
    try { patch(pid, await uploadPOPartyImage(projectId, pid, file, target)); }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
  };
  const clearPartnerImg = async (pid: string, target: "signature" | "stamp") => {
    try { patch(pid, await updateProcurementPO(projectId, pid, target === "signature" ? { partnerSignatureUrl: "" } : { partnerStampUrl: "" })); }
    catch (err) { toast(err instanceof Error ? err.message : "Save failed.", "error"); }
  };
  // Pick a partner signature/stamp from the images saved on the partner's profile.
  const pickPartnerImg = async (pid: string, target: "signature" | "stamp", url: string) => {
    try { patch(pid, await updateProcurementPO(projectId, pid, target === "signature" ? { partnerSignatureUrl: url } : { partnerStampUrl: url })); setPartnerPicker(null); }
    catch (err) { toast(err instanceof Error ? err.message : "Save failed.", "error"); }
  };
  const attachSubmittal = async (pid: string, a: { name: string; filePath: string; fileType: string; size: string }) => {
    try { patch(pid, await attachPOFile(projectId, pid, { filePath: a.filePath, name: a.name, fileType: a.fileType, size: a.size, kind: "submittal" })); toast("Submittal added to the PO document.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not attach.", "error"); }
  };
  // Approved submittal (current revision Approved / Approved-as-Noted) behind a BOQ item, with its docs.
  const approvedSubDocsForItem = (itemId: string) => {
    const s = submittals.find((x) => x.itemId === itemId);
    if (!s || !s.revisions?.length) return null;
    const cur = s.revisions.find((r) => r.isCurrent) || s.revisions[s.revisions.length - 1];
    const approved = cur && (cur.disposition === "Approved" || cur.disposition === "ApprovedAsNoted");
    if (!approved) return null;
    return { sub: s, atts: (cur.attachments || []) };
  };
  // Push this PO's vendor invoice onto the Invoice Received tab, where it gets paid and the
  // payment posts to Expenses. Idempotent — one invoice per PO.
  const [raisingInvoice, setRaisingInvoice] = useState<string | null>(null);
  // POs that already have a row on the Invoice Received tab (so the button reads "Already sent").
  const [raisedPoIds, setRaisedPoIds] = useState<Set<string>>(new Set());
  const raiseInvoice = async (po: ApiProcurementPO) => {
    if (raisedPoIds.has(po._id)) { toast("This PO is already on the Invoices Received tab.", "info"); return; }
    // Block the send unless the vendor invoice number, amount and date are all filled in.
    const missing: string[] = [];
    if (!po.invoiceNo?.trim()) missing.push("invoice number");
    if (!n(po.invoiceAmount)) missing.push("invoice amount");
    if (!po.invoiceDate?.trim()) missing.push("invoice date");
    if (missing.length) {
      toast(`Add the vendor ${missing.join(", ")} before sending to Invoices Received.`, "error");
      return;
    }
    setRaisingInvoice(po._id);
    try {
      await invoiceFromPO(projectId, po._id);
      setRaisedPoIds((prev) => new Set(prev).add(po._id));
      toast(`Invoice ${po.invoiceNo || `for PO ${po.poNo}`} is now on the Invoices Received tab.`, "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not create the invoice.", "error"); }
    finally { setRaisingInvoice(null); }
  };
  const removePO = async (pid: string) => {
    if (!(await confirm({ title: "Delete PO?", message: "This deletes the purchase order. Its auto-created project expense is removed too.", confirmLabel: "Delete" }))) return;
    try { await deleteProcurementPO(projectId, pid); setPOs((p) => p.filter((x) => x._id !== pid)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  const upload = async (pid: string, file: File, kind: string) => {
    try { const po = await uploadPOAttachment(projectId, pid, file, kind); patch(pid, po); }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
  };
  const removeAtt = async (pid: string, aid: string) => {
    try { const po = await deletePOAttachment(projectId, pid, aid); patch(pid, po); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  // Create the PO document — a combined PDF: PO details, the attached vendor quotation / invoice /
  // other files, then the Terms & Conditions (constant text or uploaded file) at the very end.
  const downloadPdf = async (po: ApiProcurementPO) => {
    try {
      const { blob, skipped } = await buildPoPackage(po, vendors.find((v) => v._id === po.vendorId), projectInfo);
      downloadBlob(blob, `PO_${po.poNo}.pdf`);
      // Keep the Documents copy current — creating the PO document supersedes the earlier
      // auto-saved copy (which was made before terms, signatures and attachments existed).
      void autoSavePoDoc(po);
      if (skipped.length) toast(`Couldn't embed (not PDF/image): ${skipped.join(", ")}`, "info");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not build the PO document.", "error"); }
  };
  // Save the PO document into the organized project documents (Procurement → Purchase Orders).
  const savePoToDocuments = async (po: ApiProcurementPO) => {
    setSavingDoc(po._id);
    try {
      const { blob } = await buildPoPackage(po, vendors.find((v) => v._id === po.vendorId), projectInfo);
      const file = new File([blob], `PO_${po.poNo}.pdf`, { type: "application/pdf" });
      await uploadDocument(projectId, file, "procurement-po", true);
      toast("Saved to project documents (Procurement → Purchase Orders).", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save.", "error"); }
    finally { setSavingDoc(null); }
  };

  // §F6 — how many POs and their total value, plus a printable one-page summary.
  const poTotal = pos.reduce((s, po) => s + n(po.total), 0);
  const paidTotal = pos.filter((po) => po.status === "Paid").reduce((s, po) => s + n(po.total), 0);
  const esc = (s: string) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
  const printSummary = () => {
    const rows = pos.map((po) => `<tr><td>${esc(po.poNo)}</td><td>${esc(poRef(po) || "—")}</td><td>${esc(po.vendorName || vendorName(po.vendorId))}</td><td>${esc(po.status)}</td><td>${esc(po.invoiceNo || "")}</td><td style="text-align:right">${money(n(po.total))}</td></tr>`).join("");
    const proj = projectInfo ? `${esc(projectInfo.name || "")}${projectInfo.number ? ` · No ${esc(projectInfo.number)}` : ""}${projectInfo.location ? ` · ${esc(projectInfo.location)}` : ""}` : "";
    const html = `<!doctype html><html><head><title>Purchase Orders Summary</title>
      <style>@page{size:landscape;margin:12mm}body{font-family:Arial,sans-serif;padding:8px;color:#0f172a}h1{font-size:18px;margin:0}p{color:#64748b;font-size:12px;margin:2px 0 12px}
      table{width:100%;border-collapse:collapse;font-size:12px}th{background:#0f172a;color:#fff;text-align:left;padding:6px}td{border-bottom:1px solid #e7ebf0;padding:6px}
      tfoot td{font-weight:bold;border-top:2px solid #0f172a}</style></head>
      <body><h1>Purchase Orders Summary</h1><p>${proj}${proj ? " · " : ""}${pos.length} purchase order(s) · ${new Date().toLocaleDateString()}</p>
      <table><thead><tr><th>PO #</th><th>BOQ #</th><th>Vendor</th><th>Status</th><th>Invoice #</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td colspan="5" style="text-align:right">TOTAL</td><td style="text-align:right">${money(poTotal)}</td></tr></tfoot></table>
      <script>window.onload=function(){window.print();}</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  if (loading) return <div className="py-12 flex justify-center text-slate-300"><Loader2 size={22} className="animate-spin" /></div>;

  // Read-only line-items preview shown in the expanded sub-row (viewing only).
  const renderPoPreview = (po: ApiProcurementPO) => (
    <div className="p-4 space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[560px] text-xs">
          <thead><tr className="bg-slate-50 border-b border-slate-100">{["#", "Description", "Qty", "Unit", "Unit Price", "Amount"].map((h) => <th key={h} className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-50">
            {po.lineItems.map((li, i) => (
              <tr key={i} className={li.cancelled ? "bg-red-50/50" : ""}>
                <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                <td className={`px-3 py-2 font-bold ${li.cancelled ? "text-red-400 line-through" : "text-slate-700"}`}>{li.description || "—"}{li.cancelled && <span className="ml-1.5 text-[9px] font-bold text-red-500 uppercase no-underline">cancelled</span>}</td>
                <td className="px-3 py-2 text-slate-500">{li.qty}</td>
                <td className="px-3 py-2 text-slate-500">{li.unit}</td>
                <td className="px-3 py-2 text-slate-500">{li.unitPrice ? money(n(li.unitPrice)) : "—"}</td>
                <td className="px-3 py-2 font-bold text-slate-700">{money(n(li.qty) * n(li.unitPrice))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-slate-100"><td colSpan={5} className="px-3 py-2 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</td><td className="px-3 py-2 font-bold text-slate-900">{money(n(po.total))}</td></tr></tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
        <span><span className="text-slate-400">Status:</span> <span className="font-bold text-slate-600">{po.status}</span></span>
        {(po.shipTo || po.deliveryMethod) && <span><span className="text-slate-400">Ship to:</span> <span className="font-bold text-slate-600">{[po.deliveryMethod, po.shipTo].filter(Boolean).join(" · ")}</span></span>}
        {po.invoiceNo && <span><span className="text-slate-400">Invoice:</span> <span className="font-bold text-slate-600">{po.invoiceNo}</span></span>}
      </div>
      {canEdit && <button onClick={() => setManageId(po._id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Settings2 size={12} /> Manage — status, terms, invoice, documents</button>}
    </div>
  );

  // Full editor — shown in the actions modal.
  const renderPoDetail = (po: ApiProcurementPO) => {
    const att = (kind: string) => po.attachments.filter((a) => a.kind === kind);
    return (
      <div className="p-4 space-y-4">
        {/* Line items */}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[560px] text-xs">
            <thead><tr className="bg-slate-50 border-b border-slate-100">{["#", "Description", "Qty", "Unit", "Unit Price", "Amount"].map((h) => <th key={h} className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-50">
              {po.lineItems.map((li, i) => (
                <tr key={i} className={li.cancelled ? "bg-red-50/50" : ""}>
                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                  <td className={`px-3 py-2 font-bold ${li.cancelled ? "text-red-400 line-through" : "text-slate-700"}`}>{li.description || "—"}{li.cancelled && <span className="ml-1.5 text-[9px] font-bold text-red-500 uppercase no-underline">cancelled</span>}</td>
                  <td className="px-3 py-2 text-slate-500">{li.qty}</td>
                  <td className="px-3 py-2 text-slate-500">{li.unit}</td>
                  <td className="px-3 py-2 text-slate-500">{li.unitPrice ? money(n(li.unitPrice)) : "—"}</td>
                  <td className="px-3 py-2 font-bold text-slate-700">{money(n(li.qty) * n(li.unitPrice))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-slate-100"><td colSpan={5} className="px-3 py-2 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</td><td className="px-3 py-2 font-bold text-slate-900">{money(n(po.total))}</td></tr></tfoot>
          </table>
        </div>

        {/* Status (editable after creation) + Create-the-PO-document action */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
            <select value={po.status} disabled={!canEdit} onChange={(e) => save(po._id, "status", e.target.value)} className={`${inp} font-bold max-w-[12rem]`}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Shipping <span className="font-medium normal-case">— method &amp; address, carried from the RFQ, editable here</span></p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <select className={`${inp} font-bold max-w-[8rem]`} value={po.deliveryMethod || "Delivery"} disabled={!canEdit} onChange={(e) => { patch(po._id, { deliveryMethod: e.target.value }); save(po._id, "deliveryMethod", e.target.value); }}>
                <option value="Delivery">Delivery</option>
                <option value="Pickup">Pickup</option>
              </select>
              <AddressPicker value={po.shipTo || ""} projectSite={projectInfo?.siteAddress || projectInfo?.location} disabled={!canEdit} onChange={(v) => { patch(po._id, { shipTo: v }); save(po._id, "shipTo", v); }} />
            </div>
          </div>
        </div>

        {/* Notes & description — printed on the PO document after the item table, before the
            signature & stamp sections (same as the RFQ notes). */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-1.5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><FileText size={11} /> Notes &amp; description <span className="font-medium normal-case text-slate-400">— extra info for the vendor; shown after the table on the PO document</span></p>
          <textarea rows={3} className={`${inp} resize-y`} placeholder="e.g. Deliver in two lots; include mill certificates with each delivery…" value={po.notes || ""} disabled={!canEdit} onChange={(e) => patch(po._id, { notes: e.target.value })} onBlur={(e) => save(po._id, "notes", e.target.value)} />
        </div>

        {/* Terms & Conditions — constant text OR an uploaded file (always printed at the END of the PO) */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Terms &amp; Conditions <span className="font-medium normal-case text-slate-400">— printed at the end of the PO</span></p>
            {canEdit && (
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-bold">
                {(["constant", "file"] as const).map((m) => (
                  <button key={m} onClick={() => { patch(po._id, { termsMode: m }); save(po._id, "termsMode", m); }} className={`px-3 py-1 ${(po.termsMode || "constant") === m ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{m === "constant" ? "Constant" : "Upload file"}</button>
                ))}
              </div>
            )}
          </div>
          {(po.termsMode || "constant") === "constant" ? (
            <textarea rows={6} className={`${inp} resize-y font-mono leading-relaxed`} placeholder="Standard terms & conditions" value={po.terms} disabled={!canEdit} onChange={(e) => patch(po._id, { terms: e.target.value })} onBlur={(e) => save(po._id, "terms", e.target.value)} />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {att("terms").map((a) => (
                <span key={a._id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-white border border-slate-100 text-[10px] font-bold text-slate-600">
                  <a href={attachmentUrl(a.filePath)} target="_blank" rel="noreferrer" className="hover:text-primary max-w-[160px] truncate" title={a.name}><FileText size={10} className="inline mr-1" />{a.name}</a>
                  {canEdit && <button onClick={() => removeAtt(po._id, a._id)} className="text-slate-300 hover:text-red-500"><X size={11} /></button>}
                </span>
              ))}
              {att("terms").length === 0 && <span className="text-[11px] text-slate-400 italic">No T&amp;C file uploaded.</span>}
              {canEdit && <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 cursor-pointer hover:bg-slate-200"><Upload size={10} /> Upload T&amp;C<input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(po._id, f, "terms"); e.target.value = ""; }} /></label>}
            </div>
          )}
        </div>

        {/* Invoice link — the vendor's quotation doc is auto-carried from the RFQ (see documents below) */}
        <div className="bg-slate-50 rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Vendor invoice</p>
            {canEdit && (raisedPoIds.has(po._id) ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-bold" title="Already on the Invoice Received tab">
                <Check size={11} /> Sent to Invoices Received
              </span>
            ) : (
              <button
                onClick={() => raiseInvoice(po)}
                disabled={raisingInvoice === po._id}
                title="Create the matching row on the Invoice Received tab, where you record payments"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary disabled:opacity-50"
              >
                {raisingInvoice === po._id ? <Loader2 size={11} className="animate-spin" /> : <Receipt size={11} />} Send to Invoices Received
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mb-2">Record the vendor's invoice here, then push it to <span className="font-bold">Invoices Received</span> to pay it and track the receipt — the payment posts to Expenses automatically.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input className={inp} placeholder="Invoice #" value={po.invoiceNo} disabled={!canEdit} onChange={(e) => patch(po._id, { invoiceNo: e.target.value })} onBlur={(e) => save(po._id, "invoiceNo", e.target.value)} />
            <input className={inp} placeholder="Invoice amount" value={po.invoiceAmount} disabled={!canEdit} onChange={(e) => patch(po._id, { invoiceAmount: e.target.value })} onBlur={(e) => save(po._id, "invoiceAmount", e.target.value)} />
            <input type="date" className={inp} value={po.invoiceDate} disabled={!canEdit} onChange={(e) => patch(po._id, { invoiceDate: e.target.value })} onBlur={(e) => save(po._id, "invoiceDate", e.target.value)} />
          </div>
        </div>

        {/* Documents — the vendor quotation auto-carries from the RFQ; upload the invoice + any others.
            The PO document itself is CREATED (button above), not uploaded here. */}
        <div className="space-y-2">
          {([["quote", "Vendor quotation"], ["invoice", "Invoice file"], ["other", "Other files"]] as const).map(([kind, label]) => (
            <div key={kind} className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-28 shrink-0">{label}{kind === "quote" ? " · auto" : ""}</span>
              {att(kind).map((a) => (
                <span key={a._id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-white border border-slate-100 text-[10px] font-bold text-slate-600">
                  <a href={attachmentUrl(a.filePath)} target="_blank" rel="noreferrer" className="hover:text-primary max-w-[140px] truncate" title={a.name}><FileText size={10} className="inline mr-1" />{a.name}</a>
                  {canEdit && <button onClick={() => removeAtt(po._id, a._id)} className="text-slate-300 hover:text-red-500"><X size={11} /></button>}
                </span>
              ))}
              {att(kind).length === 0 && <span className="text-[11px] text-slate-400 italic">{kind === "quote" ? "none — auto-carried only if a quotation was uploaded on the RFQ" : "none"}</span>}
              {canEdit && <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 cursor-pointer hover:bg-slate-200"><Upload size={10} /> Add<input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(po._id, f, kind); e.target.value = ""; }} /></label>}
            </div>
          ))}
        </div>
        {/* Signatures & stamp (F1) — GreenTech signer from staff with a signature; stamp from the
            classified Stamps tab; partner side (JV only) uploaded here. */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-4">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><PenLine size={11} /> Signatures &amp; Stamp <span className="font-medium normal-case text-slate-400">— shown after the item table on the PO document</span></p>
          <div className={`grid gap-4 ${hasPartner ? "md:grid-cols-2" : "grid-cols-1"}`}>
            {/* GreenTech side */}
            <div className="bg-white rounded-xl border border-slate-100 p-3 space-y-2">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">GreenTech USA</p>
              <div>
                <label className="text-[10px] font-bold text-slate-400">Authorized by</label>
                <select disabled={!canEdit} value={signatories.find((s) => s.name === po.signerName && s.signatureUrl === po.signatureUrl)?.id || ""} onChange={(e) => selectSigner(po._id, signatories.find((s) => s.id === e.target.value) || null)} className={`${inp} font-bold`}>
                  <option value="">— Select a signer —</option>
                  {signatories.map((s) => <option key={s.id} value={s.id}>{s.name}{s.jobTitle ? ` · ${s.jobTitle}` : ""}</option>)}
                </select>
                {signatories.length === 0 && <p className="text-[10px] text-amber-600 mt-1">No staff have uploaded a signature. Each person uploads theirs in Profile.</p>}
              </div>
              {po.signatureUrl && <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-slate-400">Signature:</span><img src={imgSrc(po.signatureUrl)} alt="signature" className="h-8 object-contain" /></div>}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-slate-400">Stamp:</span>
                {po.stampUrl ? <img src={imgSrc(po.stampUrl)} alt="stamp" className="h-10 object-contain" /> : <span className="text-[11px] text-slate-400 italic">none</span>}
                {canEdit && <button onClick={() => setStampPickerFor(po._id)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 hover:bg-slate-200"><Stamp size={11} /> {po.stampUrl ? "Change" : "Add stamp"}</button>}
                {canEdit && po.stampUrl && <button onClick={() => pickStamp(po._id, "")} className="text-[10px] font-bold text-slate-400 hover:text-red-500">Remove</button>}
              </div>
            </div>
            {/* Partner side — JV only (uploaded manually; partners have no staff/classified stamps) */}
            {hasPartner && (
              <div className="bg-white rounded-xl border border-slate-100 p-3 space-y-2">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{projectInfo?.partner?.name || "Partner"}</p>
                <input className={inp} placeholder="Signer name" disabled={!canEdit} value={po.partnerSignerName || ""} onChange={(e) => patch(po._id, { partnerSignerName: e.target.value })} onBlur={(e) => save(po._id, "partnerSignerName", e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <input className={inp} placeholder="Email" disabled={!canEdit} value={po.partnerSignerEmail || ""} onChange={(e) => patch(po._id, { partnerSignerEmail: e.target.value })} onBlur={(e) => save(po._id, "partnerSignerEmail", e.target.value)} />
                  <input className={inp} placeholder="Phone" disabled={!canEdit} value={po.partnerSignerPhone || ""} onChange={(e) => patch(po._id, { partnerSignerPhone: e.target.value })} onBlur={(e) => save(po._id, "partnerSignerPhone", e.target.value)} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-slate-400">Signature:</span>
                  {po.partnerSignatureUrl ? <img src={imgSrc(po.partnerSignatureUrl)} alt="partner signature" className="h-8 object-contain" /> : <span className="text-[11px] text-slate-400 italic">none</span>}
                  {canEdit && <button onClick={() => setPartnerPicker({ pid: po._id, target: "signature" })} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 hover:bg-slate-200"><PenLine size={10} /> {po.partnerSignatureUrl ? "Change" : "Add"}</button>}
                  {canEdit && po.partnerSignatureUrl && <button onClick={() => clearPartnerImg(po._id, "signature")} className="text-[10px] font-bold text-slate-400 hover:text-red-500">Remove</button>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-slate-400">Stamp:</span>
                  {po.partnerStampUrl ? <img src={imgSrc(po.partnerStampUrl)} alt="partner stamp" className="h-10 object-contain" /> : <span className="text-[11px] text-slate-400 italic">none</span>}
                  {canEdit && <button onClick={() => setPartnerPicker({ pid: po._id, target: "stamp" })} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 hover:bg-slate-200"><Stamp size={10} /> {po.partnerStampUrl ? "Change" : "Add"}</button>}
                  {canEdit && po.partnerStampUrl && <button onClick={() => clearPartnerImg(po._id, "stamp")} className="text-[10px] font-bold text-slate-400 hover:text-red-500">Remove</button>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Approved submittals — optionally add the approved submittal document(s) to the PO */}
        {(() => {
          const itemIds = Array.from(new Set(po.lineItems.map((l) => l.itemId).filter(Boolean) as string[]));
          const rows = itemIds.map((iid) => ({ iid, data: approvedSubDocsForItem(iid) })).filter((r) => r.data && r.data.atts.length);
          if (!rows.length) return null;
          return (
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><FileCheck2 size={11} /> Approved submittals <span className="font-medium normal-case text-slate-400">— optional; add the approved document(s) to this PO</span></p>
              {rows.map(({ iid, data }) => (
                <div key={iid} className="bg-white rounded-xl border border-slate-100 p-2.5">
                  <p className="text-[11px] font-bold text-slate-700 mb-1">{data!.sub.title || data!.sub.productName || "Submittal"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data!.atts.map((a) => {
                      const attached = po.attachments.some((x) => x.kind === "submittal" && x.name === a.name);
                      return (
                        <span key={a._id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-600">
                          <FileText size={10} /> {a.name}
                          {canEdit && (attached
                            ? <span className="text-emerald-600 inline-flex items-center gap-0.5"><Check size={10} /> Added</span>
                            : <button onClick={() => attachSubmittal(po._id, a)} className="text-primary hover:underline">Add</button>)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        <SavedVersionsPanel
          heading={`Saved PO ${po.poNo} Versions`}
          subtitle="Freeze a PDF copy of this PO. Preview, print, or download any revision anytime."
          canEdit={canEdit}
          formats={[{ label: "PDF", ext: "pdf", baseName: `PO_${po.poNo}`, build: async () => (await buildPoPackage(po, vendors.find((v) => v._id === po.vendorId), projectInfo)).blob }]}
          fetchList={() => fetchSavedDocuments(projectId, "po", po._id)}
          saveVersion={(file, fileName, meta) => saveDocumentVersion(projectId, { kind: "po", refId: po._id, title: meta.title, status: meta.status }, file, fileName)}
          update={(docId, body) => updateSavedDocument(projectId, docId, body)}
          remove={(docId) => deleteSavedDocument(projectId, docId).then(() => {})}
          toast={toast}
        />

        {/* Create the PO document — placed at the END: it bundles everything above (PO details,
            vendor quotation, invoice, other files) with the Terms & Conditions last. */}
        {canEdit && (
          <div className="pt-1 space-y-2 border-t border-slate-100">
            <button onClick={() => downloadPdf(po)} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-primary transition-colors whitespace-nowrap">
              <FileDown size={16} /> Create PO document
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setPreview({ title: `Purchase Order ${po.poNo}`, fileName: `PO_${po.poNo}.pdf`, build: async () => (await buildPoPackage(po, vendors.find((v) => v._id === po.vendorId), projectInfo)).blob })} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors whitespace-nowrap"><Eye size={15} /> Preview</button>
              <button onClick={() => savePoToDocuments(po)} disabled={savingDoc === po._id} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap">{savingDoc === po._id ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Save to documents</button>
              {/* CR-B-14a / CR-PR-01 — Word export. */}
              <button onClick={() => {
                const nn = (s?: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
                const fmt = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });
                const rows = (po.lineItems || []).map((l, i) => [String(i + 1), l.description || "", l.qty || "", l.unitPrice || "", fmt(nn(l.qty) * nn(l.unitPrice))]);
                const body = `<h1>Purchase Order — ${escapeHtml(po.poNo)}</h1>`
                  + `<p class="muted">Vendor: ${escapeHtml(po.vendorName || "")}</p>`
                  + htmlTable(["#", "Description", "Qty", "Unit price", "Total"], rows, [2, 3, 4])
                  + `<p class="right"><strong>Total: ${escapeHtml(fmt(nn(po.total)))}</strong></p>`
                  + (po.terms ? `<h2>Terms &amp; Conditions</h2><p>${escapeHtml(po.terms)}</p>` : "");
                downloadHtmlAsWord(`PO ${po.poNo}`, body, `PO_${po.poNo}`);
              }} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors whitespace-nowrap"><FileText size={15} /> Word</button>
            </div>
            <p className="text-[10px] text-slate-400 text-center">Bundles the PO details, vendor quote, invoice &amp; other files — with the Terms &amp; Conditions added last.</p>
          </div>
        )}
      </div>
    );
  };

  const renderPoRow = (po: ApiProcurementPO) => {
        const isOpen = openId === po._id;
        const att = (kind: string) => po.attachments.filter((a) => a.kind === kind);
        return (
          <Fragment key={po._id}>
            <tr className="hover:bg-slate-50/40">
              <td className="px-3 py-2 align-top"><button onClick={() => setOpenId(isOpen ? null : po._id)} className="text-slate-400 hover:text-slate-900">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button></td>
              <td className="px-3 py-2 align-top font-bold text-slate-700 whitespace-nowrap">PO {po.poNo}</td>
              <td className="px-3 py-2 align-top text-slate-500 whitespace-nowrap">{poRef(po) || "—"}</td>
              <td className="px-3 py-2 align-top font-bold text-slate-700">{po.vendorName || vendorName(po.vendorId) || <span className="text-slate-300 font-medium italic">— add in detail</span>}</td>
              <td className="px-3 py-2 align-top text-slate-500">{po.lineItems.length}</td>
              <td className="px-3 py-2 align-top font-bold text-slate-700 whitespace-nowrap">{money(n(po.total))}</td>
              <td className="px-3 py-2 align-top whitespace-nowrap"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusCls[po.status] || "bg-slate-100 text-slate-500"}`}>{po.status}</span></td>
              <td className="px-3 py-2 align-top text-slate-500 whitespace-nowrap">{po.invoiceNo || "—"}</td>
              <td className="px-3 py-2 align-top">
                <div className="flex items-center justify-end gap-1.5">
                  {canEdit && <button onClick={() => setManageId(po._id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-primary hover:text-white" title="Manage — status, terms, invoice, documents"><Settings2 size={12} /> Manage</button>}
                  <button onClick={() => setPreview({ title: `Purchase Order ${po.poNo}`, fileName: `PO_${po.poNo}.pdf`, build: async () => (await buildPoPackage(po, vendors.find((v) => v._id === po.vendorId), projectInfo)).blob })} className="p-1.5 rounded text-slate-400 hover:text-primary hover:bg-white" title="Preview PO document"><Eye size={14} /></button>
                  <button onClick={() => downloadPdf(po)} className="p-1.5 rounded text-slate-400 hover:text-primary hover:bg-white" title="PO PDF"><Download size={14} /></button>
                  {canEdit && <button onClick={() => archivePO(po._id, !po.archived)} className="p-1.5 rounded text-slate-300 hover:text-amber-500 hover:bg-white" title={po.archived ? "Restore" : "Archive"}>{po.archived ? <RotateCcw size={13} /> : <Archive size={13} />}</button>}
                  {canEdit && <button onClick={() => removePO(po._id)} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-white" title="Delete"><Trash2 size={13} /></button>}
                </div>
              </td>
            </tr>
            {isOpen && (
              <tr><td colSpan={9} className="p-0 bg-slate-50/30 border-t border-slate-100">
              {renderPoPreview(po)}
              </td></tr>
            )}
          </Fragment>
        );
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h3 className="text-xl font-display font-bold text-slate-900">Purchase Orders</h3><PresenceBar users={present} /></div>
          <p className="text-xs font-medium text-slate-400 mt-1">Create a PO from an accepted quote, link the vendor invoice, and it auto-posts to the project expenses.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEdit && <button onClick={() => setShowArchived((v) => !v)} className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-bold border ${showArchived ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-200 hover:text-slate-900"}`}><Archive size={12} /> {showArchived ? "Active" : "Archived"}</button>}
          {pos.length > 0 && <button onClick={printSummary} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold"><FileText size={13} /> Print summary</button>}
          {/* CR-PR-06 — the PO tab now has a +New PO button with source options. */}
          {canEdit && !showArchived && (
            <div className="relative">
              <button onClick={() => setNewPoMenu((v) => !v)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-primary"><Plus size={14} /> New PO <ChevronDown size={12} /></button>
              {newPoMenu && (
                <>
                  <button type="button" aria-label="Close" onClick={() => setNewPoMenu(false)} className="fixed inset-0 z-10 cursor-default" />
                  <div className="absolute right-0 z-20 mt-1 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5">
                    <button onClick={createManual} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 text-sm font-semibold text-slate-700">Manual PO <span className="block text-[10px] font-medium text-slate-400">Empty PO — add vendor &amp; line items yourself</span></button>
                    <button onClick={() => { setNewPoMenu(false); onGoToBOQ?.(); }} disabled={!onGoToBOQ} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 text-sm font-semibold text-slate-700 disabled:opacity-40">From BOQ items <span className="block text-[10px] font-medium text-slate-400">Select items in BOQ → Create PO</span></button>
                    <button onClick={() => { setNewPoMenu(false); (onGoToQuotes ?? onGoToRFQ)?.(); }} disabled={!onGoToQuotes && !onGoToRFQ} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 text-sm font-semibold text-slate-700 disabled:opacity-40">From an approved quote <span className="block text-[10px] font-medium text-slate-400">Open Quotes → accepted quote → Create PO</span></button>
                    <button onClick={() => { setNewPoMenu(false); onGoToRFQ?.(); }} disabled={!onGoToRFQ} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 text-sm font-semibold text-slate-700 disabled:opacity-40">From RFQ <span className="block text-[10px] font-medium text-slate-400">Open RFQs → convert to PO</span></button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* §F6 — PO summary: how many + total value */}
      {pos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-lg font-display font-bold text-slate-700 leading-none">{pos.length}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Purchase orders</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/10">
            <span className="text-lg font-display font-bold text-primary leading-none">{money(poTotal)}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total value</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100">
            <span className="text-lg font-display font-bold text-emerald-600 leading-none">{money(paidTotal)}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Amount paid</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-100" title="Total value minus amount paid">
            <span className="text-lg font-display font-bold text-amber-600 leading-none">{money(poTotal - paidTotal)}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Remaining to pay</span>
          </span>
        </div>
      )}

      {/* Awarded quotes ready to convert */}
      {canEdit && awardable.length > 0 && (
        <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">Accepted quotes — convert to PO</p>
          <div className="flex flex-wrap gap-2">
            {awardable.map(({ rfq, quote }) => (
              <button key={quote._id} onClick={() => createPO(rfq._id, quote._id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-primary/20 text-xs font-bold text-slate-700 hover:bg-primary hover:text-white transition-colors">
                <Plus size={12} /> {rfqRef(rfq) ? `BOQ #${rfqRef(rfq)}` : rfq.rfqNo} · {vendorName(quote.vendorId)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      {pos.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-grow">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by PO number, vendor, invoice or item…" className={`${inp} pl-9`} />
          </div>
          {search && <button onClick={() => setSearch("")} className="text-[11px] font-bold text-slate-500 hover:text-slate-900 px-2">Clear</button>}
          <span className="text-[10px] text-slate-400">{visiblePOs.length} of {pos.length}</span>
        </div>
      )}

      {pos.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-6 text-center">No purchase orders yet.{canEdit ? " Accept a quote in the RFQs tab, then convert it here." : ""}</p>
      ) : visiblePOs.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-6 text-center">No purchase orders match your search.</p>
      ) : (
        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
          <table className="w-full min-w-[860px] text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="w-8 px-3 py-2" />
                <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]"><button onClick={() => toggleSort("poNo")} className="uppercase tracking-widest hover:text-slate-700">PO #{sortArrow("poNo")}</button></th>
                <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]"><button onClick={() => toggleSort("boq")} className="uppercase tracking-widest hover:text-slate-700">BOQ #{sortArrow("boq")}</button></th>
                <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]"><button onClick={() => toggleSort("vendor")} className="uppercase tracking-widest hover:text-slate-700">Vendor{sortArrow("vendor")}</button></th>
                <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Items</th>
                <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]"><button onClick={() => toggleSort("total")} className="uppercase tracking-widest hover:text-slate-700">Total{sortArrow("total")}</button></th>
                <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]"><button onClick={() => toggleSort("status")} className="uppercase tracking-widest hover:text-slate-700">Status{sortArrow("status")}</button></th>
                <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Invoice</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
            {sortedPOs.map(renderPoRow)}
            </tbody>
          </table>
        </div>
      )}
      {dialogs}
      {preview && <PdfPreviewModal title={preview.title} fileName={preview.fileName} build={preview.build} onClose={() => setPreview(null)} />}

      {/* §A1 — Actions modal: status, terms, invoice, documents */}
      {manageId && (() => {
        const m = pos.find((p) => p._id === manageId);
        if (!m) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">PO {m.poNo}{poRef(m) ? ` · BOQ #${poRef(m)}` : ""} · {m.vendorName || vendorName(m.vendorId) || "Purchase Order"}</p>
                  <p className="text-[10px] text-slate-400">Manage PO — edits save automatically</p>
                </div>
                <button onClick={() => setManageId(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
              </div>
              {renderPoDetail(m)}
            </div>
          </div>
        );
      })()}

      {/* Partner signature/stamp picker — images saved on the partner's profile (JV settings).
          Shows ONLY that partner's saved signatures or stamps; pick one, or upload a new file. */}
      {partnerPicker && (() => {
        const list = (partnerPicker.target === "signature" ? projectInfo?.partner?.signatures : projectInfo?.partner?.stamps) || [];
        const label = partnerPicker.target === "signature" ? "signature" : "stamp";
        return (
          <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={() => setPartnerPicker(null)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-16" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">{partnerPicker.target === "signature" ? <PenLine size={16} className="text-primary" /> : <Stamp size={16} className="text-primary" />}<p className="text-sm font-bold text-slate-900">Choose {projectInfo?.partner?.name || "partner"}'s {label}</p></div>
                <button onClick={() => setPartnerPicker(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-4">
                {list.length === 0 ? (
                  <p className="text-sm text-slate-400 italic text-center py-4">No {label}s saved on the partner profile yet. Add them in <span className="font-bold">Project Identity → Joint Venture</span>, or upload one below.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {list.map((s, i) => (
                      <button key={i} onClick={() => pickPartnerImg(partnerPicker.pid, partnerPicker.target, s.url)} className="border border-slate-100 rounded-2xl p-3 hover:border-primary hover:shadow-md transition-all flex flex-col items-center gap-2">
                        <img src={imgSrc(s.url)} alt={s.name || label} className="h-16 object-contain" />
                        <span className="text-[10px] font-bold text-slate-500 truncate w-full text-center">{s.name || `${label} ${i + 1}`}</span>
                      </button>
                    ))}
                  </div>
                )}
                <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-600 text-xs font-bold hover:border-primary hover:text-primary cursor-pointer">
                  <Upload size={13} /> Upload a new {label} instead
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { void uploadPartyImg(partnerPicker.pid, f, partnerPicker.target); setPartnerPicker(null); } e.target.value = ""; }} />
                </label>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Stamp picker — company stamps from the classified Stamps tab */}
      {stampPickerFor && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={() => setStampPickerFor(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-16" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2"><Stamp size={16} className="text-primary" /><p className="text-sm font-bold text-slate-900">Choose a company stamp</p></div>
              <button onClick={() => setStampPickerFor(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5">
              {stamps.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-6">No stamps yet. An admin uploads stamps in <span className="font-bold">Documents → Classified → Stamps</span>.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {stamps.map((s) => (
                    <button key={s._id} onClick={() => pickStamp(stampPickerFor, s.filePath || s.url)} className="border border-slate-100 rounded-2xl p-3 hover:border-primary hover:shadow-md transition-all flex flex-col items-center gap-2">
                      <img src={imgSrc(s.filePath || s.url)} alt={s.name} className="h-20 object-contain" />
                      <span className="text-[10px] font-bold text-slate-500 truncate w-full text-center">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
