import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AtSign } from "lucide-react";

/**
 * CR 201 - a note that can mention people: "@Sarah please work on this part". Typing @ offers the
 * colleagues on this project; whoever is mentioned is notified when the note is finished.
 */

export type MentionUser = { id: string; name: string };

/** Everyone named in the text, matched on their full name so "@Sarah Khan" counts as one person. */
export function findMentions(text: string, users: MentionUser[]): MentionUser[] {
  const t = (text || "").toLowerCase();
  return users.filter((u) => u.name && t.includes(`@${u.name.toLowerCase()}`));
}

export default function MentionInput({ value, users, notified = [], disabled, placeholder, className = "", onChange, onCommit }: {
  value: string;
  users: MentionUser[];
  /** Names already told about this note, so the hint says "notified" rather than "will be". */
  notified?: string[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onChange: (next: string) => void;
  /** Fired when the note is finished (blur or Enter), so mentions can be notified once. */
  onCommit?: (text: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);   // text typed after the "@", null = closed
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const matches = query === null ? [] : users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  const open = query !== null && matches.length > 0;

  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
  };
  useLayoutEffect(() => { if (open) place(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, query]);
  useEffect(() => {
    if (!open) return;
    const close = () => setQuery(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);

  // The word being typed after an "@", if the caret is still inside it.
  const readQuery = (el: HTMLInputElement) => {
    const caret = el.selectionStart ?? el.value.length;
    const upto = el.value.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at < 0) return null;
    const before = at === 0 ? "" : upto[at - 1];
    if (before && !/\s/.test(before)) return null;          // an email address, not a mention
    const word = upto.slice(at + 1);
    if (/[\n\t]/.test(word) || word.length > 40) return null;
    return word;
  };

  const pick = (u: MentionUser) => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    const upto = el.value.slice(0, caret);
    const at = upto.lastIndexOf("@");
    const next = `${el.value.slice(0, at)}@${u.name} ${el.value.slice(caret)}`;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const c = at + u.name.length + 2;
      el.focus();
      el.setSelectionRange(c, c);
    });
  };

  const mentioned = findMentions(value, users);

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 border-t border-slate-50 px-3">
        <AtSign size={11} className={mentioned.length ? "shrink-0 text-primary" : "shrink-0 text-slate-300"} />
        <input
          ref={ref}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          className={`w-full bg-transparent py-1.5 text-[11px] text-slate-500 outline-none disabled:opacity-60 ${className}`}
          onChange={(e) => { onChange(e.target.value); setQuery(readQuery(e.target)); setActive(0); }}
          onClick={(e) => setQuery(readQuery(e.currentTarget))}
          onKeyDown={(e) => {
            if (open) {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % matches.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + matches.length) % matches.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[active] || matches[0]); return; }
              if (e.key === "Escape") { e.preventDefault(); setQuery(null); return; }
            }
            if (e.key === "Enter") { e.currentTarget.blur(); }
          }}
          onBlur={() => { setTimeout(() => setQuery(null), 120); onCommit?.(value); }}
        />
      </div>
      {mentioned.length > 0 && (() => {
        const waiting = mentioned.filter((u) => !notified.includes(u.name));
        return (
          <p className="px-3 pb-1.5 text-[10px] text-slate-400">
            {waiting.length
              ? `Notified when you finish the note: ${waiting.map((u) => u.name).join(", ")}`
              : `Notified: ${mentioned.map((u) => u.name).join(", ")}`}
          </p>
        );
      })()}
      {open && pos && createPortal(
        <ul
          role="listbox"
          className="fixed z-[200] max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-2xl"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {matches.map((u, k) => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(u); }}
                onMouseEnter={() => setActive(k)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${k === active ? "bg-primary/5 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-500">{u.name.slice(0, 1).toUpperCase()}</span>
                <span className="truncate font-bold">{u.name}</span>
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
