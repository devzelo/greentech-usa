import { useEffect, useSyncExternalStore } from "react";

// Privacy mode for financial figures (client request, 2026-09-11): "Sometimes GT team need to share
// screen. Please make all financial numbers hidden by default ... add a Show/Hide option that allows
// the user to temporarily display them when needed."
//
// One switch for the whole app. Figures start hidden on every page load, and once shown they hide
// again on their own after a while, so a forgotten "show" never leaks them into the next screen
// share. Nothing is stored: a reload is always back to hidden.

const AUTO_HIDE_MS = 10 * 60 * 1000;   // shown figures hide again after 10 minutes

let shown = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export function setFiguresShown(next: boolean) {
  shown = next;
  if (timer) { clearTimeout(timer); timer = null; }
  if (next) timer = setTimeout(() => setFiguresShown(false), AUTO_HIDE_MS);
  listeners.forEach((l) => l());
}

/** Are financial figures being shown right now? */
export function useFiguresShown(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => shown,
    () => false,
  );
}

// How many financial figures are on screen. The top-bar switch only appears while there is at
// least one, so pages without numbers (Documents, Directory, ...) don't carry a switch for nothing.
let onScreen = 0;
const screenListeners = new Set<() => void>();
const bumpOnScreen = (d: number) => {
  const before = onScreen > 0;
  onScreen += d;
  if (before !== onScreen > 0) screenListeners.forEach((l) => l());
};

/** Counts the calling component as a figure on screen while it is mounted. */
export function useFigureOnScreen() {
  useEffect(() => { bumpOnScreen(1); return () => bumpOnScreen(-1); }, []);
}

/** Is at least one financial figure on screen right now? */
export function useFiguresOnScreen(): boolean {
  return useSyncExternalStore(
    (cb) => { screenListeners.add(cb); return () => { screenListeners.delete(cb); }; },
    () => onScreen > 0,
    () => false,
  );
}

/** What a hidden amount shows: always the same length, so it gives away nothing about its size. */
export const FIGURE_MASK = "••••••";
