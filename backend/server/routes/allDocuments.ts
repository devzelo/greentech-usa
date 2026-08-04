import { Router, Response, NextFunction } from "express";
import ProjectDocument from "../models/ProjectDocument";
import Project from "../models/Project";
import User from "../models/User";
import FolderNote from "../models/FolderNote";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { getProjectAccess, sectionToTabId, canViewTab } from "../lib/access";

const router = Router();
router.use(requireAuth);

// Resolve the project ids the current user can see (owner / assigned employee / guest).
async function accessibleProjectIds(req: AuthedRequest): Promise<string[]> {
  const userId = req.user!.userId;
  const me = await User.findById(userId).lean();
  const empId = (me as { empId?: string } | null)?.empId || "";
  const orClause: Record<string, unknown>[] = [{ ownerId: userId }, { "guests.userId": userId }];
  if (empId) orClause.push({ assignedEmployees: empId });
  const projects = await Project.find({ $or: orClause }).select("projectId").lean();
  return projects.map((p) => p.projectId);
}

// GET /api/documents — every document the current user is allowed to see, across
// the projects they own / are assigned to / are a guest on, honouring per-tab access.
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const me = await User.findById(userId).lean();
    const empId = (me as { empId?: string } | null)?.empId || "";

    const orClause: Record<string, unknown>[] = [{ ownerId: userId }, { "guests.userId": userId }];
    if (empId) orClause.push({ assignedEmployees: empId });
    const projects = await Project.find({ $or: orClause })
      .select("projectId name ownerId tabAccess assignedEmployees guests")
      .lean();
    const projectIds = projects.map((p) => p.projectId);
    const projectMap = new Map(projects.map((p) => [p.projectId, p]));

    const docs = await ProjectDocument.find({ projectId: { $in: projectIds } }).sort({ uploadedAt: -1 });

    const enriched = docs
      .filter((d) => {
        const proj = projectMap.get(d.projectId);
        if (!proj) return false;
        const access = getProjectAccess(proj, userId, empId);
        const tabId = sectionToTabId(d.section);
        const tabAccess = (proj as { tabAccess?: Record<string, { employees?: boolean }> }).tabAccess;
        return canViewTab(access, tabId, tabAccess);
      })
      .map((d) => ({
        _id: d._id,
        projectId: d.projectId,
        projectName: (projectMap.get(d.projectId) as { name?: string } | undefined)?.name || d.projectId,
        section: d.section,
        name: d.name,
        description: d.description || "",
        fileType: d.fileType,
        size: d.size,
        filePath: d.filePath,
        uploadedAt: d.uploadedAt,
      }));

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// ── Folder descriptions (Documents module) ──────────────────────────────────
// Folders are virtual (project / tab / section-group), so their descriptions live here.
// GET returns every folder note across the projects the user can see.
router.get("/folder-notes", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const ids = await accessibleProjectIds(req);
    const notes = await FolderNote.find({ projectId: { $in: ids } }).select("projectId folderKey description").lean();
    res.json(notes);
  } catch (err) { next(err); }
});

// PUT upserts a folder's description. Only staff (owner/employee) of that project may edit.
router.put("/folder-notes", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.body?.projectId || "").trim();
    const folderKey = String(req.body?.folderKey || "").trim().slice(0, 120);
    const description = String(req.body?.description ?? "").slice(0, 2000);
    if (!projectId || !folderKey) return res.status(400).json({ error: "projectId and folderKey are required." });

    // Guests (subcontractor role) never edit folder descriptions.
    if (req.user!.role === "subcontractor") return res.status(403).json({ error: "You do not have edit access." });
    const proj = await Project.findOne({ projectId }).select("_id").lean();
    if (!proj) return res.status(404).json({ error: "Project not found." });

    const note = await FolderNote.findOneAndUpdate(
      { projectId, folderKey },
      { $set: { description } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    res.json({ projectId: note.projectId, folderKey: note.folderKey, description: note.description });
  } catch (err) { next(err); }
});

export default router;
