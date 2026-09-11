import { PDFDocument, PDFFont, PDFImage, StandardFonts, degrees, rgb, type PDFPage } from "pdf-lib";
import { attachmentUrl, type ApiAgreement } from "./api";
import { GREENTECH, embedImage, drawFitted } from "./poPdf";
import { PDF_COLORS, DOC_SIZES } from "./docStyle";

// The shared agreement document — one formal layout for every context (employee, partner,
// subcontractor, vendor). Multi-page: a paginated cursor wraps long section text onto new
// pages automatically. Same visual language as the PO document.
const PAGE_W = 595.28, PAGE_H = 841.89, M = 52;
// CR-P (41) — colours and type sizes come from the shared document style system, so an agreement,
// the editor it was typed in, and every other GreenTech document agree by construction.
const GREEN = PDF_COLORS.brand, INK = PDF_COLORS.ink, MUTED = PDF_COLORS.muted;
const LINE = PDF_COLORS.line, HEADBG = PDF_COLORS.headBg, ROWALT = PDF_COLORS.rowAlt;

// CR-P (37) — one stretch of text carrying the styling the editor applied to it.
type RGB = ReturnType<typeof rgb>;
type Run = { text: string; color: RGB; bg: RGB | null; bold: boolean };

// CSS colours the editor can emit: #rgb, #rrggbb, rgb()/rgba(), and the few names it offers.
const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255],
  yellow: [255, 255, 0], orange: [255, 165, 0], purple: [128, 0, 128], gray: [128, 128, 128], grey: [128, 128, 128],
};
function parseCssColor(raw?: string | null): RGB | null {
  const s = (raw || "").trim().toLowerCase();
  if (!s || s === "inherit" || s === "initial" || s === "transparent" || s === "currentcolor") return null;
  if (NAMED[s]) { const [r, g, b] = NAMED[s]; return rgb(r / 255, g / 255, b / 255); }
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) { const h = m[1]; return rgb(parseInt(h[0] + h[0], 16) / 255, parseInt(h[1] + h[1], 16) / 255, parseInt(h[2] + h[2], 16) / 255); }
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) { const h = m[1]; return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255); }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  if (m) {
    // A fully transparent background is the browser's "no highlight" — treat it as none.
    const alpha = /^rgba\(/.test(s) ? parseFloat((/,\s*([\d.]+)\s*\)$/.exec(s) || [])[1] || "1") : 1;
    if (alpha === 0) return null;
    return rgb(Math.min(255, +m[1]) / 255, Math.min(255, +m[2]) / 255, Math.min(255, +m[3]) / 255);
  }
  return null;
}

// CR-P (42) — staple one attached file into the document: a divider naming where it came from,
// then the file itself. PDFs are merged page-for-page, images get their own page, and anything
// else gets a stub page naming it so the reader knows a file exists even if it can't be shown.
// The two callers hand in different kinds of location, and putting one through the other's
// resolver produced a 404 that was swallowed silently (the file simply did not print):
//  - a SECTION attachment stores an upload path, "uploads/agreements/x.pdf", which needs the
//    /uploads route and a file token;
//  - an NDA or standard-terms file stores an already-served URL, "/downloads/terms.pdf" or an
//    "/uploads/...?token=" link from Company Documents, which must be used exactly as it is.
function toDocUrl(p: string): string {
  const raw = (p || "").replace(/\\/g, "/");
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;      // already a served URL
  return attachmentUrl(raw);                 // a stored upload path
}

async function stapleAttachment(
  doc: PDFDocument,
  a: { name: string; filePath: string },
  heading: string,
  font: PDFFont,
  bold: PDFFont,
) {
  const url = toDocUrl(a.filePath);
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const bytes = await res.arrayBuffer();
    const ext = (a.name.split(".").pop() || "").toLowerCase();

    // Resolve the content FIRST, so a file that cannot be parsed never leaves an orphaned
    // divider page announcing an attachment that isn't there.
    const srcDoc = ext === "pdf" ? await PDFDocument.load(bytes, { ignoreEncryption: true }) : null;
    // CR-P (38) — go through embedImage so non-PNG/JPEG pictures are repainted, not dropped.
    const img = !srcDoc && ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"].includes(ext)
      ? await embedImage(doc, url) : null;

    const d = doc.addPage([PAGE_W, PAGE_H]);
    d.drawRectangle({ x: 0, y: PAGE_H / 2 - 2, width: PAGE_W, height: 4, color: GREEN });
    const h = heading.toUpperCase();
    d.drawText(h, { x: (PAGE_W - bold.widthOfTextAtSize(h, 18)) / 2, y: PAGE_H / 2 + 16, size: 18, font: bold, color: INK });
    d.drawText(a.name, { x: (PAGE_W - font.widthOfTextAtSize(a.name, 10)) / 2, y: PAGE_H / 2 - 24, size: 10, font, color: MUTED });

    if (srcDoc) {
      const pages = await doc.copyPages(srcDoc, srcDoc.getPageIndices());
      pages.forEach((p) => doc.addPage(p));
    } else if (img) {
      addImagePage(doc, img);
    } else {
      const p = doc.addPage([PAGE_W, PAGE_H]);
      p.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: GREEN });
      p.drawText("Attached file", { x: M, y: PAGE_H - 110, size: 13, font: bold, color: INK });
      p.drawText(a.name, { x: M, y: PAGE_H - 132, size: 11, font, color: MUTED });
      p.drawText("This file type cannot be shown inline — download the original from the agreement.", { x: M, y: PAGE_H - 152, size: 9, font, color: MUTED });
    }
  } catch { /* one unreadable attachment must not break the whole document */ }
}

