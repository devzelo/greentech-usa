import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import ProjectDocument from "../models/ProjectDocument";
import Project from "../models/Project";
import User from "../models/User";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { getProjectAccess, sectionToTabId, canEditTab, canViewTab } from "../lib/access";

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function sectionAccess(req: AuthedRequest, projectId: string, section: string) {
  const project = await Project.findOne({ projectId }).select("ownerId assignedEmployees guests tabAccess").lean();
  if (!project) return null;
  const me = await User.findById(req.user!.userId).select("empId").lean();
  const empId = (me as { empId?: string } | null)?.empId || "";
  const access = getProjectAccess(project, req.user!.userId, empId);
  const tabId = sectionToTabId(section);
  const tabAccess = (project as { tabAccess?: Record<string, { employees?: boolean }> }).tabAccess;
  return { canView: canViewTab(access, tabId, tabAccess), canEdit: access.role !== "none" && canEditTab(access, tabId) };
}

// Resolve the requester's edit permission for a given section's tab.
async function canEditSection(req: AuthedRequest, projectId: string, section: string): Promise<boolean> {
  const a = await sectionAccess(req, projectId, section);
  return !!a?.canEdit;
}

// Store uploads in uploads/<projectId>/<section>/
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = req.params.id;
    const section = req.body.section || "general";
    // Both segments become directory names — confine them to safe characters.
    if (!/^[\w.-]+$/.test(projectId) || !/^[\w.-]+$/.test(section)) {
      return cb(Object.assign(new Error("Invalid upload path."), { statusCode: 400 }), "");
    }
    const dir = path.join("uploads", projectId, section);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${file.originalname}`;
    cb(null, unique);
  },
});

const upload = multer({ storage });

// GET /api/projects/:id/documents?section=
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    // Guests may only read a section they can view.
    if (req.user!.role === "subcontractor" && req.query.section) {
      const a = await sectionAccess(req, req.params.id, req.query.section as string);
      if (!a?.canView) return res.json([]);
    }
    const filter: Record<string, unknown> = { projectId: req.params.id };
    if (req.query.section) filter.section = req.query.section as string;
    // Hide archived files by default; ?archived=true shows the archived view (CR-P-10).
    filter.archived = req.query.archived === "true" ? true : { $ne: true };
    const docs = await ProjectDocument.find(filter).sort({ uploadedAt: -1 });
    res.json(docs);
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:id/documents  (multipart/form-data, field: file)
router.post("/", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Enforce edit permission (guests need "edit" on this section's tab).
    const allowed = await canEditSection(req, req.params.id, req.body.section || "general");
    if (!allowed) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: "You do not have permission to upload to this section." });
    }

    const ext = path.extname(req.file.originalname).replace(".", "").toLowerCase();
    const sizeKB = req.file.size / 1024;
    const sizeStr = sizeKB > 1024
      ? `${(sizeKB / 1024).toFixed(1)} MB`
      : `${sizeKB.toFixed(0)} KB`;

    const section = req.body.section || "general";
    // `replace=true` — generated documents (RFQ / PO / submittal packages) re-save the SAME
    // logical file whenever they're regenerated. Supersede the previous copy instead of piling
    // up identically-named rows the user can't tell apart.
    if (String(req.body.replace) === "true") {
      const prior = await ProjectDocument.find({ projectId: req.params.id, section, name: req.file.originalname });
      for (const p of prior) {
        if (p.filePath) fs.unlink(path.resolve(p.filePath), () => {});
        await p.deleteOne();
      }
    }

    const doc = await ProjectDocument.create({
      projectId: req.params.id,
      section,
      name: req.file.originalname,
      fileType: ext,
      size: sizeStr,
      filePath: req.file.path,
    });

    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/projects/:id/documents/:did/public — owner only; toggle public visibility
router.patch("/:did/public", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = await Project.findOne({ projectId: req.params.id }).select("ownerId").lean();
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.ownerId || String(project.ownerId) !== req.user!.userId) {
      return res.status(403).json({ error: "Only the project owner can publish documents." });
    }
    const doc = await ProjectDocument.findOneAndUpdate(
      { _id: req.params.did, projectId: req.params.id },
      { public: !!req.body.public },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: "Document not found." });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/projects/:id/documents/:did — update a per-file description (J3).
router.patch("/:did", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const target = await ProjectDocument.findById(req.params.did);
    if (!target) return res.status(404).json({ error: "Document not found." });
    const allowed = await canEditSection(req, target.projectId, target.section);
    if (!allowed) return res.status(403).json({ error: "Not allowed." });
    if (typeof req.body?.description === "string") target.description = req.body.description.slice(0, 500);
    if (typeof req.body?.archived === "boolean") target.archived = req.body.archived;
    await target.save();
    res.json(target);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:id/documents/:did
router.delete("/:did", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const target = await ProjectDocument.findById(req.params.did);
    if (!target) return res.json({ message: "Document deleted" });
    const allowed = await canEditSection(req, target.projectId, target.section);
    if (!allowed) return res.status(403).json({ error: "You do not have permission to delete this document." });
    await ProjectDocument.findByIdAndDelete(req.params.did);
    fs.unlink(target.filePath, () => {});
    res.json({ message: "Document deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
