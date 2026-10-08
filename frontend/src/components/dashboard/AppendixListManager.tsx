import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, BookmarkPlus, Check, EyeOff, FileText, Loader2, Paperclip, Pencil, Plus, SeparatorHorizontal, Trash2, Upload, X } from "lucide-react";
import type { ProposalAttachment, ProposalDoc, ProposalSectionMeta } from "../../lib/api";
import { APPENDIX_LIBRARY } from "../../lib/proposalLibrary";
import CompanyDocPicker from "./CompanyDocPicker";

/**
 * 2026-10-08 - "the list of attachments / appendices in the proposal builder should be editable:
 * change, upload, delete, rename, a standard attachments list, an option for a page separator...
 * and the list could be used in other projects." This document's appendices, in print order, in one
 * place: rename, files (upload several, from Company Documents, remove), the separator page before
 * each, order, delete, add; and the company's standard list (load it, or save this list as it, with
 * its files and separators, for every other project). Read view first; Edit to change.
 */
export type AppendixRow = { meta: ProposalSectionMeta; files: ProposalAttachment[] };

export default function AppendixListManager({ title, numberOf, rows, canEdit, companyDocs, fileHref, onRename, onSeparator, onMove, onDelete, onUpload, onRemoveFile, onAddDocs, onAdd, onSaveStandard, standard }: {
  title: string;
  /** "Appendix 1" / "Appendix A" for the row at this index. */
  numberOf: (i: number) => string;
  rows: AppendixRow[];
  canEdit: boolean;
  companyDocs: ProposalDoc[];
  fileHref: (url: string) => string;
  onRename: (meta: ProposalSectionMeta, title: string) => void;
  onSeparator: (meta: ProposalSectionMeta, on: boolean) => void;
  onMove: (meta: ProposalSectionMeta, dir: -1 | 1) => void;
  onDelete: (meta: ProposalSectionMeta) => void;
  onUpload: (meta: ProposalSectionMeta, files: File[]) => Promise<void>;
  onRemoveFile: (meta: ProposalSectionMeta, index: number) => void;
  onAddDocs: (meta: ProposalSectionMeta, docs: ProposalDoc[]) => void;
  onAdd: (title: string) => void;
  onSaveStandard: () => void;
  /** The company's standard list: load it into this document, or edit it (StandardAppendices). */
  standard?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState("");
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const edit = canEdit && editing;
  const add = () => { const t = adding.trim(); if (!t) return; onAdd(t); setAdding(""); };

  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><Paperclip size={15} className="text-primary" /> {title}</h4>
          <p className="mt-0.5 text-[11px] text-slate-400">Printed at the end of the document, in this order. The same appendices are in the Builder's Sections list.</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            {standard}
            {edit && (
              <button type="button" onClick={onSaveStandard} disabled={!rows.length} title="Make this list (titles, files, separators) the standard every project can load"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
                <BookmarkPlus size={12} /> Save as the standard list
              </button>
            )}
            {!editing
              ? <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-primary"><Pencil size={12} /> Edit</button>
              : <button type="button" onClick={() => { setEditing(false); setPickFor(null); }} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"><Check size={12} /> Done</button>}
          </div>
        )}
      </div>

      {rows.length === 0
        ? <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">No attachments yet. {canEdit ? "Load the standard list, or click Edit to add them." : ""}</p>
        : (
          <ol className="space-y-2">
            {rows.map(({ meta, files }, i) => (
              <li key={meta.id} className={`rounded-2xl border px-3 py-2.5 ${meta.hidden ? "border-slate-100 bg-slate-50/60 opacity-70" : "border-slate-100 bg-white"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{numberOf(i)}</span>
                  {edit
                    ? <input defaultValue={meta.title} key={meta.title} onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== meta.title) onRename(meta, t); }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        aria-label={`Title of ${numberOf(i)}`} className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/15" />
                    : <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800" title={meta.title}>{meta.title}</span>}
                  {meta.hidden && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500"><EyeOff size={10} /> Hidden</span>}
                  {edit ? (
                    <label className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600" title="A separator page (the appendix's title page) before it">
                      <input type="checkbox" checked={meta.divider !== false} onChange={(e) => onSeparator(meta, e.target.checked)} className="accent-emerald-600" />
                      <SeparatorHorizontal size={11} /> Separator page
                    </label>
                  ) : (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${meta.divider !== false ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                      <SeparatorHorizontal size={10} /> {meta.divider !== false ? "Separator" : "No separator"}
                    </span>
                  )}
                  {edit && (
                    <span className="ml-auto flex items-center gap-0.5">
                      <button type="button" onClick={() => onMove(meta, -1)} disabled={i === 0} aria-label="Move up" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"><ArrowUp size={13} /></button>
                      <button type="button" onClick={() => onMove(meta, 1)} disabled={i === rows.length - 1} aria-label="Move down" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"><ArrowDown size={13} /></button>
                      <button type="button" onClick={() => onDelete(meta)} aria-label={`Delete ${meta.title}`} className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1">
                  {files.length === 0 && <span className="text-[11px] italic text-slate-400">No file yet{edit ? "" : "."}</span>}
                  {files.map((f, k) => (
                    <span key={`${f.url}-${k}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white py-0.5 pl-2 pr-1 text-[10px] font-bold text-slate-600">
                      <a href={fileHref(f.url)} target="_blank" rel="noreferrer" className="inline-flex max-w-[14rem] items-center gap-1 truncate hover:text-primary" title={f.name}><FileText size={10} className="shrink-0" /> {f.name}</a>
                      {f.companyFileId && <span className="rounded-full bg-primary/10 px-1.5 text-[8px] uppercase tracking-wider text-primary" title="From Company Documents">Company</span>}
                      {edit && <button type="button" onClick={() => onRemoveFile(meta, k)} aria-label={`Remove ${f.name}`} className="text-slate-300 hover:text-red-500"><X size={11} /></button>}
                    </span>
                  ))}
                  {edit && (
                    <>
                      <label className={`inline-flex cursor-pointer items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200 ${busy === meta.id ? "pointer-events-none opacity-60" : ""}`}>
                        {busy === meta.id ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Upload files
                        <input type="file" multiple className="hidden" onChange={(e) => {
                          const picked = Array.from<File>(e.target.files || []); e.target.value = "";
                          if (!picked.length) return;
                          setBusy(meta.id);
                          void onUpload(meta, picked).finally(() => setBusy(null));
                        }} />
                      </label>
                      <button type="button" onClick={() => setPickFor(meta.id)} className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/20"><FileText size={11} /> From Company Documents</button>
                      {pickFor === meta.id && (
                        <CompanyDocPicker docs={companyDocs} suggestKey={meta.libraryKey}
                          already={new Set(files.map((f) => f.companyFileId || "").filter(Boolean))}
                          onPick={(docs) => onAddDocs(meta, docs)} onClose={() => setPickFor(null)} />
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

      {edit && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <input value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            list="appendix-library-titles" placeholder="Add an attachment: pick a type or type a title" aria-label="New attachment title"
            className="min-w-[16rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/15" />
          <datalist id="appendix-library-titles">{APPENDIX_LIBRARY.map((a) => <option key={a.key} value={a.title} />)}</datalist>
          <button type="button" onClick={add} disabled={!adding.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-40"><Plus size={13} /> Add</button>
        </div>
      )}
    </div>
  );
}
