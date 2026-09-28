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
import Credential, { encryptSecret, decryptSecret } from "../models/Credential";
import User from "../models/User";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";
import { JWT_SECRET } from "../config/secrets";

const router = Router();
router.use(requireAuth);
router.use(blockGuests); // company & classified documents are internal (non-guest)

const isAdmin = (req: AuthedRequest) => req.user?.role === "admin";
const hasValidPinToken = (req: AuthedRequest): boolean => {
  const token = String(req.headers["x-classified-token"] || "");
  if (!token) return false;
  try { return !!(jwt.verify(token, JWT_SECRET) as { classified?: boolean }).classified; } catch { return false; }
};
// Who may READ classified documents (CR-P + CR-P-41b). When an active PIN gate is set (enabled +
// PIN), EVERYONE — admins included — must present a valid PIN token. With no active gate, it falls
// back to admin-only. Managing the PIN uses separate admin-gated endpoints, so an admin can always
// change or disable it without being locked out.
const classifiedAllowed = async (req: AuthedRequest): Promise<boolean> => {
  const doc = await ClassifiedAccess.findOne({ key: "singleton" }).select("enabled pinHash").lean();
  const gateOn = !!((doc as { enabled?: boolean; pinHash?: string } | null)?.enabled && (doc as { pinHash?: string } | null)?.pinHash);
  if (!gateOn) return isAdmin(req);
  return hasValidPinToken(req);
};

// ── Company Details (CR-P-37) — admin-managed custom fields ───────────────────
const DEFAULT_DETAILS: Array<{ label: string; value: string }> = [
  { label: "Legal Name", value: "GreenTech USA" },
  { label: "Headquarters", value: "Chantilly, Virginia, USA" },
  { label: "Established", value: "2020" },
  { label: "UEI", value: "FYR1QQSL3SM7" },
  { label: "CAGE / NCAGE", value: "8ZJ10" },
  { label: "Email", value: "info@gt-usa.com" },
  { label: "Phone", value: "+1 571-337-1358" },
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
    // 400 (not 401): a wrong PIN is a validation error, not a session failure — the frontend's
    // global 401 handler logs the user out, so returning 401 here would sign them out on a typo.
    if (!ok) return res.status(400).json({ error: "Incorrect PIN." });
    const token = jwt.sign({ classified: true, uid: req.user!.userId }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token });
  } catch (err) { next(err); }
});

// The dedicated classified tab that holds company stamps. Admin manages it in Classified Documents;
// PO managers can read (only) this tab's files to stamp a purchase order.
const STAMP_TAB_ID = "classified-stamps";
// The dedicated classified tab that holds reusable NDA files, picked when building an agreement.
const NDA_TAB_ID = "classified-nda";
// CR-P (45) — the standard terms & conditions get their OWN Company Documents tab. They are not
// NDAs and must not be picked out of the NDA folder, which is what the first cut did.
const TERMS_TAB_ID = "company-terms";
// Proposal step 5 (item 99) - "resumes are stored in Company Documents under Resumes and selected
// rather than re-uploaded each time". Files uploaded here are typed as resumes automatically.
const RESUMES_TAB_ID = "company-resumes";
// The company's standing PO terms, seeded so a fresh install already has them to attach.
const SEED_TERMS = [
  {
    name: "GT-Standard Terms and Conditions.pdf",
    url: "/downloads/gt-standard-terms-and-conditions.pdf",
    description: "Purchase order standard terms and conditions for commercial supplies and services (Attachment A, Revision 2).",
  },
];

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
    // CR-P (09) — NDA Files tab now lives under COMPANY documents (moved out of classified). Admin
    // uploads reusable NDAs; agreement authors still pick from it via /nda-files.
    await CompanyTab.updateOne(
      { tabId: NDA_TAB_ID },
      { $setOnInsert: { tabId: NDA_TAB_ID, label: "NDA Files", parentId: "", order: 900, system: true, kind: "company" } },
      { upsert: true }
    );
    // Migrate any pre-existing NDA tab + its files from classified → company (idempotent). The files'
    // stored urls are unchanged; only the `kind` (which area lists them) moves.
    await CompanyTab.updateOne({ tabId: NDA_TAB_ID, kind: { $ne: "company" } }, { $set: { kind: "company" } });
    await CompanyFile.updateMany({ tabId: NDA_TAB_ID, kind: { $ne: "company" } }, { $set: { kind: "company" } });

    // CR-P (45) — Terms & Conditions tab, beside NDA Files under Company documents. Agreement
    // authors attach the standard terms from here; the company's own set is seeded in once.
    await CompanyTab.updateOne(
      { tabId: TERMS_TAB_ID },
      { $setOnInsert: { tabId: TERMS_TAB_ID, label: "Terms & Conditions", parentId: "", order: 901, system: true, kind: "company" } },
      { upsert: true }
    );
    await CompanyTab.updateOne(
      { tabId: RESUMES_TAB_ID },
      { $setOnInsert: { tabId: RESUMES_TAB_ID, label: "Resumes", parentId: "", order: 902, system: true, kind: "company" } },
      { upsert: true }
    );
    if (!(await CompanyFile.countDocuments({ tabId: TERMS_TAB_ID }))) {
      await CompanyFile.insertMany(SEED_TERMS.map((d) => ({
        kind: "company", tabId: TERMS_TAB_ID, name: d.name, url: d.url,
        fileType: extOf(d.name), size: "—", description: d.description, uploadedByName: "System",
      })));
    }
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

