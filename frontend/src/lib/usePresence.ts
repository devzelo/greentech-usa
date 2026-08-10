import { useEffect, useState } from "react";
import { presenceBeat, presenceLeave, getAuthUser, type PresenceUser } from "./api";

/**
 * Lightweight live presence (client CR-B-16). Heartbeats every 12s and returns the OTHER users
 * currently in the same `resource` (self excluded). Pass null to disable. Presence only — not
 * concurrent multi-cursor editing.
 */
export function usePresence(resource: string | null): PresenceUser[] {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  useEffect(() => {
    if (!resource) { setUsers([]); return; }
    const me = getAuthUser()?.id;
    let active = true;
    const beat = async () => {
      try { const r = await presenceBeat(resource); if (active) setUsers(r.users.filter((u) => u.userId !== me)); }
      catch { /* keep last */ }
    };
    beat();
    const id = setInterval(beat, 12_000);
    return () => { active = false; clearInterval(id); void presenceLeave(resource); };
  }, [resource]);
  return users;
}
