import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js/min";

/**
 * 2026-10-09 - phone numbers in the standard format (client: "make the phone number fields follow
 * standard phone # format"). A US number reads (614) 615-9181, or +1 (614) 615-9181 when it was
 * given with its country code; any other country's number reads in the international format,
 * +971 50 123 4567, +33 6 12 34 56 78. An extension follows as "ext. 22". Anything that is not a
 * readable number (a local number given without its country code, a note) is left as it was.
 */
const DEFAULT_COUNTRY = "US";

export function formatPhone(raw?: string | null): string {
  const s = String(raw ?? "").trim();
  if (!s || !/\d/.test(s)) return s;
  const p = parsePhoneNumberFromString(s, DEFAULT_COUNTRY);
  if (!p || !p.isValid()) return s;
  if (p.countryCallingCode === "1") return s.startsWith("+") ? `+1 ${p.formatNational()}` : p.formatNational();
  return p.formatInternational();
}

/** While typing at the end of the box: the number builds up in the same format, (614) 615-9... */
export function typingPhone(text: string): string {
  if (/[a-z#]/i.test(text)) return text;   // an extension or a note: left as typed until the box is left
  return new AsYouType(DEFAULT_COUNTRY).input(text) || text;
}