// ── CR 306 (2026-09-25): folders inside a tab ─────────────────────────────────
// A folder is a path within its tab ("Bonds", "Bonds/Chase Bank"). Files carry the path they sit
// in; a folder made empty with New folder is remembered on the tab until files go into it.
// Classified folders follow the classified files: administrators only.

/** A clean folder path: plain names, no "." or "..", at most 8 deep. "" is the tab itself. */
export function cleanFolder(v: unknown): string {
  return String(v ?? "")
    .split(/[\\/]+/)
    .map((p) => p.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim().slice(0, 80))
    .filter((p) => p && p !== "." && p !== "..")
    .slice(0, 8)
    .join("/")
    .slice(0, 400);
}
const within = (folder: string, root: string) => folder === root || folder.startsWith(`${root}/`);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function folderTab(req: AuthedRequest, res: Response) {
  const tab = await CompanyTab.findOne({ tabId: req.params.tabId });
  if (!tab) { res.status(404).json({ error: "Tab not found." }); return null; }
  if (tab.kind === "classified" && !isAdmin(req)) { res.status(403).json({ error: "Administrator access required." }); return null; }
  return tab;
}

// POST /api/company/tabs/:tabId/folders { path } - make a folder (and any folders above it).
router.post("/tabs/:tabId/folders", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const tab = await folderTab(req, res);
    if (!tab) return;
    const folder = cleanFolder(req.body?.path);
    if (!folder) return res.status(400).json({ error: "Name the folder." });
    if (!tab.folders.includes(folder)) {
      if (tab.folders.length >= 500) return res.status(400).json({ error: "This tab has too many folders." });
      tab.folders.push(folder);
      await tab.save();
    }
    res.status(201).json(tab);
  } catch (err) { next(err); }
});

// PATCH /api/company/tabs/:tabId/folders { from, to } - rename or move a folder, with its files.
router.patch("/tabs/:tabId/folders", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const tab = await folderTab(req, res);
    if (!tab) return;
    const from = cleanFolder(req.body?.from), to = cleanFolder(req.body?.to);
    if (!from || !to) return res.status(400).json({ error: "Name the folder." });
    if (within(to, from)) return res.status(400).json({ error: "A folder cannot go inside itself." });
    const moved = (f: string) => (within(f, from) ? to + f.slice(from.length) : f);
    const files = await CompanyFile.find({ tabId: tab.tabId, folder: { $regex: `^${escapeRe(from)}(/|$)` } });
    for (const f of files) { f.folder = moved(f.folder); await f.save(); }
    tab.folders = [...new Set(tab.folders.map(moved))];
    if (!tab.folders.includes(to)) tab.folders.push(to);
    await tab.save();
    res.json(tab);
  } catch (err) { next(err); }
});

