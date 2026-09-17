import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { createElement } from "react";
import type { ReactNode, ReactElement } from "react";
import type { ApiProject, TechnicalProposalContent, FinancialProposalContent, TeamResume, ProposalCover, ProposalCoverLetter, ProposalLetterhead, ProposalSectionMeta, ProposalBackCover, ProposalSimilarProject, ProposalRequirement } from "../../lib/api";
import { periodOf, referencesOnly, sheetLabel } from "../../lib/pastPerformance";
import { tableCalc, adjustmentLabel } from "../../lib/pricing";
import { resolveProposalLayout, resolveFinancialTables, resolveFinancialLayout, requirementStatus, REQUIREMENT_STATUSES } from "../../lib/api";
import { ResumeBlock } from "./ResumePDF";
import {
  BRAND, COMPANY, PAGE, abs, LETTERHEAD_PAGE, LOGO_MINT, COVER_FALLBACK, registerBrandFonts,
  LetterheadHeader, LetterheadFooter, SectionHeading, Subhead, Eyebrow, GradBar,
} from "../pdf/brand";
import ProposalCoverPage, { type CoverData, type CoverField } from "../pdf/ProposalCovers";
import { resolveLetter } from "../../lib/proposalLetter";
import type { ProposalPart, PageCtx } from "../../lib/proposalExport";

// The proposal is set in the brand kit's type (Inter body, Outfit display) on the client-approved
// letterhead, the look defined by the brand kit's generator scripts. Fonts register once.
registerBrandFonts();

// Resolve a letterhead choice: the brand band (with the JV partner's logo for "jv"), a custom logo
// row, or nothing at all (e.g. sections that are raw client forms).
interface LhConfig { mode: "brand" | "custom" | "none"; logo?: string; jv?: string }
function lhConfig(letterhead: ProposalLetterhead | undefined, customLetterheadUrl: string | undefined, logoUrl: string | undefined, coverJv: string | undefined): LhConfig {
  switch (letterhead) {
    case "none": return { mode: "none" };
    case "custom": return { mode: "custom", logo: abs(customLetterheadUrl) || logoUrl };
    case "jv": return { mode: "brand", jv: coverJv || "" };
    default: return { mode: "brand" };
  }
}

/** A proposal team member whose full resume prints in the proposal. */
export interface ProposalTeamResume {
  name: string;
  role: string;
  data: TeamResume;
  rowId?: string;   // the key-personnel row it belongs to (matching by name is the fallback)
  firm?: string;    // a subcontractor person's company
}

// Library sections that hold the resumes: when the layout has one (a designed page), the resumes
// print there, in the RFP's order ("Tab C, Key Personnel Resumes"), not as a closing appendix.
const RESUME_SECTION_KEYS = new Set(["resumes", "appx-resumes"]);

const BODY = { fontSize: 9.5, color: BRAND.s700, fontFamily: "Inter", lineHeight: 1.5 } as const;

const styles = StyleSheet.create({
  page: { ...LETTERHEAD_PAGE, ...BODY },
  // No brand band (custom logo row, or no letterhead): the text starts nearer the top.
  pagePlain: { paddingTop: 44, paddingBottom: LETTERHEAD_PAGE.paddingBottom, paddingHorizontal: LETTERHEAD_PAGE.paddingHorizontal, ...BODY },
  customHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, marginBottom: 20, borderBottom: `1.4 solid ${BRAND.emerald}` },
  customLogo: { width: 110, height: 40, objectFit: "contain" },
  customLabel: { fontSize: 7.5, color: BRAND.s500, letterSpacing: 2 },

  // Divider page
  dividerWrap: { marginTop: 200 },
  dividerTitle: { fontFamily: "Outfit", fontSize: 28, fontWeight: 700, color: BRAND.slate, lineHeight: 1.15, marginBottom: 16 },
  dividerKicker: { fontFamily: "Outfit", fontSize: 16, fontWeight: 600, color: BRAND.emerald, marginBottom: 4 },
  dividerRef: { fontSize: 9, color: BRAND.s500, marginTop: -8, marginBottom: 14 },
  dividerMeta: { fontSize: 9, color: BRAND.s600, marginTop: 3 },

  // Document title block (financial)
  docTitle: { fontFamily: "Outfit", fontSize: 22, fontWeight: 700, color: BRAND.slate, lineHeight: 1.15 },

  // Cover letter
  letterRow: { flexDirection: "row", marginBottom: 5 },
  letterLabel: { width: 56, fontSize: 9.5, fontWeight: 700, color: BRAND.slate },
  letterValue: { flex: 1, fontSize: 9.5, color: BRAND.s700, lineHeight: 1.45 },
  sigRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  sigBlock: { minWidth: 180, marginRight: 28, marginBottom: 12 },
  sigImg: { height: 40, width: 120, objectFit: "contain" },
  sealImg: { height: 56, width: 56, objectFit: "contain" },
  sigName: { fontSize: 10.5, fontWeight: 700, color: BRAND.slate },
  sigTitle: { fontSize: 8.5, color: BRAND.s500 },

  // Body text
  para: { fontSize: 9.5, marginBottom: 6, color: BRAND.s700 },
  h2: { fontSize: 11, fontWeight: 700, color: BRAND.slate, marginTop: 8, marginBottom: 4 },
  h3: { fontSize: 10, fontWeight: 700, color: BRAND.slate, marginTop: 6, marginBottom: 3 },
  listItem: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 13, fontSize: 9.5, fontWeight: 700, color: BRAND.emerald },
  listText: { flex: 1, fontSize: 9.5, color: BRAND.s700 },

  // TOC
  tocRow: { flexDirection: "row", paddingVertical: 6, borderBottom: `0.6 solid ${BRAND.border}` },
  tocNum: { width: 30, fontSize: 9.5, fontWeight: 700, color: BRAND.emerald },
  tocText: { flex: 1, fontSize: 9.5, color: BRAND.slate },
  tocRef: { fontSize: 8.5, color: BRAND.s500 },
  tocSubRow: { paddingVertical: 4, paddingLeft: 14 },
  tocPage: { width: 30, textAlign: "right", fontSize: 9.5, color: BRAND.slate },
  pageMark: { position: "absolute", top: 0, left: 0, fontSize: 1, color: BRAND.white },
  tocSubNum: { fontWeight: 400, color: BRAND.s500, fontSize: 9 },
  tocSubText: { fontSize: 9, color: BRAND.s600 },

  // Employee / project cards
  card: { backgroundColor: BRAND.mist, borderRadius: 6, padding: 10, marginBottom: 7, borderLeft: `3 solid ${BRAND.emerald}` },
  cardTitle: { fontSize: 10.5, fontWeight: 700, color: BRAND.slate },
  cardMeta: { fontSize: 8.5, color: BRAND.s500, marginTop: 2 },

  // Data tables: slate header, zebra rows (the proposal template's table)
  tHead: { flexDirection: "row", backgroundColor: BRAND.slate },
  th: { color: BRAND.white, fontSize: 7.5, fontWeight: 700, padding: 6, letterSpacing: 0.6 },
  tRow: { flexDirection: "row", borderBottom: `0.6 solid ${BRAND.border}` },
  tRowAlt: { backgroundColor: BRAND.mist },
  td: { fontSize: 8.5, padding: 6, color: BRAND.slate },
  staffBand: { backgroundColor: "#ECFDF5", paddingVertical: 3, paddingHorizontal: 6, borderBottom: `0.6 solid ${BRAND.border}` },
  staffBandText: { fontSize: 7, fontWeight: 700, color: "#047857", letterSpacing: 0.8 },

  // Step 6 - project tables and data sheets (the company profile's featured-project style)
  ppTh: { fontSize: 6.4, paddingVertical: 5, paddingHorizontal: 4 },
  ppTd: { fontSize: 7.4, paddingVertical: 5, paddingHorizontal: 4, lineHeight: 1.35 },
  ppHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  ppTitle: { fontFamily: "Outfit", fontSize: 16, fontWeight: 700, color: BRAND.slate, lineHeight: 1.2, flex: 1, paddingRight: 14 },
  ppSide: { alignItems: "flex-end" },
  ppValue: { fontFamily: "Outfit", fontSize: 13, fontWeight: 700, color: BRAND.emerald, lineHeight: 1.2 },
  ppPill: { marginTop: 4, paddingVertical: 2.5, paddingHorizontal: 6, borderRadius: 4, backgroundColor: "#ECFDF5" },
  ppPillOngoing: { backgroundColor: "#EFF6FF" },
  ppPillText: { fontSize: 6.8, fontWeight: 700, letterSpacing: 0.8, color: "#047857", lineHeight: 1.2 },
  ppPillTextOngoing: { color: "#1D4ED8" },
  ppPhoto: { width: "100%", height: 200, objectFit: "cover", borderRadius: 8, marginBottom: 12 },
  ppFacts: { flexDirection: "row", flexWrap: "wrap", borderTop: `0.8 solid ${BRAND.border}`, marginBottom: 12 },
  ppFact: { width: "50%", paddingVertical: 6, paddingRight: 10, borderBottom: `0.8 solid ${BRAND.border}` },
  ppFactLabel: { fontSize: 6.4, fontWeight: 700, color: BRAND.s400, letterSpacing: 0.9, lineHeight: 1.3 },
  ppFactValue: { fontSize: 9, color: BRAND.slate, fontWeight: 500, marginTop: 2, lineHeight: 1.35 },
  ppPoc: { backgroundColor: BRAND.mist, borderLeft: `3 solid ${BRAND.emerald}`, borderRadius: 6, padding: 10, marginBottom: 12 },
  ppPocName: { fontSize: 10, fontWeight: 700, color: BRAND.slate, marginTop: 3, lineHeight: 1.3 },
  ppPocLine: { fontSize: 8.5, color: BRAND.s600, marginTop: 2, lineHeight: 1.3 },
  totalRow: { flexDirection: "row", marginTop: 8, justifyContent: "flex-end" },
  totalBox: { backgroundColor: BRAND.mist, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 16, borderLeft: `3 solid ${BRAND.emerald}` },
  totalLabel: { fontSize: 7.5, color: BRAND.s500, letterSpacing: 1 },
  totalValue: { fontSize: 13, fontWeight: 700, color: BRAND.slate },

  // Rich-text media (inline images & tables from the editor)
  rtImg: { marginVertical: 8, alignSelf: "flex-start", objectFit: "contain" },
  rtTable: { marginVertical: 8, borderTop: `0.6 solid ${BRAND.s300}`, borderLeft: `0.6 solid ${BRAND.s300}` },
  rtTr: { flexDirection: "row" },
  rtTd: { flex: 1, fontSize: 8.5, padding: 5, color: BRAND.slate, borderRight: `0.6 solid ${BRAND.s300}`, borderBottom: `0.6 solid ${BRAND.s300}` },
  rtTh: { fontWeight: 700, backgroundColor: "#ECFDF5" },
});

