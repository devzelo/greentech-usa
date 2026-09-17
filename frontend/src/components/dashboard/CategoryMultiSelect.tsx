import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { deleteProjectCategory, getAuthUser } from "../../lib/api";
import { addCategoryOption, forgetCategoryOption, useCategoryOptions } from "../../lib/categoryOptions";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";

/**
 * Item 101 / CR 183 - a project's categories as a multi-select dropdown: the standard services,
 * the custom categories added on any project, and "Add custom category" at the end (saved for
 * every future project). Values outside both lists (older records) stay selectable.
 */
export default function CategoryMultiSelect({ value, onChange, disabled = false }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const { defaults, custom } = useCategoryOptions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const isAdmin = getAuthUser()?.role === "admin";
  const { confirm, dialogs } = useDialogs();

  const customNames = custom.map((c) => c.name);
  const known = new Set([...defaults, ...customNames].map((n) => n.toLowerCase()));
  const legacy = value.filter((v) => !known.has(v.toLowerCase()));
  const q = query.trim().toLowerCase();
  const match = (n: string) => !q || n.toLowerCase().includes(q);
  const exact = q && [...defaults, ...customNames, ...legacy].some((n) => n.toLowerCase() === q);

  const toggle = (c: string) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 320 && r.top > below;
    const width = Math.min(Math.max(r.width, 260), window.innerWidth - 16);
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), width, up });
  };
  useLayoutEffect(() => { if (open) place(); }, [open, value.length]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    const onMove = () => place();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);
  useEffect(() => { if (!open) { setQuery(""); setAdding(false); } }, [open]);

  const addCustom = async (raw: string) => {
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name) return;
    setBusy(true);
    try {
      const stored = await addCategoryOption(name);
      if (!value.includes(stored)) onChange([...value, stored]);
      setQuery("");
      setAdding(false);
      toast(`"${stored}" added. It is now available on every project.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not add the category.", "error");
    } finally { setBusy(false); }
  };

  const removeCustom = async (id: string, name: string) => {
    setOpen(false);
    const ok = await confirm({ title: `Remove "${name}"?`, message: "It will no longer be offered on projects. Projects that already use it keep it.", confirmLabel: "Remove", danger: true });
    if (!ok) return;
    try { await deleteProjectCategory(id); forgetCategoryOption(id); toast("Category removed from the list.", "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not remove the category.", "error"); }
  };

  const row = (name: string, extra?: ReactNode) => {
    const on = value.includes(name);
    return (
      <div key={name} className="group flex items-center">
        <button
          type="button"
          onClick={() => toggle(name)}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition-colors ${on ? "bg-emerald-50 text-emerald-800" : "text-slate-700 hover:bg-slate-50"}`}
        >
          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-primary bg-primary text-white" : "border-slate-300 bg-white"}`}>
            {on && <Check size={11} strokeWidth={3} />}
          </span>
          <span className="truncate">{name}</span>
        </button>
        {extra}
      </div>
    );
  };
  const heading = (t: string) => <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{t}</p>;

  const shownDefaults = defaults.filter(match);
  const shownCustom = custom.filter((c) => match(c.name));
  const shownLegacy = legacy.filter(match);

  return (
    <>
      <div
        ref={btnRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) { e.preventDefault(); setOpen(true); } }}
        className={`flex min-h-[2.75rem] w-full items-center gap-2 rounded-xl border bg-white px-3 py-1.5 text-left transition-colors ${disabled ? "cursor-not-allowed border-slate-200 opacity-70" : open ? "cursor-pointer border-primary ring-2 ring-primary/15" : "cursor-pointer border-slate-200 hover:border-slate-300"}`}
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {value.length === 0 && <span className="py-1 text-sm text-slate-400">Select categories</span>}
          {value.map((c) => (
            <span key={c} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-bold text-primary">
              <span className="truncate">{c}</span>
              {!disabled && (
                <button type="button" aria-label={`Remove ${c}`} onClick={(e) => { e.stopPropagation(); toggle(c); }} className="rounded text-primary/60 hover:text-primary">
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
        {!disabled && <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />}
      </div>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-multiselectable="true"
          className="fixed z-[260] flex max-h-[min(24rem,70vh)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
          style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
        >
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (q && !exact) void addCustom(query); } }}
              placeholder="Search or type a new category"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
            {value.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="shrink-0 text-[11px] font-bold text-slate-400 hover:text-red-500">Clear</button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
            {shownDefaults.length > 0 && <>{heading("Standard")}{shownDefaults.map((n) => row(n))}</>}
            {shownCustom.length > 0 && <>
              {heading("Custom")}
              {shownCustom.map((c) => row(c.name, isAdmin ? (
                <button type="button" title="Remove from the list (admin)" onClick={() => void removeCustom(c._id, c.name)} className="ml-1 rounded p-1 text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100">
                  <Trash2 size={12} />
                </button>
              ) : undefined))}
            </>}
            {shownLegacy.length > 0 && <>{heading("On this project")}{shownLegacy.map((n) => row(n))}</>}
            {!shownDefaults.length && !shownCustom.length && !shownLegacy.length && (
              <p className="px-2 py-3 text-xs text-slate-400">No category matches "{query.trim()}".</p>
            )}
          </div>
          <div className="border-t border-slate-100 p-1.5">
            {q && !exact ? (
              <button type="button" disabled={busy} onClick={() => void addCustom(query)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-bold text-primary hover:bg-emerald-50 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add "{query.trim()}" as a custom category
              </button>
            ) : adding ? (
              <form onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("name"); void addCustom(String(v || "")); }} className="flex items-center gap-1.5 px-1">
                <input name="name" autoFocus placeholder="e.g. Road Construction" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
                <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
                </button>
                <button type="button" onClick={() => setAdding(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={14} /></button>
              </form>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-primary">
                <Plus size={14} /> Add custom category
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
      {dialogs}
    </>
  );
}
