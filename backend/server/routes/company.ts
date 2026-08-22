import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import CompanyTab from "../models/CompanyTab";
import CompanyFile from "../models/CompanyFile";
import CompanyDetail from "../models/CompanyDetail";
import ClassifiedAccess from "../models/ClassifiedAccess";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";
import { JWT_SECRET } from "../config/secrets";

const router = Router();
router.use(requireAuth);
router.use(blockGuests); // company & classified documents are internal (non-guest)

// Classified documents are admin-only OR an employee who has entered the PIN (CR-P). An admin
// always passes; otherwise a valid short-lived "classified" token (from /classified-access/verify)
// in the x-classified-token header unlocks read access while the feature is enabled.
const isAdmin = (req: AuthedRequest) => req.user?.role === "admin";
const classifiedAllowed = async (req: AuthedRequest): Promise<boolean> => {
  if (isAdmin(req)) return true;
  const token = String(req.headers["x-classified-token"] || "");
  if (!token) return false;
  try { const d = jwt.verify(token, JWT_SECRET) as { classified?: boolean }; if (!d.classified) return false; }
  catch { return false; }
  // A valid PIN token only grants access while the feature is still enabled.
  const doc = await ClassifiedAccess.findOne({ key: "singleton" }).select("enabled").lean();
  return !!(doc as { enabled?: boolean } | null)?.enabled;
};

// ── Company Details (CR-P-37) — admin-managed custom fields ───────────────────
const DEFAULT_DETAILS: Array<{ label: string; value: string }> = [
  { label: "Legal Name", value: "GreenTech USA" },
  { label: "Headquarters", value: "Chantilly, Virginia, USA" },
  { label: "Established", value: "2020" },
  { label: "UEI", value: "FYR1QQSL3SM7" },
  { label: "CAGE / NCAGE", value: "8ZJ10" },
  { label: "Email", value: "info@gt-usa.com" },
  { label: "Phone", value: "+1-125-258-3525" },
  { label: "Website", value: "www.gt-usa.com" },
];

router.get("/details", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!(await CompanyDetail.countDocuments())) {
      await CompanyDetail.insertMany(DEFAULT_DETAILS.map((d, i) => ({ ...d, order: i })));
    }
    res.json(await CompanyDetail.find().sort({ order: 1, createdAt: 1 }).lean());
  } catch (err) { next(err); }
});

router.post("/details", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "Only an admin can edit company details." });
    const label = String(req.body?.label || "").trim().slice(0, 120);
    if (!label) return res.status(400).json({ error: "A field needs a label." });
    const max = await CompanyDetail.findOne().sort({ order: -1 }).select("order").lean();
    const row = await CompanyDetail.create({ label, value: String(req.body?.value || "").slice(0, 2000), order: ((max as { order?: number } | null)?.order ?? -1) + 1 });
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch("/details/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "Only an admin can edit company details." });
    const row = await CompanyDetail.findById(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    if (typeof req.body?.label === "string") row.label = req.body.label.trim().slice(0, 120) || row.label;
    if (typeof req.body?.value === "string") row.value = req.body.value.slice(0, 2000);
    if (typeof req.body?.order === "number") row.order = req.body.order;
    await row.save();
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/details/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "Only an admin can edit company details." });
    await CompanyDetail.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

// ── Classified access PIN (CR-P) — admin managed, employee unlock ─────────────
const classifiedDoc = async () => (await ClassifiedAccess.findOne({ key: "singleton" })) || (await ClassifiedAccess.create({ key: "singleton" }));

// Status — every non-guest can read whether the tab is available + PIN-protected.
router.get("/classified-access", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await classifiedDoc();
    res.json({ enabled: doc.enabled, hasPin: !!doc.pinHash, isAdmin: isAdmin(req) });
  } catch (err) { next(err); }
});

// Admin: enable/disable + set/update the PIN.
router.put("/classified-access", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "Administrator access required." });
    const doc = await classifiedDoc();
    if (typeof req.body?.enabled === "boolean") doc.enabled = req.body.enabled;
    if (typeof req.body?.pin === "string" && req.body.pin.trim()) {
      const pin = req.body.pin.trim();
      if (!/^\d{4,12}$/.test(pin)) return res.status(400).json({ error: "PIN must be 4–12 digits." });
      doc.pinHash = await bcrypt.hash(pin, 10);
    }
    await doc.save();
    res.json({ enabled: doc.enabled, hasPin: !!doc.pinHash });
  } catch (err) { next(err); }
});

