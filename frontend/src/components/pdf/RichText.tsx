import { Text, View, Image } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { withFileToken } from "../../lib/api";
import { A4, BRAND, GUTTER, abs } from "./brand";

/**
 * HTML from the platform's rich-text editor as react-pdf, in the brand kit's type.
 *
 * Everything the editor lets people do prints: bold, italic, underline, text colour and highlight,
 * headings, bulleted and numbered lists, pictures, and tables with their caption, where each cell
 * keeps its styled text, its line breaks, its pictures and its shading. Plain text (no tags) keeps
 * its line breaks. DOMParser is available in the browser, where these PDFs are generated.
 */

const CONTENT_W = A4.w - 2 * GUTTER;
const HEAD_BG = "#ECFDF5";   // the brand tint on table header rows, as in the editor

type Fmt = { bold?: boolean; italic?: boolean; underline?: boolean; color?: string; bg?: string };
type Run = Fmt & { text: string };

/** A CSS colour the editor wrote, as react-pdf takes it; undefined for "no colour". */
function cssColor(raw?: string | null): string | undefined {
  const s = (raw || "").trim().toLowerCase();
  if (!s || ["inherit", "initial", "transparent", "currentcolor"].includes(s)) return undefined;
  const alpha = /^rgba\(.*,\s*([\d.]+)\s*\)$/.exec(s);
  if (alpha && parseFloat(alpha[1]) === 0) return undefined;   // the browser's "no highlight"
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s)) return s;
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  if (m) return `#${[m[1], m[2], m[3]].map((v) => Math.min(255, Math.round(+v)).toString(16).padStart(2, "0")).join("")}`;
  if (/^[a-z]+$/.test(s)) return s;   // a named colour
  return undefined;
}

