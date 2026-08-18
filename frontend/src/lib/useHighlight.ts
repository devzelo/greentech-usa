import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

// Deep-link highlight: a notification (or any link) can carry ?hl=<id>. Once the page that owns
// the target has loaded (`ready`), this scrolls the matching element into view and flashes it.
// The element must expose the id via `data-hl="<id>"` or `id="<id>"`. Returns the currently
// flashing id so the owner can add the `.hl-flash` class to the right row.
export function useHighlight(ready: boolean): string | null {
  const [searchParams, setSearchParams] = useSearchParams();
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    const hl = searchParams.get("hl");
    if (!hl || !ready) return;
    // Give the freshly-loaded list a tick to paint before we look for the element.
    const timer = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-hl="${(window.CSS?.escape ? CSS.escape(hl) : hl)}"]`) || document.getElementById(hl);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setFlashId(hl);
        setTimeout(() => setFlashId((cur) => (cur === hl ? null : cur)), 2600);
      }
    }, 140);
    // Consume the param so the user's own navigation doesn't re-trigger the flash.
    searchParams.delete("hl");
    setSearchParams(searchParams, { replace: true });
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, searchParams]);

  return flashId;
}