// ── Minimal HTML → react-pdf renderer ────────────────────────────────────────
type Inline = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };

function collectInline(node: ChildNode, acc: Inline[], fmt: Omit<Inline, "text">) {
  if (node.nodeType === 3) {
    const text = node.textContent || "";
    if (text) acc.push({ text, ...fmt });
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();
  const next = { ...fmt };
  if (tag === "B" || tag === "STRONG") next.bold = true;
  if (tag === "I" || tag === "EM") next.italic = true;
  if (tag === "U") next.underline = true;
  if (tag === "BR") { acc.push({ text: "\n", ...fmt }); return; }
  el.childNodes.forEach((c) => collectInline(c, acc, next));
}

function inlineToText(nodes: Inline[], keyBase: string) {
  return nodes.map((n, i) => (
    <Text
      key={`${keyBase}-${i}`}
      style={{
        // Inter is registered without an italic face, so italic runs use Helvetica's oblique to
        // stay visibly italic instead of silently printing upright.
        fontFamily: n.italic ? "Helvetica" : "Inter",
        fontWeight: n.bold ? 700 : 400,
        fontStyle: n.italic ? "italic" : "normal",
        textDecoration: n.underline ? "underline" : "none",
      }}
    >
      {n.text}
    </Text>
  ));
}

/** Render an HTML string (from the rich-text editor) into react-pdf nodes. */
function RichText({ html, keyBase }: { html: string; keyBase: string }) {
  if (!html || !html.trim()) return null;
  // DOMParser is available in the browser, where the PDF is generated.
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const blocks: ReactNode[] = [];
  let k = 0;

  const renderImg = (el: HTMLElement) => {
    const src = el.getAttribute("src");
    if (!src) return;
    const w = Math.min(parseInt(el.getAttribute("width") || "", 10) || 300, PAGE.w - 2 * LETTERHEAD_PAGE.paddingHorizontal);
    blocks.push(<Image key={`${keyBase}-img-${k++}`} src={abs(src)} style={[styles.rtImg, { width: w }]} />);
  };
  const renderTable = (tbl: HTMLElement) => {
    const rows = Array.from(tbl.querySelectorAll("tr"));
    if (!rows.length) return;
    blocks.push(
      <View key={`${keyBase}-tbl-${k++}`} style={styles.rtTable} wrap={false}>
        {rows.map((tr, ri) => {
          const cells = Array.from(tr.children).filter((c) => /^(TD|TH)$/.test(c.tagName));
          const isHead = cells.some((c) => c.tagName === "TH");
          return (
            <View key={`${keyBase}-tr-${ri}`} style={styles.rtTr}>
              {cells.map((c, ci) => (
                <Text key={`${keyBase}-td-${ri}-${ci}`} style={isHead ? [styles.rtTd, styles.rtTh] : styles.rtTd}>{(c.textContent || "").trim()}</Text>
              ))}
            </View>
          );
        })}
      </View>,
    );
  };

  const renderBlock = (el: HTMLElement) => {
    const tag = el.tagName.toUpperCase();
    if (tag === "IMG") return renderImg(el);
    if (tag === "TABLE") return renderTable(el);
    if (tag === "UL" || tag === "OL") {
      Array.from(el.children).forEach((li, idx) => {
        const acc: Inline[] = [];
        li.childNodes.forEach((c) => collectInline(c, acc, {}));
        blocks.push(
          <View key={`${keyBase}-li-${k++}`} style={styles.listItem}>
            <Text style={styles.bullet}>{tag === "OL" ? `${idx + 1}.` : "•"}</Text>
            <Text style={styles.listText}>{inlineToText(acc, `${keyBase}-lit-${k}`)}</Text>
          </View>,
        );
      });
      return;
    }
    // A container that wraps images/tables (contentEditable often nests media in a <div>/<p>):
    // walk children in order, flushing inline text runs between media blocks so nothing is lost.
    if (el.querySelector && el.querySelector("img, table")) {
      let run: Inline[] = [];
      const flush = () => { if (run.length) { blocks.push(<Text key={`${keyBase}-b-${k++}`} style={styles.para}>{inlineToText(run, `${keyBase}-bt-${k}`)}</Text>); run = []; } };
      el.childNodes.forEach((c) => {
        if (c.nodeType === 1) {
          const ce = c as HTMLElement; const ct = ce.tagName.toUpperCase();
          if (ct === "IMG") { flush(); renderImg(ce); return; }
          if (ct === "TABLE") { flush(); renderTable(ce); return; }
          if (ct === "UL" || ct === "OL") { flush(); renderBlock(ce); return; }
        }
        collectInline(c, run, {});
      });
      flush();
      return;
    }
    const acc: Inline[] = [];
    el.childNodes.forEach((c) => collectInline(c, acc, {}));
    if (!acc.length) return;
    const style = tag === "H1" || tag === "H2" ? styles.h2 : tag === "H3" ? styles.h3 : styles.para;
    blocks.push(<Text key={`${keyBase}-b-${k++}`} style={style}>{inlineToText(acc, `${keyBase}-bt-${k}`)}</Text>);
  };

  Array.from(doc.body.childNodes).forEach((node) => {
    if (node.nodeType === 1) renderBlock(node as HTMLElement);
    else if (node.nodeType === 3 && node.textContent?.trim()) {
      blocks.push(<Text key={`${keyBase}-t-${k++}`} style={styles.para}>{node.textContent}</Text>);
    }
  });

  return <>{blocks}</>;
}

/**
 * One page (or run of pages) on the chosen letterhead: the brand band on top and the gradient rule
 * below, a custom logo row, or bare. The footer note carries the document and project; the page
 * number is stamped afterwards across the whole assembled file.
 */
function Sheet({ lh, label, note, children }: { lh: LhConfig; label: string; note: string; children?: ReactNode; key?: string }) {
  return (
    <Page size="LETTER" style={lh.mode === "brand" ? styles.page : styles.pagePlain} wrap>
      {lh.mode === "brand" && <LetterheadHeader />}
      {lh.mode === "custom" && (
        <View style={styles.customHeader} fixed>
          {lh.logo ? <Image src={lh.logo} style={styles.customLogo} /> : <Text style={{ fontWeight: 700, color: BRAND.slate }}>{COMPANY.name}</Text>}
          <Text style={styles.customLabel}>{label.toUpperCase()}</Text>
        </View>
      )}
      {children}
      {lh.mode !== "none" && <LetterheadFooter note={note} line={lh.mode === "brand"} />}
    </Page>
  );
}

const footNote = (label: string, project: ApiProject) => [label, project.name, project.id].filter(Boolean).join(" · ");

// ── Cover page data ──────────────────────────────────────────────────────────
const longDate = (s?: string) => {
  if (!s) return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

/** The data-restriction legend the client's sample covers carry (FAR 52.215-1(e) sheet legend). */
export const RESTRICTION_LEGEND = "Use or disclosure of data contained on this sheet is subject to the restriction on the title page of this proposal.";

/** Who the proposal is from when the cover does not say: GreenTech, or the joint venture. */
export const defaultSubmitter = (project: ApiProject) =>
  project.jointVenture?.enabled && project.jointVenture.partnerName
    // Step 8 - the JV's registered name when Project Identity has it.
    ? (project.jointVenture.legalName || "").trim() || `GreenTech USA - ${project.jointVenture.partnerName} JV`
    : COMPANY.name;

/**
 * The cover's data, whatever its style, in the order the client's samples read: the solicitation
 * answered, who it is for and where, the dates, who to address, and who submits it with their
 * contact details (GreenTech always; a JV partner's from Project Identity). Filled fields only.
 */
function coverData(kind: string, c: ProposalCover | undefined, project: ApiProject): CoverData {
  const title = c?.proposalTitle || project.name;
  const projectName = c?.projectName || project.name;
  const jv = project.jointVenture?.enabled ? project.jointVenture : undefined;
  const lines = (...xs: Array<string | undefined>) => xs.map((x) => (x || "").trim()).filter(Boolean).join("\n");
  const fields = ([
    [(c?.responseLabel || "Response to Solicitation #").toUpperCase(), c?.solicitationNo],
    ["PREPARED FOR", c?.clientName || project.clientInfo?.name || ""],
    ["LOCATION", c?.location],
    ["PROJECT", projectName !== title ? projectName : ""],
    ["TASK ORDER NO.", c?.taskOrderNo],
    ["CONTRACT NO.", c?.contractNo],
    ["SUBMITTAL DUE DATE", longDate(c?.dueDate)],
    ["DATE OF SUBMISSION", longDate(c?.submissionDate)],
    ["SUBMITTED TO", c?.submittedTo],
    ["ATTENTION", lines(c?.attentionTo, c?.attentionRole, c?.attentionEmail)],
    ["SUBMITTED BY", lines(c?.submittedBy || defaultSubmitter(project), COMPANY.address)],
    [COMPANY.name.toUpperCase(), lines(COMPANY.phone, COMPANY.email, COMPANY.website, `UEI ${COMPANY.uei} · CAGE ${COMPANY.cage}`)],
    [(jv?.partnerName || "").toUpperCase(), jv ? lines(jv.phone, jv.email, jv.partnerAddress) : ""],
    ["JV REGISTRATION", jv?.uei ? `UEI ${jv.uei}${jv.cage ? ` · CAGE ${jv.cage}` : ""}` : ""],
  ] as Array<[string, string | undefined]>)
    .filter(([l, v]) => !!l && !!v && v.trim())
    .map(([label, value]): CoverField => ({ label, value: value as string }));
  const images = (c?.images || []).map((im) => abs(im.url)).filter(Boolean).slice(0, 4);
  const dated = c?.submissionDate || c?.dueDate;
  return {
    kind,
    year: String(dated ? new Date(`${dated}T00:00:00`).getFullYear() || new Date().getFullYear() : new Date().getFullYear()),
    title,
    subtitle: c?.subtitle || "",
    fields,
    images: images.length ? images : [abs(COVER_FALLBACK)],
    volume: (c?.volumeLabel || "").trim() || undefined,
    badge: (c?.revisionLabel || "").trim() || undefined,
    clientLogo: c?.clientLogoUrl ? abs(c.clientLogoUrl) : undefined,
    notice: c?.restrictionNotice === false ? "" : RESTRICTION_LEGEND,
  };
}

/**
 * CR-P (93) - the transmittal letter, laid out as on the client's samples: Date / To / Subject,
 * "Dear ...", the paragraphs, the closing, then each signer with their signature (the company seal
 * beside the first), name, title, company, mobile and email. Empty header lines come from the cover.
 */
function CoverLetterPage({ coverLetter, cover, project, lh, label, note }: { coverLetter?: ProposalCoverLetter; cover?: ProposalCover; project: ApiProject; lh: LhConfig; label: string; note: string }) {
  if (!coverLetter?.enabled) return null;
  const L = resolveLetter(coverLetter, cover, project);
  const toLines = [L.toName, L.toTitle, L.toOffice, L.toAgency, L.toAddress].filter(Boolean);
  const company = cover?.submittedBy || defaultSubmitter(project);
  const seal = coverLetter.stampUrl;
  const head = (k: string, v: string, bold = false) => (
    <View style={styles.letterRow}>
      <Text style={styles.letterLabel}>{k}</Text>
      <Text style={[styles.letterValue, bold ? { fontWeight: 700, color: BRAND.slate } : {}]}>{v}</Text>
    </View>
  );
  return (
    <Sheet lh={lh} label={label} note={note}>
      {head("Date:", longDate(L.date))}
      {head("To:", (toLines.length ? toLines : ["Contracting Officer"]).join("\n"))}
      {head("Subject:", L.subject, true)}
      <Text style={[styles.para, { marginTop: 10, marginBottom: 10 }]}>{L.salutation}</Text>
      <RichText html={coverLetter.body} keyBase="cover-letter" />
      <View wrap={false} style={{ marginTop: 14 }}>
        <Text style={styles.para}>{L.closing}</Text>
        {coverLetter.signatories.length === 0 && !!seal && <Image src={abs(seal)} style={styles.sealImg} />}
        <View style={styles.sigRow}>
          {coverLetter.signatories.map((s, i) => (
            <View key={s.id || i} style={styles.sigBlock}>
              <View style={{ flexDirection: "row", alignItems: "center", minHeight: 48, marginBottom: 4 }}>
                {!!s.signatureUrl && <Image src={abs(s.signatureUrl)} style={styles.sigImg} />}
                {i === 0 && !!seal && <Image src={abs(seal)} style={[styles.sealImg, { marginLeft: 10 }]} />}
              </View>
              <Text style={styles.sigName}>{s.name || "-"}</Text>
              {!!s.title && <Text style={styles.sigTitle}>{s.title}</Text>}
              <Text style={styles.sigTitle}>{company}</Text>
              {!!s.phone && <Text style={styles.sigTitle}>Mobile: {s.phone}</Text>}
              {!!s.email && <Text style={styles.sigTitle}>Email: {s.email}</Text>}
            </View>
          ))}
        </View>
      </View>
    </Sheet>
  );
}

// A discount prints as -$5,000.00, not $-5,000.00.
const money = (n: number, currency: string) => `${n < 0 ? "-" : ""}${currency || "$"}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (s: string) => parseFloat(String(s).replace(/[^0-9.-]/g, "")) || 0;

// Closing / back-cover page, on dark like the hero cover. Marketing copy sits on a light card so
// the editor's dark text stays readable.
function BackCoverPage({ backCover }: { backCover?: ProposalBackCover }) {
  if (!backCover?.enabled) return null;
  const images = (backCover.images || []).slice(0, 4);
  const contact = ([["WEB", backCover.website], ["EMAIL", backCover.email], ["PHONE", backCover.phone], ["ADDRESS", backCover.address]] as Array<[string, string]>).filter(([, v]) => !!v?.trim());
  return (
    <Page size="LETTER" style={{ backgroundColor: BRAND.slate, fontFamily: "Inter", padding: 56, justifyContent: "space-between" }}>
      <View style={{ position: "absolute", top: 0, left: 0 }}><GradBar w={PAGE.w} h={8} r={0} id="backTop" /></View>
      <Image src={abs(LOGO_MINT)} style={{ width: 30 * (1588 / 295), height: 30 }} />
      <View>
        {!!backCover.tagline && <Text style={{ fontFamily: "Outfit", fontSize: 26, fontWeight: 700, color: BRAND.white, lineHeight: 1.15, marginBottom: 16 }}>{backCover.tagline}</Text>}
        {!!backCover.marketing?.trim() && (
          <View style={{ backgroundColor: BRAND.white, borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <RichText html={backCover.marketing} keyBase="back-mkt" />
          </View>
        )}
        {images.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {images.map((im, i) => <Image key={i} src={abs(im.url)} style={{ width: (PAGE.w - 112 - 18) / 4, height: 80, objectFit: "cover", borderRadius: 6, marginRight: i < images.length - 1 ? 6 : 0 }} />)}
          </View>
        )}
      </View>
      <View>
        <GradBar w={PAGE.w - 112} h={3} id="backRule" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 14 }}>
          {contact.map(([l, v]) => (
            <View key={l} style={{ width: "50%", marginBottom: 10, paddingRight: 12 }}>
              <Text style={{ fontSize: 6.6, fontWeight: 600, color: BRAND.s400, letterSpacing: 1.4 }}>{l}</Text>
              <Text style={{ fontSize: 9.5, fontWeight: 700, color: BRAND.white, marginTop: 3 }}>{v}</Text>
            </View>
          ))}
        </View>
        {!!backCover.social && <Text style={{ fontSize: 8, color: BRAND.s400, marginTop: 4 }}>{backCover.social}</Text>}
      </View>
    </Page>
  );
}

// ── Technical Proposal PDF ───────────────────────────────────────────────────
type SectionFile = { name: string; url: string };
/** The technical document as an ordered run of pages and uploaded files (see proposalParts). */
// `numbers`: the page prints page numbers of other sections (the Compliance Matrix), so its part is
// rendered again once they are known, like the contents.
type SeqItem = { page: ReactElement; numbers?: boolean } | { files: SectionFile[]; key?: string };
type TechArgs = {
  project: ApiProject; content: TechnicalProposalContent; cover?: ProposalCover; coverLetter?: ProposalCoverLetter; backCover?: ProposalBackCover;
  letterhead?: ProposalLetterhead; customLetterheadUrl?: string; logoUrl?: string; resumes?: ProposalTeamResume[];
  // Step 7 - the same sequence builds the financial volume (its sections, our price table, appendices).
  volume?: "technical" | "financial";
  financial?: FinancialProposalContent;
  requirements?: ProposalRequirement[];   // step 9 - printed by the Compliance Matrix section
} & PageCtx;

/** The financial volume in the section engine's shape: sections, layout, numbering (letters by default). */
const financialAsContent = (f: FinancialProposalContent): TechnicalProposalContent => ({
  coverTitle: "", coverSubtitle: "", refNo: "", date: "", description: "", employees: [], similarProjects: [], timeline: [],
  sections: f.sections || [], layout: f.layout, numbering: f.numbering || "letters", levelName: f.levelName,
  appendixNumbering: f.appendixNumbering || "letters", printResumes: false,
});

/**
 * Our own price tables (the financial volume's built-in "Price Schedule" section). Step 7b: every
 * number is calculated (lib/pricing), so the PDF can never carry an arithmetic error.
 */
function PricingBlock({ content }: { content: FinancialProposalContent }) {
  const currency = content.currency || "$";
  const tables = resolveFinancialTables(content).filter((tb) => tb.rows.length > 0);
  const calcs = tables.map((tb) => tableCalc(tb));
  const grand = calcs.reduce((s, c) => s + c.grand, 0);
  const colFlex = (kind: string) => (kind === "text" ? 2.5 : kind === "amount" ? 1.3 : kind === "rate" ? 1.2 : 0.8);
  const right = (kind: string) => kind === "amount" || kind === "rate";
  // A right-aligned label and amount under the columns (subtotals, adjustment lines).
  const line = (key: string, label: string, value: string, strong = false) => (
    <View key={key} style={[styles.tRow, { justifyContent: "flex-end" }]} wrap={false}>
      <Text style={[styles.td, { flex: 1, textAlign: "right", color: strong ? BRAND.slate : BRAND.s600, fontWeight: strong ? 700 : 400 }]}>{label}</Text>
      <Text style={[styles.td, { width: 110, textAlign: "right", fontWeight: 700 }]}>{value}</Text>
    </View>
  );
  return (
    <View>
      {tables.map((tb, ti) => {
        const calc = calcs[ti];
        const nOpt = calc.periods.length - 1;
        return (
          <View key={tb.id} style={{ marginBottom: 16 }}>
            {!!tb.title && <Subhead>{tb.title.toUpperCase()}</Subhead>}
            <View style={styles.tHead} wrap={false} minPresenceAhead={30}>
              {tb.columns.map((c) => (
                <Text key={c.id} style={[styles.th, { flex: colFlex(c.kind), textAlign: right(c.kind) ? "right" : "left" }]}>{(c.label || "").toUpperCase()}</Text>
              ))}
            </View>
            {tb.rows.map((r, ri) => {
              if (r.type === "group") return (
                <View key={r.id} style={styles.staffBand} wrap={false} minPresenceAhead={24}>
                  <Text style={styles.staffBandText}>{(r.label || "Phase").toUpperCase()}</Text>
                </View>
              );
              const next = tb.rows[ri + 1];
              const g = calc.groups.find((x) => x.rows.some((y) => y.id === r.id));
              const closes = !!g?.label && (!next || next.type === "group");
              return [
                <View key={r.id} style={[styles.tRow, ri % 2 === 1 ? styles.tRowAlt : {}]} wrap={false}>
                  {tb.columns.map((c) => (
                    <Text key={c.id} style={[styles.td, { flex: colFlex(c.kind), textAlign: right(c.kind) ? "right" : "left" }]}>
                      {c.kind === "amount" ? money(calc.amountOf(r), currency)
                        : c.kind === "rate" && r.cells[c.id] ? money(num(r.cells[c.id]), currency)
                        : (r.cells[c.id] || "")}
                    </Text>
                  ))}
                </View>,
                closes ? line(`${r.id}-subtotal`, `Subtotal, ${g!.label}`, money(g!.subtotal, currency), true) : null,
              ];
            })}
            {calc.adjustments.length > 0 && [
              line(`${tb.id}-lines`, "Total of the lines", money(calc.items, currency), true),
              ...calc.adjustments.map((a, k) => line(a.id, adjustmentLabel(tb.adjustments![k]), money(a.amount, currency))),
            ]}
            {nOpt > 0 && (
              <View style={{ marginTop: 8 }} wrap={false}>
                <View style={styles.tHead}>
                  <Text style={[styles.th, { flex: 2 }]}>PERIOD</Text>
                  <Text style={[styles.th, { flex: 1.2, textAlign: "right" }]}>ESCALATION (CUMULATIVE)</Text>
                  <Text style={[styles.th, { flex: 1.3, textAlign: "right" }]}>PRICE</Text>
                </View>
                {calc.periods.map((p, k) => (
                  <View key={p.label} style={[styles.tRow, k % 2 === 1 ? styles.tRowAlt : {}]}>
                    <Text style={[styles.td, { flex: 2, fontWeight: 700 }]}>{p.label}</Text>
                    <Text style={[styles.td, { flex: 1.2, textAlign: "right" }]}>{k === 0 ? "-" : `+${((p.factor - 1) * 100).toFixed(2)}%`}</Text>
                    <Text style={[styles.td, { flex: 1.3, textAlign: "right", fontWeight: 700 }]}>{money(p.total, currency)}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.totalRow} wrap={false}>
              <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>
                  {`${tb.title ? `${tb.title.toUpperCase()} ` : ""}TOTAL${nOpt > 0 ? `, BASE + ${nOpt} OPTION YEAR${nOpt === 1 ? "" : "S"}` : ""}`}
                </Text>
                <Text style={styles.totalValue}>{money(calc.grand, currency)}</Text>
              </View>
            </View>
          </View>
        );
      })}
      {tables.length > 1 && (
        <View style={styles.totalRow} wrap={false}>
          <View style={[styles.totalBox, { backgroundColor: BRAND.slate }]}>
            <Text style={[styles.totalLabel, { color: BRAND.s300 }]}>GRAND TOTAL</Text>
            <Text style={[styles.totalValue, { color: BRAND.white }]}>{money(grand, currency)}</Text>
          </View>
        </View>
      )}
      {htmlHasContent(content.notes || "") && (
        <>
          <Subhead>NOTES AND TERMS</Subhead>
          <RichText html={content.notes} keyBase="fin-notes" />
        </>
      )}
    </View>
  );
}
/** Does editor HTML hold anything printable (text, an image or a table)? */
const htmlHasContent = (h: string) => !!h.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() || /<(img|table)\b/i.test(h);
/** A section's subsections that have a title or text (empty ones are skipped in print). */
const printableSubs = (s?: { subsections?: Array<{ id: string; heading: string; body: string }> }) =>
  (s?.subsections || []).filter((x) => x.heading.trim() || htmlHasContent(x.body));

/** "1.1  Subsection title", the second heading level inside a section. */
function SubHeading({ label, title }: { label?: string; title: string }) {
  return (
    <View minPresenceAhead={40} style={{ flexDirection: "row", alignItems: "baseline", marginTop: 12, marginBottom: 5 }}>
      {!!label && <Text style={{ fontSize: 10, fontWeight: 700, color: BRAND.emerald, marginRight: 6 }}>{label}</Text>}
      <Text style={{ fontSize: 10, fontWeight: 700, color: BRAND.slate, flex: 1 }}>{title}</Text>
    </View>
  );
}

// ── Step 6: our projects as past performance / relevant experience / references ──────────────

const shownValue = (e: ProposalSimilarProject) => (e.showValue !== false && e.value?.trim() ? e.value.trim() : "");
const statusColor = (s?: string) => (s === "Completed" ? "#047857" : "#1D4ED8");

/** Item 100 - the summary table that opens the section; the data sheets follow. */
function ProjectSummaryTable({ items }: { items: ProposalSimilarProject[] }) {
  const withValue = items.some((e) => !!shownValue(e));
  const cols: Array<[string, number]> = withValue
    // Contract numbers and values are single long words, so their columns get the room.
    ? [["NO.", 4], ["PROJECT", 24], ["CLIENT", 17], ["LOCATION", 12], ["CONTRACT NO.", 16], ["PERIOD", 14], ["VALUE", 13]]
    : [["NO.", 4], ["PROJECT", 29], ["CLIENT", 20], ["LOCATION", 14], ["CONTRACT NO.", 18], ["PERIOD", 15]];
  const w = (k: number) => `${cols[k][1]}%`;
  return (
    <View style={{ marginBottom: 6 }}>
      <View style={styles.tHead} wrap={false}>
        {cols.map(([l], k) => <Text key={l} style={[styles.th, styles.ppTh, { width: w(k) }, l === "VALUE" ? { textAlign: "right" } : {}]}>{l}</Text>)}
      </View>
      {items.map((e, i) => (
        <View key={e.id} style={[styles.tRow, i % 2 === 1 ? styles.tRowAlt : {}]} wrap={false}>
          <Text style={[styles.td, styles.ppTd, { width: w(0) }]}>{i + 1}</Text>
          <Text style={[styles.td, styles.ppTd, { width: w(1), fontWeight: 700 }]}>{e.name || "-"}</Text>
          <Text style={[styles.td, styles.ppTd, { width: w(2) }]}>{e.client || "-"}</Text>
          <Text style={[styles.td, styles.ppTd, { width: w(3) }]}>{e.location || "-"}</Text>
          <Text style={[styles.td, styles.ppTd, { width: w(4) }]}>{e.contractNo || "-"}</Text>
          <View style={[styles.td, styles.ppTd, { width: w(5) }]}>
            <Text>{periodOf(e) || "-"}</Text>
            {!!e.status && <Text style={{ fontSize: 6.6, fontWeight: 700, color: statusColor(e.status), marginTop: 1 }}>{e.status.toUpperCase()}</Text>}
          </View>
          {withValue && <Text style={[styles.td, styles.ppTd, { width: w(6), textAlign: "right", fontWeight: 700, color: BRAND.emerald }]}>{shownValue(e) || "-"}</Text>}
        </View>
      ))}
    </View>
  );
}

/** Spec 23 - Project References: one concise table with the point of contact. */
function ProjectReferencesTable({ items }: { items: ProposalSimilarProject[] }) {
  const cols: Array<[string, number]> = [["PROJECT", 17], ["AGENCY / CLIENT", 14], ["CONTRACT NO.", 15], ["VALUE", 11], ["DATES", 11], ["POINT OF CONTACT", 20], ["LOCATION", 12]];
  const w = (k: number) => `${cols[k][1]}%`;
  return (
    <View style={{ marginBottom: 6 }}>
      <View style={styles.tHead} wrap={false}>
        {cols.map(([l], k) => <Text key={l} style={[styles.th, styles.ppTh, { width: w(k) }]}>{l}</Text>)}
      </View>
      {items.map((e, i) => (
        <View key={e.id} style={[styles.tRow, i % 2 === 1 ? styles.tRowAlt : {}]} wrap={false}>
          <Text style={[styles.td, styles.ppTd, { width: w(0), fontWeight: 700 }]}>{e.name || "-"}</Text>
          <Text style={[styles.td, styles.ppTd, { width: w(1) }]}>{e.client || "-"}</Text>
          <Text style={[styles.td, styles.ppTd, { width: w(2) }]}>{e.contractNo || "-"}</Text>
          <Text style={[styles.td, styles.ppTd, { width: w(3) }]}>{shownValue(e) || "-"}</Text>
          <Text style={[styles.td, styles.ppTd, { width: w(4) }]}>{periodOf(e) || "-"}</Text>
          <View style={[styles.td, styles.ppTd, { width: w(5) }]}>
            <Text style={{ fontWeight: 700 }}>{e.poc || "-"}</Text>
            {!!e.pocEmail && <Text>{e.pocEmail}</Text>}
            {!!e.pocPhone && <Text>{e.pocPhone}</Text>}
          </View>
          <Text style={[styles.td, styles.ppTd, { width: w(6) }]}>{e.location || "-"}</Text>
        </View>
      ))}
    </View>
  );
}

/** Item 100 - one project's data sheet: the expanded page after the summary table. */
function ProjectDataSheet({ e, label }: { e: ProposalSimilarProject; label: string }) {
  const photo = e.showPhoto !== false && e.photo ? abs(e.photo) : "";
  const value = shownValue(e);
  const facts = ([
    ["CLIENT", e.client], ["LOCATION", e.location], ["CONTRACT NO.", e.contractNo], ["CONTRACT TYPE", e.contractType],
    ["WORK TYPE", e.workType], ["PERIOD OF PERFORMANCE", periodOf(e)], ["STATUS", e.status],
    ["CONTRACT VALUE", value], ["CPARS / EVALUATION", e.cpars === "Yes" ? "Yes, on file" : e.cpars],
  ] as Array<[string, string | undefined]>).filter(([, v]) => !!v?.trim());
  const paras = (e.summary || "").split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const ongoing = e.status === "Ongoing";
  return (
    <View>
      <Eyebrow>{label.toUpperCase()}</Eyebrow>
      <View style={styles.ppHead}>
        <Text style={styles.ppTitle}>{e.name || "Untitled project"}</Text>
        <View style={styles.ppSide}>
          {!!value && <Text style={styles.ppValue}>{value}</Text>}
          {!!e.status && (
            <View style={[styles.ppPill, ongoing ? styles.ppPillOngoing : {}]}>
              <Text style={[styles.ppPillText, ongoing ? styles.ppPillTextOngoing : {}]}>{e.status.toUpperCase()}</Text>
            </View>
          )}
        </View>
      </View>
      {!!photo && <Image src={photo} style={styles.ppPhoto} />}
      {facts.length > 0 && (
        <View style={styles.ppFacts}>
          {facts.map(([l, v]) => (
            <View key={l} style={styles.ppFact} wrap={false}>
              <Text style={styles.ppFactLabel}>{l}</Text>
              <Text style={styles.ppFactValue}>{v}</Text>
            </View>
          ))}
        </View>
      )}
      {(!!e.poc || !!e.pocEmail || !!e.pocPhone) && (
        <View style={styles.ppPoc} wrap={false}>
          <Text style={styles.ppFactLabel}>CLIENT POINT OF CONTACT</Text>
          {!!e.poc && <Text style={styles.ppPocName}>{e.poc}</Text>}
          {(!!e.pocEmail || !!e.pocPhone) && <Text style={styles.ppPocLine}>{[e.pocEmail, e.pocPhone].filter(Boolean).join("   ·   ")}</Text>}
        </View>
      )}
      {paras.length > 0 && (
        <>
          <Subhead>DESCRIPTION OF WORK</Subhead>
          {paras.map((p, k) => <Text key={k} style={styles.para}>{p}</Text>)}
        </>
      )}
    </View>
  );
}

function technicalSequence({ project, content, cover, coverLetter, backCover, letterhead, customLetterheadUrl, logoUrl, resumes = [], probe, pageOf, volume = "technical", financial, requirements = [] }: TechArgs): SeqItem[] {
  // An invisible page marker (see PageCtx): absolutely positioned, so it never moves the layout.
  const mark = (k: string) => (probe ? <Text style={styles.pageMark} render={({ pageNumber }) => { probe(k, pageNumber); return " "; }} /> : null);
  const fin = volume === "financial";
  const LABEL = fin ? "Financial Proposal" : "Technical Proposal";
  const note = footNote(LABEL, project);
  const lh = lhConfig(letterhead, customLetterheadUrl, logoUrl, cover?.jvLogoUrl);
  const fullLayout = fin && financial ? resolveFinancialLayout(financial) : resolveProposalLayout(content);

  // Item 97/98 - the key personnel with their resumes, key staff first, in the list's order.
  const staff = content.employees.map((e) => ({ e, r: resumes.find((x) => x.rowId === e.id) || resumes.find((x) => !x.rowId && x.name === e.name) }));
  const keyStaff = staff.filter(({ e }) => e.keyStaff !== false);
  const nonKeyStaff = staff.filter(({ e }) => e.keyStaff === false);
  const built = content.printResumes === false ? [] : [...keyStaff, ...nonKeyStaff].flatMap(({ e, r }) => (r ? [{ e, r }] : []));

  // Does a section have any content to render?
  const sectionFor = (refId?: string) => content.sections.find((s) => s.id === refId);
  const isOriginal = (m: ProposalSectionMeta) => m.pageType === "government" || m.pageType === "external";
  const resumeHost = built.length
    ? fullLayout.find((m) => !m.hidden && m.kind === "custom" && !isOriginal(m) && RESUME_SECTION_KEYS.has(m.libraryKey || "") && !!sectionFor(m.refId))
    : undefined;
  const hasContent = (m: ProposalSectionMeta) => {
    if (resumeHost && m.id === resumeHost.id) return true;
    switch (m.kind) {
      case "description": return !!content.description?.trim();
      case "personnel": return content.employees.length > 0;
      case "pastPerformance": return content.similarProjects.length > 0;
      case "timeline": return content.timeline.length > 0;
      case "pricing": return !!financial && (resolveFinancialTables(financial).some((tb) => tb.rows.length > 0) || htmlHasContent(financial.notes || ""));
      case "custom": {
        const s = sectionFor(m.refId);
        if (!s) return false;
        // Government forms and external documents print only their upload (and separator page).
        if (m.pageType === "government" || m.pageType === "external") return !!s.attachments?.length || !!m.divider;
        return !!(s.heading || s.body || s.attachments?.length || s.subsections?.length || s.projects?.length);
      }
      case "blank": return true;
      default: return false;
    }
  };
  const visible = fullLayout.filter((m) => !m.hidden && hasContent(m));

  // CR-P (95/103) - labels. Main sections run 1, 2, 3, or A, B, C when the proposal uses letters
  // (as the client's samples do: "Section A: Performance Schedule"). Appendices are numbered apart,
  // Appendix 1, 2, 3. Blank pages get no label.
  // Spec 1 - numbering can be off, and a top-level section can be called a Tab, Factor, Volume or
  // Part ("Tab A", "Factor 2") instead of a Section.
  const numbering = content.numbering || "numbers";
  const word = content.levelName || "Section";
  const letterOf = (n: number) => { let s = ""; for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s; return s; };
  // `sub` is the base for subsection numbers: 1.1 / A.1, and appendix 2 gives 2.1.
  const labelById = new Map<string, { short: string; heading: string; divider: string; toc: string; sub: string }>();
  let mainN = 0, appxN = 0;
  for (const m of visible) {
    if (m.kind === "blank") continue;
    if (m.appendix) {
      const n = ++appxN;
      // Item 108 - appendices can run A, B, C, D (the financial volume's default).
      const a = content.appendixNumbering === "letters" ? letterOf(n) : String(n);
      labelById.set(m.id, { short: a, heading: `APPENDIX ${a}:`, divider: `Appendix ${a}`, toc: a, sub: a });
    } else {
      const n = ++mainN;
      const short = numbering === "letters" ? letterOf(n) : numbering === "numbers" ? String(n).padStart(2, "0") : "";
      labelById.set(m.id, {
        short,
        heading: short ? `${short}.` : "",
        divider: short ? `${word} ${short}` : "",
        toc: short ? (word === "Section" ? short : `${word} ${short}`) : "",
        sub: numbering === "letters" ? letterOf(n) : numbering === "numbers" ? String(n) : "",
      });
    }
  }
  // Width of the contents' label column: none when numbering is off, wider for "Tab A" style labels.
  const tocW = numbering === "none" ? 0 : word === "Section" ? 30 : 58;
  const tocMain = visible.filter((m) => m.kind !== "blank" && !m.appendix);
  const tocAppx = visible.filter((m) => m.kind !== "blank" && m.appendix);
  // Without a Resumes section in the layout, the resumes close the appendices.
  const resumeAppx = content.appendixNumbering === "letters" ? letterOf(appxN + 1) : String(appxN + 1);
  const trailingResumes = !resumeHost && built.length > 0;
  const resumesWhere = resumeHost
    ? (labelById.get(resumeHost.id)?.divider ? `${labelById.get(resumeHost.id)!.divider}, ${resumeHost.title}` : resumeHost.title)
    : `Appendix ${resumeAppx}, Key Personnel Resumes`;

  // Effective per-section letterhead, then group consecutive same-letterhead sections onto shared pages.
  const eff = (m: ProposalSectionMeta): ProposalLetterhead => (m.letterhead && m.letterhead !== "inherit" ? m.letterhead : (letterhead || "gt"));
  type Grp = { t: "divider"; m: ProposalSectionMeta; lh: ProposalLetterhead } | { t: "blank" } | { t: "content"; lh: ProposalLetterhead; items: ProposalSectionMeta[] } | { t: "files"; files: SectionFile[]; key: string }
    | { t: "resumes"; m: ProposalSectionMeta; lh: ProposalLetterhead; headed: boolean }
    | { t: "sheets"; m: ProposalSectionMeta; lh: ProposalLetterhead; items: ProposalSimilarProject[] };
  const groups: Grp[] = [];
  let curGrp: Extract<Grp, { t: "content" }> | null = null;
  for (const m of visible) {
    if (m.kind === "blank") { groups.push({ t: "blank" }); curGrp = null; continue; }
    const elh = eff(m);
    // CR-P (94) - a section's uploaded files (client forms, SAM printouts, certificates) print right
    // after it, as they are. A section holding only files prints as the client's samples do: a
    // divider page, then the documents, with no empty text page in between.
    const s = m.kind === "custom" ? sectionFor(m.refId) : undefined;
    const files = (s?.attachments || []).filter((f) => !!f.url);
    // Spec 4 - a Government form or external document prints only as uploaded, after a separator
    // page when one is switched on. A designed section holding only files gets a divider anyway.
    const original = isOriginal(m);
    const hasText = htmlHasContent(s?.body || "") || printableSubs(s).length > 0 || (s?.projects?.length ?? 0) > 0;
    const filesOnly = original || (m.kind === "custom" && files.length > 0 && !hasText);
    // The Resumes section: its own text (if any) first, then one resume per page.
    const isHost = !!resumeHost && m.id === resumeHost.id;
    if (m.divider || (filesOnly && !original && !isHost)) { groups.push({ t: "divider", m, lh: elh }); curGrp = null; }
    if (isHost) {
      if (hasText) groups.push({ t: "content", lh: elh, items: [m] });
      groups.push({ t: "resumes", m, lh: elh, headed: !hasText });
      curGrp = null;
    } else if (!filesOnly) {
      if (!curGrp || curGrp.lh !== elh || m.pageBreakBefore) {
        curGrp = { t: "content", lh: elh, items: [m] };
        groups.push(curGrp);
      } else {
        curGrp.items.push(m);
      }
    }
    // Step 6 - after the summary table, one data sheet per project (References are a table only).
    const projs = m.kind === "pastPerformance" ? content.similarProjects : (s?.projects || []);
    if (!original && !isHost && projs.length && !(m.kind === "custom" && referencesOnly(m.libraryKey))) {
      groups.push({ t: "sheets", m, lh: elh, items: projs });
      curGrp = null;
    }
    if (files.length) { groups.push({ t: "files", files, key: m.id }); curGrp = null; }
  }
  const hConf = (l: ProposalLetterhead) => lhConfig(l, customLetterheadUrl, logoUrl, cover?.jvLogoUrl);

  // Step 9 (spec 38) - the Compliance Matrix: each RFP requirement, the section that answers it and
  // the page it starts on (filled in on the second pass, like the contents).
  const finLayoutAll = financial ? resolveFinancialLayout(financial) : [];
  const statusLabel = (s: string) => REQUIREMENT_STATUSES.find((x) => x.v === s)?.label || s;
  const statusTone = (s: string) => (s === "compliant" ? "#047857" : s === "partial" ? "#B45309" : s === "not-addressed" ? "#B91C1C" : BRAND.s500);
  const matrixTable = () => {
    const cols: Array<[string, number]> = [["NO.", 5], ["RFP REQUIREMENT", 36], ["RFP REF.", 12], ["PROPOSAL SECTION", 25], ["PAGE", 8], ["STATUS", 14]];
    const w = (k: number) => `${cols[k][1]}%`;
    return (
      <View>
        <View style={styles.tHead} wrap={false} minPresenceAhead={30}>
          {cols.map(([l], k) => <Text key={l} style={[styles.th, styles.ppTh, { width: w(k) }]}>{l}</Text>)}
        </View>
        {requirements.map((r, i) => {
          const inThis = (r.volume || "technical") === volume;
          const sec = r.sectionId ? (inThis ? fullLayout : finLayoutAll).find((x) => x.id === r.sectionId) : undefined;
          const code = inThis && sec ? labelById.get(sec.id)?.toc || "" : "";
          const where = sec ? `${!inThis ? "Financial Proposal: " : ""}${code ? `${code} ` : ""}${sec.title}` : "-";
          const pg = inThis && r.sectionId ? pageOf?.[r.sectionId] : undefined;
          const st = requirementStatus(r);
          return (
            <View key={r.id} style={[styles.tRow, i % 2 === 1 ? styles.tRowAlt : {}]} wrap={false}>
              <Text style={[styles.td, styles.ppTd, { width: w(0) }]}>{i + 1}</Text>
              <Text style={[styles.td, styles.ppTd, { width: w(1) }]}>{r.label || "-"}</Text>
              <Text style={[styles.td, styles.ppTd, { width: w(2) }]}>{r.rfpRef || "-"}</Text>
              <Text style={[styles.td, styles.ppTd, { width: w(3) }]}>{where}</Text>
              <Text style={[styles.td, styles.ppTd, { width: w(4) }]}>{pg ? String(pg) : "-"}</Text>
              <Text style={[styles.td, styles.ppTd, { width: w(5), fontWeight: 700, color: statusTone(st) }]}>{statusLabel(st)}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderSection = (m: typeof visible[number]) => {
    const heading = <>{mark(m.id)}<SectionHeading label={labelById.get(m.id)?.heading || undefined} title={m.title} /></>;
    if (m.kind === "description") return (
      <View key={m.id}>{heading}<RichText html={content.description} keyBase="desc" /></View>
    );
    if (m.kind === "personnel") {
      // As on the technical sample: one table, Key Staff then Non-Key Staff. Blank cells fall back
      // to the person's resume, then to GreenTech for our own staff.
      const cols: Array<[string, string]> = [["NO.", "6%"], ["NAME", "22%"], ["POSITION", "24%"], ["CONTRACTOR / SUBCONTRACTOR", "20%"], ["NATIONALITY", "14%"], ["YEARS OF EXPERIENCE", "14%"]];
      let n = 0;
      const row = ({ e, r }: typeof staff[number]) => {
        n += 1;
        const res = r?.data.resume;
        const cells = [String(n), e.name || "-", e.role || res?.title || "-", e.firm || r?.firm || COMPANY.name, e.nationality || res?.citizenship || "-", e.years || res?.yearsOfExperience || "-"];
        return (
          <View key={e.id} style={[styles.tRow, n % 2 === 0 ? styles.tRowAlt : {}]} wrap={false}>
            {cells.map((c, k) => <Text key={k} style={[styles.td, { width: cols[k][1] }, k === 1 ? { fontWeight: 700 } : {}]}>{c}</Text>)}
          </View>
        );
      };
      const band = (label: string) => <View style={styles.staffBand} wrap={false}><Text style={styles.staffBandText}>{label}</Text></View>;
      const bands = nonKeyStaff.length > 0;
      return (
        <View key={m.id}>
          {heading}
          <View style={styles.tHead} wrap={false}>
            {cols.map(([l, w]) => <Text key={l} style={[styles.th, { width: w }]}>{l}</Text>)}
          </View>
          {bands && keyStaff.length > 0 && band("KEY STAFF")}
          {keyStaff.map(row)}
          {bands && band("NON-KEY STAFF")}
          {nonKeyStaff.map(row)}
          {built.length > 0 && <Text style={[styles.cardMeta, { marginTop: 6 }]}>Resumes of the proposed personnel: {resumesWhere}.</Text>}
        </View>
      );
    }
    if (m.kind === "pastPerformance") return (
      <View key={m.id}>
        {heading}
        <ProjectSummaryTable items={content.similarProjects} />
        <Text style={[styles.cardMeta, { marginTop: 2 }]}>A data sheet for each project follows.</Text>
      </View>
    );
    if (m.kind === "pricing") return (
      <View key={m.id}>{heading}{!!financial && <PricingBlock content={financial} />}</View>
    );
    if (m.kind === "timeline") return (
      <View key={m.id}>
        {heading}
        <View style={styles.tHead}>
          <Text style={[styles.th, { flex: 3 }]}>PHASE</Text>
          <Text style={[styles.th, { flex: 1 }]}>START</Text>
          <Text style={[styles.th, { flex: 1 }]}>END</Text>
        </View>
        {content.timeline.map((ph, i) => (
          <View key={i} style={[styles.tRow, i % 2 === 1 ? styles.tRowAlt : {}]} wrap={false}>
            <Text style={[styles.td, { flex: 3 }]}>{ph.phase || "-"}</Text>
            <Text style={[styles.td, { flex: 1 }]}>{ph.start || "-"}</Text>
            <Text style={[styles.td, { flex: 1 }]}>{ph.end || "-"}</Text>
          </View>
        ))}
      </View>
    );
    // A custom section may run over several pages (it used to be held on one, so long text
    // overflowed); the heading keeps room below it so it is never left alone at a page foot.
    const s = sectionFor(m.refId);
    if (m.libraryKey === "compliance-matrix") return (
      <View key={m.id}>
        {heading}
        <RichText html={s?.body || ""} keyBase={`sec-${m.id}`} />
        {requirements.length > 0 ? matrixTable() : <Text style={styles.cardMeta}>No RFP requirements listed yet (Proposal overview, RFP details and compliance).</Text>}
      </View>
    );
    const base = labelById.get(m.id)?.sub || "";
    return (
      <View key={m.id}>
        {heading}
        <RichText html={s?.body || ""} keyBase={`sec-${m.id}`} />
        {printableSubs(s).map((ss, k) => (
          <View key={ss.id}>
            {mark(ss.id)}
            <SubHeading label={base ? `${base}.${k + 1}` : undefined} title={ss.heading} />
            <RichText html={ss.body} keyBase={`sub-${ss.id}`} />
          </View>
        ))}
        {!!s?.projects?.length && (referencesOnly(m.libraryKey)
          ? <ProjectReferencesTable items={s.projects} />
          : <>
              <ProjectSummaryTable items={s.projects} />
              <Text style={[styles.cardMeta, { marginTop: 2 }]}>A data sheet for each project follows.</Text>
            </>)}
      </View>
    );
  };
  // Subsection rows under a section in the contents (designed sections only).
  const subRows = (m: ProposalSectionMeta, w: number) => {
    if (m.kind !== "custom" || m.pageType === "government" || m.pageType === "external") return [];
    const base = labelById.get(m.id)?.sub || "";
    return printableSubs(sectionFor(m.refId)).map((ss, k) => (
      <View key={ss.id} style={[styles.tocRow, styles.tocSubRow]}>
        {w > 0 && <Text style={[styles.tocNum, styles.tocSubNum, { width: w }]}>{base ? `${base}.${k + 1}` : ""}</Text>}
        <Text style={[styles.tocText, styles.tocSubText]}>{ss.heading || "Untitled"}</Text>
        <Text style={[styles.tocPage, styles.tocSubText]}>{pageOf?.[ss.id] ?? ""}</Text>
      </View>
    ));
  };

  const seq: SeqItem[] = [];
  const page = (el: ReactElement, numbers = false) => { seq.push({ page: el, numbers }); };

  // CR 195 - the transmittal letter is page 2 after the cover, or page 1 when chosen.
  const coverEl = <ProposalCoverPage variant={cover?.coverStyle} data={coverData(fin ? "FINANCIAL PROPOSAL" : "TECHNICAL PROPOSAL", cover, project)} />;
  const letterEl = coverLetter?.enabled ? <CoverLetterPage coverLetter={coverLetter} cover={cover} project={project} lh={lh} label={LABEL} note={note} /> : null;
  if (letterEl && coverLetter?.position === "before-cover") { page(letterEl); page(coverEl); }
  else { page(coverEl); if (letterEl) page(letterEl); }

  // Table of contents: main sections with their RFP reference, then the appendices.
  if (tocMain.length || tocAppx.length || trailingResumes) {
    // The page column has a fixed width, so filling in the numbers on the second pass moves nothing.
    const row = (key: string, num: string, title: string, ref: string | undefined, w: number) => (
      <View key={key} style={styles.tocRow}>
        {w > 0 && <Text style={[styles.tocNum, { width: w }]}>{num}</Text>}
        <Text style={styles.tocText}>{title}{ref?.trim() ? <Text style={styles.tocRef}>{`  (reference ${ref.trim()})`}</Text> : null}</Text>
        <Text style={styles.tocPage}>{pageOf?.[key] ?? ""}</Text>
      </View>
    );
    page(
      <Sheet lh={lh} label={LABEL} note={note}>
        <SectionHeading title="Table of Contents" />
        {tocMain.map((m) => [row(m.id, labelById.get(m.id)?.toc || "", m.title, m.rfpRef, tocW), ...subRows(m, tocW)])}
        {(tocAppx.length > 0 || trailingResumes) && <Subhead>APPENDICES</Subhead>}
        {tocAppx.map((m) => [row(m.id, labelById.get(m.id)?.toc || "", m.title, m.rfpRef, 30), ...subRows(m, 30)])}
        {trailingResumes && row("resumes", resumeAppx, "Key Personnel Resumes", undefined, 30)}
      </Sheet>,
    );
  }

  // Body: one page group per letterhead run, with divider / blank pages and uploaded files in place.
  groups.forEach((g, gi) => {
    if (g.t === "files") { seq.push({ files: g.files, key: g.key }); return; }
    if (g.t === "sheets") {
      // Item 100 - "Past Performance 1, 2, 3...": one page each, after the summary table.
      const label = sheetLabel(g.m.kind === "pastPerformance", g.m.libraryKey);
      g.items.forEach((e, i) => page(
        <Sheet lh={hConf(g.lh)} label={LABEL} note={note}>
          <ProjectDataSheet e={e} label={`${label} ${i + 1}`} />
        </Sheet>,
      ));
      return;
    }
    if (g.t === "resumes") {
      // One resume per page run; field 3 is the role in THIS proposal.
      built.forEach(({ e, r }, i) => page(
        <Sheet lh={hConf(g.lh)} label={LABEL} note={note}>
          {i === 0 && g.headed && <>{mark(g.m.id)}<SectionHeading label={labelById.get(g.m.id)?.heading || undefined} title={g.m.title} /></>}
          <ResumeBlock resume={r.data.resume} person={r.data.user} assignment={e.role} />
        </Sheet>,
      ));
      return;
    }
    if (g.t === "blank") { page(<Page size="LETTER" style={styles.page} />); return; }
    if (g.t === "divider") {
      // As on the client's samples: document, "Section A:", title, reference, then who and which RFP.
      const lbl = labelById.get(g.m.id);
      page(
        <Sheet lh={hConf(g.lh)} label={LABEL} note={note}>
          <View style={styles.dividerWrap}>
            {mark(g.m.id)}
            <Eyebrow>{LABEL.toUpperCase()}</Eyebrow>
            {!!lbl?.divider && <Text style={styles.dividerKicker}>{lbl.divider}:</Text>}
            <Text style={styles.dividerTitle}>{g.m.title}</Text>
            {!!g.m.rfpRef?.trim() && <Text style={styles.dividerRef}>Reference {g.m.rfpRef.trim()}</Text>}
            <GradBar w={120} h={4} r={2} id={`divider-${gi}`} />
            <View style={{ marginTop: 14 }}>
              <Text style={styles.dividerMeta}>{cover?.submittedBy || defaultSubmitter(project)}</Text>
              {!!cover?.solicitationNo && <Text style={styles.dividerMeta}>{cover.solicitationNo}</Text>}
            </View>
          </View>
        </Sheet>,
      );
      return;
    }
    page(
      <Sheet lh={hConf(g.lh)} label={LABEL} note={note}>
        {g.items.map((m) => renderSection(m))}
      </Sheet>,
      g.items.some((m) => m.libraryKey === "compliance-matrix"),
    );
  });

  // No Resumes section in the layout: the resumes close the appendices, one per page run.
  if (trailingResumes) built.forEach(({ e, r }, i) => page(
    <Sheet lh={lh} label="Key Personnel Resumes" note={footNote("Key Personnel Resumes", project)}>
      {i === 0 && mark("resumes")}
      {i === 0 && <SectionHeading label={`APPENDIX ${resumeAppx}:`} title="Key Personnel Resumes" />}
      <ResumeBlock resume={r.data.resume} person={r.data.user} assignment={e.role} />
    </Sheet>,
  ));

  if (backCover?.enabled) page(<BackCoverPage backCover={backCover} />);
  return seq;
}

// Pages passed as createElement arguments, so they need no list keys.
const asDocument = (title: string, pages: ReactElement[]) => createElement(Document, { title, author: COMPANY.name }, ...pages);

/** Item 91 - the cover page on its own, for the cover's own preview. */
export function CoverOnlyDocument({ volume, cover, project }: { volume: "technical" | "financial"; cover?: ProposalCover; project: ApiProject }) {
  const kind = volume === "financial" ? "FINANCIAL PROPOSAL" : "TECHNICAL PROPOSAL";
  return asDocument(`${cover?.proposalTitle || project.name} - Cover`, [
    <ProposalCoverPage variant={cover?.coverStyle} data={coverData(kind, cover, project)} />,
  ]);
}

/** CR 195 - the opening pages (cover and transmittal letter, in the chosen order), for the letter's preview. */
export function OpeningPagesDocument({ volume, cover, coverLetter, project, letterhead, customLetterheadUrl, logoUrl }: {
  volume: "technical" | "financial"; cover?: ProposalCover; coverLetter: ProposalCoverLetter; project: ApiProject;
  letterhead?: ProposalLetterhead; customLetterheadUrl?: string; logoUrl?: string;
}) {
  const fin = volume === "financial";
  const LABEL = fin ? "Financial Proposal" : "Technical Proposal";
  const note = footNote(LABEL, project);
  const lh = lhConfig(letterhead, customLetterheadUrl, logoUrl, cover?.jvLogoUrl);
  const coverEl = <ProposalCoverPage variant={cover?.coverStyle} data={coverData(fin ? "FINANCIAL PROPOSAL" : "TECHNICAL PROPOSAL", cover, project)} />;
  const letterEl = <CoverLetterPage coverLetter={{ ...coverLetter, enabled: true }} cover={cover} project={project} lh={lh} label={LABEL} note={note} />;
  return asDocument(`${cover?.proposalTitle || project.name} - Transmittal letter`, coverLetter.position === "before-cover" ? [letterEl, coverEl] : [coverEl, letterEl]);
}

/** The technical proposal as one react-pdf document. Uploaded section files are not in it; the
 *  assembled download and preview include them (see proposalParts). */
function TechnicalPDF(props: TechArgs) {
  const pages = technicalSequence(props).flatMap((s) => ("page" in s ? [s.page] : []));
  return asDocument(`${props.cover?.proposalTitle || props.project.name} - Technical Proposal`, pages);
}

// ── Financial Proposal PDF ───────────────────────────────────────────────────
// Step 7 - the financial volume runs through the same section engine as the technical one: cover,
// letter, contents, the client's uploaded price form in place, our price table, appendices A to D.
function FinancialPDF(props: Omit<TechArgs, "content" | "volume" | "financial"> & { financial: FinancialProposalContent }) {
  const pages = technicalSequence({ ...props, content: financialAsContent(props.financial), volume: "financial", resumes: [] }).flatMap((s) => ("page" in s ? [s.page] : []));
  return asDocument(`${props.cover?.proposalTitle || props.project.name} - Financial Proposal`, pages);
}

export default function ProposalPDF({
  kind,
  project,
  cover,
  coverLetter,
  backCover,
  letterhead,
  customLetterheadUrl,
  technical,
  financial,
  logoUrl,
  resumes,
}: {
  kind: "technical" | "financial";
  project: ApiProject;
  cover?: ProposalCover;
  coverLetter?: ProposalCoverLetter;
  backCover?: ProposalBackCover;
  letterhead?: ProposalLetterhead;
  customLetterheadUrl?: string;
  technical: TechnicalProposalContent;
  financial: FinancialProposalContent;
  logoUrl?: string;
  resumes?: ProposalTeamResume[];
}) {
  return kind === "technical"
    ? <TechnicalPDF project={project} content={technical} cover={cover} coverLetter={coverLetter} backCover={backCover} letterhead={letterhead} customLetterheadUrl={customLetterheadUrl} logoUrl={logoUrl} resumes={resumes} />
    : <FinancialPDF project={project} financial={financial} cover={cover} coverLetter={coverLetter} backCover={backCover} letterhead={letterhead} customLetterheadUrl={customLetterheadUrl} logoUrl={logoUrl} />;
}

export interface ProposalPdfProps {
  kind: "technical" | "financial";
  project: ApiProject;
  cover?: ProposalCover;
  coverLetter?: ProposalCoverLetter;
  backCover?: ProposalBackCover;
  letterhead?: ProposalLetterhead;
  customLetterheadUrl?: string;
  technical: TechnicalProposalContent;
  financial: FinancialProposalContent;
  logoUrl?: string;
  resumes?: ProposalTeamResume[];
  requirements?: ProposalRequirement[];   // step 9 - the Compliance Matrix
}

/**
 * CR-P (94) - the proposal as parts for assembly: generated pages, split around each section's
 * uploaded files so client forms land exactly where their section sits (lib/proposalExport).
 */
export function proposalParts(p: ProposalPdfProps, ctx: PageCtx = {}): ProposalPart[] {
  // Step 7 - both volumes: the financial one's uploaded client forms also print in place.
  const fin = p.kind === "financial";
  const title = `${p.cover?.proposalTitle || p.project.name} - ${fin ? "Financial" : "Technical"} Proposal`;
  const seq = technicalSequence({
    project: p.project, content: fin ? financialAsContent(p.financial) : p.technical, cover: p.cover, coverLetter: p.coverLetter,
    backCover: p.backCover, letterhead: p.letterhead, customLetterheadUrl: p.customLetterheadUrl, logoUrl: p.logoUrl,
    resumes: fin ? [] : p.resumes, probe: ctx.probe, pageOf: ctx.pageOf, volume: p.kind, financial: p.financial,
    requirements: p.requirements,
  });
  const parts: ProposalPart[] = [];
  let pages: ReactElement[] = [];
  let numbered = false;
  // The first run of pages holds the table of contents, so it is rebuilt with page numbers; so is any
  // run holding the Compliance Matrix.
  const flush = () => { if (pages.length) parts.push({ type: "doc", element: asDocument(title, pages), usesPageNumbers: parts.length === 0 || numbered }); pages = []; numbered = false; };
  for (const s of seq) {
    if ("page" in s) { pages.push(s.page); if (s.numbers) numbered = true; }
    else { flush(); parts.push({ type: "files", files: s.files, key: s.key }); }
  }
  flush();
  return parts;
}
