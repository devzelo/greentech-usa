// CR-P (33) — an agreement's document status follows the work done on it: "as soon as we start
// it, it's already showing in progress", and Complete once every section is complete.
//
// The first version counted the blank defaults as work (the NDA and terms modes are non-empty
// strings), so every agreement, even a brand-new blank one, jumped to In progress the moment it
// was opened, and nothing ever set Complete. Pure functions, so the rule can be checked offline.

type SectionLite = { title: string; body: string; status?: string; hidden?: boolean };
// Optional throughout: older agreements lack some of these (the standard terms came later).
type SectionsLite = {
  scope?: string; terms?: string; paymentConditions?: string; deliveryConditions?: string;
  ndaEnabled?: boolean; ndaMode?: string; ndaText?: string;
  stdTermsEnabled?: boolean; stdTermsMode?: string; stdTermsText?: string;
};
type DraftLite = { docStatus: string; extraSections: SectionLite[]; sections: SectionsLite };

/** Real writing: text, a picture or a table. An empty paragraph left by the editor is not work. */
export function hasWrittenContent(html?: string): boolean {
  if (!html) return false;
  if (/<(img|table)\b/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim().length > 0;
}

/** The sections that count toward the whole document: visible ones with a title or a body. */
export const countedSections = <S extends SectionLite>(secs: S[]): S[] =>
  secs.filter((s) => !s.hidden && (s.title.trim() || s.body.trim()));
/** Counted sections not yet marked Complete. */
export const unfinishedSections = <S extends SectionLite>(secs: S[]): S[] =>
  countedSections(secs).filter((s) => (s.status || "") !== "Complete");

/** Has anyone actually written anything, in any section the document prints? */
export function workStarted(d: DraftLite): boolean {
  const s = d.sections;
  return d.extraSections.some((x) => !x.hidden && hasWrittenContent(x.body))
    || [s.scope, s.terms, s.paymentConditions, s.deliveryConditions].some(hasWrittenContent)
    || (s.ndaEnabled && s.ndaMode === "text" && hasWrittenContent(s.ndaText))
    || (s.stdTermsEnabled && s.stdTermsMode === "text" && hasWrittenContent(s.stdTermsText));
}

/** Every counted section is Complete (and there is at least one). */
export const allSectionsComplete = (d: DraftLite): boolean =>
  countedSections(d.extraSections).length > 0 && unfinishedSections(d.extraSections).length === 0;

// Statuses the automatic Complete may replace. A "Complete" or "Completed and signed" chosen by
// hand is never touched, and the status never moves backwards.
const BEFORE_COMPLETE = ["", "NotStarted", "Draft", "InProgress", "InReview"];

/**
 * The status the document should show now. `sectionsJustCompleted` is true at the moment the
 * sections become all complete, and when an agreement is opened. Complete is applied only then,
 * so a different status chosen by hand afterwards is respected.
 */
export function autoDocStatus(d: DraftLite, sectionsJustCompleted: boolean): string {
  const cur = d.docStatus || "";
  if (sectionsJustCompleted && allSectionsComplete(d) && BEFORE_COMPLETE.includes(cur)) return "Complete";
  if ((cur === "" || cur === "NotStarted") && workStarted(d)) return "InProgress";
  return cur;
}
