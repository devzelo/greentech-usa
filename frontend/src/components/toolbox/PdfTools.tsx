import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  CheckSquare, ChevronLeft, ChevronRight, Eye, FileStack, FileUp, Files, Loader2, Plus, RotateCcw, RotateCw,
  Scissors, Square, Trash2, X,
} from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { PDFDocument as LibDocument, PDFPage } from "pdf-lib";
import ExportActions, { stamp } from "./ExportActions";
import { toast } from "../../lib/toast";

// PDF tools: merge, split, rotate, reorder, compress and image-to-PDF, all on one page grid.
// Everything runs in the browser; nothing is uploaded until the user saves or attaches the result.

type PdfJs = typeof import("pdfjs-dist");
let pdfjsReady: Promise<PdfJs> | null = null;
function loadPdfjs(): Promise<PdfJs> {
  if (!pdfjsReady) {
    pdfjsReady = Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")])
      .then(([lib, worker]) => { lib.GlobalWorkerOptions.workerSrc = worker.default; return lib; })
      .catch((err) => { pdfjsReady = null; throw err; });
  }
  return pdfjsReady;
}

interface Source {
  id: string;
  name: string;
  size: number;
  kind: "pdf" | "image";
  mime: string;
  bytes: Uint8Array;
  pdf?: PDFDocumentProxy; // pdf.js, for thumbnails and rasterizing
  lib?: LibDocument; // pdf-lib, for lossless copying
  rasterOnly?: boolean; // encrypted or unreadable by pdf-lib: pages are rebuilt as images
  url?: string; // image object URL
  width?: number;
  height?: number;
}

interface PageItem { key: string; srcId: string; index: number; rotate: number }
type Mode = "none" | "balanced" | "strong";
type Busy = "" | "add" | "build" | "extract" | "split";
interface Result { blob: Blob; name: string; kind: "pdf" | "zip" }

const QUALITY: Record<Exclude<Mode, "none">, { scale: number; quality: number; maxSide: number }> = {
  balanced: { scale: 1.5, quality: 0.72, maxSide: 2400 },
  strong: { scale: 1.1, quality: 0.55, maxSide: 1600 },
};
// Used for encrypted PDFs, which pdf-lib cannot copy as-is.
const FALLBACK = { scale: 2, quality: 0.85, maxSide: 3000 };

const ACCEPT = "application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif,image/bmp";
const LETTER = { w: 612, h: 792, margin: 36 };

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const thumbKey = (p: { srcId: string; index: number }) => `${p.srcId}:${p.index}`;
const norm = (deg: number) => ((deg % 360) + 360) % 360;
const toBlob = (bytes: Uint8Array, type: string) => new Blob([bytes as Uint8Array<ArrayBuffer>], { type });

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function errMsg(e: unknown) {
  if (e && typeof e === "object" && (e as { name?: string }).name === "PasswordException") {
    return "it is password protected. Remove the password and try again.";
  }
  return e instanceof Error ? e.message : "the file could not be read.";
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("the image could not be read."));
    img.src = url;
  });
}

function canvasBytes(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) { reject(new Error("Could not encode the page image.")); return; }
      b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, type, quality);
  });
}

