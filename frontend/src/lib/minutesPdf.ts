import { PDFDocument } from "pdf-lib";
import type { ApiMinute } from "./api";
import { C, GUTTER, LETTER, brandPage, drawTable, flowText, loadBrand, sectionHeading, stampPageNumbers, titleBlock, type Flow, type TableRow } from "./pdfBrand";

/**
 * CR 208 / 209: minutes and progress reports written in the platform, as a document on the
 * letterhead: who was there, what was discussed item by item, and the actions that came out of it.
 */

export interface MinutesPdfInput {
  minute: ApiMinute;
  projectName: string;
  projectNo?: string;
  clientName?: string;
}

/** Rich text to plain lines: bullets keep their marker, everything else is one line per block. */
const htmlToLines = (html: string): string[] => (html || "")
  .replace(/<li[^>]*>/gi, "\n• ")
  .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<[^>]*>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .split(/\n+/)
  .map((l) => l.replace(/\s+/g, " ").trim())
  .filter(Boolean);

const dayLabel = (s?: string) => {
  if (!s) return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

export async function buildMinutesPdf(o: MinutesPdfInput): Promise<Blob> {
  const m = o.minute;
  const isProgress = m.kind === "progress";
  const doc = await PDFDocument.create();
  const b = await loadBrand(doc);
  const X = GUTTER, W = LETTER.w - GUTTER * 2;
  const note = [isProgress ? "Progress report" : "Meeting minutes", o.projectName, m.date].filter(Boolean).join("  ·  ");
  const newPage = (): Flow => brandPage(doc, b, LETTER, note);

  let f = newPage();
  f.y = titleBlock(f.page, b, {
    x: X, y: f.y, w: W,
    eyebrow: isProgress ? "Progress report" : "Meeting minutes",
    title: m.title || (isProgress ? "Progress report" : "Meeting minutes"),
    meta: [
      ["Project", o.projectName],
      ["Project no.", o.projectNo || ""],
      [isProgress ? "Period" : "Date", isProgress ? (m.period || dayLabel(m.date)) : dayLabel(m.date)],
      ...(isProgress ? [] : [["Time", m.time || ""] as [string, string], ["Location", m.location || ""] as [string, string]]),
      ["Prepared by", m.createdByName || ""],
      ["Status", m.status === "final" ? "Final" : "Draft"],
    ].filter(([, v]) => !!v) as Array<[string, string]>,
  });

  // Who was there (a progress report calls them the people it concerns).
  if (m.attendees.length) {
    f.y = sectionHeading(f.page, b, isProgress ? "People" : "Attendees", X, f.y - 6, W);
    f = drawTable(b, f, X,
      [{ label: "Name", w: W * 0.34 }, { label: "Role", w: W * 0.28 }, { label: "Company", w: W * 0.24 }, { label: isProgress ? "Informed" : "Present", w: W * 0.14 }],
      m.attendees.map<TableRow>((a) => ({ cells: [a.name || "-", a.role || "-", a.company || "-", a.present === false ? "No" : "Yes"] })),
      { newPage },
    );
    f.y -= 10;
  }

  if (m.summary && htmlToLines(m.summary).length) {
    f.y = sectionHeading(f.page, b, isProgress ? "Summary" : "Purpose", X, f.y - 4, W);
    for (const line of htmlToLines(m.summary)) {
      f = flowText(f, line, { x: X, w: W, font: b.regular, size: 9, lineHeight: 12.5, color: C.s700, newPage });
    }
    f.y -= 8;
  }

  // The items, numbered, each with its own actions.
  m.items.forEach((it, i) => {
    f.y = sectionHeading(f.page, b, `${i + 1}. ${it.title || (isProgress ? "Item" : "Agenda item")}`, X, f.y - 4, W);
    for (const line of htmlToLines(it.notes || "")) {
      f = flowText(f, line, { x: X, w: W, font: b.regular, size: 9, lineHeight: 12.5, color: C.s700, newPage });
    }
    if (it.actions.length) {
      f.y -= 6;
      f = drawTable(b, f, X,
        [{ label: "Action", w: W * 0.54, wrap: true }, { label: "Owner", w: W * 0.26 }, { label: "Due", w: W * 0.2 }],
        it.actions.map<TableRow>((a) => ({ cells: [a.text || "-", a.ownerName || "-", a.due ? dayLabel(a.due) : "-"] })),
        { newPage },
      );
    }
    f.y -= 10;
  });

  stampPageNumbers(doc, b);
  return new Blob([new Uint8Array(await doc.save())], { type: "application/pdf" });
}
