import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Briefcase, Tag as TagIcon, LayoutGrid } from "lucide-react";
import type { ProfileTask } from "../../lib/api";

// CR-P — a read-only "campaign" (Kanban) view of someone's tasks, grouped by column, used on the
// user profile and the Directory company profile. Cards link to the task's project board.
export default function TaskMiniBoard({ tasks, loading }: { tasks: ProfileTask[]; loading: boolean }) {
  const navigate = useNavigate();
  const groups = useMemo(() => {
    const m = new Map<string, { title: string; order: number; tasks: ProfileTask[] }>();
    for (const t of tasks) {
      const key = t.columnTitle || "Other";
      const g = m.get(key) || { title: key, order: t.columnOrder, tasks: [] };
      g.tasks.push(t); g.order = Math.min(g.order, t.columnOrder); m.set(key, g);
    }
    return Array.from(m.values()).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  }, [tasks]);

  if (loading) return <div className="py-10 flex justify-center text-slate-300"><Loader2 size={20} className="animate-spin" /></div>;
  if (!tasks.length) return (
    <div className="text-center py-12 text-slate-400 bg-white rounded-3xl border border-slate-100">
      <LayoutGrid size={30} className="mx-auto mb-2 text-slate-200" />
      <p className="text-sm font-medium">No tasks yet.</p>
    </div>
  );

  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-2">
      {groups.map((g) => (
        <div key={g.title} className="w-64 shrink-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5">
          <div className="flex items-center gap-1.5 px-1 py-1 mb-1">
            <span className="font-bold text-sm text-slate-700 truncate">{g.title}</span>
            <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 rounded-full px-1.5">{g.tasks.length}</span>
          </div>
          <div className="space-y-2">
            {g.tasks.map((t) => (
              <button key={t._id} onClick={() => navigate(`/dashboard/projects/${t.projectId}?tab=pm`)} className="w-full text-left bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-primary/30 p-2.5 transition-all">
                <p className="text-sm font-semibold text-slate-800 leading-snug">{t.title || "Untitled"}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {t.projectName && <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600"><Briefcase size={8} /> {t.projectName}</span>}
                  {t.subtasksTotal > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{t.subtasksDone}/{t.subtasksTotal} ✓</span>}
                  {t.tags.slice(0, 2).map((tag) => <span key={tag} className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500"><TagIcon size={8} /> {tag}</span>)}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
