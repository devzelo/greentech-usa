import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ApiProject, TechnicalProposalContent, FinancialProposalContent, TeamResume, ProposalCover, ProposalCoverLetter, ProposalLetterhead, ProposalSectionMeta, ProposalBackCover } from "../../lib/api";
import { resolveProposalLayout, resolveFinancialTables } from "../../lib/api";
import { ResumeBlock } from "./ResumePDF";

// Resolve the proposal-wide letterhead into header inputs ({ logo, jv, hide }).
interface LhConfig { logo?: string; jv?: string; hide?: boolean }
function lhConfig(letterhead: ProposalLetterhead | undefined, customLetterheadUrl: string | undefined, logoUrl: string | undefined, coverJv: string | undefined): LhConfig {
  switch (letterhead) {
    case "none": return { hide: true };
    case "custom": return { logo: abs(customLetterheadUrl), jv: "" };
    case "jv": return { logo: logoUrl, jv: coverJv || "" };
    default: return { logo: logoUrl, jv: "" };
  }
}

// Stored proposal asset URLs are root-relative (/uploads/…) — react-pdf needs an absolute URL.
const abs = (url?: string) => (!url ? "" : url.startsWith("http") ? url : `${typeof window !== "undefined" ? window.location.origin : ""}${url}`);

/** A proposal team member whose full resume gets appended as extra pages. */
export interface ProposalTeamResume {
  name: string;
  role: string;
  data: TeamResume;
}

const PRIMARY = "#10B981";
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e7ebf0";
const SOFT = "#f8fafc";

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingHorizontal: 44, paddingBottom: 60, fontSize: 10, color: INK, fontFamily: "Helvetica", lineHeight: 1.5 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, marginBottom: 22, borderBottom: `2 solid ${PRIMARY}` },
  brandLogo: { width: 92, height: 47, objectFit: "contain" },
  headerRight: { alignItems: "flex-end", justifyContent: "center" },
  reportLabel: { fontSize: 8, color: MUTED, letterSpacing: 2 },
  reportDate: { fontSize: 9, color: INK, marginTop: 3 },

  // Cover
  cover: { marginTop: 120, alignItems: "center" },
  coverKicker: { fontSize: 10, color: PRIMARY, letterSpacing: 3, marginBottom: 18 },
  coverTitle: { fontSize: 30, fontWeight: 700, textAlign: "center", marginBottom: 14, lineHeight: 1.2 },
  coverSubtitle: { fontSize: 13, color: MUTED, textAlign: "center", marginBottom: 40 },
  coverMetaRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 6 },
  coverMeta: { fontSize: 10, color: INK },

  // Cover field grid + images + dual logos
  coverFields: { marginTop: 30, borderTop: `1 solid ${LINE}`, paddingTop: 16, width: "100%" },
  coverFieldRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  coverFieldLabel: { fontSize: 9, color: MUTED, letterSpacing: 0.5 },
  coverFieldValue: { fontSize: 10, color: INK, fontWeight: 700, textAlign: "right", flexShrink: 1, maxWidth: "60%" },
  coverImages: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 22, justifyContent: "center" },
  coverImg: { width: 150, height: 96, objectFit: "cover", borderRadius: 6 },
  logoPair: { flexDirection: "row", alignItems: "center", gap: 12 },
  jvLogo: { width: 78, height: 40, objectFit: "contain" },

  // Divider page
  dividerWrap: { marginTop: 220, alignItems: "center" },
  dividerBar: { width: 64, height: 4, backgroundColor: PRIMARY, borderRadius: 2, marginBottom: 18 },
  dividerTitle: { fontSize: 26, fontWeight: 700, textAlign: "center", color: INK },

  // Cover letter
  sigRow: { flexDirection: "row", flexWrap: "wrap", gap: 28, marginTop: 28 },
  sigBlock: { minWidth: 180 },
  sigImg: { height: 40, width: 120, objectFit: "contain", marginBottom: 4 },
  sigName: { fontSize: 11, fontWeight: 700 },
  sigTitle: { fontSize: 9, color: MUTED },

  // Sections
  sectionTitle: { fontSize: 14, fontWeight: 700, color: INK, marginBottom: 8, marginTop: 18, paddingBottom: 5, borderBottom: `1 solid ${LINE}` },
  para: { fontSize: 10, marginBottom: 6, color: "#1f2937" },
  h2: { fontSize: 12, fontWeight: 700, marginTop: 8, marginBottom: 4 },
  h3: { fontSize: 11, fontWeight: 700, marginTop: 6, marginBottom: 3 },
  listItem: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 14, fontSize: 10 },
  listText: { flex: 1, fontSize: 10 },

  // TOC
  tocRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottom: `1 solid ${LINE}` },
  tocText: { fontSize: 10 },

  // Employee / project cards
  card: { backgroundColor: SOFT, borderRadius: 6, padding: 10, marginBottom: 7, borderLeft: `3 solid ${PRIMARY}` },
  cardTitle: { fontSize: 11, fontWeight: 700 },
  cardMeta: { fontSize: 9, color: MUTED, marginTop: 2 },

  // Table
  tRow: { flexDirection: "row", borderBottom: `1 solid ${LINE}` },
  tHead: { flexDirection: "row", backgroundColor: INK, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  th: { color: "#fff", fontSize: 8, fontWeight: 700, padding: 6 },
  td: { fontSize: 9, padding: 6, color: "#1f2937" },
  totalRow: { flexDirection: "row", marginTop: 8, justifyContent: "flex-end" },
  totalBox: { backgroundColor: SOFT, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 16, borderLeft: `3 solid ${PRIMARY}` },
  totalLabel: { fontSize: 8, color: MUTED, letterSpacing: 1 },
  totalValue: { fontSize: 14, fontWeight: 700, color: INK },

  footer: { position: "absolute", bottom: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTop: `1 solid ${LINE}`, paddingTop: 8 },
  footerText: { fontSize: 8, color: MUTED },

  // Rich-text media (inline images & tables from the editor)
  rtImg: { marginVertical: 8, alignSelf: "flex-start", objectFit: "contain" },
  rtTable: { marginVertical: 8, borderTop: `1 solid ${LINE}`, borderLeft: `1 solid ${LINE}` },
  rtTr: { flexDirection: "row" },
  rtTd: { flex: 1, fontSize: 9, padding: 5, color: "#1f2937", borderRight: `1 solid ${LINE}`, borderBottom: `1 solid ${LINE}` },
  rtTh: { fontWeight: 700, backgroundColor: SOFT },
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
        fontFamily: "Helvetica",
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
    const w = Math.min(parseInt(el.getAttribute("width") || "", 10) || 300, 468);
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

function Header({ logoUrl, label, jvLogoUrl }: { logoUrl?: string; label: string; jvLogoUrl?: string }) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.logoPair}>
        {logoUrl ? <Image src={logoUrl} style={styles.brandLogo} /> : <Text style={{ fontWeight: 700 }}>GreenTech USA</Text>}
        {!!jvLogoUrl && <Image src={abs(jvLogoUrl)} style={styles.jvLogo} />}
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.reportLabel}>{label}</Text>
        <Text style={styles.reportDate}>{new Date().toISOString().slice(0, 10)}</Text>
      </View>
    </View>
  );
}

