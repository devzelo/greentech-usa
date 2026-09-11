import { Page, View, Text, Image, Svg, Defs, LinearGradient, Stop, Rect, Circle } from "@react-pdf/renderer";
import { BRAND, COMPANY, A4, abs, LOGO_MINT, GradBar, Eyebrow } from "./brand";

/**
 * Proposal cover pages, ported from the brand kit: the three styles of generateCoverPage.tsx, with
 * the dark hero's four-photo mosaic taken from generateProposal.mjs. The design is fixed; only the
 * data (title, fields, photos, partner logo) comes from the proposal.
 */

export type CoverVariant = "hero" | "formal" | "panel";
export interface CoverField { label: string; value: string }
export interface CoverData {
  kind: string;       // "TECHNICAL PROPOSAL"
  year: string;
  title: string;
  subtitle: string;
  fields: CoverField[];
  images: string[];   // absolute URLs, first is the feature photo
  jvLogo?: string;
}

const LOGO_ASPECT = 1588 / 295;   // the trimmed mint lockup

function Logo({ h }: { h: number }) {
  return <Image src={abs(LOGO_MINT)} style={{ width: h * LOGO_ASPECT, height: h }} />;
}

/** The GreenTech lockup always sits on dark; on a light cover it gets a slate chip. */
function LogoChip({ h = 22 }: { h?: number }) {
  return (
    <View style={{ backgroundColor: BRAND.slate, borderRadius: 8, paddingVertical: h * 0.5, paddingHorizontal: h * 0.7, alignSelf: "flex-start" }}>
      <Logo h={h} />
    </View>
  );
}

/** A joint-venture partner's logo, on white so a logo of any colour reads. */
function JvChip({ src, h = 22, below = false }: { src: string; h?: number; below?: boolean }) {
  return (
    <View style={{ backgroundColor: BRAND.white, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8, justifyContent: "center", alignSelf: "flex-start", ...(below ? { marginTop: 8 } : { marginLeft: 10 }) }}>
      <Image src={abs(src)} style={{ height: h, maxWidth: 110, objectFit: "contain" }} />
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
  const H = 380;
  return (
    <Page size="A4" style={{ backgroundColor: BRAND.slate, fontFamily: "Inter" }}>
      <View style={{ height: H, position: "relative" }}>
        <Mosaic images={d.images} w={A4.w} h={H} />
        <Scrim w={A4.w} h={H} />
        <View style={{ position: "absolute", top: 44, left: 52, flexDirection: "row", alignItems: "center" }}>
          <Logo h={30} />
          {!!d.jvLogo && <JvChip src={d.jvLogo} />}
        </View>
      </View>

      <View style={{ paddingHorizontal: 52, flex: 1, justifyContent: "space-between", paddingTop: 16, paddingBottom: 40 }}>
        <View>
          <Eyebrow>{d.kind} · {d.year}</Eyebrow>
          <Text style={{ fontFamily: "Outfit", fontSize: 32, fontWeight: 700, color: BRAND.white, lineHeight: 1.12 }}>{d.title}</Text>
          {!!d.subtitle && <Text style={{ fontSize: 11.5, color: BRAND.s300, marginTop: 14, lineHeight: 1.6, maxWidth: 440 }}>{d.subtitle}</Text>}
        </View>

        <View>
          <GradBar w={A4.w - 104} h={3} id="heroRule" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 16 }}>
            {d.fields.map((f) => (
              <View key={f.label} style={{ width: "33.3%", paddingRight: 12, marginBottom: 12 }}>
                <Text style={{ fontSize: 6.6, fontWeight: 600, color: BRAND.s400, letterSpacing: 1.4 }}>{f.label}</Text>
                <Text style={{ fontSize: 9.5, fontWeight: 700, color: BRAND.white, marginTop: 4, lineHeight: 1.3 }}>{f.value}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10, borderTop: "1 solid rgba(255,255,255,0.14)", paddingTop: 12 }}>
            <Text style={{ fontSize: 7.5, color: BRAND.s400 }}>Confidential & proprietary · Prepared by {COMPANY.name} · CAGE {COMPANY.cage}</Text>
            <Text style={{ fontSize: 7.5, color: BRAND.s400 }}>{COMPANY.website}</Text>
          </View>
        </View>
      </View>
    </Page>
  );
}

