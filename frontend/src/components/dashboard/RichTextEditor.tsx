import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Heading2, Heading3, Pilcrow, Image as ImageIcon, Table as TableIcon, Rows3, Columns3, Loader2 } from "lucide-react";

/**
 * Lightweight rich-text editor backed by a contentEditable surface. Emits HTML
 * via onChange so the value can be persisted and rendered into the proposal PDF.
 * No external dependency — formatting uses the browser's execCommand.
 *
 * Supports inline images and tables (client request: tables & pictures in the builders). Images
 * are uploaded via the optional `onImageUpload` handler (returns a hosted URL); tables are plain
 * HTML <table>s the user edits in place. The proposal PDF renderer understands both.
 */
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
  const [uploading, setUploading] = useState(false);

  // Sync external value in only when it differs, so typing doesn't reset the caret.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value || "";
  }, [value]);

  const emit = () => { if (ref.current) onChange(ref.current.innerHTML); };
  const exec = (command: string, arg?: string) => {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };
  const insertHtml = (html: string) => {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand("insertHTML", false, html);
    emit();
  };

  // Insert a bordered starter table (a header row + one body row); cells are edited in place.
  const insertTable = () => {
    const cell = (tag: "th" | "td", text: string) =>
      `<${tag} style="border:1px solid #cbd5e1;padding:6px;min-width:60px;${tag === "th" ? "background:#f1f5f9;font-weight:700;text-align:left;" : ""}">${text}</${tag}>`;
    const head = `<tr>${cell("th", "Header 1")}${cell("th", "Header 2")}${cell("th", "Header 3")}</tr>`;
    const bodyRow = `<tr>${[1, 2, 3].map(() => cell("td", "&nbsp;")).join("")}</tr>`;
    insertHtml(`<table style="border-collapse:collapse;width:100%;margin:8px 0;" border="1"><tbody>${head}${bodyRow}${bodyRow}</tbody></table><p><br/></p>`);
  };

  // Find the <table> containing the current selection, for add-row / add-column.
  const selectedTable = (): HTMLTableElement | null => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !ref.current) return null;
    let n: Node | null = sel.anchorNode;
    while (n && n !== ref.current) { if (n.nodeType === 1 && (n as HTMLElement).tagName === "TABLE") return n as HTMLTableElement; n = n.parentNode; }
    return null;
  };
  const addRow = () => {
    const t = selectedTable(); if (!t) return;
    const body = t.tBodies[0] || t; const cols = (body.rows[0]?.cells.length) || 3;
    const tr = body.insertRow(-1);
    for (let i = 0; i < cols; i++) { const td = tr.insertCell(-1); td.setAttribute("style", "border:1px solid #cbd5e1;padding:6px;min-width:60px;"); td.innerHTML = "&nbsp;"; }
    emit();
  };
  const addCol = () => {
    const t = selectedTable(); if (!t) return;
    Array.from(t.rows).forEach((row) => {
      const isHead = row.cells[0]?.tagName === "TH";
      const c = row.insertCell(-1);
      if (isHead) { const th = document.createElement("th"); th.setAttribute("style", "border:1px solid #cbd5e1;padding:6px;min-width:60px;background:#f1f5f9;font-weight:700;text-align:left;"); th.innerHTML = "Header"; row.replaceChild(th, c); }
      else { c.setAttribute("style", "border:1px solid #cbd5e1;padding:6px;min-width:60px;"); c.innerHTML = "&nbsp;"; }
    });
    emit();
  };

  const pickImage = () => { if (!disabled) fileRef.current?.click(); };
  const onImagePicked = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      let url: string;
      if (onImageUpload) url = await onImageUpload(file);
      else url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
      insertHtml(`<img src="${url}" width="460" style="max-width:100%;margin:8px 0;border-radius:4px;" /><p><br/></p>`);
    } catch (e) { alert(e instanceof Error ? e.message : "Image upload failed."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const tools: Array<{ icon: typeof Bold; label: string; run: () => void }> = [
    { icon: Bold, label: "Bold", run: () => exec("bold") },
    { icon: Italic, label: "Italic", run: () => exec("italic") },
    { icon: Underline, label: "Underline", run: () => exec("underline") },
    { icon: Heading2, label: "Heading", run: () => exec("formatBlock", "H2") },
    { icon: Heading3, label: "Subheading", run: () => exec("formatBlock", "H3") },
    { icon: Pilcrow, label: "Paragraph", run: () => exec("formatBlock", "P") },
    { icon: List, label: "Bullet list", run: () => exec("insertUnorderedList") },
    { icon: ListOrdered, label: "Numbered list", run: () => exec("insertOrderedList") },
  ];

  return (
    <div className={`rounded-2xl border border-slate-100 bg-slate-50 overflow-hidden ${disabled ? "opacity-60" : ""}`}>
      {!disabled && (
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-white px-2 py-1.5">
          {tools.map((t) => (
            <button key={t.label} type="button" title={t.label} onMouseDown={(e) => { e.preventDefault(); t.run(); }} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
              <t.icon size={15} />
            </button>
          ))}
          <span className="w-px h-5 bg-slate-200 mx-1" />
          <button type="button" title="Insert picture" onMouseDown={(e) => { e.preventDefault(); pickImage(); }} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
          </button>
          <button type="button" title="Insert table" onMouseDown={(e) => { e.preventDefault(); insertTable(); }} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"><TableIcon size={15} /></button>
          <button type="button" title="Add table row" onMouseDown={(e) => { e.preventDefault(); addRow(); }} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"><Rows3 size={15} /></button>
          <button type="button" title="Add table column" onMouseDown={(e) => { e.preventDefault(); addCol(); }} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"><Columns3 size={15} /></button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onImagePicked(e.target.files?.[0])} />
        </div>
      )}
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        data-placeholder={placeholder || "Start writing…"}
        className="rte-surface px-4 py-3 text-sm text-slate-700 leading-relaxed outline-none focus:bg-white transition-colors"
        style={{ minHeight }}
      />
    </div>
  );
}
