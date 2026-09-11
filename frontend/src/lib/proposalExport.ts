import { pdf } from "@react-pdf/renderer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { documentUrl, withFileToken, type ApiDocument } from "./api";
import { PAGE_NUMBER_POS, abs } from "../components/pdf/brand";

/** A piece of an assembled proposal: generated pages, or uploaded files inserted as they are. */
export type ProposalPart =
  | { type: "doc"; element: unknown; usesPageNumbers?: boolean }   // usesPageNumbers: re-rendered once page numbers are known
  | { type: "files"; files: Array<{ name: string; url: string }>; key?: string }   // key: the section these files start
  | { type: "bytes"; name: string; bytes: ArrayBuffer };   // a file already in memory (e.g. chosen but not yet uploaded)

/**
 * Page tracking for the table of contents (spec 1: "Automatically generate and update the Table of
 * Contents and page numbers"). On the first pass every section reports the page it lands on within
 * its own part (`probe`); the assembler turns those into page numbers of the finished file
 * (`pageOf`, the same numbers stamped as "Page N of M") and rebuilds the parts that print them.
 */
export interface PageCtx {
  probe?: (key: string, pageInPart: number) => void;
  pageOf?: Record<string, number>;
}

type Source =
  | { kind: "pdf"; bytes: ArrayBuffer; asIs: boolean; pages: number }
  | { kind: "image"; bytes: ArrayBuffer; ext: "png" | "jpg" | "jpeg" };

const pagesOf = (s: Source) => (s.kind === "pdf" ? s.pages : 1);

const extOf = (name: string, url = "") =>
  (/\.[a-z0-9]+$/i.test(name) ? name.split(".").pop() : url.split("?")[0].split(".").pop() || "")!.toLowerCase();

// Uploaded documents sit behind the token guard (images are public); brand assets are plain paths.
function fetchUrl(url: string): string {
  const s = url.replace(/\\/g, "/");
  if (/^\/?uploads\//.test(s)) return withFileToken(`/${s.replace(/^\/+/, "")}`);
  return abs(s);
}

async function renderDoc(element: unknown): Promise<Source> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(element as any).toBlob();
  const bytes = await blob.arrayBuffer();
  return { kind: "pdf", bytes, asIs: false, pages: (await PDFDocument.load(bytes)).getPageCount() };
}

async function sourceFromBytes(name: string, bytes: ArrayBuffer, skipped: string[], url = ""): Promise<Source | null> {
  const ext = extOf(name, url);
  try {
    if (ext === "pdf") return { kind: "pdf", bytes, asIs: true, pages: (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount() };
    if (ext === "png" || ext === "jpg" || ext === "jpeg") return { kind: "image", bytes, ext };
  } catch { /* an unreadable file is skipped below */ }
  skipped.push(name); // docx/xlsx etc. can't be embedded into a PDF
  return null;
}

async function fetchFile(name: string, url: string, skipped: string[]): Promise<Source | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) { skipped.push(name); return null; }
    return await sourceFromBytes(name, await res.arrayBuffer(), skipped, url);
  } catch {
    skipped.push(name);
    return null;
  }
}

/** Page numbers in the finished file, from where each section landed within its part. */
function computePageOf(parts: ProposalPart[], rendered: Source[][], found: Array<Record<string, number>>) {
  const pageOf: Record<string, number> = {};
  let offset = 0;
  parts.forEach((part, i) => {
    for (const [k, p] of Object.entries(found[i] || {})) if (!(k in pageOf)) pageOf[k] = offset + p;
    if (part.type === "files" && part.key && rendered[i]?.length && !(part.key in pageOf)) pageOf[part.key] = offset + 1;
    offset += (rendered[i] || []).reduce((n, s) => n + pagesOf(s), 0);
  });
  return pageOf;
}

/**
 * Assemble a proposal: generated pages and uploaded files in document order, so a section's client
 * forms land right after it (as on the client's samples), then any trailing attachments.
 *
 * Pass a function of PageCtx to get page numbers in the contents: the parts are rendered once while
 * each section reports its page, then the parts marked `usesPageNumbers` are rendered again with the
 * numbers (a further time if the contents changed length, which moves everything after it).
 *
 * "Page i of N" runs across everything but is stamped only on our own pages: uploaded documents keep
 * their own footers and numbering untouched, and the cover is counted but not numbered.
 */