/** The emerald-to-blue contact strip at the foot of the light cover. */
function ContactStrip({ w }: { w: number }) {
  const items: Array<[string, string]> = [["ADDRESS", COMPANY.address], ["PHONE", COMPANY.phone], ["EMAIL", COMPANY.email], ["WEB", COMPANY.website]];
  return (
    <View style={{ width: w, height: 44, borderRadius: 8, overflow: "hidden", flexDirection: "row" }}>
      <Svg width={w} height={44} style={{ position: "absolute", top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id="coverStrip" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={BRAND.emerald} />
            <Stop offset="1" stopColor={BRAND.blue} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={44} fill="url(#coverStrip)" />
      </Svg>
      {items.map(([l, v], i) => (
        <View key={l} style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRight: i < items.length - 1 ? "1 solid rgba(255,255,255,0.25)" : undefined }}>
          <Text style={{ fontSize: 6.2, color: "rgba(255,255,255,0.85)", letterSpacing: 1.2, fontWeight: 600 }}>{l}</Text>
          <Text style={{ fontSize: 7.8, color: BRAND.white, fontWeight: 700, marginTop: 4 }}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

// ── 2 · Light formal ─────────────────────────────────────────────────────────
function Formal({ d }: { d: CoverData }) {
  return (
    <Page size="A4" style={{ backgroundColor: BRAND.white, fontFamily: "Inter" }}>
      <View style={{ position: "absolute", top: 0, left: 0 }}><GradBar w={A4.w} h={8} r={0} id="formalTop" /></View>
      <View style={{ paddingHorizontal: 56, paddingTop: 56, paddingBottom: 44, flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <LogoChip h={22} />
          {!!d.jvLogo && <JvChip src={d.jvLogo} />}
        </View>

        <View style={{ flex: 1, justifyContent: "center", paddingVertical: 24 }}>
          <Eyebrow>{d.kind}</Eyebrow>
          <Text style={{ fontFamily: "Outfit", fontSize: 36, fontWeight: 700, color: BRAND.slate, lineHeight: 1.12, maxWidth: 470 }}>{d.title}</Text>
          {!!d.subtitle && <Text style={{ fontSize: 11.5, color: BRAND.s600, marginTop: 14, lineHeight: 1.65, maxWidth: 440 }}>{d.subtitle}</Text>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 28 }}>
            {d.fields.map((f) => (
              <View key={f.label} style={{ width: "25%", paddingRight: 10, marginBottom: 10 }}>
                {/* flexGrow: every card in a row stretches to the tallest one, so the grid stays even. */}
                <View style={{ flexGrow: 1, backgroundColor: BRAND.mist, borderRadius: 8, padding: 11, borderLeft: `3 solid ${BRAND.emerald}` }}>
                  <Text style={{ fontSize: 6.4, fontWeight: 700, color: BRAND.s500, letterSpacing: 1.2 }}>{f.label}</Text>
                  <Text style={{ fontSize: 8.4, fontWeight: 700, color: BRAND.slate, marginTop: 5, lineHeight: 1.35 }}>{f.value}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <ContactStrip w={A4.w - 112} />
        <Text style={{ fontSize: 7, color: BRAND.s400, marginTop: 10, textAlign: "center" }}>{CONFIDENTIAL}</Text>
      </View>
    </Page>
  );
}

// ── 3 · Gradient side panel ──────────────────────────────────────────────────
function Panel({ d }: { d: CoverData }) {
  const PWL = 232;
  return (
    <Page size="A4" style={{ flexDirection: "row", fontFamily: "Inter" }}>
      <View style={{ width: PWL, position: "relative" }}>
        <Svg width={PWL} height={A4.h} style={{ position: "absolute", top: 0, left: 0 }}>
          <Defs>
            <LinearGradient id="panelBg" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={BRAND.emerald} />
              <Stop offset="1" stopColor={BRAND.blue} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={PWL} height={A4.h} fill="url(#panelBg)" />
          <Circle cx={PWL - 10} cy={140} r={120} stroke="#FFFFFF" strokeWidth={1} fill="none" opacity={0.14} />
          <Circle cx={20} cy={A4.h - 90} r={110} stroke="#FFFFFF" strokeWidth={1} fill="none" opacity={0.14} />
        </Svg>
        <View style={{ flex: 1, padding: 32, justifyContent: "space-between" }}>
          <View>
            <LogoChip h={18} />
            {!!d.jvLogo && <JvChip src={d.jvLogo} h={18} below />}
          </View>
          <View>
            <Eyebrow color={BRAND.white}>{d.kind}</Eyebrow>
            <Text style={{ fontFamily: "Outfit", fontSize: 26, fontWeight: 700, color: BRAND.white, lineHeight: 1.14 }}>{d.title}</Text>
          </View>
          <Text style={{ fontSize: 7.5, color: "rgba(255,255,255,0.85)" }}>{COMPANY.website} · CAGE {COMPANY.cage}</Text>
        </View>
      </View>

      <View style={{ flex: 1, padding: 40, justifyContent: "space-between" }}>
        <View style={{ height: 160, borderRadius: 10, overflow: "hidden", border: `1 solid ${BRAND.border}` }}>
          {!!d.images[0] && <Image src={d.images[0]} style={{ width: "100%", height: 160, objectFit: "cover" }} />}
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          {!!d.subtitle && <Text style={{ fontSize: 11, color: BRAND.s600, lineHeight: 1.7 }}>{d.subtitle}</Text>}
          <View style={{ marginTop: 20 }}>
            {d.fields.map((f, i, a) => (
              <View key={f.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottom: i < a.length - 1 ? `0.5 solid ${BRAND.border}` : undefined }}>
                <Text style={{ fontSize: 7.2, fontWeight: 700, color: BRAND.s400, letterSpacing: 1, marginRight: 12 }}>{f.label}</Text>
                <Text style={{ fontSize: 9, fontWeight: 700, color: BRAND.slate, maxWidth: 190, textAlign: "right" }}>{f.value}</Text>
              </View>
            ))}
          </View>
        </View>
        <Text style={{ fontSize: 7, color: BRAND.s400, lineHeight: 1.5 }}>{CONFIDENTIAL}</Text>
      </View>
    </Page>
  );
}

export default function ProposalCoverPage({ variant = "hero", data }: { variant?: CoverVariant; data: CoverData }) {
  if (variant === "formal") return <Formal d={data} />;
  if (variant === "panel") return <Panel d={data} />;
  return <Hero d={data} />;
}
