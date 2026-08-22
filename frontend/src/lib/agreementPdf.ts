import { PDFDocument, PDFFont, PDFImage, StandardFonts, degrees, rgb, type PDFPage } from "pdf-lib";
import type { ApiAgreement } from "./api";
import { GREENTECH, embedImage, drawFitted } from "./poPdf";

// The shared agreement document — one formal layout for every context (employee, partner,
// subcontractor, vendor). Multi-page: a paginated cursor wraps long section text onto new
// pages automatically. Same visual language as the PO document.
const PAGE_W = 595.28, PAGE_H = 841.89, M = 52;
const GREEN = rgb(0.06, 0.72, 0.51), INK = rgb(0.06, 0.09, 0.16), MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.8, 0.83, 0.87), HEADBG = rgb(0.95, 0.96, 0.97);

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
      if (isHead) this.page.drawRectangle({ x: M, y: yTop - rowH, width: contentW, height: rowH, color: HEADBG });
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
// headings, lists, images and tables. Inline bold/italic is flattened to plain text (agreements
// were plain text before this, so only the block structure + media matter). Falls back cleanly:
// plain-text bodies with no tags render as ordinary paragraphs.
async function renderHtml(cur: Cursor, doc: PDFDocument, html: string, font: PDFFont, bold: PDFFont) {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");

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
    if (rows.length) cur.table(rows, heads, font, bold);
  };
  const drawList = (el: HTMLElement, ordered: boolean) => {
    Array.from(el.children).forEach((li, i) => {
      const t = (li.textContent || "").trim(); if (!t) return;
      cur.para(`${ordered ? `${i + 1}.` : "•"}  ${t}`, font, 9, INK);
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
      if (/^H[1-6]$/.test(tag)) { const t = (el.textContent || "").trim(); if (t) { cur.gap(4); cur.text(t.slice(0, 120), bold, 10, INK); cur.gap(2); } continue; }
      // A container that wraps media/lists: recurse so nested images/tables are drawn in order.
      if (el.querySelector && el.querySelector("img, table, ul, ol")) { await walk(Array.from(el.childNodes)); continue; }
      const t = el.textContent || "";
      if (t.trim()) cur.para(t, font, 9, INK);
    }
  };
  await walk(Array.from(parsed.body.childNodes));
}

