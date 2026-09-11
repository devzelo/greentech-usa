import { diffArrays } from "diff";
import type { PdfWord } from "./pdfWords";

// CR-P (85) - "we should be able to see the difference between two revisions."
// Revisions are frozen PDFs (some uploaded, produced outside the platform), so the comparison is
// on their text. It is word by word, not line by line: one added word re-wraps every later line
// of its paragraph, and a line comparison would flag the whole paragraph as changed.

export type SegKind = "same" | "add" | "del";
export interface DiffSeg { kind: SegKind; text: string }
export interface DiffHunk {
  pageFrom: number;   // where the change starts in the "from" revision
  pageTo: number;     // ...and in the "to" revision
  pageFromEnd: number; // where it ends, when nearby changes merged across a page break
  pageToEnd: number;
  cutStart: boolean;  // there is more text before this excerpt
  cutEnd: boolean;    // ...and after it
  segs: DiffSeg[];
}
export interface RevisionDiff { hunks: DiffHunk[]; added: number; removed: number }

const CONTEXT = 12;  // unchanged words shown either side of a change

// Curly and straight quotes, and the dash family, print differently for the same text.
const norm = (w: string) =>
  w.replace(/[‘’‛]/g, "'").replace(/[“”‟]/g, '"').replace(/[‒-―]/g, "-");

interface Op { kind: SegKind; text: string; pageFrom: number; pageTo: number }

/** Returns null when the two texts are too far apart to compare in reasonable time. */
export function diffRevisionWords(from: PdfWord[], to: PdfWord[]): RevisionDiff | null {
  const parts = diffArrays(from.map((w) => norm(w.text)), to.map((w) => norm(w.text)), { timeout: 8000 });
  if (!parts) return null;

  // Flatten into one op per word, remembering which page it sits on in each revision.
  const pageAt = (arr: PdfWord[], k: number) => arr[Math.min(k, arr.length - 1)]?.page ?? 1;
  const ops: Op[] = [];
  let i = 0, j = 0, added = 0, removed = 0;
  for (const part of parts) {
    const n = part.count ?? part.value.length;
    for (let k = 0; k < n; k++) {
      if (part.added) { ops.push({ kind: "add", text: to[j].text, pageFrom: pageAt(from, i), pageTo: to[j].page }); j++; added++; }
      else if (part.removed) { ops.push({ kind: "del", text: from[i].text, pageFrom: from[i].page, pageTo: pageAt(to, j) }); i++; removed++; }
      else { ops.push({ kind: "same", text: to[j].text, pageFrom: from[i].page, pageTo: to[j].page }); i++; j++; }
    }
  }

  // Changes close together share one excerpt; each excerpt carries a little context either side.
  const hunks: DiffHunk[] = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].kind === "same") { k++; continue; }
    let end = k;
    for (let m = k + 1; m < ops.length && m <= end + 2 * CONTEXT; m++) if (ops[m].kind !== "same") end = m;
    const start = Math.max(0, k - CONTEXT);
    const stop = Math.min(ops.length, end + CONTEXT + 1);
    const segs: DiffSeg[] = [];
    for (let m = start; m < stop; m++) {
      const last = segs[segs.length - 1];
      if (last && last.kind === ops[m].kind) last.text += " " + ops[m].text;
      else segs.push({ kind: ops[m].kind, text: ops[m].text });
    }
    hunks.push({
      pageFrom: ops[k].pageFrom, pageTo: ops[k].pageTo,
      pageFromEnd: ops[end].pageFrom, pageToEnd: ops[end].pageTo,
      cutStart: start > 0, cutEnd: stop < ops.length, segs,
    });
    k = end + 1;
  }
  return { hunks, added, removed };
}