// DELETE /api/company/tabs/:tabId/folders?path= - remove an empty folder. One holding files
// (archived ones included) is refused, so nothing is deleted by accident.
router.delete("/tabs/:tabId/folders", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const tab = await folderTab(req, res);
    if (!tab) return;
    const folder = cleanFolder(req.query.path);
    if (!folder) return res.status(400).json({ error: "Which folder?" });
    const inside = await CompanyFile.countDocuments({ tabId: tab.tabId, folder: { $regex: `^${escapeRe(folder)}(/|$)` } });
    if (inside) return res.status(400).json({ error: `The folder still holds ${inside} file${inside === 1 ? "" : "s"}. Move or delete them first.` });
    tab.folders = tab.folders.filter((f) => !within(f, folder));
    await tab.save();
    res.json(tab);
  } catch (err) { next(err); }
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

// GET /api/company/proposal-docs — every active company document (and the classified ones, for
// people allowed to read them), across all tabs, for pulling straight into a proposal with no upload
// step (proposal step 4, item 104). Each carries its tab's label.
router.get("/proposal-docs", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await ensureSeeded();
    const kinds: Array<"company" | "classified"> = ["company"];
    if (await classifiedAllowed(req)) kinds.push("classified");
    const [files, tabs] = await Promise.all([
      CompanyFile.find({ kind: { $in: kinds }, archived: { $ne: true } }).sort({ createdAt: -1 }).lean(),
      CompanyTab.find().select("tabId label").lean(),
    ]);
    const labelOf = new Map(tabs.map((t) => [t.tabId, t.label]));
    res.json(files.map((f) => ({ ...f, tabLabel: labelOf.get(f.tabId) || "" })));
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

// GET /api/company/nda-files — reusable NDA files (the NDA Files tab, now under Company documents),
// readable by any staff member so they can attach an NDA to an agreement.
router.get("/nda-files", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await ensureSeeded();
    // Kind-agnostic (tabId is unique to NDA) so it works before/after the classified → company move.
    const files = await CompanyFile.find({ tabId: NDA_TAB_ID }).sort({ createdAt: -1 }).lean();
    res.json(files);
  } catch (err) {
    next(err);
  }
});

// GET /api/company/terms-files — the standard terms & conditions an agreement can attach.
// CR-P (45): a separate pool from the NDAs, so the two are never confused.
router.get("/terms-files", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await ensureSeeded();
    const files = await CompanyFile.find({ tabId: TERMS_TAB_ID, archived: { $ne: true } }).sort({ createdAt: -1 }).lean();
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
      folder: cleanFolder(req.body.folder),
      name: req.file.originalname,
      fileType: extOf(req.file.originalname),
      size: humanSize(req.file.size),
      filePath,
      uploadedByName: req.user!.name || "",
      libraryKey: tabId === RESUMES_TAB_ID ? "appx-resumes" : "",
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
    if (typeof req.body?.folder === "string") file.folder = cleanFolder(req.body.folder);   // CR 306 - move
    // Proposal step 4 - what the document is, its version and expiry.
    if (typeof req.body?.libraryKey === "string") file.libraryKey = req.body.libraryKey.slice(0, 80);
    if (typeof req.body?.version === "string") file.version = req.body.version.slice(0, 40);
    if (typeof req.body?.expiresAt === "string" && (req.body.expiresAt === "" || /^\d{4}-\d{2}-\d{2}$/.test(req.body.expiresAt))) file.expiresAt = req.body.expiresAt;
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

// ── CR 263: website credentials, on the Classified Documents page ────────────
// Everything here sits behind the same gate as the classified files: without the PIN (or, with no
// PIN set, without being an admin) none of it is reachable. An entry belongs to whoever created it
// and can be shared with named colleagues; an admin sees every entry. Passwords are encrypted at
// rest and only travel to someone who may open that entry.
const str = (v: unknown, max: number) => String(v ?? "").slice(0, max).trim();
const mayOpen = (c: { ownerId?: string; sharedWith?: string[] }, req: AuthedRequest) =>
  isAdmin(req) || c.ownerId === req.user!.userId || (c.sharedWith || []).includes(req.user!.userId);

type CredShape = {
  _id: unknown; platform: string; url: string; username: string; hint: string; notes: string;
  ownerId: string; ownerName: string; sharedWith: string[]; createdAt?: Date; updatedAt?: Date;
};
const shape = (c: CredShape & { password?: string }, withSecret: boolean) => ({
  _id: String(c._id),
  platform: c.platform, url: c.url, username: c.username, hint: c.hint, notes: c.notes,
  ownerId: c.ownerId, ownerName: c.ownerName, sharedWith: c.sharedWith || [],
  createdAt: c.createdAt, updatedAt: c.updatedAt,
  ...(withSecret ? { password: decryptSecret(c.password || "") } : {}),
});

const credGate = async (req: AuthedRequest, res: Response): Promise<boolean> => {
  if (await classifiedAllowed(req)) return true;
  res.status(403).json({ error: "Classified access required." });
  return false;
};

/** The entries this user may see: their own and the ones shared with them (an admin sees all). */
router.get("/credentials", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!(await credGate(req, res))) return;
    const filter = isAdmin(req) ? {} : { $or: [{ ownerId: req.user!.userId }, { sharedWith: req.user!.userId }] };
    const list = await Credential.find(filter).sort({ platform: 1, username: 1 }).lean();
    res.json(list.map((c) => shape(c as unknown as CredShape, false)));
  } catch (err) { next(err); }
});

