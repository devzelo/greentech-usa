import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X, FileText, Eye, EyeOff, Download, Send, PenLine, Handshake, Upload, ChevronDown, ChevronRight, ChevronUp, Copy, Lock, Unlock, History, Ban, CheckCircle2, Archive, RotateCcw } from "lucide-react";
import {
  fetchAgreements, createAgreement, updateAgreement, deleteAgreement, sendAgreement, setAgreementArchived,
  signAgreement, rejectAgreement, cancelAgreement, freezeAgreementPdf, uploadSignedAgreement, uploadAgreementDocument,
  fetchAgreementTemplates, fetchSignatories, fetchNdaFiles, fetchMe, attachmentUrl, companyFileUrl,
  type ApiAgreement, type ApiAgreementParty, type ApiAgreementSections, type ApiAgreementTemplate,
  type AgreementCtx, type AgreementStatus, type ApiSignatory, type CompanyFile,
} from "../../../lib/api";
import { buildAgreementPdf } from "../../../lib/agreementPdf";
import { SECTION_STATUS_OPTS, type SectionStatus } from "../../../lib/sectionStatus";
import { GREENTECH } from "../../../lib/poPdf";
import { downloadBlob } from "../../../lib/proposalExport";
import { toast } from "../../../lib/toast";
import { useDialogs } from "../../../lib/useDialogs";
import PdfPreviewModal from "../PdfPreviewModal";
import RichTextEditor from "../RichTextEditor";

// The one shared Agreements surface — mounted on the employee profile (user context) and on
// partner / subcontractor / vendor records inside a project (project context). Staff create,
// send, cancel and upload counter-signed copies; the recipient (when they have a login)
// reviews and signs from their own account.

const inp = "w-full bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10";

const STATUS_META: Record<AgreementStatus, { label: string; cls: string }> = {
  Draft:            { label: "Draft",             cls: "bg-slate-100 text-slate-500" },
  Sent:             { label: "Sent",              cls: "bg-indigo-50 text-indigo-600" },
  Viewed:           { label: "Viewed",            cls: "bg-blue-50 text-blue-600" },
  PendingSignature: { label: "Pending signature", cls: "bg-amber-50 text-amber-600" },
  Signed:           { label: "Signed",            cls: "bg-emerald-50 text-emerald-600" },
  Rejected:         { label: "Rejected",          cls: "bg-red-50 text-red-600" },
  Expired:          { label: "Expired",           cls: "bg-orange-50 text-orange-600" },
  Cancelled:        { label: "Cancelled",         cls: "bg-slate-100 text-slate-400" },
};

const ENTITY_CODE: Record<string, string> = { partner: "PAR", subcontractor: "SUB", vendor: "VEN" };
const abbr = (s: string) => ((s || "").trim().split(/\s+/)[0] || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);

export interface AgreementDefaults {
  party1?: Partial<ApiAgreementParty>;      // defaults to GreenTech
  party2?: Partial<ApiAgreementParty>;      // prefilled from the profile / entity record
  contextLines?: Array<{ label: string; value: string }>;
  projectName?: string;                     // fallback for the auto-generated code
  projectNo?: string;                       // preferred for the code (spec §5: GT-PROJ01-…)
  jv?: { name: string; logoUrl: string };   // the project's JV partner — used by the JV letterhead
}

const BLANK_PARTY: ApiAgreementParty = { name: "", contactName: "", address: "", email: "", phone: "", logoUrl: "" };
const BLANK_SECTIONS: ApiAgreementSections = { scope: "", terms: "", paymentConditions: "", deliveryConditions: "", ndaEnabled: false, ndaMode: "text", ndaText: "", ndaFile: null };

type Draft = {
  name: string; agreementType: string; templateId: string;
  effectiveDate: string; startDate: string; endDate: string;
  letterhead: "gt" | "jv"; jvLogoUrl: string;
  documentMode: "built" | "uploaded"; uploadFile: File | null;
  party2: ApiAgreementParty;
  contextLines: Array<{ label: string; value: string }>;
  sections: ApiAgreementSections;
  extraSections: Array<{ title: string; body: string; status?: SectionStatus; locked?: boolean; hidden?: boolean; notes?: string }>;
  company: { signerName: string; signerTitle: string; signerEmail: string; signerPhone: string; signatureUrl: string; stampUrl: string; signedAt: string };
};

