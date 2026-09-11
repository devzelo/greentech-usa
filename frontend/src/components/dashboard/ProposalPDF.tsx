import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ApiProject, TechnicalProposalContent, FinancialProposalContent, TeamResume, ProposalCover, ProposalCoverLetter, ProposalLetterhead, ProposalSectionMeta, ProposalBackCover } from "../../lib/api";
import { resolveProposalLayout, resolveFinancialTables } from "../../lib/api";
import { ResumeBlock } from "./ResumePDF";
import {
  BRAND, COMPANY, A4, abs, LETTERHEAD_PAGE, LOGO_MINT, COVER_FALLBACK, registerBrandFonts,
  LetterheadHeader, LetterheadFooter, SectionHeading, Subhead, Eyebrow, GradBar,
} from "../pdf/brand";
import ProposalCoverPage, { type CoverData, type CoverField } from "../pdf/ProposalCovers";
import { resolveLetter } from "../../lib/proposalLetter";

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

/** A proposal team member whose full resume gets appended as extra pages. */
export interface ProposalTeamResume {
  name: string;
  role: string;
  data: TeamResume;
}

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
    const w = Math.min(parseInt(el.getAttribute("width") || "", 10) || 300, A4.w - 2 * LETTERHEAD_PAGE.paddingHorizontal);
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
    <Page size="A4" style={lh.mode === "brand" ? styles.page : styles.pagePlain} wrap>
      {lh.mode === "brand" && <LetterheadHeader jvLogo={lh.jv} />}
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
  project.jointVenture?.enabled && project.jointVenture.partnerName ? `GreenTech USA - ${project.jointVenture.partnerName} JV` : COMPANY.name;

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
    jvLogo: c?.logoMode === "dual" ? c?.jvLogoUrl : "",
    volume: (c?.volumeLabel || "").trim().toUpperCase() || undefined,
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

