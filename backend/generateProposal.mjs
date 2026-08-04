/**
 * GreenTech USA — Project Proposal (.docx, Word / Google Docs compatible)
 * A multi-page proposal with a branded cover page and dummy content. Reuses the
 * letterhead brand system: the emerald→blue gradient header banner and contact-bar
 * footer are embedded as page-anchored floating PNGs on every page.
 *
 *   node scripts/generateProposal.mjs
 */
import fs from "fs";
import path from "path";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import {
  Document, Packer, Header, Footer, Paragraph, TextRun, ImageRun,
  AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType, VerticalAlign,
  HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType,
} from "docx";

const ASSETS = path.join(process.cwd(), "scripts", "pdf-assets");
const SLATE = "0F172A", S700 = "334155", S600 = "475569", S500 = "64748B", S400 = "94A3B8";
const EMERALD = "10B981", BLUE = "3B82F6", BORDER = "E2E8F0", MIST = "F8FAFC";
const EMU = 914400;
const FONT = "Arial";

// ── Banners (same as the letterhead) ─────────────────────────────────────────
const headerBuf = fs.readFileSync(path.join(ASSETS, "letterhead-header.png"));
const footerBuf = fs.readFileSync(path.join(ASSETS, "letterhead-footer.png"));
const PAGE_H_IN = 11.69, BAND_W = 794;
const HDR = { w: BAND_W, h: Math.round((BAND_W * 260) / 1632) };
const FTR = { w: BAND_W, h: Math.round((BAND_W * 210) / 1632) };
const FOOTER_Y = PAGE_H_IN - FTR.h / 96;

const floatImg = (data, dim, yOffsetIn) =>
  new ImageRun({
    data, type: "png",
    transformation: { width: dim.w, height: dim.h },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round(yOffsetIn * EMU) },
      allowOverlap: true, behindDocument: true, wrap: { type: TextWrappingType.NONE },
    },
  });

// ── Cover decorative art — gradients/photo with logos baked; all DATA stays editable ──
const FONTS_DIR = path.join(ASSETS, "fonts");
GlobalFonts.registerFromPath(path.join(FONTS_DIR, "Outfit-700.ttf"), "Outfit");
GlobalFonts.registerFromPath(path.join(FONTS_DIR, "Inter-600.ttf"), "InterS");
const cS = "#0F172A", cE = "#10B981", cB = "#3B82F6", cW = "#FFFFFF", cMut = "#94A3B8";
const markImg = await loadImage(fs.readFileSync(path.join(process.cwd(), "assets", "favicon2.png")));

function drawCoverFit(x, img, dx, dy, dw, dh) {
  const ir = img.width / img.height, br = dw / dh;
  let sw, sh, sx, sy;
  if (ir > br) { sh = img.height; sw = sh * br; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / br; sx = 0; sy = (img.height - sh) / 2; }
  x.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}
