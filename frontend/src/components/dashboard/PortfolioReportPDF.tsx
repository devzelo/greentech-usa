import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ApiProject } from "../../lib/api";
import { projectCategories } from "../../lib/api";
import { BRAND, GUTTER, LETTERHEAD_PAGE, registerBrandFonts, LetterheadHeader, LetterheadFooter, Eyebrow, GradBar, SectionHeading } from "../pdf/brand";
import { KpiRow } from "./ProjectReportPDF";

registerBrandFonts();

// The portfolio report on the client-approved letterhead, in the brand kit's design (as the project
// report and the proposals). "Page X of Y" prints: the page carries no line height.

const RED = "#DC2626";
const STATUS_TONE: Record<string, [string, string]> = {
  Ongoing: ["#DBEAFE", "#1D4ED8"], Active: ["#DBEAFE", "#1D4ED8"],
  Completed: ["#D1FAE5", "#047857"], Closed: ["#D1FAE5", "#047857"], Warranty: ["#D1FAE5", "#047857"],
  Pending: ["#FEF3C7", "#B45309"], OnHold: ["#FEF3C7", "#B45309"], Proposal: ["#EDE9FE", "#6D28D9"], BidSubmitted: ["#EDE9FE", "#6D28D9"],
  Lost: ["#FEE2E2", "#B91C1C"], Planning: ["#E2E8F0", "#475569"], Draft: ["#F1F5F9", "#64748B"],
};

const s = StyleSheet.create({
  page: { ...LETTERHEAD_PAGE, fontFamily: "Inter", fontSize: 9.5, color: BRAND.s700 },
  pageNoRow: { position: "absolute", left: GUTTER, right: GUTTER, bottom: 17.2, flexDirection: "row", justifyContent: "flex-end" },
  pageNo: { fontSize: 7.5, color: BRAND.s500 },

  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  date: { fontSize: 9, color: BRAND.s500, lineHeight: 1.3 },
  title: { fontFamily: "Outfit", fontSize: 22, fontWeight: 700, color: BRAND.slate, lineHeight: 1.15, marginBottom: 8 },
  subtitle: { fontSize: 9.5, color: BRAND.s500, lineHeight: 1.4, marginTop: 8, marginBottom: 16 },

  card: { borderRadius: 8, padding: 12, marginBottom: 10, border: `0.8 solid ${BRAND.border}`, borderLeft: `3 solid ${BRAND.emerald}` },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  cardName: { fontFamily: "Outfit", fontSize: 12, fontWeight: 700, color: BRAND.slate, lineHeight: 1.25, flex: 1, paddingRight: 10 },
  pills: { flexDirection: "row" },
  pill: { paddingVertical: 2.5, paddingHorizontal: 6, borderRadius: 4, marginLeft: 5 },
  pillText: { fontSize: 6.8, fontWeight: 700, letterSpacing: 0.8, lineHeight: 1.2 },
  cardId: { fontSize: 7.5, fontWeight: 700, color: BRAND.emerald, letterSpacing: 1, lineHeight: 1.3, marginBottom: 3 },
  cardMeta: { fontSize: 8.6, color: BRAND.s500, lineHeight: 1.4, marginBottom: 10 },

  statRow: { flexDirection: "row", marginBottom: 8 },
  stat: { flex: 1 },
  statLabel: { fontSize: 6.6, fontWeight: 700, color: BRAND.s400, letterSpacing: 0.9, lineHeight: 1.3, marginBottom: 2 },
  statValue: { fontSize: 9.2, fontWeight: 700, color: BRAND.slate, lineHeight: 1.3 },

  track: { height: 5, backgroundColor: BRAND.border, borderRadius: 3, marginTop: 2 },
  fill: { height: 5, backgroundColor: BRAND.emerald, borderRadius: 3 },
});

