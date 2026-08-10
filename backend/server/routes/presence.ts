import { Router, Response } from "express";
import { requireAuth, AuthedRequest } from "../middleware/auth";

// Lightweight live presence (client CR-B-16): shows who else is currently viewing/editing a
// record. In-memory heartbeat store (the app runs as a single instance) — a user is "here" if
// they've beat within TTL. This is presence only; full concurrent multi-cursor editing (CR-B-01)
// is a separate real-time-sync effort.
const router = Router();
router.use(requireAuth);

// `section` (optional) lets a user report WHICH sub-area of a record they are in, so the UI can
// show per-section presence (CR-B-16) from a single room/heartbeat.
type Entry = { userId: string; name: string; lastSeen: number; section?: string };
const rooms = new Map<string, Map<string, Entry>>();
const TTL = 30_000;

function prune(room: Map<string, Entry>) {
  const now = Date.now();
  for (const [k, v] of room) if (now - v.lastSeen > TTL) room.delete(k);
}
function listUsers(room?: Map<string, Entry>) {
  if (!room) return [];
  prune(room);
  return [...room.values()].map((e) => ({ userId: e.userId, name: e.name, section: e.section }));
}

// Heartbeat — marks the caller present in the room and returns everyone currently there.
router.post("/:resource", (req: AuthedRequest, res: Response) => {
  const key = String(req.params.resource).slice(0, 200);
  let room = rooms.get(key);
  if (!room) { room = new Map(); rooms.set(key, room); }
  const uid = req.user!.userId;
  const rawSection = (req.body as { section?: unknown } | undefined)?.section;
  const section = typeof rawSection === "string" ? rawSection.slice(0, 80) : undefined;
  room.set(uid, { userId: uid, name: req.user!.name || "Someone", lastSeen: Date.now(), section });
  res.json({ users: listUsers(room) });
});

// Leave — drop out of the room immediately (sent on unmount / tab close).
router.delete("/:resource", (req: AuthedRequest, res: Response) => {
  const room = rooms.get(String(req.params.resource));
  room?.delete(req.user!.userId);
  res.json({ users: listUsers(room) });
});

export default router;
