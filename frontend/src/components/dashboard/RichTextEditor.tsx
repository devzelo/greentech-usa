import { useEffect, useRef, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  Image as ImageIcon, Table as TableIcon, Loader2, Baseline, Highlighter,
  Type, ChevronDown, Superscript, Trash2, Rows3, Columns3, X, Maximize2, Minimize2,
} from "lucide-react";

/**
 * Rich-text editor backed by a contentEditable surface. Emits HTML via onChange
 * so the value can be persisted and rendered into the proposal/agreement PDF.
 * No external editor dependency — formatting uses the browser's execCommand plus
 * a little Range/DOM work for the things execCommand can't do.
 *
 * Client requests covered (client-change-requests-2026-08-10 · CR-B-05…13):
 *  - Font family (Aptos, Arial, Times New Roman, …)
 *  - Block styles: Normal / Header 1–4
 *  - Font size 8–48
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

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48];

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

const CELL_BORDER = "border:1px solid #cbd5e1;padding:6px;min-width:60px;";
const HEAD_STYLE = CELL_BORDER + "background:#f1f5f9;font-weight:700;text-align:left;";

export default function RichTextEditor({
  value,
  onChange,
  disabled,
  placeholder,
  minHeight = 160,
  onImageUpload,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
  onImageUpload?: (file: File) => Promise<string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);
  const selImgRef = useRef<HTMLImageElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [menu, setMenu] = useState<null | "style" | "font" | "size" | "color" | "highlight" | "table">(null);
  const [selImg, setSelImg] = useState<HTMLImageElement | null>(null);
  const [tableDims, setTableDims] = useState({ rows: 3, cols: 3 });
  const [fullscreen, setFullscreen] = useState(false); // CR-B-02 — bigger editing area

  // Sync external value in only when it differs, so typing doesn't reset the caret.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value || "";
  }, [value]);

  const emit = () => { if (ref.current) onChange(ref.current.innerHTML); };

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

  // execCommand without CSS styling (structural: bold/italic/lists/blocks).
  const exec = (command: string, arg?: string) => {
    if (disabled) return;
    focusEditor();
    document.execCommand(command, false, arg);
    emit();
  };
  // execCommand with CSS styling (color/highlight/font-family → inline style spans).
  const execCss = (command: string, arg?: string) => {
    if (disabled) return;
    focusEditor();
    try { document.execCommand("styleWithCSS", false, "true"); } catch { /* older browsers */ }
    document.execCommand(command, false, arg);
    try { document.execCommand("styleWithCSS", false, "false"); } catch { /* noop */ }
    emit();
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
  const insertTable = (rows: number, cols: number) => {
    const r = Math.max(1, Math.min(30, rows));
    const c = Math.max(1, Math.min(12, cols));
    const cell = (tag: "th" | "td", text: string) => `<${tag} style="${tag === "th" ? HEAD_STYLE : CELL_BORDER}">${text}</${tag}>`;
    const head = `<tr>${Array.from({ length: c }, (_, i) => cell("th", `Header ${i + 1}`)).join("")}</tr>`;
    const bodyRow = `<tr>${Array.from({ length: c }, () => cell("td", "&nbsp;")).join("")}</tr>`;
    const body = Array.from({ length: r - 1 }, () => bodyRow).join("");
    insertHtml(`<table style="border-collapse:collapse;width:100%;margin:8px 0;" border="1"><tbody>${head}${body}</tbody></table><p><br/></p>`);
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
      const base = isHead ? "padding:6px;min-width:60px;background:#f1f5f9;font-weight:700;text-align:left;" : "padding:6px;min-width:60px;";
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

  // ── Images ────────────────────────────────────────────────────────────────
  const pickImage = () => { if (!disabled) fileRef.current?.click(); };
  const onImagePicked = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      let url: string;
      if (onImageUpload) url = await onImageUpload(file);
      else url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
      insertHtml(`<img src="${url}" width="460" style="width:100%;max-width:460px;margin:8px 0;border-radius:4px;" /><p><br/></p>`);
    } catch (e) { alert(e instanceof Error ? e.message : "Image upload failed."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
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
  const toggleMenu = (m: typeof menu) => setMenu((cur) => (cur === m ? null : m));
  const closeMenu = () => setMenu(null);

  // Popover trigger + panel. Panel content stays interactive without losing the
  // editor selection because every control uses onMouseDown preventDefault.
  const popover = (id: NonNullable<typeof menu>, trigger: ReactNode, panel: ReactNode, width = 200, title?: string) => (
    <div className="relative">
      <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); toggleMenu(id); }}
        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${menu === id ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"}`}>
        {trigger}<ChevronDown size={12} />
      </button>
      {menu === id && (
        <>
          <button type="button" aria-label="Close" onMouseDown={(e) => e.preventDefault()} onClick={closeMenu} className="fixed inset-0 z-10 cursor-default" />
          <div onMouseDown={(e) => e.preventDefault()} className="absolute z-20 mt-1 left-0 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5" style={{ width }}>
            {panel}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className={`border border-slate-100 bg-slate-50 overflow-hidden ${disabled ? "opacity-60" : ""} ${fullscreen ? "fixed inset-0 z-[95] m-0 rounded-none flex flex-col" : "rounded-2xl"}`}>
      {!disabled && (
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-white px-2 py-1.5">
          {/* Block style */}
          {popover("style", <span>Style</span>,
            <div className="flex flex-col">
              {BLOCKS.map((b) => (
                <button key={b.tag} type="button" onMouseDown={(e) => { e.preventDefault(); setBlock(b.tag); closeMenu(); }}
                  className="text-left px-2 py-1.5 rounded-lg text-sm hover:bg-slate-100 text-slate-700">{b.label}</button>
              ))}
            </div>, 170, "Paragraph style")}

          {/* Font family */}
          {popover("font", <Type size={14} />,
            <div className="flex flex-col max-h-64 overflow-y-auto">
              {FONTS.map((f) => (
                <button key={f.label} type="button" onMouseDown={(e) => { e.preventDefault(); setFont(f.stack); closeMenu(); }}
                  style={{ fontFamily: f.stack }} className="text-left px-2 py-1.5 rounded-lg text-sm hover:bg-slate-100 text-slate-700">{f.label}</button>
              ))}
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

          {btn("bold", "Bold", <Bold size={15} />, () => exec("bold"))}
          {btn("italic", "Italic", <Italic size={15} />, () => exec("italic"))}
          {btn("underline", "Underline", <Underline size={15} />, () => exec("underline"))}
          {btn("strike", "Strikethrough", <Strikethrough size={15} />, () => exec("strikeThrough"))}

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

          {btn("ul", "Bullet list", <List size={15} />, () => exec("insertUnorderedList"))}
          {btn("ol", "Numbered list", <ListOrdered size={15} />, () => exec("insertOrderedList"))}
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
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); insertTable(tableDims.rows, tableDims.cols); closeMenu(); }}
                    className="px-2 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-primary">Insert</button>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1 mb-1">Edit table (click inside first)</p>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); addRow(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-slate-100 text-slate-700"><Rows3 size={13} /> Add row</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); addCol(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-slate-100 text-slate-700"><Columns3 size={13} /> Add column</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); deleteRow(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-rose-50 text-rose-600"><Trash2 size={13} /> Del row</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); deleteCol(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-rose-50 text-rose-600"><Trash2 size={13} /> Del column</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); toggleBorders(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-slate-100 text-slate-700"><TableIcon size={13} /> Borders</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); deleteTable(); closeMenu(); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs hover:bg-rose-50 text-rose-600"><Trash2 size={13} /> Del table</button>
                </div>
                <div className="flex items-center gap-1.5 px-1 pt-1.5">
                  <span className="text-[10px] text-slate-400">Cell shade</span>
                  {HIGHLIGHTS.map((c) => (
                    <button key={c} type="button" title={c === "transparent" ? "None" : c} onMouseDown={(e) => { e.preventDefault(); shadeCell(c); }}
                      className="w-5 h-5 rounded border border-slate-200" style={{ background: c === "transparent" ? "#fff" : c }} />
                  ))}
                </div>
              </div>
            </div>, 260, "Table")}

          <span className="w-px h-5 bg-slate-200 mx-1" />
          {btn("fullscreen", fullscreen ? "Exit full screen" : "Full screen (bigger editing area)", fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />, () => setFullscreen((v) => !v))}

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onImagePicked(e.target.files?.[0])} />
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
        onInput={(e) => { saveSelection(); onChange((e.target as HTMLDivElement).innerHTML); }}
        onKeyUp={saveSelection}
        onMouseUp={onSurfaceMouse}
        onClick={onSurfaceMouse}
        data-placeholder={placeholder || "Start writing…"}
        className={`rte-surface px-4 py-3 text-sm text-slate-700 leading-relaxed outline-none focus:bg-white transition-colors ${fullscreen ? "flex-grow overflow-y-auto bg-white" : ""}`}
        style={{ minHeight: fullscreen ? undefined : minHeight }}
      />
    </div>
  );
}
