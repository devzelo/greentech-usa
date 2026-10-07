import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";

/**
 * 2026-10-07 - "when the user is asked to enter an amount, it is always in currency format": every
 * money box in the platform. Typing shows "$58,000" (commas as you go, up to two decimals); leaving
 * the box shows "$58,000.00". The caller gets the plain number as text ("58000", "-2500.5", or ""
 * when empty), whatever it stores; it may also store a formatted text, the box reads both.
 */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur" | "type"> & {
  value: string | number | null | undefined;
  /** The plain number as text, on every keystroke ("" when the box is emptied). */
  onChange: (raw: string) => void;
  /** The same text, when the box is left (for callers that save on blur). */
  onCommit?: (raw: string) => void;
  /** ISO code; the symbol and format follow it (default USD). */
  currency?: string;
  /** Change orders and adjustments can be negative. */
  allowNegative?: boolean;
};

/** The number in a money text: "$12,100.00", "12100", "-2,500" or a number. NaN-safe (0). */
export function parseMoney(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").replace(/[^0-9.-]/g, "");
  const x = parseFloat(s);
  return Number.isFinite(x) ? x : 0;
}
const hasDigits = (v: string | number | null | undefined) => (typeof v === "number" ? Number.isFinite(v) : /[0-9]/.test(String(v ?? "")));

const fmtCache = new Map<string, Intl.NumberFormat>();
const fmt = (currency: string) => {
  let f = fmtCache.get(currency);
  if (!f) {
    try { f = new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    catch { f = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    fmtCache.set(currency, f);
  }
  return f;
};
// A currency is an ISO code ("USD", "EUR") or, where a document keeps one, a symbol ("$", "€").
const isCode = (c: string) => /^[A-Za-z]{3}$/.test(c);
/** "$58,000.00" (empty text stays empty). */
export function formatMoney(v: string | number | null | undefined, currency = "USD"): string {
  if (!hasDigits(v)) return "";
  const x = parseMoney(v);
  if (isCode(currency)) return fmt(currency.toUpperCase()).format(x);
  return `${x < 0 ? "-" : ""}${currency || "$"}${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const symbolOf = (currency: string) =>
  isCode(currency) ? fmt(currency.toUpperCase()).formatToParts(0).find((p) => p.type === "currency")?.value || "$" : currency || "$";

type Parts = { neg: boolean; int: string; dot: boolean; dec: string };
function partsOf(s: string, allowNegative: boolean): Parts {
  let int = "", dec = "", dot = false;
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") { if (dot) { if (dec.length < 2) dec += ch; } else int += ch; }
    else if (ch === "." && !dot) dot = true;
  }
  return { neg: allowNegative && s.includes("-"), int: int.replace(/^0+(?=\d)/, ""), dot, dec };
}
const group = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** What the box shows while typing: "$58,000", "$1,250.5", "-$300". */
function liveText(p: Parts, symbol: string): string {
  if (!p.int && !p.dot) return p.neg ? "-" : "";
  return `${p.neg ? "-" : ""}${symbol}${group(p.int || "0")}${p.dot ? `.${p.dec}` : ""}`;
}
function rawOf(p: Parts): string {
  if (!p.int && !p.dec) return "";
  return `${p.neg ? "-" : ""}${p.int || "0"}${p.dec ? `.${p.dec}` : ""}`;
}
/** One keystroke: what was typed (and where the caret is) becomes the shown text, the caret after
 *  the same digit it followed (commas come and go), and the plain number. */
export function typingStep(typed: string, at: number, symbol = "$", allowNegative = false): { text: string; caret: number; raw: string } {
  const sig = typed.slice(0, at).replace(/[^0-9.]/g, "").length;
  const p = partsOf(typed, allowNegative);
  const text = liveText(p, symbol);
  let caret = text.length, seen = 0;
  if (sig === 0) caret = text.startsWith("-") ? (text.includes(symbol) ? text.indexOf(symbol) + symbol.length : 1) : Math.min(symbol.length, text.length);
  else for (let k = 0; k < text.length; k++) { if (/[0-9.]/.test(text[k]) && ++seen === sig) { caret = k + 1; break; } }
  return { text, caret: Math.min(caret, text.length), raw: rawOf(p) };
}
/** The value as typing text (no forced decimals): 58000 -> "$58,000", "1250.50" -> "$1,250.50". */
function editTextOf(v: string | number | null | undefined, symbol: string, allowNegative: boolean): string {
  if (!hasDigits(v)) return "";
  const x = parseMoney(v);
  const [i, d = ""] = Math.abs(x).toFixed(2).replace(/\.?0+$/, "").split(".");
  return liveText({ neg: allowNegative && x < 0, int: i, dot: !!d, dec: d }, symbol);
}

export default function MoneyInput({ value, onChange, onCommit, currency = "USD", allowNegative = false, placeholder, onFocus, ...rest }: Props) {
  const symbol = symbolOf(currency);
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);   // null: not being edited
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current !== null && ref.current && document.activeElement === ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [text]);

  const shown = text !== null ? text : formatMoney(value, currency);
  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={shown}
      placeholder={placeholder ?? formatMoney(0, currency)}
      onFocus={(e) => { setText(editTextOf(value, symbol, allowNegative)); onFocus?.(e); }}
      onChange={(e) => {
        const s = typingStep(e.target.value, e.target.selectionStart ?? e.target.value.length, symbol, allowNegative);
        caret.current = s.caret;
        setText(s.text);
        onChange(s.raw);
      }}
      onBlur={() => {
        const raw = text !== null ? rawOf(partsOf(text, allowNegative)) : (hasDigits(value) ? String(parseMoney(value)) : "");
        setText(null);
        onCommit?.(raw);
      }}
    />
  );
}
