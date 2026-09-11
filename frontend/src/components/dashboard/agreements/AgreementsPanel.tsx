import { useEffect, useMemo, useRef, useState, Fragment, type ReactNode } from "react";
import { Loader2, Plus, Trash2, X, FileText, Eye, EyeOff, Download, Send, PenLine, Handshake, Upload, ChevronDown, ChevronRight, ChevronUp, Copy, Lock, Unlock, History, Ban, CheckCircle2, Archive, RotateCcw, ArrowUp, ArrowDown, ArrowUpDown, Building2, Search } from "lucide-react";
import {
  fetchAgreements, createAgreement, updateAgreement, deleteAgreement, setAgreementArchived,
  signAgreement, rejectAgreement, cancelAgreement, freezeAgreementPdf, uploadSignedAgreement, uploadAgreementDocument, uploadAgreementShareCopy,
  fetchAgreementTemplates, fetchSignatories, fetchNdaFiles, fetchTermsFiles, fetchMe, fetchMySignatures, type ApiSignature,
  attachmentUrl, companyFileUrl,
  fetchUsers, createReminder, uploadAgreementSectionFile, deleteAgreementSectionFile, getAuthUser,
  shareAgreement, setAgreementVisibility, type SharePartyInput,
  fetchCompanies, fetchProjects, COMPANY_CATEGORIES, type ApiCompany,
  type ApiAgreement, type ApiAgreementParty, type ApiAgreementSections, type ApiAgreementTemplate,
  type AgreementCtx, type AgreementStatus, type ApiSignatory, type CompanyFile, type AdminUser,
} from "../../../lib/api";
import { buildAgreementPdf, buildUploadedAgreementPdf, shownDates, agreementHeading } from "../../../lib/agreementPdf";
import { AGREEMENT_TYPE_GROUPS, AGREEMENT_TYPES_FLAT } from "../../../lib/agreementTypes";
import { SECTION_STATUS_OPTS, type SectionStatus } from "../../../lib/sectionStatus";
import { unfinishedSections as unfinishedOf, allSectionsComplete, autoDocStatus } from "../../../lib/agreementStatus";
import { useSectionPresence } from "../../../lib/usePresence";
import PresenceBar from "../PresenceBar";
import BuilderActions from "../BuilderActions";
import SaveStatus, { useSaveStatus } from "../SaveStatus";
import ShareMenu from "../ShareMenu";
import FileActions from "../FileActions";
import CompanyEditorModal from "../CompanyEditorModal";
import { downloadHtmlAsWord, escapeHtml } from "../../../lib/wordExport";
import { GREENTECH } from "../../../lib/poPdf";
import { downloadBlob } from "../../../lib/proposalExport";
import { toast } from "../../../lib/toast";
import { useDialogs } from "../../../lib/useDialogs";
import PdfPreviewModal from "../PdfPreviewModal";
import RichTextEditor from "../RichTextEditor";
import { useUnsavedGuard } from "../../../lib/useUnsavedGuard";
import { useHighlight } from "../../../lib/useHighlight";

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
// CR-P (50) — the agreement's OWN status vocabulary, exactly the list Reza read out: "draft, in
// review, in progress, complete, completed and signed". The per-section statuses keep their own
// wider set; this one describes the document as a whole and is what the table column shows.
export type DocStatus = "" | "Draft" | "InProgress" | "InReview" | "Complete" | "CompletedSigned";
const DOC_STATUS_OPTS: { v: DocStatus; label: string; cls: string }[] = [
  { v: "", label: "No status", cls: "bg-slate-100 text-slate-400" },
  { v: "Draft", label: "Draft", cls: "bg-slate-100 text-slate-500" },
  { v: "InProgress", label: "In progress", cls: "bg-amber-50 text-amber-600" },
  { v: "InReview", label: "In review", cls: "bg-blue-50 text-blue-600" },
  { v: "Complete", label: "Complete", cls: "bg-emerald-50 text-emerald-600" },
  { v: "CompletedSigned", label: "Completed and signed", cls: "bg-emerald-100 text-emerald-800" },
];
// CR-P (67) — what a collapsed Dates box says, so a shut box still tells you what it holds.
const shownDatesSummary = (d: { datesShown: { effective: boolean; start: boolean; end: boolean }; effectiveDate: string; startDate: string; endDate: string }) => {
  const parts: string[] = [];
  if (d.datesShown.effective && d.effectiveDate) parts.push(`Effective ${d.effectiveDate}`);
  if (d.datesShown.start && d.startDate) parts.push(`Start ${d.startDate}`);
  if (d.datesShown.end && d.endDate) parts.push(`End ${d.endDate}`);
  return parts.length ? parts.join(" · ") : "No dates on the document";
};

const docStatusMeta = (v?: string) => DOC_STATUS_OPTS.find((o) => o.v === (v || "")) || DOC_STATUS_OPTS[0];

// CR-P (23) — the general-agreements table sorts on any of these; it opens on the number.
type GenSortKey = "no" | "title" | "party" | "projects" | "type" | "status" | "modified";
// CR-P (19) — the counterparties on an agreement (party 2 onward). Party 1 is always us, so it
// is left out of the list column; the PDF still prints it as Party 1.
const partyNames = (ag: ApiAgreement): string[] =>
  [ag.partySnapshot?.party2?.name, ...(ag.partySnapshot?.extraParties || []).map((p) => p?.name)]
    .map((n) => (n || "").trim())
    .filter(Boolean);
const abbr = (s: string) => ((s || "").trim().split(/\s+/)[0] || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);

export interface AgreementDefaults {
  party1?: Partial<ApiAgreementParty>;      // defaults to GreenTech
  party2?: Partial<ApiAgreementParty>;      // prefilled from the profile / entity record
  contextLines?: Array<{ label: string; value: string }>;
  projectName?: string;                     // fallback for the auto-generated code
  projectNo?: string;                       // preferred for the code (spec §5: GT-PROJ01-…)
  projectLocation?: string;                 // CR-P (69) — a project agreement covers its project from the start
  jv?: { name: string; logoUrl: string };   // the project's JV partner — used by the JV letterhead
}

