import { type PresenceUser } from "../../lib/api";

// Shows who else is currently in the same record (client CR-B-16).
export default function PresenceBar({ users, className = "" }: { users: PresenceUser[]; className?: string }) {
  if (!users.length) return null;
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`} title={`Also here: ${users.map((u) => u.name).join(", ")}`}>
      <span className="flex -space-x-2">
        {users.slice(0, 4).map((u) => (
          <span key={u.userId} className="w-6 h-6 rounded-full bg-gt-gradient text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white uppercase">{(u.name || "?").slice(0, 1)}</span>
        ))}
      </span>
      <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">{users.length === 1 ? `${users[0].name} is also here` : `${users.length} others here`}</span>
    </div>
  );
}
