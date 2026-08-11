import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { fetchUsers, createReminder, type AdminUser } from "../../lib/api";
import { toast } from "../../lib/toast";

// CR-B-19 — a single, consistent "tag a colleague" control reused across every builder that
// doesn't already have one (Submittals / RFQ / PO / BOQ). Picking a colleague:
//   1. persists their name on the record (via onChange), and
//   2. drops a personal reminder in their queue so they know they must edit/review/verify it.
// `value` is the currently-assigned name (free text, matched back to a user by name).
export default function AssignColleague({
  value, onChange, disabled, className, notify,
}: {
  value?: string;
  onChange: (name: string) => void;                 // persist the assigned colleague's name ("" clears it)
  disabled?: boolean;
  className?: string;
  notify?: { title: string; notes?: string; projectId?: string; projectName?: string; link?: string };
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  useEffect(() => { fetchUsers().then(setUsers).catch(() => {}); }, []);

  const pick = (userId: string) => {
    const u = users.find((x) => x._id === userId);
    onChange(u?.name || "");
    if (u && notify) {
      createReminder({
        userId: u._id,
        title: notify.title,
        notes: notify.notes || "You were tagged to edit / review / verify this.",
        dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        link: notify.link,
        projectId: notify.projectId,
        projectName: notify.projectName,
      }).then(() => toast(`${u.name} was notified.`, "success")).catch(() => {});
    }
  };

  // No staff list yet (still loading, or none) → a plain text field so tagging never blocks.
  if (users.length === 0) {
    return (
      <input
        className={className || "text-[11px] rounded-lg border border-slate-200 px-2 py-1 w-40"}
        placeholder="Tag colleague…"
        defaultValue={value || ""}
        disabled={disabled}
        onBlur={(e) => onChange(e.target.value)}
        title="Tag a colleague to edit / review / verify"
      />
    );
  }

  return (
    <div className="inline-flex items-center gap-1" title="Tag a colleague to edit / review / verify — they get a reminder">
      <UserPlus size={13} className={value ? "text-primary" : "text-slate-300"} />
      <select
        className={className || "text-[11px] font-bold rounded-lg border border-slate-200 px-2 py-1 bg-white text-slate-600 cursor-pointer disabled:opacity-60"}
        value={users.find((u) => u.name === value)?._id || ""}
        disabled={disabled}
        onChange={(e) => pick(e.target.value)}
      >
        <option value="">{value ? `👤 ${value}` : "Tag colleague…"}</option>
        {users.map((u) => <option key={u._id} value={u._id}>{u.name || u.email}</option>)}
      </select>
    </div>
  );
}
