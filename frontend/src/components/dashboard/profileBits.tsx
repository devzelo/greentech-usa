import { type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Ban, ExternalLink } from "lucide-react";
import { toast } from "../../lib/toast";

// CR-P (16) — shared building blocks for the profile previews (admin user profile, Directory
// company profile, self profile), extracted from UserProfile/CompanyProfile so all three stay
// pixel-identical: stat tiles, deep-linking activity rows with the deleted-project blur, and
// highlightable sections.

export function StatTile({ label, value, icon: Icon, cls, onClick }: {
  label: string; value: number; icon: typeof Building2; cls: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-2.5 flex items-center gap-2.5 text-left w-full transition-all hover:border-primary/40 hover:shadow-md cursor-pointer"
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cls}`}><Icon size={15} /></div>
      <div className="min-w-0"><p className="text-lg font-bold text-slate-900 leading-none tabular-nums">{value}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate">{label}</p></div>
    </button>
  );
}

// Scroll a section into view and flash its highlight ring (the caller sets the highlight first).
export function jumpToSection(prefix: string, key: string, setHighlight: Dispatch<SetStateAction<string | null>>) {
  window.setTimeout(() => document.getElementById(`${prefix}-sec-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  window.setTimeout(() => setHighlight((h) => (h === key ? null : h)), 1800);
}

// A row that shows its project, and deep-links into that project (optionally to a specific tab via
// `query`). If the project was deleted, the row is blurred and clicking it explains why. Pass
// `self` for the Projects section, where the row IS the project (no separate project label).
export function ActivityRow({ primary, secondary, projectId, query, self = false, projById, to }: {
  primary: ReactNode; secondary: ReactNode; projectId?: string; query?: string; self?: boolean;
  projById: Record<string, string>;
  /** Open this in-app path instead of the project (a record that lives outside any project). */
  to?: string;
  // No @types/react in this project, so `key` must be declared for TS to accept it on this element.
  key?: string;
}) {
  const navigate = useNavigate();
  const projName = !self && projectId ? projById[projectId] : undefined;
  const deleted = !self && !!projectId && !projById[projectId];
  const open = () => {
    if (to) { navigate(to); return; }
    if (!projectId) return;
    if (deleted) { toast("This project has been deleted, so you can't open it.", "info"); return; }
    navigate(`/dashboard/projects/${projectId}${query ? `?${query}` : ""}`);
  };
  return (
    <button onClick={open} disabled={!projectId && !to}
      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs text-left transition-colors ${deleted ? "border-red-100 bg-red-50/30 opacity-50 hover:opacity-80 cursor-pointer" : projectId || to ? "border-slate-100 hover:border-primary/30 hover:bg-primary/5 cursor-pointer group" : "border-slate-100 cursor-default"}`}
      title={deleted ? "The project for this item was deleted, so you can't open it." : ""}>
      <span className="min-w-0 flex flex-col">
        <span className="font-bold text-slate-700 truncate flex items-center gap-1.5">{primary}</span>
        {projName && <span className="text-[10px] font-bold text-slate-400 truncate flex items-center gap-1"><Building2 size={9} /> {projName}</span>}
        {deleted && <span className="text-[10px] font-bold text-red-400 truncate flex items-center gap-1"><Ban size={9} /> Project deleted</span>}
      </span>
      <span className="text-slate-500 shrink-0 flex items-center gap-1.5">{secondary}{deleted ? <Ban size={11} className="text-red-300" /> : projectId || to ? <ExternalLink size={11} className="text-slate-300 group-hover:text-primary" /> : null}</span>
    </button>
  );
}

export function ProfileSection({ prefix, secKey, title, count, icon: Icon, highlight, rows, emptyHint }: {
  prefix: string; secKey: string; title: string; count: number; icon: typeof Building2;
  highlight: string | null; rows: ReactNode[]; emptyHint: string;
}) {
  return (
    <div id={`${prefix}-sec-${secKey}`} className={`scroll-mt-24 rounded-xl transition-all ${highlight === secKey ? "ring-2 ring-primary/40 ring-offset-2" : ""}`}>
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Icon size={13} /> {title} ({count})</p>
      {count === 0 ? <p className="text-xs text-slate-400 italic">{emptyHint}</p> : <div className="space-y-1.5">{rows}</div>}
    </div>
  );
}
