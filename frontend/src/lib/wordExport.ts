// Lightweight, universal Word export (client CR-B-14a). Word opens an HTML document saved with a
// .doc extension and the application/msword MIME type, so we can produce a fully editable Word file
// from any builder's data without a server-side .docx library. Rich-text builders (agreements, RFIs)
// pass their HTML straight through; tabular builders (invoice, RFQ, PO) pass a generated table.
export function downloadHtmlAsWord(title: string, bodyHtml: string, filename: string): void {
  const doc = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${escapeHtml(title)}</title>
<style>
  body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#111;}
  h1{font-size:20pt;margin:0 0 4pt;} h2{font-size:14pt;margin:12pt 0 4pt;} h3{font-size:12pt;margin:10pt 0 3pt;}
  table{border-collapse:collapse;width:100%;margin:8pt 0;} td,th{border:1px solid #999;padding:4pt 8pt;font-size:10pt;vertical-align:top;}
  th{background:#f1f5f9;text-align:left;} .muted{color:#666;} .right{text-align:right;} img{max-width:100%;}
</style></head>
<body>${bodyHtml}</body></html>`;
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
