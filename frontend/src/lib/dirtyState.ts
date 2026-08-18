// Global "unsaved work" flag. Builders that hold unsaved edits raise it (via useUnsavedGuard /
// useSaveStatus); the dashboard sidebar reads it to warn before in-app navigation, and the guard
// hooks arm the browser's own beforeunload prompt for refresh / close / browser-back.
//
// A COUNTER (not a boolean) so several dirty builders on one screen compose correctly — the flag is
// only clear when every one of them has cleaned up.
let count = 0;
const listeners = new Set<() => void>();

export function markDirty(on: boolean, prev: boolean): boolean {
  // Returns the new "prev" the caller should remember, so each caller adds/removes exactly once.
  if (on === prev) return prev;
  count += on ? 1 : -1;
  if (count < 0) count = 0;
  listeners.forEach((l) => l());
  return on;
}

export const isAppDirty = (): boolean => count > 0;

// Force-clear (used right before a programmatic navigation the user has confirmed).
export function clearAppDirty(): void {
  if (count === 0) return;
  count = 0;
  listeners.forEach((l) => l());
}

export function subscribeDirty(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
