import * as XLSX from "xlsx";
import { downloadHtmlAsWord, escapeHtml } from "./wordExport";
import { fmtDay } from "./projectSchedule";
import {
  WIP_ACTIVE_COLUMNS, WIP_ACTIVE_TITLE, WIP_BADGE, WIP_DEFS_TITLE, WIP_OPPS_COLUMNS, WIP_OPPS_TITLE, WIP_TITLE,
  usd, wipActive, wipDefinitions, wipOpportunities, type WipInput,
} from "./wipData";

/**
 * 2026-10-09 - the WIP report as an Excel sheet and as a Word document, to change or add to by hand.
 * The figures are the PDF's (lib/wipData). In Excel the worked-out columns are live formulas, as the
 * report's definitions give them, so a figure typed in carries through: Revenue Earned, Remaining
 * Contract Value, Estimated Gross Profit, Weighted Contract Value and every total.
 */

const MONEY = '"$"#,##0;[Red]("$"#,##0)';
const oneLine = (label: string) => label.replace(/\n/g, " ");
const projectText = (name: string, description?: string) => [name, (description || "").trim()].filter(Boolean).join("\n");

export function buildWipExcel(o: WipInput): Blob {
  const showPlace = o.location !== false;
  const placed = <T,>(xs: T[]) => (showPlace ? xs : xs.slice(0, -1));
  const today = new Date();
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  let row = 0;
  let maxCol = 0;
  const at = (c: number, r: number) => XLSX.utils.encode_cell({ c, r });
  const col = (c: number) => XLSX.utils.encode_col(c);
  const put = (c: number, r: number, cell: XLSX.CellObject) => { ws[at(c, r)] = cell; maxCol = Math.max(maxCol, c); };
  const text = (c: number, r: number, v: string) => { if (v) put(c, r, { t: "s", v }); };
  const money = (c: number, r: number, v: number | null, f?: string) => {
    if (v === null && !f) return;   // left empty, to be typed in; the formulas read it as blank
    put(c, r, { t: "n", v: v ?? 0, z: MONEY, ...(f ? { f } : {}) });
  };
  const line = (c: number, r: number, v: string, span: number) => { text(c, r, v); if (span > 1) merges.push({ s: { c, r }, e: { c: c + span - 1, r } }); };

  const width = Math.max(o.current ? placed(WIP_ACTIVE_COLUMNS).length : 0, o.opportunities ? placed(WIP_OPPS_COLUMNS).length : 0, 11);

  // The heading, as the report sets it.
  line(0, row, WIP_TITLE.replace(/\s+\|\s+/, " | "), width - 3);
  line(width - 3, row, WIP_BADGE, 3);
  row++;
  line(0, row, `Report as of: ${fmtDay(today)}`, width);
  row += 2;

  // ── 1. Active Projects - Contract Backlog ──
  if (o.current) {
    const rows = wipActive(o);
    line(0, row++, WIP_ACTIVE_TITLE, width);
    placed(WIP_ACTIVE_COLUMNS).forEach((h, c) => text(c, row, oneLine(h)));
    row++;
    const first = row + 1;   // Excel's row numbers count from 1
    for (const r of rows) {
      const R = row + 1;
      text(0, row, r.customer);
      text(1, row, projectText(r.p.name, r.p.description));
      text(2, row, r.prime); text(3, row, r.contractType); text(4, row, r.competition); text(5, row, r.start); text(6, row, r.end);
      money(7, row, r.value);
      // Revenue earned: cost to cost once a cost to complete is in column M; until then the work
      // complete on the timeline (its % is kept in the formula).
      money(8, row, r.earned, `IF(ISNUMBER(M${R}),IF(L${R}+M${R}=0,0,MIN(H${R},H${R}*L${R}/(L${R}+M${R}))),H${R}*${r.workPct}/100)`);
      money(9, row, r.remaining, `H${R}-I${R}`);
      money(10, row, r.invoiced);
      money(11, row, r.costs);
      money(12, row, r.ctc);
      put(13, row, r.profit !== null ? { t: "n", v: r.profit, z: MONEY, f: `IF(ISNUMBER(M${R}),H${R}-(L${R}+M${R}),"")` } : { t: "s", v: "", f: `IF(ISNUMBER(M${R}),H${R}-(L${R}+M${R}),"")` });
      if (showPlace) text(14, row, r.place);
      row++;
    }
    const last = row;
    text(0, row, "TOTAL");
    if (rows.length) {
      const sumOf = (c: number, v: number) => money(c, row, v, `SUM(${col(c)}${first}:${col(c)}${last})`);
      sumOf(7, rows.reduce((s, r) => s + r.value, 0));
      sumOf(8, rows.reduce((s, r) => s + r.earned, 0));
      sumOf(9, rows.reduce((s, r) => s + r.remaining, 0));
      sumOf(10, rows.reduce((s, r) => s + r.invoiced, 0));
      sumOf(11, rows.reduce((s, r) => s + r.costs, 0));
      sumOf(12, rows.reduce((s, r) => s + (r.ctc ?? 0), 0));
      sumOf(13, rows.reduce((s, r) => s + (r.profit ?? 0), 0));
    }
    row += 3;
  }

  // ── 2. Potential Projects - Revenue Capture Opportunities ──
  if (o.opportunities) {
    const rows = wipOpportunities(o);
    line(0, row++, WIP_OPPS_TITLE, width);
    placed(WIP_OPPS_COLUMNS).forEach((h, c) => text(c, row, oneLine(h)));
    row++;
    const first = row + 1;
    for (const r of rows) {
      const R = row + 1;
      text(0, row, r.customer);
      text(1, row, projectText(r.p.name, r.p.description));
      text(2, row, r.prime); text(3, row, r.contractType); text(4, row, r.competition); text(5, row, r.start); text(6, row, r.end);
      money(7, row, r.value);
      if (r.pwin !== null) put(8, row, { t: "n", v: r.pwin, z: '0"%"' });
      put(9, row, r.weighted !== null ? { t: "n", v: r.weighted, z: MONEY, f: `IF(ISNUMBER(I${R}),H${R}*I${R}/100,"")` } : { t: "s", v: "", f: `IF(ISNUMBER(I${R}),H${R}*I${R}/100,"")` });
      if (showPlace) text(10, row, r.place);
      row++;
    }
    const last = row;
    text(0, row, "TOTAL");
    if (rows.length) {
      money(7, row, rows.reduce((s, r) => s + r.value, 0), `SUM(H${first}:H${last})`);
      money(9, row, rows.reduce((s, r) => s + (r.weighted ?? 0), 0), `SUM(J${first}:J${last})`);
    }
    row += 3;
  }

  // ── 3. Formulas & Report Definitions ──
  const defs = wipDefinitions(showPlace);
  line(0, row++, WIP_DEFS_TITLE, width);
  for (const d of [...defs.left, ...defs.right]) line(0, row++, d, width);
  row++;
  line(0, row, `Figures from the GreenTech project system (${o.scope}), as of ${fmtDay(today)}.`, width);

  ws["!ref"] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: Math.max(maxCol, width - 1), r: row } });
  ws["!merges"] = merges;
  ws["!cols"] = [26, 46, 18, 16, 20, 11, 11, 15, 15, 17, 15, 15, 15, 17, 24].slice(0, Math.max(width, 11)).map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "WIP Report");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** The WIP report as a Word document (landscape), to edit by hand. Saved as `filename`. */
