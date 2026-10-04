import { useSyncExternalStore } from "react";

/**
 * CR 343 - the project that is open, so the top bar can always say which one it is ("Project name
 * should be always visible somewhere in the page, no matter which folder or tab we open or which
 * popup is on"). The project page sets it while it is open and clears it when it closes.
 */
export type CurrentProject = { id: string; name: string } | null;

let current: CurrentProject = null;
const listeners = new Set<() => void>();

export function setCurrentProject(p: CurrentProject) {
  if (current?.id === p?.id && current?.name === p?.name) return;
  current = p;
  listeners.forEach((l) => l());
}

export function useCurrentProject(): CurrentProject {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => current,
    () => null,
  );
}
