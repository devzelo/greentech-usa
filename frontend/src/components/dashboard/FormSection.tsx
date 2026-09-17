import type { ReactNode } from "react";

/**
 * CR 217: "section backgrounds are too light and everything looks like one section". One section
 * shell for long forms: a tinted ground, a real border, a coloured spine down the left and a
 * heading in that colour, so each part of a form reads as its own thing. Tones alternate down a
 * form; `toneFor(i)` walks the list so a form only has to count its sections.
 */

export type SectionTone = "slate" | "blue" | "emerald" | "amber" | "violet" | "rose";

const TONE: Record<SectionTone, { bg: string; border: string; spine: string; head: string; icon: string }> = {
  slate:   { bg: "bg-slate-100/70",   border: "border-slate-200",   spine: "bg-slate-400",   head: "text-slate-700",   icon: "text-slate-500" },
  blue:    { bg: "bg-blue-50/80",     border: "border-blue-200",    spine: "bg-blue-400",    head: "text-blue-800",    icon: "text-blue-500" },
  emerald: { bg: "bg-emerald-50/80",  border: "border-emerald-200", spine: "bg-emerald-400", head: "text-emerald-800", icon: "text-emerald-600" },
  amber:   { bg: "bg-amber-50/80",    border: "border-amber-200",   spine: "bg-amber-400",   head: "text-amber-800",   icon: "text-amber-600" },
  violet:  { bg: "bg-violet-50/80",   border: "border-violet-200",  spine: "bg-violet-400",  head: "text-violet-800",  icon: "text-violet-500" },
  rose:    { bg: "bg-rose-50/80",     border: "border-rose-200",    spine: "bg-rose-400",    head: "text-rose-800",    icon: "text-rose-500" },
};

/** The order sections cycle through when a form just wants "the next colour". */
export const SECTION_TONES: SectionTone[] = ["blue", "emerald", "amber", "violet", "slate", "rose"];
export const toneFor = (i: number): SectionTone => SECTION_TONES[i % SECTION_TONES.length];

export default function FormSection({ title, icon, tone = "slate", right, hint, children, className = "" }: {
  title: ReactNode;
  icon?: ReactNode;
  tone?: SectionTone;
  /** Buttons or a total on the right of the heading. */
  right?: ReactNode;
  /** One line under the heading, for what the section is for. */
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <section className={`relative overflow-hidden rounded-2xl border ${t.border} ${t.bg} p-3 pl-4 space-y-2 ${className}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${t.spine}`} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${t.head}`}>
          {icon && <span className={t.icon}>{icon}</span>}
          {title}
        </p>
        {right}
      </div>
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
      {children}
    </section>
  );
}
