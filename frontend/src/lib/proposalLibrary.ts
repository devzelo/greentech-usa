import type { ProposalPageType } from "./api";

/**
 * The client's Section Library and Appendix / Attachment Library ("Proposal Builder Requirement",
 * sections 2 and 3). "The solicitation/RFP always controls the final structure. The predefined
 * sections are simply a library from which the proposal writer can select." Every title stays
 * editable once added.
 *
 * `key` is a stable identity for each library entry, stored on the section it creates, so the
 * future AI assistant can map an RFP's required sections onto the library and find what a proposal
 * already has, regardless of how the writer renamed it.
 */
export interface LibraryItem {
  key: string;
  title: string;
  hint: string;                 // what goes in it (shown in the picker and in the section editor)
  pageType?: ProposalPageType;  // default page type when added (designed unless stated)
}

/** Items 1 to 3 of the client's library are built into the proposal as their own tabs. */
export const BUILT_IN_SECTIONS = ["Cover Page", "Cover Letter", "Table of Contents"];

export const SECTION_LIBRARY: LibraryItem[] = [
  { key: "executive-summary", title: "Executive Summary", hint: "High-level summary of GT/JV's understanding, qualifications, proposed solution, key strengths, relevant experience and major advantages." },
  { key: "understanding-requirements", title: "Understanding of Requirements / Technical Capability", hint: "Understanding of the SOW/PWS, project objectives, existing conditions, technical requirements, constraints, challenges, applicable standards and expected results." },
  { key: "technical-approach", title: "Technical Approach / Work Plan / Methodology", hint: "How GT/JV will execute the technical scope. Often split into subsections by phase, system, discipline or activity." },
  { key: "project-management-plan", title: "Project Management Plan / Management Approach", hint: "How the project is managed: coordination, communication, reporting, project controls, documentation, Government interaction, decision-making and subcontractor management." },
  { key: "organizational-structure", title: "Organizational Structure", hint: "Team organization and reporting relationships, with an organizational chart: GT/JV, project management, site personnel, subcontractors, design firms, manufacturers and corporate support." },
  { key: "key-personnel", title: "Key Personnel / Staffing Plan", hint: "The proposed key personnel: positions, responsibilities, qualifications, experience, availability and role on the project." },
  { key: "resumes", title: "Resumes of Key Personnel", hint: "Detailed resumes required by the solicitation: the GT/JV-designed resume, or a required Government form such as SF 330 (set the page type to Government form and upload it)." },
  { key: "personnel-certifications", title: "Personnel Qualifications / Certifications", hint: "Professional licences, PE registrations, CQM-C, OSHA, EM 385, First Aid/CPR, PMP, manufacturer and trade certifications.", pageType: "external" },
  { key: "staffing-mobilization", title: "Staffing / Manpower / Mobilization Plan", hint: "Staffing levels, personnel deployment, local and expatriate personnel, mobilization, availability, replacement personnel and manpower through the project." },
  { key: "performance-schedule", title: "Performance Schedule / Project Schedule", hint: "The proposed project schedule and milestones. Upload schedules from Primavera P6, Microsoft Project, Excel or PDF.", pageType: "external" },
  { key: "schedule-narrative", title: "Schedule Narrative", hint: "Schedule assumptions, milestones, critical path, sequencing, procurement lead times, calendars, schedule control, resource allocation and delay mitigation." },
  { key: "design-approach", title: "Design Approach / Design Management Plan", hint: "For design-build or A/E projects: design process and phases, disciplines, coordination, reviews, QA/QC, BIM/CAD, code compliance, Government reviews and construction documents." },
  { key: "construction-approach", title: "Construction Approach / Execution Plan", hint: "How construction is performed: site preparation, demolition, civil/structural, MEP, equipment installation, phasing, testing, commissioning and closeout." },
  { key: "site-logistics", title: "Site Logistics / Mobilization Plan", hint: "Site access, staging, laydown areas, temporary facilities, material storage, equipment and cranes, deliveries, personnel movement, security restrictions and demobilization." },
  { key: "quality-control", title: "Quality Control / Quality Management", hint: "The QC system and organization, inspections, testing, three-phase control where applicable, submittal control, deficiencies, corrective actions, documentation and subcontractor QC." },
  { key: "safety-health", title: "Safety & Health Approach", hint: "Safety management, SSHO responsibilities, OSHA/EM 385 where applicable, PPE, AHA/JHA, LOTO, confined spaces, emergency procedures and subcontractor safety." },
  { key: "environmental", title: "Environmental / Sustainability Approach", hint: "Environmental compliance, waste management, hazardous materials, pollution prevention, sustainability, energy efficiency and water conservation." },
  { key: "past-performance", title: "Past Performance", hint: "What the Government needs to evaluate previous contract performance: relevant contracts, agencies, contract numbers, values, dates, POCs, relevance and results." },
  { key: "relevant-experience", title: "Relevant Project Experience / Corporate Experience", hint: "Similar completed or ongoing projects showing GT/JV's technical and organizational experience. Kept separate from Past Performance, which solicitations may evaluate separately." },
  { key: "project-references", title: "Project References", hint: "A concise table of relevant clients and projects: project name, agency/client, contract number, value, dates, POC, email/phone and location." },
  { key: "cpars", title: "CPARS / Performance Evaluations", hint: "Government performance evaluations, CPARS, client evaluations, performance scorecards and similar records.", pageType: "external" },
  { key: "subcontracting", title: "Subcontracting / Performance of Work", hint: "Which work GT/JV performs and which subcontractors perform, with scopes and percentages where required." },
  { key: "teaming-partners", title: "Subcontractor / Teaming Partner Qualifications", hint: "Qualifications, capabilities, experience, personnel, certifications and relevant projects of major subcontractors, design firms, specialty contractors and teaming partners." },
  { key: "small-business", title: "Small Business Participation / Subcontracting Plan", hint: "Small-business participation, subcontracting goals, categories, proposed firms, percentages and related Government requirements." },
  { key: "recruitment-tcn", title: "Recruitment / Local Nationals / Third Country Nationals (TCN)", hint: "Recruiting and managing local or third-country personnel overseas: procedures, labor practices, deployment, housing and transportation where applicable, and compliance." },
  { key: "ctip", title: "Combating Trafficking in Persons (CTIP)", hint: "The CTIP compliance narrative or plan: recruitment controls, employee awareness, reporting, subcontractor compliance and the related FAR requirements." },
  { key: "local-registration", title: "Local Registration / Licensing / Authorization", hint: "Authorization to do business in the country/project location: local registration, licences, tax registration, permits and work permits." },
  { key: "security-access", title: "Security / Site Access Approach", hint: "Personnel vetting, badging, site access, controlled areas, security coordination, escorts and sensitive information." },
  { key: "procurement-plan", title: "Procurement / Material & Equipment Plan", hint: "Major equipment and material procurement: suppliers, manufacturers, lead times, submittals, factory testing, shipping, storage, spare parts and delivery to site." },
  { key: "equipment-data", title: "Equipment / Materials / Product Data", hint: "Proposed equipment and materials: manufacturer, model, capacity, technical compliance, specifications, certifications, warranties and product information." },
  { key: "testing-commissioning", title: "Testing, Commissioning & Start-Up Plan", hint: "Factory and field testing, calibration, startup, functional and performance testing, commissioning, Government witnessing and correction of deficiencies." },
  { key: "training-handover", title: "Training & Handover Plan", hint: "Government/operator training, demonstrations, O&M manuals, as-built drawings, warranties, spare parts, final documentation and turnover." },
  { key: "risk-management", title: "Risk Management / Risk Mitigation", hint: "Major technical, schedule, procurement, logistics, labor, security, site, design and supply-chain risks, with mitigation. Add a risk register table." },
  { key: "value-engineering", title: "Value Engineering / Innovation", hint: "Innovations, alternatives or improvements to cost, schedule, constructability, reliability, maintainability, efficiency or lifecycle performance." },
  { key: "compliance-matrix", title: "Compliance Matrix", hint: "A table linking each solicitation requirement to the response: RFP Requirement, RFP Reference, Proposal Section, Page Number, Compliance Status." },
];

