import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {polyfillCountryFlagEmojis} from 'country-flag-emoji-polyfill';
import App from './App.tsx';
import {initAnalytics} from './lib/posthog';
import './index.css';

// Windows has no flag emoji glyphs, so 🇬🇭 renders as "GH". This injects a scoped web font
// (flag codepoints only) so flags show in the country picker and project headers. No-op on
// platforms that already render flags (macOS/iOS/Android).
// 2026-10-09 - the flag font is served from this site (it was fetched from a CDN); the Quick Reports
// also draw flags with it (lib/flagImage.ts).
polyfillCountryFlagEmojis("Twemoji Country Flags", "/fonts/TwemojiCountryFlags.woff2");

// No-op unless VITE_PUBLIC_POSTHOG_KEY is set.
initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