function spacedTxt(x, t, px, py, sp) { let cx = px; for (const ch of t) { x.fillText(ch, cx, py); cx += x.measureText(ch).width + sp; } }
function drawLockup(x, px, py, s, textColor, tagColor, noTag = false) {
  const b = 46 * s; x.fillStyle = cS; x.beginPath(); x.arc(px + b / 2, py + b / 2, b / 2, 0, Math.PI * 2); x.fill();
  const ms = b * 0.58; x.drawImage(markImg, px + (b - ms) / 2, py + (b - ms) / 2, ms, ms);
  const tx = px + b + 14 * s; x.fillStyle = textColor; x.textBaseline = "alphabetic";
  x.font = `700 ${21 * s}px Outfit`; x.fillText("GreenTech USA", tx, py + (noTag ? b * 0.62 : b * 0.46));
  if (!noTag) { x.fillStyle = tagColor; x.font = `600 ${7.5 * s}px InterS`; spacedTxt(x, "ENGINEERING, CONSTRUCTION & ENVIRONMENTAL SERVICES", tx, py + b * 0.82, 1.2 * s); }
}
const GRADH = (() => { const W = 1600, H = 48, c = createCanvas(W, H), x = c.getContext("2d"); const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, cE); g.addColorStop(1, cB); x.fillStyle = g; x.fillRect(0, 0, W, H); return c.toBuffer("image/png"); })();
const SLATE_BG = (() => { const c = createCanvas(8, 8), x = c.getContext("2d"); x.fillStyle = cS; x.fillRect(0, 0, 8, 8); return c.toBuffer("image/png"); })();
const LOCKUP_LIGHT = (() => { const c = createCanvas(900, 132), x = c.getContext("2d"); drawLockup(x, 6, 18, 2.2, cS, cMut); return c.toBuffer("image/png"); })();
const PROJ_DIR = path.join(process.cwd(), "assets", "proposal images");
// Cover hero — four project photos in a modern editorial mosaic (left feature + three stacked)
const HERO = await (async () => {
  const W = 1588, H = 1000, c = createCanvas(W, H), x = c.getContext("2d");
  x.fillStyle = cS; x.fillRect(0, 0, W, H); // slate seams between panels
  const load = async (f, dir = PROJ_DIR) => loadImage(fs.readFileSync(path.join(dir, f)));
  const [aerial, clarifier, hvac, biomak] = await Promise.all([
    load("Untitled-design.jpg"),
    load("Untitled-design-1.jpg"),
    load("HVAC-2.JPEG-1.jpg"),
    load("4th imaeg for proposal cover.jpeg", path.join(process.cwd(), "assets")),
  ]);
  const gp = 14;
  const colL = 952;             // left feature panel width
  const rx = colL + gp;         // right column x
  const rw = W - rx;            // right column width
  const ph = (H - 2 * gp) / 3;  // three equal stacked right panels
  drawCoverFit(x, aerial, 0, 0, colL, H);              // left feature panel (logo sits here)
  drawCoverFit(x, biomak, rx, 0, rw, ph);              // right-top — new BIO-MAK unit
  drawCoverFit(x, clarifier, rx, ph + gp, rw, ph);     // right-middle panel
  drawCoverFit(x, hvac, rx, 2 * (ph + gp), rw, ph);    // right-bottom panel
  // cover-mood gradient: keep the photos crisp up top, fade to slate only near the bottom for the title
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(15,23,42,0.12)");
  g.addColorStop(0.5, "rgba(15,23,42,0.16)");
  g.addColorStop(0.74, "rgba(15,23,42,0.42)");
  g.addColorStop(1, "rgba(15,23,42,1)");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // top scrim — hold the darkening through the full logo height, then fade, so the lockup reads
  const top = x.createLinearGradient(0, 0, 0, 330);
  top.addColorStop(0, "rgba(15,23,42,0.72)");
  top.addColorStop(0.55, "rgba(15,23,42,0.6)");
  top.addColorStop(1, "rgba(15,23,42,0)");
  x.fillStyle = top; x.fillRect(0, 0, W, 330);
  // extra left-side darkening directly behind the lockup for clean contrast on the tagline
  const ls = x.createLinearGradient(0, 0, 940, 0);
  ls.addColorStop(0, "rgba(15,23,42,0.5)");
  ls.addColorStop(1, "rgba(15,23,42,0)");
  x.fillStyle = ls; x.fillRect(0, 0, 940, 300);
  drawLockup(x, 92, 86, 2.1, cW, cE);
  return c.toBuffer("image/png");
})();
const GRADV = await (async () => {
  const W = 620, H = 2246, c = createCanvas(W, H), x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, cE); g.addColorStop(1, cB); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(255,255,255,0.16)"; x.lineWidth = 3;
  x.beginPath(); x.arc(W - 10, 300, 240, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(30, H - 150, 210, 0, Math.PI * 2); x.stroke();
  drawLockup(x, 64, 86, 1.95, cW, cW, true);
  return c.toBuffer("image/png");
})();
const EMBASSY_BUF = fs.readFileSync(path.join(ASSETS, "embassy.jpg"));

// ── Text helpers ─────────────────────────────────────────────────────────────
const run = (text, o = {}) =>
  new TextRun({ text, font: FONT, size: o.size || 21, color: o.color || SLATE, bold: !!o.bold, italics: !!o.italics, characterSpacing: o.cs });

const para = (children, o = {}) =>
  new Paragraph({
    children: Array.isArray(children) ? children : [children],
    alignment: o.align,
    spacing: { after: o.after ?? 140, before: o.before ?? 0, line: 268 },
    indent: o.indent,
    pageBreakBefore: o.pageBreakBefore,
  });