function today() {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PortfolioReportPDF({ projects, title = "Portfolio Report", financials = {} }: { projects: ApiProject[]; logoUrl?: string; title?: string; financials?: Record<string, { income: number; expenses: number }> }) {
  const ongoing = projects.filter((p) => p.status === "Ongoing" || p.status === "Active").length;
  const completed = projects.filter((p) => p.status === "Completed" || p.status === "Closed").length;
  const fin = (id: string) => financials[id] || { income: 0, expenses: 0 };
  const totalIncome = projects.reduce((sum, p) => sum + fin(p.id).income, 0);
  const totalExpenses = projects.reduce((sum, p) => sum + fin(p.id).expenses, 0);
  const totalProfit = totalIncome - totalExpenses;

  return (
    <Document title={title} author="GreenTech USA LLC">
      <Page size="A4" style={s.page} wrap>
        <LetterheadHeader />

        <View style={s.head}>
          <Eyebrow>PORTFOLIO REPORT</Eyebrow>
          <Text style={s.date}>{today()}</Text>
        </View>
        <Text style={s.title}>{title}</Text>
        <GradBar w={120} h={4} r={2} id="portfolio-title" />
        <Text style={s.subtitle}>{projects.length} project{projects.length === 1 ? "" : "s"} across the portfolio.</Text>

        <KpiRow items={[
          { label: "TOTAL PROJECTS", value: String(projects.length) },
          { label: "ONGOING", value: String(ongoing) },
          { label: "COMPLETED", value: String(completed) },
        ]} />
        <KpiRow items={[
          { label: "TOTAL INCOME (INVOICED)", value: money(totalIncome) },
          { label: "TOTAL EXPENSES", value: money(totalExpenses) },
          { label: totalProfit >= 0 ? "NET PROFIT" : "NET LOSS", value: money(totalProfit), tone: totalProfit >= 0 ? BRAND.emerald : RED },
        ]} />

        <SectionHeading title="Projects" />

        {projects.map((p) => {
          const progress = Math.max(0, Math.min(100, p.progress ?? 0));
          const [bg, fg] = STATUS_TONE[p.status] || STATUS_TONE.Planning;
          const f = fin(p.id);
          const profit = f.income - f.expenses;
          const pl = profit >= 0;
          return (
            <View key={p.id} style={s.card} wrap={false}>
              <View style={s.cardHead}>
                <Text style={s.cardName}>{p.name}</Text>
                <View style={s.pills}>
                  <View style={[s.pill, { backgroundColor: pl ? "#D1FAE5" : "#FEE2E2" }]}><Text style={[s.pillText, { color: pl ? "#047857" : "#B91C1C" }]}>{pl ? "PROFIT" : "LOSS"}</Text></View>
                  <View style={[s.pill, { backgroundColor: bg }]}><Text style={[s.pillText, { color: fg }]}>{(p.status || "-").toUpperCase()}</Text></View>
                </View>
              </View>
              <Text style={s.cardId}>{p.id}</Text>
              <Text style={s.cardMeta}>{p.location || "-"}   ·   {projectCategories(p).join(", ") || "-"}   ·   Owner: {p.owner || "-"}</Text>

              <View style={s.statRow}>
                <View style={s.stat}><Text style={s.statLabel}>PROJECT VALUE</Text><Text style={s.statValue}>{p.value || "-"}</Text></View>
                <View style={s.stat}><Text style={s.statLabel}>INCOME (INVOICED)</Text><Text style={s.statValue}>{money(f.income)}</Text></View>
                <View style={s.stat}><Text style={s.statLabel}>EXPENSES</Text><Text style={s.statValue}>{money(f.expenses)}</Text></View>
                <View style={s.stat}><Text style={s.statLabel}>{pl ? "PROFIT" : "LOSS"}</Text><Text style={[s.statValue, { color: pl ? "#047857" : "#B91C1C" }]}>{money(profit)}</Text></View>
              </View>
              <View style={s.statRow}>
                <View style={s.stat}><Text style={s.statLabel}>START</Text><Text style={s.statValue}>{p.startDate || "-"}</Text></View>
                <View style={s.stat}><Text style={s.statLabel}>TARGET END</Text><Text style={s.statValue}>{p.endDate || "-"}</Text></View>
                <View style={s.stat}><Text style={s.statLabel}>TEAM</Text><Text style={s.statValue}>{p.assignedEmployees?.length ?? 0}</Text></View>
                <View style={s.stat}><Text style={s.statLabel}>PROGRESS</Text><Text style={s.statValue}>{progress}%</Text></View>
              </View>
              <View style={s.track}><View style={[s.fill, { width: `${progress}%` }]} /></View>
            </View>
          );
        })}

        <LetterheadFooter note={title} />
        <View fixed style={s.pageNoRow}>
          <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
