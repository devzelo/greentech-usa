import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { ApiAgreement } from "../../lib/api";
import { agreementHeading, shownDates } from "../../lib/agreementPdf";
import { assembleProposalParts, type ProposalPart } from "../../lib/proposalExport";
import { BRAND, COMPANY, LETTERHEAD_PAGE, registerBrandFonts, LetterheadHeader, LetterheadFooter, Eyebrow, GradBar, SectionHeading } from "./brand";
import RichText, { pdfAssetUrl } from "./RichText";
import SignatureStamp from "./SignatureStamp";

registerBrandFonts();

/**
 * The agreement document in the brand kit's design (the same letterhead, type and colours as the
 * proposals and the project reports). It replaces the hand-drawn pdf-lib layout, and it is what the
 * preview, the download, the share copy and the frozen signed copy all show.
 *
 * Running order: heading (type, title, number, dates), description, projects, parties, info block,
 * numbered sections (a section's files straight after it, CR-P (42)), the signatures, then the files
 * held back as appendices, then the NDA and the standard terms (CR-P (45)). Files are merged in as
 * they are, each behind a divider page; "Page i of N" runs across our own pages.
 */

type Party = { name?: string; contactName?: string; address?: string; email?: string; phone?: string };
type Sig = { signerName?: string; signerTitle?: string; signatureUrl?: string; stampUrl?: string; signedAt?: string };
type Attachment = { name: string; filePath: string; print?: boolean; placement?: string; cover?: boolean };

const s = StyleSheet.create({
  // No lineHeight on the page; the page number is stamped by the assembler.
  page: { ...LETTERHEAD_PAGE, fontFamily: "Inter", fontSize: 9.5, color: BRAND.s700 },
  watermarkWrap: { position: "absolute", top: 330, left: 0, right: 0, alignItems: "center" },
  watermark: { fontFamily: "Outfit", fontSize: 96, fontWeight: 700, color: "#EEF2F6", transform: "rotate(-30deg)" },

  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  metaCol: { alignItems: "flex-end", marginLeft: 16 },
  metaText: { fontSize: 8, color: BRAND.s500, lineHeight: 1.45 },
  title: { fontFamily: "Outfit", fontSize: 22, fontWeight: 700, color: BRAND.slate, lineHeight: 1.15, marginBottom: 8 },
  desc: { fontSize: 10, color: BRAND.s600, lineHeight: 1.5, marginTop: 10 },
  jvRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  jvPill: { backgroundColor: "#EEF2FF", borderRadius: 4, paddingVertical: 3, paddingHorizontal: 7, marginRight: 8 },
  jvPillText: { fontSize: 7, fontWeight: 700, color: "#4338CA", letterSpacing: 0.8, lineHeight: 1.2 },
  jvName: { fontSize: 9, fontWeight: 700, color: BRAND.slate },
  jvLogo: { height: 22, maxWidth: 110, objectFit: "contain" },

  label: { fontSize: 6.8, fontWeight: 700, color: BRAND.s400, letterSpacing: 1, lineHeight: 1.3, marginBottom: 3 },
  block: { marginTop: 16 },
  projLine: { fontSize: 9.5, color: BRAND.slate, fontWeight: 500, lineHeight: 1.45 },

  partyGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  partyCard: { width: "48.5%", marginBottom: 8, borderRadius: 6, border: `0.8 solid ${BRAND.border}`, borderLeft: `3 solid ${BRAND.emerald}`, padding: 10 },
  partyName: { fontFamily: "Outfit", fontSize: 11.5, fontWeight: 700, color: BRAND.slate, lineHeight: 1.25, marginBottom: 3 },
  partyLine: { fontSize: 8.4, color: BRAND.s600, lineHeight: 1.45 },

  kv: { flexDirection: "row", paddingVertical: 4, borderBottom: `0.6 solid ${BRAND.border}` },
  kvLabel: { width: 120, fontSize: 7, fontWeight: 700, color: BRAND.s500, letterSpacing: 0.8, lineHeight: 1.4, paddingTop: 1 },
  kvValue: { flex: 1, fontSize: 9, color: BRAND.slate, fontWeight: 500, lineHeight: 1.4 },

  refLine: { fontSize: 9, color: BRAND.s600, lineHeight: 1.5, marginTop: 10, padding: 8, backgroundColor: BRAND.mist, borderRadius: 4, borderLeft: `3 solid ${BRAND.emerald}` },

  sigRow: { flexDirection: "row", marginTop: 10 },
  sigBlock: { width: "48.5%" },
  sigFor: { fontSize: 7, fontWeight: 700, color: BRAND.emerald, letterSpacing: 1, lineHeight: 1.3 },
  sigArea: { minHeight: 46, justifyContent: "flex-end", marginTop: 4 },
  sigImg: { height: 40, maxWidth: 170, objectFit: "contain" },
  stampImg: { position: "absolute", right: 4, bottom: 0, width: 50, height: 50, objectFit: "contain" },
  sigLine: { height: 1, backgroundColor: BRAND.slate, marginTop: 2, marginBottom: 5, width: "88%" },
  sigName: { fontSize: 9.5, fontWeight: 700, color: BRAND.slate, lineHeight: 1.35 },
  sigSmall: { fontSize: 8, color: BRAND.s500, lineHeight: 1.4 },

  dividerWrap: { marginTop: 190, alignItems: "center" },
  dividerTitle: { fontFamily: "Outfit", fontSize: 20, fontWeight: 700, color: BRAND.slate, lineHeight: 1.2, marginBottom: 10, textAlign: "center" },
  dividerFile: { fontSize: 9.5, color: BRAND.s500, marginTop: 10, lineHeight: 1.4, textAlign: "center" },
  dividerNote: { fontSize: 8.5, color: BRAND.s500, marginTop: 14, lineHeight: 1.5, textAlign: "center", maxWidth: 360 },
  coverNote: { fontSize: 8.5, color: BRAND.s500, marginTop: 18, lineHeight: 1.4 },
});

