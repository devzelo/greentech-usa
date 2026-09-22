import { Router, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, ShadingType } from "docx";
import Project from "../models/Project";
import Resume from "../models/Resume";
import SubResume from "../models/SubResume";
import User from "../models/User";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";
import { brandedSection } from "../lib/docxBrand";

// The proposal as a Word file, in step with the PDF: the section layout of either volume (numbering,
// lettered appendices, subsections), the key staff table, past performance, the Compliance Matrix and
// the price tables, calculated exactly as the PDF calculates them. Uploaded client forms and
// documents cannot be embedded in Word; each is named where it sits, and printed in the PDF.

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["proposals"]));

const COMPANY_NAME = "GreenTech USA LLC";

// ── Loose types for the Mixed proposalContent ────────────────────────────────
interface Att { name?: string; url?: string }
interface Sub { id?: string; heading?: string; body?: string }
interface PP {
  name?: string; client?: string; value?: string; year?: string; summary?: string; contractNo?: string; start?: string; end?: string;
  status?: string; location?: string; contractType?: string; workType?: string; poc?: string; pocEmail?: string; pocPhone?: string; cpars?: string; showValue?: boolean;
}
interface Sec { id: string; heading?: string; body?: string; attachments?: Att[]; subsections?: Sub[]; projects?: PP[] }
interface SecMeta { id: string; kind: string; refId?: string; title: string; hidden?: boolean; appendix?: boolean; pageType?: string; libraryKey?: string; divider?: boolean }
interface Emp { id?: string; name?: string; role?: string; firm?: string; nationality?: string; years?: string; keyStaff?: boolean; userId?: string; empId?: string; subResumeId?: string }
interface Tech {
  description?: string; employees?: Emp[]; similarProjects?: PP[]; timeline?: Array<{ phase?: string; start?: string; end?: string }>;
  sections?: Sec[]; layout?: SecMeta[]; numbering?: string; appendixNumbering?: string;
}
interface FinCol { id: string; label: string; kind: string }
interface FinRow { id: string; cells: Record<string, string>; type?: string; label?: string }
interface FinAdj { id: string; label: string; mode: string; value: string }
interface FinTable { id: string; title: string; columns: FinCol[]; rows: FinRow[]; adjustments?: FinAdj[]; optionYears?: { count?: number; escalation?: string } }
interface Fin {
  currency?: string; notes?: string; tables?: FinTable[];
  lineItems?: Array<{ itemNo?: string; description?: string; qty?: string; unit?: string; rate?: string; amount?: string }>;
  sections?: Sec[]; layout?: SecMeta[]; numbering?: string; appendixNumbering?: string;
}
interface Req { id: string; label?: string; rfpRef?: string; volume?: string; sectionId?: string; status?: string; done?: boolean }
interface Cover { proposalTitle?: string; projectName?: string; solicitationNo?: string; taskOrderNo?: string; contractNo?: string; clientName?: string; dueDate?: string; submissionDate?: string; submittedTo?: string; attentionTo?: string; submittedBy?: string }
interface CoverLetter { enabled?: boolean; body?: string; signatories?: Array<{ name?: string; title?: string }> }
interface PContent { cover?: Cover; coverFinancial?: Cover; coverLetter?: CoverLetter; coverLetterFinancial?: CoverLetter; technical?: Tech; financial?: Fin; requirements?: Req[] }

const TECH_BUILTINS: Array<[string, string]> = [
  ["description", "Technical Description"], ["personnel", "Key Personnel"],
  ["pastPerformance", "Similar Projects / Past Performance"], ["timeline", "Project Timeline"],
];
const FIN_BUILTINS: Array<[string, string]> = [["pricing", "Price Schedule"]];

