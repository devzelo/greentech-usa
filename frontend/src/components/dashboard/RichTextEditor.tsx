import { useEffect, useRef, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  Image as ImageIcon, Table as TableIcon, Loader2, Baseline, Highlighter,
  Type, ChevronDown, Superscript, Trash2, Rows3, Columns3, X, Maximize2, Minimize2, RemoveFormatting,
} from "lucide-react";
import { TABLE_CELL_CSS, TABLE_HEAD_CSS, TABLE_CAPTION_CSS, DOC_COLORS } from "../../lib/docStyle";
import { fileTokenSrc, stripFileTokensInHtml, withFileTokensInHtml } from "../../lib/api";

/**
 * Rich-text editor backed by a contentEditable surface. Emits HTML via onChange
 * so the value can be persisted and rendered into the proposal/agreement PDF.
 * No external editor dependency — formatting uses the browser's execCommand plus
 * a little Range/DOM work for the things execCommand can't do.
 *
 * Client requests covered (client-change-requests-2026-08-10 · CR-B-05…13):
 *  - Font family (Aptos, Arial, Times New Roman, …)
 *  - Block styles: Normal / Header 1–4
 *  - Font size 3–48
 *  - Footnotes
 *  - Text color + text highlight
 *  - Insert table via a rows/columns prompt; edit table (add/delete row & column,
 *    delete table, toggle borders, shade cell, insert picture into a cell)
 *  - Insert picture with resize + side-by-side (float) layout
 */

const FONTS: { label: string; stack: string }[] = [
  { label: "Aptos", stack: "'Aptos', 'Segoe UI', system-ui, sans-serif" },
  { label: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { label: "Calibri", stack: "Calibri, 'Segoe UI', sans-serif" },
  { label: "Times New Roman", stack: "'Times New Roman', Times, serif" },
  { label: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
  { label: "Garamond", stack: "Garamond, Georgia, serif" },
  { label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", stack: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", stack: "'Trebuchet MS', Tahoma, sans-serif" },
  { label: "Courier New", stack: "'Courier New', Courier, monospace" },
];

const BLOCKS: { label: string; tag: string }[] = [
  { label: "Normal", tag: "P" },
  { label: "Header 1", tag: "H1" },
  { label: "Header 2", tag: "H2" },
  { label: "Header 3", tag: "H3" },
  { label: "Header 4", tag: "H4" },
];

const SIZES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48];

// Client listed: black, white, blue, orange, green, red, purple, etc.
const TEXT_COLORS = [
  "#000000", "#334155", "#64748b", "#ffffff",
  "#dc2626", "#ea580c", "#d97706", "#16a34a",
  "#0d9488", "#2563eb", "#4f46e5", "#7c3aed",
];
// Client listed: red, yellow, green, orange, etc.
const HIGHLIGHTS = [
  "#fef08a", "#bbf7d0", "#fed7aa", "#fecaca",
  "#bfdbfe", "#e9d5ff", "#fbcfe8", "transparent",
];

// CR-P (41) — table styling comes from the shared document style system, so a table looks the
// same while it is being typed as it does once the document is printed.
const CELL_BORDER = TABLE_CELL_CSS;
const HEAD_STYLE = TABLE_HEAD_CSS;

/**
 * 2026-10-06 - "Use default style": text pasted from elsewhere (a website, Word) brings its own
 * fonts, sizes, colours, links and highlights. This keeps only the structure (paragraphs, line
 * breaks, lists, tables, pictures) and drops every other tag and attribute, so the text takes
 * GreenTech's default style.
 */
const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "SECTION", "ARTICLE", "HEADER", "FOOTER", "ADDRESS", "FIGURE", "FIGCAPTION", "DT", "DD"]);
const KEEP_TAGS = new Set(["UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "CAPTION", "IMG", "BR"]);
const DROP_TAGS = new Set(["STYLE", "SCRIPT", "META", "LINK", "TITLE", "NOSCRIPT", "TEMPLATE", "IFRAME", "OBJECT", "svg", "SVG", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]);
function cleanNode(node: Node, out: Node, doc: Document) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) { out.appendChild(doc.createTextNode(child.textContent || "")); return; }
    if (child.nodeType !== Node.ELEMENT_NODE) return;   // comments (Word's <!-- --> blocks)
    const el = child as HTMLElement;
    const tag = el.tagName.toUpperCase();
    if (DROP_TAGS.has(el.tagName) || DROP_TAGS.has(tag) || tag.includes(":")) return;   // and Word's <o:p>
    if (KEEP_TAGS.has(tag) || BLOCK_TAGS.has(tag)) {
      const keep = doc.createElement(BLOCK_TAGS.has(tag) ? "p" : tag.toLowerCase());
      if (tag === "IMG") { const src = el.getAttribute("src"); if (!src) return; keep.setAttribute("src", src); const alt = el.getAttribute("alt"); if (alt) keep.setAttribute("alt", alt); const w = el.style.width; if (w) (keep as HTMLElement).style.width = w; }
      if (tag === "TD" || tag === "TH") for (const a of ["colspan", "rowspan"]) { const v = el.getAttribute(a); if (v) keep.setAttribute(a, v); }
      // A paragraph inside a list item or a cell adds nothing but a gap.
      const target = BLOCK_TAGS.has(tag) && out instanceof HTMLElement && ["LI", "TD", "TH", "P"].includes(out.tagName) ? out : keep;
      // Two paragraphs in one list item or cell stay on separate lines.
      if (target === out && out.textContent?.trim() && out.lastChild?.nodeName !== "BR") out.appendChild(doc.createElement("br"));
      cleanNode(el, target, doc);
      if (target === keep && !(BLOCK_TAGS.has(tag) && !keep.textContent?.trim() && !keep.querySelector("img,br"))) out.appendChild(keep);
      return;
    }
    cleanNode(el, out, doc);   // span, font, a, b, strong, i, em, u, sup, mark... : the text stays, the formatting goes
  });
}
export function toDefaultStyle(html: string): string {
  const doc = document.implementation.createHTMLDocument("");
  const src = doc.createElement("div");
  src.innerHTML = html;
  const out = doc.createElement("div");
  cleanNode(src, out, doc);
  // Loose text at the top level goes into paragraphs.
  const wrapped = doc.createElement("div");
  let para: HTMLElement | null = null;
  out.childNodes.forEach((n) => {
    const inline = n.nodeType === Node.TEXT_NODE || n.nodeName === "BR";
    if (inline) { if (!para) { para = doc.createElement("p"); wrapped.appendChild(para); } para.appendChild(n.cloneNode(true)); }
    else { para = null; wrapped.appendChild(n.cloneNode(true)); }
  });
  wrapped.querySelectorAll("p").forEach((pEl) => { while (pEl.lastChild && pEl.lastChild.nodeName === "BR") pEl.removeChild(pEl.lastChild); if (!pEl.textContent?.trim() && !pEl.querySelector("img")) pEl.remove(); });
  return wrapped.innerHTML.replace(/\u00a0/g, " ");
}

