import { useCallback, useEffect, useRef, useState } from "react";
import { Delete } from "lucide-react";

// Standard calculator (keyboard friendly). Markup, margin, tax and percentage helpers live in
// the Markup / Margin tool.

// Small safe evaluator (no eval): + - × ÷ %, parentheses, decimals, unary minus.
function evaluate(expr: string): number {
  const src = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  let i = 0;
  const peek = () => src[i];
  const num = (): number => {
    if (peek() === "(") { i++; const v = add(); if (peek() !== ")") throw new Error("paren"); i++; return pct(v); }
    if (peek() === "-") { i++; return -num(); }
    if (peek() === "+") { i++; return num(); }
    const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i));
    if (!m) throw new Error("number");
    i += m[0].length;
    return pct(Number(m[0]));
  };
  const pct = (v: number) => { if (peek() === "%") { i++; return v / 100; } return v; };
  const mul = (): number => {
    let v = num();
    while (peek() === "*" || peek() === "/") { const op = src[i++]; const r = num(); v = op === "*" ? v * r : v / r; }
    return v;
  };
  const add = (): number => {
    let v = mul();
    while (peek() === "+" || peek() === "-") { const op = src[i++]; const r = mul(); v = op === "+" ? v + r : v - r; }
    return v;
  };
  const v = add();
  if (i !== src.length || !isFinite(v)) throw new Error("syntax");
  return v;
}

const fmt = (n: number) => Number.isInteger(n) ? n.toLocaleString("en-US") : Number(n.toPrecision(12)).toLocaleString("en-US", { maximumFractionDigits: 10 });

export default function Calculator() {
  const [expr, setExpr] = useState("");
  const [history, setHistory] = useState<Array<{ expr: string; result: string }>>([]);
  const [error, setError] = useState(false);

  let preview = "";
  try { if (/[+\-×÷*/%]/.test(expr.slice(1))) preview = fmt(evaluate(expr)); } catch { /* incomplete */ }

  const exprRef = useRef(expr);
  exprRef.current = expr;
  const press = useCallback((k: string) => {
    setError(false);
    if (k === "C") return setExpr("");
    if (k === "⌫") return setExpr((e) => e.slice(0, -1));
    if (k === "=") {
      const e = exprRef.current;
      if (!e) return;
      try {
        const r = String(Number(evaluate(e).toPrecision(12)));
        setHistory((h) => [{ expr: e, result: r }, ...h].slice(0, 5));
        setExpr(r);
      } catch { setError(true); }
      return;
    }
    setExpr((e) => e + k);
  }, []);

  // Keyboard input while the calculator is showing (not while typing in another field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const map: Record<string, string> = { "*": "×", "/": "÷", Enter: "=", "=": "=", Backspace: "⌫", Delete: "C" };
      const k = map[e.key] || (/^[\d.+\-%()]$/.test(e.key) ? e.key : "");
      if (!k) return;
      e.preventDefault();
      press(k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const keys = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "-", "1", "2", "3", "+", "%", "0", ".", "="];
  return (
    <div>
      <div className={`mb-2 rounded-xl border px-3 py-2 text-right ${error ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
        <div className="min-h-[1.75rem] break-all font-mono text-xl font-bold text-slate-900">{expr || "0"}</div>
        <div className="min-h-[1rem] text-xs font-semibold text-slate-400">{error ? "Check the expression" : preview && `= ${preview}`}</div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {keys.map((k) => (
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
      <div className="mt-1.5 flex justify-end">
        <button type="button" onClick={() => press("⌫")} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100"><Delete size={13} /> Back</button>
      </div>
      {history.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {history.map((h, idx) => (
            <li key={idx}>
              <button type="button" onClick={() => setExpr(h.result)} title="Use this result" className="w-full truncate rounded px-1 text-right text-xs text-slate-500 hover:bg-slate-50">
                {h.expr} = <span className="font-bold text-slate-800">{fmt(Number(h.result))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
