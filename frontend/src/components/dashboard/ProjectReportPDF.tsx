import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ApiProject } from "../../lib/api";
import { projectCategories } from "../../lib/api";
import { effectiveEndDate, fmtDate, milestoneLength, parseDate, planSchedule } from "../../lib/projectSchedule";
import { BRAND, GUTTER, LETTERHEAD_PAGE, registerBrandFonts, LetterheadHeader, LetterheadFooter, Eyebrow, GradBar, SectionHeading, abs } from "../pdf/brand";

registerBrandFonts();

// The project report on the client-approved letterhead, in the brand kit's type and colours (the
// same design as the proposals). It used to have its own Helvetica header and a line height on the
// page, which also stopped "Page X of Y" from printing.

const RED = "#DC2626";

// Status pills: background, text.
const STATUS_TONE: Record<string, [string, string]> = {
  Ongoing: ["#DBEAFE", "#1D4ED8"], Active: ["#DBEAFE", "#1D4ED8"],
  Completed: ["#D1FAE5", "#047857"], Closed: ["#D1FAE5", "#047857"], Warranty: ["#D1FAE5", "#047857"],
  Pending: ["#FEF3C7", "#B45309"], OnHold: ["#FEF3C7", "#B45309"], Proposal: ["#EDE9FE", "#6D28D9"], BidSubmitted: ["#EDE9FE", "#6D28D9"],
  Lost: ["#FEE2E2", "#B91C1C"], Planning: ["#E2E8F0", "#475569"], Draft: ["#F1F5F9", "#64748B"],
};

const s = StyleSheet.create({
  // No lineHeight on the page: the page number inherits it and would not print.
  page: { ...LETTERHEAD_PAGE, fontFamily: "Inter", fontSize: 9.5, color: BRAND.s700 },
  pageNoRow: { position: "absolute", left: GUTTER, right: GUTTER, bottom: 17.2, flexDirection: "row", justifyContent: "flex-end" },
  pageNo: { fontSize: 7.5, color: BRAND.s500 },

  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  date: { fontSize: 9, color: BRAND.s500, lineHeight: 1.3 },
  idLine: { fontSize: 8, fontWeight: 700, color: BRAND.emerald, letterSpacing: 1.2, lineHeight: 1.3, marginBottom: 4 },
  title: { fontFamily: "Outfit", fontSize: 22, fontWeight: 700, color: BRAND.slate, lineHeight: 1.15, marginBottom: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 10, marginBottom: 16 },
  pill: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 4, marginRight: 8 },
  pillText: { fontSize: 7, fontWeight: 700, letterSpacing: 0.8, lineHeight: 1.2 },
  meta: { fontSize: 9, color: BRAND.s500, lineHeight: 1.3, marginRight: 12 },

  kpiRow: { flexDirection: "row", marginBottom: 10 },
  kpi: { flex: 1, backgroundColor: BRAND.mist, borderRadius: 6, borderLeft: `3 solid ${BRAND.emerald}`, paddingVertical: 10, paddingHorizontal: 10, minHeight: 52, justifyContent: "center" },
  kpiLabel: { fontSize: 6.6, fontWeight: 700, color: BRAND.s500, letterSpacing: 0.9, lineHeight: 1.3, marginBottom: 4 },
  kpiValue: { fontSize: 12, fontWeight: 700, color: BRAND.slate, lineHeight: 1.25 },

  progress: { marginTop: 6, marginBottom: 4 },
  progressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  progressLabel: { fontSize: 7, fontWeight: 700, color: BRAND.s500, letterSpacing: 0.9, lineHeight: 1.3 },
  progressPct: { fontSize: 10, fontWeight: 700, color: BRAND.emerald, lineHeight: 1.3 },
  track: { height: 6, backgroundColor: BRAND.border, borderRadius: 3 },
  fill: { height: 6, backgroundColor: BRAND.emerald, borderRadius: 3 },

  body: { fontSize: 9.5, lineHeight: 1.55, color: BRAND.s700, marginBottom: 6 },
  note: { fontSize: 7.5, color: BRAND.s500, lineHeight: 1.4, marginTop: 2 },
  twoCol: { flexDirection: "row" },
  col: { flex: 1 },
  kv: { flexDirection: "row", paddingVertical: 4, borderBottom: `0.6 solid ${BRAND.border}` },
  kvLabel: { width: 88, fontSize: 7, fontWeight: 700, color: BRAND.s500, letterSpacing: 0.8, lineHeight: 1.4, paddingTop: 1 },
  kvValue: { flex: 1, fontSize: 9, color: BRAND.slate, fontWeight: 500, lineHeight: 1.4 },

  tHead: { flexDirection: "row", backgroundColor: BRAND.slate },
  th: { fontSize: 6.8, fontWeight: 700, color: BRAND.white, letterSpacing: 0.6, lineHeight: 1.3, paddingVertical: 5, paddingHorizontal: 6 },
  tRow: { flexDirection: "row", borderBottom: `0.6 solid ${BRAND.border}` },
  tRowAlt: { backgroundColor: BRAND.mist },
  td: { fontSize: 8.6, color: BRAND.slate, lineHeight: 1.35, paddingVertical: 5, paddingHorizontal: 6 },

  // Rich-text narrative from the report notes editor
  rtPara: { fontSize: 9.5, color: BRAND.s700, marginBottom: 5, lineHeight: 1.5 },
  rtH2: { fontSize: 11, fontWeight: 700, color: BRAND.slate, marginTop: 6, marginBottom: 4, lineHeight: 1.3 },
  rtH3: { fontSize: 10, fontWeight: 700, color: BRAND.slate, marginTop: 5, marginBottom: 3, lineHeight: 1.3 },
  rtLi: { flexDirection: "row", marginBottom: 3, paddingLeft: 4 },
  rtBullet: { width: 14, fontSize: 9.5, color: BRAND.emerald, lineHeight: 1.5 },
  rtLiText: { flex: 1, fontSize: 9.5, color: BRAND.s700, lineHeight: 1.5 },
  rtImg: { marginVertical: 6, alignSelf: "flex-start", objectFit: "contain" },
  rtTable: { marginVertical: 6, borderTop: `0.6 solid ${BRAND.border}`, borderLeft: `0.6 solid ${BRAND.border}` },
  rtTr: { flexDirection: "row" },
  rtTd: { flex: 1, fontSize: 8.6, padding: 5, color: BRAND.slate, lineHeight: 1.35, borderRight: `0.6 solid ${BRAND.border}`, borderBottom: `0.6 solid ${BRAND.border}` },
  rtTh: { fontWeight: 700, backgroundColor: BRAND.mist },
});

