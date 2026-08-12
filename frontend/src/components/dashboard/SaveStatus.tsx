import { useEffect, useRef, useState } from "react";
import { Check, Loader2, CloudOff } from "lucide-react";

/**
 * Reusable autosave status indicator (client request CR-B-14b): shows
 * "Saving…", "Saved ✓", "Last saved: 3:42 PM", or a failure state.
 *
 * Usage:
 *   const save = useSaveStatus();
 *   save.track(updateSomething(...));   // wraps any save promise
 *   <SaveStatus {...save} />            // render the badge
 */
export type SaveState = "idle" | "saving" | "saved" | "error";

export function useSaveStatus() {
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // CR-B-20 — `dirty` = the user has typed/changed something that isn't persisted yet (e.g. a
  // field edited but not yet blurred/autosaved). Set it via markDirty() on edit; a completed save
  // clears it. We warn on unload while dirty OR while a save is still in flight.
  const [dirty, setDirty] = useState(false);
  const pending = useRef(0);
  const markDirty = () => setDirty(true);

  const track = <T,>(p: Promise<T>): Promise<T> => {
    pending.current += 1;
    setState("saving");
    return p.then(
      (r) => { pending.current -= 1; if (pending.current <= 0) { pending.current = 0; setState("saved"); setSavedAt(new Date()); setDirty(false); } return r; },
      (e) => { pending.current = Math.max(0, pending.current - 1); setState("error"); throw e; },
    );
  };

  // CR-B-20 — warn before leaving the page (close window / reload / different site) while there
  // are unsaved edits or a save is still in flight.
  useEffect(() => {
    if (!dirty && state !== "saving") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, state]);

  return { state, savedAt, dirty, markDirty, track };
}

export default function SaveStatus({ state, savedAt, className = "" }: { state: SaveState; savedAt: Date | null; className?: string }) {
  if (state === "idle" && !savedAt) return null;
  const time = savedAt
    ? savedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${className}`}>
      {state === "saving" && <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 size={12} className="animate-spin" /> Saving…</span>}
      {state === "saved" && <span className="inline-flex items-center gap-1 text-emerald-600"><Check size={12} /> Saved</span>}
      {state === "error" && <span className="inline-flex items-center gap-1 text-red-500"><CloudOff size={12} /> Save failed — retrying on next change</span>}
      {state !== "error" && savedAt && <span className="text-slate-300 font-medium">· Last saved {time}</span>}
    </span>
  );
}
