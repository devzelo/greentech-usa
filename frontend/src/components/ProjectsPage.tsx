import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useMeta } from "../hooks/useMeta";
import type { ProjectStatus } from "../data/projects";
import { fetchPublicProjects, ApiPublicProject } from "../lib/api";
import ProjectCard from "./ProjectCard";
import ProjectShowcaseModal from "./ProjectShowcaseModal";
import { AnimatePresence } from "motion/react";
import ViewToggle, { useViewMode } from "./ViewToggle";

const STATUS_FILTERS: ("All Statuses" | Exclude<ProjectStatus, "Draft">)[] = [
  "All Statuses",
  "Ongoing",
  "Pending",
  "Completed",
];

export default function ProjectsPage() {
  useMeta({
    title: "Projects — Our Global Engineering Portfolio",
    description:
      "Browse GreenTech USA's portfolio of completed and ongoing water, wastewater, energy, and HVAC projects across the United States, Africa, and the Middle East. Filter by status and budget tier.",
  });
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("All Statuses");
  const [projects, setProjects] = useState<ApiPublicProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useViewMode("grid");
  const [showcaseId, setShowcaseId] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    fetchPublicProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  // Deep link: /projects?showcase=PROJ-XXX opens that project's modal (e.g. "View on website").
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("showcase");
    if (id) setShowcaseId(id);
  }, [location.search]);

  const filtered = useMemo(() => {
    return projects.filter((p) => statusFilter === "All Statuses" || p.status === statusFilter);
  }, [statusFilter, projects]);

  // Smooth-scroll to a specific project when arriving with /projects#PROJ-XXX
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    // Wait for the grid to render before scrolling
    const t = setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => clearTimeout(t);
  }, [location.hash, filtered.length]);

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative h-[70vh] min-h-[500px] flex items-center justify-center overflow-hidden pt-40 md:pt-32">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-slate-950/60 z-10" />
          <img
            src="https://images.unsplash.com/photo-1540339832862-47455914d68b?auto=format&fit=crop&q=80&w=2000"
            alt="Projects Hero"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&q=80&w=2000";
            }}
          />
        </div>

        <div className="container mx-auto px-6 relative z-20 text-center text-white">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto"
          >
            <h1 className="font-display text-5xl md:text-7xl font-bold mb-6 tracking-tight leading-[1.1]">
              Our exciting projects <span className="text-gt-gradient">are revealing</span>
            </h1>
            <p className="text-base md:text-lg font-normal opacity-90 leading-relaxed max-w-3xl mx-auto">
              Browse the full portfolio of water treatment, wastewater, energy, and HVAC projects
              published by our engineering teams across the globe.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Filters */}
      <section className="py-12 bg-white relative z-30 -mt-16">
        <div className="container mx-auto px-6">
          <div className="glass max-w-6xl mx-auto rounded-[2.5rem] p-6 shadow-2xl border-white/50 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_FILTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all ${
                        statusFilter === s
                          ? "bg-gt-gradient text-white shadow-lg shadow-primary/20"
                          : "bg-slate-100 text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </div>
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="py-20 bg-white min-h-[600px]">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="font-display text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
              Projects
            </h2>
            <p className="text-slate-500 text-lg">
              {filtered.length} {filtered.length === 1 ? "project" : "projects"} matching your filters.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-300">
              <Loader2 size={28} className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-slate-400 font-medium">
              {projects.length === 0 ? "No published projects yet." : "No projects match the selected filters."}
            </div>
          ) : (
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto"
                  : "flex flex-col gap-3 max-w-4xl mx-auto"
              }
            >
              {filtered.map((project, i) => (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                >
                  <ProjectCard project={project} variant={viewMode} onOpen={setShowcaseId} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {showcaseId && <ProjectShowcaseModal projectId={showcaseId} onClose={() => setShowcaseId(null)} />}
      </AnimatePresence>
    </div>
  );
}
