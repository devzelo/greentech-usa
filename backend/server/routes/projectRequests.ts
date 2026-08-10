import { Router, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import ProjectRequest, { REQUEST_TYPES, RequestStatus } from "../models/ProjectRequest";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";

// Contract-Administration / Client-Communication requests. Each type auto-numbers per project
// (RFI-001, RFI-002 …). The client's responses are kept as versioned entries under the request.
const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["contract-admin", "tech-docs", "project-info", "proposals"]));

const humanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subs = (arr: unknown): any => arr as any;
const codeFor = (type: string) => REQUEST_TYPES.find((t) => t.type === type)?.code || "REQ";
// Sanitise the custom info lines (label/value pairs) — drop empties, cap length.
const cleanLines = (v: unknown): Array<{ label: string; value: string }> =>
  Array.isArray(v)
    ? v.map((l) => ({ label: String((l as { label?: unknown })?.label ?? "").slice(0, 80), value: String((l as { value?: unknown })?.value ?? "").slice(0, 400) }))
       .filter((l) => l.label || l.value).slice(0, 30)
    : [];
// Custom named rich-text sections (title + HTML body + per-section status/lock/notes).
const SECTION_STATUSES = ["", "NotStarted", "InProgress", "WaitingInfo", "UnderReview", "Complete", "NeedsRevision"];
type CleanSection = { title: string; body: string; status: string; locked: boolean; notes: string; hidden: boolean; assignedTo: string; attachments: Array<{ name: string; filePath: string; fileType: string; size: string }> };
const cleanSections = (v: unknown): CleanSection[] =>
  Array.isArray(v)
    ? v.map((s) => {
        const o = s as Record<string, unknown>;
        const status = String(o?.status ?? "");
        const atts = Array.isArray(o?.attachments) ? (o.attachments as Array<Record<string, unknown>>).map((a) => ({ name: String(a?.name ?? ""), filePath: String(a?.filePath ?? ""), fileType: String(a?.fileType ?? ""), size: String(a?.size ?? "") })).slice(0, 30) : [];
        return {
          title: String(o?.title ?? "").slice(0, 120),
          body: String(o?.body ?? "").slice(0, 20000),
          status: SECTION_STATUSES.includes(status) ? status : "",
          locked: Boolean(o?.locked),
          notes: String(o?.notes ?? "").slice(0, 4000),
          hidden: Boolean(o?.hidden),
          assignedTo: String(o?.assignedTo ?? "").slice(0, 120),
          attachments: atts,
        };
      })
       .filter((s) => s.title || s.body || s.status || s.notes || s.attachments.length).slice(0, 40)
    : [];

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = { projectId: req.params.id };
    if (req.query.category) filter.category = String(req.query.category);
    filter.archived = String(req.query.archived) === "true" ? true : { $ne: true };
    res.json(await ProjectRequest.find(filter).sort({ createdAt: -1 }));
  } catch (err) { next(err); }
});

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body || {};
    const type = String(b.type || "Request for Information (RFI)");
    const typeCode = codeFor(type);
    // Next number for THIS type in THIS project (RFI-001, RFI-002 …) — derived from the highest,
    // not a count, so deleting a request never mints a duplicate.
    const existing = await ProjectRequest.find({ projectId: req.params.id, typeCode }).select("seq").lean();
    const seq = existing.reduce((m, r) => Math.max(m, r.seq || 0), 0) + 1;
    const doc = await ProjectRequest.create({
      projectId: req.params.id,
      category: b.category === "client-comms" ? "client-comms" : "contract-admin",
      type, typeCode,
      customTitle: String(b.customTitle || "").slice(0, 160),
      number: `${typeCode}-${String(seq).padStart(3, "0")}`,
      seq,
      title: String(b.title || "").slice(0, 200),
      date: String(b.date || new Date().toISOString().slice(0, 10)),
      description: String(b.description || "").slice(0, 20000),
      status: "Draft",
      signerName: String(b.signerName || "").slice(0, 120),
      signerTitle: String(b.signerTitle || "").slice(0, 120),
      signatureUrl: String(b.signatureUrl || ""),
      stampUrl: String(b.stampUrl || ""),
      contextLines: cleanLines(b.contextLines),
      sections: cleanSections(b.sections),
      addedById: req.user!.userId,
      addedByName: req.user!.name || "",
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

const FIELDS = ["title", "date", "description", "customTitle", "signerName", "signerTitle", "signatureUrl", "stampUrl"] as const;
router.patch("/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await ProjectRequest.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    const b = req.body || {};
    for (const f of FIELDS) if (typeof b[f] === "string") (doc as unknown as Record<string, unknown>)[f] = b[f].slice(0, f === "description" ? 20000 : 200);
    if (Array.isArray(b.contextLines)) doc.contextLines = cleanLines(b.contextLines);
    if (Array.isArray(b.sections)) doc.sections = cleanSections(b.sections);
    if (typeof b.archived === "boolean") doc.archived = b.archived;
    if (b.status && ["Draft", "Sent", "Responded", "Closed", "Cancelled"].includes(b.status)) doc.status = b.status as RequestStatus;
    await doc.save();
    res.json(doc);
  } catch (err) { next(err); }
});

