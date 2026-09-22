/**
 * CR 265 - one place that builds the name a generated file is saved under, so a downloaded file
 * reads like the thing it is ("Project C - Technical Proposal.pdf"), not a slug.
 * Windows forbids \ / : * ? " < > | in file names, so those are replaced rather than dropped.
 */
export function fileName(parts: Array<string | undefined | null>, ext: string): string {
  const base = parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(" - ")
    .replace(/[\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Document";
  const clean = ext.replace(/^\./, "");
  return `${base}.${clean}`;
}
