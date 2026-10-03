import WorkPackage from "../models/WorkPackage";
import { Router, Response, NextFunction } from "express";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import fs from "fs";
import Expense from "../models/Expense";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard, fetchRequesterAccess } from "../lib/access";
import Project from "../models/Project";
import User from "../models/User";
import { createNotification } from "../lib/notify";
import { EXPENSE_CATEGORIES, cleanCategory } from "../lib/expenseCategories";

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
type Item = { id: string; description: string; qty: string; unit: string; unitPrice: string; category: string; remark: string; status?: "pending" | "approved" | "rejected"; rejectReason?: string };
/**
 * CR 341 - a line keeps its review (approved, or rejected with why) while it is unchanged; a line
 * that is edited (or new) is pending again, so a rejected line is fixed and sent back for review.
 */
function carryReview(items: Item[], before: Array<Partial<Item>>) {
  const same = (a: Partial<Item>, b: Item) => a.description === b.description && String(a.qty) === String(b.qty) && a.unit === b.unit && String(a.unitPrice) === String(b.unitPrice) && (a.remark || "") === (b.remark || "");
  return items.map((it) => {
    const prev = before.find((x) => x.id && x.id === it.id);
    return prev && same(prev, it) ? { ...it, status: prev.status || "pending", rejectReason: prev.rejectReason || "" } : { ...it, status: "pending" as const, rejectReason: "" };
  });
}
const newItemId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
/**
 * CR 331 (GT Comments 4) - the category (account code) of each item comes from GreenTech staff
 * only. An outside login cannot set it; when one edits its expense, each item keeps the category
 * staff gave the item in the same place.
 */
const cleanItems = (arr: unknown, staff: boolean, before: Array<{ id?: string; category?: string }> = []): Item[] | null => {
  if (!Array.isArray(arr)) return null;
  return (arr as Array<Record<string, unknown>>).slice(0, 100).map((o, i) => {
    const id = String(o?.id ?? "").slice(0, 40) || newItemId();
    // The item staff categorised: the same line (by its id; by its place for lines saved before ids).
    const prev = before.find((x) => x.id && x.id === id) || (before[i] && !before[i].id ? before[i] : undefined);
    return {
      id,
      description: String(o?.description ?? "").slice(0, 500),
      qty: String(o?.qty ?? "1").slice(0, 20),
      unit: String(o?.unit ?? "").slice(0, 30),
      unitPrice: String(o?.unitPrice ?? "").slice(0, 30),
      category: staff ? cleanCategory(o?.category) : prev?.category || "",
      remark: String(o?.remark ?? "").slice(0, 500),
    };
  }).filter((i) => i.description.trim() || num(i.unitPrice));
};
/** CR 340 - the rate to USD for a currency ("" or USD: 1). */
const rateOf = (currency: unknown, rate: unknown) => (String(currency || "USD").toUpperCase() === "USD" ? 1 : num(rate) || 0);
const cleanCurrency = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "USD";
/** What an outside login gets back: its expense without the categories. */
const forViewer = (req: AuthedRequest, doc: { toObject: () => Record<string, unknown> }) => {
  const o = doc.toObject();
  if (!isStaff(req)) o.items = ((o.items as Array<Record<string, unknown>>) || []).map(({ category: _c, ...i }) => { void _c; return i; });
  return o;
};
function applyItems(target: Record<string, unknown>, items: Item[], rate = 1) {
  target.items = items;
  if (!items.length) return;
  target.qty = "1";
  // CR 340 - the items are priced in the currency paid; the amount every total reads is in USD.
  const sum = items.reduce((s, i) => s + (num(i.qty) || 0) * num(i.unitPrice), 0);
  target.totalOriginal = sum.toFixed(2);
  target.amount = (sum * (rate || 1)).toFixed(2);
  if (!String(target.description || "").trim()) target.description = items.length === 1 ? items[0].description : `${items[0].description} + ${items.length - 1} more`;
}

/**
 * CR 339 - who may approve (sign) an expense: the project's manager side, meaning its owner, the
 * employees assigned to it, or an admin. On a joint venture the partner signs too: the partner's
 * login (the JV record's email) signs with its own signature, or the manager applies one of the
 * partner's signatures kept on the JV record, and the record says who applied it.
 */
