/**
 * Generates public/downloads/greentech-factsheet.pdf and greentech-profile.pdf
 * from React-PDF components. Re-run this whenever the company content changes.
 *
 *   npx tsx scripts/generateCompanyPDFs.tsx
 */
import path from "path";
import fs from "fs";
import { renderToFile, Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import React from "react";

const PRIMARY = "#10B981";
const SECONDARY = "#3B82F6";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#0f172a", fontFamily: "Helvetica", lineHeight: 1.5 },
  cover: {
    padding: 0,
    fontSize: 10,
    color: "#0f172a",
    fontFamily: "Helvetica",
    backgroundColor: "#0f172a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
    borderBottom: `2 solid ${PRIMARY}`,
    paddingBottom: 12,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 40, height: 40 },
  brandName: { fontSize: 18, fontWeight: 700 },
  brandSub: { fontSize: 8, color: "#64748b", letterSpacing: 1.5, marginTop: 3 },
  docLabel: { fontSize: 8, color: "#64748b", letterSpacing: 1.5, textAlign: "right" },
  docDate: { fontSize: 9, fontWeight: 700, marginTop: 2, textAlign: "right" },

  h1: { fontSize: 28, fontWeight: 700, marginBottom: 8 },
  lead: { fontSize: 11, color: "#475569", marginBottom: 22, lineHeight: 1.6 },

  // KPIs
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 28 },
  kpiCard: { flex: 1, backgroundColor: "#f8fafc", borderRadius: 8, padding: 14, borderLeft: `3 solid ${PRIMARY}` },
  kpiValue: { fontSize: 22, fontWeight: 700 },
  kpiLabel: { fontSize: 7, color: "#64748b", letterSpacing: 1.5, marginTop: 4 },

  // Section
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 9,
    color: "#64748b",
    letterSpacing: 1.5,
    fontWeight: 700,
    marginBottom: 8,
    borderBottom: "1 solid #e2e8f0",
    paddingBottom: 4,
  },
  body: { fontSize: 10, color: "#334155", lineHeight: 1.6 },

  // Service grid
  servicesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  serviceCard: {
    width: "31.5%",
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    padding: 10,
    borderLeft: `2 solid ${PRIMARY}`,
  },
  serviceTitle: { fontSize: 10, fontWeight: 700, marginBottom: 3 },
  serviceDesc: { fontSize: 8, color: "#64748b", lineHeight: 1.5 },

  // Footer
  footer: {
    position: "absolute",
    bottom: 25,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#94a3b8",
    paddingTop: 8,
    borderTop: "1 solid #e2e8f0",
  },

  // Cover page
  coverInner: { padding: 60, height: "100%", justifyContent: "space-between" },
  coverTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  coverBrand: { fontSize: 18, color: "#ffffff", fontWeight: 700 },
  coverBrandSub: { fontSize: 8, color: PRIMARY, letterSpacing: 1.5, marginTop: 4 },
  coverMid: { marginTop: 80 },
  coverTitle: { fontSize: 42, color: "#ffffff", fontWeight: 700, lineHeight: 1.1 },
  coverTitleAccent: { color: PRIMARY },
  coverSub: { color: "#cbd5e1", fontSize: 13, marginTop: 18, maxWidth: 380, lineHeight: 1.5 },
  coverBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  coverFootLabel: { color: "#94a3b8", fontSize: 8, letterSpacing: 1.5 },
  coverFootVal: { color: "#ffffff", fontSize: 11, fontWeight: 700, marginTop: 4 },

  // Contact strip
  contactStrip: {
    flexDirection: "row",
    gap: 14,
    backgroundColor: PRIMARY,
    padding: 16,
    borderRadius: 8,
    marginTop: 12,
  },
  contactCol: { flex: 1 },
  contactLabel: { fontSize: 7, color: "#ffffff", letterSpacing: 1.5, opacity: 0.8 },
  contactValue: { fontSize: 10, color: "#ffffff", fontWeight: 700, marginTop: 3 },
});