export function downloadWipWord(o: WipInput, filename: string) {
  const showPlace = o.location !== false;
  const placed = <T,>(xs: T[]) => (showPlace ? xs : xs.slice(0, -1));
  const today = new Date();
  const e = escapeHtml;
  const th = (h: string) => `<th style="text-align:center;text-transform:none;font-size:8.5pt;vertical-align:middle">${e(h).replace(/\n/g, "<br>")}</th>`;
  const td = (v: string, left = false, bold = false) => `<td style="text-align:${left ? "left" : "center"};vertical-align:middle;${bold ? "font-weight:bold;" : ""}">${v}</td>`;
  const project = (name: string, description?: string) => `<b>${e(name)}</b>${description?.trim() ? `<br><span class="muted" style="font-size:8.5pt">${e(description.trim())}</span>` : ""}`;
  const money = (n: number | null) => (n === null ? "-" : e(usd(Math.round(n))));
  const totalRow = (cells: string[]) => `<tr style="background:#EEF2F6">${cells.map((c, i) => `<td style="font-weight:bold;text-align:${i === 0 ? "left" : "center"}">${e(c)}</td>`).join("")}</tr>`;
  const section = (title: string) => `<p style="font-size:13pt;font-weight:bold;color:#0F172A;margin:16pt 0 6pt">${e(title)}</p>`;

  let html = `<table style="border:none;margin:0 0 4pt"><tr>
    <td style="border:none;padding:0;vertical-align:bottom"><span style="font-size:15pt;font-weight:bold;color:#0F172A">${e(WIP_TITLE.replace(/\s+\|\s+/, " | "))}</span><br><span class="muted">Report as of: ${e(fmtDay(today))}</span></td>
    <td style="border:none;padding:0;text-align:right;vertical-align:bottom"><span style="font-size:20pt;font-weight:bold;color:#10B981">${e(WIP_BADGE)}</span></td>
  </tr></table>`;

  if (o.current) {
    const rows = wipActive(o);
    const sum = (f: (r: (typeof rows)[number]) => number | null) => usd(Math.round(rows.reduce((s, r) => s + (f(r) ?? 0), 0)));
    html += section(WIP_ACTIVE_TITLE);
    html += `<table><thead><tr>${placed(WIP_ACTIVE_COLUMNS).map(th).join("")}</tr></thead><tbody>`;
    html += rows.length ? rows.map((r) => `<tr>${[
      td(`<b>${e(r.customer || "-")}</b>`, true), td(project(r.p.name, r.p.description), true), td(e(r.prime)), td(e(r.contractType || "-")), td(e(r.competition || "-")),
      td(e(r.start || "-")), td(e(r.end || "-")), td(money(r.value)), td(money(r.earned)), td(money(r.remaining)), td(money(r.invoiced)), td(money(r.costs)),
      td(money(r.ctc)), td(money(r.profit)), ...(showPlace ? [td(e(r.place || "-"))] : []),
    ].join("")}</tr>`).join("") + totalRow(["TOTAL", "", "", "", "", "", "", sum((r) => r.value), sum((r) => r.earned), sum((r) => r.remaining), sum((r) => r.invoiced), sum((r) => r.costs), sum((r) => r.ctc), sum((r) => r.profit), ...(showPlace ? [""] : [])])
      : `<tr><td colspan="${placed(WIP_ACTIVE_COLUMNS).length}" class="muted">No active projects.</td></tr>`;
    html += `</tbody></table>`;
  }

  if (o.opportunities) {
    const rows = wipOpportunities(o);
    html += section(WIP_OPPS_TITLE);
    html += `<table><thead><tr>${placed(WIP_OPPS_COLUMNS).map(th).join("")}</tr></thead><tbody>`;
    html += rows.length ? rows.map((r) => `<tr>${[
      td(`<b>${e(r.customer || "-")}</b>`, true), td(project(r.p.name, r.p.description), true), td(e(r.prime)), td(e(r.contractType || "-")), td(e(r.competition || "-")),
      td(e(r.start)), td(e(r.end)), td(money(r.value)), td(r.pwin !== null ? `${r.pwin}%` : "-"), td(money(r.weighted)), ...(showPlace ? [td(e(r.place || "-"))] : []),
    ].join("")}</tr>`).join("") + totalRow(["TOTAL", "", "", "", "", "", "", usd(rows.reduce((s, r) => s + r.value, 0)), "", usd(Math.round(rows.reduce((s, r) => s + (r.weighted ?? 0), 0))), ...(showPlace ? [""] : [])])
      : `<tr><td colspan="${placed(WIP_OPPS_COLUMNS).length}" class="muted">No proposals out.</td></tr>`;
    html += `</tbody></table>`;
  }

  const defs = wipDefinitions(showPlace);
  const list = (items: string[]) => items.map((t) => `<p style="margin:0 0 6pt;font-size:9.5pt;color:#475569">${e(t)}</p>`).join("");
  html += section(WIP_DEFS_TITLE);
  html += `<table style="background:#F8FAFC"><tr><td style="width:50%;padding:8pt 12pt">${list(defs.left)}</td><td style="width:50%;padding:8pt 12pt">${list(defs.right)}</td></tr></table>`;
  html += `<p class="muted" style="font-size:8.5pt">Figures from the GreenTech project system (${e(o.scope)}), as of ${e(fmtDay(today))}.</p>`;

  downloadHtmlAsWord("Work in Progress (WIP) Report", html, filename, { width: "22in", height: "17in", margin: "0.8in 0.6in 0.8in 0.6in" });
}
