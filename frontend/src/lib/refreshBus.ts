import { useEffect } from "react";

/**
 * A page-level "reload my data" signal (CR-PR-12).
 *
 * The header's Refresh button fires this instead of reloading the browser, so a page can pull
 * fresh figures without losing unsaved edits (the project workspace holds a whole draft in
 * state). Pages opt in with useRefreshSignal; anything that hasn't opted in falls back to a
 * real reload, so the button is never a no-op.
 */
const EVENT = "gt:refresh";

let listeners = 0;

/** Fire a refresh. Returns true if a page handled it, false if the caller should hard-reload. */
export function requestRefresh(): boolean {
  if (listeners === 0) return false;
  window.dispatchEvent(new CustomEvent(EVENT));
  return true;
}

/** Subscribe the current page to the header's Refresh button. */
export function useRefreshSignal(onRefresh: () => void) {
  useEffect(() => {
    const handler = () => onRefresh();
    window.addEventListener(EVENT, handler);
    listeners += 1;
    return () => {
      window.removeEventListener(EVENT, handler);
      listeners -= 1;
    };
  }, [onRefresh]);
}
