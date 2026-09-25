import type { ApiMilestone, MilestoneStatus } from "./api";
import { CUSTOM_KEY, addDuration, newMilestoneId, parseDate, toIso, wbsNumbers } from "./projectSchedule";
import { parsePreds } from "./scheduleLinks";

/**
 * CR 239: schedules are usually drafted in Excel first and imported. One standard column layout,
 * offered as a template to download; the importer also accepts the usual alternative headings so a
 * Primavera-style export can come in without renaming every column.
 *
 * CR 300 - the scheduler's columns too: the number (1.1, or an activity ID such as A1000), the
 * type (task or milestone) and the predecessors (1.2, 2.1SS+3d), so a schedule downloaded for Excel
 * comes back in with its links.
 */

export const TEMPLATE_COLUMNS = [
  "#", "Category", "Task / Milestone", "Type", "Description", "Duration (days)", "Planned start", "Planned finish", "Predecessors",
  "Actual start", "Actual finish", "Status", "% complete", "Responsible",
] as const;

// Heading -> field. Matched case-insensitively on the heading with punctuation removed.
const ALIASES: Record<string, keyof Row> = {
  category: "category", phase: "category", group: "category", wbs: "category", section: "category", milestone: "category",
  "task milestone": "name", task: "name", activity: "name", "activity name": "name", "task name": "name", name: "name", title: "name", "milestone description": "name",
  description: "description", details: "description", remarks: "description",
  "duration days": "duration", duration: "duration", "original duration": "duration", days: "duration",
  "planned start": "start", start: "start", "start date": "start", "baseline start": "start",
  "planned finish": "finish", finish: "finish", "finish date": "finish", end: "finish", "end date": "finish", "planned end": "finish",
  "actual start": "actualStart", "actual finish": "actualFinish", "actual end": "actualFinish",
  status: "status", "percent complete": "percent", "complete": "percent", percent: "percent", progress: "percent",
  responsible: "responsible", owner: "responsible", "responsible person": "responsible", assignee: "responsible",
  no: "number", number: "number", "item no": "number", "activity id": "number", "task id": "number", id: "number", ref: "number",
  type: "type", "activity type": "type", "task type": "type",
  predecessors: "preds", predecessor: "preds", "depends on": "preds", links: "preds", "predecessor ids": "preds",
};

interface Row {
  category: unknown; name: unknown; description: unknown; duration: unknown; start: unknown; finish: unknown;
  actualStart: unknown; actualFinish: unknown; status: unknown; percent: unknown; responsible: unknown;
  number: unknown; type: unknown; preds: unknown;
}

