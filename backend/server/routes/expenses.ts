import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Expense from "../models/Expense";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["expenses"]));

const humanSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Subcontractors (global role "subcontractor") only ever see the rows they added.
const ownRowFilter = (req: AuthedRequest) =>
  req.user!.role === "subcontractor" ? { addedById: req.user!.userId } : {};

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const expenses = await Expense.find({ projectId: req.params.id, ...ownRowFilter(req) }).sort({ createdAt: 1 });
    res.json(expenses);
  } catch (err) { next(err); }
});

const APPROVAL_VALUES = ["pending", "approved", "rejected"];

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { approval, ...body } = req.body;
    // Subcontractor-added rows are always pending; only employees/owners may set an approval on create.
    const initialApproval =
      req.user!.role !== "subcontractor" && APPROVAL_VALUES.includes(approval) ? approval : "pending";
    const expense = await Expense.create({
      ...body,
      projectId: req.params.id,
      approval: initialApproval,
      attachments: [],
      addedById: req.user!.userId,
      addedByName: req.user!.name || "",
      addedByEmail: req.user!.email || "",
      addedByRole: req.user!.role || "",
    });
    res.status(201).json(expense);
  } catch (err) { next(err); }
});

router.patch("/:eid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    // Never let a client overwrite the authorship or attachments via PATCH.
    const { addedById, addedByName, addedByEmail, addedByRole, attachments, approval, ...body } = req.body;
    void addedById; void addedByName; void addedByEmail; void addedByRole; void attachments;
    // Only employees/owners can manage the approval status; subcontractors can only view it.
    if (req.user!.role !== "subcontractor" && APPROVAL_VALUES.includes(approval)) {
      (body as Record<string, unknown>).approval = approval;
    }
    const row = await Expense.findOneAndUpdate(
      { _id: req.params.eid, projectId: req.params.id, ...ownRowFilter(req) },
      body,
      { new: true, runValidators: true }
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/:eid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await Expense.findOneAndDelete({ _id: req.params.eid, projectId: req.params.id, ...ownRowFilter(req) });
    if (row) for (const a of row.attachments || []) { if (a.filePath) fs.unlink(path.resolve(a.filePath), () => {}); }
    res.json({ message: "Expense deleted" });
  } catch (err) { next(err); }
});

// ── Attachments ──────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join("uploads", req.params.id, "expenses", req.params.eid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 32 * 1024 * 1024 } });

router.post("/:eid/attachments", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const attachment = {
      name: req.file.originalname,
      filePath: req.file.path.replace(/\\/g, "/"),
      fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(),
      size: humanSize(req.file.size),
    };
    const row = await Expense.findOneAndUpdate(
      { _id: req.params.eid, projectId: req.params.id, ...ownRowFilter(req) },
      { $push: { attachments: attachment } },
      { new: true }
    );
    if (!row) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Expense not found." }); }
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.delete("/:eid/attachments/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await Expense.findOne({ _id: req.params.eid, projectId: req.params.id, ...ownRowFilter(req) });
    if (!row) return res.status(404).json({ error: "Expense not found." });
    const att = (row.attachments || []).find((a) => String((a as { _id?: unknown })._id) === req.params.aid);
    if (att?.filePath) fs.unlink(path.resolve(att.filePath), () => {});
    row.attachments = (row.attachments || []).filter((a) => String((a as { _id?: unknown })._id) !== req.params.aid);
    await row.save();
    res.json(row);
  } catch (err) { next(err); }
});

export default router;