const typeName = (ag: ApiAgreement) => (ag.agreementType || "").trim() || "Agreement";
const footNote = (ag: ApiAgreement) => [ag.agreementNo, ag.title || typeName(ag)].filter(Boolean).join(" · ");
const embeddable = (name: string) => /\.(pdf|png|jpe?g)$/i.test(name || "");

function Sheet({ ag, children }: { ag: ApiAgreement; children?: ReactNode }) {
  return (
    <Page size="LETTER" style={s.page} wrap>
      <LetterheadHeader />
      {/* Working copies are never mistaken for issued ones. */}
      {ag.status === "Draft" && <View fixed style={s.watermarkWrap}><Text style={s.watermark}>DRAFT</Text></View>}
      {children}
      <LetterheadFooter note={footNote(ag)} />
    </Page>
  );
}
const one = (ag: ApiAgreement, children: ReactNode) => (
  <Document title={footNote(ag) || "Agreement"} author={COMPANY.name}><Sheet ag={ag}>{children}</Sheet></Document>
);

// The status as people read it (the stored value is a code, e.g. "PendingSignature").
const STATUS_TEXT: Record<string, string> = { PendingSignature: "Pending signature" };

// CR-P (25)/(28) — type, then the title right after it, then the description; the reference data
// (number, ticked dates, status) sits to the right of the heading instead of between them.
function Head({ ag }: { ag: ApiAgreement; key?: string }) {
  const meta = [
    ag.agreementNo ? `Agreement No: ${ag.agreementNo}` : "",
    ...shownDates(ag).map((d) => `${d.label}: ${d.value}`),
    ag.status ? `Status: ${STATUS_TEXT[ag.status] || ag.status}` : "",
  ].filter(Boolean);
  const jv = ag.letterhead === "jv" && (ag.jvPartnerName || ag.jvLogoUrl);
  return (
    <View>
      <View style={s.headRow}>
        <View style={{ flex: 1 }}><Eyebrow>{agreementHeading(ag)}</Eyebrow></View>
        <View style={s.metaCol}>{meta.map((m) => <Text key={m} style={s.metaText}>{m}</Text>)}</View>
      </View>
      <Text style={s.title}>{ag.title || typeName(ag)}</Text>
      <GradBar w={120} h={4} r={2} id="agreement-title" />
      {!!ag.description && <Text style={s.desc}>{ag.description}</Text>}
      {/* A joint-venture agreement names the partner here (the letterhead band is GreenTech's art). */}
      {jv && (
        <View style={s.jvRow}>
          <View style={s.jvPill}><Text style={s.jvPillText}>IN JOINT VENTURE WITH</Text></View>
          {ag.jvLogoUrl ? <Image src={pdfAssetUrl(ag.jvLogoUrl)} style={s.jvLogo} /> : <Text style={s.jvName}>{ag.jvPartnerName}</Text>}
        </View>
      )}
    </View>
  );
}

