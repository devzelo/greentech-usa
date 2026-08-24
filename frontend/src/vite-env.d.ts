/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin for split hosting (e.g. https://api.example.com). Unset = same-origin/relative. */
  readonly VITE_API_URL?: string;
  /** PostHog project API key. Unset = analytics disabled entirely. */
  readonly VITE_PUBLIC_POSTHOG_KEY?: string;
  /** PostHog ingestion host. Defaults to US cloud; use https://eu.i.posthog.com for EU. */
  readonly VITE_PUBLIC_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
