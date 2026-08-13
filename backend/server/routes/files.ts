import { Router, Response } from "express";
import path from "path";
import multer from "multer";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { signFilesToken, signFileShareToken } from "../lib/fileTokens";
import { sendMail, MAIL_FROM_NAME } from "../lib/mailer";

const router = Router();
router.use(requireAuth);
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
// Normalize a stored /uploads path to a safe relative path (shared by share-link + email).
const safeRel = (raw: string): string | null => {
  const rel = String(raw || "").split("?")[0].replace(/\\/g, "/").replace(/^\/+/, "").replace(/^uploads\//, "");
  const normalized = path.posix.normalize(rel);
  if (!normalized || normalized === "." || normalized.startsWith("..") || path.posix.isAbsolute(normalized)) return null;
  return normalized;
};

// GET /api/files/token — short-lived token the app appends to /uploads URLs
// so <img>/<a download> requests (which cannot carry auth headers) are authorized.
router.get("/token", (req: AuthedRequest, res: Response) => {
  res.json({ token: signFilesToken(req.user!.userId) });
});

// POST /api/files/share-link — mint a signed single-file link (7-day expiry)
// for sharing a stored document with someone outside the app.
router.post("/share-link", (req: AuthedRequest, res: Response) => {
  const raw = typeof req.body?.path === "string" ? req.body.path : "";
  const rel = raw
    .split("?")[0]
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^uploads\//, "");
  const normalized = safeRel(raw);
  if (!normalized) return res.status(400).json({ error: "Invalid file path." });
  res.json({ url: `/uploads/${normalized}?token=${encodeURIComponent(signFileShareToken(normalized))}` });
});

// POST /api/files/email — CR-P-11 — send a stored document to someone OUTSIDE the org by email,
// as a signed 7-day link. Best-effort: 502 if the server has no SMTP configured.
router.post("/email", async (req: AuthedRequest, res: Response) => {
  const to = String(req.body?.to || "").trim();
  const docName = String(req.body?.docName || "Document").slice(0, 200);
  const note = String(req.body?.note || "").slice(0, 2000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: "Enter a valid email address." });
  const normalized = safeRel(req.body?.path);
  if (!normalized) return res.status(400).json({ error: "Invalid file path." });
  const signed = `/uploads/${normalized}?token=${encodeURIComponent(signFileShareToken(normalized))}`;
  const base = (process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
  const link = `${base}${signed}`;
  const sender = req.user!.name || `A ${MAIL_FROM_NAME} colleague`;
  const html =
    `<p>${escapeHtml(sender)} has shared a document with you via ${escapeHtml(MAIL_FROM_NAME)}.</p>` +
    (note ? `<p>${escapeHtml(note)}</p>` : "") +
    `<p><strong>${escapeHtml(docName)}</strong></p>` +
    `<p><a href="${link}">Open the document</a> — link valid for 7 days.</p>`;
  const ok = await sendMail({ to, subject: `${sender} shared "${docName}" with you`, html });
  if (!ok) return res.status(502).json({ error: "Email isn't configured on the server yet — copy the link instead." });
  res.json({ ok: true });
});

// POST /api/files/email-attachment — CR-P-14 — email a freshly-generated document (e.g. a BOQ line
// PDF, a list export) as a real attachment. The file is posted in-memory, not stored on the server.
router.post("/email-attachment", memUpload.single("file"), async (req: AuthedRequest, res: Response) => {
  const to = String(req.body?.to || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: "Enter a valid email address." });
  if (!req.file) return res.status(400).json({ error: "Nothing to send." });
  const docName = String(req.body?.docName || req.file.originalname || "Document").slice(0, 200);
  const note = String(req.body?.note || "").slice(0, 2000);
  const sender = req.user!.name || `A ${MAIL_FROM_NAME} colleague`;
  const html =
    `<p>${escapeHtml(sender)} has sent you a document via ${escapeHtml(MAIL_FROM_NAME)}.</p>` +
    (note ? `<p>${escapeHtml(note)}</p>` : "") +
    `<p><strong>${escapeHtml(docName)}</strong> is attached.</p>`;
  const ok = await sendMail({ to, subject: `${sender} sent you "${docName}"`, html, attachments: [{ filename: req.file.originalname || `${docName}.pdf`, content: req.file.buffer }] });
  if (!ok) return res.status(502).json({ error: "Email isn't configured on the server yet — download it and send manually." });
  res.json({ ok: true });
});

export default router;