// Letterhead-aware header for content pages (returns nothing when letterhead = "none").
function PageHeader({ lh, label }: { lh: LhConfig; label: string }) {
  if (lh.hide) return null;
  return <Header logoUrl={lh.logo} jvLogoUrl={lh.jv} label={label} />;
}

// ── Shared cover page + cover letter (used by both documents) ─────────────────
function CoverPage({ cover, project, logoUrl, label }: { cover?: ProposalCover; project: ApiProject; logoUrl?: string; label: string }) {
  const c = cover;
  const title = c?.proposalTitle || project.name;
  const jv = c?.logoMode === "dual" ? c?.jvLogoUrl : "";
  const fields: Array<[string, string]> = c ? ([
    ["Project Name", c.projectName || project.name],
    ["Solicitation Number", c.solicitationNo],
    ["Task Order Number", c.taskOrderNo],
    ["Contract Number", c.contractNo],
    ["Client Name", c.clientName || project.clientInfo?.name || ""],
    ["Proposal Due Date", c.dueDate],
    ["Date of Submission", c.submissionDate],
    ["Submitted To", c.submittedTo],
    ["Attention To", c.attentionTo],
    ["Submitted By", c.submittedBy],
  ] as Array<[string, string]>).filter(([, v]) => !!v && v.trim()) : [];
  const images = (c?.images || []).slice(0, 4);

  return (
    <Page size="A4" style={styles.page}>
      <Header logoUrl={logoUrl} label={label} jvLogoUrl={jv} />
      <View style={styles.cover}>
        <Text style={styles.coverKicker}>{label}</Text>
        <Text style={styles.coverTitle}>{title}</Text>
        {images.length > 0 && (
          <View style={styles.coverImages}>
            {images.map((im, i) => <Image key={i} src={abs(im.url)} style={styles.coverImg} />)}
          </View>
        )}
        {fields.length > 0 && (
          <View style={styles.coverFields}>
            {fields.map(([k, v], i) => (
              <View key={i} style={styles.coverFieldRow}>
                <Text style={styles.coverFieldLabel}>{k}</Text>
                <Text style={styles.coverFieldValue}>{v}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <Footer project={project} />
    </Page>
  );
}

function CoverLetterPage({ coverLetter, project, lh, label }: { coverLetter?: ProposalCoverLetter; project: ApiProject; lh: LhConfig; label: string }) {
  if (!coverLetter?.enabled) return null;
  return (
    <Page size="A4" style={styles.page} wrap>
      <PageHeader lh={lh} label={label} />
      <Text style={styles.sectionTitle}>Cover Letter</Text>
      <RichText html={coverLetter.body} keyBase="cover-letter" />
      {(coverLetter.signatories.length > 0 || coverLetter.useEmailSignature) && (
        <View style={styles.sigRow}>
          {coverLetter.signatories.map((s, i) => (
            <View key={i} style={styles.sigBlock}>
              {!!s.signatureUrl && <Image src={abs(s.signatureUrl)} style={styles.sigImg} />}
              <Text style={styles.sigName}>{s.name || "—"}</Text>
              {!!s.title && <Text style={styles.sigTitle}>{s.title}</Text>}
            </View>
          ))}
        </View>
      )}
      {coverLetter.useEmailSignature && (
        <Text style={[styles.cardMeta, { marginTop: 16 }]}>GreenTech USA — Environmental Engineering &amp; General Contracting</Text>
      )}
      <Footer project={project} />
    </Page>
  );
}

// Page numbers are stamped continuously across the assembled document (incl. attachments)
// by assembleProposalPdf via pdf-lib, so the react-pdf footer only carries the project name.
function Footer({ project }: { project: ApiProject }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>{project.name} · {project.id}</Text>
      <Text style={styles.footerText}>GreenTech USA</Text>
    </View>
  );
}

const money = (n: number, currency: string) => `${currency || "$"}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (s: string) => parseFloat(String(s).replace(/[^0-9.-]/g, "")) || 0;

// Customizable closing / back-cover page (brochure-style).
function BackCoverPage({ backCover, project, logoUrl }: { backCover?: ProposalBackCover; project: ApiProject; logoUrl?: string }) {
  if (!backCover?.enabled) return null;
  const contact = [backCover.website, backCover.email, backCover.phone].filter(Boolean).join("   ·   ");
  const images = (backCover.images || []).slice(0, 4);
  return (
    <Page size="A4" style={styles.page}>
      <Header logoUrl={logoUrl} label="" />
      <View style={{ marginTop: 60, alignItems: "center" }}>
        <View style={styles.dividerBar} />
        {!!backCover.tagline && <Text style={[styles.coverTitle, { fontSize: 24 }]}>{backCover.tagline}</Text>}
        {!!backCover.marketing?.trim() && <View style={{ marginTop: 12, width: "100%" }}><RichText html={backCover.marketing} keyBase="back-mkt" /></View>}
        {images.length > 0 && (
          <View style={styles.coverImages}>
            {images.map((im, i) => <Image key={i} src={abs(im.url)} style={styles.coverImg} />)}
          </View>
        )}
        <View style={{ marginTop: 28, alignItems: "center" }}>
          {!!contact && <Text style={styles.coverMeta}>{contact}</Text>}
          {!!backCover.address && <Text style={[styles.coverMeta, { marginTop: 4 }]}>{backCover.address}</Text>}
          {!!backCover.social && <Text style={[styles.cardMeta, { marginTop: 4 }]}>{backCover.social}</Text>}
        </View>
      </View>
      <Footer project={project} />
    </Page>
  );
}

// ── Technical Proposal PDF ───────────────────────────────────────────────────
function TechnicalPDF({ project, content, cover, coverLetter, backCover, letterhead, customLetterheadUrl, logoUrl, resumes = [] }: { project: ApiProject; content: TechnicalProposalContent; cover?: ProposalCover; coverLetter?: ProposalCoverLetter; backCover?: ProposalBackCover; letterhead?: ProposalLetterhead; customLetterheadUrl?: string; logoUrl?: string; resumes?: ProposalTeamResume[] }) {
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
  const toc = [
    ...visible.filter((m) => m.kind !== "blank").map((m) => `${numById.get(m.id)}. ${m.title}`),
    ...(resumes.length > 0 ? ["Appendix — Team Resumes"] : []),
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
    const title = `${n}. ${m.title}`;
    if (m.kind === "description") return (
      <View key={m.id}><Text style={styles.sectionTitle}>{title}</Text><RichText html={content.description} keyBase="desc" /></View>
    );
    if (m.kind === "personnel") return (
      <View key={m.id}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {content.employees.map((e) => {
          const hasResume = resumes.some((r) => r.name === e.name);
          return (
            <View key={e.id} style={styles.card}>
              <Text style={styles.cardTitle}>{e.name || "—"}</Text>
              <Text style={styles.cardMeta}>{e.role || "—"}{hasResume ? "  ·  Full resume in Appendix — Team Resumes" : e.resumeName ? `  ·  Resume: ${e.resumeName}` : ""}</Text>
            </View>
          );
        })}
      </View>
    );
    if (m.kind === "pastPerformance") return (
      <View key={m.id}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {content.similarProjects.map((p) => (
          <View key={p.id} style={styles.card}>
            <Text style={styles.cardTitle}>{p.name || "—"}</Text>
            <Text style={styles.cardMeta}>{[p.client, p.year, p.value].filter(Boolean).join("  ·  ")}</Text>
            {!!p.summary && <Text style={[styles.para, { marginTop: 4 }]}>{p.summary}</Text>}
          </View>
        ))}
      </View>
    );
    if (m.kind === "timeline") return (
      <View key={m.id}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.tHead}>
          <Text style={[styles.th, { flex: 3 }]}>PHASE</Text>
          <Text style={[styles.th, { flex: 1 }]}>START</Text>
          <Text style={[styles.th, { flex: 1 }]}>END</Text>
        </View>
        {content.timeline.map((ph, i) => (
          <View key={i} style={styles.tRow}>
            <Text style={[styles.td, { flex: 3 }]}>{ph.phase || "—"}</Text>
            <Text style={[styles.td, { flex: 1 }]}>{ph.start || "—"}</Text>
            <Text style={[styles.td, { flex: 1 }]}>{ph.end || "—"}</Text>
          </View>
        ))}
      </View>
    );
    const s = sectionFor(m.refId);
    return (
      <View key={m.id} wrap={false}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <RichText html={s?.body || ""} keyBase={`sec-${m.id}`} />
      </View>
    );
  };

  return (
    <Document>
      {/* Cover */}
      <CoverPage cover={cover} project={project} logoUrl={logoUrl} label="TECHNICAL PROPOSAL" />

      {/* Cover letter */}
      <CoverLetterPage coverLetter={coverLetter} project={project} lh={lh} label="TECHNICAL PROPOSAL" />

      {/* Table of Contents */}
      {toc.length > 0 && (
        <Page size="A4" style={styles.page}>
          <PageHeader lh={lh} label="TECHNICAL PROPOSAL" />
          <Text style={styles.sectionTitle}>Table of Contents</Text>
          {toc.map((t, i) => (
            <View key={i} style={styles.tocRow}><Text style={styles.tocText}>{t}</Text></View>
          ))}
          <Footer project={project} />
        </Page>
      )}

      {/* Body — one page group per letterhead run, with optional divider / blank pages */}
      {groups.map((g, gi) => {
        if (g.t === "blank") {
          return <Page key={`g-${gi}`} size="A4" style={styles.page} />;
        }
        if (g.t === "divider") {
          const hc = hConf(g.lh);
          return (
            <Page key={`g-${gi}`} size="A4" style={styles.page}>
              {!hc.hide && <Header logoUrl={hc.logo} jvLogoUrl={hc.jv} label="TECHNICAL PROPOSAL" />}
              <View style={styles.dividerWrap}>
                <View style={styles.dividerBar} />
                <Text style={styles.dividerTitle}>{numById.get(g.m.id)}. {g.m.title}</Text>
              </View>
              <Footer project={project} />
            </Page>
          );
        }
        const hc = hConf(g.lh);
        return (
          <Page key={`g-${gi}`} size="A4" style={styles.page} wrap>
            {!hc.hide && <Header logoUrl={hc.logo} jvLogoUrl={hc.jv} label="TECHNICAL PROPOSAL" />}
            {g.items.map((m) => renderSection(m, numById.get(m.id) || 0))}
            <Footer project={project} />
          </Page>
        );
      })}

      {/* Appendix — full resume of each team member, one section per person */}
      {resumes.map((r, i) => (
        <Page key={`resume-${i}`} size="A4" style={styles.page} wrap>
          <PageHeader lh={lh} label="TEAM RESUMES" />
          {i === 0 && <Text style={styles.sectionTitle}>Appendix — Team Resumes</Text>}
          {!!r.role && <Text style={[styles.cardMeta, { marginBottom: 8 }]}>Proposed role: {r.role}</Text>}
          <ResumeBlock resume={r.data.resume} person={r.data.user} />
          <Footer project={project} />
        </Page>
      ))}

      {/* Back cover */}
      <BackCoverPage backCover={backCover} project={project} logoUrl={logoUrl} />
    </Document>
  );
}

// ── Financial Proposal PDF ───────────────────────────────────────────────────
function FinancialPDF({ project, content, cover, coverLetter, backCover, letterhead, customLetterheadUrl, logoUrl }: { project: ApiProject; content: FinancialProposalContent; cover?: ProposalCover; coverLetter?: ProposalCoverLetter; backCover?: ProposalBackCover; letterhead?: ProposalLetterhead; customLetterheadUrl?: string; logoUrl?: string }) {
  const currency = content.currency || "$";
  const tables = resolveFinancialTables(content);
  const amtCols = (tb: typeof tables[number]) => tb.columns.filter((c) => c.kind === "amount").map((c) => c.id);
  const tblTotal = (tb: typeof tables[number]) => tb.rows.reduce((s, r) => s + amtCols(tb).reduce((a, cid) => a + num(r.cells[cid] || ""), 0), 0);
  const grand = tables.reduce((s, tb) => s + tblTotal(tb), 0);
  const colFlex = (kind: string) => (kind === "text" ? 2.5 : kind === "amount" ? 1.3 : 1);
  const lh = lhConfig(letterhead, customLetterheadUrl, logoUrl, cover?.jvLogoUrl);

  return (
    <Document>
      {/* Cover */}
      <CoverPage cover={cover} project={project} logoUrl={logoUrl} label="FINANCIAL PROPOSAL" />

      {/* Cover letter / introduction */}
      <CoverLetterPage coverLetter={coverLetter} project={project} lh={lh} label="FINANCIAL PROPOSAL" />

      <Page size="A4" style={styles.page} wrap>
        <PageHeader lh={lh} label="FINANCIAL PROPOSAL" />

        <View style={{ marginBottom: 10 }}>
          <Text style={[styles.coverTitle, { fontSize: 20, textAlign: "left" }]}>Financial Proposal</Text>
          <Text style={styles.cardMeta}>{project.name} · {project.id}{project.clientInfo?.name ? `  ·  Prepared for ${project.clientInfo.name}` : ""}</Text>
        </View>

        {tables.map((tb) => (
          <View key={tb.id} style={{ marginBottom: 16 }} wrap={false}>
            {!!tb.title && <Text style={styles.h2}>{tb.title}</Text>}
            <View style={styles.tHead}>
              {tb.columns.map((c) => (
                <Text key={c.id} style={[styles.th, { flex: colFlex(c.kind), textAlign: c.kind === "amount" ? "right" : "left" }]}>{(c.label || "").toUpperCase()}</Text>
              ))}
            </View>
            {tb.rows.map((r) => (
              <View key={r.id} style={styles.tRow}>
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
            <View style={[styles.totalBox, { backgroundColor: INK }]}>
              <Text style={[styles.totalLabel, { color: "#cbd5e1" }]}>GRAND TOTAL</Text>
              <Text style={[styles.totalValue, { color: "#fff" }]}>{money(grand, currency)}</Text>
            </View>
          </View>
        )}

        {!!content.notes?.trim() && (
          <>
            <Text style={styles.sectionTitle}>Notes</Text>
            <RichText html={content.notes} keyBase="fin-notes" />
          </>
        )}

        <Footer project={project} />
      </Page>

      {/* Back cover */}
      <BackCoverPage backCover={backCover} project={project} logoUrl={logoUrl} />
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
