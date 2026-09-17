import Project from "../models/Project";
import ProjectCategory from "../models/ProjectCategory";

// CR 184: "Project Nature" and "Categories" were two lists for the same thing. Categories is now
// the only one. This folds every project's Project Nature into its categories (mapping the old
// short names onto the service names), adds custom types to the shared custom list, and clears
// Project Nature. Idempotent: a project with no Project Nature left is skipped.
const MAP: Record<string, string> = {
  "wwtp": "Wastewater Treatment Plant (WWTP)",
  "wtp": "Water Treatment Plant (WTP)",
  "hvac": "Commercial HVAC Services",
  "laboratory service": "Laboratory Services",
  "preventive maintenance (pm)": "Prevention Maintenance",
  "idiq": "IDIQ",
};
const STANDARD = new Set(Object.values(MAP).map((v) => v.toLowerCase()));
// Older free-text categories that mean a standard one.
const ALIASES: Record<string, string> = {
  "water treatment": "Water Treatment Plant (WTP)",
  "wastewater treatment": "Wastewater Treatment Plant (WWTP)",
  "wastewater": "Wastewater Treatment Plant (WWTP)",
  "commercial hvac": "Commercial HVAC Services",
  "hvac": "Commercial HVAC Services",
  "laboratory service": "Laboratory Services",
  "preventive maintenance": "Prevention Maintenance",
  "preventive maintenance (pm)": "Prevention Maintenance",
};

/** Rename old category spellings to the standard names and drop the duplicates this creates. */
export async function normalizeCategoryAliases(): Promise<number> {
  const keys = Object.keys(ALIASES);
  const projects = await Project.find().select("categories category");
  let changed = 0;
  for (const p of projects) {
    const before = p.categories?.length ? p.categories : p.category ? [p.category] : [];
    if (!before.some((c) => keys.includes(String(c).toLowerCase()))) continue;
    const seen = new Set<string>();
    const after: string[] = [];
    for (const c of before) {
      const name = ALIASES[String(c).toLowerCase()] || c;
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      after.push(name);
    }
    p.categories = after;
    p.category = after[0] || "";
    await p.save();
    changed++;
  }
  return changed;
}

export async function foldNatureIntoCategories(): Promise<number> {
  const projects = await Project.find({
    $or: [{ "projectNature.selected.0": { $exists: true } }, { "projectNature.custom.0": { $exists: true } }],
  }).select("categories category projectNature");
  let changed = 0;
  for (const p of projects) {
    const nature = p.projectNature || { selected: [], custom: [] };
    const cats = [...(p.categories?.length ? p.categories : p.category ? [p.category] : [])];
    const have = new Set(cats.map((c) => c.toLowerCase()));
    // Only ticked types count; custom types that were added but never ticked are just offered.
    for (const raw of nature.selected || []) {
      const v = String(raw || "").trim();
      if (!v) continue;
      const name = MAP[v.toLowerCase()] || v;
      if (!have.has(name.toLowerCase())) { cats.push(name); have.add(name.toLowerCase()); }
    }
    for (const raw of [...(nature.selected || []), ...(nature.custom || [])]) {
      const v = String(raw || "").replace(/\s+/g, " ").trim();
      if (!v || MAP[v.toLowerCase()] || STANDARD.has(v.toLowerCase())) continue;
      await ProjectCategory.updateOne({ key: v.toLowerCase() }, { $setOnInsert: { name: v, key: v.toLowerCase(), createdByName: "" } }, { upsert: true });
    }
    p.categories = cats;
    p.category = cats[0] || "";
    p.projectNature = { selected: [], custom: [] };
    p.markModified("projectNature");
    await p.save();
    changed++;
  }
  return changed;
}
