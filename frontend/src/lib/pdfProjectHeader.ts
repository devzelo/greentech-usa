import { PDFFont, PDFPage, rgb } from "pdf-lib";
import type { ApiProject } from "./api";
import { composeSiteAddress } from "./address";

// Project identity shown at the top of every exported/printed document (H1). Deliberately
// EXCLUDES the client name — vendor-facing docs (RFQ/PO) must not reveal the client (H2).
export interface PoPartner {
  name: string; address: string; email: string; phone: string; logoUrl: string;
  // Stamp & signature images saved on the partner profile (JV settings) — the PO picks from these.
  stamps?: Array<{ name: string; url: string }>;
  signatures?: Array<{ name: string; url: string }>;
}
export interface ProjectPdfInfo {
  name: string;
  number: string;
  location: string;       // short "City, Country" — shown in PDF headers
  siteAddress: string;    // full one-line delivery address — used as the RFQ/PO "Project site"
  category: string;
  date: string;
  // JV partner (used by the PO document); absent when there's no joint venture.
  partner?: PoPartner;
}

// Build the info block from a loaded project. `number` uses the project id (our project number).
export function projectPdfInfo(p?: Pick<ApiProject, "id" | "name" | "location" | "siteAddress" | "category" | "jointVenture"> | null): ProjectPdfInfo {
  const jv = p?.jointVenture;
  return {
    name: p?.name || "",
    number: p?.id || "",
    location: p?.location || "",
    siteAddress: composeSiteAddress(p?.siteAddress) || p?.location || "",
    category: p?.category || "",
    date: new Date().toLocaleDateString(),
    partner: jv?.enabled ? { name: jv.partnerName || "", address: jv.partnerAddress || "", email: jv.email || "", phone: jv.phone || "", logoUrl: jv.logo || "", stamps: jv.stamps || [], signatures: jv.signatures || [] } : undefined,
  };
}

// Draw a compact "Project: … · No: … · Location: … · Category: … · Date: …" block at (x,y).
// Returns the new y (below the block). No-op-ish when info is empty.
export function drawProjectInfo(page: PDFPage, font: PDFFont, info: ProjectPdfInfo | undefined, x: number, y: number, maxWidth: number): number {
  if (!info || (!info.name && !info.number && !info.location)) return y;
  const MUTED = rgb(0.39, 0.45, 0.55), INK = rgb(0.06, 0.09, 0.16);
  const parts = [
    info.name ? `Project: ${info.name}` : "",
    info.number ? `No: ${info.number}` : "",
    info.location ? `Location: ${info.location}` : "",
    info.category ? `Category: ${info.category}` : "",
    info.date ? `Date: ${info.date}` : "",
  ].filter(Boolean);
  // Wrap the parts across lines so they never overflow the page width.
  let line = "";
  const lines: string[] = [];
  for (const part of parts) {
    const test = line ? `${line}   ·   ${part}` : part;
    if (font.widthOfTextAtSize(test, 8) > maxWidth && line) { lines.push(line); line = part; }
    else line = test;
  }
  if (line) lines.push(line);
  for (const l of lines) { page.drawText(l, { x, y, size: 8, font, color: l === lines[0] ? INK : MUTED }); y -= 12; }
  return y - 4;
}

// One-line HTML version for the browser-print reports (Master Log).
export function projectInfoHtml(info?: ProjectPdfInfo): string {
  if (!info || (!info.name && !info.number && !info.location)) return "";
  const esc = (s: string) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
  const parts = [
    info.name && `<b>Project:</b> ${esc(info.name)}`,
    info.number && `<b>No:</b> ${esc(info.number)}`,
    info.location && `<b>Location:</b> ${esc(info.location)}`,
    info.category && `<b>Category:</b> ${esc(info.category)}`,
  ].filter(Boolean);
  return parts.length ? `<p style="color:#0f172a;font-size:12px;margin:2px 0 10px">${parts.join(" &nbsp;·&nbsp; ")}</p>` : "";
}
