import { Font, View, Image, Text, Svg, Defs, LinearGradient, Stop, Rect } from "@react-pdf/renderer";
import type { ReactNode } from "react";

/**
 * The GreenTech document brand for react-pdf: letterhead band, footer rule, fonts and type.
 *
 * Ported from the brand kit's generator scripts (generateLetterhead / generateProposal /
 * generateCoverPage). The header and footer art is the client-approved letterhead, and it goes on
 * every page of every document this platform generates, so it is defined once, here.
 */

export const BRAND = {
  emerald: "#10B981",
  blue: "#3B82F6",
  cyan: "#2DE0C4",
  slate: "#0F172A",
  s700: "#334155",
  s600: "#475569",
  s500: "#64748B",
  s400: "#94A3B8",
  s300: "#CBD5E1",
  border: "#E2E8F0",
  mist: "#F8FAFC",
  white: "#FFFFFF",
} as const;

export const COMPANY = {
  name: "GreenTech USA LLC",
  tagline: "Environmental Engineering & General Contracting",
  address: "Chantilly, Virginia, USA",
  phone: "+1 571-337-1358",
  email: "info@gt-usa.com",
  website: "www.gt-usa.com",
  cage: "8ZJ10",
  // As registered on SAM.gov (matches the Company Profile and the submitted sample proposals; the
  // brand kit's scripts carried a typo, FYR1QQ8L3SM7).
  uei: "FYR1QQSL3SM7",
} as const;

export const A4 = { w: 595.28, h: 841.89 } as const;

// Where root-relative assets are served from. In the browser that is the page's own origin; a
// renderer outside the browser (server-side or a preview script) sets it with setAssetOrigin().
let assetOrigin = "";
export function setAssetOrigin(origin: string) { assetOrigin = origin.replace(/\/+$/, ""); }

/** Root-relative asset URLs (/uploads/..., /brand/...) as absolute URLs, which react-pdf needs. */
export const abs = (url?: string) =>
  !url ? "" : /^(https?:|data:|blob:)/.test(url) ? url : `${assetOrigin || (typeof window !== "undefined" ? window.location.origin : "")}${url}`;

// The letterhead art is 3264 px wide; at A4 width its height follows from the ratio.
export const LETTERHEAD = {
  header: { src: "/brand/letterhead-header.png", h: (A4.w * 220) / 3264 },   // ~40 pt dark band
  footer: { src: "/brand/letterhead-footer.png", h: (A4.w * 64) / 3264 },    // ~12 pt, line at the bottom
};
export const LOGO_MINT = "/brand/gt-logo-mint.png";   // trimmed horizontal lockup, for dark grounds
export const COVER_FALLBACK = "/brand/cover-default.jpg";

/** Text gutter: lines up with the left edge of the logo in the header band (x = 386 of 3264 px). */
export const GUTTER = Math.round((A4.w * 386) / 3264);

/** Page padding for a letterhead page: clear of the band on top and the footer row below. */
export const LETTERHEAD_PAGE = {
  paddingTop: LETTERHEAD.header.h + 30,
  paddingBottom: 54,
  paddingHorizontal: GUTTER,
};

let fontsReady = false;
/** Register Inter (body) and Outfit (display) once. Fonts are served from /fonts. */
export function registerBrandFonts() {
  if (fontsReady) return;
  fontsReady = true;
  Font.register({ family: "Inter", fonts: [400, 500, 600, 700].map((w) => ({ src: abs(`/fonts/Inter-${w}.ttf`), fontWeight: w })) });
  Font.register({ family: "Outfit", fonts: [600, 700].map((w) => ({ src: abs(`/fonts/Outfit-${w}.ttf`), fontWeight: w })) });
  // Long words are never hyphenated (react-pdf's default splits them mid-word).
  Font.registerHyphenationCallback((w) => [w]);
}

/**
 * The letterhead band, repeated on every page. A joint-venture partner's logo sits on a white chip
 * in the empty middle of the band, clear of the GreenTech logo and of the wave on the right.
 */
