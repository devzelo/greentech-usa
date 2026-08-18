import { useEffect, useRef, useState } from "react";
import { Bell, Check, FolderPlus, Share2, AlarmClock, Loader2, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, updateReminder, withFileToken, ApiNotification } from "../../lib/api";
import { toast } from "../../lib/toast";

const SNOOZE: Array<{ label: string; minutes: number }> = [
  { label: "1h", minutes: 60 },
  { label: "Tomorrow", minutes: 60 * 24 },
  { label: "Next week", minutes: 60 * 24 * 7 },
];

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationBell() {
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const res = await fetchNotifications();
      setItems(res.items);
      setUnread(res.unread);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // light polling
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    load().finally(() => setLoading(false));
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Primary click — open the related record (and highlight it via the ?hl deep-link).
  const openItem = async (n: ApiNotification) => {
    if (!n.read) {
      try { await markNotificationRead(n._id); } catch { /* ignore */ }
      setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.link) {
      if (n.link.startsWith("/uploads") || n.link.startsWith("http")) {
        window.open(new URL(withFileToken(n.link), window.location.origin).toString(), "_blank", "noopener");
      } else {
        navigate(n.link);
      }
    }
  };

  // Mark a single notification read without navigating.
  const markOne = async (n: ApiNotification) => {
    if (n.read) return;
    setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    try { await markNotificationRead(n._id); } catch { /* ignore */ }
  };

  // Snooze the linked reminder straight from the bell (re-fires at the new time).
  const snooze = async (n: ApiNotification, minutes: number) => {
    if (!n.reminderId) return;
    setBusy(n._id);
    try {
      await updateReminder(n.reminderId, { dueAt: new Date(Date.now() + minutes * 60_000).toISOString() });
      if (!n.read) { markNotificationRead(n._id).catch(() => {}); setUnread((u) => Math.max(0, u - 1)); }
      setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      toast("Reminder snoozed.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not snooze.", "error"); }
    finally { setBusy(null); }
  };

  const markAll = async () => {
    try { await markAllNotificationsRead(); } catch { /* ignore */ }
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
  };

  const iconFor = (n: ApiNotification) =>
    n.type === "reminder" ? <AlarmClock size={15} />
    : n.type === "assignment" ? <FolderPlus size={15} />
    : <Share2 size={15} />;
  const iconCls = (n: ApiNotification) =>
    n.type === "reminder" ? "bg-amber-50 text-amber-500"
    : n.type === "assignment" ? "bg-indigo-50 text-indigo-500"
    : "bg-emerald-50 text-emerald-500";

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
        title="Notifications"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl border border-slate-100 shadow-2xl z-[300] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
            <p className="text-sm font-bold text-slate-900">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-slate-300"><Loader2 size={20} className="animate-spin" /></div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 font-medium">You're all caught up.</div>
            ) : (
              items.map((n) => {
                const isReminder = n.type === "reminder" && !!n.reminderId;
                return (
                  <div key={n._id} className={`border-b border-slate-50 ${n.read ? "" : "bg-primary/5"}`}>
                    <div className="flex gap-3 px-4 py-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconCls(n)}`}>{iconFor(n)}</div>
                      <button onClick={() => openItem(n)} className="min-w-0 flex-grow text-left" title={n.link ? "Open the related record" : undefined}>
                        <p className="text-xs font-bold text-slate-900 truncate">{n.title}</p>
                        <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                      </button>
                      <div className="flex flex-col items-center gap-1 flex-shrink-0">
                        {!n.read
                          ? <button onClick={() => markOne(n)} title="Mark as read" className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-white"><Check size={14} /></button>
                          : <span className="w-1.5 h-1.5" />}
                      </div>
                    </div>
                    {isReminder && (
                      <div className="flex items-center gap-1.5 px-4 pb-2.5 pl-14 -mt-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Snooze</span>
                        {SNOOZE.map((s) => (
                          <button key={s.label} onClick={() => snooze(n, s.minutes)} disabled={busy === n._id} className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-primary hover:text-white disabled:opacity-50">{s.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Full history — the Reminders → Notifications tab. */}
          <button
            onClick={() => { setOpen(false); navigate("/dashboard/reminders?view=notifications"); }}
            className="w-full flex items-center justify-center gap-1 px-4 py-2.5 text-[11px] font-bold text-slate-500 hover:text-primary hover:bg-slate-50 border-t border-slate-50 transition-colors"
          >
            See all notifications <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
