import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ApiProject, ProjectFinancials } from "../../lib/api";
import { projectCategories } from "../../lib/api";
import { effectiveEndDate } from "../../lib/projectSchedule";
import { BRAND, GUTTER, LETTERHEAD_PAGE, registerBrandFonts, LetterheadHeader, LetterheadFooter, Eyebrow, GradBar, SectionHeading } from "../pdf/brand";
import { KpiRow } from "./ProjectReportPDF";

registerBrandFonts();

// The portfolio report, laid out like the project Quick Report: the same heading block, headline
// cards and completion bar, a financial summary, then every project at a glance in one table and
// in detail as cards. "Page X of Y" prints: the page carries no line height.

const RED = "#DC2626";
const GREEN = "#047857";
const STATUS_TONE: Record<string, [string, string]> = {
  Ongoing: ["#DBEAFE", "#1D4ED8"], Active: ["#DBEAFE", "#1D4ED8"],
  Completed: ["#D1FAE5", "#047857"], Closed: ["#D1FAE5", "#047857"], Warranty: ["#D1FAE5", "#047857"],
  Pending: ["#FEF3C7", "#B45309"], OnHold: ["#FEF3C7", "#B45309"], Proposal: ["#EDE9FE", "#6D28D9"], BidSubmitted: ["#EDE9FE", "#6D28D9"],
  Lost: ["#FEE2E2", "#B91C1C"], Planning: ["#E2E8F0", "#475569"], Draft: ["#F1F5F9", "#64748B"],
};
const tone = (status: string) => STATUS_TONE[status] || STATUS_TONE.Planning;
// "OnHold" prints as "ON HOLD", "BidSubmitted" as "BID SUBMITTED".
const statusText = (status?: string) => (status || "-").replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();

// Columns of the at-a-glance table (widths add up to 100%).
// 2026-10-09 - the project column also carries its location (with the flag) and its client (with the logo).
const COLS: Array<{ label: string; w: string; right?: boolean }> = [
  { label: "ID", w: "10%" }, { label: "PROJECT", w: "25%" }, { label: "STATUS", w: "10%" },
  { label: "VALUE", w: "11.5%", right: true }, { label: "INCOME", w: "11.5%", right: true },
  { label: "EXPENSES", w: "11.5%", right: true }, { label: "PROFIT", w: "11.5%", right: true },
  { label: "DONE", w: "9%", right: true },
];

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
  pill: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 4, marginRight: 6, marginBottom: 3 },
  pillText: { fontSize: 7, fontWeight: 700, letterSpacing: 0.8, lineHeight: 1.2 },
  meta: { fontSize: 9, color: BRAND.s500, lineHeight: 1.3, marginRight: 12, marginBottom: 3 },

  progress: { marginTop: 6, marginBottom: 4 },
  progressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  progressLabel: { fontSize: 7, fontWeight: 700, color: BRAND.s500, letterSpacing: 0.9, lineHeight: 1.3 },
  progressPct: { fontSize: 10, fontWeight: 700, color: BRAND.emerald, lineHeight: 1.3 },
  bigTrack: { height: 6, backgroundColor: BRAND.border, borderRadius: 3 },
  bigFill: { height: 6, backgroundColor: BRAND.emerald, borderRadius: 3 },
  note: { fontSize: 7.5, color: BRAND.s500, lineHeight: 1.4, marginTop: 2 },

  // At a glance
  tHead: { flexDirection: "row", backgroundColor: BRAND.slate, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  th: { fontSize: 6.6, fontWeight: 700, color: BRAND.white, letterSpacing: 0.6, lineHeight: 1.3, paddingVertical: 5, paddingHorizontal: 5 },
  tRow: { flexDirection: "row", borderBottom: `0.6 solid ${BRAND.border}`, alignItems: "center" },
  tRowAlt: { backgroundColor: BRAND.mist },
  td: { fontSize: 7.9, color: BRAND.slate, lineHeight: 1.35, paddingVertical: 5, paddingHorizontal: 5 },
  tdId: { fontSize: 7.2, fontWeight: 700, color: BRAND.emerald, letterSpacing: 0.4 },
  tdStatus: { fontSize: 6.4, fontWeight: 700, letterSpacing: 0.6 },
  tTotal: { flexDirection: "row", backgroundColor: "#ECFDF5", borderBottom: `1.2 solid ${BRAND.emerald}` },

  // Project cards
  card: { borderRadius: 8, padding: 12, marginBottom: 10, border: `0.8 solid ${BRAND.border}`, borderLeft: `3 solid ${BRAND.emerald}` },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  cardName: { fontFamily: "Outfit", fontSize: 12, fontWeight: 700, color: BRAND.slate, lineHeight: 1.25, flex: 1, paddingRight: 10 },
  pills: { flexDirection: "row" },
  cardPill: { paddingVertical: 2.5, paddingHorizontal: 6, borderRadius: 4, marginLeft: 5 },
  cardPillText: { fontSize: 6.8, fontWeight: 700, letterSpacing: 0.8, lineHeight: 1.2 },
  cardId: { fontSize: 7.5, fontWeight: 700, color: BRAND.emerald, letterSpacing: 1, lineHeight: 1.3, marginBottom: 3 },
  cardMeta: { fontSize: 8.6, color: BRAND.s500, lineHeight: 1.4, marginBottom: 10 },
  statRow: { flexDirection: "row", marginBottom: 8 },
  stat: { flex: 1 },
  statLabel: { fontSize: 6.6, fontWeight: 700, color: BRAND.s400, letterSpacing: 0.9, lineHeight: 1.3, marginBottom: 2 },
  statValue: { fontSize: 9.2, fontWeight: 700, color: BRAND.slate, lineHeight: 1.3 },
  track: { height: 5, backgroundColor: BRAND.border, borderRadius: 3, marginTop: 2 },
  // 2026-10-09 - the client and the location, with the logo and the flag.
  subRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  sub: { fontSize: 6.6, color: BRAND.s500, lineHeight: 1.25 },
  flagSm: { height: 7, marginRight: 3 },
  logoSm: { height: 11, maxWidth: 32, objectFit: "contain", marginRight: 3 },
  clientRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  clientLogo: { height: 26, maxWidth: 96, objectFit: "contain", marginRight: 8 },
  clientName: { fontSize: 9.2, fontWeight: 700, color: BRAND.slate, lineHeight: 1.3 },
  metaLine: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  flagMd: { height: 9, marginRight: 5 },
  fill: { height: 5, backgroundColor: BRAND.emerald, borderRadius: 3 },
});

