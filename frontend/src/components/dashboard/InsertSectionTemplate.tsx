import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Search, FolderOpen, Library, Loader2, Plus, Trash2, FileText, ArrowLeft } from "lucide-react";
import RichTextEditor from "./RichTextEditor";
import {
  fetchProposalSourceProjects, fetchProposalSourceSections, resolveProposalLayout, PROPOSAL_BUILTINS, FINANCIAL_BUILTINS,
  type ApiProposalTemplate, type ProposalSourceProject, type ProposalSourceContent, type ProposalSubsection, type ProposalSection,
} from "../../lib/api";

/**
 * CR 200 - "Insert from template" with its two sources:
 *   From projects (automatic): every project's current proposal is a template, section by section.
 *   From saved templates (manual): a library you build by pasting a section in and naming it.
 */

export interface InsertPayload {
  title: string;
  body: string;
  subsections: ProposalSubsection[];
  from: string;          // where it came from, for the toast
  copyTitle: boolean;
  copySubs: boolean;
}

const plain = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const words = (html: string) => (plain(html) ? plain(html).split(" ").length : 0);
const uid = () => Math.random().toString(36).slice(2, 10);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

type Tab = "projects" | "library";
type Row = { key: string; vol: "technical" | "financial"; title: string; body: string; subsections: ProposalSubsection[] };

