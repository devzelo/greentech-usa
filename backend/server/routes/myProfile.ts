import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import User from "../models/User";
import UserFile from "../models/UserFile";
import Company from "../models/Company";
import Project from "../models/Project";
import SubInvoice from "../models/SubInvoice";
import Task from "../models/Task";
import { enrichTasks } from "../lib/taskProfile";
import { buildUserLinks, buildCompanyLinks, escapeRegex } from "../lib/profileLinks";
import { partyMaySee } from "../lib/agreementAccess";
import { requireAuth, AuthedRequest } from "../middleware/auth";

// CR-P (16) — self-profile endpoints. Every role uses these for its own profile preview
// (the admin-only /api/users/:id/* routes stay untouched), so guests must NOT be blocked here.
const router = Router();
router.use(requireAuth);

const humanFileSize = (bytes: number) => {
  if (!bytes) return "0 B";
  const u = ["B", "KB", "MB", "GB"]; const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
};

type LeanUser = {
  _id: unknown; name?: string; email?: string; role?: string; empId?: string;
  companyId?: unknown; signatureUrl?: string;
  signatures?: Array<{ _id: unknown; label?: string; url: string; isDefault?: boolean }>;
};
/** CR 364 - the block printed with a signature. */
const BLOCK_FIELDS = ["name", "title", "phone", "email", "website", "address"] as const;
type BlockSig = { _id: unknown; label?: string; url: string; isDefault?: boolean } & Partial<Record<(typeof BLOCK_FIELDS)[number], string>>;

// A subcontractor/partner login maps to its Directory company via the hard companyId link,
// falling back to the legacy email match (and back-filling companyId when the match hits).
async function resolveMyCompany(user: LeanUser) {
  if (user.role !== "subcontractor") return null;
  if (user.companyId) {
    const byId = await Company.findById(user.companyId).select("name email logoUrl address phone website categories category").lean();
    if (byId) return byId;
  }
  if (!user.email) return null;
  const byEmail = await Company.findOne({ email: user.email.toLowerCase() }).select("name email logoUrl address phone website categories category").lean();
  if (byEmail) await User.updateOne({ _id: user._id }, { companyId: byEmail._id }).catch(() => undefined);
  return byEmail;
}

