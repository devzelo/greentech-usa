import { Router, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Reminder, { ReminderStatus } from "../models/Reminder";
import User from "../models/User";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { createNotification } from "../lib/notify";
import { sendMail } from "../lib/mailer";

// Personal reminders — every user manages only their own. A reminder can point at any record in
// the system via `link`, so the notification opens the related project / document / tab.
const router = Router();
router.use(requireAuth);
// A malformed id is "not found", not a server error.
router.param("rid", (req, res, next, value) => {
  if (!mongoose.isValidObjectId(String(value))) return res.status(404).json({ error: "Not found" });
  next();
});

const clean = (s: unknown, max: number) => String(s ?? "").slice(0, max);

// List my reminders. ?status=Pending|Completed|Cancelled ; default = all, soonest due first.
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = { userId: req.user!.userId };
    if (req.query.status) filter.status = String(req.query.status);
    res.json(await Reminder.find(filter).sort({ status: 1, dueAt: 1 }));
  } catch (err) { next(err); }
});

router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: "A reminder needs a title." });
    const dueAt = new Date(b.dueAt);
    if (isNaN(dueAt.getTime())) return res.status(400).json({ error: "A reminder needs a valid date and time." });
    const r = await Reminder.create({
      userId: req.user!.userId,
      title: clean(b.title, 200),
      notes: clean(b.notes, 2000),
      dueAt,
      link: clean(b.link, 500),
      contextLabel: clean(b.contextLabel, 200),
      projectId: clean(b.projectId, 60),
      projectName: clean(b.projectName, 200),
      emailEnabled: !!b.emailEnabled,
      status: "Pending",
    });
    res.status(201).json(r);
  } catch (err) { next(err); }
});

// Edit / complete / snooze / reopen — all through one PATCH.
router.patch("/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const r = await Reminder.findOne({ _id: req.params.rid, userId: req.user!.userId });
    if (!r) return res.status(404).json({ error: "Not found" });
    const b = req.body || {};
    if (typeof b.title === "string") r.title = clean(b.title, 200);
    if (typeof b.notes === "string") r.notes = clean(b.notes, 2000);
    if (typeof b.link === "string") r.link = clean(b.link, 500);
    if (typeof b.contextLabel === "string") r.contextLabel = clean(b.contextLabel, 200);
    if (typeof b.projectId === "string") r.projectId = clean(b.projectId, 60);
    if (typeof b.projectName === "string") r.projectName = clean(b.projectName, 200);
    if (typeof b.emailEnabled === "boolean") r.emailEnabled = b.emailEnabled;
    if (b.dueAt) {
      const d = new Date(b.dueAt);
      if (isNaN(d.getTime())) return res.status(400).json({ error: "Invalid date and time." });
      // Only an ACTUAL reschedule re-arms the reminder. Re-saving the same time (e.g. fixing a
      // typo in the title) must never resurrect a completed reminder or re-fire a sent one.
      if (d.getTime() !== new Date(r.dueAt).getTime()) {
        r.dueAt = d;
        if (r.status === "Pending") r.notifiedAt = null;   // fires again at the new time
      }
    }
    if (b.status && ["Pending", "InProgress", "Completed", "Cancelled"].includes(b.status)) {
      r.status = b.status;
      r.completedAt = b.status === "Completed" ? new Date() : null;
      // Re-opening a reminder explicitly should let it fire again at its due time.
      if (b.status === "Pending") r.notifiedAt = null;
    }
    await r.save();
    res.json(r);
  } catch (err) { next(err); }
});

router.delete("/:rid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await Reminder.findOneAndDelete({ _id: req.params.rid, userId: req.user!.userId });
    res.json({ message: "Reminder deleted" });
  } catch (err) { next(err); }
});

export default router;

// ── Due sweep ────────────────────────────────────────────────────────────────
// Fires every pending reminder whose time has passed and that hasn't been notified yet.
// Called on a short interval by the scheduler in index.ts. Best-effort per reminder, so one
// bad address can't stop the rest.
let sweeping = false;

export async function fireDueReminders(): Promise<number> {
  // The sweep runs every minute but a batch (especially with email) can take longer than that —
  // without this guard the next tick would re-select the same reminders and notify twice.
  if (sweeping) return 0;
  sweeping = true;
  try {
    return await sweep();
  } finally { sweeping = false; }
}

async function sweep(): Promise<number> {
  // A still-open reminder (Pending or In progress) that has come due gets one notification.
  const ACTIVE = { $in: ["Pending", "InProgress"] as ReminderStatus[] };
  const due = await Reminder.find({ status: ACTIVE, notifiedAt: null, dueAt: { $lte: new Date() } }).limit(200);
  let sent = 0;
  for (const candidate of due) {
    // CLAIM the reminder first: stamping notifiedAt up-front means a crash, a slow SMTP send or
    // an overlapping run can never produce a second notification for the same reminder.
    const r = await Reminder.findOneAndUpdate(
      { _id: candidate._id, status: ACTIVE, notifiedAt: null },
      { $set: { notifiedAt: new Date() } },
      { new: true }
    );
    if (!r) continue;   // another pass already took it
    try {
      await createNotification({
        userId: r.userId,
        type: "general",
        title: `Reminder: ${r.title}`,
        message: [r.contextLabel, r.notes].filter(Boolean).join(" — ") || "Your reminder is due.",
        link: r.link || "/dashboard/reminders",
      });
      if (r.emailEnabled) {
        const u = await User.findById(r.userId).select("email name").lean();
        const email = (u as { email?: string } | null)?.email;
        if (email) {
          await sendMail({
            to: email,
            subject: `Reminder: ${r.title}`,
            html: `<p>Hi ${(u as { name?: string } | null)?.name || "there"},</p>
                   <p>This is your reminder: <strong>${r.title}</strong></p>
                   ${r.contextLabel ? `<p>Regarding: ${r.contextLabel}</p>` : ""}
                   ${r.notes ? `<p>${r.notes}</p>` : ""}
                   <p>Due: ${r.dueAt.toLocaleString()}</p>`,
          });
        }
      }
      sent++;   // notifiedAt was already stamped by the claim above
    } catch { /* skip this one; the rest still fire */ }
  }
  return sent;
}
