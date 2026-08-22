// CR-P-45 — the categorized list of agreement types used by the General Agreements type picker.
// Rendered as <optgroup>s, plus a "Custom…" option that lets the user type any other type.
export const AGREEMENT_TYPE_GROUPS: { group: string; types: string[] }[] = [
  {
    group: "General / Commercial",
    types: [
      "Service Agreement", "Master Service Agreement (MSA)", "Professional Services Agreement",
      "Consulting Agreement", "Independent Contractor Agreement", "Framework Agreement",
      "Memorandum of Understanding (MOU)", "Letter of Agreement (LOA)", "Cooperation Agreement",
      "Partnership Agreement", "Teaming Agreement", "Joint Venture Agreement (JVA)",
      "Subcontract Agreement", "Subconsultant Agreement",
    ],
  },
  {
    group: "Procurement / Vendors",
    types: [
      "Vendor Agreement", "Supplier Agreement", "Purchase Agreement", "Equipment Supply Agreement",
      "Supply & Installation Agreement", "Procurement Agreement",
    ],
  },
  {
    group: "Rental / Equipment",
    types: [
      "Lease Agreement", "Maintenance Agreement", "Annual Maintenance Contract (AMC)", "Warranty Agreement",
    ],
  },
  {
    group: "Construction / Projects",
    types: [
      "Construction Agreement", "Design Agreement", "Design-Build Agreement", "Engineering Services Agreement",
      "Installation Agreement", "Testing & Commissioning Agreement", "Operations & Maintenance (O&M) Agreement",
      "Site Services Agreement", "Technical Support Agreement", "Local Representative / Local Partner Agreement",
    ],
  },
  {
    group: "Confidentiality / Business Development",
    types: [
      "Non-Disclosure Agreement (NDA)", "Mutual NDA", "Confidentiality Agreement", "Non-Circumvention Agreement",
      "Non-Compete Agreement", "Exclusivity Agreement", "Teaming & Confidentiality Agreement", "Letter of Intent (LOI)",
    ],
  },
  {
    group: "Employment / Personnel",
    types: [
      "Employment Agreement", "Contractor Agreement", "Temporary Personnel Agreement", "Internship Agreement",
      "Consultant Agreement", "Employee Confidentiality & IP Agreement",
    ],
  },
  {
    group: "Financial / Administrative",
    types: [
      "Loan Agreement", "Advance Payment Agreement", "Payment Plan Agreement", "Cost-Sharing Agreement",
      "Revenue-Sharing Agreement", "Management Fee Agreement", "Intercompany Agreement",
    ],
  },
  {
    group: "Changes / Closeout",
    types: [
      "Contract Amendment", "Agreement Addendum", "Change Order", "Contract Modification", "Extension Agreement",
      "Renewal Agreement", "Settlement Agreement", "Mutual Termination Agreement", "Release & Waiver Agreement",
      "Custom Agreement",
    ],
  },
];

export const AGREEMENT_TYPES_FLAT: string[] = AGREEMENT_TYPE_GROUPS.flatMap((g) => g.types);
