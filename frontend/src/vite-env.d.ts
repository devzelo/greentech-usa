/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin for split hosting (e.g. https://api.example.com). Unset = same-origin/relative. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
