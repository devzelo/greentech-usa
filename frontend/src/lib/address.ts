import { COUNTRIES, isoForLocation } from "./countryFlag";

// A project's physical site address. Structured so it can drive delivery addresses on RFQs/POs
// and a "City, Country 🇬🇭" header, while the legacy free-text `location` stays in sync for
// existing cards/tables and PDF headers.
// CR 186: `full` holds the address exactly as pasted (every country writes addresses differently);
// the other fields are the parts we use for the flag, local time and short headers.
export interface SiteAddress {
  full?: string;      // the whole address, as pasted
  line1: string;      // exact street address
  city: string;
  state: string;      // state / province / region
  postalCode: string;
  country: string;    // display name, e.g. "Ghana"
}

export const EMPTY_SITE_ADDRESS: SiteAddress = { full: "", line1: "", city: "", state: "", postalCode: "", country: "" };

const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** Full one-line address for delivery ("123 Main St, Accra, Greater Accra, 00233, Ghana"). */
export function composeSiteAddress(a?: Partial<SiteAddress> | null): string {
  if (!a) return "";
  if (a.full && a.full.trim()) {
    const ls = lines(a.full);
    // Add the country when the pasted text doesn't name one.
    if (a.country && !ls.some((l) => l.toLowerCase().includes(a.country!.toLowerCase()))) ls.push(a.country);
    return ls.join(", ");
  }
  const cityLine = [a.city, a.state, a.postalCode].filter((x) => x && String(x).trim()).join(", ");
  return [a.line1, cityLine, a.country].filter((x) => x && String(x).trim()).join(", ");
}

/** Short "City, Country" for headers and cards. Falls back to a free-text location string. */
export function shortLocation(a?: Partial<SiteAddress> | null, fallback = ""): string {
  const parts = [a?.city, a?.country].filter((x) => x && String(x).trim());
  return parts.length ? parts.join(", ") : fallback;
}

const US_STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI".split(" "));
const POSTAL = /\b(\d{5}(?:-\d{4})?|[A-Z]\d[A-Z] ?\d[A-Z]\d|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}|\d{3,6}(?:-\d{3,4})?)\b/i;

/**
 * Best-effort split of a pasted address into city / state / postal code / country. It is only a
 * starting point the user checks (an AI reader replaces it in a later phase); empty parts stay
 * empty rather than guessed wildly.
 */
export function guessAddressParts(full: string): Partial<SiteAddress> {
  let parts = lines(full);
  if (parts.length === 1) parts = parts[0].split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return {};
  const out: Partial<SiteAddress> = {};

  // Country: the last part that names one.
  for (let i = parts.length - 1; i >= 0; i--) {
    const iso = isoForLocation(parts[i]);
    if (!iso) continue;
    out.country = COUNTRIES.find((c) => c.iso === iso)?.name || "";
    // Drop it only when the part is just the country name.
    if (parts[i].toLowerCase().replace(/[^a-z ]/g, "").trim() === out.country.toLowerCase()) parts = parts.filter((_, j) => j !== i);
    break;
  }

  out.line1 = parts[0] || "";
  const rest = parts.slice(1);
  // Postal code (and a US-style "VA 20151" state) from the lines after the street.
  for (let i = rest.length - 1; i >= 0; i--) {
    const segs = rest[i].split(",").map((s) => s.trim()).filter(Boolean);
    for (let k = segs.length - 1; k >= 0; k--) {
      const m = POSTAL.exec(segs[k]);
      if (!m) continue;
      out.postalCode = m[1].toUpperCase();
      const before = segs[k].slice(0, m.index).trim();
      const after = segs[k].slice(m.index + m[0].length).trim();
      const st =/\b([A-Z]{2})$/.exec(before);
      if (st && US_STATES.has(st[1])) {
        out.state = st[1];
        const cityPart = before.slice(0, st.index).replace(/,\s*$/, "").trim();
        out.city = cityPart || segs[k - 1] || "";
      } else if (before) {
        out.city = before.replace(/,\s*$/, "");
        if (segs[k + 1]) out.state = segs[k + 1];
      } else if (after) {
        // "10117 Berlin": the postal code comes first.
        out.city = after;
        if (segs[k + 1]) out.state = segs[k + 1];
      } else {
        out.city = segs[k - 1] || (rest[i - 1] ?? "");
        if (segs[k + 1]) out.state = segs[k + 1];
      }
      break;
    }
    if (out.postalCode) break;
  }
  // No postal code: the last remaining part is usually the city (or "City, State"), unless it
  // names a region, in which case the part before it is the city.
  const REGION = /\b(region|province|state|county|governorate|prefecture|district|oblast|emirate)\b/i;
  if (!out.city && rest.length > 1 && REGION.test(rest[rest.length - 1])) {
    out.state = rest[rest.length - 1];
    out.city = rest[rest.length - 2].split(",")[0].trim();
  }
  if (!out.city && rest.length) {
    const segs = rest[rest.length - 1].split(",").map((s) => s.trim()).filter(Boolean);
    out.city = segs[0] || "";
    if (segs[1]) out.state = segs[1];
  }
  if (out.city && /\d/.test(out.city) && rest.length > 1) out.city = out.city.replace(/\d+/g, "").trim();
  return out;
}