// Employee: verify the PIN → short-lived token that unlocks classified reads.
router.post("/classified-access/verify", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await classifiedDoc();
    if (!doc.enabled) return res.status(403).json({ error: "Classified access is disabled." });
    if (!doc.pinHash) return res.status(400).json({ error: "No PIN has been set yet." });
    const ok = await bcrypt.compare(String(req.body?.pin || ""), doc.pinHash);
    if (!ok) return res.status(401).json({ error: "Incorrect PIN." });
    const token = jwt.sign({ classified: true, uid: req.user!.userId }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token });
  } catch (err) { next(err); }
});

// The dedicated classified tab that holds company stamps. Admin manages it in Classified Documents;
// PO managers can read (only) this tab's files to stamp a purchase order.
const STAMP_TAB_ID = "classified-stamps";
// The dedicated classified tab that holds reusable NDA files, picked when building an agreement.
const NDA_TAB_ID = "classified-nda";

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "tab";

const humanSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const extOf = (name: string) => (name.split(".").pop() || "").toLowerCase();

// ── Pre-defined tab tree + dummy documents (seeded once) ─────────────────────
const SEED: Array<{ label: string; children?: string[] }> = [
  { label: "Templates", children: ["Letterhead", "Proposal"] },
  { label: "Marketing - Branding", children: ["Company Profile", "Fact Sheet", "Website Content", "Images"] },
  { label: "Legal Docs" },
  { label: "Insurance" },
  { label: "Catalog and Vendors" },
  { label: "Bank Info" },
  { label: "Archive" },
];

// Dummy documents keyed by tab slug — reference real public assets so previews work.
const SEED_DOCS: Record<string, Array<{ name: string; url: string; description: string }>> = {
  "templates-letterhead": [{ name: "GreenTech USA Letterhead.png", url: "/gt-usa-logo-new.png", description: "Official letterhead template." }],
  "templates-proposal": [{ name: "Proposal Template.pdf", url: "/downloads/greentech-profile.pdf", description: "Standard proposal cover template." }],
  "marketing-branding-company-profile": [{ name: "Company Profile.pdf", url: "/downloads/greentech-profile.pdf", description: "Full corporate profile." }],
  "marketing-branding-fact-sheet": [{ name: "Fact Sheet.pdf", url: "/downloads/greentech-factsheet.pdf", description: "One-page corporate fact sheet." }],
  "marketing-branding-website-content": [{ name: "Website Overview.png", url: "/about-greentech-usa.png", description: "Approved website hero content." }],
  "marketing-branding-images": [
    { name: "Primary Logo.png", url: "/gt-usa-logo-new.png", description: "Primary company logo." },
    { name: "Alternate Logo.png", url: "/gt-usa-logo.png", description: "Alternate logo mark." },
    { name: "Horizontal Logo.png", url: "/gt-logo-horizontal.png", description: "Horizontal logo lockup." },
  ],
  "legal-docs": [{ name: "Certificate of Incorporation.pdf", url: "/downloads/greentech-profile.pdf", description: "Company registration document." }],
  "insurance": [{ name: "General Liability Insurance.pdf", url: "/downloads/greentech-factsheet.pdf", description: "Active insurance certificate." }],
  "catalog-and-vendors": [{ name: "Approved Vendor List.pdf", url: "/downloads/greentech-profile.pdf", description: "Current approved vendors & catalogs." }],
  "bank-info": [{ name: "Bank Details.pdf", url: "/downloads/greentech-factsheet.pdf", description: "Company banking information." }],
  "archive": [{ name: "2024 Annual Summary.pdf", url: "/downloads/greentech-profile.pdf", description: "Archived annual records." }],
};

const SEED_CLASSIFIED = [
  { name: "Confidential — M&A Memo.pdf", url: "/downloads/greentech-profile.pdf", description: "Restricted strategic memo." },
  { name: "Board Resolution (Sealed).pdf", url: "/downloads/greentech-factsheet.pdf", description: "Confidential board resolution." },
];

