import { isoForCountryName, isoForLocation } from "./countryFlag";

// IANA time zone per country (ISO-2), used for the live local clock on a project (CR 180).
// Countries with several zones use the capital's zone, except the US, which is refined by state.
const TZ_BY_ISO: Record<string, string> = {
  AE: "Asia/Dubai", AF: "Asia/Kabul", AL: "Europe/Tirane", AM: "Asia/Yerevan", AO: "Africa/Luanda",
  AR: "America/Argentina/Buenos_Aires", AT: "Europe/Vienna", AU: "Australia/Sydney", AZ: "Asia/Baku",
  BA: "Europe/Sarajevo", BD: "Asia/Dhaka", BE: "Europe/Brussels", BF: "Africa/Ouagadougou", BG: "Europe/Sofia",
  BH: "Asia/Bahrain", BI: "Africa/Bujumbura", BJ: "Africa/Porto-Novo", BN: "Asia/Brunei", BO: "America/La_Paz",
  BR: "America/Sao_Paulo", BS: "America/Nassau", BT: "Asia/Thimphu", BW: "Africa/Gaborone", BY: "Europe/Minsk",
  BZ: "America/Belize", CA: "America/Toronto", CD: "Africa/Kinshasa", CF: "Africa/Bangui", CG: "Africa/Brazzaville",
  CH: "Europe/Zurich", CI: "Africa/Abidjan", CL: "America/Santiago", CM: "Africa/Douala", CN: "Asia/Shanghai",
  CO: "America/Bogota", CR: "America/Costa_Rica", CU: "America/Havana", CY: "Asia/Nicosia", CZ: "Europe/Prague",
  DE: "Europe/Berlin", DJ: "Africa/Djibouti", DK: "Europe/Copenhagen", DO: "America/Santo_Domingo",
  DZ: "Africa/Algiers", EC: "America/Guayaquil", EE: "Europe/Tallinn", EG: "Africa/Cairo", EH: "Africa/El_Aaiun",
  ER: "Africa/Asmara", ES: "Europe/Madrid", ET: "Africa/Addis_Ababa", FI: "Europe/Helsinki", FJ: "Pacific/Fiji",
  FR: "Europe/Paris", GA: "Africa/Libreville", GB: "Europe/London", GE: "Asia/Tbilisi", GH: "Africa/Accra",
  GM: "Africa/Banjul", GN: "Africa/Conakry", GQ: "Africa/Malabo", GR: "Europe/Athens", GT: "America/Guatemala",
  GW: "Africa/Bissau", GY: "America/Guyana", HK: "Asia/Hong_Kong", HN: "America/Tegucigalpa", HR: "Europe/Zagreb",
  HT: "America/Port-au-Prince", HU: "Europe/Budapest", ID: "Asia/Jakarta", IE: "Europe/Dublin", IL: "Asia/Jerusalem",
  IN: "Asia/Kolkata", IQ: "Asia/Baghdad", IR: "Asia/Tehran", IS: "Atlantic/Reykjavik", IT: "Europe/Rome",
  JM: "America/Jamaica", JO: "Asia/Amman", JP: "Asia/Tokyo", KE: "Africa/Nairobi", KG: "Asia/Bishkek",
  KH: "Asia/Phnom_Penh", KP: "Asia/Pyongyang", KR: "Asia/Seoul", KW: "Asia/Kuwait", KZ: "Asia/Almaty",
  LA: "Asia/Vientiane", LB: "Asia/Beirut", LK: "Asia/Colombo", LR: "Africa/Monrovia", LS: "Africa/Maseru",
  LT: "Europe/Vilnius", LU: "Europe/Luxembourg", LV: "Europe/Riga", LY: "Africa/Tripoli", MA: "Africa/Casablanca",
  MD: "Europe/Chisinau", ME: "Europe/Podgorica", MG: "Indian/Antananarivo", MK: "Europe/Skopje", ML: "Africa/Bamako",
  MM: "Asia/Yangon", MN: "Asia/Ulaanbaatar", MR: "Africa/Nouakchott", MT: "Europe/Malta", MU: "Indian/Mauritius",
  MV: "Indian/Maldives", MW: "Africa/Blantyre", MX: "America/Mexico_City", MY: "Asia/Kuala_Lumpur",
  MZ: "Africa/Maputo", NA: "Africa/Windhoek", NE: "Africa/Niamey", NG: "Africa/Lagos", NI: "America/Managua",
  NL: "Europe/Amsterdam", NO: "Europe/Oslo", NP: "Asia/Kathmandu", NZ: "Pacific/Auckland", OM: "Asia/Muscat",
  PA: "America/Panama", PE: "America/Lima", PG: "Pacific/Port_Moresby", PH: "Asia/Manila", PK: "Asia/Karachi",
  PL: "Europe/Warsaw", PR: "America/Puerto_Rico", PS: "Asia/Hebron", PT: "Europe/Lisbon", PY: "America/Asuncion",
  QA: "Asia/Qatar", RO: "Europe/Bucharest", RS: "Europe/Belgrade", RU: "Europe/Moscow", RW: "Africa/Kigali",
  SA: "Asia/Riyadh", SB: "Pacific/Guadalcanal", SD: "Africa/Khartoum", SE: "Europe/Stockholm", SG: "Asia/Singapore",
  SI: "Europe/Ljubljana", SK: "Europe/Bratislava", SL: "Africa/Freetown", SN: "Africa/Dakar", SO: "Africa/Mogadishu",
  SR: "America/Paramaribo", SS: "Africa/Juba", SV: "America/El_Salvador", SY: "Asia/Damascus", SZ: "Africa/Mbabane",
  TD: "Africa/Ndjamena", TG: "Africa/Lome", TH: "Asia/Bangkok", TJ: "Asia/Dushanbe", TL: "Asia/Dili",
  TM: "Asia/Ashgabat", TN: "Africa/Tunis", TR: "Europe/Istanbul", TT: "America/Port_of_Spain", TW: "Asia/Taipei",
  TZ: "Africa/Dar_es_Salaam", UA: "Europe/Kiev", UG: "Africa/Kampala", US: "America/New_York",
  UY: "America/Montevideo", UZ: "Asia/Tashkent", VE: "America/Caracas", VN: "Asia/Ho_Chi_Minh", VU: "Pacific/Efate",
  YE: "Asia/Aden", ZA: "Africa/Johannesburg", ZM: "Africa/Lusaka", ZW: "Africa/Harare",
};

