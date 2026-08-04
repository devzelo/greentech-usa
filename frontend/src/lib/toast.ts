export type ToastKind = "success" | "error" | "info";

export interface ToastEventDetail {
  id: number;
  msg: string;
  kind: ToastKind;
}

/**
 * Fire a toast from anywhere in the dashboard. A `<Toaster />` mounted in
 * the dashboard layout listens for these events and renders them.
 */
export function toast(msg: string, kind: ToastKind = "success") {
  if (typeof window === "undefined") return;
  const detail: ToastEventDetail = { id: Date.now() + Math.random(), msg, kind };
  window.dispatchEvent(new CustomEvent("app-toast", { detail }));
}
