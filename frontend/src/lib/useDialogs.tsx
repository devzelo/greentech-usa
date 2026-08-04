import { useCallback, useState, type ReactNode } from "react";
import { ConfirmDialog, PromptDialog } from "../components/dashboard/Dialogs";

// Promise-based wrappers around the branded ConfirmDialog / PromptDialog so components can do
//   if (!(await confirm({ title, message }))) return;
//   const reason = await prompt({ title, label }); if (reason === null) return;
// and just render {dialogs} once. Replaces window.confirm / window.prompt.
type ConfirmOpts = { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type PromptOpts = { title: string; label: string; placeholder?: string; initialValue?: string; confirmLabel?: string };

type ConfirmState = ConfirmOpts & { open: boolean; resolve?: (v: boolean) => void };
type PromptState = PromptOpts & { open: boolean; resolve?: (v: string | null) => void };

export function useDialogs(): {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  prompt: (opts: PromptOpts) => Promise<string | null>;
  dialogs: ReactNode;
} {
  const [c, setC] = useState<ConfirmState>({ open: false, title: "", message: "" });
  const [p, setP] = useState<PromptState>({ open: false, title: "", label: "" });

  const confirm = useCallback((opts: ConfirmOpts) =>
    new Promise<boolean>((resolve) => setC({ ...opts, open: true, resolve })), []);
  const prompt = useCallback((opts: PromptOpts) =>
    new Promise<string | null>((resolve) => setP({ ...opts, open: true, resolve })), []);

  const closeC = (v: boolean) => setC((s) => { s.resolve?.(v); return { ...s, open: false }; });
  const closeP = (v: string | null) => setP((s) => { s.resolve?.(v); return { ...s, open: false }; });

  const dialogs = (
    <>
      <ConfirmDialog
        open={c.open} title={c.title} message={c.message} confirmLabel={c.confirmLabel} cancelLabel={c.cancelLabel} danger={c.danger ?? true}
        onCancel={() => closeC(false)} onConfirm={() => closeC(true)}
      />
      <PromptDialog
        open={p.open} title={p.title} label={p.label} placeholder={p.placeholder} initialValue={p.initialValue} confirmLabel={p.confirmLabel}
        onCancel={() => closeP(null)} onSubmit={(v) => closeP(v)}
      />
    </>
  );

  return { confirm, prompt, dialogs };
}
