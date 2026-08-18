import { useEffect, useRef } from "react";
import { markDirty } from "./dirtyState";

// CR-B-20 — warn before leaving the page (closing the window/tab, reloading, or navigating to a
// different website) while `when` is true — i.e. there are unsaved edits in a builder. The browser
// shows its native "Leave site? Changes you made may not be saved." prompt.
//
// CR-P-12 — it also raises the global "app dirty" flag so the dashboard sidebar / logo can warn
// before IN-APP navigation (which beforeunload can't catch).
//
// Used by builders that hold unsaved edits outside of useSaveStatus (BOQ pending rows, RFQ/PO
// blur-saved fields). Builders that use useSaveStatus already get this via that hook's own guard.
export function useUnsavedGuard(when: boolean): void {
  const prev = useRef(false);
  useEffect(() => {
    prev.current = markDirty(when, prev.current);
  }, [when]);
  // Always clear our contribution on unmount.
  useEffect(() => () => { prev.current = markDirty(false, prev.current); }, []);
  useEffect(() => {
    if (!when) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);
}
