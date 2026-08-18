export type ToastKind = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastEventDetail {
  id: number;
  msg: string;
  kind: ToastKind;
  action?: ToastAction;   // e.g. an "Undo" button (see archive flows)
  duration?: number;      // ms before auto-dismiss; longer by default when an action is present
}

/**
 * Fire a toast from anywhere in the dashboard. A `<Toaster />` mounted in
 * the dashboard layout listens for these events and renders them.
 *
 * Pass `{ action: { label, onClick } }` to add an inline button (Undo). Toasts
 * with an action stay up longer so the user has time to click.
 */
export function toast(msg: string, kind: ToastKind = "success", opts?: { action?: ToastAction; duration?: number }) {
  if (typeof window === "undefined") return;
  const detail: ToastEventDetail = { id: Date.now() + Math.random(), msg, kind, action: opts?.action, duration: opts?.duration };
  window.dispatchEvent(new CustomEvent("app-toast", { detail }));
}
