import type { ApiProject, ProposalCover, ProposalCoverLetter } from "./api";

/**
 * CR-P (93) - the transmittal letter's header, filled from the cover page and the project.
 *
 * "A template that auto fills from the project and client info: date, recipient name, client name
 * and address, subject, project name, solicitation / RFP number." Every line the author leaves
 * empty takes its value from here when printed, and the editor shows the same value as a hint, so
 * the letter cannot disagree with the cover (the client's own samples addressed one person on the
 * "To:" line and a different one in "Dear ...").
 */
export type LetterHeader = Required<Pick<ProposalCoverLetter, "date" | "toName" | "toTitle" | "toOffice" | "toAgency" | "toAddress" | "subject" | "salutation" | "closing">>;

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function letterDefaults(cover: ProposalCover | undefined, project: ApiProject): LetterHeader {
  const toName = (cover?.attentionTo || "").trim();
  const title = cover?.proposalTitle || project.name;
  const sol = (cover?.solicitationNo || "").trim();
  return {
    date: cover?.submissionDate || todayIso(),
    toName,
    toTitle: (cover?.attentionRole || "").trim() || (toName ? "" : "Contracting Officer"),
    toOffice: (cover?.submittedTo || "").trim(),
    toAgency: (cover?.clientName || project.clientInfo?.name || "").trim(),
    toAddress: (cover?.location || "").trim(),
    subject: `Proposal for ${title}${sol ? `, Solicitation No. ${sol}` : ""}`,
    salutation: `Dear ${toName || "Contracting Officer"},`,
    closing: "Sincerely,",
  };
}

/** The header as printed: what the author typed, else the default. */
export function resolveLetter(letter: ProposalCoverLetter, cover: ProposalCover | undefined, project: ApiProject): LetterHeader {
  const d = letterDefaults(cover, project);
  const pick = (v: string | undefined, dv: string) => (v && v.trim()) || dv;
  return {
    date: pick(letter.date, d.date),
    toName: pick(letter.toName, d.toName),
    toTitle: pick(letter.toTitle, d.toTitle),
    toOffice: pick(letter.toOffice, d.toOffice),
    toAgency: pick(letter.toAgency, d.toAgency),
    toAddress: pick(letter.toAddress, d.toAddress),
    subject: pick(letter.subject, d.subject),
    salutation: pick(letter.salutation, d.salutation),
    closing: pick(letter.closing, d.closing),
  };
}
