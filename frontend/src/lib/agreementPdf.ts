import type { ApiAgreement } from "./api";

// The shared agreement document — one layout for every context (employee, partner, subcontractor,
// vendor, general). The document itself is drawn in the brand kit's design by
// components/pdf/AgreementPDF.tsx (the same letterhead, type and colours as the proposals and the
// project reports); it replaced the hand-drawn pdf-lib layout that lived here. It is loaded on
// demand, so the PDF renderer is only fetched when a document is actually built.

// CR-P (21) — the dates this document carries. A date prints only when its box is ticked AND it
// holds a value, so an unticked or empty date is absent rather than shown blank. Agreements saved
// before the flags existed have none, and every date they hold still prints.
export function shownDates(ag: ApiAgreement): Array<{ label: string; value: string }> {
  const f = ag.datesShown;
  const on = (k: "effective" | "start" | "end") => (f ? !!f[k] : true);
  return [
    { label: "Effective", value: on("effective") ? ag.effectiveDate : "" },
    { label: "Start", value: on("start") ? ag.startDate : "" },
    { label: "End", value: on("end") ? ag.endDate : "" },
  ].filter((d) => (d.value || "").trim());
}

// The document heading — the agreement type. Many types already contain the document word
// (e.g. "Service Agreement", "Change Order", "NDA"), so we only append "AGREEMENT" when it
// doesn't, to avoid printing "… AGREEMENT AGREEMENT".
export function agreementHeading(ag: ApiAgreement): string {
  const t = (ag.agreementType || "").trim();
  if (!t) return "AGREEMENT";
  return /agreement|contract|order|amendment|modification|addendum|nda|mou|loi|understanding|intent|waiver|release|memorandum|warranty|lease/i.test(t)
    ? t.toUpperCase() : `${t.toUpperCase()} AGREEMENT`;
}

/** The agreement as a PDF: the preview, the download, the share copy and the signed snapshot. */
export async function buildAgreementPdf(ag: ApiAgreement): Promise<Blob> {
  const { buildBrandAgreementPdf } = await import("../components/pdf/AgreementPDF");
  return buildBrandAgreementPdf(ag);
}

/** An agreement uploaded as a file: our cover page, then the file itself. */
export async function buildUploadedAgreementPdf(ag: ApiAgreement, bytes: Uint8Array, name: string): Promise<Blob> {
  const { buildBrandUploadedAgreementPdf } = await import("../components/pdf/AgreementPDF");
  return buildBrandUploadedAgreementPdf(ag, bytes, name);
}