// CR-P (39) — which logo belongs on a joint-venture letterhead.
//
// This used to fall back to the SECOND PARTY's logo when no JV logo was set, which is where
// "why is here so it's returning as a logo" came from: on a teaming agreement the second party is
// the counterparty, not the JV partner, so the wrong company's mark landed on our letterhead and
// displaced the name. Only the partner explicitly chosen for the JV counts now (CR-P (30)); with
// none chosen the header falls back to printing the JV partner's NAME, never a stray logo.
function jvLetterheadLogo(ag: ApiAgreement): string {
  return ag.jvLogoUrl || "";
}

// Greedy word-wrap for pdf-lib (drawText's own wrapping can't report height used).
function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    if (!raw.trim()) { out.push(""); continue; }
    let line = "";
    for (const word of raw.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxW && line) { out.push(line); line = word; }
      else line = test;
    }
    if (line) out.push(line);
  }
  return out;
}

class Cursor {
  page!: PDFPage;
  y = 0;
  constructor(private doc: PDFDocument, private header: (p: PDFPage) => void) { this.addPage(); }
  addPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.header(this.page);
    this.y = PAGE_H - 64;
  }
  need(h: number) { if (this.y - h < 56) this.addPage(); }
  text(t: string, font: PDFFont, size: number, color = INK, x = M) {
    this.need(size + 4);
    this.page.drawText(t, { x, y: this.y, size, font, color });
    this.y -= size + 4;
  }
  para(t: string, font: PDFFont, size: number, color = INK) {
    for (const line of wrap(font, t, size, PAGE_W - M * 2)) {
      if (!line) { this.y -= size * 0.7; continue; }
      this.text(line, font, size, color);
    }
  }

  // CR-P (37) — a paragraph made of styled runs. The editor lets people colour and highlight text,
  // and all of that used to be flattened away because the renderer took `el.textContent` and drew
  // it in one ink colour. Words are laid out one at a time so a colour or a highlight can change
  // mid-line, with the highlight drawn as a rectangle behind the word.
  runs(list: Run[], size: number, font: PDFFont, boldFont: PDFFont) {
    const maxX = M + (PAGE_W - M * 2);
    let x = M;
    this.need(size + 4);
    const newline = () => { this.y -= size + 4; this.need(size + 4); x = M; };
    for (const run of list) {
      const f = run.bold ? boldFont : font;
      for (const tok of run.text.split(/(\s+)/)) {
        if (!tok) continue;
        if (/^\s+$/.test(tok)) {
          // Collapse whitespace, and never start a line with it.
          if (x > M) x += f.widthOfTextAtSize(" ", size);
          continue;
        }
        let word = tok;
        let w = f.widthOfTextAtSize(word, size);
        if (x + w > maxX && x > M) newline();
        // A single "word" wider than the page (a long URL): chop it to fit.
        while (w > maxX - M && word.length > 1) { word = word.slice(0, -1); w = f.widthOfTextAtSize(word, size); }
        if (run.bg) this.page.drawRectangle({ x: x - 0.5, y: this.y - 2.5, width: w + 1, height: size + 3.5, color: run.bg });
        this.page.drawText(word, { x, y: this.y, size, font: f, color: run.color });
        x += w;
      }
    }
    this.y -= size + 4;
  }
  gap(h: number) { this.y -= h; }

  // Place an image (from the rich-text editor) constrained to a max box, growing downward.
  image(img: PDFImage, maxW: number, maxH: number) {
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale, h = img.height * scale;
    this.need(h + 6);
    this.page.drawImage(img, { x: M, y: this.y - h, width: w, height: h });
    this.y -= h + 6;
  }

  // Draw a simple bordered table (rows of plain-text cells; `heads[i]` marks a header row).
  table(rows: string[][], heads: boolean[], font: PDFFont, bold: PDFFont) {
    const contentW = PAGE_W - M * 2;
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const colW = contentW / cols;
    const size = 9, pad = 4, lh = size + 2;
    for (let ri = 0; ri < rows.length; ri++) {
      const isHead = heads[ri];
      const f = isHead ? bold : font;
      const wrapped = rows[ri].map((c) => wrap(f, c, size, colW - 2 * pad));
      const lineCount = Math.max(1, ...wrapped.map((w) => w.length));
      const rowH = lineCount * lh + 2 * pad;
      this.need(rowH);
      const yTop = this.y;
      // CR-P (41) — header rows take the brand tint, body rows alternate, so a table is legible
      // and recognisably ours instead of plain grey.
      if (isHead) this.page.drawRectangle({ x: M, y: yTop - rowH, width: contentW, height: rowH, color: HEADBG });
      else if (ri % 2 === 0) this.page.drawRectangle({ x: M, y: yTop - rowH, width: contentW, height: rowH, color: ROWALT });
      for (let ci = 0; ci < cols; ci++) {
        const cx = M + ci * colW;
        this.page.drawLine({ start: { x: cx, y: yTop }, end: { x: cx, y: yTop - rowH }, thickness: 0.5, color: LINE });
        let ty = yTop - pad - size;
        for (const wl of wrapped[ci] || []) { this.page.drawText(wl, { x: cx + pad, y: ty, size, font: f, color: INK }); ty -= lh; }
      }
      this.page.drawLine({ start: { x: M + contentW, y: yTop }, end: { x: M + contentW, y: yTop - rowH }, thickness: 0.5, color: LINE });
      this.page.drawLine({ start: { x: M, y: yTop }, end: { x: M + contentW, y: yTop }, thickness: 0.5, color: LINE });
      this.page.drawLine({ start: { x: M, y: yTop - rowH }, end: { x: M + contentW, y: yTop - rowH }, thickness: 0.5, color: LINE });
      this.y = yTop - rowH;
    }
    this.y -= 6;
  }
}

