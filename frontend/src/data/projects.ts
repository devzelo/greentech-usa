export type ProjectStatus = "Ongoing" | "Pending" | "Completed" | "Draft";

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  owner: string;
  published: boolean;
  progress: number;
  location: string;
  category: string;
  startDate: string;
  endDate: string;
  fiscal: string;
  compliance: string;
  desc: string;
  image: string;
  budget: number;
  disciplines: string[];
  team: { name: string; role: string; clearance: string; avatar: string }[];
  milestones: { label: string; status: "Complete" | "Ongoing" | "Pending"; date: string }[];
  specs: { label: string; value: string }[];
  activity: { type: "status" | "upload" | "comment" | "milestone"; user: string; text: string; time: string }[];
  docs: { id: number; name: string; type: string; size: string; date: string }[];
}

export const PROJECTS: Record<string, Project> = {
  "PROJ-102": {
    id: "PROJ-102",
    name: "Potable Water Upgrade - Ghana",
    status: "Ongoing",
    owner: "John Partner",
    published: true,
    progress: 65,
    location: "Cape Coast, Ghana",
    category: "Water Treatment",
    startDate: "Jan 15, 2026",
    endDate: "Nov 12, 2026",
    fiscal: "USAID Regional Grant",
    compliance: "Passed Internal Audit",
    desc: "Modernization of the Cape Coast municipal water distribution network. Primary goals include installation of zero-loss pressure management valves and integration of a real-time SCADA monitoring system. This project serves as a pilot for subsequent regional expansions.",
    image: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&q=80&w=1200",
    budget: 3200000,
    disciplines: ["Environmental Engineering", "Civil Engineering", "Water Resources", "SCADA / Controls", "Geotechnical"],
    team: [
      { name: "John Partner", role: "Project Lead", clearance: "Admin", avatar: "https://i.pravatar.cc/100?u=1" },
      { name: "Sara Mensah", role: "Site Engineer", clearance: "Editor", avatar: "https://i.pravatar.cc/100?u=2" },
      { name: "Kwame Ofori", role: "Field Consultant", clearance: "Viewer", avatar: "https://i.pravatar.cc/100?u=3" },
    ],
    milestones: [
      { label: "Site Survey & Soil Analysis", status: "Complete", date: "Feb 10, 2026" },
      { label: "Material Procurement & Import (Stage 1)", status: "Ongoing", date: "May 30, 2026" },
      { label: "Grid Integration & Testing", status: "Pending", date: "Aug 15, 2026" },
      { label: "SCADA Commissioning", status: "Pending", date: "Oct 01, 2026" },
    ],
    specs: [
      { label: "Treatment Capacity", value: "12,000 m³/day" },
      { label: "Pressure Class", value: "PN16 (nominal)" },
      { label: "Pipeline Material", value: "HDPE / Ductile Iron" },
      { label: "Monitoring Protocol", value: "SCADA v4.2 — IoT Enabled" },
      { label: "Compliance Standard", value: "EPA Method 200.7, ISO 24512" },
      { label: "Design Life", value: "25 years" },
    ],
    activity: [
      { type: "milestone", user: "John Partner", text: "Marked 'Site Survey & Soil Analysis' as Complete", time: "2 hours ago" },
      { type: "upload", user: "Sara Mensah", text: "Uploaded Ghana_Site_Survey_Final.pdf", time: "5 hours ago" },
      { type: "comment", user: "John Partner", text: "Stage 1 procurement approved by USAID — moving to vendor selection phase.", time: "1 day ago" },
      { type: "status", user: "System", text: "Project status changed from Pending → Ongoing", time: "2 days ago" },
      { type: "upload", user: "Kwame Ofori", text: "Uploaded Accra_WTP_Floorplan.dwg", time: "3 days ago" },
    ],
    docs: [
      { id: 1, name: "Ghana_Site_Survey_Final.pdf", type: "pdf", size: "12.4 MB", date: "May 1, 2026" },
      { id: 2, name: "Accra_WTP_Floorplan.dwg", type: "cad", size: "45.1 MB", date: "Apr 28, 2026" },
    ],
  },
  "PROJ-105": {
    id: "PROJ-105",
    name: "Waste Management Plan - VA",
    status: "Pending",
    owner: "Sara M.",
    published: true,
    progress: 10,
    location: "Richmond, Virginia, USA",
    category: "Wastewater",
    startDate: "Mar 01, 2026",
    endDate: "Dec 31, 2026",
    fiscal: "State Environmental Fund",
    compliance: "Pending Review",
    desc: "Comprehensive solid and liquid waste management framework for the Richmond municipal district. Includes routing optimization, treatment facility upgrades, and community impact assessments aligned with Virginia DEQ standards.",
    image: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&q=80&w=1200",
    budget: 850000,
    disciplines: ["Wastewater Engineering", "Environmental Science", "Civil Engineering", "Public Health"],
    team: [
      { name: "Sara M.", role: "Project Lead", clearance: "Admin", avatar: "https://i.pravatar.cc/100?u=4" },
      { name: "Mike R.", role: "Environmental Analyst", clearance: "Editor", avatar: "https://i.pravatar.cc/100?u=5" },
    ],
    milestones: [
      { label: "Baseline Assessment & Stakeholder Survey", status: "Ongoing", date: "Jun 15, 2026" },
      { label: "Draft Management Plan Submission", status: "Pending", date: "Aug 30, 2026" },
      { label: "VA DEQ Review & Approval", status: "Pending", date: "Oct 15, 2026" },
    ],
    specs: [
      { label: "Waste Volume (Daily)", value: "~850 tonnes" },
      { label: "Coverage Area", value: "Richmond Metro Region" },
      { label: "Regulatory Body", value: "Virginia DEQ" },
      { label: "Treatment Method", value: "MRF + Anaerobic Digestion" },
      { label: "Compliance Standard", value: "40 CFR Part 258 — RCRA Subtitle D" },
      { label: "Est. Cost Reduction", value: "~22% over 5 years" },
    ],
    activity: [
      { type: "status", user: "Sara M.", text: "Project registered and moved to Pending status", time: "5 hours ago" },
      { type: "upload", user: "Sara M.", text: "Uploaded Site_Photos_Batch_A.zip", time: "1 day ago" },
    ],
    docs: [
      { id: 4, name: "Site_Photos_Batch_A.zip", type: "archive", size: "850 MB", date: "May 5, 2026" },
    ],
  },
  "PROJ-098": {
    id: "PROJ-098",
    name: "Ghana Solar Array Site",
    status: "Completed",
    owner: "John Partner",
    published: true,
    progress: 100,
    location: "Kumasi, Ghana",
    category: "Renewable Energy",
    startDate: "Sep 01, 2025",
    endDate: "Apr 10, 2026",
    fiscal: "World Bank Climate Fund",
    compliance: "Full Compliance — Certified",
    desc: "Design and commissioning of a 4.8 MW ground-mounted solar photovoltaic array for Kumasi's industrial grid. Project delivered on schedule with zero safety incidents and full grid-tie synchronization per Ghana Grid Code.",
    image: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&q=80&w=1200",
    budget: 8500000,
    disciplines: ["Electrical Engineering", "Civil Engineering", "Environmental Impact", "Grid Integration"],
    team: [
      { name: "John Partner", role: "Project Lead", clearance: "Admin", avatar: "https://i.pravatar.cc/100?u=1" },
      { name: "Ama Boateng", role: "Electrical Lead", clearance: "Editor", avatar: "https://i.pravatar.cc/100?u=6" },
    ],
    milestones: [
      { label: "EIA & Site Clearance", status: "Complete", date: "Oct 15, 2025" },
      { label: "Foundation & Racking Installation", status: "Complete", date: "Jan 20, 2026" },
      { label: "PV Module Installation & Wiring", status: "Complete", date: "Mar 01, 2026" },
      { label: "Grid Commissioning & Handover", status: "Complete", date: "Apr 10, 2026" },
    ],
    specs: [
      { label: "Installed Capacity", value: "4.8 MW peak" },
      { label: "Panel Count", value: "12,480 × 385W modules" },
      { label: "Annual Output (est.)", value: "7.2 GWh" },
      { label: "Grid Compliance", value: "Ghana Grid Code 2020" },
      { label: "Inverter Topology", value: "String — SMA STP 25000" },
      { label: "Land Area Used", value: "9.4 hectares" },
    ],
    activity: [
      { type: "milestone", user: "John Partner", text: "Grid Commissioning completed — project marked as Completed", time: "1 day ago" },
      { type: "status", user: "System", text: "Project status changed from Ongoing → Completed", time: "1 day ago" },
      { type: "upload", user: "Ama Boateng", text: "Uploaded Ghana_Solar_Render.png", time: "2 days ago" },
    ],
    docs: [
      { id: 5, name: "Ghana_Solar_Render.png", type: "image", size: "5.4 MB", date: "Apr 15, 2026" },
    ],
  },
  "PROJ-110": {
    id: "PROJ-110",
    name: "Riyadh HVAC Modernization",
    status: "Draft",
    owner: "Mike R.",
    published: false,
    progress: 5,
    location: "Riyadh, Saudi Arabia",
    category: "Commercial HVAC",
    startDate: "Jul 01, 2026",
    endDate: "Mar 31, 2027",
    fiscal: "Client Direct — Al Futtaim Group",
    compliance: "Scoping Phase",
    desc: "Full HVAC system retrofit for a 42-floor commercial tower in Riyadh's King Abdullah Financial District. Scope includes chiller plant replacement, VAV conversion, and BMS integration targeting ASHRAE 90.1-2022 compliance.",
    image: "https://images.unsplash.com/photo-1565008576549-57569a49371d?auto=format&fit=crop&q=80&w=1200",
    budget: 12000000,
    disciplines: ["Mechanical Engineering", "HVAC / BMS", "Electrical Engineering"],
    team: [
      { name: "Mike R.", role: "Project Lead", clearance: "Admin", avatar: "https://i.pravatar.cc/100?u=5" },
    ],
    milestones: [
      { label: "Existing System Audit", status: "Ongoing", date: "Jul 31, 2026" },
      { label: "Design Development", status: "Pending", date: "Sep 30, 2026" },
      { label: "Installation Phase 1 (Floors 1–20)", status: "Pending", date: "Jan 15, 2027" },
    ],
    specs: [
      { label: "Building Area", value: "62,000 m²" },
      { label: "Chiller Capacity", value: "3 × 2,000 TR Centrifugal" },
      { label: "Energy Target", value: "25% reduction vs. baseline" },
      { label: "BMS Platform", value: "Honeywell NIAGARA 4" },
      { label: "Standard", value: "ASHRAE 90.1-2022" },
      { label: "Floors", value: "42" },
    ],
    activity: [
      { type: "status", user: "Mike R.", text: "Project created in Draft status", time: "3 days ago" },
    ],
    docs: [],
  },
  "PROJ-112": {
    id: "PROJ-112",
    name: "Accra Commercial Grid",
    status: "Ongoing",
    owner: "John Partner",
    published: true,
    progress: 40,
    location: "Accra, Ghana",
    category: "Environmental Engineering",
    startDate: "Feb 01, 2026",
    endDate: "Oct 30, 2026",
    fiscal: "GEF / African Development Bank",
    compliance: "In Progress",
    desc: "Design and deployment of a distributed energy grid serving 3 commercial districts in Accra. Integrates rooftop solar, battery storage, and smart metering to reduce dependence on the national grid during peak demand windows.",
    image: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&q=80&w=1200",
    budget: 4100000,
    disciplines: ["Electrical Engineering", "Grid Systems", "Environmental Engineering", "Smart Metering"],
    team: [
      { name: "John Partner", role: "Project Lead", clearance: "Admin", avatar: "https://i.pravatar.cc/100?u=1" },
      { name: "Kwame Ofori", role: "Site Supervisor", clearance: "Editor", avatar: "https://i.pravatar.cc/100?u=3" },
    ],
    milestones: [
      { label: "Feasibility Study", status: "Complete", date: "Mar 01, 2026" },
      { label: "Metering Infrastructure Deploy", status: "Ongoing", date: "Jun 30, 2026" },
      { label: "Battery Storage Integration", status: "Pending", date: "Sep 01, 2026" },
    ],
    specs: [
      { label: "Coverage Districts", value: "3 (Osu, Labone, Airport City)" },
      { label: "Total Capacity", value: "2.1 MW distributed" },
      { label: "Storage Capacity", value: "4.5 MWh (LFP batteries)" },
      { label: "Smart Meters", value: "1,240 units" },
      { label: "Grid Standard", value: "Ghana Grid Code + IEC 61968" },
      { label: "Peak Shaving Target", value: "35% demand reduction" },
    ],
    activity: [
      { type: "upload", user: "Kwame Ofori", text: "Uploaded metering site photos", time: "4 hours ago" },
      { type: "milestone", user: "John Partner", text: "Feasibility Study marked as Complete", time: "2 weeks ago" },
    ],
    docs: [],
  },
};

export const PROJECT_LIST = Object.values(PROJECTS);

export const PUBLIC_PROJECTS = PROJECT_LIST.filter(
  (p) => p.published && p.status !== "Draft"
);

export const BUDGET_TIERS = [
  { label: "All Budgets", min: 0, max: Infinity },
  { label: "Under $1M", min: 0, max: 1_000_000 },
  { label: "$1M – $5M", min: 1_000_000, max: 5_000_000 },
  { label: "$5M – $10M", min: 5_000_000, max: 10_000_000 },
  { label: "Over $10M", min: 10_000_000, max: Infinity },
];

export function formatBudget(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount}`;
}
