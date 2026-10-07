import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import ProjectDocument from "../models/ProjectDocument";
import DocumentFolder from "../models/DocumentFolder";
import Project from "../models/Project";
import User from "../models/User";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { getProjectAccess, sectionToTabId, canEditTab, canViewTab } from "../lib/access";
import { moveToTrash } from "../lib/recycleBin";

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function sectionAccess(req: AuthedRequest, projectId: string, section: string) {
  const project = await Project.findOne({ projectId }).select("ownerId assignedEmployees guests tabAccess").lean();
  if (!project) return null;
  const me = await User.findById(req.user!.userId).select("empId").lean();
  const empId = (me as { empId?: string } | null)?.empId || "";
  const access = getProjectAccess(project, req.user!.userId, empId);
  const tabId = sectionToTabId(section);
  const tabAccess = (project as { tabAccess?: Record<string, { employees?: boolean; employeeIds?: string[] }> }).tabAccess;
  return { canView: canViewTab(access, tabId, tabAccess), canEdit: access.role !== "none" && canEditTab(access, tabId) };
}

// Resolve the requester's edit permission for a given section's tab.
async function canEditSection(req: AuthedRequest, projectId: string, section: string): Promise<boolean> {
  const a = await sectionAccess(req, projectId, section);
  return !!a?.canEdit;
}

// CR-P (131) — a folder path within a section: "/"-separated names, no empty / "." / ".." parts.
// It is only stored in the database (files stay in uploads/<project>/<section>/ on disk).
function cleanFolder(raw: unknown): string {
  return String(raw || "")
    .split(/[\\/]+/)
    .map((s) => s.trim().slice(0, 120))
    .filter((s) => s && s !== "." && s !== "..")
    .join("/")
    .slice(0, 500);
}
const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
    const folder = cleanFolder(req.body.folder);
    // `replace=true` — generated documents (RFQ / PO / submittal packages) re-save the SAME
    // logical file whenever they're regenerated. Supersede the previous copy instead of piling
    // up identically-named rows the user can't tell apart.
    if (String(req.body.replace) === "true") {
      const prior = await ProjectDocument.find({ projectId: req.params.id, section, name: req.file.originalname, folder: folder || { $in: ["", null] } });
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
      folder,
    });

    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

// CR-P (131) — folders in a section. Declared before the "/:did" routes so "folders" is never
// read as a document id.

// GET /api/projects/:id/documents/folders?section=
router.get("/folders", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const section = String(req.query.section || "");
    if (!section) return res.json([]);
    if (req.user!.role === "subcontractor") {
      const a = await sectionAccess(req, req.params.id, section);
      if (!a?.canView) return res.json([]);
    }
    res.json(await DocumentFolder.find({ projectId: req.params.id, section }).sort({ path: 1 }).lean());
  } catch (err) { next(err); }
});

// PUT /api/projects/:id/documents/folders { section, path, description } — create a folder or
// change its description.
router.put("/folders", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const section = String(req.body?.section || "");
    const fpath = cleanFolder(req.body?.path);
    if (!section || !fpath) return res.status(400).json({ error: "A folder name is required." });
    if (!(await canEditSection(req, req.params.id, section))) return res.status(403).json({ error: "Not allowed." });
    const description = typeof req.body?.description === "string" ? req.body.description.slice(0, 500) : "";
    const folder = await DocumentFolder.findOneAndUpdate(
      { projectId: req.params.id, section, path: fpath },
      { $set: { description } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    res.json(folder);
  } catch (err) { next(err); }
});

