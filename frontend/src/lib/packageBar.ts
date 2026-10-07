import { useEffect, useRef } from "react";

/**
 * 2026-10-07 - "all the RFQ, quotes, PO, agreements ... have the Cancel, Save, Save as Draft, Share
 * ... in the work package tab": inside a work package's window every document shows one bar at the
 * bottom, with only the actions that apply to it. The document (the RFQ form, the quotes, the PO,
 * the agreement) publishes its actions here and the window draws them.
 */
export interface PackageBar {
  /** Drop the document's unsaved edits (e.g. close the RFQ form). Absent: the bar shows Close. */
  cancel?: () => void;
  saveDraft?: () => void;
  save?: () => void;
  preview?: () => void;
  download?: () => void;
  /** The document as a PDF for the share menu: its file name, and a way to make it and get its link. */
  share?: { fileName: string; prepare: () => Promise<string> };
  /** A save, preview or download is running. */
  busy?: boolean;
  /** A short line at the left of the bar, e.g. "Prices save as you type". */
  note?: string;
}
export type SetPackageBar = (bar: PackageBar | null) => void;

const KEYS = ["cancel", "saveDraft", "save", "preview", "download"] as const;

/**
 * Publish a document's actions on its package's bar. Pass `undefined` while something inside the
 * document holds the bar (an open form), so it is left alone. The handlers are always the latest
 * ones; the bar is only re-published when the set of buttons, the busy flag or the note changes.
 */
export function usePackageBar(set: SetPackageBar | undefined, bar: PackageBar | null | undefined) {
  const ref = useRef(bar);
  ref.current = bar;
  const shape = bar === undefined ? "skip" : bar === null ? "none"
    : JSON.stringify([KEYS.filter((k) => !!bar[k]), bar.share?.fileName || "", !!bar.busy, bar.note || ""]);
  useEffect(() => {
    if (!set || shape === "skip") return;
    const b = ref.current;
    if (!b) { set(null); return; }
    const call = (k: (typeof KEYS)[number]) => () => { ref.current?.[k]?.(); };
    set({
      busy: b.busy, note: b.note,
      ...Object.fromEntries(KEYS.filter((k) => !!b[k]).map((k) => [k, call(k)])),
      ...(b.share ? { share: { fileName: b.share.fileName, prepare: () => (ref.current?.share ? ref.current.share.prepare() : Promise.reject(new Error("Nothing to share."))) } } : {}),
    });
  }, [set, shape]);
  // Gone (the tab changed, the form closed): the bar goes with it.
  useEffect(() => () => { set?.(null); }, [set]);
}
