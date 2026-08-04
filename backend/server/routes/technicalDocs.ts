import { Router, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import TechnicalDoc, { DRAWING_CATEGORIES, TechDocStatus, type ITechDocFile } from "../models/TechnicalDoc";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";

// Technical Docs: drawing submittals (with revisions + client responses) and other technical docs.
const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["tech-docs", "project-info", "proposals"]));

const humanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subs = (arr: unknown): any => arr as any;
const CATEGORY_KEYS = DRAWING_CATEGORIES.map((c) => c.key).concat("documents");

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, string> = { projectId: req.params.id };
    if (req.query.kind) filter.kind = String(req.query.kind);
    res.json(await TechnicalDoc.find(filter).sort({ order: 1, createdAt: 1 }));
  } catch (err) { next(err); }
});

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body || {};
    const kind = b.kind === "other" ? "other" : "drawing";
    const count = await TechnicalDoc.countDocuments({ projectId: req.params.id, kind });
    const doc = await TechnicalDoc.create({
      projectId: req.params.id, kind, order: count + 1,
      submittalStage: String(b.submittalStage || "10% Submittal"),
      revNo: Number(b.revNo) || 0,
      description: String(b.description || "").slice(0, 2000),
      remarks: String(b.remarks || "").slice(0, 2000),
      status: "Pending",
    });
    // A brand-new row starts its own revision family.
    doc.groupId = doc._id.toString();
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

const FIELDS = ["submittalStage", "description", "remarks", "clientComments"] as const;
router.patch("/:did", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await TechnicalDoc.findOne({ _id: req.params.did, projectId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    const b = req.body || {};
    for (const f of FIELDS) if (typeof b[f] === "string") (doc as unknown as Record<string, unknown>)[f] = b[f].slice(0, 4000);
    if (typeof b.revNo === "number") doc.revNo = b.revNo;
    if (b.status && ["Pending", "Approved", "ApprovedAsNoted", "Rejected"].includes(b.status)) doc.status = b.status as TechDocStatus;
    await doc.save();
    res.json(doc);
  } catch (err) { next(err); }
});

