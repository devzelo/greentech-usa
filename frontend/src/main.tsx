import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {polyfillCountryFlagEmojis} from 'country-flag-emoji-polyfill';
import App from './App.tsx';
import './index.css';

// Windows has no flag emoji glyphs, so 🇬🇭 renders as "GH". This injects a scoped web font
// (flag codepoints only) so flags show in the country picker and project headers. No-op on
// platforms that already render flags (macOS/iOS/Android).
polyfillCountryFlagEmojis();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
