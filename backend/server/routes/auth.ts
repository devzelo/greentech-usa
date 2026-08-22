import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import User from '../models/User';
import { requireAuth, blockGuests, AuthedRequest } from '../middleware/auth';
import { JWT_SECRET } from '../config/secrets';
import { getBackupProjects, sendBackupEmail } from '../services/backupMailer';

const router = Router();

// Brute-force protection — counts only failed attempts for login.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Try again later.' },
});
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});

const hashResetToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

// Avatar upload — stored under uploads/avatars/<userId>-<ts><ext>
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join('uploads', 'avatars');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req: AuthedRequest, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${req.user!.userId}-${Date.now()}${ext}`);
  },
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Only image files are allowed.'), { statusCode: 400 }));
  },
});
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';

// POST /api/auth/login
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(401).json({ error: 'Invalid email or password.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ error: 'Invalid email or password.' });

    // CR-P-58 — archived/deactivated accounts cannot access the platform.
    if ((user as { archived?: boolean }).archived)
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact your administrator.' });

    const token = jwt.sign(
      { userId: user._id, email: user.email, name: user.name, role: user.role, empId: user.empId || '' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        empId: user.empId || '',
        phone: user.phone || '',
        avatarUrl: user.avatarUrl || '',
      },
    });
  } catch {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', forgotLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    const SAFE_MSG = { message: 'If that email is registered, a reset link has been sent.' };

    if (!user) return res.json(SAFE_MSG);

    const token = crypto.randomBytes(32).toString('hex');
    // Only the hash is persisted — a DB leak can't be replayed as a reset link.
    user.resetToken = hashResetToken(token);
    user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const resetLink = `${FRONTEND_URL}/reset-password?token=${token}`;

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: Number(process.env.EMAIL_PORT) || 587,
        secure: false,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });

      await transporter.sendMail({
        from: `"GreenTech USA" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Password Reset — GreenTech USA',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <div style="background:linear-gradient(135deg,#0f8c6b,#06b6d4);border-radius:16px;padding:24px;text-align:center;margin-bottom:24px">
              <h1 style="color:#fff;margin:0;font-size:24px">GreenTech USA</h1>
            </div>
            <h2 style="color:#0f172a">Password Reset Request</h2>
            <p style="color:#475569">Hi <strong>${user.name}</strong>,</p>
            <p style="color:#475569">You requested a password reset. Click the button below — this link expires in <strong>1 hour</strong>.</p>
            <div style="text-align:center;margin:32px 0">
              <a href="${resetLink}" style="background:linear-gradient(135deg,#0f8c6b,#06b6d4);color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:16px">
                Reset My Password
              </a>
            </div>
            <p style="color:#94a3b8;font-size:12px">If you did not request this, ignore this email — your password will remain unchanged.</p>
          </div>
        `,
      });
    } else {
      console.log(`\n🔑  Password reset link for ${user.email}:\n    ${resetLink}\n`);
    }

    res.json(SAFE_MSG);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', resetLimiter, async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res.status(400).json({ error: 'Token and new password are required.' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const user = await User.findOne({
      resetToken: hashResetToken(String(token)),
      resetTokenExpiry: { $gt: new Date() },
    });

    if (!user)
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });

    user.password = await bcrypt.hash(password, 12);
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/auth/me — current user
router.get('/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const user = await User.findById(req.user!.userId).select('-password -resetToken -resetTokenExpiry');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/auth/me — update profile + backup preferences
router.patch('/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { name, phone, empId, avatarUrl, signatureUrl, jobTitle, backupEnabled, backupDay } = req.body;
    const updates: Record<string, unknown> = {};
    if (typeof name === 'string') updates.name = name;
    if (typeof phone === 'string') updates.phone = phone;
    if (typeof empId === 'string') updates.empId = empId;
    if (typeof avatarUrl === 'string') updates.avatarUrl = avatarUrl;
    if (typeof signatureUrl === 'string') updates.signatureUrl = signatureUrl;
    if (typeof jobTitle === 'string') updates.jobTitle = jobTitle;
    if (typeof backupEnabled === 'boolean') updates.backupEnabled = backupEnabled;
    if (typeof backupDay === 'number' && backupDay >= 1 && backupDay <= 28) updates.backupDay = backupDay;

    const user = await User.findByIdAndUpdate(req.user!.userId, updates, { new: true })
      .select('-password -resetToken -resetTokenExpiry');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/avatar — multipart/form-data, field: file
router.post('/avatar', requireAuth, avatarUpload.single('file'), async (req: AuthedRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const url = `/${req.file.path.replace(/\\/g, '/')}`; // e.g. /uploads/avatars/<file>
    // Remove the previous avatar file if it lived under uploads/avatars
    const prev = await User.findById(req.user!.userId).select('avatarUrl').lean();
    if (prev && (prev as { avatarUrl?: string }).avatarUrl && (prev as { avatarUrl: string }).avatarUrl.includes('/uploads/avatars/')) {
      const oldPath = (prev as { avatarUrl: string }).avatarUrl.replace(/^\//, '');
      fs.unlink(oldPath, () => undefined);
    }
    const user = await User.findByIdAndUpdate(req.user!.userId, { avatarUrl: url }, { new: true })
      .select('-password -resetToken -resetTokenExpiry');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Upload failed.' });
  }
});

// Signature upload — stored under uploads/signatures/<userId>-<ts><ext>
const signatureStorage = multer.diskStorage({
  destination: (_req, _file, cb) => { const dir = path.join('uploads', 'signatures'); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
  filename: (req: AuthedRequest, file, cb) => { const ext = path.extname(file.originalname).toLowerCase() || '.png'; cb(null, `${req.user!.userId}-${Date.now()}${ext}`); },
});
const signatureUpload = multer({
  storage: signatureStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => { if (/^image\//.test(file.mimetype)) cb(null, true); else cb(Object.assign(new Error('Only image files are allowed.'), { statusCode: 400 })); },
});

// POST /api/auth/signature — upload the current user's signature image (used on PO documents).
router.post('/signature', requireAuth, signatureUpload.single('file'), async (req: AuthedRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const url = `/${req.file.path.replace(/\\/g, '/')}`;
    const prev = await User.findById(req.user!.userId).select('signatureUrl').lean();
    if (prev && (prev as { signatureUrl?: string }).signatureUrl && (prev as { signatureUrl: string }).signatureUrl.includes('/uploads/signatures/')) {
      fs.unlink((prev as { signatureUrl: string }).signatureUrl.replace(/^\//, ''), () => undefined);
    }
    const user = await User.findByIdAndUpdate(req.user!.userId, { signatureUrl: url }, { new: true }).select('-password -resetToken -resetTokenExpiry');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Upload failed.' });
  }
});

// GET /api/auth/signatories — staff who have uploaded a signature (for the PO signature picker).
// Only people with a signature on file appear (per the client's requirement).
router.get('/signatories', requireAuth, blockGuests, async (_req: AuthedRequest, res: Response) => {
  try {
    const users = await User.find({ signatureUrl: { $nin: ['', null] } })
      .select('name email phone jobTitle signatureUrl').sort({ name: 1 }).lean();
    res.json(users.map((u) => ({ id: String(u._id), name: u.name, email: u.email, phone: (u as { phone?: string }).phone || '', jobTitle: (u as { jobTitle?: string }).jobTitle || '', signatureUrl: (u as { signatureUrl?: string }).signatureUrl || '' })));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error.' });
  }
});

// GET /api/auth/me/backup-preview — list projects that the next backup will include
router.get('/me/backup-preview', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const projects = await getBackupProjects(req.user!.userId);
    res.json({
      projects,
      emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
    });
  } catch {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/me/backup-now — manual trigger: send the backup email immediately
router.post('/me/backup-now', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const result = await sendBackupEmail(req.user!.userId);
    if (!result.sent) return res.status(202).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send backup.' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'Current and new password are required.' });
    if (newPassword.length < 8)
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });

    const user = await User.findById(req.user!.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: 'Password updated.' });
  } catch {
    res.status(500).json({ error: 'Server error.' });
  }
});

export default router;