/** An image address the PDF renderer can load: uploads carry the file token, the rest are absolute. */
export function pdfAssetUrl(u?: string): string {
  const s = (u || "").replace(/\\/g, "/");
  if (!s) return "";
  if (/^(data:|blob:|https?:)/.test(s)) return s;
  if (/^\/?uploads\//.test(s)) return abs(withFileToken(`/${s.replace(/^\/+/, "")}`));
  return abs(s);
}

const BLOCK = /^(P|DIV|LI|H[1-6]|UL|OL|TR|TABLE|BLOCKQUOTE|SECTION|ARTICLE)$/;

// Walk inline content, carrying the styling down; a line break (or the end of a block inside a
// list item or a table cell) becomes a "\n" run. Source whitespace collapses the way a browser
// collapses it. Pictures are placed separately.
function collect(node: ChildNode, f: Fmt, out: Run[]) {
  if (node.nodeType === 3) {
    const t = (node.textContent || "").replace(/\s+/g, " ");
    if (t) out.push({ ...f, text: t });
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();
  if (tag === "BR") { out.push({ ...f, text: "\n" }); return; }
  if (tag === "IMG") return;
  const st = el.style;
  const next: Fmt = {
    bold: f.bold || /^(B|STRONG|TH)$/.test(tag) || /^(bold|[6-9]00)$/.test(st?.fontWeight || ""),
    italic: f.italic || tag === "I" || tag === "EM" || st?.fontStyle === "italic",
    underline: f.underline || tag === "U" || /underline/.test(st?.textDecoration || ""),
    color: cssColor(st?.color) || cssColor(el.getAttribute("color")) || f.color,
    bg: cssColor(st?.backgroundColor) || (tag === "MARK" ? "#FEF08A" : f.bg),
  };
  el.childNodes.forEach((c) => collect(c, next, out));
  if (BLOCK.test(tag)) out.push({ ...f, text: "\n" });
}

// Drop whitespace-only runs at either end, so a paragraph never starts or ends on a blank line.
function tidy(runs: Run[]): Run[] {
  let a = 0, b = runs.length;
  while (a < b && !runs[a].text.trim()) a++;
  while (b > a && !runs[b - 1].text.trim()) b--;
  return runs.slice(a, b);
}

function inline(runs: Run[]): ReactNode[] {
  return runs.map((r, i) => (
    <Text
      key={i}
      style={{
        // Inter is registered without an italic face; italic runs use Helvetica's oblique so they
        // stay visibly italic.
        fontFamily: r.italic ? "Helvetica" : "Inter",
        fontWeight: r.bold ? 700 : 400,
        fontStyle: r.italic ? "italic" : "normal",
        textDecoration: r.underline ? "underline" : "none",
        ...(r.color ? { color: r.color } : {}),
        ...(r.bg ? { backgroundColor: r.bg } : {}),
      }}
    >
      {r.text}
    </Text>
  ));
}

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

export default function RichText({ html, size = 9.5 }: { html: string; size?: number }) {
  if (!html || !html.trim()) return null;
  const src = /<[a-z][\s\S]*>/i.test(html) ? html : html.split(/\r?\n/).map(escapeHtml).join("<br>");
  const doc = new DOMParser().parseFromString(`<body>${src}</body>`, "text/html");
  const out: ReactNode[] = [];
  let k = 0;

  const pStyle = { fontSize: size, lineHeight: 1.5, color: BRAND.s700, marginBottom: 5 };
  const hStyle = (tag: string) => {
    const lvl = Number(tag[1]);
    return { fontSize: lvl <= 1 ? size + 3.5 : lvl === 2 ? size + 2 : lvl === 3 ? size + 1 : size + 0.5, lineHeight: 1.3, color: BRAND.slate, marginTop: lvl <= 2 ? 6 : 4, marginBottom: 3 };
  };
  const para = (runs: Run[], style: object) => {
    const r = tidy(runs);
    if (!r.some((x) => x.text.trim())) return;
    out.push(<Text key={k++} style={style}>{inline(r)}</Text>);
  };
  const image = (el: HTMLElement) => {
    const s = el.getAttribute("src");
    if (!s) return;
    const w = Math.min(parseInt(el.getAttribute("width") || "", 10) || 300, CONTENT_W);
    out.push(<Image key={k++} src={pdfAssetUrl(s)} style={{ width: w, marginVertical: 6, alignSelf: "flex-start", objectFit: "contain" }} />);
  };
  const list = (el: HTMLElement, ordered: boolean) => {
    Array.from(el.children).forEach((li, i) => {
      const r: Run[] = [];
      li.childNodes.forEach((c) => collect(c, {}, r));
      const t = tidy(r);
      if (!t.some((x) => x.text.trim())) return;
      out.push(
        <View key={k++} style={{ flexDirection: "row", marginBottom: 3, paddingLeft: 4 }} wrap={false}>
          <Text style={{ width: 14, fontSize: size, lineHeight: 1.5, color: BRAND.emerald }}>{ordered ? `${i + 1}.` : "•"}</Text>
          <Text style={{ flex: 1, fontSize: size, lineHeight: 1.5, color: BRAND.s700 }}>{inline(t)}</Text>
        </View>,
      );
    });
  };
  const table = (tbl: HTMLElement) => {
    const rows = Array.from(tbl.querySelectorAll("tr"));
    if (!rows.length) return;
    const caption = (tbl.querySelector("caption")?.textContent || "").trim();
    out.push(
      <View key={k++} style={{ marginVertical: 6 }}>
        {/* CR-P (40) — the caption sits right above its table and never ends a page on its own. */}
        {!!caption && <Text minPresenceAhead={40} style={{ fontSize: size - 1, fontWeight: 700, color: BRAND.slate, marginBottom: 3, lineHeight: 1.3 }}>{caption}</Text>}
        <View style={{ borderTop: `0.6 solid ${BRAND.s300}`, borderLeft: `0.6 solid ${BRAND.s300}` }}>
          {rows.map((tr, ri) => {
            const cells = Array.from(tr.children).filter((c) => /^(TD|TH)$/.test(c.tagName)) as HTMLElement[];
            if (!cells.length) return null;
            const head = cells.some((c) => c.tagName === "TH");
            return (
              <View key={ri} style={{ flexDirection: "row" }} wrap={false}>
                {cells.map((c, ci) => {
                  // CR-P (37)/(38) — the cell keeps its styled text, line breaks, pictures and shading.
                  const r: Run[] = [];
                  const base: Fmt = { bold: c.tagName === "TH", color: cssColor(c.style?.color) };
                  c.childNodes.forEach((n) => collect(n, base, r));
                  const t = tidy(r);
                  const pics = Array.from(c.querySelectorAll("img")).map((im) => im.getAttribute("src") || "").filter(Boolean);
                  const bg = cssColor(c.style?.backgroundColor) || cssColor(c.getAttribute("bgcolor")) || (head ? HEAD_BG : ri % 2 === 0 ? undefined : BRAND.mist);
                  return (
                    <View key={ci} style={{ flex: 1, padding: 5, borderRight: `0.6 solid ${BRAND.s300}`, borderBottom: `0.6 solid ${BRAND.s300}`, ...(bg ? { backgroundColor: bg } : {}) }}>
                      {t.some((x) => x.text.trim()) && <Text style={{ fontSize: size - 1, lineHeight: 1.35, color: BRAND.slate }}>{inline(t)}</Text>}
                      {pics.map((u, pi) => <Image key={pi} src={pdfAssetUrl(u)} style={{ maxWidth: "100%", maxHeight: 150, objectFit: "contain", marginTop: 3 }} />)}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </View>,
    );
  };

  const walk = (nodes: ChildNode[]) => {
    let run: Run[] = [];
    const flush = () => { para(run, pStyle); run = []; };
    for (const node of nodes) {
      if (node.nodeType === 3) { collect(node, {}, run); continue; }
      if (node.nodeType !== 1) continue;
      const el = node as HTMLElement;
      const tag = el.tagName.toUpperCase();
      if (tag === "IMG") { flush(); image(el); continue; }
      if (tag === "TABLE") { flush(); table(el); continue; }
      if (tag === "UL" || tag === "OL") { flush(); list(el, tag === "OL"); continue; }
      if (tag === "BR") { run.push({ text: "\n" }); continue; }
      if (/^H[1-6]$/.test(tag)) {
        flush();
        const r: Run[] = [];
        el.childNodes.forEach((c) => collect(c, { bold: true }, r));
        para(r, hStyle(tag));
        continue;
      }
      if (/^(P|DIV|BLOCKQUOTE|SECTION|ARTICLE)$/.test(tag)) {
        flush();
        // A block that holds pictures, tables or lists is walked in order, so nothing is lost.
        if (el.querySelector("img, table, ul, ol")) { walk(Array.from(el.childNodes)); continue; }
        const r: Run[] = [];
        el.childNodes.forEach((c) => collect(c, {}, r));
        para(r, pStyle);
        continue;
      }
      collect(el, {}, run);   // an inline element at the top level joins the current paragraph
    }
    flush();
  };
  walk(Array.from(doc.body.childNodes));
  return <>{out}</>;
}
