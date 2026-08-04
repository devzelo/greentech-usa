import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import ProcurementRow from "../models/ProcurementRow";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["procurement"])); // owner/employee, or guest with view (read) / edit (write)

const humanSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Subcontractors (global role "subcontractor") only see the rows they added.
const ownRowFilter = (req: AuthedRequest) =>
  req.user!.role === "subcontractor" ? { addedById: req.user!.userId } : {};

// GET /api/projects/:id/procurement-rows
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await ProcurementRow.find({ projectId: req.params.id, ...ownRowFilter(req) }).sort({ createdAt: 1 });
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/projects/:id/procurement-rows — creates a blank row, stamped with the author.
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await ProcurementRow.create({
      ...req.body,
      projectId: req.params.id,
      attachments: [],
      addedById: req.user!.userId,
      addedByName: req.user!.name || "",
      addedByRole: req.user!.role || "",
    });
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// PATCH /api/projects/:id/procurement-rows/:rid — partial update
router.patch("/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { addedById, addedByName, addedByRole, attachments, ...body } = req.body;
    void addedById; void addedByName; void addedByRole; void attachments;
    const row = await ProcurementRow.findOneAndUpdate(
      { _id: req.params.rid, projectId: req.params.id, ...ownRowFilter(req) },
      body,
      { new: true, runValidators: true }
    );
    if (!row) return res.status(404).json({ error: "Row not found" });
    res.json(row);
  } catch (err) { next(err); }
});

// DELETE /api/projects/:id/procurement-rows/:rid
router.delete("/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await ProcurementRow.findOneAndDelete({ _id: req.params.rid, projectId: req.params.id, ...ownRowFilter(req) });
    if (!row) return res.status(404).json({ error: "Row not found" });
    for (const a of row.attachments || []) { if (a.filePath) fs.unlink(path.resolve(a.filePath), () => {}); }
    res.json({ message: "Row deleted" });
  } catch (err) { next(err); }
});

// ── Attachments ──────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join("uploads", req.params.id, "procurement", req.params.rid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 32 * 1024 * 1024 } });

router.post("/:rid/attachments", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const attachment = {
      name: req.file.originalname,
      filePath: req.file.path.replace(/\\/g, "/"),
      fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(),
      size: humanSize(req.file.size),
    };
    const row = await ProcurementRow.findOneAndUpdate(
      { _id: req.params.rid, projectId: req.params.id, ...ownRowFilter(req) },
      { $push: { attachments: attachment } },
      { new: true }
    );
    if (!row) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Row not found." }); }
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.delete("/:rid/attachments/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await ProcurementRow.findOne({ _id: req.params.rid, projectId: req.params.id, ...ownRowFilter(req) });
    if (!row) return res.status(404).json({ error: "Row not found." });
    const att = (row.attachments || []).find((a) => String((a as { _id?: unknown })._id) === req.params.aid);
    if (att?.filePath) fs.unlink(path.resolve(att.filePath), () => {});
    row.attachments = (row.attachments || []).filter((a) => String((a as { _id?: unknown })._id) !== req.params.aid);
    await row.save();
    res.json(row);
  } catch (err) { next(err); }
});

export default router;