const heading = (num, title, o = {}) =>
  new Paragraph({
    spacing: { before: 240, after: 120, line: 264 },
    pageBreakBefore: o.pageBreakBefore,
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: EMERALD, space: 4 } },
    children: [run(`${num}.  `, { bold: true, size: 23, color: EMERALD }), run(title.toUpperCase(), { bold: true, size: 22, color: SLATE })],
  });

const eyebrow = (text) =>
  new Paragraph({ spacing: { after: 70, line: 240 }, children: [run(text.toUpperCase(), { bold: true, size: 19, color: EMERALD, cs: 30 })] });

const bullet = (text, o = {}) =>
  new Paragraph({ spacing: { after: 60, line: 264 }, indent: { left: 360, hanging: 200 }, children: [run("•  ", { color: EMERALD, bold: true }), run(text, o)] });

const subhead = (text) =>
  new Paragraph({ spacing: { before: 120, after: 70, line: 258 }, children: [run(text.toUpperCase(), { bold: true, size: 19, color: SLATE })] });

const kvRow = (label, value) =>
  new TableRow({
    children: [
      new TableCell({ width: { size: 32, type: WidthType.PERCENTAGE }, margins: { top: 50, bottom: 50, left: 90, right: 90 }, verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ spacing: { after: 0, line: 252 }, children: [run(label, { bold: true, size: 19, color: S500 })] })] }),
      new TableCell({ width: { size: 68, type: WidthType.PERCENTAGE }, margins: { top: 50, bottom: 50, left: 90, right: 90 }, verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ spacing: { after: 0, line: 252 }, children: [run(value, { size: 21, color: SLATE })] })] }),
    ],
  });
const noBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, insideVertical: { style: BorderStyle.NONE },
};
const infoTable = (rows) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows });

// Generic data table with a slate header row.
function dataTable(headers, rows, widths, aligns = []) {
  const cell = (txt, o = {}) =>
    new TableCell({
      width: { size: o.w, type: WidthType.PERCENTAGE },
      shading: o.head ? { fill: SLATE } : o.zebra ? { fill: MIST } : undefined,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: o.align, spacing: { after: 0, line: 250 },
        children: [run(txt, { size: o.head ? 18 : 19, bold: !!o.head || !!o.bold, color: o.head ? "FFFFFF" : (o.color || SLATE) })] })],
    });
  const headRow = new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { head: true, w: widths[i], align: aligns[i] })) });
  const bodyRows = rows.map((r, ri) =>
    new TableRow({ children: r.map((c, i) => cell(typeof c === "object" ? c.t : c, { w: widths[i], align: aligns[i], zebra: ri % 2 === 1, bold: typeof c === "object" && c.bold, color: typeof c === "object" ? c.color : undefined })) }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, insideVertical: { style: BorderStyle.NONE } },
    rows: [headRow, ...bodyRows],
  });
}

const R = AlignmentType.RIGHT, CTR = AlignmentType.CENTER;

// ── COVER ─── (pages 1–3 are rendered from the cover-page PDF — see coverPages)

// ── Letter of transmittal ────────────────────────────────────────────────────
const letter = [
  heading("01", "Letter of Transmittal"),
  para([run("June 8, 2026", { color: S600 })], { after: 120 }),
  para([run("Contracting Officer", { bold: true }), run("\nU.S. Department of State, Bureau of Overseas Buildings Operations\nRegional Procurement Support Office (RPSO), Frankfurt", { color: S700 })], { after: 160 }),
  para([run("Subject:  ", { bold: true }), run("Proposal for the Water & Wastewater Treatment Program (Solicitation No. 19GE50-26-R-0014)", { color: S700 })], { after: 160 }),
  para([run("Dear Contracting Officer,", { color: S700 })], { after: 140 }),
  para([run("GreenTech USA LLC is pleased to submit the enclosed proposal for the design, construction, and long-term operations & maintenance of potable water and wastewater treatment systems at U.S. diplomatic facilities. Established with roots tracing to 2009, GreenTech has delivered more than 37 design-build and maintenance contracts worldwide, including wastewater treatment plants for the U.S. Department of State and the U.S. Army Corps of Engineers.", { color: S700 })]),
  para([run("This proposal demonstrates our technical understanding of the requirement, a phased delivery methodology proven in challenging environments, a qualified project team, and a transparent, fully-loaded cost basis. We are confident in our ability to deliver this program on schedule, within budget, and to the highest standards of quality, safety, and environmental responsibility.", { color: S700 })]),
  para([run("We welcome the opportunity to discuss any aspect of this proposal and remain available at your convenience.", { color: S700 })], { after: 160 }),
  para([run("Respectfully submitted,", { color: S700 })], { after: 40 }),
  para([run("Robert J. Tobin", { bold: true }), run("\nManaging Director, GreenTech USA LLC\ninfo@gt-usa.com · +1 571-337-1358", { color: S600, size: 19 })]),
];

