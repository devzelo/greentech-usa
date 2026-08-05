import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Award, FileCheck2, FolderOpen, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import DocSection from "./DocSection";
import RequestBuilder from "./RequestBuilder";
import StructuredTable from "./StructuredTable";
import { useDialogs } from "../../lib/useDialogs";
import { fetchTableRows, createTableRow, updateTableRow, deleteTableRow, type ApiTableRow } from "../../lib/api";
import type { ProjectPdfInfo } from "../../lib/pdfProjectHeader";

// Project Info — where every document received from the client for bidding/proposal lives.
// Organised into RFP (with sub-tabs) · Award Docs · NTPs. Each top tab supports adding CUSTOM
// sub-tabs (client request 2026-08-04): named upload areas that work like Solicitation Documents.
// Custom sub-tabs are stored as ProjectTable rows (tableKey "project-info-subtabs"); each row's id
// gives a unique DocSection id "project-info-custom-<rowId>".

type TopTab = "rfp" | "award" | "ntp";
const SUBTAB_KEY = "project-info-subtabs";

type SubTab = { k: string; label: string; section: string; hint: string; special?: "amendments" | "communications" };
const BUILTINS: Record<TopTab, SubTab[]> = {
  rfp: [
    { k: "solicitation", label: "Solicitation Documents", section: "project-info-rfp", hint: "The RFP / solicitation package received from the client." },
    { k: "drawings", label: "Drawings & Specifications", section: "project-info-specifications", hint: "Client drawings and specifications for the bid." },
    { k: "prebid", label: "Pre-Bid & Site Visit", section: "project-info-prebid", hint: "Pre-bid meeting minutes, site-visit notes and photos." },
    { k: "qa", label: "Questions & Answers", section: "project-info-qa", hint: "Bidder questions and the client's answers." },
    { k: "amendments", label: "Amendments & Addenda", section: "project-info-amendments", hint: "Amendments and addenda issued by the client (1, 2, 3 …).", special: "amendments" },
    { k: "communications", label: "Client Communications", section: "project-info-communications", hint: "Emails and other information received from the client.", special: "communications" },
    { k: "other", label: "Other", section: "project-info-other", hint: "Anything else received for this bid." },
  ],
  award: [{ k: "default", label: "Award Documents", section: "project-info-award", hint: "Award documents received from the client (award letter, contract, etc.)." }],
  ntp: [{ k: "default", label: "Notices to Proceed", section: "project-info-ntp", hint: "Notices to Proceed (NTPs) issued for this project." }],
};