/** One entry with its password - the screen asks for this when the entry is opened. */
router.get("/credentials/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!(await credGate(req, res))) return;
    const c = await Credential.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ error: "Not found." });
    if (!mayOpen(c as unknown as CredShape, req)) return res.status(403).json({ error: "This entry has not been shared with you." });
    res.json(shape(c as unknown as CredShape & { password?: string }, true));
  } catch (err) { next(err); }
});

router.post("/credentials", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!(await credGate(req, res))) return;
    const b = req.body || {};
    const platform = str(b.platform, 120);
    if (!platform) return res.status(400).json({ error: "Name the platform." });
    const c = await Credential.create({
      platform,
      url: str(b.url, 400),
      username: str(b.username, 200),
      password: encryptSecret(str(b.password, 400)),
      hint: str(b.hint, 300),
      notes: str(b.notes, 2000),
      ownerId: req.user!.userId,
      ownerName: req.user!.name || "",
      sharedWith: Array.isArray(b.sharedWith) ? b.sharedWith.map((x: unknown) => str(x, 60)).filter(Boolean).slice(0, 100) : [],
    });
    res.status(201).json(shape(c.toObject() as unknown as CredShape, false));
  } catch (err) { next(err); }
});

router.patch("/credentials/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!(await credGate(req, res))) return;
    const c = await Credential.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Not found." });
    if (!mayOpen(c.toObject() as unknown as CredShape, req)) return res.status(403).json({ error: "This entry has not been shared with you." });
    const b = req.body || {};
    if (typeof b.platform === "string") c.platform = str(b.platform, 120) || c.platform;
    if (typeof b.url === "string") c.url = str(b.url, 400);
    if (typeof b.username === "string") c.username = str(b.username, 200);
    if (typeof b.hint === "string") c.hint = str(b.hint, 300);
    if (typeof b.notes === "string") c.notes = str(b.notes, 2000);
    // An empty password field means "leave it as it is", so an edit never wipes the secret.
    if (typeof b.password === "string" && b.password.trim()) c.password = encryptSecret(str(b.password, 400));
    if (Array.isArray(b.sharedWith)) c.sharedWith = b.sharedWith.map((x: unknown) => str(x, 60)).filter(Boolean).slice(0, 100);
    await c.save();
    res.json(shape(c.toObject() as unknown as CredShape, false));
  } catch (err) { next(err); }
});

router.delete("/credentials/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!(await credGate(req, res))) return;
    const c = await Credential.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Not found." });
    // Only the owner (or an admin) removes an entry; being shared with it is not enough.
    if (!isAdmin(req) && c.ownerId !== req.user!.userId) return res.status(403).json({ error: "Only the person who saved this entry can delete it." });
    await c.deleteOne();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** Who an entry can be shared with: the internal accounts, for the picker. */
router.get("/credential-people", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!(await credGate(req, res))) return;
    // Internal accounts only; guests live in their own collection and never see classified data.
    const users = await User.find({}).select("name email role").sort({ name: 1 }).limit(500).lean();
    res.json(users.map((u) => ({ _id: String(u._id), name: u.name || "", email: u.email || "", role: u.role || "" })));
  } catch (err) { next(err); }
});

export default router;
