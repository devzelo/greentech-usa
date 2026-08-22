import { Router, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import fs from "fs";
import path from "path";
import User from "../models/User";
import UserFile from "../models/UserFile";
import Employee from "../models/Employee";
import { requireAuth, AuthedRequest, requireAdmin } from "../middleware/auth";

const humanFileSize = (bytes: number) => {
  if (!bytes) return "0 B";
  const u = ["B", "KB", "MB", "GB"]; const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
};

// Admin user-management portal: list / create / update / delete users and reset passwords.
// Every route here is admin-only.
const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

const PUBLIC_FIELDS = "-password -resetToken -resetTokenExpiry";
// Subcontractors are managed per-project (via grant-access), never created here.
const ROLES = ["admin", "employee"];

// Keep the Employee directory (empId → name) in sync so new hires are assignable to projects.
async function syncEmployeeDirectory(empId: string | undefined, name: string) {
  if (!empId) return;
  await Employee.findOneAndUpdate(
    { empId },
    { empId, name },
    { upsert: true, new: true }
  );
}

// GET /api/users — staff accounts only (admins + employees). Subcontractors live in projects.
router.get("/", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const users = await User.find({ role: { $ne: "subcontractor" } }).select(PUBLIC_FIELDS).sort({ empId: 1, createdAt: -1 });
    res.json(users);
  } catch (err) { next(err); }
});

// POST /api/users — create an account
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, role, empId, phone, personalEmail } = req.body || {};
    if (!name || !email || !password)
      return res.status(400).json({ error: "Name, email and password are required." });
    if (String(password).length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    const normRole = ROLES.includes(role) ? role : "employee";

    const exists = await User.findOne({ email: String(email).toLowerCase() });
    if (exists) return res.status(409).json({ error: "An account with that email already exists." });

    const hashed = await bcrypt.hash(String(password), 12);
    const user = await User.create({
      name,
      email: String(email).toLowerCase(),
      password: hashed,
      role: normRole,
      empId: empId || "",
      phone: phone || "",
      personalEmail: personalEmail || "",
    });
    await syncEmployeeDirectory(empId, name);

    const safe = await User.findById(user._id).select(PUBLIC_FIELDS);
    res.status(201).json(safe);
  } catch (err) { next(err); }
});

// PATCH /api/users/:id — update profile fields / role (not password)
router.patch("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, email, role, empId, phone, personalEmail } = req.body || {};
    const updates: Record<string, unknown> = {};
    if (typeof name === "string") updates.name = name;
    if (typeof phone === "string") updates.phone = phone;
    if (typeof empId === "string") updates.empId = empId;
    if (typeof personalEmail === "string") updates.personalEmail = personalEmail;
    if (typeof email === "string" && email.trim()) {
      const lower = email.toLowerCase();
      const clash = await User.findOne({ email: lower, _id: { $ne: req.params.id } });
      if (clash) return res.status(409).json({ error: "That email is already in use." });
      updates.email = lower;
    }
    if (typeof role === "string" && ROLES.includes(role)) {
      // Don't let an admin strip their own admin rights and lock the portal.
      if (req.params.id === req.user!.userId && role !== "admin")
        return res.status(400).json({ error: "You cannot change your own admin role." });
      updates.role = role;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .select(PUBLIC_FIELDS);
    if (!user) return res.status(404).json({ error: "User not found." });
    await syncEmployeeDirectory(user.empId, user.name);
    res.json(user);
  } catch (err) { next(err); }
});

// POST /api/users/:id/reset-password — admin sets a new password directly
router.post("/:id/reset-password", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { password } = req.body || {};
    if (!password || String(password).length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    user.password = await bcrypt.hash(String(password), 12);
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();
    res.json({ message: "Password updated." });
  } catch (err) { next(err); }
});

// DELETE /api/users/:id — remove an account (never your own)
router.delete("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.params.id === req.user!.userId)
      return res.status(400).json({ error: "You cannot delete your own account." });
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ message: "User deleted." });
  } catch (err) { next(err); }
});

// ── CR-P-57 — admin-uploaded documents on a user's profile (any file type) ──
const userFileStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uid = String((req as AuthedRequest).params.id || "").replace(/[^\w-]/g, "");
    const dir = path.join("uploads", "users", uid || "misc");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const userFileUpload = multer({ storage: userFileStorage, limits: { fileSize: 64 * 1024 * 1024 } });

router.get("/:id/files", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try { res.json(await UserFile.find({ userId: req.params.id }).sort({ createdAt: -1 }).lean()); }
  catch (err) { next(err); }
});
router.post("/:id/files", userFileUpload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const user = await User.exists({ _id: req.params.id });
    if (!user) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "User not found." }); }
    const file = await UserFile.create({
      userId: req.params.id,
      name: req.file.originalname,
      fileType: (req.file.originalname.split(".").pop() || "").toLowerCase(),
      size: humanFileSize(req.file.size),
      filePath: req.file.path.replace(/\\/g, "/"),
      description: String(req.body.description || ""),
      uploadedByName: req.user!.name || "",
    });
    res.status(201).json(file);
  } catch (err) { next(err); }
});
router.delete("/:id/files/:fid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const file = await UserFile.findOne({ _id: req.params.fid, userId: req.params.id });
    if (!file) return res.status(404).json({ error: "File not found." });
    await file.deleteOne();
    if (file.filePath) fs.unlink(path.resolve(file.filePath), () => {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
