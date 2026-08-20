// Maps a ProjectDocument `section` string to a human-readable hierarchical path:
//   project → tab → subtab → section
// Used by the Documents module directory browser and the Submittals "Choose from
// Project Documents" picker so both present the same organized tree.

export type DocPath = {
  tabId: string;      // stable id of the owning workspace tab
  tab: string;        // tab label, e.g. "Technical Docs"
  subtab?: string;    // optional middle level, e.g. a subcontractor or proposal name
  section: string;    // leaf label, e.g. "Drawings"
};

// Static, well-known section ids → their leaf label (within a tab).
const STATIC: Record<string, { tabId: string; tab: string; section: string; subtab?: string }> = {
  // Project Info
  "project-info-rfp": { tabId: "project-info", tab: "Project Info", subtab: "RFP", section: "Solicitation Documents" },
  "project-info-prebid": { tabId: "project-info", tab: "Project Info", subtab: "RFP", section: "Pre-Bid & Site Visit" },
  "project-info-qa": { tabId: "project-info", tab: "Project Info", subtab: "RFP", section: "Questions & Answers" },
  "project-info-communications": { tabId: "project-info", tab: "Project Info", subtab: "RFP", section: "Client Communications" },
  "project-info-award": { tabId: "project-info", tab: "Project Info", section: "Award Documents" },
  "project-info-ntp": { tabId: "project-info", tab: "Project Info", section: "NTPs" },
  "project-info-scope": { tabId: "project-info", tab: "Project Info", section: "Scope of Work" },
  "project-info-specifications": { tabId: "project-info", tab: "Project Info", section: "Specifications" },
  "project-info-amendments": { tabId: "project-info", tab: "Project Info", section: "Amendments" },
  "project-info-change-orders": { tabId: "project-info", tab: "Project Info", section: "Change Orders" },
  "project-info-bidding": { tabId: "project-info", tab: "Project Info", section: "Bidding Documents" },
  "project-info-other": { tabId: "project-info", tab: "Project Info", section: "Other Project Docs" },
  "project-info": { tabId: "project-info", tab: "Project Info", section: "General" },
  // Proposals
  "proposals-technical": { tabId: "proposals", tab: "Proposals", subtab: "Technical Proposal", section: "Attachments" },
  "proposals-financial": { tabId: "proposals", tab: "Proposals", subtab: "Financial Proposal", section: "Attachments" },
  // Project Management
  "pm-schedules": { tabId: "pm", tab: "Project Management", section: "Schedules" },
  "pm-meeting-minutes": { tabId: "pm", tab: "Project Management", section: "Meeting Minutes" },
  "pm-progress-reports": { tabId: "pm", tab: "Project Management", section: "Progress Reports" },
  "pm-site-data": { tabId: "pm", tab: "Project Management", section: "Site Data" },
  "pm-closeout": { tabId: "pm", tab: "Project Management", section: "Closeout Documents" },
  // Technical Docs
  "tech-drawings": { tabId: "tech-docs", tab: "Technical Docs", section: "Drawings" },
  "tech-reports": { tabId: "tech-docs", tab: "Technical Docs", section: "Technical Reports" },
  "tech-lab-results": { tabId: "tech-docs", tab: "Technical Docs", section: "Lab Test Results" },
  "tech-boq": { tabId: "tech-docs", tab: "Technical Docs", section: "Bill of Quantities (BOQ)" },
  // Legal
  "legal-office-reg": { tabId: "legal", tab: "Legal Docs", section: "Local Office Registration" },
  "legal-iloc": { tabId: "legal", tab: "Legal Docs", section: "ILOC (Irrevocable Letter of Credit)" },
  "legal-bond": { tabId: "legal", tab: "Legal Docs", section: "Bond Documents" },
  "legal-insurance": { tabId: "legal", tab: "Legal Docs", section: "Insurance Certificates" },
  "legal-tax": { tabId: "legal", tab: "Legal Docs", section: "Tax Documents" },
  // Purchase Orders / Procurement documents (POs live under Procurement now).
  "po-documents": { tabId: "procurement", tab: "Procurement & Submittals", subtab: "Purchase Orders", section: "PO Documents" },
  "procurement-rfq": { tabId: "procurement", tab: "Procurement & Submittals", subtab: "RFQs", section: "RFQ Documents" },
  "procurement-po": { tabId: "procurement", tab: "Procurement & Submittals", subtab: "Purchase Orders", section: "PO Documents" },
  "procurement-quotes": { tabId: "procurement", tab: "Procurement & Submittals", subtab: "Quotes", section: "Vendor Quotes" },
  "procurement-submittals": { tabId: "procurement", tab: "Procurement & Submittals", subtab: "Submittals", section: "Submittal Packages" },
  // Finances → Invoices (CR-P-30: Expenses / Invoice Sent / Invoice Received live under Finances).
  "invoice-sent": { tabId: "finances", tab: "Finances", subtab: "Invoice Sent", section: "Invoice Documents" },
  "invoice-received": { tabId: "finances", tab: "Finances", subtab: "Invoice Received", section: "Bill Documents" },
  "invoice-sent-documents": { tabId: "finances", tab: "Finances", subtab: "Invoice Sent", section: "Invoice Documents" },
  "invoice-received-documents": { tabId: "finances", tab: "Finances", subtab: "Invoice Received", section: "Bill Documents" },
  // Closeout (under Project Management).
  "closeout-client-response": { tabId: "pm", tab: "Project Management", subtab: "Closeout", section: "Client Response" },
};

