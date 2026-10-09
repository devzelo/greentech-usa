import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ApiProject } from "../../lib/api";
import { projectCategories } from "../../lib/api";
import { effectiveEndDate, fmtDate, fmtDay, milestoneLength, parseDate, phasePercent, planSchedule } from "../../lib/projectSchedule";
import { BRAND, GUTTER, LETTERHEAD_PAGE, registerBrandFonts, LetterheadHeader, LetterheadFooter, Eyebrow, GradBar, SectionHeading, abs } from "../pdf/brand";
import { SHOW_PENDING_PROJECT_FIELDS } from "../../lib/pendingDesign";
import { PAGE } from "../pdf/brand";
import { Logo as GtLogo } from "../pdf/ProposalCovers";
import ReportTimeline, { hasReportTimeline } from "../pdf/ReportTimeline";
import { timelineOverview } from "../../lib/timelineOverview";

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
  pill: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 4, marginRight: 8 },
  pillText: { fontSize: 7, fontWeight: 700, letterSpacing: 0.8, lineHeight: 1.2 },

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

// 2026-10-09 - the cover page, on navy as the proposal cover.
const c = StyleSheet.create({
  idLine: { fontSize: 8, fontWeight: 700, color: BRAND.emerald, letterSpacing: 1.2, lineHeight: 1.3, marginBottom: 4 },
  title: { fontFamily: "Outfit", fontSize: 24, fontWeight: 700, color: BRAND.white, lineHeight: 1.15 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 8, marginBottom: 12 },
  meta: { fontSize: 9, color: BRAND.s300, lineHeight: 1.3 },
  label: { fontSize: 6.6, fontWeight: 700, color: BRAND.s400, letterSpacing: 1.2, lineHeight: 1.3, marginBottom: 6 },
  kv: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.6 solid #263043" },
  k: { width: "38%", fontSize: 7.2, fontWeight: 600, color: BRAND.s400, lineHeight: 1.35, paddingRight: 6 },
  v: { flex: 1, fontSize: 8.2, fontWeight: 600, color: BRAND.white, lineHeight: 1.35 },
  logoChip: { alignSelf: "flex-start", backgroundColor: BRAND.white, borderRadius: 6, padding: 5, marginBottom: 8 },
  clientName: { fontSize: 10.5, fontWeight: 700, color: BRAND.white, lineHeight: 1.3 },
  clientLine: { fontSize: 8, color: BRAND.s300, lineHeight: 1.4, marginTop: 1.5 },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTop: `1 solid ${BRAND.s700}`, paddingTop: 10 },
  footText: { fontSize: 7, color: BRAND.s400 },
});

/** The cover's pictures stay clear; only their bottom edge fades into the navy below. react-pdf has
 *  no gradient fill for a View, so faint layers stack (as the proposal's scrim does), each starting
 *  a little lower, easing to about 97% at the edge. */
function Fade({ w, h }: { w: number; h: number }) {
  const N = 48, H = 72, a = 1 - Math.pow(0.03, 1 / N);
  return (
    <View style={{ position: "absolute", left: 0, top: h - H, width: w, height: H }}>
      {Array.from({ length: N }, (_, i) => {
        const top = H * Math.pow((1 - Math.pow(0.03, i / N)) / 0.97, 1 / 1.6);
        return <View key={i} style={{ position: "absolute", left: 0, top, width: w, height: H - top, backgroundColor: BRAND.slate, opacity: a }} />;
      })}
    </View>
  );
}

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

