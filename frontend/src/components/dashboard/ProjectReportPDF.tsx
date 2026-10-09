import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ApiProject } from "../../lib/api";
import { projectCategories } from "../../lib/api";
import { effectiveEndDate, fmtDate, milestoneLength, parseDate, phasePercent, planSchedule } from "../../lib/projectSchedule";
import { BRAND, GUTTER, LETTERHEAD_PAGE, registerBrandFonts, LetterheadHeader, LetterheadFooter, Eyebrow, GradBar, SectionHeading, abs } from "../pdf/brand";
import { SHOW_PENDING_PROJECT_FIELDS } from "../../lib/pendingDesign";

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
  // The client's own mark, sized to sit inside a row without pushing the column about.
  clientLogo: { height: 34, maxWidth: 120, objectFit: "contain" },

  // 2026-10-07 - the first page as on a past performance page: the information table on the left,
  // the project's picture and the client (with its logo) on the right.
  top: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14 },
  infoCol: { flex: 1 },
  info: { border: `0.8 solid ${BRAND.border}` },
  // 2026-10-09 - the client's logo, big, on the left over the information table and lined up with it.
  clientLogoBig: { height: 60, maxWidth: 240, objectFit: "contain", alignSelf: "flex-start", marginBottom: 8 },
  infoHead: { backgroundColor: BRAND.slate, paddingVertical: 5, paddingHorizontal: 7 },
  infoHeadText: { fontSize: 7, fontWeight: 700, color: BRAND.white, letterSpacing: 1, lineHeight: 1.2 },
  infoRow: { flexDirection: "row", borderTop: `0.6 solid ${BRAND.border}` },
  infoLabel: { width: "38%", backgroundColor: BRAND.mist, paddingVertical: 4.5, paddingHorizontal: 7, fontSize: 7.4, fontWeight: 700, color: BRAND.s600, lineHeight: 1.3 },
  infoValue: { flex: 1, paddingVertical: 4.5, paddingHorizontal: 7, fontSize: 8, color: BRAND.slate, lineHeight: 1.35 },
  side: { width: "38%", marginLeft: 14 },
  photo: { width: "100%", height: 130, objectFit: "cover", borderRadius: 6, marginBottom: 10 },
  clientCard: { border: `0.8 solid ${BRAND.border}`, borderRadius: 6, padding: 10, borderLeft: `3 solid ${BRAND.emerald}` },
  clientLabel: { fontSize: 6.6, fontWeight: 700, color: BRAND.s500, letterSpacing: 0.9, lineHeight: 1.3, marginBottom: 5 },
  clientName: { fontSize: 10, fontWeight: 700, color: BRAND.slate, lineHeight: 1.3 },
  clientLine: { fontSize: 8, color: BRAND.s600, lineHeight: 1.4, marginTop: 1.5 },
  scope: { flexDirection: "row", flexWrap: "wrap", marginTop: 2 },
  scopeItem: { width: "50%", flexDirection: "row", paddingRight: 10, marginBottom: 3 },
  gallery: { flexDirection: "row", flexWrap: "wrap", marginTop: 2 },
  galleryCell: { width: "31.8%", marginBottom: 10 },
  galleryImg: { width: "100%", height: 108, objectFit: "cover", borderRadius: 5 },
  galleryCaption: { fontSize: 7.4, color: BRAND.s600, lineHeight: 1.35, marginTop: 3 },

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

/**
 * CR 286 (2026-09-23): the report is put together section by section. Everything is on by default,
 * and the person printing it can leave out whatever does not belong in this particular copy.
 */
export type ReportSection =
  | "overview" | "projectInfo" | "clientInfo" | "photo" | "summary" | "milestones" | "phases"
  | "notes" | "financials" | "subs" | "vendors" | "gallery" | "workPackages" | "team";

