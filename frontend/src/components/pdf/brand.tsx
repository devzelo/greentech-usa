import { Font, View, Image, Text, Svg, Defs, LinearGradient, Stop, Rect } from "@react-pdf/renderer";
import type { ReactNode } from "react";

/**
 * The GreenTech document brand for react-pdf: letterhead band, footer rule, fonts and type.
 *
 * Ported from the brand kit's generator scripts (generateLetterhead / generateProposal /
 * generateCoverPage). The header and footer art is the client-approved letterhead, and it goes on
 * every page of every document this platform generates, so it is defined once, here.
 */

// Colours, company details and the asset origin are plain data shared with the pdf-lib kit.
import { BRAND, COMPANY, abs, setAssetOrigin } from "../../lib/brandTokens";
export { BRAND, COMPANY, abs, setAssetOrigin };

// The page every branded document prints on: US Letter, 8.5" x 11" (client request, 2026-09-14).
// Only the BOQ, the procurement master log and submittal packages use 11" x 17" landscape.
export const PAGE = { w: 612, h: 792 } as const;

// The letterhead art is 3264 px wide; at the page width its height follows from the ratio.
export const LETTERHEAD = {
  header: { src: "/brand/letterhead-header.png", h: (PAGE.w * 220) / 3264 },   // ~40 pt dark band
  footer: { src: "/brand/letterhead-footer.png", h: (PAGE.w * 64) / 3264 },    // ~12 pt, line at the bottom
};
export const LOGO_MINT = "/brand/gt-logo-mint.png";   // trimmed horizontal lockup, for dark grounds
export const COVER_FALLBACK = "/brand/cover-default.jpg";

/** Text gutter: lines up with the left edge of the logo in the header band (x = 386 of 3264 px). */
export const GUTTER = Math.round((PAGE.w * 386) / 3264);

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
// The band carries the client-approved art only. A JV partner's logo used to sit on a white chip in
// it, which read as an empty white box whenever the logo did not load; the JV shows in the text
// instead (the submitter on the cover, the EOI's firm name).
export function LetterheadHeader({ partnerLogo }: { partnerLogo?: string } = {}) {
  const H = LETTERHEAD.header.h;
  // 2026-10-08 - on a joint venture the partner's logo sits on the band after ours (our lockup ends
  // at about 197 pt; the wave starts at about 490 pt), behind a thin rule, on a white chip.
  return (
    <View fixed style={{ position: "absolute", top: 0, left: 0, width: PAGE.w, height: H }}>
      <Image src={abs(LETTERHEAD.header.src)} style={{ width: PAGE.w, height: H }} />
      {!!partnerLogo && <View style={{ position: "absolute", left: 210, top: H * 0.26, width: 0.8, height: H * 0.54, backgroundColor: "rgba(255,255,255,0.45)" }} />}
      {!!partnerLogo && (
        <View style={{ position: "absolute", left: 220, top: H * 0.2, height: H * 0.64, backgroundColor: "#FFFFFF", borderRadius: 4, paddingHorizontal: 5, justifyContent: "center" }}>
          <Image src={partnerLogo} style={{ height: H * 0.64 - 6, maxWidth: 130, objectFit: "contain" }} />
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
      {line && <Image fixed src={abs(LETTERHEAD.footer.src)} style={{ position: "absolute", left: 0, bottom: 0, width: PAGE.w, height: LETTERHEAD.footer.h }} />}
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
export function SectionHeading({ label, title, center }: { label?: string; title: string; center?: boolean }) {
  return (
    <View
      minPresenceAhead={60}
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: center ? "center" : "flex-start",
        borderBottom: `1.4 solid ${BRAND.emerald}`,
        paddingBottom: 4,
        marginTop: center ? 2 : 16,
        marginBottom: center ? 8 : 10,
      }}
    >
      {!!label && (
        <Text style={{ fontFamily: "Inter", fontSize: 11.5, fontWeight: 700, color: BRAND.emerald, marginRight: 8 }}>{label}</Text>
      )}
      {/* CR 205 - centred when a run of pages shares one title (the key personnel appendix). */}
      <Text style={{ fontFamily: "Inter", fontSize: 11, fontWeight: 700, color: BRAND.slate, letterSpacing: 0.4, ...(center ? {} : { flex: 1 }) }}>{title.toUpperCase()}</Text>
    </View>
  );
}

/** Uppercase sub-heading inside a section. */
export function Subhead({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: "Inter", fontSize: 9.5, fontWeight: 700, color: BRAND.slate, letterSpacing: 0.3, marginTop: 8, marginBottom: 4 }}>{children}</Text>;
}