/** The section order, as the PDF resolves it (adds missing built-ins, drops orphans). */
function resolveLayout(sections: Sec[], layout: SecMeta[] | undefined, builtins: Array<[string, string]>): SecMeta[] {
  const out: SecMeta[] = [];
  const seenB = new Set<string>(), seenC = new Set<string>();
  for (const m of layout || []) {
    if (m.kind === "custom") {
      if (m.refId && sections.some((s) => s.id === m.refId) && !seenC.has(m.refId)) { seenC.add(m.refId); out.push(m); }
    } else if (m.kind === "blank") { /* blank pages have no place in Word */ }
    else if (builtins.some(([k]) => k === m.kind) && !seenB.has(m.kind)) { seenB.add(m.kind); out.push(m); }
  }
  for (const [kind, title] of builtins) if (!seenB.has(kind)) out.push({ id: `b-${kind}`, kind, title, hidden: false });
  for (const s of sections) if (!seenC.has(s.id)) out.push({ id: `m-${s.id}`, kind: "custom", refId: s.id, title: s.heading || "Section", hidden: false });
  return out;
}

function resolveFinTables(f: Fin): FinTable[] {
  if (f.tables && f.tables.length) return f.tables;
  const cols: FinCol[] = [
    { id: "c-item", label: "Item", kind: "text" }, { id: "c-desc", label: "Description", kind: "text" },
    { id: "c-qty", label: "Qty", kind: "qty" }, { id: "c-unit", label: "Unit", kind: "text" },
    { id: "c-rate", label: "Unit Price", kind: "rate" }, { id: "c-amount", label: "Amount", kind: "amount" },
  ];
  const rows: FinRow[] = (f.lineItems || []).map((it, i) => ({ id: `r-${i}`, cells: { "c-item": it.itemNo || "", "c-desc": it.description || "", "c-qty": it.qty || "", "c-unit": it.unit || "", "c-rate": it.rate || "", "c-amount": it.amount || "" } }));
  return [{ id: "t", title: "Pricing", columns: cols, rows }];
}

