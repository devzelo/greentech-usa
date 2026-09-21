import { PDFDocument } from "pdf-lib";
import { attachmentUrl, type ApiSubmittal, type ApiSubmittalRevision, type ApiSubmittalAttachment } from "./api";
import { BOTTOM, C, WIDE_LANDSCAPE, marginFor, brandPage, dividerPage, flowText, imagePage, kpiCard, loadBrand, sectionHeading, stampPageNumbers, titleBlock, type Flow } from "./pdfBrand";

// Submittal packages are assembled in this conventional order.
const COMPONENT_ORDER = ["cover", "spec", "catalog", "drawing", "photo", "other"];
const COMPONENT_LABEL: Record<string, string> = {
  cover: "Cover Page", spec: "Specification", catalog: "Catalog / Data Sheet", drawing: "Drawings", photo: "Site Photos", other: "Other",
};
const DISPO_LABEL: Record<string, string> = {
  Pending: "Pending", Approved: "Approved", ApprovedAsNoted: "Approved as Noted", ReviseResubmit: "Revise & Resubmit", Rejected: "Rejected", Superseded: "Superseded",
};

function sortByComponent(atts: ApiSubmittalAttachment[]): ApiSubmittalAttachment[] {
  return [...atts].sort((a, b) => COMPONENT_ORDER.indexOf(a.component) - COMPONENT_ORDER.indexOf(b.component));
}

/**
 * Build ONE combined PDF for a submittal revision, 11" x 17" landscape (client request): a branded
 * title page, then each uploaded component behind its own branded divider (PDFs page-by-page,
 * pictures as full pages), with continuous page numbers. `pageNumbers: false` when the caller
 * merges it into a larger file and numbers that. Returns the blob + files that couldn't be embedded.
 */
export async function buildSubmittalPackage(sub: ApiSubmittal, rev: ApiSubmittalRevision, opts: { pageNumbers?: boolean } = {}): Promise<{ blob: Blob; skipped: string[] }> {
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const skipped: string[] = [];
  // CR 246 - 18" x 24" landscape, narrow margins.
  const size = WIDE_LANDSCAPE, X = marginFor(size), W = size.w - X * 2;
  const name = sub.title || sub.productName || "Submittal";
  const decision = DISPO_LABEL[rev.disposition] || rev.disposition || "";
  const note = [`Submittal: ${name}`, `Rev ${rev.revisionNo}`].join("  ·  ");
  const newPage = (): Flow => brandPage(doc, b, size, note);

  // ── Title page ──
  let f = newPage();
  f.y = titleBlock(f.page, b, { x: X, y: f.y, w: W, eyebrow: "Submittal package", title: name, meta: [["Revision", `Rev ${rev.revisionNo}`], ["Client decision", decision]] });
  const facts = ([
    ["Product", sub.productName], ["Brand / option submitted", rev.optionLabel || sub.manufacturer], ["Model / part no.", sub.modelNo],
    ["Spec section", sub.specSection], ["Revision", `Rev ${rev.revisionNo}`], ["Client decision", decision],
    ["Date submitted", rev.sentToClientAt], ["Date returned", rev.respondedAt],
  ] as Array<[string, string | undefined]>).filter(([, v]) => v && String(v).trim()) as Array<[string, string]>;
  const per = 4, gap = 12, cw = (W - gap * (per - 1)) / per, ch = 46;
  facts.forEach(([k, v], i) => kpiCard(f.page, b, X + (i % per) * (cw + gap), f.y - Math.floor(i / per) * (ch + gap), cw, ch, k, String(v)));
  f.y -= Math.ceil(facts.length / per) * (ch + gap) + 10;
  if (rev.notes && rev.notes.trim()) {
    f.y = sectionHeading(f.page, b, "Client comments", X, f.y, W);
    f = flowText(f, rev.notes.slice(0, 3000), { x: X, w: W, font: b.regular, size: 9.5, lineHeight: 13.5, color: C.s700, newPage });
    f.y -= 12;
  }
  // Contents — the client-response letter is NOT part of the package we send the client (it's
  // their reply to it), so it never appears in the combined PDF.
  f.y = sectionHeading(f.page, b, "Contents", X, f.y, W);
  const present = sortByComponent(rev.attachments.filter((a) => a.component !== "clientLetter"));
  const components = [...new Set(present.map((a) => a.component))];
  if (!components.length) f.page.drawText("No components uploaded yet.", { x: X, y: f.y, size: 10, font: b.regular, color: C.s500 });
  components.forEach((c, i) => {
    if (f.y < BOTTOM + 6) f = newPage();
    f.page.drawText(`${i + 1}.`, { x: X, y: f.y, size: 10, font: b.bold, color: C.emerald });
    f.page.drawText(COMPONENT_LABEL[c] || c, { x: X + 22, y: f.y, size: 10, font: b.regular, color: C.slate });
    f.y -= 17;
  });

  // ── Components ── Every uploaded file gets its own labelled divider page, so the reader always
  // knows what the following pages are (Cover Page / Drawings / …) and which file they came from.
  for (const a of present) {
    const ext = (a.fileType || a.name.split(".").pop() || "").toLowerCase();
    dividerPage(doc, b, size, COMPONENT_LABEL[a.component] || a.component, a.name, "Submittal component");
    try {
      const res = await fetch(attachmentUrl(a.filePath));
      if (!res.ok) { skipped.push(a.name); continue; }
      const bytes = await res.arrayBuffer();
      if (ext === "pdf") {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copied = await doc.copyPages(src, src.getPageIndices());
        copied.forEach((p) => doc.addPage(p));
      } else if (["png", "jpg", "jpeg"].includes(ext)) {
        imagePage(doc, ext === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes), size);
      } else {
        skipped.push(a.name);
      }
    } catch { skipped.push(a.name); }
  }

  if (opts.pageNumbers !== false) stampPageNumbers(doc, b);   // continuous across the whole package
  const out = await doc.save();
  return { blob: new Blob([out], { type: "application/pdf" }), skipped };
}
