import { Router, Response, NextFunction } from "express";
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } from "docx";
import Project from "../models/Project";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { tabAccessGuard } from "../lib/access";

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(tabAccessGuard(["proposals"]));

// ── Loose types for the Mixed proposalContent ────────────────────────────────
interface SecMeta { id: string; kind: string; refId?: string; title: string; hidden?: boolean }
interface Sec { id: string; heading: string; body: string }
interface Tech {
  description?: string;
  employees?: Array<{ name?: string; role?: string }>;
  similarProjects?: Array<{ name?: string; client?: string; year?: string; value?: string; summary?: string }>;
  timeline?: Array<{ phase?: string; start?: string; end?: string }>;
  sections?: Sec[];
  layout?: SecMeta[];
}
interface FinCol { id: string; label: string; kind: string }
interface FinRow { id: string; cells: Record<string, string> }
interface FinTable { id: string; title: string; columns: FinCol[]; rows: FinRow[] }
interface Fin { currency?: string; notes?: string; lineItems?: Array<{ itemNo?: string; description?: string; qty?: string; unit?: string; rate?: string; amount?: string }>; tables?: FinTable[] }

function resolveFinTables(f: Fin): FinTable[] {
  if (f.tables && f.tables.length) return f.tables;
  const cols: FinCol[] = [
    { id: "c-item", label: "Item", kind: "text" }, { id: "c-desc", label: "Description", kind: "text" },
    { id: "c-qty", label: "Qty", kind: "number" }, { id: "c-unit", label: "Unit", kind: "text" },
    { id: "c-rate", label: "Rate", kind: "number" }, { id: "c-amount", label: "Amount", kind: "amount" },
  ];
  const rows: FinRow[] = (f.lineItems || []).map((it, i) => ({ id: `r-${i}`, cells: { "c-item": it.itemNo || "", "c-desc": it.description || "", "c-qty": it.qty || "", "c-unit": it.unit || "", "c-rate": it.rate || "", "c-amount": it.amount || "" } }));
  return [{ id: "t", title: "Pricing", columns: cols, rows }];
}
interface Cover { proposalTitle?: string; projectName?: string; solicitationNo?: string; taskOrderNo?: string; contractNo?: string; clientName?: string; dueDate?: string; submissionDate?: string; submittedTo?: string; attentionTo?: string; submittedBy?: string }
interface CoverLetter { enabled?: boolean; body?: string; signatories?: Array<{ name?: string; title?: string }> }
interface PContent { cover?: Cover; coverLetter?: CoverLetter; technical?: Tech; financial?: Fin }

const BUILTINS: Array<[string, string]> = [
  ["description", "Technical Description"],
  ["personnel", "Key Personnel"],
  ["pastPerformance", "Similar Projects / Past Performance"],
  ["timeline", "Project Timeline"],
];

function resolveLayout(t: Tech): SecMeta[] {
  const existing = t.layout || [];
  const out: SecMeta[] = [];
  const seenB = new Set<string>(), seenC = new Set<string>();
  for (const m of existing) {
    if (m.kind === "custom") {
      if (m.refId && (t.sections || []).some((s) => s.id === m.refId) && !seenC.has(m.refId)) { seenC.add(m.refId); out.push(m); }
    } else if (m.kind === "blank") { /* skip blanks in docx */ }
    else if (!seenB.has(m.kind)) { seenB.add(m.kind); out.push(m); }
  }
  for (const [kind, title] of BUILTINS) if (!seenB.has(kind)) out.push({ id: `b-${kind}`, kind, title, hidden: false });
  for (const s of t.sections || []) if (!seenC.has(s.id)) out.push({ id: `m-${s.id}`, kind: "custom", refId: s.id, title: s.heading || "Section", hidden: false });
  return out;
}

const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
function htmlToParagraphs(html?: string): Paragraph[] {
  if (!html || !html.trim()) return [];
  const text = decode(
    html.replace(/<\/(p|div|h[1-6]|li)>/gi, "\n").replace(/<br\s*\/?>(\n)?/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, "")
  );
  return text.split("\n").map((l) => l.trim()).filter((l) => l !== "").map((l) => new Paragraph({ children: [new TextRun({ text: l, font: "Calibri", size: 22 })] }));
}
const h = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 80 }, children: [new TextRun({ text, font: "Calibri", bold: true, size: 26 })] });
const p = (text: string, opts: { bold?: boolean; size?: number } = {}) => new Paragraph({ children: [new TextRun({ text, font: "Calibri", bold: opts.bold, size: opts.size || 22 })] });
const cell = (text: string, bold = false) => new TableCell({ width: { size: 0, type: WidthType.AUTO }, children: [new Paragraph({ children: [new TextRun({ text, font: "Calibri", bold, size: 20 })] })] });
const num = (s?: string) => parseFloat(String(s || "").replace(/[^0-9.-]/g, "")) || 0;

