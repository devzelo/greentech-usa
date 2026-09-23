import { useState } from "react";
import { createPortal } from "react-dom";
import { ShieldAlert, KeyRound, Loader2, Lock, Unlock, X } from "lucide-react";
import { updateClassifiedAccess, verifyClassifiedPin, setClassifiedToken, type ClassifiedAccessStatus } from "../../lib/api";
import { toast } from "../../lib/toast";

const inp = "bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10";

/**
 * Admin control for classified access: enable or disable the employee PIN, and set or change it
 * (CR-P).
 *
 * CR 291 (2026-09-23): it used to be a bar above the lock, on screen the whole time, with the PIN
 * box on show to anyone standing behind the admin. It is now one quiet button, and it only appears
 * once the classified area has been entered; the form opens when the PIN is actually being changed.
 */
export function ClassifiedPinManager({ access, onChange }: { access: ClassifiedAccessStatus | null; onChange: (a: ClassifiedAccessStatus) => void }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (patch: { enabled?: boolean; pin?: string }) => {
    setBusy(true);
    try {
      const r = await updateClassifiedAccess(patch);
      onChange({ enabled: r.enabled, hasPin: r.hasPin, isAdmin: true });
      if (patch.pin) { setPin(""); setOpen(false); }
      toast(patch.pin ? "PIN saved." : "Saved.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Save failed.", "error"); }
    finally { setBusy(false); }
  };
  const close = () => { setOpen(false); setPin(""); };

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={() => setOpen(true)}
          title="Employee PIN access for classified documents"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm hover:border-primary hover:text-primary"
        >
          <KeyRound size={13} /> {access?.hasPin ? "Change PIN" : "Set the PIN"}
          <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[9px] ${access?.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {access?.enabled ? "Enabled" : "Disabled"}
          </span>
        </button>
      </div>

      {open && createPortal(
        <div className="fixed inset-0 z-[210] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={close}>
          <div className="my-24 w-full max-w-sm rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><KeyRound size={15} className="text-primary" /> Employee PIN access</p>
              <button onClick={close} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X size={18} /></button>
            </div>
            <div className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600">
                  {access?.enabled ? "Employees can unlock with the PIN." : "Employees cannot reach classified documents."}
                </span>
                <button
                  onClick={() => save({ enabled: !access?.enabled })}
                  disabled={busy || (!access?.hasPin && !access?.enabled)}
                  title={!access?.hasPin ? "Set a PIN first" : ""}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-bold shadow-sm disabled:opacity-40 ${access?.enabled ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-200 bg-white text-slate-500"}`}
                >
                  {access?.enabled ? <Unlock size={13} /> : <Lock size={13} />} {access?.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {access?.hasPin ? "New PIN" : "Set the PIN"}
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  onKeyDown={(e) => { if (e.key === "Enter" && pin.trim().length >= 4) void save({ pin }); }}
                  placeholder="4 to 12 digits"
                  className={`${inp} mt-1 w-full`}
                />
              </label>
              <p className="text-[11px] text-slate-400">{access?.hasPin ? "A PIN is set. Setting a new one replaces it for everyone." : "No PIN set yet."}</p>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={close} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
                <button onClick={() => void save({ pin })} disabled={pin.trim().length < 4 || busy} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-primary disabled:opacity-40">
                  {busy && <Loader2 size={12} className="animate-spin" />} {access?.hasPin ? "Update PIN" : "Set PIN"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// Employee gate: enter the PIN to unlock classified for this session (CR-P).
export function ClassifiedPinGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (pin.trim().length < 4) return;
    setBusy(true);
    try {
      const { token } = await verifyClassifiedPin(pin);
      setClassifiedToken(token);
      onUnlocked();
      toast("Classified documents unlocked.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Incorrect PIN.", "error"); setPin(""); }
    finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-10 flex flex-col items-center text-center max-w-md mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-5"><ShieldAlert size={26} /></div>
      <h3 className="text-lg font-display font-bold text-slate-900 mb-1">Classified Documents</h3>
      <p className="text-sm text-slate-500 mb-6">Enter the access PIN to view these documents.</p>
      <input
        type="password"
        inputMode="numeric"
        autoFocus
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="• • • •"
        className="w-40 text-center tracking-[0.4em] bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-lg font-bold outline-none focus:bg-white focus:ring-4 focus:ring-primary/10 mb-4"
      />
      <button onClick={submit} disabled={busy || pin.trim().length < 4} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-primary disabled:opacity-40">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Unlock
      </button>
    </div>
  );
}
