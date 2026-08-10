import { useEffect, useRef, useState } from "react";
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

/**
 * Section-aware presence (client CR-B-16). Beats on a single `resource` room while reporting
 * the caller's current `section` (e.g. the section they're editing). Returns the OTHER users in
 * the room, each carrying their own `section`, so the UI can render "who is in this section"
 * per section. `mySection` may be null when the caller isn't focused on any section.
 */
export function useSectionPresence(resource: string | null, mySection: string | null): PresenceUser[] {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const sectionRef = useRef(mySection);
  sectionRef.current = mySection;

  useEffect(() => {
    if (!resource) { setUsers([]); return; }
    const me = getAuthUser()?.id;
    let active = true;
    const beat = async () => {
      try { const r = await presenceBeat(resource, sectionRef.current); if (active) setUsers(r.users.filter((u) => u.userId !== me)); }
      catch { /* keep last */ }
    };
    beat();
    const id = setInterval(beat, 12_000);
    return () => { active = false; clearInterval(id); void presenceLeave(resource); };
  }, [resource]);

  // Push an immediate heartbeat when the active section changes, so peers update without waiting
  // for the next interval tick.
  useEffect(() => {
    if (!resource) return;
    const me = getAuthUser()?.id;
    let active = true;
    (async () => {
      try { const r = await presenceBeat(resource, mySection); if (active) setUsers(r.users.filter((u) => u.userId !== me)); }
      catch { /* keep last */ }
    })();
    return () => { active = false; };
  }, [resource, mySection]);

  return users;
}