// ── Executive summary ────────────────────────────────────────────────────────
const summary = [
  heading("02", "Executive Summary", { pageBreakBefore: true }),
  para([run("GreenTech USA proposes a turnkey, single-accountable-team approach to deliver reliable water and wastewater treatment capacity across the designated facilities. Our solution pairs U.S.-government-grade compliance with prefabricated MABR (Membrane Aerated Biofilm Reactor) package technology that can be rapidly deployed and reliably operated where conventional plants cannot reach.", { color: S700 })]),
  subhead("Why GreenTech USA"),
  bullet("Federal-grade compliance — active SAM.gov registration and a proven DOS & USACE delivery record to WHO and EPA effluent standards."),
  bullet("Delivery in challenging environments — on-the-ground execution in post-conflict and remote regions across three continents."),
  bullet("Design-build through O&M — one accountable team from design and fabrication to commissioning and multi-year operations, eliminating hand-off risk."),
  bullet("Advanced treatment technology — prefabricated MABR and modular package plants engineered for rapid, reliable, low-energy operation."),
  subhead("Engagement at a glance"),
  infoTable([
    kvRow("Treatment Capacity", "10,000 GPD (expandable to 15,000 GPD)"),
    kvRow("Delivery Model", "Design-Build + 3-Year Operations & Maintenance"),
    kvRow("Estimated Duration", "32 weeks to commissioning"),
    kvRow("Estimated Value", "$2.84M (design-build) + O&M as scheduled"),
  ]),
];

// ── Company overview ─────────────────────────────────────────────────────────
const overview = [
  heading("03", "Company Overview"),
  para([run("GreenTech USA LLC is a U.S.-based environmental engineering firm and general contractor specializing in the design, construction, and long-term operation of water and wastewater treatment facilities. Headquartered in Virginia, USA, we serve the U.S. Government and multilateral institutions across Africa, the Middle East, and Asia.", { color: S700 })]),
  dataTable(
    ["METRIC", "VALUE"],
    [["Established", "2020 · roots to 2009"], ["Projects Delivered", "37+ design-build & maintenance contracts"], ["Global Offices", "South Sudan, India, Mexico, Afghanistan, Fiji"], ["Key Clients", "U.S. Dept. of State · USACE · USAID · DoD · World Bank · UN"], ["Registrations", "CAGE 8ZJ10 · UEI FYR1QQ8L3SM7 · Active on SAM.gov"]],
    [34, 66]
  ),
];

// ── Scope of work ────────────────────────────────────────────────────────────
const scope = [
  heading("04", "Project Understanding & Scope of Work"),
  para([run("Based on the requirement, GreenTech will furnish all engineering, labor, materials, equipment, and supervision necessary to design, build, commission, and maintain the treatment systems. The scope includes, but is not limited to:", { color: S700 })], { after: 80 }),
  subhead("Design & Engineering"),
  bullet("Site assessment, hydraulic modeling, and process design to WHO/EPA effluent criteria."),
  bullet("Civil, mechanical, electrical, and instrumentation design packages and shop drawings."),
  subhead("Construction & Installation"),
  bullet("Supply and installation of prefabricated MABR package treatment units."),
  bullet("Civil works, equalization and aeration basins, pump houses, and effluent reuse lines."),
  bullet("NEMA 4X control panels, PPR/HDPE piping, and disinfection systems."),
  subhead("Commissioning & O&M"),
  bullet("Functional testing, performance verification, and operator training."),
  bullet("Three-year preventive maintenance, laboratory testing, and quarterly compliance reporting."),
];

