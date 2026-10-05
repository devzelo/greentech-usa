/**
 * The GreenTech brand as plain data (no renderer attached): colours, company details, the letterhead
 * art and where assets are served from. The react-pdf kit (components/pdf/brand) and the pdf-lib kit
 * (lib/pdfBrand) both read it, so every generated document draws from one definition.
 */

export const BRAND = {
  emerald: "#10B981",
  blue: "#3B82F6",
  cyan: "#2DE0C4",
  slate: "#0F172A",
  s700: "#334155",
  s600: "#475569",
  s500: "#64748B",
  s400: "#94A3B8",
  s300: "#CBD5E1",
  border: "#E2E8F0",
  mist: "#F8FAFC",
  mint: "#ECFDF5",
  white: "#FFFFFF",
} as const;

export const COMPANY = {
  name: "GreenTech USA LLC",
  tagline: "Environmental Engineering & General Contracting",
  address: "Chantilly, Virginia, USA",
  mailingAddress: "25214 Larks Ter, Chantilly, VA, USA",   // the full address, as on the client's EOI letters
  phone: "+1 571-337-1358",
  email: "info@gt-usa.com",
  website: "www.gt-usa.com",
  cage: "8ZJ10",
  // As registered on SAM.gov (matches the Company Profile and the submitted sample proposals; the
  // brand kit's scripts carried a typo, FYR1QQ8L3SM7).
  uei: "FYR1QQSL3SM7",
} as const;

/** The client-approved letterhead art (3264 px wide) and the brand fonts, served from /public. */
export const BRAND_ASSETS = {
  header: "/brand/letterhead-header.png",   // 3264 x 220: the dark band with the logo and the wave
  footer: "/brand/letterhead-footer.png",   // 3264 x 64: the gradient rule
  logoMint: "/brand/gt-logo-mint.png",
  fonts: {
    inter400: "/fonts/Inter-400.ttf", inter500: "/fonts/Inter-500.ttf", inter600: "/fonts/Inter-600.ttf", inter700: "/fonts/Inter-700.ttf",
    outfit600: "/fonts/Outfit-600.ttf", outfit700: "/fonts/Outfit-700.ttf",
  },
  // The same fonts trimmed to the Latin characters, for pdf-lib, which embeds them whole (its own
  // subsetting breaks Inter's glyphs; the trimmed files keep each PDF small).
  pdfFonts: { regular: "/fonts/pdf/Inter-400.ttf", bold: "/fonts/pdf/Inter-700.ttf", display: "/fonts/pdf/Outfit-700.ttf" },
} as const;

// Where root-relative assets are served from. In the browser that is the page's own origin; a
// renderer outside the browser (server-side or a preview script) sets it with setAssetOrigin().
let assetOrigin = "";
export function setAssetOrigin(origin: string) { assetOrigin = origin.replace(/\/+$/, ""); }

/**
 * CR 368 - most uploads (client and partner logos, signatures, stamps, cover photos) are served only
 * with a file token, which a PDF's image fetch cannot send as a header. api.ts registers how to add
 * it; abs() then adds it to every /uploads path that has none, so every PDF prints them.
 */
let uploadsUrl: ((url: string) => string) | null = null;
export function setUploadsUrl(fn: (url: string) => string) { uploadsUrl = fn; }

/** Root-relative asset URLs (/uploads/..., /brand/...) as absolute URLs. */
export const abs = (url?: string) => {
  if (!url) return "";
  if (uploadsUrl && /^\/?uploads\//.test(url) && !/[?&]token=/.test(url)) url = uploadsUrl(url.startsWith("/") ? url : `/${url}`);
  return /^(https?:|data:|blob:)/.test(url) ? url : `${assetOrigin || (typeof window !== "undefined" ? window.location.origin : "")}${url}`;
};
