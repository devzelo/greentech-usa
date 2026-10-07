import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, BookOpen, BookmarkPlus, Building2, Check, Copy, Eye, FileText, Loader2, MoreHorizontal, Plus, Search, Send, Trash2, Upload, X } from "lucide-react";
import {
  withFileToken, RFQ_REQUESTS, fetchLibraryItems, saveLibraryItems, deleteLibraryItem, markLibraryItemsUsed,
  type ApiLibraryItem, type ApiCompany, type ApiProcurementItem, type ApiRfq, type RfqFormFields, type RfqLineFile, type RfqLineItem, type RfqRequestKey,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import { AddressPicker } from "./AddressPicker";
import MoneyInput from "./MoneyInput";
import CompanyEditorModal from "./CompanyEditorModal";
import ToolMenu, { MENU_ITEM } from "./timeline/ToolMenu";
import { usePackageBar, type SetPackageBar } from "../../lib/packageBar";
import { downloadBlob } from "../../lib/proposalExport";

/**
 * CR 335 - the Create RFQ window. The client's example (an RFQ for PVC pipes) sets what an RFQ holds
 * when it is made: the RFQ information (number, date, response due date, project, work package,
 * currency, title, notes to vendors), the vendors it goes to (from the Directory), the items
 * requested (with specifications, target prices and a note to the vendor on each), supporting
 * documents, and what every vendor is asked to include. "Not the layout, the features": the layout
 * is ours. The same window edits an RFQ that already exists.
 */

export type RfqFormResult = {
  fields: RfqFormFields;
  vendors: ApiCompany[];
  newFiles: File[];
  removeAttachmentIds: string[];
  send: boolean;
  /** CR 338 - email each vendor its own copy when sent. */
  email: boolean;
  /** 2026-10-07 - Save as Draft in a work package: saved, and the form stays open on it. */
  stay?: boolean;
};

type Row = RfqLineItem & { key: string };
const n = (s: string | undefined) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const today = () => new Date().toISOString().slice(0, 10);
const inTwoWeeks = () => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); };
const newLineId = () => Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, "0")).join("");
const rowKey = () => Math.random().toString(36).slice(2);
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "AED", "SAR", "QAR", "KWD", "TRY", "PKR", "BDT", "INR", "SLE", "NGN", "KES", "ZAR", "CNY", "JPY"];
/** CR 338 - the company has an address its RFQ copy can be emailed to. */
const hasEmail = (c: ApiCompany) => [c.email, ...(c.contactPersons || []).map((p) => p.email)].some((e) => /\S+@\S+\.\S+/.test(String(e || "")));
/** A company's place, short: the last two parts of its address ("Ankara, Türkiye"). */
const placeOf = (c: ApiCompany) => (c.address || "").split(",").map((x) => x.trim()).filter(Boolean).slice(-2).join(", ");

const inp = "w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-slate-50 disabled:text-slate-500";
const lbl = "block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1";
const card = "rounded-2xl border border-slate-200 bg-white";
const cardHead = "flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/70 rounded-t-2xl";

