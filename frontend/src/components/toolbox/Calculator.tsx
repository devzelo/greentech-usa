import { useCallback, useEffect, useRef, useState } from "react";
import { Delete } from "lucide-react";

// Scientific calculator (client, 2026-09-21: "replace the simple calculator with a scientific
// one"). Keyboard friendly. Markup, margin, tax and percentage helpers live in the Markup / Margin
// tool.

type Angle = "deg" | "rad";

const FUNCS: Record<string, (x: number, a: Angle) => number> = {
  sin: (x, a) => Math.sin(a === "deg" ? (x * Math.PI) / 180 : x),
  cos: (x, a) => Math.cos(a === "deg" ? (x * Math.PI) / 180 : x),
  tan: (x, a) => {
    const r = a === "deg" ? (x * Math.PI) / 180 : x;
    if (a === "deg" && Math.abs(((x % 180) + 180) % 180 - 90) < 1e-9) throw new Error("undefined");
    return Math.tan(r);
  },
  asin: (x, a) => (a === "deg" ? (Math.asin(x) * 180) / Math.PI : Math.asin(x)),
  acos: (x, a) => (a === "deg" ? (Math.acos(x) * 180) / Math.PI : Math.acos(x)),
  atan: (x, a) => (a === "deg" ? (Math.atan(x) * 180) / Math.PI : Math.atan(x)),
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  ln: Math.log, log: Math.log10, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
};
const TRIG = new Set(["sin", "cos", "tan"]);

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new Error("factorial");
  if (n > 170) return Infinity;
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

/**
 * A small safe evaluator (no eval). Grammar, loosest first:
 *   sum     = product (("+" | "-") product)*
 *   product = unary (("×" | "÷" | implied ×) unary)*      2π, 3(4+1), 2sin(30)
 *   unary   = ("-" | "+") unary | power                     -2^2 = -4
 *   power   = postfix ("^" unary)?                          right-associative: 2^3^2 = 2^9
 *   postfix = primary ("!" | "%")*
 *   primary = number | "(" sum ")" | func "(" sum ")" | "√" unary | π | e | Ans
 */
function evaluate(expr: string, angle: Angle, ans: number): number {
  const src = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\s+/g, "");
  let i = 0;
  const peek = () => src[i];
  const startsPrimary = () => /[\d.(πe√A]/.test(peek() || "") || /^[a-z]/.test(src.slice(i));

  const primary = (): number => {
    if (peek() === "(") {
      i++;
      const v = sum();
      if (peek() !== ")") throw new Error("paren");
      i++;
      return v;
    }
    if (peek() === "√") { i++; return Math.sqrt(unary()); }
    if (peek() === "π") { i++; return Math.PI; }
    if (src.startsWith("Ans", i)) { i += 3; return ans; }
    const fn = /^[a-z]+/.exec(src.slice(i));
    if (fn && FUNCS[fn[0]]) {
      i += fn[0].length;
      if (peek() !== "(") throw new Error("call");
      i++;
      const x = sum();
      if (peek() !== ")") throw new Error("paren");
      i++;
      let v = FUNCS[fn[0]](x, angle);
      if (TRIG.has(fn[0]) && Math.abs(v) < 1e-12) v = 0;     // sin(180°) is 0, not 1.2e-16
      return v;
    }
    if (peek() === "e" && !/^[a-z]/.test(src.slice(i + 1))) { i++; return Math.E; }
    const m = /^\d*\.?\d+/.exec(src.slice(i));
    if (!m) throw new Error("number");
    i += m[0].length;
    return Number(m[0]);
  };
  const postfix = (): number => {
    let v = primary();
    for (;;) {
      if (peek() === "!") { i++; v = factorial(v); }
      else if (peek() === "%") { i++; v = v / 100; }
      else return v;
    }
  };
  const power = (): number => {
    const b = postfix();
    if (peek() === "^") { i++; return Math.pow(b, unary()); }
    return b;
  };
  const unary = (): number => {
    if (peek() === "-") { i++; return -unary(); }
    if (peek() === "+") { i++; return unary(); }
    return power();
  };
  const product = (): number => {
    let v = unary();
    for (;;) {
      if (peek() === "*" || peek() === "/") {
        const op = src[i++];
        const r = unary();
        v = op === "*" ? v * r : v / r;
      } else if (startsPrimary()) {
        v *= unary();                                          // implied multiplication
      } else return v;
    }
  };
  const sum = (): number => {
    let v = product();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const r = product();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  if (!src) throw new Error("empty");
  const v = sum();
  if (i !== src.length || Number.isNaN(v)) throw new Error("syntax");
  if (!isFinite(v)) throw new Error("overflow");
  return v;
}

// Close any brackets left open, so "sin(30" works.
const closeParens = (e: string) => e + ")".repeat(Math.max(0, (e.match(/\(/g) || []).length - (e.match(/\)/g) || []).length));

const tidy = (n: number) => Number(n.toPrecision(12));
const fmt = (n: number) => {
  const v = tidy(n);
  if (v !== 0 && (Math.abs(v) >= 1e15 || Math.abs(v) < 1e-7)) return v.toExponential(8).replace(/\.?0+e/, "e");
  return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 10 });
};

