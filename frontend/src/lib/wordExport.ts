// Lightweight, universal Word export (client CR-B-14a). Word opens an HTML document saved with a
// .doc extension and the application/msword MIME type, so we can produce a fully editable Word file
// from any builder's data without a server-side .docx library. Rich-text builders (agreements, RFIs)
// pass their HTML straight through; tabular builders (invoice, RFQ, PO) pass a generated table.
//
// The file is on US Letter with the GreenTech letterhead as a real Word page header (repeated on
// every page) and a footer with the company line and "Page X of Y". Word reads the header and footer
// from the mso-element blocks in the hidden table at the end (the standard single-file technique),
// and loads the letterhead picture from the platform.
export function downloadHtmlAsWord(title: string, bodyHtml: string, filename: string): void {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const doc = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${escapeHtml(title)}</title>
<style>
  body{font-family:Inter,Calibri,Arial,sans-serif;font-size:10.5pt;color:#334155;}
  h1{font-family:Outfit,Calibri,Arial,sans-serif;font-size:20pt;color:#0F172A;margin:0 0 4pt;}
  h2{font-size:12pt;color:#0F172A;text-transform:uppercase;letter-spacing:.4pt;border-bottom:1.5pt solid #10B981;padding-bottom:3pt;margin:14pt 0 6pt;}
  h3{font-size:11pt;color:#0F172A;margin:10pt 0 3pt;}
  table{border-collapse:collapse;width:100%;margin:8pt 0;} td,th{border:1px solid #E2E8F0;padding:4pt 8pt;font-size:9.5pt;vertical-align:top;}
  th{background:#0F172A;color:#FFFFFF;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:.5pt;}
  .muted{color:#64748B;} .right{text-align:right;} img{max-width:100%;}
  p.MsoHeader,p.MsoFooter{margin:0;}
  p.MsoFooter{font-size:7.5pt;color:#64748B;border-top:1.5pt solid #10B981;padding-top:3pt;}
  @page WordSection1{size:8.5in 11.0in;margin:1.0in 1.0in 0.9in 1.0in;mso-header-margin:.3in;mso-footer-margin:.35in;mso-header:h1;mso-footer:f1;mso-page-orientation:portrait;}
  div.WordSection1{page:WordSection1;}
  table#hdrftr{margin:0 0 0 900in;width:1px;height:1px;overflow:hidden;}
</style></head>
<body><div class="WordSection1">${bodyHtml}
<table id="hdrftr" border="0" cellspacing="0" cellpadding="0"><tr><td>
<div style="mso-element:header" id="h1"><p class="MsoHeader"><img src="${origin}/brand/letterhead-header.png" width="624" height="42" alt="GreenTech USA"></p></div>
</td><td>
<div style="mso-element:footer" id="f1"><p class="MsoFooter">GreenTech USA LLC &middot; Chantilly, Virginia, USA &middot; info@gt-usa.com &middot; www.gt-usa.com<span style="mso-tab-count:1"> </span> Page <span style="mso-field-code: PAGE "></span> of <span style="mso-field-code: NUMPAGES "></span></p></div>
</td></tr></table>
</div></body></html>`;
  const blob = new Blob(["﻿", doc], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.toLowerCase().endsWith(".doc") ? filename : `${filename}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

// Build a simple HTML table from headers + rows (each cell escaped). Cells flagged in `rightCols`
// (by column index) are right-aligned — handy for money/qty columns.
export function htmlTable(headers: string[], rows: Array<Array<string | number>>, rightCols: number[] = []): string {
  const th = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${r.map((c, i) => `<td class="${rightCols.includes(i) ? "right" : ""}">${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}
