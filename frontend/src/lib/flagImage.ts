import { flagForCountry, locationFlag } from "./countryFlag";

/**
 * 2026-10-09 - a country flag for a PDF (the Quick Reports). A PDF cannot draw the flag emoji the
 * screens show, so the flag is drawn the way the browser shows it (the self-hosted flag font on
 * Windows, the system's own flags elsewhere) onto a canvas, trimmed to the flag, and handed over as
 * a PNG. Nothing leaves the browser. "" when there is no flag or it cannot be drawn.
 */

/** A project's flag emoji, as the project header and the projects table show it. */
export const projectFlag = (p: { siteAddress?: { country?: string } | null; location?: string }) =>
  flagForCountry(p.siteAddress?.country) || locationFlag(p.location);

const FONT = (px: number) => `${px}px "Twemoji Country Flags", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
const cache = new Map<string, string>();

export async function flagPng(emoji: string): Promise<string> {
  if (!emoji || typeof document === "undefined") return "";
  const hit = cache.get(emoji);
  if (hit !== undefined) return hit;
  let out = "";
  try {
    const px = 96;
    try { await document.fonts?.load(`${px}px "Twemoji Country Flags"`, emoji); } catch { /* the system's flags */ }
    const probe = document.createElement("canvas").getContext("2d");
    if (probe) {
      probe.font = FONT(px);
      const m = probe.measureText(emoji);
      const left = m.actualBoundingBoxLeft, asc = m.actualBoundingBoxAscent;
      const w = Math.ceil(left + m.actualBoundingBoxRight), h = Math.ceil(asc + m.actualBoundingBoxDescent);
      if (w > 8 && h > 8) {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const g = c.getContext("2d");
        if (g) {
          g.font = FONT(px);
          g.fillText(emoji, left, asc);
          // Letters in boxes (no flag glyph at all) come out grey; a flag has colour.
          const d = g.getImageData(0, 0, w, h).data;
          let colour = 0;
          for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 0 && (Math.abs(d[i] - d[i + 1]) > 24 || Math.abs(d[i + 1] - d[i + 2]) > 24)) colour++;
          if (colour > 4) out = c.toDataURL("image/png");
        }
      }
    }
  } catch { out = ""; }
  cache.set(emoji, out);
  return out;
}
