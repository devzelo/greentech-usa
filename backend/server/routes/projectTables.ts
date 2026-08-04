import { Router, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import ProjectTable, { type IProjectTableFile } from "../models/ProjectTable";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";

// Generic structured-table rows (see model). Scoped by ?table=<key>.
const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["project-info", "proposals", "tech-docs", "closeout"]));

const humanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
const tableKey = (req: AuthedRequest) => String(req.query.table || req.body?.tableKey || "").slice(0, 60);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subs = (arr: unknown): any => arr as any;
const cleanData = (d: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (d && typeof d === "object") for (const [k, v] of Object.entries(d as Record<string, unknown>)) out[String(k).slice(0, 40)] = String(v ?? "").slice(0, 4000);
  return out;
};

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const key = tableKey(req);
    if (!key) return res.status(400).json({ error: "table key required" });
    res.json(await ProjectTable.find({ projectId: req.params.id, tableKey: key }).sort({ order: 1, createdAt: 1 }));
  } catch (err) { next(err); }
});

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const key = tableKey(req);
    if (!key) return res.status(400).json({ error: "table key required" });
    const count = await ProjectTable.countDocuments({ projectId: req.params.id, tableKey: key });
    const row = await ProjectTable.create({
      projectId: req.params.id, tableKey: key, order: count + 1,
      revNo: Number(req.body?.revNo) || 0, data: cleanData(req.body?.data),
    });
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch("/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await ProjectTable.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!row) return res.status(404).json({ error: "Not found" });
    if (req.body?.data && typeof req.body.data === "object") row.data = { ...row.data, ...cleanData(req.body.data) };
    if (typeof req.body?.revNo === "number") row.revNo = req.body.revNo;
    if (typeof req.body?.order === "number") row.order = req.body.order;
    row.markModified("data");
    await row.save();
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await ProjectTable.findOneAndDelete({ _id: req.params.rid, projectId: req.params.id });
    for (const f of row?.files || []) if (f.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

const storage = multer.diskStorage({
  destination: (req: AuthedRequest, _f, cb) => { const dir = path.join("uploads", req.params.id, "tables"); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (_r, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });

router.post("/:rid/files", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const row = await ProjectTable.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!row) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
    row.files.push({ name: req.file.originalname, filePath: req.file.path.replace(/\\/g, "/"), fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(), size: humanSize(req.file.size), folder: String(req.query.folder || "").slice(0, 120) });
    await row.save();
    res.status(201).json(row);
  } catch (err) { next(err); }
});
// Named subfolders within a row's files (Closeout "Create folder").
router.post("/:rid/folders", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await ProjectTable.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!row) return res.status(404).json({ error: "Not found" });
    const name = String(req.body?.name || "").trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: "Folder name required." });
    if (!row.folders.includes(name)) row.folders.push(name);
    await row.save();
    res.status(201).json(row);
  } catch (err) { next(err); }
});
router.delete("/:rid/folders", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await ProjectTable.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!row) return res.status(404).json({ error: "Not found" });
    const name = String(req.query.name || "");
    for (const f of row.files.filter((x) => (x.folder || "") === name)) if (f.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    row.files = subs(row.files).filter((x: IProjectTableFile) => (x.folder || "") !== name);
    row.folders = row.folders.filter((n) => n !== name);
    await row.save();
    res.json(row);
  } catch (err) { next(err); }
});
router.patch("/:rid/files/:fid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await ProjectTable.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!row) return res.status(404).json({ error: "Not found" });
    const f = subs(row.files).id(req.params.fid);
    if (!f) return res.status(404).json({ error: "File not found" });
    if (typeof req.body?.remarks === "string") f.remarks = req.body.remarks.slice(0, 500);
    await row.save();
    res.json(row);
  } catch (err) { next(err); }
});
router.delete("/:rid/files/:fid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const row = await ProjectTable.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!row) return res.status(404).json({ error: "Not found" });
    const f = subs(row.files).id(req.params.fid);
    if (f?.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    if (f) f.deleteOne();
    await row.save();
    res.json(row);
  } catch (err) { next(err); }
});

export default router;
