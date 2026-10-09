// 2026-10-09 - the project's pictures are one gallery: Manage Showcase and Project Identity show and
// edit the same one. Its first picture is the cover, kept as the project's image (the header, the
// cards, the reports); up to two pictures are picked for the Quick Report's cover page.

export type GalleryEntry = { type: "image" | "video"; source: "upload" | "link"; url: string; caption: string; report: boolean };

/** How many pictures the Quick Report's cover can show. */
export const REPORT_PICKS = 2;

/** The gallery as saved: well-formed entries only, and no more than two picked for the report. */
export function cleanGallery(raw: unknown): GalleryEntry[] {
  if (!Array.isArray(raw)) return [];
  let picks = 0;
  return raw.flatMap((x): GalleryEntry[] => {
    if (!x || typeof x !== "object") return [];
    const g = x as Record<string, unknown>;
    const url = typeof g.url === "string" ? g.url.trim() : "";
    if (!url) return [];
    const type = g.type === "video" ? "video" : "image";
    const report = type === "image" && g.report === true && picks < REPORT_PICKS;
    if (report) picks++;
    return [{ type, source: g.source === "link" ? "link" : "upload", url, caption: typeof g.caption === "string" ? g.caption : "", report }];
  });
}

/** The cover: the gallery's first picture. */
export const coverOf = (gallery: GalleryEntry[]) => gallery.find((g) => g.type === "image")?.url || "";

/** A project from before keeps its cover picture as the gallery's first. */
export function linkedGallery(image: string | undefined, gallery: GalleryEntry[]): GalleryEntry[] {
  if (!image || gallery.some((g) => g.url === image)) return gallery;
  return [{ type: "image", source: "upload", url: image, caption: "", report: false }, ...gallery];
}