// ── GET /api/me/links — everything related to me, role-aware ────────────────────────────────
// Staff get the same payload as the admin user profile; a subcontractor/partner login also gets
// the records linked to its Directory company (invoices, RFQs, quotes, shipments) plus its
// per-project sub-invoices, merged and de-duplicated.
router.get("/links", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const uid = req.user!.userId;
    const user = await User.findById(uid).select("name email role empId companyId").lean() as LeanUser | null;
    if (!user) return res.status(404).json({ error: "User not found." });

    const userLinks = await buildUserLinks(uid, user.name || "");
    const company = await resolveMyCompany(user);
    const companyLinks = company
      ? await buildCompanyLinks(String(company._id), company.name || "", (company as { email?: string }).email || "", uid)
      : null;

    // Sub-invoices: rows belong to a (projectId, subId) pair; resolve my pairs via the
    // subcontractors[] rows linked to my login (hard userId link, else email match).
    let subInvoices: unknown[] = [];
    if (user.role === "subcontractor" && user.email) {
      const emailRx = new RegExp(`^${escapeRegex(user.email)}$`, "i");
      const memberProjects = await Project.find({ $or: [{ "subcontractors.userId": uid }, { "subcontractors.email": emailRx }] })
        .select("projectId subcontractors.subId subcontractors.userId subcontractors.email").lean();
      const pairs: Array<{ projectId: string; subId: string }> = [];
      for (const p of memberProjects as Array<{ projectId?: string; subcontractors?: Array<{ subId?: string; userId?: string; email?: string }> }>) {
        for (const s of p.subcontractors || []) {
          if (!p.projectId || !s.subId) continue;
          if (String(s.userId || "") === uid || (s.email || "").toLowerCase() === user.email.toLowerCase()) pairs.push({ projectId: p.projectId, subId: s.subId });
        }
      }
      if (pairs.length) {
        subInvoices = await SubInvoice.find({ $or: pairs })
          .select("description amount date approval projectId subId").sort({ createdAt: -1 }).limit(200).lean();
      }
    }

    // Merge user + company records, de-duplicated by _id (projects by projectId).
    const dedupe = <T extends { _id: unknown }>(...lists: T[][]) => {
      const seen = new Set<string>();
      return lists.flat().filter((r) => { const k = String(r._id); if (seen.has(k)) return false; seen.add(k); return true; });
    };
    const seenPids = new Set<string>();
    const projects = [...userLinks.projects, ...(companyLinks?.projects || [])]
      .filter((p) => { const k = String((p as { projectId?: string }).projectId || (p as { _id: unknown })._id); if (seenPids.has(k)) return false; seenPids.add(k); return true; });

    // CR-P (62) — being NAMED on an agreement is not the same as having been GIVEN it. This list
    // used to hold every agreement naming me or my company, drafts included. A party now gets only
    // what was shared with them (see partyMaySee); agreements I created myself stay mine. Only the
    // fields the list shows leave the server: never the sharing log or who else it went to.
    const meParty = { email: String(user.email || "").trim().toLowerCase(), companyId: company ? String(company._id) : "" };
    const partyView = (a: { _id: unknown; name?: string; agreementNo?: string; title?: string; agreementType?: string; status?: string; ownerProjectId?: string; ownerContextType?: string }) => ({
      _id: a._id, name: a.name || "", agreementNo: a.agreementNo || "", title: a.title || "",
      agreementType: a.agreementType || "", status: a.status || "",
      ownerProjectId: a.ownerProjectId || "", ownerContextType: a.ownerContextType || "",
    });
    const myUserAgreements = userLinks.agreements.filter((a) => String(a.addedById || "") === uid || partyMaySee(a, meParty));
    const companyAgreements = (companyLinks?.agreements || []).filter((a) => partyMaySee(a, meParty));

    const projectNames: Record<string, string> = { ...userLinks.projectNames };
    for (const p of [...projects, ...(companyLinks?.projects || [])] as Array<{ projectId?: string; name?: string }>)
      if (p.projectId) projectNames[p.projectId] = p.name || "";
    for (const r of subInvoices as Array<{ projectId?: string }>) if (r.projectId && !(r.projectId in projectNames)) {
      const proj = await Project.findOne({ projectId: r.projectId }).select("name").lean();
      if (proj) projectNames[r.projectId] = (proj as { name?: string }).name || "";
    }

    res.json({
      projects,
      agreements: dedupe(myUserAgreements.map(partyView), companyAgreements.map(partyView)),
      expenses: userLinks.expenses,
      reminders: userLinks.reminders,
      submittals: dedupe(userLinks.submittals as Array<{ _id: unknown }>, (companyLinks?.submittals || []) as Array<{ _id: unknown }>),
      pos: dedupe(userLinks.pos as Array<{ _id: unknown }>, (companyLinks?.pos || []) as Array<{ _id: unknown }>),
      invoices: companyLinks?.invoices || [],
      rfqs: companyLinks?.rfqs || [],
      quotes: companyLinks?.quotes || [],
      shipments: companyLinks?.shipments || [],
      subInvoices,
      projectNames,
      company: company ? {
        id: String(company._id), name: company.name || "", email: (company as { email?: string }).email || "",
        logoUrl: (company as { logoUrl?: string }).logoUrl || "", address: (company as { address?: string }).address || "",
        phone: (company as { phone?: string }).phone || "", website: (company as { website?: string }).website || "",
        categories: (company as { categories?: string[] }).categories || [],
      } : null,
    });
  } catch (err) { next(err); }
});

// ── GET /api/me/tasks — my Kanban tasks across projects ─────────────────────────────────────
router.get("/tasks", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const uid = req.user!.userId;
    const user = await User.findById(uid).select("empId role email companyId name").lean() as LeanUser | null;
    if (!user) return res.status(404).json({ error: "User not found." });
    const or: Record<string, unknown>[] = [{ "assignees.userId": uid }];
    if (user.empId) or.push({ "assignees.empId": user.empId });
    const company = await resolveMyCompany(user);
    if (company?.name) or.push({ "assignees.name": new RegExp(`^${escapeRegex(company.name)}$`, "i") });
    const tasks = await Task.find({ $or: or }).sort({ updatedAt: -1 }).limit(200).lean();
    res.json(await enrichTasks(tasks as unknown as Array<Record<string, unknown>>));
  } catch (err) { next(err); }
});

// ── GET /api/me/files — documents on my profile (uploaded by admin) ─────────────────────────
router.get("/files", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try { res.json(await UserFile.find({ userId: req.user!.userId }).sort({ createdAt: -1 }).lean()); }
  catch (err) { next(err); }
});

