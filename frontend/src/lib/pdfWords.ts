// CR-P (85) - pull the words out of a PDF so two proposal revisions can be compared.
// pdf.js is large, so it is loaded only the first time someone opens a comparison.
// (Reading PDFs. The pdf-lib drawing helpers live in pdfText.ts.)

import type { PDFDocumentProxy } from "pdfjs-dist";

export interface PdfWord { text: string; page: number }

type PdfJs = typeof import("pdfjs-dist");
let pdfjsReady: Promise<PdfJs> | null = null;
function loadPdfjs(): Promise<PdfJs> {
  if (!pdfjsReady) {
    pdfjsReady = Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")])
      .then(([lib, worker]) => { lib.GlobalWorkerOptions.workerSrc = worker.default; return lib; })
      .catch((err) => { pdfjsReady = null; throw err; });
  }
  return pdfjsReady;
}

// The slice of a pdf.js text item this needs.
interface TextRun { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }

/** Every word in the PDF, in reading order, tagged with its page. Empty for a scanned document. */
export async function extractPdfWords(url: string): Promise<PdfWord[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the file (${res.status}).`);
  const data = new Uint8Array(await res.arrayBuffer());
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    return await readWords(doc);
  } finally {
    void doc.destroy();
  }
}

/** The words of an already-open pdf.js document. Separate so it can be tested outside a browser. */
export async function readWords(doc: PDFDocumentProxy): Promise<PdfWord[]> {
  const words: PdfWord[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Text arrives in runs that can split a word ("Propo" + "sal"). Runs on the same line with
    // no visible gap between them are glued together; anything else is a word break.
    let text = "";
    let prev: TextRun | null = null;
    for (const raw of content.items) {
      if (!("str" in raw)) continue;
      const run = raw as TextRun;
      if (prev) {
        const sameLine = Math.abs(run.transform[5] - prev.transform[5]) < 2;
        const gap = run.transform[4] - (prev.transform[4] + prev.width);
        const size = run.height || Math.abs(run.transform[3]) || 10;
        if (!sameLine || prev.hasEOL || gap > size * 0.2) text += " ";
      }
      text += run.str;
      prev = run;
    }
    for (const w of text.split(/\s+/)) if (w) words.push({ text: w, page: p });
    page.cleanup();
  }
  return words;
}