export async function assembleProposalParts(
  input: ProposalPart[] | ((ctx: PageCtx) => ProposalPart[]),
  trailing: ApiDocument[] = [],
  // numberFirstPage: a document with no cover (an agreement) numbers its first page too.
  opts: { numberFirstPage?: boolean } = {},
): Promise<{ blob: Blob; skipped: string[] }> {
  const build = typeof input === "function" ? input : () => input;
  const skipped: string[] = [];
  const found: Array<Record<string, number>> = [];
  let current = 0;
  // react-pdf calls a marker again each time pagination pushes it onward (e.g. 3, 4, 5, 5); the last
  // call is where it finally sits, so the last report wins. A section spanning pages reports only
  // the page it starts on.
  const probe = (key: string, page: number) => {
    const rec = found[current] || (found[current] = {});
    rec[key] = page;
  };

  // Pass 1: everything, recording where each section lands.
  const parts = build({ probe });
  const rendered: Source[][] = [];
  for (let i = 0; i < parts.length; i++) {
    current = i;
    const part = parts[i];
    if (part.type === "doc") {
      rendered[i] = [await renderDoc(part.element)];
    } else if (part.type === "bytes") {
      const src = await sourceFromBytes(part.name, part.bytes, skipped);
      rendered[i] = src ? [src] : [];
    } else {
      const srcs: Source[] = [];
      for (const f of part.files) { const s = await fetchFile(f.name, fetchUrl(f.url), skipped); if (s) srcs.push(s); }
      rendered[i] = srcs;
    }
  }

  // Pass 2 (3 at most): the parts that print page numbers, now with the numbers.
  if (typeof input === "function" && parts.some((p) => p.type === "doc" && p.usesPageNumbers)) {
    for (let pass = 0; pass < 2; pass++) {
      const again = build({ pageOf: computePageOf(parts, rendered, found), probe });
      let moved = false;
      for (let i = 0; i < again.length; i++) {
        const part = again[i];
        if (part.type !== "doc" || !part.usesPageNumbers) continue;
        current = i;
        found[i] = {};
        const before = pagesOf(rendered[i][0]);
        rendered[i] = [await renderDoc(part.element)];
        if (pagesOf(rendered[i][0]) !== before) moved = true;
      }
      if (!moved) break;
    }
  }

  // Merge in order.
  const merged = await PDFDocument.create();
  const asIs = new Set<number>();   // page indices inserted from uploads
  const append = async (s: Source) => {
    if (s.kind === "pdf") {
      const src = await PDFDocument.load(s.bytes, { ignoreEncryption: true });
      const copied = await merged.copyPages(src, src.getPageIndices());
      for (const p of copied) { if (s.asIs) asIs.add(merged.getPageCount()); merged.addPage(p); }
      return;
    }
    const img = s.ext === "png" ? await merged.embedPng(s.bytes) : await merged.embedJpg(s.bytes);
    asIs.add(merged.getPageCount());
    const page = merged.addPage([595.28, 841.89]); // A4 points
    const { width, height } = page.getSize();
    const m = 48;
    const scale = Math.min((width - m * 2) / img.width, (height - m * 2) / img.height, 1);
    const w = img.width * scale, h = img.height * scale;
    page.drawImage(img, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
  };
  for (const srcs of rendered) for (const s of srcs) await append(s);
  for (const a of trailing) { const s = await fetchFile(a.name, documentUrl(a), skipped); if (s) await append(s); }

  // Page numbers, in the letterhead footer's right-hand slot (level with its reference line).
  const font = await merged.embedFont(StandardFonts.Helvetica);
  const pages = merged.getPages();
  pages.forEach((p, i) => {
    if ((i === 0 && !opts.numberFirstPage) || asIs.has(i)) return;
    const { width } = p.getSize();
    const text = `Page ${i + 1} of ${pages.length}`;
    const size = 7.5;
    const tw = font.widthOfTextAtSize(text, size);
    p.drawText(text, { x: width - PAGE_NUMBER_POS.right - tw, y: PAGE_NUMBER_POS.baseline, size, font, color: rgb(0.39, 0.45, 0.55) });
  });

  const out = await merged.save();
  return { blob: new Blob([out], { type: "application/pdf" }), skipped };
}

/** One generated document plus trailing attachments (the original single-document form). */
export async function assembleProposalPdf(element: unknown, attachments: ApiDocument[] = []) {
  return assembleProposalParts([{ type: "doc", element }], attachments);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