// ── Signatures — named list with a default (CR-P 16) ────────────────────────────────────────
// The default's url is mirrored into the legacy `signatureUrl` so POs, the signatories picker
// and the agreement sign flow keep working unchanged.
const signatureStorage = multer.diskStorage({
  destination: (_req, _file, cb) => { const dir = path.join("uploads", "signatures"); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (req, file, cb) => { const ext = path.extname(file.originalname).toLowerCase() || ".png"; cb(null, `${(req as AuthedRequest).user!.userId}-${Date.now()}${ext}`); },
});
const signatureUpload = multer({
  storage: signatureStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error("Only image files are allowed."), { statusCode: 400 }));
  },
});
const MAX_SIGNATURES = 10;

const unlinkUpload = (url: string) => {
  if (url && url.includes("/uploads/signatures/")) fs.unlink(url.replace(/^\//, ""), () => undefined);
};
// CR 364 - an empty line of the block falls back to the profile (name, job title, phone, email);
// website and address fall back to the company's, on the page that prints them.
const publicSignatures = (user: { name?: string; jobTitle?: string; phone?: string; email?: string; signatures?: BlockSig[] }) =>
  (user.signatures || []).map((s) => ({
    id: String(s._id), label: s.label || "", url: s.url, isDefault: !!s.isDefault,
    name: s.name || s.label || user.name || "", title: s.title || user.jobTitle || "", phone: s.phone || user.phone || "",
    email: s.email || user.email || "", website: s.website || "", address: s.address || "",
  }));

router.get("/signatures", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.userId).select("name jobTitle phone email signatureUrl signatures");
    if (!user) return res.status(404).json({ error: "User not found." });
    // Lazy migration: surface a pre-existing single signature as the default named entry.
    if ((!user.signatures || user.signatures.length === 0) && user.signatureUrl) {
      user.signatures = [{ label: user.name || "", url: user.signatureUrl, isDefault: true }] as typeof user.signatures;
      await user.save();
    }
    res.json(publicSignatures(user));
  } catch (err) { next(err); }
});

router.post("/signatures", signatureUpload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const user = await User.findById(req.user!.userId).select("name jobTitle phone email signatureUrl signatures");
    if (!user) return res.status(404).json({ error: "User not found." });
    if ((user.signatures || []).length >= MAX_SIGNATURES) {
      fs.unlink(req.file.path, () => undefined);
      return res.status(400).json({ error: `You can keep up to ${MAX_SIGNATURES} signatures. Remove one first.` });
    }
    const url = `/${req.file.path.replace(/\\/g, "/")}`;
    const makeDefault = !(user.signatures || []).some((s) => s.isDefault);
    const label = String(req.body.label || "").trim().slice(0, 120);
    // CR 364 - the block starts from the profile; every line can be changed afterwards.
    const u = user as unknown as { name?: string; jobTitle?: string; phone?: string; email?: string };
    user.signatures.push({ label, url, isDefault: makeDefault, name: label || u.name || "", title: u.jobTitle || "", phone: u.phone || "", email: u.email || "", website: "", address: "" } as (typeof user.signatures)[number]);
    if (makeDefault) user.signatureUrl = url;
    await user.save();
    res.status(201).json(publicSignatures(user));
  } catch (err) { next(err); }
});

router.patch("/signatures/:sid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.userId).select("name jobTitle phone email signatureUrl signatures");
    if (!user) return res.status(404).json({ error: "User not found." });
    const sig = (user.signatures || []).find((s) => String(s._id) === req.params.sid);
    if (!sig) return res.status(404).json({ error: "Signature not found." });
    if (typeof req.body.label === "string") sig.label = req.body.label.trim().slice(0, 120);
    // CR 364 - the signature block's lines.
    for (const k of BLOCK_FIELDS) if (typeof req.body[k] === "string") (sig as unknown as Record<string, string>)[k] = req.body[k].trim().slice(0, k === "address" ? 300 : 160);
    if (req.body.isDefault === true) {
      for (const s of user.signatures) s.isDefault = false;
      sig.isDefault = true;
      user.signatureUrl = sig.url;
    }
    await user.save();
    res.json(publicSignatures(user));
  } catch (err) { next(err); }
});

/**
 * CR 361 - who can sign a letter: every GreenTech login (not an outside company's), with their saved
 * signatures and each one's block, so a document can be signed by anyone and with the title that fits.
 */
