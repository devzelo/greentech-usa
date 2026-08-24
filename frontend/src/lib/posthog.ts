/**
 * PostHog product analytics.
 *
 * Analytics is entirely optional: without VITE_PUBLIC_POSTHOG_KEY every function
 * here is a no-op, so local dev and any deploy that hasn't been given a key runs
 * exactly as before. Nothing in the app should have to null-check the client.
 */
import posthog from "posthog-js";

const KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let started = false;

/** Boot the client once, at app startup. Safe to call when no key is configured. */
export function initAnalytics() {
  if (started || !KEY) return;

  posthog.init(KEY, {
    api_host: HOST,
    // The SPA fires its own $pageview on every route change (see usePageviews);
    // the built-in listener only sees the very first HTML load.
    capture_pageview: false,
    // Anonymous visitors on the marketing pages don't need person profiles;
    // only signed-in users we explicitly identify get one.
    person_profiles: "identified_only",
  });

  started = true;
}

export function isAnalyticsEnabled() {
  return started;
}

/**
 * Attach events to the signed-in user. Called at startup for an existing
 * session and again right after login.
 */
export function identifyUser(user: { id: string; email?: string; role?: string }) {
  if (!started) return;
  posthog.identify(user.id, { email: user.email, role: user.role });
}

/** Drop the identity on logout so the next user isn't merged into the last one. */
export function resetAnalytics() {
  if (!started) return;
  posthog.reset();
}

/** Track a product event. Extra properties are optional. */
export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!started) return;
  posthog.capture(event, properties);
}

export { posthog };
