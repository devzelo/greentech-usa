import Project from "../models/Project";

/**
 * CR 295 (2026-09-24): the GT project number is four plain digits and nothing else. The first two
 * are the year the contract was signed, the last two are the project's place in that year, from
 * 01. The first project of 2026 is 2601, the second 2602, and 2027 starts again at 2701.
 *
 * It used to read <year>-<NN> ("2026-10"). Numbers issued under that scheme are left alone: an id
 * is in the project's URL and in the path of every file uploaded to it, so renumbering old
 * projects would be a data migration, not a display change. They still count towards the year's
 * sequence, so a 2026 project can never be handed a number that looks like an earlier one.
 */

/** The two digits a number starts with: the contract date's year, else the year on the project. */
export function yearPrefix(contractDate?: string, contractYear?: string): string {
  const fromDate = /^([0-9]{4})-[0-9]{2}-[0-9]{2}$/.exec(String(contractDate ?? "").trim());
  const four = /^[0-9]{4}$/.test(String(contractYear ?? "").trim());
  const year = fromDate ? fromDate[1] : four ? String(contractYear).trim() : String(new Date().getFullYear());
  return year.slice(-2);
}

/**
 * The next free number for that year. Worked out from the highest number already issued, not from
 * a count, so deleting a project can never mint a duplicate.
 */
export async function nextProjectNumber(contractDate?: string, contractYear?: string): Promise<string> {
  const yy = yearPrefix(contractDate, contractYear);
  const yyyy = String(new Date().getFullYear()).slice(0, 2) + yy;   // 26 -> 2026, for the old ids
  // [0-9] rather than \d: the year is interpolated into these, and this survives any tooling that
  // mangles backslashes.
  const [current, legacy] = await Promise.all([
    Project.find({ projectId: new RegExp("^" + yy + "[0-9]{2,}$") }).select("projectId").lean(),
    Project.find({ projectId: new RegExp("^" + yyyy + "-[0-9]+$") }).select("projectId").lean(),
  ]);
  const highest = Math.max(
    0,
    ...current.map((p) => parseInt(String(p.projectId).slice(2), 10)).filter((n) => isFinite(n)),
    ...legacy.map((p) => parseInt(String(p.projectId).split("-")[1] || "0", 10)).filter((n) => isFinite(n)),
  );
  // Past 99 in one year the number grows a digit rather than refusing to create the project.
  return yy + String(highest + 1).padStart(2, "0");
}