// US states outside Eastern time (full names and 2-letter codes, lower case).
const US_STATE_TZ: Array<[string[], string]> = [
  [["alabama", "al", "arkansas", "ar", "illinois", "il", "iowa", "ia", "kansas", "ks", "louisiana", "la", "minnesota", "mn",
    "mississippi", "ms", "missouri", "mo", "nebraska", "ne", "north dakota", "nd", "oklahoma", "ok", "south dakota", "sd",
    "texas", "tx", "wisconsin", "wi"], "America/Chicago"],
  [["colorado", "co", "idaho", "id", "montana", "mt", "new mexico", "nm", "utah", "ut", "wyoming", "wy"], "America/Denver"],
  [["arizona", "az"], "America/Phoenix"],
  [["california", "ca", "nevada", "nv", "oregon", "or", "washington", "wa"], "America/Los_Angeles"],
  [["alaska", "ak"], "America/Anchorage"],
  [["hawaii", "hi"], "Pacific/Honolulu"],
  [["guam", "gu"], "Pacific/Guam"],
];

function usZone(state: string, location: string): string {
  const st = state.trim().toLowerCase();
  const loc = ` ${location.toLowerCase()} `;
  for (const [names, tz] of US_STATE_TZ) {
    if (st && names.includes(st)) return tz;
    // Only full state names in free text: "WA" or "CO" inside a sentence is too ambiguous.
    if (names.some((n) => n.length > 2 && loc.includes(` ${n}`))) return tz;
  }
  return TZ_BY_ISO.US;
}

/** Time zone for a project site, or "" if the country is not recognised. */
export function projectTimeZone(site: { country?: string; state?: string } | undefined, location?: string): string {
  const iso = isoForCountryName(site?.country) || isoForLocation(site?.country) || isoForLocation(location);
  if (!iso) return "";
  const tz = iso === "US" ? usZone(site?.state || "", location || "") : TZ_BY_ISO[iso] || "";
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return ""; }
}