// Render a rich-text HTML body (from the editor) into the agreement, supporting paragraphs,
// headings, lists, images and tables. CR-P (37): inline colour, highlight and bold are carried
// through instead of being flattened. Falls back cleanly: plain-text bodies with no tags render
// as ordinary paragraphs.
async function renderHtml(cur: Cursor, doc: PDFDocument, html: string, font: PDFFont, bold: PDFFont) {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");

  // Walk a block's inline children, carrying colour / highlight / bold down the tree so a nested
  // <span style="color:red"><b>word</b></span> keeps both.
  const BOLD_TAGS = /^(B|STRONG|TH)$/;
  const collectRuns = (node: ChildNode, inherited: Omit<Run, "text">): Run[] => {
    if (node.nodeType === 3) {
      const text = node.textContent || "";
      return text ? [{ ...inherited, text }] : [];
    }
    if (node.nodeType !== 1) return [];
    const el = node as HTMLElement;
    const style = el.style;
    const next: Omit<Run, "text"> = {
      color: parseCssColor(style?.color) || parseCssColor(el.getAttribute("color")) || inherited.color,
      // <mark> is the editor's highlight when it doesn't use inline CSS.
      bg: parseCssColor(style?.backgroundColor) || (el.tagName === "MARK" ? rgb(1, 0.95, 0.4) : inherited.bg),
      bold: inherited.bold || BOLD_TAGS.test(el.tagName),
    };
    return Array.from(el.childNodes).flatMap((c) => collectRuns(c, next));
  };
  const baseRun: Omit<Run, "text"> = { color: INK, bg: null, bold: false };
  // Draw an element's text with its styling; returns false when there was nothing to draw.
  const drawStyled = (el: ChildNode, size: number, boldByDefault = false): boolean => {
    const list = collectRuns(el, { ...baseRun, bold: boldByDefault }).filter((r) => r.text);
    if (!list.some((r) => r.text.trim())) return false;
    cur.runs(list, size, font, bold);
    return true;
  };

  const drawImg = async (el: HTMLElement) => {
    const src = el.getAttribute("src"); if (!src) return;
    const img = await embedImage(doc, src); if (!img) return;
    const attrW = parseInt(el.getAttribute("width") || "", 10) || img.width;
    cur.image(img, Math.min(attrW, PAGE_W - M * 2), 380);
  };
  const drawTbl = (tbl: HTMLElement) => {
    const rows: string[][] = []; const heads: boolean[] = [];
    for (const tr of Array.from(tbl.querySelectorAll("tr"))) {
      const cells = Array.from(tr.children).filter((c) => /^(TD|TH)$/.test(c.tagName));
      if (!cells.length) continue;
      rows.push(cells.map((c) => (c.textContent || "").trim()));
      heads.push(cells.some((c) => c.tagName === "TH"));
    }
    if (!rows.length) return;
    // CR-P (40) — the table's caption prints immediately above it, with a 3pt gap rather than a
    // paragraph's worth of space, so the title reads as belonging to the table.
    const caption = (tbl.querySelector("caption")?.textContent || "").trim();
    if (caption) {
      cur.need(DOC_SIZES.small + 6 + 24);   // keep the title with at least the first row
      cur.text(caption, bold, DOC_SIZES.small, PDF_COLORS.ink);
      cur.y += 3;                           // pull the table up tight under its title
    }
    cur.table(rows, heads, font, bold);
  };
  const drawList = (el: HTMLElement, ordered: boolean) => {
    Array.from(el.children).forEach((li, i) => {
      if (!(li.textContent || "").trim()) return;
      // The marker keeps the default ink; the item's own text keeps whatever styling it carries.
      const marker: Run = { text: `${ordered ? `${i + 1}.` : "•"}  `, color: INK, bg: null, bold: false };
      cur.runs([marker, ...collectRuns(li, baseRun)], 9, font, bold);
    });
  };
  const walk = async (nodes: ChildNode[]) => {
    for (const node of nodes) {
      if (node.nodeType === 3) { const t = node.textContent || ""; if (t.trim()) cur.para(t, font, 9, INK); continue; }
      if (node.nodeType !== 1) continue;
      const el = node as HTMLElement; const tag = el.tagName.toUpperCase();
      if (tag === "IMG") { await drawImg(el); continue; }
      if (tag === "TABLE") { drawTbl(el); continue; }
      if (tag === "UL" || tag === "OL") { drawList(el, tag === "OL"); continue; }
      if (tag === "BR") { cur.gap(6); continue; }
      // CR-P (41) — a real heading scale. Every heading used to print at one flat size, so H1 and
      // H4 were indistinguishable on paper even though they looked different while being typed.
      if (/^H[1-6]$/.test(tag)) {
        const level = Number(tag[1]);
        const size = level <= 1 ? DOC_SIZES.subtitle : level === 2 ? DOC_SIZES.heading : DOC_SIZES.subheading;
        cur.gap(level <= 2 ? 6 : 4);
        if (drawStyled(el, size, true)) cur.gap(level <= 2 ? 3 : 2);
        continue;
      }
      // A container that wraps media/lists: recurse so nested images/tables are drawn in order.
      if (el.querySelector && el.querySelector("img, table, ul, ol")) { await walk(Array.from(el.childNodes)); continue; }
      drawStyled(el, 9);
    }
  };
  await walk(Array.from(parsed.body.childNodes));
}