router.get("/signers", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    // Staff only, by an allowlist read from the account as it is now (a token's role may be hours old).
    const me = await User.findById(req.user!.userId).select("role archived").lean() as { role?: string; archived?: boolean } | null;
    if (!me || me.archived || !["admin", "employee"].includes(me.role || "")) return res.status(403).json({ error: "Not available." });
    const users = await User.find({ role: { $in: ["admin", "employee"] }, archived: { $ne: true } })
      .select("name jobTitle phone email signatureUrl signatures").sort({ name: 1 }).lean();
    res.json(users.map((u) => {
      const sigs = (u.signatures || []).length ? u.signatures : u.signatureUrl ? [{ _id: "legacy", label: u.name, url: u.signatureUrl, isDefault: true }] : [];
      return { id: String(u._id), name: u.name, jobTitle: u.jobTitle || "", email: u.email, phone: u.phone || "", signatures: publicSignatures({ ...u, signatures: sigs as BlockSig[] }) };
    }));
  } catch (err) { next(err); }
});

router.delete("/signatures/:sid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.userId).select("name jobTitle phone email signatureUrl signatures");
    if (!user) return res.status(404).json({ error: "User not found." });
    const sig = (user.signatures || []).find((s) => String(s._id) === req.params.sid);
    if (!sig) return res.status(404).json({ error: "Signature not found." });
    const wasDefault = !!sig.isDefault;
    unlinkUpload(sig.url);
    user.signatures = user.signatures.filter((s) => String(s._id) !== req.params.sid) as typeof user.signatures;
    if (wasDefault) {
      const first = user.signatures[0];
      if (first) { first.isDefault = true; user.signatureUrl = first.url; }
      else user.signatureUrl = "";
    }
    await user.save();
    res.json(publicSignatures(user));
  } catch (err) { next(err); }
});

// ── Resume file — a plain uploaded CV, separate from the resume builder (CR-P 16) ───────────
const resumeStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uid = String((req as AuthedRequest).user!.userId).replace(/[^\w-]/g, "");
    const dir = path.join("uploads", "resumes", uid || "misc");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `cv-${Date.now()}-${file.originalname}`),
});
const resumeUpload = multer({ storage: resumeStorage, limits: { fileSize: 32 * 1024 * 1024 } });

router.post("/resume-file", resumeUpload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const user = await User.findById(req.user!.userId).select("resumeFile");
    if (!user) return res.status(404).json({ error: "User not found." });
    if (user.resumeFile?.filePath) fs.unlink(path.resolve(user.resumeFile.filePath), () => undefined);
    user.resumeFile = { name: req.file.originalname, filePath: req.file.path.replace(/\\/g, "/"), size: humanFileSize(req.file.size) };
    await user.save();
    res.status(201).json(user.resumeFile);
  } catch (err) { next(err); }
});

router.delete("/resume-file", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.userId).select("resumeFile");
    if (!user) return res.status(404).json({ error: "User not found." });
    if (user.resumeFile?.filePath) fs.unlink(path.resolve(user.resumeFile.filePath), () => undefined);
    user.resumeFile = { name: "", filePath: "", size: "" };
    await user.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Picture gallery (2026-10-08) ───────────────────────────────────────────────────────────────
// "Allow all users to add multiple pictures in their profile, with a title / description for each.
// They will be used for Employee or Contractor ID cards, profile reports and company profiles."
// Kept under uploads/profile-gallery/<user>, read with the file token like every private upload.
const MAX_PICTURES = 60;
// Raster pictures only, checked three ways: the declared type, the file name's extension, and the
// file's first bytes. The stored name takes its extension from the checked type, never from the
// uploaded name, so nothing but a picture can be served back from this folder.
const GALLERY_TYPES: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
const GALLERY_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const isPicture = (file: string): boolean => {
  try {
    const fd = fs.openSync(file, "r");
    const b = Buffer.alloc(12);
    fs.readSync(fd, b, 0, 12, 0);
    fs.closeSync(fd);
    return (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)                                   // JPEG
      || b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) // PNG
      || b.subarray(0, 4).toString("latin1") === "GIF8"                                          // GIF
      || (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP");
  } catch { return false; }
};
const galleryStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uid = String((req as AuthedRequest).user!.userId).replace(/[^\w-]/g, "");
    const dir = path.join("uploads", "profile-gallery", uid || "misc");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `pic-${crypto.randomBytes(12).toString("hex")}${GALLERY_TYPES[file.mimetype] || ".jpg"}`),
});
const galleryUpload = multer({
  storage: galleryStorage,
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    if (GALLERY_TYPES[file.mimetype] && GALLERY_EXTS.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(Object.assign(new Error("Only JPEG, PNG, WebP or GIF pictures can be added to the gallery."), { statusCode: 400 }));
  },
});
type GalleryPic = { _id: unknown; url: string; title?: string; description?: string; uploadedAt?: Date };
const publicGallery = (list: GalleryPic[] = []) =>
  list.map((g) => ({ id: String(g._id), url: g.url, title: g.title || "", description: g.description || "", uploadedAt: g.uploadedAt }));
