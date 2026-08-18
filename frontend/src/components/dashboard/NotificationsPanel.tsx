import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, FolderPlus, Share2, AlarmClock, Loader2, ExternalLink } from "lucide-react";
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead, updateReminder, withFileToken,
  type ApiNotification,
} from "../../lib/api";
import { toast } from "../../lib/toast";

// Snooze presets shared with the reminder page.
export const NOTIF_SNOOZE: Array<{ label: string; minutes: number }> = [
  { label: "1 hour", minutes: 60 },
  { label: "Tomorrow", minutes: 60 * 24 },
  { label: "Next week", minutes: 60 * 24 * 7 },
];

export function notifTimeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const iconFor = (n: ApiNotification) =>
  n.type === "reminder" ? <AlarmClock size={15} />
  : n.type === "assignment" ? <FolderPlus size={15} />
  : <Share2 size={15} />;
const iconCls = (n: ApiNotification) =>
  n.type === "reminder" ? "bg-amber-50 text-amber-500"
  : n.type === "assignment" ? "bg-indigo-50 text-indigo-500"
  : "bg-emerald-50 text-emerald-500";

// Full-history notifications list — the Reminders → Notifications tab. Same actions as the bell
// dropdown (open → highlight, snooze reminders, mark read), just laid out full-width.
export default function NotificationsPanel() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "reminder">("all");

  const load = async () => {
    setLoading(true);
    try { const res = await fetchNotifications(true); setItems(res.items); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not load notifications.", "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const open = async (n: ApiNotification) => {
    if (!n.read) { markNotificationRead(n._id).catch(() => {}); setItems((p) => p.map((x) => (x._id === n._id ? { ...x, read: true } : x))); }
    if (!n.link) return;
    if (n.link.startsWith("/uploads") || n.link.startsWith("http")) {
      window.open(new URL(withFileToken(n.link), window.location.origin).toString(), "_blank", "noopener");
    } else navigate(n.link);
  };
  const markOne = async (n: ApiNotification) => {
    setItems((p) => p.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
    markNotificationRead(n._id).catch(() => {});
  };
  const markAll = async () => {
    setItems((p) => p.map((x) => ({ ...x, read: true })));
    markAllNotificationsRead().catch(() => {});
  };
  const snooze = async (n: ApiNotification, minutes: number) => {
    if (!n.reminderId) return;
    setBusy(n._id);
    try {
      await updateReminder(n.reminderId, { dueAt: new Date(Date.now() + minutes * 60_000).toISOString() });
      if (!n.read) markNotificationRead(n._id).catch(() => {});
      setItems((p) => p.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      toast("Reminder snoozed.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not snooze.", "error"); }
    finally { setBusy(null); }
  };

  const shown = items.filter((n) => filter === "all" ? true : filter === "unread" ? !n.read : n.type === "reminder");
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-white rounded-2xl p-1 shadow-sm border border-slate-100">
          {([["all", "All"], ["unread", "Unread"], ["reminder", "Reminders"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)} className={`px-3 sm:px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all ${filter === v ? "bg-slate-900 text-white shadow" : "text-slate-400 hover:text-slate-900"}`}>
              {label}{v === "unread" && unread > 0 ? ` (${unread})` : ""}
            </button>
          ))}
        </div>
        {unread > 0 && (
          <button onClick={markAll} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"><CheckCheck size={14} /> Mark all read</button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-300"><Loader2 size={28} className="animate-spin" /></div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 bg-white rounded-[2rem] border border-slate-100">
          <Bell size={38} className="mb-3" />
          <p className="font-bold text-sm">Nothing here.</p>
          <p className="text-xs mt-1">Notifications about assignments, agreements, shared documents and due reminders show up here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((n) => {
            const isReminder = n.type === "reminder" && !!n.reminderId;
            return (
              <div key={n._id} className={`bg-white rounded-2xl border p-3 sm:p-4 ${n.read ? "border-slate-100" : "border-primary/30 bg-primary/[0.03]"}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconCls(n)}`}>{iconFor(n)}</div>
                  <button onClick={() => open(n)} className="min-w-0 flex-grow text-left" title={n.link ? "Open the related record" : undefined}>
                    <p className="text-sm font-bold text-slate-900 flex items-center gap-2">{n.title}{!n.read && <span className="w-2 h-2 rounded-full bg-primary" />}</p>
                    <p className="text-[12px] text-slate-500 leading-snug mt-0.5">{n.message}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{notifTimeAgo(n.createdAt)}</p>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {n.link && <button onClick={() => open(n)} title="Open the related record" className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50"><ExternalLink size={15} /></button>}
                    {!n.read && <button onClick={() => markOne(n)} title="Mark as read" className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-50"><Check size={15} /></button>}
                  </div>
                </div>
                {isReminder && (
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100 pl-12">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Snooze</span>
                    {NOTIF_SNOOZE.map((s) => (
                      <button key={s.label} onClick={() => snooze(n, s.minutes)} disabled={busy === n._id} className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold hover:bg-primary hover:text-white disabled:opacity-50">{s.label}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