async function approvalContext(req: AuthedRequest) {
  const [project, { access }] = await Promise.all([
    Project.findOne({ projectId: req.params.id }).select("jointVenture").lean(),
    fetchRequesterAccess(req),
  ]);
  const jv = (project as { jointVenture?: { enabled?: boolean; email?: string; partnerName?: string; contactName?: string; signatures?: Array<{ name: string; url: string }> } } | null)?.jointVenture;
  const joint = jv?.enabled ? jv : null;
  const manager = req.user!.role === "admin" || access.role === "owner" || access.role === "employee";
  const partner = !!joint?.email && String(req.user!.email || "").trim().toLowerCase() === joint.email.trim().toLowerCase();
  return { manager, partner, joint };
}
const sidesNeeded = (joint: unknown) => (joint ? ["gt", "partner"] : ["gt"]);
async function ownSignature(userId: string) {
  const u = await User.findById(userId).select("name jobTitle signatureUrl signatures").lean() as { name?: string; jobTitle?: string; signatureUrl?: string; signatures?: Array<{ url: string; isDefault?: boolean }> } | null;
  const url = u?.signatureUrl || u?.signatures?.find((s) => s.isDefault)?.url || u?.signatures?.[0]?.url || "";
  return { name: u?.name || "", title: u?.jobTitle || "", url };
}

const link = (pid: string) => `/dashboard/projects/${pid}?tab=finances`;

/** CR 341 - the people who review a project's expenses: its owner and the employees assigned to it. */
async function reviewersOf(projectId: string): Promise<Array<{ userId: string; name: string; role: string }>> {
  const p = await Project.findOne({ projectId }).select("ownerId assignedEmployees").lean() as { ownerId?: unknown; assignedEmployees?: string[] } | null;
  if (!p) return [];
  const [owner, team] = await Promise.all([
    p.ownerId ? User.findById(p.ownerId).select("name").lean() : null,
    (p.assignedEmployees || []).length ? User.find({ empId: { $in: p.assignedEmployees } }).select("name").lean() : [],
  ]);
  const out = owner ? [{ userId: String(owner._id), name: (owner as { name?: string }).name || "Project owner", role: "Project owner" }] : [];
  for (const u of team as Array<{ _id: unknown; name?: string }>) if (!out.some((x) => x.userId === String(u._id))) out.push({ userId: String(u._id), name: u.name || "Team member", role: "Project team" });
  return out;
}
/** Tell the chosen reviewers an expense is waiting for them. Only the project's reviewers can be chosen. */
async function notifyReviewers(req: AuthedRequest, ids: unknown, what: string) {
  if (!Array.isArray(ids) || !ids.length) return;
  const allowed = new Set((await reviewersOf(req.params.id)).map((r) => r.userId));
  for (const id of ids.map(String).filter((x) => allowed.has(x)).slice(0, 20)) await notify(id, req, "Expense to review", `${req.user!.name || "Someone"} submitted "${what}" for review.`, req.params.id);
}
async function notify(userId: string, from: AuthedRequest, title: string, message: string, pid: string) {
  if (!userId || userId === from.user!.userId || !mongoose.isValidObjectId(userId)) return;
  await createNotification({ userId, type: "general", title, message, link: link(pid) }).catch(() => {});
}

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const ctx = req.user!.role === "subcontractor" ? await approvalContext(req) : null;
    // CR 339 - the JV partner's login also sees the expenses GreenTech has signed, to sign them too.
    const filter: Record<string, unknown> = ctx?.partner ? { $or: [{ addedById: req.user!.userId }, { "signatures.side": "gt" }] } : ownRowFilter(req);
    const expenses = await Expense.find({ projectId: req.params.id, ...filter }).sort({ createdAt: 1 });
    res.json(expenses.map((e) => forViewer(req, e)));
  } catch (err) { next(err); }
});

// CR 341 - who can be told to review an expense (for "Notify for review").
router.get("/reviewers", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try { res.json(await reviewersOf(req.params.id)); } catch (err) { next(err); }
});