export default function AgreementsPanel({ ctx, canManage, canSign = false, defaults }: {
  ctx: AgreementCtx; canManage: boolean; canSign?: boolean; defaults?: AgreementDefaults;
}) {
  const [list, setList] = useState<ApiAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<ApiAgreementTemplate[]>([]);
  const [signatories, setSignatories] = useState<ApiSignatory[]>([]);
  const [ndaFiles, setNdaFiles] = useState<CompanyFile[]>([]);
  const [ndaPicker, setNdaPicker] = useState(false);
  const [editor, setEditor] = useState<{ aid: string | null } | null>(null); // null aid = creating
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // agreement id with an action running
  const [preview, setPreview] = useState<{ title: string; fileName: string; build: () => Promise<Blob> } | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [signFor, setSignFor] = useState<ApiAgreement | null>(null);
  const [mySignatureUrl, setMySignatureUrl] = useState("");
  const [signName, setSignName] = useState("");
  const { confirm, prompt, dialogs } = useDialogs();
  const [showArchived, setShowArchived] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setList(await fetchAgreements(ctx, showArchived)); } catch { /* keep */ } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [JSON.stringify(ctx), showArchived]);
  const archive = async (ag: ApiAgreement, next: boolean) => {
    try { patch(await setAgreementArchived(ctx, ag._id, next)); if (next !== showArchived) setList((p) => p.filter((x) => x._id !== ag._id)); toast(next ? "Agreement archived." : "Agreement restored.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
  };

  const patch = (ag: ApiAgreement) => setList((p) => p.map((x) => (x._id === ag._id ? ag : x)));

  const relevantTemplates = useMemo(
    () => templates.filter((t) =>
      ctx.kind === "user" ? t.contextType === "user"
      : ctx.kind === "general" ? t.contextType === "general"
      : t.contextType === "project" && (!t.entityType || t.entityType === ctx.entityType)),
    [templates, ctx]
  );

  const autoName = (type: string): string => {
    const year = new Date().getFullYear();
    const typeCode = (type || "AGREEMENT").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const p2 = abbr(draft?.party2.name || defaults?.party2?.name || "");
    const base = ctx.kind === "user"
      ? `GT-EMP-${p2 || "NAME"}-${typeCode}-${year}`
      : ctx.kind === "general"
        ? `GT-GEN-${p2 || "NAME"}-${typeCode}-${year}`
        : `GT-${abbr(defaults?.projectNo || "") || abbr(defaults?.projectName || "") || "PROJ"}-${ENTITY_CODE[ctx.entityType]}-${p2 || "NAME"}-${typeCode}-${year}`;
    // De-duplicate against existing agreements with a serial suffix.
    let name = base, n = 2;
    while (list.some((a) => a.name === name && a._id !== editor?.aid)) name = `${base}-${n++}`;
    return name;
  };

  const loadPickers = () => {
    if (!templates.length) fetchAgreementTemplates().then(setTemplates).catch(() => {});
    if (!signatories.length) fetchSignatories().then(setSignatories).catch(() => {});
    if (!ndaFiles.length) fetchNdaFiles().then(setNdaFiles).catch(() => {});
  };
  const openCreate = async () => {
    setDraft({
      name: "", agreementType: ctx.kind === "user" ? "Employment" : ctx.kind === "general" ? "Service" : ctx.entityType === "vendor" ? "Supply" : ctx.entityType === "partner" ? "Partnership" : "Service",
      templateId: "", effectiveDate: new Date().toISOString().slice(0, 10), startDate: "", endDate: "",
      // A partner agreement defaults to the JV (dual-logo) letterhead; everything else to GT.
      letterhead: ctx.kind === "project" && ctx.entityType === "partner" ? "jv" : "gt",
      // Project agreements extract the JV logo from the project; general agreements start blank
      // (manual upload); user agreements never use a JV letterhead.
      jvLogoUrl: ctx.kind === "project" ? (defaults?.jv?.logoUrl || defaults?.party2?.logoUrl || "") : "",
      documentMode: "built", uploadFile: null,
      party2: { ...BLANK_PARTY, ...(defaults?.party2 || {}) },
      contextLines: defaults?.contextLines?.map((l) => ({ ...l })) || [],
      sections: { ...BLANK_SECTIONS },
      extraSections: [],
      company: { signerName: "", signerTitle: "", signerEmail: "", signerPhone: "", signatureUrl: "", stampUrl: "", signedAt: "" },
    });
    setEditor({ aid: null });
    loadPickers();
  };
  const openEdit = (ag: ApiAgreement) => {
    setDraft({
      name: ag.name, agreementType: ag.agreementType, templateId: ag.templateId,
      effectiveDate: ag.effectiveDate, startDate: ag.startDate, endDate: ag.endDate,
      letterhead: ag.letterhead === "jv" && ctx.kind !== "user" ? "jv" : "gt",
      jvLogoUrl: ag.jvLogoUrl || (ctx.kind === "project" ? (defaults?.jv?.logoUrl || defaults?.party2?.logoUrl || "") : ""),
      documentMode: ag.documentMode === "uploaded" ? "uploaded" : "built", uploadFile: null,
      party2: { ...BLANK_PARTY, ...(ag.partySnapshot?.party2 || {}) },
      contextLines: (ag.partySnapshot?.contextLines || []).map((l) => ({ ...l })),
      sections: { ...BLANK_SECTIONS, ...(ag.sections || {}) },
      extraSections: (ag.extraSections || []).map((s) => ({ ...s, status: (s.status || "") as SectionStatus })),
      company: { signerName: "", signerTitle: "", signerEmail: "", signerPhone: "", signatureUrl: "", stampUrl: "", signedAt: "", ...(ag.signatures?.company || {}) },
    });
    setEditor({ aid: ag._id });
    loadPickers();
  };

  // Resolve a stored logo (uploads path / plain URL / data URI) to something an <img>/PDF can load.
  const logoSrc = (url: string) => (!url ? "" : url.startsWith("uploads") || url.includes("/uploads/") ? attachmentUrl(url.replace(/^\/+/, "")) : url);
  // General agreements: upload a JV logo manually — embedded as a data URI (the PDF handles those).
  const onJvLogoFile = (file?: File) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setDraft((d) => (d ? { ...d, jvLogoUrl: String(r.result) } : d));
    r.readAsDataURL(file);
  };

  const applyTemplate = (tid: string) => {
    if (!draft) return;
    const t = templates.find((x) => x._id === tid);
    if (!t) { setDraft({ ...draft, templateId: tid }); return; }
    setDraft({
      ...draft, templateId: tid, agreementType: t.agreementType,
      sections: { ...draft.sections, scope: t.sections.scope, terms: t.sections.terms, paymentConditions: t.sections.paymentConditions, deliveryConditions: t.sections.deliveryConditions, ndaText: t.sections.ndaText || draft.sections.ndaText },
    });
  };

  const party1 = (): ApiAgreementParty => ({
    name: GREENTECH.name, contactName: "", address: GREENTECH.address, email: GREENTECH.email, phone: GREENTECH.phone, logoUrl: "/gt-usa-logo-new.png",
    ...(defaults?.party1 || {}),
  });

  // `isDraftStatus` — the party snapshot is only editable before the agreement is issued; sending
  // it later is silently ignored server-side, but we simply don't send it.
  const draftBody = (isDraftStatus = true) => ({
    name: draft!.name || autoName(draft!.agreementType),
    agreementType: draft!.agreementType, templateId: draft!.templateId,
    effectiveDate: draft!.effectiveDate, startDate: draft!.startDate, endDate: draft!.endDate,
    letterhead: draft!.letterhead, jvLogoUrl: draft!.jvLogoUrl,
    documentMode: draft!.documentMode,
    ...(isDraftStatus ? { partySnapshot: { party1: party1(), party2: draft!.party2, contextLines: draft!.contextLines.filter((l) => l.label || l.value) } } : {}),
    sections: draft!.sections,
    extraSections: draft!.extraSections.filter((s) => s.title || s.body),
    companySignature: draft!.company,
  });

  const saveDraft = async (thenSend = false) => {
    if (!draft || !editor) return;
    setSaving(true);
    try {
      let ag: ApiAgreement;
      if (editor.aid === null) {
        // ONE call — the signer is accepted at creation, so a later failure can never leave a
        // half-made record (and a retry can't create a duplicate).
        ag = await createAgreement(ctx, draftBody());
        setList((p) => [ag, ...p]);
        setEditor({ aid: ag._id }); // any retry from here updates instead of re-creating
      } else {
        const cur = list.find((a) => a._id === editor.aid);
        ag = await updateAgreement(ctx, editor.aid, draftBody((cur?.status || "Draft") === "Draft"));
        patch(ag);
      }
      // Uploaded-document agreements: attach the file — it becomes the document itself.
      if (draft.documentMode === "uploaded" && draft.uploadFile) {
        ag = await uploadAgreementDocument(ctx, ag._id, draft.uploadFile);
        patch(ag);
      }
      if (thenSend) {
        ag = await sendAgreement(ctx, ag._id);
        patch(ag);
        toast("Agreement sent — the recipient can now review and sign it.", "success");
      } else {
        toast("Agreement saved.", "success");
      }
      setEditor(null); setDraft(null);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save the agreement.", "error"); }
    finally { setSaving(false); }
  };

  const send = async (ag: ApiAgreement) => {
    if (!(await confirm({ title: "Send agreement?", message: `This locks the party details and marks "${ag.name || ag.agreementType}" as Sent. The recipient will be notified if they have a login.`, confirmLabel: "Send", danger: false }))) return;
    setBusy(ag._id);
    try { patch(await sendAgreement(ctx, ag._id)); toast("Agreement sent.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not send.", "error"); }
    finally { setBusy(null); }
  };
  const cancel = async (ag: ApiAgreement) => {
    const note = await prompt({ title: "Cancel agreement", label: "Reason (kept in the history)", placeholder: "e.g. superseded by a new agreement", confirmLabel: "Cancel agreement" });
    if (note === null) return;
    setBusy(ag._id);
    try { patch(await cancelAgreement(ctx, ag._id, note)); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not cancel.", "error"); }
    finally { setBusy(null); }
  };
  const remove = async (ag: ApiAgreement) => {
    if (!(await confirm({ title: "Delete agreement?", message: "This permanently removes the agreement record.", confirmLabel: "Delete" }))) return;
    try { await deleteAgreement(ctx, ag._id); setList((p) => p.filter((x) => x._id !== ag._id)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  const download = async (ag: ApiAgreement) => {
    try {
      if (ag.signedDocument?.filePath) { window.open(attachmentUrl(ag.signedDocument.filePath), "_blank"); return; }
      // Uploaded-document agreements: download the attached file as-is (whatever format).
      if (ag.documentMode === "uploaded" && ag.uploadedDocument?.filePath) { window.open(attachmentUrl(ag.uploadedDocument.filePath.replace(/^\/+/, "")), "_blank"); return; }
      downloadBlob(await buildAgreementPdf(ag), `${(ag.name || "agreement").replace(/[^\w-]+/g, "_")}.pdf`);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not build the PDF.", "error"); }
  };
  const uploadSigned = async (ag: ApiAgreement, file: File) => {
    setBusy(ag._id);
    try { patch(await uploadSignedAgreement(ctx, ag._id, file)); toast("Counter-signed copy uploaded — agreement marked Signed.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
    finally { setBusy(null); }
  };

  // ── Recipient signing ───────────────────────────────────────────────────────
  const openSign = async (ag: ApiAgreement) => {
    setSignFor(ag);
    try { const me = await fetchMe(); setSignName(me.name || ""); setMySignatureUrl((me as { signatureUrl?: string }).signatureUrl || ""); }
    catch { setSignName(""); setMySignatureUrl(""); }
  };
  const doSign = async () => {
    if (!signFor) return;
    setBusy(signFor._id);
    try {
      let ag = await signAgreement(ctx, signFor._id, { signerName: signName, signatureUrl: mySignatureUrl });
      // Freeze the fully-signed PDF as the immutable snapshot (best-effort). Uploaded-document
      // agreements skip this — the uploaded file already IS the document.
      if (ag.documentMode !== "uploaded") {
        try {
          const blob = await buildAgreementPdf(ag);
          ag = await freezeAgreementPdf(ctx, ag._id, new File([blob], `${(ag.name || "agreement").replace(/[^\w-]+/g, "_")}_signed.pdf`, { type: "application/pdf" }));
        } catch { /* snapshot is best-effort */ }
      }
      patch(ag); setSignFor(null);
      toast("Agreement signed.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not sign.", "error"); }
    finally { setBusy(null); }
  };
  const doReject = async (ag: ApiAgreement) => {
    const note = await prompt({ title: "Reject agreement", label: "Reason (sent back to GreenTech)", placeholder: "e.g. payment terms need revision", confirmLabel: "Reject" });
    if (note === null) return;
    setBusy(ag._id);
    try { patch(await rejectAgreement(ctx, ag._id, note)); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not reject.", "error"); }
    finally { setBusy(null); }
  };

  const signable = (ag: ApiAgreement) => canSign && ["Sent", "Viewed", "PendingSignature"].includes(ag.status);

  if (loading) return <div className="py-8 flex justify-center text-slate-300"><Loader2 size={20} className="animate-spin" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Handshake size={12} /> Agreements{showArchived && <span className="text-amber-600">· archived</span>}</p>
        <div className="flex items-center gap-2">
          {canManage && <button onClick={() => setShowArchived((v) => !v)} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border ${showArchived ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-200 hover:text-slate-900"}`}><Archive size={11} /> {showArchived ? "Active" : "Archived"}</button>}
          {canManage && !showArchived && <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary transition-colors"><Plus size={12} /> Create agreement</button>}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic">No agreements yet.{canManage ? " Create one — the details auto-fill from this profile." : ""}</p>
      ) : (
        <div className="space-y-2">
          {list.map((ag) => {
            const meta = STATUS_META[ag.status] || STATUS_META.Draft;
            return (
              <div key={ag._id} className="border border-slate-100 rounded-2xl bg-white">
                <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <FileText size={14} className="text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-grow">
                    <p className="text-xs font-bold text-slate-800 truncate">{ag.name || `${ag.agreementType} agreement`}</p>
                    <p className="text-[10px] text-slate-400">
                      {ag.agreementType}{ag.effectiveDate ? ` · Effective ${ag.effectiveDate}` : ""}{ag.endDate ? ` · Ends ${ag.endDate}` : ""}
                      {ag.signatures?.recipient?.signedAt ? ` · Signed ${ag.signatures.recipient.signedAt}` : ag.sentAt ? ` · Sent ${ag.sentAt}` : ""}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${meta.cls}`}>{meta.label}</span>
                  <div className="flex items-center gap-1">
                    {signable(ag) && (
                      <>
                        <button onClick={() => openSign(ag)} disabled={busy === ag._id} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 disabled:opacity-50"><PenLine size={11} /> Sign</button>
                        <button onClick={() => doReject(ag)} disabled={busy === ag._id} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100 disabled:opacity-50">Reject</button>
                      </>
                    )}
                    {canManage && ["Draft", "Rejected"].includes(ag.status) && (
                      <button onClick={() => send(ag)} disabled={busy === ag._id} title="Send to the recipient" className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-white text-[10px] font-bold hover:bg-primary/80 disabled:opacity-50"><Send size={11} /> Send</button>
                    )}
                    {canManage && ag.status !== "Signed" && (
                      <button onClick={() => openEdit(ag)} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200">Manage</button>
                    )}
                    <button onClick={() => { if (ag.documentMode === "uploaded" && ag.uploadedDocument?.filePath) { window.open(attachmentUrl(ag.uploadedDocument.filePath.replace(/^\/+/, "")), "_blank"); return; } setPreview({ title: ag.name || "Agreement", fileName: `${(ag.name || "agreement").replace(/[^\w-]+/g, "_")}.pdf`, build: () => buildAgreementPdf(ag) }); }} className="p-1.5 rounded text-slate-400 hover:text-primary" title="Preview"><Eye size={14} /></button>
                    <button onClick={() => download(ag)} className="p-1.5 rounded text-slate-400 hover:text-primary" title={ag.signedDocument ? "Open the signed copy" : "Download PDF"}><Download size={14} /></button>
                    {canManage && ["Sent", "Viewed", "PendingSignature", "Rejected"].includes(ag.status) && (
                      <label className="p-1.5 rounded text-slate-400 hover:text-primary cursor-pointer" title="Upload the counter-signed copy (received outside the platform) — marks the agreement Signed">
                        <Upload size={14} />
                        <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadSigned(ag, f); e.target.value = ""; }} />
                      </label>
                    )}
                    {/* Cancel retires an issued agreement — including a Signed one, which can
                        never be deleted (spec §4: signed records stay, only the status moves). */}
                    {canManage && !["Draft", "Cancelled"].includes(ag.status) && (
                      <button onClick={() => cancel(ag)} className="p-1.5 rounded text-slate-300 hover:text-orange-500" title={ag.status === "Signed" ? "Retire this signed agreement (the record and signed copy are kept)" : "Cancel agreement"}><Ban size={13} /></button>
                    )}
                    {canManage && ag.status !== "Signed" && (
                      <button onClick={() => remove(ag)} className="p-1.5 rounded text-slate-300 hover:text-red-500" title="Delete"><Trash2 size={13} /></button>
                    )}
                    {canManage && (
                      <button onClick={() => archive(ag, !ag.archived)} className="p-1.5 rounded text-slate-300 hover:text-amber-500" title={ag.archived ? "Restore" : "Archive"}>{ag.archived ? <RotateCcw size={13} /> : <Archive size={13} />}</button>
                    )}
                    <button onClick={() => setHistoryFor(historyFor === ag._id ? null : ag._id)} className="p-1.5 rounded text-slate-300 hover:text-slate-600" title="History">
                      {historyFor === ag._id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </div>
                </div>
                {ag.status === "Signed" && ag.signedDocument && (
                  <div className="px-3 pb-2 -mt-1">
                    <a href={attachmentUrl(ag.signedDocument.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:underline"><CheckCircle2 size={11} /> Signed copy · {ag.signedDocument.name}</a>
                  </div>
                )}
                {historyFor === ag._id && (
                  <div className="px-4 pb-3 border-t border-slate-50">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-2 pb-1 flex items-center gap-1"><History size={10} /> History</p>
                    <ul className="space-y-1">
                      {[...(ag.activity || [])].reverse().map((e, i) => (
                        <li key={i} className="flex items-start gap-2 text-[10px]">
                          <span className="text-slate-300 whitespace-nowrap">{new Date(e.at).toLocaleString()}</span>
                          <span className="font-bold text-slate-600 capitalize">{e.action.replace(/-/g, " ")}</span>
                          {e.note && <span className="text-slate-400">{e.note}</span>}
                          <span className="text-slate-400 ml-auto whitespace-nowrap">{e.actorName}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dialogs}
      {preview && <PdfPreviewModal title={preview.title} fileName={preview.fileName} build={preview.build} onClose={() => setPreview(null)} />}

      {/* NDA file picker — the reusable NDAs from Classified Documents → NDA Files. */}
      {ndaPicker && draft && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={() => setNdaPicker(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-16" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">Choose an NDA file</p>
              <button onClick={() => setNdaPicker(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5">
              {ndaFiles.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-6">No NDA files yet. An admin uploads them in <span className="font-bold">Documents → Classified → NDA Files</span>.</p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {ndaFiles.map((f) => (
                    <button key={f._id} onClick={() => { setDraft({ ...draft, sections: { ...draft.sections, ndaFile: { name: f.name, url: companyFileUrl(f) } } }); setNdaPicker(false); }} className="w-full flex items-center gap-2 p-2.5 rounded-xl hover:bg-slate-50 text-left border border-transparent hover:border-slate-100">
                      <FileText size={14} className="text-primary shrink-0" />
                      <span className="text-sm font-bold text-slate-700 truncate flex-grow">{f.name}</span>
                      <span className="text-[10px] font-bold text-slate-400">{f.size}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Sign dialog (recipient) ─────────────────────────────────────────── */}
      {signFor && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-16" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">Sign "{signFor.name || signFor.agreementType}"</p>
              <button onClick={() => setSignFor(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-[11px] text-slate-500">Review the agreement first (Preview), then sign. Your signature and the date are recorded and the document is locked.</p>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your name
                <input className={`${inp} mt-1`} value={signName} onChange={(e) => setSignName(e.target.value)} /></label>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Signature</p>
                {mySignatureUrl
                  ? <img src={attachmentUrl(mySignatureUrl.replace(/^\/+/, ""))} alt="my signature" className="h-10 object-contain bg-slate-50 rounded-lg px-2 py-1 border border-slate-100" />
                  : <p className="text-[11px] text-amber-600">No signature on file — upload one in your Profile first, or sign with your typed name only.</p>}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setPreview({ title: signFor.name || "Agreement", fileName: "agreement.pdf", build: () => buildAgreementPdf(signFor) })} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold inline-flex items-center gap-1.5"><Eye size={13} /> Preview</button>
                <button onClick={doSign} disabled={busy === signFor._id || !signName.trim()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{busy === signFor._id ? <Loader2 size={13} className="animate-spin" /> : <PenLine size={13} />} Sign agreement</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Editor modal (staff) ────────────────────────────────────────────── */}
      {editor && draft && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
              <div>
                <p className="text-sm font-bold text-slate-900">{editor.aid ? "Manage agreement" : "New agreement"}</p>
                <p className="text-[10px] text-slate-400">{ctx.kind === "user" ? "Employee agreement — details auto-fill from the user profile" : ctx.kind === "general" ? "General agreement — GreenTech’s details are filled in; add the other party below" : `${ctx.entityType} agreement — details auto-fill from the project record`}</p>
              </div>
              <button onClick={() => { setEditor(null); setDraft(null); }} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Template + type + name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Template
                  <select className={`${inp} mt-1 font-bold`} value={draft.templateId} onChange={(e) => applyTemplate(e.target.value)}>
                    <option value="">— blank —</option>
                    {relevantTemplates.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                  </select></label>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Agreement type
                  <input className={`${inp} mt-1`} value={draft.agreementType} onChange={(e) => setDraft({ ...draft, agreementType: e.target.value })} placeholder="Employment / Service / Supply…" /></label>
              </div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Agreement name / code
                <div className="flex gap-2 mt-1">
                  <input className={inp} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={autoName(draft.agreementType)} />
                  <button onClick={() => setDraft({ ...draft, name: autoName(draft.agreementType) })} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200 whitespace-nowrap shrink-0" title="Generate the code automatically">Auto</button>
                </div></label>

              {/* Create vs Upload — build the agreement from the fields below, or attach an already-made file. */}
              <div className="bg-slate-50 rounded-2xl p-3 space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">How do you want to create this agreement?</p>
                <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[11px] font-bold">
                  {([["built", "Create in platform"], ["uploaded", "Upload existing file"]] as const).map(([m, label]) => (
                    <button key={m} onClick={() => setDraft({ ...draft, documentMode: m })} className={`px-3 py-1.5 ${draft.documentMode === m ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
                  ))}
                </div>
                {draft.documentMode === "uploaded" && (() => {
                  const existingName = list.find((a) => a._id === editor?.aid)?.uploadedDocument?.name || "";
                  const shown = draft.uploadFile?.name || existingName;
                  return (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {shown ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700"><FileText size={12} /> {shown}</span> : <span className="text-[11px] text-slate-400 italic">No file chosen yet.</span>}
                      <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary cursor-pointer"><Upload size={11} /> {shown ? "Change file" : "Choose file"}<input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setDraft({ ...draft, uploadFile: f }); e.target.value = ""; }} /></label>
                      <span className="text-[10px] text-slate-400">Any format — it will be previewed &amp; downloaded exactly as uploaded.</span>
                    </div>
                  );
                })()}
              </div>

              {draft.documentMode === "built" && (<>
              <div className="grid grid-cols-3 gap-3">
                {([["effectiveDate", "Effective date"], ["startDate", "Start date"], ["endDate", "End date"]] as const).map(([f, label]) => (
                  <label key={f} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}
                    <input type="date" className={`${inp} mt-1`} value={draft[f]} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} /></label>
                ))}
              </div>

              {/* Letterhead — user agreements are GreenTech-only; project agreements extract the JV
                  logo & name from the project's Joint Venture; general agreements upload one manually. */}
              <div className="bg-slate-50 rounded-2xl p-3 space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Letterhead</p>
                {ctx.kind === "user" ? (
                  <p className="text-[11px] text-slate-500">GreenTech letterhead.</p>
                ) : (
                  <>
                    <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[11px] font-bold">
                      {([["gt", "GreenTech"], ["jv", "Joint Venture (both logos)"]] as const).map(([v, label]) => (
                        <button key={v} onClick={() => setDraft({ ...draft, letterhead: v })} className={`px-3 py-1.5 ${draft.letterhead === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
                      ))}
                    </div>
                    {draft.letterhead === "jv" && (ctx.kind === "project" ? (
                      // Auto-extracted from the project's Joint Venture partner (logo + name).
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">JV partner</span>
                        {draft.jvLogoUrl && <img src={logoSrc(draft.jvLogoUrl)} alt="JV logo" className="h-8 object-contain" />}
                        <span className="text-[11px] font-bold text-slate-700">{defaults?.jv?.name || defaults?.party2?.name || "—"}</span>
                        {!draft.jvLogoUrl && <span className="text-[11px] text-amber-600 italic">No partner logo on the project — add one in the Joint Venture section.</span>}
                      </div>
                    ) : (
                      // General agreement — upload a JV logo manually (no project to pull from).
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">JV logo</span>
                        {draft.jvLogoUrl ? <img src={logoSrc(draft.jvLogoUrl)} alt="JV logo" className="h-8 object-contain" /> : <span className="text-[11px] text-slate-400 italic">No logo yet.</span>}
                        <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary cursor-pointer"><Upload size={11} /> Upload logo<input type="file" accept="image/*" hidden onChange={(e) => onJvLogoFile(e.target.files?.[0])} /></label>
                        <input className={`${inp} max-w-[14rem]`} placeholder="or paste a logo URL" value={draft.jvLogoUrl.startsWith("data:") ? "" : draft.jvLogoUrl} onChange={(e) => setDraft({ ...draft, jvLogoUrl: e.target.value })} />
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Party 2 */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Party 2 — {ctx.kind === "user" ? "employee" : ctx.kind === "general" ? "other party" : ctx.entityType} <span className="font-medium normal-case text-slate-400">— auto-filled; frozen once sent</span></p>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inp} placeholder="Name *" value={draft.party2.name} onChange={(e) => setDraft({ ...draft, party2: { ...draft.party2, name: e.target.value } })} />
                  <input className={inp} placeholder="Contact person" value={draft.party2.contactName} onChange={(e) => setDraft({ ...draft, party2: { ...draft.party2, contactName: e.target.value } })} />
                  <input className={inp} placeholder="Email" value={draft.party2.email} onChange={(e) => setDraft({ ...draft, party2: { ...draft.party2, email: e.target.value } })} />
                  <input className={inp} placeholder="Phone" value={draft.party2.phone} onChange={(e) => setDraft({ ...draft, party2: { ...draft.party2, phone: e.target.value } })} />
                  <input className={`${inp} col-span-2`} placeholder="Address" value={draft.party2.address} onChange={(e) => setDraft({ ...draft, party2: { ...draft.party2, address: e.target.value } })} />
                </div>
              </div>

              {/* Context lines */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{ctx.kind === "user" ? "Employment information" : ctx.kind === "general" ? "Agreement information" : "Project information"} <span className="font-medium normal-case text-slate-400">— printed as an info block on the document</span></p>
                  <button onClick={() => setDraft({ ...draft, contextLines: [...draft.contextLines, { label: "", value: "" }] })} className="text-[10px] font-bold text-primary hover:underline">+ Add line</button>
                </div>
                {draft.contextLines.length === 0 && <p className="text-[11px] text-slate-400 italic">No info lines.</p>}
                {draft.contextLines.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <input className={`${inp} max-w-[12rem]`} placeholder="Label (e.g. Salary)" value={l.label} onChange={(e) => setDraft({ ...draft, contextLines: draft.contextLines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                    <input className={inp} placeholder="Value" value={l.value} onChange={(e) => setDraft({ ...draft, contextLines: draft.contextLines.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                    <button onClick={() => setDraft({ ...draft, contextLines: draft.contextLines.filter((_, j) => j !== i) })} className="text-slate-300 hover:text-red-500 shrink-0"><X size={14} /></button>
                  </div>
                ))}
              </div>

              {/* Sections — rich text so tables & pictures can be added (rendered into the agreement PDF). */}
              {([["scope", "Scope / description", 120], ["terms", "Terms & conditions", 160], ["paymentConditions", "Payment conditions", 90], ["deliveryConditions", "Delivery conditions", 90]] as const).map(([f, label, mh]) => (
                <div key={f} className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}
                  <div className="mt-1"><RichTextEditor value={draft.sections[f]} onChange={(html) => setDraft({ ...draft, sections: { ...draft.sections, [f]: html } })} minHeight={mh} placeholder={`${label}…`} /></div>
                </div>
              ))}

              {/* Custom named sections — CR-B-04: these live BEFORE the NDA; the NDA is always
                  the last section before the signature. Each is a titled rich-text block. */}
              {draft.extraSections.map((s, i) => {
                const count = draft.extraSections.length;
                const locked = !!s.locked;
                // Per-section update / reorder / duplicate helpers (CR-B-15/17) on the draft.
                const upd = (patch: Partial<typeof s>) => setDraft({ ...draft, extraSections: draft.extraSections.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                const move = (dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= count) return; const arr = [...draft.extraSections]; [arr[i], arr[j]] = [arr[j], arr[i]]; setDraft({ ...draft, extraSections: arr }); };
                const dup = () => { const arr = [...draft.extraSections]; arr.splice(i + 1, 0, { ...s, title: s.title ? `${s.title} (copy)` : "" }); setDraft({ ...draft, extraSections: arr }); };
                const st = SECTION_STATUS_OPTS.find((o) => o.v === (s.status || "")) || SECTION_STATUS_OPTS[0];
                return (
                <div key={i} className={`space-y-1.5 border-l-2 pl-3 ${locked ? "border-amber-300" : "border-primary/30"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {locked
                      ? <p className="text-xs font-bold text-slate-700 flex-grow min-w-[8rem]">{s.title || "Untitled section"}<Lock size={11} className="inline ml-1 text-amber-500" /></p>
                      : <input className={`${inp} font-bold flex-grow min-w-[8rem]`} placeholder="Section title (e.g. Confidentiality, Warranty)" value={s.title} onChange={(e) => upd({ title: e.target.value })} />}
                    {/* CR-B-15 — colour-coded per-section status. */}
                    <select value={s.status || ""} onChange={(e) => upd({ status: e.target.value as SectionStatus })} disabled={locked} className={`text-[10px] font-bold rounded-full px-2 py-1 border-0 cursor-pointer disabled:opacity-60 ${st.cls}`} title="Section status">
                      {SECTION_STATUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                    </select>
                    {/* CR-B-17 — section actions. */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => upd({ locked: !locked })} title={locked ? "Unlock section" : "Lock section"} className={`p-1 rounded ${locked ? "text-amber-600 bg-amber-50" : "text-slate-300 hover:text-slate-600"}`}>{locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
                      <button onClick={() => move(-1)} disabled={i === 0} title="Move up" className="p-1 rounded text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp size={13} /></button>
                      <button onClick={() => move(1)} disabled={i === count - 1} title="Move down" className="p-1 rounded text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown size={13} /></button>
                      <button onClick={dup} title="Duplicate section" className="p-1 rounded text-slate-300 hover:text-primary"><Copy size={13} /></button>
                      <button onClick={() => upd({ hidden: !s.hidden })} title={s.hidden ? "Show section" : "Hide section"} className={`p-1 rounded ${s.hidden ? "text-slate-500 bg-slate-100" : "text-slate-300 hover:text-slate-600"}`}>{s.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                      <button onClick={() => setDraft({ ...draft, extraSections: draft.extraSections.filter((_, j) => j !== i) })} disabled={locked} title="Delete section" className="p-1 rounded text-slate-300 hover:text-red-500 disabled:opacity-30"><X size={15} /></button>
                    </div>
                  </div>
                  {s.hidden ? (
                    <p className="text-[11px] text-slate-400 italic bg-slate-50 rounded-lg px-2 py-1.5">Section hidden — use the eye icon to show it.</p>
                  ) : (
                    <>
                      {locked
                        ? <div className="text-xs text-slate-600 bg-white border border-slate-100 rounded-lg p-2" dangerouslySetInnerHTML={{ __html: s.body || "<span class='text-slate-300'>Empty</span>" }} />
                        : <RichTextEditor value={s.body} onChange={(html) => upd({ body: html })} minHeight={110} placeholder="Section content — tables, pictures, lists…" />}
                      {!locked && <input className={`${inp} text-[11px]`} placeholder="+ Internal notes for this section (not printed)" value={s.notes || ""} onChange={(e) => upd({ notes: e.target.value })} />}
                    </>
                  )}
                </div>
                );
              })}
              <button onClick={() => setDraft({ ...draft, extraSections: [...draft.extraSections, { title: "", body: "" }] })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200 w-fit"><Plus size={13} /> Add section</button>

              {/* NDA — always the last section before the signature (CR-B-04). */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={draft.sections.ndaEnabled} onChange={(e) => setDraft({ ...draft, sections: { ...draft.sections, ndaEnabled: e.target.checked } })} />
                    Include NDA section
                  </label>
                  {draft.sections.ndaEnabled && (
                    <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-bold">
                      {(["text", "file"] as const).map((m) => (
                        <button key={m} onClick={() => setDraft({ ...draft, sections: { ...draft.sections, ndaMode: m } })} className={`px-3 py-1 ${(draft.sections.ndaMode || "text") === m ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{m === "text" ? "Write manually" : "Select file"}</button>
                      ))}
                    </div>
                  )}
                </div>
                {draft.sections.ndaEnabled && ((draft.sections.ndaMode || "text") === "text" ? (
                  <RichTextEditor value={draft.sections.ndaText} onChange={(html) => setDraft({ ...draft, sections: { ...draft.sections, ndaText: html } })} minHeight={90} placeholder="NDA wording…" />
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {draft.sections.ndaFile?.name ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700"><FileText size={11} /> {draft.sections.ndaFile.name}
                        <button onClick={() => setDraft({ ...draft, sections: { ...draft.sections, ndaFile: null } })} className="text-slate-300 hover:text-red-500 ml-1"><X size={11} /></button>
                      </span>
                    ) : <span className="text-[11px] text-slate-400 italic">No NDA file selected.</span>}
                    <button onClick={() => { setNdaPicker(true); if (!ndaFiles.length) fetchNdaFiles().then(setNdaFiles).catch(() => {}); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary"><Plus size={11} /> {draft.sections.ndaFile ? "Change" : "Add NDA"}</button>
                  </div>
                ))}
              </div>

              {/* Company signer */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><PenLine size={11} /> GreenTech signer</p>
                <select className={`${inp} font-bold`} value={signatories.find((s) => s.name === draft.company.signerName && s.signatureUrl === draft.company.signatureUrl)?.id || ""}
                  onChange={(e) => {
                    const s = signatories.find((x) => x.id === e.target.value);
                    setDraft({ ...draft, company: s
                      ? { ...draft.company, signerName: s.name, signerTitle: s.jobTitle || "", signerEmail: s.email || "", signerPhone: s.phone || "", signatureUrl: s.signatureUrl }
                      : { ...draft.company, signerName: "", signerTitle: "", signerEmail: "", signerPhone: "", signatureUrl: "" } });
                  }}>
                  <option value="">— Select a signer —</option>
                  {signatories.map((s) => <option key={s.id} value={s.id}>{s.name}{s.jobTitle ? ` · ${s.jobTitle}` : ""}</option>)}
                </select>
              </div>
              </>)}

              <div className="flex flex-wrap justify-end gap-2 pt-1 border-t border-slate-100">
                {/* Built agreements preview the generated PDF; uploaded ones open the attached file as-is. */}
                {draft.documentMode === "uploaded" ? (
                  (() => {
                    const existing = list.find((a) => a._id === editor?.aid)?.uploadedDocument;
                    const openUploaded = () => {
                      if (draft.uploadFile) { window.open(URL.createObjectURL(draft.uploadFile), "_blank"); return; }
                      if (existing?.filePath) window.open(attachmentUrl(existing.filePath.replace(/^\/+/, "")), "_blank");
                    };
                    const has = !!draft.uploadFile || !!existing?.filePath;
                    return <button onClick={openUploaded} disabled={!has} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40"><Eye size={13} /> Preview file</button>;
                  })()
                ) : (
                  <button onClick={() => {
                    const previewAg = { ...(list.find((a) => a._id === editor.aid) || {}), ...draftBody(), status: (list.find((a) => a._id === editor.aid)?.status || "Draft"), signatures: { company: draft.company, recipient: list.find((a) => a._id === editor.aid)?.signatures?.recipient || { signerName: "", signatureUrl: "", stampUrl: "", signedAt: "", method: "" as const } } } as ApiAgreement;
                    setPreview({ title: previewAg.name || "Agreement", fileName: "agreement.pdf", build: () => buildAgreementPdf(previewAg) });
                  }} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold inline-flex items-center gap-1.5"><Eye size={13} /> Preview</button>
                )}
                <button onClick={() => { setEditor(null); setDraft(null); }} disabled={saving} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold disabled:opacity-50">Cancel</button>
                {/* CR-P-11 — Save and Send are separate. Save here; then Send from the row
                    action (which asks for confirmation), never a combined "Save & send". */}
                <button onClick={() => saveDraft(false)} disabled={saving} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{saving && <Loader2 size={13} className="animate-spin" />} Save as draft</button>
                <button onClick={() => saveDraft(false)} disabled={saving} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">{saving && <Loader2 size={13} className="animate-spin" />} Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