// ── Technical approach ───────────────────────────────────────────────────────
const approach = [
  heading("05", "Technical Approach & Methodology", { pageBreakBefore: true }),
  para([run("Our delivery follows a disciplined, milestone-driven methodology refined across federal contracts. Each phase concludes with a formal review and client sign-off before the next begins.", { color: S700 })], { after: 100 }),
  ...[
    ["Phase 1 — Mobilization & Design", "Kickoff, site survey, process design, submittals, and design-review approval."],
    ["Phase 2 — Procurement & Fabrication", "Long-lead procurement, factory fabrication of MABR units, and factory acceptance testing."],
    ["Phase 3 — Construction & Installation", "Civil works, mechanical and electrical installation, and integration."],
    ["Phase 4 — Commissioning & Handover", "Functional testing, performance verification, operator training, and documentation."],
    ["Phase 5 — Operations & Maintenance", "Preventive maintenance, lab testing, and quarterly compliance reporting for 3 years."],
  ].flatMap(([t, d]) => [subhead(t), para([run(d, { color: S700 })], { after: 60 })]),
];

// ── Schedule ─────────────────────────────────────────────────────────────────
const schedule = [
  heading("06", "Project Schedule"),
  para([run("Indicative schedule from notice-to-proceed (NTP). Durations are subject to permitting, weather, and site access.", { color: S600, italics: true })], { after: 100 }),
  dataTable(
    ["PHASE", "KEY ACTIVITIES", "DURATION", "MILESTONE"],
    [
      ["1 · Mobilization & Design", "Survey, process design, submittals", "Weeks 1–6", "Design approval"],
      ["2 · Procurement & Fabrication", "Long-lead items, MABR fabrication, FAT", "Weeks 5–16", "Factory acceptance"],
      ["3 · Construction & Installation", "Civil, mechanical, electrical works", "Weeks 12–26", "Mechanical completion"],
      ["4 · Commissioning & Handover", "Testing, training, documentation", "Weeks 26–32", "Substantial completion"],
      ["5 · Operations & Maintenance", "Preventive maintenance & reporting", "36 months", "Quarterly reports"],
    ],
    [26, 38, 18, 18]
  ),
];

// ── Team ─────────────────────────────────────────────────────────────────────
const team = [
  heading("07", "Project Team & Key Personnel"),
  dataTable(
    ["NAME", "ROLE", "FOCUS"],
    [
      ["Robert J. Tobin", "Managing Director", "Program oversight & client liaison"],
      ["Shawn M. Heckart", "General Manager", "Delivery & resourcing"],
      ["Peter Gray", "Project Manager", "Schedule, cost & quality control"],
      ["Robert A. Brown", "Project Manager", "Construction & site supervision"],
      ["John J. Smith", "Commercial Manager", "Procurement & subcontracts"],
      ["Michelle F. Bess", "Finance Manager", "Invoicing & cost reporting"],
    ],
    [28, 30, 42]
  ),
];

// ── Cost proposal ────────────────────────────────────────────────────────────
const pricing = [
  heading("08", "Cost Proposal", { pageBreakBefore: true }),
  para([run("Fully-loaded, fixed-price basis in U.S. dollars. Excludes items listed under Assumptions & Exclusions.", { color: S600, italics: true })], { after: 100 }),
  dataTable(
    ["ITEM", "DESCRIPTION", "QTY", "UNIT PRICE", "AMOUNT"],
    [
      ["1", "Design & engineering packages", "1 LS", "$185,000", "$185,000"],
      ["2", "MABR package treatment units (10,000 GPD)", "1 set", "$960,000", "$960,000"],
      ["3", "Civil works, basins & pump house", "1 LS", "$540,000", "$540,000"],
      ["4", "Mechanical, electrical & instrumentation", "1 LS", "$420,000", "$420,000"],
      ["5", "Effluent reuse & disinfection", "1 LS", "$165,000", "$165,000"],
      ["6", "Commissioning, training & documentation", "1 LS", "$95,000", "$95,000"],
      [{ t: "" }, { t: "Subtotal", bold: true }, { t: "" }, { t: "" }, { t: "$2,365,000", bold: true }],
      [{ t: "" }, { t: "Contingency (10%)", bold: true }, { t: "" }, { t: "" }, { t: "$236,500", bold: true }],
      [{ t: "" }, { t: "Project Management & Overhead", bold: true }, { t: "" }, { t: "" }, { t: "$238,500", bold: true }],
      [{ t: "" }, { t: "TOTAL DESIGN-BUILD", bold: true, color: EMERALD }, { t: "" }, { t: "" }, { t: "$2,840,000", bold: true, color: EMERALD }],
    ],
    [8, 44, 12, 18, 18],
    [CTR, undefined, CTR, R, R]
  ),
  subhead("Operations & Maintenance (optional, per year)"),
  dataTable(
    ["SERVICE", "FREQUENCY", "ANNUAL FEE"],
    [
      ["Preventive maintenance & spares", "Monthly", "$96,000"],
      ["Laboratory testing & compliance reporting", "Quarterly", "$48,000"],
      ["On-call technical support", "As needed", "$24,000"],
      [{ t: "TOTAL O&M (PER YEAR)", bold: true, color: EMERALD }, { t: "" }, { t: "$168,000", bold: true, color: EMERALD }],
    ],
    [54, 24, 22],
    [undefined, CTR, R]
  ),
];