const num = (s?: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (n: number, cur: string) => `${n < 0 ? "-" : ""}${cur}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The same arithmetic as the PDF (frontend lib/pricing.ts): quantity × unit price, phases, adjustments, option years. */
function priceCalc(tb: FinTable) {
  const qtyCol = tb.columns.find((c) => c.kind === "qty")?.id;
  const rateCol = tb.columns.find((c) => c.kind === "rate")?.id;
  const amountCols = tb.columns.filter((c) => c.kind === "amount").map((c) => c.id);
  const computed = !!qtyCol && !!rateCol;
  const cell = (r: FinRow, cid?: string) => (cid ? String(r.cells?.[cid] ?? "").trim() : "");
  const isComputed = (r: FinRow) => computed && (!!cell(r, qtyCol) || !!cell(r, rateCol));
  const amountOf = (r: FinRow) => {
    if (r.type === "group") return 0;
    if (isComputed(r)) return (cell(r, qtyCol) ? num(cell(r, qtyCol)) : 1) * num(cell(r, rateCol));
    return amountCols.reduce((s, cid) => s + num(r.cells?.[cid]), 0);
  };
  const groups: Array<{ label: string; rows: FinRow[]; subtotal: number }> = [{ label: "", rows: [], subtotal: 0 }];
  for (const r of tb.rows || []) {
    if (r.type === "group") groups.push({ label: r.label || "", rows: [], subtotal: 0 });
    else { const g = groups[groups.length - 1]; g.rows.push(r); g.subtotal += amountOf(r); }
  }
  const items = groups.reduce((s, g) => s + g.subtotal, 0);
  const adjustments = (tb.adjustments || []).map((a) => ({
    label: a.mode === "percent" ? `${a.label || "Adjustment"} (${num(a.value)}%)` : a.label || "Adjustment",
    amount: a.mode === "percent" ? (items * num(a.value)) / 100 : num(a.value),
  }));
  const total = items + adjustments.reduce((s, a) => s + a.amount, 0);
  const n = Math.max(0, Math.floor(tb.optionYears?.count || 0));
  const esc = num(tb.optionYears?.escalation) / 100;
  const periods = n > 0
    ? [{ label: "Base Year", factor: 1, total }, ...Array.from({ length: n }, (_, k) => ({ label: `Option Year ${k + 1}`, factor: Math.pow(1 + esc, k + 1), total: total * Math.pow(1 + esc, k + 1) }))]
    : [];
  const grand = periods.length ? periods.reduce((s, p) => s + p.total, 0) : total;
  return { amountOf, groups, items, adjustments, total, periods, grand };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtMonth = (v?: string) => { const m = /^(\d{4})-(\d{2})/.exec((v || "").trim()); return m && MONTHS[Number(m[2]) - 1] ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : (v || "").trim(); };
const periodOf = (e: PP) => {
  const a = fmtMonth(e.start), b = fmtMonth(e.end);
  if (a && b) return `${a} – ${b}`;
  if (a) return e.status === "Completed" ? a : `${a} – Present`;
  return b || e.year || "";
};
const letterOf = (n: number) => { let s = ""; for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s; return s; };

// ── Word building blocks ─────────────────────────────────────────────────────
const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
function htmlToParagraphs(html?: string): Paragraph[] {
  if (!html || !html.trim()) return [];
  const text = decode(html.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n").replace(/<\/t[dh]>/gi, "  |  ").replace(/<br\s*\/?>(\n)?/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, ""));
  return text.split("\n").map((l) => l.replace(/(\s*\|\s*)+$/, "").trim()).filter((l) => l !== "").map((l) => new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: l, font: "Calibri", size: 22 })] }));
}
const h = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 100 }, children: [new TextRun({ text, font: "Calibri", bold: true, size: 26, color: "0F172A" })] });
const h3 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 180, after: 60 }, children: [new TextRun({ text, font: "Calibri", bold: true, size: 23, color: "0F172A" })] });
const p = (text: string, o: { bold?: boolean; size?: number; italic?: boolean; color?: string } = {}) =>
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text, font: "Calibri", bold: o.bold, italics: o.italic, size: o.size || 22, color: o.color })] });
const kvLine = (k: string, v?: string) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${k}: `, font: "Calibri", bold: true, size: 21 }), new TextRun({ text: v || "-", font: "Calibri", size: 21 })] });
const tcell = (text: string, o: { bold?: boolean; head?: boolean; right?: boolean; span?: number; fill?: string } = {}) => new TableCell({
  columnSpan: o.span,
  shading: o.head ? { type: ShadingType.CLEAR, color: "auto", fill: "0F172A" } : o.fill ? { type: ShadingType.CLEAR, color: "auto", fill: o.fill } : undefined,
  children: [new Paragraph({ alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text, font: "Calibri", bold: o.bold || o.head, size: o.head ? 17 : 19, color: o.head ? "FFFFFF" : undefined })] })],
});
const headRow = (labels: string[], right: boolean[] = []) => new TableRow({ tableHeader: true, children: labels.map((l, i) => tcell(l, { head: true, right: right[i] })) });
const table = (rows: TableRow[]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });

type Block = Paragraph | Table;

