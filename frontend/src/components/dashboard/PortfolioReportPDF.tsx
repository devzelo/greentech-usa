import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ApiProject } from "../../lib/api";

const PRIMARY = "#10B981";
const INK = "#0f172a";
const MUTED = "#64748b";
const SUBTLE = "#94a3b8";
const LINE = "#e7ebf0";
const SOFT = "#f8fafc";

// Status → pill colors (background, text)
const STATUS_COLORS: Record<string, [string, string]> = {
  Ongoing: ["#dbeafe", "#1d4ed8"],
  Completed: ["#d1fae5", "#047857"],
  Pending: ["#fef3c7", "#b45309"],
  Planning: ["#e2e8f0", "#475569"],
  Draft: ["#f1f5f9", "#64748b"],
};

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

  title: { fontSize: 22, fontWeight: 700, color: INK, lineHeight: 1.2, marginBottom: 8 },
  subtitle: { fontSize: 10, color: MUTED, marginBottom: 24 },

  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 26 },
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
  kpiValue: { fontSize: 16, fontWeight: 700, color: INK },

  sectionTitle: {
    fontSize: 8.5,
    color: MUTED,
    letterSpacing: 1.5,
    fontWeight: 700,
    marginBottom: 10,
    paddingBottom: 5,
    borderBottom: `1 solid ${LINE}`,
  },

  // Project card
  card: { borderRadius: 8, padding: 14, marginBottom: 10, border: `1 solid ${LINE}` },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  cardName: { fontSize: 12, fontWeight: 700, color: INK, flex: 1, paddingRight: 10 },
  statusPill: { fontSize: 7, fontWeight: 700, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, letterSpacing: 0.8, lineHeight: 1 },
  cardId: { fontSize: 7.5, color: PRIMARY, fontWeight: 700, letterSpacing: 1, marginBottom: 4 },
  cardMeta: { fontSize: 9, color: MUTED, marginBottom: 12 },

  statRow: { flexDirection: "row", marginBottom: 12 },
  stat: { flex: 1 },
  statLabel: { fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 3 },
  statValue: { fontSize: 9.5, fontWeight: 700, color: INK },

  progressTrack: { height: 6, backgroundColor: "#e2e8f0", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: PRIMARY, borderRadius: 3 },

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
});