// ── Terms & assumptions ──────────────────────────────────────────────────────
const terms = [
  heading("09", "Assumptions & Exclusions"),
  bullet("Client to provide site access, security clearances, and existing as-built information."),
  bullet("Permitting fees, import duties, and customs clearance are excluded unless otherwise noted."),
  bullet("Pricing assumes continuous site access and no extended demobilization periods."),
  bullet("Utility connections (power, raw water) to be provided to the plant boundary by others."),
  heading("10", "Terms & Conditions"),
  subhead("Payment Schedule"),
  bullet("20% on notice-to-proceed and design mobilization."),
  bullet("40% on delivery of MABR units to site."),
  bullet("30% on mechanical completion."),
  bullet("10% on substantial completion and handover."),
  para([run("Validity: ", { bold: true, color: S700 }), run("This proposal is valid for 90 days from the date of issue. ", { color: S700 }), run("Governing Law: ", { bold: true, color: S700 }), run("Commonwealth of Virginia, USA.", { color: S700 })], { before: 100 }),
];

// ── Acceptance ───────────────────────────────────────────────────────────────
function sigColumn(roleLabel, fields) {
  const kids = [new Paragraph({ spacing: { after: 140, line: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: EMERALD, space: 4 } }, children: [run(roleLabel, { bold: true, size: 20, color: SLATE })] })];
  for (const [l, v] of fields) kids.push(new Paragraph({ spacing: { after: 30, line: 252 }, children: [run(`${l}:  `, { bold: true, size: 18, color: S500 }), run(v, { size: 20, color: SLATE })] }));
  kids.push(new Paragraph({ spacing: { before: 220, after: 30, line: 240 }, children: [run("____________________________________", { color: S600 })] }));
  kids.push(new Paragraph({ spacing: { after: 0, line: 240 }, children: [run("Signature & Date", { size: 17, color: S500 })] }));
  return kids;
}
const acceptance = [
  heading("11", "Acceptance", { pageBreakBefore: true }),
  para([run("To accept this proposal, please sign below and return one copy to GreenTech USA LLC. This page, once executed by both parties, constitutes a letter of intent to proceed under the terms herein.", { color: S700 })], { after: 200 }),
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, left: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, right: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, insideHorizontal: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, margins: { top: 120, bottom: 120, left: 140, right: 140 }, shading: { fill: MIST }, children: sigColumn("FOR THE CLIENT", [["Name", "[Authorized Representative]"], ["Title", "[Contracting Officer]"]]) }),
      new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, margins: { top: 120, bottom: 120, left: 140, right: 140 }, shading: { fill: MIST }, children: sigColumn("FOR GREENTECH USA", [["Name", "Robert J. Tobin"], ["Title", "Managing Director"]]) }),
    ] })],
  }),
];

// ── Editable cover pages (art = images, all DATA = editable text) ────────────
const inlineImg = (data, w, h, type = "png") => new ImageRun({ data, type, transformation: { width: w, height: h } });
const floatTop = (data, w, h, behind = false) => new ImageRun({
  data, type: "png", transformation: { width: w, height: h },
  floating: { horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 }, verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 }, allowOverlap: true, behindDocument: behind, wrap: { type: TextWrappingType.NONE } },
});
const N = { style: BorderStyle.NONE };
const noneB = { top: N, bottom: N, left: N, right: N, insideHorizontal: N, insideVertical: N };
const metaLines = (items) => items.map(([l, v]) => new Paragraph({ spacing: { after: 70, line: 240 }, children: [run(l + "      ", { size: 14, bold: true, color: "94A3B8", cs: 20 }), run(v, { size: 19, bold: true, color: "FFFFFF" })] }));