// What each key types. Keys not listed type their own label.
const INSERT: Record<string, string> = {
  sin: "sin(", cos: "cos(", tan: "tan(", "sin⁻¹": "asin(", "cos⁻¹": "acos(", "tan⁻¹": "atan(",
  sinh: "sinh(", cosh: "cosh(", tanh: "tanh(",
  ln: "ln(", log: "log(", "eˣ": "e^(", "10ˣ": "10^(", "√": "√(", "∛": "cbrt(",
  "x²": "^2", "x³": "^3", "xʸ": "^", "x!": "!", "1/x": "^(-1)", "|x|": "abs(", EXP: "×10^(",
};
const SCI_KEYS = [
  "sin", "cos", "tan", "π", "e",
  "sin⁻¹", "cos⁻¹", "tan⁻¹", "x²", "xʸ",
  "sinh", "cosh", "tanh", "x³", "√",
  "ln", "log", "eˣ", "10ˣ", "∛",
  "x!", "1/x", "|x|", "EXP", "Ans",
];
const PAD_KEYS = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "-", "1", "2", "3", "+", "%", "0", ".", "="];

export default function Calculator() {
  const [expr, setExpr] = useState("");
  const [angle, setAngle] = useState<Angle>(() => { try { return (localStorage.getItem("gt-calc-angle") as Angle) || "deg"; } catch { return "deg"; } });
  const [ans, setAns] = useState(0);
  const [memory, setMemory] = useState<number | null>(null);
  const [history, setHistory] = useState<Array<{ expr: string; result: number }>>([]);
  const [error, setError] = useState("");
  useEffect(() => { try { localStorage.setItem("gt-calc-angle", angle); } catch { /* ignore */ } }, [angle]);

  let preview = "";
  try { if (/[+\-×÷*/%^!(√πA]|[a-z]/.test(expr.slice(1)) || /^[a-zπ√A]/.test(expr)) preview = fmt(evaluate(closeParens(expr), angle, ans)); } catch { /* incomplete */ }

  const state = useRef({ expr, angle, ans });
  state.current = { expr, angle, ans };
  const current = () => {
    const { expr: e, angle: a, ans: n } = state.current;
    try { return e ? evaluate(closeParens(e), a, n) : null; } catch { return null; }
  };

  // Right after "=", a number or function starts a new sum; an operator carries on from the result.
  const justEvaluated = useRef(false);
  const press = useCallback((k: string) => {
    setError("");
    const fresh = justEvaluated.current;
    justEvaluated.current = false;
    if (k === "C") return setExpr("");
    if (k === "⌫") return setExpr((e) => e.replace(/(asin\(|acos\(|atan\(|sinh\(|cosh\(|tanh\(|sin\(|cos\(|tan\(|log\(|cbrt\(|abs\(|ln\(|Ans|×10\^\(|.)$/, ""));
    if (k === "=") {
      const { expr: e, angle: a, ans: n } = state.current;
      if (!e) return;
      try {
        const full = closeParens(e);
        const r = tidy(evaluate(full, a, n));
        setHistory((h) => [{ expr: full, result: r }, ...h].slice(0, 6));
        setAns(r);
        setExpr(String(r));
        justEvaluated.current = true;
      } catch (err) {
        setError(err instanceof Error && err.message === "overflow" ? "Too large to show" : err instanceof Error && err.message === "undefined" ? "Undefined (tan of 90°)" : err instanceof Error && err.message === "factorial" ? "x! needs a whole number of 0 or more" : "Check the expression");
      }
      return;
    }
    const add = INSERT[k] ?? k;
    const continues = /^[+\-×÷%^!)]/.test(add) || add.startsWith("^");
    setExpr((e) => (fresh && !continues ? add : e + add));
  }, []);

  // Memory keys work on the current value (the result shown, or what the expression comes to).
  const memKey = (k: "MC" | "MR" | "M+" | "M-") => {
    if (k === "MC") return setMemory(null);
    if (k === "MR") { if (memory !== null) setExpr((e) => e + String(memory)); return; }
    const v = current();
    if (v === null) { setError("Nothing to add to memory"); return; }
    setMemory((m) => tidy((m ?? 0) + (k === "M+" ? v : -v)));
  };

  // Keyboard input while the calculator is showing (not while typing in another field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const map: Record<string, string> = { "*": "×", "/": "÷", Enter: "=", "=": "=", Backspace: "⌫", Delete: "C", Escape: "C", p: "π", s: "sin", c: "cos", t: "tan", l: "ln", r: "√" };
      const k = map[e.key] || (/^[\d.+\-%()^!e]$/.test(e.key) ? e.key : "");
      if (!k) return;
      e.preventDefault();
      press(k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const chip = "rounded-md px-2 py-1 text-[10px] font-bold transition-colors";
  return (
    <div>
      <div className={`mb-2 rounded-xl border px-3 py-2 text-right ${error ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
          <span className="rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200">{angle === "deg" ? "DEG" : "RAD"}</span>
          {memory !== null && <span title={`Memory: ${fmt(memory)}`} className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">M {fmt(memory)}</span>}
        </div>
        <div className="min-h-[1.75rem] break-all font-mono text-xl font-bold text-slate-900">{expr || "0"}</div>
        <div className="min-h-[1rem] text-xs font-semibold text-slate-400">{error ? <span className="text-red-600">{error}</span> : preview && `= ${preview}`}</div>
      </div>

      <div className="mb-1.5 flex items-center justify-between gap-1">
        <div className="flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Angle unit">
          {(["deg", "rad"] as const).map((a) => (
            <button key={a} type="button" onClick={() => setAngle(a)} className={`${chip} ${angle === a ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{a === "deg" ? "Degrees" : "Radians"}</button>
          ))}
        </div>
        <div className="flex gap-0.5">
          {(["MC", "MR", "M+", "M-"] as const).map((k) => (
            <button key={k} type="button" onClick={() => memKey(k)} disabled={(k === "MC" || k === "MR") && memory === null} title={{ MC: "Clear memory", MR: "Recall memory", "M+": "Add to memory", "M-": "Subtract from memory" }[k]} className={`${chip} text-slate-600 hover:bg-slate-100 disabled:opacity-30`}>{k}</button>
          ))}
        </div>
      </div>

      <div className="mb-1.5 grid grid-cols-5 gap-1">
        {SCI_KEYS.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} className="rounded-lg bg-slate-100 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200">
            {k}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {PAD_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className={`rounded-lg py-2 text-sm font-bold transition-colors ${k === "=" ? "bg-primary text-white hover:bg-emerald-600" : k === "C" ? "bg-slate-200 text-slate-700 hover:bg-slate-300" : /[\d.]/.test(k) ? "bg-white border border-slate-200 text-slate-800 hover:bg-slate-50" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[10px] text-slate-400">Keys: s c t sin cos tan, l ln, r √, p π, ^ power, ! factorial</span>
        <button type="button" onClick={() => press("⌫")} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100"><Delete size={13} /> Back</button>
      </div>
      {history.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {history.map((h, idx) => (
            <li key={idx}>
              <button type="button" onClick={() => setExpr(String(h.result))} title="Use this result" className="w-full truncate rounded px-1 text-right text-xs text-slate-500 hover:bg-slate-50">
                {h.expr} = <span className="font-bold text-slate-800">{fmt(h.result)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
