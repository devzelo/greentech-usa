import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ApiProject } from "../../lib/api";

const PRIMARY = "#10B981";
const INK = "#0f172a";
const MUTED = "#64748b";
const SUBTLE = "#94a3b8";
const LINE = "#e7ebf0";
const SOFT = "#f8fafc";

const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingHorizontal: 44,
    paddingBottom: 60,
    fontSize: 10,
    color: INK,
    fontFamily: "Helvetica",
    lineHeight: 1.45,
  },

  // ── Header (letterhead) ──
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 14,
    marginBottom: 22,
    borderBottom: `2 solid ${PRIMARY}`,
  },
  brandLogo: { width: 92, height: 47, objectFit: "contain" },
  headerRight: { alignItems: "flex-end", justifyContent: "center" },
  reportLabel: { fontSize: 8, color: MUTED, letterSpacing: 2, fontWeight: 700 },
  reportDate: { fontSize: 9, color: INK, marginTop: 3 },

  // ── Title block ──
  titleSection: { marginBottom: 20 },
  idChip: { fontSize: 8, color: PRIMARY, fontWeight: 700, letterSpacing: 1.5, marginBottom: 5 },
  projectName: { fontSize: 22, fontWeight: 700, color: INK, marginBottom: 10, lineHeight: 1.15 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusPill: {
    fontSize: 7.5,
    fontWeight: 700,
    color: "#ffffff",
    backgroundColor: PRIMARY,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    letterSpacing: 1,
    lineHeight: 1,
  },
  metaText: { fontSize: 9, color: MUTED },
  metaDot: { fontSize: 9, color: "#cbd5e1" },

  // ── KPI cards (uniform, vertically centered) ──
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  kpiCard: {
    flex: 1,
    backgroundColor: SOFT,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderLeft: `3 solid ${PRIMARY}`,
    minHeight: 56,
    justifyContent: "center",
  },
  kpiLabel: { fontSize: 7, color: MUTED, letterSpacing: 1.2, marginBottom: 5 },
  kpiValue: { fontSize: 13, fontWeight: 700, color: INK },

  // ── Completion bar ──
  completion: { marginBottom: 24 },
  completionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  completionLabel: { fontSize: 8, color: MUTED, letterSpacing: 1.2, fontWeight: 700 },
  completionPct: { fontSize: 10, color: PRIMARY, fontWeight: 700 },
  progressTrack: { height: 7, backgroundColor: "#e2e8f0", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 7, backgroundColor: PRIMARY, borderRadius: 4 },

  // ── Sections ──
  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 8.5,
    color: MUTED,
    letterSpacing: 1.5,
    fontWeight: 700,
    marginBottom: 9,
    paddingBottom: 5,
    borderBottom: `1 solid ${LINE}`,
  },
  body: { fontSize: 10, color: "#334155", lineHeight: 1.55 },

  // ── Two columns ──
  twoCol: { flexDirection: "row", gap: 22 },
  col: { flex: 1 },

  // ── Key/value rows ──
  kv: { flexDirection: "row", marginBottom: 6 },
  kvLabel: { width: 90, fontSize: 7.5, color: MUTED, letterSpacing: 0.8, paddingTop: 1.5 },
  kvValue: { flex: 1, fontSize: 9.5, color: INK, fontWeight: 700, lineHeight: 1.35 },

  // ── Table ──
  table: { borderRadius: 6, border: `1 solid ${LINE}`, overflow: "hidden" },
  trHead: { flexDirection: "row", backgroundColor: SOFT, borderBottom: `1 solid ${LINE}` },
  tr: { flexDirection: "row", borderBottom: `1 solid ${LINE}` },
  trAlt: { backgroundColor: "#fcfdfe" },
  th: { flex: 1, paddingVertical: 7, paddingHorizontal: 8, fontSize: 7.5, color: MUTED, letterSpacing: 1, fontWeight: 700 },
  td: { flex: 1, paddingVertical: 7, paddingHorizontal: 8, fontSize: 9, color: INK },

  // ── Footer ──
  footer: {
    position: "absolute",
    bottom: 28,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: SUBTLE,
    paddingTop: 8,
    borderTop: `1 solid ${LINE}`,
  },
  // Rich-text narrative (paragraphs, headings, lists, images, tables from the report notes editor)
  rtPara: { fontSize: 10, color: INK, marginBottom: 5, lineHeight: 1.45 },
  rtH2: { fontSize: 12, fontWeight: 700, color: INK, marginTop: 6, marginBottom: 4 },
  rtH3: { fontSize: 11, fontWeight: 700, color: INK, marginTop: 5, marginBottom: 3 },
  rtLi: { flexDirection: "row", marginBottom: 3, paddingLeft: 4 },
  rtBullet: { width: 14, fontSize: 10, color: MUTED },
  rtLiText: { flex: 1, fontSize: 10, color: INK },
  rtImg: { marginVertical: 6, alignSelf: "flex-start", objectFit: "contain" },
  rtTable: { marginVertical: 6, borderTop: `1 solid ${LINE}`, borderLeft: `1 solid ${LINE}` },
  rtTr: { flexDirection: "row" },
  rtTd: { flex: 1, fontSize: 9, padding: 5, color: INK, borderRight: `1 solid ${LINE}`, borderBottom: `1 solid ${LINE}` },
  rtTh: { fontWeight: 700, backgroundColor: SOFT },
});

