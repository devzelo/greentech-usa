import { useCallback, useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Calculator, Camera, Delete, Eraser, Highlighter, Pencil, Ruler, Undo2, Wrench, X } from "lucide-react";
import { toast } from "../../lib/toast";

// CR 181: quick tools that open over the project and close again. Calculator, drawing on the
// screen (like a snipping tool) and a unit converter. More tools can be added to TOOLS.

type ToolKey = "calc" | "units";

export default function Toolbox() {
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState<ToolKey>("calc");
  const [drawing, setDrawing] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Quick tools: calculator, draw on screen, unit converter"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold shadow-sm ${open ? "border-primary bg-emerald-50 text-primary" : "border-slate-200 bg-white text-slate-700 hover:text-primary"}`}
      >
        <Wrench size={14} /> Tools
      </button>

      {open && createPortal(
        <div ref={wrapRef} className="fixed bottom-4 right-4 z-[190] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-500"><Wrench size={13} /> Toolbox</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close toolbox" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-3 gap-1.5 p-2">
            <ToolTab active={tool === "calc"} onClick={() => setTool("calc")} icon={<Calculator size={15} />} label="Calculator" />
            <ToolTab active={false} onClick={() => { setDrawing(true); setOpen(false); }} icon={<Pencil size={15} />} label="Draw" />
            <ToolTab active={tool === "units"} onClick={() => setTool("units")} icon={<Ruler size={15} />} label="Units" />
          </div>
          <div className="border-t border-slate-100 p-3">
            {tool === "calc" ? <CalculatorTool /> : <UnitConverter />}
          </div>
        </div>,
        document.body,
      )}

      {drawing && <DrawOverlay onClose={() => setDrawing(false)} />}
    </>
  );
}

function ToolTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-bold transition-colors ${active ? "border-primary bg-emerald-50 text-primary" : "border-slate-200 text-slate-600 hover:border-primary/50 hover:text-primary"}`}
    >
      {icon}{label}
    </button>
  );
}

// ── Calculator ───────────────────────────────────────────────────────────────

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

function CalculatorTool() {
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

// ── Unit converter ───────────────────────────────────────────────────────────

type Unit = { key: string; label: string; factor: number }; // factor to the base unit
const UNIT_GROUPS: Record<string, Unit[]> = {
  Length: [
    { key: "m", label: "Meter (m)", factor: 1 }, { key: "mm", label: "Millimeter (mm)", factor: 0.001 },
    { key: "cm", label: "Centimeter (cm)", factor: 0.01 }, { key: "km", label: "Kilometer (km)", factor: 1000 },
    { key: "in", label: "Inch (in)", factor: 0.0254 }, { key: "ft", label: "Foot (ft)", factor: 0.3048 },
    { key: "yd", label: "Yard (yd)", factor: 0.9144 }, { key: "mi", label: "Mile (mi)", factor: 1609.344 },
  ],
  Area: [
    { key: "m2", label: "Square meter (m²)", factor: 1 }, { key: "ft2", label: "Square foot (ft²)", factor: 0.09290304 },
    { key: "yd2", label: "Square yard (yd²)", factor: 0.83612736 }, { key: "ha", label: "Hectare (ha)", factor: 10000 },
    { key: "acre", label: "Acre", factor: 4046.8564224 }, { key: "km2", label: "Square kilometer (km²)", factor: 1e6 },
  ],
  Volume: [
    { key: "m3", label: "Cubic meter (m³)", factor: 1 }, { key: "L", label: "Liter (L)", factor: 0.001 },
    { key: "gal", label: "US gallon (gal)", factor: 0.003785411784 }, { key: "ft3", label: "Cubic foot (ft³)", factor: 0.028316846592 },
    { key: "yd3", label: "Cubic yard (yd³)", factor: 0.764554857984 },
  ],
  Flow: [
    { key: "Ls", label: "Liters per second (L/s)", factor: 0.001 }, { key: "m3h", label: "Cubic meters per hour (m³/h)", factor: 1 / 3600 },
    { key: "m3d", label: "Cubic meters per day (m³/d)", factor: 1 / 86400 }, { key: "gpm", label: "US gallons per minute (gpm)", factor: 0.003785411784 / 60 },
    { key: "mgd", label: "Million US gallons per day (MGD)", factor: 3785.411784 / 86400 }, { key: "cfs", label: "Cubic feet per second (cfs)", factor: 0.028316846592 },
  ],
  Weight: [
    { key: "kg", label: "Kilogram (kg)", factor: 1 }, { key: "g", label: "Gram (g)", factor: 0.001 },
    { key: "t", label: "Metric ton (t)", factor: 1000 }, { key: "lb", label: "Pound (lb)", factor: 0.45359237 },
    { key: "ton", label: "US ton", factor: 907.18474 },
  ],
  Pressure: [
    { key: "kPa", label: "Kilopascal (kPa)", factor: 1 }, { key: "bar", label: "Bar", factor: 100 },
    { key: "psi", label: "PSI", factor: 6.894757293 }, { key: "mH2O", label: "Meters of water (mH₂O)", factor: 9.80665 },
    { key: "ftH2O", label: "Feet of water (ftH₂O)", factor: 2.98906692 }, { key: "atm", label: "Atmosphere (atm)", factor: 101.325 },
  ],
  Power: [
    { key: "kW", label: "Kilowatt (kW)", factor: 1 }, { key: "hp", label: "Horsepower (hp)", factor: 0.745699872 },
    { key: "W", label: "Watt (W)", factor: 0.001 }, { key: "BTUh", label: "BTU per hour", factor: 0.000293071 },
    { key: "TR", label: "Ton of refrigeration", factor: 3.516852842 },
  ],
  Temperature: [
    { key: "C", label: "Celsius (°C)", factor: 1 }, { key: "F", label: "Fahrenheit (°F)", factor: 1 }, { key: "K", label: "Kelvin (K)", factor: 1 },
  ],
};

function convertTemp(v: number, from: string, to: string) {
  const c = from === "C" ? v : from === "F" ? (v - 32) * 5 / 9 : v - 273.15;
  return to === "C" ? c : to === "F" ? c * 9 / 5 + 32 : c + 273.15;
}

function UnitConverter() {
  const [group, setGroup] = useState("Length");
  const units = UNIT_GROUPS[group];
  const [from, setFrom] = useState(units[0].key);
  const [to, setTo] = useState(units[4]?.key || units[1].key);
  const [value, setValue] = useState("1");

  const pickGroup = (g: string) => {
    setGroup(g);
    setFrom(UNIT_GROUPS[g][0].key);
    setTo(UNIT_GROUPS[g][1].key);
  };

  const v = Number(value);
  let result = "";
  if (value.trim() !== "" && isFinite(v)) {
    const out = group === "Temperature"
      ? convertTemp(v, from, to)
      : (v * (units.find((u) => u.key === from)?.factor || 1)) / (units.find((u) => u.key === to)?.factor || 1);
    result = Number(out.toPrecision(8)).toLocaleString("en-US", { maximumFractionDigits: 6 });
  }

  const sel = "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 focus:border-primary focus:outline-none";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {Object.keys(UNIT_GROUPS).map((g) => (
          <button key={g} type="button" onClick={() => pickGroup(g)} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${g === group ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{g}</button>
        ))}
      </div>
      <label className="block text-[11px] font-bold text-slate-500">Value
        <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className={`${sel} mt-1 text-sm`} />
      </label>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5">
        <label className="block text-[11px] font-bold text-slate-500">From
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={`${sel} mt-1`}>
            {units.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => { setFrom(to); setTo(from); }} title="Swap" className="mb-1 rounded-lg px-1.5 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100">⇄</button>
        <label className="block text-[11px] font-bold text-slate-500">To
          <select value={to} onChange={(e) => setTo(e.target.value)} className={`${sel} mt-1`}>
            {units.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
          </select>
        </label>
      </div>
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-right">
        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">Result</p>
        <p className="break-all font-mono text-lg font-bold text-slate-900">{result || "…"} <span className="text-xs text-slate-500">{units.find((u) => u.key === to)?.label}</span></p>
      </div>
    </div>
  );
}

// ── Draw on screen ───────────────────────────────────────────────────────────

type Stroke = { color: string; width: number; alpha: number; points: Array<[number, number]> };
const PEN_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#0f172a"];

function DrawOverlay({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [mode, setMode] = useState<"pen" | "marker">("pen");
  const [hideBar, setHideBar] = useState(false);
  const current = useRef<Stroke | null>(null);

  const redraw = useCallback((list: Stroke[]) => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const dpr = window.devicePixelRatio || 1;
    for (const s of list) {
      if (s.points.length < 1) continue;
      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(s.points[0][0] * dpr, s.points[0][1] * dpr);
      for (const [x, y] of s.points.slice(1)) ctx.lineTo(x * dpr, y * dpr);
      if (s.points.length === 1) ctx.lineTo(s.points[0][0] * dpr + 0.1, s.points[0][1] * dpr);
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = window.innerWidth * dpr;
      c.height = window.innerHeight * dpr;
      redraw(current.current ? [...strokes, current.current] : strokes);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [strokes, redraw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); setStrokes((s) => s.slice(0, -1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const down = (e: ReactPointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    current.current = { color, width: mode === "marker" ? 18 : 3, alpha: mode === "marker" ? 0.35 : 1, points: [[e.clientX, e.clientY]] };
    redraw([...strokes, current.current]);
  };
  const move = (e: ReactPointerEvent) => {
    if (!current.current) return;
    current.current.points.push([e.clientX, e.clientY]);
    redraw([...strokes, current.current]);
  };
  const up = () => {
    if (!current.current) return;
    const s = current.current;
    current.current = null;
    setStrokes((list) => [...list, s]);
  };

  // Snapshot: capture this tab (the browser asks which screen to share), then lay the drawing on top.
  const snapshot = async () => {
    const md = navigator.mediaDevices as MediaDevices & { getDisplayMedia?: (o: object) => Promise<MediaStream> };
    if (!md?.getDisplayMedia) { toast("Screen capture is not supported in this browser.", "error"); return; }
    setHideBar(true);
    let stream: MediaStream | null = null;
    try {
      stream = await md.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false, preferCurrentTab: true, selfBrowserSurface: "include" });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 300)); // let the capture settle
      const out = document.createElement("canvas");
      out.width = video.videoWidth;
      out.height = video.videoHeight;
      const ctx = out.getContext("2d")!;
      ctx.drawImage(video, 0, 0);
      // A tab capture already includes the drawing; for a window or screen capture add it on top.
      const track = stream.getVideoTracks()[0];
      const surface = (track.getSettings() as MediaTrackSettings & { displaySurface?: string }).displaySurface;
      if (surface !== "browser" && canvasRef.current) ctx.drawImage(canvasRef.current, 0, 0, out.width, out.height);
      const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
      if (!blob) throw new Error("Could not create the image.");
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast("Snapshot copied. Paste it into a chat or email.", "success");
      } catch {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `snapshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast("Snapshot downloaded.", "success");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "NotAllowedError")) toast(e instanceof Error ? e.message : "Snapshot failed.", "error");
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      setHideBar(false);
    }
  };

  const btn = "flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold";
  return createPortal(
    <div className="fixed inset-0 z-[260]" style={{ cursor: "crosshair" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      {!hideBar && (
        <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-2xl" style={{ cursor: "default" }}>
          <span className="px-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Draw</span>
          <button type="button" onClick={() => setMode("pen")} className={`${btn} ${mode === "pen" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Pencil size={13} /> Pen</button>
          <button type="button" onClick={() => setMode("marker")} className={`${btn} ${mode === "marker" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Highlighter size={13} /> Marker</button>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          {PEN_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`} className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-slate-900 scale-110" : "border-white"}`} style={{ background: c, boxShadow: "0 0 0 1px #cbd5e1" }} />
          ))}
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <button type="button" onClick={() => setStrokes((s) => s.slice(0, -1))} disabled={!strokes.length} className={`${btn} text-slate-600 hover:bg-slate-100 disabled:opacity-40`} title="Undo (Ctrl+Z)"><Undo2 size={13} /> Undo</button>
          <button type="button" onClick={() => setStrokes([])} disabled={!strokes.length} className={`${btn} text-slate-600 hover:bg-slate-100 disabled:opacity-40`}><Eraser size={13} /> Clear</button>
          <button type="button" onClick={snapshot} className={`${btn} text-slate-600 hover:bg-slate-100`} title="Capture the screen with your drawing"><Camera size={13} /> Snapshot</button>
          <button type="button" onClick={onClose} className={`${btn} bg-primary text-white hover:bg-emerald-600`} title="Close (Esc)"><X size={13} /> Done</button>
        </div>
      )}
    </div>,
    document.body,
  );
}
