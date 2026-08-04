/**
 * Normalizes a raw text entry into a clean US-dollar amount string, e.g. "$2,500,000"
 * or "$2,500,000.50". Blocks shorthand like "2.5M" or "USD 2m" — only digits, one
 * decimal point, and up to two decimal places survive.
 *
 * Project values MUST be complete numbers (not shorthand) because the "All Projects"
 * portfolio totals sum them by stripping non-numeric characters
 * (see ProjectList.tsx `nval`). "2.5M" would sum as 2.5, not 2,500,000.
 *
 * Returns "" for empty input so the placeholder still shows.
 */
export function sanitizeMoney(raw: string): string {
  // Keep only digits and dots — this is what blocks letters like "M"/"K" and symbols.
  let s = raw.replace(/[^\d.]/g, "");

  // Collapse to a single decimal point (keep the first one).
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }

  if (s === "") return "";

  let [intPart, decPart] = s.split(".");
  intPart = intPart.replace(/^0+(?=\d)/, ""); // strip leading zeros
  if (intPart === "") intPart = "0";
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return decPart !== undefined ? `$${intFmt}.${decPart.slice(0, 2)}` : `$${intFmt}`;
}