function today() {
  return new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const COMPANY = {
  name: "GreenTech USA LLC",
  tagline: "Environmental Engineering & General Contracting",
  founded: 2009,
  hq: "Chantilly, Virginia, USA",
  cage: "8ZJ10",
  duns: "FYR1QQ8L3SM7",
  email: "info@gt-usa.com",
  phone: "+1 (703) 555-0123",
  website: "gt-usa.com",
};

const ABOUT = `Established in 2009, GreenTech USA LLC is a premier general contractor and environmental engineering firm headquartered in Virginia, USA. We design, construct, and maintain water and wastewater treatment facilities, deliver comprehensive environmental assessments, and engineer advanced commercial HVAC systems. Our commitment to innovation, excellence, and sustainability has positioned us as a trusted partner to the United States government and to clients across Africa and the Middle East — with expanding reach into global markets.`;

const VISION = `To provide cutting-edge engineering solutions and unwavering support to the US government and to areas often marked by conflict and instability — addressing critical infrastructure needs in challenging zones.`;

const MISSION = `As a trusted partner to the US government, we deliver comprehensive water and wastewater solutions that prioritize efficiency, sustainability, and innovation — designing, constructing, and maintaining state-of-the-art treatment facilities that adhere to the highest standards of quality and environmental responsibility.`;

const SERVICES = [
  { title: "General Contracting", desc: "Primary oversight of complex construction programs — delivered on time and within budget." },
  { title: "Environmental Engineering", desc: "Assessments and creative engineering for sustainable, regulation-compliant outcomes." },
  { title: "Water Treatment Plant", desc: "Design and delivery of potable water facilities meeting WHO and EPA standards." },
  { title: "Wastewater Treatment", desc: "Modern WWTP design, retrofit, and operations across municipal and industrial scales." },
  { title: "Operation & Maintenance", desc: "Reliable O&M for treatment facilities with maximum uptime and predictable cost." },
  { title: "Commercial HVAC", desc: "Energy-efficient heating, ventilation, and cooling for government and commercial buildings." },
];

const STATS = [
  { value: "15+", label: "YEARS OF EXCELLENCE" },
  { value: "150+", label: "PROJECTS DELIVERED" },
  { value: "12", label: "COUNTRIES SERVED" },
  { value: "100%", label: "US-GOV CERTIFIED" },
];

const LOGO_PATH = path.join(process.cwd(), "public", "gt-usa-logo.png");
const LOGO_DATA_URL = (() => {
  try {
    const buf = fs.readFileSync(LOGO_PATH);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
})();

function HeaderBar({ label }: { label: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        {LOGO_DATA_URL ? <Image src={LOGO_DATA_URL} style={styles.logo} /> : <View />}
        <View>
          <Text style={styles.brandName}>{COMPANY.name}</Text>
          <Text style={styles.brandSub}>{COMPANY.tagline.toUpperCase()}</Text>
        </View>
      </View>
      <View>
        <Text style={styles.docLabel}>{label}</Text>
        <Text style={styles.docDate}>{today()}</Text>
      </View>
    </View>
  );
}

function FooterBar() {
  return (
    <View style={styles.footer} fixed>
      <Text>{COMPANY.name} · {COMPANY.hq} · {COMPANY.email} · CAGE {COMPANY.cage}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function ContactStrip() {
  return (
    <View style={styles.contactStrip}>
      <View style={styles.contactCol}>
        <Text style={styles.contactLabel}>HEADQUARTERS</Text>
        <Text style={styles.contactValue}>{COMPANY.hq}</Text>
      </View>
      <View style={styles.contactCol}>
        <Text style={styles.contactLabel}>EMAIL</Text>
        <Text style={styles.contactValue}>{COMPANY.email}</Text>
      </View>
      <View style={styles.contactCol}>
        <Text style={styles.contactLabel}>PHONE</Text>
        <Text style={styles.contactValue}>{COMPANY.phone}</Text>
      </View>
      <View style={styles.contactCol}>
        <Text style={styles.contactLabel}>WEB</Text>
        <Text style={styles.contactValue}>{COMPANY.website}</Text>
      </View>
    </View>
  );
}

// ─── Factsheet ────────────────────────────────────────────────────────────────
function FactsheetDoc() {
  return (
    <Document title="GreenTech USA — Company Factsheet" author={COMPANY.name}>
      <Page size="A4" style={styles.page}>
        <HeaderBar label="COMPANY FACTSHEET" />

        <Text style={styles.h1}>Company Factsheet</Text>
        <Text style={styles.lead}>
          A one-page snapshot of GreenTech USA — who we are, what we do, and the impact we deliver
          to public-sector and commercial clients worldwide.
        </Text>

        <View style={styles.kpiRow}>
          {STATS.map((s) => (
            <View key={s.label} style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{s.value}</Text>
              <Text style={styles.kpiLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ABOUT</Text>
          <Text style={styles.body}>{ABOUT}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CORE SERVICES</Text>
          <View style={styles.servicesGrid}>
            {SERVICES.map((s) => (
              <View key={s.title} style={styles.serviceCard}>
                <Text style={styles.serviceTitle}>{s.title}</Text>
                <Text style={styles.serviceDesc}>{s.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>REGISTRATION</Text>
          <Text style={styles.body}>
            CAGE Code: {COMPANY.cage}    ·    UEI: {COMPANY.duns}    ·    Founded: {COMPANY.founded}    ·    HQ: {COMPANY.hq}
          </Text>
        </View>

        <ContactStrip />

        <FooterBar />
      </Page>
    </Document>
  );
}

// ─── Company Profile (multi-page) ────────────────────────────────────────────
function ProfileDoc() {
  return (
    <Document title="GreenTech USA — Company Profile" author={COMPANY.name}>
      {/* Cover */}
      <Page size="A4" style={styles.cover}>
        <View style={styles.coverInner}>
          <View style={styles.coverTop}>
            {LOGO_DATA_URL ? <Image src={LOGO_DATA_URL} style={styles.logo} /> : <View />}
            <View>
              <Text style={styles.coverBrand}>{COMPANY.name}</Text>
              <Text style={styles.coverBrandSub}>{COMPANY.tagline.toUpperCase()}</Text>
            </View>
          </View>
          <View style={styles.coverMid}>
            <Text style={styles.coverTitle}>Engineering</Text>
            <Text style={[styles.coverTitle, styles.coverTitleAccent]}>a sustainable future.</Text>
            <Text style={styles.coverSub}>
              Trusted by the US Government and partners across Africa and the Middle East to design,
              build, and maintain critical infrastructure since 2009.
            </Text>
          </View>
          <View style={styles.coverBottom}>
            <View>
              <Text style={styles.coverFootLabel}>COMPANY PROFILE</Text>
              <Text style={styles.coverFootVal}>{today()}</Text>
            </View>
            <View>
              <Text style={styles.coverFootLabel}>WEB</Text>
              <Text style={styles.coverFootVal}>{COMPANY.website}</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* About */}
      <Page size="A4" style={styles.page}>
        <HeaderBar label="ABOUT US" />
        <Text style={styles.h1}>About GreenTech USA</Text>
        <Text style={styles.body}>{ABOUT}</Text>

        <View style={[styles.section, { marginTop: 22 }]}>
          <Text style={styles.sectionTitle}>VISION</Text>
          <Text style={styles.body}>{VISION}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MISSION</Text>
          <Text style={styles.body}>{MISSION}</Text>
        </View>

        <View style={[styles.kpiRow, { marginTop: 22 }]}>
          {STATS.map((s) => (
            <View key={s.label} style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{s.value}</Text>
              <Text style={styles.kpiLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <FooterBar />
      </Page>

      {/* Capabilities */}
      <Page size="A4" style={styles.page}>
        <HeaderBar label="CAPABILITIES" />
        <Text style={styles.h1}>What We Do</Text>
        <Text style={styles.lead}>
          A full-stack engineering practice covering design, construction, commissioning, and long-term
          operations & maintenance — anchored by water, wastewater, energy, and HVAC.
        </Text>

        <View style={styles.servicesGrid}>
          {SERVICES.map((s) => (
            <View key={s.title} style={[styles.serviceCard, { width: "48.5%" }]}>
              <Text style={styles.serviceTitle}>{s.title}</Text>
              <Text style={styles.serviceDesc}>{s.desc}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.section, { marginTop: 28 }]}>
          <Text style={styles.sectionTitle}>WHY GREENTECH USA</Text>
          <Text style={styles.body}>
            We pair US-government-grade compliance with on-the-ground delivery in challenging zones.
            Our teams are experienced in IDIQ programs, design-build wastewater works, preventive maintenance,
            grid modernization, and large-scale HVAC retrofits. Every engagement is led by a single
            accountable owner — the engineer who will sign off on safety and quality.
          </Text>
        </View>

        <FooterBar />
      </Page>

      {/* Contact */}
      <Page size="A4" style={styles.page}>
        <HeaderBar label="GET IN TOUCH" />
        <Text style={styles.h1}>Let's Build Together</Text>
        <Text style={styles.lead}>
          Whether you're planning a new water treatment program, scoping an HVAC retrofit, or need a
          partner who can deliver in challenging conditions — start the conversation today.
        </Text>

        <ContactStrip />

        <View style={[styles.section, { marginTop: 30 }]}>
          <Text style={styles.sectionTitle}>REGISTRATION & COMPLIANCE</Text>
          <Text style={styles.body}>
            CAGE Code: {COMPANY.cage}    ·    UEI: {COMPANY.duns}{"\n"}
            Established: {COMPANY.founded}    ·    HQ: {COMPANY.hq}{"\n"}
            US-government certified contractor with active registration on SAM.gov.
          </Text>
        </View>

        <FooterBar />
      </Page>
    </Document>
  );
}

async function main() {
  const outDir = path.join(process.cwd(), "public", "downloads");
  fs.mkdirSync(outDir, { recursive: true });
  const factsheetPath = path.join(outDir, "greentech-factsheet.pdf");
  const profilePath = path.join(outDir, "greentech-profile.pdf");

  await renderToFile(React.createElement(FactsheetDoc) as never, factsheetPath);
  console.log(`✅ ${factsheetPath}`);
  await renderToFile(React.createElement(ProfileDoc) as never, profilePath);
  console.log(`✅ ${profilePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
