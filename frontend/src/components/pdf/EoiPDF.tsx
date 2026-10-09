import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { formatPhone } from "../../lib/phone";
import { BRAND, GUTTER, LETTERHEAD_PAGE, registerBrandFonts, LetterheadHeader, LetterheadFooter, abs, COMPANY } from "./brand";
import { withFileToken } from "../../lib/api";
import { eoiText, type EoiResolved } from "../../lib/eoi";
import SignatureStamp from "./SignatureStamp";

registerBrandFonts();

// Step 8 (items 114-117) - the Expression of Interest on the letterhead: the client's GT_EOI letter,
// in the brand design. One section, one signature.

const s = StyleSheet.create({
  // No lineHeight on the page: the page number below inherits it and would not print.
  page: { ...LETTERHEAD_PAGE, fontFamily: "Inter", fontSize: 9.5, color: BRAND.s700 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, borderBottom: `1.4 solid ${BRAND.emerald}`, paddingBottom: 6 },
  title: { fontFamily: "Outfit", fontSize: 16, fontWeight: 700, color: BRAND.slate, lineHeight: 1.2 },
  date: { fontSize: 9, color: BRAND.s500, lineHeight: 1.3 },
  subject: { fontSize: 10, fontWeight: 700, color: BRAND.slate, lineHeight: 1.45 },
  subjectLine: { fontSize: 9.5, fontWeight: 500, color: BRAND.slate, lineHeight: 1.45 },
  para: { fontSize: 9.5, lineHeight: 1.55, marginBottom: 8, color: BRAND.s700 },
  bullet: { flexDirection: "row", marginBottom: 3, paddingLeft: 4 },
  dot: { width: 12, fontSize: 9.5, lineHeight: 1.5, color: BRAND.emerald },
  bulletText: { flex: 1, fontSize: 9.5, lineHeight: 1.5, color: BRAND.s700 },
  details: { borderTop: `0.8 solid ${BRAND.border}`, marginBottom: 10 },
  row: { flexDirection: "row", paddingVertical: 4, borderBottom: `0.6 solid ${BRAND.border}` },
  label: { width: 130, fontSize: 8.5, fontWeight: 700, color: BRAND.s500, lineHeight: 1.4 },
  value: { flex: 1, fontSize: 9.5, color: BRAND.slate, lineHeight: 1.4 },
  sigRow: { flexDirection: "row", alignItems: "center", minHeight: 46, marginBottom: 4 },
  sigImg: { height: 42, maxWidth: 150, objectFit: "contain" },
  seal: { height: 60, width: 60, objectFit: "contain", marginLeft: 12 },
  sigName: { fontSize: 10, fontWeight: 700, color: BRAND.slate, lineHeight: 1.35 },
  sigLine: { fontSize: 9, color: BRAND.s600, lineHeight: 1.4 },
  pageNoRow: { position: "absolute", left: GUTTER, right: GUTTER, bottom: 17.2, flexDirection: "row", justifyContent: "flex-end" },
  pageNo: { fontSize: 7.5, color: BRAND.s500 },
});

// CR 363 - signatures and stamps are protected uploads: the PDF fetches them with the file token,
// or they are left out of the preview and the download.
const img = (url: string) => abs(withFileToken(url.startsWith("uploads/") ? `/${url}` : url));

const longDate = (v: string) => {
  const d = new Date(`${v}T00:00:00`);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

export default function EoiPDF({ r, projectName }: { r: EoiResolved; projectName: string }) {
  const t = eoiText(r);
  const details = ([
    ["Firm Name", r.firmName], ["UEI (formerly DUNS)", r.firmUei], ["Address", r.firmAddress],
    ["Point of Contact", r.pocName], ["Telephone", formatPhone(r.pocPhone)], ["Email", r.pocEmail],
  ] as Array<[string, string]>).filter(([, v]) => !!v?.trim());
  return (
    <Document title={`Expression of Interest - ${r.projectTitle || projectName}`} author={r.firmName}>
      <Page size="LETTER" style={s.page} wrap>
        <LetterheadHeader partnerLogo={r.jv && r.partnerLogo ? img(r.partnerLogo) : undefined} />
        <View style={s.head}>
          <Text style={s.title}>Expression of Interest (EOI)</Text>
          <Text style={s.date}>{longDate(r.date)}</Text>
        </View>
        <View style={{ marginBottom: 12 }}>
          <Text style={s.subject}>Subject: {t.subject}</Text>
          {!!r.projectTitle && <Text style={s.subjectLine}>{r.projectTitle}</Text>}
          {!!r.location && <Text style={s.subjectLine}>{r.location}</Text>}
        </View>
        <Text style={s.para}>{t.salutation}</Text>
        <Text style={s.para}>{t.intro}</Text>
        <Text style={s.para}>{t.about}</Text>
        {r.bullets.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <Text style={[s.para, { marginBottom: 4 }]} minPresenceAhead={30}>{t.experienceLead}</Text>
            {r.bullets.map((b, i) => (
              <View key={i} style={s.bullet} wrap={false}>
                <Text style={s.dot}>•</Text>
                <Text style={s.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={s.para}>{t.capacity}</Text>
        <Text style={s.para}>{t.language}</Text>
        <View wrap={false}>
          <Text style={s.para}>{t.detailsLead}</Text>
          <View style={s.details}>
            {details.map(([l, v]) => (
              <View key={l} style={s.row}>
                <Text style={s.label}>{l}:</Text>
                <Text style={s.value}>{v}</Text>
              </View>
            ))}
          </View>
        </View>
        <Text style={s.para}>{t.distribution}</Text>
        <Text style={s.para}>{t.closingPara}</Text>
        <View wrap={false} style={{ marginTop: 4 }}>
          <Text style={s.para}>{t.closing}</Text>
          {/* 2026-10-08 - one stamp, over the end of the signature. */}
          <View style={s.sigRow}>
            <SignatureStamp sig={r.signatory?.signatureUrl ? img(r.signatory.signatureUrl) : undefined} stamp={r.stampUrls[0] ? img(r.stampUrls[0]) : undefined} sigH={42} sigMaxW={150} stampSize={58} />
          </View>
          {/* CR 364 - the signature block: name, title, the firm, and how to reach the signer. */}
          <Text style={s.sigName}>{r.signatory?.name || r.pocName || ""}</Text>
          {!!r.signatory?.title && <Text style={s.sigLine}>{r.signatory.title}</Text>}
          <Text style={s.sigLine}>{r.firmName}</Text>
          {/* The signer's contact details one under another: phone, email, website (then the address). */}
          {!!r.signatory && [formatPhone(r.signatory.phone), r.signatory.email, r.signatory.website || COMPANY.website].filter(Boolean).map((line) => <Text key={line} style={s.sigLine}>{line}</Text>)}
          {!!r.signatory?.address && <Text style={s.sigLine}>{r.signatory.address}</Text>}
        </View>
        <LetterheadFooter note={`Expression of Interest · ${r.solicitationNo || projectName}`} />
        <View fixed style={s.pageNoRow}>
          <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
