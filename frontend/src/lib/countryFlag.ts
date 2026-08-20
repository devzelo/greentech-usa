// Derive a country flag emoji from a free-text location like "Accra, Ghana" or "Ghana".
// Locations are entered as plain text, so we look for a known country name anywhere in the
// string (longest match wins, so "United States" beats "States") and turn its ISO-2 code into
// the regional-indicator emoji. Returns "" when no country is recognised.

const NAME_TO_ISO: Record<string, string> = {
  "united states of america": "US", "united states": "US", "u.s.a.": "US", "u.s.": "US", "usa": "US", "america": "US",
  "united kingdom": "GB", "u.k.": "GB", "uk": "GB", "britain": "GB", "great britain": "GB", "england": "GB", "scotland": "GB", "wales": "GB",
  "united arab emirates": "AE", "u.a.e.": "AE", "uae": "AE", "emirates": "AE", "abu dhabi": "AE", "dubai": "AE",
  "saudi arabia": "SA", "ksa": "SA", "riyadh": "SA", "jeddah": "SA",
  "south korea": "KR", "korea": "KR", "north korea": "KP",
  "south africa": "ZA", "democratic republic of the congo": "CD", "republic of the congo": "CG", "congo": "CG",
  "ivory coast": "CI", "cote d'ivoire": "CI", "côte d'ivoire": "CI",
  afghanistan: "AF", albania: "AL", algeria: "DZ", angola: "AO", argentina: "AR", armenia: "AM", australia: "AU",
  austria: "AT", azerbaijan: "AZ", bahamas: "BS", bahrain: "BH", bangladesh: "BD", belarus: "BY", belgium: "BE",
  belize: "BZ", benin: "BJ", bhutan: "BT", bolivia: "BO", botswana: "BW", brazil: "BR", brunei: "BN", bulgaria: "BG",
  "burkina faso": "BF", burundi: "BI", cambodia: "KH", cameroon: "CM", canada: "CA", chad: "TD", chile: "CL",
  china: "CN", colombia: "CO", "costa rica": "CR", croatia: "HR", cuba: "CU", cyprus: "CY", "czech republic": "CZ",
  czechia: "CZ", denmark: "DK", djibouti: "DJ", "dominican republic": "DO", ecuador: "EC", egypt: "EG",
  "el salvador": "SV", eritrea: "ER", estonia: "EE", eswatini: "SZ", ethiopia: "ET", fiji: "FJ", finland: "FI",
  france: "FR", gabon: "GA", gambia: "GM", georgia: "GE", germany: "DE", ghana: "GH", greece: "GR", guatemala: "GT",
  guinea: "GN", guyana: "GY", haiti: "HT", honduras: "HN", "hong kong": "HK", hungary: "HU", iceland: "IS",
  india: "IN", indonesia: "ID", iran: "IR", iraq: "IQ", ireland: "IE", israel: "IL", italy: "IT", jamaica: "JM",
  japan: "JP", jordan: "JO", kazakhstan: "KZ", kenya: "KE", kuwait: "KW", kyrgyzstan: "KG", laos: "LA", latvia: "LV",
  lebanon: "LB", lesotho: "LS", liberia: "LR", libya: "LY", lithuania: "LT", luxembourg: "LU", madagascar: "MG",
  malawi: "MW", malaysia: "MY", maldives: "MV", mali: "ML", malta: "MT", mauritania: "MR", mauritius: "MU",
  mexico: "MX", moldova: "MD", mongolia: "MN", montenegro: "ME", morocco: "MA", mozambique: "MZ", myanmar: "MM",
  namibia: "NA", nepal: "NP", netherlands: "NL", "new zealand": "NZ", nicaragua: "NI", niger: "NE", nigeria: "NG",
  norway: "NO", oman: "OM", pakistan: "PK", panama: "PA", "papua new guinea": "PG", paraguay: "PY", peru: "PE",
  philippines: "PH", poland: "PL", portugal: "PT", qatar: "QA", romania: "RO", russia: "RU", rwanda: "RW",
  senegal: "SN", serbia: "RS", "sierra leone": "SL", singapore: "SG", slovakia: "SK", slovenia: "SI", somalia: "SO",
  spain: "ES", "sri lanka": "LK", sudan: "SD", "south sudan": "SS", suriname: "SR", sweden: "SE", switzerland: "CH",
  syria: "SY", taiwan: "TW", tajikistan: "TJ", tanzania: "TZ", thailand: "TH", togo: "TG", "trinidad and tobago": "TT",
  tunisia: "TN", turkey: "TR", türkiye: "TR", turkmenistan: "TM", uganda: "UG", ukraine: "UA", uruguay: "UY",
  uzbekistan: "UZ", venezuela: "VE", vietnam: "VN", yemen: "YE", zambia: "ZM", zimbabwe: "ZW",
};

// Longest names first, so "united states" matches before "states"-like fragments.
const NAMES_BY_LENGTH = Object.keys(NAME_TO_ISO).sort((a, b) => b.length - a.length);

function isoToEmoji(iso: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso)) return "";
  return iso.toUpperCase().replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Best-effort ISO-2 country code for a free-text location. "" when none is recognised. */
export function isoForLocation(location?: string): string {
  const s = ` ${String(location || "").toLowerCase()} `;
  for (const name of NAMES_BY_LENGTH) {
    // Word-boundary-ish match so "mali" doesn't hit inside "somalia".
    if (new RegExp(`[^a-z]${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-z]`).test(s)) {
      return NAME_TO_ISO[name];
    }
  }
  return "";
}

/** Best-effort flag emoji for a free-text location. "" when no country is recognised. */
export function locationFlag(location?: string): string {
  const iso = isoForLocation(location);
  return iso ? isoToEmoji(iso) : "";
}

// ── Country picker list ──────────────────────────────────────────────────────
const cap = (w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w);
const SMALL_WORDS = new Set(["of", "the", "and"]);
function titleCaseCountry(s: string): string {
  return s
    .split(" ")
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.split("'").map(cap).join("'")))
    .join(" ");
}

export interface Country { name: string; iso: string; flag: string }

/**
 * Canonical, alphabetically sorted country list for dropdowns. Derived from NAME_TO_ISO by
 * keeping the longest alias per ISO code (which is the proper name — "united states of america"
 * beats "usa") and dropping short abbreviations. Each entry carries its flag emoji.
 */
export const COUNTRIES: Country[] = (() => {
  const best: Record<string, string> = {};
  for (const [name, iso] of Object.entries(NAME_TO_ISO)) {
    if (name.replace(/[^a-z]/gi, "").length <= 3) continue; // skip "usa", "uk", "uae", "ksa"…
    if (!best[iso] || name.length > best[iso].length) best[iso] = name;
  }
  return Object.entries(best)
    .map(([iso, name]) => ({ iso, name: titleCaseCountry(name), flag: isoToEmoji(iso) }))
    .sort((a, b) => a.name.localeCompare(b.name));
})();

/** Flag emoji for a specific country name (e.g. "Ghana" → 🇬🇭). "" if unrecognised. */
export function flagForCountry(country?: string): string {
  const key = String(country || "").trim().toLowerCase();
  if (NAME_TO_ISO[key]) return isoToEmoji(NAME_TO_ISO[key]);
  return locationFlag(country);
}
