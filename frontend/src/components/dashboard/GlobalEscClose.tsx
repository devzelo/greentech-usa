import { useEffect } from "react";

/**
 * Pressing Esc dismisses any visible modal by clicking its backdrop.
 * Every modal in this app uses the same backdrop class: `bg-slate-950/40 backdrop-blur-sm`
 * (or `bg-slate-950/60`), absolutely positioned inside a fixed z-[200] container.
 */
export default function GlobalEscClose() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Find the top-most fixed-modal backdrop and click it.
      const backdrops = Array.from(
        document.querySelectorAll<HTMLElement>('div[class*="absolute"][class*="inset-0"][class*="bg-slate-950"]')
      );
      const topMost = backdrops[backdrops.length - 1];
      if (topMost) topMost.click();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
