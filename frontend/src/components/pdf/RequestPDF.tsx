import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ApiProjectRequest } from "../../lib/api";
import type { ProjectPdfInfo } from "../../lib/pdfProjectHeader";
import { assembleProposalParts, type ProposalPart } from "../../lib/proposalExport";
import { BRAND, COMPANY, LETTERHEAD_PAGE, registerBrandFonts, LetterheadHeader, LetterheadFooter, Eyebrow, GradBar, SectionHeading } from "./brand";
import RichText, { pdfAssetUrl } from "./RichText";

registerBrandFonts();

/**
 * CR-P (146)/(148) — a contract-admin request (RFI, change order, notice…) as a document in the
 * same design as the agreements: the letterhead (with the JV partner named when the project is a
 * joint venture), the type, its number and date, the subject, From and To, the project, then the
 * numbered sections (each section's files straight after it), the signatures, and our supporting
 * documents at the end. "Page i of N" runs across our own pages.
 */

type File = { name: string; filePath: string };

const s = StyleSheet.create({
  page: { ...LETTERHEAD_PAGE, fontFamily: "Inter", fontSize: 9.5, color: BRAND.s700 },

  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  metaCol: { alignItems: "flex-end", marginLeft: 16 },
  metaStrong: { fontSize: 9, fontWeight: 700, color: BRAND.slate, lineHeight: 1.45 },
  metaText: { fontSize: 8, color: BRAND.s500, lineHeight: 1.45 },
  title: { fontFamily: "Outfit", fontSize: 20, fontWeight: 700, color: BRAND.slate, lineHeight: 1.18, marginBottom: 8 },
  jvRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  jvPill: { backgroundColor: "#EEF2FF", borderRadius: 4, paddingVertical: 3, paddingHorizontal: 7, marginRight: 8 },
  jvPillText: { fontSize: 7, fontWeight: 700, color: "#4338CA", letterSpacing: 0.8, lineHeight: 1.2 },
  jvName: { fontSize: 9, fontWeight: 700, color: BRAND.slate },
  jvLogo: { height: 22, maxWidth: 110, objectFit: "contain" },

  label: { fontSize: 6.8, fontWeight: 700, color: BRAND.s400, letterSpacing: 1, lineHeight: 1.3, marginBottom: 3 },
  partyGrid: { flexDirection: "row", marginTop: 16 },
  partyCard: { width: "48.5%", borderRadius: 6, border: `0.8 solid ${BRAND.border}`, borderLeft: `3 solid ${BRAND.emerald}`, padding: 10 },
  partyName: { fontFamily: "Outfit", fontSize: 11.5, fontWeight: 700, color: BRAND.slate, lineHeight: 1.25, marginBottom: 3 },
  partyLine: { fontSize: 8.4, color: BRAND.s600, lineHeight: 1.45 },

  block: { marginTop: 14 },
  kv: { flexDirection: "row", paddingVertical: 4, borderBottom: `0.6 solid ${BRAND.border}` },
  kvLabel: { width: 120, fontSize: 7, fontWeight: 700, color: BRAND.s500, letterSpacing: 0.8, lineHeight: 1.4, paddingTop: 1 },
  kvValue: { flex: 1, fontSize: 9, color: BRAND.slate, fontWeight: 500, lineHeight: 1.4 },

  sigRow: { flexDirection: "row", marginTop: 10 },
  sigBlock: { width: "48.5%" },
  sigFor: { fontSize: 7, fontWeight: 700, color: BRAND.emerald, letterSpacing: 1, lineHeight: 1.3 },
  sigArea: { height: 46, justifyContent: "flex-end", marginTop: 4 },
  sigImg: { height: 40, maxWidth: 170, objectFit: "contain" },
  stampImg: { position: "absolute", right: 4, bottom: 0, width: 50, height: 50, objectFit: "contain" },
  sigLine: { height: 1, backgroundColor: BRAND.slate, marginTop: 2, marginBottom: 5, width: "88%" },
  sigName: { fontSize: 9.5, fontWeight: 700, color: BRAND.slate, lineHeight: 1.35 },
  sigSmall: { fontSize: 8, color: BRAND.s500, lineHeight: 1.4 },

  dividerWrap: { marginTop: 190, alignItems: "center" },
  dividerTitle: { fontFamily: "Outfit", fontSize: 20, fontWeight: 700, color: BRAND.slate, lineHeight: 1.2, marginBottom: 10, textAlign: "center" },
  dividerFile: { fontSize: 9.5, color: BRAND.s500, marginTop: 10, lineHeight: 1.4, textAlign: "center" },
  dividerNote: { fontSize: 8.5, color: BRAND.s500, marginTop: 14, lineHeight: 1.5, textAlign: "center", maxWidth: 360 },
});

