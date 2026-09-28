import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * CR 305 (2026-09-25): where you are on a page lives in the address bar, not only in memory, so a
 * browser refresh reopens the same tab or folder and Back steps back one level instead of leaving
 * the page. Each move into a tab or folder is a history step; `replace` corrects the address
 * without adding one (for defaults and redirects).
 *
 * `set` takes several keys at once (a folder is project + tab + group); an empty value removes the
 * key. Keys not named are kept.
 */
export function useUrlState() {
  const [params, setParams] = useSearchParams();
  const get = useCallback((key: string) => params.get(key) || "", [params]);
  const set = useCallback((patch: Record<string, string | undefined | null>, opts: { replace?: boolean } = {}) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    // Nothing moved: no history step (Back would otherwise seem to do nothing).
    if (next.toString() === params.toString()) return;
    setParams(next, { replace: !!opts.replace });
  }, [params, setParams]);
  return { get, set, params };
}
