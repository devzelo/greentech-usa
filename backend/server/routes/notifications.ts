import { Router, Response, NextFunction } from "express";
import Notification from "../models/Notification";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { notifyByEmpId } from "../lib/notify";

const router = Router();
router.use(requireAuth);

// GET /api/notifications — the current user's notifications + unread count.
// ?all=1 returns the full history (for the Notifications tab); default is the 40 most recent (bell).
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const all = req.query.all === "1" || req.query.all === "true";
    const items = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(all ? 300 : 40).lean();
    const unread = await Notification.countDocuments({ userId, read: false });
    res.json({ items, unread });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/read — mark one as read
router.patch("/:id/read", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await Notification.updateOne({ _id: req.params.id, userId: req.user!.userId }, { read: true });
    res.json({ message: "ok" });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/read-all — mark all of mine as read
router.post("/read-all", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await Notification.updateMany({ userId: req.user!.userId, read: false }, { read: true });
    res.json({ message: "ok" });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/share — share a document with an employee (sends them a notification)
router.post("/share", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { empId, docName, link, projectName } = req.body as {
      empId?: string; docName?: string; link?: string; projectName?: string;
    };
    if (!empId || !docName) return res.status(400).json({ error: "Employee and document are required." });
    const sharer = req.user!.name || "A teammate";
    const delivered = await notifyByEmpId(empId, {
      type: "share",
      title: "Document shared with you",
      message: `${sharer} shared "${docName}"${projectName ? ` from ${projectName}` : ""} with you.`,
      link: link || "",
    });
    if (!delivered) return res.status(404).json({ error: "That employee does not have a login account yet." });
    res.json({ message: "Shared." });
  } catch (err) {
    next(err);
  }
});

export default router;
