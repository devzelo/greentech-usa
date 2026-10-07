import type { ProposalBackCover } from "./api";
import { COMPANY } from "./brandTokens";

/**
 * 2026-10-06 - the proposal's Last Page ("Thank You"): the standard wording and the company's
 * contact details, used wherever a field is left blank. The Word export carries the same wording
 * (backend routes/proposalDocx.ts CLOSING).
 */
export const CLOSING_DEFAULTS: Record<"heading" | "message" | "website" | "email" | "phone" | "address", string> = {
  heading: "Thank You",
  message: [
    "Thank you for considering GreenTech USA for this opportunity. We appreciate your time and the opportunity to submit our proposal. We look forward to the possibility of working together and supporting your project goals with our experience, commitment, and dedication to delivering reliable and sustainable solutions.",
    "Please do not hesitate to contact us if you have any questions or require additional information.",
  ].join("\n\n"),
  website: COMPANY.website,
  email: COMPANY.email,
  phone: COMPANY.phone,
  address: COMPANY.address,
};

// 2026-10-07 - the heading's size (points) is chosen in the builder; the page is signed "GreenTech
// USA" (no LLC, no tagline).
export const CLOSING_HEADING_SIZES = [24, 28, 32, 36, 40, 46];
export const CLOSING_HEADING_SIZE = 32;
export const CLOSING_SIGNATURE = "GreenTech USA";

export interface ClosingPage { heading: string; headingSize: number; message: string; paragraphs: string[]; website: string; email: string; phone: string; address: string; qrUrl: string }

/** "www.gt-usa.com" as a link the QR code can open. */
export const asUrl = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`);

/** The page as it prints: each blank field falls back to the standard one. */
export function resolveClosing(b?: ProposalBackCover): ClosingPage {
  const pick = (v: string | undefined, d: string) => (v || "").trim() || d;
  const message = pick(b?.message, CLOSING_DEFAULTS.message);
  const website = pick(b?.website, CLOSING_DEFAULTS.website);
  return {
    heading: pick(b?.heading, CLOSING_DEFAULTS.heading),
    headingSize: Math.min(60, Math.max(16, Number(b?.headingSize) || CLOSING_HEADING_SIZE)),
    message,
    paragraphs: message.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean),
    website,
    email: pick(b?.email, CLOSING_DEFAULTS.email),
    phone: pick(b?.phone, CLOSING_DEFAULTS.phone),
    address: pick(b?.address, CLOSING_DEFAULTS.address),
    qrUrl: asUrl(pick(b?.qrUrl, website)),
  };
}