const money = (n: number, currency: string) => `${currency || "$"}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (s: string) => parseFloat(String(s).replace(/[^0-9.-]/g, "")) || 0;

// Closing / back-cover page, on dark like the hero cover. Marketing copy sits on a light card so
// the editor's dark text stays readable.
function BackCoverPage({ backCover }: { backCover?: ProposalBackCover }) {
  if (!backCover?.enabled) return null;
  const images = (backCover.images || []).slice(0, 4);
  const contact = ([["WEB", backCover.website], ["EMAIL", backCover.email], ["PHONE", backCover.phone], ["ADDRESS", backCover.address]] as Array<[string, string]>).filter(([, v]) => !!v?.trim());
  return (
    <Page size="A4" style={{ backgroundColor: BRAND.slate, fontFamily: "Inter", padding: 56, justifyContent: "space-between" }}>
      <View style={{ position: "absolute", top: 0, left: 0 }}><GradBar w={A4.w} h={8} r={0} id="backTop" /></View>
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
            {images.map((im, i) => <Image key={i} src={abs(im.url)} style={{ width: (A4.w - 112 - 18) / 4, height: 80, objectFit: "cover", borderRadius: 6, marginRight: i < images.length - 1 ? 6 : 0 }} />)}
          </View>
        )}
      </View>
      <View>
        <GradBar w={A4.w - 112} h={3} id="backRule" />
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
function TechnicalPDF({ project, content, cover, coverLetter, backCover, letterhead, customLetterheadUrl, logoUrl, resumes = [] }: { project: ApiProject; content: TechnicalProposalContent; cover?: ProposalCover; coverLetter?: ProposalCoverLetter; backCover?: ProposalBackCover; letterhead?: ProposalLetterhead; customLetterheadUrl?: string; logoUrl?: string; resumes?: ProposalTeamResume[] }) {
  const LABEL = "Technical Proposal";
  const note = footNote(LABEL, project);
  const lh = lhConfig(letterhead, customLetterheadUrl, logoUrl, cover?.jvLogoUrl);

  // Does a section have any content to render?
  const sectionFor = (refId?: string) => content.sections.find((s) => s.id === refId);
  const hasContent = (m: { kind: string; refId?: string }) => {
    switch (m.kind) {
      case "description": return !!content.description?.trim();
      case "personnel": return content.employees.length > 0;
      case "pastPerformance": return content.similarProjects.length > 0;
      case "timeline": return content.timeline.length > 0;
      case "custom": { const s = sectionFor(m.refId); return !!s && !!(s.heading || s.body); }
      case "blank": return true;
      default: return false;
    }
  };
  const visible = resolveProposalLayout(content).filter((m) => !m.hidden && hasContent(m));

  // Number only real (non-blank) sections.
  const numById = new Map<string, number>();
  let nCounter = 0;
  for (const m of visible) if (m.kind !== "blank") numById.set(m.id, ++nCounter);
  const toc: Array<{ num?: number; title: string }> = [
    ...visible.filter((m) => m.kind !== "blank").map((m) => ({ num: numById.get(m.id), title: m.title })),
    ...(resumes.length > 0 ? [{ title: "Appendix: Team Resumes" }] : []),
  ];

  // Effective per-section letterhead, then group consecutive same-letterhead sections onto shared pages.
  const eff = (m: ProposalSectionMeta): ProposalLetterhead => (m.letterhead && m.letterhead !== "inherit" ? m.letterhead : (letterhead || "gt"));
  type Grp = { t: "divider"; m: ProposalSectionMeta; lh: ProposalLetterhead } | { t: "blank" } | { t: "content"; lh: ProposalLetterhead; items: ProposalSectionMeta[] };
  const groups: Grp[] = [];
  let curGrp: Extract<Grp, { t: "content" }> | null = null;
  for (const m of visible) {
    if (m.kind === "blank") { groups.push({ t: "blank" }); curGrp = null; continue; }
    const elh = eff(m);
    if (m.divider) { groups.push({ t: "divider", m, lh: elh }); curGrp = null; }
    if (!curGrp || curGrp.lh !== elh || m.pageBreakBefore) {
      curGrp = { t: "content", lh: elh, items: [m] };
      groups.push(curGrp);
    } else {
      curGrp.items.push(m);
    }
  }
  const hConf = (l: ProposalLetterhead) => lhConfig(l, customLetterheadUrl, logoUrl, cover?.jvLogoUrl);

  const renderSection = (m: typeof visible[number], n: number) => {
    const heading = <SectionHeading num={n} title={m.title} />;
    if (m.kind === "description") return (
      <View key={m.id}>{heading}<RichText html={content.description} keyBase="desc" /></View>
    );
    if (m.kind === "personnel") return (
      <View key={m.id}>
        {heading}
        {content.employees.map((e) => {
          const hasResume = resumes.some((r) => r.name === e.name);
          return (
            <View key={e.id} style={styles.card} wrap={false}>
              <Text style={styles.cardTitle}>{e.name || "-"}</Text>
              <Text style={styles.cardMeta}>{e.role || "-"}{hasResume ? "  ·  Full resume in Appendix: Team Resumes" : e.resumeName ? `  ·  Resume: ${e.resumeName}` : ""}</Text>
            </View>
          );
        })}
      </View>
    );
    if (m.kind === "pastPerformance") return (
      <View key={m.id}>
        {heading}
        {content.similarProjects.map((p) => (
          <View key={p.id} style={styles.card} wrap={false}>
            <Text style={styles.cardTitle}>{p.name || "-"}</Text>
            <Text style={styles.cardMeta}>{[p.client, p.year, p.value].filter(Boolean).join("  ·  ")}</Text>
            {!!p.summary && <Text style={[styles.para, { marginTop: 4 }]}>{p.summary}</Text>}
          </View>
        ))}
      </View>
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
    const s = sectionFor(m.refId);
    return (
      <View key={m.id} wrap={false}>
        {heading}
        <RichText html={s?.body || ""} keyBase={`sec-${m.id}`} />
      </View>
    );
  };

  return (
    <Document title={`${cover?.proposalTitle || project.name} - ${LABEL}`} author={COMPANY.name}>
      <ProposalCoverPage variant={cover?.coverStyle} data={coverData("TECHNICAL PROPOSAL", cover, project)} />

      <CoverLetterPage coverLetter={coverLetter} cover={cover} project={project} lh={lh} label={LABEL} note={note} />

      {toc.length > 0 && (
        <Sheet lh={lh} label={LABEL} note={note}>
          <SectionHeading title="Table of Contents" />
          {toc.map((t, i) => (
            <View key={i} style={styles.tocRow}>
              <Text style={styles.tocNum}>{t.num !== undefined ? String(t.num).padStart(2, "0") : "A"}</Text>
              <Text style={styles.tocText}>{t.title}</Text>
            </View>
          ))}
        </Sheet>
      )}

      {/* Body: one page group per letterhead run, with optional divider / blank pages */}
      {groups.map((g, gi) => {
        if (g.t === "blank") return <Page key={`g-${gi}`} size="A4" style={styles.page} />;
        if (g.t === "divider") {
          const n = numById.get(g.m.id) || 0;
          return (
            <Sheet key={`g-${gi}`} lh={hConf(g.lh)} label={LABEL} note={note}>
              <View style={styles.dividerWrap}>
                <Eyebrow>{`SECTION ${String(n).padStart(2, "0")}`}</Eyebrow>
                <Text style={styles.dividerTitle}>{g.m.title}</Text>
                <GradBar w={120} h={4} r={2} id={`divider-${gi}`} />
              </View>
            </Sheet>
          );
        }
        return (
          <Sheet key={`g-${gi}`} lh={hConf(g.lh)} label={LABEL} note={note}>
            {g.items.map((m) => renderSection(m, numById.get(m.id) || 0))}
          </Sheet>
        );
      })}

      {/* Appendix: full resume of each team member, one section per person */}
      {resumes.map((r, i) => (
        <Sheet key={`resume-${i}`} lh={lh} label="Team Resumes" note={footNote("Team Resumes", project)}>
          {i === 0 && <SectionHeading title="Appendix: Team Resumes" />}
          {!!r.role && <Text style={[styles.cardMeta, { marginBottom: 8 }]}>Proposed role: {r.role}</Text>}
          <ResumeBlock resume={r.data.resume} person={r.data.user} />
        </Sheet>
      ))}

      <BackCoverPage backCover={backCover} />
    </Document>
  );
}

// ── Financial Proposal PDF ───────────────────────────────────────────────────
function FinancialPDF({ project, content, cover, coverLetter, backCover, letterhead, customLetterheadUrl, logoUrl }: { project: ApiProject; content: FinancialProposalContent; cover?: ProposalCover; coverLetter?: ProposalCoverLetter; backCover?: ProposalBackCover; letterhead?: ProposalLetterhead; customLetterheadUrl?: string; logoUrl?: string }) {
  const LABEL = "Financial Proposal";
  const note = footNote(LABEL, project);
  const currency = content.currency || "$";
  const tables = resolveFinancialTables(content);
  const amtCols = (tb: typeof tables[number]) => tb.columns.filter((c) => c.kind === "amount").map((c) => c.id);
  const tblTotal = (tb: typeof tables[number]) => tb.rows.reduce((s, r) => s + amtCols(tb).reduce((a, cid) => a + num(r.cells[cid] || ""), 0), 0);
  const grand = tables.reduce((s, tb) => s + tblTotal(tb), 0);
  const colFlex = (kind: string) => (kind === "text" ? 2.5 : kind === "amount" ? 1.3 : 1);
  const lh = lhConfig(letterhead, customLetterheadUrl, logoUrl, cover?.jvLogoUrl);

  return (
    <Document title={`${cover?.proposalTitle || project.name} - ${LABEL}`} author={COMPANY.name}>
      <ProposalCoverPage variant={cover?.coverStyle} data={coverData("FINANCIAL PROPOSAL", cover, project)} />

      <CoverLetterPage coverLetter={coverLetter} cover={cover} project={project} lh={lh} label={LABEL} note={note} />

      <Sheet lh={lh} label={LABEL} note={note}>
        <View style={{ marginBottom: 12 }}>
          <Eyebrow>FINANCIAL PROPOSAL</Eyebrow>
          <Text style={styles.docTitle}>{cover?.proposalTitle || project.name}</Text>
          <Text style={[styles.cardMeta, { marginTop: 4 }]}>{project.name} · {project.id}{project.clientInfo?.name ? `  ·  Prepared for ${project.clientInfo.name}` : ""}</Text>
        </View>

        {tables.map((tb) => (
          <View key={tb.id} style={{ marginBottom: 16 }} wrap={false}>
            {!!tb.title && <Subhead>{tb.title.toUpperCase()}</Subhead>}
            <View style={styles.tHead}>
              {tb.columns.map((c) => (
                <Text key={c.id} style={[styles.th, { flex: colFlex(c.kind), textAlign: c.kind === "amount" ? "right" : "left" }]}>{(c.label || "").toUpperCase()}</Text>
              ))}
            </View>
            {tb.rows.map((r, ri) => (
              <View key={r.id} style={[styles.tRow, ri % 2 === 1 ? styles.tRowAlt : {}]}>
                {tb.columns.map((c) => (
                  <Text key={c.id} style={[styles.td, { flex: colFlex(c.kind), textAlign: c.kind === "amount" ? "right" : "left" }]}>
                    {c.kind === "amount" && r.cells[c.id] ? money(num(r.cells[c.id]), currency) : (r.cells[c.id] || "")}
                  </Text>
                ))}
              </View>
            ))}
            <View style={styles.totalRow}>
              <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>{tb.title ? `${tb.title.toUpperCase()} TOTAL` : "TOTAL"}</Text>
                <Text style={styles.totalValue}>{money(tblTotal(tb), currency)}</Text>
              </View>
            </View>
          </View>
        ))}

        {tables.length > 1 && (
          <View style={styles.totalRow}>
            <View style={[styles.totalBox, { backgroundColor: BRAND.slate }]}>
              <Text style={[styles.totalLabel, { color: BRAND.s300 }]}>GRAND TOTAL</Text>
              <Text style={[styles.totalValue, { color: BRAND.white }]}>{money(grand, currency)}</Text>
            </View>
          </View>
        )}

        {!!content.notes?.trim() && (
          <>
            <SectionHeading title="Notes" />
            <RichText html={content.notes} keyBase="fin-notes" />
          </>
        )}
      </Sheet>

      <BackCoverPage backCover={backCover} />
    </Document>
  );
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
    : <FinancialPDF project={project} content={financial} cover={cover} coverLetter={coverLetter} backCover={backCover} letterhead={letterhead} customLetterheadUrl={customLetterheadUrl} logoUrl={logoUrl} />;
}
