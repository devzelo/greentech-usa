// Single source of truth for the public Services catalog.
// Used by ServicesPage (cards) and ContactPage (per-service hero image).
//
// Images: General Contractor, Environmental Engineering, WTP and WWTP use the
// REAL project photos extracted from the live gt-usa.com site (hosted locally
// because the source blocks hotlinking). O&M, HVAC, Laboratory and Prevention
// Maintenance use topic-matched, manually-verified photos from Pexels (a free
// source), since the live site has no images for those services.
//
// Descriptions: the live site reused a few placeholder paragraphs across
// multiple services, so these have been rewritten to be unique and accurate
// to each service.

export interface Service {
  id: string;
  title: string;
  desc: string;
  img: string;
}

// Generic fallback used when a service image fails to load or no service
// is selected on the contact page.
export const FALLBACK_SERVICE_IMAGE = "/services/environmental-engineering.jpg";

export const detailedServices: Service[] = [
  {
    id: "gen-con",
    title: "General Contractor",
    desc: "As the primary overseer of construction projects, we manage every phase — planning, procurement, scheduling, and on-site coordination — to deliver complex builds safely, on time, and within budget.",
    img: "/services/general-contractor.jpg",
  },
  {
    id: "env-eng",
    title: "Environmental Engineering",
    desc: "We design and deliver environmental solutions for water, soil, and air — from impact assessments and feasibility studies to pollution control and sustainable infrastructure that meets regulatory standards.",
    img: "/services/environmental-engineering.jpg",
  },
  {
    id: "wtp",
    title: "Water Treatment Plant (WTP)",
    desc: "We design, build, and commission water treatment plants — coagulation, sedimentation, filtration, and disinfection systems that produce safe, reliable potable water for communities and industry.",
    img: "/services/water-treatment-plant.jpg",
  },
  {
    id: "wwtp",
    title: "Wastewater Treatment Plant (WWTP)",
    desc: "We engineer and construct wastewater treatment facilities — including prefabricated package plants, MABR systems, and geomembranes — built to the highest international standards for USACE and government clients.",
    img: "/services/wastewater-treatment-plant.jpg",
  },
  {
    id: "om",
    title: "Operation & Maintenance (O&M)",
    desc: "Our professional team keeps your assets running at peak performance, providing proactive operation, monitoring, and maintenance that maximize uptime, efficiency, and equipment lifespan.",
    img: "/services/operation-maintenance.jpg",
  },
  {
    id: "hvac",
    title: "Commercial HVAC Services",
    desc: "Installation, replacement, and maintenance of commercial chillers and HVAC systems — engineered for energy efficiency, sustainability, and dependable climate control across industrial facilities.",
    img: "/services/commercial-hvac.jpg",
  },
  {
    id: "lab",
    title: "Laboratory Services",
    desc: "Our laboratory delivers precise water and wastewater analysis — testing for biological, physical, and chemical parameters to ensure compliance, quality control, and public-health protection.",
    img: "/services/laboratory-services.jpg",
  },
  {
    id: "prev-maint",
    title: "Prevention Maintenance",
    desc: "Scheduled preventive maintenance — inspections, servicing, and component replacement — that detects issues early, prevents costly failures, and keeps your critical systems running reliably.",
    img: "/services/prevention-maintenance.jpg",
  },
];

/** Service names, used as the selectable project categories in the dashboard. */
export const SERVICE_CATEGORIES: string[] = detailedServices.map((s) => s.title);

/** Look up a service's image by its exact title (as passed via ?service=). */
export function getServiceImage(title: string | null | undefined): string {
  if (!title) return FALLBACK_SERVICE_IMAGE;
  const match = detailedServices.find((s) => s.title === title);
  return match?.img ?? FALLBACK_SERVICE_IMAGE;
}