export default function ProjectInfoTab({ projectId, canEdit, projectInfo, clientName }: { projectId: string; canEdit: boolean; isOwner?: boolean; projectInfo?: ProjectPdfInfo; clientName?: string }) {
  const [top, setTop] = useState<TopTab>("rfp");
  const [sub, setSub] = useState("solicitation");
  const [customRows, setCustomRows] = useState<ApiTableRow[]>([]);
  const { prompt, confirm, dialogs } = useDialogs();

  const load = useCallback(async () => {
    try { setCustomRows(await fetchTableRows(projectId, SUBTAB_KEY)); } catch { /* ignore */ }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  // Sub-tabs for the current top tab = built-ins + custom rows for this parent.
  const subtabs = useMemo<SubTab[]>(() => {
    const custom = customRows
      .filter((r) => (r.data?.parent || "") === top)
      .map((r) => ({ k: `c:${r._id}`, label: r.data?.label || "Untitled", section: `project-info-custom-${r._id}`, hint: r.data?.label || "Custom section." }));
    return [...BUILTINS[top], ...custom];
  }, [top, customRows]);

  const switchTop = (t: TopTab) => { setTop(t); setSub(BUILTINS[t][0].k); };
  const active = subtabs.find((t) => t.k === sub) || subtabs[0];

  const addSubtab = async () => {
    const label = await prompt({ title: "New sub-tab", label: "Sub-tab name", placeholder: "e.g. Geotechnical Reports", confirmLabel: "Create" });
    if (!label || !label.trim()) return;
    try { const r = await createTableRow(projectId, SUBTAB_KEY, { parent: top, label: label.trim() }); setCustomRows((p) => [...p, r]); setSub(`c:${r._id}`); }
    catch { /* ignore */ }
  };
  const renameSubtab = async (r: ApiTableRow) => {
    const label = await prompt({ title: "Rename sub-tab", label: "Sub-tab name", initialValue: r.data?.label || "", confirmLabel: "Save" });
    if (label === null || !label.trim()) return;
    try { const u = await updateTableRow(projectId, r._id, { data: { parent: r.data?.parent || top, label: label.trim() } }); setCustomRows((p) => p.map((x) => (x._id === u._id ? u : x))); }
    catch { /* ignore */ }
  };
  const removeSubtab = async (r: ApiTableRow) => {
    if (!(await confirm({ title: "Delete sub-tab?", message: `Remove the "${r.data?.label}" sub-tab? Uploaded files stay on the server but the tab is removed.`, confirmLabel: "Delete", danger: true }))) return;
    try { await deleteTableRow(projectId, r._id); setCustomRows((p) => p.filter((x) => x._id !== r._id)); if (sub === `c:${r._id}`) setSub(BUILTINS[top][0].k); }
    catch { /* ignore */ }
  };

  const topBtn = (k: TopTab, label: string, Icon: typeof FileText) => (
    // "NTPs" must keep its casing (the uppercase transform would turn it into "NTPS").
    <button onClick={() => switchTop(k)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold ${k === "ntp" ? "normal-case" : "uppercase"} tracking-widest transition-all ${top === k ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}>
      <Icon size={14} /> {label}
    </button>
  );

  const activeCustomRow = active.k.startsWith("c:") ? customRows.find((r) => `c:${r._id}` === active.k) : null;

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100 w-max">
          {topBtn("rfp", "RFP", FileText)}
          {topBtn("award", "Award Docs", Award)}
          {topBtn("ntp", "NTPs", FileCheck2)}
        </div>
      </div>

      <div className="space-y-4">
        {/* Sub-tab bar (built-in + custom) with an Add button. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {subtabs.map((t) => (
            <button key={t.k} onClick={() => setSub(t.k)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${sub === t.k ? "bg-primary text-white shadow" : "bg-slate-50 text-slate-500 hover:text-slate-900"}`}>
              <FolderOpen size={12} /> {t.label}
            </button>
          ))}
          {canEdit && <button onClick={addSubtab} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-900 text-white hover:bg-primary"><Plus size={12} /> Add sub-tab</button>}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-400 flex items-center gap-1.5"><ChevronRight size={12} /> {active.hint}</p>
          {canEdit && activeCustomRow && (
            <div className="flex items-center gap-1">
              <button onClick={() => renameSubtab(activeCustomRow)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 hover:bg-slate-100"><Pencil size={11} /> Rename</button>
              <button onClick={() => removeSubtab(activeCustomRow)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-rose-500 hover:bg-rose-50"><Trash2 size={11} /> Delete</button>
            </div>
          )}
        </div>

        {active.special === "amendments" ? (
          <StructuredTable
            projectId={projectId} tableKey="project-info-amendments" canEdit={canEdit} addLabel="Add amendment"
            columns={[
              { key: "number", label: "Amendment / Addendum No.", placeholder: "Amendment 1", width: "160px" },
              { key: "title", label: "Title / Subject", placeholder: "Subject", width: "180px" },
              { key: "description", label: "Description", placeholder: "What changed…", width: "240px" },
              { key: "date", label: "Date Issued", type: "date", width: "130px" },
            ]}
          />
        ) : (
          <DocSection key={active.section} projectId={projectId} section={active.section} title={active.label} canEdit={canEdit} canPublish={false} />
        )}

        {active.special === "communications" && (
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Requests &amp; letters to the client</p>
            <RequestBuilder projectId={projectId} category="client-comms" canEdit={canEdit} projectInfo={projectInfo} clientName={clientName} />
          </div>
        )}
      </div>

      {dialogs}
    </div>
  );
}
