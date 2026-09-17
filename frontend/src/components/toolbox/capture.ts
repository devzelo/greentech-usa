import { useSyncExternalStore } from "react";

// Screen capture for the toolbox (Screenshot / Snip and Draw). Browsers only allow capture through
// the screen-share prompt, so the user picks "this tab" or a whole screen. While a capture runs the
// toolbox hides itself (useCapturing) so it isn't in the picture.

let capturing = false;
const subs = new Set<() => void>();
const setCapturing = (v: boolean) => { capturing = v; subs.forEach((f) => f()); };
export function useCapturing(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => capturing);
}

export type CaptureKind = "tab" | "screen";

type DisplayMediaOptions = MediaStreamConstraints & { preferCurrentTab?: boolean; selfBrowserSurface?: string; surfaceSwitching?: string };

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function canCapture(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices;
}

/** Capture the current tab or a whole screen as a PNG. Returns null if the user cancels. */
export async function captureScreen(kind: CaptureKind): Promise<Blob | null> {
  if (!canCapture()) throw new Error("Screen capture is not supported in this browser. Use Chrome or Edge on a computer.");
  setCapturing(true);
  let stream: MediaStream | null = null;
  try {
    await frame(); await frame();
    const opts: DisplayMediaOptions = kind === "tab"
      ? { video: { displaySurface: "browser" } as MediaTrackConstraints, audio: false, preferCurrentTab: true, selfBrowserSurface: "include" }
      : { video: { displaySurface: "monitor" } as MediaTrackConstraints, audio: false, selfBrowserSurface: "include" };
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(opts);
    } catch (e) {
      if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "AbortError")) return null;
      throw e;
    }
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    // Give the browser a moment to drop its "sharing" prompt from the page.
    await wait(450);
    await frame();
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d")!.drawImage(video, 0, 0);
    return await new Promise<Blob | null>((res) => c.toBlob((b) => res(b), "image/png"));
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
    setCapturing(false);
  }
}
