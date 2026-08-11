import { Fragment, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, ChevronRight, ChevronDown, Download, Award, Building2, Eye, AlertCircle, Search, Settings2, X, Send, Upload, FileText, CheckCircle2, Truck, Check, Paperclip, Archive, RotateCcw } from "lucide-react";
import {
  fetchVendors, addVendor, updateVendor, deleteVendor, fetchRfqs, createRfq, updateRfq, deleteRfq, setRfqArchived, sendRfq,
  addVendorQuote, updateVendorQuote, deleteVendorQuote, awardVendorQuote, createProcurementPO,
  uploadVendorQuoteAttachment, deleteVendorQuoteAttachment, uploadRfqLineFile, deleteRfqLineFile, uploadRfqDocument, deleteRfqDocument,
  fetchProcurementItems, fetchProcurementSections, fetchSubmittals, attachmentUrl, uploadDocument,
  fetchCompanies, COMPANY_CATEGORIES,
  type ApiVendor, type ApiRfq, type ApiVendorQuote, type RfqLineItem, type ApiProcurementItem, type ApiProcurementSection, type ApiSubmittal, type RfqStatus, type ApiCompany, type RfqRecipient,
} from "../../lib/api";
import { fetchSavedDocuments, saveDocumentVersion, updateSavedDocument, deleteSavedDocument } from "../../lib/api";
import { buildRfqPdf } from "../../lib/rfqPdf";
import { buildSubmittalPackage } from "../../lib/submittalPackage";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { downloadHtmlAsWord, htmlTable, escapeHtml } from "../../lib/wordExport";
import { buildPoPackage } from "../../lib/poPdf";
import type { ProjectPdfInfo } from "../../lib/pdfProjectHeader";
import { downloadBlob } from "../../lib/proposalExport";
import { toast } from "../../lib/toast";
import PresenceBar from "./PresenceBar";
import { useBuilderPresence } from "../../lib/usePresence";
import { useDialogs } from "../../lib/useDialogs";
import PdfPreviewModal from "./PdfPreviewModal";
import SavedVersionsPanel from "./SavedVersionsPanel";
import { AddressPicker } from "./AddressPicker";

const n = (s: string) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });
const inp = "w-full bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10";

// When the vendor gives a single lump-sum price we store it in totalOverride and skip the per-line
// math; shipping cost + tax are still added on top.
function quoteItemsTotal(rfq: ApiRfq, q: ApiVendorQuote): number {
  if (n(q.totalOverride || "") > 0) return n(q.totalOverride || "");
  let sum = 0;
  for (const li of rfq.lineItems) {
    const ql = q.lineItems.find((x) => x.itemId === li.itemId);
    sum += n(li.qty) * n(ql?.unitPrice || "");
  }
  return sum;
}
function quoteTotal(rfq: ApiRfq, q: ApiVendorQuote): number {
  return quoteItemsTotal(rfq, q) + n(q.shipping) + n(q.tax);
}

