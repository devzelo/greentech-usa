import { Router, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import Invoice, { derivedStatus, num } from "../models/Invoice";
import Expense from "../models/Expense";
import ProcurementPO from "../models/ProcurementPO";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";

// Invoices (sent + received) with real payments. Recording a payment on a RECEIVED invoice also
// posts a matching Expense row, so paying a bill shows up in the Expenses tab with its receipt
// attached — one flow from the PO's vendor invoice all the way to the expense ledger.
const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["invoice-sent", "invoice-received"]));

const humanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subs = (arr: unknown): any => arr as any;

const INVOICE_FIELDS = ["type", "number", "party", "amount", "date", "status", "description", "poId", "subId"] as const;

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, string> = { projectId: req.params.id };
    if (req.query.type) filter.type = req.query.type as string;
    const invoices = await Invoice.find(filter).sort({ createdAt: 1 });
    res.json(invoices);
  } catch (err) { next(err); }
});

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const body: Record<string, unknown> = { projectId: req.params.id, addedByName: req.user!.name || "" };
    for (const f of INVOICE_FIELDS) if (f in (req.body || {})) body[f] = req.body[f];
    const invoice = await Invoice.create(body);
    res.status(201).json(invoice);
  } catch (err) { next(err); }
});

router.patch("/:iid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await Invoice.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!row) return res.status(404).json({ error: "Not found" });
    for (const f of INVOICE_FIELDS) if (f in (req.body || {})) (row as unknown as Record<string, unknown>)[f] = req.body[f];
    // Editing the total (or the status) re-derives the badge, so it can never contradict the
    // payments — e.g. raising the amount on a fully-paid invoice reopens it as Partially Paid.
    row.status = derivedStatus(row);
    await row.save();
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/:iid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await Invoice.findOneAndDelete({ _id: req.params.iid, projectId: req.params.id });
    // Clean up the expenses this invoice's payments created, plus their files.
    for (const p of row?.payments || []) {
      // Scope the expense delete to THIS project so a stray id can't reach another project's ledger.
      if (p.expenseId) await Expense.findOneAndDelete({ _id: p.expenseId, projectId: req.params.id }).catch(() => {});
      for (const a of p.attachments || []) if (a.filePath) fs.unlink(path.resolve(a.filePath), () => {});
    }
    for (const a of row?.attachments || []) if (a.filePath) fs.unlink(path.resolve(a.filePath), () => {});
    res.json({ message: "Invoice deleted" });
  } catch (err) { next(err); }
});

// ── Raise a received invoice straight from a Procurement PO ───────────────────
// The PO already holds the vendor's invoice number / amount / date; this turns that into a real
// invoice row on the Invoice Received tab (idempotent — one invoice per PO).
router.post("/from-po/:pid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const po = await ProcurementPO.findOne({ _id: req.params.pid, projectId: req.params.id });
    if (!po) return res.status(404).json({ error: "Purchase order not found." });
    const existing = await Invoice.findOne({ projectId: req.params.id, type: "received", poId: String(po._id) });
    if (existing) return res.json(existing);
    const invoice = await Invoice.create({
      projectId: req.params.id,
      type: "received",
      number: po.invoiceNo || `PO-${po.poNo}`,
      party: po.vendorName || "",
      amount: po.invoiceAmount || po.total || "",
      date: po.invoiceDate || "",
      status: "Unpaid",
      description: `Vendor invoice for PO ${po.poNo}`,
      poId: String(po._id),
      addedByName: req.user!.name || "",
    });
    res.status(201).json(invoice);
  } catch (err) { next(err); }
});

// ── Payments ─────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req: AuthedRequest, _file, cb) => {
    const dir = path.join("uploads", req.params.id, "invoices", req.params.iid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 32 * 1024 * 1024 } });

