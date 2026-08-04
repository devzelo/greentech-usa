import { ArrowUpRight, MapPin, Calendar, DollarSign, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { formatBudget } from "../data/projects";

// A flexible shape that fits both static seed data and the live API response.
export interface DisplayProject {
  id: string;
  name: string;
  status: string;
  category?: string;
  location?: string;
  description?: string;
  desc?: string; // legacy alias used by static seed data
  startDate?: string;
  endDate?: string;
  image?: string;
  budget?: number;
}

const STATUS_STYLES: Record<string, string> = {
  Ongoing: "bg-blue-500/90 text-white",
  Completed: "bg-emerald-500/90 text-white",
  Pending: "bg-amber-500/90 text-white",
  Planning: "bg-violet-500/90 text-white",
  Draft: "bg-slate-500/90 text-white",
};

// Fallback hero image per category for projects without a custom image.
const CATEGORY_IMAGE: Record<string, string> = {
  "Water Treatment": "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&q=80&w=1200",
  "Wastewater": "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&q=80&w=1200",
  "Renewable Energy": "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&q=80&w=1200",
  "Commercial HVAC": "https://images.unsplash.com/photo-1565008576549-57569a49371d?auto=format&fit=crop&q=80&w=1200",
  "Grid Systems": "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&q=80&w=1200",
  "Environmental Engineering": "https://images.unsplash.com/photo-1473876637954-4b493d59fd97?auto=format&fit=crop&q=80&w=1200",
};
const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&q=80&w=1200";

interface Props {
  project: DisplayProject;
  variant?: "grid" | "list";
  /** When provided, opens the showcase modal instead of navigating. */
  onOpen?: (id: string) => void;
}

export default function ProjectCard({ project, variant = "grid", onOpen }: Props) {
  const image = project.image || CATEGORY_IMAGE[project.category || ""] || DEFAULT_IMAGE;
  const description = project.description || project.desc || "";
  const statusClass = STATUS_STYLES[project.status] || "bg-slate-500/90 text-white";

  if (variant === "list") {
    return (
      <Link
        to={`/projects#${project.id}`}
        id={project.id}
        onClick={(e) => { if (onOpen) { e.preventDefault(); onOpen(project.id); } }}
        className="group flex items-stretch bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all scroll-mt-32"
      >
        <div className="relative w-28 sm:w-36 flex-shrink-0 bg-slate-100">
          <img
            src={image}
            alt={project.name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = DEFAULT_IMAGE;
            }}
          />
        </div>
        <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {project.name}
            </h3>
            <span
              className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${statusClass}`}
            >
              {project.status}
            </span>
          </div>
          {description && (
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 hidden sm:block">
              {description}
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
            {project.category && (
              <span className="font-semibold text-primary">{project.category}</span>
            )}
            {project.location && (
              <span className="flex items-center gap-1">
                <MapPin size={11} className="text-slate-400" />
                <span className="truncate max-w-[140px]">{project.location}</span>
              </span>
            )}
            {(project.startDate || project.endDate) && (
              <span className="flex items-center gap-1 hidden sm:flex">
                <Calendar size={11} className="text-slate-400" />
                {project.startDate || "—"} → {project.endDate || "—"}
              </span>
            )}
            {typeof project.budget === "number" && project.budget > 0 && (
              <span className="flex items-center gap-1">
                <DollarSign size={11} className="text-slate-400" />
                {formatBudget(project.budget)}
              </span>
            )}
          </div>
        </div>
        <div className="hidden sm:flex items-center px-4 text-slate-300 group-hover:text-primary transition-colors">
          <ArrowUpRight size={20} />
        </div>
      </Link>
    );
  }

  return (
    <article
      id={project.id}
      className="group flex flex-col bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-2xl hover:border-primary/20 transition-all scroll-mt-32"
    >
      <div className="aspect-[4/3] relative overflow-hidden">
        <img
          src={image}
          alt={project.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = DEFAULT_IMAGE;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-transparent to-transparent" />

        <span
          className={`absolute top-4 left-4 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm ${statusClass}`}
        >
          {project.status}
        </span>

        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-primary uppercase tracking-widest shadow-sm flex items-center gap-1.5">
          <FileText size={11} /> {project.id}
        </div>

        {project.category && (
          <div className="absolute bottom-4 left-4 right-4">
            <span className="inline-block bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-3 py-1 text-[10px] font-bold text-white uppercase tracking-widest">
              {project.category}
            </span>
          </div>
        )}
      </div>

      <div className="p-6 flex flex-col flex-grow">
        <h3 className="font-display text-xl font-bold text-slate-900 mb-3 leading-tight group-hover:text-primary transition-colors line-clamp-2 min-h-[3.5rem]">
          {project.name}
        </h3>
        <p className="text-sm text-slate-500 leading-relaxed mb-5 line-clamp-3">
          {description || "—"}
        </p>

        <div className="space-y-2 pt-4 border-t border-slate-100 mb-5">
          {project.location && (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <MapPin size={14} className="text-primary flex-shrink-0" />
              <span className="font-medium">{project.location}</span>
            </div>
          )}
          {(project.startDate || project.endDate) && (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Calendar size={14} className="text-primary flex-shrink-0" />
              <span className="font-medium">{project.startDate || "—"} → {project.endDate || "—"}</span>
            </div>
          )}
          {typeof project.budget === "number" && project.budget > 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <DollarSign size={14} className="text-primary flex-shrink-0" />
              <span className="font-medium">{formatBudget(project.budget)} budget</span>
            </div>
          )}
        </div>

        <Link
          to={`/projects#${project.id}`}
          onClick={(e) => { if (onOpen) { e.preventDefault(); onOpen(project.id); } }}
          className="mt-auto w-full py-3 rounded-xl bg-slate-50 group-hover:bg-gt-gradient text-slate-800 group-hover:text-white font-bold transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-2"
        >
          Learn More
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </article>
  );
}
