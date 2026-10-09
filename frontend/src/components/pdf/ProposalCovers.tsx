import type React from "react";
import { Page, View, Text, Image, Svg, Defs, LinearGradient, Stop, Rect, Circle } from "@react-pdf/renderer";
import { BRAND, COMPANY, PAGE, abs, LOGO_MINT, GradBar, Eyebrow } from "./brand";

/**
 * Proposal cover pages, ported from the brand kit: the three styles of generateCoverPage.tsx, with
 * the dark hero's four-photo mosaic taken from generateProposal.mjs. The design is fixed; the data
 * follows the client's sample proposals (solicitation, volume, revision, attention, submitter,
 * client seal, restriction notice).
 */

export type CoverVariant = "hero" | "formal" | "panel";
export interface CoverField { label: string; value: string }   // value may hold several lines
export interface CoverData {
  kind: string;        // "TECHNICAL PROPOSAL"
  year: string;
  title: string;
  subtitle: string;
  fields: CoverField[];
  images: string[];    // absolute URLs, first is the feature photo
  // CR 368 - the JV partner's logo beside ours. (It was once taken off because it showed as an empty
  // box: the logo is a protected upload and was fetched without the file token; abs() adds it now.)
  partnerLogo?: string;
  volume?: string;     // "VOL. II: TECHNICAL PROPOSAL", shown in place of the kind
  badge?: string;      // revision, e.g. "Final Proposal Revision"
  clientLogo?: string; // the client's seal or logo
  notice?: string;     // restriction legend; the confidentiality line is used when empty
  /** 2026-10-09 - "Submitted by: GT's short info and the GT logo; Submitted to: the client's short
   *  info and its logo." The first line is the name. */
  submittedBy?: string[];
  submittedTo?: string[];
}

const LOGO_ASPECT = 1588 / 295;   // the trimmed mint lockup

// CR 194: the document type is the biggest line on the cover ("Technical Proposal", or the volume
// label when one is set) and the project / proposal title comes second.
const titleCase = (t: string) => t.toLowerCase().replace(/(^|\s)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
// A volume label shows as it was typed ("Vol. II: Technical Proposal").
const headingOf = (d: CoverData) => (d.volume || "").trim() || titleCase(d.kind.trim());
// "It's GreenTech USA; no need to add LLC."
export const SHORT_NAME = COMPANY.name.replace(/\s+LLC$/i, "");
const eyebrowOf = (d: CoverData) => `Prepared by ${SHORT_NAME} · ${d.year}`;

function Logo({ h }: { h: number }) {
  return <Image src={abs(LOGO_MINT)} style={{ width: h * LOGO_ASPECT, height: h }} />;
}

/** The GreenTech lockup always sits on dark; on a light cover it gets a slate chip. */
function LogoChip({ h = 22, padX }: { h?: number; padX?: number }) {
  return (
    <View style={{ backgroundColor: BRAND.slate, borderRadius: 8, paddingVertical: h * 0.5, paddingHorizontal: padX ?? h * 0.7, alignSelf: "flex-start" }}>
      <Logo h={h} />
    </View>
  );
}

/** The client's seal or logo (e.g. the agency seal), on white opposite our logo. */
function ClientMark({ src, h = 28, maxW }: { src: string; h?: number; maxW?: number }) {
  return (
    <View style={{ backgroundColor: BRAND.white, borderRadius: 6, padding: 4 }}>
      <Image src={abs(src)} style={{ height: h, maxWidth: maxW ?? h * 2.6, objectFit: "contain" }} />
    </View>
  );
}

/** CR 368 - the JV partner's logo, on white so any logo reads, next to ours. */
function PartnerMark({ src, h = 24 }: { src: string; h?: number }) {
  return (
    <View style={{ backgroundColor: BRAND.white, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 6 }}>
      <Image src={abs(src)} style={{ height: h, maxWidth: h * 3.2, objectFit: "contain" }} />
    </View>
  );
}

/**
 * 2026-10-09 - who submits and to whom, each with its logo under the label and its short details
 * below: our logo (and a JV partner's) beside "Submitted by", the client's seal beside "Submitted
 * to". The logos sit here, off the cover photos, one size smaller than before.
 */
const GT_LOGO_H = { dark: 32, light: 22 };
const CLIENT_LOGO_H = 84;
function Party({ label, lines, logos, tone, inRow = true }: { label: string; lines: string[]; logos: React.ReactNode; tone: "dark" | "light"; inRow?: boolean }) {
  const dark = tone === "dark";
  // Side by side the two share the row; stacked, each is only as tall as what it holds.
  return (
    <View style={inRow ? { flex: 1, paddingRight: 16 } : {}} wrap={false}>
      <Text style={{ fontSize: 6.4, fontWeight: 700, color: dark ? BRAND.s400 : BRAND.s500, letterSpacing: 1.3 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 7, marginBottom: 7 }}>{logos}</View>
      {lines.map((l, i) => (
        <Text key={i} style={{ fontSize: i === 0 ? 9.4 : 7.8, fontWeight: i === 0 ? 700 : 500, color: dark ? (i === 0 ? BRAND.white : BRAND.s300) : (i === 0 ? BRAND.slate : BRAND.s600), marginTop: i ? 2 : 0, lineHeight: 1.3 }}>{l}</Text>
      ))}
    </View>
  );
}
function Parties({ d, tone, stacked = false }: { d: CoverData; tone: "dark" | "light"; stacked?: boolean }) {
  const dark = tone === "dark";
  const gt = dark ? <Logo h={GT_LOGO_H.dark} /> : <LogoChip h={GT_LOGO_H.light} padX={12} />;
  const by = (
    <Party label="SUBMITTED BY" tone={tone} inRow={!stacked} lines={d.submittedBy || []} logos={<>
      {gt}
      {!!d.partnerLogo && <View style={{ marginLeft: 10 }}><PartnerMark src={d.partnerLogo} h={dark ? 22 : 20} /></View>}
    </>} />
  );
  const to = (d.submittedTo || []).length > 0 || d.clientLogo ? (
    <Party label="SUBMITTED TO" tone={tone} inRow={!stacked} lines={d.submittedTo || []} logos={d.clientLogo
      ? <View style={dark ? {} : { border: `1 solid ${BRAND.border}`, borderRadius: 8 }}><ClientMark src={d.clientLogo} h={CLIENT_LOGO_H} maxW={170} /></View>
      : null} />
  ) : null;
  return stacked
    ? <View>{by}{to && <View style={{ marginTop: 14 }}>{to}</View>}</View>
    : <View style={{ flexDirection: "row", alignItems: "flex-start" }}>{by}{to || <View style={{ flex: 1 }} />}</View>;
}

/** The revision, e.g. "FINAL PROPOSAL REVISION", as an outlined pill. */
function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: 10, border: `1 solid ${color}`, paddingVertical: 3, paddingHorizontal: 8, marginBottom: 10 }}>
      <Text style={{ fontSize: 7, fontWeight: 700, letterSpacing: 1.4, color }}>{text.toUpperCase()}</Text>
    </View>
  );
}