export default function RichTextEditor({
  value,
  onChange,
  disabled,
  placeholder,
  minHeight = 160,
  onImageUpload,
  draftKey,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
  onImageUpload?: (file: File) => Promise<string>;
  draftKey?: string;   // CR-B-14b — persist an offline local draft under this key
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);
  const selImgRef = useRef<HTMLImageElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [menu, setMenu] = useState<null | "style" | "font" | "size" | "color" | "highlight" | "table">(null);
  const [selImg, setSelImg] = useState<HTMLImageElement | null>(null);
  const [tableDims, setTableDims] = useState({ rows: 3, cols: 3 });
  const [tableTitle, setTableTitleInput] = useState("");   // CR-P (40)
  const [fullscreen, setFullscreen] = useState(false); // CR-B-02 — bigger editing area
  // Active formatting under the caret — drives the toolbar's "what's selected" highlighting.
  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false, strike: false, ul: false, ol: false, block: "P", font: "" });
  const [localDraft, setLocalDraft] = useState<string | null>(null); // CR-B-14b — recovered offline draft

  // Sync external value in only when it differs, so typing doesn't reset the caret.
  // CR-P-49 — `fullscreen` is a dep: toggling full screen re-mounts the contentEditable node
  // (inline ⇄ portal), so we must re-apply the current value or the content would appear to vanish.
  useEffect(() => {
    const el = ref.current;
    // 2026-10-08 - our pictures need the file token to show; it is never part of the saved text.
    if (el && stripFileTokensInHtml(el.innerHTML) !== (value || "")) el.innerHTML = withFileTokensInHtml(value || "");
    // Once the server value matches the saved draft, the local copy is no longer needed.
    if (draftKey && value) { try { if (localStorage.getItem(`rte:${draftKey}`) === value) localStorage.removeItem(`rte:${draftKey}`); } catch { /* ignore */ } }
  }, [value, draftKey, fullscreen]);

  // On mount, offer to restore an unsaved local draft (e.g. after an offline reload).
  useEffect(() => {
    if (!draftKey) return;
    try { const d = localStorage.getItem(`rte:${draftKey}`); if (d && d !== (value || "")) setLocalDraft(d); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const emit = () => {
    if (!ref.current) return;
    const html = stripFileTokensInHtml(ref.current.innerHTML);
    if (draftKey) { try { localStorage.setItem(`rte:${draftKey}`, html); } catch { /* quota/full — ignore */ } }
    onChange(html);
  };

  // Remember the caret/selection so toolbar popovers (which can steal focus) can
  // restore it before applying a command.
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ref.current && ref.current.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };
  const restoreSelection = () => {
    const sel = window.getSelection();
    if (sel && savedRange.current) { sel.removeAllRanges(); sel.addRange(savedRange.current); }
  };

  const focusEditor = () => { ref.current?.focus(); restoreSelection(); };
  // "Use default style": the selected text, or the whole box when nothing is selected.
  const useDefaultStyle = () => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    const inside = sel && sel.rangeCount && !sel.isCollapsed && el.contains(sel.getRangeAt(0).commonAncestorContainer);
    if (inside) {
      const box = document.createElement("div");
      box.appendChild(sel!.getRangeAt(0).cloneContents());
      document.execCommand("insertHTML", false, toDefaultStyle(box.innerHTML) || " ");
    } else {
      el.innerHTML = toDefaultStyle(el.innerHTML);
    }
    emit();
  };

  // execCommand without CSS styling (structural: bold/italic/lists/blocks).
  // Read the formatting under the caret so the toolbar can show what's active (bold/italic/…,
  // current paragraph style, current font). Only runs when the caret is inside THIS editor.
  const refreshFmt = () => {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
    try {
      let block = String(document.queryCommandValue("formatBlock") || "").toUpperCase();
      if (!block || block === "DIV") block = "P";
      const font = String(document.queryCommandValue("fontName") || "").replace(/['"]/g, "").toLowerCase();
      setFmt({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strike: document.queryCommandState("strikeThrough"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
        block, font,
      });
    } catch { /* queryCommand* can throw in odd selection states */ }
  };
  useEffect(() => {
    document.addEventListener("selectionchange", refreshFmt);
    return () => document.removeEventListener("selectionchange", refreshFmt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (command: string, arg?: string) => {
    if (disabled) return;
    focusEditor();
    document.execCommand(command, false, arg);
    emit();
    refreshFmt();
  };
  // execCommand with CSS styling (color/highlight/font-family → inline style spans).
  const execCss = (command: string, arg?: string) => {
    if (disabled) return;
    focusEditor();
    try { document.execCommand("styleWithCSS", false, "true"); } catch { /* older browsers */ }
    document.execCommand(command, false, arg);
    try { document.execCommand("styleWithCSS", false, "false"); } catch { /* noop */ }
    emit();
    refreshFmt();
  };
  const insertHtml = (html: string) => {
    if (disabled) return;
    focusEditor();
    document.execCommand("insertHTML", false, html);
    emit();
  };

  // Font size — execCommand only supports 1–7, so wrap the selection in a styled span.
  const setSize = (px: number) => {
    if (disabled) return;
    focusEditor();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return; // needs a selection
    const range = sel.getRangeAt(0);
    const span = document.createElement("span");
    span.style.fontSize = `${px}px`;
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
      sel.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents(span);
      sel.addRange(r);
    } catch { /* selection spanned block boundaries — ignore */ }
    emit();
  };

  const setFont = (stack: string) => execCss("fontName", stack);
  const setColor = (c: string) => execCss("foreColor", c);
  const setHighlight = (c: string) => {
    if (disabled) return;
    focusEditor();
    try { document.execCommand("styleWithCSS", false, "true"); } catch { /* older browsers */ }
    // hiliteColor is the standard; some engines only honor backColor.
    if (!document.execCommand("hiliteColor", false, c)) document.execCommand("backColor", false, c);
    try { document.execCommand("styleWithCSS", false, "false"); } catch { /* noop */ }
    emit();
  };
  const setBlock = (tag: string) => exec("formatBlock", tag);

  // Footnote: superscript marker at the caret + a numbered note filed at the end.
  const insertFootnote = () => {
    const el = ref.current; if (!el || disabled) return;
    focusEditor();
    const n = el.querySelectorAll("sup[data-fn]").length + 1;
    insertHtml(`<sup data-fn="${n}">[${n}]</sup>`);
    let cont = el.querySelector("ol.rte-footnotes");
    if (!cont) {
      el.insertAdjacentHTML("beforeend", `<hr class="rte-fn-sep" contenteditable="false"/><ol class="rte-footnotes"></ol>`);
      cont = el.querySelector("ol.rte-footnotes");
    }
    const li = document.createElement("li");
    li.textContent = "Footnote text…";
    cont?.appendChild(li);
    emit();
  };

  // ── Tables ────────────────────────────────────────────────────────────────
  // CR-P (40) — the table's title is its own <caption>, not a paragraph above it. A paragraph
  // drifted away from the table ("this is too far from the table"); a caption is part of the
  // table element, so it can never separate from it however the document reflows.
  const escapeHtmlText = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const nextTableNo = () => (ref.current?.querySelectorAll("table").length || 0) + 1;
  const insertTable = (rows: number, cols: number, title: string) => {
    const r = Math.max(1, Math.min(30, rows));
    const c = Math.max(1, Math.min(12, cols));
    const cell = (tag: "th" | "td", text: string) => `<${tag} style="${tag === "th" ? HEAD_STYLE : CELL_BORDER}">${text}</${tag}>`;
    const head = `<tr>${Array.from({ length: c }, (_, i) => cell("th", `Header ${i + 1}`)).join("")}</tr>`;
    const bodyRow = `<tr>${Array.from({ length: c }, () => cell("td", "&nbsp;")).join("")}</tr>`;
    const body = Array.from({ length: r - 1 }, () => bodyRow).join("");
    const caption = title.trim() ? `<caption style="${TABLE_CAPTION_CSS}">${escapeHtmlText(title.trim())}</caption>` : "";
    insertHtml(`<table style="border-collapse:collapse;width:100%;margin:8px 0;" border="1">${caption}<tbody>${head}${body}</tbody></table><p><br/></p>`);
  };

  // Add or edit the title of the table the caret is inside.
  const setTableTitle = () => {
    const tbl = selectedTable();
    if (!tbl) return;
    const existing = tbl.querySelector("caption");
    const next = window.prompt("Table title", existing?.textContent || `Table ${nextTableNo() - 1}: `);
    if (next === null) return;
    if (!next.trim()) { existing?.remove(); emit(); return; }
    if (existing) existing.textContent = next.trim();
    else {
      const cap = document.createElement("caption");
      cap.setAttribute("style", TABLE_CAPTION_CSS);
      cap.textContent = next.trim();
      tbl.insertBefore(cap, tbl.firstChild);
    }
    emit();
  };

  const selectedTable = (): HTMLTableElement | null => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !ref.current) return null;
    let n: Node | null = sel.anchorNode;
    while (n && n !== ref.current) { if (n.nodeType === 1 && (n as HTMLElement).tagName === "TABLE") return n as HTMLTableElement; n = n.parentNode; }
    return null;
  };
  const ancestor = (tag: string): HTMLElement | null => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !ref.current) return null;
    let n: Node | null = sel.anchorNode;
    while (n && n !== ref.current) { if (n.nodeType === 1 && (n as HTMLElement).tagName === tag) return n as HTMLElement; n = n.parentNode; }
    return null;
  };

  const addRow = () => {
    const t = selectedTable(); if (!t) return;
    const body = t.tBodies[0] || t; const cols = body.rows[0]?.cells.length || 3;
    const tr = body.insertRow(-1);
    for (let i = 0; i < cols; i++) { const td = tr.insertCell(-1); td.setAttribute("style", CELL_BORDER); td.innerHTML = "&nbsp;"; }
    emit();
  };
  const addCol = () => {
    const t = selectedTable(); if (!t) return;
    Array.from(t.rows).forEach((row) => {
      const isHead = row.cells[0]?.tagName === "TH";
      const c = row.insertCell(-1);
      if (isHead) { const th = document.createElement("th"); th.setAttribute("style", HEAD_STYLE); th.innerHTML = "Header"; row.replaceChild(th, c); }
      else { c.setAttribute("style", CELL_BORDER); c.innerHTML = "&nbsp;"; }
    });
    emit();
  };
  const deleteRow = () => {
    const tr = ancestor("TR"); if (!tr) return;
    (tr as HTMLTableRowElement).remove(); emit();
  };
  const deleteCol = () => {
    const t = selectedTable(); const cell = ancestor("TD") || ancestor("TH");
    if (!t || !cell) return;
    const idx = (cell as HTMLTableCellElement).cellIndex;
    Array.from(t.rows).forEach((row) => { if (row.cells[idx]) row.deleteCell(idx); });
    emit();
  };
  const deleteTable = () => { const t = selectedTable(); if (t) { t.remove(); emit(); } };
  const toggleBorders = () => {
    const t = selectedTable(); if (!t) return;
    const on = !/border:1px/.test(t.rows[0]?.cells[0]?.getAttribute("style") || "");
    Array.from(t.rows).forEach((row) => Array.from(row.cells).forEach((cell) => {
      const isHead = cell.tagName === "TH";
      // CR-P (41) — the header keeps the brand tint from lib/docStyle (it was reset to a plain grey).
      const base = isHead ? `padding:6px;min-width:60px;background:${DOC_COLORS.headBg};font-weight:700;text-align:left;` : "padding:6px;min-width:60px;";
      cell.setAttribute("style", (on ? "border:1px solid #cbd5e1;" : "border:none;") + base);
    }));
    emit();
  };
  const shadeCell = (color: string) => {
    const cell = (ancestor("TD") || ancestor("TH")) as HTMLTableCellElement | null;
    if (!cell) return;
    cell.style.background = color === "transparent" ? "" : color;
    emit();
  };
  // CR-B-12 — set the table's border colour and line style on every cell.
  const setTableBorder = (color: string, style: "solid" | "dashed" | "double" = "solid") => {
    const t = selectedTable(); if (!t) return;
    Array.from(t.rows).forEach((row) => Array.from(row.cells).forEach((cell) => {
      cell.style.borderStyle = style;
      cell.style.borderWidth = style === "double" ? "3px" : "1px";
      cell.style.borderColor = color;
    }));
    emit();
  };

  // ── Images ────────────────────────────────────────────────────────────────
  const pickImage = () => { if (!disabled) fileRef.current?.click(); };
  // 2026-10-08 - pick one or several pictures; each can get a description (title), optional,
  // printed small under it. Nothing is uploaded until Insert.
  const [pendingPics, setPendingPics] = useState<Array<{ file: File; preview: string; caption: string }> | null>(null);
  const onImagesPicked = (files: FileList | null) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (fileRef.current) fileRef.current.value = "";
    if (!list.length) return;
    setPendingPics(list.map((file) => ({ file, preview: URL.createObjectURL(file), caption: "" })));
  };
  const closePics = () => { pendingPics?.forEach((p) => URL.revokeObjectURL(p.preview)); setPendingPics(null); };
  const insertPics = async () => {
    if (!pendingPics) return;
    const pics = pendingPics;
    setUploading(true);
    try {
      let html = "";
      for (const p of pics) {
        const url = onImageUpload
          ? await onImageUpload(p.file)
          : await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(p.file); });
        // Shown with the file token straight away (emit takes it out of the saved text).
        const shown = fileTokenSrc(url);
        html += `<img src="${shown}" width="460" style="width:100%;max-width:460px;margin:8px 0 2px;border-radius:4px;" />`;
        html += p.caption.trim()
          ? `<p data-img-caption="1" style="margin:0 0 10px;font-size:11px;color:#64748b;">${escapeHtmlText(p.caption.trim())}</p>`
          : "<p><br/></p>";
      }
      closePics();
      insertHtml(html + "<p><br/></p>");
    } catch (e) { alert(e instanceof Error ? e.message : "Image upload failed."); }
    finally { setUploading(false); }
  };

  // Resize / position for the currently-selected image (CR-B-13).
  const IMG_WIDTHS: { label: string; pct: string; px: number }[] = [
    { label: "25%", pct: "25%", px: 150 },
    { label: "50%", pct: "50%", px: 300 },
    { label: "75%", pct: "75%", px: 450 },
    { label: "100%", pct: "100%", px: 600 },
  ];
  const sizeImg = (w: { pct: string; px: number }) => {
    const img = selImgRef.current; if (!img) return;
    img.style.width = w.pct; img.style.maxWidth = `${w.px}px`; img.setAttribute("width", String(w.px));
    emit();
  };
  const floatImg = (mode: "left" | "right" | "inline" | "center") => {
    const img = selImgRef.current; if (!img) return;
    img.style.float = "none"; img.style.display = "block"; img.style.verticalAlign = "";
    img.style.margin = "8px 0";
    if (mode === "left") { img.style.float = "left"; img.style.display = "inline"; img.style.margin = "8px 12px 8px 0"; }
    else if (mode === "right") { img.style.float = "right"; img.style.display = "inline"; img.style.margin = "8px 0 8px 12px"; }
    else if (mode === "inline") { img.style.display = "inline-block"; img.style.verticalAlign = "top"; img.style.margin = "8px"; }
    else if (mode === "center") { img.style.margin = "8px auto"; }
    emit();
  };

  const onSurfaceMouse = (e: ReactMouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "IMG") { selImgRef.current = t as HTMLImageElement; setSelImg(t as HTMLImageElement); }
    else { selImgRef.current = null; setSelImg(null); }
    saveSelection();
  };

  // Toolbar button (icon) — onMouseDown preventDefault keeps the editor selection.
  const btn = (key: string, title: string, node: ReactNode, run: () => void, active = false) => (
    <button key={key} type="button" title={title} onMouseDown={(e) => { e.preventDefault(); run(); }}
      className={`p-1.5 rounded-lg transition-colors ${active ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"}`}>
      {node}
    </button>
  );
  // 2026-10-06 - the menus open in their own layer above everything (fixed, portaled), under their
  // button: inside the editor's box they were cut off, and inside a window (Edit Identity, New
  // Project) they seemed not to work at all.
  const [menuAt, setMenuAt] = useState<{ top: number; left: number } | null>(null);
  const toggleMenu = (m: typeof menu, at?: DOMRect) => {
    if (at) setMenuAt({ top: at.bottom + 4, left: at.left });
    setMenu((cur) => (cur === m ? null : m));
  };
  const closeMenu = () => setMenu(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { const t = e.target as Node | null; if (t && (t as HTMLElement).closest?.("[data-rte-menu]")) return; setMenu(null); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [menu]);

  // Popover trigger + panel. Panel content stays interactive without losing the
  // editor selection because every control uses onMouseDown preventDefault.
  const popover = (id: NonNullable<typeof menu>, trigger: ReactNode, panel: ReactNode, width = 200, title?: string) => (
    <div className="relative">
      <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); toggleMenu(id, e.currentTarget.getBoundingClientRect()); }}
        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${menu === id ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"}`}>
        {trigger}<ChevronDown size={12} />
      </button>
      {menu === id && menuAt && createPortal(
        <>
          <button type="button" aria-label="Close" onMouseDown={(e) => e.preventDefault()} onClick={closeMenu} className="fixed inset-0 z-[300] cursor-default" />
          <div data-rte-menu onMouseDown={(e) => e.preventDefault()} className="fixed z-[301] max-h-[70vh] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl p-1.5"
            style={{ width, top: Math.min(menuAt.top, window.innerHeight - 120), left: Math.max(8, Math.min(menuAt.left, window.innerWidth - width - 8)) }}>
            {panel}
          </div>
        </>,
        document.body,
      )}
    </div>
  );

  const editorNode = (
    // CR-B-02 — full screen covers the ENTIRE viewport (portaled to <body>, z above the side nav
    // z-[110]) so it never sits behind the platform's side navigation or inside a modal's clip.
    <div className={`border border-slate-100 bg-slate-50 overflow-hidden ${disabled ? "opacity-60" : ""} ${fullscreen ? "fixed inset-0 z-[250] m-0 rounded-none flex flex-col" : "rounded-2xl"}`}>
      {!disabled && (
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-white px-2 py-1.5">
          {/* Block style — trigger shows the caret's current style. */}
          {popover("style", <span className="min-w-[52px] text-left">{BLOCKS.find((b) => b.tag === fmt.block)?.label || "Normal"}</span>,
            <div className="flex flex-col">
              {BLOCKS.map((b) => (
                <button key={b.tag} type="button" onMouseDown={(e) => { e.preventDefault(); setBlock(b.tag); closeMenu(); }}
                  className={`text-left px-2 py-1.5 rounded-lg text-sm ${fmt.block === b.tag ? "bg-slate-900 text-white" : "hover:bg-slate-100 text-slate-700"}`}>{b.label}</button>
              ))}
            </div>, 170, "Paragraph style")}

          {/* Font family — trigger shows the caret's current font. */}
          {popover("font", <span className="inline-flex items-center gap-1"><Type size={14} /><span className="max-w-[72px] truncate">{FONTS.find((f) => fmt.font && (f.label.toLowerCase() === fmt.font || fmt.font.includes(f.label.toLowerCase())))?.label || ""}</span></span>,
            <div className="flex flex-col max-h-64 overflow-y-auto">
              {FONTS.map((f) => {
                const on = !!fmt.font && (f.label.toLowerCase() === fmt.font || fmt.font.includes(f.label.toLowerCase()));
                return (
                  <button key={f.label} type="button" onMouseDown={(e) => { e.preventDefault(); setFont(f.stack); closeMenu(); }}
                    style={{ fontFamily: f.stack }} className={`text-left px-2 py-1.5 rounded-lg text-sm ${on ? "bg-slate-900 text-white" : "hover:bg-slate-100 text-slate-700"}`}>{f.label}</button>
                );
              })}
            </div>, 190, "Font")}

          {/* Font size */}
          {popover("size", <span>Size</span>,
            <div className="grid grid-cols-4 gap-1">
              {SIZES.map((s) => (
                <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); setSize(s); closeMenu(); }}
                  className="px-1.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100 text-slate-700">{s}</button>
              ))}
              <p className="col-span-4 text-[10px] text-slate-400 px-1 pt-1">Select text first, then a size.</p>
            </div>, 180, "Font size")}

          <span className="w-px h-5 bg-slate-200 mx-1" />

          {btn("bold", "Bold", <Bold size={15} />, () => exec("bold"), fmt.bold)}
          {btn("italic", "Italic", <Italic size={15} />, () => exec("italic"), fmt.italic)}
          {btn("underline", "Underline", <Underline size={15} />, () => exec("underline"), fmt.underline)}
          {btn("strike", "Strikethrough", <Strikethrough size={15} />, () => exec("strikeThrough"), fmt.strike)}

          {/* Text color */}
          {popover("color", <Baseline size={15} />,
            <div className="grid grid-cols-4 gap-1.5">
              {TEXT_COLORS.map((c) => (
                <button key={c} type="button" title={c} onMouseDown={(e) => { e.preventDefault(); setColor(c); closeMenu(); }}
                  className="w-7 h-7 rounded-lg border border-slate-200" style={{ background: c }} />
              ))}
            </div>, 150, "Text color")}

          {/* Highlight */}
          {popover("highlight", <Highlighter size={15} />,
            <div className="grid grid-cols-4 gap-1.5">
              {HIGHLIGHTS.map((c) => (
                <button key={c} type="button" title={c === "transparent" ? "None" : c} onMouseDown={(e) => { e.preventDefault(); setHighlight(c); closeMenu(); }}
                  className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center" style={{ background: c === "transparent" ? "#fff" : c }}>
                  {c === "transparent" && <X size={12} className="text-slate-400" />}
                </button>
              ))}
            </div>, 150, "Highlight")}

          <span className="w-px h-5 bg-slate-200 mx-1" />

          {btn("ul", "Bullet list", <List size={15} />, () => exec("insertUnorderedList"), fmt.ul)}
          {btn("ol", "Numbered list", <ListOrdered size={15} />, () => exec("insertOrderedList"), fmt.ol)}
          {btn("footnote", "Insert footnote", <Superscript size={15} />, insertFootnote)}

          <span className="w-px h-5 bg-slate-200 mx-1" />

          {btn("image", "Insert picture", uploading ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />, pickImage)}

          {/* Table menu */}
          {popover("table", <TableIcon size={15} />,
            <div className="flex flex-col gap-1">
              <div className="px-1 pb-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Insert table</p>
                <div className="flex items-center gap-1.5">
                  <label className="flex items-center gap-1 text-xs text-slate-600">Rows
                    <input type="number" min={1} max={30} value={tableDims.rows} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => setTableDims((d) => ({ ...d, rows: Number(e.target.value) }))} className="w-12 bg-slate-50 border border-slate-200 rounded-md px-1.5 py-1 text-xs" />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-slate-600">Cols
                    <input type="number" min={1} max={12} value={tableDims.cols} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => setTableDims((d) => ({ ...d, cols: Number(e.target.value) }))} className="w-12 bg-slate-50 border border-slate-200 rounded-md px-1.5 py-1 text-xs" />
                  </label>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); insertTable(tableDims.rows, tableDims.cols, tableTitle); setTableTitleInput(""); closeMenu(); }}
                    className="px-2 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-primary">Insert</button>
                </div>
                {/* CR-P (40) — the title goes in with the table, sitting tight above it. */}
                <input
                  value={tableTitle}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => setTableTitleInput(e.target.value)}
                  placeholder={`Table title (optional), e.g. "Table ${nextTableNo()}: Salary list"`}
                  className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs"
                />
              </div>
              <div className="border-t border-slate-100 pt-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1 mb-1">Edit table (click inside first)</p>
                <div className="grid grid-cols-2 gap-1">
                  {/* CR-P (40) — title an existing table, or clear it by leaving the box empty. */}
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); setTableTitle(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-slate-100 text-slate-700 col-span-2"><Type size={13} /> Table title</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); addRow(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-slate-100 text-slate-700"><Rows3 size={13} /> Add row</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); addCol(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-slate-100 text-slate-700"><Columns3 size={13} /> Add column</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); deleteRow(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-rose-50 text-rose-600"><Trash2 size={13} /> Del row</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); deleteCol(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-rose-50 text-rose-600"><Trash2 size={13} /> Del column</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); toggleBorders(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-slate-100 text-slate-700"><TableIcon size={13} /> Borders</button>
                  {/* CR-B-12 — insert a picture into the cell the caret is in. */}
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); if (ancestor("TD") || ancestor("TH")) pickImage(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-slate-100 text-slate-700"><ImageIcon size={13} /> Pic in cell</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); deleteTable(); closeMenu(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-rose-50 text-rose-600"><Trash2 size={13} /> Del table</button>
                </div>
                <div className="flex items-center gap-1.5 px-1 pt-1.5">
                  <span className="text-[10px] text-slate-400">Cell shade</span>
                  {HIGHLIGHTS.map((c) => (
                    <button key={c} type="button" title={c === "transparent" ? "None" : c} onMouseDown={(e) => { e.preventDefault(); shadeCell(c); }}
                      className="w-5 h-5 rounded border border-slate-200" style={{ background: c === "transparent" ? "#fff" : c }} />
                  ))}
                </div>
                {/* CR-B-12 — border colour + line style for the whole table. */}
                <div className="flex items-center gap-1.5 px-1 pt-1.5">
                  <span className="text-[10px] text-slate-400">Border</span>
                  {["#0f172a", "#94a3b8", "#3b82f6", "#ef4444", "#22c55e"].map((c) => (
                    <button key={c} type="button" title={`Border ${c}`} onMouseDown={(e) => { e.preventDefault(); setTableBorder(c); }}
                      className="w-5 h-5 rounded border-2" style={{ borderColor: c }} />
                  ))}
                  <button type="button" title="Dashed border" onMouseDown={(e) => { e.preventDefault(); setTableBorder("#94a3b8", "dashed"); }} className="px-1.5 py-0.5 rounded text-[10px] border border-dashed border-slate-400 text-slate-500 hover:bg-slate-100">Dashed</button>
                  <button type="button" title="Double border" onMouseDown={(e) => { e.preventDefault(); setTableBorder("#0f172a", "double"); }} className="px-1.5 py-0.5 rounded text-[10px] border-double border-2 border-slate-500 text-slate-500 hover:bg-slate-100">Double</button>
                </div>
              </div>
            </div>, 260, "Table")}

          <span className="w-px h-5 bg-slate-200 mx-1" />
          <button type="button" title="Use default style: removes the pasted text's own fonts, sizes, colours and links, so it looks like the rest of the document (the selected text, or the whole box when nothing is selected)"
            onMouseDown={(e) => { e.preventDefault(); useDefaultStyle(); }}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100">
            <RemoveFormatting size={14} /> Default style
          </button>
          {btn("fullscreen", fullscreen ? "Exit full screen" : "Full screen (bigger editing area)", fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />, () => setFullscreen((v) => !v))}

          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onImagesPicked(e.target.files)} />
          {pendingPics && createPortal(
            <div className="fixed inset-0 z-[320] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
              <div role="dialog" aria-label="Insert pictures" className="my-12 w-full max-w-lg rounded-3xl bg-white shadow-2xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Insert {pendingPics.length === 1 ? "picture" : `${pendingPics.length} pictures`}</p>
                    <p className="text-[11px] text-slate-400">A description or title is optional; it shows (and prints) under the picture.</p>
                  </div>
                  <button type="button" onClick={closePics} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
                </div>
                <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
                  {pendingPics.map((p, i) => (
                    <div key={p.preview} className="flex items-center gap-3">
                      <img src={p.preview} alt="" className="h-16 w-20 shrink-0 rounded-lg border border-slate-100 object-cover" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-[10px] font-bold text-slate-400" title={p.file.name}>{p.file.name}</p>
                        <input autoFocus={i === 0} value={p.caption} onChange={(e) => setPendingPics((list) => list && list.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void insertPics(); } }}
                          placeholder="Description / title (optional)" aria-label={`Description for ${p.file.name}`}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-primary/15" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
                  <button type="button" onClick={closePics} disabled={uploading} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                  <button type="button" onClick={() => void insertPics()} disabled={uploading} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-60">
                    {uploading && <Loader2 size={13} className="animate-spin" />} Insert
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
        </div>
      )}

      {/* CR-B-14b — recovered offline draft: offer to restore, never auto-apply. */}
      {!disabled && localDraft && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-[11px]">
          <span className="font-bold text-amber-700">Unsaved draft recovered from this device.</span>
          <span className="flex items-center gap-1.5">
            <button type="button" onMouseDown={(e) => { e.preventDefault(); if (ref.current) { ref.current.innerHTML = withFileTokensInHtml(localDraft); } emit(); setLocalDraft(null); }} className="px-2 py-0.5 rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600">Restore</button>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); if (draftKey) { try { localStorage.removeItem(`rte:${draftKey}`); } catch { /* ignore */ } } setLocalDraft(null); }} className="px-2 py-0.5 rounded-lg border border-amber-200 text-amber-700 font-bold hover:bg-amber-100">Dismiss</button>
          </span>
        </div>
      )}

      {/* Contextual image toolbar — appears when an image is selected (CR-B-13). */}
      {!disabled && selImg && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-primary/5 px-3 py-1.5 text-xs">
          <span className="font-bold text-slate-500 uppercase tracking-widest text-[10px]">Image</span>
          <span className="text-slate-400">Size</span>
          {IMG_WIDTHS.map((w) => (
            <button key={w.label} type="button" onMouseDown={(e) => { e.preventDefault(); sizeImg(w); }} className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-semibold text-slate-600 hover:text-slate-900">{w.label}</button>
          ))}
          <span className="w-px h-4 bg-slate-200" />
          <span className="text-slate-400">Position</span>
          {([["left", "Left"], ["right", "Right"], ["inline", "Side-by-side"], ["center", "Center"]] as const).map(([m, label]) => (
            <button key={m} type="button" onMouseDown={(e) => { e.preventDefault(); floatImg(m); }} className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-semibold text-slate-600 hover:text-slate-900">{label}</button>
          ))}
          <button type="button" onMouseDown={(e) => { e.preventDefault(); selImgRef.current = null; setSelImg(null); }} className="ml-auto p-1 rounded-lg text-slate-400 hover:text-slate-700" title="Done"><X size={14} /></button>
        </div>
      )}

      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={() => { saveSelection(); emit(); }}
        onKeyUp={saveSelection}
        onMouseUp={onSurfaceMouse}
        onClick={onSurfaceMouse}
        data-placeholder={placeholder || "Start writing…"}
        className={`rte-surface px-4 py-3 text-slate-700 leading-relaxed outline-none focus:bg-white transition-colors normal-case tracking-normal ${fullscreen ? "flex-grow overflow-y-auto bg-white" : ""}`}
        style={{ minHeight: fullscreen ? undefined : minHeight }}
      />
    </div>
  );
  // When full screen, render into <body> so no ancestor (modal, side nav) can clip or overlap it.
  return fullscreen ? createPortal(editorNode, document.body) : editorNode;
}