// GET /api/projects/:id/proposal-docx?kind=technical|financial
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const kind = req.query.kind === "financial" ? "financial" : "technical";
    const project = await Project.findOne({ projectId: req.params.id }).lean();
    if (!project) return res.status(404).json({ error: "Project not found." });
    const pc = ((project as { proposalContent?: PContent }).proposalContent || {}) as PContent;
    const cover = pc.cover || {};
    const label = kind === "technical" ? "TECHNICAL PROPOSAL" : "FINANCIAL PROPOSAL";

    const body: (Paragraph | Table)[] = [];
    body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: label, font: "Calibri", bold: true, color: "0F8C6B", size: 24 })] }));
    body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: cover.proposalTitle || project.name, font: "Calibri", bold: true, size: 44 })] }));

    const fields: Array<[string, string | undefined]> = [
      ["Project Name", cover.projectName || project.name],
      ["Solicitation Number", cover.solicitationNo], ["Task Order Number", cover.taskOrderNo],
      ["Contract Number", cover.contractNo], ["Client Name", cover.clientName],
      ["Proposal Due Date", cover.dueDate], ["Date of Submission", cover.submissionDate],
      ["Submitted To", cover.submittedTo], ["Attention To", cover.attentionTo], ["Submitted By", cover.submittedBy],
    ];
    for (const [k, v] of fields) if (v && v.trim()) body.push(p(`${k}: ${v}`));

    if (pc.coverLetter?.enabled) {
      body.push(h("Cover Letter"));
      body.push(...htmlToParagraphs(pc.coverLetter.body));
      for (const s of pc.coverLetter.signatories || []) {
        if (s.name || s.title) { body.push(p("")); body.push(p(s.name || "", { bold: true })); if (s.title) body.push(p(s.title)); }
      }
    }

    if (kind === "technical") {
      const t = pc.technical || {};
      const visible = resolveLayout(t).filter((m) => !m.hidden);
      let n = 0;
      for (const m of visible) {
        n++;
        if (m.kind === "description") { if (t.description?.trim()) { body.push(h(`${n}. ${m.title}`)); body.push(...htmlToParagraphs(t.description)); } else n--; }
        else if (m.kind === "personnel") { if ((t.employees || []).length) { body.push(h(`${n}. ${m.title}`)); for (const e of t.employees || []) body.push(p(`${e.name || "—"}${e.role ? ` — ${e.role}` : ""}`)); } else n--; }
        else if (m.kind === "pastPerformance") { if ((t.similarProjects || []).length) { body.push(h(`${n}. ${m.title}`)); for (const s of t.similarProjects || []) { body.push(p(s.name || "—", { bold: true })); const meta = [s.client, s.year, s.value].filter(Boolean).join(" · "); if (meta) body.push(p(meta)); if (s.summary) body.push(p(s.summary)); } } else n--; }
        else if (m.kind === "timeline") { if ((t.timeline || []).length) { body.push(h(`${n}. ${m.title}`)); for (const ph of t.timeline || []) body.push(p(`${ph.phase || "—"}: ${ph.start || "—"} – ${ph.end || "—"}`)); } else n--; }
        else { const s = (t.sections || []).find((x) => x.id === m.refId); if (s && (s.heading || s.body)) { body.push(h(`${n}. ${m.title}`)); body.push(...htmlToParagraphs(s.body)); } else n--; }
      }
    } else {
      const f = pc.financial || {};
      const cur = f.currency || "$";
      const tables = resolveFinTables(f);
      let grand = 0;
      for (const tb of tables) {
        body.push(h(tb.title || "Pricing"));
        const header = new TableRow({ tableHeader: true, children: tb.columns.map((c) => cell(c.label, true)) });
        let tot = 0;
        const trows = tb.rows.map((r) => new TableRow({ children: tb.columns.map((c) => {
          const v = r.cells[c.id] || "";
          if (c.kind === "amount") tot += num(v);
          return cell(c.kind === "amount" && v ? `${cur}${num(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : v);
        }) }));
        grand += tot;
        body.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...trows] }));
        body.push(p(`${tb.title ? `${tb.title} total` : "Total"}: ${cur}${tot.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, { bold: true }));
      }
      if (tables.length > 1) body.push(p(`Grand Total: ${cur}${grand.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, { bold: true, size: 26 }));
      if (f.notes?.trim()) { body.push(h("Notes / Terms")); body.push(...htmlToParagraphs(f.notes)); }
    }

    const buf = await Packer.toBuffer(new DocxDocument({ sections: [{ children: body }] }));
    const fileBase = (project.name || "project").replace(/[^a-z0-9]+/gi, "_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${fileBase}_${kind === "technical" ? "Technical" : "Financial"}_Proposal.docx"`);
    res.send(buf);
  } catch (err) { next(err); }
});

export default router;