function metaCards() {
  const cell = (l, v) => new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, shading: { fill: MIST }, margins: { top: 130, bottom: 130, left: 120, right: 120 }, borders: { left: { style: BorderStyle.SINGLE, size: 18, color: EMERALD }, top: N, bottom: N, right: N }, children: [new Paragraph({ spacing: { after: 50 }, children: [run(l, { size: 12, bold: true, color: S500, cs: 18 })] }), new Paragraph({ spacing: { after: 0, line: 240 }, children: [run(v, { size: 16, bold: true, color: SLATE })] })] });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: N, bottom: N, left: N, right: N, insideVertical: { style: BorderStyle.SINGLE, size: 20, color: "FFFFFF" }, insideHorizontal: N }, rows: [new TableRow({ children: [cell("PREPARED FOR", "[Client / Agency Name]"), cell("PREPARED BY", "GreenTech USA LLC"), cell("DATE", "June 8, 2026"), cell("DOCUMENT NO.", "GT-AGR-2026-007")] })] });
}
function contactStrip() {
  const cols = [["10B981", "ADDRESS", "Virginia, USA"], ["1EA7A8", "PHONE", "+1 571-337-1358"], ["2C95CE", "EMAIL", "info@gt-usa.com"], ["3B82F6", "WEB", "www.gt-usa.com"]];
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noneB, rows: [new TableRow({ children: cols.map(([bg, l, v]) => new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, shading: { fill: bg }, margins: { top: 120, bottom: 120, left: 140, right: 140 }, children: [new Paragraph({ spacing: { after: 40 }, children: [run(l, { size: 11, bold: true, color: "FFFFFF", cs: 16 })] }), new Paragraph({ spacing: { after: 0 }, children: [run(v, { size: 15, bold: true, color: "FFFFFF" })] })] })) })] });
}
function panelTable() {
  const left = new TableCell({ width: { size: 38, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.BOTTOM, margins: { top: 200, bottom: 1000, left: 380, right: 260 }, borders: noneB, children: [
    new Paragraph({ spacing: { after: 110 }, children: [run("PROJECT PROPOSAL", { bold: true, size: 16, color: "FFFFFF", cs: 34 })] }),
    new Paragraph({ spacing: { after: 0, line: 300 }, children: [run("Prefabricated MABR Wastewater Plant", { bold: true, size: 38, color: "FFFFFF" })] }),
  ] });
  const right = new TableCell({ width: { size: 62, type: WidthType.PERCENTAGE }, margins: { top: 600, bottom: 300, left: 440, right: 380 }, borders: noneB, children: [
    new Paragraph({ spacing: { after: 220 }, children: [inlineImg(EMBASSY_BUF, 360, 212, "jpg")] }),
    new Paragraph({ spacing: { after: 250, line: 276 }, children: [run("Turnkey design, supply, installation, and commissioning of a modular MABR wastewater treatment plant with effluent reuse.", { size: 20, color: S600 })] }),
    ...[["PREPARED FOR", "[Client / Agency Name]"], ["PREPARED BY", "GreenTech USA LLC"], ["DATE", "June 8, 2026"], ["DOCUMENT NO.", "GT-PRP-2026-021"]].map(([l, v]) => new Paragraph({ spacing: { after: 120, line: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 6 } }, children: [run(l + "      ", { size: 13, bold: true, color: S400, cs: 14 }), run(v, { size: 17, bold: true, color: SLATE })] })),
  ] });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noneB, rows: [new TableRow({ children: [left, right] })] });
}