// CR 331 - the chart of accounts an expense item is booked to. GreenTech staff only.
router.get("/categories", (req: AuthedRequest, res: Response) => {
  if (!isStaff(req)) return res.status(403).json({ error: "Not available." });
  res.json(EXPENSE_CATEGORIES);
});

const APPROVAL_VALUES = ["pending", "approved", "rejected"];
const EDITABLE = ["description", "date", "qty", "amount", "remarks", "subId", "workPackageId", "receiptNo", "poNo", "vendorName", "vendorCompanyId", "exchangeRate", "reference"] as const;
/** CR 340 - the next expense number in the project: EXP-2026-001, EXP-2026-002, ... per year. */
async function nextExpenseNo(projectId: string): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await Expense.find({ projectId, expenseNo: new RegExp(`^EXP-${year}-`) }).select("expenseNo").lean();
  const n = rows.reduce((m, r) => Math.max(m, parseInt(String(r.expenseNo).split("-")[2] || "0", 10) || 0), 0) + 1;
  return `EXP-${year}-${String(n).padStart(3, "0")}`;
}
// CR 328 - an expense may be tagged to one of the project's work packages (its Paid counts it).
async function cleanPackage(projectId: string, v: unknown): Promise<string> {
  const id = String(v || "");
  return mongoose.isValidObjectId(id) && (await WorkPackage.exists({ _id: id, projectId })) ? id : "";
}

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body || {};
    const body: Record<string, unknown> = {};
    for (const f of EDITABLE) if (typeof b[f] === "string") body[f] = b[f];
    if (typeof b.workPackageId === "string") body.workPackageId = await cleanPackage(req.params.id, b.workPackageId);
    body.currency = cleanCurrency(b.currency);
    const rate = rateOf(body.currency, body.exchangeRate);
    if (!rate) return res.status(400).json({ error: `Enter the exchange rate from ${body.currency} to USD.` });
    const items = cleanItems(b.items, isStaff(req));
    if (items) applyItems(body, items, rate);
    body.expenseNo = await nextExpenseNo(req.params.id);
    body.draft = !!b.draft && !b.historic;
    // CR-P (158) — past expenses (already paid) are recorded by staff straight as approved.
    const historic = isStaff(req) && !!b.historic;
    // New expenses wait for approval, which is given by signing (CR 339); past records come in approved.
    const initialApproval = historic ? "approved" : "pending";
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
    if (!expense.draft && !expense.historic) await notifyReviewers(req, b.notify, expense.description || "an expense");
    res.status(201).json(forViewer(req, expense));
  } catch (err) { next(err); }
});