function pricingBlocks(f: Fin): Block[] {
  const cur = f.currency || "$";
  const tables = resolveFinTables(f).filter((tb) => (tb.rows || []).length > 0);
  const out: Block[] = [];
  let grand = 0;
  for (const tb of tables) {
    const c = priceCalc(tb);
    grand += c.grand;
    if (tb.title) out.push(h3(tb.title));
    const n = tb.columns.length;
    const isRight = (kind: string) => kind === "amount" || kind === "rate";
    const rows: TableRow[] = [headRow(tb.columns.map((col) => col.label || ""), tb.columns.map((col) => isRight(col.kind)))];
    const labelLine = (label: string, value: string, bold = false) => new TableRow({
      children: n >= 2 ? [tcell(label, { bold, right: true, span: n - 1 }), tcell(value, { bold: true, right: true })] : [tcell(`${label}: ${value}`, { bold })],
    });
    tb.rows.forEach((r, i) => {
      if (r.type === "group") { rows.push(new TableRow({ children: [tcell((r.label || "Phase").toUpperCase(), { bold: true, span: n, fill: "ECFDF5" })] })); return; }
      rows.push(new TableRow({ children: tb.columns.map((col) => tcell(
        col.kind === "amount" ? money(c.amountOf(r), cur) : col.kind === "rate" && r.cells?.[col.id] ? money(num(r.cells[col.id]), cur) : r.cells?.[col.id] || "",
        { right: isRight(col.kind) },
      )) }));
      const next = tb.rows[i + 1];
      const g = c.groups.find((x) => x.rows.includes(r));
      if (g?.label && (!next || next.type === "group")) rows.push(labelLine(`Subtotal, ${g.label}`, money(g.subtotal, cur), true));
    });
    if (c.adjustments.length) {
      rows.push(labelLine("Total of the lines", money(c.items, cur), true));
      for (const a of c.adjustments) rows.push(labelLine(a.label, money(a.amount, cur)));
    }
    out.push(table(rows));
    if (c.periods.length) {
      out.push(p(""));
      out.push(table([
        headRow(["Period", "Escalation (cumulative)", "Price"], [false, true, true]),
        ...c.periods.map((pr, k) => new TableRow({ children: [tcell(pr.label, { bold: true }), tcell(k === 0 ? "-" : `+${((pr.factor - 1) * 100).toFixed(2)}%`, { right: true }), tcell(money(pr.total, cur), { bold: true, right: true })] })),
      ]));
    }
    const nOpt = c.periods.length - 1;
    out.push(p(`${tb.title ? `${tb.title} total` : "Total"}${nOpt > 0 ? `, base + ${nOpt} option year${nOpt === 1 ? "" : "s"}` : ""}: ${money(c.grand, cur)}`, { bold: true }));
  }
  if (tables.length > 1) out.push(p(`Grand Total: ${money(grand, cur)}`, { bold: true, size: 26 }));
  if (f.notes?.trim()) { out.push(h3("Notes and terms")); out.push(...htmlToParagraphs(f.notes)); }
  return out;
}

/** Past performance / relevant experience: summary table, then each project; references: one table. */
function projectBlocks(items: PP[], label: string, referencesOnly: boolean): Block[] {
  const shown = (e: PP) => (e.showValue !== false && e.value?.trim() ? e.value.trim() : "");
  if (referencesOnly) {
    return [table([
      headRow(["Project", "Agency / client", "Contract no.", "Value", "Dates", "Point of contact", "Location"]),
      ...items.map((e) => new TableRow({ children: [
        tcell(e.name || "-", { bold: true }), tcell(e.client || "-"), tcell(e.contractNo || "-"), tcell(shown(e) || "-"),
        tcell(periodOf(e) || "-"), tcell([e.poc, e.pocEmail, e.pocPhone].filter(Boolean).join(", ") || "-"), tcell(e.location || "-"),
      ] })),
    ])];
  }
  const out: Block[] = [table([
    headRow(["No.", "Project", "Client", "Location", "Contract no.", "Period", "Value"], [false, false, false, false, false, false, true]),
    ...items.map((e, i) => new TableRow({ children: [
      tcell(String(i + 1)), tcell(e.name || "-", { bold: true }), tcell(e.client || "-"), tcell(e.location || "-"), tcell(e.contractNo || "-"),
      tcell(`${periodOf(e) || "-"}${e.status ? ` (${e.status})` : ""}`), tcell(shown(e) || "-", { right: true }),
    ] })),
  ])];
  items.forEach((e, i) => {
    out.push(h3(`${label} ${i + 1}: ${e.name || "Untitled project"}`));
    out.push(kvLine("Client", e.client));
    out.push(kvLine("Location", e.location));
    out.push(kvLine("Contract no.", e.contractNo));
    if (e.contractType) out.push(kvLine("Contract type", e.contractType));
    if (e.workType) out.push(kvLine("Work type", e.workType));
    out.push(kvLine("Period of performance", periodOf(e)));
    if (e.status) out.push(kvLine("Status", e.status));
    if (shown(e)) out.push(kvLine("Contract value", shown(e)));
    if (e.cpars) out.push(kvLine("CPARS / evaluation", e.cpars === "Yes" ? "Yes, on file" : e.cpars));
    const poc = [e.poc, e.pocEmail, e.pocPhone].filter(Boolean).join(", ");
    if (poc) out.push(kvLine("Client point of contact", poc));
    for (const para of (e.summary || "").split(/\n+/).map((x) => x.trim()).filter(Boolean)) out.push(p(para));
  });
  return out;
}