export default function ProcurementRFQ({ projectId, canEdit, projectInfo, onGoToPO, openRfqId, onOpenedRfq }: { projectId: string; canEdit: boolean; projectInfo?: ProjectPdfInfo; onGoToPO?: () => void; openRfqId?: string; onOpenedRfq?: () => void }) {
  const present = useBuilderPresence(projectId ? `rfq:${projectId}` : null, "RFQs"); // CR-B-01
  const [vendors, setVendors] = useState<ApiVendor[]>([]);
  const [rfqs, setRfqs] = useState<ApiRfq[]>([]);
  const [openDocs, setOpenDocs] = useState<Set<string>>(new Set()); // CR-PR-03 — expanded per-item doc panels
  // CR-PR-04 — choose RFQ receivers from the Companies Directory.
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [receiverFor, setReceiverFor] = useState<string | null>(null); // rfq id whose receiver picker is open
  const [recvSearch, setRecvSearch] = useState("");
  const [items, setItems] = useState<ApiProcurementItem[]>([]);
  const [submittals, setSubmittals] = useState<ApiSubmittal[]>([]);
  const [sections, setSections] = useState<ApiProcurementSection[]>([]);
  const [approvedOnly, setApprovedOnly] = useState(true); // Step-1 default: RFQ off approved submittals
  const [secNames, setSecNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const [showVendorForm, setShowVendorForm] = useState(false);
  const [vDraft, setVDraft] = useState({ name: "", country: "", city: "", contactName: "", email: "", phone: "" });
  const [creating, setCreating] = useState(false);
  const [rTitle, setRTitle] = useState("");
  const [rShipTo, setRShipTo] = useState("");
  const [rDelivery, setRDelivery] = useState("Delivery");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [rVendors, setRVendors] = useState<Record<string, boolean>>({}); // vendors to send the new RFQ to
  const [preview, setPreview] = useState<{ title: string; fileName: string; build: () => Promise<Blob> } | null>(null);
  const [search, setSearch] = useState("");
  const [manageId, setManageId] = useState<string | null>(null); // §A1 — actions via popup
  const [vendorEditId, setVendorEditId] = useState<string | null>(null); // vendor view/edit popup
  const [vEdit, setVEdit] = useState({ name: "", country: "", city: "", contactName: "", email: "", phone: "" });
  const [addItemsFor, setAddItemsFor] = useState<string | null>(null); // RFQ id whose "add item from BOQ" picker is open
  const [addItemPicks, setAddItemPicks] = useState<Record<string, boolean>>({});
  const [inlineVendorFor, setInlineVendorFor] = useState<string | null>(null); // RFQ id showing the inline "new vendor" form
  const [savingDoc, setSavingDoc] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false); // CR-PR-07 — toggle archived RFQs
  const { confirm, dialogs } = useDialogs();

  // Auto-open a specific RFQ's manage popup (e.g. right after creating it from the BOQ).
  useEffect(() => {
    if (openRfqId && rfqs.some((r) => r._id === openRfqId)) { setManageId(openRfqId); onOpenedRfq?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRfqId, rfqs]);

  const load = async () => {
    setLoading(true);
    try {
      const [v, r, it, secs, subs] = await Promise.all([fetchVendors(projectId), fetchRfqs(projectId, showArchived), fetchProcurementItems(projectId), fetchProcurementSections(projectId), fetchSubmittals(projectId)]);
      setVendors(v); setRfqs(r); setItems(it.filter((x) => x.status !== "Cancelled")); setSubmittals(subs); setSections(secs);
      setSecNames(Object.fromEntries(secs.map((s) => [s._id, s.name])));
    } catch { /* keep */ } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [projectId, showArchived]);
  // CR-PR-07 — archive or restore an RFQ; it drops out of the current (active/archived) view.
  const archiveRfq = async (rid: string, next: boolean) => {
    try { await setRfqArchived(projectId, rid, next); setRfqs((p) => p.filter((r) => r._id !== rid)); toast(next ? "RFQ archived." : "RFQ restored.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not archive.", "error"); }
  };

  const vendorName = (vid: string) => vendors.find((v) => v._id === vid)?.name || "Unassigned";

  // The submittal approval state behind a BOQ item — Step 1 keys off this: we only request quotes
  // once the client has approved the product. Returns the approval label + the approved brand/option.
  const submittalFor = (itemId: string) => submittals.find((s) => s.itemId === itemId);
  // CR-PR-03 — page 1 is the RFQ table; the FOLLOWING pages carry each item's supporting docs so
  // the vendor knows exactly what's needed: the per-item "Upload Docs" files (specs / data sheet /
  // drawings / picture) and, when "Include Submittal Package?" is ticked, the current submittal
  // package. Each item is introduced by a labelled divider page.
  const buildRfqWithSubmittals = async (rfq: ApiRfq, vendor?: ApiVendor): Promise<Blob> => {
    const base = await buildRfqPdf(pdfRfq(rfq), vendor, projectInfo);
    const lines = rfq.lineItems || [];
    const hasExtras = lines.some((li) => li.includeSubmittal || (li.attachments && li.attachments.length));
    if (!hasExtras) return base;
    try {
      const merged = await PDFDocument.load(await base.arrayBuffer());
      const font = await merged.embedFont(StandardFonts.Helvetica);
      const bold = await merged.embedFont(StandardFonts.HelveticaBold);
      const INK = rgb(0.06, 0.09, 0.16), MUTED = rgb(0.39, 0.45, 0.55), GREEN = rgb(0.06, 0.72, 0.51);
      // A labelled A4 divider page announcing the item / document that follows.
      const divider = (title: string, subtitle: string) => {
        const p = merged.addPage([595.28, 841.89]);
        p.drawRectangle({ x: 0, y: p.getHeight() - 8, width: p.getWidth(), height: 8, color: GREEN });
        p.drawText(title.slice(0, 70), { x: 48, y: p.getHeight() - 120, size: 20, font: bold, color: INK });
        if (subtitle) p.drawText(subtitle.slice(0, 90), { x: 48, y: p.getHeight() - 148, size: 11, font, color: MUTED });
      };
      // Fetch a file and append its pages (PDF) or a full-page image (png/jpg). Best-effort.
      const appendFile = async (filePath: string, fileType: string, name: string) => {
        try {
          const ext = (fileType || name.split(".").pop() || "").toLowerCase();
          const res = await fetch(attachmentUrl(filePath));
          if (!res.ok) return;
          const bytes = await res.arrayBuffer();
          if (ext === "pdf") {
            const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
            (await merged.copyPages(src, src.getPageIndices())).forEach((p) => merged.addPage(p));
          } else if (["png", "jpg", "jpeg"].includes(ext)) {
            const img = ext === "png" ? await merged.embedPng(bytes) : await merged.embedJpg(bytes);
            const page = merged.addPage([595.28, 841.89]);
            const m = 48, scale = Math.min((page.getWidth() - m * 2) / img.width, (page.getHeight() - m * 2) / img.height, 1);
            page.drawImage(img, { x: (page.getWidth() - img.width * scale) / 2, y: (page.getHeight() - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
          }
        } catch { /* skip unreadable file */ }
      };
      let n = 0;
      for (const li of lines) {
        n++;
        const atts = li.attachments || [];
        if (!atts.length && !li.includeSubmittal) continue;
        divider(`Item ${n}: ${li.description || "Material"}`, [li.manufacturer, li.spec].filter(Boolean).join(" · "));
        for (const a of atts) await appendFile(a.filePath, a.fileType, a.name);
        if (li.includeSubmittal) {
          const sub = submittalFor(li.itemId);
          const rev = sub?.revisions?.find((r) => r.isCurrent) || sub?.revisions?.[(sub?.revisions?.length || 1) - 1];
          if (sub && rev) {
            const { blob } = await buildSubmittalPackage(sub, rev);
            const pkg = await PDFDocument.load(await blob.arrayBuffer());
            (await merged.copyPages(pkg, pkg.getPageIndices())).forEach((p) => merged.addPage(p));
          }
        }
      }
      return new Blob([await merged.save()], { type: "application/pdf" });
    } catch { return base; }
  };
  const approvalOf = (itemId: string): { state: "approved" | "pending" | "none"; label: string; brand: string } => {
    const s = submittalFor(itemId);
    if (!s || !s.revisions?.length) return { state: "none", label: "No submittal", brand: "" };
    const cur = s.revisions.find((r) => r.isCurrent) || s.revisions[s.revisions.length - 1];
    const approved = cur.disposition === "Approved" || cur.disposition === "ApprovedAsNoted";
    return { state: approved ? "approved" : "pending", label: approved ? (cur.disposition === "ApprovedAsNoted" ? "Approved as Noted" : "Approved") : "Awaiting client", brand: cur.optionLabel || s.manufacturer || "" };
  };

  // The BOQ item number(s) an RFQ relates to — the SAME continuous numbering the BOQ & Submittals
  // tabs use. RFQs/POs are identified by these instead of a separate 7000/8000 sequence.
  const boqNo: Record<string, number> = {};
  { let k = 0; for (const s of sections) for (const it of items.filter((x) => x.sectionId === s._id)) if (it.status !== "Cancelled") boqNo[it._id] = ++k; }
  const refNos = (rfq: ApiRfq) => rfq.lineItems.map((li) => boqNo[li.itemId]).filter(Boolean).sort((a, b) => a - b);
  const rfqRef = (rfq: ApiRfq) => refNos(rfq).join(", ");            // BOQ item numbers "1, 2", "" if unlinked
  // The item name(s) this RFQ covers — shown in the Description column, comma-separated for many.
  const itemNames = (rfq: ApiRfq) => rfq.lineItems.map((li) => li.description).filter(Boolean).join(", ");
  const rfqDesc = (rfq: ApiRfq) => itemNames(rfq) || rfq.title || "RFQ";

  // Enrich an RFQ's line items with the full BOQ/submittal detail the vendor needs on the PDF —
  // the client-approved brand, model, and required on-site date — pulled live at build time.
  const enrichLine = (li: RfqLineItem): RfqLineItem => {
    const it = items.find((x) => x._id === li.itemId);
    const ap = approvalOf(li.itemId);
    const brand = ap.state === "approved" && ap.brand ? ap.brand : (it?.manufacturer || "");
    return { ...li, manufacturer: brand, modelNo: it?.modelNo || "", needOnSiteDate: it?.needOnSiteDate || "", spec: li.spec || it?.spec || "" };
  };
  const pdfRfq = (rfq: ApiRfq): ApiRfq => ({ ...rfq, lineItems: rfq.lineItems.map(enrichLine) });

  // Search across RFQ number, title, vendor names, and line-item descriptions.
  const visibleRfqs = rfqs.filter((rfq) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    if ([rfq.rfqNo, rfq.title, rfqRef(rfq)].some((v) => String(v || "").toLowerCase().includes(q))) return true;
    if (rfq.quotes.some((qt) => vendorName(qt.vendorId).toLowerCase().includes(q))) return true;
    if (rfq.lineItems.some((li) => String(li.description || "").toLowerCase().includes(q))) return true;
    return false;
  });

  // Two-step lifecycle status — prefer the stored status; fall back to derivation for older RFQs.
  const rfqStatus = (rfq: ApiRfq): RfqStatus => {
    if (rfq.quotes.some((q) => q.status === "Awarded")) return "Awarded";
    if (rfq.status) return rfq.status;
    if (rfq.quotes.length) return "Quoting";
    return "Draft";
  };
  const STATUS_META: Record<RfqStatus, { label: string; cls: string }> = {
    Draft: { label: "Draft — not sent", cls: "bg-slate-100 text-slate-500" },
    Sent: { label: "Sent to vendors", cls: "bg-indigo-50 text-indigo-600" },
    Quoting: { label: "Quotes in — comparing", cls: "bg-amber-50 text-amber-600" },
    Awarded: { label: "Accepted", cls: "bg-emerald-50 text-emerald-600" },
  };
  type SortKey = "rfqNo" | "boq" | "desc" | "items" | "status";
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const toggleSort = (key: SortKey) => setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  const sortArrow = (key: string) => (sort?.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");
  // Default order: latest RFQ on top (highest rfqNo). A column sort overrides it.
  const sortedRfqs = !sort
    ? [...visibleRfqs].sort((a, b) => (Number(b.rfqNo) || 0) - (Number(a.rfqNo) || 0))
    : [...visibleRfqs].sort((a, b) => {
        const val = (r: ApiRfq) => sort.key === "rfqNo" ? (Number(r.rfqNo) || 0) : sort.key === "boq" ? (refNos(r)[0] || 0) : sort.key === "items" ? r.lineItems.length : sort.key === "status" ? rfqStatus(r) : rfqDesc(r).toLowerCase();
        const av = val(a), bv = val(b);
        return av < bv ? -sort.dir : av > bv ? sort.dir : 0;
      });

  // ── Vendors ──
  const saveVendor = async () => {
    if (!vDraft.name.trim()) { toast("Vendor name required.", "error"); return; }
    try { const v = await addVendor(projectId, vDraft); setVendors((p) => [...p, v]); setVDraft({ name: "", country: "", city: "", contactName: "", email: "", phone: "" }); setShowVendorForm(false); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not add vendor.", "error"); }
  };
  const removeVendor = async (vid: string) => {
    if (!(await confirm({ title: "Delete vendor?", message: "This removes the vendor from this project.", confirmLabel: "Delete" }))) return;
    try { await deleteVendor(projectId, vid); setVendors((p) => p.filter((v) => v._id !== vid)); setVendorEditId(null); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  // Open a vendor's info popup (view / edit / delete).
  const openVendor = (v: ApiVendor) => { setVEdit({ name: v.name, country: v.country, city: v.city, contactName: v.contactName, email: v.email, phone: v.phone }); setVendorEditId(v._id); };
  const saveVendorEdit = async () => {
    if (!vendorEditId) return;
    if (!vEdit.name.trim()) { toast("Vendor name required.", "error"); return; }
    try { const v = await updateVendor(projectId, vendorEditId, vEdit); setVendors((p) => p.map((x) => x._id === v._id ? v : x)); setVendorEditId(null); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not update vendor.", "error"); }
  };

  // ── RFQ create ──
  const create = async () => {
    const chosen = items.filter((it) => picked[it._id]);
    if (!chosen.length) { toast("Select at least one BOQ item.", "error"); return; }
    // Snapshot the BOQ line; the approved brand + on-site date are enriched onto the PDF at build time.
    const lineItems: RfqLineItem[] = chosen.map((it) => ({ itemId: it._id, description: it.description, qty: it.qty, unit: it.unit, spec: it.spec }));
    try {
      const rfq = await createRfq(projectId, { title: rTitle, lineItems, shipToLocation: rShipTo, deliveryMethod: rDelivery });
      // Auto-create a quote column for each vendor we're sending to (Step 2 is then ready to price).
      const vIds = vendors.filter((v) => rVendors[v._id]).map((v) => v._id);
      for (const vid of vIds) { try { await addVendorQuote(projectId, rfq._id, vid); } catch { /* skip */ } }
      setCreating(false); setPicked({}); setRVendors({}); setRTitle(""); setRShipTo(""); setRDelivery("Delivery"); setOpenId(rfq._id);
      void autoSaveRfqDoc(rfq); // documents copy exists whether or not "Save to documents" is clicked
      void load(); // pulls the RFQ back with its vendor quote columns
    } catch (err) { toast(err instanceof Error ? err.message : "Could not create RFQ.", "error"); }
  };
  // CR-PR-02 — create a shell RFQ so an already-made RFQ document can be uploaded to it.
  const createUploadRfq = async () => {
    try {
      const rfq = await createRfq(projectId, { title: "Uploaded RFQ", lineItems: [] });
      setRfqs((p) => [...p, rfq]); setOpenId(rfq._id); setCreating(false);
      toast("RFQ created — upload your ready-made document in the panel below.", "success");
      void load();
    } catch (err) { toast(err instanceof Error ? err.message : "Could not create RFQ.", "error"); }
  };
  const uploadRfqDoc = async (rfq: ApiRfq, file: File) => {
    try { const up = await uploadRfqDocument(projectId, rfq._id, file); setRfqs((p) => p.map((r) => (r._id === up._id ? up : r))); }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
  };
  const removeRfqDoc = async (rfq: ApiRfq) => {
    try { const up = await deleteRfqDocument(projectId, rfq._id); setRfqs((p) => p.map((r) => (r._id === up._id ? up : r))); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  const removeRfq = async (rid: string) => {
    if (!(await confirm({ title: "Delete RFQ?", message: "This deletes the RFQ and all its vendor quotes.", confirmLabel: "Delete" }))) return;
    try { await deleteRfq(projectId, rid); setRfqs((p) => p.filter((r) => r._id !== rid)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };

  // Edit an RFQ's shipping fields (D5).
  const setRfqShip = (rid: string, field: "shipToLocation" | "deliveryMethod", value: string) => setRfqs((p) => p.map((r) => r._id === rid ? { ...r, [field]: value } : r));
  const saveRfqShip = (rid: string, field: "shipToLocation" | "deliveryMethod", value: string) => { updateRfq(projectId, rid, { [field]: value }).catch(() => {}); };

  // RFQ-level notes (custom info printed after the item table on the PDF).
  const setRfqNotes = (rid: string, value: string) => setRfqs((p) => p.map((r) => r._id === rid ? { ...r, notes: value } : r));
  const saveRfqNotes = (rid: string, value: string) => { updateRfq(projectId, rid, { notes: value }).catch(() => {}); };

  // Add BOQ items to an existing RFQ (from the manage popup).
  const removeLineItem = async (rfq: ApiRfq, itemId: string) => {
    const lineItems = rfq.lineItems.filter((l) => l.itemId !== itemId);
    setRfqs((p) => p.map((r) => r._id === rfq._id ? { ...r, lineItems } : r));
    try { await updateRfq(projectId, rfq._id, { lineItems }); } catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
  };

  // CR-PR-03 — per-item documents + "Include Submittal Package?".
  const toggleDocs = (id?: string) => { if (!id) return; setOpenDocs((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const toggleIncludeSubmittal = async (rfq: ApiRfq, li: RfqLineItem) => {
    const lineItems = rfq.lineItems.map((l) => (l._id === li._id ? { ...l, includeSubmittal: !l.includeSubmittal } : l));
    setRfqs((p) => p.map((r) => (r._id === rfq._id ? { ...r, lineItems } : r)));
    try { await updateRfq(projectId, rfq._id, { lineItems }); } catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
  };
  const uploadLineDoc = async (rfq: ApiRfq, li: RfqLineItem, file: File) => {
    if (!li._id) return;
    try { const up = await uploadRfqLineFile(projectId, rfq._id, li._id, file); setRfqs((p) => p.map((r) => (r._id === up._id ? up : r))); }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
  };
  const deleteLineDoc = async (rfq: ApiRfq, li: RfqLineItem, aid?: string) => {
    if (!li._id || !aid) return;
    try { const up = await deleteRfqLineFile(projectId, rfq._id, li._id, aid); setRfqs((p) => p.map((r) => (r._id === up._id ? up : r))); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };

  // CR-PR-04 — receiver picker (from the Companies Directory).
  useEffect(() => { fetchCompanies().then(setCompanies).catch(() => {}); }, []);
  const toggleRecipient = async (rfq: ApiRfq, c: ApiCompany) => {
    const has = (rfq.recipients || []).some((r) => r.companyId === c._id);
    const recipients: RfqRecipient[] = has
      ? (rfq.recipients || []).filter((r) => r.companyId !== c._id)
      : [...(rfq.recipients || []), { companyId: c._id, name: c.name, category: c.category }];
    setRfqs((p) => p.map((r) => (r._id === rfq._id ? { ...r, recipients } : r)));
    try { await updateRfq(projectId, rfq._id, { recipients }); } catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
  };
  const confirmAddItems = async (rfq: ApiRfq) => {
    const chosen = items.filter((it) => addItemPicks[it._id] && !rfq.lineItems.some((l) => l.itemId === it._id));
    if (!chosen.length) { setAddItemsFor(null); return; }
    const lineItems = [...rfq.lineItems, ...chosen.map((it) => ({ itemId: it._id, description: it.description, qty: it.qty, unit: it.unit, spec: it.spec }))];
    setRfqs((p) => p.map((r) => r._id === rfq._id ? { ...r, lineItems } : r));
    setAddItemsFor(null); setAddItemPicks({});
    try { await updateRfq(projectId, rfq._id, { lineItems }); } catch (err) { toast(err instanceof Error ? err.message : "Could not add items.", "error"); }
  };
  // Auto-save the RFQ PDF into the project documents on creation — best-effort, no toast.
  const autoSaveRfqDoc = async (rfq: ApiRfq) => {
    try {
      const blob = await buildRfqWithSubmittals(rfq);
      await uploadDocument(projectId, new File([blob], `RFQ_${rfq.rfqNo}.pdf`, { type: "application/pdf" }), "procurement-rfq", true);
    } catch { /* best-effort */ }
  };
  // Save the RFQ PDF into the organized project documents (Procurement → RFQs). When a vendor is
  // given, saves that vendor's own copy (their details in the vendor section) under a distinct name.
  const saveRfqToDocuments = async (rfq: ApiRfq, vendor?: ApiVendor) => {
    setSavingDoc(vendor ? `${rfq._id}:${vendor._id}` : rfq._id);
    try {
      const blob = await buildRfqWithSubmittals(rfq, vendor);
      const suffix = vendor ? `_${vendor.name.replace(/\s+/g, "_")}` : "";
      const file = new File([blob], `RFQ_${rfq.rfqNo}${suffix}.pdf`, { type: "application/pdf" });
      await uploadDocument(projectId, file, "procurement-rfq", !vendor);
      toast(vendor ? `Saved ${vendor.name}'s RFQ to documents.` : "Saved to project documents (Procurement → RFQs).", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save.", "error"); }
    finally { setSavingDoc(null); }
  };
  // Inline "new vendor" from within an RFQ — creates the vendor and immediately attaches it.
  const saveInlineVendor = async (rfq: ApiRfq) => {
    if (!vDraft.name.trim()) { toast("Vendor name required.", "error"); return; }
    try {
      const v = await addVendor(projectId, vDraft);
      setVendors((p) => [...p, v]);
      setVDraft({ name: "", country: "", city: "", contactName: "", email: "", phone: "" });
      setInlineVendorFor(null);
      await addQuote(rfq._id, v._id); // attach as a Step-2 column right away
    } catch (err) { toast(err instanceof Error ? err.message : "Could not add vendor.", "error"); }
  };

  // ── Quotes ──
  const patchQuote = (rid: string, q: ApiVendorQuote) => setRfqs((p) => p.map((r) => r._id === rid ? { ...r, quotes: r.quotes.map((x) => x._id === q._id ? q : x) } : r));
  const addQuote = async (rid: string, vendorId: string) => {
    if (!vendorId) return;
    try { const q = await addVendorQuote(projectId, rid, vendorId); setRfqs((p) => p.map((r) => r._id === rid ? { ...r, quotes: [...r.quotes, q] } : r)); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not add quote.", "error"); }
  };
  // Toggle a vendor on/off an RFQ (Step 1 "send to") — adds/removes its Step-2 price column.
  const toggleRfqVendor = async (rfq: ApiRfq, vendorId: string) => {
    const existing = rfq.quotes.find((q) => q.vendorId === vendorId);
    if (existing) {
      if (existing.lineItems.some((l) => n(l.unitPrice) > 0) && !(await confirm({ title: "Remove this vendor?", message: "This vendor already has prices entered — removing them deletes that quote.", confirmLabel: "Remove" }))) return;
      await removeQuote(rfq._id, existing._id);
    } else {
      await addQuote(rfq._id, vendorId);
    }
  };
  const setQuoteLine = (rid: string, q: ApiVendorQuote, itemId: string, unitPrice: string) => {
    const lineItems = q.lineItems.some((l) => l.itemId === itemId)
      ? q.lineItems.map((l) => l.itemId === itemId ? { ...l, unitPrice } : l)
      : [...q.lineItems, { itemId, unitPrice }];
    patchQuote(rid, { ...q, lineItems });
  };
  const saveQuoteLines = (rid: string, qid: string, lineItems: ApiVendorQuote["lineItems"]) => { updateVendorQuote(projectId, rid, qid, { lineItems }).catch(() => {}); };
  const setQuoteField = (rid: string, q: ApiVendorQuote, field: "totalOverride" | "shipping" | "tax" | "leadTimeDays" | "notes", value: string) => {
    patchQuote(rid, { ...q, [field]: value });
  };
  const saveQuoteField = (rid: string, qid: string, field: string, value: string) => { updateVendorQuote(projectId, rid, qid, { [field]: value }).catch(() => {}); };
  const removeQuote = async (rid: string, qid: string) => {
    try { await deleteVendorQuote(projectId, rid, qid); setRfqs((p) => p.map((r) => r._id === rid ? { ...r, quotes: r.quotes.filter((x) => x._id !== qid) } : r)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  const award = async (rid: string, qid: string) => {
    try {
      await awardVendorQuote(projectId, rid, qid);
      setRfqs((p) => p.map((r) => r._id === rid ? { ...r, quotes: r.quotes.map((x) => ({ ...x, status: x._id === qid ? "Awarded" : "NotSelected" })) } : r));
      // D9 — offer to create the purchase order right away, carrying this quote across.
      const vName = vendorName(rfqs.find((r) => r._id === rid)?.quotes.find((q) => q._id === qid)?.vendorId || "");
      if (await confirm({ title: "Quote accepted", message: `Create the purchase order for ${vName} now? The accepted quote carries over automatically. (You can also do this later from the Purchase Orders tab.)`, confirmLabel: "Create PO now", danger: false })) {
        try {
          const po = await createProcurementPO(projectId, rid, qid);
          // Auto-save the PO document into the project documents (whether or not it's saved manually later).
          try {
            const { blob } = await buildPoPackage(po, vendors.find((v) => v._id === po.vendorId), projectInfo);
            await uploadDocument(projectId, new File([blob], `PO_${po.poNo}.pdf`, { type: "application/pdf" }), "procurement-po", true);
          } catch { /* best-effort */ }
          toast("Purchase order created — opening Purchase Orders.", "success");
          onGoToPO?.();
        } catch (err) { toast(err instanceof Error ? err.message : "Awarded, but could not create the PO — do it from the Purchase Orders tab.", "error"); }
      }
    } catch (err) { toast(err instanceof Error ? err.message : "Could not award.", "error"); }
  };
  // STEP 1 — send the request to vendors (Draft → Sent; advances BOQ items to RFQ_Sent).
  const sendRequest = async (rid: string) => {
    try {
      const updated = await sendRfq(projectId, rid);
      setRfqs((p) => p.map((r) => r._id === rid ? { ...r, status: updated.status, sentAt: updated.sentAt } : r));
      toast("RFQ sent to vendors — now add each vendor's returned quote below.", "success");
      void load(); // refresh BOQ item statuses
    } catch (err) { toast(err instanceof Error ? err.message : "Could not mark as sent.", "error"); }
  };
  // Manage the request status directly. Picking "Sent" from Draft routes through the send action
  // (so the BOQ items advance too); any other change is a straight status update.
  const changeRfqStatus = async (rfq: ApiRfq, status: RfqStatus) => {
    if (status === rfqStatus(rfq)) return;
    if (status === "Sent" && rfqStatus(rfq) === "Draft") { void sendRequest(rfq._id); return; }
    try {
      const u = await updateRfq(projectId, rfq._id, { status });
      setRfqs((p) => p.map((r) => r._id === rfq._id ? { ...r, status: u.status } : r));
    } catch (err) { toast(err instanceof Error ? err.message : "Could not update status.", "error"); }
  };
  // STEP 2 — upload / remove a vendor's returned quotation document.
  const uploadQuoteDoc = async (rid: string, qid: string, file: File) => {
    try { const q = await uploadVendorQuoteAttachment(projectId, rid, qid, file); patchQuote(rid, q); }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
  };
  const removeQuoteDoc = async (rid: string, qid: string, aid: string) => {
    try { const q = await deleteVendorQuoteAttachment(projectId, rid, qid, aid); patchQuote(rid, q); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  const downloadRfqPdf = async (rfq: ApiRfq, vendorId?: string) => {
    try { const blob = await buildRfqWithSubmittals(rfq, vendors.find((v) => v._id === vendorId)); downloadBlob(blob, `RFQ_${rfq.rfqNo}${vendorId ? "_" + vendorName(vendorId).replace(/\s+/g, "_") : ""}.pdf`); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not build PDF.", "error"); }
  };

  // Full RFQ editor — shown in the actions modal (shipping, add quotes, prices, award, versions).
  const renderRfqDetail = (rfq: ApiRfq) => {
    const totals = rfq.quotes.map((q) => ({ q, total: quoteTotal(rfq, q), lead: n(q.leadTimeDays) }));
    const lowest = totals.filter((t) => t.total > 0).sort((a, b) => a.total - b.total)[0]?.q._id;
    const fastest = totals.filter((t) => t.lead > 0).sort((a, b) => a.lead - b.lead)[0]?.q._id;
    const st = rfqStatus(rfq);
    const sent = st !== "Draft";
    return (
              <div className="p-4 space-y-4">
                {/* ── STEP 1 — Request (send to vendors) ─────────────────────────────── */}
                <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
                      <div>
                        <p className="text-sm font-bold text-slate-800">Request — send to vendors</p>
                        <p className="text-[10px] text-slate-400">Items (from the approved submittals &amp; BOQ) plus where and how they ship.</p>
                      </div>
                    </div>
                    {/* Manage the request status directly (Quoting/Awarded usually set automatically). */}
                    {canEdit ? (
                      <select value={st} onChange={(e) => changeRfqStatus(rfq, e.target.value as RfqStatus)} title="Request status" className={`px-2 py-1 rounded-full text-[10px] font-bold border-0 cursor-pointer ${STATUS_META[st].cls}`}>
                        {(["Draft", "Sent", "Quoting", "Awarded"] as RfqStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${STATUS_META[st].cls}`}>{STATUS_META[st].label}</span>
                    )}
                  </div>

                  {/* Items being requested (from the approved submittal + BOQ) — mirrors the RFQ PDF */}
                  <div className="rounded-xl border border-slate-100 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-[11px]">
                      <thead className="bg-slate-50 text-[9px] uppercase tracking-widest text-slate-400"><tr>
                        <th className="text-left px-2 py-1.5 w-8">#</th><th className="text-left px-2 py-1.5">Description</th><th className="text-left px-2 py-1.5">Brand</th><th className="text-left px-2 py-1.5">Qty</th><th className="text-left px-2 py-1.5">Unit</th><th className="text-left px-2 py-1.5">Spec</th><th className="text-left px-2 py-1.5">Need by</th><th className="text-left px-2 py-1.5 w-16">Docs</th>
                      </tr></thead>
                      <tbody>
                        {rfq.lineItems.map((li0, i) => {
                          const li = enrichLine(li0);
                          const docCount = (li0.attachments || []).length;
                          const docsOpen = !!li0._id && openDocs.has(li0._id);
                          return (
                          <Fragment key={li0._id || li.itemId}>
                          <tr className={`border-t border-slate-50 ${li.cancelled ? "bg-red-50/40" : ""}`}>
                            <td className="px-2 py-1.5 text-slate-400 font-bold">{i + 1}</td>
                            <td className={`px-2 py-1.5 font-bold ${li.cancelled ? "text-red-400 line-through" : "text-slate-700"}`}>{li.description || "—"}{li.cancelled && <span className="ml-1.5 text-[9px] font-bold text-red-500 uppercase">cancelled</span>}{li0.includeSubmittal && <span className="ml-1.5 text-[9px] font-bold text-primary uppercase">+ submittal</span>}</td>
                            <td className="px-2 py-1.5 text-slate-500">{li.manufacturer || "—"}</td>
                            <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{li.qty || "—"}</td>
                            <td className="px-2 py-1.5 text-slate-500">{li.unit || "—"}</td>
                            <td className="px-2 py-1.5 text-slate-500">{li.spec || "—"}</td>
                            <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{li.needOnSiteDate || "—"}</td>
                            <td className="px-2 py-1.5 text-right whitespace-nowrap">
                              <button onClick={() => toggleDocs(li0._id)} disabled={!li0._id} className={`inline-flex items-center gap-1 mr-1 px-1.5 py-0.5 rounded ${docCount || docsOpen ? "text-primary" : "text-slate-300 hover:text-primary"} disabled:opacity-30`} title="Per-item documents / include submittal package"><Paperclip size={11} />{docCount > 0 ? docCount : ""}</button>
                              {canEdit && <button onClick={() => removeLineItem(rfq, li.itemId)} className="text-slate-300 hover:text-red-500" title="Remove item from this RFQ"><Trash2 size={11} /></button>}
                            </td>
                          </tr>
                          {docsOpen && (
                            <tr className="bg-slate-50/70">
                              <td colSpan={8} className="px-3 py-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <label className={`flex items-center gap-1.5 text-[11px] font-bold text-slate-600 ${canEdit ? "cursor-pointer" : ""}`}><input type="checkbox" checked={!!li0.includeSubmittal} disabled={!canEdit} onChange={() => toggleIncludeSubmittal(rfq, li0)} /> Include Submittal Package?</label>
                                  <span className="w-px h-4 bg-slate-200" />
                                  {(li0.attachments || []).map((a) => (
                                    <span key={a._id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-600">
                                      <FileText size={10} /> <a href={attachmentUrl(a.filePath)} target="_blank" rel="noreferrer" className="hover:text-primary max-w-[12rem] truncate">{a.name}</a>
                                      {canEdit && <button onClick={() => deleteLineDoc(rfq, li0, a._id)} className="text-slate-300 hover:text-red-500"><X size={10} /></button>}
                                    </span>
                                  ))}
                                  {canEdit && <label className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary cursor-pointer"><Upload size={11} /> Upload Docs<input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLineDoc(rfq, li0, f); e.target.value = ""; }} /></label>}
                                  {(li0.attachments || []).length === 0 && <span className="text-[10px] text-slate-400 italic">No docs yet — add specs, data sheet, drawings for the vendor.</span>}
                                </div>
                              </td>
                            </tr>
                          )}
                          </Fragment>
                          );
                        })}
                        {rfq.lineItems.length === 0 && <tr><td colSpan={8} className="px-2 py-3 text-center text-slate-400 italic">No items — add from the BOQ below.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  {canEdit && (
                    <button onClick={() => { setAddItemPicks({}); setAddItemsFor(rfq._id); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-600 text-[11px] font-bold hover:border-primary hover:text-primary"><Plus size={12} /> Add item from BOQ</button>
                  )}

                  {/* Custom notes / description — printed after the item table on the PDF (specs, standards, etc.) */}
                  <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><FileText size={12} /> Notes &amp; description <span className="font-medium normal-case text-slate-400">— extra info for the vendor (specs, standards); shown after the table on the PDF</span></div>
                    <textarea rows={3} className={`${inp} resize-y`} placeholder="e.g. All items must comply with ASTM C591; submit mill certs with delivery…" value={rfq.notes || ""} disabled={!canEdit} onChange={(e) => setRfqNotes(rfq._id, e.target.value)} onBlur={(e) => saveRfqNotes(rfq._id, e.target.value)} />
                  </div>

                  {/* CR-PR-02 — an already-made RFQ document uploaded for this RFQ. */}
                  <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Upload size={12} /> Uploaded RFQ document <span className="font-medium normal-case text-slate-400">— optional, if the RFQ was made outside the platform</span></div>
                    <div className="flex flex-wrap items-center gap-2">
                      {rfq.uploadedDocument ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-600">
                          <FileText size={11} /> <a href={attachmentUrl(rfq.uploadedDocument.filePath)} target="_blank" rel="noreferrer" className="hover:text-primary">{rfq.uploadedDocument.name}</a>
                          {canEdit && <button onClick={() => removeRfqDoc(rfq)} className="text-slate-300 hover:text-red-500 ml-1"><X size={11} /></button>}
                        </span>
                      ) : <span className="text-[11px] text-slate-400 italic">No document uploaded.</span>}
                      {canEdit && <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary cursor-pointer"><Upload size={11} /> {rfq.uploadedDocument ? "Replace" : "Upload"}<input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRfqDoc(rfq, f); e.target.value = ""; }} /></label>}
                    </div>
                  </div>

                  {/* CR-PR-04 — receivers chosen from the Companies Directory. */}
                  <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Send size={12} /> Send to {(rfq.recipients?.length || 0) > 0 && <span className="text-slate-400 normal-case">({rfq.recipients!.length})</span>}</div>
                      {canEdit && <button onClick={() => { setReceiverFor(rfq._id); setRecvSearch(""); }} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary"><Building2 size={11} /> Choose receivers</button>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(rfq.recipients || []).length === 0 && <span className="text-[10px] text-slate-400 italic">No receivers chosen — pick vendors, subs, manufacturers, etc. from the Directory.</span>}
                      {(rfq.recipients || []).map((r) => (
                        <span key={r.companyId} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-600">
                          {r.name}<span className="text-slate-300">· {r.category}</span>
                          {canEdit && <button onClick={() => toggleRecipient(rfq, { _id: r.companyId, name: r.name, category: r.category } as ApiCompany)} className="text-slate-300 hover:text-red-500"><X size={10} /></button>}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Shipping (address + type) — carried onto the PO */}
                  <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Truck size={12} /> Shipping — type &amp; address (sent to the vendor, carried onto the PO)</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select className={`${inp} font-bold max-w-[10rem]`} value={rfq.deliveryMethod || "Delivery"} disabled={!canEdit} onChange={(e) => { setRfqShip(rfq._id, "deliveryMethod", e.target.value); saveRfqShip(rfq._id, "deliveryMethod", e.target.value); }}>
                        <option value="Delivery">Delivery</option>
                        <option value="Pickup">Pickup</option>
                      </select>
                      <AddressPicker value={rfq.shipToLocation || ""} projectSite={projectInfo?.siteAddress || projectInfo?.location} disabled={!canEdit} onChange={(v) => { setRfqShip(rfq._id, "shipToLocation", v); saveRfqShip(rfq._id, "shipToLocation", v); }} />
                    </div>
                  </div>

                  {/* Send to vendors — for our tracking; each selected vendor gets a price column in
                      Step 2. This list is NOT shown on the RFQ PDF. */}
                  <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Building2 size={12} /> Send to vendors <span className="font-medium normal-case text-slate-400">— auto-adds each vendor's price column below (not on the PDF)</span></div>
                      {canEdit && <button onClick={() => setInlineVendorFor(inlineVendorFor === rfq._id ? null : rfq._id)} className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1 shrink-0"><Plus size={11} /> New vendor</button>}
                    </div>
                    {vendors.length === 0 && inlineVendorFor !== rfq._id ? (
                      <p className="text-[11px] text-slate-400 italic">No vendors yet — add one with “New vendor”.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {vendors.map((v) => {
                          const on = rfq.quotes.some((q) => q.vendorId === v._id);
                          return (
                            <button key={v._id} disabled={!canEdit} onClick={() => toggleRfqVendor(rfq, v._id)} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors disabled:opacity-60 ${on ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:border-primary/40"}`}>
                              {on && <Check size={11} />}{v.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {inlineVendorFor === rfq._id && canEdit && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1 bg-white rounded-xl p-2 border border-slate-100">
                        <input className={inp} placeholder="Name *" value={vDraft.name} onChange={(e) => setVDraft({ ...vDraft, name: e.target.value })} />
                        <input className={inp} placeholder="Country" value={vDraft.country} onChange={(e) => setVDraft({ ...vDraft, country: e.target.value })} />
                        <input className={inp} placeholder="City" value={vDraft.city} onChange={(e) => setVDraft({ ...vDraft, city: e.target.value })} />
                        <input className={inp} placeholder="Contact" value={vDraft.contactName} onChange={(e) => setVDraft({ ...vDraft, contactName: e.target.value })} />
                        <input className={inp} placeholder="Email" value={vDraft.email} onChange={(e) => setVDraft({ ...vDraft, email: e.target.value })} />
                        <input className={inp} placeholder="Phone" value={vDraft.phone} onChange={(e) => setVDraft({ ...vDraft, phone: e.target.value })} />
                        <button onClick={() => saveInlineVendor(rfq)} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold col-span-2 md:col-span-1">Add &amp; attach</button>
                      </div>
                    )}
                  </div>

                  {/* Actions — the generic (no-vendor) RFQ document. */}
                  <div className="flex flex-wrap items-center gap-2">
                    {sent && <span className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold text-emerald-600"><CheckCircle2 size={14} /> Sent to vendors{rfq.sentAt ? ` · ${rfq.sentAt}` : ""}</span>}
                    <button onClick={() => setPreview({ title: `RFQ ${rfq.rfqNo}`, fileName: `RFQ_${rfq.rfqNo}.pdf`, build: () => buildRfqWithSubmittals(rfq) })} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-50"><Eye size={12} /> Preview (generic)</button>
                    <button onClick={() => downloadRfqPdf(rfq)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-50"><Download size={12} /> Generic PDF</button>
                    {/* CR-B-14a / CR-PR-01 — Word export. */}
                    <button onClick={() => {
                      const li = pdfRfq(rfq).lineItems;
                      const body = `<h1>Request for Quotation — ${escapeHtml(rfq.rfqNo)}</h1>`
                        + (rfq.title ? `<p class="muted">${escapeHtml(rfq.title)}</p>` : "")
                        + htmlTable(["#", "Description", "Brand", "Qty", "Unit", "Spec", "Need by"], li.map((l, i) => [String(i + 1), l.description || "", l.manufacturer || "", l.qty || "", l.unit || "", l.spec || "", l.needOnSiteDate || ""]), [3])
                        + (rfq.notes ? `<h2>Notes</h2><p>${escapeHtml(rfq.notes)}</p>` : "")
                        + `<p>Kindly provide your quotation and delivery lead time for the items above.</p>`;
                      downloadHtmlAsWord(`RFQ ${rfq.rfqNo}`, body, `RFQ_${rfq.rfqNo}`);
                    }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-50"><FileText size={12} /> Word</button>
                    {canEdit && <button onClick={() => saveRfqToDocuments(rfq)} disabled={savingDoc === rfq._id} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-50">{savingDoc === rfq._id ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} Save to documents</button>}
                  </div>

                  {/* Per-vendor RFQ documents — each vendor gets their own copy with their details in
                      the vendor section, so you download and send the right one to each. */}
                  {rfq.quotes.length > 0 && (
                    <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><FileText size={11} /> Per-vendor RFQ documents <span className="font-medium normal-case text-slate-400">— each vendor's own copy to download &amp; send</span></p>
                      <div className="space-y-1.5">
                        {rfq.quotes.map((q) => {
                          const vendor = vendors.find((v) => v._id === q.vendorId);
                          if (!vendor) return null;
                          const busyKey = `${rfq._id}:${vendor._id}`;
                          return (
                            <div key={q._id} className="flex flex-wrap items-center gap-2 bg-white rounded-lg border border-slate-100 px-3 py-2">
                              <span className="text-[11px] font-bold text-slate-700 flex-grow">{vendor.name}{vendor.country ? <span className="text-slate-400 font-medium"> · {vendor.country}</span> : null}</span>
                              <button onClick={() => setPreview({ title: `RFQ ${rfq.rfqNo} · ${vendor.name}`, fileName: `RFQ_${rfq.rfqNo}_${vendor.name.replace(/\s+/g, "_")}.pdf`, build: () => buildRfqWithSubmittals(rfq, vendor) })} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-100"><Eye size={11} /> Preview</button>
                              <button onClick={() => downloadRfqPdf(rfq, vendor._id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-100"><Download size={11} /> Download</button>
                              {canEdit && <button onClick={() => saveRfqToDocuments(rfq, vendor)} disabled={savingDoc === busyKey} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-primary hover:bg-primary/5 disabled:opacity-50">{savingDoc === busyKey ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />} Save</button>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── STEP 2 — Quotes (receive, compare, accept) ─────────────────────── */}
                <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0">2</span>
                    <div>
                      <p className="text-sm font-bold text-slate-800">Quotes — receive, compare &amp; accept</p>
                      <p className="text-[10px] text-slate-400">A column is created for each vendor you chose in Step 1. Upload their returned quotation, enter their prices, then accept the best one.</p>
                    </div>
                  </div>
                  {!sent && <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-[11px] font-bold text-amber-700"><AlertCircle size={13} /> Send the request in Step 1 first — then fill in prices here as vendors reply.</div>}
                  {rfq.quotes.length === 0 && <p className="text-[11px] text-slate-400 italic">No vendors selected yet — choose them under “Send to vendors” in Step 1.</p>}

                {/* Leveling matrix */}
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px] sticky left-0 bg-white min-w-[14rem]">Item</th>
                        {rfq.quotes.map((q) => (
                          <th key={q._id} className={`px-3 py-2 text-left min-w-[10rem] ${q.status === "Awarded" ? "bg-emerald-50" : ""}`}>
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-slate-700">{vendorName(q.vendorId)}</span>
                              {canEdit && <button onClick={() => removeQuote(rfq._id, q._id)} className="text-slate-300 hover:text-red-500"><Trash2 size={10} /></button>}
                            </div>
                            <div className="flex gap-1 mt-1">
                              {q._id === lowest && <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[8px] font-bold">LOWEST</span>}
                              {q._id === fastest && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[8px] font-bold">FASTEST</span>}
                              {q.status === "Awarded" && <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[8px] font-bold">ACCEPTED</span>}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rfq.lineItems.map((li) => (
                        <tr key={li.itemId} className={`border-t border-slate-50 ${li.cancelled ? "bg-red-50/50" : ""}`}>
                          <td className={`px-3 py-1.5 sticky left-0 ${li.cancelled ? "bg-red-50/50" : "bg-white"}`}><span className={`font-bold ${li.cancelled ? "text-red-400 line-through" : "text-slate-700"}`}>{li.description || "—"}</span><span className="text-slate-400"> · {[li.qty, li.unit].filter(Boolean).join(" ")}</span>{li.cancelled && <span className="ml-1.5 text-[9px] font-bold text-red-500 uppercase">cancelled</span>}</td>
                          {rfq.quotes.map((q) => {
                            const ql = q.lineItems.find((x) => x.itemId === li.itemId);
                            return (
                              <td key={q._id} className={`px-2 py-1 ${q.status === "Awarded" ? "bg-emerald-50/50" : ""}`}>
                                <input className={inp} placeholder="unit $" value={ql?.unitPrice || ""} disabled={!canEdit}
                                  onChange={(e) => setQuoteLine(rfq._id, q, li.itemId, e.target.value)}
                                  onBlur={() => { const cur = rfqs.find((r) => r._id === rfq._id)?.quotes.find((x) => x._id === q._id); if (cur) saveQuoteLines(rfq._id, q._id, cur.lineItems); }} />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {/* Total-at-once — enter a single lump-sum item total instead of per-line prices */}
                      <tr className="border-t border-slate-100 bg-slate-50/60">
                        <td className="px-3 py-1.5 sticky left-0 bg-slate-50/60 text-[11px] font-bold text-slate-600" title="Optional — enter one lump-sum item total instead of unit prices above">Total cost (enter once)</td>
                        {rfq.quotes.map((q) => (
                          <td key={q._id} className={`px-2 py-1 ${q.status === "Awarded" ? "bg-emerald-50/50" : ""}`}>
                            <input className={inp} placeholder="lump sum $" value={q.totalOverride || ""} disabled={!canEdit}
                              onChange={(e) => setQuoteField(rfq._id, q, "totalOverride", e.target.value)}
                              onBlur={(e) => saveQuoteField(rfq._id, q._id, "totalOverride", e.target.value)} />
                          </td>
                        ))}
                      </tr>
                      {/* Shipping cost / Tax / Lead / Total / Award */}
                      {([["shipping", "Shipping cost"], ["tax", "Tax / Duty"], ["leadTimeDays", "Lead time (days)"]] as const).map(([field, label]) => (
                        <tr key={field} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 sticky left-0 bg-white text-[11px] font-bold text-slate-500">{label}</td>
                          {rfq.quotes.map((q) => (
                            <td key={q._id} className={`px-2 py-1 ${q.status === "Awarded" ? "bg-emerald-50/50" : ""}`}>
                              <input className={inp} value={(q[field] as string) || ""} disabled={!canEdit}
                                onChange={(e) => setQuoteField(rfq._id, q, field, e.target.value)}
                                onBlur={(e) => saveQuoteField(rfq._id, q._id, field, e.target.value)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                      {/* Quotation document — the vendor's returned quote file, uploaded per vendor */}
                      <tr className="border-t border-slate-100">
                        <td className="px-3 py-1.5 sticky left-0 bg-white text-[11px] font-bold text-slate-500">Quotation doc</td>
                        {rfq.quotes.map((q) => (
                          <td key={q._id} className={`px-2 py-1 align-top ${q.status === "Awarded" ? "bg-emerald-50/50" : ""}`}>
                            <div className="flex flex-col gap-1">
                              {(q.attachments || []).map((a) => (
                                <span key={a._id} className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600">
                                  <a href={attachmentUrl(a.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary max-w-[120px] truncate" title={a.name}><FileText size={10} />{a.name}</a>
                                  {canEdit && <button onClick={() => removeQuoteDoc(rfq._id, q._id, a._id)} className="text-slate-300 hover:text-red-500"><X size={10} /></button>}
                                </span>
                              ))}
                              {canEdit && (
                                <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-600 cursor-pointer hover:bg-slate-200 w-fit">
                                  <Upload size={10} /> Upload
                                  <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadQuoteDoc(rfq._id, q._id, f); e.target.value = ""; }} />
                                </label>
                              )}
                            </div>
                          </td>
                        ))}
                      </tr>
                      <tr className="border-t-2 border-slate-200">
                        <td className="px-3 py-2 sticky left-0 bg-white text-[11px] font-bold text-slate-700 uppercase tracking-widest">Total</td>
                        {totals.map(({ q, total }) => (
                          <td key={q._id} className={`px-3 py-2 font-bold ${q._id === lowest ? "text-emerald-600" : "text-slate-800"} ${q.status === "Awarded" ? "bg-emerald-50/50" : ""}`}>{money(total)}</td>
                        ))}
                      </tr>
                      {canEdit && (
                        <tr>
                          <td className="px-3 py-2 sticky left-0 bg-white" />
                          {rfq.quotes.map((q) => (
                            <td key={q._id} className="px-2 py-2">
                              <div className="flex flex-col gap-1">
                                <button onClick={() => award(rfq._id, q._id)} title="Accept this quote — you'll buy from this vendor" className={`flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${q.status === "Awarded" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-emerald-100"}`}><Award size={11} /> {q.status === "Awarded" ? "Accepted" : "Accept quote"}</button>
                              </div>
                            </td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {rfq.quotes.length === 0 && <p className="text-[11px] text-slate-400 italic mt-2">Choose vendors under “Send to vendors” in Step 1 to start comparing.</p>}
                </div>
                <SavedVersionsPanel
                  heading={`Saved RFQ ${rfq.rfqNo} Versions`}
                  subtitle="Freeze a PDF copy of this RFQ. Preview, print, or download any revision anytime."
                  canEdit={canEdit}
                  formats={[{ label: "PDF", ext: "pdf", baseName: `RFQ_${rfq.rfqNo}`, build: () => buildRfqWithSubmittals(rfq) }]}
                  fetchList={() => fetchSavedDocuments(projectId, "rfq", rfq._id)}
                  saveVersion={(file, fileName, meta) => saveDocumentVersion(projectId, { kind: "rfq", refId: rfq._id, title: meta.title, status: meta.status }, file, fileName)}
                  update={(docId, body) => updateSavedDocument(projectId, docId, body)}
                  remove={(docId) => deleteSavedDocument(projectId, docId).then(() => {})}
                  toast={toast}
                />
                </div>
              </div>
    );
  };

  // Read-only quote summary shown in the expanded sub-row (viewing only).
  const renderRfqPreview = (rfq: ApiRfq) => {
    const totals = rfq.quotes.map((q) => ({ q, total: quoteTotal(rfq, q), lead: n(q.leadTimeDays) }));
    const lowest = totals.filter((t) => t.total > 0).sort((a, b) => a.total - b.total)[0]?.q._id;
    const fastest = totals.filter((t) => t.lead > 0).sort((a, b) => a.lead - b.lead)[0]?.q._id;
    return (
      <div className="p-4 space-y-3">
        <div className="text-[11px] text-slate-500"><span className="font-bold text-slate-600">Ship-to:</span> {rfq.deliveryMethod || "Delivery"}{rfq.shipToLocation ? ` · ${rfq.shipToLocation}` : ""}</div>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead><tr>
              <th className="text-left px-3 py-1.5 font-bold text-slate-500 uppercase tracking-widest text-[10px] sticky left-0 bg-white min-w-[14rem]">Item</th>
              {rfq.quotes.map((q) => (
                <th key={q._id} className="px-3 py-1.5 text-left min-w-[8rem]"><span className="font-bold text-slate-700">{vendorName(q.vendorId)}</span>{q._id === lowest && <span className="ml-1 px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[8px] font-bold">LOWEST</span>}{q._id === fastest && <span className="ml-1 px-1 py-0.5 rounded bg-blue-100 text-blue-700 text-[8px] font-bold">FASTEST</span>}{q.status === "Awarded" && <span className="ml-1 px-1 py-0.5 rounded bg-emerald-600 text-white text-[8px] font-bold">ACCEPTED</span>}</th>
              ))}
            </tr></thead>
            <tbody>
              {rfq.lineItems.map((li) => (
                <tr key={li.itemId} className="border-t border-slate-50">
                  <td className={`px-3 py-1.5 sticky left-0 bg-white font-bold ${li.cancelled ? "text-red-400 line-through" : "text-slate-700"}`}>{li.description || "—"} <span className="text-slate-400 font-medium">· {[li.qty, li.unit].filter(Boolean).join(" ")}</span></td>
                  {rfq.quotes.map((q) => { const ql = q.lineItems.find((x) => x.itemId === li.itemId); return <td key={q._id} className="px-3 py-1.5 text-slate-600">{ql?.unitPrice ? money(n(ql.unitPrice)) : "—"}</td>; })}
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200"><td className="px-3 py-1.5 sticky left-0 bg-white font-bold text-slate-700 uppercase tracking-widest text-[10px]">Total</td>{totals.map(({ q, total }) => <td key={q._id} className={`px-3 py-1.5 font-bold ${q._id === lowest ? "text-emerald-600" : "text-slate-800"}`}>{money(total)}</td>)}</tr>
            </tbody>
          </table>
          {rfq.quotes.length === 0 && <p className="text-[11px] text-slate-400 italic mt-2">No vendor quotes yet.</p>}
        </div>
        {canEdit && <button onClick={() => setManageId(rfq._id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Settings2 size={12} /> Manage — add quotes, prices, award, shipping</button>}
      </div>
    );
  };

  const renderRfqRow = (rfq: ApiRfq) => {
        const isOpen = openId === rfq._id;
        const totals = rfq.quotes.map((q) => ({ q, total: quoteTotal(rfq, q), lead: n(q.leadTimeDays) }));
        const lowest = totals.filter((t) => t.total > 0).sort((a, b) => a.total - b.total)[0]?.q._id;
        const fastest = totals.filter((t) => t.lead > 0).sort((a, b) => a.lead - b.lead)[0]?.q._id;
        const st = rfqStatus(rfq);
        const stMeta = STATUS_META[st];
        return (
          <Fragment key={rfq._id}>
            <tr className="hover:bg-slate-50/40">
              <td className="px-3 py-2 align-top"><button onClick={() => setOpenId(isOpen ? null : rfq._id)} className="text-slate-400 hover:text-slate-900">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button></td>
              <td className="px-3 py-2 align-top font-bold text-slate-700 whitespace-nowrap">RFQ {rfq.rfqNo}</td>
              <td className="px-3 py-2 align-top text-slate-500 whitespace-nowrap">{rfqRef(rfq) || "—"}</td>
              <td className="px-3 py-2 align-top font-bold text-slate-700">{rfqDesc(rfq)}</td>
              <td className="px-3 py-2 align-top text-slate-500">{rfq.lineItems.length}</td>
              <td className="px-3 py-2 align-top">
                <div className="flex flex-wrap items-center gap-1">
                  {rfq.quotes.length === 0 ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600"><AlertCircle size={10} /> waiting for vendor</span>
                  ) : rfq.quotes.map((q) => {
                    const priced = q.lineItems.some((l) => n(l.unitPrice) > 0);
                    return (
                      <span key={q._id} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${q.status === "Awarded" ? "bg-emerald-600 text-white" : priced ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}
                        title={q.status === "Awarded" ? "Accepted" : priced ? "Quote received" : "Waiting for this vendor's price"}>
                        <span className={`w-1.5 h-1.5 rounded-full ${q.status === "Awarded" ? "bg-white" : priced ? "bg-emerald-500" : "bg-amber-500"}`} />
                        {vendorName(q.vendorId)}
                      </span>
                    );
                  })}
                </div>
              </td>
              <td className="px-3 py-2 align-top whitespace-nowrap"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${stMeta.cls}`}>{stMeta.label}</span></td>
              <td className="px-3 py-2 align-top">
                <div className="flex items-center justify-end gap-1.5">
                  {canEdit && <button onClick={() => setManageId(rfq._id)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-primary hover:text-white" title="Manage — quotes, prices, award, shipping"><Settings2 size={12} /> Manage</button>}
                  <button onClick={() => setPreview({ title: `RFQ ${rfq.rfqNo}`, fileName: `RFQ_${rfq.rfqNo}.pdf`, build: () => buildRfqWithSubmittals(rfq) })} className="p-1.5 rounded text-slate-400 hover:text-primary hover:bg-white" title="Preview"><Eye size={14} /></button>
                  <button onClick={() => downloadRfqPdf(rfq)} className="p-1.5 rounded text-slate-400 hover:text-primary hover:bg-white" title="RFQ PDF"><Download size={14} /></button>
                  {canEdit && <button onClick={() => archiveRfq(rfq._id, !rfq.archived)} className="p-1.5 rounded text-slate-300 hover:text-amber-500 hover:bg-white" title={rfq.archived ? "Restore" : "Archive"}>{rfq.archived ? <RotateCcw size={13} /> : <Archive size={13} />}</button>}
                  {canEdit && <button onClick={() => removeRfq(rfq._id)} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-white" title="Delete"><Trash2 size={13} /></button>}
                </div>
              </td>
            </tr>
            {isOpen && (
              <tr><td colSpan={8} className="p-0 bg-slate-50/30 border-t border-slate-100">
              {renderRfqPreview(rfq)}
              </td></tr>
            )}
          </Fragment>
        );
  };

  if (loading) return <div className="py-12 flex justify-center text-slate-300"><Loader2 size={22} className="animate-spin" /></div>;

  return (
    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h3 className="text-xl font-display font-bold text-slate-900">RFQs &amp; Bid Leveling</h3><PresenceBar users={present} /></div>
          <p className="text-xs font-medium text-slate-400 mt-1">Two steps: <span className="font-bold text-slate-500">1</span> request quotes for approved items &amp; send to vendors, then <span className="font-bold text-slate-500">2</span> upload their quotes, compare, and accept one. All quotes are kept.</p>
        </div>
        {canEdit && <button onClick={() => setShowArchived((v) => !v)} className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-bold border ${showArchived ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-200 hover:text-slate-900"}`} title={showArchived ? "Show active RFQs" : "Show archived RFQs"}><Archive size={12} /> {showArchived ? "Active" : "Archived"}</button>}
        {canEdit && !showArchived && <button onClick={createUploadRfq} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:border-primary hover:text-primary transition-all" title="RFQ already made — upload the ready document"><Upload size={13} /> Upload RFQ</button>}
        {canEdit && !showArchived && <button onClick={() => setCreating((v) => !v)} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary transition-all"><Plus size={13} /> New RFQ</button>}
      </div>

      {/* Vendors */}
      <div className="bg-slate-50 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5" title="Vendors are shared across all projects — add once, reuse everywhere"><Building2 size={11} /> Vendors ({vendors.length}) · shared</p>
          {canEdit && <button onClick={() => setShowVendorForm((v) => !v)} className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"><Plus size={11} /> Add vendor</button>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {vendors.map((v) => (
            <button key={v._id} onClick={() => openVendor(v)} title="View / edit vendor info" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-100 text-[11px] font-bold text-slate-600 hover:border-primary/40 hover:text-primary transition-colors">
              {v.name}{v.country ? <span className="text-slate-400 font-medium">· {v.country}</span> : null}
            </button>
          ))}
          {vendors.length === 0 && <span className="text-[11px] text-slate-400 italic">No vendors yet.</span>}
        </div>
        {showVendorForm && canEdit && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
            <input className={inp} placeholder="Name *" value={vDraft.name} onChange={(e) => setVDraft({ ...vDraft, name: e.target.value })} />
            <input className={inp} placeholder="Country" value={vDraft.country} onChange={(e) => setVDraft({ ...vDraft, country: e.target.value })} />
            <input className={inp} placeholder="City" value={vDraft.city} onChange={(e) => setVDraft({ ...vDraft, city: e.target.value })} />
            <input className={inp} placeholder="Contact / Attention" value={vDraft.contactName} onChange={(e) => setVDraft({ ...vDraft, contactName: e.target.value })} />
            <input className={inp} placeholder="Email" value={vDraft.email} onChange={(e) => setVDraft({ ...vDraft, email: e.target.value })} />
            <input className={inp} placeholder="Phone" value={vDraft.phone} onChange={(e) => setVDraft({ ...vDraft, phone: e.target.value })} />
            <button onClick={saveVendor} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold">Save vendor</button>
          </div>
        )}
      </div>

      {/* Create RFQ — Step 1: pick approved BOQ items + shipping */}
      {creating && canEdit && (() => {
        const pickList = approvedOnly ? items.filter((it) => approvalOf(it._id).state === "approved") : items;
        return (
        <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
            <p className="text-sm font-bold text-slate-800">New request — from approved submittals</p>
          </div>
          <p className="text-[11px] text-slate-500">Request quotes for products the client has already approved. The approved brand from each submittal is carried into the request.</p>
          <input className={inp} placeholder="RFQ title (optional)" value={rTitle} onChange={(e) => setRTitle(e.target.value)} />
          {/* Shipping — how they deliver and where (carried onto the PO automatically) */}
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${inp} font-bold max-w-[10rem]`} value={rDelivery} onChange={(e) => setRDelivery(e.target.value)}>
              <option value="Delivery">Delivery</option>
              <option value="Pickup">Pickup</option>
            </select>
            <AddressPicker value={rShipTo} projectSite={projectInfo?.siteAddress || projectInfo?.location} onChange={setRShipTo} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select items</p>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={approvedOnly} onChange={(e) => setApprovedOnly(e.target.checked)} /> Approved submittals only
            </label>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {pickList.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">{approvedOnly ? "No items with an approved submittal yet. Get client approval in the Submittals tab, or untick “Approved submittals only” to request anyway." : "No BOQ items. Add them in the BOQ tab first."}</p>
            ) : pickList.map((it) => {
              const ap = approvalOf(it._id);
              const apCls = ap.state === "approved" ? "bg-emerald-50 text-emerald-600" : ap.state === "pending" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-400";
              return (
              <label key={it._id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white cursor-pointer text-xs">
                <input type="checkbox" checked={!!picked[it._id]} onChange={(e) => setPicked((p) => ({ ...p, [it._id]: e.target.checked }))} />
                <span className="font-bold text-slate-700">{it.description || "(no description)"}</span>
                <span className="text-slate-400">· {[it.qty, it.unit].filter(Boolean).join(" ")} · {secNames[it.sectionId] || "—"}</span>
                <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap ${apCls}`}>{ap.label}{ap.state === "approved" && ap.brand ? ` · ${ap.brand}` : ""}</span>
              </label>
              );
            })}
          </div>
          {/* Send to vendors — for our tracking; auto-creates each vendor's price column in Step 2.
              (This list is NOT printed on the RFQ PDF.) */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Send to vendors <span className="font-medium normal-case text-slate-400">— for tracking; not shown on the PDF</span></p>
            {vendors.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">No vendors yet — add one in the Vendors panel above.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {vendors.map((v) => {
                  const on = !!rVendors[v._id];
                  return (
                    <button key={v._id} onClick={() => setRVendors((p) => ({ ...p, [v._id]: !p[v._id] }))} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors ${on ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:border-primary/40"}`}>
                      {on && <Check size={11} />}{v.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Cancel</button>
            <button onClick={create} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold">Create request ({Object.values(picked).filter(Boolean).length}){Object.values(rVendors).filter(Boolean).length ? ` → ${Object.values(rVendors).filter(Boolean).length} vendor(s)` : ""}</button>
          </div>
        </div>
        );
      })()}

      {/* Search */}
      {rfqs.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-grow">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by RFQ number, title, vendor or item…" className={`${inp} pl-9`} />
          </div>
          {search && <button onClick={() => setSearch("")} className="text-[11px] font-bold text-slate-500 hover:text-slate-900 px-2">Clear</button>}
          <span className="text-[10px] text-slate-400">{visibleRfqs.length} of {rfqs.length}</span>
        </div>
      )}

      {/* RFQ list */}
      {rfqs.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-6 text-center">No RFQs yet.</p>
      ) : visibleRfqs.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-6 text-center">No RFQs match your search.</p>
      ) : (
        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
          <table className="w-full min-w-[860px] text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="w-8 px-3 py-2" />
                <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]"><button onClick={() => toggleSort("rfqNo")} className="uppercase tracking-widest hover:text-slate-700">RFQ #{sortArrow("rfqNo")}</button></th>
                <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]"><button onClick={() => toggleSort("boq")} className="uppercase tracking-widest hover:text-slate-700">BOQ #{sortArrow("boq")}</button></th>
                <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]"><button onClick={() => toggleSort("desc")} className="uppercase tracking-widest hover:text-slate-700">Description{sortArrow("desc")}</button></th>
                <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]"><button onClick={() => toggleSort("items")} className="uppercase tracking-widest hover:text-slate-700">Items{sortArrow("items")}</button></th>
                <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]">Vendors</th>
                <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]"><button onClick={() => toggleSort("status")} className="uppercase tracking-widest hover:text-slate-700">Status{sortArrow("status")}</button></th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
            {sortedRfqs.map(renderRfqRow)}
            </tbody>
          </table>
        </div>
      )}
      {dialogs}
      {preview && <PdfPreviewModal title={preview.title} fileName={preview.fileName} build={preview.build} onClose={() => setPreview(null)} />}

      {/* CR-PR-04 — receiver picker (Companies Directory) */}
      {receiverFor && (() => {
        const rfq = rfqs.find((r) => r._id === receiverFor);
        if (!rfq) return null;
        const q = recvSearch.trim().toLowerCase();
        const list = companies.filter((c) => !q || `${c.name} ${c.category} ${c.email || ""}`.toLowerCase().includes(q));
        return (
          <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">Choose receivers{rfq.rfqNo ? ` — RFQ #${rfq.rfqNo}` : ""}</h3>
                <button onClick={() => setReceiverFor(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
              </div>
              <div className="p-4 space-y-3">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input value={recvSearch} onChange={(e) => setRecvSearch(e.target.value)} placeholder="Search vendors, subs, manufacturers…" className={`${inp} pl-9`} />
                </div>
                {companies.length === 0 && <p className="text-sm text-slate-400 italic">No companies in the Directory yet — add them under <strong>Directory</strong> in the left menu.</p>}
                <div className="max-h-80 overflow-y-auto space-y-1">
                  {list.map((c) => {
                    const on = (rfq.recipients || []).some((r) => r.companyId === c._id);
                    return (
                      <button key={c._id} onClick={() => toggleRecipient(rfq, c)} className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left ${on ? "border-primary bg-primary/5" : "border-slate-100 hover:bg-slate-50"}`}>
                        <div className="min-w-0"><p className="text-sm font-bold text-slate-800 truncate">{c.name}</p><p className="text-[10px] text-slate-400 uppercase tracking-wide">{COMPANY_CATEGORIES.find((x) => x.v === c.category)?.label || c.category}{c.email ? ` · ${c.email}` : ""}</p></div>
                        {on ? <CheckCircle2 size={16} className="text-primary shrink-0" /> : <span className="w-4 h-4 rounded-full border border-slate-200 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end px-5 py-3 border-t border-slate-100">
                <button onClick={() => setReceiverFor(null)} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-primary">Done</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add-item picker — append BOQ items to an existing RFQ */}
      {addItemsFor && (() => {
        const rfq = rfqs.find((r) => r._id === addItemsFor);
        if (!rfq) return null;
        const avail = items.filter((it) => !rfq.lineItems.some((l) => l.itemId === it._id));
        return (
          <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
                <p className="text-sm font-bold text-slate-900">Add items to RFQ {rfq.rfqNo}</p>
                <button onClick={() => setAddItemsFor(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-2">
                <div className="max-h-72 overflow-y-auto space-y-1">
                  {avail.length === 0 ? <p className="text-[12px] text-slate-400 italic py-4 text-center">All BOQ items are already on this RFQ.</p> : avail.map((it) => (
                    <label key={it._id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs">
                      <input type="checkbox" checked={!!addItemPicks[it._id]} onChange={(e) => setAddItemPicks((p) => ({ ...p, [it._id]: e.target.checked }))} />
                      <span className="font-bold text-slate-700">{it.description || "(no description)"}</span>
                      <span className="text-slate-400">· {[it.qty, it.unit].filter(Boolean).join(" ")} · {secNames[it.sectionId] || "—"}</span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setAddItemsFor(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold">Cancel</button>
                  <button onClick={() => confirmAddItems(rfq)} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold">Add {Object.values(addItemPicks).filter(Boolean).length || ""} item(s)</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Vendor info popup — view, edit, or delete a vendor */}
      {vendorEditId && (() => {
        const v = vendors.find((x) => x._id === vendorEditId);
        if (!v) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2 min-w-0"><Building2 size={16} className="text-primary shrink-0" /><p className="text-sm font-bold text-slate-900 truncate">{v.name || "Vendor"}</p></div>
                <button onClick={() => setVendorEditId(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-[11px] text-slate-400">{canEdit ? "Edit the vendor's details and save, or delete the vendor." : "Vendor details."}</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="col-span-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name
                    <input className={`${inp} mt-1`} value={vEdit.name} disabled={!canEdit} onChange={(e) => setVEdit({ ...vEdit, name: e.target.value })} /></label>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Country
                    <input className={`${inp} mt-1`} value={vEdit.country} disabled={!canEdit} onChange={(e) => setVEdit({ ...vEdit, country: e.target.value })} /></label>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">City
                    <input className={`${inp} mt-1`} value={vEdit.city} disabled={!canEdit} onChange={(e) => setVEdit({ ...vEdit, city: e.target.value })} /></label>
                  <label className="col-span-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contact / Attention
                    <input className={`${inp} mt-1`} value={vEdit.contactName} disabled={!canEdit} onChange={(e) => setVEdit({ ...vEdit, contactName: e.target.value })} /></label>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email
                    <input className={`${inp} mt-1`} value={vEdit.email} disabled={!canEdit} onChange={(e) => setVEdit({ ...vEdit, email: e.target.value })} /></label>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phone
                    <input className={`${inp} mt-1`} value={vEdit.phone} disabled={!canEdit} onChange={(e) => setVEdit({ ...vEdit, phone: e.target.value })} /></label>
                </div>
                {canEdit && (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button onClick={() => removeVendor(v._id)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-[11px] font-bold hover:bg-red-100"><Trash2 size={13} /> Delete vendor</button>
                    <button onClick={saveVendorEdit} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold">Save changes</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* §A1 — Actions modal: add quotes, prices, award, shipping, versions */}
      {manageId && (() => {
        const m = rfqs.find((r) => r._id === manageId);
        if (!m) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">RFQ {m.rfqNo}{rfqRef(m) ? ` · BOQ #${rfqRef(m)}` : ""} · {rfqDesc(m)}</p>
                  <p className="text-[10px] text-slate-400">Manage RFQ — edits save automatically</p>
                </div>
                <button onClick={() => setManageId(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
              </div>
              {renderRfqDetail(m)}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
