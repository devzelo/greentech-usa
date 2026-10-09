import type { ApiProject, GalleryItem } from "./api";

// 2026-10-09 - the project's pictures are one gallery: Manage Showcase and Project Identity show and
// edit the same one. Its first picture is the cover, kept as the project's image (the header, the
// cards, the reports); up to two pictures are picked for the Quick Report's cover page. The server
// keeps the cover in step (backend lib/projectGallery).

/** How many pictures the Quick Report's cover can show. */
export const REPORT_PICKS = 2;

/** The gallery, with a project from before keeping its cover picture as the first. */
export function linkedGallery(p: Pick<ApiProject, "image" | "gallery">): GalleryItem[] {
  const g = (p.gallery || []).filter((x) => !!x.url);
  if (!p.image || g.some((x) => x.url === p.image)) return g;
  return [{ type: "image", source: "upload", url: p.image, caption: "" }, ...g];
}

/** The Quick Report cover's pictures: the ones picked (two at most), else the cover picture. */
export function reportCoverUrls(p: Pick<ApiProject, "image" | "gallery">): string[] {
  const images = linkedGallery(p).filter((x) => x.type === "image");
  const picked = images.filter((x) => x.report).slice(0, REPORT_PICKS);
  return (picked.length ? picked : images.slice(0, 1)).map((x) => x.url);
}
