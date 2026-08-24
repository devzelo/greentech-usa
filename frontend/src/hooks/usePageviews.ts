import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { posthog, isAnalyticsEnabled } from "../lib/posthog";

/**
 * Sends a $pageview on every client-side navigation.
 *
 * react-router swaps components without a document load, so PostHog's built-in
 * pageview listener would only ever see the first URL. Must be rendered inside
 * <Router> — it depends on useLocation.
 */
export function usePageviews() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    posthog.capture("$pageview", { $current_url: window.location.href });
  }, [pathname, search]);
}