const STATUS_LABEL: Record<string, string> = { compliant: "Compliant", partial: "Partially compliant", "not-addressed": "Not yet addressed", "n/a": "Not applicable" };
const PROJECT_KEYS = new Set(["past-performance", "relevant-experience", "project-references", "appx-experience-sheets"]);
const sheetLabel = (builtin: boolean, key?: string) => (builtin || key === "past-performance" ? "Past Performance" : key === "relevant-experience" ? "Relevant Experience" : "Project");

export type ResumeLite = { title?: string; citizenship?: string; yearsOfExperience?: string; subcontractorName?: string };

/**
 * The Word file. Pure (the resume lookups come in as `resumeOf`), so it can be built and checked
 * without a database.
 */
export async function buildProposalDocx(project: { name: string }, pc: PContent, kind: "technical" | "financial", resumeOf: (e: Emp) => ResumeLite | undefined): Promise<Buffer> {
  {
    const fin = kind === "financial";
    // Each volume has its own cover and letter (the financial one used to borrow the technical's).
    const cover = (fin ? pc.coverFinancial || pc.cover : pc.cover) || {};
    const letter = fin ? pc.coverLetterFinancial : pc.coverLetter;
    const t = pc.technical || {};
    const f = pc.financial || {};
    const sections = (fin ? f.sections : t.sections) || [];
    const layout = resolveLayout(sections, fin ? f.layout : t.layout, fin ? FIN_BUILTINS : TECH_BUILTINS);
    const otherLayout = resolveLayout((fin ? t.sections : f.sections) || [], fin ? t.layout : f.layout, fin ? TECH_BUILTINS : FIN_BUILTINS);
    const numbering = (fin ? f.numbering || "letters" : t.numbering || "numbers");
    const appxNumbering = (fin ? f.appendixNumbering || "letters" : t.appendixNumbering || "numbers");
    const requirements = pc.requirements || [];
    const secFor = (m: SecMeta) => sections.find((s) => s.id === m.refId);
    // CR 202 - a government form, an external document and a custom attachment all print as uploaded.
    const isOriginal = (m: SecMeta) => m.pageType === "government" || m.pageType === "external" || m.pageType === "custom";

    const emps = fin ? [] : t.employees || [];

    // Does a section print anything? (the same rules as the PDF)
    const hasContent = (m: SecMeta) => {
      switch (m.kind) {
        case "description": return !!t.description?.trim();
        case "personnel": return emps.length > 0;
        case "pastPerformance": return (t.similarProjects || []).length > 0;
        case "timeline": return (t.timeline || []).length > 0;
        case "pricing": return resolveFinTables(f).some((tb) => (tb.rows || []).length > 0) || !!f.notes?.trim();
        case "custom": {
          const s = secFor(m);
          if (!s) return false;
          if (isOriginal(m)) return !!s.attachments?.length || !!m.divider;
          return true;
        }
        default: return false;
      }
    };
    const visible = layout.filter((m) => !m.hidden && hasContent(m));

    // Labels: A. / 01. / none for sections; Appendix A / 1 for appendices; subsections 1.1 / A.1.
    const labels = new Map<string, { heading: string; sub: string }>();
    let mainN = 0, appxN = 0;
    for (const m of visible) {
      if (m.appendix) {
        const a = appxNumbering === "letters" ? letterOf(++appxN) : String(++appxN);
        labels.set(m.id, { heading: `Appendix ${a}: `, sub: a });
      } else {
        const n = ++mainN;
        const short = numbering === "letters" ? letterOf(n) : numbering === "numbers" ? String(n).padStart(2, "0") : "";
        labels.set(m.id, { heading: short ? `${short}. ` : "", sub: numbering === "letters" ? letterOf(n) : numbering === "numbers" ? String(n) : "" });
      }
    }
    const codeOf = (id: string) => (labels.get(id)?.heading || "").replace(/[.:]\s*$/, "").trim();

    const body: Block[] = [];
    const label = fin ? "FINANCIAL PROPOSAL" : "TECHNICAL PROPOSAL";
    body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: label, font: "Calibri", bold: true, color: "0F8C6B", size: 24 })] }));
    body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: cover.proposalTitle || project.name, font: "Calibri", bold: true, size: 44 })] }));
    const fields: Array<[string, string | undefined]> = [
      ["Project Name", cover.projectName || project.name],
      ["Solicitation Number", cover.solicitationNo], ["Task Order Number", cover.taskOrderNo],
      ["Contract Number", cover.contractNo], ["Client Name", cover.clientName],
      ["Proposal Due Date", cover.dueDate], ["Date of Submission", cover.submissionDate],
      ["Submitted To", cover.submittedTo], ["Attention To", cover.attentionTo], ["Submitted By", cover.submittedBy],
    ];
    for (const [k, v] of fields) if (v && v.trim()) body.push(kvLine(k, v));

    if (letter?.enabled) {
      body.push(h("Transmittal Letter"));
      body.push(...htmlToParagraphs(letter.body));
      for (const s of letter.signatories || []) {
        if (s.name || s.title) { body.push(p("")); body.push(p(s.name || "", { bold: true })); if (s.title) body.push(p(s.title)); }
      }
    }

    for (const m of visible) {
      const lbl = labels.get(m.id);
      body.push(h(`${lbl?.heading || ""}${m.title}`));
      if (m.kind === "description") { body.push(...htmlToParagraphs(t.description)); continue; }
      if (m.kind === "personnel") {
        const key = emps.filter((e) => e.keyStaff !== false);
        const non = emps.filter((e) => e.keyStaff === false);
        let n = 0;
        const row = (e: Emp) => {
          const r = resumeOf(e);
          n += 1;
          return new TableRow({ children: [
            tcell(String(n)), tcell(e.name || "-", { bold: true }), tcell(e.role || r?.title || "-"),
            tcell(e.firm || r?.subcontractorName || COMPANY_NAME), tcell(e.nationality || r?.citizenship || "-"), tcell(e.years || r?.yearsOfExperience || "-"),
          ] });
        };
        const band = (text: string) => new TableRow({ children: [tcell(text, { bold: true, span: 6, fill: "ECFDF5" })] });
        body.push(table([
          headRow(["No.", "Name", "Position", "Contractor / Subcontractor", "Nationality", "Years of experience"]),
          ...(non.length && key.length ? [band("KEY STAFF")] : []), ...key.map(row),
          ...(non.length ? [band("NON-KEY STAFF")] : []), ...non.map(row),
        ]));
        body.push(p("The resumes of the proposed personnel are included in the PDF volume.", { italic: true, size: 19, color: "64748B" }));
        continue;
      }
      if (m.kind === "pastPerformance") { body.push(...projectBlocks(t.similarProjects || [], sheetLabel(true), false)); continue; }
      if (m.kind === "timeline") {
        body.push(table([headRow(["Phase", "Start", "End"]), ...(t.timeline || []).map((ph) => new TableRow({ children: [tcell(ph.phase || "-", { bold: true }), tcell(ph.start || "-"), tcell(ph.end || "-")] }))]));
        continue;
      }
      if (m.kind === "pricing") { body.push(...pricingBlocks(f)); continue; }

      // A custom section (library or free).
      const s = secFor(m);
      if (!s) continue;
      if (isOriginal(m)) {
        const names = (s.attachments || []).map((a) => a.name).filter(Boolean).join(", ");
        body.push(p(`${m.pageType === "government" ? "Government form" : "External document"}, inserted in the PDF exactly as uploaded${names ? `: ${names}` : " (nothing uploaded yet)"}.`, { italic: true, color: "64748B" }));
        continue;
      }
      body.push(...htmlToParagraphs(s.body));
      if (m.libraryKey === "compliance-matrix") {
        if (requirements.length) {
          body.push(table([
            headRow(["No.", "RFP requirement", "RFP ref.", "Proposal section", "Status"]),
            ...requirements.map((r, i) => {
              const same = (r.volume || "technical") === kind;
              const sec = r.sectionId ? (same ? layout : otherLayout).find((x) => x.id === r.sectionId) : undefined;
              const code = same && sec ? codeOf(sec.id) : "";
              const where = sec ? `${same ? "" : `${fin ? "Technical" : "Financial"} Proposal: `}${code ? `${code} ` : ""}${sec.title}` : "-";
              const st = r.status || (r.done ? "compliant" : "not-addressed");
              return new TableRow({ children: [tcell(String(i + 1)), tcell(r.label || "-"), tcell(r.rfpRef || "-"), tcell(where), tcell(STATUS_LABEL[st] || st, { bold: true })] });
            }),
          ]));
          body.push(p("Page numbers are given in the PDF volume.", { italic: true, size: 19, color: "64748B" }));
        } else body.push(p("No RFP requirements listed yet.", { italic: true, color: "64748B" }));
      }
      (s.subsections || []).filter((x) => (x.heading || "").trim() || (x.body || "").replace(/<[^>]*>/g, "").trim()).forEach((x, k) => {
        body.push(h3(`${lbl?.sub ? `${lbl.sub}.${k + 1} ` : ""}${x.heading || ""}`));
        body.push(...htmlToParagraphs(x.body));
      });
      if (s.projects?.length && PROJECT_KEYS.has(m.libraryKey || "")) body.push(...projectBlocks(s.projects, sheetLabel(false, m.libraryKey), m.libraryKey === "project-references"));
      const files = (s.attachments || []).map((a) => a.name).filter(Boolean);
      if (files.length) body.push(p(`Attached in the PDF, as uploaded: ${files.join(", ")}.`, { italic: true, size: 19, color: "64748B" }));
    }

    // US Letter with the letterhead header and a page-numbered footer, like every document we print.
    return Packer.toBuffer(new DocxDocument({ sections: [brandedSection(body, `${COMPANY_NAME}  ·  ${kind === "financial" ? "Financial" : "Technical"} Proposal`)] }));
  }
}