let seeding: Promise<void> | null = null;
async function ensureSeeded() {
  if (seeding) return seeding;
  seeding = (async () => {
    // Company tabs + files — seed once (legacy tabs have no `kind`, treated as company).
    if (!(await CompanyTab.countDocuments({ kind: { $ne: "classified" } }))) {
      let order = 0;
      for (const main of SEED) {
        const mainId = slug(main.label);
        await CompanyTab.updateOne(
          { tabId: mainId },
          { $setOnInsert: { tabId: mainId, label: main.label, parentId: "", order: order++, system: true, kind: "company" } },
          { upsert: true }
        );
        for (const child of main.children || []) {
          const childId = `${mainId}-${slug(child)}`;
          await CompanyTab.updateOne(
            { tabId: childId },
            { $setOnInsert: { tabId: childId, label: child, parentId: mainId, order: order++, system: true, kind: "company" } },
            { upsert: true }
          );
        }
      }
      const fileDocs: Array<Record<string, unknown>> = [];
      for (const [tabId, docs] of Object.entries(SEED_DOCS)) {
        for (const d of docs) {
          fileDocs.push({ kind: "company", tabId, name: d.name, url: d.url, fileType: extOf(d.name), size: "—", description: d.description, uploadedByName: "System" });
        }
      }
      if (fileDocs.length) await CompanyFile.insertMany(fileDocs);
    }
    // Classified — a starter main tab (admins build the rest), with the dummy files attached to it.
    if (!(await CompanyTab.countDocuments({ kind: "classified" }))) {
      const mainId = "classified-restricted";
      await CompanyTab.updateOne(
        { tabId: mainId },
        { $setOnInsert: { tabId: mainId, label: "Restricted", parentId: "", order: 0, system: true, kind: "classified" } },
        { upsert: true }
      );
      if (!(await CompanyFile.countDocuments({ kind: "classified" }))) {
        await CompanyFile.insertMany(SEED_CLASSIFIED.map((d) => ({ kind: "classified", tabId: mainId, name: d.name, url: d.url, fileType: extOf(d.name), size: "—", description: d.description, uploadedByName: "System" })));
      } else {
        // Older flat classified files had no tab — attach them to the starter tab.
        await CompanyFile.updateMany({ kind: "classified", $or: [{ tabId: "" }, { tabId: { $exists: false } }] }, { $set: { tabId: mainId } });
      }
    }
    // Dedicated Stamps tab (classified) — admin uploads company stamps here; PO managers pick from it.
    await CompanyTab.updateOne(
      { tabId: STAMP_TAB_ID },
      { $setOnInsert: { tabId: STAMP_TAB_ID, label: "Stamps", parentId: "", order: 1, system: true, kind: "classified" } },
      { upsert: true }
    );
    // Dedicated NDA Files tab (classified) — admin uploads reusable NDAs; agreement authors pick from it.
    await CompanyTab.updateOne(
      { tabId: NDA_TAB_ID },
      { $setOnInsert: { tabId: NDA_TAB_ID, label: "NDA Files", parentId: "", order: 2, system: true, kind: "classified" } },
      { upsert: true }
    );
  })();
  try { await seeding; } finally { seeding = null; }
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

// GET /api/company/tabs?kind=company|classified — tab tree for that area (auto-seeds once).
router.get("/tabs", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await ensureSeeded();
    const classified = req.query.kind === "classified";
    if (classified && !(await classifiedAllowed(req))) return res.status(403).json({ error: "Classified access required." });
    // Legacy tabs without `kind` are treated as company.
    const filter = classified ? { kind: "classified" } : { kind: { $ne: "classified" } };
    const tabs = await CompanyTab.find(filter).sort({ order: 1, createdAt: 1 }).lean();
    res.json(tabs);
  } catch (err) {
    next(err);
  }
});