export function sectionToPath(section: string): DocPath {
  if (!section) return { tabId: "other", tab: "Other", section: "Uncategorized" };
  const stat = STATIC[section];
  if (stat) return stat;

  // Shipment: `procurement-shipment-<n>`
  const ship = section.match(/^procurement-shipment-(.+)$/);
  if (ship) return { tabId: "procurement", tab: "Procurement & Submittals", subtab: "Shipment", section: `Shipment ${ship[1]}` };

  // Subcontractor per-tab files: `subcontractor-<subId>-tab-<tabId>`
  const sub = section.match(/^subcontractor-(.+?)-tab-(.+)$/);
  if (sub) return { tabId: "subs", tab: "Subcontractors & Employees", subtab: "Subcontractor", section: `Files (${sub[2]})` };
  if (section.startsWith("subcontractor-")) return { tabId: "subs", tab: "Subcontractors & Employees", section: section.slice("subcontractor-".length) };
  if (section.startsWith("subinvoice-")) return { tabId: "subs", tab: "Subcontractors & Employees", subtab: "Sub-invoices", section: section.slice("subinvoice-".length) };
  // Partner (JV) per-tab files: `partner-<tabId>`
  if (section.startsWith("partner-")) return { tabId: "subs", tab: "Subcontractors & Employees", subtab: "Partner (JV)", section: `Files (${section.slice("partner-".length)})` };
  // Closeout: `closeout-<something>`
  if (section.startsWith("closeout-")) return { tabId: "pm", tab: "Project Management", subtab: "Closeout", section: section.slice("closeout-".length).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) };

  // Custom tabs: `custom-<tabId>` or `custom-<tabId>-field-<fieldId>`
  if (section.startsWith("custom-")) {
    let rest = section.slice("custom-".length);
    const fi = rest.indexOf("-field-");
    const field = fi !== -1 ? rest.slice(fi + "-field-".length) : "";
    if (fi !== -1) rest = rest.slice(0, fi);
    return { tabId: rest, tab: "Custom Tab", subtab: `Tab ${rest}`, section: field ? `Field ${field}` : "Files" };
  }

  // Prefix fallbacks for any remaining dynamic sids.
  const prefixes: [string, string, string][] = [
    ["pm-", "pm", "Project Management"],
    ["tech-", "tech-docs", "Technical Docs"],
    ["legal-", "legal", "Legal Docs"],
    ["proposals-", "proposals", "Proposals"],
    ["project-info", "project-info", "Project Info"],
    ["po-", "procurement", "Procurement & Submittals"],
    ["procurement-", "procurement", "Procurement & Submittals"],
    ["invoice-", "finances", "Finances"],
    ["expense", "finances", "Finances"],
  ];
  for (const [pre, tabId, tab] of prefixes) {
    if (section.startsWith(pre)) {
      const leaf = section.slice(pre.length).replace(/-/g, " ").trim();
      return { tabId, tab, section: leaf ? leaf.replace(/\b\w/g, (c) => c.toUpperCase()) : "General" };
    }
  }
  return { tabId: "other", tab: "Other", section: section.replace(/-/g, " ") };
}