const cover1 = [
  new Paragraph({ spacing: { after: 0 }, children: [floatTop(SLATE_BG, 794, 1123, true), floatTop(HERO, 794, 500, false)] }),
  new Paragraph({ spacing: { before: 0, after: 80 }, children: [run("PROPOSAL · 2026", { bold: true, size: 30, color: EMERALD, cs: 30 })] }),
  new Paragraph({ spacing: { after: 90, line: 300 }, children: [run("Water & Wastewater Treatment Program", { bold: true, size: 40, color: "FFFFFF" })] }),
  new Paragraph({ spacing: { after: 130, line: 276 }, children: [run("Design-build delivery and long-term operations & maintenance of potable water and wastewater systems for U.S. diplomatic facilities.", { size: 21, color: "CBD5E1" })] }),
  new Paragraph({ spacing: { after: 140 }, children: [inlineImg(GRADH, 300, 9)] }),
  ...metaLines([["PREPARED FOR", "U.S. Department of State (OBO)"], ["DATE", "June 8, 2026"], ["DOCUMENT NO.", "GT-PRP-2026-014"]]),
  new Paragraph({ spacing: { before: 150 }, children: [run("Confidential & proprietary · Prepared by GreenTech USA LLC · CAGE 8ZJ10 · www.gt-usa.com", { size: 15, color: "94A3B8" })] }),
];
const cover2 = [
  new Paragraph({ spacing: { after: 0 }, children: [floatTop(GRADH, 794, 9, false)] }),
  new Paragraph({ spacing: { before: 220, after: 230 }, children: [inlineImg(LOCKUP_LIGHT, 238, 35)] }),
  new Paragraph({ spacing: { before: 150, after: 60 }, children: [run("SERVICE AGREEMENT", { bold: true, size: 19, color: EMERALD, cs: 40 })] }),
  new Paragraph({ spacing: { after: 90, line: 300 }, children: [run("Operations & Maintenance Service Agreement", { bold: true, size: 48, color: SLATE })] }),
  new Paragraph({ spacing: { after: 250, line: 276 }, children: [run("Master agreement for preventive maintenance, laboratory services, and technical analysis of water and HVAC systems.", { size: 21, color: S600 })] }),
  metaCards(),
  new Paragraph({ spacing: { after: 170 } }),
  contactStrip(),
  new Paragraph({ spacing: { before: 130 }, children: [run("Confidential & proprietary. Prepared exclusively for the named recipient. · CAGE 8ZJ10 · UEI FYR1QQ8L3SM7", { size: 15, color: S500 })] }),
];
const cover3 = [
  new Paragraph({ spacing: { after: 0 }, children: [floatTop(GRADV, 302, 1123, true)] }),
  panelTable(),
];

const body = [...letter, ...summary, ...overview, ...scope, ...approach, ...schedule, ...team, ...pricing, ...terms, ...acceptance];

const doc = new Document({
  creator: "GreenTech USA LLC",
  title: "GreenTech USA — Project Proposal",
  description: "GreenTech USA Water & Wastewater Treatment Program Proposal",
  styles: { default: { document: { run: { font: FONT, size: 21, color: SLATE } } } },
  sections: [
    // Page 1 — Dark hero cover (editable text over slate + photo art)
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 8100, bottom: 1040, left: 1120, right: 1120, header: 0, footer: 0 } } }, children: cover1 },
    // Page 2 — Light formal cover (editable, gradient accents)
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1200, bottom: 1040, left: 1120, right: 1120, header: 0, footer: 0 } } }, children: cover2 },
    // Page 3 — Gradient side-panel cover (editable, gradient panel art)
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } }, children: cover3 },
    // Pages 4+ — editable proposal body with the letterhead header & footer
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: Math.round(1.7 * 1440), bottom: Math.round(1.4 * 1440), left: Math.round((192 / 1632) * 11906), right: Math.round((192 / 1632) * 11906), header: 0, footer: 0 } } }, // gutter aligned to the banner logo
      headers: { default: new Header({ children: [new Paragraph({ children: [floatImg(headerBuf, HDR, 0)] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ children: [floatImg(footerBuf, FTR, FOOTER_Y)] })] }) },
      children: body,
    },
  ],
});

const outs = [
  path.join(process.cwd(), "public", "downloads", "greentech-proposal.docx"),
  path.join(process.cwd(), "assets", "GT-USA Project Proposal - Branded.docx"),
];
const buffer = await Packer.toBuffer(doc);
for (const o of outs) {
  fs.mkdirSync(path.dirname(o), { recursive: true });
  fs.writeFileSync(o, buffer);
  console.log("OK ", o);
}
