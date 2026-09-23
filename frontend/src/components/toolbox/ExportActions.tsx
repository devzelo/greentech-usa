import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, FolderPlus, Loader2, Save, Trash2, X } from "lucide-react";
import { fetchProjects, saveToolboxFile, uploadDocument, userFileUrl, type ApiProject } from "../../lib/api";
import { toast } from "../../lib/toast";
import ShareMenu from "../dashboard/ShareMenu";

// "GT Integration" row shared by every tool that produces a file:
// Save | Copy | Download | Attach to project (and its document folder) | Share | Delete.

export type ExportAction = "save" | "copy" | "download" | "attach" | "share" | "delete";

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

export default function ExportActions({
  getFile, copyText, onDelete, deleteLabel = "Delete", actions = ["save", "copy", "download", "attach", "share", "delete"], disabled, version,
}: {
  /** Builds the file to save / attach / download. */
  getFile: () => Promise<File>;
  /** For text tools: what Copy puts on the clipboard (otherwise an image file is copied). */
  copyText?: () => string;
  onDelete?: () => void;
  deleteLabel?: string;
  actions?: ExportAction[];
  disabled?: boolean;
  /** Changes whenever the content changes, so "Saved" / Share point at the new version. */
  version?: unknown;
}) {
  const [busy, setBusy] = useState<ExportAction | "">("");
  const [savedUrl, setSavedUrl] = useState("");
  useEffect(() => { setSavedUrl(""); }, [version]);
  const [attachOpen, setAttachOpen] = useState(false);

  const run = async (key: ExportAction, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast(e instanceof Error ? e.message : "Something went wrong.", "error"); } finally { setBusy(""); }
  };

  const save = () => run("save", async () => {
    const f = await saveToolboxFile(await getFile());
    setSavedUrl(userFileUrl(f));
    toast("Saved to your toolbox files (also under My Profile).", "success");
  });

  const copy = () => run("copy", async () => {
    if (copyText) { await navigator.clipboard.writeText(copyText()); toast("Copied.", "success"); return; }
    const f = await getFile();
    if (!f.type.startsWith("image/")) throw new Error("Only images can be copied. Use Download or Save instead.");
    const png = f.type === "image/png" ? f : await toPng(f);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    toast("Image copied. Paste it into a chat, email or document.", "success");
  });

  const download = () => run("download", async () => { const f = await getFile(); downloadBlob(f, f.name); });

  const has = (a: ExportAction) => actions.includes(a);
  const btn = "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary disabled:opacity-40";
  const icon = (k: ExportAction, I: typeof Save) => busy === k ? <Loader2 size={12} className="animate-spin" /> : <I size={12} />;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {has("save") && <button type="button" disabled={disabled || !!busy} onClick={save} className={btn} title="Keep it in your toolbox files">{savedUrl ? <Check size={12} /> : icon("save", Save)} {savedUrl ? "Saved" : "Save"}</button>}
      {has("copy") && <button type="button" disabled={disabled || !!busy} onClick={copy} className={btn}>{icon("copy", Copy)} Copy</button>}
      {has("download") && <button type="button" disabled={disabled || !!busy} onClick={download} className={btn}>{icon("download", Download)} Download</button>}
      {has("attach") && <button type="button" disabled={disabled || !!busy} onClick={() => setAttachOpen(true)} className={btn} title="Add it to a project's documents">{icon("attach", FolderPlus)} Attach to project</button>}
      {has("share") && !disabled && (
        <ShareMenu
          variant="button"
          fileName="Toolbox file"
          fileUrl={savedUrl}
          prepareFile={async () => {
            if (savedUrl) return savedUrl;
            const f = await saveToolboxFile(await getFile());
            const url = userFileUrl(f);
            setSavedUrl(url);
            return url;
          }}
        />
      )}
      {has("delete") && onDelete && (
        <button type="button" disabled={!!busy} onClick={onDelete} className={`${btn} hover:!border-red-300 hover:!text-red-600`}><Trash2 size={12} /> {deleteLabel}</button>
      )}
      {attachOpen && <AttachDialog getFile={getFile} onClose={() => setAttachOpen(false)} />}
    </div>
  );
}

async function toPng(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not copy the image."))), "image/png"));
}

