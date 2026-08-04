import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ApiResume } from "../../lib/api";
import { withFileToken } from "../../lib/api";

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

  // Identity row
  idRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  photo: { width: 64, height: 64, borderRadius: 8, objectFit: "cover", marginRight: 14 },
  name: { fontSize: 22, fontWeight: 700 },
  jobTitle: { fontSize: 11, color: PRIMARY, fontWeight: 700, marginTop: 2 },
  contactLine: { fontSize: 9, color: MUTED, marginTop: 4 },

  sectionTitle: { fontSize: 12, fontWeight: 700, color: INK, marginBottom: 6, marginTop: 14, paddingBottom: 4, borderBottom: `1 solid ${LINE}` },
  para: { fontSize: 10, marginBottom: 6, color: "#1f2937" },

  // Key Personnel data grid (GT template header block)
  keyGrid: { borderTop: `1 solid ${LINE}`, borderBottom: `1 solid ${LINE}`, paddingVertical: 6, marginBottom: 6 },
  keyRow: { flexDirection: "row", paddingVertical: 2 },
  keyLabel: { width: "38%", fontSize: 9, color: MUTED },
  keyValue: { flex: 1, fontSize: 9.5, color: INK, fontWeight: 700 },

  card: { backgroundColor: SOFT, borderRadius: 6, padding: 10, marginBottom: 7, borderLeft: `3 solid ${PRIMARY}` },
  cardTitle: { fontSize: 11, fontWeight: 700 },
  cardMeta: { fontSize: 9, color: MUTED, marginTop: 2 },
  cardBody: { fontSize: 9.5, color: "#1f2937", marginTop: 4 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: { backgroundColor: SOFT, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 8, fontSize: 9, color: INK, marginRight: 4, marginBottom: 4 },

  footer: { position: "absolute", bottom: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTop: `1 solid ${LINE}`, paddingTop: 8 },
  footerText: { fontSize: 8, color: MUTED },
});

export interface ResumePerson {
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
}

const span = (start: string, end: string) => [start, end].filter(Boolean).join(" → ") || "";

/**
 * The body of one resume (no Document/Page) — used by the standalone resume PDF
 * and embedded in the technical proposal's "Team Resumes" pages.
 */
export function ResumeBlock({ resume, person }: { resume: ApiResume; person: ResumePerson }) {
  const photo = resume.showPhoto === false ? "" : (resume.photoUrl || person.avatarUrl || "");
  const contact = [
    resume.contact?.email || person.email,
    resume.contact?.phone || person.phone,
    resume.contact?.location,
  ].filter(Boolean).join("   ·   ");
  // GT "Key Personnel Data" rows (only render the ones that are filled in).
  const keyRows: Array<[string, string]> = ([
    ["Assignment on this project", resume.assignmentOnProject || ""],
    ["Years of experience", resume.yearsOfExperience || ""],
    ["Citizenship / Residency", resume.citizenship || ""],
    ["Remark", resume.remark || ""],
  ] as Array<[string, string]>).filter(([, v]) => !!v && v.trim());

  return (
    <View>
      {/* Identity */}
      <View style={styles.idRow}>
        {!!photo && <Image src={withFileToken(photo)} style={styles.photo} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{person.name || "—"}</Text>
          {!!resume.title && <Text style={styles.jobTitle}>{resume.title}</Text>}
          {!!contact && <Text style={styles.contactLine}>{contact}</Text>}
        </View>
      </View>

      {keyRows.length > 0 && (
        <View style={styles.keyGrid}>
          {keyRows.map(([k, v], i) => (
            <View key={i} style={styles.keyRow}>
              <Text style={styles.keyLabel}>{k}</Text>
              <Text style={styles.keyValue}>{v}</Text>
            </View>
          ))}
        </View>
      )}

      {!!resume.summary?.trim() && (
        <>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.para}>{resume.summary}</Text>
        </>
      )}

      {resume.projects.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>List of Relevant Projects</Text>
          {resume.projects.map((p, i) => {
            const idLine = [p.client ? `Client: ${p.client}` : "", p.solicitationNo ? `Solicitation #${p.solicitationNo}` : "", p.contractNo ? `Contract #${p.contractNo}` : ""].filter(Boolean).join("  ·  ");
            const metaLine = [p.employer, p.role, span(p.start, p.end)].filter(Boolean).join("  ·  ");
            return (
              <View key={i} style={styles.card} wrap={false}>
                <Text style={styles.cardTitle}>{p.name || "—"}</Text>
                {!!metaLine && <Text style={styles.cardMeta}>{metaLine}</Text>}
                {!!idLine && <Text style={styles.cardMeta}>{idLine}</Text>}
                {!!p.description && <Text style={styles.cardBody}>{p.description}</Text>}
                {!!p.cost && <Text style={styles.cardMeta}>Cost: {p.cost}</Text>}
              </View>
            );
          })}
        </>
      )}

      {resume.experience.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Other Professional Experience</Text>
          {resume.experience.map((e, i) => (
            <View key={i} style={styles.card} wrap={false}>
              <Text style={styles.cardTitle}>{e.role || "—"}{e.company ? ` — ${e.company}` : ""}</Text>
              {!!span(e.start, e.end) && <Text style={styles.cardMeta}>{span(e.start, e.end)}</Text>}
              {!!e.description && <Text style={styles.cardBody}>{e.description}</Text>}
            </View>
          ))}
        </>
      )}

      {resume.education.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Education</Text>
          {resume.education.map((e, i) => (
            <View key={i} style={styles.card} wrap={false}>
              <Text style={styles.cardTitle}>{[e.degree, e.field].filter(Boolean).join(", ") || "—"}</Text>
              <Text style={styles.cardMeta}>{[e.school, span(e.start, e.end)].filter(Boolean).join("  ·  ")}</Text>
            </View>
          ))}
        </>
      )}

      {resume.skills.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Skills</Text>
          <View style={styles.chipRow}>
            {resume.skills.map((s, i) => <Text key={i} style={styles.chip}>{s}</Text>)}
          </View>
        </>
      )}

      {resume.certifications.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Certifications & Licenses</Text>
          {resume.certifications.map((c, i) => (
            <Text key={i} style={styles.para}>•  {[c.name, c.issuer, c.year].filter(Boolean).join("  ·  ")}</Text>
          ))}
        </>
      )}

      {resume.languages.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Languages</Text>
          <Text style={styles.para}>{resume.languages.map((l) => [l.name, l.level].filter(Boolean).join(" — ")).join("   ·   ")}</Text>
        </>
      )}

      {resume.customSections.map((s, i) => (
        (s.heading || s.body) ? (
          <View key={`cs-${i}`}>
            <Text style={styles.sectionTitle}>{s.heading || "More"}</Text>
            <Text style={styles.para}>{s.body}</Text>
          </View>
        ) : null
      ))}
    </View>
  );
}

/** Standalone branded resume PDF, downloaded from the profile page. */
export default function ResumePDF({ resume, person, logoUrl }: { resume: ApiResume; person: ResumePerson; logoUrl?: string }) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          {logoUrl ? <Image src={logoUrl} style={styles.brandLogo} /> : <Text style={{ fontWeight: 700 }}>GreenTech USA</Text>}
          <View style={styles.headerRight}>
            <Text style={styles.reportLabel}>RESUME</Text>
            <Text style={styles.reportDate}>{new Date().toISOString().slice(0, 10)}</Text>
          </View>
        </View>

        <ResumeBlock resume={resume} person={person} />

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>GreenTech USA — Construction & Engineering</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