// CR-P (21) — the dates this document carries. A date prints only when its box is ticked AND it
// holds a value, so an unticked or empty date is absent rather than shown as "—". Agreements saved
// before the flags existed have none, and every date they hold still prints.
export function shownDates(ag: ApiAgreement): Array<{ label: string; value: string }> {
  const f = ag.datesShown;
  const on = (k: "effective" | "start" | "end") => (f ? !!f[k] : true);
  return [
    { label: "Effective", value: on("effective") ? ag.effectiveDate : "" },
    { label: "Start", value: on("start") ? ag.startDate : "" },
    { label: "End", value: on("end") ? ag.endDate : "" },
  ].filter((d) => (d.value || "").trim());
}

// The document heading — the agreement type. Many types already contain the document word
// (e.g. "Service Agreement", "Change Order", "NDA"), so we only append "AGREEMENT" when it
// doesn't, to avoid printing "… AGREEMENT AGREEMENT".
export function agreementHeading(ag: ApiAgreement): string {
  const t = (ag.agreementType || "").trim();
  if (!t) return "AGREEMENT";
  return /agreement|contract|order|amendment|modification|addendum|nda|mou|loi|understanding|intent|waiver|release|memorandum|warranty|lease/i.test(t)
    ? t.toUpperCase() : `${t.toUpperCase()} AGREEMENT`;
}

// CR-P-45 — "Upload existing file" general agreements: a generated, centered info cover page,
// then the uploaded document merged in after it (PDF pages copied; images placed on their own
// page). The title + all input info sit centered on the first page.
function addImagePage(doc: PDFDocument, img: PDFImage) {
  const p = doc.addPage([PAGE_W, PAGE_H]);
  p.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: GREEN });
  const scale = Math.min((PAGE_W - M * 2) / img.width, (PAGE_H - M * 2 - 20) / img.height, 1);
  const w = img.width * scale, h = img.height * scale;
  p.drawImage(img, { x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, width: w, height: h });
}

