import { useEffect, useReducer, useSyncExternalStore } from "react";
import { toast } from "../../lib/toast";

// Module-level timer and stopwatch so they keep running when the toolbox closes.

export interface TimerState {
  durationMs: number;
  endsAt: number | null;
  remainingMs: number;
  running: boolean;
  label: string;
  finishedAt: number | null;
}

export interface StopwatchState {
  startedAt: number | null;
  accumulatedMs: number;
  running: boolean;
  laps: number[];
}

export interface ClockState {
  timer: TimerState;
  stopwatch: StopwatchState;
}

const STORAGE_KEY = "gt-toolbox-timer";

const initial: ClockState = {
  timer: { durationMs: 0, endsAt: null, remainingMs: 0, running: false, label: "", finishedAt: null },
  stopwatch: { startedAt: null, accumulatedMs: 0, running: false, laps: [] },
};

function load(): ClockState {
  try {
    if (typeof window === "undefined") return initial;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    const p = JSON.parse(raw) as Partial<ClockState>;
    return {
      timer: { ...initial.timer, ...(p.timer ?? {}) },
      stopwatch: { ...initial.stopwatch, ...(p.stopwatch ?? {}), laps: Array.isArray(p.stopwatch?.laps) ? p.stopwatch.laps : [] },
    };
  } catch {
    return initial;
  }
}

let state: ClockState = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable, ignore
  }
}

function setState(next: ClockState) {
  state = next;
  persist();
  syncWatcher();
  listeners.forEach((l) => l());
}

function patchTimer(p: Partial<TimerState>) {
  setState({ ...state, timer: { ...state.timer, ...p } });
}

function patchStopwatch(p: Partial<StopwatchState>) {
  setState({ ...state, stopwatch: { ...state.stopwatch, ...p } });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

const getSnapshot = () => state;

export function useTimerStore(): ClockState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Derived values

export function timerRemaining(t: TimerState, now = Date.now()): number {
  if (t.running && t.endsAt != null) return Math.max(0, t.endsAt - now);
  return Math.max(0, t.remainingMs);
}

export function stopwatchElapsed(s: StopwatchState, now = Date.now()): number {
  return s.accumulatedMs + (s.running && s.startedAt != null ? Math.max(0, now - s.startedAt) : 0);
}

// Timer actions

export function startTimer(ms: number, label = "") {
  const d = Math.max(0, Math.round(ms));
  if (d <= 0) return;
  primeAudio();
  patchTimer({ durationMs: d, endsAt: Date.now() + d, remainingMs: d, running: true, label: label.trim(), finishedAt: null });
}

export function pauseTimer() {
  const t = state.timer;
  if (!t.running) return;
  patchTimer({ running: false, endsAt: null, remainingMs: timerRemaining(t) });
}

export function resumeTimer() {
  const t = state.timer;
  if (t.running || t.remainingMs <= 0) return;
  primeAudio();
  patchTimer({ running: true, endsAt: Date.now() + t.remainingMs, finishedAt: null });
}

export function resetTimer() {
  patchTimer({ endsAt: null, remainingMs: 0, running: false, finishedAt: null, durationMs: 0 });
}

export function addTimerTime(ms: number) {
  const t = state.timer;
  if (t.running && t.endsAt != null) {
    patchTimer({ endsAt: t.endsAt + ms, durationMs: t.durationMs + ms });
  } else if (t.finishedAt != null || t.remainingMs <= 0) {
    // Finished or idle: start a fresh countdown with the extra time
    startTimer(ms, t.label);
  } else {
    patchTimer({ remainingMs: t.remainingMs + ms, durationMs: t.durationMs + ms });
  }
}

// Stopwatch actions

export function startStopwatch() {
  if (state.stopwatch.running) return;
  patchStopwatch({ running: true, startedAt: Date.now() });
}

export function pauseStopwatch() {
  const s = state.stopwatch;
  if (!s.running) return;
  patchStopwatch({ running: false, startedAt: null, accumulatedMs: stopwatchElapsed(s) });
}

export function resetStopwatch() {
  patchStopwatch({ running: false, startedAt: null, accumulatedMs: 0, laps: [] });
}

// Laps are stored as cumulative totals; lap time = total minus previous total
export function lapStopwatch() {
  const s = state.stopwatch;
  if (!s.running) return;
  patchStopwatch({ laps: [...s.laps, stopwatchElapsed(s)] });
}

// Running indicator

export function isAnyClockRunning(): boolean {
  return state.timer.running || state.stopwatch.running;
}

export function useClockRunning(): boolean {
  return useSyncExternalStore(subscribe, isAnyClockRunning, isAnyClockRunning);
}

// Re-render every 250ms while active
export function useTick(active: boolean) {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(force, 250);
    return () => window.clearInterval(id);
  }, [active]);
}

// Completion watcher, runs only while the countdown is running

let watcher: number | null = null;

function syncWatcher() {
  if (typeof window === "undefined") return;
  if (state.timer.running && watcher == null) {
    watcher = window.setInterval(checkFinished, 250);
  } else if (!state.timer.running && watcher != null) {
    window.clearInterval(watcher);
    watcher = null;
  }
}

function checkFinished() {
  const t = state.timer;
  if (!t.running || t.endsAt == null || Date.now() < t.endsAt) return;
  patchTimer({ running: false, endsAt: null, remainingMs: 0, finishedAt: Date.now() });
  const msg = `Timer finished${t.label ? `: ${t.label}` : ""}.`;
  playAlarm();
  toast(msg, "success");
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Timer finished", { body: t.label || "Your countdown has ended.", tag: "gt-toolbox-timer" });
    }
  } catch {
    // Notifications unsupported in this context
  }
}

// Alarm sound

let audioCtx: AudioContext | null = null;

function getAudio(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

// Create or resume the context during a user gesture so the alarm is allowed to play later
function primeAudio() {
  try {
    const ctx = getAudio();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  } catch {
    // ignore
  }
}

function playAlarm() {
  try {
    const ctx = getAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.05;
    for (let i = 0; i < 3; i++) {
      const start = t0 + i * 0.3;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.16);
    }
  } catch {
    // audio unavailable
  }
}

// Restored running timer: start watching (fires at once if it ended while the page was closed)
syncWatcher();

// Keep tabs in sync
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    state = load();
    syncWatcher();
    listeners.forEach((l) => l());
  });
}