// POST /api/company/tabs — create a main tab or sub-tab (kind = company|classified).
router.post("/tabs", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const label = String(req.body.label || "").trim();
    const parentId = String(req.body.parentId || "");
    const kind = req.body.kind === "classified" ? "classified" : "company";
    if (kind === "classified" && !isAdmin(req)) return res.status(403).json({ error: "Administrator access required." });
    if (!label) return res.status(400).json({ error: "A tab name is required." });
    if (parentId && !(await CompanyTab.exists({ tabId: parentId }))) {
      return res.status(400).json({ error: "Parent tab not found." });
    }
    const base = `${parentId ? parentId + "-" : ""}${slug(label)}`;
    let tabId = base;
    let n = 2;
    while (await CompanyTab.exists({ tabId })) tabId = `${base}-${n++}`;
    const max = await CompanyTab.findOne().sort({ order: -1 }).select("order").lean();
    const tab = await CompanyTab.create({ tabId, label, parentId, order: (max?.order ?? 0) + 1, system: false, kind });
    res.status(201).json(tab);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/company/tabs/:tabId — rename.
router.patch("/tabs/:tabId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const label = String(req.body.label || "").trim();
    if (!label) return res.status(400).json({ error: "A tab name is required." });
    const target = await CompanyTab.findOne({ tabId: req.params.tabId });
    if (!target) return res.status(404).json({ error: "Tab not found." });
    if (target.kind === "classified" && !isAdmin(req)) return res.status(403).json({ error: "Administrator access required." });
    target.label = label;
    await target.save();
    res.json(target);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/company/tabs/:tabId — remove a tab, its sub-tabs, and their files.
router.delete("/tabs/:tabId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const tabId = req.params.tabId;
    const target = await CompanyTab.findOne({ tabId }).select("kind").lean();
    if (target && (target as { kind?: string }).kind === "classified" && !isAdmin(req)) return res.status(403).json({ error: "Administrator access required." });
    const children = await CompanyTab.find({ parentId: tabId }).select("tabId").lean();
    const ids = [tabId, ...children.map((c) => c.tabId)];
    const files = await CompanyFile.find({ tabId: { $in: ids } }).select("filePath").lean();
    for (const f of files) {
      if (f.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    }
    await CompanyFile.deleteMany({ tabId: { $in: ids } });
    await CompanyTab.deleteMany({ tabId: { $in: ids } });
    res.json({ ok: true, removed: ids.length });
  } catch (err) {
    next(err);
  }
});

// ── Files ──────────────────────────────────────────────────────────────────

// GET /api/company/files?tab=<tabId>&kind=company|classified
router.get("/files", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await ensureSeeded();
    const kind = req.query.kind === "classified" ? "classified" : "company";
    if (kind === "classified" && !(await classifiedAllowed(req))) return res.status(403).json({ error: "Classified access required." });
    // Both areas are tabbed — files are scoped to the selected tab.
    // CR-P-39 — ?archived=true shows only archived files; default hides them.
    const wantArchived = req.query.archived === "true";
    const filter: Record<string, unknown> = { kind, tabId: String(req.query.tab || ""), archived: wantArchived ? true : { $ne: true } };
    const files = await CompanyFile.find(filter).sort({ createdAt: -1 }).lean();
    res.json(files);
  } catch (err) {
    next(err);
  }
});

// GET /api/company/stamps — company stamps (the classified Stamps tab), readable by any staff
// member so they can stamp a PO without full classified access.
router.get("/stamps", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await ensureSeeded();
    const files = await CompanyFile.find({ kind: "classified", tabId: STAMP_TAB_ID }).sort({ createdAt: -1 }).lean();
    res.json(files);
  } catch (err) {
    next(err);
  }
});

// GET /api/company/nda-files — reusable NDA files (the classified NDA Files tab), readable by any
// staff member so they can attach an NDA to an agreement without full classified access.
router.get("/nda-files", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await ensureSeeded();
    const files = await CompanyFile.find({ kind: "classified", tabId: NDA_TAB_ID }).sort({ createdAt: -1 }).lean();
    res.json(files);
  } catch (err) {
    next(err);
  }
});

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const kind = req.body.kind === "classified" ? "classified" : "company";
    const tab = kind === "classified" ? "classified" : String(req.body.tabId || "general");
    if (!/^[\w-]+$/.test(tab)) return cb(Object.assign(new Error("Invalid tab."), { statusCode: 400 }), "");
    const dir = path.join("uploads", "company", kind === "classified" ? "classified" : tab);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });

// POST /api/company/files — upload one file (multipart: file, kind, tabId).
router.post("/files", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const kind = req.body.kind === "classified" ? "classified" : "company";
    if (kind === "classified" && !isAdmin(req)) { fs.unlink(req.file.path, () => {}); return res.status(403).json({ error: "Administrator access required." }); }
    const tabId = String(req.body.tabId || "");
    if (!(await CompanyTab.exists({ tabId }))) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "Pick a tab before uploading." });
    }
    const filePath = req.file.path.replace(/\\/g, "/");
    const file = await CompanyFile.create({
      kind,
      tabId,
      name: req.file.originalname,
      fileType: extOf(req.file.originalname),
      size: humanSize(req.file.size),
      filePath,
      uploadedByName: req.user!.name || "",
    });
    res.status(201).json(file);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/company/files/:id — archive / restore (CR-P-39).
router.patch("/files/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const file = await CompanyFile.findById(req.params.id);
    if (!file) return res.status(404).json({ error: "File not found." });
    if (file.kind === "classified" && !isAdmin(req)) return res.status(403).json({ error: "Administrator access required." });
    if (typeof req.body?.archived === "boolean") file.archived = req.body.archived;
    if (typeof req.body?.description === "string") file.description = req.body.description.slice(0, 2000);
    await file.save();
    res.json(file);
  } catch (err) { next(err); }
});

// DELETE /api/company/files/:id
router.delete("/files/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const file = await CompanyFile.findById(req.params.id);
    if (!file) return res.status(404).json({ error: "File not found." });
    if (file.kind === "classified" && !isAdmin(req)) return res.status(403).json({ error: "Administrator access required." });
    await file.deleteOne();
    if (file.filePath) fs.unlink(path.resolve(file.filePath), () => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