function today() {
  return new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PortfolioReportPDF({ projects, logoUrl, title = "Portfolio Report", financials = {} }: { projects: ApiProject[]; logoUrl?: string; title?: string; financials?: Record<string, { income: number; expenses: number }> }) {
  const ongoing = projects.filter((p) => p.status === "Ongoing").length;
  const completed = projects.filter((p) => p.status === "Completed").length;
  const fin = (id: string) => financials[id] || { income: 0, expenses: 0 };
  const totalIncome = projects.reduce((s, p) => s + fin(p.id).income, 0);
  const totalExpenses = projects.reduce((s, p) => s + fin(p.id).expenses, 0);
  const totalProfit = totalIncome - totalExpenses;

  return (
    <Document title={title} author="GreenTech USA">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header} fixed>
          {logoUrl ? <Image src={logoUrl} style={styles.brandLogo} /> : <Text style={{ fontSize: 14, fontWeight: 700 }}>GreenTech USA</Text>}
          <View style={styles.headerRight}>
            <Text style={styles.reportLabel}>PORTFOLIO REPORT</Text>
            <Text style={styles.reportDate}>{today()}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{projects.length} project{projects.length === 1 ? "" : "s"} across the portfolio.</Text>

        {/* KPIs — counts */}
        <View style={[styles.kpiRow, { marginBottom: 10 }]}>
          <View style={styles.kpiCard}><Text style={styles.kpiLabel}>TOTAL PROJECTS</Text><Text style={styles.kpiValue}>{projects.length}</Text></View>
          <View style={styles.kpiCard}><Text style={styles.kpiLabel}>ONGOING</Text><Text style={styles.kpiValue}>{ongoing}</Text></View>
          <View style={styles.kpiCard}><Text style={styles.kpiLabel}>COMPLETED</Text><Text style={styles.kpiValue}>{completed}</Text></View>
        </View>
        {/* KPIs — portfolio financials */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}><Text style={styles.kpiLabel}>TOTAL INCOME (INVOICED)</Text><Text style={[styles.kpiValue, { fontSize: 13 }]}>{money(totalIncome)}</Text></View>
          <View style={styles.kpiCard}><Text style={styles.kpiLabel}>TOTAL EXPENSES</Text><Text style={[styles.kpiValue, { fontSize: 13 }]}>{money(totalExpenses)}</Text></View>
          <View style={[styles.kpiCard, { borderLeft: `3 solid ${totalProfit >= 0 ? PRIMARY : "#ef4444"}` }]}>
            <Text style={styles.kpiLabel}>NET {totalProfit >= 0 ? "PROFIT" : "LOSS"}</Text>
            <Text style={[styles.kpiValue, { fontSize: 13, color: totalProfit >= 0 ? PRIMARY : "#ef4444" }]}>{money(totalProfit)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>PROJECTS</Text>

        {projects.map((p) => {
          const progress = Math.max(0, Math.min(100, p.progress ?? 0));
          const [bg, fg] = STATUS_COLORS[p.status] || STATUS_COLORS.Planning;
          const f = fin(p.id);
          const profit = f.income - f.expenses;
          const pl = profit >= 0;
          return (
            <View key={p.id} style={styles.card} wrap={false}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardName}>{p.name}</Text>
                <Text style={[styles.statusPill, { backgroundColor: pl ? "#d1fae5" : "#fee2e2", color: pl ? "#047857" : "#b91c1c" }]}>{pl ? "PROFIT" : "LOSS"}</Text>
                <Text style={[styles.statusPill, { backgroundColor: bg, color: fg, marginLeft: 5 }]}>{(p.status || "—").toUpperCase()}</Text>
              </View>
              <Text style={styles.cardId}>{p.id}</Text>
              <Text style={styles.cardMeta}>
                {p.location || "—"}   •   {p.category || "—"}   •   Owner: {p.owner || "—"}
              </Text>

              {/* Financials */}
              <View style={styles.statRow}>
                <View style={styles.stat}><Text style={styles.statLabel}>PROJECT VALUE</Text><Text style={styles.statValue}>{p.value || "—"}</Text></View>
                <View style={styles.stat}><Text style={styles.statLabel}>INCOME (INVOICED)</Text><Text style={styles.statValue}>{money(f.income)}</Text></View>
                <View style={styles.stat}><Text style={styles.statLabel}>EXPENSES</Text><Text style={styles.statValue}>{money(f.expenses)}</Text></View>
                <View style={styles.stat}><Text style={styles.statLabel}>{pl ? "PROFIT" : "LOSS"}</Text><Text style={[styles.statValue, { color: pl ? "#047857" : "#b91c1c" }]}>{money(profit)}</Text></View>
              </View>

              <View style={styles.statRow}>
                <View style={styles.stat}><Text style={styles.statLabel}>START</Text><Text style={styles.statValue}>{p.startDate || "—"}</Text></View>
                <View style={styles.stat}><Text style={styles.statLabel}>TARGET END</Text><Text style={styles.statValue}>{p.endDate || "—"}</Text></View>
                <View style={styles.stat}><Text style={styles.statLabel}>TEAM</Text><Text style={styles.statValue}>{p.assignedEmployees?.length ?? 0}</Text></View>
                <View style={styles.stat}><Text style={styles.statLabel}>PROGRESS</Text><Text style={styles.statValue}>{progress}%</Text></View>
              </View>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
            </View>
          );
        })}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>GreenTech USA LLC  ·  Chantilly, Virginia  ·  info@gt-usa.com</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