const norm = (h: unknown) => String(h ?? "").toLowerCase().replace(/[%()/_\-.:#]/g, " ").replace(/\s+/g, " ").trim();

/** An Excel serial, a Date, or a date written as text, as yyyy-mm-dd (or ""). */
function toDate(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date && !isNaN(v.getTime())) return toIso(v);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel counts days from 30 Dec 1899.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return toIso(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const s = String(v).trim().replace(/\s*[AaXx*]$/, "");   // Primavera marks actual / constrained dates with a letter
  const d = parseDate(s) || (Date.parse(s) ? new Date(Date.parse(s)) : null);
  return d && !isNaN(d.getTime()) ? toIso(d) : "";
}

function toStatus(v: unknown, percent: number): MilestoneStatus {
  const s = norm(v);
  if (/complet|done|finish/.test(s)) return "completed";
  if (/progress|started|ongoing|active/.test(s)) return "in_progress";
  if (/hold/.test(s)) return "on_hold";
  if (/delay|late/.test(s)) return "delayed";
  if (/cancel/.test(s)) return "cancelled";
  if (percent >= 100) return "completed";
  if (percent > 0) return "in_progress";
  return "not_started";
}

export interface ImportResult {
  milestones: ApiMilestone[];
  categories: string[];
  skipped: number;          // rows with no task name
  headerRow: number;        // 1-based row the headings were found on
  unknownColumns: string[];
  /** CR 300 - links read from the Predecessors column, and those naming no task in the sheet. */
  linked: number;
  unmatchedLinks: number;
}

/** Read a schedule from an .xlsx / .xls / .csv file. */
export async function readScheduleFile(file: File): Promise<ImportResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });

  // The heading row is the first row within the top 15 that names a task column.
  let headerAt = grid.findIndex((r, i) => i < 15 && (r || []).some((c) => ALIASES[norm(c)] === "name"));
  if (headerAt < 0) headerAt = 0;
  // "#" is all punctuation, so it is read as the number column before the headings are cleaned.
  const heads = (grid[headerAt] || []).map((h) => (String(h ?? "").trim() === "#" ? "number" : norm(h)));
  const fieldAt: Partial<Record<keyof Row, number>> = {};
  const unknown: string[] = [];
  heads.forEach((h, i) => {
    const f = ALIASES[h];
    if (f && fieldAt[f] === undefined) fieldAt[f] = i;
    else if (h && !f) unknown.push(String(grid[headerAt][i]));
  });
  // "Milestone" means the category only when there is a separate task column.
  if (fieldAt.name === undefined && fieldAt.category !== undefined) { fieldAt.name = fieldAt.category; delete fieldAt.category; }

  const get = (r: unknown[], f: keyof Row) => (fieldAt[f] === undefined ? "" : r[fieldAt[f]!]);
  const out: ApiMilestone[] = [];
  const refs: Array<{ number: string; preds: string }> = [];
  let skipped = 0;
  let carriedCategory = "";
  for (const r of grid.slice(headerAt + 1)) {
    if (!r || r.every((c) => c === "" || c === null)) continue;
    const name = String(get(r, "name") ?? "").trim();
    const cat = String(get(r, "category") ?? "").trim();
    const start = toDate(get(r, "start"));
    const finishRaw = toDate(get(r, "finish"));
    // A row with only a category (a group heading in the sheet) sets the category for the rows under it.
    if (!name && cat) { carriedCategory = cat; continue; }
    if (!name) { skipped++; continue; }
    // A heading row inside the task column (no dates, no duration) also starts a new category.
    const dur = Number(String(get(r, "duration") ?? "").replace(/[^0-9.]/g, "")) || 0;
    // With no category column, a row with a name but no dates and no duration is a group heading
    // (how Primavera lays out a WBS): it names the category for the rows under it.
    if (!cat && !start && !finishRaw && !dur && fieldAt.category === undefined) { carriedCategory = name; continue; }
    const finish = finishRaw || (start && dur ? toIso(addDuration(parseDate(start)!, dur, "days")) : "");
    // 40, "40%" and 0.4 (a cell formatted as a percentage) all mean 40%.
    const rawPct = get(r, "percent");
    let pctNum = Number(String(rawPct ?? "").replace(/[^0-9.]/g, "")) || 0;
    if (typeof rawPct === "number" && rawPct > 0 && rawPct <= 1) pctNum = rawPct * 100;
    const percent = Math.max(0, Math.min(100, Math.round(pctNum)));
    const actualStart = toDate(get(r, "actualStart"));
    const actualEnd = toDate(get(r, "actualFinish"));
    const status = toStatus(get(r, "status"), actualEnd ? 100 : percent);
    // A milestone by its type, or (with no type column) by a duration given as 0.
    const typeText = norm(get(r, "type"));
    const rawDur = String(get(r, "duration") ?? "").trim();
    const isMilestone = fieldAt.type !== undefined ? /mile|finish mile|start mile/.test(typeText) : rawDur !== "" && dur === 0 && !!start;
    refs.push({ number: String(get(r, "number") ?? "").trim(), preds: String(get(r, "preds") ?? "").trim() });
    out.push({
      id: newMilestoneId(), key: CUSTOM_KEY, name: name.slice(0, 160),
      description: String(get(r, "description") ?? "").trim().slice(0, 2000),
      category: (cat || carriedCategory).slice(0, 80),
      plannedStart: start, plannedEnd: finish, baselineStart: "", baselineEnd: "",
      actualStart, actualEnd,
      durationValue: finishRaw ? 0 : dur, durationUnit: "days",
      status, percent: status === "completed" ? 100 : percent,
      responsible: String(get(r, "responsible") ?? "").split(/[;,]/).map((x) => x.trim()).filter(Boolean),
      notes: "",
      ...(isMilestone ? { isMilestone: true, durationValue: 0, plannedEnd: start } : {}),
    });
  }
  const categories = [...new Set(out.map((m) => m.category || "").filter(Boolean))];
  // The links, by the numbers in the sheet's own # column, or else by the 1.1 numbers the tasks
  // take here (which are the numbers a downloaded schedule carries).
  let linked = 0, unmatched = 0;
  if (fieldAt.preds !== undefined) {
    const own = new Map<string, string>();
    refs.forEach((x, i) => { if (x.number) own.set(x.number.toLowerCase(), out[i].id); });
    const wbs = wbsNumbers(out, categories).task;
    const byWbs = new Map<string, string>([...wbs].map(([id, n]) => [n, id]));
    const idOf = (n: string) => (own.size ? own.get(n.toLowerCase()) : byWbs.get(n));
    refs.forEach((x, i) => {
      if (!x.preds) return;
      const { preds, unknown: miss } = parsePreds(x.preds, idOf);
      const clean = preds.filter((q) => q.id !== out[i].id);
      if (clean.length) { out[i] = { ...out[i], predecessors: clean }; linked += clean.length; }
      unmatched += miss.length;
    });
  }
  return { milestones: out, categories, skipped, headerRow: headerAt + 1, unknownColumns: unknown, linked, unmatchedLinks: unmatched };
}

/** The template: the headings and a few example rows, as an .xlsx. */
export async function scheduleTemplate(): Promise<Blob> {
  const XLSX = await import("xlsx");
  const rows = [
    [...TEMPLATE_COLUMNS],
    ["1.1", "Award / NTP", "Notice to Proceed", "Milestone", "Contract award and NTP", 0, "2026-07-16", "2026-07-16", "", "", "", "Completed", 100, "Project Manager"],
    ["2.1", "Design", "Final design submitted", "Task", "Drawings and calculations", 90, "2026-07-17", "", "1.1", "", "", "In progress", 40, "Design Lead"],
    ["2.2", "Design", "Design approval", "Milestone", "", 0, "2026-10-15", "", "2.1", "", "", "Not started", 0, "Client"],
    ["3.1", "Procurement", "Pumps and valves", "Task", "RFQ, PO, fabrication, shipping", 120, "2026-09-01", "", "2.1SS+30d", "", "", "Not started", 0, "Procurement"],
    ["4.1", "Construction", "Tank foundations", "Task", "", 45, "2026-12-01", "", "2.2, 3.1FS+5d", "", "", "Not started", 0, "Site Engineer"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: Math.max(12, c.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Schedule");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