export function LetterheadHeader({ jvLogo }: { jvLogo?: string }) {
  return (
    <View fixed style={{ position: "absolute", top: 0, left: 0, width: A4.w, height: LETTERHEAD.header.h }}>
      <Image src={abs(LETTERHEAD.header.src)} style={{ width: A4.w, height: LETTERHEAD.header.h }} />
      {!!jvLogo && (
        <View style={{ position: "absolute", top: 8, right: 140, height: 26, paddingHorizontal: 7, backgroundColor: BRAND.white, borderRadius: 4, justifyContent: "center" }}>
          <Image src={abs(jvLogo)} style={{ height: 18, maxWidth: 96, objectFit: "contain" }} />
        </View>
      )}
    </View>
  );
}

/**
 * The footer: a small reference line above the gradient rule. The right side is left free for
 * "Page i of N", which is stamped afterwards across the whole assembled file (attachments too).
 */
export function LetterheadFooter({ note, line = true }: { note?: string; line?: boolean }) {
  return (
    <>
      {!!note && (
        // lineHeight 1 so the text sits on the same baseline as the stamped page number.
        <Text fixed style={{ position: "absolute", left: GUTTER, right: GUTTER + 70, bottom: 18, fontFamily: "Inter", fontSize: 7.5, lineHeight: 1, color: BRAND.s500 }}>
          {note}
        </Text>
      )}
      {line && <Image fixed src={abs(LETTERHEAD.footer.src)} style={{ position: "absolute", left: 0, bottom: 0, width: A4.w, height: LETTERHEAD.footer.h }} />}
    </>
  );
}
/** Where the page number is stamped (pdf-lib, bottom-right), in step with the footer above. */
export const PAGE_NUMBER_POS = { right: GUTTER, baseline: 20 };

/** Emerald-to-blue bar, the brand's signature accent. */
export function GradBar({ w, h = 3, r = 1.5, id, vertical = false }: { w: number; h?: number; r?: number; id: string; vertical?: boolean }) {
  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2={vertical ? "0" : "1"} y2={vertical ? "1" : "0"}>
          <Stop offset="0" stopColor={BRAND.emerald} />
          <Stop offset="1" stopColor={BRAND.blue} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} rx={r} ry={r} fill={`url(#${id})`} />
    </Svg>
  );
}

/** Small spaced caps with a lead-in dash, e.g. "— TECHNICAL PROPOSAL". */
export function Eyebrow({ children, color = BRAND.emerald }: { children: ReactNode; color?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
      <View style={{ width: 22, height: 3, backgroundColor: color, borderRadius: 2, marginRight: 8 }} />
      <Text style={{ fontFamily: "Inter", fontSize: 9, fontWeight: 700, color, letterSpacing: 2.4 }}>{children}</Text>
    </View>
  );
}

/** "01.  SECTION TITLE" with an emerald rule, the body heading from the proposal template. The
 *  label is printed as given: "01.", "A." or "APPENDIX 1:". */
export function SectionHeading({ label, title }: { label?: string; title: string }) {
  return (
    <View minPresenceAhead={60} style={{ flexDirection: "row", alignItems: "baseline", borderBottom: `1.4 solid ${BRAND.emerald}`, paddingBottom: 4, marginTop: 16, marginBottom: 10 }}>
      {!!label && (
        <Text style={{ fontFamily: "Inter", fontSize: 11.5, fontWeight: 700, color: BRAND.emerald, marginRight: 8 }}>{label}</Text>
      )}
      <Text style={{ fontFamily: "Inter", fontSize: 11, fontWeight: 700, color: BRAND.slate, letterSpacing: 0.4, flex: 1 }}>{title.toUpperCase()}</Text>
    </View>
  );
}

/** Uppercase sub-heading inside a section. */
export function Subhead({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: "Inter", fontSize: 9.5, fontWeight: 700, color: BRAND.slate, letterSpacing: 0.3, marginTop: 8, marginBottom: 4 }}>{children}</Text>;
}