const GOV: ProposalPageType = "government";

/**
 * Step 7 (items 107, 108) - sections of a financial volume, from the client's samples. Registrations,
 * bonds and insurance are in the Appendix Library (appendices A, B, C, D close the volume).
 */
export const FINANCIAL_SECTION_LIBRARY: LibraryItem[] = [
  { key: "fin-price-form", title: "Client Price Schedule / Bid Form", hint: "The client's standard pricing form (bid schedule, CLIN sheet, price proposal form), usually filled in Excel or Word, saved as PDF and uploaded as it is.", pageType: GOV },
  { key: "fin-sf-offer", title: "SF 1442 / SF 33 / SF 18 (Solicitation, Offer and Award)", hint: "The signed standard-form offer page from the solicitation.", pageType: GOV },
  { key: "fin-price-narrative", title: "Price Narrative / Basis of Estimate", hint: "How the price was built: labour, materials, equipment, subcontracts, travel, overhead, profit, escalation and currency." },
  { key: "fin-price-breakdown", title: "Price Breakdown / Cost Summary", hint: "The breakdown behind the price schedule: by CLIN, phase, trade or cost element." },
  { key: "fin-assumptions", title: "Pricing Assumptions & Exclusions", hint: "What the price includes and excludes, and the client-furnished items it relies on." },
  { key: "fin-payment-terms", title: "Payment Terms & Offer Validity", hint: "Payment milestones, invoicing, retention, currency and how long the offer stays valid." },
  { key: "fin-labour-rates", title: "Labour & Emergency Rates", hint: "Hourly or daily rates by position for additional or emergency work, with overtime and call-out terms." },
  { key: "fin-reps-certs", title: "Representations & Certifications", hint: "FAR / DFARS representations and certifications, or the SAM.gov reps and certs printout.", pageType: GOV },
  { key: "fin-tax-forms", title: "Tax Forms (W-9 / W-14 / VAT)", hint: "W-9, W-14 or local VAT / tax registration forms the solicitation requires.", pageType: GOV },
  { key: "fin-quotations", title: "Subcontractor & Vendor Quotations", hint: "Supporting quotations from subcontractors, suppliers and manufacturers.", pageType: "external" },
  { key: "fin-financial-capability", title: "Financial Capability / Bank Reference", hint: "Bank reference letter, line of credit or audited statements showing financial capacity.", pageType: "external" },
];
export const FINANCIAL_BUILT_INS = ["Cover Page", "Cover Letter", "Table of Contents", "Price Schedule (our own table)"];

