import Project from "../models/Project";

/**
 * CR 295 (2026-09-24): the GT project number is four plain digits and nothing else. The first two
 * are the year, the last two are the project's place in that year, from 01. The first project of
 * 2026 is 2601, the second 2602, and 2027 starts again at 2701.
 *
 * CR 313 (2026-09-25): the year is the year the project is created, not the contract's. A project
 * starts life as an opportunity or a proposal, often months before any award, and keeps its number
 * from then to closeout: a proposal written in November 2026 and awarded in 2027 stays 26xx. Every
 * project made that year counts, drafts and proposals included, and a number is never handed out
 * twice, so a cancelled proposal's number is simply not used again.
 *
 * It used to read <year>-<NN> ("2026-10"). Numbers issued under that scheme are left alone: an id
 * is in the project's URL and in the path of every file uploaded to it, so renumbering old
 * projects would be a data migration, not a display change. They still count towards the year's
 * sequence, so a 2026 project can never be handed a number that looks like an earlier one.
 */

/** The two digits a number starts with: the year it is created in. */
export function yearPrefix(now = new Date()): string {
  return String(now.getFullYear()).slice(-2);
}

/**
 * The next free number for that year. Worked out from the highest number already issued, not from
 * a count, so deleting a project can never mint a duplicate.
 */
export async function nextProjectNumber(now = new Date()): Promise<string> {
  const yy = yearPrefix(now);
  const yyyy = String(now.getFullYear());   // 2026, for the old "2026-10" ids
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