// 2026-10-09 - the first page is a cover: the project's picture, its information and the client's.
// The report starts on the second page: the key figures, the description, the timeline, the
// subcontractors, the finance status, the pictures and the work packages.
export const REPORT_SECTIONS: Array<{ key: ReportSection; label: string; hint: string }> = [
  { key: "projectInfo", label: "Project information", hint: "Cover page: identity, contract, type and dates" },
  { key: "photo", label: "Cover pictures", hint: "Cover page: the pictures ticked in the gallery (two at most), else the cover picture" },
  { key: "clientInfo", label: "Client and logo", hint: "Cover page: the client from the Directory, with its logo" },
  { key: "overview", label: "Key figures and progress", hint: "Opens the report: dates, team size, overall completion" },
  { key: "summary", label: "Description and scope", hint: "The project's description and key scope of work" },
  { key: "milestones", label: "Timeline", hint: "The timeline card, the phases and milestones, the critical path and extensions of time" },
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
  /** 2026-10-09 - the cover page's pictures (one or two), as data URLs (read before the PDF is made). */
  photos?: string[];
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

export default function ProjectReportPDF({ project, financials, include, client, vendors = [], photos = [], gallery = [], galleryTotal = 0, packages, team, flag }: Props) {
  const on = (k: ReportSection) => include?.[k] !== false;
  const subs = project.subcontractors || [];
  const phases = project.timeline?.phases || [];
  const assigned = project.assignedEmployees || [];
  // With a timeline set up, the progress comes from the phases' % complete (as in the project).
  // 2026-10-09 - the work complete as the timeline card counts it (cancelled items left out).
  const progress = timelineOverview(project).workPct;
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
  const clientName = client?.name || project.clientInfo?.name || "";
  const clientLines = [
    client?.clientType,
    [client?.contactName || project.clientInfo?.contactName, client?.role].filter(Boolean).join(", "),
    client?.email || project.clientInfo?.email, client?.phone || project.clientInfo?.phone,
    client?.address || project.clientInfo?.address, client?.website,
  ].map((x) => (x || "").trim()).filter(Boolean);
  const showClient = on("clientInfo") && !!clientName;
  const clientLogo = on("clientInfo") && client?.logo ? client.logo : "";
  // The cover's pictures: the ones picked in the gallery (two at most), else the cover picture.
  const coverPhotos = on("photo") ? photos.slice(0, 2) : [];
  // The picture band gives way as the information grows (the client's logo and name take about five
  // rows), so the cover stays one page.
  const coverRows = Math.max(on("projectInfo") ? infoRows.length : 0, showClient || clientLogo ? clientLines.length + 5 : 0);
  const coverH = coverPhotos.length ? Math.max(240, Math.min(380, 540 - coverRows * 20)) : 0;
  const scope = (project.scopeOfWork || []).map((x) => (x || "").trim()).filter(Boolean);
  const hasDescription = !!project.description?.trim() || !!project.reportNotes?.replace(/<[^>]*>/g, "").trim();

  return (
    <Document title={`${project.name} - Project Report`} author="GreenTech USA LLC">
      {/* 2026-10-09 - the first page is a cover, as the proposal's: the project's pictures across the
          top half, then on navy the project's information and the client's (with its logo). The
          report itself starts on the next page. */}
      <Page size="LETTER" style={{ backgroundColor: BRAND.slate, fontFamily: "Inter" }}>
        {coverPhotos.length > 0 && (
          <View style={{ height: coverH, position: "relative", flexDirection: "row", backgroundColor: BRAND.slate }}>
            {/* One picture runs the full width; two share it. */}
            {coverPhotos.map((src, i) => (
              <Image key={i} src={src} style={{ width: coverPhotos.length > 1 ? (PAGE.w - 4) / 2 : PAGE.w, height: coverH, objectFit: "cover", marginLeft: i ? 4 : 0 }} />
            ))}
            <Fade w={PAGE.w} h={coverH} />
          </View>
        )}
        <View style={{ flex: 1, paddingHorizontal: 44, paddingTop: coverH ? 12 : 64, paddingBottom: 22, justifyContent: "space-between" }}>
          <View>
            <Eyebrow>{`PROJECT REPORT  ·  ${formatToday().toUpperCase()}`}</Eyebrow>
            <Text style={c.idLine}>{project.id || "-"}  ·  {(projectCategories(project).join(", ") || "Uncategorized").toUpperCase()}</Text>
            <Text style={c.title}>{project.name}</Text>
            <View style={c.metaRow}>
              <View style={[s.pill, { backgroundColor: pillBg }]}><Text style={[s.pillText, { color: pillFg }]}>{(project.status || "-").toUpperCase()}</Text></View>
              {!!flag && <Image src={flag} style={{ height: 9, marginRight: 4 }} />}
              <Text style={c.meta}>{project.location || "Location not set"}</Text>
            </View>
            <GradBar w={PAGE.w - 88} h={3} id="report-cover-rule" />
            <View style={{ flexDirection: "row", marginTop: 12 }}>
              {on("projectInfo") && (
                <View style={{ flex: 1.25, paddingRight: 16 }}>
                  <Text style={c.label}>PROJECT INFORMATION</Text>
                  {infoRows.map(([l, v]) => (
                    <View key={l} style={c.kv}>
                      <Text style={c.k}>{l}</Text>
                      <Text style={c.v}>{v}</Text>
                    </View>
                  ))}
                </View>
              )}
              {(showClient || !!clientLogo) && (
                <View style={{ flex: 1, paddingLeft: on("projectInfo") ? 16 : 0, borderLeft: on("projectInfo") ? `1 solid ${BRAND.s700}` : undefined }}>
                  <Text style={c.label}>CLIENT</Text>
                  {!!clientLogo && <View style={c.logoChip}><Image src={clientLogo} style={{ height: 54, maxWidth: 160, objectFit: "contain" }} /></View>}
                  {!!clientName && <Text style={c.clientName}>{clientName}</Text>}
                  {clientLines.map((l, i) => <Text key={i} style={c.clientLine}>{l}</Text>)}
                </View>
              )}
            </View>
          </View>
          <View style={c.foot}>
            <GtLogo h={18} />
            <Text style={c.footText}>Prepared by GreenTech USA  ·  www.gt-usa.com</Text>
          </View>
        </View>
      </Page>

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
        <View style={{ height: 16 }} />

        {/* Key figures */}
        {on("overview") && (
          <>
            <KpiRow items={[
              { label: "START DATE", value: fmtDay(project.startDate) || "-" },
              { label: effectiveEndDate(project) !== project.endDate ? "EXTENDED END" : "TARGET END", value: fmtDay(effectiveEndDate(project)) || "-" },
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

        {/* 2026-10-09 - the timeline as the Timeline / Milestones tab shows it: the card from the top of
            the schedule, the phases and milestones under their phases (numbered 1, 1.1, 1.2), the
            critical path and the extensions of time (components/pdf/ReportTimeline). */}
        {on("milestones") && hasReportTimeline(project) && (
          <View>
            <SectionHeading title="Timeline: phases & milestones" />
            <ReportTimeline project={project} width={PAGE.w - GUTTER * 2} />
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