router.patch("/:eid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body || {};
    const ctx = await approvalContext(req);
    const signing = typeof b.sign === "string" || b.approval === "approved";
    const row = await Expense.findOne({ _id: req.params.eid, projectId: req.params.id, ...(ctx.partner && signing ? {} : ownRowFilter(req)) });
    if (!row) return res.status(404).json({ error: "Not found" });

    // CR 339 - approving is signing. GreenTech's side signs with the approver's own signature; on a
    // joint venture the partner signs too. Approved once every side needed has signed.
    if (signing) {
      if (row.invoiceId) return res.status(400).json({ error: "This expense comes from a payment on an invoice received." });
      if (row.approval === "rejected") return res.status(400).json({ error: "A rejected expense is sent again by the person who added it before it can be approved." });
      if (row.draft) return res.status(400).json({ error: "This expense is still a draft: it is approved once it has been submitted." });
      if ((row.items || []).some((i) => i.status === "rejected")) return res.status(400).json({ error: "A line is rejected. It is fixed and sent again before the expense can be approved." });
      const side = b.sign === "partner" ? "partner" : "gt";
      if (side === "partner" && !ctx.joint) return res.status(400).json({ error: "This project is not a joint venture." });
      let sig: { side: "gt" | "partner"; userId: string; name: string; title: string; signatureUrl: string; at: Date; appliedById: string; appliedByName: string };
      if (side === "gt") {
        if (!ctx.manager) return res.status(403).json({ error: "Only the project's owner or its assigned employees can approve an expense." });
        const own = await ownSignature(req.user!.userId);
        if (!own.url) return res.status(400).json({ error: "Add your signature first (Profile, Signatures). Approving an expense signs it." });
        sig = { side, userId: req.user!.userId, name: own.name || req.user!.name || "", title: own.title, signatureUrl: own.url, at: new Date(), appliedById: "", appliedByName: "" };
      } else if (ctx.partner) {
        const own = await ownSignature(req.user!.userId);
        const kept = ctx.joint!.signatures?.[Number(b.signatureIndex)]?.url || "";
        if (!own.url && !kept) return res.status(400).json({ error: "Add your signature first (Profile, Signatures)." });
        sig = { side, userId: req.user!.userId, name: own.name || req.user!.name || "", title: ctx.joint!.partnerName || "", signatureUrl: own.url || kept, at: new Date(), appliedById: "", appliedByName: "" };
      } else if (ctx.manager) {
        const kept = ctx.joint!.signatures?.[Number(b.signatureIndex)];
        if (!kept?.url) return res.status(400).json({ error: "Choose one of the partner's signatures on the joint venture record (Project Info, Joint Venture)." });
        sig = { side, userId: "", name: kept.name || ctx.joint!.contactName || ctx.joint!.partnerName || "Partner", title: ctx.joint!.partnerName || "", signatureUrl: kept.url, at: new Date(), appliedById: req.user!.userId, appliedByName: req.user!.name || "" };
      } else return res.status(403).json({ error: "Only the joint venture partner, or the project's manager on its behalf, can sign for the partner." });
      row.signatures = [...(row.signatures || []).filter((s) => s.side !== side), sig];
      const done = sidesNeeded(ctx.joint).every((s) => row.signatures.some((x) => x.side === s));
      const was = row.approval;
      row.approval = done ? "approved" : "pending";
      if (done) row.items = (row.items || []).map((i) => ({ ...(i as unknown as Record<string, unknown>), status: "approved", rejectReason: "" })) as unknown as typeof row.items;
      await row.save();
      const what = row.description || "your expense";
      if (done && was !== "approved") await notify(String(row.addedById || ""), req, "Expense approved", `"${what}" was approved and signed.`, req.params.id);
      return res.json(forViewer(req, row));
    }

    // CR 341 - review one line: approve it, or reject it with why (the expense is then rejected,
    // naming the line, and its author fixes that line and sends it again).
    if (b.lineReview && typeof b.lineReview === "object") {
      if (!ctx.manager) return res.status(403).json({ error: "Only the project's owner or its assigned employees review an expense." });
      if (row.draft) return res.status(400).json({ error: "This expense is still a draft." });
      const { id, status, reason } = b.lineReview as { id?: string; status?: string; reason?: string };
      const items = (row.items || []) as unknown as Item[];
      const at = items.findIndex((i) => i.id === id);
      if (at < 0) return res.status(404).json({ error: "That line is not on this expense." });
      if (!["approved", "rejected", "pending"].includes(String(status))) return res.status(400).json({ error: "Approve or reject the line." });
      const why = String(reason || "").trim().slice(0, 500);
      if (status === "rejected" && !why) return res.status(400).json({ error: "Say why the line is rejected." });
      items[at] = { ...items[at], status: status as Item["status"], rejectReason: status === "rejected" ? why : "" };
      row.items = items as unknown as typeof row.items;
      const rejected = items.map((it, k) => ({ it, k })).filter((x) => x.it.status === "rejected");
      if (rejected.length) {
        row.signatures = [];
        row.approval = "rejected";
        row.rejectReason = rejected.map((x) => `Line ${x.k + 1} (${x.it.description || "item"}): ${x.it.rejectReason}`).join("; ").slice(0, 1000);
        if (status === "rejected") await notify(String(row.addedById || ""), req, "Expense line rejected", `"${row.description || "Your expense"}", line ${at + 1}: ${why}`, req.params.id);
      } else if (row.approval === "rejected") { row.approval = "pending"; row.rejectReason = ""; }
      await row.save();
      return res.json(forViewer(req, row));
    }

    const changes: Record<string, unknown> = {};
    for (const f of EDITABLE) if (typeof b[f] === "string") changes[f] = b[f];
    if (typeof b.workPackageId === "string") changes.workPackageId = await cleanPackage(req.params.id, b.workPackageId);
    const items = cleanItems(b.items, isStaff(req), row.items || []);
    // CR-P (160) — an expense recorded from an invoice payment is changed on that invoice.
    if (row.invoiceId && (Object.keys(changes).length || items)) {
      return res.status(400).json({ error: "This expense comes from a payment on an invoice received. Change it in Invoice Received." });
    }
    // CR 340 - the currency and rate; a change to either re-prices the items in USD.
    if (typeof b.currency === "string") changes.currency = cleanCurrency(b.currency);
    const cur = String(changes.currency ?? row.currency ?? "USD");
    const rate = rateOf(cur, changes.exchangeRate ?? row.exchangeRate);
    if ((items || "currency" in changes || "exchangeRate" in changes) && !rate) return res.status(400).json({ error: `Enter the exchange rate from ${cur} to USD.` });
    if (items) applyItems(changes, carryReview(items, (row.items || []) as unknown as Array<Partial<Item>>), rate);
    else if (("currency" in changes || "exchangeRate" in changes) && (row.items || []).length) applyItems(changes, (row.items as unknown as Item[]), rate);
    // A draft is submitted (or taken back to draft) by the person who added it, or by staff.
    if (typeof b.draft === "boolean" && (isStaff(req) || String(row.addedById || "") === req.user!.userId) && !row.historic && row.approval !== "approved") changes.draft = b.draft;
    const moneyChanged = !!items || ["qty", "amount", "description"].some((k) => k in changes && String(changes[k]) !== String((row as unknown as Record<string, unknown>)[k] ?? ""));
    Object.assign(row, changes);
    // CR-P (153) — an outside login may edit its expense, but a changed expense needs approving again.
    if (!isStaff(req) && (Object.keys(changes).length || items) && row.approval === "approved") row.approval = "pending";
    // CR 339 - what was signed is what was approved: a change to the items or amounts after a
    // signature takes the signatures off, and the expense is approved again.
    if (!row.historic && moneyChanged && (row.signatures || []).length) { row.signatures = []; if (row.approval === "approved") row.approval = "pending"; }

    // Approval: staff only. CR-P (156) — a rejection needs a reason, and the author is told.
    const approval = b.approval;
    if ((approval === "rejected" || approval === "pending") && approval !== row.approval && !ctx.manager) return res.status(403).json({ error: "Only the project's owner or its assigned employees can change an expense's approval." });
    if (ctx.manager && APPROVAL_VALUES.includes(approval) && approval !== row.approval) {
      row.signatures = [];
      if (approval === "rejected") {
        // A reason for THIS rejection (an old one from an earlier rejection does not count).
        const reason = String(b.rejectReason ?? "").trim();
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
    const submitting = (changes.draft === false && row.isModified("draft")) || (b.resend && row.approval === "rejected" && String(row.addedById || "") === req.user!.userId);
    if (b.resend && row.approval === "rejected" && String(row.addedById || "") === req.user!.userId) {
      // CR 341 - the lines still marked rejected were not fixed: they cannot be sent back as they are.
      if ((row.items || []).some((i) => i.status === "rejected")) return res.status(400).json({ error: "Fix the rejected lines (change them) before sending it again." });
      row.approval = "pending"; row.rejectReason = "";
    }
    if (submitting) await notifyReviewers(req, b.notify, row.description || "an expense");

    await row.save();
    res.json(forViewer(req, row));
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
    res.status(201).json(forViewer(req, row));
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
      // CR 340 - the lines this file belongs to (none: the whole expense).
      itemIds: String(req.body?.itemIds || "").split(",").map((x: string) => x.trim()).filter(Boolean).slice(0, 100),
    };
    const row = await Expense.findOneAndUpdate(
      { _id: req.params.eid, projectId: req.params.id, ...ownRowFilter(req) },
      { $push: { attachments: attachment } },
      { new: true }
    );
    if (!row) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Expense not found." }); }
    res.status(201).json(forViewer(req, row));
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
    res.json(forViewer(req, row));
  } catch (err) { next(err); }
});

export default router;