function formatToday() {
  return new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// Compact HTML → react-pdf renderer for the report narrative (mirrors the proposal builder's,
// with image + table support). DOMParser is available in the browser where the PDF is generated.
function ReportRichText({ html }: { html: string }) {
  if (!html || !html.trim()) return null;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out: ReactNode[] = [];
  let k = 0;
  const textOf = (el: Element | ChildNode) => (el.textContent || "").trim();
  const renderImg = (el: HTMLElement) => {
    const src = el.getAttribute("src"); if (!src) return;
    const w = Math.min(parseInt(el.getAttribute("width") || "", 10) || 300, 468);
    out.push(<Image key={`i${k++}`} src={src.startsWith("http") || src.startsWith("data:") ? src : `${window.location.origin}${src}`} style={[styles.rtImg, { width: w }]} />);
  };
  const renderTable = (tbl: HTMLElement) => {
    const rows = Array.from(tbl.querySelectorAll("tr"));
    if (!rows.length) return;
    out.push(
      <View key={`t${k++}`} style={styles.rtTable} wrap={false}>
        {rows.map((tr, ri) => {
          const cells = Array.from(tr.children).filter((c) => /^(TD|TH)$/.test(c.tagName));
          const head = cells.some((c) => c.tagName === "TH");
          return <View key={ri} style={styles.rtTr}>{cells.map((c, ci) => <Text key={ci} style={head ? [styles.rtTd, styles.rtTh] : styles.rtTd}>{textOf(c)}</Text>)}</View>;
        })}
      </View>,
    );
  };
  const walk = (nodes: ChildNode[]) => {
    for (const node of nodes) {
      if (node.nodeType === 3) { const t = (node.textContent || "").trim(); if (t) out.push(<Text key={`x${k++}`} style={styles.rtPara}>{t}</Text>); continue; }
      if (node.nodeType !== 1) continue;
      const el = node as HTMLElement; const tag = el.tagName.toUpperCase();
      if (tag === "IMG") { renderImg(el); continue; }
      if (tag === "TABLE") { renderTable(el); continue; }
      if (tag === "UL" || tag === "OL") {
        Array.from(el.children).forEach((li, i) => { const t = textOf(li); if (t) out.push(<View key={`l${k++}`} style={styles.rtLi}><Text style={styles.rtBullet}>{tag === "OL" ? `${i + 1}.` : "•"}</Text><Text style={styles.rtLiText}>{t}</Text></View>); });
        continue;
      }
      if (/^H[1-6]$/.test(tag)) { const t = textOf(el); if (t) out.push(<Text key={`h${k++}`} style={tag === "H3" ? styles.rtH3 : styles.rtH2}>{t}</Text>); continue; }
      if (el.querySelector && el.querySelector("img, table, ul, ol")) { walk(Array.from(el.childNodes)); continue; }
      const t = textOf(el); if (t) out.push(<Text key={`p${k++}`} style={styles.rtPara}>{t}</Text>);
    }
  };
  walk(Array.from(doc.body.childNodes));
  return <>{out}</>;
}

interface Props {
  project: ApiProject;
  logoUrl?: string;
  /** Current income (total invoiced to the client) and expenses (total spent). */
  financials?: { income: number; expenses: number };
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProjectReportPDF({ project, logoUrl, financials }: Props) {
  const subs = project.subcontractors || [];
  const phases = project.timeline?.phases || [];
  const assigned = project.assignedEmployees || [];
  const progress = Math.max(0, Math.min(100, project.progress ?? 0));
  const nature = [...(project.projectNature?.selected || []), ...(project.projectNature?.custom || [])].join(", ");
  const income = financials?.income ?? 0;
  const expenses = financials?.expenses ?? 0;
  const profit = income - expenses;

  return (
    <Document title={`${project.name} — Project Report`} author="GreenTech USA">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header} fixed>
          {logoUrl ? <Image src={logoUrl} style={styles.brandLogo} /> : <Text style={{ fontSize: 14, fontWeight: 700 }}>GreenTech USA</Text>}
          <View style={styles.headerRight}>
            <Text style={styles.reportLabel}>PROJECT REPORT</Text>
            <Text style={styles.reportDate}>{formatToday()}</Text>
          </View>
        </View>

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.idChip}>{project.id || "—"}  ·  {(project.category || "Uncategorized").toUpperCase()}</Text>
          <Text style={styles.projectName}>{project.name}</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusPill}>{(project.status || "—").toUpperCase()}</Text>
            <Text style={styles.metaText}>{project.location || "Location not set"}</Text>
            <Text style={styles.metaDot}>•</Text>
            <Text style={styles.metaText}>Owner: {project.owner || "—"}</Text>
          </View>
        </View>

        {/* KPIs */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>START DATE</Text>
            <Text style={styles.kpiValue}>{project.startDate || "—"}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TARGET END</Text>
            <Text style={styles.kpiValue}>{project.endDate || "—"}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TEAM</Text>
            <Text style={styles.kpiValue}>{assigned.length} member{assigned.length === 1 ? "" : "s"}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>VISIBILITY</Text>
            <Text style={styles.kpiValue}>{project.published ? "Public" : "Internal"}</Text>
          </View>
        </View>

        {/* Completion */}
        <View style={styles.completion}>
          <View style={styles.completionHeader}>
            <Text style={styles.completionLabel}>OVERALL COMPLETION</Text>
            <Text style={styles.completionPct}>{progress}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>

        {/* Narrative / notes — rich text (tables & pictures) from the report notes editor */}
        {project.reportNotes && project.reportNotes.trim() && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>NOTES &amp; NARRATIVE</Text>
            <ReportRichText html={project.reportNotes} />
          </View>
        )}

        {/* Financial summary */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>FINANCIAL SUMMARY</Text>
          <View style={styles.kpiRow}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>PROJECT VALUE</Text>
              <Text style={styles.kpiValue}>{project.value || "—"}</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>CURRENT INCOME (INVOICED)</Text>
              <Text style={styles.kpiValue}>{money(income)}</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>CURRENT EXPENSES</Text>
              <Text style={styles.kpiValue}>{money(expenses)}</Text>
            </View>
            <View style={[styles.kpiCard, { borderLeft: `3 solid ${profit >= 0 ? PRIMARY : "#ef4444"}` }]}>
              <Text style={styles.kpiLabel}>CURRENT {profit >= 0 ? "PROFIT" : "LOSS"}</Text>
              <Text style={[styles.kpiValue, { color: profit >= 0 ? PRIMARY : "#ef4444" }]}>{money(profit)}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 2 }}>
            Income = total invoiced to the client (Invoice Sent). Expenses = total logged in the Expenses tab (qty x unit price), across all contributors.
          </Text>
        </View>

        {/* Executive summary */}
        {project.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>EXECUTIVE SUMMARY</Text>
            <Text style={styles.body}>{project.description}</Text>
          </View>
        ) : null}

        {/* Client + Fiscal */}
        <View style={[styles.section, styles.twoCol]}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>CLIENT INFORMATION</Text>
            <View style={styles.kv}><Text style={styles.kvLabel}>NAME</Text><Text style={styles.kvValue}>{project.clientInfo?.name || "—"}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>REFERENCE</Text><Text style={styles.kvValue}>{project.clientInfo?.reference || "—"}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>CONTACT</Text><Text style={styles.kvValue}>{project.clientInfo?.contactName || "—"}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>EMAIL</Text><Text style={styles.kvValue}>{project.clientInfo?.email || "—"}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>PHONE</Text><Text style={styles.kvValue}>{project.clientInfo?.phone || "—"}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>COUNTRY</Text><Text style={styles.kvValue}>{project.clientInfo?.country || "—"}</Text></View>
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>FISCAL & COMPLIANCE</Text>
            <View style={styles.kv}><Text style={styles.kvLabel}>FUNDING</Text><Text style={styles.kvValue}>{project.fiscal || "—"}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>COMPLIANCE</Text><Text style={styles.kvValue}>{project.compliance || "—"}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>NATURE</Text><Text style={styles.kvValue}>{nature || "—"}</Text></View>
            <View style={styles.kv}><Text style={styles.kvLabel}>DISCIPLINES</Text><Text style={styles.kvValue}>{project.disciplines?.join(", ") || "—"}</Text></View>
          </View>
        </View>

        {/* Timeline */}
        {phases.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>TIMELINE PHASES</Text>
            <View style={styles.table}>
              <View style={styles.trHead}>
                <Text style={[styles.th, { flex: 2 }]}>PHASE</Text>
                <Text style={styles.th}>START</Text>
                <Text style={styles.th}>END</Text>
              </View>
              {phases.map((p, i) => (
                <View key={i} style={[styles.tr, i % 2 === 1 ? styles.trAlt : {}]}>
                  <Text style={[styles.td, { flex: 2, fontWeight: 700 }]}>{p.name || "—"}</Text>
                  <Text style={styles.td}>{p.start || "—"}</Text>
                  <Text style={styles.td}>{p.end || "—"}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Subcontractors */}
        {subs.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>SUBCONTRACTORS</Text>
            <View style={styles.table}>
              <View style={styles.trHead}>
                <Text style={[styles.th, { flex: 2 }]}>NAME</Text>
                <Text style={styles.th}>ID</Text>
                <Text style={[styles.th, { flex: 2 }]}>SCOPE</Text>
                <Text style={[styles.th, { flex: 2 }]}>CONTACT</Text>
              </View>
              {subs.map((s, i) => (
                <View key={i} style={[styles.tr, i % 2 === 1 ? styles.trAlt : {}]}>
                  <Text style={[styles.td, { flex: 2, fontWeight: 700 }]}>{s.name || "—"}</Text>
                  <Text style={styles.td}>{s.subId || "—"}</Text>
                  <Text style={[styles.td, { flex: 2 }]}>{s.scope || "—"}</Text>
                  <Text style={[styles.td, { flex: 2 }]}>{(s as { contact?: string; email?: string }).contact || (s as { email?: string }).email || "—"}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Assigned team */}
        {assigned.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ASSIGNED TEAM</Text>
            <Text style={styles.body}>{assigned.join("   •   ")}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>GreenTech USA LLC  ·  Chantilly, Virginia  ·  info@gt-usa.com</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