export const APPENDIX_LIBRARY: LibraryItem[] = [
  { key: "appx-sam", title: "SAM.gov Registration", hint: "The current SAM.gov entity registration printout." },
  { key: "appx-uei-cage", title: "UEI / CAGE Information", hint: "UEI and CAGE code records." },
  { key: "appx-company-registration", title: "Company Registration / Certificate of Good Standing", hint: "Articles, registration certificate or certificate of good standing." },
  { key: "appx-business-licenses", title: "Business Licenses", hint: "Current business licences." },
  { key: "appx-local-registration", title: "Local Country Registration / Authorization", hint: "Registration or authorization to operate in the project country." },
  { key: "appx-jv-agreement", title: "JV Agreement", hint: "The signed (and notarized, if required) joint venture agreement." },
  { key: "appx-teaming-agreement", title: "Teaming Agreement", hint: "Signed teaming agreement(s)." },
  { key: "appx-subcontractor-agreements", title: "Subcontractor Agreements / Letters of Commitment", hint: "Subcontractor agreements or letters of commitment." },
  { key: "appx-company-profile", title: "Company Profile / Capability Statement", hint: "GT/JV company profile or capability statement." },
  { key: "appx-partner-profiles", title: "Subcontractor / Partner Company Profiles", hint: "Profiles of subcontractors and partner companies." },
  { key: "appx-resumes", title: "Key Personnel Resumes", hint: "Resumes of the proposed key personnel." },
  { key: "appx-sf330", title: "SF 330 Forms", hint: "SF 330 architect-engineer qualifications (Part I / Part II), as the Government form.", pageType: GOV },
  { key: "appx-licenses-certifications", title: "Professional Licenses & Certifications", hint: "PE licences, professional registrations and certifications." },
  { key: "appx-training-certificates", title: "Personnel Training Certificates", hint: "OSHA, EM 385, CQM-C, First Aid/CPR and other training certificates." },
  { key: "appx-ppq", title: "Past Performance Questionnaires (PPQ)", hint: "Completed past performance questionnaires on the Government's form.", pageType: GOV },
  { key: "appx-cpars", title: "CPARS / Government Performance Evaluations", hint: "CPARS reports and other Government performance evaluations." },
  { key: "appx-reference-letters", title: "Client Reference / Recommendation Letters", hint: "Client reference, recommendation or credit letters." },
  { key: "appx-completion-certificates", title: "Project Completion Certificates", hint: "Certificates of completion / acceptance from clients." },
  { key: "appx-experience-sheets", title: "Relevant Project / Experience Sheets", hint: "Project data sheets for relevant experience." },
  { key: "appx-cpm-schedule", title: "Performance / CPM Schedule", hint: "The detailed CPM schedule (Primavera P6, MS Project) export." },
  { key: "appx-org-chart", title: "Organizational Chart", hint: "The project organizational chart." },
  { key: "appx-quality-iso", title: "Quality / ISO Certifications", hint: "ISO 9001 and other quality certifications." },
  { key: "appx-safety-records", title: "Safety Records / OSHA / EMR Information", hint: "Safety statistics, OSHA logs and EMR letters." },
  { key: "appx-insurance", title: "Insurance Certificates", hint: "Current certificates of insurance (general liability and others)." },
  { key: "appx-dba", title: "DBA Insurance Documentation", hint: "Defense Base Act insurance binder or certificate." },
  { key: "appx-bonding", title: "Bonding / Surety Letter / Bonding Capacity", hint: "Surety letter, bank letters of credit or bonding capacity evidence." },
  { key: "appx-manufacturer-authorization", title: "Manufacturer Authorization Letters", hint: "Manufacturer authorization or dealership letters." },
  { key: "appx-supplier-commitment", title: "Manufacturer/Supplier Commitment Letters", hint: "Supplier or manufacturer supply-commitment letters." },
  { key: "appx-datasheets", title: "Technical Datasheets / Catalog Cuts", hint: "Product datasheets and catalog cuts." },
  { key: "appx-equipment-tests", title: "Equipment Certifications / Test Reports", hint: "Equipment certifications, factory test reports and certificates of conformity." },
  { key: "appx-product-compliance", title: "Product Compliance Documentation", hint: "Evidence of compliance with the specified standards (e.g. TAA, BABA, NSF)." },
  { key: "appx-drawings", title: "Drawings / Concept Drawings / Technical Sketches", hint: "Drawings, concept designs and technical sketches." },
  { key: "appx-government-forms", title: "Required Government Forms", hint: "Forms the solicitation requires (e.g. SF 1442, SF 1449), completed on the Government's form.", pageType: GOV },
  { key: "appx-reps-certs", title: "Solicitation Representations / Certifications", hint: "The completed representations and certifications (e.g. Section K).", pageType: GOV },
  { key: "appx-amendments", title: "Signed Solicitation Amendments / Acknowledgments", hint: "Signed SF 30 amendments and acknowledgments.", pageType: GOV },
  { key: "appx-personnel-commitment", title: "Key Personnel Letters of Commitment / Availability", hint: "Letters confirming key personnel commitment and availability." },
  { key: "appx-subcontractor-intent", title: "Subcontractor Letters of Intent", hint: "Letters of intent from proposed subcontractors." },
  { key: "appx-other", title: "Other Supporting Documents", hint: "Any other supporting document the solicitation asks for." },
];

/** The three page types every proposal page falls into (spec section 4, "very important"). */
export const PAGE_TYPES: Array<{ v: ProposalPageType; label: string; short: string; hint: string }> = [
  { v: "designed", label: "GT/JV designed content", short: "Designed", hint: "Our pages: letterhead, header, footer, fonts, section title and page number." },
  { v: "government", label: "Government form", short: "Gov. form", hint: "An official Government form or provided template, inserted exactly as uploaded. Never redesigned or placed on our letterhead." },
  { v: "external", label: "External document", short: "External", hint: "A document from another organization (datasheet, insurance, licence, CPARS, letter, drawing), inserted as uploaded, optionally after a GT/JV separator page." },
  // CR 202 - our own file that must print exactly as it is: a signed letter, a scan, a brochure,
  // a drawing, a spreadsheet exported to PDF. Never redesigned onto the letterhead.
  { v: "custom", label: "Custom attachment", short: "Custom", hint: "Any other file you want inserted exactly as it is (a signed letter, a scan, a brochure, a drawing), optionally after a GT/JV separator page." },
];

export const isOriginalPageType = (t?: ProposalPageType) => t === "government" || t === "external" || t === "custom";