// Record a payment. On a RECEIVED invoice this also posts a linked Expense (money out) so the
// payment lands in the Expenses tab automatically.
router.post("/:iid/payments", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const inv = await Invoice.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!inv) return res.status(404).json({ error: "Not found" });
    const b = req.body || {};
    if (!num(b.amount)) return res.status(400).json({ error: "A payment needs an amount." });
    const payment = {
      amount: String(b.amount || ""),
      date: String(b.date || new Date().toISOString().slice(0, 10)),
      method: String(b.method || "").slice(0, 80),
      reference: String(b.reference || "").slice(0, 120),
      notes: String(b.notes || "").slice(0, 1000),
      attachments: [],
      expenseId: "",
      addedByName: req.user!.name || "",
    };
    inv.payments.push(payment);
    const added = inv.payments[inv.payments.length - 1];

    if (inv.type === "received") {
      try {
        const exp = await Expense.create({
          projectId: req.params.id,
          description: `Payment — invoice ${inv.number || ""} ${inv.party ? `· ${inv.party}` : ""}`.trim(),
          date: added.date,
          qty: "1",
          amount: added.amount,
          remarks: [added.method, added.reference, added.notes].filter(Boolean).join(" · "),
          // Mirror the Expenses tab's own rule: a subcontractor's entry always starts pending.
          approval: req.user!.role === "subcontractor" ? "pending" : "approved",
          addedById: req.user!.userId,
          addedByName: req.user!.name || "",
          addedByEmail: req.user!.email || "",
          addedByRole: req.user!.role || "",
        });
        added.expenseId = String(exp._id);
      } catch { /* the payment still stands if the expense post fails */ }
    }

    inv.status = derivedStatus(inv);
    await inv.save();
    res.status(201).json(inv);
  } catch (err) { next(err); }
});

router.delete("/:iid/payments/:pid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const inv = await Invoice.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!inv) return res.status(404).json({ error: "Not found" });
    const p = subs(inv.payments).id(req.params.pid);
    if (!p) return res.status(404).json({ error: "Payment not found" });
    // Scoped to this project so a stray id can't delete another project's expense.
    if (p.expenseId) await Expense.findOneAndDelete({ _id: p.expenseId, projectId: req.params.id }).catch(() => {});
    for (const a of p.attachments || []) if (a.filePath) fs.unlink(path.resolve(a.filePath), () => {});
    p.deleteOne();
    inv.status = derivedStatus(inv);
    await inv.save();
    res.json(inv);
  } catch (err) { next(err); }
});

// The receipt / proof for a payment — mirrored onto the linked expense so both show the file.
router.post("/:iid/payments/:pid/files", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const inv = await Invoice.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!inv) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
    const p = subs(inv.payments).id(req.params.pid);
    if (!p) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Payment not found" }); }
    const meta = {
      name: req.file.originalname,
      filePath: req.file.path.replace(/\\/g, "/"),
      fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(),
      size: humanSize(req.file.size),
    };
    p.attachments.push(meta);
    // Mirror the receipt onto the linked expense as its OWN copy of the file. Sharing one path
    // would mean deleting the expense (or its attachment) silently breaks the invoice's receipt.
    if (p.expenseId) {
      try {
        const exp = await Expense.findOne({ _id: p.expenseId, projectId: req.params.id });
        if (exp) {
          const destDir = path.join("uploads", req.params.id, "expenses", String(exp._id));
          fs.mkdirSync(destDir, { recursive: true });
          const dest = path.join(destDir, `${Date.now()}-${path.basename(meta.filePath)}`);
          fs.copyFileSync(path.resolve(meta.filePath), dest);
          exp.attachments.push({ ...meta, filePath: dest.replace(/\\/g, "/") });
          await exp.save();
        }
      } catch { /* best-effort mirror — the invoice's own receipt is unaffected */ }
    }
    await inv.save();
    res.status(201).json(inv);
  } catch (err) { next(err); }
});

// The invoice document itself (the bill/invoice PDF), separate from payment receipts.
router.post("/:iid/files", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const inv = await Invoice.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!inv) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
    inv.attachments.push({
      name: req.file.originalname,
      filePath: req.file.path.replace(/\\/g, "/"),
      fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(),
      size: humanSize(req.file.size),
    });
    await inv.save();
    res.status(201).json(inv);
  } catch (err) { next(err); }
});

router.delete("/:iid/files/:fid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const inv = await Invoice.findOne({ _id: req.params.iid, projectId: req.params.id });
    if (!inv) return res.status(404).json({ error: "Not found" });
    const f = subs(inv.attachments).id(req.params.fid);
    if (f?.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    if (f) f.deleteOne();
    await inv.save();
    res.json(inv);
  } catch (err) { next(err); }
});

export default router;
