import { useEffect, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import { Check, AlertTriangle, Loader2 } from "lucide-react";
import type { ApiResume } from "../../lib/api";
import ResumePDF, { type ResumePerson } from "./ResumePDF";

/** Item 98 / spec 9: every resume fits on two pages at most. */
export const RESUME_PAGE_LIMIT = 2;

// Rendering a resume takes a moment, so counts are kept per exact content.
const cache = new Map<string, number>();
const keyOf = (resume: ApiResume, person: ResumePerson) => JSON.stringify([resume, person.name]);

/** Pages the resume takes in the GT format (the same layout it has inside a proposal). */
export async function countResumePages(resume: ApiResume, person: ResumePerson): Promise<number> {
  const key = keyOf(resume, person);
  const hit = cache.get(key);
  if (hit) return hit;
  const blob = await pdf(<ResumePDF resume={resume} person={person} />).toBlob();
  const n = (await PDFDocument.load(await blob.arrayBuffer())).getPageCount();
  cache.set(key, n);
  return n;
}

/** Page count, recomputed a moment after the resume stops changing. */
export function useResumePages(resume: ApiResume | null | undefined, person: ResumePerson, delay = 1200) {
  const [pages, setPages] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const key = resume ? keyOf(resume, person) : "";
  useEffect(() => {
    if (!resume) { setPages(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      setBusy(true);
      countResumePages(resume, person)
        .then((n) => { if (!cancelled) setPages(n); })
        .catch(() => { /* leave the last count */ })
        .finally(() => { if (!cancelled) setBusy(false); });
    }, cache.has(key) ? 0 : delay);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { pages, busy };
}

/** "2 pages" in green, or an amber warning when the resume runs past the limit. */
export default function ResumePageBadge({ resume, person, compact = false }: { resume: ApiResume | null | undefined; person: ResumePerson; compact?: boolean }) {
  const { pages, busy } = useResumePages(resume, person);
  if (pages === null) return busy ? <span className="text-[11px] text-slate-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Counting pages</span> : null;
  const over = pages > RESUME_PAGE_LIMIT;
  const label = `${pages} page${pages === 1 ? "" : "s"}`;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${over ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
      title={over
        ? `Proposal resumes should fit on ${RESUME_PAGE_LIMIT} pages. Shorten the summary or the project scopes, or leave out older projects.`
        : `Within the ${RESUME_PAGE_LIMIT}-page limit for proposal resumes.`}
    >
      {over ? <AlertTriangle size={11} /> : <Check size={11} />}
      {over ? (compact ? `${label}, over ${RESUME_PAGE_LIMIT}` : `${label}, over the ${RESUME_PAGE_LIMIT}-page limit`) : label}
      {busy && <Loader2 size={10} className="animate-spin" />}
    </span>
  );
}