export default function InsertSectionTemplate({ sectionTitle, currentProjectId, templates, onInsert, onSaveTemplate, onDeleteTemplate, onClose }: {
  sectionTitle: string;
  currentProjectId: string;
  templates: ApiProposalTemplate[];
  onInsert: (p: InsertPayload) => void;
  onSaveTemplate: (name: string, body: string) => Promise<void>;
  onDeleteTemplate?: (t: ApiProposalTemplate) => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("projects");
  const [q, setQ] = useState("");
  const [copyTitle, setCopyTitle] = useState(false);
  const [copySubs, setCopySubs] = useState(true);

  // From projects
  const [projects, setProjects] = useState<ProposalSourceProject[] | null>(null);
  const [openProject, setOpenProject] = useState<ProposalSourceProject | null>(null);
  const [content, setContent] = useState<ProposalSourceContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pickedKey, setPickedKey] = useState("");

  // From the library
  const [pickedTpl, setPickedTpl] = useState<ApiProposalTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBody, setNewBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    fetchProposalSourceProjects()
      .then((rows) => { if (alive) setProjects(rows.filter((p) => p.projectId !== currentProjectId)); })
      .catch((e) => { if (alive) { setProjects([]); setError(e instanceof Error ? e.message : "Could not load projects."); } });
    return () => { alive = false; };
  }, [currentProjectId]);

  const openIt = async (p: ProposalSourceProject) => {
    setOpenProject(p); setPickedKey(""); setContent(null); setError(""); setLoading(true);
    try { setContent(await fetchProposalSourceSections(p.projectId)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not open that proposal."); }
    finally { setLoading(false); }
  };

  // The other project's sections, in the order that proposal prints them, titled as it titles them.
  const rows = useMemo<Row[]>(() => {
    if (!content) return [];
    const out: Row[] = [];
    (["technical", "financial"] as const).forEach((vol) => {
      const v = content[vol];
      const secs = (v.sections || []) as unknown as ProposalSection[];
      const layout = resolveProposalLayout({ sections: secs, layout: v.layout }, vol === "financial" ? FINANCIAL_BUILTINS : PROPOSAL_BUILTINS);
      layout.forEach((m) => {
        if (m.kind !== "custom" && m.kind !== "blank") return;   // built-ins hold no free text
        const s = secs.find((x) => x.id === m.refId);
        if (!s || !plain(String(s.body || ""))) return;
        out.push({ key: `${vol}-${m.id}`, vol, title: m.title || s.heading || "Untitled section", body: String(s.body || ""), subsections: (s.subsections || []) as ProposalSubsection[] });
      });
    });
    return out;
  }, [content]);

  const projectList = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (projects || []).filter((p) => !n || `${p.name} ${p.projectId}`.toLowerCase().includes(n));
  }, [projects, q]);

  const sectionList = useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows.filter((r) => !n || `${r.title} ${plain(r.body).slice(0, 400)}`.toLowerCase().includes(n));
  }, [rows, q]);

  const libraryList = useMemo(() => {
    const n = q.trim().toLowerCase();
    return templates.filter((t) => !n || `${t.name} ${t.description || ""}`.toLowerCase().includes(n));
  }, [templates, q]);

  const picked = rows.find((r) => r.key === pickedKey) || null;
  const preview = tab === "projects"
    ? (picked ? { title: picked.title, body: picked.body, subs: picked.subsections, from: `${openProject?.name || "another project"} · ${picked.title}` } : null)
    : (pickedTpl ? { title: pickedTpl.name, body: String((pickedTpl.content as { body?: string } | undefined)?.body || ""), subs: [] as ProposalSubsection[], from: pickedTpl.name } : null);

  const insert = () => {
    if (!preview) return;
    onInsert({
      title: preview.title,
      body: preview.body,
      subsections: copySubs ? preview.subs.map((s) => ({ ...s, id: uid() })) : [],
      from: preview.from,
      copyTitle,
      copySubs,
    });
  };

  const saveNew = async () => {
    if (!newName.trim() || !plain(newBody)) return;
    setSaving(true);
    try { await onSaveTemplate(newName.trim(), newBody); setCreating(false); setNewName(""); setNewBody(""); }
    finally { setSaving(false); }
  };

  const tabBtn = (k: Tab, icon: ReactNode, label: string, hint: string) => (
    <button
      onClick={() => { setTab(k); setQ(""); }}
      className={`flex-1 flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-left ${tab === k ? "border-primary/30 bg-primary/5" : "border-slate-200 hover:bg-slate-50"}`}
    >
      <span className={tab === k ? "text-primary mt-0.5" : "text-slate-400 mt-0.5"}>{icon}</span>
      <span>
        <span className="block text-xs font-bold text-slate-800">{label}</span>
        <span className="block text-[10px] text-slate-500 leading-snug">{hint}</span>
      </span>
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[170] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Insert from template" className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl my-8 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
          <div>
            <h3 className="font-display font-bold text-slate-900 text-base">Insert from template</h3>
            <p className="text-[11px] text-slate-400">Into "{sectionTitle || "this section"}". Whatever is written there now is replaced.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-50"><X size={16} /></button>
        </div>

        <div className="flex gap-2 px-6 pb-3">
          {tabBtn("projects", <FolderOpen size={15} />, "From a project", "Any project's proposal, section by section. Copy it in, then edit names and numbers.")}
          {tabBtn("library", <Library size={15} />, "Saved templates", "Your own library: paste a section once, name it, use it on every project.")}
        </div>

        <div className="px-6 pb-3 flex items-center gap-2">
          {tab === "projects" && openProject && (
            <button onClick={() => { setOpenProject(null); setContent(null); setPickedKey(""); setQ(""); }} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-primary shrink-0">
              <ArrowLeft size={12} /> Projects
            </button>
          )}
          <label className="flex flex-1 items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-primary/20">
            <Search size={14} className="text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tab === "library" ? "Search saved templates" : openProject ? "Search this proposal's sections" : "Search projects by name or number"}
              className="flex-1 text-xs outline-none"
              aria-label="Search"
            />
          </label>
          {tab === "library" && (
            <button onClick={() => { setCreating((v) => !v); setPickedTpl(null); }} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-primary">
              <Plus size={12} /> Create template
            </button>
          )}
        </div>

        <div className="grid flex-1 min-h-0 gap-4 px-6 pb-4 md:grid-cols-2">
          {/* Left: what you can pick */}
          <div className="min-h-0 overflow-y-auto rounded-2xl border border-slate-100 p-2">
            {error && <p className="px-3 py-2 text-[11px] font-bold text-rose-600">{error}</p>}

            {tab === "projects" && !openProject && (
              <>
                {projects === null && <p className="flex items-center gap-2 px-3 py-6 text-xs text-slate-400"><Loader2 size={13} className="animate-spin" /> Loading projects…</p>}
                {projects !== null && projectList.length === 0 && <p className="px-3 py-6 text-center text-xs italic text-slate-400">No other project has proposal text yet.</p>}
                {projectList.map((p) => (
                  <button key={p.projectId} onClick={() => void openIt(p)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-slate-800">{p.name}</span>
                      <span className="block text-[10px] text-slate-400">{p.projectId} · {plural(p.technicalSections + p.financialSections, "section")} · {p.words.toLocaleString()} words</span>
                    </span>
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-300">{p.status}</span>
                  </button>
                ))}
              </>
            )}

            {tab === "projects" && openProject && (
              <>
                {loading && <p className="flex items-center gap-2 px-3 py-6 text-xs text-slate-400"><Loader2 size={13} className="animate-spin" /> Opening {openProject.name}…</p>}
                {!loading && sectionList.length === 0 && <p className="px-3 py-6 text-center text-xs italic text-slate-400">Nothing written in that proposal{q ? " matches" : ""}.</p>}
                {sectionList.map((r) => (
                  <button key={r.key} onClick={() => setPickedKey(r.key)} className={`flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left ${pickedKey === r.key ? "bg-primary/5" : "hover:bg-slate-50"}`}>
                    <FileText size={13} className="mt-0.5 shrink-0 text-slate-300" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-slate-800">{r.title}</span>
                      <span className="block text-[10px] text-slate-400">{r.vol === "financial" ? "Financial" : "Technical"} · {words(r.body)} words{r.subsections.length ? ` · ${plural(r.subsections.length, "subsection")}` : ""}</span>
                    </span>
                  </button>
                ))}
              </>
            )}

            {tab === "library" && (
              <>
                {libraryList.length === 0 && <p className="px-3 py-6 text-center text-xs italic text-slate-400">No saved section templates yet. "Create template" paste one in.</p>}
                {libraryList.map((t) => (
                  <div key={t._id} className={`flex items-start gap-2 rounded-xl px-3 py-2.5 ${pickedTpl?._id === t._id ? "bg-primary/5" : "hover:bg-slate-50"}`}>
                    <button onClick={() => { setPickedTpl(t); setCreating(false); }} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-xs font-bold text-slate-800">{t.name}</span>
                      <span className="block text-[10px] text-slate-400">
                        {words(String((t.content as { body?: string } | undefined)?.body || ""))} words{t.createdByName ? ` · ${t.createdByName}` : ""}{t.builtin ? " · Built in" : ""}
                      </span>
                    </button>
                    {onDeleteTemplate && !t.builtin && (
                      <button onClick={() => void onDeleteTemplate(t)} title={`Delete "${t.name}"`} aria-label={`Delete ${t.name}`} className="rounded p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Right: what you are about to insert */}
          <div className="flex min-h-0 flex-col gap-2">
            {creating && tab === "library" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-2xl border border-slate-100 p-3">
                <p className="text-[11px] text-slate-500">Paste a section from an old proposal, name it, and it is available on every project.</p>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Template name, e.g. Quality Control Plan" aria-label="Template name" className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/20" />
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <RichTextEditor value={newBody} onChange={setNewBody} placeholder="Paste the section here…" minHeight={180} />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setCreating(false)} className="rounded-xl px-3 py-2 text-[11px] font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
                  <button onClick={() => void saveNew()} disabled={saving || !newName.trim() || !plain(newBody)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-[11px] font-bold text-white hover:bg-primary disabled:opacity-40">
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Save template
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-100 p-4">
                  {!preview && <p className="py-10 text-center text-xs italic text-slate-400">{tab === "library" ? "Pick a template to see it here." : openProject ? "Pick a section to see it here." : "Pick a project, then one of its sections."}</p>}
                  {preview && (
                    <>
                      <p className="mb-1 text-xs font-bold text-slate-800">{preview.title}</p>
                      <p className="mb-3 text-[10px] text-slate-400">{words(preview.body)} words{preview.subs.length ? ` · ${plural(preview.subs.length, "subsection")}` : ""}</p>
                      <div className="prose prose-sm max-w-none text-[11px] leading-relaxed text-slate-600 [&_img]:max-w-full [&_table]:text-[10px]" dangerouslySetInnerHTML={{ __html: preview.body }} />
                      {preview.subs.map((s) => (
                        <div key={s.id} className="mt-3 border-t border-slate-100 pt-2">
                          <p className="text-[11px] font-bold text-slate-700">{s.heading || "Subsection"}</p>
                          <div className="prose prose-sm max-w-none text-[11px] leading-relaxed text-slate-500" dangerouslySetInnerHTML={{ __html: s.body }} />
                        </div>
                      ))}
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={copyTitle} onChange={(e) => setCopyTitle(e.target.checked)} className="accent-emerald-600" /> Also use its title</label>
                    {!!preview?.subs.length && <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={copySubs} onChange={(e) => setCopySubs(e.target.checked)} className="accent-emerald-600" /> Copy its subsections</label>}
                  </div>
                  <button onClick={insert} disabled={!preview || !plain(preview.body)} className="rounded-xl bg-slate-900 px-4 py-2 text-[11px] font-bold text-white hover:bg-primary disabled:opacity-40">
                    Insert into this section
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">Text, images and tables are copied. Files attached to that section are not: attach this project's own files below.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