export default function RfqForm({ projectId, projectName, projectSite, rfq, companies, onCompanyAdded, boqItems, approvalOf, secNames, onClose, onSave, buildPreview, ownerPackage, seed, inline = false, onBar, shareFile }: {
  /** 2026-10-07 - in a work package the actions sit on the package's bar, not in this header. */
  onBar?: SetPackageBar;
  /** Files the RFQ PDF where the project keeps it and returns its link (for Share). */
  shareFile?: (blob: Blob, fileName: string) => Promise<string>;
  projectId: string;
  projectName: string;
  projectSite?: string;
  /** null for a new RFQ. */
  rfq: ApiRfq | null;
  companies: ApiCompany[];
  onCompanyAdded: (c: ApiCompany) => void;
  boqItems: ApiProcurementItem[];
  approvalOf: (itemId: string) => { state: "approved" | "pending" | "none"; label: string; brand: string };
  secNames: Record<string, string>;
  onClose: () => void;
  /** Saves (and sends, when asked); true when it worked. */
  onSave: (r: RfqFormResult) => Promise<boolean>;
  /** The RFQ PDF for what the form holds now. */
  buildPreview: (draft: ApiRfq) => Promise<Blob>;
  /** CR 345 - made inside a work package: the package is fixed (it owns the RFQ). */
  ownerPackage?: { id: string; name: string };
  /** CR 381 - shown in place (the work package's RFQ tab), not as a window over the page. */
  inline?: boolean;
  /** CR 345 - a new RFQ's starting point (the package's name, scope and company). */
  seed?: { title?: string; notes?: string; lineItems?: RfqLineItem[]; vendorIds?: string[] };
}) {
  const { confirm, prompt, dialogs } = useDialogs();
  const editing = !!rfq;
  const [title, setTitle] = useState(rfq?.title || seed?.title || "");
  const [date, setDate] = useState(rfq?.date || (rfq?.createdAt ? rfq.createdAt.slice(0, 10) : today()));
  const [dueDate, setDueDate] = useState(rfq?.dueDate || (rfq ? "" : inTwoWeeks()));
  const [currency, setCurrency] = useState(rfq?.currency || "USD");
  const [notes, setNotes] = useState(rfq?.notes || seed?.notes || "");
  const [deliveryMethod, setDeliveryMethod] = useState(rfq?.deliveryMethod || "Delivery");
  const [shipTo, setShipTo] = useState(rfq?.shipToLocation || "");
  const [requests, setRequests] = useState<RfqRequestKey[]>(rfq?.requests || (rfq ? [] : ["leadTime", "dataSheets", "alternatives"]));
  const [showTargets, setShowTargets] = useState(!!rfq?.showTargetPrices);
  const [rows, setRows] = useState<Row[]>(() => (rfq?.lineItems || seed?.lineItems || []).map((l) => ({ ...l, key: rowKey() })));
  const [vendorIds, setVendorIds] = useState<string[]>(() => (rfq ? (rfq.recipients || []).map((r) => r.companyId) : seed?.vendorIds || []).filter(Boolean));
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "draft" | "send" | "preview">("");
  const [emailVendors, setEmailVendors] = useState(true);
  const [tried, setTried] = useState(false);


  // ── Vendors ──
  const [vSearch, setVSearch] = useState("");
  const [addingCompany, setAddingCompany] = useState(false);
  const chosen = vendorIds.map((id) => companies.find((c) => c._id === id)).filter((c): c is ApiCompany => !!c);
  const matches = useMemo(() => {
    const q = vSearch.trim().toLowerCase();
    if (!q) return [];
    return companies.filter((c) => !c.archived && !vendorIds.includes(c._id) && `${c.name} ${c.category} ${(c.categories || []).join(" ")} ${c.address || ""}`.toLowerCase().includes(q)).slice(0, 8);
  }, [vSearch, companies, vendorIds]);
  const addVendor = (c: ApiCompany) => { setVendorIds((v) => (v.includes(c._id) ? v : [...v, c._id])); setVSearch(""); };

  // ── Items ──
  const setRow = (key: string, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addBlank = () => setRows((list) => [...list, { key: rowKey(), itemId: newLineId(), description: "", spec: "", qty: "", unit: "", targetUnitPrice: "", vendorNote: "" }]);
  const move = (i: number, d: number) => setRows((list) => { const j = i + d; if (j < 0 || j >= list.length) return list; const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; return next; });
  const duplicate = (i: number) => setRows((list) => { const r = list[i]; const copy: Row = { ...r, key: rowKey(), _id: undefined, itemId: newLineId(), attachments: [] }; return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)]; });
  const targetTotal = rows.reduce((a, r) => a + n(r.qty) * n(r.targetUnitPrice), 0);
  const fmt = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 });

  // Import from the BOQ (the client-approved products first, as in Procurement).
  const [boqOpen, setBoqOpen] = useState(false);
  const [approvedOnly, setApprovedOnly] = useState(true);
  const [boqPicks, setBoqPicks] = useState<Record<string, boolean>>({});
  const boqList = boqItems.filter((it) => (!approvedOnly || approvalOf(it._id).state === "approved") && !rows.some((r) => r.itemId === it._id));
  const importBoq = () => {
    const picked = boqItems.filter((it) => boqPicks[it._id]);
    setRows((list) => [...list.filter((r) => r.description.trim() || n(r.qty)), ...picked.map((it) => ({ key: rowKey(), itemId: it._id, description: it.description, spec: it.spec || "", qty: it.qty || "", unit: it.unit || "", targetUnitPrice: "", vendorNote: "" }))]);
    setBoqPicks({}); setBoqOpen(false);
  };

  // ── The item library (CR 337): items requested before, for any project ──
  const [libOpen, setLibOpen] = useState(false);
  const [libQ, setLibQ] = useState("");
  const [libCat, setLibCat] = useState("");
  const [libItems, setLibItems] = useState<ApiLibraryItem[] | null>(null);
  const [libError, setLibError] = useState("");
  const [libPicks, setLibPicks] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!libOpen) return;
    const t = setTimeout(() => {
      fetchLibraryItems(libQ.trim()).then((l) => { setLibItems(l); setLibError(""); }).catch((e) => { setLibItems([]); setLibError(e instanceof Error ? e.message : "The library could not be loaded."); });
    }, 200);
    return () => clearTimeout(t);
  }, [libOpen, libQ]);
  const libCats = [...new Set((libItems || []).map((i) => i.category).filter(Boolean))].sort();
  const libShown = (libItems || []).filter((i) => !libCat || i.category === libCat);
  const addFromLibrary = () => {
    const picked = (libItems || []).filter((i) => libPicks[i._id]);
    setRows((list) => [...list.filter((r) => r.description.trim() || n(r.qty)), ...picked.map((i) => ({ key: rowKey(), itemId: newLineId(), description: i.description, spec: i.spec, qty: "", unit: i.unit, targetUnitPrice: "", vendorNote: i.vendorNote }))]);
    void markLibraryItemsUsed(picked.map((i) => i._id)).catch(() => undefined);
    setLibPicks({}); setLibOpen(false);
    if (picked.length) toast(`${picked.length} item${picked.length === 1 ? "" : "s"} added. Enter the quantities.`, "success");
  };
  const removeFromLibrary = async (i: ApiLibraryItem) => {
    if (!(await confirm({ title: `Remove "${i.description}" from the library?`, message: "It is no longer offered for new RFQs. RFQs that already have it keep it.", confirmLabel: "Remove", danger: true }))) return;
    try { await deleteLibraryItem(i._id); setLibItems((l) => (l || []).filter((x) => x._id !== i._id)); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not remove it.", "error"); }
  };
  const saveToLibrary = async (r: Row) => {
    if (!r.description.trim()) { toast("Describe the item first.", "error"); return; }
    const category = await prompt({ title: "Save to the item library", label: "Category (optional)", placeholder: "e.g. Piping, Electrical, Services", confirmLabel: "Save" });
    if (category === null) return;
    try { await saveLibraryItems([{ description: r.description.trim(), spec: r.spec || "", unit: r.unit || "", category: category.trim(), vendorNote: r.vendorNote || "" }]); toast(`"${r.description.trim()}" is in the library for every project.`, "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not save it to the library.", "error"); }
  };

  // ── Supporting documents ──
  const fileInput = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);
  const keptAttachments = (rfq?.attachments || []).filter((a) => a._id && !removed.includes(a._id));
  const addFiles = (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) => { if (f.size > 64 * 1024 * 1024) { toast(`${f.name} is over 64 MB.`, "error"); return false; } return true; });
    setNewFiles((p) => [...p, ...files]);
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDropping(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); };

  // ── Saving ──
  const fields = (): RfqFormFields => ({
    title: title.trim(), notes, shipToLocation: shipTo, deliveryMethod, date, dueDate, currency, requests, showTargetPrices: showTargets,
    lineItems: rows.filter((r) => r.description.trim() || n(r.qty)).map(({ key: _k, ...r }) => { void _k; return r; }),
  });
  const problems = (send: boolean): string[] => {
    const f = fields();
    const out: string[] = [];
    if (!f.title) out.push("Give the RFQ a title.");
    if (!f.date) out.push("Set the RFQ date.");
    if (!f.dueDate) out.push("Set the response due date.");
    else if (f.date && f.dueDate < f.date) out.push("The response due date is before the RFQ date.");
    if (!f.lineItems.length) out.push("Add at least one item.");
    if (f.lineItems.some((l) => !l.description.trim())) out.push("Every item needs a description.");
    if (f.lineItems.some((l) => n(l.qty) <= 0)) out.push("Every item needs a quantity.");
    if (send && !chosen.length) out.push("Choose at least one vendor to send it to.");
    return out;
  };
  const submit = async (send: boolean, stay = false) => {
    setTried(true);
    const p = problems(send);
    if (p.length) { toast(p[0], "error"); return; }
    const mailable = chosen.filter(hasEmail).length;
    if (send && !(await confirm({
      title: `Send this RFQ to ${chosen.length} vendor${chosen.length === 1 ? "" : "s"}?`,
      message: emailVendors
        ? `It is marked as sent today, and each vendor is emailed its own copy (PDF)${mailable < chosen.length ? `. ${chosen.length - mailable} ha${chosen.length - mailable === 1 ? "s" : "ve"} no email in the Directory: download their copies from the RFQ instead` : ""}. Each vendor gets a price column for their quote.`
        : "It is marked as sent today. Each vendor gets a price column for their quote. Download each vendor's copy from the RFQ to send it.",
      confirmLabel: emailVendors && mailable ? "Send and email" : "Send RFQ",
    }))) return;
    setBusy(send ? "send" : "draft");
    try {
      const ok = await onSave({ fields: fields(), vendors: chosen, newFiles, removeAttachmentIds: removed, send, email: send && emailVendors, stay });
      if (ok && !stay) onClose();
    } finally { setBusy(""); }
  };
  const draftRfq = (): ApiRfq => ({
    ...(rfq || { _id: "", projectId, rfqNo: "(new)", includesShipping: true, includesTax: true, addedByName: "", quotes: [] }),
    // Files not uploaded yet are named in the preview's list (their pages are added once saved).
    ...fields(), shipToLocation: shipTo, attachments: [...keptAttachments, ...newFiles.map((f) => ({ name: f.name, filePath: "", fileType: "pending", size: "" }))],
  } as ApiRfq);
  const [preview, setPreview] = useState<string | null>(null);
  const openPreview = async () => {
    setBusy("preview");
    try { const blob = await buildPreview(draftRfq()); setPreview(URL.createObjectURL(blob)); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not build the preview.", "error"); }
    finally { setBusy(""); }
  };
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const initial = useRef(JSON.stringify({ f: fields(), v: vendorIds }));
  const close = async () => {
    const changed = JSON.stringify({ f: fields(), v: vendorIds }) !== initial.current || newFiles.length > 0 || removed.length > 0;
    if (changed && !(await confirm({ title: "Close without saving?", message: "The changes in this RFQ are lost. Save it as a draft to keep them.", confirmLabel: "Close", danger: true }))) return;
    onClose();
  };
  const err = (bad: boolean) => (tried && bad ? "!border-red-300 bg-red-50/40" : "");

  // 2026-10-07 - in a work package: Cancel, Save as Draft (saved, the form stays open), Save (saved
  // and closed), Preview, Download and Share, on the package's bar.
  const pdfName = `RFQ_${rfq?.rfqNo || "draft"}.pdf`;
  const draftPdf = async () => {
    setBusy("preview");
    try { return await buildPreview(draftRfq()); } finally { setBusy(""); }
  };
  const isDraft = !editing || rfq!.status === "Draft" || !rfq!.status;
  usePackageBar(onBar, onBar ? {
    cancel: () => void close(),
    saveDraft: isDraft ? () => void submit(false, true) : undefined,
    save: () => void submit(false),
    preview: () => void openPreview(),
    download: () => void draftPdf().then((b) => downloadBlob(b, pdfName)).catch((e) => toast(e instanceof Error ? e.message : "Could not make the PDF.", "error")),
    share: shareFile ? { fileName: pdfName, prepare: async () => shareFile(await draftPdf(), pdfName) } : undefined,
    busy: !!busy,
    note: editing ? `RFQ ${rfq!.rfqNo}` : "New RFQ",
  } : undefined);

  return (
    <div className={inline ? "" : "fixed inset-0 z-[85] flex items-start justify-center bg-slate-900/50 p-2 sm:p-4 overflow-y-auto"}>
      <div className={`bg-slate-50 rounded-3xl w-full ${inline ? "border border-slate-200" : "shadow-2xl max-w-6xl my-4"}`} onClick={(e) => e.stopPropagation()}>
        {/* Header: what this is, and the three ways out. */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-200 bg-white rounded-t-3xl sticky top-0 z-20">
          <div className="min-w-0">
            <h3 className="text-lg font-display font-bold text-slate-900">{editing ? `RFQ ${rfq!.rfqNo}` : "Create RFQ"}</h3>
            <p className="text-[11px] text-slate-400">{ownerPackage ? `Work package › ${ownerPackage.name} › RFQ` : `Procurement › RFQs › ${editing ? "Edit" : "Create"} · ${projectName}`}</p>
          </div>
          {!onBar && <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void close()} className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
            <button onClick={() => void submit(false)} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:border-slate-300 disabled:opacity-50">{busy === "draft" && <Loader2 size={13} className="animate-spin" />} {ownerPackage ? "Save RFQ" : editing ? "Save" : "Save as draft"}</button>
            <button onClick={() => void openPreview()} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-primary/30 bg-white text-xs font-bold text-primary hover:bg-primary/5 disabled:opacity-50">{busy === "preview" ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Preview RFQ</button>
            {/* CR 381 - a work package's RFQ is saved, then each vendor's copy is downloaded or emailed one by one. */}
            {!ownerPackage && (!editing || rfq!.status === "Draft" || !rfq!.status) && (
              <button onClick={() => void submit(true)} disabled={!!busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{busy === "send" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send RFQ</button>
            )}
          </div>}
        </div>

        <div className="p-3 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* RFQ information */}
            <section className={`${card} lg:col-span-3`}>
              <div className={cardHead}><h4 className="text-sm font-bold text-slate-800">RFQ information</h4></div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block"><span className={lbl}>RFQ no.</span><input value={rfq?.rfqNo || "Given on save"} disabled className={inp} /></label>
                <label className="block"><span className={lbl}>Date *</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inp} ${err(!date)}`} /></label>
                <label className="block"><span className={lbl}>Response due date *</span><input type="date" value={dueDate} min={date || undefined} onChange={(e) => setDueDate(e.target.value)} className={`${inp} ${err(!dueDate || dueDate < date)}`} /></label>
                <label className="block"><span className={lbl}>Project</span><input value={projectName} disabled className={inp} /></label>
                {/* CR 346 - work packages and Procurement are kept apart: only an RFQ made inside a
                    package names it (fixed); Procurement's RFQs never link to one. */}
                {ownerPackage && (
                  <label className="block">
                    <span className={lbl}>Work package</span>
                    <input value={ownerPackage.name} disabled className={inp} title="This RFQ belongs to the work package it is made in" />
                  </label>
                )}
                <label className="block"><span className={lbl}>Currency *</span>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inp}>{[...new Set([currency, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}</select>
                </label>
                <label className="block sm:col-span-3"><span className={lbl}>Title *</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. PVC Pipes and Fittings, Sierra Leone WWTP" className={`${inp} ${err(!title.trim())}`} autoFocus={!editing} /></label>
                <label className="block sm:col-span-3"><span className={lbl}>Description / notes to vendors</span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inp} resize-y`} placeholder="e.g. We are requesting your best price and lead time for the items below. Please provide brand, model, technical data sheets, availability and the estimated delivery time to Freetown port." />
                </label>
                <div className="sm:col-span-3">
                  <span className={lbl}>Delivery</span>
                  <div className="flex flex-wrap items-start gap-2">
                    <select value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} className={`${inp} max-w-[9rem] font-bold`}><option value="Delivery">Delivery</option><option value="Pickup">Pickup</option></select>
                    <div className="flex-1 min-w-[14rem]"><AddressPicker value={shipTo} projectSite={projectSite} onChange={setShipTo} /></div>
                  </div>
                </div>
              </div>
            </section>

            {/* Vendor selection */}
            <section className={`${card} lg:col-span-2 flex flex-col`}>
              <div className={cardHead}>
                <h4 className="text-sm font-bold text-slate-800">Vendor selection</h4>
                <button onClick={() => setAddingCompany(true)} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"><Plus size={12} /> New company</button>
              </div>
              <div className="p-4 flex-1 flex flex-col gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input value={vSearch} onChange={(e) => setVSearch(e.target.value)} placeholder="Search the Directory by name, category or location" className={`${inp} pl-9`} />
                  {matches.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                      {matches.map((c) => (
                        <button key={c._id} onClick={() => addVendor(c)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50">
                          <Logo c={c} small />
                          <span className="min-w-0"><span className="block text-xs font-bold text-slate-800 truncate">{c.name}</span><span className="block text-[10px] text-slate-400 truncate">{[c.category, placeOf(c)].filter(Boolean).join(" · ")}</span></span>
                          <Plus size={13} className="ml-auto text-primary shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                  {vSearch.trim() && matches.length === 0 && <p className="mt-1 text-[11px] text-slate-400">No company matches. <button onClick={() => setAddingCompany(true)} className="font-bold text-primary hover:underline">Add it to the Directory</button></p>}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Selected vendors ({chosen.length})</span>
                  {chosen.length > 0 && <button onClick={() => setVendorIds([])} className="text-[11px] font-bold text-slate-400 hover:text-red-500">Clear all</button>}
                </div>
                <div className={`flex-1 divide-y divide-slate-100 rounded-xl border ${tried && !chosen.length ? "border-amber-200 bg-amber-50/30" : "border-slate-100"}`}>
                  {chosen.length === 0 && <p className="px-3 py-6 text-center text-[11px] text-slate-400">Search the Directory above to add the vendors this RFQ goes to.</p>}
                  {chosen.map((c) => (
                    <div key={c._id} className="flex items-center gap-3 px-3 py-2">
                      <Check size={14} className="text-blue-600 shrink-0" />
                      <Logo c={c} />
                      <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-800 truncate">{c.name}</span><span className="block text-[10px] text-slate-400 truncate">{placeOf(c) || c.category}{!hasEmail(c) && <span className="text-amber-600"> · no email</span>}</span></span>
                      <button onClick={() => setVendorIds((v) => v.filter((x) => x !== c._id))} className="p-1 rounded text-slate-300 hover:text-red-500" aria-label={`Remove ${c.name}`}><X size={14} /></button>
                    </div>
                  ))}
                </div>
                {ownerPackage ? (
                  <p className="text-[10px] text-slate-400">Each vendor gets a price column for its quote. Once saved, download or email each vendor its own copy from the RFQ, one by one.</p>
                ) : (
                  <>
                    <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={emailVendors} onChange={(e) => setEmailVendors(e.target.checked)} className="accent-blue-600" />
                      Email each vendor its own copy when sent
                    </label>
                    <p className="text-[10px] text-slate-400 -mt-1.5">Each vendor gets a price column to compare quotes, and a copy of the RFQ with their details. Replies come to you.</p>
                  </>
                )}
              </div>
            </section>
          </div>

          {/* Items requested */}
          <section className={card}>
            <div className={`${cardHead} flex-wrap`}>
              <h4 className="text-sm font-bold text-slate-800">Items requested</h4>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mr-1" title="Off: target prices are only for GreenTech. On: they are printed on the vendors' copies.">
                  <input type="checkbox" checked={showTargets} onChange={(e) => setShowTargets(e.target.checked)} className="accent-blue-600" /> Show target prices to vendors
                </label>
{!ownerPackage && <button onClick={() => { setBoqPicks({}); setBoqOpen(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700 hover:border-primary hover:text-primary"><Upload size={12} /> Import from BOQ</button>}
                <button onClick={() => { setLibPicks({}); setLibOpen(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700 hover:border-primary hover:text-primary"><BookOpen size={12} /> Add from Library</button>
                <button onClick={addBlank} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700 hover:border-primary hover:text-primary"><Plus size={12} /> Add item</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="text-left px-2 py-2 w-8">#</th>
                    <th className="text-left px-2 py-2 w-48">Item description *</th>
                    <th className="text-left px-2 py-2">Specifications</th>
                    <th className="text-left px-2 py-2 w-20">Unit</th>
                    <th className="text-left px-2 py-2 w-20">Qty *</th>
                    <th className="text-left px-2 py-2 w-28">Target unit price <span className="normal-case tracking-normal font-medium text-slate-400">(opt.)</span></th>
                    <th className="text-right px-2 py-2 w-28">Target total</th>
                    <th className="text-left px-2 py-2 w-52">Notes to vendor</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 && <tr><td colSpan={9} className={`px-3 py-6 text-center text-[11px] ${tried ? "text-red-500" : "text-slate-400"}`}>{ownerPackage ? "No items yet. Add them from the library, or one by one." : "No items yet. Import them from the BOQ, add them from the library, or add them one by one."}</td></tr>}
                  {rows.map((r, i) => {
                    const fromBoq = boqItems.some((it) => it._id === r.itemId);
                    return (
                      <tr key={r.key} className="align-top">
                        <td className="px-2 py-2 text-slate-400 font-bold">{i + 1}</td>
                        <td className="px-1 py-1"><input value={r.description} onChange={(e) => setRow(r.key, { description: e.target.value })} placeholder="e.g. PVC Pipe" className={`${inp} ${err(!r.description.trim())}`} />{fromBoq && <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wide text-slate-400">From the BOQ</span>}</td>
                        <td className="px-1 py-1"><textarea value={r.spec} onChange={(e) => setRow(r.key, { spec: e.target.value })} rows={2} placeholder="e.g. Ø110 mm, PN16, uPVC, 6 m length (BS EN 1452)" className={`${inp} resize-y`} /></td>
                        <td className="px-1 py-1"><input value={r.unit} onChange={(e) => setRow(r.key, { unit: e.target.value })} placeholder="m / ea" className={inp} /></td>
                        <td className="px-1 py-1"><input value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value })} inputMode="decimal" placeholder="0" className={`${inp} text-right ${err(n(r.qty) <= 0)}`} /></td>
                        <td className="px-1 py-1"><MoneyInput value={r.targetUnitPrice || ""} currency={currency || "USD"} onChange={(v) => setRow(r.key, { targetUnitPrice: v })} placeholder="-" aria-label="Target unit price" className={`${inp} text-right`} /></td>
                        <td className="px-2 py-2 text-right font-bold text-slate-700 whitespace-nowrap">{n(r.targetUnitPrice) ? fmt(n(r.qty) * n(r.targetUnitPrice)) : <span className="text-slate-300">-</span>}</td>
                        <td className="px-1 py-1"><textarea value={r.vendorNote || ""} onChange={(e) => setRow(r.key, { vendorNote: e.target.value })} rows={2} placeholder="e.g. Provide brand and data sheet." className={`${inp} resize-y`} /></td>
                        <td className="px-1 py-1">
                          <ToolMenu label={`Actions for item ${i + 1}`} icon={<MoreHorizontal size={14} />} tone="ghost">
                            <button type="button" onClick={() => duplicate(i)} className={MENU_ITEM}><Copy size={13} /> Duplicate</button>
                            <button type="button" onClick={() => void saveToLibrary(r)} className={MENU_ITEM}><BookmarkPlus size={13} /> Save to library</button>
                            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={MENU_ITEM}><ArrowUp size={13} /> Move up</button>
                            <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className={MENU_ITEM}><ArrowDown size={13} /> Move down</button>
                            <button type="button" onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))} className={`${MENU_ITEM} !text-red-600`}><Trash2 size={13} /> Remove</button>
                          </ToolMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50">
                      <td colSpan={6} className="px-2 py-2"><button onClick={addBlank} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"><Plus size={12} /> Add item</button></td>
                      <td className="px-2 py-2 text-right text-xs font-bold text-slate-800 whitespace-nowrap">{targetTotal ? fmt(targetTotal) : ""}</td>
                      <td colSpan={2} className="px-2 py-2 text-[10px] text-slate-400">{targetTotal ? (showTargets ? "Printed for the vendors." : "For GreenTech only, not printed.") : ""}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Supporting documents */}
            <section className={`${card} lg:col-span-3`}>
              <div className={cardHead}><h4 className="text-sm font-bold text-slate-800">Supporting documents <span className="font-medium text-slate-400">(optional)</span></h4></div>
              <div className="p-4 flex flex-wrap gap-2">
                <div
                  onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
                  onDragLeave={() => setDropping(false)}
                  onDrop={onDrop}
                  onClick={() => fileInput.current?.click()}
                  className={`flex-1 min-w-[14rem] flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${dropping ? "border-primary bg-primary/5" : "border-blue-200 bg-blue-50/30 hover:border-primary"}`}
                >
                  <Upload size={20} className="text-blue-500 shrink-0" />
                  <span className="text-[11px] text-slate-600"><b>Drag and drop files here</b> or <span className="font-bold text-blue-600">click to upload</span><span className="block text-[10px] text-slate-400">BOQ, drawings, specs: PDF, Excel, images (64 MB each)</span></span>
                  <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
                </div>
                {keptAttachments.map((a: RfqLineFile) => (
                  <FileChip key={a._id} name={a.name} size={a.size} onRemove={() => setRemoved((p) => [...p, a._id!])} />
                ))}
                {newFiles.map((f, i) => (
                  <FileChip key={`${f.name}-${i}`} name={f.name} size={f.size < 1024 * 1024 ? `${Math.round(f.size / 1024)} KB` : `${(f.size / 1024 / 1024).toFixed(1)} MB`} pending onRemove={() => setNewFiles((p) => p.filter((_, j) => j !== i))} />
                ))}
              </div>
              <p className="px-4 pb-3 -mt-1 text-[10px] text-slate-400">PDFs and pictures are added to the back of the RFQ document; every vendor gets them.</p>
            </section>

            {/* What vendors are asked to include */}
            <section className={`${card} lg:col-span-2`}>
              <div className={cardHead}><h4 className="text-sm font-bold text-slate-800">Additional information for vendors</h4></div>
              <div className="p-4 space-y-2">
                <p className="text-[10px] text-slate-400 -mt-1 mb-1">Ask each vendor to include:</p>
                {RFQ_REQUESTS.map((q) => (
                  <label key={q.key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={requests.includes(q.key)} onChange={(e) => setRequests((p) => (e.target.checked ? [...p, q.key] : p.filter((x) => x !== q.key)))} className="accent-blue-600 w-4 h-4" />
                    {q.label}
                  </label>
                ))}
                {requests.includes("other") && !notes.trim() && <p className="text-[10px] text-amber-600">Say what else in the notes to vendors above.</p>}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Import from the BOQ */}
      {boqOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setBoqOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-900">Import items from the BOQ</h4>
              <button onClick={() => setBoqOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-2 cursor-pointer"><input type="checkbox" checked={approvedOnly} onChange={(e) => setApprovedOnly(e.target.checked)} /> Approved submittals only</label>
            <div className="max-h-80 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-1.5">
              {boqList.length === 0 && <p className="text-[11px] text-slate-400 italic p-3">{approvedOnly ? "No items with an approved submittal left to add. Untick \"Approved submittals only\" to request anyway." : "No BOQ items left to add."}</p>}
              {boqList.map((it) => {
                const ap = approvalOf(it._id);
                const apCls = ap.state === "approved" ? "bg-emerald-50 text-emerald-600" : ap.state === "pending" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-400";
                return (
                  <label key={it._id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs">
                    <input type="checkbox" checked={!!boqPicks[it._id]} onChange={(e) => setBoqPicks((p) => ({ ...p, [it._id]: e.target.checked }))} />
                    <span className="font-bold text-slate-700">{it.description || "(no description)"}</span>
                    <span className="text-slate-400">· {[it.qty, it.unit].filter(Boolean).join(" ")} · {secNames[it.sectionId] || "-"}</span>
                    <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap ${apCls}`}>{ap.label}{ap.state === "approved" && ap.brand ? ` · ${ap.brand}` : ""}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setBoqOpen(false)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
              <button onClick={importBoq} disabled={!Object.values(boqPicks).some(Boolean)} className="px-3.5 py-1.5 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-50">Add {Object.values(boqPicks).filter(Boolean).length || ""} item{Object.values(boqPicks).filter(Boolean).length === 1 ? "" : "s"}</button>
            </div>
          </div>
        </div>
      )}

      {/* The item library */}
      {libOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setLibOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-5 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5"><BookOpen size={15} /> Item library</h4>
              <button onClick={() => setLibOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">Items GreenTech has requested before, for every project. Add an item to it from any RFQ row: ⋯ then Save to library.</p>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <input value={libQ} onChange={(e) => setLibQ(e.target.value)} placeholder="Search by description, specification or category" className={`${inp} pl-9`} autoFocus />
            </div>
            {libCats.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {["", ...libCats].map((c) => (
                  <button key={c || "all"} onClick={() => setLibCat(c)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${libCat === c ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-primary"}`}>{c || "All"}</button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
              {libItems === null && <p className="p-4 text-[11px] text-slate-400 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading</p>}
              {libError && <p className="p-4 text-[11px] text-red-500">{libError}</p>}
              {libItems !== null && !libError && libShown.length === 0 && <p className="p-4 text-[11px] text-slate-400">{libQ || libCat ? "Nothing matches." : "The library is empty. Save items to it from any RFQ row (⋯ then Save to library)."}</p>}
              {libShown.map((i) => (
                <label key={i._id} className="flex items-start gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={!!libPicks[i._id]} onChange={(e) => setLibPicks((p) => ({ ...p, [i._id]: e.target.checked }))} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-800">{i.description}{i.unit && <span className="font-medium text-slate-400"> · {i.unit}</span>}</span>
                    {i.spec && <span className="block text-[11px] text-slate-500 line-clamp-2">{i.spec}</span>}
                    {i.vendorNote && <span className="block text-[10px] text-slate-400 line-clamp-1">Note: {i.vendorNote}</span>}
                  </span>
                  {i.category && <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-slate-100 text-[9px] font-bold text-slate-500">{i.category}</span>}
                  <button type="button" onClick={(e) => { e.preventDefault(); void removeFromLibrary(i); }} className="shrink-0 p-1 rounded text-slate-300 hover:text-red-500" aria-label={`Remove ${i.description} from the library`}><Trash2 size={12} /></button>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setLibOpen(false)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
              <button onClick={addFromLibrary} disabled={!Object.values(libPicks).some(Boolean)} className="px-3.5 py-1.5 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-50">Add {Object.values(libPicks).filter(Boolean).length || ""} item{Object.values(libPicks).filter(Boolean).length === 1 ? "" : "s"}</button>
            </div>
          </div>
        </div>
      )}

      {/* The PDF as it stands. */}
      {preview && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-800 inline-flex items-center gap-1.5"><FileText size={14} /> Preview: {title || "RFQ"}</span>
              <button onClick={() => setPreview(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>
            <iframe title="RFQ preview" src={preview} className="flex-1 w-full rounded-b-2xl" />
          </div>
        </div>
      )}

      {addingCompany && (
        <CompanyEditorModal
          initial={{ category: "vendor", ...(vSearch.trim() ? { name: vSearch.trim() } : {}) }}
          onSaved={(c) => { onCompanyAdded(c); setVendorIds((v) => (v.includes(c._id) ? v : [...v, c._id])); setAddingCompany(false); setVSearch(""); }}
          onClose={() => setAddingCompany(false)}
        />
      )}
      {dialogs}
    </div>
  );
}

function Logo({ c, small }: { c: ApiCompany; small?: boolean }) {
  const size = small ? "w-7 h-7" : "w-10 h-10";
  return c.logoUrl
    ? <img src={withFileToken(c.logoUrl)} alt="" className={`${size} shrink-0 rounded-lg border border-slate-100 bg-white object-contain`} />
    : <span className={`${size} shrink-0 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-bold`}>{c.name.charAt(0).toUpperCase() || <Building2 size={12} />}</span>;
}

function FileChip({ name, size, pending, onRemove }: { key?: string; name: string; size: string; pending?: boolean; onRemove: () => void }) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const tone = ext === "pdf" ? "bg-red-50 text-red-600" : ["xls", "xlsx", "csv"].includes(ext) ? "bg-emerald-50 text-emerald-600" : ["png", "jpg", "jpeg", "gif", "webp"].includes(ext) ? "bg-violet-50 text-violet-600" : "bg-slate-100 text-slate-500";
  return (
    <span className="inline-flex items-center gap-2.5 pl-2 pr-1.5 py-2 rounded-xl border border-slate-200 bg-white min-w-[11rem] max-w-[16rem]">
      <span className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-[9px] font-bold uppercase ${tone}`}>{ext.slice(0, 4) || "file"}</span>
      <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold text-slate-700 truncate" title={name}>{name}</span><span className="block text-[10px] text-slate-400">{size}{pending ? " · uploads on save" : ""}</span></span>
      <button onClick={onRemove} className="p-1 rounded text-slate-300 hover:text-red-500" aria-label={`Remove ${name}`}><X size={13} /></button>
    </span>
  );
}