const typeLabel = (r: ApiProjectRequest) => (r.type === "Custom Request" && r.customTitle ? r.customTitle : r.type) || "Request";
const shortCode = (r: ApiProjectRequest) => r.type.match(/\(([^)]+)\)/)?.[1] || r.typeCode || "Request";
const footNote = (r: ApiProjectRequest) => [r.number, r.title || typeLabel(r)].filter(Boolean).join(" · ");
const embeddable = (name: string) => /\.(pdf|png|jpe?g)$/i.test(name || "");
const recipient = (r: ApiProjectRequest, clientName?: string) => r.to?.name || clientName || "Client";
// A section with nothing in it (e.g. the untouched "Questions" list with one empty point) is left out.
const hasContent = (html: string) =>
  /<(img|table)\b/i.test(html) || !!html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();

function Sheet({ r, children }: { r: ApiProjectRequest; children?: ReactNode }) {
  return (
    <Page size="A4" style={s.page} wrap>
      <LetterheadHeader />
      {children}
      <LetterheadFooter note={footNote(r)} />
    </Page>
  );
}
const one = (r: ApiProjectRequest, children: ReactNode) => (
  <Document title={footNote(r) || "Request"} author={COMPANY.name}><Sheet r={r}>{children}</Sheet></Document>
);

// CR-P (148) — the type, its number and date at the top, then the subject.
function Head({ r, info }: { r: ApiProjectRequest; info?: ProjectPdfInfo; key?: string }) {
  const jv = info?.partner;
  return (
    <View>
      <View style={s.headRow}>
        <View style={{ flex: 1 }}><Eyebrow>{typeLabel(r).toUpperCase()}</Eyebrow></View>
        <View style={s.metaCol}>
          <Text style={s.metaStrong}>{shortCode(r)} No: {r.number}</Text>
          {!!r.date && <Text style={s.metaText}>Date: {r.date}</Text>}
        </View>
      </View>
      <Text style={s.title}>{r.title || typeLabel(r)}</Text>
      <GradBar w={120} h={4} r={2} id="request-title" />
      {/* CR-P (146) — a joint-venture project's documents name the partner. */}
      {!!jv && (jv.name || jv.logoUrl) && (
        <View style={s.jvRow}>
          <View style={s.jvPill}><Text style={s.jvPillText}>IN JOINT VENTURE WITH</Text></View>
          {jv.logoUrl ? <Image src={pdfAssetUrl(jv.logoUrl)} style={s.jvLogo} /> : <Text style={s.jvName}>{jv.name}</Text>}
        </View>
      )}
    </View>
  );
}

// CR-P (147)/(148) — From (GreenTech) and To (the recipient picked from the Directory).
function FromTo({ r, clientName }: { r: ApiProjectRequest; clientName?: string; key?: string }) {
  const card = (label: string, name: string, lines: string[], right: boolean) => (
    <View style={[s.partyCard, right ? {} : { marginRight: "3%" }]} wrap={false}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.partyName}>{name}</Text>
      {lines.filter(Boolean).map((l, i) => <Text key={i} style={s.partyLine}>{l}</Text>)}
    </View>
  );
  return (
    <View style={s.partyGrid}>
      {card("FROM", COMPANY.name, [COMPANY.mailingAddress, COMPANY.email, COMPANY.phone], false)}
      {card("TO", recipient(r, clientName), [r.to?.contactName ? `Attn: ${r.to.contactName}` : "", r.to?.address || "", r.to?.email || ""], true)}
    </View>
  );
}

function ProjectBlock({ r, info }: { r: ApiProjectRequest; info?: ProjectPdfInfo; key?: string }) {
  const rows = [
    ["PROJECT", info?.name || ""],
    ["PROJECT NO.", info?.number || ""],
    ["LOCATION", info?.location || ""],
    ...(r.contextLines || []).filter((l) => l.label || l.value).map((l) => [(l.label || "").toUpperCase(), l.value || ""]),
  ].filter(([, v]) => v);
  if (!rows.length) return null;
  return (
    <View style={s.block} wrap={false}>
      {rows.map(([k, v], i) => <View key={i} style={s.kv}><Text style={s.kvLabel}>{k}</Text><Text style={s.kvValue}>{v}</Text></View>)}
    </View>
  );
}

