import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { connectDB } from "./config/db";
import { errorHandler } from "./middleware/errorHandler";
import { uploadsGuard } from "./middleware/uploadsGuard";
import projectRoutes from "./routes/projects";
import employeeRoutes from "./routes/employees";
import expenseRoutes from "./routes/expenses";
import purchaseOrderRoutes from "./routes/purchaseOrders";
import invoiceRoutes from "./routes/invoices";
import documentRoutes from "./routes/documents";
import authRoutes from "./routes/auth";
import fileRoutes from "./routes/files";
import templateRoutes from "./routes/templates";
import procurementRowRoutes from "./routes/procurementRows";
import allDocumentsRoutes from "./routes/allDocuments";
import projectExportRoutes from "./routes/projectExport";
import publicProjectsRoutes from "./routes/publicProjects";
import projectImageRoutes from "./routes/projectImage";
import projectContractRoutes from "./routes/projectContract";
import galleryRoutes from "./routes/gallery";
import notificationRoutes from "./routes/notifications";
import resumeRoutes from "./routes/resume";
import companyRoutes from "./routes/company";
import userRoutes from "./routes/users";
import proposalAssetRoutes from "./routes/proposalAssets";
import proposalTemplateRoutes from "./routes/proposalTemplates";
import proposalDocxRoutes from "./routes/proposalDocx";
import resourceBlockRoutes from "./routes/resourceBlocks";
import proposalRevisionRoutes from "./routes/proposalRevisions";
import rfpDocumentRoutes from "./routes/rfpDocuments";
import subInvoiceRoutes from "./routes/subInvoices";
import procurementRoutes from "./routes/procurement";
import submittalRoutes from "./routes/submittals";
import vendorRoutes from "./routes/vendors";
import rfqRoutes from "./routes/rfqs";
import procurementPORoutes from "./routes/procurementPOs";
import shipmentRoutes from "./routes/shipments";
import projectRequestRoutes from "./routes/projectRequests";
import technicalDocRoutes from "./routes/technicalDocs";
import projectTableRoutes from "./routes/projectTables";
import subAgreementRoutes from "./routes/subAgreements";
import { userAgreementRouter, projectAgreementRouter, generalAgreementRouter, agreementTemplateRouter, expireOverdueAgreements } from "./routes/agreements";
import savedDocumentRoutes from "./routes/savedDocuments";
import announcementRoutes from "./routes/announcements";
import companiesRoutes from "./routes/companies";
import reminderRoutes, { fireDueReminders } from "./routes/reminders";
import { startBackupCron } from "./services/backupCron";
import { schedule as cronSchedule } from "node-cron";

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ──────────────────────────────────────────────────────────────
// crossOriginResourcePolicy: "cross-origin" so a separately hosted frontend can
// still load images/files served from this API.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5174")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Serve uploaded files — documents require a token, images stay public (see uploadsGuard)
app.use("/uploads", uploadsGuard, express.static(path.join(process.cwd(), "uploads")));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/projects/:id/expenses", expenseRoutes);
app.use("/api/projects/:id/sub-invoices", subInvoiceRoutes);
app.use("/api/projects/:id/purchase-orders", purchaseOrderRoutes);
app.use("/api/projects/:id/invoices", invoiceRoutes);
app.use("/api/projects/:id/documents", documentRoutes);
app.use("/api/projects/:id/procurement-rows", procurementRowRoutes);
app.use("/api/projects/:id/procurement", procurementRoutes);
app.use("/api/projects/:id/submittals", submittalRoutes);
app.use("/api/projects/:id/vendors", vendorRoutes);
app.use("/api/projects/:id/rfqs", rfqRoutes);
app.use("/api/projects/:id/procurement-pos", procurementPORoutes);
app.use("/api/projects/:id/shipments", shipmentRoutes);
app.use("/api/projects/:id/requests", projectRequestRoutes);
app.use("/api/projects/:id/technical-docs", technicalDocRoutes);
app.use("/api/projects/:id/tables", projectTableRoutes);
app.use("/api/projects/:id/sub-agreements", subAgreementRoutes);
app.use("/api/projects/:id/agreements", projectAgreementRouter);
app.use("/api/users/:uid/agreements", userAgreementRouter);
app.use("/api/general-agreements", generalAgreementRouter);
app.use("/api/agreement-templates", agreementTemplateRouter);
app.use("/api/projects/:id/saved-documents", savedDocumentRoutes);
app.use("/api/documents", allDocumentsRoutes);
app.use("/api/projects/:id/export", projectExportRoutes);
app.use("/api/projects/:id/image", projectImageRoutes);
app.use("/api/projects/:id/contract", projectContractRoutes);
app.use("/api/projects/:id/gallery", galleryRoutes);
app.use("/api/projects/:id/proposal-assets", proposalAssetRoutes);
app.use("/api/proposal-templates", proposalTemplateRoutes);
app.use("/api/projects/:id/proposal-docx", proposalDocxRoutes);
app.use("/api/resource-blocks", resourceBlockRoutes);
app.use("/api/projects/:id/proposal-revisions", proposalRevisionRoutes);
app.use("/api/rfp-documents", rfpDocumentRoutes);
app.use("/api/public", publicProjectsRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/resume", resumeRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/companies", companiesRoutes);
app.use("/api/users", userRoutes);