function today() {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Whole dollars, where the table has no room for cents.
const dollars = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
// The project value is typed free-form ("$750,000", "750000"); an unreadable one counts as nothing.
const valueOf = (v?: string) => { const n = Number(String(v || "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; };
const isOngoing = (st: string) => st === "Ongoing" || st === "Active";
const isDone = (st: string) => st === "Completed" || st === "Closed";

type Props = {
  projects: ApiProject[];
  financials?: Record<string, ProjectFinancials>;
  /** Which projects these are, e.g. "All Projects" or "My Projects". */
  scope?: string;
  title?: string;
  logoUrl?: string;
  /** 2026-10-09 - per project id: the client's logo and the country's flag, as PNGs. */
  assets?: Record<string, { logo?: string; flag?: string }>;
};

export default function PortfolioReportPDF({ projects, financials = {}, scope = "", title = "Portfolio Report", assets = {} }: Props) {
  const fin = (id: string) => financials[id] || { income: 0, expenses: 0 };
  const sum = (f: (p: ApiProject) => number) => projects.reduce((n, p) => n + f(p), 0);

  const ongoing = projects.filter((p) => isOngoing(p.status)).length;
  const completed = projects.filter((p) => isDone(p.status)).length;
  const avgProgress = projects.length ? Math.round(sum((p) => Math.max(0, Math.min(100, p.progress ?? 0))) / projects.length) : 0;
  const totalValue = sum((p) => valueOf(p.value));
  const totalIncome = sum((p) => fin(p.id).income);
  const totalExpenses = sum((p) => fin(p.id).expenses);
  const totalProfit = totalIncome - totalExpenses;
  // The receivables / payables split, when the server sent it.
  const hasSplit = projects.some((p) => financials[p.id]?.incomeReceived !== undefined);
  const received = sum((p) => fin(p.id).incomeReceived || 0);
  const receivable = sum((p) => fin(p.id).remainingIncome || 0);
  const approved = sum((p) => fin(p.id).approvedExpenses || 0);
  const payable = sum((p) => fin(p.id).pendingExpenses || 0);

  // How many projects sit in each status, in the order they first appear.
  const byStatus: Array<[string, number]> = [];
  for (const p of projects) {
    const st = p.status || "Planning";
    const row = byStatus.find((r) => r[0] === st);
    if (row) row[1]++; else byStatus.push([st, 1]);
  }

  const heading = scope ? `${scope.toUpperCase()}  ·  ` : "";
  const docTitle = scope ? `${scope} ${title}` : title;

  return (
    <Document title={docTitle} author="GreenTech USA LLC">
      <Page size="LETTER" style={s.page} wrap>
        <LetterheadHeader />

        {/* Title, as on the Quick Report */}
        <View style={s.head}>
          <Eyebrow>PORTFOLIO REPORT</Eyebrow>
          <Text style={s.date}>{today()}</Text>
        </View>
        <Text style={s.idLine}>{heading}{projects.length} PROJECT{projects.length === 1 ? "" : "S"}</Text>
        <Text style={s.title}>{title}</Text>
        <GradBar w={120} h={4} r={2} id="portfolio-title" />
        <View style={s.metaRow}>
          {byStatus.map(([st, n]) => {
            const [bg, fg] = tone(st);
            return <View key={st} style={[s.pill, { backgroundColor: bg }]}><Text style={[s.pillText, { color: fg }]}>{n} {statusText(st)}</Text></View>;
          })}
          <Text style={s.meta}>Prepared by GreenTech USA LLC</Text>
        </View>

        {/* Key figures */}
        <KpiRow items={[
          { label: "TOTAL PROJECTS", value: String(projects.length) },
          { label: "ONGOING", value: String(ongoing) },
          { label: "COMPLETED", value: String(completed) },
          { label: "OTHER", value: String(projects.length - ongoing - completed) },
        ]} />
        <View style={s.progress} wrap={false}>
          <View style={s.progressHead}>
            <Text style={s.progressLabel}>AVERAGE COMPLETION</Text>
            <Text style={s.progressPct}>{avgProgress}%</Text>
          </View>
          <View style={s.bigTrack}><View style={[s.bigFill, { width: `${avgProgress}%` }]} /></View>
        </View>

        {/* Financial summary */}
        <View wrap={false}>
          <SectionHeading title="Financial Summary" />
          <KpiRow items={[
            { label: "PORTFOLIO VALUE", value: totalValue ? dollars(totalValue) : "-" },
            { label: "INCOME (INVOICED)", value: money(totalIncome) },
            { label: "EXPENSES", value: money(totalExpenses) },
            { label: totalProfit >= 0 ? "CURRENT PROFIT" : "CURRENT LOSS", value: money(totalProfit), tone: totalProfit >= 0 ? BRAND.emerald : RED },
          ]} />
          {hasSplit && (
            <KpiRow items={[
              { label: "INCOME RECEIVED", value: money(received), tone: BRAND.emerald },
              { label: "RECEIVABLES", value: money(receivable), tone: "#2563EB" },
              { label: "APPROVED EXPENSES", value: money(approved), tone: "#E11D48" },
              { label: "PAYABLES", value: money(payable), tone: "#D97706" },
            ]} />
          )}
          <Text style={s.note}>Income is the total invoiced to the client (Invoice Sent). Expenses are the total logged in the Expenses tab (quantity × unit price), across all contributors. Portfolio value adds up each project's value.</Text>
        </View>

        {/* Every project on one line */}
        {projects.length > 0 && (
          <View>
            <SectionHeading title="Projects at a Glance" />
            <View style={s.tHead}>
              {COLS.map((c) => <Text key={c.label} style={[s.th, { width: c.w, textAlign: c.right ? "right" : "left" }]}>{c.label}</Text>)}
            </View>
            {projects.map((p, i) => {
              const f = fin(p.id);
              const profit = f.income - f.expenses;
              const [, fg] = tone(p.status);
              const cells = [
                <Text key="id" style={[s.td, s.tdId]}>{p.id}</Text>,
                <View key="nm" style={{ paddingVertical: 4, paddingHorizontal: 5 }}>
                  <Text style={{ fontSize: 7.9, color: BRAND.slate, lineHeight: 1.3 }}>{p.name}</Text>
                  {!!p.location && <View style={s.subRow}>{!!assets[p.id]?.flag && <Image src={assets[p.id].flag!} style={s.flagSm} />}<Text style={s.sub}>{p.location}</Text></View>}
                  {!!p.clientInfo?.name && <View style={s.subRow}>{!!assets[p.id]?.logo && <Image src={assets[p.id].logo!} style={s.logoSm} />}<Text style={s.sub}>{p.clientInfo.name}</Text></View>}
                </View>,
                <Text key="st" style={[s.td, s.tdStatus, { color: fg }]}>{statusText(p.status)}</Text>,
                <Text key="v" style={s.td}>{valueOf(p.value) ? dollars(valueOf(p.value)) : "-"}</Text>,
                <Text key="in" style={s.td}>{dollars(f.income)}</Text>,
                <Text key="ex" style={s.td}>{dollars(f.expenses)}</Text>,
                <Text key="pr" style={[s.td, { fontWeight: 700, color: profit >= 0 ? GREEN : RED }]}>{dollars(profit)}</Text>,
                <Text key="dn" style={s.td}>{Math.max(0, Math.min(100, p.progress ?? 0))}%</Text>,
              ];
              return (
                <View key={p.id} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
                  {cells.map((c, ci) => <View key={ci} style={{ width: COLS[ci].w, alignItems: COLS[ci].right ? "flex-end" : "flex-start" }}>{c}</View>)}
                </View>
              );
            })}
            <View style={s.tTotal} wrap={false}>
              {["TOTAL", "", "", totalValue ? dollars(totalValue) : "-", dollars(totalIncome), dollars(totalExpenses), dollars(totalProfit), `${avgProgress}%`].map((t, ci) => (
                <View key={ci} style={{ width: COLS[ci].w, alignItems: COLS[ci].right ? "flex-end" : "flex-start" }}>
                  <Text style={[s.td, { fontWeight: 700 }, ci === 6 ? { color: totalProfit >= 0 ? GREEN : RED } : {}]}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Each project in detail. The heading travels with the first card (unbreakable together),
            so it is never left alone at the foot of a page. */}
        {projects.map((p, i) => {
          const progress = Math.max(0, Math.min(100, p.progress ?? 0));
          const [bg, fg] = tone(p.status);
          const f = fin(p.id);
          const profit = f.income - f.expenses;
          const pl = profit >= 0;
          const card = (
            <View key={p.id} style={s.card} wrap={false}>
              <View style={s.cardHead}>
                <Text style={s.cardName}>{p.name}</Text>
                <View style={s.pills}>
                  <View style={[s.cardPill, { backgroundColor: pl ? "#D1FAE5" : "#FEE2E2" }]}><Text style={[s.cardPillText, { color: pl ? GREEN : "#B91C1C" }]}>{pl ? "PROFIT" : "LOSS"}</Text></View>
                  <View style={[s.cardPill, { backgroundColor: bg }]}><Text style={[s.cardPillText, { color: fg }]}>{statusText(p.status)}</Text></View>
                </View>
              </View>
              <Text style={s.cardId}>{p.id}</Text>
              {(!!p.clientInfo?.name || !!assets[p.id]?.logo) && (
                <View style={s.clientRow}>
                  {!!assets[p.id]?.logo && <Image src={assets[p.id].logo!} style={s.clientLogo} />}
                  <View><Text style={s.statLabel}>CLIENT</Text><Text style={s.clientName}>{p.clientInfo?.name || "-"}</Text></View>
                </View>
              )}
              <View style={s.metaLine}>
                {!!assets[p.id]?.flag && <Image src={assets[p.id].flag!} style={s.flagMd} />}
                <Text style={[s.cardMeta, { marginBottom: 0 }]}>{p.location || "-"}   ·   {projectCategories(p).join(", ") || "-"}   ·   Owner: {p.owner || "-"}</Text>
              </View>

              <View style={s.statRow}>
                <View style={s.stat}><Text style={s.statLabel}>PROJECT VALUE</Text><Text style={s.statValue}>{p.value || "-"}</Text></View>
                <View style={s.stat}><Text style={s.statLabel}>INCOME (INVOICED)</Text><Text style={s.statValue}>{money(f.income)}</Text></View>
                <View style={s.stat}><Text style={s.statLabel}>EXPENSES</Text><Text style={s.statValue}>{money(f.expenses)}</Text></View>
                <View style={s.stat}><Text style={s.statLabel}>{pl ? "PROFIT" : "LOSS"}</Text><Text style={[s.statValue, { color: pl ? GREEN : "#B91C1C" }]}>{money(profit)}</Text></View>
              </View>
              <View style={s.statRow}>
                <View style={s.stat}><Text style={s.statLabel}>START</Text><Text style={s.statValue}>{p.startDate || "-"}</Text></View>
                <View style={s.stat}><Text style={s.statLabel}>{effectiveEndDate(p) !== p.endDate ? "EXTENDED END" : "TARGET END"}</Text><Text style={s.statValue}>{effectiveEndDate(p) || "-"}</Text></View>
                <View style={s.stat}><Text style={s.statLabel}>TEAM</Text><Text style={s.statValue}>{p.assignedEmployees?.length ?? 0}</Text></View>
                <View style={s.stat}><Text style={s.statLabel}>PROGRESS</Text><Text style={s.statValue}>{progress}%</Text></View>
              </View>
              <View style={s.track}><View style={[s.fill, { width: `${progress}%` }]} /></View>
            </View>
          );
          return i === 0 ? <View key={p.id} wrap={false}><SectionHeading title="Project Details" />{card}</View> : card;
        })}

        <LetterheadFooter note={scope ? `${title} · ${scope}` : title} />
        <View fixed style={s.pageNoRow}>
          <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