router.delete("/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await ProjectRequest.findOneAndDelete({ _id: req.params.rid, projectId: req.params.id });
    for (const a of doc?.attachments || []) if (a.filePath) fs.unlink(path.resolve(a.filePath), () => {});
    for (const r of doc?.responses || []) for (const f of r.files || []) if (f.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    res.json({ message: "Request deleted" });
  } catch (err) { next(err); }
});

// ── Client responses (versioned) ─────────────────────────────────────────────
router.post("/:rid/responses", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await ProjectRequest.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    doc.responses.push({
      note: String(req.body?.note || "").slice(0, 4000),
      respondedAt: String(req.body?.respondedAt || new Date().toISOString().slice(0, 10)),
      files: [], addedByName: req.user!.name || "",
    });
    if (doc.status === "Sent" || doc.status === "Draft") doc.status = "Responded";
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

router.delete("/:rid/responses/:respId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await ProjectRequest.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    const r = subs(doc.responses).id(req.params.respId);
    for (const f of r?.files || []) if (f.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    if (r) r.deleteOne();
    await doc.save();
    res.json(doc);
  } catch (err) { next(err); }
});

// ── File uploads ──────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req: AuthedRequest, _file, cb) => {
    const dir = path.join("uploads", req.params.id, "requests", req.params.rid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });
const fileMeta = (f: Express.Multer.File) => ({ name: f.originalname, filePath: f.path.replace(/\\/g, "/"), fileType: (f.originalname.split(".").pop() || "").toLowerCase(), size: humanSize(f.size) });

// Our drafted request document.
router.post("/:rid/files", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const doc = await ProjectRequest.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!doc) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
    doc.attachments.push(fileMeta(req.file));
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { next(err); }
});
router.delete("/:rid/files/:fid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await ProjectRequest.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    const f = subs(doc.attachments).id(req.params.fid);
    if (f?.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    if (f) f.deleteOne();
    await doc.save();
    res.json(doc);
  } catch (err) { next(err); }
});

// CR-B-18 — a file on a specific custom section (by array index).
router.post("/:rid/sections/:idx/files", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const doc = await ProjectRequest.findOne({ _id: req.params.rid, projectId: req.params.id });
    const idx = Number(req.params.idx);
    if (!doc || !doc.sections[idx]) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Section not found." }); }
    doc.sections[idx].attachments = doc.sections[idx].attachments || [];
    doc.sections[idx].attachments!.push(fileMeta(req.file));
    doc.markModified("sections");
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { next(err); }
});
router.delete("/:rid/sections/:idx/files/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const doc = await ProjectRequest.findOne({ _id: req.params.rid, projectId: req.params.id });
    const idx = Number(req.params.idx);
    if (!doc || !doc.sections[idx]) return res.status(404).json({ error: "Section not found." });
    const list = doc.sections[idx].attachments || [];
    const f = list.find((a) => String((a as { _id?: unknown })._id) === req.params.aid);
    if (f?.filePath) fs.unlink(path.resolve(f.filePath), () => {});
    doc.sections[idx].attachments = list.filter((a) => String((a as { _id?: unknown })._id) !== req.params.aid);
    doc.markModified("sections");
    await doc.save();
    res.json(doc);
  } catch (err) { next(err); }
});

// A file on a specific client response.
router.post("/:rid/responses/:respId/files", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const doc = await ProjectRequest.findOne({ _id: req.params.rid, projectId: req.params.id });
    if (!doc) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
    const r = subs(doc.responses).id(req.params.respId);
    if (!r) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Response not found" }); }
    r.files.push(fileMeta(req.file));
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

export default router;
