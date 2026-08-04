import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import SubInvoice from "../models/SubInvoice";
import Project from "../models/Project";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { fetchRequesterAccess } from "../lib/access";

const router = Router({ mergeParams: true });
router.use(requireAuth);
// Owners & employees pass. A subcontractor with ANY access to their Subs tab (view or edit) may
// submit/manage their OWN invoices — the per-handler checks enforce own-record + still-Pending,
// and approval is staff-only. (This is the one "subs" resource a view-only guest can write.)
router.use(async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { access, found } = await fetchRequesterAccess(req);
    if (!found) return res.status(404).json({ error: "Project not found" });
    if (access.role === "owner" || access.role === "employee") return next();
    if (access.role === "subcontractor") {
      const p = access.perms["subs"];
      if (p === "view" || p === "edit") return next();
      return res.status(403).json({ error: "You do not have access to this section." });
    }
    return res.status(403).json({ error: "You do not have access to this project." });
  } catch (err) { next(err); }
});

const humanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);

// A subcontractor requester may only ever touch invoices for their own sub record(s).
async function allowedSubIds(req: AuthedRequest): Promise<string[] | null> {
  if (req.user!.role !== "subcontractor") return null; // null = no restriction
  const project = await Project.findOne({ projectId: req.params.id }).select("subcontractors").lean();
  const me = req.user!.userId;
  const myEmail = (req.user!.email || "").toLowerCase();
  return (project?.subcontractors || [])
    .filter((s) => s.userId === me || (s.email && s.email.toLowerCase() === myEmail && !!myEmail))
    .map((s) => s.subId);
}

// GET /api/projects/:id/sub-invoices?subId=SUB-001
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = { projectId: req.params.id };
    const restrict = await allowedSubIds(req);
    if (restrict) filter.subId = { $in: restrict };
    if (req.query.subId) {
      const subId = String(req.query.subId);
      if (restrict && !restrict.includes(subId)) return res.json([]);
      filter.subId = subId;
    }
    const rows = await SubInvoice.find(filter).sort({ createdAt: 1 });
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { subId, description, amount, remarks, date } = req.body || {};
    if (!subId) return res.status(400).json({ error: "subId is required." });
    // A subcontractor may only add invoices to their OWN record; new invoices are always Pending
    // (only staff can approve/reject) — that's the whole point of the approval column.
    const restrict = await allowedSubIds(req);
    if (restrict && !restrict.includes(subId)) return res.status(403).json({ error: "You can only add invoices to your own record." });
    const row = await SubInvoice.create({
      projectId: req.params.id, subId, description: description || "", amount: amount || "", remarks: remarks || "", date: date || "",
      approval: "pending", attachments: [], addedByName: req.user!.name || "",
    });
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch("/:iid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { attachments, addedByName, subId, ...body } = req.body || {};
    void attachments; void addedByName; void subId;
    const row = await SubInvoice.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!row) return res.status(404).json({ error: "Not found" });
    // Subcontractors: only their OWN invoice, only while still Pending, and never the approval field.
    const restrict = await allowedSubIds(req);
    if (restrict) {
      if (!restrict.includes(row.subId)) return res.status(403).json({ error: "You can only edit your own invoices." });
      if (row.approval !== "pending") return res.status(403).json({ error: "This invoice has been reviewed and can no longer be edited." });
      delete body.approval; // approval is staff-only
    }
    Object.assign(row, body);
    await row.save();
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/:iid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await SubInvoice.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!row) return res.json({ message: "Invoice deleted" });
    // Subcontractors: only their OWN invoice, and only while still Pending.
    const restrict = await allowedSubIds(req);
    if (restrict) {
      if (!restrict.includes(row.subId)) return res.status(403).json({ error: "You can only delete your own invoices." });
      if (row.approval !== "pending") return res.status(403).json({ error: "This invoice has been reviewed and can no longer be deleted." });
    }
    for (const a of row.attachments || []) { if (a.filePath) fs.unlink(path.resolve(a.filePath), () => {}); }
    await SubInvoice.deleteOne({ _id: row._id });
    res.json({ message: "Invoice deleted" });
  } catch (err) { next(err); }
});

// ── Attachments ──────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join("uploads", req.params.id, "sub-invoices", req.params.iid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 32 * 1024 * 1024 } });

router.post("/:iid/attachments", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const row = await SubInvoice.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!row) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Invoice not found." }); }
    // Subcontractors: only their OWN invoice, only while still Pending.
    const restrict = await allowedSubIds(req);
    if (restrict && (!restrict.includes(row.subId) || row.approval !== "pending")) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: "You can only attach files to your own pending invoices." });
    }
    const attachment = { name: req.file.originalname, filePath: req.file.path.replace(/\\/g, "/"), fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(), size: humanSize(req.file.size) };
    row.attachments.push(attachment);
    await row.save();
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.delete("/:iid/attachments/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await SubInvoice.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!row) return res.status(404).json({ error: "Invoice not found." });
    // Subcontractors: only their OWN invoice, only while still Pending.
    const restrict = await allowedSubIds(req);
    if (restrict && (!restrict.includes(row.subId) || row.approval !== "pending")) {
      return res.status(403).json({ error: "You can only change your own pending invoices." });
    }
    const att = (row.attachments || []).find((a) => String((a as { _id?: unknown })._id) === req.params.aid);
    if (att?.filePath) fs.unlink(path.resolve(att.filePath), () => {});
    row.attachments = (row.attachments || []).filter((a) => String((a as { _id?: unknown })._id) !== req.params.aid);
    await row.save();
    res.json(row);
  } catch (err) { next(err); }
});

export default router;