/** One feature photo on the left and up to three stacked on the right, with slate seams. */
function Mosaic({ images, w, h }: { images: string[]; w: number; h: number }) {
  const gap = 4;
  if (images.length <= 1) return <Image src={images[0]} style={{ width: w, height: h, objectFit: "cover" }} />;
  const leftW = Math.round(w * 0.6);
  const rightW = w - leftW - gap;
  const rest = images.slice(1, 4);
  const ph = (h - gap * (rest.length - 1)) / rest.length;
  return (
    <View style={{ flexDirection: "row", width: w, height: h, backgroundColor: BRAND.slate }}>
      <Image src={images[0]} style={{ width: leftW, height: h, objectFit: "cover" }} />
      <View style={{ width: rightW, marginLeft: gap }}>
        {rest.map((src, i) => <Image key={i} src={src} style={{ width: rightW, height: ph, objectFit: "cover", marginTop: i ? gap : 0 }} />)}
      </View>
    </View>
  );
}

const CONFIDENTIAL = `Confidential & proprietary. Prepared exclusively for the named recipient. · CAGE ${COMPANY.cage} · UEI ${COMPANY.uei}`;

/**
 * The photo scrim: dark behind the logo, clear through the photos, then fading into the slate so
 * the title panel continues without an edge.
 *
 * Built from stacked flat-opacity layers, not an SVG gradient with stop opacities. A gradient that
 * fades transparency needs a PDF soft mask, and in testing the photos came out completely hidden
 * behind it. Flat opacity works in every viewer. Each layer starts at an edge and ends at a
 * different depth, so layers overlap instead of abutting, which leaves no hairline seams.
 */
function Scrim({ w, h }: { w: number; h: number }) {
  const layer = (top: number, height: number, opacity: number, key: string) => (
    <View key={key} style={{ position: "absolute", top, left: 0, width: w, height, backgroundColor: BRAND.slate, opacity }} />
  );
  const BASE = 0.16;
  const layers = [layer(0, h, BASE, "base")];
  // Top: from the top edge down to 32% of the height; with the base it reaches ~0.74 at the edge.
  const TOP_N = 40, topEnd = h * 0.32, aTop = 1 - Math.pow(0.26 / (1 - BASE), 1 / TOP_N);
  for (let i = 1; i <= TOP_N; i++) layers.push(layer(0, topEnd * (i / TOP_N), aTop, `t${i}`));
  // Bottom: from 45% of the height to the bottom edge, reaching ~0.99 so it meets the slate cleanly.
  const BOT_N = 80, botStart = h * 0.45, aBot = 1 - Math.pow(0.01 / (1 - BASE), 1 / BOT_N);
  for (let i = 1; i <= BOT_N; i++) {
    const top = botStart + (h - botStart) * (1 - i / BOT_N);
    layers.push(layer(top, h - top, aBot, `b${i}`));
  }
  return <View style={{ position: "absolute", top: 0, left: 0, width: w, height: h }}>{layers}</View>;
}