// 2026-10-07 - the first page shows the project at a glance (as a past performance page does), then
// the description, the timeline, the subcontractors, the finance status, the pictures and the work
// packages.
export const REPORT_SECTIONS: Array<{ key: ReportSection; label: string; hint: string }> = [
  { key: "projectInfo", label: "Project information", hint: "First page: identity, contract, type and dates" },
  { key: "photo", label: "Project picture", hint: "First page: the project's cover picture" },
  { key: "clientInfo", label: "Client and logo", hint: "First page: the client from the Directory, with its logo" },
  { key: "overview", label: "Key figures and progress", hint: "First page: dates, team size, overall completion" },
  { key: "summary", label: "Description and scope", hint: "The project's description and key scope of work" },
  { key: "milestones", label: "Timeline", hint: "The phases and milestones behind the progress" },
  { key: "phases", label: "Older timeline phases", hint: "The earlier phase list, when one is kept" },
  { key: "subs", label: "Subcontractors", hint: "Who is working under this project" },
  { key: "vendors", label: "Vendors", hint: "The suppliers on this project" },
  { key: "financials", label: "Finance status", hint: "Value, income, expenses, profit" },
  { key: "gallery", label: "Picture gallery", hint: "The pictures in the project's gallery" },
  { key: "workPackages", label: "Work packages", hint: "Each package: who does it, status and progress" },
  { key: "team", label: "Assigned team", hint: "The people assigned" },
];

/** The client as the project page shows it: the Directory's version when it is linked. */
export interface ReportClient {
  name?: string; clientType?: string; contactName?: string; role?: string;
  email?: string; phone?: string; address?: string; website?: string;
  location?: string; reference?: string; notes?: string;
  /** A data URL, so the page never waits on a network fetch while it renders. */
  logo?: string;
}

export interface ReportVendor { name?: string; contactName?: string; email?: string; phone?: string; city?: string; country?: string }

/** A work package as the report lists it. Money only for someone allowed to see the figures. */
export interface ReportPackage { no: number; name: string; who: string; status: string; progress: number; current?: number; paid?: number }

interface Props {
  project: ApiProject;
  /** Kept for callers; the letterhead band carries the logo now. */
  logoUrl?: string;
  /** Current income (total invoiced to the client) and expenses (total spent). */
  financials?: { income: number; expenses: number };
  /** Which sections to print. Anything left out of the map is printed. */
  include?: Partial<Record<ReportSection, boolean>>;
  client?: ReportClient;
  vendors?: ReportVendor[];
  /** The project's cover picture, as a data URL (read before the PDF is made). */
  photo?: string;
  /** The gallery's pictures, as data URLs, with their captions. */
  gallery?: Array<{ src: string; caption?: string }>;
  /** How many pictures the gallery holds in all (the report prints the first ones). */
  galleryTotal?: number;
  packages?: { money: boolean; items: ReportPackage[] };
  /** The assigned people by name (the project holds their employee ids). */
  team?: string[];
  /** 2026-10-09 - the country's flag, as a PNG (lib/flagImage). */
  flag?: string;
}

