import { Router, Request, Response, NextFunction } from "express";
import Project from "../models/Project";
import ProjectDocument from "../models/ProjectDocument";

const router = Router();

type GalleryItem = { type?: string; source?: string; url?: string; caption?: string };

// First gallery image (if any) is the card cover; fall back to the legacy cover image.
function coverFor(p: { gallery?: GalleryItem[]; image?: string }): string {
  const firstImg = (p.gallery || []).find((g) => g.type === "image" && g.url);
  return firstImg?.url || p.image || "";
}

/**
 * Public-facing project list used by the marketing site.
 * Excludes Drafts and unpublished projects.
 */
router.get("/projects", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const projects = await Project.find({ published: true, status: { $ne: "Draft" } })
      .select("projectId name status location category description owner image gallery startDate endDate fiscal disciplines progress")
      .sort({ createdAt: -1 })
      .lean();

    const mapped = projects.map((p) => ({
      id: p.projectId,
      name: p.name,
      status: p.status,
      location: p.location || "",
      category: p.category || "",
      description: p.description || "",
      owner: p.owner || "",
      image: coverFor(p),
      startDate: p.startDate || "",
      endDate: p.endDate || "",
      fiscal: p.fiscal || "",
      disciplines: p.disciplines || [],
      progress: p.progress ?? 0,
    }));

    res.json(mapped);
  } catch (err) {
    next(err);
  }
});

/**
 * Public detail for one project — powers the "Learn More" showcase modal.
 * Only published, non-draft projects. Returns gallery, curated public documents,
 * and (optionally) the client name.
 */
router.get("/projects/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const p = await Project.findOne({ projectId: req.params.id, published: true, status: { $ne: "Draft" } }).lean();
    if (!p) return res.status(404).json({ error: "Project not found." });

    const docs = await ProjectDocument.find({ projectId: p.projectId, public: true })
      .select("name fileType filePath uploadedAt")
      .sort({ uploadedAt: -1 })
      .lean();

    const documents = docs.map((d) => {
      const norm = d.filePath.replace(/\\/g, "/");
      const rel = norm.startsWith("uploads/") ? norm.slice("uploads/".length) : norm;
      return { name: d.name, fileType: d.fileType, url: `/uploads/${rel}` };
    });

    res.json({
      id: p.projectId,
      name: p.name,
      status: p.status,
      location: p.location || "",
      category: p.category || "",
      description: p.description || "",
      owner: p.owner || "",
      startDate: p.startDate || "",
      endDate: p.endDate || "",
      progress: p.progress ?? 0,
      clientName: p.showClientName === false ? "" : (p.clientInfo?.name || ""),
      gallery: (p.gallery || []).map((g: GalleryItem) => ({ type: g.type || "image", source: g.source || "upload", url: g.url || "", caption: g.caption || "" })),
      documents,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