function formatToday() {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A row of KPI cards, evenly spaced. */
export function KpiRow({ items }: { items: Array<{ label: string; value: string; tone?: string }> }) {
  return (
    <View style={s.kpiRow} wrap={false}>
      {items.map((k, i) => (
        <View key={k.label} style={[s.kpi, { marginRight: i === items.length - 1 ? 0 : 8 }, k.tone ? { borderLeft: `3 solid ${k.tone}` } : {}]}>
          <Text style={s.kpiLabel}>{k.label}</Text>
          <Text style={[s.kpiValue, k.tone ? { color: k.tone } : {}]}>{k.value}</Text>
        </View>
      ))}
    </View>
  );
}

// Compact HTML → react-pdf for the report narrative (images and tables included). DOMParser is
// available in the browser where the PDF is generated.
function ReportRichText({ html }: { html: string }) {
  if (!html || !html.trim()) return null;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out: ReactNode[] = [];
  let k = 0;
  const textOf = (el: Element | ChildNode) => (el.textContent || "").trim();
  const renderImg = (el: HTMLElement) => {
    const src = el.getAttribute("src"); if (!src) return;
    const w = Math.min(parseInt(el.getAttribute("width") || "", 10) || 300, 455);
    out.push(<Image key={`i${k++}`} src={abs(src)} style={[s.rtImg, { width: w }]} />);
  };
  const renderTable = (tbl: HTMLElement) => {
    const rows = Array.from(tbl.querySelectorAll("tr"));
    if (!rows.length) return;
    out.push(
      <View key={`t${k++}`} style={s.rtTable} wrap={false}>
        {rows.map((tr, ri) => {
          const cells = Array.from(tr.children).filter((c) => /^(TD|TH)$/.test(c.tagName));
          const head = cells.some((c) => c.tagName === "TH");
          return <View key={ri} style={s.rtTr}>{cells.map((c, ci) => <Text key={ci} style={head ? [s.rtTd, s.rtTh] : s.rtTd}>{textOf(c)}</Text>)}</View>;
        })}
      </View>,
    );
  };
  const walk = (nodes: ChildNode[]) => {
    for (const node of nodes) {
      if (node.nodeType === 3) { const t = (node.textContent || "").trim(); if (t) out.push(<Text key={`x${k++}`} style={s.rtPara}>{t}</Text>); continue; }
      if (node.nodeType !== 1) continue;
      const el = node as HTMLElement; const tag = el.tagName.toUpperCase();
      if (tag === "IMG") { renderImg(el); continue; }
      if (tag === "TABLE") { renderTable(el); continue; }
      if (tag === "UL" || tag === "OL") {
        Array.from(el.children).forEach((li, i) => { const t = textOf(li); if (t) out.push(<View key={`l${k++}`} style={s.rtLi}><Text style={s.rtBullet}>{tag === "OL" ? `${i + 1}.` : "•"}</Text><Text style={s.rtLiText}>{t}</Text></View>); });
        continue;
      }
      if (/^H[1-6]$/.test(tag)) { const t = textOf(el); if (t) out.push(<Text key={`h${k++}`} style={tag === "H3" ? s.rtH3 : s.rtH2}>{t}</Text>); continue; }
      if (el.querySelector && el.querySelector("img, table, ul, ol")) { walk(Array.from(el.childNodes)); continue; }
      const t = textOf(el); if (t) out.push(<Text key={`p${k++}`} style={s.rtPara}>{t}</Text>);
    }
  };
  walk(Array.from(doc.body.childNodes));
  return <>{out}</>;
}

interface Props {
  project: ApiProject;
  /** Kept for callers; the letterhead band carries the logo now. */
  logoUrl?: string;
  /** Current income (total invoiced to the client) and expenses (total spent). */
  financials?: { income: number; expenses: number };
}

export default function ProjectReportPDF({ project, financials }: Props) {
  const subs = project.subcontractors || [];
  const phases = project.timeline?.phases || [];
  const assigned = project.assignedEmployees || [];
  // With milestones set up, the progress counts from the confirmed ones (as in the project).
  const plan = planSchedule(project.schedule?.milestones || [], project.startDate || project.contractDate || "");
  const progress = plan.milestones.length ? plan.progress : Math.max(0, Math.min(100, project.progress ?? 0));
  const nature = [...(project.projectNature?.selected || []), ...(project.projectNature?.custom || [])].join(", ");
  const income = financials?.income ?? 0;
  const expenses = financials?.expenses ?? 0;
  const profit = income - expenses;
  const [pillBg, pillFg] = STATUS_TONE[project.status] || STATUS_TONE.Planning;
  const kv = (label: string, value?: string) => (
    <View style={s.kv} wrap={false}><Text style={s.kvLabel}>{label}</Text><Text style={s.kvValue}>{value || "-"}</Text></View>
  );

  return (
    <Document title={`${project.name} - Project Report`} author="GreenTech USA LLC">
      <Page size="A4" style={s.page} wrap>
        <LetterheadHeader />

        {/* Title */}
        <View style={s.head}>
          <Eyebrow>PROJECT REPORT</Eyebrow>
          <Text style={s.date}>{formatToday()}</Text>
        </View>
        <Text style={s.idLine}>{project.id || "-"}  ·  {(projectCategories(project).join(", ") || "Uncategorized").toUpperCase()}</Text>
        <Text style={s.title}>{project.name}</Text>
        <GradBar w={120} h={4} r={2} id="report-title" />
        <View style={s.metaRow}>
          <View style={[s.pill, { backgroundColor: pillBg }]}><Text style={[s.pillText, { color: pillFg }]}>{(project.status || "-").toUpperCase()}</Text></View>
          <Text style={s.meta}>{project.location || "Location not set"}</Text>
          <Text style={s.meta}>Owner: {project.owner || "-"}</Text>
        </View>

        {/* Key figures */}
        <KpiRow items={[
          { label: "START DATE", value: project.startDate || "-" },
          { label: effectiveEndDate(project) !== project.endDate ? "EXTENDED END" : "TARGET END", value: effectiveEndDate(project) || "-" },
          { label: "TEAM", value: `${assigned.length} member${assigned.length === 1 ? "" : "s"}` },
          { label: "VISIBILITY", value: project.published ? "Public" : "Internal" },
        ]} />
        <View style={s.progress} wrap={false}>
          <View style={s.progressHead}>
            <Text style={s.progressLabel}>OVERALL COMPLETION</Text>
            <Text style={s.progressPct}>{progress}%</Text>
          </View>
          <View style={s.track}><View style={[s.fill, { width: `${progress}%` }]} /></View>
        </View>

        {/* CR-P (120)-(125) — the milestones behind the progress. */}
        {plan.milestones.length > 0 && (
          <View>
            <SectionHeading title="Milestones" />
            <View style={s.tHead} wrap={false} minPresenceAhead={24}>
              <Text style={[s.th, { width: 24 }]}>#</Text>
              <Text style={[s.th, { flex: 2.2 }]}>MILESTONE</Text>
              <Text style={[s.th, { flex: 1 }]}>DURATION</Text>
              <Text style={[s.th, { flex: 2 }]}>PLANNED</Text>
              <Text style={[s.th, { flex: 1.5 }]}>STATUS</Text>
            </View>
            {plan.milestones.map((m, i) => {
              const done = parseDate(m.doneAt);
              const [label, color] = m.state === "done" ? [`Finished${done ? ` ${fmtDate(done)}` : ""}`, BRAND.emerald]
                : m.state === "overdue" ? ["Due, not confirmed", "#B45309"]
                : m.state === "current" ? ["In progress", "#1D4ED8"]
                : ["Upcoming", BRAND.s500];
              return (
                <View key={m.id || i} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
                  <Text style={[s.td, { width: 24 }]}>{i + 1}</Text>
                  <Text style={[s.td, { flex: 2.2, fontWeight: 700 }]}>{m.name}</Text>
                  <Text style={[s.td, { flex: 1 }]}>{milestoneLength(m)}</Text>
                  <Text style={[s.td, { flex: 2 }]}>{m.start && m.end ? `${fmtDate(m.start)} to ${fmtDate(m.end)}` : "-"}</Text>
                  <Text style={[s.td, { flex: 1.5, fontWeight: 700, color }]}>{label}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Narrative / notes, rich text (tables and pictures) from the report notes editor */}
        {!!project.reportNotes?.trim() && (
          <View>
            <SectionHeading title="Notes & Narrative" />
            <ReportRichText html={project.reportNotes} />
          </View>
        )}

        {/* Financial summary */}
        <View wrap={false}>
          <SectionHeading title="Financial Summary" />
          <KpiRow items={[
            { label: "PROJECT VALUE", value: project.value || "-" },
            { label: "INCOME (INVOICED)", value: money(income) },
            { label: "EXPENSES", value: money(expenses) },
            { label: profit >= 0 ? "CURRENT PROFIT" : "CURRENT LOSS", value: money(profit), tone: profit >= 0 ? BRAND.emerald : RED },
          ]} />
          <Text style={s.note}>Income is the total invoiced to the client (Invoice Sent). Expenses are the total logged in the Expenses tab (quantity × unit price), across all contributors.</Text>
        </View>

        {/* Executive summary */}
        {!!project.description && (
          <View>
            <SectionHeading title="Executive Summary" />
            <Text style={s.body}>{project.description}</Text>
          </View>
        )}

        {/* Client + fiscal */}
        <View style={s.twoCol}>
          <View style={[s.col, { marginRight: 18 }]}>
            <SectionHeading title="Client Information" />
            {kv("NAME", project.clientInfo?.name)}
            {kv("REFERENCE", project.clientInfo?.reference)}
            {kv("CONTACT", project.clientInfo?.contactName)}
            {kv("EMAIL", project.clientInfo?.email)}
            {kv("PHONE", project.clientInfo?.phone)}
            {kv("COUNTRY", project.clientInfo?.country)}
          </View>
          <View style={s.col}>
            <SectionHeading title="Fiscal & Compliance" />
            {kv("FUNDING", project.fiscal)}
            {kv("COMPLIANCE", project.compliance)}
            {kv("NATURE", nature)}
            {kv("DISCIPLINES", project.disciplines?.join(", "))}
            {kv("CONTRACT NO.", project.contractNo)}
            {kv("CONTRACT TYPE", project.contractType)}
          </View>
        </View>

        {/* Timeline */}
        {phases.length > 0 && (
          <View>
            <SectionHeading title="Timeline Phases" />
            <View style={s.tHead} wrap={false} minPresenceAhead={24}>
              <Text style={[s.th, { flex: 2 }]}>PHASE</Text>
              <Text style={[s.th, { flex: 1 }]}>START</Text>
              <Text style={[s.th, { flex: 1 }]}>END</Text>
            </View>
            {phases.map((p, i) => (
              <View key={i} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
                <Text style={[s.td, { flex: 2, fontWeight: 700 }]}>{p.name || "-"}</Text>
                <Text style={[s.td, { flex: 1 }]}>{p.start || "-"}</Text>
                <Text style={[s.td, { flex: 1 }]}>{p.end || "-"}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Subcontractors */}
        {subs.length > 0 && (
          <View>
            <SectionHeading title="Subcontractors" />
            <View style={s.tHead} wrap={false} minPresenceAhead={24}>
              <Text style={[s.th, { flex: 2 }]}>NAME</Text>
              <Text style={[s.th, { flex: 1 }]}>ID</Text>
              <Text style={[s.th, { flex: 2 }]}>SCOPE</Text>
              <Text style={[s.th, { flex: 2 }]}>CONTACT</Text>
            </View>
            {subs.map((x, i) => (
              <View key={i} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
                <Text style={[s.td, { flex: 2, fontWeight: 700 }]}>{x.name || "-"}</Text>
                <Text style={[s.td, { flex: 1 }]}>{x.subId || "-"}</Text>
                <Text style={[s.td, { flex: 2 }]}>{x.scope || "-"}</Text>
                <Text style={[s.td, { flex: 2 }]}>{x.contact || x.email || "-"}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Assigned team */}
        {assigned.length > 0 && (
          <View wrap={false}>
            <SectionHeading title="Assigned Team" />
            <Text style={s.body}>{assigned.join("   ·   ")}</Text>
          </View>
        )}

        <LetterheadFooter note={`Project Report · ${project.name}`} />
        <View fixed style={s.pageNoRow}>
          <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
