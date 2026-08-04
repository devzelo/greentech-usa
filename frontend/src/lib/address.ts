// A project's physical site address. Structured so it can drive delivery addresses on RFQs/POs
// and a "City, Country 🇬🇭" header, while the legacy free-text `location` stays in sync for
// existing cards/tables and PDF headers.
export interface SiteAddress {
  line1: string;      // exact street address
  city: string;
  state: string;      // state / province / region
  postalCode: string;
  country: string;    // display name, e.g. "Ghana"
}

export const EMPTY_SITE_ADDRESS: SiteAddress = { line1: "", city: "", state: "", postalCode: "", country: "" };

/** Full one-line address for delivery ("123 Main St, Accra, Greater Accra, 00233, Ghana"). */
export function composeSiteAddress(a?: Partial<SiteAddress> | null): string {
  if (!a) return "";
  const cityLine = [a.city, a.state, a.postalCode].filter((x) => x && String(x).trim()).join(", ");
  return [a.line1, cityLine, a.country].filter((x) => x && String(x).trim()).join(", ");
}

/** Short "City, Country" for headers and cards. Falls back to a free-text location string. */
export function shortLocation(a?: Partial<SiteAddress> | null, fallback = ""): string {
  const parts = [a?.city, a?.country].filter((x) => x && String(x).trim());
  return parts.length ? parts.join(", ") : fallback;
}