// Health check
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ── Error handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────────────
connectDB().then(async () => {
  // One-time migration: the "guest" role is now called "subcontractor".
  try {
    const UserModel = (await import("./models/User")).default;
    const result = await UserModel.updateMany({ role: "guest" } as Record<string, unknown>, { $set: { role: "subcontractor" } });
    if (result.modifiedCount) console.log(`🔁 Migrated ${result.modifiedCount} guest account(s) to subcontractor.`);
  } catch (err) {
    console.error("Subcontractor role migration failed:", err);
  }
  // Backfill: ensure every Employee-directory entry has an employee login account, so all
  // employees appear in admin User Management with their original empIds. Idempotent.
  try {
    const UserModel = (await import("./models/User")).default;
    const EmployeeModel = (await import("./models/Employee")).default;
    const bcrypt = (await import("bcryptjs")).default;
    const employees = await EmployeeModel.find().lean();
    let created = 0;
    for (const emp of employees) {
      if (!emp.empId) continue;
      if (await UserModel.findOne({ empId: emp.empId })) continue; // already has a login
      const base = String(emp.name || "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || emp.empId.toLowerCase();
      let email = `${base}@gt-usa.com`;
      if (await UserModel.findOne({ email })) email = `${emp.empId.toLowerCase()}@gt-usa.com`;
      if (await UserModel.findOne({ email })) continue; // can't derive a unique email — skip
      const password = await bcrypt.hash("Greentech2026", 12);
      await UserModel.create({ name: emp.name, email, password, role: "employee", empId: emp.empId });
      created++;
    }
    if (created) console.log(`👷 Backfilled ${created} employee login account(s) from the directory (default password: Greentech2026).`);
  } catch (err) {
    console.error("Employee backfill failed:", err);
  }
  // Seed built-in proposal templates (idempotent — upsert by name).
  try {
    const ProposalTemplate = (await import("./models/ProposalTemplate")).default;
    const STD = ["Standard Forms", "Table of Contents", "Executive Summary", "Technical Approach / Methodology", "Staffing Plan", "Organizational Chart", "Resumes", "Past Performance", "Certifications", "Appendix"];
    const builtins = [
      { name: "GT Standard Proposal", description: "GreenTech USA's standard technical proposal layout.", letterhead: "gt", sectionTitles: ["Executive Summary", "Technical Approach / Methodology", "Staffing Plan", "Past Performance", "Schedule", "Quality Control Plan", "Health and Safety Plan", "Appendix"] },
      { name: "GT-ACCU JV Proposal", description: "Joint-venture proposal (dual letterhead).", letterhead: "jv", sectionTitles: STD },
      { name: "UN Proposal", description: "United Nations submission layout.", letterhead: "gt", sectionTitles: ["Executive Summary", "Technical Approach / Methodology", "Organizational Chart", "Staffing Plan", "Past Performance", "Certifications", "Appendix"] },
      { name: "World Bank Proposal", description: "World Bank submission layout.", letterhead: "gt", sectionTitles: ["Executive Summary", "Technical Approach / Methodology", "Staffing Plan", "Past Performance", "Reference Letters", "Appendix"] },
      { name: "Embassy Proposal", description: "Embassy / Dept. of State submission layout.", letterhead: "gt", sectionTitles: ["Executive Summary", "Technical Approach / Methodology", "Standard Forms", "Staffing Plan", "Certifications", "Appendix"] },
      { name: "Commercial Proposal", description: "Commercial client proposal layout.", letterhead: "gt", sectionTitles: ["Executive Summary", "Technical Approach / Methodology", "Schedule", "Past Performance", "Appendix"] },
    ];
    for (const b of builtins) {
      await ProposalTemplate.updateOne(
        { name: b.name, builtin: true },
        { $set: { name: b.name, description: b.description, builtin: true, content: { letterhead: b.letterhead, sectionTitles: b.sectionTitles } } },
        { upsert: true }
      );
    }
    console.log(`📑 Proposal templates seeded (${builtins.length} built-ins).`);
  } catch (err) {
    console.error("Proposal template seeding failed:", err);
  }
  // Seed built-in agreement templates (idempotent — upsert by name). Everything is editable
  // on the agreement itself; these are just starting wording.
  try {
    const AgreementTemplate = (await import("./models/AgreementTemplate")).default;
    const NDA = "Both parties agree to keep confidential all business, technical, commercial and project information disclosed under this agreement, and not to disclose it to any third party without prior written consent, during the term of this agreement and for two (2) years thereafter.";
    const agBuiltins = [
      {
        name: "Employment Agreement", agreementType: "Employment", contextType: "user" as const, entityType: "" as const,
        sections: {
          scope: "The Employee is engaged in the role stated above and shall perform the duties customarily associated with that role, together with such other reasonable duties as the Company may assign.",
          terms: "1. Probation: the first 3 months of employment are probationary.\n2. Working hours follow the Company's standard schedule.\n3. Leave and benefits follow Company policy and applicable law.\n4. Either party may terminate with written notice per Company policy.\n5. Company property and records must be returned upon termination.",
          paymentConditions: "Salary as stated above, payable per the agreed pay schedule, less applicable deductions.",
          deliveryConditions: "",
          ndaText: NDA,
        },
      },
      {
        name: "Subcontractor Service Agreement", agreementType: "Service", contextType: "project" as const, entityType: "subcontractor" as const,
        sections: {
          scope: "The Subcontractor shall perform the works described above for the project stated, in accordance with the project specifications, applicable codes, and the reasonable instructions of GreenTech.",
          terms: "1. The Subcontractor provides all labour, supervision and tools unless agreed otherwise.\n2. Work must meet the project specifications; defective work will be remedied at the Subcontractor's cost.\n3. The Subcontractor complies with all site safety rules and applicable laws.\n4. Variations require prior written approval.\n5. Either party may terminate for material breach with written notice.",
          paymentConditions: "Payment against approved invoices/progress claims, per the offer/reference stated above. Net 30 days unless agreed otherwise.",
          deliveryConditions: "Works to be executed per the project schedule; delays must be notified in writing without delay.",
          ndaText: NDA,
        },
      },
      {
        name: "Vendor Supply Agreement", agreementType: "Supply", contextType: "project" as const, entityType: "vendor" as const,
        sections: {
          scope: "The Vendor shall supply the goods/materials described above for the project stated, conforming to the approved submittals and specifications.",
          terms: "1. Goods must be new, free from defects and fit for purpose.\n2. Non-conforming or damaged goods may be rejected and replaced at the Vendor's expense.\n3. The Vendor provides all certificates and documentation on request.\n4. Title and risk pass on delivery/pickup per the delivery conditions.\n5. Warranty: 12 months from delivery unless stated otherwise.",
          paymentConditions: "Net 30 days from receipt of a correct invoice, unless otherwise agreed in writing.",
          deliveryConditions: "Delivery per the agreed schedule and shipping instructions; partial deliveries only with prior approval.",
          ndaText: NDA,
        },
      },
      {
        name: "General Service Agreement", agreementType: "Service", contextType: "general" as const, entityType: "" as const,
        sections: {
          scope: "The Contractor shall perform the works/services described above for the Company, in a professional and workmanlike manner and in accordance with all applicable standards.",
          terms: "1. The Contractor provides all labour, materials, supervision and equipment unless agreed otherwise.\n2. Work must meet the agreed specification; defective work will be remedied at the Contractor's cost.\n3. The Contractor complies with all applicable laws and holds the required licences and insurance.\n4. Variations require prior written approval.\n5. Either party may terminate for material breach with written notice.",
          paymentConditions: "Payment against approved invoices, Net 30 days from receipt of a correct invoice, unless otherwise agreed in writing.",
          deliveryConditions: "Works/services to be delivered per the agreed schedule; delays must be notified in writing without delay.",
          ndaText: NDA,
        },
      },
      {
        name: "Partner Agreement", agreementType: "Partnership", contextType: "project" as const, entityType: "partner" as const,
        sections: {
          scope: "The parties shall jointly execute the project stated above as a joint venture, each contributing the resources, personnel and expertise described herein.",
          terms: "1. Project leadership and share split as stated in the project's joint-venture record.\n2. Each party bears its own costs unless agreed otherwise.\n3. Decisions materially affecting the project require both parties' consent.\n4. Neither party may assign its interest without the other's written consent.\n5. Disputes are first resolved amicably between senior representatives.",
          paymentConditions: "Revenue and cost sharing per the agreed joint-venture split; reconciliations monthly unless agreed otherwise.",
          deliveryConditions: "",
          ndaText: NDA,
        },
      },
    ];
    for (const t of agBuiltins) {
      await AgreementTemplate.updateOne(
        { name: t.name, builtin: true },
        { $set: { ...t, builtin: true } },
        { upsert: true }
      );
    }
    console.log(`🤝 Agreement templates seeded (${agBuiltins.length} built-ins).`);
  } catch (err) {
    console.error("Agreement template seeding failed:", err);
  }

  app.listen(PORT, () => {
    console.log(`🚀 API server running on http://localhost:${PORT}`);
    startBackupCron();
    // Reminders fall due at any minute, so sweep every minute (cheap indexed query).
    cronSchedule("* * * * *", async () => {
      try { await fireDueReminders(); }
      catch (err) { console.error("Reminder sweep failed:", err); }
    });
    // Daily agreements expiry sweep — 08:30 server time (agreements past endDate → Expired).
    cronSchedule("30 8 * * *", async () => {
      try {
        const n = await expireOverdueAgreements();
        if (n) console.log(`🤝 Marked ${n} agreement(s) as Expired.`);
      } catch (err) { console.error("Agreement expiry sweep failed:", err); }
    });
  });
}).catch((err) => {
  // A clear, one-line reason instead of an unhandled-rejection topology dump. The usual cause
  // in production is the database host not being reachable — check MONGO_URI and that the host's
  // IP is allowed in MongoDB Atlas → Network Access (0.0.0.0/0 works for a start).
  console.error("❌ Server failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