// Raise the next revision from a rejected/approved row: copies the files across into a fresh
// row at revNo+1, status Pending (client request: "if rejected it will be another revision …
// documents will be the same from the first one").
router.post("/:did/revise", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const src = await TechnicalDoc.findOne({ _id: req.params.did, projectId: req.params.id });
    if (!src) return res.status(404).json({ error: "Not found" });
    const count = await TechnicalDoc.countDocuments({ projectId: req.params.id, kind: src.kind });
    const copy = await TechnicalDoc.create({
      projectId: req.params.id, kind: src.kind, order: count + 1,
      // Inherit the family so the new revision nests under the same submittal as a sub-row.
      groupId: src.groupId || src._id.toString(),
      submittalStage: String(req.body?.submittalStage || src.submittalStage),
      revNo: (src.revNo || 0) + 1,
      description: src.description, remarks: "",
      status: "Pending",
      // Physically copy the files (and folder structure) so the two revisions are independent.
      files: (src.files || []).map((f) => copyFileMeta(f, req.params.id)).filter(Boolean) as never,
      folders: (src.folders || []).map((f) => ({ category: f.category, name: f.name })),
    });
    res.status(201).json(copy);
  } catch (err) { next(err); }
});
function copyFileMeta(f: ITechDocFile, projectId: string) {
  try {
    const src = path.resolve(f.filePath);
    if (!fs.existsSync(src)) return null;
    const dir = path.join("uploads", projectId, "technical-docs");
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${Date.now()}-${path.basename(src)}`);
    fs.copyFileSync(src, dest);
    return { category: f.category, folder: f.folder || "", name: f.name, filePath: dest.replace(/\\/g, "/"), fileType: f.fileType, size: f.size, remarks: f.remarks };
  } catch { return null; }
}

router.delete("/:did", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await TechnicalDoc.findOneAndDelete({ _id: req.params.did, projectId: req.params.id });
    for (const f of doc?.files || []) if (f.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    for (const f of doc?.clientFiles || []) if (f.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

// ── File uploads ──────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req: AuthedRequest, _file, cb) => { const dir = path.join("uploads", req.params.id, "technical-docs"); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 128 * 1024 * 1024 } });
const meta = (f: Express.Multer.File) => ({ name: f.originalname, filePath: f.path.replace(/\\/g, "/"), fileType: (f.originalname.split(".").pop() || "").toLowerCase(), size: humanSize(f.size) });

// Upload a file into a category bucket (drawingsPdf / drawingsDwg / specifications / reports /
// other / documents). ?category= chooses the bucket.
router.post("/:did/files", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const doc = await TechnicalDoc.findOne({ _id: req.params.did, projectId: req.params.id });
    if (!doc) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
    const category = CATEGORY_KEYS.includes(String(req.query.category)) ? String(req.query.category) : "documents";
    const folder = String(req.query.folder || "").slice(0, 120);
    doc.files.push({ category, folder, ...meta(req.file), remarks: String(req.body?.remarks || "").slice(0, 500) });
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

// Create a named subfolder within a category (client request: "Create folder" replaces bulk upload).
router.post("/:did/folders", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await TechnicalDoc.findOne({ _id: req.params.did, projectId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    const category = CATEGORY_KEYS.includes(String(req.body?.category)) ? String(req.body.category) : "documents";
    const name = String(req.body?.name || "").trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: "Folder name required." });
    if (!doc.folders.some((f) => f.category === category && f.name === name)) doc.folders.push({ category, name });
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { next(err); }
});
// Delete a subfolder and all its files.
router.delete("/:did/folders", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await TechnicalDoc.findOne({ _id: req.params.did, projectId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    const category = String(req.query.category || ""); const name = String(req.query.name || "");
    for (const f of doc.files.filter((x) => x.category === category && x.folder === name)) if (f.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    doc.files = subs(doc.files).filter((x: ITechDocFile) => !(x.category === category && x.folder === name));
    doc.folders = subs(doc.folders).filter((x: { category: string; name: string }) => !(x.category === category && x.name === name));
    await doc.save();
    res.json(doc);
  } catch (err) { next(err); }
});
router.patch("/:did/files/:fid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await TechnicalDoc.findOne({ _id: req.params.did, projectId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    const f = subs(doc.files).id(req.params.fid);
    if (!f) return res.status(404).json({ error: "File not found" });
    if (typeof req.body?.remarks === "string") f.remarks = req.body.remarks.slice(0, 500);
    await doc.save();
    res.json(doc);
  } catch (err) { next(err); }
});
router.delete("/:did/files/:fid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await TechnicalDoc.findOne({ _id: req.params.did, projectId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    const f = subs(doc.files).id(req.params.fid);
    if (f?.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    if (f) f.deleteOne();
    await doc.save();
    res.json(doc);
  } catch (err) { next(err); }
});

// The client's returned file (on approval / rejection).
router.post("/:did/client-files", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const doc = await TechnicalDoc.findOne({ _id: req.params.did, projectId: req.params.id });
    if (!doc) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
    doc.clientFiles.push(meta(req.file));
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { next(err); }
});
router.delete("/:did/client-files/:fid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await TechnicalDoc.findOne({ _id: req.params.did, projectId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    const f = subs(doc.clientFiles).id(req.params.fid);
    if (f?.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    if (f) f.deleteOne();
    await doc.save();
    res.json(doc);
  } catch (err) { next(err); }
});

// ── ZIP export ─────────────────────────────────────────────────────────────────
// Bundles one submittal row folder-by-folder (Drawings (PDF)/, Specifications/, …) so it can be
// sent to the client. ?did=<row> exports that row; otherwise every drawing row is exported, each
// under its own "<stage> Rev<n>" folder.
router.get("/export", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = { projectId: req.params.id, kind: "drawing" };
    if (req.query.did) filter._id = String(req.query.did);
    const rows = await TechnicalDoc.find(filter).sort({ order: 1 });
    if (!rows.length) return res.status(404).json({ error: "Nothing to export." });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="Submittal_${req.params.id}.zip"`);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => { throw err; });
    archive.pipe(res);
    const folderOf = (cat: string) => DRAWING_CATEGORIES.find((c) => c.key === cat)?.folder || "Other Docs";
    for (const row of rows) {
      const base = rows.length > 1 ? `${row.submittalStage} Rev${row.revNo}/` : "";
      for (const f of row.files || []) {
        const abs = path.resolve(f.filePath);
        const sub = f.folder ? `${f.folder}/` : "";
        if (f.filePath && fs.existsSync(abs)) archive.file(abs, { name: `${base}${folderOf(f.category)}/${sub}${f.name}` });
      }
      for (const f of row.clientFiles || []) {
        const abs = path.resolve(f.filePath);
        if (f.filePath && fs.existsSync(abs)) archive.file(abs, { name: `${base}Client Response/${f.name}` });
      }
    }
    await archive.finalize();
  } catch (err) { next(err); }
});

export default router;