const textOf = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
/** Only a file inside this user's own gallery folder is ever removed. */
const unlinkGalleryPic = (uid: string, url: string) => {
  const rel = url.replace(/^\/+/, "");
  if (rel.startsWith(`uploads/profile-gallery/${uid}/`) && !rel.includes("..")) fs.unlink(rel, () => undefined);
};

router.get("/gallery", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.userId).select("gallery").lean() as { gallery?: GalleryPic[] } | null;
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json(publicGallery(user.gallery));
  } catch (err) { next(err); }
});

// POST /api/me/gallery - add pictures (several at once); `meta` is a JSON list of { title, description }
// in the same order as the files. Answers with the whole gallery and the new pictures' ids.
router.post("/gallery", galleryUpload.array("files", 20), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  const files = (req.files as Express.Multer.File[] | undefined) || [];
  const drop = () => files.forEach((f) => fs.unlink(f.path, () => undefined));
  try {
    if (!files.length) return res.status(400).json({ error: "No picture uploaded." });
    const fake = files.find((f) => !isPicture(f.path));
    if (fake) { drop(); return res.status(400).json({ error: `"${fake.originalname}" is not a JPEG, PNG, WebP or GIF picture.` }); }
    const user = await User.findById(req.user!.userId).select("gallery");
    if (!user) { drop(); return res.status(404).json({ error: "User not found." }); }
    const list = (user.get("gallery") || []) as GalleryPic[];
    if (list.length + files.length > MAX_PICTURES) { drop(); return res.status(400).json({ error: `A gallery keeps up to ${MAX_PICTURES} pictures. Remove some first.` }); }
    let meta: Array<{ title?: unknown; description?: unknown }> = [];
    try { const m = JSON.parse(String(req.body.meta || "[]")); if (Array.isArray(m)) meta = m; } catch { /* no titles */ }
    const start = list.length;
    files.forEach((f, i) => {
      list.push({ url: `/${f.path.replace(/\\/g, "/")}`, title: textOf(meta[i]?.title, 160), description: textOf(meta[i]?.description, 1000), uploadedAt: new Date() } as GalleryPic);
    });
    user.set("gallery", list);
    await user.save();
    const saved = (user.get("gallery") || []) as GalleryPic[];
    res.status(201).json({ gallery: publicGallery(saved), created: saved.slice(start).map((g) => String(g._id)) });
  } catch (err) { drop(); next(err); }
});

// PUT /api/me/gallery - the gallery as edited: its order, each picture's title and description.
// A picture left out is removed (and its file deleted).
router.put("/gallery", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const items = Array.isArray(req.body?.items) ? (req.body.items as Array<{ id?: unknown; title?: unknown; description?: unknown }>) : null;
    if (!items) return res.status(400).json({ error: "Send the gallery's pictures." });
    const user = await User.findById(req.user!.userId).select("gallery");
    if (!user) return res.status(404).json({ error: "User not found." });
    const uid = String(req.user!.userId).replace(/[^\w-]/g, "");
    const current = (user.get("gallery") || []) as GalleryPic[];
    const byId = new Map(current.map((g) => [String(g._id), g]));
    const next_: GalleryPic[] = [];
    const kept = new Set<string>();
    for (const it of items) {
      const g = byId.get(String(it.id));
      if (!g || kept.has(String(it.id))) continue;
      kept.add(String(it.id));
      g.title = textOf(it.title, 160);
      g.description = textOf(it.description, 1000);
      next_.push(g);
    }
    for (const g of current) if (!kept.has(String(g._id))) unlinkGalleryPic(uid, g.url);
    user.set("gallery", next_);
    await user.save();
    res.json(publicGallery((user.get("gallery") || []) as GalleryPic[]));
  } catch (err) { next(err); }
});

export default router;
