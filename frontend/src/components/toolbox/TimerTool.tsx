import { useState } from "react";
import { Bell, Flag, Pause, Play, Plus, RotateCcw } from "lucide-react";
import {
  addTimerTime, lapStopwatch, pauseStopwatch, pauseTimer, resetStopwatch, resetTimer, resumeTimer,
  startStopwatch, startTimer, stopwatchElapsed, timerRemaining, useTick, useTimerStore,
} from "./timerStore";

type Tab = "timer" | "stopwatch";

const labelCls = "block text-[11px] font-bold text-slate-500";
const inputCls = "mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-primary focus:outline-none";
const smallBtn = "inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600";
const primaryBtn = "inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40";

const PRESETS = [1, 5, 10, 15, 30, 60];

const pad = (n: number) => String(n).padStart(2, "0");

function hms(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function precise(ms: number): string {
  const cs = Math.floor(ms / 10);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h > 0 ? `${pad(h)}:` : ""}${pad(m)}:${pad(s)}.${pad(cs % 100)}`;
}

const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

function TimerPanel() {
  const { timer } = useTimerStore();
  useTick(timer.running);
  const [h, setH] = useState("0");
  const [m, setM] = useState("5");
  const [s, setS] = useState("0");
  const [label, setLabel] = useState(timer.label);

  const remaining = timerRemaining(timer);
  const finished = timer.finishedAt != null;
  const idle = !timer.running && !finished && remaining <= 0;
  const paused = !timer.running && !finished && remaining > 0;
  const progress = timer.durationMs > 0 ? Math.min(1, Math.max(0, 1 - remaining / timer.durationMs)) : finished ? 1 : 0;
  const customMs = (num(h) * 3600 + num(m) * 60 + num(s)) * 1000;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button key={p} type="button" className={smallBtn} onClick={() => startTimer(p * 60000, label)}>
            {p} min
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className={labelCls}>Hours
          <input type="number" min={0} max={99} inputMode="numeric" className={`${inputCls} tabular-nums`} value={h} onChange={(e) => setH(e.target.value)} />
        </label>
        <label className={labelCls}>Minutes
          <input type="number" min={0} max={59} inputMode="numeric" className={`${inputCls} tabular-nums`} value={m} onChange={(e) => setM(e.target.value)} />
        </label>
        <label className={labelCls}>Seconds
          <input type="number" min={0} max={59} inputMode="numeric" className={`${inputCls} tabular-nums`} value={s} onChange={(e) => setS(e.target.value)} />
        </label>
      </div>
      <label className={labelCls}>Label (optional)
        <input type="text" maxLength={60} placeholder="Meeting, curing test, site call" className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>

      <div
        className={`rounded-xl border px-3 py-3 text-center ${finished ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}
        role="timer"
        aria-live={finished ? "assertive" : "off"}
      >
        {timer.label && !idle && <div className="truncate text-[11px] font-bold text-slate-500">{timer.label}</div>}
        {finished ? (
          <div className="font-mono text-3xl font-bold text-amber-600">Time is up</div>
        ) : (
          <div className={`font-mono text-4xl font-bold tabular-nums ${timer.running ? "text-slate-800" : "text-slate-500"}`}>
            {hms(idle ? customMs : remaining)}
          </div>
        )}
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200">
          <div className={`h-full rounded-full transition-[width] duration-300 ${finished ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {timer.running ? (
          <button type="button" className={primaryBtn} onClick={pauseTimer}><Pause className="h-3.5 w-3.5" /> Pause</button>
        ) : paused ? (
          <button type="button" className={primaryBtn} onClick={resumeTimer}><Play className="h-3.5 w-3.5" /> Resume</button>
        ) : (
          <button type="button" className={primaryBtn} disabled={customMs <= 0} onClick={() => startTimer(customMs, label)}>
            <Play className="h-3.5 w-3.5" /> Start
          </button>
        )}
        <button type="button" className={smallBtn} onClick={() => addTimerTime(60000)}><Plus className="h-3.5 w-3.5" /> 1 min</button>
        <button type="button" className={smallBtn} disabled={idle} onClick={resetTimer}><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
      </div>
    </div>
  );
}

function StopwatchPanel() {
  const { stopwatch } = useTimerStore();
  useTick(stopwatch.running);
  const elapsed = stopwatchElapsed(stopwatch);
  const laps = stopwatch.laps;
  const hasTime = elapsed > 0;

  return (
    <div className="space-y-2.5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center" role="timer">
        <div className={`font-mono text-4xl font-bold tabular-nums ${stopwatch.running ? "text-slate-800" : "text-slate-500"}`}>{precise(elapsed)}</div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {stopwatch.running ? (
          <button type="button" className={primaryBtn} onClick={pauseStopwatch}><Pause className="h-3.5 w-3.5" /> Pause</button>
        ) : (
          <button type="button" className={primaryBtn} onClick={startStopwatch}><Play className="h-3.5 w-3.5" /> {hasTime ? "Resume" : "Start"}</button>
        )}
        <button type="button" className={smallBtn} disabled={!stopwatch.running} onClick={lapStopwatch}><Flag className="h-3.5 w-3.5" /> Lap</button>
        <button type="button" className={smallBtn} disabled={!hasTime && !laps.length} onClick={resetStopwatch}><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
      </div>

      {laps.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-100">
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-2 py-1 text-left font-bold">Lap</th>
                <th className="px-2 py-1 text-right font-bold">Lap time</th>
                <th className="px-2 py-1 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {laps.map((total, i) => ({ n: i + 1, total, lap: total - (i > 0 ? laps[i - 1] : 0) })).reverse().map((l) => (
                <tr key={l.n} className="border-t border-slate-100">
                  <td className="px-2 py-1 font-bold text-slate-500">{l.n}</td>
                  <td className="px-2 py-1 text-right font-mono text-slate-700">{precise(l.lap)}</td>
                  <td className="px-2 py-1 text-right font-mono text-slate-500">{precise(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AlertsLink() {
  const supported = typeof Notification !== "undefined";
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(supported ? Notification.permission : "unsupported");
  if (perm !== "default") return null;
  const ask = () => {
    try {
      void Notification.requestPermission().then(setPerm);
    } catch {
      setPerm("denied");
    }
  };
  return (
    <button type="button" onClick={ask} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
      <Bell className="h-3 w-3" /> Enable desktop alerts
    </button>
  );
}

export default function TimerTool() {
  const [tab, setTab] = useState<Tab>("timer");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="tablist">
          {(["timer", "stopwatch"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${tab === t ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {t === "timer" ? "Timer" : "Stopwatch"}
            </button>
          ))}
        </div>
        <AlertsLink />
      </div>
      {tab === "timer" ? <TimerPanel /> : <StopwatchPanel />}
      <p className="text-[10px] text-slate-400">Keeps running when you close the toolbox.</p>
    </div>
  );
}
