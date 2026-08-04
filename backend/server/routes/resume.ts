import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Resume from "../models/Resume";
import SubResume from "../models/SubResume";
import SavedDocument from "../models/SavedDocument";
import Project from "../models/Project";
import User from "../models/User";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);
router.use(blockGuests); // guests have no access to resumes

const EMPTY_RESUME = {
  title: "",
  summary: "",
  citizenship: "",
  contact: { email: "", phone: "", location: "" },
  photoUrl: "",
  experience: [],
  projects: [],
  education: [],
  skills: [],
  certifications: [],
  languages: [],
  customSections: [],
};

// Fields a client is allowed to set (never userId).
const EDITABLE = [
  "title", "summary", "citizenship", "assignmentOnProject", "yearsOfExperience", "remark", "showPhoto",
  "contact", "photoUrl",
  "experience", "projects", "education",
  "skills", "certifications", "languages", "customSections",
] as const;

function pickEditable(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of EDITABLE) if (f in body) out[f] = body[f];
  return out;
}

/** Projects this empId is assigned to — used to auto-fill project experience. */
async function systemProjectsFor(empId: string) {
  if (!empId) return [];
  const projects = await Project.find({ assignedEmployees: empId, status: { $ne: "Draft" } })
    .select("projectId name category status startDate endDate")
    .sort({ startDate: -1 })
    .lean();
  return projects.map((p) => ({
    id: p.projectId,
    name: p.name,
    category: p.category || "",
    status: p.status,
    startDate: p.startDate || "",
    endDate: p.endDate || "",
  }));
}

// GET /api/resume/me — own resume (empty default if none) + assigned projects for auto-fill.
router.get("/me", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const [resume, me] = await Promise.all([
      Resume.findOne({ userId }).lean(),
      User.findById(userId).select("empId").lean(),
    ]);
    const empId = (me as { empId?: string } | null)?.empId || "";
    res.json({
      resume: resume || EMPTY_RESUME,
      systemProjects: await systemProjectsFor(empId),
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/resume/me — create or update own resume.
router.put("/me", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const resume = await Resume.findOneAndUpdate(
      { userId: req.user!.userId },
      { $set: pickEditable(req.body), $setOnInsert: { userId: req.user!.userId } },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(resume);
  } catch (err) {
    next(err);
  }
});

// GET /api/resume/by-emp/:empId — another employee's resume.
// Allowed for: admins, the employee themself, or the owner of any project
// that employee is assigned to (needed to build proposals with team resumes).
router.get("/by-emp/:empId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const empId = req.params.empId;
    const requesterId = req.user!.userId;

    const requester = await User.findById(requesterId).select("role empId").lean();
    const role = (requester as { role?: string } | null)?.role || req.user!.role;
    const myEmpId = (requester as { empId?: string } | null)?.empId || "";

    let allowed = role === "admin" || (!!myEmpId && myEmpId === empId);
    if (!allowed) {
      allowed = !!(await Project.exists({ ownerId: requesterId, assignedEmployees: empId }));
    }
    if (!allowed) {
      return res.status(403).json({ error: "You do not have access to this resume." });
    }

    const owner = await User.findOne({ empId, role: { $ne: "subcontractor" } })
      .select("name email phone avatarUrl")
      .lean();
    if (!owner) return res.status(404).json({ error: "No account found for this employee." });

    const resume = await Resume.findOne({ userId: owner._id }).lean();
    if (!resume) return res.status(404).json({ error: "This employee has not filled in a resume yet." });

    res.json({
      resume,
      user: { name: owner.name, email: owner.email, phone: owner.phone || "", avatarUrl: owner.avatarUrl || "" },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/resume/by-user/:userId — another staff member's resume by account id.
// Same access rules as by-emp, but works for accounts with no empId (e.g. admins).
router.get("/by-user/:userId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const targetId = req.params.userId;
    const requesterId = req.user!.userId;
    const requester = await User.findById(requesterId).select("role").lean();
    const role = (requester as { role?: string } | null)?.role || req.user!.role;

    const owner = await User.findOne({ _id: targetId, role: { $ne: "subcontractor" } })
      .select("name email phone avatarUrl empId")
      .lean();
    if (!owner) return res.status(404).json({ error: "No account found." });

    let allowed = role === "admin" || requesterId === targetId;
    const ownerEmpId = (owner as { empId?: string }).empId || "";
    if (!allowed && ownerEmpId) {
      allowed = !!(await Project.exists({ ownerId: requesterId, assignedEmployees: ownerEmpId }));
    }
    if (!allowed) return res.status(403).json({ error: "You do not have access to this resume." });

    const resume = await Resume.findOne({ userId: owner._id }).lean();
    if (!resume) return res.status(404).json({ error: "This person has not filled in a resume yet." });

    res.json({
      resume,
      user: { name: owner.name, email: owner.email, phone: owner.phone || "", avatarUrl: owner.avatarUrl || "" },
    });
  } catch (err) {
    next(err);
  }
});

// ── Subcontractor resumes ─────────────────────────────────────────────────────
// Built by staff in the GreenTech format; a company-wide library so a person can be
// reused across projects. (blockGuests above keeps subcontractors out.)
const SUB_EDITABLE = [
  "personName", "subcontractorName", "title", "summary", "citizenship",
  "assignmentOnProject", "yearsOfExperience", "remark", "showPhoto", "contact", "photoUrl",
  "experience", "projects", "education", "skills", "certifications", "languages", "customSections",
] as const;

function pickSubEditable(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of SUB_EDITABLE) if (f in body) out[f] = body[f];
  return out;
}

// GET /api/resume/sub?subName=&q= — list/search subcontractor resumes (the reuse library).
router.get("/sub", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { subName, q } = req.query as { subName?: string; q?: string };
    const filter: Record<string, unknown> = {};
    if (subName) filter.subcontractorName = subName;
    if (q && q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ personName: rx }, { subcontractorName: rx }, { title: rx }];
    }
    const resumes = await SubResume.find(filter).sort({ updatedAt: -1 }).lean();
    res.json(resumes);
  } catch (err) { next(err); }
});