// CR-P (67) — one box in the agreement editor. Reza's complaint was that every field looked the
// same: "for some new user, this looks a little confusing". Grouping related fields and letting a
// finished group collapse turns the form into a step-by-step read. Deliberately NOT colour-coded
// per box — he explicitly rejected that ("color will make it a little bit weird").
function EditorBox({ title, hint, children, defaultOpen = true, summary }: {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Shown beside the title when collapsed, so a shut box still says what is in it. */
  summary?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-100/60 transition-colors"
      >
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest min-w-0">
          {title}
          {hint && <span className="font-medium normal-case text-slate-400"> — {hint}</span>}
          {!open && summary && <span className="block mt-0.5 font-medium normal-case text-slate-400 truncate">{summary}</span>}
        </span>
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

const BLANK_PARTY: ApiAgreementParty = { name: "", contactName: "", address: "", email: "", phone: "", logoUrl: "", companyId: "" };
// CR-P (19) — an agreement can name up to 4 parties. Bonding applications always have three
// signatories (the bank, the company and the surety); a JV can add one more on top.
const MAX_PARTIES = 4;
const BLANK_SECTIONS: ApiAgreementSections = {
  scope: "", terms: "", paymentConditions: "", deliveryConditions: "",
  // CR-P (45) — the NDA defaults to the file from Company Documents' NDA folder, like the terms.
  ndaEnabled: false, ndaMode: "file", ndaText: "", ndaFile: null,
  // CR-P (45) — the standard terms default to "select a file": they are a standing document we
  // already hold, not something retyped per agreement.
  stdTermsEnabled: false, stdTermsMode: "file", stdTermsText: "", stdTermsFile: null,
};

type Draft = {
  name: string; title: string; description: string; agreementType: string; templateId: string;
  remark: string;   // CR-P (60) — internal, never printed
  linkedProjects: Array<{ id: string; name: string; location?: string }>;
  effectiveDate: string; startDate: string; endDate: string;
  datesShown: { effective: boolean; start: boolean; end: boolean };   // CR-P (21)
  docStatus: DocStatus;                                                // CR-P (33)/(50)
  letterhead: "gt" | "jv"; jvLogoUrl: string;
  jvPartnerId: string; jvPartnerName: string;   // CR-P (30)
  documentMode: "built" | "uploaded"; uploadFile: File | null;
  party2: ApiAgreementParty;
  extraParties: ApiAgreementParty[];   // CR-P (19) — party 3 and party 4
  contextLines: Array<{ label: string; value: string }>;
  sections: ApiAgreementSections;
  extraSections: Array<{ title: string; body: string; status?: SectionStatus; locked?: boolean; hidden?: boolean; notes?: string; assignedTo?: string; attachments?: Array<{ _id?: string; name: string; filePath: string; fileType: string; size: string }>; history?: Array<{ at: string; by: string; text: string }> }>;
  sectionAssignees: { scope: string; terms: string; paymentConditions: string; deliveryConditions: string };
  company: { signerName: string; signerTitle: string; signerEmail: string; signerPhone: string; signatureUrl: string; stampUrl: string; signedAt: string };
};
const BLANK_ASSIGNEES = { scope: "", terms: "", paymentConditions: "", deliveryConditions: "" };

export default function AgreementsPanel({ ctx, canManage, canSign = false, defaults }: {
  ctx: AgreementCtx; canManage: boolean; canSign?: boolean; defaults?: AgreementDefaults;
}) {
  const [list, setList] = useState<ApiAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<ApiAgreementTemplate[]>([]);
  const [signatories, setSignatories] = useState<ApiSignatory[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]); // CR-B-19a — colleagues to tag on a section
  useEffect(() => { fetchUsers().then(setUsers).catch(() => {}); }, []);
  useEffect(() => { fetchCompanies().then(setCompanies).catch(() => {}); }, []);
  // CR-PR-11 — the project list a general agreement can be linked to.
  const [allProjects, setAllProjects] = useState<Array<{ id: string; name: string; location: string }>>([]);
  // CR-P (69) — every agreement can name the projects it covers, not only general ones.
  useEffect(() => { fetchProjects().then((ps) => setAllProjects(ps.map((p) => ({ id: p.id, name: p.name, location: p.location || "" })))).catch(() => {}); }, []);
  const [ndaFiles, setNdaFiles] = useState<CompanyFile[]>([]);
  // CR-P (45) — the standard terms live in their own Company Documents tab, not the NDA folder.
  const [termsFiles, setTermsFiles] = useState<CompanyFile[]>([]);
  // CR-P (45) — one picker serves both the NDA and the standard terms; it remembers which.
  const [filePickerFor, setFilePickerFor] = useState<null | "nda" | "terms">(null);
  const [editor, setEditor] = useState<{ aid: string | null } | null>(null); // null aid = creating
  // CR-B-20 — while an agreement editor is open, warn before closing the window / leaving the site.
  useUnsavedGuard(!!editor);
  const [draft, setDraft] = useState<Draft | null>(null);
  // CR-PR-09 — Party 2 is picked from the Companies Directory (one party, never several),
  // exactly like an RFQ receiver. Employee agreements keep their own auto-filled details.
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  // CR-P (19) — the picker/creator now target a party SLOT: 2 = party 2, 3 and 4 = the extras.
  const [partyPicker, setPartyPicker] = useState<number | null>(null);
  const [partySearch, setPartySearch] = useState("");
  const [newPartyOpen, setNewPartyOpen] = useState<number | null>(null);
  // CR-B-17 — which section's change-history panel is open.
  const [secHistFor, setSecHistFor] = useState<number | null>(null);
  // CR-B-16 — live "who is in this section" while the agreement editor is open.
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const sectionPeers = useSectionPresence(editor ? `agreements:${ctx.kind === "project" ? ctx.projectId : ctx.kind}:${editor.aid || "new"}` : null, activeSection);
  // CR-B-1 — notify when a new colleague joins this agreement editor.
  const prevPeers = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set(sectionPeers.map((u) => u.userId));
    for (const u of sectionPeers) if (!prevPeers.current.has(u.userId) && prevPeers.current.size > 0) toast(`${u.name} joined this agreement.`, "info");
    prevPeers.current = now;
  }, [sectionPeers]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // agreement id with an action running
  const [preview, setPreview] = useState<{ title: string; fileName: string; build: () => Promise<Blob> } | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  // CR-P (57)/(58) — the share dialog: which of THIS agreement's parties receive it, and why.
  const [shareFor, setShareFor] = useState<ApiAgreement | null>(null);
  const [sharePicked, setSharePicked] = useState<Record<string, boolean>>({});
  const [sharePurpose, setSharePurpose] = useState<"review" | "signature">("review");
  const [shareNote, setShareNote] = useState("");
  // CR-P (63) — "tick which parties can see the agreement, save": the ticks are held here until
  // Save (null = nothing changed yet). Reset whenever another agreement is opened.
  const [visDraft, setVisDraft] = useState<Record<string, boolean> | null>(null);
  const [visBusy, setVisBusy] = useState(false);
  useEffect(() => { setVisDraft(null); }, [editor?.aid]);
  const [signFor, setSignFor] = useState<ApiAgreement | null>(null);
  // CR-P (51) — the file picker opened by "Please upload the signed copy".
  const signedPickRef = useRef<HTMLInputElement>(null);
  const [mySignatureUrl, setMySignatureUrl] = useState("");
  const [signName, setSignName] = useState("");
  // CR-P (16) — the signer's named signatures; they pick which one goes on the document.
  const [mySignatures, setMySignatures] = useState<ApiSignature[]>([]);
  const { confirm, prompt, dialogs } = useDialogs();
  const [showArchived, setShowArchived] = useState(false);
  // Deep-link from a notification: ?hl=ag-<id> flashes the matching agreement once the list loads.
  const flashId = useHighlight(!loading);
  // CR-P-45 — general agreements render as a sortable table.
  const [genSort, setGenSort] = useState<{ key: GenSortKey; dir: "asc" | "desc" }>({ key: "no", dir: "asc" });
  const genVal = (ag: ApiAgreement, key: GenSortKey) =>
    (key === "no" ? ag.agreementNo
      : key === "title" ? ag.title
      : key === "party" ? partyNames(ag).join(", ")
      : key === "projects" ? (ag.linkedProjects || []).map((p) => p.name).join(", ")
      : key === "type" ? ag.agreementType
      // CR-P (50) — the column tracks the DOCUMENT status, not the send lifecycle.
      : key === "status" ? docStatusMeta(ag.docStatus).label
      : ag.updatedAt || "").toString().trim().toLowerCase();
  const sortedGeneral = useMemo(() => {
    return [...list].sort((a, b) => {
      const av = genVal(a, genSort.key), bv = genVal(b, genSort.key);
      if (!av && !bv) return 0; if (!av) return 1; if (!bv) return -1;
      const cmp = av.localeCompare(bv); return genSort.dir === "asc" ? cmp : -cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, genSort, ctx.kind]);
  const genToggle = (key: GenSortKey) => setGenSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  const genSortIcon = (key: GenSortKey) => genSort.key === key ? (genSort.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} className="text-slate-300" />;

  const load = async () => {
    setLoading(true);
    try { setList(await fetchAgreements(ctx, showArchived)); } catch { /* keep */ } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [JSON.stringify(ctx), showArchived]);
  // CR-PR-09 — Party 2 is a company for every agreement except an employee one, where it is
  // the person and stays auto-filled from their profile.
  const party2IsCompany = ctx.kind !== "user";
  // Copy the Directory record onto the party snapshot: the PDF prints the snapshot, so the
  // document keeps the details it was signed with even if the company is edited later.
  const companyToParty = (c: ApiCompany, prev: ApiAgreementParty): ApiAgreementParty => ({
    ...prev,
    companyId: c._id,
    name: c.name,
    contactName: c.contactPersons?.[0]?.name || "",
    email: c.email || c.contactPersons?.[0]?.email || "",
    phone: c.phone || c.contactPersons?.[0]?.phone || "",
    address: c.address || "",
    logoUrl: c.logoUrl || "",
  });
  // CR-P (19) — slot 2 writes party2; slots 3 and 4 write extraParties[slot - 3].
  const partyAt = (d: Draft, slot: number): ApiAgreementParty =>
    (slot === 2 ? d.party2 : d.extraParties[slot - 3]) || { ...BLANK_PARTY };
  const writeParty = (d: Draft, slot: number, p: ApiAgreementParty): Draft =>
    slot === 2 ? { ...d, party2: p } : { ...d, extraParties: d.extraParties.map((x, i) => (i === slot - 3 ? p : x)) };
  const pickParty = (c: ApiCompany, slotArg?: number) => {
    const slot = slotArg ?? partyPicker ?? 2;
    setDraft((d) => (d ? writeParty(d, slot, companyToParty(c, partyAt(d, slot))) : d));
    setPartyPicker(null);
    setPartySearch("");
  };
  // Clearing empties the slot so another company can be picked into it; removing drops the slot
  // entirely (only the extra ones can go, party 2 is always part of an agreement).
  const blankParty = (slot: number) => setDraft((d) => (d ? writeParty(d, slot, { ...BLANK_PARTY }) : d));
  const removeParty = (slot: number) =>
    setDraft((d) => (d ? { ...d, extraParties: d.extraParties.filter((_, i) => i !== slot - 3) } : d));
  const addParty = () =>
    setDraft((d) => (d && 2 + d.extraParties.length < MAX_PARTIES ? { ...d, extraParties: [...d.extraParties, { ...BLANK_PARTY }] } : d));

  // CR-P (33)/(34) — the whole document has an authoring status of its own, alongside the
  // per-section ones. The sections that count are the visible ones: a hidden section is not part
  // of the document being issued, so it cannot hold the document back.
  const unfinishedSections = (d: Draft) => unfinishedOf(d.extraSections);
  const setDocStatus = async (next: DocStatus) => {
    if (!draft) return;
    // CR-P (51) — marking the document "Completed and signed" is a claim that a signed copy
    // exists, so it asks for that copy straight away rather than leaving the claim unevidenced.
    // CR-P (51) — Cancel on that prompt used to set the status anyway, and a draft had nowhere to
    // upload the copy. Now the prompt opens the file picker; the status changes only once the
    // signed copy is uploaded, and Cancel leaves everything as it was.
    if (next === "CompletedSigned") {
      const cur = list.find((a) => a._id === editor?.aid);
      if (!cur?.signedDocument?.filePath) {
        if (!cur) { toast("Save the agreement first, then upload its signed copy.", "info"); return; }
        const ok = await confirm({
          title: "Please upload the signed copy",
          message: "An agreement is only Completed and signed once its signed copy is on file. Choose the file now: the status changes as soon as it is uploaded.",
          confirmLabel: "Choose the signed copy",
          cancelLabel: "Cancel",
          danger: false,
        });
        if (ok) signedPickRef.current?.click();
        return;
      }
    }
    // Marking the whole document Complete while a section is not asks first, so "complete" keeps
    // meaning something. Answering yes is allowed: the person may know the section is fine.
    if (next === "Complete") {
      const open = unfinishedSections(draft);
      if (open.length && !(await confirm({
        title: "It is still not complete",
        message: `${open.length === 1 ? "1 section is" : `${open.length} sections are`} not marked Complete yet: ${open.map((s) => `"${s.title.trim() || "Untitled"}"`).join(", ")}. Are you sure you want to mark the whole agreement as complete?`,
        confirmLabel: "Mark complete",
        danger: false,
      }))) return;
    }
    setDraft((d) => (d ? { ...d, docStatus: next } : d));
  };
  // CR-P (33) — the document status follows the work (the rule lives in lib/agreementStatus): In
  // progress once something is actually written, Complete when every section becomes Complete.
  // The old check ran only on opening and counted the blank defaults as work, so every agreement,
  // even a new blank one, showed In progress straight away, and nothing ever set Complete.
  const withAutoStatus = (d: Draft, sectionsJustCompleted: boolean): Draft => {
    const next = autoDocStatus(d, sectionsJustCompleted) as DocStatus;
    return next === d.docStatus ? d : { ...d, docStatus: next };
  };
  // Whether every section was complete at the last change, so Complete is applied at the moment
  // they BECOME complete. A status chosen by hand after that is respected.
  const allDoneRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!draft) { allDoneRef.current = null; return; }
    const done = allSectionsComplete(draft);
    const justCompleted = done && allDoneRef.current === false;
    allDoneRef.current = done;
    const next = withAutoStatus(draft, justCompleted);
    if (next !== draft) setDraft((d) => (d ? { ...d, docStatus: next.docStatus } : d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // CR-P (20) — every company party goes through the Directory, so the same company carries the
  // same details everywhere. A party prefilled from a project record (subcontractor / vendor / JV)
  // arrives as loose text with no Directory link, so once the Directory has loaded we match it by
  // name, then by email, and attach the link. Only blanks are filled in: a name already on the
  // document is never rewritten, so an issued agreement can't change wording behind the user.
  const directoryMatch = (p: ApiAgreementParty, list: ApiCompany[]): ApiCompany | null => {
    if (!p.name.trim() || p.companyId) return null;
    const n = p.name.trim().toLowerCase(), e = (p.email || "").trim().toLowerCase();
    return list.find((c) => (c.name || "").trim().toLowerCase() === n)
      || (e ? list.find((c) => (c.email || "").trim().toLowerCase() === e) : undefined)
      || null;
  };
  useEffect(() => {
    if (!editor || !companies.length || ctx.kind === "user") return;
    setDraft((d) => {
      if (!d) return d;
      const link = (p: ApiAgreementParty): ApiAgreementParty => {
        const c = directoryMatch(p, companies);
        return c ? {
          ...p, companyId: c._id,
          contactName: p.contactName || c.contactPersons?.[0]?.name || "",
          email: p.email || c.email || "", phone: p.phone || c.phone || "",
          address: p.address || c.address || "", logoUrl: p.logoUrl || c.logoUrl || "",
        } : p;
      };
      const p2 = link(d.party2), ex = d.extraParties.map(link);
      // Nothing matched — return the same object so this never loops.
      if (p2 === d.party2 && ex.every((p, i) => p === d.extraParties[i])) return d;
      return { ...d, party2: p2, extraParties: ex };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, companies, ctx.kind]);

  // The company parties that still aren't Directory records. Used for the badge on each card and
  // the check before sending.

  // Deleting a custom section throws away whatever was written in it, so it asks first.
  const removeExtraSection = async (idx: number) => {
    const title = draft?.extraSections[idx]?.title?.trim();
    if (!(await confirm({
      title: title ? `Delete “${title}”?` : "Delete this section?",
      message: "The section and everything written in it are removed from this agreement.",
      confirmLabel: "Delete",
    }))) return;
    setDraft((d) => (d ? { ...d, extraSections: d.extraSections.filter((_, j) => j !== idx) } : d));
  };

  const undoArchive = async (ag: ApiAgreement) => {
    try { await setAgreementArchived(ctx, ag._id, false); toast("Agreement restored.", "success"); await load(); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not restore.", "error"); }
  };
  const archive = async (ag: ApiAgreement, next: boolean) => {
    // Archiving asks first (delete/cancel already confirm); restoring is safe and immediate.
    if (next && !(await confirm({ title: "Archive agreement?", message: `"${ag.name || ag.agreementType}" will be moved to the archive. You can restore it anytime from the Archived view.`, confirmLabel: "Archive", danger: false }))) return;
    try {
      patch(await setAgreementArchived(ctx, ag._id, next));
      if (next !== showArchived) setList((p) => p.filter((x) => x._id !== ag._id));
      if (next) toast("Agreement archived.", "success", { action: { label: "Undo", onClick: () => void undoArchive(ag) } });
      else toast("Agreement restored.", "success");
    }
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

  const slug = (s: string) => (s || "").trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const autoName = (type: string): string => {
    const year = new Date().getFullYear();
    const typeCode = (type || "AGREEMENT").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const p2 = abbr(draft?.party2.name || defaults?.party2?.name || "");
    let base: string;
    if (ctx.kind === "general") {
      // CR-P-45 — GT-<2nd party name>-<service type>-<Mon YYYY>.
      const d = draft?.effectiveDate ? new Date(draft.effectiveDate) : new Date();
      const stamp = `${d.toLocaleString("en-US", { month: "short" })}-${d.getFullYear()}`;
      const p2full = slug(draft?.party2.name || defaults?.party2?.name || "") || "NAME";
      base = `GT-${p2full}-${slug(type) || "AGREEMENT"}-${stamp}`;
    } else if (ctx.kind === "user") {
      base = `GT-EMP-${p2 || "NAME"}-${typeCode}-${year}`;
    } else {
      base = `GT-${abbr(defaults?.projectNo || "") || abbr(defaults?.projectName || "") || "PROJ"}-${ENTITY_CODE[ctx.entityType]}-${p2 || "NAME"}-${typeCode}-${year}`;
    }
    // De-duplicate against existing agreements with a serial suffix.
    let name = base, n = 2;
    while (list.some((a) => a.name === name && a._id !== editor?.aid)) name = `${base}-${n++}`;
    return name;
  };

  const loadPickers = () => {
    if (!templates.length) fetchAgreementTemplates().then(setTemplates).catch(() => {});
    if (!signatories.length) fetchSignatories().then(setSignatories).catch(() => {});
    if (!ndaFiles.length) fetchNdaFiles().then(setNdaFiles).catch(() => {});
    if (!termsFiles.length) fetchTermsFiles().then(setTermsFiles).catch(() => {});
  };
  const openCreate = async () => {
    allDoneRef.current = null;
    setDraft({
      name: "", title: "", description: "", remark: "",
      // CR-P (69) — names from the one grouped type list every agreement now uses.
      agreementType: ctx.kind === "user" ? "Employment Agreement" : ctx.kind === "general" ? "Service Agreement" : ctx.entityType === "vendor" ? "Supplier Agreement" : ctx.entityType === "partner" ? "Partnership Agreement" : "Subcontract Agreement",
      // A project's own agreement covers that project from the start (it can be changed).
      templateId: "",
      linkedProjects: ctx.kind === "project" ? [{ id: ctx.projectId, name: defaults?.projectName || "", location: defaults?.projectLocation || "" }] : [],
      effectiveDate: new Date().toISOString().slice(0, 10), startDate: "", endDate: "",
      // CR-P (21) — a new agreement carries only the effective date until start/end are ticked on.
      datesShown: { effective: true, start: false, end: false },
      docStatus: "",
      // A partner agreement defaults to the JV (dual-logo) letterhead; everything else to GT.
      letterhead: ctx.kind === "project" && ctx.entityType === "partner" ? "jv" : "gt",
      // Project agreements extract the JV logo from the project; general agreements start blank
      // (manual upload); user agreements never use a JV letterhead.
      jvLogoUrl: ctx.kind === "project" ? (defaults?.jv?.logoUrl || "") : "",
      jvPartnerId: "", jvPartnerName: ctx.kind === "project" ? (defaults?.jv?.name || "") : "",
      documentMode: "built", uploadFile: null,
      party2: { ...BLANK_PARTY, ...(defaults?.party2 || {}) },
      extraParties: [],
      contextLines: defaults?.contextLines?.map((l) => ({ ...l })) || [],
      sections: { ...BLANK_SECTIONS },
      // CR-P (68) — ONE section to start with. Four pre-made ones ("no need to put multiple
      // sections here because it's going to confuse the people") made a new agreement look like a
      // form to fill in rather than a document to write. Add Section adds more when they are wanted.
      extraSections: [{ title: "Scope / Description", body: "" }],
      sectionAssignees: { ...BLANK_ASSIGNEES },
      company: { signerName: "", signerTitle: "", signerEmail: "", signerPhone: "", signatureUrl: "", stampUrl: "", signedAt: "" },
    });
    baseRef.current = null;  // CR-P (36) — nothing on the server yet to merge against
    savedSnapRef.current = "";
    setEditor({ aid: null });
    loadPickers();
  };
  const openEdit = (ag: ApiAgreement) => {
    allDoneRef.current = null;
    // CR-P (33) — the status rule is applied to the draft as it opens, so the "unchanged" snapshot
    // already holds it and opening an agreement never counts as an unsaved change.
    setDraft(withAutoStatus({
      name: ag.name, title: ag.title || "", description: ag.description || "", agreementType: ag.agreementType, templateId: ag.templateId,
      remark: ag.remark || "",
      linkedProjects: ag.linkedProjects || [],
      effectiveDate: ag.effectiveDate, startDate: ag.startDate, endDate: ag.endDate,
      // CR-P (21) — an agreement saved before this existed has no flags, so each date is ticked on
      // if it actually holds a value. That reproduces exactly what the old document printed.
      datesShown: ag.datesShown
        ? { ...ag.datesShown }
        : { effective: !!ag.effectiveDate, start: !!ag.startDate, end: !!ag.endDate },
      docStatus: (ag.docStatus || "") as DocStatus,
      letterhead: ag.letterhead === "jv" && ctx.kind !== "user" ? "jv" : "gt",
      jvLogoUrl: ag.jvLogoUrl || (ctx.kind === "project" ? (defaults?.jv?.logoUrl || "") : ""),
      jvPartnerId: ag.jvPartnerId || "", jvPartnerName: ag.jvPartnerName || (ctx.kind === "project" ? (defaults?.jv?.name || "") : ""),
      documentMode: ag.documentMode === "uploaded" ? "uploaded" : "built", uploadFile: null,
      party2: { ...BLANK_PARTY, ...(ag.partySnapshot?.party2 || {}) },
      extraParties: (ag.partySnapshot?.extraParties || []).slice(0, MAX_PARTIES - 2).map((p) => ({ ...BLANK_PARTY, ...p })),
      contextLines: (ag.partySnapshot?.contextLines || []).map((l) => ({ ...l })),
      // CR-P-48 / CR-P (69) — every agreement moves any legacy fixed-section content into the
      // editable list (and clears the fixed fields), so every section can be renamed or deleted and
      // project and employee agreements are built exactly like general ones.
      sections: {
        ...BLANK_SECTIONS,
        ndaEnabled: ag.sections?.ndaEnabled || false, ndaMode: ag.sections?.ndaMode || "text", ndaText: ag.sections?.ndaText || "", ndaFile: ag.sections?.ndaFile || null,
        // CR-P (45) — carried through the same way as the NDA when the fixed sections are cleared.
        stdTermsEnabled: ag.sections?.stdTermsEnabled || false, stdTermsMode: ag.sections?.stdTermsMode || "file", stdTermsText: ag.sections?.stdTermsText || "", stdTermsFile: ag.sections?.stdTermsFile || null,
      },
      extraSections: [
        ...(([["scope", "Scope / Description"], ["terms", "Terms & Conditions"], ["paymentConditions", "Payment Conditions"], ["deliveryConditions", "Delivery Conditions"]] as const)
          .filter(([k]) => String(ag.sections?.[k] || "").trim())
          .map(([k, label]) => ({ title: label, body: String(ag.sections?.[k] || ""), status: "" as SectionStatus }))),
        ...(ag.extraSections || []).map((s) => ({ ...s, status: (s.status || "") as SectionStatus })),
      ],
      sectionAssignees: { ...BLANK_ASSIGNEES, ...(ag.sectionAssignees || {}) },
      company: { signerName: "", signerTitle: "", signerEmail: "", signerPhone: "", signatureUrl: "", stampUrl: "", signedAt: "", ...(ag.signatures?.company || {}) },
    }, true));
    baseRef.current = ag;   // CR-P (36) — the live-merge baseline for this editing session
    savedSnapRef.current = "";  // CR-P (48) — filled by the effect below once the draft is in state
    setEditor({ aid: ag._id });
    loadPickers();
  };

  // Resolve a stored logo (uploads path / plain URL / data URI) to something an <img>/PDF can load.
  const logoSrc = (url: string) => (!url ? "" : url.startsWith("uploads") || url.includes("/uploads/") ? attachmentUrl(url.replace(/^\/+/, "")) : url);
  // CR-P (30) — the hand-rolled JV logo uploader lived here. It is gone: a general agreement now
  // picks its JV partner from the Directory and inherits that company's logo, so one company can
  // never end up with a different letterhead on different agreements.

  // CR-P (69) — every agreement uses the one flexible section list, so a template fills that list
  // (its scope, terms, payment and delivery texts become sections) instead of fixed fields. Blank
  // sections, like the empty starter, make way for the template's; anything written stays.
  const applyTemplate = (tid: string) => {
    if (!draft) return;
    const t = templates.find((x) => x._id === tid);
    if (!t) { setDraft({ ...draft, templateId: tid }); return; }
    const fromTemplate = ([["Scope / Description", t.sections.scope], ["Terms & Conditions", t.sections.terms], ["Payment Conditions", t.sections.paymentConditions], ["Delivery Conditions", t.sections.deliveryConditions]] as const)
      .filter(([, body]) => (body || "").trim())
      .map(([title, body]) => ({ title, body: body || "", status: "" as SectionStatus }));
    setDraft({
      ...draft, templateId: tid, agreementType: t.agreementType || draft.agreementType,
      extraSections: [...draft.extraSections.filter((s) => s.body.trim()), ...fromTemplate],
      sections: { ...draft.sections, ndaText: t.sections.ndaText || draft.sections.ndaText },
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
    title: draft!.title, description: draft!.description, remark: draft!.remark,
    agreementType: draft!.agreementType, templateId: draft!.templateId,
    linkedProjects: draft!.linkedProjects,
    effectiveDate: draft!.effectiveDate, startDate: draft!.startDate, endDate: draft!.endDate,
    datesShown: draft!.datesShown,
    docStatus: draft!.docStatus,
    letterhead: draft!.letterhead, jvLogoUrl: draft!.jvLogoUrl,
    jvPartnerId: draft!.jvPartnerId, jvPartnerName: draft!.jvPartnerName,
    documentMode: draft!.documentMode,
    ...(isDraftStatus ? { partySnapshot: {
      party1: party1(), party2: draft!.party2,
      // CR-P (19) — blank extra slots are dropped, so an unused "Add party" row prints nothing.
      extraParties: draft!.extraParties.filter((p) => p.name.trim()),
      // CR-P (27) — linked projects used to be flattened into these info lines, which printed
      // them AFTER the parties. They are their own block before the parties now, built straight
      // from linkedProjects (which carries the location), so nothing is injected here any more.
      contextLines: draft!.contextLines.filter((l) => l.label || l.value),
    } } : {}),
    sections: draft!.sections,
    extraSections: draft!.extraSections.filter((s) => s.title || s.body),
    sectionAssignees: draft!.sectionAssignees,
    companySignature: draft!.company,
  });

  // Returns whether the save actually went through, so a caller that wants to close afterwards
  // (CR-P (48)) never closes over a failure and throws the work away.
  // CR-P (20) — the "not in the Directory" warning moved to Share (directoryCheck), where the party
  // details actually leave us; saving is never blocked by it.
  const saveDraft = async (): Promise<boolean> => {
    if (!draft || !editor) return false;
    setSaving(true);
    try {
      let ag: ApiAgreement;
      if (editor.aid === null) {
        // ONE call — the signer is accepted at creation, so a later failure can never leave a
        // half-made record (and a retry can't create a duplicate).
        ag = await createAgreement(ctx, draftBody());
        setList((p) => [ag, ...p]);
        baseRef.current = ag;
        savedSnapRef.current = snapOf(draft);
        setEditor({ aid: ag._id }); // any retry from here updates instead of re-creating
      } else {
        const cur = list.find((a) => a._id === editor.aid);
        ag = await updateAgreement(ctx, editor.aid, draftBody((cur?.status || "Draft") === "Draft"));
        patch(ag);
        baseRef.current = ag;
        savedSnapRef.current = snapOf(draft);
      }
      // Uploaded-document agreements: attach the file — it becomes the document itself.
      if (draft.documentMode === "uploaded" && draft.uploadFile) {
        ag = await uploadAgreementDocument(ctx, ag._id, draft.uploadFile);
        patch(ag);
      }
      // Stay open so you can keep editing, preview, or attach files after saving. (CR-P (57) — the
      // old "save and send" path is gone; an agreement goes out through Share.)
      toast("Agreement saved.", "success");
      return true;
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save the agreement.", "error"); return false; }
    finally { setSaving(false); }
  };

  // CR-B-14b — silent autosave while the editor is open (existing, unsigned agreements only — a
  // brand-new one is created on the first manual Save, then autosaves from there).
  // CR-P (36) — the interval is 20s rather than 45s: it is what decides how quickly a colleague
  // watching the same agreement sees your edits, so it doubles as the "live" in live changes.
  const agSave = useSaveStatus();
  const autoSaveRef = useRef<() => void>(() => {});
  autoSaveRef.current = () => {
    if (!draft || !editor?.aid || saving) return;
    const cur = list.find((a) => a._id === editor.aid);
    if (cur?.status === "Signed") return; // locked once signed
    void agSave.track(updateAgreement(ctx, editor.aid, draftBody((cur?.status || "Draft") === "Draft")))
      .then((ag) => { patch(ag); baseRef.current = ag; savedSnapRef.current = snapOf(draft); })   // our save becomes the new baseline
      .catch(() => {});
  };
  useEffect(() => {
    if (!editor?.aid) return;
    const t = setInterval(() => autoSaveRef.current(), 20000);
    return () => clearInterval(t);
  }, [editor?.aid]);

  // ── CR-P (36) — live changes ────────────────────────────────────────────────
  // Typing appeared to sync before only because the other person opened the agreement after it
  // had been saved. Nothing was actually pushed, so a deletion or a colour change never showed up.
  //
  // This is not character-by-character co-editing (that needs OT/CRDT). It is a safe merge: every
  // field we hold a BASELINE for is compared three ways — the server copy, that baseline, and what
  // is on screen. A field the other person changed and we have not touched is adopted, deletions
  // and formatting included. A field we have both changed is left alone and reported, so neither
  // side's work is silently thrown away.
  const baseRef = useRef<ApiAgreement | null>(null);
  // CR-P (48) — what the editor looked like when it was opened or last saved. Comparing against it
  // is how we know whether closing would lose anything. `uploadFile` is excluded: a File object
  // never serialises stably and the pending upload is handled by Save itself.
  const savedSnapRef = useRef<string>("");
  const snapOf = (d: Draft | null) => (d ? JSON.stringify({ ...d, uploadFile: null }) : "");
  const isDirty = () => !!draft && snapOf(draft) !== savedSnapRef.current;
  const [liveNote, setLiveNote] = useState<{ changed: number; blocked: number } | null>(null);
  const differs = (a: unknown, b: unknown) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);

  const mergeFromServer = (fresh: ApiAgreement) => {
    const base = baseRef.current;
    if (!base) { baseRef.current = fresh; return; }
    setDraft((d) => {
      if (!d) return d;
      const next: Draft = { ...d };
      let changed = 0, blocked = 0;
      const adopt = <K extends keyof Draft>(key: K, serverVal: Draft[K], baseVal: unknown) => {
        if (!differs(serverVal, baseVal)) return;         // the other side didn't touch it
        if (differs(d[key], baseVal)) { blocked++; return; } // we changed it too — keep ours
        next[key] = serverVal; changed++;
      };
      adopt("name", fresh.name, base.name);
      adopt("title", fresh.title || "", base.title || "");
      adopt("description", fresh.description || "", base.description || "");
      adopt("remark", fresh.remark || "", base.remark || "");
      adopt("agreementType", fresh.agreementType, base.agreementType);
      adopt("docStatus", (fresh.docStatus || "") as DocStatus, base.docStatus || "");
      adopt("effectiveDate", fresh.effectiveDate, base.effectiveDate);
      adopt("startDate", fresh.startDate, base.startDate);
      adopt("endDate", fresh.endDate, base.endDate);
      adopt("letterhead", fresh.letterhead === "jv" ? "jv" : "gt", base.letterhead === "jv" ? "jv" : "gt");
      adopt("jvLogoUrl", fresh.jvLogoUrl || "", base.jvLogoUrl || "");
      adopt("jvPartnerId", fresh.jvPartnerId || "", base.jvPartnerId || "");
      adopt("jvPartnerName", fresh.jvPartnerName || "", base.jvPartnerName || "");
      if (fresh.datesShown && base.datesShown) adopt("datesShown", { ...fresh.datesShown }, base.datesShown);
      adopt("linkedProjects", fresh.linkedProjects || [], base.linkedProjects || []);
      adopt("sections", { ...BLANK_SECTIONS, ...(fresh.sections || {}) }, { ...BLANK_SECTIONS, ...(base.sections || {}) });
      // The whole section list moves as one unit. There is no stable id per section, so merging
      // them individually would guess wrong the moment someone inserts or reorders one; taking the
      // list wholesale (only when we have not touched it) is always right.
      adopt(
        "extraSections",
        (fresh.extraSections || []).map((s) => ({ ...s, status: (s.status || "") as SectionStatus })),
        (base.extraSections || []).map((s) => ({ ...s, status: (s.status || "") as SectionStatus })),
      );
      baseRef.current = fresh;
      // Adopting their change is not our unsaved work, so it must not make the editor look dirty.
      if (changed) savedSnapRef.current = snapOf(next);
      if (changed || blocked) setLiveNote({ changed, blocked });
      return changed ? next : d;
    });
  };

  // Skipped while a save is in flight so a merge can never race our own write.
  const savingRef = useRef(false);
  savingRef.current = saving;

  // Poll the agreement while its editor is open.
  useEffect(() => {
    const aid = editor?.aid;
    if (!aid) return;
    let alive = true;
    const tick = async () => {
      if (savingRef.current) return;
      try {
        const fresh = (await fetchAgreements(ctx, showArchived)).find((a) => a._id === aid);
        if (alive && fresh) { patch(fresh); mergeFromServer(fresh); }
      } catch { /* offline or a blip — try again next tick */ }
    };
    const id = setInterval(tick, 10000);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.aid, showArchived]);

  // CR-P (48) — the editor has just opened and the draft is in state: record what "unchanged"
  // looks like, so everything typed from here counts as unsaved work.
  useEffect(() => {
    if (editor && draft && !savedSnapRef.current) savedSnapRef.current = snapOf(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, draft]);

  // Closing the editor when there is unsaved work asks first, and offers to save it (CR-P (48)).
  const closeEditor = async () => {
    // A signed agreement is locked: nothing in it can be saved, so it just closes.
    if (list.find((a) => a._id === editor?.aid)?.status === "Signed") { setEditor(null); setDraft(null); savedSnapRef.current = ""; return; }
    // CR-P (48) — "Are you sure you want to close, you have not saved", offering Save or Cancel.
    // The X in the header and Cancel in the footer both come here, so it is always one question.
    if (isDirty() && !(await confirm({
      title: "Are you sure you want to close?",
      message: "You have not saved. Save your changes and close, or cancel to keep editing.",
      confirmLabel: "Save",
      cancelLabel: "Cancel",
      danger: false,
    }))) return;
    // A failed save keeps the editor open so nothing is lost; the toast explains why.
    if (isDirty() && !(await saveDraft())) return;
    setEditor(null); setDraft(null); savedSnapRef.current = "";
  };

  // Clear the "changes arrived" note a few seconds after it appears.
  useEffect(() => {
    if (!liveNote) return;
    const t = setTimeout(() => setLiveNote(null), 6000);
    return () => clearTimeout(t);
  }, [liveNote]);

  // Every counterparty on an agreement, as share targets. Party 1 is us, so it is not offered.
  const shareTargets = (ag: ApiAgreement): SharePartyInput[] =>
    [ag.partySnapshot?.party2, ...(ag.partySnapshot?.extraParties || [])]
      .filter((p) => (p?.name || "").trim())
      .map((p) => ({ companyId: p!.companyId || "", name: p!.name, email: p!.email || "" }));
  const partyKey = (p: SharePartyInput) => p.companyId || p.name.toLowerCase();

  const openShare = async (ag: ApiAgreement) => {
    if (!(await directoryCheck(ag))) return;
    const targets = shareTargets(ag);
    const already = new Set((ag.visibleTo || []).map((v) => v.companyId || v.name.toLowerCase()));
    // Pre-tick whoever already has it, so re-sending a revision is one click.
    setSharePicked(Object.fromEntries(targets.map((t) => [partyKey(t), already.has(partyKey(t))])));
    setSharePurpose("review");
    setShareNote("");
    setShareFor(ag);
  };
  const doShare = async () => {
    if (!shareFor) return;
    const parties = shareTargets(shareFor).filter((t) => sharePicked[partyKey(t)]);
    if (!parties.length) { toast("Choose at least one party.", "info"); return; }
    setBusy(shareFor._id);
    try {
      const next = await shareAgreement(ctx, shareFor._id, { parties, purpose: sharePurpose, note: shareNote.trim() });
      patch(next);
      if (editor?.aid === next._id) baseRef.current = next;
      toast(`Shared with ${parties.map((p) => p.name).join(", ")}.`, "success");
      setShareFor(null);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not share.", "error"); }
    finally { setBusy(null); }
  };

  // CR-P (20) — the Directory check that used to guard Send now guards Share: sharing freezes the
  // party details in the recipient's hands, so an unlinked party is the last moment to catch it.
  const directoryCheck = async (ag: ApiAgreement): Promise<boolean> => {
    const loose = ctx.kind === "user" ? [] :
      [ag.partySnapshot?.party2, ...(ag.partySnapshot?.extraParties || [])]
        .map((p, i) => ({ slot: i + 2, name: (p?.name || "").trim(), linked: !!p?.companyId }))
        .filter((x) => x.name && !x.linked);
    if (!loose.length) return true;
    return confirm({
      title: loose.length === 1 ? "This party is not in the Directory" : "Some parties are not in the Directory",
      message: `${loose.map((l) => `Party ${l.slot} (${l.name})`).join(", ")} ${loose.length === 1 ? "is" : "are"} not linked to a Directory company. Open the agreement and add ${loose.length === 1 ? "it" : "them"} to the Directory to keep one record per company.`,
      confirmLabel: "Share anyway",
      danger: false,
    });
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
    // CR-P (55) — delete does NOT destroy the record: it moves to the recycle bin, and saying so
    // is the difference between a scary dialog and an accurate one.
    if (!(await confirm({
      title: "Delete agreement?",
      message: `"${ag.agreementNo || ag.name || ag.agreementType}" moves to the recycle bin, along with its files. You can restore it from there.`,
      confirmLabel: "Delete",
    }))) return;
    try { await deleteAgreement(ctx, ag._id); setList((p) => p.filter((x) => x._id !== ag._id)); }
    catch (err) { toast(err instanceof Error ? err.message : "Delete failed.", "error"); }
  };
  // CR-P-45 — general "uploaded" agreements merge a generated info cover page with the uploaded
  // document (fetched from the server, or the freshly chosen local file in the editor).
  const uploadedMergedBlob = async (ag: ApiAgreement, localFile?: File | null): Promise<Blob> => {
    let bytes: Uint8Array; let name: string;
    if (localFile) { bytes = new Uint8Array(await localFile.arrayBuffer()); name = localFile.name; }
    else {
      const res = await fetch(attachmentUrl((ag.uploadedDocument?.filePath || "").replace(/^\/+/, "")));
      if (!res.ok) throw new Error("Could not load the uploaded file.");
      bytes = new Uint8Array(await res.arrayBuffer());
      name = ag.uploadedDocument?.name || "document.pdf";
    }
    return buildUploadedAgreementPdf(ag, bytes, name);
  };

  const download = async (ag: ApiAgreement) => {
    try {
      if (ag.signedDocument?.filePath) { window.open(attachmentUrl(ag.signedDocument.filePath), "_blank"); return; }
      if (ag.documentMode === "uploaded") {
        // CR-P (69) — every uploaded agreement gets our cover page (parties, dates) merged in front.
        downloadBlob(await uploadedMergedBlob(ag), `${(ag.name || "agreement").replace(/[^\w-]+/g, "_")}.pdf`);
        return;
      }
      downloadBlob(await buildAgreementPdf(ag), `${(ag.name || "agreement").replace(/[^\w-]+/g, "_")}.pdf`);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not build the PDF.", "error"); }
  };
  // CR-P (56) — a built agreement has no stored file until it is signed, so the share menu had
  // nothing to link to (drafts shared a dead link and the email failed). The current PDF is made
  // on demand and stored as the agreement's share copy; the link points at that.
  const shareCopyUrl = async (ag: ApiAgreement): Promise<string> => {
    const blob = ag.documentMode === "uploaded" ? await uploadedMergedBlob(ag) : await buildAgreementPdf(ag);
    const name = `${(ag.agreementNo || ag.name || "agreement").replace(/[^\w-]+/g, "_")}.pdf`;
    const next = await uploadAgreementShareCopy(ctx, ag._id, new File([blob], name, { type: "application/pdf" }));
    patch(next);
    return attachmentUrl((next.shareCopy?.filePath || "").replace(/^\/+/, ""));
  };
  // The file a row shares as-is: the signed copy, or a non-general uploaded document. Anything
  // else (a built agreement, or a general upload that gets our cover page) is made on demand.
  const storedShareFile = (ag: ApiAgreement) => ag.signedDocument?.filePath || "";

  // CR-P (52) — uploading again REPLACES the signed copy; the previous one is kept in history.
  const uploadSigned = async (ag: ApiAgreement, file: File) => {
    const replacing = !!ag.signedDocument?.filePath;
    setBusy(ag._id);
    try {
      const next = await uploadSignedAgreement(ctx, ag._id, file);
      patch(next);
      if (editor?.aid === ag._id) {
        baseRef.current = next;
        // CR-P (51) — the upload itself makes it "Completed and signed". The open editor shows it,
        // and as a signed agreement is locked there is nothing left to save.
        setDraft((d) => {
          if (!d) return d;
          const nd = { ...d, docStatus: (next.docStatus || "CompletedSigned") as DocStatus };
          savedSnapRef.current = snapOf(nd);
          return nd;
        });
      }
      toast(replacing ? "Signed copy replaced — the previous one is kept in its history." : "Signed copy uploaded — agreement marked Signed.", "success");
    }
    catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
    finally { setBusy(null); }
  };

  // ── Recipient signing ───────────────────────────────────────────────────────
  const openSign = async (ag: ApiAgreement) => {
    setSignFor(ag);
    try { const me = await fetchMe(); setSignName(me.name || ""); setMySignatureUrl((me as { signatureUrl?: string }).signatureUrl || ""); }
    catch { setSignName(""); setMySignatureUrl(""); }
    // CR-P (16) — offer every named signature on the account; the default is preselected above.
    try {
      const sigs = await fetchMySignatures();
      setMySignatures(sigs);
      const def = sigs.find((s) => s.isDefault) || sigs[0];
      if (def) { setMySignatureUrl(def.url); if (def.label) setSignName(def.label); }
    } catch { setMySignatures([]); }
  };
  const doSign = async () => {
    if (!signFor) return;
    // CR-P (64) — "just click on the screen and it asks you for approval. Are you sure you want to
    // sign it?" Signing is binding, so it is never one click away.
    if (!(await confirm({
      title: "Are you sure you want to sign it?",
      message: `Signing "${signFor.agreementNo || signFor.name || signFor.agreementType}" applies your signature to the document and cannot be undone. GreenTech receives the signed copy immediately.`,
      confirmLabel: "Yes, sign it",
      danger: false,
    }))) return;
    setBusy(signFor._id);
    try {
      let ag = await signAgreement(ctx, signFor._id, { signerName: signName, signatureUrl: mySignatureUrl });
      // CR-P (64) — with several parties, the agreement is only Signed once the last one signs.
      const complete = ag.status === "Signed";
      // Freeze the fully-signed PDF as the immutable snapshot (best-effort). Uploaded-document
      // agreements skip this — the uploaded file already IS the document. A partly signed one is
      // not frozen: it would show as "the signed copy" while signatures are still missing.
      if (complete && ag.documentMode !== "uploaded") {
        try {
          const blob = await buildAgreementPdf(ag);
          ag = await freezeAgreementPdf(ctx, ag._id, new File([blob], `${(ag.name || "agreement").replace(/[^\w-]+/g, "_")}_signed.pdf`, { type: "application/pdf" }));
        } catch { /* snapshot is best-effort */ }
      }
      patch(ag); setSignFor(null);
      toast(complete ? "Agreement signed." : "Signed. GreenTech has been notified; the agreement is complete once every party has signed.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not sign.", "error"); }
    finally { setBusy(null); }
  };
  // CR-P (65) — rejecting REQUIRES a reason: "then they must give a reason". Without one the
  // agreement just stalls and nobody knows what to change. GreenTech is notified with the reason.
  const doReject = async (ag: ApiAgreement) => {
    const note = await prompt({ title: "Reject agreement", label: "Reason (required — sent to GreenTech)", placeholder: "e.g. payment terms need revision", confirmLabel: "Reject" });
    if (note === null) return;
    if (!note.trim()) { toast("A reason is required so GreenTech knows what to change.", "info"); return; }
    setBusy(ag._id);
    try { patch(await rejectAgreement(ctx, ag._id, note.trim())); toast("Agreement rejected — GreenTech has been notified.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not reject.", "error"); }
    finally { setBusy(null); }
  };

  // CR-P (64) — signable when the caller was set up as a signer for this surface, OR when the
  // agreement was shared with the logged-in party. The server enforces the same rule.
  // A party only ever receives its OWN entries in visibleTo (the server trims the rest), so for a
  // party any entry at all means "shared with me", whether it matched on email or on company.
  const sharedWithMe = (ag: ApiAgreement) => {
    if (!canManage && (ag.visibleTo || []).length > 0) return true;
    const mine = (getAuthUser()?.email || "").trim().toLowerCase();
    return !!mine && (ag.visibleTo || []).some((v) => (v.email || "").trim().toLowerCase() === mine);
  };
  // `youSigned` comes from the server: a party that has signed waits for the others, it does not
  // get the Sign button again.
  const signable = (ag: ApiAgreement) => (canSign || sharedWithMe(ag)) && !ag.youSigned && ["Sent", "Viewed", "PendingSignature"].includes(ag.status);

  // Shared history list — used by both the card list and the general-agreements table row.
  const historyList = (ag: ApiAgreement) => (
    <>
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
    </>
  );

  // Shared action set — reused by the card list and the general-agreements table.
  const actionButtons = (ag: ApiAgreement) => (
    <div className="flex items-center gap-1 justify-end flex-nowrap whitespace-nowrap">
      {signable(ag) && (
        <>
          <button onClick={() => openSign(ag)} disabled={busy === ag._id} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 disabled:opacity-50"><PenLine size={11} /> Sign</button>
          <button onClick={() => doReject(ag)} disabled={busy === ag._id} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100 disabled:opacity-50">Reject</button>
        </>
      )}
      {/* CR-P (57)/(59) — "Send, then what?" was confusing and vanished once used. It is now Share:
          you choose WHICH parties get it and why, and it stays available so a revised agreement can
          go out again. */}
      {canManage && ag.status !== "Cancelled" && (
        <button onClick={() => void openShare(ag)} disabled={busy === ag._id} title="Share this agreement with its parties" className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-white text-[10px] font-bold hover:bg-primary/80 disabled:opacity-50"><Send size={11} /> Share</button>
      )}
      {/* CR-P (54) — Manage is always available. A signed agreement opens read-only for its terms,
          but you still need to reach it to see the document, its history and its signed copy. */}
      {canManage && (
        <button onClick={() => openEdit(ag)} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200">Manage</button>
      )}
      <button onClick={() => {
        if (ag.documentMode === "uploaded") {
          // CR-P (69) — every uploaded agreement previews as our cover page + the merged document.
          setPreview({ title: ag.title || ag.agreementType || "Agreement", fileName: `${(ag.name || "agreement").replace(/[^\w-]+/g, "_")}.pdf`, build: () => uploadedMergedBlob(ag) });
          return;
        }
        // CR-P (24) — the preview is titled like the document, not like the file on disk.
        setPreview({ title: [ag.agreementNo, ag.title || agreementHeading(ag)].filter(Boolean).join(" · "), fileName: `${(ag.name || "agreement").replace(/[^\w-]+/g, "_")}.pdf`, build: () => buildAgreementPdf(ag) });
      }} className="p-1.5 rounded text-slate-400 hover:text-primary" title="Preview"><Eye size={14} /></button>
      <button onClick={() => download(ag)} className="p-1.5 rounded text-slate-400 hover:text-primary" title={ag.signedDocument ? "Open the signed copy" : "Download PDF"}><Download size={14} /></button>
      <button onClick={() => {
        const secs = (ag.extraSections || []).filter((s) => !(s as { hidden?: boolean }).hidden);
        // CR-P (24) — the Word document is headed the way the PDF is (type, title, number).
        // The file name only names the downloaded file, it is never content.
        const heading = agreementHeading(ag);
        // CR-P (19)/(25) — the Word copy follows the PDF's running order and names EVERY party (it
        // printed no parties at all): type, title, number, description, projects, parties, sections.
        const partiesHtml = [ag.partySnapshot?.party1, ag.partySnapshot?.party2, ...(ag.partySnapshot?.extraParties || [])]
          .filter((p): p is ApiAgreementParty => !!p && !!(p.name || "").trim())
          .map((p, k) => `<p><strong>Party ${k + 1}:</strong> ${escapeHtml(p.name)}${[p.address, p.email, p.phone].filter(Boolean).map((x) => `<br/>${escapeHtml(String(x))}`).join("")}</p>`)
          .join("");
        const projectsHtml = (ag.linkedProjects || []).filter((p) => (p.name || "").trim())
          .map((p) => `<p><strong>Project:</strong> ${escapeHtml(p.name)}${p.location ? `, ${escapeHtml(p.location)}` : ""}</p>`).join("");
        const body = `<h1>${escapeHtml(heading)}</h1>`
          + (ag.title ? `<h2>${escapeHtml(ag.title)}</h2>` : "")
          + (ag.agreementNo ? `<p><em>Agreement No: ${escapeHtml(ag.agreementNo)}</em></p>` : "")
          + (ag.description ? `<p>${escapeHtml(ag.description)}</p>` : "")
          + projectsHtml
          + partiesHtml
          + secs.map((s) => `<h2>${escapeHtml(s.title || "Section")}</h2>${s.body || ""}`).join("")
          + (ag.sections?.ndaEnabled && ag.sections.ndaText ? `<h2>Non-Disclosure Agreement</h2>${ag.sections.ndaText}` : "")
          + (ag.signatures?.company?.signerName ? `<p style="margin-top:24pt">_________________________<br/>${escapeHtml(ag.signatures.company.signerName)}${ag.signatures.company.signerTitle ? `, ${escapeHtml(ag.signatures.company.signerTitle)}` : ""}</p>` : "");
        downloadHtmlAsWord(heading, body, `${(ag.name || "agreement").replace(/[^\w-]+/g, "_")}`);
      }} className="p-1.5 rounded text-slate-400 hover:text-primary" title="Export to Word"><FileText size={14} /></button>
      {/* CR-P (56) — Share on EVERY row. It used to appear only once a file existed on the server,
          so drafts had no share at all: "even if it's draft, we should be able to share them." */}
      {canManage && (
        <ShareMenu
          fileName={`${ag.agreementNo || ag.name || "agreement"}.pdf`}
          fileUrl={storedShareFile(ag) ? attachmentUrl(storedShareFile(ag).replace(/^\/+/, "")) : ""}
          prepareFile={storedShareFile(ag) ? undefined : () => shareCopyUrl(ag)}
          size={14}
        />
      )}
      {/* CR-P (53) — "upload the counter copy, you need to remove it. We don't need it because it's
          already inside." The signed copy is handled in the Signed copy box inside Manage. */}
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
  );

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
        // CR-P-45 / CR-P (69) — every agreement list is the same sortable, numbered table (project
        // and employee agreements used to be a different card list).
        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
          <table className="w-full min-w-[1180px] text-left table-auto">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-10">#</th>
                {([["no", "Agreement no"], ["title", "Title"], ["party", "Parties"], ["projects", "Project(s)"], ["type", "Type"], ["status", "Status"], ["modified", "Last modified"]] as const).map(([k, l]) => (
                  <th key={k} className="px-3 py-2.5">
                    <button onClick={() => genToggle(k)} className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${genSort.key === k ? "text-slate-700" : "text-slate-400 hover:text-slate-600"}`} title={`Sort by ${l}`}>{l} {genSortIcon(k)}</button>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visible to</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedGeneral.map((ag, i) => {
                const meta = STATUS_META[ag.status] || STATUS_META.Draft;
                const hlId = `ag-${ag._id}`;
                return (
                  <Fragment key={ag._id}>
                    <tr id={hlId} data-hl={hlId} className={`hover:bg-slate-50/40 ${flashId === hlId ? "hl-flash" : ""}`}>
                      <td className="px-3 py-2.5 text-[11px] font-bold text-slate-400 tabular-nums align-top">{i + 1}</td>
                      {/* CR-P (23) — the agreement's own reference, beside the row number. */}
                      <td className="px-3 py-2.5 text-xs font-bold text-slate-700 tabular-nums whitespace-nowrap align-top">{ag.agreementNo || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-xs font-bold text-slate-800 align-top min-w-[12rem]">
                        {ag.title || <span className="text-slate-300">—</span>}
                        {/* CR-P (60) — the internal remark, shown to our own team only. */}
                        {canManage && ag.remark && <span className="block mt-0.5 text-[10px] font-medium text-slate-400 truncate max-w-[16rem]" title={ag.remark}>{ag.remark}</span>}
                      </td>
                      {/* CR-P (19) — every counterparty, not just the second one. */}
                      <td className="px-3 py-2.5 align-top">
                        {partyNames(ag).length === 0 ? <span className="text-slate-300 text-xs">—</span> : (
                          <div className="flex flex-wrap gap-1 max-w-[18rem]">
                            {partyNames(ag).map((n, k) => (
                              <span key={k} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">{n}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {(ag.linkedProjects || []).length === 0 ? <span className="text-slate-300 text-xs">—</span> : (
                          <div className="flex flex-wrap gap-1 max-w-[18rem]">
                            {ag.linkedProjects!.map((p) => (
                              <span key={p.id} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">{p.name}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap align-top">{ag.agreementType || "—"}</td>
                      {/* CR-P (50) — the document's own status, set from inside the agreement.
                          The send lifecycle (Sent / Signed) rides along underneath as a hint. */}
                      <td className="px-3 py-2.5 align-top">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${docStatusMeta(ag.docStatus).cls}`}>{docStatusMeta(ag.docStatus).label}</span>
                        {ag.status && ag.status !== "Draft" && (
                          <span className="block mt-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-wide">{meta.label}</span>
                        )}
                      </td>
                      {/* CR-P (49) — when this agreement was last touched. */}
                      <td className="px-3 py-2.5 text-[11px] text-slate-500 whitespace-nowrap align-top tabular-nums">
                        {ag.updatedAt ? new Date(ag.updatedAt).toLocaleDateString() : <span className="text-slate-300">—</span>}
                      </td>
                      {/* CR-P (63) — "instead of this marker and description, you can just put
                          visible to... if former name is not here it means it's not visible to them." */}
                      <td className="px-3 py-2.5 align-top">
                        {(ag.visibleTo || []).length === 0 ? (
                          <span className="text-[10px] font-bold text-slate-400">Internal only</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-[16rem]">
                            {(ag.visibleTo || []).map((v, k) => (
                              <span key={k} className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold">{v.name}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">{actionButtons(ag)}</td>
                    </tr>
                    {historyFor === ag._id && (
                      <tr className="bg-slate-50/40"><td colSpan={10} className="px-4 pb-3">{historyList(ag)}</td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CR-PR-09 / CR-P (19) — party picker. One company per slot: choosing replaces whatever
          was in that slot, and a company already used by another party is marked so. */}
      {partyPicker !== null && draft && (() => {
        const q = partySearch.trim().toLowerCase();
        const list = companies.filter((c) => !q || `${c.name} ${c.category} ${c.email || ""}`.toLowerCase().includes(q));
        const usedElsewhere = new Set(
          [2, ...draft.extraParties.map((_, i) => i + 3)]
            .filter((s) => s !== partyPicker)
            .map((s) => partyAt(draft, s).companyId)
            .filter(Boolean)
        );
        return (
          <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">Choose party {partyPicker}</h3>
                <button onClick={() => setPartyPicker(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
              </div>
              <div className="p-4 space-y-3">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input value={partySearch} onChange={(e) => setPartySearch(e.target.value)} placeholder="Search the Directory…" className={`${inp} pl-9`} />
                </div>
                {companies.length === 0 && <p className="text-sm text-slate-400 italic">No companies in the Directory yet — add one with “New company”.</p>}
                <div className="max-h-80 overflow-y-auto space-y-1">
                  {list.map((c) => {
                    const on = partyAt(draft, partyPicker).companyId === c._id;
                    const used = usedElsewhere.has(c._id);
                    return (
                      <button key={c._id} onClick={() => pickParty(c)} className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left ${on ? "border-primary bg-primary/5" : "border-slate-100 hover:bg-slate-50"}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{c.name}{used && <span className="ml-1.5 text-[9px] font-bold text-amber-600 uppercase tracking-wide">already a party</span>}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide">{COMPANY_CATEGORIES.find((x) => x.v === c.category)?.label || c.category}{c.email ? ` · ${c.email}` : ""}</p>
                        </div>
                        {on && <CheckCircle2 size={16} className="text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-between items-center px-5 py-3 border-t border-slate-100">
                <button onClick={() => { const s = partyPicker; setPartyPicker(null); setNewPartyOpen(s); }} className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"><Plus size={12} /> New company</button>
                <button onClick={() => setPartyPicker(null)} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-primary">Done</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* The Directory's own form, opened over the agreement editor — saving picks the company. */}
      {newPartyOpen !== null && draft && (
        <CompanyEditorModal
          // CR-P (20) — if the slot already holds a party that isn't a Directory record (typed into
          // the project long ago), its details seed the form so it is added, not retyped.
          initial={{
            category: ctx.kind === "project" && ctx.entityType ? (ctx.entityType as ApiCompany["category"]) : "vendor",
            ...(() => {
              const p = partyAt(draft, newPartyOpen);
              if (!p.name.trim() || p.companyId) return {};
              return {
                name: p.name, email: p.email || "", phone: p.phone || "", address: p.address || "",
                ...(p.contactName ? { contactPersons: [{ name: p.contactName, role: "", email: p.email || "", phone: p.phone || "" }] } : {}),
              };
            })(),
          }}
          onSaved={(c) => {
            setCompanies((p) => (p.some((x) => x._id === c._id) ? p.map((x) => (x._id === c._id ? c : x)) : [c, ...p]));
            // CR-P (20) — the new company is saved into the Directory, then dropped into the slot
            // it was created for, so nothing is ever typed outside the Directory.
            pickParty(c, newPartyOpen);
            setNewPartyOpen(null);
          }}
          onClose={() => setNewPartyOpen(null)}
        />
      )}

      {/* CR-P (58) — the share dialog. "When you click send it should ask you who do you want to
          send to... it should give you a list of parties involved in here." */}
      {shareFor && (() => {
        const targets = shareTargets(shareFor);
        const log = shareFor.shares || [];
        return (
          <div className="fixed inset-0 z-[85] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-12" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">Share agreement</p>
                  <p className="text-[10px] text-slate-400 truncate">{[shareFor.agreementNo, shareFor.title || shareFor.agreementType].filter(Boolean).join(" · ")}</p>
                </div>
                <button onClick={() => setShareFor(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Who should receive it?</p>
                  {targets.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No parties on this agreement yet. Add a party first.</p>
                  ) : targets.map((t) => {
                    const k = partyKey(t);
                    const has = (shareFor.visibleTo || []).some((v) => (v.companyId || v.name.toLowerCase()) === k);
                    return (
                      <label key={k} className="flex items-start gap-2 px-3 py-2 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer mb-1">
                        <input type="checkbox" checked={!!sharePicked[k]} onChange={(e) => setSharePicked((m) => ({ ...m, [k]: e.target.checked }))} className="mt-0.5 w-3.5 h-3.5 accent-primary" />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-slate-800 truncate">{t.name}{has && <span className="ml-1.5 text-[9px] font-bold text-emerald-600 uppercase tracking-wide">already has it</span>}</span>
                          <span className="block text-[10px] text-slate-400 truncate">{t.email || "No email on file — they will not be notified"}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">What for?</p>
                  <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[11px] font-bold">
                    {([["review", "For review"], ["signature", "For signature"]] as const).map(([v, l]) => (
                      <button key={v} onClick={() => setSharePurpose(v)} className={`px-3 py-1.5 ${sharePurpose === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{l}</button>
                    ))}
                  </div>
                </div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Note (optional)
                  <textarea rows={2} className={`${inp} mt-1`} value={shareNote} onChange={(e) => setShareNote(e.target.value)} placeholder="e.g. please review clause 4 before signing" />
                </label>
                {log.length > 0 && (
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Already sent</p>
                    {log.slice().reverse().slice(0, 6).map((h, k) => (
                      <p key={k} className="text-[10px] text-slate-500">
                        <span className="font-bold text-slate-600">{h.name}</span> — {h.purpose === "signature" ? "for signature" : "for review"} on {h.sentAt ? new Date(h.sentAt).toLocaleDateString() : ""}{h.sentByName ? ` by ${h.sentByName}` : ""}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
                <button onClick={() => setShareFor(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold">Cancel</button>
                <button onClick={() => void doShare()} disabled={busy === shareFor._id} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-primary disabled:opacity-50 inline-flex items-center gap-1.5">
                  {busy === shareFor._id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Share
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {dialogs}
      {preview && <PdfPreviewModal title={preview.title} fileName={preview.fileName} build={preview.build} onClose={() => setPreview(null)} />}

      {/* Company-document picker — serves the NDA and the standard terms (CR-P (45)). */}
      {filePickerFor && draft && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-16" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">{filePickerFor === "nda" ? "Choose an NDA file" : "Choose a standard terms file"}</p>
              <button onClick={() => setFilePickerFor(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5">
              {(filePickerFor === "nda" ? ndaFiles : termsFiles).length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-6">No files yet. An admin uploads them in <span className="font-bold">Documents → Company Documents → {filePickerFor === "nda" ? "NDA Files" : "Terms & Conditions"}</span>.</p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {(filePickerFor === "nda" ? ndaFiles : termsFiles).map((f) => (
                    <button key={f._id} onClick={() => { const picked = { name: f.name, url: companyFileUrl(f) }; setDraft({ ...draft, sections: { ...draft.sections, ...(filePickerFor === "nda" ? { ndaFile: picked } : { stdTermsFile: picked }) } }); setFilePickerFor(null); }} className="w-full flex items-center gap-2 p-2.5 rounded-xl hover:bg-slate-50 text-left border border-transparent hover:border-slate-100">
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
                {/* CR-P (16) — pick which of the stored signatures goes on the document. */}
                {mySignatures.length > 1 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {mySignatures.map((s) => (
                      <button key={s.id} type="button" onClick={() => { setMySignatureUrl(s.url); if (s.label) setSignName(s.label); }}
                        className={`rounded-xl border p-2 text-left transition-all ${mySignatureUrl === s.url ? "border-primary bg-primary/5" : "border-slate-100 hover:border-slate-200"}`}>
                        <span className="h-9 flex items-center justify-center overflow-hidden">
                          <img src={attachmentUrl(s.url.replace(/^\/+/, ""))} alt={s.label || "Signature"} className="max-h-full max-w-full object-contain" />
                        </span>
                        <span className="block text-[10px] font-bold text-slate-600 truncate mt-1">{s.label || "Unnamed signer"}{s.isDefault ? " · default" : ""}</span>
                      </button>
                    ))}
                  </div>
                ) : mySignatureUrl
                  ? <img src={attachmentUrl(mySignatureUrl.replace(/^\/+/, ""))} alt="my signature" className="h-10 object-contain bg-slate-50 rounded-lg px-2 py-1 border border-slate-100" />
                  : <p className="text-[11px] text-amber-600">No signature on file. Upload one in your Profile first, or sign with your typed name only.</p>}
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
              <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">{editor.aid ? "Manage agreement" : "New agreement"}</p>
                  <p className="text-[10px] text-slate-400 truncate">{ctx.kind === "user" ? "Employee agreement — details auto-fill from the user profile" : ctx.kind === "general" ? "General agreement — GreenTech’s details are filled in; add the other party below" : `${ctx.entityType} agreement — details auto-fill from the project record`}</p>
                </div>
                {/* CR-B-1 — who else is in this agreement right now (names). */}
                <PresenceBar users={sectionPeers} />
                {/* CR-B-14b — autosave status (existing agreements). */}
                <SaveStatus {...agSave} className="ml-1" />
                {/* CR-P (36) — says what just arrived from someone else. `blocked` means we were
                    editing the same field, so their version was kept back rather than overwriting
                    ours; saving pushes ours and the next poll re-syncs. */}
                {liveNote && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${liveNote.blocked ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {liveNote.changed > 0 && `Updated live${liveNote.blocked ? " · " : ""}`}
                    {liveNote.blocked > 0 && `${liveNote.blocked} kept yours`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* CR-P (33) — the status of the WHOLE agreement, not just one section. It sits in
                    the header so it is visible from every section of the editor. */}
                {(() => {
                  const st = docStatusMeta(draft.docStatus);
                  const open = unfinishedSections(draft).length;
                  return (
                    <label className="flex items-center gap-1.5" title={open ? `${open} section(s) not marked Complete` : "Status of the whole agreement"}>
                      <span className="hidden sm:inline text-[9px] font-bold text-slate-400 uppercase tracking-widest">Agreement status</span>
                      <select
                        value={draft.docStatus}
                        onChange={(e) => void setDocStatus(e.target.value as DocStatus)}
                        className={`text-[10px] font-bold rounded-full pl-2 pr-6 py-1 border-0 cursor-pointer ${st.cls}`}
                      >
                        {DOC_STATUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                      </select>
                    </label>
                  );
                })()}
                <button onClick={() => void closeEditor()} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100" title="Close"><X size={18} /></button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <input
                ref={signedPickRef} type="file" accept=".pdf,image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; const cur = list.find((a) => a._id === editor.aid); if (f && cur) void uploadSigned(cur, f); e.target.value = ""; }}
              />
              {/* CR-P (52) — the signed copy lives at the TOP of Manage: "in the manage, we have to
                  create another section on top, and it will show the signed one." Replace swaps in a
                  corrected scan and the one it replaced is kept underneath. */}
              {(() => {
                const cur = list.find((a) => a._id === editor.aid);
                if (!cur) return null;
                const signed = cur.signedDocument;
                const hist = cur.signedDocumentHistory || [];
                // CR-P (51)/(66) — offered on a draft too: it may have been signed on paper.
                if (!signed && ["Cancelled", "Expired"].includes(cur.status)) return null;
                return (
                  <div className={`rounded-2xl p-4 space-y-2 border ${signed ? "bg-emerald-50/60 border-emerald-100" : "bg-slate-50 border-slate-100"}`}>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <PenLine size={11} /> Signed copy
                    </p>
                    {signed ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-[11px] font-bold text-slate-700">
                          <FileText size={11} className="text-emerald-600" /> {signed.name}
                          {signed.size ? <span className="text-slate-400 font-medium">{signed.size}</span> : null}
                        </span>
                        <FileActions name={signed.name} url={attachmentUrl(signed.filePath)} size={12} />
                        <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary cursor-pointer" title="Upload a newer signed copy — the current one is kept in the history below">
                          <Upload size={11} /> Replace
                          <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadSigned(cur, f); e.target.value = ""; }} />
                        </label>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-slate-400 italic">No signed copy on file yet.</span>
                        <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary cursor-pointer" title="Upload the signed copy received back from the other party">
                          <Upload size={11} /> Upload signed copy
                          <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadSigned(cur, f); e.target.value = ""; }} />
                        </label>
                      </div>
                    )}
                    {hist.length > 0 && (
                      <div className="pt-1 border-t border-emerald-100/70 space-y-1">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Previous copies</p>
                        {hist.slice().reverse().map((h, k) => (
                          <div key={k} className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                            <FileText size={10} className="text-slate-400" />
                            <span className="font-bold text-slate-600 truncate max-w-[180px]">{h.name}</span>
                            <span>replaced {h.replacedAt ? new Date(h.replacedAt).toLocaleDateString() : ""}{h.replacedByName ? ` by ${h.replacedByName}` : ""}</span>
                            <FileActions name={h.name} url={attachmentUrl(h.filePath)} size={11} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* CR-P (67) — box 1: what the agreement IS. Name, title, type and number together,
                  then the description, then the projects it covers in their own box below. */}
              <EditorBox
                title="Agreement details"
                summary={[draft.agreementType, draft.title].filter(Boolean).join(" · ")}
              >
              {/* CR-P (69) — a template is an optional starting point, offered on every agreement
                  that has templates for its kind. It sits on its own row so that type and number
                  always pair up on the row below (CR-P (22)). */}
              {relevantTemplates.length > 0 && (
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Start from a template
                  <select className={`${inp} mt-1 font-bold`} value={draft.templateId} onChange={(e) => applyTemplate(e.target.value)}>
                    <option value="">No template</option>
                    {relevantTemplates.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                  </select></label>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* CR-P (22) — Agreement type takes the left half, Agreement number the right. */}
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Agreement type
                  {/* CR-P (69) — the one grouped type list, for every agreement. */}
                  {(() => {
                    const known = AGREEMENT_TYPES_FLAT.includes(draft.agreementType);
                    return (<>
                      <select className={`${inp} mt-1 font-bold`} value={known ? draft.agreementType : "__custom__"} onChange={(e) => setDraft({ ...draft, agreementType: e.target.value === "__custom__" ? "" : e.target.value })}>
                        {AGREEMENT_TYPE_GROUPS.map((g) => (
                          <optgroup key={g.group} label={g.group}>
                            {g.types.map((t) => <option key={t} value={t}>{t}</option>)}
                          </optgroup>
                        ))}
                        <option value="__custom__">Custom…</option>
                      </select>
                      {!known && <input className={`${inp} mt-1.5`} value={draft.agreementType} onChange={(e) => setDraft({ ...draft, agreementType: e.target.value })} placeholder="Type a custom agreement type…" />}
                    </>);
                  })()}
                </label>

                {/* CR-P (23) — the agreement number. Assigned by the server the moment the
                    agreement is created and never editable: a number that has gone out on paper
                    has to keep pointing at the same agreement, and the sequence never rewinds
                    even when an agreement is cancelled, revised or deleted. */}
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Agreement number
                  {(() => {
                    const no = list.find((a) => a._id === editor?.aid)?.agreementNo || "";
                    return (
                      <>
                        <input
                          readOnly
                          value={no}
                          placeholder="Assigned when you save"
                          className={`${inp} mt-1 font-bold tabular-nums bg-slate-100 text-slate-600 cursor-not-allowed`}
                        />
                        <span className="block mt-1 text-[9px] font-medium normal-case text-slate-400">
                          {no ? "Auto-generated, cannot be changed." : "Auto-generated as AG-0001, AG-0002, … on save."}
                        </span>
                      </>
                    );
                  })()}
                </label>
              </div>
              {/* CR-P (18)/(69) — every agreement: Title + File name sit parallel; the description follows. */}
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Title
                    <input className={`${inp} mt-1`} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Short title for this agreement" />
                  </label>
                  {/* CR-P (24) — the file name, never printed on the document. */}
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">File name <span className="font-medium normal-case text-slate-400">(not printed)</span>
                    <div className="flex gap-2 mt-1">
                      <input className={inp} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={autoName(draft.agreementType)} />
                      <button onClick={() => setDraft({ ...draft, name: autoName(draft.agreementType) })} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-slate-200 whitespace-nowrap shrink-0" title="Build the file name from the second party and the date">Auto</button>
                    </div>
                    <span className="block mt-1 text-[9px] font-medium normal-case text-slate-400">Built from the second party and the date. Names the downloaded file only.</span>
                  </label>
                </div>
                {/* CR-P (26) — the description is a one or two line summary of what the agreement
                    is about; it prints in plain text right under the title. */}
                {/* CR-P (26) — the short description that prints under the title.
                    CR-P (60) — the separate "Description / remarks" COLUMN is gone from the table
                    (it is now Visible to), so this field is simply the description. */}
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description
                  <textarea rows={2} className={`${inp} mt-1`} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="e.g. Farmer Group will carry out the 60% civil design for the Ivory Coast plant." />
                  <span className="block mt-1 text-[9px] font-medium normal-case text-slate-400">A short description about the nature of this agreement. One or two lines. Prints under the title in plain text.</span>
                </label>
                {/* CR-P (60) — "Remark": our own note about this agreement. Separate from the
                    description, which prints; the remark never prints and never reaches a party. */}
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Remark <span className="font-medium normal-case text-slate-400">(internal, not printed)</span>
                  <textarea rows={2} className={`${inp} mt-1`} value={draft.remark} onChange={(e) => setDraft({ ...draft, remark: e.target.value })} placeholder="e.g. Waiting for the bank's wording on clause 4." />
                </label>
              </>
              </EditorBox>

              {/* CR-P (67) — box 2: the projects this agreement covers (every agreement, CR-P (69)). */}
              {(
                <EditorBox
                  title="Projects"
                  hint="which project this agreement covers; leave empty if it is not project related"
                  summary={draft.linkedProjects.length ? draft.linkedProjects.map((p) => p.name).join(", ") : "Not project related"}
                >
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto bg-white rounded-xl border border-slate-100 p-2">
                    {allProjects.length === 0 && <span className="text-[11px] text-slate-400 italic">No projects available.</span>}
                    {allProjects.map((p) => {
                      const on = draft.linkedProjects.some((x) => x.id === p.id);
                      return (
                        <button
                          key={p.id}
                          // CR-P (27) — the location is captured with the name so the document keeps
                          // what it was issued with, even if the project is renamed or moved later.
                          onClick={() => setDraft((d) => (d ? { ...d, linkedProjects: on ? d.linkedProjects.filter((x) => x.id !== p.id) : [...d.linkedProjects, { id: p.id, name: p.name, location: p.location || "" }] } : d))}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors ${on ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:border-primary/40"}`}
                        >{on && <CheckCircle2 size={11} />}{p.name}</button>
                      );
                    })}
                  </div>
                </EditorBox>
              )}

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
              {/* Dates — CR-P (21). Each date is opt-in: tick the ones this agreement actually
                  carries. An unticked date is not printed at all, so a document never shows an
                  empty "End: —" line for a date that was never agreed. */}
              <EditorBox
                title="Dates"
                hint="tick the ones to show on the document"
                summary={shownDatesSummary(draft)}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([["effectiveDate", "effective", "Effective date"], ["startDate", "start", "Start date"], ["endDate", "end", "End date"]] as const).map(([f, key, label]) => {
                    const on = draft.datesShown[key];
                    return (
                      <div key={f} className={`rounded-xl border p-2.5 transition-colors ${on ? "bg-white border-slate-200" : "bg-slate-100/60 border-slate-100"}`}>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => setDraft({ ...draft, datesShown: { ...draft.datesShown, [key]: e.target.checked } })}
                            className="w-3.5 h-3.5 rounded accent-primary shrink-0"
                          />
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${on ? "text-slate-600" : "text-slate-400"}`}>{label}</span>
                        </label>
                        <input
                          type="date"
                          disabled={!on}
                          className={`${inp} mt-1.5 disabled:opacity-40 disabled:cursor-not-allowed`}
                          value={draft[f]}
                          onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                        />
                        {!on && <p className="text-[9px] text-slate-400 italic mt-1">Not printed.</p>}
                      </div>
                    );
                  })}
                </div>
              </EditorBox>

              {/* Letterhead — user agreements are GreenTech-only; project agreements extract the JV
                  logo & name from the project's Joint Venture; general agreements upload one manually. */}
              <EditorBox title="Letterhead" summary={draft.letterhead === "jv" ? `Joint venture${draft.jvPartnerName ? ` · ${draft.jvPartnerName}` : ""}` : "GreenTech"}>
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
                        <span className="text-[11px] font-bold text-slate-700">{defaults?.jv?.name || "—"}</span>
                        {!draft.jvLogoUrl && <span className="text-[11px] text-amber-600 italic">No partner logo on the project — add one in the Joint Venture section.</span>}
                      </div>
                    ) : (
                      // CR-P (30) — a general agreement picks its JV partner from the Directory
                      // instead of uploading a logo by hand. Choosing the partner pulls that
                      // company's letterhead logo, so the same partner always looks the same
                      // wherever it appears. Partners come first, then vendors we partner with.
                      (() => {
                        const inCat = (c: ApiCompany, cat: string) => (c.categories?.length ? c.categories : [c.category]).includes(cat as ApiCompany["category"]);
                        const partners = companies.filter((c) => inCat(c, "partner"));
                        const vendors = companies.filter((c) => !inCat(c, "partner") && inCat(c, "vendor"));
                        const chosen = companies.find((c) => c._id === draft.jvPartnerId);
                        const pick = (id: string) => {
                          const c = companies.find((x) => x._id === id);
                          setDraft({ ...draft, jvPartnerId: id, jvPartnerName: c?.name || "", jvLogoUrl: c?.logoUrl || "" });
                        };
                        return (
                          <div className="space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">JV partner</span>
                              <select className={`${inp} max-w-xs font-bold`} value={draft.jvPartnerId} onChange={(e) => pick(e.target.value)}>
                                <option value="">— choose a partner from the Directory —</option>
                                {partners.length > 0 && (
                                  <optgroup label="Partners">
                                    {partners.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                                  </optgroup>
                                )}
                                {vendors.length > 0 && (
                                  <optgroup label="Vendors">
                                    {vendors.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                                  </optgroup>
                                )}
                              </select>
                              {draft.jvLogoUrl && <img src={logoSrc(draft.jvLogoUrl)} alt="JV logo" className="h-8 object-contain" />}
                            </div>
                            {!draft.jvPartnerId && (
                              <p className="text-[10px] text-slate-400 italic">The partner's logo is used for the joint-venture letterhead, beside GreenTech's.</p>
                            )}
                            {/* The Directory is the single source for the letterhead, so a partner
                                with no logo there is fixed in the Directory, not worked around. */}
                            {draft.jvPartnerId && !draft.jvLogoUrl && (
                              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                                {chosen?.name || "This partner"} has no logo in the Directory, so the letterhead will show its name instead.
                                Add a logo to the company in <span className="font-bold">Directory</span> to fix it everywhere at once.
                              </p>
                            )}
                            {partners.length === 0 && vendors.length === 0 && (
                              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                                No partners or vendors in the Directory yet. Add the company under <span className="font-bold">Directory</span> first.
                              </p>
                            )}
                          </div>
                        );
                      })()
                    ))}
                  </>
                )}
              </EditorBox>

              {/* Parties — CR-P (19). Party 1 is us, party 2 is the counterparty, and up to two
                  more can be added: a bonding application always has three signatories (the bank,
                  the company and the surety), and a JV can add one on top of that. Party 2 sits in
                  the left column so party 3 lands beside it on the right. */}
              <EditorBox
                title="Parties"
                hint={`${party2IsCompany ? "picked from the Directory" : "auto-filled"}; frozen once sent`}
                summary={[party1().name, draft.party2.name, ...draft.extraParties.map((p) => p.name)].filter(Boolean).join(" · ")}
              >
                <div className="flex items-center justify-end gap-2 flex-wrap -mt-1">
                  <button
                    onClick={addParty}
                    disabled={2 + draft.extraParties.length >= MAX_PARTIES}
                    title={2 + draft.extraParties.length >= MAX_PARTIES ? `An agreement can name at most ${MAX_PARTIES} parties.` : "Add another party to this agreement"}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:text-slate-900 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus size={11} /> Add party
                  </button>
                </div>

                {/* Party 1 is always us — shown for context, changed nowhere but the letterhead. */}
                <div className="bg-white rounded-xl border border-slate-100 px-3 py-2 flex items-center gap-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Party 1</span>
                  <span className="text-xs font-bold text-slate-800">{party1().name}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[2, ...draft.extraParties.map((_, i) => i + 3)].map((slot) => {
                    const p = partyAt(draft, slot);
                    const label = slot > 2 ? "other party"
                      : ctx.kind === "user" ? "employee" : ctx.kind === "general" ? "other party" : ctx.entityType;
                    // Only the employee slot is typed by hand; every company party comes from the Directory.
                    const manual = slot === 2 && !party2IsCompany;
                    // CR-P (70) — an agreement made on a project record (subcontractor, vendor, JV
                    // partner) is WITH that record: party 2 is filled in from it and cannot be swapped.
                    const fixedParty = ctx.kind === "project" && slot === 2;
                    return (
                      <div key={slot} className="bg-white rounded-xl border border-slate-100 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Party {slot} <span className="font-medium normal-case">— {label}</span></p>
                          {slot > 2 && (
                            <button onClick={() => removeParty(slot)} title={`Remove party ${slot}`} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={12} /></button>
                          )}
                        </div>
                        {manual ? (
                          <div className="grid grid-cols-2 gap-2">
                            <input className={`${inp} col-span-2`} placeholder="Name *" value={p.name} onChange={(e) => setDraft(writeParty(draft, slot, { ...p, name: e.target.value }))} />
                            <input className={`${inp} col-span-2`} placeholder="Contact person" value={p.contactName} onChange={(e) => setDraft(writeParty(draft, slot, { ...p, contactName: e.target.value }))} />
                            <input className={inp} placeholder="Email" value={p.email} onChange={(e) => setDraft(writeParty(draft, slot, { ...p, email: e.target.value }))} />
                            <input className={inp} placeholder="Phone" value={p.phone} onChange={(e) => setDraft(writeParty(draft, slot, { ...p, phone: e.target.value }))} />
                            <input className={`${inp} col-span-2`} placeholder="Address" value={p.address} onChange={(e) => setDraft(writeParty(draft, slot, { ...p, address: e.target.value }))} />
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              {p.name ? (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold ${p.companyId ? "bg-slate-50 border-slate-200 text-slate-700" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                                  <Building2 size={12} className={p.companyId ? "text-slate-400" : "text-amber-500"} /> {p.name}
                                  {!fixedParty && <button onClick={() => blankParty(slot)} title="Clear this party" className="text-slate-300 hover:text-red-500"><X size={12} /></button>}
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">No party chosen. Pick one from the Directory.</span>
                              )}
                              {!fixedParty && (<>
                                <button onClick={() => { setPartyPicker(slot); setPartySearch(""); }} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary">
                                  <Building2 size={11} /> {p.name ? "Change party" : "Choose from Directory"}
                                </button>
                                <button onClick={() => setNewPartyOpen(slot)} className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
                                  <Plus size={11} /> New company
                                </button>
                              </>)}
                            </div>
                            {fixedParty && (
                              <p className="text-[10px] text-slate-400 italic">Filled in from this {ctx.kind === "project" ? ctx.entityType : "record"}. To agree with someone else, open their record instead.</p>
                            )}
                            {/* CR-P (20) — a party that isn't a Directory record is flagged, with the
                                one click that fixes it. Nothing on an agreement should live outside
                                the Directory, or the same company ends up with different details. */}
                            {p.name.trim() && !p.companyId && (
                              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 leading-relaxed">
                                Not in the Directory yet, so this party's details live only on this
                                agreement.{" "}
                                <button onClick={() => setNewPartyOpen(slot)} className="font-bold underline hover:text-amber-900">Add "{p.name.trim()}" to the Directory</button>{" "}
                                or pick the matching company above.
                              </p>
                            )}
                            {p.name && (
                              <div className="grid grid-cols-1 gap-y-1 bg-slate-50 rounded-lg p-2.5 text-[11px] text-slate-600">
                                <p><span className="text-slate-400">Contact</span> {p.contactName || "—"}</p>
                                <p><span className="text-slate-400">Email</span> {p.email || "—"}</p>
                                <p><span className="text-slate-400">Phone</span> {p.phone || "—"}</p>
                                <p><span className="text-slate-400">Address</span> {p.address || "—"}</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                {party2IsCompany && <p className="text-[10px] text-slate-400 italic">Printed on the document as shown. Edit the company in the Directory to change it, then re-pick it here.</p>}
              </EditorBox>

              {/* Context lines — CR-P-47: removed from general agreements. */}
              {ctx.kind !== "general" && (
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{ctx.kind === "user" ? "Employment information" : "Project information"} <span className="font-medium normal-case text-slate-400">— printed as an info block on the document</span></p>
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
              )}

              {/* Sections — rich text so tables & pictures can be added (rendered into the agreement PDF).
                  CR-P-48 / CR-P (69) — every agreement manages its sections through the flexible list
                  below (rename / delete / reorder). The four fixed sections employee and project
                  agreements used to have are gone; older ones move into this list as they open. */}

              {/* Custom named sections — CR-B-04: these live BEFORE the NDA; the NDA is always
                  the last section before the signature. Each is a titled rich-text block. */}
              {draft.extraSections.map((s, i) => {
                const count = draft.extraSections.length;
                const locked = !!s.locked;
                // Per-section update / reorder / duplicate helpers (CR-B-15/17) on the draft.
                const upd = (patch: Partial<typeof s>) => setDraft({ ...draft, extraSections: draft.extraSections.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                const move = (dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= count) return; const arr = [...draft.extraSections]; [arr[i], arr[j]] = [arr[j], arr[i]]; setDraft({ ...draft, extraSections: arr }); };
                const dup = () => { const arr = [...draft.extraSections]; arr.splice(i + 1, 0, { ...s, title: s.title ? `${s.title} (copy)` : "" }); setDraft({ ...draft, extraSections: arr }); };
                // CR-B-18 — attach/remove a pre-made file on this section (needs the agreement saved first).
                const uploadFile = async (file: File) => {
                  if (!editor?.aid) { toast("Save the agreement first, then attach files to a section.", "info"); return; }
                  // The server finds the section by its position. If sections were added, moved, or
                  // (on an older agreement) moved in from the old fixed fields since the last save,
                  // save first so the file lands in the right one.
                  if (isDirty() && !(await saveDraft())) return;
                  try { const ag = await uploadAgreementSectionFile(ctx, editor.aid, i, file); upd({ attachments: (ag.extraSections?.[i]?.attachments || []) as typeof s.attachments }); toast("File attached.", "success"); }
                  catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
                };
                const removeFile = async (fid?: string) => {
                  if (!editor?.aid || !fid) return;
                  if (!(await confirm({ title: "Delete this file?", message: "The attachment is removed from this section for good.", confirmLabel: "Delete" }))) return;
                  try { const ag = await deleteAgreementSectionFile(ctx, editor.aid, i, fid); upd({ attachments: (ag.extraSections?.[i]?.attachments || []) as typeof s.attachments }); }
                  catch { /* ignore */ }
                };
                const st = SECTION_STATUS_OPTS.find((o) => o.v === (s.status || "")) || SECTION_STATUS_OPTS[0];
                const peers = sectionPeers.filter((u) => u.section === String(i));
                return (
                <div key={i} className={`space-y-1.5 border-l-2 pl-3 ${locked ? "border-amber-300" : "border-primary/30"}`} onFocusCapture={() => setActiveSection(String(i))}>
                  <div className="flex flex-wrap items-center gap-2">
                    {locked
                      ? <p className="text-xs font-bold text-slate-700 flex-grow min-w-[8rem]">{s.title || "Untitled section"}<Lock size={11} className="inline ml-1 text-amber-500" /></p>
                      : <input className={`${inp} font-bold flex-grow min-w-[8rem]`} placeholder="Section title (e.g. Confidentiality, Warranty)" value={s.title} onChange={(e) => upd({ title: e.target.value })} />}
                    {/* CR-B-16 — live: who else is in this section right now. */}
                    {peers.length > 0 && (
                      <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5" title={`${peers.map((u) => u.name).join(", ")} editing this section`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{peers.map((u) => u.name).join(", ")}
                      </span>
                    )}
                    {/* CR-B-15 — colour-coded per-section status (logs a history entry, CR-B-17). */}
                    <select value={s.status || ""} onChange={(e) => { const v = e.target.value as SectionStatus; const label = SECTION_STATUS_OPTS.find((o) => o.v === v)?.label || "No status"; upd({ status: v, history: [...(s.history || []), { at: new Date().toISOString(), by: getAuthUser()?.name || "Someone", text: `Status → ${label}` }] }); }} disabled={locked} className={`text-[10px] font-bold rounded-full px-2 py-1 border-0 cursor-pointer disabled:opacity-60 ${st.cls}`} title="Section status">
                      {SECTION_STATUS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                    </select>
                    {/* CR-B-19a — tag a colleague to review/verify this section (notifies them). */}
                    <select value={s.assignedTo || ""} disabled={locked} onChange={(e) => {
                      const u = users.find((x) => x.id === e.target.value);
                      upd({ assignedTo: u?.name || "" });
                      const pid = ctx.kind === "project" ? ctx.projectId : "";
                      if (u) createReminder({ userId: u.id, title: `Review agreement section "${s.title || "Untitled"}"`, notes: "You were assigned to edit / review / verify this section.", dueAt: new Date(Date.now() + 3 * 86400000).toISOString(), link: pid ? `/dashboard/projects/${pid}` : "/dashboard", projectId: pid || undefined, projectName: draft?.name || "Agreement" }).then(() => toast(`${u.name} was notified.`, "success")).catch(() => {});
                    }} className="text-[10px] font-bold rounded-lg px-2 py-1 border border-slate-200 text-slate-600 bg-white cursor-pointer disabled:opacity-60" title="Tag a colleague to review this section">
                      <option value="">{s.assignedTo ? `👤 ${s.assignedTo}` : "Tag colleague…"}</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    {/* CR-B-17 — section actions. */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {(s.history?.length || 0) > 0 && <button onClick={() => setSecHistFor(secHistFor === i ? null : i)} title="View history" className="p-1 rounded text-slate-300 hover:text-slate-600"><History size={13} /></button>}
                      <button onClick={() => upd({ locked: !locked })} title={locked ? "Unlock section" : "Lock section"} className={`p-1 rounded ${locked ? "text-amber-600 bg-amber-50" : "text-slate-300 hover:text-slate-600"}`}>{locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
                      <button onClick={() => move(-1)} disabled={i === 0} title="Move up" className="p-1 rounded text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp size={13} /></button>
                      <button onClick={() => move(1)} disabled={i === count - 1} title="Move down" className="p-1 rounded text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown size={13} /></button>
                      <button onClick={dup} title="Duplicate section" className="p-1 rounded text-slate-300 hover:text-primary"><Copy size={13} /></button>
                      <button onClick={() => upd({ hidden: !s.hidden })} title={s.hidden ? "Show section" : "Hide section"} className={`p-1 rounded ${s.hidden ? "text-slate-500 bg-slate-100" : "text-slate-300 hover:text-slate-600"}`}>{s.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                      <button onClick={() => removeExtraSection(i)} disabled={locked} title="Delete section" className="p-1 rounded text-slate-300 hover:text-red-500 disabled:opacity-30"><X size={15} /></button>
                    </div>
                  </div>
                  {/* CR-B-17 — per-section change history. */}
                  {secHistFor === i && (
                    <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 space-y-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><History size={10} /> Section history</p>
                      {(s.history || []).slice().reverse().map((h, k) => (
                        <p key={k} className="text-[11px] text-slate-500"><span className="text-slate-400">{h.at ? new Date(h.at).toLocaleString() : ""}</span> · <strong className="text-slate-600">{h.by}</strong> — {h.text}</p>
                      ))}
                    </div>
                  )}
                  {s.hidden ? (
                    <p className="text-[11px] text-slate-400 italic bg-slate-50 rounded-lg px-2 py-1.5">Section hidden — use the eye icon to show it.</p>
                  ) : (
                    <>
                      {locked
                        ? <div className="text-xs text-slate-600 bg-white border border-slate-100 rounded-lg p-2" dangerouslySetInnerHTML={{ __html: s.body || "<span class='text-slate-300'>Empty</span>" }} />
                        : <RichTextEditor value={s.body} onChange={(html) => upd({ body: html })} minHeight={110} placeholder="Section content — tables, pictures, lists…" />}
                      {!locked && <input className={`${inp} text-[11px]`} placeholder="+ Internal notes for this section (not printed)" value={s.notes || ""} onChange={(e) => upd({ notes: e.target.value })} />}
                      {/* CR-B-18 — per-section file upload (resume/excel/pdf/picture). */}
                      {!locked && (
                        <div className="space-y-1.5">
                          {/* CR-P (42)/(44) — each attached file says where it prints, and can be
                              held out of the document entirely. Default is printed, straight after
                              this section, which is what ~90% of them want. */}
                          {(s.attachments || []).map((a, ai) => {
                            const willPrint = a.print !== false;
                            const atEnd = a.placement === "end";
                            const setA = (patch: Partial<typeof a>) => upd({ attachments: (s.attachments || []).map((x, k) => (k === ai ? { ...x, ...patch } : x)) as typeof s.attachments });
                            return (
                              <div key={a._id || a.filePath} className="flex flex-wrap items-center gap-1.5 bg-white border border-slate-100 rounded-lg px-2 py-1">
                                <span className="max-w-[150px] truncate text-[10px] font-bold text-slate-600" title={a.name}><FileText size={10} className="inline mr-1" />{a.name}</span>
                                <label className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 cursor-pointer" title="Include this file in the printed document">
                                  <input type="checkbox" checked={willPrint} onChange={(e) => setA({ print: e.target.checked })} className="w-3 h-3 accent-primary" />
                                  Print
                                </label>
                                <select
                                  value={atEnd ? "end" : "after"}
                                  disabled={!willPrint}
                                  onChange={(e) => setA({ placement: e.target.value as "after" | "end" })}
                                  className="text-[10px] font-bold rounded border border-slate-200 bg-slate-50 px-1 py-0.5 disabled:opacity-40"
                                  title="Where this file appears in the document"
                                >
                                  <option value="after">after this section</option>
                                  <option value="end">at the end (appendix)</option>
                                </select>
                                <FileActions name={a.name} url={attachmentUrl(a.filePath)} size={11} onDelete={() => removeFile(a._id)} />
                              </div>
                            );
                          })}
                          <label className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-bold text-slate-600 hover:bg-slate-200 cursor-pointer w-fit" title={editor?.aid ? "Attach a file that prints with this section" : "Save the agreement first"}>
                            <Upload size={11} /> Attach a file to this section
                            <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = ""; }} />
                          </label>
                        </div>
                      )}
                    </>
                  )}
                </div>
                );
              })}
              <button onClick={() => setDraft({ ...draft, extraSections: [...draft.extraSections, { title: "", body: "" }] })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200 w-fit"><Plus size={13} /> Add section</button>

              {/* NDA — always the last section before the signature (CR-B-04). */}
              <EditorBox title="NDA" summary={draft.sections.ndaEnabled ? (draft.sections.ndaFile?.name || "Written inline") : "Not included"}>
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
                    <button onClick={() => { setFilePickerFor("nda"); if (!ndaFiles.length) fetchNdaFiles().then(setNdaFiles).catch(() => {}); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary"><Plus size={11} /> {draft.sections.ndaFile ? "Change" : "Add NDA"}</button>
                  </div>
                ))}
              </EditorBox>

              {/* CR-P (45) — the standard terms & conditions, ticked on the same way as the NDA and
                  stapled straight after it: "include NDA. Next line, include the standard terms and
                  conditions." Both come from the same Company Documents pool. */}
              <EditorBox title="Standard terms &amp; conditions" summary={draft.sections.stdTermsEnabled ? (draft.sections.stdTermsFile?.name || "Written inline") : "Not included"}>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={!!draft.sections.stdTermsEnabled} onChange={(e) => setDraft({ ...draft, sections: { ...draft.sections, stdTermsEnabled: e.target.checked } })} />
                    Include standard terms &amp; conditions
                  </label>
                  {draft.sections.stdTermsEnabled && (
                    <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-bold">
                      {(["text", "file"] as const).map((m) => (
                        <button key={m} onClick={() => setDraft({ ...draft, sections: { ...draft.sections, stdTermsMode: m } })} className={`px-3 py-1 ${(draft.sections.stdTermsMode || "file") === m ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{m === "text" ? "Write manually" : "Select file"}</button>
                      ))}
                    </div>
                  )}
                </div>
                {draft.sections.stdTermsEnabled && ((draft.sections.stdTermsMode || "file") === "text" ? (
                  <RichTextEditor value={draft.sections.stdTermsText || ""} onChange={(html) => setDraft({ ...draft, sections: { ...draft.sections, stdTermsText: html } })} minHeight={90} placeholder="Standard terms &amp; conditions wording…" />
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {draft.sections.stdTermsFile?.name ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700"><FileText size={11} /> {draft.sections.stdTermsFile.name}
                        <button onClick={() => setDraft({ ...draft, sections: { ...draft.sections, stdTermsFile: null } })} className="text-slate-300 hover:text-red-500 ml-1"><X size={11} /></button>
                      </span>
                    ) : <span className="text-[11px] text-slate-400 italic">No terms file selected.</span>}
                    <button onClick={() => { setFilePickerFor("terms"); if (!termsFiles.length) fetchTermsFiles().then(setTermsFiles).catch(() => {}); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary"><Plus size={11} /> {draft.sections.stdTermsFile ? "Change" : "Add terms"}</button>
                  </div>
                ))}
              </EditorBox>

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

              {/* CR-P (63) — "at the end of Manage add Manage access / Visible to". It sits at the very
                  end, for built and uploaded agreements alike. Ticking only marks the change; Save
                  applies it and the parties added are notified. Offered once the document is
                  Complete, since until then it is internal.
                  CR-P (61) — the send log lives here too, so "we know who we already sent and when". */}
              {(() => {
                const cur = list.find((a) => a._id === editor.aid);
                if (!cur) return null;
                const targets = shareTargets(cur);
                if (!targets.length) return null;
                const ready = ["Complete", "CompletedSigned"].includes(draft.docStatus);
                const visible = cur.visibleTo || [];
                const has = (t: SharePartyInput) => visible.some((v) => (v.companyId || v.name.toLowerCase()) === partyKey(t));
                const picked = (t: SharePartyInput) => (visDraft ? !!visDraft[partyKey(t)] : has(t));
                const changed = !!visDraft && targets.some((t) => picked(t) !== has(t));
                const toggle = (t: SharePartyInput) =>
                  setVisDraft(Object.fromEntries(targets.map((x) => [partyKey(x), partyKey(x) === partyKey(t) ? !picked(x) : picked(x)])));
                const saveAccess = async () => {
                  // Entries for parties no longer on the agreement are left as they are.
                  const keys = new Set(targets.map(partyKey));
                  const others = visible
                    .filter((v) => !keys.has(v.companyId || v.name.toLowerCase()))
                    .map((v) => ({ companyId: v.companyId, name: v.name, email: v.email }));
                  setVisBusy(true);
                  try {
                    const saved = await setAgreementVisibility(ctx, cur._id, [...others, ...targets.filter(picked)]);
                    patch(saved); baseRef.current = saved; setVisDraft(null);
                    toast("Access saved. Anyone added has been notified.", "success");
                  } catch (err) { toast(err instanceof Error ? err.message : "Could not update access.", "error"); }
                  finally { setVisBusy(false); }
                };
                return (
                  <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Eye size={11} /> Manage access · Visible to
                      <span className="font-medium normal-case text-slate-400">(who can see this agreement on their own profile)</span>
                    </p>
                    {!ready && (
                      <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                        Available once the agreement status is <span className="font-bold">Complete</span>. Until then it stays internal, so nothing half-written reaches the other side. To send it for review before that, use Share.
                      </p>
                    )}
                    <div className={`flex flex-wrap gap-1.5 ${ready ? "" : "opacity-50 pointer-events-none"}`}>
                      {targets.map((t) => (
                        <button
                          key={partyKey(t)}
                          onClick={() => toggle(t)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors ${picked(t) ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}
                        >
                          {picked(t) ? <Eye size={11} /> : <EyeOff size={11} />} {t.name}
                        </button>
                      ))}
                    </div>
                    {visible.length === 0 && !changed && ready && <p className="text-[10px] text-slate-400 italic">Nobody yet. This agreement is internal.</p>}
                    {changed && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => void saveAccess()} disabled={visBusy} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold hover:bg-primary disabled:opacity-50">{visBusy ? "Saving..." : "Save access"}</button>
                        <button onClick={() => setVisDraft(null)} disabled={visBusy} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-[10px] font-bold hover:text-slate-800">Cancel</button>
                      </div>
                    )}
                    {(cur.shares || []).length > 0 && (
                      <div className="pt-1.5 border-t border-slate-200/70">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Send log</p>
                        {(cur.shares || []).slice().reverse().map((h, k) => (
                          <p key={k} className="text-[10px] text-slate-500">
                            Sent to <span className="font-bold text-slate-600">{h.name}</span> {h.purpose === "signature" ? "for signature" : "for review"} on {h.sentAt ? new Date(h.sentAt).toLocaleDateString() : ""}{h.sentByName ? ` by ${h.sentByName}` : ""}{h.note ? `: "${h.note}"` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex flex-wrap justify-end gap-2 pt-1 border-t border-slate-100">
                {/* Built agreements preview the generated PDF; uploaded ones open the attached file as-is. */}
                {draft.documentMode === "uploaded" ? (
                  (() => {
                    const existing = list.find((a) => a._id === editor?.aid)?.uploadedDocument;
                    // CR-P (69) — every uploaded agreement previews as our cover page merged with the
                    // file, the same way it downloads.
                    const openUploaded = () => {
                      const cur = list.find((a) => a._id === editor?.aid);
                      const previewAg = { ...(cur || {}), ownerContextType: ctx.kind, ...draftBody() } as ApiAgreement;
                      setPreview({ title: draft.title || draft.agreementType || "Agreement", fileName: `${(draft.name || "agreement").replace(/[^\w-]+/g, "_")}.pdf`, build: () => uploadedMergedBlob(previewAg, draft.uploadFile) });
                    };
                    const has = !!draft.uploadFile || !!existing?.filePath;
                    return <button onClick={openUploaded} disabled={!has} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40"><Eye size={13} /> Preview file</button>;
                  })()
                ) : (
                  <button onClick={() => {
                    const previewAg = { ...(list.find((a) => a._id === editor.aid) || {}), ownerContextType: ctx.kind, ...draftBody(), status: (list.find((a) => a._id === editor.aid)?.status || "Draft"), signatures: { company: draft.company, recipient: list.find((a) => a._id === editor.aid)?.signatures?.recipient || { signerName: "", signatureUrl: "", stampUrl: "", signedAt: "", method: "" as const } } } as ApiAgreement;
                    setPreview({ title: previewAg.name || "Agreement", fileName: "agreement.pdf", build: () => buildAgreementPdf(previewAg) });
                  }} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold inline-flex items-center gap-1.5"><Eye size={13} /> Preview</button>
                )}
                {/* CR-B-14a — standard action set (Save/Save as Draft/Export/Reset/Cancel-with-confirm).
                    Send stays a separate row action (CR-P-11). */}
                <BuilderActions
                  confirm={confirm}
                  saving={saving}
                  // CR-P (48) — Cancel goes through closeEditor, which asks the one close question
                  // itself; BuilderActions' own "Discard & close" prompt is not used here.
                  dirty={false}
                  onExportPdf={async () => {
                    const cur = list.find((a) => a._id === editor.aid);
                    const ag = { ...(cur || {}), ownerContextType: ctx.kind, ...draftBody(), status: (cur?.status || "Draft"), signatures: { company: draft.company, recipient: cur?.signatures?.recipient || { signerName: "", signatureUrl: "", stampUrl: "", signedAt: "", method: "" as const } } } as ApiAgreement;
                    downloadBlob(await buildAgreementPdf(ag), `${(draft.name || "agreement").replace(/[^\w-]+/g, "_")}.pdf`);
                  }}
                  onReset={() => applyTemplate("")}
                  onCancel={() => void closeEditor()}
                  onSaveDraft={() => saveDraft()}
                  onSave={() => saveDraft()}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
