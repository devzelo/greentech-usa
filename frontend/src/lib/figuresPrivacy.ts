import { useSyncExternalStore } from "react";

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

/** What a hidden amount shows: always the same length, so it gives away nothing about its size. */
export const FIGURE_MASK = "••••••";
