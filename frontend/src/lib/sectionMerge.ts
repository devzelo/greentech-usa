// CR-P (36) — live changes to an agreement's sections, merged SECTION BY SECTION.
//
// Before, the whole section list moved as one unit: while one person typed in section 1, a
// colleague's edit to section 3 was held back, and the first person's next save overwrote it (the
// last save won). Each section now carries a stable id, and a three-way merge decides per section,
// comparing what is on my screen, what the server has, and the copy both of us started from:
// - changed only on the other side: take theirs (edits, deletions and formatting alike);
// - changed only here, or on both sides: keep mine (a clash on both sides is counted, so the editor
//   can say "kept yours");
// - deleted on one side and untouched on the other: it goes; deleted on one side but edited on the
//   other: it stays, so nobody's work disappears.
// The order follows my screen, unless only the other side reordered, in which case theirs wins.

export type WithId = { id?: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A new, unique section id. */
export const newSectionId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * Sections saved before ids existed get one from their position. Everyone who opens the same
 * agreement derives the same ids, so their copies line up until the first save stores real ones.
 */
export const withSectionIds = <T extends WithId>(list: T[]): T[] =>
  list.map((s, i) => (s.id ? s : { ...s, id: `x${i}` }));

export interface SectionMerge<T> { list: T[]; changed: number; blocked: number }

export function mergeSections<T extends WithId>(mine: T[], server: T[], base: T[]): SectionMerge<T> {
  const key = (s: T) => s.id || "";
  const B = new Map(base.map((s) => [key(s), s]));
  const S = new Map(server.map((s) => [key(s), s]));
  const M = new Map(mine.map((s) => [key(s), s]));
  const resolved = new Map<string, T>();
  let changed = 0, blocked = 0;

  for (const m of mine) {
    const id = key(m), b = B.get(id), s = S.get(id);
    if (!b) { resolved.set(id, m); continue; }            // added here since the common copy
    if (!s) {                                              // deleted on the other side
      if (same(m, b)) { changed++; continue; }             //   untouched here: it goes
      blocked++; resolved.set(id, m); continue;            //   edited here: keep it
    }
    const theirs = !same(s, b), ours = !same(m, b);
    if (theirs && !ours) { resolved.set(id, s); changed++; continue; }
    if (theirs && ours && !same(s, m)) blocked++;
    resolved.set(id, m);
  }
  for (const s of server) {
    const id = key(s);
    if (M.has(id)) continue;
    const b = B.get(id);
    if (!b) { resolved.set(id, s); changed++; continue; }  // added on the other side
    if (same(s, b)) continue;                              // deleted here, untouched there
    blocked++; resolved.set(id, s);                        // deleted here but edited there: keep it
  }

  // Order: my screen's, unless only the other side reordered.
  const ids = (arr: T[]) => arr.map(key);
  const common = (arr: T[]) => ids(arr).filter((id) => B.has(id) && resolved.has(id));
  const baseOrder = ids(base).filter((id) => resolved.has(id));
  const iReordered = !same(common(mine), baseOrder);
  const theyReordered = !same(common(server), baseOrder);
  const primary = !iReordered && theyReordered ? ids(server) : ids(mine);
  const order: string[] = [];
  for (const id of primary) if (resolved.has(id) && !order.includes(id)) order.push(id);
  // Anything not placed yet goes after its neighbour in the list it came from.
  const place = (src: string[]) => src.forEach((id, i) => {
    if (!resolved.has(id) || order.includes(id)) return;
    let j = i - 1;
    while (j >= 0 && !order.includes(src[j])) j--;
    order.splice(j >= 0 ? order.indexOf(src[j]) + 1 : 0, 0, id);
  });
  place(ids(server));
  place(ids(mine));
  // A reorder taken from the other side is a change too, even when no section's content moved.
  if (changed === 0 && !same(ids(mine), order)) changed++;
  return { list: order.map((id) => resolved.get(id)!), changed, blocked };
}