// Project document folders a tool file can go into (same keys as the project tabs use).
export const ATTACH_SECTIONS: Array<{ key: string; label: string; group: string }> = [
  { key: "project-info-other", label: "Other Project Docs", group: "Project Info" },
  { key: "project-info-rfp", label: "RFP / Solicitation", group: "Project Info" },
  { key: "project-info-specifications", label: "Specifications", group: "Project Info" },
  { key: "project-info-bidding", label: "Bidding Documents", group: "Project Info" },
  { key: "project-info-change-orders", label: "Change Orders", group: "Project Info" },
  { key: "project-info-award", label: "Award Documents", group: "Project Info" },
  { key: "project-info-postaward", label: "Post Award Documents", group: "Project Info" },
  { key: "project-info-cpars", label: "CPARS Evaluations", group: "Project Info" },
  { key: "pm-schedules", label: "Schedules", group: "Project Management" },
  { key: "pm-meeting-minutes", label: "Meeting Minutes", group: "Project Management" },
  { key: "pm-progress-reports", label: "Progress Reports", group: "Project Management" },
  { key: "pm-site-data", label: "Site Data / Photos", group: "Project Management" },
  { key: "pm-closeout", label: "Closeout Documents", group: "Project Management" },
  { key: "tech-drawings", label: "Drawings", group: "Technical Docs" },
  { key: "tech-reports", label: "Technical Reports", group: "Technical Docs" },
  { key: "tech-lab-results", label: "Lab Test Results", group: "Technical Docs" },
  { key: "legal-insurance", label: "Insurance Certificates", group: "Legal Docs" },
  { key: "legal-tax", label: "Tax Documents", group: "Legal Docs" },
];

export function AttachDialog({ getFile, onClose, defaultProjectId }: { getFile: () => Promise<File>; onClose: () => void; defaultProjectId?: string }) {
  const [projects, setProjects] = useState<ApiProject[] | null>(null);
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [section, setSection] = useState(ATTACH_SECTIONS[0].key);
  const [folder, setFolder] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    fetchProjects("mine").then((p) => setProjects(p.filter((x) => !x.archived))).catch(() => setProjects([]));
    getFile().then((f) => setName(f.name)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Default to the project that is open on screen.
  useEffect(() => {
    if (projectId || !projects?.length) return;
    const m = /\/dashboard\/projects\/([^/?#]+)/.exec(window.location.pathname);
    const open = m && projects.find((p) => p.id === decodeURIComponent(m[1]));
    if (open) setProjectId(open.id);
  }, [projects, projectId]);

  const submit = async () => {
    if (!projectId) { toast("Choose a project.", "error"); return; }
    setBusy(true);
    try {
      const f = await getFile();
      const clean = name.trim() || f.name;
      const file = clean === f.name ? f : new File([f], clean.includes(".") ? clean : `${clean}.${f.name.split(".").pop()}`, { type: f.type });
      await uploadDocument(projectId, file, section, false, folder.trim());
      const p = projects?.find((x) => x.id === projectId);
      toast(`Attached to ${p?.name || "the project"} (${ATTACH_SECTIONS.find((s) => s.key === section)?.label}).`, "success");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not attach the file.", "error");
    } finally { setBusy(false); }
  };

  const field = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none";
  const groups = Array.from(new Set(ATTACH_SECTIONS.map((s) => s.group)));
  return createPortal(
    <div data-toolbox-modal data-toolbox-attach className="fixed inset-0 z-[1250] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-display text-base font-bold text-slate-900">Attach to project</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block text-xs font-bold text-slate-500">Project
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={field} disabled={!projects}>
              <option value="">{projects ? "Choose a project" : "Loading projects..."}</option>
              {projects?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold text-slate-500">Document folder
            <select value={section} onChange={(e) => setSection(e.target.value)} className={field}>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {ATTACH_SECTIONS.filter((s) => s.group === g).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold text-slate-500">Subfolder <span className="font-medium text-slate-400">(optional, e.g. Site visit/March)</span>
            <input value={folder} onChange={(e) => setFolder(e.target.value)} className={field} placeholder="Top level" />
          </label>
          <label className="block text-xs font-bold text-slate-500">File name
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={submit} disabled={busy || !projectId} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />} Attach
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
