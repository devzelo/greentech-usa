import { Router, Request, Response, NextFunction } from "express";
import Announcement from "../models/Announcement";
import { requireAuth, requireAdmin, AuthedRequest } from "../middleware/auth";

const router = Router();

// ── Public: active announcements for the marketing-site banner (no auth) ──
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await Announcement.find({ active: true }).sort({ date: 1, createdAt: -1 }).lean();
    res.json(list);
  } catch (err) { next(err); }
});

// ── Admin only below ──
router.use(requireAuth, requireAdmin);

router.get("/all", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try { res.json(await Announcement.find({}).sort({ date: 1, createdAt: -1 })); } catch (err) { next(err); }
});

const FIELDS = ["title", "message", "emoji", "date", "endDate", "kind", "active"] as const;
router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const body: Record<string, unknown> = { addedByName: req.user!.name || "" };
    for (const f of FIELDS) if (f in (req.body || {})) body[f] = req.body[f];
    res.status(201).json(await Announcement.create(body));
  } catch (err) { next(err); }
});

router.patch("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) if (f in (req.body || {})) patch[f] = req.body[f];
    const a = await Announcement.findByIdAndUpdate(req.params.id, patch, { new: true });
    if (!a) return res.status(404).json({ error: "Not found" });
    res.json(a);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try { await Announcement.findByIdAndDelete(req.params.id); res.json({ message: "Deleted" }); } catch (err) { next(err); }
});

// Seed this year's common US public holidays (skips any that already exist for the same date+title).
router.post("/seed-holidays", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const y = new Date().getFullYear();
    const pad = (n: number) => String(n).padStart(2, "0");
    const nthWeekday = (month: number, weekday: number, n: number) => {
      const first = new Date(y, month, 1).getDay();
      const day = 1 + ((7 + weekday - first) % 7) + (n - 1) * 7;
      return `${y}-${pad(month + 1)}-${pad(day)}`;
    };
    const lastWeekday = (month: number, weekday: number) => {
      const last = new Date(y, month + 1, 0);
      const diff = (7 + last.getDay() - weekday) % 7;
      return `${y}-${pad(month + 1)}-${pad(last.getDate() - diff)}`;
    };
    const holidays = [
      { emoji: "🎆", title: "New Year's Day", message: `Happy New Year ${y}! Wishing you a prosperous year ahead.`, date: `${y}-01-01` },
      { emoji: "🕊️", title: "Martin Luther King Jr. Day", message: "Honoring Dr. King's legacy.", date: nthWeekday(0, 1, 3) },
      { emoji: "🇺🇸", title: "Memorial Day", message: "Remembering those who served.", date: lastWeekday(4, 1) },
      { emoji: "🎉", title: "Independence Day", message: "Happy 4th of July! Celebrating freedom and progress.", date: `${y}-07-04` },
      { emoji: "👷", title: "Labor Day", message: "Celebrating the workforce that builds our future.", date: nthWeekday(8, 1, 1) },
      { emoji: "🎖️", title: "Veterans Day", message: "Thank you to all who served.", date: `${y}-11-11` },
      { emoji: "🦃", title: "Thanksgiving", message: "Grateful for our clients, partners, and team.", date: nthWeekday(10, 4, 4) },
      { emoji: "🎄", title: "Christmas", message: "Season's greetings from GreenTech USA.", date: `${y}-12-25` },
    ];
    let added = 0;
    for (const h of holidays) {
      const exists = await Announcement.findOne({ title: h.title, date: h.date });
      if (exists) continue;
      await Announcement.create({ ...h, kind: "holiday", active: true, addedByName: req.user!.name || "" });
      added++;
    }
    res.json({ added, year: y });
  } catch (err) { next(err); }
});

export default router;