// ── 1 · Dark hero ────────────────────────────────────────────────────────────
function Hero({ d }: { d: CoverData }) {
  // The photo band gives way as the fields grow, so a full cover still fits one page. 2026-10-09:
  // a little shorter, and with no logo on it (the logos are with Submitted by / Submitted to).
  const H = d.fields.length > 6 ? 250 : d.fields.length > 3 ? 280 : 310;
  return (
    <Page size="LETTER" style={{ backgroundColor: BRAND.slate, fontFamily: "Inter" }}>
      <View style={{ height: H, position: "relative" }}>
        <Mosaic images={d.images} w={PAGE.w} h={H} />
        <Scrim w={PAGE.w} h={H} />
      </View>

      <View style={{ paddingHorizontal: 52, flex: 1, justifyContent: "space-between", paddingTop: 6, paddingBottom: 26 }}>
        <View>
          <Eyebrow>{eyebrowOf(d)}</Eyebrow>
          {!!d.badge && <Badge text={d.badge} color={BRAND.emerald} />}
          <Text style={{ fontFamily: "Outfit", fontSize: 34, fontWeight: 700, color: BRAND.white, lineHeight: 1.08 }}>{headingOf(d)}</Text>
          <Text style={{ fontFamily: "Outfit", fontSize: 17, fontWeight: 600, color: BRAND.cyan, lineHeight: 1.25, marginTop: 7, maxWidth: 480 }}>{d.title}</Text>
          {!!d.subtitle && <Text style={{ fontSize: 10.5, color: BRAND.s300, marginTop: 9, lineHeight: 1.5, maxWidth: 460 }}>{d.subtitle}</Text>}
        </View>

        <View>
          <GradBar w={PAGE.w - 104} h={3} id="heroRule" />
          {d.fields.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12 }}>
              {d.fields.map((f) => (
                <View key={f.label} style={{ width: "33.3%", paddingRight: 12, marginBottom: 9 }}>
                  <Text style={{ fontSize: 6.4, fontWeight: 600, color: BRAND.s400, letterSpacing: 1.3 }}>{f.label}</Text>
                  <Text style={{ fontSize: 8.8, fontWeight: 700, color: BRAND.white, marginTop: 3, lineHeight: 1.3 }}>{f.value}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={{ marginTop: 8, paddingTop: 12, borderTop: "1 solid rgba(255,255,255,0.14)" }}>
            <Parties d={d} tone="dark" />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12, borderTop: "1 solid rgba(255,255,255,0.14)", paddingTop: 9 }}>
            <Text style={{ fontSize: 7, color: BRAND.s400, maxWidth: 380 }}>{d.notice || `Confidential & proprietary · Prepared by ${SHORT_NAME} · CAGE ${COMPANY.cage}`}</Text>
            <Text style={{ fontSize: 7, color: BRAND.s400 }}>{COMPANY.website}</Text>
          </View>
        </View>
      </View>
    </Page>
  );
}