// POST /api/resume/sub — create
router.post("/sub", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const resume = await SubResume.create({ ...pickSubEditable(req.body), ownerId: req.user!.userId });
    res.status(201).json(resume);
  } catch (err) { next(err); }
});

// GET /api/resume/sub/:id — one resume
router.get("/sub/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const resume = await SubResume.findById(req.params.id).lean();
    if (!resume) return res.status(404).json({ error: "Resume not found." });
    res.json(resume);
  } catch (err) { next(err); }
});

// PUT /api/resume/sub/:id — update
router.put("/sub/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const resume = await SubResume.findByIdAndUpdate(
      req.params.id, { $set: pickSubEditable(req.body) }, { new: true, runValidators: true }
    );
    if (!resume) return res.status(404).json({ error: "Resume not found." });
    res.json(resume);
  } catch (err) { next(err); }
});

// DELETE /api/resume/sub/:id
router.delete("/sub/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const resume = await SubResume.findByIdAndDelete(req.params.id);
    if (!resume) return res.status(404).json({ error: "Resume not found." });
    res.json({ message: "Resume deleted." });
  } catch (err) { next(err); }
});

// ── Saved resume versions (frozen PDF copies, user-scoped) ───────────────────
const savedHumanSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const resumeStorage = multer.diskStorage({
  destination: (req: AuthedRequest, _file, cb) => {
    const dir = path.join("uploads", "resumes", String(req.user!.userId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const resumeUpload = multer({ storage: resumeStorage, limits: { fileSize: 64 * 1024 * 1024 } });

// GET /api/resume/saved-versions — caller's own saved resume PDFs, newest first.
router.get("/saved-versions", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const docs = await SavedDocument.find({ kind: "resume", userId: req.user!.userId }).sort({ version: -1, createdAt: -1 }).lean();
    res.json(docs);
  } catch (err) { next(err); }
});

// POST /api/resume/saved-versions — store the current resume PDF as the next version.
router.post("/saved-versions", resumeUpload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const last = await SavedDocument.findOne({ kind: "resume", userId: req.user!.userId }).sort({ version: -1 }).select("version").lean();
    const version = ((last as { version?: number } | null)?.version || 0) + 1;
    const me = await User.findById(req.user!.userId).select("name").lean();
    const doc = await SavedDocument.create({
      kind: "resume",
      userId: req.user!.userId,
      version,
      title: String(req.body.title || "").trim() || `Version ${version}`,
      note: String(req.body.note || ""),
      status: req.body.status === "final" ? "final" : "draft",
      fileName: req.file.originalname,
      filePath: req.file.path.replace(/\\/g, "/"),
      fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(),
      size: savedHumanSize(req.file.size),
      createdById: req.user!.userId,
      createdByName: (me as { name?: string } | null)?.name || "",
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

// PATCH /api/resume/saved-versions/:docId — rename or flip draft/final.
router.patch("/saved-versions/:docId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const update: Record<string, unknown> = {};
    if (typeof req.body.title === "string") update.title = req.body.title.trim();
    if (req.body.status === "draft" || req.body.status === "final") update.status = req.body.status;
    const doc = await SavedDocument.findOneAndUpdate({ _id: req.params.docId, kind: "resume", userId: req.user!.userId }, update, { new: true });
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (err) { next(err); }
});

// DELETE /api/resume/saved-versions/:docId
router.delete("/saved-versions/:docId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await SavedDocument.findOneAndDelete({ _id: req.params.docId, kind: "resume", userId: req.user!.userId });
    if (doc?.filePath) fs.unlink(path.resolve(doc.filePath), () => {});
    res.json({ message: "Saved resume deleted." });
  } catch (err) { next(err); }
});

export default router;