function SectionBlock({ n, title, body }: { n: number; title: string; body: string; key?: string }) {
  return (
    <View>
      <SectionHeading label={`${String(n).padStart(2, "0")}.`} title={title || "Section"} />
      <RichText html={body} />
    </View>
  );
}

// GreenTech's signer, the JV partner's signer on a joint-venture project (CR-P 146), and a line for
// the recipient.
function Signatures({ r, clientName, info }: { r: ApiProjectRequest; clientName?: string; info?: ProjectPdfInfo; key?: string }) {
  const blocks: Array<{ who: string; name?: string; title?: string; sig?: string; stamp?: string; date?: string }> = [
    { who: COMPANY.name, name: r.signerName, title: r.signerTitle, sig: r.signatureUrl, stamp: r.stampUrl, date: r.date },
    ...(info?.partner?.name ? [{ who: info.partner.name, name: r.partnerSignerName, title: r.partnerSignerTitle, sig: r.partnerSignatureUrl, stamp: r.partnerStampUrl, date: r.partnerSignatureUrl ? r.date : "" }] : []),
    { who: recipient(r, clientName), name: r.to?.contactName },
  ];
  const w = blocks.length === 3 ? "31.5%" : "48.5%";
  return (
    <View wrap={false}>
      <SectionHeading title="Signatures" />
      <View style={s.sigRow}>
        {blocks.map((b, i) => (
          <View key={i} style={[s.sigBlock, { width: w, marginRight: i < blocks.length - 1 ? "2.5%" : 0 }]}>
            <Text style={s.sigFor}>FOR {b.who.toUpperCase()}</Text>
            <View style={s.sigArea}>
              {!!b.sig && <Image src={pdfAssetUrl(b.sig)} style={s.sigImg} />}
              {!!b.stamp && <Image src={pdfAssetUrl(b.stamp)} style={s.stampImg} />}
            </View>
            <View style={s.sigLine} />
            <Text style={s.sigName}>{b.name || "Name: ____________________"}</Text>
            {!!b.title && <Text style={s.sigSmall}>{b.title}</Text>}
            <Text style={[s.sigSmall, { marginTop: 3 }]}>Date: {b.date || "____________"}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Divider({ heading, file, shown }: { heading: string; file: string; shown: boolean }) {
  return (
    <View style={s.dividerWrap}>
      <Eyebrow>ATTACHMENT</Eyebrow>
      <Text style={s.dividerTitle}>{heading}</Text>
      <GradBar w={90} h={3} r={1.5} id="divider-rule" />
      <Text style={s.dividerFile}>{file}</Text>
      {!shown && <Text style={s.dividerNote}>This file type cannot be shown inside the PDF. Download the original from the request.</Text>}
    </View>
  );
}

function fileParts(r: ApiProjectRequest, heading: string, f: File): ProposalPart[] {
  const shown = embeddable(f.name);
  const parts: ProposalPart[] = [{ type: "doc", element: one(r, <Divider heading={heading} file={f.name} shown={shown} />) }];
  if (shown) parts.push({ type: "files", files: [{ name: f.name, url: f.filePath }] });
  return parts;
}

export async function buildBrandRequestPdf(r: ApiProjectRequest, info?: ProjectPdfInfo, clientName?: string): Promise<Blob> {
  const parts: ProposalPart[] = [];
  const sections = [
    { title: "Description / Request", body: r.description || "", files: [] as File[] },
    ...(r.sections || []).filter((x) => !x.hidden).map((x) => ({ title: x.title || "Section", body: x.body || "", files: (x.attachments || []) as File[] })),
  ].filter((x) => hasContent(x.body) || x.files.length);

  let chunk: ReactNode[] = [<Head key="head" r={r} info={info} />, <FromTo key="fromto" r={r} clientName={clientName} />, <ProjectBlock key="project" r={r} info={info} />];
  sections.forEach((sec, i) => {
    chunk.push(<SectionBlock key={`sec-${i}`} n={i + 1} title={sec.title} body={sec.body} />);
    // A section's supporting files follow it; the text resumes on a new page.
    if (sec.files.length) {
      parts.push({ type: "doc", element: one(r, chunk) });
      chunk = [];
      for (const f of sec.files) parts.push(...fileParts(r, sec.title, f));
    }
  });
  chunk.push(<Signatures key="sigs" r={r} clientName={clientName} info={info} />);
  parts.push({ type: "doc", element: one(r, chunk) });

  // Our supporting documents / appendices, at the end.
  for (const f of r.attachments || []) parts.push(...fileParts(r, "Supporting document", f));

  const { blob } = await assembleProposalParts(parts, [], { numberFirstPage: true });
  return blob;
}
