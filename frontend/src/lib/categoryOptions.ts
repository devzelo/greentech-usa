import { useEffect, useSyncExternalStore } from "react";
import { SERVICE_CATEGORIES } from "../data/services";
import { createProjectCategory, fetchProjectCategories, type ApiProjectCategory } from "./api";

// CR 183: the category choices every project picker shows: the standard services plus the custom
// categories anyone has added (loaded once, shared by all pickers on the page).

let custom: ApiProjectCategory[] = [];
let loaded = false;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function load(force = false) {
  if (loading || (loaded && !force)) return loading;
  loading = fetchProjectCategories()
    .then((list) => { custom = list; loaded = true; })
    .catch(() => { /* offline: standard list only */ })
    .finally(() => { loading = null; emit(); });
  return loading;
}

// CR 184: Project Nature is now part of Categories. IDIQ was only a Project Nature type.
export const DEFAULT_CATEGORIES = [...SERVICE_CATEGORIES, "IDIQ"];

export function useCategoryOptions(): { defaults: string[]; custom: ApiProjectCategory[] } {
  useEffect(() => { void load(); }, []);
  const list = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => custom);
  return { defaults: DEFAULT_CATEGORIES, custom: list };
}

/** Add a custom category for everyone. Returns the stored name (an existing one keeps its spelling). */
export async function addCategoryOption(name: string): Promise<string> {
  const clean = name.replace(/\s+/g, " ").trim();
  const std = DEFAULT_CATEGORIES.find((d) => d.toLowerCase() === clean.toLowerCase());
  if (std) return std;
  const doc = await createProjectCategory(clean);
  if (!custom.some((c) => c._id === doc._id)) {
    custom = [...custom, doc].sort((a, b) => a.name.localeCompare(b.name));
    emit();
  }
  return doc.name;
}

export function forgetCategoryOption(id: string) {
  custom = custom.filter((c) => c._id !== id);
  emit();
}