// GET /api/projects/:id/proposal-docx?kind=technical|financial
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const kind = req.query.kind === "financial" ? "financial" : "technical";
    const project = await Project.findOne({ projectId: req.params.id }).lean();
    if (!project) return res.status(404).json({ error: "Project not found." });
    const pc = ((project as { proposalContent?: PContent }).proposalContent || {}) as PContent;

    // Key staff: blank cells take the person's resume, as in the PDF.
    const emps = kind === "financial" ? [] : pc.technical?.employees || [];
    const validId = (v?: string) => !!v && mongoose.isValidObjectId(v);
    const empOnly = emps.filter((e) => !e.userId && e.empId).map((e) => e.empId as string);
    const users = empOnly.length ? await User.find({ empId: { $in: empOnly } }).select("_id empId").lean() : [];
    const userIdOf = (e: Emp) => (validId(e.userId) ? String(e.userId) : String(users.find((u) => (u as { empId?: string }).empId === e.empId)?._id || ""));
    const userIds = emps.map(userIdOf).filter(validId);
    const resumes = userIds.length ? await Resume.find({ userId: { $in: userIds } }).select("userId title citizenship yearsOfExperience").lean() : [];
    const subIds = emps.map((e) => e.subResumeId).filter(validId) as string[];
    const subs = subIds.length ? await SubResume.find({ _id: { $in: subIds } }).select("title citizenship yearsOfExperience subcontractorName").lean() : [];
    const resumeOf = (e: Emp): ResumeLite | undefined => (e.subResumeId
      ? (subs.find((x) => String(x._id) === e.subResumeId) as ResumeLite | undefined)
      : (resumes.find((x) => String((x as { userId?: unknown }).userId) === userIdOf(e)) as ResumeLite | undefined));

    const buf = await buildProposalDocx(project as { name: string }, pc, kind, resumeOf);
    // CR 265 - named after the document, readably: "Project C - Technical Proposal.docx".
    const fileBase = String(project.name || "Project").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const docxName = `${fileBase} - ${kind === "financial" ? "Financial" : "Technical"} Proposal.docx`;
    res.setHeader("Content-Disposition", `attachment; filename="${docxName}"; filename*=UTF-8''${encodeURIComponent(docxName)}`);
    res.send(buf);
  } catch (err) { next(err); }
});

export default router;
