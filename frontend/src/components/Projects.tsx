import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { fetchPublicProjects, ApiPublicProject } from "../lib/api";
import ProjectCard from "./ProjectCard";
import ProjectShowcaseModal from "./ProjectShowcaseModal";

export default function Projects() {
  const navigate = useNavigate();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [projects, setProjects] = useState<ApiPublicProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showcaseId, setShowcaseId] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const cardWidth = card?.offsetWidth ?? el.clientWidth / 3;
    const gap = 32;
    el.scrollBy({ left: dir * (cardWidth + gap), behavior: "smooth" });
  };

  return (
    <section id="projects" className="py-24 bg-slate-50">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
          <div className="max-w-2xl">
            <h2 className="font-display text-4xl md:text-5xl font-bold text-slate-900 mb-6">
              Our <span className="text-secondary">Work</span> Gallery
            </h2>
            <p className="text-lg text-slate-500">
              We have implemented many projects of similar natures across the globe,
              meeting complex requirements with surgical precision.
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => scrollBy(-1)}
              aria-label="Scroll left"
              className="w-12 h-12 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-white hover:border-primary hover:text-primary transition-all shadow-sm"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              onClick={() => scrollBy(1)}
              aria-label="Scroll right"
              className="w-12 h-12 rounded-full bg-gt-gradient flex items-center justify-center text-white shadow-lg shadow-primary/20 hover:scale-105 transition-all"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-300">
            <Loader2 size={28} className="animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 text-slate-400 font-medium">
            No published projects yet. Check back soon.
          </div>
        ) : (
          <motion.div
            ref={scrollerRef}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="flex gap-8 overflow-x-auto snap-x snap-mandatory pb-6 -mx-6 px-6 scroll-smooth [scrollbar-width:thin]"
          >
            {projects.map((project) => (
              <div
                key={project.id}
                data-card
                className="snap-start flex-shrink-0 w-full sm:w-[calc(50%-1rem)] lg:w-[calc(33.333%-1.334rem)]"
              >
                <ProjectCard project={project} onOpen={setShowcaseId} />
              </div>
            ))}
          </motion.div>
        )}

        <div className="mt-20 text-center">
          <button
            onClick={() => navigate("/projects")}
            className="px-12 py-5 rounded-full border-2 border-primary text-primary font-bold hover:bg-primary hover:text-white transition-all text-lg"
          >
            View All Projects
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showcaseId && <ProjectShowcaseModal projectId={showcaseId} onClose={() => setShowcaseId(null)} />}
      </AnimatePresence>
    </section>
  );
}
