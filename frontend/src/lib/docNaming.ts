/**
 * 2026-10-07 - "rename the files after uploading, auto naming suggestion should be available too":
 * a project document's suggested name, Project No_Place_File_Date, e.g.
 * "2601_Scope-of-Work_Geotechnical-Report_20261005.pdf". Place is the folder the file is in (or
 * the tab, at its top level); File is the name it was uploaded with, tidied (no "(1)" or "copy").
 */

/** "Report (1).pdf" -> ["Report (1)", "pdf"]. A name with no extension has "" for it. */
export function splitExt(name: string): [string, string] {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? [name.slice(0, i), name.slice(i + 1)] : [name, ""];
}

/** Words joined by hyphens, accents and symbols dropped: "Pre-Bid & Site Visit" -> "Pre-Bid-Site-Visit". */
function tidy(s: string, max: number): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/\(\d+\)|\bcopy\b/gi, " ")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, max).replace(/-+$/, "");
}

const pad = (n: number) => String(n).padStart(2, "0");

export function suggestDocName(o: { projectNo: string; place: string; original: string; date?: string | Date }): string {
  const [base, ext] = splitExt(o.original);
  const place = tidy(o.place, 30);
  let file = tidy(base, 40);
  if (file.toLowerCase() === place.toLowerCase()) file = "";
  const d = o.date ? new Date(o.date) : new Date();
  const day = Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const name = [tidy(o.projectNo, 20), place, file, day].filter(Boolean).join("_");
  return ext ? `${name}.${ext.toLowerCase()}` : name;
}

/** The name, or the name with -02, -03... when the folder already has it (case is ignored). */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name.toLowerCase())) return name;
  const [base, ext] = splitExt(name);
  for (let n = 2; n < 1000; n++) {
    const next = `${base}-${pad(n)}${ext ? `.${ext}` : ""}`;
    if (!taken.has(next.toLowerCase())) return next;
  }
  return name;
}