async function drawUploadedCover(doc: PDFDocument, ag: ApiAgreement, font: PDFFont, bold: PDFFont) {
  const p = doc.addPage([PAGE_W, PAGE_H]);
  p.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: GREEN });
  const gtLogo = await embedImage(doc, "/gt-usa-logo-new.png");
  if (gtLogo) drawFitted(p, gtLogo, M, PAGE_H - 62, 150, 40);
  if (ag.letterhead === "jv") {
    const jvLogo = await embedImage(doc, jvLetterheadLogo(ag));
    if (jvLogo) { const s = Math.min(150 / jvLogo.width, 40 / jvLogo.height, 1); drawFitted(p, jvLogo, PAGE_W - M - jvLogo.width * s, PAGE_H - 62, 150, 40); }
    else if (ag.jvPartnerName) {
      // CR-P (39) — the JV partner's name, never the counterparty's logo.
      const n = ag.jvPartnerName.slice(0, 26);
      p.drawText(n, { x: PAGE_W - M - bold.widthOfTextAtSize(n, 12), y: PAGE_H - 40, size: 12, font: bold, color: INK });
    }
  }
  let y = PAGE_H - 170;
  const center = (text: string, f: PDFFont, size: number, color = INK, gapAfter = size * 0.6) => {
    for (const line of wrap(f, text, size, PAGE_W - M * 2)) {
      if (!line) { y -= size * 0.7; continue; }
      const w = f.widthOfTextAtSize(line, size);
      p.drawText(line, { x: (PAGE_W - w) / 2, y, size, font: f, color });
      y -= size + 4;
    }
    y -= gapAfter;
  };
  center(agreementHeading(ag), bold, 20, GREEN, 6);
  if (ag.agreementNo) center(`Agreement No: ${ag.agreementNo}`, font, 9.5, MUTED, 10);  // CR-P (23)
  // CR-P (25) — same running order as the built document: type, title, description, projects.
  if (ag.title) center(ag.title, bold, 13, INK, 6);
  if (ag.description) center(ag.description, font, 9.5, INK, 14);
  const projects = (ag.linkedProjects || []).filter((p) => (p?.name || "").trim());
  if (projects.length) {
    center(projects.length === 1 ? "Project" : "Projects", bold, 9, MUTED, 4);
    for (const p of projects) center(`${p.name}${p.location ? `, ${p.location}` : ""}`, font, 9.5, INK, 0);
    y -= 14;
  }
  const p1 = ag.partySnapshot?.party1, p2 = ag.partySnapshot?.party2;
  center("This agreement is made between", font, 9, MUTED, 8);
  if (p1?.name) center(p1.name, bold, 12, INK, 2);
  for (const l of [p1?.address, p1?.email, p1?.phone].filter(Boolean) as string[]) center(l, font, 9, MUTED, 0);
  y -= 10;
  center("and", font, 9, MUTED, 8);
  if (p2?.name) center(p2.name, bold, 12, INK, 2);
  for (const l of [p2?.contactName ? `Attn: ${p2.contactName}` : "", p2?.address, p2?.email, p2?.phone].filter(Boolean) as string[]) center(l, font, 9, MUTED, 0);
  y -= 16;
  // CR-P (21) — only the ticked dates, same rule as the built document.
  const dates = shownDates(ag).map((d) => `${d.label}: ${d.value}`).join("      ");
  if (dates) center(dates, font, 9, MUTED, 12);
  // The description is already printed under the title above (CR-P (25)), so it is not repeated
  // here. Project info lines are dropped when the projects block above covered them (CR-P (27)).
  for (const cl of ag.partySnapshot?.contextLines || []) {
    if (!cl.label && !cl.value) continue;
    if (projects.length && cl.label === "Project") continue;
    center(`${cl.label}${cl.label && cl.value ? ": " : ""}${cl.value}`, font, 9, INK, 0);
  }
  y -= 18;
  center("The full agreement document follows.", font, 8.5, MUTED, 0);
}

export async function buildUploadedAgreementPdf(ag: ApiAgreement, bytes: Uint8Array, name: string): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  await drawUploadedCover(doc, ag, font, bold);
  const lower = (name || "").toLowerCase();
  try {
    if (lower.endsWith(".pdf")) {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await doc.copyPages(src, src.getPageIndices());
      pages.forEach((pg) => doc.addPage(pg));
    } else if (/\.png$/.test(lower)) {
      addImagePage(doc, await doc.embedPng(bytes));
    } else if (/\.jpe?g$/.test(lower)) {
      addImagePage(doc, await doc.embedJpg(bytes));
    } else {
      const p = doc.addPage([PAGE_W, PAGE_H]);
      p.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: GREEN });
      p.drawText("Uploaded document", { x: M, y: PAGE_H - 110, size: 13, font: bold, color: INK });
      p.drawText(name || "attachment", { x: M, y: PAGE_H - 132, size: 11, font, color: MUTED });
      p.drawText("This file type cannot be shown inline — download the original from the agreement.", { x: M, y: PAGE_H - 152, size: 9, font, color: MUTED });
    }
  } catch { /* keep the cover page even if the uploaded file can't be parsed */ }
  const out = await doc.save();
  return new Blob([out], { type: "application/pdf" });
}

