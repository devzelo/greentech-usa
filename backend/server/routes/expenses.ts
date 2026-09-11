import { Router, Response, NextFunction } from "express";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import fs from "fs";
import Expense from "../models/Expense";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";
import { createNotification } from "../lib/notify";

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["expenses"]));

const humanSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const num = (s: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;

// Subcontractors (global role "subcontractor") only ever see the rows they added.
const ownRowFilter = (req: AuthedRequest) =>
  req.user!.role === "subcontractor" ? { addedById: req.user!.userId } : {};
// GreenTech staff (admin / employee) approve, reject and delete; outside logins cannot.
const isStaff = (req: AuthedRequest) => req.user!.role !== "subcontractor";

// CR-P (154) — the items of one expense. With items, the expense is qty 1 at the items' total.
type Item = { description: string; qty: string; unit: string; unitPrice: string };
const cleanItems = (arr: unknown): Item[] | null => {
  if (!Array.isArray(arr)) return null;
  return (arr as Array<Record<string, unknown>>).slice(0, 100).map((o) => ({
    description: String(o?.description ?? "").slice(0, 500),
    qty: String(o?.qty ?? "1").slice(0, 20),
    unit: String(o?.unit ?? "").slice(0, 30),
    unitPrice: String(o?.unitPrice ?? "").slice(0, 30),
  })).filter((i) => i.description.trim() || num(i.unitPrice));
};
function applyItems(target: Record<string, unknown>, items: Item[]) {
  target.items = items;
  if (!items.length) return;
  target.qty = "1";
  target.amount = items.reduce((s, i) => s + (num(i.qty) || 0) * num(i.unitPrice), 0).toFixed(2);
  if (!String(target.description || "").trim()) target.description = items.length === 1 ? items[0].description : `${items[0].description} + ${items.length - 1} more`;
}

const link = (pid: string) => `/dashboard/projects/${pid}?tab=finances`;
async function notify(userId: string, from: AuthedRequest, title: string, message: string, pid: string) {
  if (!userId || userId === from.user!.userId || !mongoose.isValidObjectId(userId)) return;
  await createNotification({ userId, type: "general", title, message, link: link(pid) }).catch(() => {});
}

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const expenses = await Expense.find({ projectId: req.params.id, ...ownRowFilter(req) }).sort({ createdAt: 1 });
    res.json(expenses);
  } catch (err) { next(err); }
});

const APPROVAL_VALUES = ["pending", "approved", "rejected"];
const EDITABLE = ["description", "date", "qty", "amount", "remarks", "subId"] as const;

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body || {};
    const body: Record<string, unknown> = {};
    for (const f of EDITABLE) if (typeof b[f] === "string") body[f] = b[f];
    const items = cleanItems(b.items);
    if (items) applyItems(body, items);
    // CR-P (158) — past expenses (already paid) are recorded by staff straight as approved.
    const historic = isStaff(req) && !!b.historic;
    // Subcontractor-added rows are always pending; only employees/owners may set an approval on create.
    const initialApproval = historic ? "approved" : isStaff(req) && APPROVAL_VALUES.includes(b.approval) ? b.approval : "pending";
    const expense = await Expense.create({
      ...body,
      projectId: req.params.id,
      approval: initialApproval,
      historic,
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
    const row = await Expense.findOne({ _id: req.params.eid, projectId: req.params.id, ...ownRowFilter(req) });
    if (!row) return res.status(404).json({ error: "Not found" });
    const b = req.body || {};
    const changes: Record<string, unknown> = {};
    for (const f of EDITABLE) if (typeof b[f] === "string") changes[f] = b[f];
    const items = cleanItems(b.items);
    // CR-P (160) — an expense recorded from an invoice payment is changed on that invoice.
    if (row.invoiceId && (Object.keys(changes).length || items)) {
      return res.status(400).json({ error: "This expense comes from a payment on an invoice received. Change it in Invoice Received." });
    }
    if (items) applyItems(changes, items);
    Object.assign(row, changes);

    // Approval: staff only. CR-P (156) — a rejection needs a reason, and the author is told.
    const approval = b.approval;
    if (isStaff(req) && APPROVAL_VALUES.includes(approval) && approval !== row.approval) {
      if (approval === "rejected") {
        const reason = String(b.rejectReason ?? "").trim() || row.rejectReason.trim();
        if (!reason) return res.status(400).json({ error: "Say why the expense is rejected." });
        row.rejectReason = reason.slice(0, 1000);
      }
      row.approval = approval;
      const what = row.description || "your expense";
      if (approval === "rejected") await notify(String(row.addedById || ""), req, "Expense rejected", `"${what}" was rejected: ${row.rejectReason}`, req.params.id);
      if (approval === "approved") await notify(String(row.addedById || ""), req, "Expense approved", `"${what}" was approved.`, req.params.id);
    } else if (isStaff(req) && typeof b.rejectReason === "string" && row.approval === "rejected" && b.rejectReason.trim()) {
      row.rejectReason = b.rejectReason.trim().slice(0, 1000);
    }
    // The author fixes a rejected expense and sends it again for approval.
    if (b.resend && row.approval === "rejected" && String(row.addedById || "") === req.user!.userId) row.approval = "pending";

    await row.save();
    res.json(row);
  } catch (err) { next(err); }
});

// CR-P (153) — an expense is a record: only GreenTech staff can delete it.
router.delete("/:eid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!isStaff(req)) return res.status(403).json({ error: "Only GreenTech staff can delete an expense. It stays as a record." });
    const row = await Expense.findOne({ _id: req.params.eid, projectId: req.params.id });
    if (!row) return res.json({ message: "Expense deleted" });
    if (row.invoiceId) return res.status(400).json({ error: "This expense is a payment on an invoice received. Remove the payment there." });
    await row.deleteOne();
    for (const a of row.attachments || []) { if (a.filePath) fs.unlink(path.resolve(a.filePath), () => {}); }
    res.json({ message: "Expense deleted" });
  } catch (err) { next(err); }
});

// CR-P (157) — a conversation on the expense; mentioned people, the author and everyone who has
// already commented are notified.
router.post("/:eid/comments", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const text = String(req.body?.text || "").slice(0, 4000).trim();
    if (!text) return res.status(400).json({ error: "Comment can't be empty." });
    const mentions = Array.isArray(req.body?.mentions) ? req.body.mentions.map((x: unknown) => String(x)).filter(Boolean).slice(0, 30) as string[] : [];
    const row = await Expense.findOne({ _id: req.params.eid, projectId: req.params.id, ...ownRowFilter(req) });
    if (!row) return res.status(404).json({ error: "Not found" });
    row.comments.push({ userId: req.user!.userId, authorName: req.user!.name || "", text, mentions, at: new Date() });
    await row.save();
    const who = new Set<string>([...mentions, String(row.addedById || ""), ...row.comments.map((c) => c.userId)]);
    const title = `${req.user!.name || "Someone"} commented on an expense`;
    for (const uid of who) await notify(uid, req, title, `"${row.description || "Expense"}": ${text.slice(0, 140)}`, req.params.id);
    res.status(201).json(row);
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
