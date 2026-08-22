import { useState } from "react";
import { ShieldAlert, KeyRound, Loader2, Lock, Unlock } from "lucide-react";
import { updateClassifiedAccess, verifyClassifiedPin, setClassifiedToken, type ClassifiedAccessStatus } from "../../lib/api";
import { toast } from "../../lib/toast";

const inp = "bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-primary/10";

// Admin control bar: enable/disable employee PIN access + set/update the PIN (CR-P).
export function ClassifiedPinManager({ access, onChange }: { access: ClassifiedAccessStatus | null; onChange: (a: ClassifiedAccessStatus) => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (patch: { enabled?: boolean; pin?: string }) => {
    setBusy(true);
    try {
      const r = await updateClassifiedAccess(patch);
      onChange({ enabled: r.enabled, hasPin: r.hasPin, isAdmin: true });
      if (patch.pin) setPin("");
      toast("Saved.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Save failed.", "error"); }
    finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 mr-1">
        <KeyRound size={16} className="text-primary" />
        <span className="text-sm font-bold text-slate-900">Employee PIN access</span>
      </div>
      <button
        onClick={() => save({ enabled: !access?.enabled })}
        disabled={busy || (!access?.hasPin && !access?.enabled)}
        title={!access?.hasPin ? "Set a PIN first" : ""}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold border shadow-sm disabled:opacity-40 ${access?.enabled ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-500 border-slate-200"}`}
      >
        {access?.enabled ? <Unlock size={13} /> : <Lock size={13} />} {access?.enabled ? "Enabled" : "Disabled"}
      </button>
      <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder={access?.hasPin ? "New PIN (4–12 digits)" : "Set PIN (4–12 digits)"} className={inp} />
      <button onClick={() => save({ pin })} disabled={pin.trim().length < 4 || busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary disabled:opacity-40">
        {busy && <Loader2 size={12} className="animate-spin" />} {access?.hasPin ? "Update PIN" : "Set PIN"}
      </button>
      <span className="text-[11px] text-slate-400">
        {access?.hasPin ? "PIN is set." : "No PIN set yet."}{" "}
        {access?.enabled ? "Employees can unlock with the PIN." : "Employees cannot access classified."}
      </span>
    </div>
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