export async function buildAgreementPdf(ag: ApiAgreement): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const isDraft = ag.status === "Draft";
  const cur = new Cursor(doc, (p) => {
    p.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: GREEN });
    if (isDraft) {
      // Draft watermark — light diagonal text so working copies are never mistaken for issued ones.
      p.drawText("DRAFT", { x: PAGE_W / 2 - 130, y: PAGE_H / 2 - 90, size: 90, font: bold, color: rgb(0.93, 0.94, 0.96), rotate: degrees(30) });
    }
  });

  // 1) Header — GreenTech logo (left); on a JV letterhead, the JV/partner logo (right) too.
  const gtLogo = await embedImage(doc, "/gt-usa-logo-new.png");
  if (gtLogo) drawFitted(cur.page, gtLogo, M, cur.y + 8, 150, 40);
  else cur.page.drawText(GREENTECH.name, { x: M, y: cur.y - 10, size: 16, font: bold, color: INK });
  if (ag.letterhead === "jv") {
    const jvLogo = await embedImage(doc, jvLetterheadLogo(ag));
    if (jvLogo) { const s = Math.min(150 / jvLogo.width, 40 / jvLogo.height, 1); drawFitted(cur.page, jvLogo, PAGE_W - M - jvLogo.width * s, cur.y + 8, 150, 40); }
    else if (ag.jvPartnerName) {
      // CR-P (30)/(39) — no logo on the Directory partner, so the letterhead carries the JV
      // partner's own name. Never the counterparty's name or logo: they are different companies.
      const n = ag.jvPartnerName.slice(0, 26);
      cur.page.drawText(n, { x: PAGE_W - M - bold.widthOfTextAtSize(n, 12), y: cur.y - 8, size: 12, font: bold, color: INK });
    }
  }
  cur.gap(50);

  // CR-P (25)/(28) — the document opens with the agreement TYPE, then its TITLE, then the short
  // description, with nothing wedged in between. The reference data (agreement number, dates,
  // status) is stacked right-aligned beside the heading instead of interrupting that run, which
  // is what "remove these lines" between the type and the title meant.
  // CR-P (21) — the effective date is part of that header stack.
  // CR-P (24) — `name` is the FILE name and is printed nowhere, in any context.
  const dates = shownDates(ag);
  const headingY = cur.y;
  cur.text(agreementHeading(ag), bold, 16, GREEN);
  {
    const meta = [
      ...(ag.agreementNo ? [`Agreement No: ${ag.agreementNo}`] : []),
      ...dates.map((d) => `${d.label}: ${d.value}`),
      `Status: ${ag.status}`,
    ];
    let my = headingY + 4;
    for (const line of meta) {
      cur.page.drawText(line, { x: PAGE_W - M - font.widthOfTextAtSize(line, 8.5), y: my, size: 8.5, font, color: MUTED });
      my -= 11;
    }
    // Start the body below whichever ran longer, the heading or the meta stack.
    cur.y = Math.min(cur.y, my + 11 - 4);
  }

  // The title, immediately after the type — this is what the agreement is FOR.
  if (ag.title) { cur.gap(6); cur.para(ag.title, bold, 13, INK); }
  // The short description: plain text, not bold, one or two lines (CR-P (25)/(26)).
  if (ag.description) { cur.gap(4); cur.para(ag.description, font, 9.5, INK); }
  cur.gap(10);

  // CR-P (27) — the projects this agreement covers, name and location, straight from the project
  // record. Optional: an agreement that is not project related simply has no block here.
  const projs = (ag.linkedProjects || []).filter((p) => (p?.name || "").trim());
  if (projs.length) {
    cur.need(24 + projs.length * 13);
    cur.text(projs.length === 1 ? "PROJECT" : "PROJECTS", bold, 8, MUTED);
    for (const p of projs) cur.para(`${p.name}${p.location ? `, ${p.location}` : ""}`, font, 9.5, INK);
    cur.gap(10);
  }

  // 2) Parties — two per row. CR-P (19): an agreement can name up to 4 parties (party 1, the
  // counterparty, and up to two more), so they are laid out as a 2-column grid that wraps.
  {
    const colW = (PAGE_W - M * 2 - 24) / 2;
    const drawParty = (x: number, top: number, heading: string, p?: ApiAgreement["partySnapshot"]["party1"]): number => {
      let y = top;
      cur.page.drawText(heading, { x, y, size: 8, font: bold, color: MUTED }); y -= 13;
      const lines = [p?.name, p?.contactName ? `Attn: ${p.contactName}` : "", p?.address, p?.email, p?.phone].filter(Boolean) as string[];
      lines.forEach((l, i) => {
        for (const w of wrap(i === 0 ? bold : font, l, i === 0 ? 10 : 9, colW)) {
          cur.page.drawText(w, { x, y, size: i === 0 ? 10 : 9, font: i === 0 ? bold : font, color: INK }); y -= 12.5;
        }
      });
      return y;
    };
    const parties = [
      ag.partySnapshot?.party1 || ({ name: GREENTECH.name, address: GREENTECH.address, email: GREENTECH.email, phone: GREENTECH.phone } as never),
      ag.partySnapshot?.party2,
      ...(ag.partySnapshot?.extraParties || []).filter((p) => (p?.name || "").trim()),
    ];
    for (let i = 0; i < parties.length; i += 2) {
      // need() can break to a new page, so read the cursor only after it.
      cur.need(90);
      const top = cur.y;
      const eL = drawParty(M, top, `PARTY ${i + 1}`, parties[i]);
      const eR = parties[i + 1] ? drawParty(M + colW + 24, top, `PARTY ${i + 2}`, parties[i + 1]) : top;
      cur.y = Math.min(eL, eR) - 10;
    }
  }

  // 3) Context information block
  // CR-P (27) — agreements saved before the projects block existed still carry their projects as
  // "Project" info lines. Those are dropped here so such an agreement lists its projects once,
  // in the new block above, rather than twice.
  const ctxLines = (ag.partySnapshot?.contextLines || [])
    .filter((l) => l.value)
    .filter((l) => !(projs.length && l.label === "Project"));
  if (ctxLines.length) {
    cur.need(30 + ctxLines.length * 13);
    cur.text(
      ag.ownerContextType === "user" ? "EMPLOYMENT INFORMATION"
      : ag.ownerContextType === "general" ? "AGREEMENT INFORMATION"
      : "PROJECT INFORMATION",
      bold, 8, MUTED);
    for (const l of ctxLines) cur.para(`${l.label}: ${l.value}`, font, 9, INK);
    cur.gap(8);
  }

  // 4–8) Sections
  // CR-B-04 — order: fixed sections, then the user's custom sections, then the NDA LAST
  // (right before the signatures). The NDA is intentionally excluded from this first list.
  const sections: Array<[string, string]> = [
    ["Scope / Description", ag.sections?.scope || ""],
    ["Terms & Conditions", ag.sections?.terms || ""],
    ["Payment Conditions", ag.sections?.paymentConditions || ""],
    ["Delivery Conditions", ag.sections?.deliveryConditions || ""],
  ];
  let idx = 0;
  const renderSection = async (heading: string, body: string) => {
    if (!body.trim()) return;
    idx++;
    cur.need(40);
    cur.gap(6);
    cur.text(`${idx}. ${heading}`, bold, 11, INK);
    cur.gap(2);
    // Bodies may be rich-text HTML (tables/pictures) or plain text; renderHtml handles both.
    if (/<[a-z][\s\S]*>/i.test(body)) await renderHtml(cur, doc, body, font, bold);
    else cur.para(body, font, 9, INK);
  };
  for (const [heading, body] of sections) await renderSection(heading, body);

  // Custom named sections added by the user (title + rich-text body) — before the NDA.
  for (const s of ag.extraSections || []) {
    if ((s as { hidden?: boolean }).hidden) continue; // CR-B-17 — hidden sections aren't printed
    if (!s.title && !s.body?.trim()) continue;
    await renderSection(s.title || "Section", s.body || "");
    // CR-P (42) — "after this section I'm gonna upload this and then the next page I'm gonna
    // continue this agreement". Files marked to print here are stapled in straight away, then the
    // body resumes on a fresh page so the running order stays section, its files, next section.
    const inline = (s.attachments || []).filter((a) => a.print !== false && a.placement !== "end");
    for (const a of inline) await stapleAttachment(doc, a, s.title || "Attachment", font, bold);
    if (inline.length) cur.addPage();
  }

  // CR-P (45) — the NDA and the standard terms are not body sections any more: both are attached
  // at the very end, after the signatures (see below). The body only says they form part of it.
  const ndaOn = !!ag.sections?.ndaEnabled && (ag.sections?.ndaMode === "file" ? !!ag.sections?.ndaFile?.url : !!(ag.sections?.ndaText || "").trim());
  const termsOn = !!ag.sections?.stdTermsEnabled && (ag.sections?.stdTermsMode === "file" ? !!ag.sections?.stdTermsFile?.url : !!(ag.sections?.stdTermsText || "").trim());
  if (ndaOn || termsOn) {
    const what = [ndaOn ? "the Non-Disclosure Agreement" : "", termsOn ? "the Standard Terms & Conditions" : ""].filter(Boolean).join(" and ");
    cur.gap(8);
    cur.para(`Attached after the signatures, and forming part of this agreement: ${what}.`, font, 9, INK);
  }

  // 9) Signature blocks — CR-P (46): ONE PER PARTY, up to four, two to a row.
  // CR-P (47): a party with no signature on file still gets a full block with a ruled line, so the
  // document can be printed, signed by hand and scanned back. Contact details come from the party
  // snapshot, i.e. from the Directory record the party was picked from.
  {
    const colW = (PAGE_W - M * 2 - 24) / 2;
    const recipient = ag.signatures?.recipient;
    const blocks: Array<{ party?: { name?: string; contactName?: string; address?: string; email?: string; phone?: string }; sig: { signerName?: string; signerTitle?: string; signatureUrl?: string; stampUrl?: string; signedAt?: string } }> = [
      { party: ag.partySnapshot?.party1, sig: ag.signatures?.company || {} },
      {
        party: ag.partySnapshot?.party2,
        sig: {
          signerName: recipient?.signerName, signatureUrl: recipient?.signatureUrl,
          stampUrl: recipient?.stampUrl, signedAt: recipient?.signedAt,
        },
      },
      ...(ag.partySnapshot?.extraParties || [])
        .filter((p) => (p?.name || "").trim())
        .map((p, i) => ({ party: p, sig: (ag.signatures?.extra || [])[i] || {} })),
    ];

    const drawSig = async (
      x: number,
      topY: number,
      party: { name?: string; contactName?: string; address?: string; email?: string; phone?: string } | undefined,
      s: { signerName?: string; signerTitle?: string; signatureUrl?: string; stampUrl?: string; signedAt?: string },
    ) => {
      let y = topY;
      const heading = `For ${party?.name || "Party"}`;
      for (const line of wrap(bold, heading, 8, colW - 4)) { cur.page.drawText(line, { x, y, size: 8, font: bold, color: MUTED }); y -= 10; }
      y -= 4;
      const sigTop = y;
      const sig = await embedImage(doc, s.signatureUrl);
      if (sig) { drawFitted(cur.page, sig, x, y, colW - 70, 38); y -= 42; }
      else { cur.page.drawLine({ start: { x, y: y - 28 }, end: { x: x + colW - 70, y: y - 28 }, thickness: 1, color: INK }); y -= 38; }
      const stamp = await embedImage(doc, s.stampUrl);
      if (stamp) drawFitted(cur.page, stamp, x + colW - 60, sigTop + 4, 54, 54);
      // The signer, falling back to the party's contact person so the line is never blank.
      cur.page.drawText((s.signerName || party?.contactName || "—").slice(0, 40), { x, y, size: 10, font: bold, color: INK }); y -= 12;
      if (s.signerTitle) { cur.page.drawText(s.signerTitle.slice(0, 50), { x, y, size: 8, font, color: MUTED }); y -= 11; }
      // CR-P (46) — name, company, ADDRESS, email and phone, all from the party's Directory record.
      // The address wraps to the column rather than being cut off.
      for (const line of wrap(font, party?.address || "", 8, colW - 4)) {
        if (!line) continue;
        cur.page.drawText(line, { x, y, size: 8, font, color: MUTED }); y -= 10;
      }
      for (const line of [party?.email, party?.phone].filter(Boolean) as string[]) {
        cur.page.drawText(line.slice(0, 46), { x, y, size: 8, font, color: MUTED }); y -= 10;
      }
      cur.page.drawText(s.signedAt ? `Signed: ${s.signedAt}` : "Date: ____________", { x, y, size: 8, font, color: MUTED }); y -= 11;
      return y;
    };

    for (let i = 0; i < blocks.length; i += 2) {
      cur.gap(18);
      cur.need(175);           // a block must never be split across a page (room for the address too)
      const topY = cur.y;
      const eL = await drawSig(M, topY, blocks[i].party, blocks[i].sig);
      const eR = blocks[i + 1] ? await drawSig(M + colW + 24, topY, blocks[i + 1].party, blocks[i + 1].sig) : topY;
      cur.y = Math.min(eL, eR) - 8;
    }
  }

  // CR-P (42) — attachments held back to the end as appendices. Everything set to "after" was
  // already stapled in directly behind its own section, up in the body above.
  for (const s of ag.extraSections || []) {
    if ((s as { hidden?: boolean }).hidden) continue;
    for (const a of s.attachments || []) {
      if (a.print === false || a.placement !== "end") continue;
      await stapleAttachment(doc, a, s.title || "Appendix", font, bold);
    }
  }

  // CR-P (45) — the NDA and the standard terms & conditions come at the VERY END, after the
  // signatures and after any appendices: "nda and then the terms and conditions just come going at
  // the end". A file picked from Company Documents is stapled in as it is; text written into the
  // agreement gets its own page. (Written-in text used to print as a numbered section BEFORE the
  // signatures.) The cursor's new pages are appended, so they land after anything stapled above.
  const endDocument = async (title: string, mode: string | undefined, file: { name: string; url: string } | null | undefined, text: string | undefined) => {
    if (mode === "file") {
      if (file?.url) await stapleAttachment(doc, { name: file.name, filePath: file.url }, title, font, bold);
      return;
    }
    if (!(text || "").trim()) return;
    cur.addPage();
    cur.text(title, bold, 13, GREEN);
    cur.gap(8);
    if (/<[a-z][\s\S]*>/i.test(text || "")) await renderHtml(cur, doc, text || "", font, bold);
    else cur.para(text || "", font, 9, INK);
  };
  if (ag.sections?.ndaEnabled) await endDocument("Non-Disclosure Agreement", ag.sections.ndaMode, ag.sections.ndaFile, ag.sections.ndaText);
  if (ag.sections?.stdTermsEnabled) await endDocument("Standard Terms & Conditions", ag.sections.stdTermsMode, ag.sections.stdTermsFile, ag.sections.stdTermsText);

  const out = await doc.save();
  return new Blob([out], { type: "application/pdf" });
}
