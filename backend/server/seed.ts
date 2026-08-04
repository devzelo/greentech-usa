import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDB } from "./config/db";
import Project from "./models/Project";
import Employee from "./models/Employee";
import User from "./models/User";

const employees = [
  { empId: "EMP-001", name: "John Partner" },
  { empId: "EMP-002", name: "Sara Mensah" },
  { empId: "EMP-003", name: "Kwame Ofori" },
  { empId: "EMP-004", name: "Sara Mitchell" },
  { empId: "EMP-005", name: "Mike Reynolds" },
  { empId: "EMP-006", name: "Ama Boateng" },
  { empId: "EMP-007", name: "David Chen" },
  { empId: "EMP-008", name: "Lisa Torres" },
  { empId: "EMP-009", name: "James Osei" },
  { empId: "EMP-010", name: "Rachel Kim" },
];

const projects = [
  {
    projectId: "PROJ-102",
    name: "Potable Water Upgrade - Ghana",
    status: "Ongoing",
    category: "Water Treatment",
    location: "Accra, Ghana",
    description: "Full upgrade of the Accra municipal water treatment facility to serve 400,000 residents with potable water meeting WHO standards.",
    owner: "John Partner",
    published: true,
    progress: 65,
    fiscal: "USAID Regional Grant",
    compliance: "Passed Internal Audit",
    disciplines: ["Environmental Engineering", "Civil Engineering", "Hydrology"],
    startDate: "Jan 15, 2026",
    endDate: "Nov 12, 2026",
    projectNature: { selected: ["WTP", "IDIQ"], custom: [] },
    clientInfo: { name: "USAID Ghana", reference: "USAID-GH-2026-012", contactName: "", email: "", phone: "", country: "Ghana", address: "", notes: "" },
    timeline: { phases: [{ name: "Design & Planning", start: "2026-01-15", end: "2026-03-01" }, { name: "Procurement", start: "2026-03-01", end: "2026-05-01" }] },
    assignedEmployees: ["EMP-001", "EMP-002", "EMP-003"],
    subcontractors: [{ name: "AccraBuild Engineering Ltd.", scope: "Civil Works", subId: "SUB-001" }],
    customTabs: [],
  },
  {
    projectId: "PROJ-105",
    name: "Waste Management Plan - VA",
    status: "Pending",
    category: "Wastewater",
    location: "Arlington, VA",
    description: "Comprehensive waste management upgrade for Arlington County municipal wastewater systems.",
    owner: "Sara Mensah",
    published: false,
    progress: 10,
    fiscal: "Federal EPA Allocation",
    compliance: "Pending Review",
    disciplines: ["Environmental Engineering", "Waste Management"],
    startDate: "Mar 1, 2026",
    endDate: "Dec 31, 2026",
    projectNature: { selected: ["WWTP"], custom: [] },
    clientInfo: { name: "Arlington County", reference: "", contactName: "", email: "", phone: "", country: "USA", address: "", notes: "" },
    timeline: { phases: [{ name: "Planning", start: "2026-03-01", end: "2026-05-01" }] },
    assignedEmployees: ["EMP-004", "EMP-005"],
    subcontractors: [],
    customTabs: [],
  },
  {
    projectId: "PROJ-098",
    name: "Ghana Solar Array Site",
    status: "Completed",
    category: "Renewable Energy",
    location: "Kumasi, Ghana",
    description: "60-acre solar array installation providing 80MW of clean energy to the national grid.",
    owner: "John Partner",
    published: true,
    progress: 100,
    fiscal: "World Bank Green Fund",
    compliance: "Certified Complete",
    disciplines: ["Electrical Engineering", "Renewable Energy", "Environmental Impact"],
    startDate: "Feb 1, 2025",
    endDate: "Jan 30, 2026",
    projectNature: { selected: ["IDIQ"], custom: [] },
    clientInfo: { name: "Ghana Energy Commission", reference: "", contactName: "", email: "", phone: "", country: "Ghana", address: "", notes: "" },
    timeline: { phases: [{ name: "Construction", start: "2025-02-01", end: "2025-12-01" }, { name: "Commissioning", start: "2025-12-01", end: "2026-01-30" }] },
    assignedEmployees: ["EMP-007", "EMP-008"],
    subcontractors: [],
    customTabs: [],
  },
  {
    projectId: "PROJ-110",
    name: "Riyadh HVAC Modernization",
    status: "Draft",
    category: "Commercial HVAC",
    location: "Riyadh, Saudi Arabia",
    description: "HVAC system modernization for three government office towers in central Riyadh.",
    owner: "Mike Reynolds",
    published: false,
    progress: 5,
    fiscal: "Saudi Ministry of Works",
    compliance: "Pre-Award Review",
    disciplines: ["Mechanical Engineering", "HVAC"],
    startDate: "Jun 1, 2026",
    endDate: "Dec 1, 2027",
    projectNature: { selected: ["HVAC", "Preventive Maintenance (PM)"], custom: [] },
    clientInfo: { name: "Saudi Ministry of Works", reference: "", contactName: "", email: "", phone: "", country: "Saudi Arabia", address: "", notes: "" },
    timeline: { phases: [{ name: "Design", start: "2026-06-01", end: "2026-09-01" }] },
    assignedEmployees: ["EMP-005"],
    subcontractors: [],
    customTabs: [],
  },
  {
    projectId: "PROJ-112",
    name: "Accra Commercial Grid",
    status: "Ongoing",
    category: "Grid Systems",
    location: "Accra, Ghana",
    description: "Expansion of the commercial power grid in the Accra Business District.",
    owner: "David Chen",
    published: false,
    progress: 40,
    fiscal: "AfDB Infrastructure Fund",
    compliance: "Ongoing Audit",
    disciplines: ["Electrical Engineering", "Civil Engineering"],
    startDate: "Apr 1, 2026",
    endDate: "Mar 31, 2027",
    projectNature: { selected: ["IDIQ"], custom: [] },
    clientInfo: { name: "Electricity Company of Ghana", reference: "", contactName: "", email: "", phone: "", country: "Ghana", address: "", notes: "" },
    timeline: { phases: [{ name: "Installation Phase 1", start: "2026-04-01", end: "2026-08-01" }] },
    assignedEmployees: ["EMP-007", "EMP-009"],
    subcontractors: [],
    customTabs: [],
  },
];

async function seed() {
  await connectDB();

  await Employee.deleteMany({});
  await Employee.insertMany(employees);
  console.log(`âœ… Seeded ${employees.length} employees`);

  await Project.deleteMany({});
  await Project.insertMany(projects);
  console.log(`âœ… Seeded ${projects.length} projects`);

  // Seed default admin user (upsert so re-running seed doesn't duplicate)
  const hashedPw = await bcrypt.hash("Greentech2026", 12);
  await User.findOneAndUpdate(
    { email: "admin@greentech-usa.com" },
    { name: "John Partner", email: "admin@greentech-usa.com", password: hashedPw, role: "admin" },
    { upsert: true, new: true }
  );
  console.log("âœ… Default user seeded â€” admin@greentech-usa.com / Greentech2026");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
