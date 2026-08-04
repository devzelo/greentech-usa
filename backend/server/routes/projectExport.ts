import { Router, Response, NextFunction } from "express";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
const archiver = createRequire(import.meta.url)("archiver") as (format: "zip", opts?: { zlib?: { level?: number } }) => import("archiver").Archiver;
import Project from "../models/Project";
import ProjectDocument from "../models/ProjectDocument";
import Expense from "../models/Expense";
import PurchaseOrder from "../models/PurchaseOrder";
import Invoice from "../models/Invoice";
import ProcurementRow from "../models/ProcurementRow";
import Employee from "../models/Employee";
import User from "../models/User";
import { sectionToTabId } from "../lib/access";
import { requireAuth, blockGuests, AuthedRequest } from "../middleware/auth";
import { Document as DocxDocument, Packer, Paragraph, TextRun } from "docx";

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(blockGuests); // guests cannot export the full project archive

/** Render a plain-text block as a Word .docx and append it to the archive. */
async function addDocx(archive: import("archiver").Archiver, name: string, text: string) {
  const paragraphs = text.split(/\r?\n/).map((line) =>
    new Paragraph({ children: line ? [new TextRun({ text: line, font: "Calibri", size: 22 })] : [] })
  );
  const buf = await Packer.toBuffer(new DocxDocument({ sections: [{ children: paragraphs }] }));
  archive.append(buf, { name });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Make a string safe to use as a file/folder name across OSes. */
function sanitize(s: string): string {
  return (s || "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "untitled";
}

/** Escape one value for a CSV cell. */
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string (with a BOM so Excel opens UTF-8 correctly). */
function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Fallback friendly name for an unknown document section id. */
function humanize(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Convert the builder's stored HTML (rich-text fields) into readable plain text. */
function htmlToText(html: unknown): string {
  if (!html) return "";
  return String(html)
    .replace(/<\s*li[^>]*>/gi, "  • ")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#3?9;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const kv = (label: string, value: unknown) =>
  `${label}: ${value === null || value === undefined || value === "" ? "—" : value}`;

// Friendly titles for the known document sections (used for subfolder names).
const SECTION_TITLES: Record<string, string> = {
  "project-info-rfp": "RFP (Request for Proposal)",
  "project-info-specifications": "Specifications",
  "project-info-bidding": "Bidding Documents",
  "project-info-change-orders": "Change Orders",
  "project-info-other": "Other Project Docs",
  "proposals-technical": "Technical Proposal",
  "proposals-financial": "Financial Proposal",
  "pm-schedules": "Schedules",
  "pm-meeting-minutes": "Meeting Minutes",
  "pm-progress-reports": "Progress Reports",
  "pm-site-data": "Site Data",
  "pm-closeout": "Closeout Documents",
  "tech-drawings": "Drawings",
  "tech-reports": "Technical Reports",
  "tech-lab-results": "Lab Test Results",
  "tech-boq": "Bill of Quantities (BOQ)",
  "legal-office-reg": "Local Office Registration",
  "legal-iloc": "ILOC (Irrevocable Letter of Credit)",
  "legal-bond": "Bond Documents",
  "legal-insurance": "Insurance Certificates",
  "legal-tax": "Tax Documents",
  "po-documents": "PO Documents",
  "invoice-sent-documents": "Invoice Documents",
  "invoice-received-documents": "Bill Documents",
};

// GET /api/projects/:id/export — streams a .zip with one folder per workspace tab.
router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.id;
    const project = await Project.findOne({ projectId });
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Access: owner or assigned employee
    const userId = req.user!.userId;
    const isOwner = project.ownerId && String(project.ownerId) === userId;
    const me = await User.findById(userId).lean();
    const empId = (me as { empId?: string } | null)?.empId || "";
    const isAssigned = empId && project.assignedEmployees.includes(empId);
    if (!isOwner && !isAssigned) {
      return res.status(403).json({ error: "You do not have access to this project." });
    }

    // Load sub-collections in parallel
    const [docs, expenses, pos, invoices, procurement, employees] = await Promise.all([
      ProjectDocument.find({ projectId }).lean(),
      Expense.find({ projectId }).lean(),
      PurchaseOrder.find({ projectId }).lean(),
      Invoice.find({ projectId }).lean(),
      ProcurementRow.find({ projectId }).lean(),
      Employee.find({ empId: { $in: project.assignedEmployees || [] } }).lean(),
    ]);
    type Doc = (typeof docs)[number];

    const safeName = sanitize(project.name || projectId).replace(/\s+/g, "_");
    const ts = new Date().toISOString().slice(0, 10);
    const zipFileName = `${safeName}_export_${ts}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipFileName}"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("warning", (err) => { if (err.code !== "ENOENT") throw err; });
    archive.on("error", (err) => next(err));
    archive.pipe(res);

    // ── Lookups for friendly document subfolder names ────────────────────────
    const empName: Record<string, string> = {};
    for (const e of employees) empName[e.empId] = e.name;

    const subName: Record<string, string> = {};
    for (const s of project.subcontractors || []) subName[s.subId] = s.name || s.subId;

    const customLabel: Record<string, string> = {};
    const fieldLabel: Record<string, string> = {};
    for (const t of project.customTabs || []) {
      customLabel[t.tabId] = t.label || t.tabId;
      for (const f of t.fields || []) fieldLabel[f.fieldId] = f.label || f.fieldId;
    }

    /** Friendly subfolder name for a document's section. */
    function docSubtitle(section: string): string {
      if (SECTION_TITLES[section]) return SECTION_TITLES[section];
      if (section.startsWith("subcontractor-")) {
        return subName[section.slice("subcontractor-".length)] || humanize(section);
      }
      if (section.startsWith("custom-")) {
        const fi = section.indexOf("-field-");
        if (fi !== -1) {
          const fieldId = section.slice(fi + "-field-".length);
          return fieldLabel[fieldId] || humanize(section);
        }
        return "Files";
      }
      return humanize(section);
    }

    // ── Route every uploaded file to the tab it belongs to ───────────────────
    const docsByTab: Record<string, Doc[]> = {};
    for (const d of docs) {
      const tabId = sectionToTabId(d.section) || "__other";
      (docsByTab[tabId] ||= []).push(d);
    }

    /** Add a tab's uploaded files into `<folder>/<section title>/...`. */
    function addTabDocs(folder: string, tabId: string) {
      const list = docsByTab[tabId] || [];
      const bySub: Record<string, Doc[]> = {};
      for (const d of list) (bySub[docSubtitle(d.section)] ||= []).push(d);
      for (const [sub, items] of Object.entries(bySub)) {
        const used = new Set<string>();
        for (const d of items) {
          const abs = path.isAbsolute(d.filePath) ? d.filePath : path.join(process.cwd(), d.filePath);
          if (!fs.existsSync(abs)) continue;
          let nm = sanitize(d.name || path.basename(d.filePath));
          if (!path.extname(nm) && d.fileType) nm += "." + d.fileType;
          // Avoid name collisions within the same subfolder.
          let final = nm, i = 2;
          while (used.has(final.toLowerCase())) {
            const ext = path.extname(nm);
            final = `${nm.slice(0, nm.length - ext.length)} (${i})${ext}`;
            i++;
          }
          used.add(final.toLowerCase());
          archive.file(abs, { name: `${folder}/${sanitize(sub)}/${final}` });
        }
      }
    }

    // Running counter so tab folders sort in the same order as the app's tabs.
    // Every top-level tab records its folder path so sub-tabs can nest inside it.
    let n = 0;
    const tabFolder: Record<string, string> = {};
    const folderFor = (label: string, tabId?: string) => {
      const p = `${String(++n).padStart(2, "0")} - ${sanitize(label)}`;
      if (tabId) tabFolder[tabId] = p;
      return p;
    };

    // ── README + project identity ────────────────────────────────────────────
    const readme = `GreenTech USA — Project Export
==============================
Project:     ${project.name}  (${project.projectId})
Status:      ${project.status}
Owner:       ${project.owner || "—"}
Location:    ${project.location || "—"}
Exported:    ${new Date().toISOString()}
Exported by: ${req.user!.name} (${req.user!.email})

HOW THIS FOLDER IS ORGANIZED
----------------------------
Each numbered folder is one tab from the project workspace, shown in the same
order as in the app. Inside each folder you'll find:
  • A .docx file (opens in Microsoft Word) with the written information for that tab.
  • A .csv file (opens in Excel / Google Sheets) for the financial tabs.
  • Subfolders holding the original uploaded files for that tab.

Project Summary.docx  — the project's identity and key details at a glance.
_technical/           — raw machine-readable data (JSON), for backup / re-import.
`;
    await addDocx(archive, "README.docx", readme);

    const summary = [
      "PROJECT SUMMARY", "===============", "",
      kv("Project Name", project.name),
      kv("Project ID", project.projectId),
      kv("Status", project.status),
      kv("Category", project.category),
      kv("Location", project.location),
      kv("Owner", project.owner),
      kv("Published", project.published ? "Yes" : "No"),
      kv("Progress", `${project.progress}%`),
      kv("Fiscal", project.fiscal),
      kv("Compliance", project.compliance),
      kv("Project Value", project.value),
      kv("Disciplines", (project.disciplines || []).join(", ")),
      kv("Start Date", project.startDate),
      kv("End Date", project.endDate),
      "", "Description:", project.description || "—",
    ].join("\n") + "\n";
    await addDocx(archive, "Project Summary.docx", summary);

    // ── 01 · Project Nature ──────────────────────────────────────────────────
    {
      const f = folderFor("Project Nature", "nature");
      const pn = project.projectNature || { selected: [], custom: [] };
      const sel = pn.selected?.length ? pn.selected.map((s) => `  - ${s}`).join("\n") : "  (none)";
      const cus = pn.custom?.length ? pn.custom.map((s) => `  - ${s}`).join("\n") : "  (none)";
      await addDocx(archive, `${f}/Project Nature.docx`, `PROJECT NATURE\n==============\n\nSelected types:\n${sel}\n\nCustom entries:\n${cus}\n`);
      addTabDocs(f, "nature");
    }

    // ── 02 · Client Info ─────────────────────────────────────────────────────
    {
      const f = folderFor("Client Info", "client");
      const c = project.clientInfo || ({} as typeof project.clientInfo);
      const t = [
        "CLIENT INFO", "===========", "",
        kv("Client Name", c.name), kv("Reference", c.reference),
        kv("Contact Name", c.contactName), kv("Email", c.email),
        kv("Phone", c.phone), kv("Country", c.country),
        kv("Address", c.address), "", "Notes:", c.notes || "—",
      ].join("\n") + "\n";
      await addDocx(archive, `${f}/Client Info.docx`, t);
      addTabDocs(f, "client");
    }

    // ── 03 · Project Info ────────────────────────────────────────────────────
    {
      const f = folderFor("Project Info", "project-info");
      const t = [
        "PROJECT INFO", "============", "",
        kv("Project Name", project.name),
        kv("Project ID", project.projectId),
        kv("Status", project.status),
        kv("Category", project.category),
        kv("Location", project.location),
        kv("Owner", project.owner),
        kv("Fiscal", project.fiscal),
        kv("Compliance", project.compliance),
        kv("Project Value", project.value),
        kv("Disciplines", (project.disciplines || []).join(", ")),
        kv("Start Date", project.startDate),
        kv("End Date", project.endDate),
        kv("Progress", `${project.progress}%`),
        "", "Description:", project.description || "—",
      ].join("\n") + "\n";
      await addDocx(archive, `${f}/Project Info.docx`, t);
      addTabDocs(f, "project-info");
    }

    // ── 04 · Proposals ───────────────────────────────────────────────────────
    {
      const f = folderFor("Proposals", "proposals");
      const p = project.proposals || ({} as typeof project.proposals);
      // Full proposal builder content (Technical + Financial). Mixed in the model.
      const pc = (project.proposalContent || {}) as {
        technical?: {
          coverTitle?: string; coverSubtitle?: string; refNo?: string; date?: string;
          description?: string;
          employees?: Array<{ name?: string; role?: string; resumeName?: string }>;
          similarProjects?: Array<{ name?: string; client?: string; value?: string; year?: string; summary?: string }>;
          timeline?: Array<{ phase?: string; start?: string; end?: string }>;
          sections?: Array<{ heading?: string; body?: string }>;
        };
        financial?: {
          currency?: string; notes?: string;
          lineItems?: Array<{ itemNo?: string; description?: string; qty?: string; unit?: string; rate?: string; amount?: string }>;
        };
      };

      const lines: string[] = [
        "PROPOSALS", "=========", "",
        "Status Overview", "---------------",
        "Technical Proposal:",
        `  ${kv("Submission Date", p.technical?.submissionDate)}`,
        `  ${kv("Status", p.technical?.status)}`,
        "",
        "Financial Proposal:",
        `  ${kv("Submission Date", p.financial?.submissionDate)}`,
        `  ${kv("Status", p.financial?.status)}`,
      ];

      // Technical proposal builder content
      const tech = pc.technical;
      if (tech && (tech.coverTitle || tech.coverSubtitle || tech.refNo || tech.date || tech.description ||
        tech.employees?.length || tech.similarProjects?.length || tech.timeline?.length || tech.sections?.length)) {
        lines.push("", "=".repeat(60), "TECHNICAL PROPOSAL", "=".repeat(60), "");
        lines.push(
          kv("Cover Title", tech.coverTitle),
          kv("Cover Subtitle", tech.coverSubtitle),
          kv("Reference No.", tech.refNo),
          kv("Date", tech.date),
        );
        if (tech.description) lines.push("", "Description:", htmlToText(tech.description));
        if (tech.employees?.length) {
          lines.push("", "Key Personnel:");
          for (const e of tech.employees)
            lines.push(`  • ${e.name || "—"}${e.role ? ` — ${e.role}` : ""}${e.resumeName ? `  (resume: ${e.resumeName})` : ""}`);
        }
        if (tech.similarProjects?.length) {
          lines.push("", "Similar Projects:");
          for (const s of tech.similarProjects) {
            lines.push(`  • ${s.name || "—"}`);
            lines.push(`      ${kv("Client", s.client)}   ${kv("Value", s.value)}   ${kv("Year", s.year)}`);
            if (s.summary) lines.push(`      ${kv("Summary", s.summary)}`);
          }
        }
        if (tech.timeline?.length) {
          lines.push("", "Timeline:");
          for (const ph of tech.timeline)
            lines.push(`  - ${ph.phase || "—"}  (${ph.start || "—"} → ${ph.end || "—"})`);
        }
        if (tech.sections?.length) {
          for (const sec of tech.sections) {
            const h = sec.heading || "Section";
            lines.push("", h.toUpperCase(), "-".repeat(h.length), htmlToText(sec.body));
          }
        }
      }

      // Financial proposal builder content
      const fin = pc.financial;
      if (fin && (fin.currency || fin.notes || fin.lineItems?.length)) {
        lines.push("", "=".repeat(60), "FINANCIAL PROPOSAL", "=".repeat(60), "");
        lines.push(kv("Currency", fin.currency));
        if (fin.notes) lines.push("", "Notes:", htmlToText(fin.notes));
        if (fin.lineItems?.length) {
          lines.push("", "Line Items: (full table in 'Financial Line Items.csv')");
          for (const li of fin.lineItems)
            lines.push(`  - ${li.itemNo ? li.itemNo + ". " : ""}${li.description || "—"}  —  ${li.qty || "0"} ${li.unit || ""} × ${li.rate || "0"} = ${li.amount || "0"} ${fin.currency || ""}`.trim());
        }
      }

      await addDocx(archive, `${f}/Proposals.docx`, lines.join("\n") + "\n");

      // Financial line items as a spreadsheet-friendly CSV.
      if (fin?.lineItems?.length) {
        const csv = toCsv(
          ["Item #", "Description", "Qty", "Unit", "Rate", "Amount", "Currency"],
          fin.lineItems.map((li) => [li.itemNo, li.description, li.qty, li.unit, li.rate, li.amount, fin.currency || ""]),
        );
        archive.append(csv, { name: `${f}/Financial Line Items.csv` });
      }

      addTabDocs(f, "proposals");
    }

    // ── 05 · Project Management ──────────────────────────────────────────────
    {
      const f = folderFor("Project Management", "pm");
      const phases = project.timeline?.phases || [];
      let t = "PROJECT MANAGEMENT\n==================\n\nTimeline Phases:\n";
      t += phases.length
        ? phases.map((ph) => `  - ${ph.name || "—"}  (${ph.start || "—"} → ${ph.end || "—"})`).join("\n") + "\n"
        : "  (none)\n";
      await addDocx(archive, `${f}/Project Management.docx`, t);
      addTabDocs(f, "pm");
    }

    // ── 06 · Technical Docs ──────────────────────────────────────────────────
    {
      const f = folderFor("Technical Docs", "tech-docs");
      await addDocx(archive, `${f}/Technical Docs.docx`, "TECHNICAL DOCS\n==============\n\nUploaded technical documents are organized in the subfolders here.\n");
      addTabDocs(f, "tech-docs");
    }

    // ── 07 · Subcontractors & Employees ──────────────────────────────────────
    {
      const f = folderFor("Subcontractors & Employees", "subs");
      let t = "SUBCONTRACTORS & EMPLOYEES\n==========================\n\nSubcontractors:\n";
      const subs = project.subcontractors || [];
      if (subs.length) {
        for (const s of subs) {
          t += `\n  • ${s.name || "—"}\n` +
            `      ${kv("Scope", s.scope)}\n` +
            `      ${kv("Contact", s.contact)}\n` +
            `      ${kv("Email", s.email)}\n` +
            `      ${kv("Phone", s.phone)}\n` +
            `      ${kv("Notes", s.notes)}\n`;
        }
      } else {
        t += "  (none)\n";
      }
      t += "\nAssigned Employees:\n";
      const emps = project.assignedEmployees || [];
      t += emps.length ? emps.map((e) => `  - ${empName[e] || e}`).join("\n") + "\n" : "  (none)\n";
      await addDocx(archive, `${f}/Subcontractors & Employees.docx`, t);
      addTabDocs(f, "subs");
    }

    // ── 08 · Legal Docs ──────────────────────────────────────────────────────
    {
      const f = folderFor("Legal Docs", "legal");
      await addDocx(archive, `${f}/Legal Docs.docx`, "LEGAL DOCS\n==========\n\nUploaded legal documents are organized in the subfolders here.\n");
      addTabDocs(f, "legal");
    }

    // ── 09 · Expenses ────────────────────────────────────────────────────────
    {
      const f = folderFor("Expenses", "expenses");
      const csv = toCsv(["Description", "Date", "Qty", "Unit Price", "Remarks", "Added By"],
        expenses.map((e) => [e.description, e.date, e.qty, e.amount, e.remarks, e.addedByName]));
      archive.append(csv, { name: `${f}/Expenses.csv` });
      addTabDocs(f, "expenses");
    }

    // ── 10 · Purchase Orders ─────────────────────────────────────────────────
    {
      const f = folderFor("Purchase Orders", "po");
      const csv = toCsv(["PO Number", "Vendor", "Amount", "Date", "Status"],
        pos.map((p) => [p.poNumber, p.vendor, p.amount, p.date, p.status]));
      archive.append(csv, { name: `${f}/Purchase Orders.csv` });
      addTabDocs(f, "po");
    }

    // ── 11 · Invoice Sent ────────────────────────────────────────────────────
    {
      const f = folderFor("Invoice Sent", "invoice-sent");
      const sent = invoices.filter((i) => i.type === "sent");
      const csv = toCsv(["Invoice Number", "Party", "Amount", "Date", "Status"],
        sent.map((i) => [i.number, i.party, i.amount, i.date, i.status]));
      archive.append(csv, { name: `${f}/Invoices Sent.csv` });
      addTabDocs(f, "invoice-sent");
    }

    // ── 12 · Invoice Received ────────────────────────────────────────────────
    {
      const f = folderFor("Invoice Received", "invoice-received");
      const rec = invoices.filter((i) => i.type === "received");
      const csv = toCsv(["Invoice Number", "Party", "Amount", "Date", "Status"],
        rec.map((i) => [i.number, i.party, i.amount, i.date, i.status]));
      archive.append(csv, { name: `${f}/Invoices Received.csv` });
      addTabDocs(f, "invoice-received");
    }

    // ── 13 · Procurement & Submittals ────────────────────────────────────────
    {
      const f = folderFor("Procurement & Submittals", "procurement");
      const csv = toCsv(
        ["Item #", "Description", "Submittal", "Status", "Recommended Brand/Supplier", "QTY", "Unit", "Total", "Currency", "Order Date", "Payment", "Paid By", "Remarks"],
        procurement.map((r) => [r.itemNo, r.description, r.submittal, r.status, r.recommendedBrand, r.qty, r.unit, r.total, r.currency, r.orderDate, r.payment, r.paidBy, r.remarks]),
      );
      archive.append(csv, { name: `${f}/Procurement Log.csv` });
      addTabDocs(f, "procurement");
    }

    // ── Custom tabs ──────────────────────────────────────────────────────────
    // A custom tab is either top-level (no parentId → its own numbered folder) or
    // a sub-tab (parentId → nested inside its parent tab's folder). The parent may
    // be a default tab or a top-level custom tab; both are registered in tabFolder.
    const allCustom = project.customTabs || [];

    /** Write a custom tab's text summary + uploaded files into `folder`. */
    const writeCustomTab = async (
      t: (typeof allCustom)[number],
      folder: string,
    ) => {
      const label = t.label || "Custom Tab";
      let body = `${label.toUpperCase()}\n${"=".repeat(label.length)}\n\n`;
      if (t.notes) body += `Notes:\n${t.notes}\n\n`;
      if (t.fields?.length) {
        body += "Fields:\n";
        for (const fld of t.fields) body += `  ${kv(fld.label || fld.fieldId, fld.value)}\n`;
      }
      await addDocx(archive, `${folder}/${sanitize(label)}.docx`, body);
      addTabDocs(folder, t.tabId);
    };

    // Top-level custom tabs first, so their folders are registered for any children.
    for (const t of allCustom) {
      if (t.parentId) continue;
      await writeCustomTab(t, folderFor(t.label || "Custom Tab", t.tabId));
    }

    // Sub-tabs nest inside their parent tab's folder, numbered within that parent.
    const childCount: Record<string, number> = {};
    for (const t of allCustom) {
      if (!t.parentId) continue;
      const base = tabFolder[t.parentId];
      if (!base) {
        // Parent missing (e.g. deleted) — fall back to a top-level folder.
        await writeCustomTab(t, folderFor(t.label || "Sub-tab", t.tabId));
        continue;
      }
      const idx = (childCount[t.parentId] = (childCount[t.parentId] || 0) + 1);
      const childFolder = `${base}/${String(idx).padStart(2, "0")} - ${sanitize(t.label || "Sub-tab")}`;
      tabFolder[t.tabId] = childFolder;
      await writeCustomTab(t, childFolder);
    }

    // ── Any uploads that didn't map to a known tab ───────────────────────────
    if (docsByTab["__other"]?.length) addTabDocs("Other Files", "__other");

    // ── _technical/ — raw machine-readable data (backup / re-import) ──────────
    archive.append(JSON.stringify(project.toObject(), null, 2), { name: "_technical/project.json" });
    archive.append(JSON.stringify(expenses, null, 2), { name: "_technical/expenses.json" });
    archive.append(JSON.stringify(pos, null, 2), { name: "_technical/purchase_orders.json" });
    archive.append(JSON.stringify(invoices, null, 2), { name: "_technical/invoices.json" });
    archive.append(JSON.stringify(procurement, null, 2), { name: "_technical/procurement_log.json" });
    archive.append(JSON.stringify(docs, null, 2), { name: "_technical/documents_metadata.json" });

    await archive.finalize();
  } catch (err) {
    next(err);
  }
});

export default router;