const fmt = (d?: string) => (d ? d : "—");

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
    const jvLogo = await embedImage(doc, ag.jvLogoUrl || ag.partySnapshot?.party2?.logoUrl);
    if (jvLogo) { const s = Math.min(150 / jvLogo.width, 40 / jvLogo.height, 1); drawFitted(cur.page, jvLogo, PAGE_W - M - jvLogo.width * s, cur.y + 8, 150, 40); }
    else if (ag.partySnapshot?.party2?.name) cur.page.drawText(ag.partySnapshot.party2.name.slice(0, 26), { x: PAGE_W - M - bold.widthOfTextAtSize(ag.partySnapshot.party2.name.slice(0, 26), 12), y: cur.y - 8, size: 12, font: bold, color: INK });
  }
  cur.gap(50);

  const t = (ag.agreementType || "").trim();
  // Many types already contain the document word (e.g. "Service Agreement", "Change Order",
  // "NDA") — only append "AGREEMENT" when it doesn't, so we never print "… AGREEMENT AGREEMENT".
  const title = t
    ? (/agreement|contract|order|amendment|modification|addendum|nda|mou|loi|understanding|intent|waiver|release|memorandum|warranty|lease/i.test(t) ? t.toUpperCase() : `${t.toUpperCase()} AGREEMENT`)
    : "AGREEMENT";
  cur.text(title, bold, 16, GREEN);
  // General agreements show only the type as the heading — the GT- code stays an internal
  // reference and is not printed on the document (CR-P-45).
  if (ag.name && ag.ownerContextType !== "general") cur.text(ag.name, bold, 10, INK);
  cur.text(
    [`Effective: ${fmt(ag.effectiveDate)}`, `Start: ${fmt(ag.startDate)}`, `End: ${fmt(ag.endDate)}`, `Status: ${ag.status}`].join("     "),
    font, 8.5, MUTED
  );
  cur.gap(10);

  // 2) Parties — two columns
  {
    const colW = (PAGE_W - M * 2 - 24) / 2;
    const drawParty = (x: number, heading: string, p?: ApiAgreement["partySnapshot"]["party1"]): number => {
      let y = cur.y;
      cur.page.drawText(heading, { x, y, size: 8, font: bold, color: MUTED }); y -= 13;
      const lines = [p?.name, p?.contactName ? `Attn: ${p.contactName}` : "", p?.address, p?.email, p?.phone].filter(Boolean) as string[];
      lines.forEach((l, i) => {
        for (const w of wrap(i === 0 ? bold : font, l, i === 0 ? 10 : 9, colW)) {
          cur.page.drawText(w, { x, y, size: i === 0 ? 10 : 9, font: i === 0 ? bold : font, color: INK }); y -= 12.5;
        }
      });
      return y;
    };
    cur.need(90);
    const e1 = drawParty(M, "PARTY 1", ag.partySnapshot?.party1 || ({ name: GREENTECH.name, address: GREENTECH.address, email: GREENTECH.email, phone: GREENTECH.phone } as never));
    const e2 = drawParty(M + colW + 24, "PARTY 2", ag.partySnapshot?.party2);
    cur.y = Math.min(e1, e2) - 10;
  }

  // 3) Context information block
  const ctxLines = (ag.partySnapshot?.contextLines || []).filter((l) => l.value);
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
  }

  // NDA — always the last numbered section before the signatures.
  if (ag.sections?.ndaEnabled) {
    if (ag.sections?.ndaMode === "file" && ag.sections?.ndaFile?.name) {
      await renderSection("Non-Disclosure (NDA)", `A Non-Disclosure Agreement ("${ag.sections.ndaFile.name}") is attached to and forms part of this agreement.`);
    } else {
      await renderSection("Non-Disclosure (NDA)", ag.sections?.ndaText || "");
    }
  }

  // 9) Signature blocks — signature + stamp kept together with each party's details.
  cur.gap(18);
  cur.need(130);
  {
    const colW = (PAGE_W - M * 2 - 24) / 2;
    const topY = cur.y;
    const drawSig = async (x: number, heading: string, s: { signerName?: string; signerTitle?: string; signatureUrl?: string; stampUrl?: string; signedAt?: string }) => {
      let y = topY;
      cur.page.drawText(heading, { x, y, size: 8, font: bold, color: MUTED }); y -= 14;
      const sigTop = y;
      const sig = await embedImage(doc, s.signatureUrl);
      if (sig) { drawFitted(cur.page, sig, x, y, colW - 70, 38); y -= 42; }
      else { cur.page.drawLine({ start: { x, y: y - 28 }, end: { x: x + colW - 70, y: y - 28 }, thickness: 1, color: INK }); y -= 38; }
      const stamp = await embedImage(doc, s.stampUrl);
      if (stamp) drawFitted(cur.page, stamp, x + colW - 60, sigTop + 4, 54, 54);
      cur.page.drawText(s.signerName || "—", { x, y, size: 10, font: bold, color: INK }); y -= 12;
      if (s.signerTitle) { cur.page.drawText(s.signerTitle.slice(0, 50), { x, y, size: 8, font, color: MUTED }); y -= 11; }
      cur.page.drawText(s.signedAt ? `Signed: ${s.signedAt}` : "Date: ____________", { x, y, size: 8, font, color: MUTED }); y -= 11;
      return y;
    };
    const e1 = await drawSig(M, `For ${ag.partySnapshot?.party1?.name || GREENTECH.name}`, ag.signatures?.company || {});
    const e2 = await drawSig(M + colW + 24, `For ${ag.partySnapshot?.party2?.name || "Party 2"}`, {
      signerName: ag.signatures?.recipient?.signerName,
      signatureUrl: ag.signatures?.recipient?.signatureUrl,
      stampUrl: ag.signatures?.recipient?.stampUrl,
      signedAt: ag.signatures?.recipient?.signedAt,
    });
    cur.y = Math.min(e1, e2) - 8;
  }

  // Staple the attached NDA file after the agreement so it forms part of the document.
  if (ag.sections?.ndaEnabled && ag.sections?.ndaMode === "file" && ag.sections?.ndaFile?.url) {
    try {
      const res = await fetch(ag.sections.ndaFile.url);
      if (res.ok) {
        const bytes = await res.arrayBuffer();
        const ext = (ag.sections.ndaFile.name.split(".").pop() || "").toLowerCase();
        // Divider page, then the NDA itself (PDF pages copied, images fitted to a page).
        const d = doc.addPage([PAGE_W, PAGE_H]);
        d.drawRectangle({ x: 0, y: PAGE_H / 2 - 2, width: PAGE_W, height: 4, color: GREEN });
        d.drawText("NON-DISCLOSURE AGREEMENT", { x: (PAGE_W - bold.widthOfTextAtSize("NON-DISCLOSURE AGREEMENT", 20)) / 2, y: PAGE_H / 2 + 16, size: 20, font: bold, color: INK });
        d.drawText(ag.sections.ndaFile.name, { x: (PAGE_W - font.widthOfTextAtSize(ag.sections.ndaFile.name, 10)) / 2, y: PAGE_H / 2 - 24, size: 10, font, color: MUTED });
        if (ext === "pdf") {
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const pages = await doc.copyPages(src, src.getPageIndices());
          pages.forEach((p) => doc.addPage(p));
        } else if (["png", "jpg", "jpeg"].includes(ext)) {
          const img = ext === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
          const p = doc.addPage([PAGE_W, PAGE_H]);
          const scale = Math.min((PAGE_W - M * 2) / img.width, (PAGE_H - M * 2) / img.height, 1);
          p.drawImage(img, { x: (PAGE_W - img.width * scale) / 2, y: (PAGE_H - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
        }
      }
    } catch { /* best-effort — the reference note in the NDA section still stands */ }
  }

  const out = await doc.save();
  return new Blob([out], { type: "application/pdf" });
}