async function renderPage(page: PDFPageProxy, scale: number, rotation: number) {
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

// Draws an image source onto a white canvas, capped at maxSide px on the long edge.
async function imageCanvas(src: Source, maxSide: number) {
  const img = await loadImage(src.url!);
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function embedImage(out: LibDocument, src: Source, q: { quality: number; maxSide: number } | null) {
  if (q) {
    const canvas = await imageCanvas(src, q.maxSide);
    return out.embedJpg(await canvasBytes(canvas, "image/jpeg", q.quality));
  }
  try {
    if (src.mime === "image/png") return await out.embedPng(src.bytes);
    if (src.mime === "image/jpeg") return await out.embedJpg(src.bytes);
  } catch { /* fall through to a canvas conversion */ }
  const canvas = await imageCanvas(src, 6000);
  return out.embedPng(await canvasBytes(canvas, "image/png"));
}

async function buildPdf(
  items: PageItem[], sources: Map<string, Source>, mode: Mode, onProgress?: (done: number) => void,
): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const out = await PDFDocument.create();
  const q = mode === "none" ? null : QUALITY[mode];

  // Lossless mode: copy each source's pages in one call so shared fonts and images are copied once.
  const copied = new Map<string, PDFPage>();
  if (!q) {
    const bySource = new Map<string, number[]>();
    for (const it of items) {
      const src = sources.get(it.srcId);
      if (src?.kind !== "pdf" || src.rasterOnly || !src.lib) continue;
      bySource.set(it.srcId, [...(bySource.get(it.srcId) ?? []), it.index]);
    }
    for (const [srcId, indices] of bySource) {
      const pages = await out.copyPages(sources.get(srcId)!.lib!, indices);
      pages.forEach((p, i) => copied.set(`${srcId}:${indices[i]}`, p));
    }
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const src = sources.get(it.srcId);
    if (!src) throw new Error("A source file is no longer available.");

    if (src.kind === "pdf") {
      const pre = copied.get(thumbKey(it));
      if (pre) {
        out.addPage(pre);
        if (it.rotate) pre.setRotation(degrees(norm(pre.getRotation().angle + it.rotate)));
      } else {
        const rq = q ?? FALLBACK;
        const page = await src.pdf!.getPage(it.index + 1);
        const rot = norm(page.rotate + it.rotate);
        const size = page.getViewport({ scale: 1, rotation: rot });
        const canvas = await renderPage(page, rq.scale, rot);
        const jpg = await out.embedJpg(await canvasBytes(canvas, "image/jpeg", rq.quality));
        canvas.width = canvas.height = 0;
        page.cleanup();
        const p = out.addPage([size.width, size.height]);
        p.drawImage(jpg, { x: 0, y: 0, width: size.width, height: size.height });
      }
    } else {
      const img = await embedImage(out, src, q);
      const landscape = (src.width ?? 1) > (src.height ?? 1);
      const W = landscape ? LETTER.h : LETTER.w;
      const H = landscape ? LETTER.w : LETTER.h;
      const fit = Math.min((W - 2 * LETTER.margin) / img.width, (H - 2 * LETTER.margin) / img.height);
      const w = img.width * fit;
      const h = img.height * fit;
      const p = out.addPage([W, H]);
      p.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
      if (it.rotate) p.setRotation(degrees(norm(it.rotate)));
    }
    onProgress?.(i + 1);
  }
  return out.save({ useObjectStreams: true });
}

export default function PdfTools() {
  const sourcesRef = useRef(new Map<string, Source>());
  const [, setSourceVersion] = useState(0);
  const [pages, setPages] = useState<PageItem[]>([]);
  const pagesRef = useRef<PageItem[]>([]);
  const thumbsRef = useRef<Record<string, string>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const failedThumbs = useRef(new Set<string>());
  const pumping = useRef(false);
  const alive = useRef(true);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("none");
  const [busy, setBusy] = useState<Busy>("");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [resultName, setResultName] = useState("");
  const [fileHover, setFileHover] = useState(false);
  const [overKey, setOverKey] = useState("");
  const dragKey = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { pagesRef.current = pages; }, [pages]);

  // Free everything when the tool closes.
  useEffect(() => {
    alive.current = true;
    const sources = sourcesRef.current;
    const thumbMap = thumbsRef;
    return () => {
      alive.current = false;
      for (const s of sources.values()) {
        void s.pdf?.destroy();
        if (s.url) URL.revokeObjectURL(s.url);
      }
      sources.clear();
      for (const k of Object.keys(thumbMap.current)) URL.revokeObjectURL(thumbMap.current[k]);
      thumbMap.current = {};
    };
  }, []);

  // Renders missing PDF thumbnails one at a time to keep memory low.
  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    try {
      for (;;) {
        if (!alive.current) break;
        const next = pagesRef.current.find((p) => {
          const k = thumbKey(p);
          const src = sourcesRef.current.get(p.srcId);
          return src?.kind === "pdf" && !thumbsRef.current[k] && !failedThumbs.current.has(k);
        });
        if (!next) break;
        const k = thumbKey(next);
        try {
          const src = sourcesRef.current.get(next.srcId)!;
          const page = await src.pdf!.getPage(next.index + 1);
          const base = page.getViewport({ scale: 1 });
          const canvas = await renderPage(page, Math.min(0.5, 240 / Math.max(base.width, base.height)), page.rotate);
          const bytes = await canvasBytes(canvas, "image/jpeg", 0.75);
          page.cleanup();
          if (!alive.current || !sourcesRef.current.has(next.srcId)) continue;
          thumbsRef.current[k] = URL.createObjectURL(toBlob(bytes, "image/jpeg"));
          setThumbs({ ...thumbsRef.current });
        } catch {
          failedThumbs.current.add(k);
        }
      }
    } finally {
      pumping.current = false;
    }
  }, []);

  // Drop sources no page refers to any more, and keep the selection in sync.
  useEffect(() => {
    const used = new Set(pages.map((p) => p.srcId));
    let changed = false;
    for (const [id, s] of sourcesRef.current) {
      if (used.has(id)) continue;
      void s.pdf?.destroy();
      if (s.url) URL.revokeObjectURL(s.url);
      for (const k of Object.keys(thumbsRef.current)) {
        if (k.startsWith(`${id}:`)) { URL.revokeObjectURL(thumbsRef.current[k]); delete thumbsRef.current[k]; }
      }
      sourcesRef.current.delete(id);
      changed = true;
    }
    if (changed) { setThumbs({ ...thumbsRef.current }); setSourceVersion((v) => v + 1); }
    const keys = new Set(pages.map((p) => p.key));
    setSelected((prev) => {
      const next = new Set([...prev].filter((k) => keys.has(k)));
      return next.size === prev.size ? prev : next;
    });
    void pump();
  }, [pages, pump]);

  // Escape closes the workspace; the page behind does not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[data-toolbox-attach]")) setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [open]);

  const addFiles = async (files: File[]) => {
    if (!files.length || busy) return;
    setBusy("add");
    const added: PageItem[] = [];
    let skipped = 0;
    try {
      for (const f of files) {
        const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
        const isImage = !isPdf && f.type.startsWith("image/");
        if (!isPdf && !isImage) { skipped++; continue; }
        setProgress(`Reading ${f.name}`);
        const bytes = new Uint8Array(await f.arrayBuffer());
        const src: Source = { id: uid(), name: f.name, size: f.size, kind: isPdf ? "pdf" : "image", mime: f.type, bytes };
        try {
          if (isPdf) {
            const pdfjs = await loadPdfjs();
            src.pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
            try {
              const { PDFDocument } = await import("pdf-lib");
              src.lib = await PDFDocument.load(bytes, { ignoreEncryption: true });
              src.rasterOnly = src.lib.isEncrypted;
            } catch {
              src.rasterOnly = true;
            }
            if (src.rasterOnly) toast(`${f.name} is encrypted or unusual, so its pages will be rebuilt as images.`, "info");
            for (let i = 0; i < src.pdf.numPages; i++) added.push({ key: uid(), srcId: src.id, index: i, rotate: 0 });
          } else {
            src.url = URL.createObjectURL(f);
            try {
              const img = await loadImage(src.url);
              src.width = img.naturalWidth;
              src.height = img.naturalHeight;
            } catch (e) {
              URL.revokeObjectURL(src.url);
              throw e;
            }
            added.push({ key: uid(), srcId: src.id, index: 0, rotate: 0 });
          }
          sourcesRef.current.set(src.id, src);
        } catch (e) {
          void src.pdf?.destroy();
          toast(`Skipped ${f.name}: ${errMsg(e)}`, "error");
        }
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not read the files.", "error");
    } finally {
      setBusy("");
      setProgress("");
    }
    if (skipped) toast(`${skipped} file${skipped > 1 ? "s were" : " was"} skipped. Only PDFs and images are supported.`, "error");
    if (added.length) {
      setSourceVersion((v) => v + 1);
      setPages((prev) => [...prev, ...added]);
      setOpen(true);
    }
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from<File>(e.target.files) : [];
    e.target.value = "";
    void addFiles(files);
  };

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  // The workspace is portalled, but React still bubbles its events to the panel, so stop them here.
  const onFileDragOver = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setFileHover(true);
  };
  const onFileDragLeave = (e: DragEvent<HTMLElement>) => {
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileHover(false);
  };
  const onFileDrop = (e: DragEvent) => {
    setFileHover(false);
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    void addFiles(Array.from<File>(e.dataTransfer.files));
  };

  const update = (key: string, fn: (p: PageItem) => PageItem) => setPages((prev) => prev.map((p) => (p.key === key ? fn(p) : p)));
  const rotate = (key: string, delta: number) => update(key, (p) => ({ ...p, rotate: norm(p.rotate + delta) }));
  const remove = (key: string) => setPages((prev) => prev.filter((p) => p.key !== key));
  const move = (from: number, to: number) => setPages((prev) => {
    if (to < 0 || to >= prev.length || from === to) return prev;
    const next = [...prev];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  });
  const toggle = (key: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const clearResult = () => setResult(null);
  const clearAll = () => { setPages([]); setResult(null); setOpen(false); };

  const setOutput = (blob: Blob, kind: Result["kind"], prefix: string) => {
    const name = `${prefix}-${stamp()}.${kind}`;
    setResult({ blob, kind, name });
    setResultName(name);
  };

  const run = async (kind: Exclude<Busy, "" | "add">, items: PageItem[]) => {
    if (!items.length || busy) return;
    setBusy(kind);
    setResult(null);
    const total = items.length;
    const label = kind === "split" ? "Splitting" : "Building";
    setProgress(`${label}: page 0 of ${total}`);
    const tick = (n: number) => { if (alive.current) setProgress(`${label}: page ${n} of ${total}`); };
    try {
      if (kind === "split") {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        const width = Math.max(2, String(total).length);
        for (let i = 0; i < total; i++) {
          const bytes = await buildPdf([items[i]], sourcesRef.current, mode);
          zip.file(`page-${String(i + 1).padStart(width, "0")}.pdf`, bytes);
          tick(i + 1);
        }
        setProgress("Packing the zip");
        const blob = await zip.generateAsync({ type: "blob", mimeType: "application/zip" });
        if (!alive.current) return;
        setOutput(blob, "zip", "pages");
        toast(`Split into ${total} PDF${total > 1 ? "s" : ""}.`, "success");
      } else {
        const bytes = await buildPdf(items, sourcesRef.current, mode, tick);
        if (!alive.current) return;
        setOutput(toBlob(bytes, "application/pdf"), "pdf", kind === "build" ? "merged" : "extract");
        toast(`PDF ready with ${total} page${total > 1 ? "s" : ""}.`, "success");
      }
    } catch (e) {
      toast(`Could not create the file: ${e instanceof Error ? e.message : "unknown error"}`, "error");
    } finally {
      if (alive.current) { setBusy(""); setProgress(""); }
    }
  };

  const preview = () => {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const w = window.open(url, "_blank", "noopener");
    if (!w) toast("Allow pop-ups to preview the PDF, or use Download.", "error");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const getFile = async () => {
    if (!result) throw new Error("Nothing to export yet.");
    const ext = `.${result.kind}`;
    const base = resultName.trim() || result.name;
    const name = base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`;
    return new File([result.blob], name, { type: result.blob.type || (result.kind === "pdf" ? "application/pdf" : "application/zip") });
  };

  const sources = [...sourcesRef.current.values()];
  const totalSize = sources.reduce((n, s) => n + s.size, 0);
  const selectedItems = pages.filter((p) => selected.has(p.key));
  const allSelected = pages.length > 0 && selected.size === pages.length;
  const working = !!busy;

  const btn = "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40";
  const iconBtn = "rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-primary disabled:pointer-events-none disabled:opacity-30";

  const fileInput = (
    <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={onPick} />
  );

  const workspace = (
    <div
      data-toolbox-modal
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/50 p-2 sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="pdf-tools-title" className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileStack size={16} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="pdf-tools-title" className="text-sm font-bold text-slate-800">PDF tools</h2>
            <p className="truncate text-[11px] text-slate-500">
              {pages.length} page{pages.length === 1 ? "" : "s"} from {sources.length} file{sources.length === 1 ? "" : "s"}, {fmtSize(totalSize)}
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-2">
          <button type="button" className={btn} disabled={working} onClick={() => inputRef.current?.click()}><Plus size={12} /> Add more files</button>
          <button type="button" className={btn} disabled={!pages.length} onClick={() => setSelected(allSelected ? new Set() : new Set(pages.map((p) => p.key)))}>
            {allSelected ? <Square size={12} /> : <CheckSquare size={12} />} {allSelected ? "Select none" : "Select all"}
          </button>
          <span className="text-[11px] font-bold text-slate-400">{selected.size} selected</span>
          <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
          <label className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600">
            Compression
            <select
              value={mode}
              disabled={working}
              onChange={(e) => setMode(e.target.value as Mode)}
              className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-bold text-slate-700 focus:border-primary focus:outline-none"
            >
              <option value="none">None</option>
              <option value="balanced">Balanced</option>
              <option value="strong">Strong</option>
            </select>
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button type="button" disabled={working || !pages.length} onClick={() => void run("build", pages)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-white hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40">
              {busy === "build" ? <Loader2 size={12} className="animate-spin" /> : <Files size={12} />} Build PDF
            </button>
            <button type="button" className={btn} disabled={working || !selectedItems.length} onClick={() => void run("extract", selectedItems)}>
              {busy === "extract" ? <Loader2 size={12} className="animate-spin" /> : <FileUp size={12} />} Extract selected
            </button>
            <button type="button" className={btn} disabled={working || !pages.length} onClick={() => void run("split", pages)}>
              {busy === "split" ? <Loader2 size={12} className="animate-spin" /> : <Scissors size={12} />} Split into single pages
            </button>
            <button type="button" className={`${btn} hover:border-rose-300! hover:text-rose-600!`} disabled={working || !pages.length} onClick={clearAll}>
              <Trash2 size={12} /> Clear all
            </button>
          </div>
          {(mode !== "none" || progress) && (
            <p className="w-full text-[11px] text-slate-500">
              {progress ? (
                <span className="inline-flex items-center gap-1 font-bold text-primary"><Loader2 size={12} className="animate-spin" /> {progress}</span>
              ) : (
                <>Pages are saved as images: a smaller file, but text will no longer be selectable or searchable.</>
              )}
            </p>
          )}
        </div>

        <div
          className={`relative min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 ${fileHover ? "bg-primary/5" : ""}`}
          onDragOver={onFileDragOver}
          onDragLeave={onFileDragLeave}
          onDrop={onFileDrop}
        >
          {fileHover && (
            <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-white/70 text-sm font-bold text-primary">
              Drop PDFs or images to add them
            </div>
          )}
          {!pages.length ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-slate-500">
              <FileStack size={32} className="text-slate-300" />
              <p className="text-xs font-bold">No pages yet</p>
              <p className="text-[11px]">Drop PDFs or images here, or use Add more files.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {pages.map((p, i) => {
                const src = sourcesRef.current.get(p.srcId);
                const thumb = src?.kind === "image" ? src.url : thumbs[thumbKey(p)];
                const failed = failedThumbs.current.has(thumbKey(p));
                const isSel = selected.has(p.key);
                const quarter = p.rotate % 180 !== 0;
                const pageLabel = src?.kind === "pdf" ? `p.${p.index + 1}` : "image";
                return (
                  <li
                    key={p.key}
                    draggable={!working}
                    onDragStart={(e) => { dragKey.current = p.key; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.key); }}
                    onDragEnd={() => { dragKey.current = ""; setOverKey(""); }}
                    onDragOver={(e) => {
                      if (!dragKey.current) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (overKey !== p.key) setOverKey(p.key);
                    }}
                    onDrop={(e) => {
                      if (!dragKey.current) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const from = pages.findIndex((x) => x.key === dragKey.current);
                      if (from >= 0) move(from, i);
                      dragKey.current = "";
                      setOverKey("");
                    }}
                    className={`flex cursor-grab flex-col rounded-xl border bg-white p-1.5 shadow-sm transition active:cursor-grabbing ${
                      isSel ? "border-primary ring-2 ring-primary/25" : "border-slate-200"
                    } ${overKey === p.key ? "outline-2 outline-dashed outline-primary" : ""}`}
                  >
                    <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={`Page ${i + 1}`}
                          draggable={false}
                          className="max-h-full max-w-full object-contain shadow transition-transform"
                          style={{ transform: `rotate(${p.rotate}deg)${quarter ? " scale(0.75)" : ""}` }}
                        />
                      ) : failed ? (
                        <span className="px-2 text-center text-[10px] text-slate-400">Preview unavailable</span>
                      ) : (
                        <Loader2 size={18} className="animate-spin text-slate-300" />
                      )}
                      <label className="absolute left-1 top-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-white/90 shadow-sm">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggle(p.key)}
                          className="h-3.5 w-3.5 cursor-pointer accent-emerald-500"
                          aria-label={`Select page ${i + 1}`}
                        />
                      </label>
                      <span className="absolute right-1 top-1 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-bold text-white">{i + 1}</span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-slate-500" title={src ? `${src.name}, ${pageLabel}` : ""}>
                      {src?.name ?? "Unknown"} <span className="text-slate-400">{pageLabel}</span>
                    </p>
                    <div className="mt-0.5 flex items-center justify-between">
                      <button type="button" className={iconBtn} disabled={working} onClick={() => rotate(p.key, -90)} aria-label={`Rotate page ${i + 1} left`} title="Rotate left"><RotateCcw size={13} /></button>
                      <button type="button" className={iconBtn} disabled={working} onClick={() => rotate(p.key, 90)} aria-label={`Rotate page ${i + 1} right`} title="Rotate right"><RotateCw size={13} /></button>
                      <button type="button" className={iconBtn} disabled={working || i === 0} onClick={() => move(i, i - 1)} aria-label={`Move page ${i + 1} earlier`} title="Move earlier"><ChevronLeft size={13} /></button>
                      <button type="button" className={iconBtn} disabled={working || i === pages.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move page ${i + 1} later`} title="Move later"><ChevronRight size={13} /></button>
                      <button type="button" className={`${iconBtn} hover:bg-rose-50! hover:text-rose-600!`} disabled={working} onClick={() => remove(p.key)} aria-label={`Delete page ${i + 1}`} title="Delete page"><Trash2 size={13} /></button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {result && (
          <footer className="space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] font-bold text-slate-600">
                File name
                <input
                  value={resultName}
                  onChange={(e) => setResultName(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-normal text-slate-800 focus:border-primary focus:outline-none"
                />
              </label>
              <span className="text-[11px] font-bold text-slate-500">
                {fmtSize(totalSize)} → <span className="text-primary">{fmtSize(result.blob.size)}</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {result.kind === "pdf" && (
                <button type="button" className={btn} onClick={preview}><Eye size={12} /> Preview</button>
              )}
              <ExportActions
                version={result.blob}
                getFile={getFile}
                onDelete={clearResult}
                deleteLabel="Discard"
                actions={["save", "download", "attach", "share", "delete"]}
              />
            </div>
          </footer>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-2" onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onFileDrop}>
      <p className="text-[11px] text-slate-500">
        Merge, split, rotate, reorder and compress PDFs, or turn photos into a PDF. Files are processed on this device.
      </p>
      <button
        type="button"
        disabled={busy === "add"}
        onClick={() => inputRef.current?.click()}
        className={`flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed px-3 py-4 text-center transition ${
          fileHover && !open ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary hover:bg-primary/5"
        }`}
      >
        {busy === "add" ? <Loader2 size={20} className="animate-spin text-primary" /> : <FileUp size={20} className="text-primary" />}
        <span className="text-xs font-bold text-slate-700">{busy === "add" ? progress || "Reading files" : "Choose PDFs or images"}</span>
        <span className="text-[10px] text-slate-400">or drop them here. PDF, PNG, JPG, WEBP</span>
      </button>
      {pages.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={btn} onClick={() => setOpen(true)}>
            <FileStack size={12} /> Open workspace ({pages.length} page{pages.length === 1 ? "" : "s"})
          </button>
          {result && <span className="text-[11px] font-bold text-primary">Result ready</span>}
          <button type="button" className={`${btn} hover:border-rose-300! hover:text-rose-600!`} disabled={working} onClick={clearAll}>
            <Trash2 size={12} /> Clear
          </button>
        </div>
      )}
      {fileInput}
      {open && createPortal(workspace, document.body)}
    </div>
  );
}
