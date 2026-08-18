import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, AlertTriangle } from "lucide-react";

const overlay = "absolute inset-0 bg-slate-950/40 backdrop-blur-sm";
const panel = "relative bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl";

/** Branded text-input dialog — replaces window.prompt. */
export function PromptDialog({
  open, title, label, placeholder, initialValue = "", confirmLabel = "Save", onCancel, onSubmit,
}: {
  open: boolean;
  title: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => { if (open) setValue(initialValue); }, [open, initialValue]);

  const submit = () => { const v = value.trim(); if (v) onSubmit(v); };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          {/* Backdrop is intentionally NOT click-to-close — only the X / Cancel dismisses it. */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={overlay} />
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className={panel}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-display font-bold text-slate-900">{title}</h3>
              <button onClick={onCancel} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"><X size={18} /></button>
            </div>
            <div className="space-y-2 mb-8">
              <label className="text-sm font-bold text-slate-700">{label}</label>
              <input
                type="text"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
                placeholder={placeholder}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all text-sm font-medium"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={onCancel} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
              <button onClick={submit} disabled={!value.trim()} className="flex-1 py-3 rounded-2xl bg-gt-gradient text-white font-bold text-sm shadow-lg shadow-primary/20 disabled:opacity-40">{confirmLabel}</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Branded confirmation dialog — replaces window.confirm. */
export function ConfirmDialog({
  open, title, message, confirmLabel = "Delete", cancelLabel = "Cancel", danger = true, onCancel, onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          {/* Backdrop is intentionally NOT click-to-close — only the X / Cancel dismisses it. */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={overlay} />
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className={panel}>
            <div className="flex items-start gap-4 mb-6">
              <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${danger ? "bg-red-50 text-red-500" : "bg-slate-100 text-slate-500"}`}>
                <AlertTriangle size={20} />
              </span>
              <div className="min-w-0 flex-grow">
                <h3 className="text-lg font-display font-bold text-slate-900">{title}</h3>
                <p className="text-sm text-slate-500 mt-1">{message}</p>
              </div>
              <button onClick={onCancel} className="p-2 -mt-1 -mr-1 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors shrink-0"><X size={18} /></button>
            </div>
            <div className="flex gap-3">
              <button onClick={onCancel} className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-sm text-slate-500 hover:bg-slate-50">{cancelLabel}</button>
              <button onClick={onConfirm} className={`flex-1 py-3 rounded-2xl text-white font-bold text-sm shadow-lg ${danger ? "bg-red-500 shadow-red-500/20 hover:bg-red-600" : "bg-gt-gradient shadow-primary/20"}`}>{confirmLabel}</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
