import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ApiResume, ResumeProject } from "../../lib/api";
import { withFileToken } from "../../lib/api";
import { BRAND, GUTTER, LETTERHEAD_PAGE, registerBrandFonts, LetterheadHeader, LetterheadFooter } from "../pdf/brand";

registerBrandFonts();

/**
 * A resume in the client's "KEY PERSONNEL – RESUME DATA" format (GT Resume Template): the numbered
 * fields 1 to 9, the relevant-projects table and the other-experience table, set in the brand kit's
 * design. Compact (item 98: "fit to one page, two maximum, smaller font, tighter spacing") so every
 * resume in a proposal looks the same.
 */
const styles = StyleSheet.create({
  // No lineHeight on the page (or a wrapping View): the page number would inherit it and then
  // never print. Each text style below sets its own.
  page: { ...LETTERHEAD_PAGE, fontFamily: "Inter", fontSize: 9, color: BRAND.s700 },
  // react-pdf never prints a render-prop Text that has ANY lineHeight (own or inherited), so this
  // one has none; the font's own leading puts it 0.8 pt lower to share the footer note's baseline.
  pageNoRow: { position: "absolute", left: GUTTER, right: GUTTER, bottom: 17.2, flexDirection: "row", justifyContent: "flex-end" },
  pageNo: { fontSize: 7.5, color: BRAND.s500 },

  docTitle: { fontFamily: "Outfit", fontSize: 13, fontWeight: 700, color: BRAND.slate, letterSpacing: 0.4, lineHeight: 1.3, marginBottom: 8 },

  // Numbered field grid (fields 1 to 6)
  grid: { borderTop: `0.8 solid ${BRAND.border}`, borderLeft: `0.8 solid ${BRAND.border}`, marginBottom: 10 },
  gridRow: { flexDirection: "row" },
  field: { flex: 1, paddingVertical: 5, paddingHorizontal: 7, borderRight: `0.8 solid ${BRAND.border}`, borderBottom: `0.8 solid ${BRAND.border}` },
  fieldLabel: { fontSize: 6.6, fontWeight: 700, color: BRAND.s500, letterSpacing: 0.8, lineHeight: 1.3, marginBottom: 2 },
  fieldValue: { fontSize: 9.2, fontWeight: 700, color: BRAND.slate, lineHeight: 1.35 },
  fieldText: { fontSize: 8.6, color: BRAND.s700, lineHeight: 1.35 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  photo: { width: 30, height: 30, borderRadius: 4, objectFit: "cover", marginRight: 7 },

  // Numbered headings (7, 8, 9)
  heading: { flexDirection: "row", alignItems: "baseline", borderBottom: `1.2 solid ${BRAND.emerald}`, paddingBottom: 3, marginTop: 8, marginBottom: 5 },
  headingNum: { fontSize: 9.5, fontWeight: 700, color: BRAND.emerald, lineHeight: 1.3, marginRight: 5 },
  headingText: { fontSize: 9.5, fontWeight: 700, color: BRAND.slate, letterSpacing: 0.4, lineHeight: 1.3 },
  para: { fontSize: 8.8, color: BRAND.s700, marginBottom: 4, lineHeight: 1.45 },

  // Tables (8, 9)
  tHead: { flexDirection: "row", backgroundColor: BRAND.slate },
  th: { fontSize: 6.8, fontWeight: 700, color: BRAND.white, letterSpacing: 0.6, lineHeight: 1.3, paddingVertical: 4, paddingHorizontal: 5 },
  tRow: { flexDirection: "row", borderBottom: `0.6 solid ${BRAND.border}` },
  tRowAlt: { backgroundColor: BRAND.mist },
  td: { fontSize: 8.3, color: BRAND.slate, paddingVertical: 4, paddingHorizontal: 5, lineHeight: 1.35 },
  kv: { fontSize: 8.3, color: BRAND.s700, lineHeight: 1.35 },
  kvKey: { fontWeight: 700, color: BRAND.slate },
  bullet: { fontSize: 8.3, color: BRAND.s700, lineHeight: 1.35, paddingLeft: 7 },

  extra: { fontSize: 8.3, color: BRAND.s700, lineHeight: 1.45, marginBottom: 2 },
});

export interface ResumePerson {
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
}

const span = (start: string, end: string) => [start, end].filter(Boolean).join(" – ");
const val = (s?: string) => (s && s.trim()) || "";

function Field({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{n}. {label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Heading({ n, title }: { n?: number; title: string }) {
  return (
    <View style={styles.heading} minPresenceAhead={70}>
      {n !== undefined && <Text style={styles.headingNum}>{n}.</Text>}
      <Text style={styles.headingText}>{title.toUpperCase()}</Text>
    </View>
  );
}

/** The Project Name / Scope cell: Project, Client, Solicitation #, Contract #, Scope, value, cost. */
function ProjectCell({ p }: { p: ResumeProject }) {
  const kv = ([["Project", p.name], ["Client", p.client], ["Solicitation #", p.solicitationNo], ["Contract #", p.contractNo]] as Array<[string, string | undefined]>)
    .filter(([, v]) => !!val(v));
  const scope = val(p.description).split(/\n+/).map((l) => l.replace(/^[\s•▪\-*]+/, "").trim()).filter(Boolean);
  return (
    <View>
      {kv.map(([k, v]) => <Text key={k} style={styles.kv}><Text style={styles.kvKey}>{k}: </Text>{v}</Text>)}
      {scope.length > 0 && <Text style={styles.kv}><Text style={styles.kvKey}>Scope:</Text></Text>}
      {scope.map((l, i) => <Text key={i} style={styles.bullet}>•  {l}</Text>)}
      {!!val(p.value) && <Text style={styles.kv}><Text style={styles.kvKey}>Project value: </Text>{p.value}</Text>}
      {!!val(p.cost) && <Text style={styles.kv}><Text style={styles.kvKey}>Cost: </Text>{p.cost}</Text>}
    </View>
  );
}

/**
 * The body of one resume (no Document/Page), used by the standalone resume PDF and on the
 * proposal's team-resume pages. `assignment` overrides field 3 with the role in this proposal.
 */
export function ResumeBlock({ resume, person, assignment }: { resume: ApiResume; person: ResumePerson; assignment?: string }) {
  const photo = resume.showPhoto === false ? "" : (resume.photoUrl || person.avatarUrl || "");
  const education = resume.education
    .map((e) => [[e.degree, e.field].filter(Boolean).join(" "), e.school, e.end || e.start].filter(Boolean).join(", "))
    .filter(Boolean);
  const citizen = val(resume.citizenship);
  const remark = [val(resume.remark), citizen && !val(resume.remark).toLowerCase().includes(citizen.toLowerCase()) ? `Citizenship: ${citizen}` : ""].filter(Boolean);
  const summary = val(resume.summary).split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const extras = [
    ...resume.certifications.map((c) => [c.name, c.issuer, c.year].filter(Boolean).join(", ")).filter(Boolean).map((t) => ({ k: "Certification", t })),
    ...(resume.languages.length ? [{ k: "Languages", t: resume.languages.map((l) => [l.name, l.level].filter(Boolean).join(" (") + (l.level ? ")" : "")).join(", ") }] : []),
    ...(resume.skills.length ? [{ k: "Skills", t: resume.skills.join(", ") }] : []),
  ];
  const custom = resume.customSections.filter((s) => val(s.heading) || val(s.body));

  return (
    <View>
      <Text style={styles.docTitle}>KEY PERSONNEL – RESUME DATA</Text>

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <Field n={1} label="Name">
            <View style={styles.nameRow}>
              {!!photo && <Image src={withFileToken(photo)} style={styles.photo} />}
              <Text style={styles.fieldValue}>{person.name || "-"}</Text>
            </View>
          </Field>
          <Field n={2} label="Title"><Text style={styles.fieldValue}>{val(resume.title) || "-"}</Text></Field>
        </View>
        <View style={styles.gridRow}>
          <Field n={3} label="Assignment on this project"><Text style={styles.fieldValue}>{val(assignment) || val(resume.assignmentOnProject) || "-"}</Text></Field>
          <Field n={4} label="Years of experience"><Text style={styles.fieldValue}>{val(resume.yearsOfExperience) || "-"}</Text></Field>
        </View>
        <View style={styles.gridRow}>
          <Field n={5} label="Education (degree, year)">{education.length ? education.map((e, i) => <Text key={i} style={styles.fieldText}>{e}</Text>) : <Text style={styles.fieldText}>-</Text>}</Field>
          <Field n={6} label="Remark">{remark.length ? remark.map((r, i) => <Text key={i} style={styles.fieldText}>{r}</Text>) : <Text style={styles.fieldText}>-</Text>}</Field>
        </View>
      </View>

      {summary.length > 0 && (
        <>
          <Heading n={7} title="Summary" />
          {summary.map((s, i) => <Text key={i} style={styles.para}>{s}</Text>)}
        </>
      )}

      {resume.projects.length > 0 && (
        <>
          {/* Heading and column heads never part; the first row follows them. */}
          <View wrap={false} minPresenceAhead={40}>
            <Heading n={8} title="List of relevant projects" />
            <View style={styles.tHead}>
            <Text style={[styles.th, { width: "16%" }]}>YEAR</Text>
            <Text style={[styles.th, { width: "16%" }]}>EMPLOYER</Text>
            <Text style={[styles.th, { width: "18%" }]}>POSITION HELD</Text>
            <Text style={[styles.th, { width: "50%" }]}>PROJECT NAME / SCOPE</Text>
            </View>
          </View>
          {resume.projects.map((p, i) => (
            <View key={i} style={[styles.tRow, i % 2 === 1 ? styles.tRowAlt : {}]} wrap={false}>
              <Text style={[styles.td, { width: "16%" }]}>{span(p.start, p.end) || "-"}</Text>
              <Text style={[styles.td, { width: "16%" }]}>{val(p.employer) || "-"}</Text>
              <Text style={[styles.td, { width: "18%" }]}>{val(p.role) || "-"}</Text>
              <View style={[styles.td, { width: "50%" }]}><ProjectCell p={p} /></View>
            </View>
          ))}
        </>
      )}

      {resume.experience.length > 0 && (
        <>
          <View wrap={false} minPresenceAhead={40}>
            <Heading n={9} title="Other professional experience" />
            <View style={styles.tHead}>
            <Text style={[styles.th, { width: "14%" }]}>FROM</Text>
            <Text style={[styles.th, { width: "14%" }]}>TO</Text>
            <Text style={[styles.th, { width: "72%" }]}>EMPLOYER / TITLE</Text>
            </View>
          </View>
          {resume.experience.map((e, i) => (
            <View key={i} style={[styles.tRow, i % 2 === 1 ? styles.tRowAlt : {}]} wrap={false}>
              <Text style={[styles.td, { width: "14%" }]}>{val(e.start) || "-"}</Text>
              <Text style={[styles.td, { width: "14%" }]}>{val(e.end) || "-"}</Text>
              <View style={[styles.td, { width: "72%" }]}>
                <Text style={styles.kv}><Text style={styles.kvKey}>Employer: </Text>{val(e.company) || "-"}</Text>
                <Text style={styles.kv}><Text style={styles.kvKey}>Title: </Text>{val(e.role) || "-"}</Text>
                {!!val(e.description) && <Text style={styles.kv}>{e.description}</Text>}
              </View>
            </View>
          ))}
        </>
      )}

      {/* Anything else on the record (licences, languages, skills, extra sections) stays, briefly. */}
      {(extras.length > 0 || custom.length > 0) && (
        <>
          <Heading title="Additional information" />
          {extras.map((x, i) => <Text key={i} style={styles.extra}><Text style={styles.kvKey}>{x.k}: </Text>{x.t}</Text>)}
          {custom.map((s, i) => <Text key={`c-${i}`} style={styles.extra}><Text style={styles.kvKey}>{val(s.heading) || "More"}: </Text>{s.body}</Text>)}
        </>
      )}
    </View>
  );
}

/** Standalone resume PDF, downloaded from a profile: on the client-approved letterhead. */
export default function ResumePDF({ resume, person }: { resume: ApiResume; person: ResumePerson; logoUrl?: string }) {
  return (
    <Document title={`${person.name || "Resume"} - Resume`} author="GreenTech USA LLC">
      <Page size="LETTER" style={styles.page} wrap>
        <LetterheadHeader />
        <ResumeBlock resume={resume} person={person} />
        <LetterheadFooter note={`Resume · ${person.name || ""}`} />
        <View fixed style={styles.pageNoRow}>
          <Text style={styles.pageNo} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
