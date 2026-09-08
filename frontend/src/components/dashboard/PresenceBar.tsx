import { type PresenceUser } from "../../lib/api";

// Shows who else is currently in the same record (client CR-B-16).
export default function PresenceBar({ users, className = "" }: { users: PresenceUser[]; className?: string }) {
  if (!users.length) return null;
  // CR-P (35) — kept deliberately small. It rides along in a sticky header, so it has to say who
  // else is here without crowding out the controls beside it. Which section they are in is not
  // shown: the client looked at it and said knowing they are in the document is enough.
  return (
    <div className={`inline-flex items-center gap-1 ${className}`} title={`Also here: ${users.map((u) => u.name).join(", ")}`}>
      <span className="flex -space-x-1.5">
        {users.slice(0, 3).map((u) => (
          <span key={u.userId} className="w-[1.125rem] h-[1.125rem] shrink-0 rounded-full bg-gt-gradient text-white text-[8px] font-bold flex items-center justify-center ring-1 ring-white uppercase">{(u.name || "?").slice(0, 1)}</span>
        ))}
      </span>
      <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap hidden sm:inline">
        {users.length === 1 ? users[0].name.split(" ")[0] : `${users.length} others`}
      </span>
    </div>
  );
}
