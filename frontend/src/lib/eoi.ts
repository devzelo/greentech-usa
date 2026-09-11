import type { ApiProject, EoiContent, ProposalCover } from "./api";
import { COMPANY } from "../components/pdf/brand";

/**
 * Step 8 (items 114-117) - the Expression of Interest. The wording is the client's GT_EOI letter,
 * kept as the standard text; only the fields change, and they fill themselves from the project and
 * its cover page. Filling them in one place also fixes what went wrong in the samples: the Djibouti
 * EOI promised permits "in Nicaragua", the JV letter switched between the JV and GreenTech, and one
 * salutation had no "Dear".
 */

export const EOI_STANDARD_BULLETS = [
  "Replacement and upgrade of potable water systems, including redundancy planning and long-term lifecycle design",
  "Stormwater management systems, including retention and infiltration solutions in flood-prone areas",
  "Phased construction within active diplomatic and secure facilities",
  "Coordination with multiple contractors under concurrent project execution",
  "Compliance with U.S. Government standards, including OBO requirements",
];

export const EOI_PROJECT_TYPES = ["Design-Build", "Design", "Construction", "Services", "Operations & Maintenance", "Supply & Install"];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export interface EoiResolved {
  date: string; solicitationNo: string; projectTitle: string; projectType: string; location: string; country: string;
  recipientName: string; recipientTitle: string; agency: string;
  jv: boolean; jvLogo: string; firmName: string; firmUei: string; firmAddress: string;
  bullets: string[]; bondingPercent: string;
  pocName: string; pocPhone: string; pocEmail: string;
  signatory?: EoiContent["signatory"]; stampUrl: string;
}

/** The JV's registered name, or "GreenTech USA - Partner JV" until it is filled in. */
export const jvEntityName = (project: ApiProject) => {
  const jv = project.jointVenture;
  return (jv?.legalName || "").trim() || (jv?.partnerName ? `GreenTech USA - ${jv.partnerName} JV` : "");
};

/** What every empty field prints as. */
export function eoiDefaults(project: ApiProject, cover: ProposalCover | undefined, firm?: EoiContent["firm"], sig?: EoiContent["signatory"]): Omit<EoiResolved, "signatory" | "stampUrl"> {
  const jvOn = !!project.jointVenture?.enabled && !!project.jointVenture.partnerName;
  const jv = (firm || (jvOn ? "jv" : "gt")) === "jv" && jvOn;
  const loc = (cover?.location || project.location || "").trim();
  return {
    date: todayIso(),
    solicitationNo: (cover?.solicitationNo || "").trim(),
    projectTitle: (cover?.proposalTitle || cover?.projectName || project.name || "").trim(),
    projectType: "",
    location: loc,
    country: (project.siteAddress?.country || loc.split(",").pop() || "").trim(),
    recipientName: (cover?.attentionTo || "").trim(),
    recipientTitle: (cover?.attentionRole || "").trim(),
    agency: (cover?.submittedTo || cover?.clientName || project.clientInfo?.name || "").trim(),
    jv,
    jvLogo: jv ? project.jointVenture?.combinedLogo || project.jointVenture?.logo || "" : "",
    firmName: jv ? jvEntityName(project) : COMPANY.name,
    firmUei: jv ? (project.jointVenture?.uei || "").trim() : COMPANY.uei,
    firmAddress: jv ? (project.jointVenture?.legalAddress || "").trim() || COMPANY.mailingAddress : COMPANY.mailingAddress,
    bullets: EOI_STANDARD_BULLETS,
    bondingPercent: "40",
    pocName: sig?.name || "",
    pocPhone: sig?.phone || COMPANY.phone,
    pocEmail: sig?.email || COMPANY.email,
  };
}

/** The letter as printed: what was typed, else the default. */
export function resolveEoi(e: EoiContent, project: ApiProject, cover: ProposalCover | undefined): EoiResolved {
  const d = eoiDefaults(project, cover, e.firm, e.signatory);
  const pick = (v: string | undefined, dv: string) => (v && v.trim()) || dv;
  return {
    ...d,
    date: pick(e.date, d.date),
    solicitationNo: pick(e.solicitationNo, d.solicitationNo),
    projectTitle: pick(e.projectTitle, d.projectTitle),
    projectType: pick(e.projectType, d.projectType),
    location: pick(e.location, d.location),
    country: pick(e.country, d.country),
    recipientName: pick(e.recipientName, d.recipientName),
    recipientTitle: pick(e.recipientTitle, d.recipientTitle),
    agency: pick(e.agency, d.agency),
    bullets: (e.bullets ?? d.bullets).map((b) => b.trim()).filter(Boolean),
    bondingPercent: pick(e.bondingPercent, d.bondingPercent).replace(/%$/, ""),
    pocName: pick(e.pocName, d.pocName),
    pocPhone: pick(e.pocPhone, d.pocPhone),
    pocEmail: pick(e.pocEmail, d.pocEmail),
    signatory: e.signatory,
    stampUrl: e.stampUrl || "",
  };
}

/** The standard wording with the fields in place (one firm name all the way through). */
export function eoiText(r: EoiResolved) {
  const sol = r.solicitationNo || "[solicitation number]";
  const what = `${r.projectTitle || "[project]"}${r.projectType ? ` (${r.projectType})` : ""}`;
  return {
    subject: `Expression of Interest – Solicitation No. ${sol}`,
    salutation: `Dear ${[r.recipientTitle && !r.recipientName ? r.recipientTitle : "", r.recipientName].filter(Boolean).join(" ") || "Contracting Officer"},`,
    intro: `${r.firmName} hereby expresses its interest in participating in the upcoming solicitation No. ${sol} for the ${what}${r.location ? `, at ${r.location}` : ""}${r.agency ? `, as announced by the ${r.agency}` : ""}.`,
    about: `${r.firmName} is a U.S. contractor headquartered in Virginia, with extensive experience supporting the U.S. Department of State, USAID, and other international clients in the design-build, rehabilitation, and operation of water and wastewater infrastructure systems. Our portfolio includes successful delivery of complex projects in challenging environments across Africa, the Middle East, Central Asia, and island nations, with a strong emphasis on maintaining operational continuity within active compounds.`,
    experienceLead: "We have direct experience in:",
    capacity: `${r.firmName} maintains the technical, managerial, and financial capacity to execute projects within the indicated magnitude. We confirm our ability to meet key solicitation requirements, including provision of Irrevocable Letters of Credit (ILC) or bonding capacity up to ${r.bondingPercent || "40"}% of the contract value, through our established banking relationships.`,
    language: `We further confirm that our team is fully proficient in written and spoken English and is prepared to obtain and comply with all necessary local permits and licensing requirements${r.country ? ` in ${r.country}` : ""}.`,
    detailsLead: "Please find our company details below for your records:",
    distribution: "We kindly request to be included in the distribution list for the solicitation package once it becomes available.",
    closingPara: `${r.firmName} appreciates the opportunity to participate in this procurement and looks forward to submitting a competitive proposal.`,
    closing: "Respectfully,",
  };
}