export default function ProjectReportPDF({ project, financials, include, client, vendors = [], photo, gallery = [], galleryTotal = 0, packages, team, flag }: Props) {
  const on = (k: ReportSection) => include?.[k] !== false;
  const subs = project.subcontractors || [];
  const phases = project.timeline?.phases || [];
  const assigned = project.assignedEmployees || [];
  // With a timeline set up, the progress comes from the phases' % complete (as in the project).
  const plan = planSchedule(project.schedule?.milestones || [], project.startDate || project.contractDate || "", new Date(), effectiveEndDate(project));
  const progress = plan.milestones.length ? plan.progress : Math.max(0, Math.min(100, project.progress ?? 0));
  const income = financials?.income ?? 0;
  const expenses = financials?.expenses ?? 0;
  const profit = income - expenses;
  const [pillBg, pillFg] = STATUS_TONE[project.status] || STATUS_TONE.Planning;
  const end = effectiveEndDate(project);
  const site = project.siteAddress?.full || [project.siteAddress?.line1, project.siteAddress?.city, project.siteAddress?.country].filter(Boolean).join(", ");
  // The first page's table: only what is filled in. Funding, disciplines and compliance wait for
  // their design (lib/pendingDesign.ts), as they do in Create and Edit Project.
  const infoRows = ([
    ["Project No.", project.id], ["Location", project.location], ["Site Address", site],
    ["Project Type", projectCategories(project).join(", ")], ["Contract No.", project.contractNo], ["Solicitation No.", project.solicitationNo],
    ["Contract Type", project.contractType],
    ["Period", [project.startDate, end].filter(Boolean).join(" to ") + (end && end !== project.endDate ? " (extended)" : "")],
    ["Contract Value", project.value], ["Status", project.status], ["Owner", project.owner],
    ...(SHOW_PENDING_PROJECT_FIELDS ? [["Funding", project.fiscal], ["Disciplines", project.disciplines?.join(", ")], ["Compliance", project.compliance]] : []),
  ] as Array<[string, string | undefined]>).filter(([, v]) => !!v?.trim()) as Array<[string, string]>;
  const showPhoto = on("photo") && !!photo;
  const clientName = client?.name || project.clientInfo?.name || "";
  const clientLines = [
    client?.clientType,
    [client?.contactName || project.clientInfo?.contactName, client?.role].filter(Boolean).join(", "),
    client?.email || project.clientInfo?.email, client?.phone || project.clientInfo?.phone,
    client?.address || project.clientInfo?.address, client?.website,
  ].map((x) => (x || "").trim()).filter(Boolean);
  const showClient = on("clientInfo") && !!clientName;
  const clientLogo = on("clientInfo") && client?.logo ? client.logo : "";
  const scope = (project.scopeOfWork || []).map((x) => (x || "").trim()).filter(Boolean);
  const hasDescription = !!project.description?.trim() || !!project.reportNotes?.replace(/<[^>]*>/g, "").trim();

  return (
    <Document title={`${project.name} - Project Report`} author="GreenTech USA LLC">
      <Page size="LETTER" style={s.page} wrap>
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
          <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
            {!!flag && <Image src={flag} style={{ height: 9, marginRight: 4 }} />}
            <Text style={[s.meta, { marginRight: 0 }]}>{project.location || "Location not set"}</Text>
          </View>
          <Text style={s.meta}>Owner: {project.owner || "-"}</Text>
        </View>

        {/* 2026-10-07 - the project at a glance, as on a past performance page. */}
        {(on("projectInfo") || showPhoto || showClient || !!clientLogo) && (
          <View style={s.top} wrap={false}>
            {(on("projectInfo") || !!clientLogo) && (
              <View style={s.infoCol}>
                {!!clientLogo && <Image src={clientLogo} style={s.clientLogoBig} />}
                {on("projectInfo") && (
                  <View style={s.info}>
                    <View style={s.infoHead}><Text style={s.infoHeadText}>PROJECT INFORMATION</Text></View>
                    {infoRows.map(([l, v]) => (
                      <View key={l} style={s.infoRow}>
                        <Text style={s.infoLabel}>{l}</Text>
                        <Text style={s.infoValue}>{v}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            {(showPhoto || showClient) && (
              <View style={on("projectInfo") || clientLogo ? s.side : { width: "100%" }}>
                {showPhoto && <Image src={photo!} style={on("projectInfo") || clientLogo ? s.photo : [s.photo, { height: 200 }]} />}
                {showClient && (
                  <View style={s.clientCard}>
                    <Text style={s.clientLabel}>CLIENT</Text>
                    <Text style={s.clientName}>{clientName}</Text>
                    {clientLines.map((l, i) => <Text key={i} style={s.clientLine}>{l}</Text>)}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Key figures */}
        {on("overview") && (
          <>
            <KpiRow items={[
              { label: "START DATE", value: project.startDate || "-" },
              { label: effectiveEndDate(project) !== project.endDate ? "EXTENDED END" : "TARGET END", value: effectiveEndDate(project) || "-" },
              { label: "TEAM", value: `${assigned.length} member${assigned.length === 1 ? "" : "s"}` },
              { label: "COMPLETION", value: `${progress}%`, tone: BRAND.emerald },
            ]} />
            <View style={s.progress} wrap={false}>
              <View style={s.progressHead}>
                <Text style={s.progressLabel}>OVERALL COMPLETION</Text>
                <Text style={s.progressPct}>{progress}%</Text>
              </View>
              <View style={s.track}><View style={[s.fill, { width: `${progress}%` }]} /></View>
            </View>
          </>
        )}

        {/* The project's description (Project Info's Short Description) and its key scope. A project
            from before, with report notes and no description, prints its notes instead. */}
        {on("summary") && (hasDescription || scope.length > 0) && (
          <View>
            <SectionHeading title="Description" />
            {project.description?.trim() ? <Text style={s.body}>{project.description}</Text> : <ReportRichText html={project.reportNotes || ""} />}
            {scope.length > 0 && (
              <View style={{ marginTop: 4 }}>
                <Text style={s.progressLabel} minPresenceAhead={40}>KEY SCOPE OF WORK</Text>
                <View style={s.scope}>
                  {scope.map((line, i) => (
                    <View key={i} style={s.scopeItem}><Text style={s.rtBullet}>•</Text><Text style={s.rtLiText}>{line}</Text></View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* CR-P (120)-(125) — the milestones behind the progress. */}
        {on("milestones") && plan.milestones.length > 0 && (
          <View>
            <SectionHeading title="Timeline: phases & milestones" />
            <View style={s.tHead} wrap={false} minPresenceAhead={24}>
              <Text style={[s.th, { width: 24 }]}>#</Text>
              <Text style={[s.th, { flex: 2.2 }]}>MILESTONE</Text>
              <Text style={[s.th, { flex: 1 }]}>DURATION</Text>
              <Text style={[s.th, { flex: 2 }]}>PLANNED</Text>
              <Text style={[s.th, { flex: 1.5 }]}>STATUS</Text>
            </View>
            {plan.milestones.map((m, i) => {
              const done = parseDate(m.actualEnd || m.doneAt);
              const pct = phasePercent(m);
              const [label, color] = m.state === "done" ? [`Completed${done ? ` ${fmtDate(done)}` : ""}`, BRAND.emerald]
                : m.state === "overdue" ? [`Past planned end (${pct}%)`, "#B45309"]
                : m.state === "current" ? [`In progress (${pct}%)`, "#1D4ED8"]
                : ["Not started", BRAND.s500];
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


        {/* Timeline */}
        {on("phases") && phases.length > 0 && (
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
        {on("subs") && subs.length > 0 && (
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

        {/* CR 286 - the suppliers on this project, beside the subcontractors. */}
        {on("vendors") && vendors.length > 0 && (
          <View>
            <SectionHeading title="Vendors" />
            <View style={s.tHead} wrap={false} minPresenceAhead={24}>
              <Text style={[s.th, { flex: 2 }]}>NAME</Text>
              <Text style={[s.th, { flex: 1.5 }]}>CONTACT</Text>
              <Text style={[s.th, { flex: 2 }]}>EMAIL / PHONE</Text>
              <Text style={[s.th, { flex: 1.5 }]}>LOCATION</Text>
            </View>
            {vendors.map((v, i) => (
              <View key={i} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
                <Text style={[s.td, { flex: 2, fontWeight: 700 }]}>{v.name || "-"}</Text>
                <Text style={[s.td, { flex: 1.5 }]}>{v.contactName || "-"}</Text>
                <Text style={[s.td, { flex: 2 }]}>{[v.email, v.phone].filter(Boolean).join("  ·  ") || "-"}</Text>
                <Text style={[s.td, { flex: 1.5 }]}>{[v.city, v.country].filter(Boolean).join(", ") || "-"}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Finance status */}
        {on("financials") && (
        <View wrap={false}>
          <SectionHeading title="Finance Status" />
          <KpiRow items={[
            { label: "PROJECT VALUE", value: project.value || "-" },
            { label: "INCOME (INVOICED)", value: money(income) },
            { label: "EXPENSES", value: money(expenses) },
            { label: profit >= 0 ? "CURRENT PROFIT" : "CURRENT LOSS", value: money(profit), tone: profit >= 0 ? BRAND.emerald : RED },
          ]} />
          <Text style={s.note}>Income is the total invoiced to the client (Invoice Sent). Expenses are the total logged in the Expenses tab (quantity × unit price), across all contributors.</Text>
        </View>
        )}

        {/* 2026-10-07 - the project's pictures, three to a row. */}
        {on("gallery") && gallery.length > 0 && (
          <View>
            {Array.from({ length: Math.ceil(gallery.length / 3) }, (_, r) => (
              <View key={r} wrap={false}>
                {r === 0 && <SectionHeading title="Picture Gallery" />}
                <View style={s.gallery}>
                  {gallery.slice(r * 3, r * 3 + 3).map((g, i) => (
                    <View key={i} style={[s.galleryCell, { marginRight: i === 2 ? 0 : "2.3%" }]}>
                      <Image src={g.src} style={s.galleryImg} />
                      {!!g.caption?.trim() && <Text style={s.galleryCaption}>{g.caption.trim()}</Text>}
                    </View>
                  ))}
                </View>
              </View>
            ))}
            {galleryTotal > gallery.length && <Text style={s.note}>The first {gallery.length} of {galleryTotal} pictures; the rest are in the project's gallery.</Text>}
          </View>
        )}

        {/* 2026-10-07 - the work packages, one line each. */}
        {on("workPackages") && !!packages?.items.length && (
          <View>
            <SectionHeading title="Work Packages" />
            <View style={s.tHead} wrap={false} minPresenceAhead={24}>
              <Text style={[s.th, { width: 30 }]}>#</Text>
              <Text style={[s.th, { flex: 2.4 }]}>WORK PACKAGE</Text>
              <Text style={[s.th, { flex: 1.8 }]}>RESPONSIBLE</Text>
              <Text style={[s.th, { flex: 1.1 }]}>STATUS</Text>
              <Text style={[s.th, { width: 48, textAlign: "right" }]}>DONE</Text>
              {packages.money && <Text style={[s.th, { flex: 1.1, textAlign: "right" }]}>VALUE</Text>}
              {packages.money && <Text style={[s.th, { flex: 1.1, textAlign: "right" }]}>PAID</Text>}
            </View>
            {packages.items.map((p, i) => (
              <View key={i} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
                <Text style={[s.td, { width: 30 }]}>{p.no}.0</Text>
                <Text style={[s.td, { flex: 2.4, fontWeight: 700 }]}>{p.name}</Text>
                <Text style={[s.td, { flex: 1.8 }]}>{p.who || "-"}</Text>
                <Text style={[s.td, { flex: 1.1 }]}>{p.status}</Text>
                <Text style={[s.td, { width: 48, textAlign: "right" }]}>{p.progress}%</Text>
                {packages.money && <Text style={[s.td, { flex: 1.1, textAlign: "right" }]}>{p.current ? money(p.current) : "-"}</Text>}
                {packages.money && <Text style={[s.td, { flex: 1.1, textAlign: "right" }]}>{p.paid ? money(p.paid) : "-"}</Text>}
              </View>
            ))}
            {packages.money && (() => {
              const cur = packages.items.reduce((a, p) => a + (p.current || 0), 0), paid = packages.items.reduce((a, p) => a + (p.paid || 0), 0);
              return (
                <View style={[s.tRow, { backgroundColor: BRAND.mist }]} wrap={false}>
                  <Text style={[s.td, { width: 30 }]} />
                  <Text style={[s.td, { flex: 2.4 + 1.8 + 1.1, fontWeight: 700 }]}>Totals</Text>
                  <Text style={[s.td, { width: 48 }]} />
                  <Text style={[s.td, { flex: 1.1, textAlign: "right", fontWeight: 700 }]}>{money(cur)}</Text>
                  <Text style={[s.td, { flex: 1.1, textAlign: "right", fontWeight: 700 }]}>{money(paid)}</Text>
                </View>
              );
            })()}
          </View>
        )}

        {/* Assigned team */}
        {on("team") && assigned.length > 0 && (
          <View wrap={false}>
            <SectionHeading title="Assigned Team" />
            <Text style={s.body}>{(team?.length ? team : assigned).join("   ·   ")}</Text>
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