// ── 2 · Light formal ─────────────────────────────────────────────────────────
function Formal({ d }: { d: CoverData }) {
  return (
    <Page size="LETTER" style={{ backgroundColor: BRAND.white, fontFamily: "Inter" }}>
      <View style={{ position: "absolute", top: 0, left: 0 }}><GradBar w={PAGE.w} h={8} r={0} id="formalTop" /></View>
      <View style={{ paddingHorizontal: 56, paddingTop: 54, paddingBottom: 34, flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "center", paddingBottom: 14 }}>
          <Eyebrow>{eyebrowOf(d)}</Eyebrow>
          {!!d.badge && <Badge text={d.badge} color={BRAND.emerald} />}
          <Text style={{ fontFamily: "Outfit", fontSize: 38, fontWeight: 700, color: BRAND.slate, lineHeight: 1.08, maxWidth: 480 }}>{headingOf(d)}</Text>
          <Text style={{ fontFamily: "Outfit", fontSize: 19, fontWeight: 600, color: BRAND.s600, lineHeight: 1.25, marginTop: 8, maxWidth: 470 }}>{d.title}</Text>
          {!!d.subtitle && <Text style={{ fontSize: 11, color: BRAND.s600, marginTop: 12, lineHeight: 1.6, maxWidth: 440 }}>{d.subtitle}</Text>}
          {d.fields.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 22 }}>
              {d.fields.map((f) => (
                <View key={f.label} style={{ width: "25%", paddingRight: 10, marginBottom: 10 }}>
                  {/* flexGrow: every card in a row stretches to the tallest one, so the grid stays even. */}
                  <View style={{ flexGrow: 1, backgroundColor: BRAND.mist, borderRadius: 8, padding: 10, borderLeft: `3 solid ${BRAND.emerald}` }}>
                    <Text style={{ fontSize: 6.2, fontWeight: 700, color: BRAND.s500, letterSpacing: 1.1 }}>{f.label}</Text>
                    <Text style={{ fontSize: 8, fontWeight: 700, color: BRAND.slate, marginTop: 4, lineHeight: 1.35 }}>{f.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ borderTop: `1 solid ${BRAND.border}`, paddingTop: 14 }}>
          <Parties d={d} tone="light" />
        </View>
        <Text style={{ fontSize: 7, color: BRAND.s400, marginTop: 14, textAlign: "center" }}>{d.notice || CONFIDENTIAL}</Text>
      </View>
    </Page>
  );
}

// ── 3 · Gradient side panel ──────────────────────────────────────────────────
function Panel({ d }: { d: CoverData }) {
  const PWL = 232;
  return (
    <Page size="LETTER" style={{ flexDirection: "row", fontFamily: "Inter" }}>
      <View style={{ width: PWL, position: "relative" }}>
        <Svg width={PWL} height={PAGE.h} style={{ position: "absolute", top: 0, left: 0 }}>
          <Defs>
            <LinearGradient id="panelBg" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={BRAND.emerald} />
              <Stop offset="1" stopColor={BRAND.blue} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={PWL} height={PAGE.h} fill="url(#panelBg)" />
          <Circle cx={PWL - 10} cy={140} r={120} stroke="#FFFFFF" strokeWidth={1} fill="none" opacity={0.14} />
          <Circle cx={20} cy={PAGE.h - 90} r={110} stroke="#FFFFFF" strokeWidth={1} fill="none" opacity={0.14} />
        </Svg>
        <View style={{ flex: 1, padding: 32, justifyContent: "space-between" }}>
          {/* 2026-10-09 - the logos are with Submitted by / Submitted to, on the right. */}
          <View />
          <View>
            <Eyebrow color={BRAND.white}>{d.year}</Eyebrow>
            {!!d.badge && <Badge text={d.badge} color={BRAND.white} />}
            <Text style={{ fontFamily: "Outfit", fontSize: 29, fontWeight: 700, color: BRAND.white, lineHeight: 1.08 }}>{headingOf(d)}</Text>
            <Text style={{ fontFamily: "Outfit", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.9)", lineHeight: 1.25, marginTop: 8 }}>{d.title}</Text>
          </View>
          <Text style={{ fontSize: 7.5, color: "rgba(255,255,255,0.85)" }}>{COMPANY.website} · CAGE {COMPANY.cage}</Text>
        </View>
      </View>

      <View style={{ flex: 1, padding: 36, justifyContent: "space-between" }}>
        <View>
          <View style={{ height: 150, borderRadius: 10, overflow: "hidden", border: `1 solid ${BRAND.border}` }}>
            {!!d.images[0] && <Image src={d.images[0]} style={{ width: "100%", height: 150, objectFit: "cover" }} />}
          </View>
        </View>
        <View style={{ flex: 1, justifyContent: "center", paddingVertical: 10 }}>
          {!!d.subtitle && <Text style={{ fontSize: 10.5, color: BRAND.s600, lineHeight: 1.6 }}>{d.subtitle}</Text>}
          <View style={{ marginTop: 14 }}>
            {d.fields.map((f, i, a) => (
              <View key={f.label} wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottom: i < a.length - 1 ? `0.5 solid ${BRAND.border}` : undefined }}>
                <Text style={{ fontSize: 6.8, fontWeight: 700, color: BRAND.s400, letterSpacing: 1, marginRight: 12, maxWidth: 95 }}>{f.label}</Text>
                <Text style={{ fontSize: 8.4, fontWeight: 700, color: BRAND.slate, maxWidth: 190, textAlign: "right", lineHeight: 1.3 }}>{f.value}</Text>
              </View>
            ))}
          </View>
          <View style={{ marginTop: 14, paddingTop: 12, borderTop: `1 solid ${BRAND.border}` }}>
            <Parties d={d} tone="light" stacked />
          </View>
        </View>
        <Text style={{ fontSize: 7, color: BRAND.s400, lineHeight: 1.5 }}>{d.notice || CONFIDENTIAL}</Text>
      </View>
    </Page>
  );
}

export default function ProposalCoverPage({ variant = "hero", data }: { variant?: CoverVariant; data: CoverData }) {
  if (variant === "formal") return <Formal d={data} />;
  if (variant === "panel") return <Panel d={data} />;
  return <Hero d={data} />;
}