// POST /api/projects/:id/documents/folders/move { section, from, to } — rename a folder, or move it
// into another folder (or to the top level). Its subfolders and files go with it. CR 332.
router.post("/folders/move", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const section = String(req.body?.section || "");
    const from = cleanFolder(req.body?.from);
    const to = cleanFolder(req.body?.to);
    if (!section || !from || !to) return res.status(400).json({ error: "Which folder, and where to?" });
    if (!(await canEditSection(req, req.params.id, section))) return res.status(403).json({ error: "Not allowed." });
    if (to === from) return res.json({ moved: 0 });
    if (to.startsWith(`${from}/`)) return res.status(400).json({ error: "A folder cannot go inside itself." });
    const pid = req.params.id;
    const under = (p: string) => ({ $in: [p, new RegExp(`^${escapeRx(p)}/`)] });
    // Never merge two folders by accident: the new place must be free.
    const taken = await DocumentFolder.exists({ projectId: pid, section, path: under(to) })
      || await ProjectDocument.exists({ projectId: pid, section, folder: under(to) });
    if (taken) return res.status(409).json({ error: `There is already a folder called "${to.split("/").pop()}" there.` });
    const moveTo = (p: string) => to + p.slice(from.length);
    const [folders, docs] = await Promise.all([
      DocumentFolder.find({ projectId: pid, section, path: under(from) }),
      ProjectDocument.find({ projectId: pid, section, folder: under(from) }),
    ]);
    for (const f of folders) { f.path = moveTo(f.path); await f.save(); }
    for (const d of docs) { d.folder = moveTo(d.folder || from); await d.save(); }
    // The folder keeps existing in its new place even when it held no saved record of its own.
    if (!folders.some((f) => f.path === to)) await DocumentFolder.updateOne({ projectId: pid, section, path: to }, { $setOnInsert: { description: "" } }, { upsert: true });
    res.json({ moved: docs.length });
  } catch (err) { next(err); }
});

// DELETE /api/projects/:id/documents/folders?section=&path= — the folder with everything in it.
// Each file goes to the recycle bin, like a single deleted file.
router.delete("/folders", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const section = String(req.query.section || "");
    const fpath = cleanFolder(req.query.path);
    if (!section || !fpath) return res.status(400).json({ error: "Which folder?" });
    if (!(await canEditSection(req, req.params.id, section))) return res.status(403).json({ error: "Not allowed." });
    const inside = { $in: [fpath, new RegExp(`^${escapeRx(fpath)}/`)] };
    const docs = await ProjectDocument.find({ projectId: req.params.id, section, folder: inside });
    for (const d of docs) {
      await moveToTrash({
        kind: "document", refId: String(d._id), projectId: d.projectId,
        name: d.name || "Document", subtitle: `Document · ${d.folder}`,
        data: d.toObject(), files: d.filePath ? [{ filePath: d.filePath }] : [],
        deletedById: req.user!.userId, deletedByName: req.user!.name || "",
      });
      await d.deleteOne();
    }
    await DocumentFolder.deleteMany({ projectId: req.params.id, section, path: inside });
    res.json({ deleted: docs.length });
  } catch (err) { next(err); }
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
    // CR 332 - move the file into another folder of the same section ("" = the top level).
    if (typeof req.body?.folder === "string") {
      if (target.projectId !== req.params.id) return res.status(404).json({ error: "Document not found." });
      target.folder = cleanFolder(req.body.folder);
    }
    // 2026-10-07 - rename: the name shown and downloaded (the stored file stays where it is). No
    // path or reserved characters, and the file keeps its type: a name without it gets it back.
    if (typeof req.body?.name === "string") {
      if (target.projectId !== req.params.id) return res.status(404).json({ error: "Document not found." });
      let name = req.body.name.replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
      if (!name || name === ".") return res.status(400).json({ error: "Give the file a name." });
      const ext = path.extname(target.name).toLowerCase();
      if (ext && path.extname(name).toLowerCase() !== ext) name = `${name}${ext}`;
      target.name = name;
    }
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
    // CR-P-26 — snapshot to the recycle bin; keep the file so it can be restored.
    await moveToTrash({
      kind: "document", refId: String(target._id), projectId: target.projectId,
      name: target.name || "Document", subtitle: "Document",
      data: target.toObject(), files: target.filePath ? [{ filePath: target.filePath }] : [],
      deletedById: req.user!.userId, deletedByName: req.user!.name || "",
    });
    await ProjectDocument.findByIdAndDelete(req.params.did);
    res.json({ message: "Document deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