// CR-P (27) — the projects this agreement covers, with their locations.
function Projects({ ag }: { ag: ApiAgreement; key?: string }) {
  const projs = (ag.linkedProjects || []).filter((p) => (p?.name || "").trim());
  if (!projs.length) return null;
  return (
    <View style={s.block} wrap={false}>
      <Text style={s.label}>{projs.length === 1 ? "PROJECT" : "PROJECTS"}</Text>
      {projs.map((p) => <Text key={p.id} style={s.projLine}>{p.name}{p.location ? `, ${p.location}` : ""}</Text>)}
    </View>
  );
}

const partiesOf = (ag: ApiAgreement): Party[] => [
  ag.partySnapshot?.party1 || { name: COMPANY.name, address: COMPANY.mailingAddress, email: COMPANY.email, phone: COMPANY.phone },
  ag.partySnapshot?.party2 || {},
  ...(ag.partySnapshot?.extraParties || []).filter((p) => (p?.name || "").trim()),
].filter((p) => (p?.name || "").trim());

// CR-P (19) — every party, up to four, two to a row.
function Parties({ ag, lead }: { ag: ApiAgreement; lead?: string; key?: string }) {
  const parties = partiesOf(ag);
  if (!parties.length) return null;
  return (
    <View style={s.block}>
      <Text style={s.label}>{lead || "PARTIES"}</Text>
      <View style={s.partyGrid}>
        {parties.map((p, i) => (
          <View key={i} style={[s.partyCard, { marginRight: i % 2 === 0 ? "3%" : 0 }]} wrap={false}>
            <Text style={s.label}>PARTY {i + 1}</Text>
            <Text style={s.partyName}>{p.name}</Text>
            {[p.contactName ? `Attn: ${p.contactName}` : "", p.address, p.email, p.phone].filter(Boolean).map((l, j) => (
              <Text key={j} style={s.partyLine}>{l}</Text>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// The employee or project info lines. Old "Project" lines are dropped once the projects block
// above covers them (CR-P (27)).
function Info({ ag }: { ag: ApiAgreement; key?: string }) {
  const hasProjects = (ag.linkedProjects || []).some((p) => (p?.name || "").trim());
  const lines = (ag.partySnapshot?.contextLines || []).filter((l) => l.value && !(hasProjects && l.label === "Project"));
  if (!lines.length) return null;
  const heading = ag.ownerContextType === "user" ? "EMPLOYMENT INFORMATION" : ag.ownerContextType === "general" ? "AGREEMENT INFORMATION" : "PROJECT INFORMATION";
  return (
    <View style={s.block} wrap={false}>
      <Text style={s.label}>{heading}</Text>
      {lines.map((l, i) => (
        <View key={i} style={s.kv}><Text style={s.kvLabel}>{(l.label || "").toUpperCase()}</Text><Text style={s.kvValue}>{l.value}</Text></View>
      ))}
    </View>
  );
}

// `key` is declared because the project has no @types/react to add it.
function SectionBlock({ n, title, body }: { n: number; title: string; body: string; key?: string }) {
  return (
    <View>
      <SectionHeading label={`${String(n).padStart(2, "0")}.`} title={title || "Section"} />
      <RichText html={body} />
    </View>
  );
}

// CR-P (45) — the body only says what is attached after the signatures.
function RefLine({ ag }: { ag: ApiAgreement; key?: string }) {
  const sec = ag.sections;
  const nda = !!sec?.ndaEnabled && (sec.ndaMode === "file" ? !!sec.ndaFile?.url : !!(sec.ndaText || "").trim());
  const terms = !!sec?.stdTermsEnabled && (sec.stdTermsMode === "file" ? !!sec.stdTermsFile?.url : !!(sec.stdTermsText || "").trim());
  if (!nda && !terms) return null;
  const what = [nda ? "the Non-Disclosure Agreement" : "", terms ? "the Standard Terms & Conditions" : ""].filter(Boolean).join(" and ");
  return <Text style={s.refLine}>Attached after the signatures, and forming part of this agreement: {what}.</Text>;
}

// CR-P (46)/(47) — one block per party with its details; an empty ruled line when unsigned, so it
// can be signed by hand and scanned back.
function Signatures({ ag }: { ag: ApiAgreement; key?: string }) {
  const p = ag.partySnapshot;
  const rec = ag.signatures?.recipient;
  const blocks: Array<{ party?: Party; sig: Sig }> = [
    { party: p?.party1, sig: ag.signatures?.company || {} },
    { party: p?.party2, sig: { signerName: rec?.signerName, signatureUrl: rec?.signatureUrl, stampUrl: rec?.stampUrl, signedAt: rec?.signedAt } },
    ...(p?.extraParties || []).filter((x) => (x?.name || "").trim()).map((x, i) => ({ party: x, sig: (ag.signatures?.extra || [])[i] || {} })),
  ].filter((b) => (b.party?.name || "").trim());
  const rows: Array<typeof blocks> = [];
  for (let i = 0; i < blocks.length; i += 2) rows.push(blocks.slice(i, i + 2));
  const block = (b: { party?: Party; sig: Sig }, key: number) => (
    <View key={key} style={[s.sigBlock, { marginRight: key % 2 === 0 ? "3%" : 0 }]}>
      <Text style={s.sigFor}>FOR {(b.party?.name || "").toUpperCase()}</Text>
      <View style={s.sigArea}>
        {/* 2026-10-08 - the stamp over the end of the signature, not at the far side of the block. */}
        <SignatureStamp sig={b.sig.signatureUrl ? pdfAssetUrl(b.sig.signatureUrl) : undefined} stamp={b.sig.stampUrl ? pdfAssetUrl(b.sig.stampUrl) : undefined} sigH={40} stampSize={50} />
      </View>
      <View style={s.sigLine} />
      <Text style={s.sigName}>{b.sig.signerName || b.party?.contactName || "Name: ____________________"}</Text>
      {!!b.sig.signerTitle && <Text style={s.sigSmall}>{b.sig.signerTitle}</Text>}
      {[b.party?.address, b.party?.email, b.party?.phone].filter(Boolean).map((l, j) => <Text key={j} style={s.sigSmall}>{l}</Text>)}
      <Text style={[s.sigSmall, { marginTop: 3 }]}>{b.sig.signedAt ? `Signed: ${b.sig.signedAt}` : "Date: ____________"}</Text>
    </View>
  );
  const row = (r: typeof blocks, ri: number) => (
    <View key={ri} style={s.sigRow} wrap={false}>{r.map((b, bi) => block(b, ri * 2 + bi))}</View>
  );
  // The heading travels with the first row of blocks, so it never ends a page on its own.
  return (
    <View>
      <View wrap={false}>
        <SectionHeading title="Signatures" />
        {rows.length > 0 && row(rows[0], 0)}
      </View>
      {rows.slice(1).map((r, i) => row(r, i + 1))}
    </View>
  );
}

// The page in front of a file merged into the document: what it is and where it belongs.
function Divider({ heading, file, shown }: { heading: string; file: string; shown: boolean }) {
  return (
    <View style={s.dividerWrap}>
      <Eyebrow>ATTACHMENT</Eyebrow>
      <Text style={s.dividerTitle}>{heading}</Text>
      <GradBar w={90} h={3} r={1.5} id="divider-rule" />
      <Text style={s.dividerFile}>{file}</Text>
      {!shown && <Text style={s.dividerNote}>This file type cannot be shown inside the PDF. Download the original from the agreement.</Text>}
    </View>
  );
}

// 2026-10-07 - a file printed after its section goes in without a cover page; an appendix keeps
// its cover unless it is turned off. A file that cannot be shown inside the PDF still gets the page
// that says so, as otherwise it would vanish without a word.
function fileParts(ag: ApiAgreement, heading: string, a: Attachment, url = a.filePath, cover = true): ProposalPart[] {
  const shown = embeddable(a.name);
  const parts: ProposalPart[] = cover || !shown ? [{ type: "doc", element: one(ag, <Divider heading={heading} file={a.name} shown={shown} />) }] : [];
  if (shown) parts.push({ type: "files", files: [{ name: a.name, url }] });
  return parts;
}

// The four fixed sections of an agreement written before every agreement used the flexible list;
// they print first, numbered, until the agreement is opened and saved (CR-P (69)).
function legacySections(ag: ApiAgreement) {
  const sec = ag.sections;
  return ([["Scope / Description", sec?.scope], ["Terms & Conditions", sec?.terms], ["Payment Conditions", sec?.paymentConditions], ["Delivery Conditions", sec?.deliveryConditions]] as const)
    .filter(([, body]) => (body || "").trim())
    .map(([title, body]) => ({ title, body: body || "", attachments: [] as Attachment[] }));
}

/** The whole agreement as a PDF: generated pages and attached files, numbered across. */
export async function buildBrandAgreementPdf(ag: ApiAgreement): Promise<Blob> {
  const parts: ProposalPart[] = [];
  const visible = (ag.extraSections || []).filter((x) => !(x as { hidden?: boolean }).hidden && (x.title || (x.body || "").trim()));
  const sections = [
    ...legacySections(ag),
    ...visible.map((x) => ({ title: x.title || "Section", body: x.body || "", attachments: (x.attachments || []) as Attachment[] })),
  ];

  let chunk: ReactNode[] = [<Head key="head" ag={ag} />, <Projects key="projects" ag={ag} />, <Parties key="parties" ag={ag} />, <Info key="info" ag={ag} />];
  sections.forEach((sec, i) => {
    chunk.push(<SectionBlock key={`sec-${i}`} n={i + 1} title={sec.title} body={sec.body} />);
    // CR-P (42) — files set to print after this section follow it, then the text resumes on a new page.
    const inline = sec.attachments.filter((a) => a.print !== false && a.placement !== "end");
    if (inline.length) {
      parts.push({ type: "doc", element: one(ag, chunk) });
      chunk = [];
      for (const a of inline) parts.push(...fileParts(ag, sec.title, a, a.filePath, false));
    }
  });
  chunk.push(<RefLine key="ref" ag={ag} />, <Signatures key="sigs" ag={ag} />);
  parts.push({ type: "doc", element: one(ag, chunk) });

  // Files held back to the end as appendices.
  for (const sec of sections) {
    for (const a of sec.attachments) if (a.print !== false && a.placement === "end") parts.push(...fileParts(ag, sec.title || "Appendix", a, a.filePath, a.cover !== false));
  }
  // CR-P (45) — the NDA, then the standard terms: at the very end.
  const endDocument = (title: string, mode?: string, file?: { name: string; url: string } | null, text?: string) => {
    if (mode === "file") { if (file?.url) parts.push(...fileParts(ag, title, { name: file.name, filePath: file.url })); return; }
    if ((text || "").trim()) parts.push({ type: "doc", element: one(ag, <View><SectionHeading title={title} /><RichText html={text || ""} /></View>) });
  };
  const sec = ag.sections;
  if (sec?.ndaEnabled) endDocument("Non-Disclosure Agreement", sec.ndaMode, sec.ndaFile, sec.ndaText);
  if (sec?.stdTermsEnabled) endDocument("Standard Terms & Conditions", sec.stdTermsMode, sec.stdTermsFile, sec.stdTermsText);

  const { blob } = await assembleProposalParts(parts, [], { numberFirstPage: true });
  return blob;
}

/** An agreement uploaded as a file: our cover page (the same heading and parties), then the file. */
export async function buildBrandUploadedAgreementPdf(ag: ApiAgreement, bytes: Uint8Array, name: string): Promise<Blob> {
  const cover = one(ag, (
    <View>
      <Head ag={ag} />
      <Projects ag={ag} />
      <Parties ag={ag} lead="THIS AGREEMENT IS MADE BETWEEN" />
      <Info ag={ag} />
      <Text style={s.coverNote}>The full agreement document follows.</Text>
    </View>
  ));
  const parts: ProposalPart[] = [{ type: "doc", element: cover }];
  if (embeddable(name)) {
    parts.push({ type: "bytes", name, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
  } else {
    parts.push({ type: "doc", element: one(ag, <Divider heading="Agreement document" file={name || "attachment"} shown={false} />) });
  }
  const { blob } = await assembleProposalParts(parts, [], { numberFirstPage: true });
  return blob;
}
