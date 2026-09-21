import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Loader2, UserPlus } from "lucide-react";
import { fetchEmployees, fetchCompanies, type MinuteAttendee, type ApiEmployee, type ApiCompany } from "../../lib/api";

/**
 * CR 249: "Add someone" picks from the people the platform already knows, the way an @mention does:
 * the project team first, then GreenTech staff, then the contacts of every Directory company. A name
 * that matches nobody can still be added as typed, for a visitor who is not in the platform.
 */

type Person = MinuteAttendee & { group: string };

let cache: Promise<Person[]> | null = null;   // staff and Directory, loaded once per page
const loadDirectory = () => {
  cache ??= Promise.all([
    fetchEmployees().catch((): ApiEmployee[] => []),
    fetchCompanies().catch((): ApiCompany[] => []),
  ]).then(([staff, companies]) => [
    ...staff.filter((e) => e.name).map<Person>((e) => ({ userId: e.id, name: e.name, role: e.jobTitle || "", company: "GreenTech USA", group: "Staff" })),
    ...companies.flatMap((c) => (c.contactPersons || []).filter((p) => p.name).map<Person>((p) => ({ name: p.name, role: p.role || "", company: c.name, group: "Directory" }))),
  ]);
  return cache;
};

export default function AttendeePicker({ team, taken, onAdd }: {
  team: Array<{ id?: string; name: string; role?: string; company?: string }>;
  /** Names already on the list, so they are not offered twice. */
  taken: string[];
  onAdd: (a: MinuteAttendee) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<Person[] | null>(null);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open && !dir) void loadDirectory().then(setDir); }, [open, dir]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const options = useMemo(() => {
    const used = new Set(taken.map((n) => n.trim().toLowerCase()));
    const seen = new Set<string>();
    const n = q.trim().toLowerCase();
    const all: Person[] = [
      ...team.map<Person>((p) => ({ userId: p.id, name: p.name, role: p.role || "", company: p.company || "", group: "On this project" })),
      ...(dir || []),
    ];
    return all.filter((p) => {
      const key = p.name.trim().toLowerCase();
      if (!key || used.has(key) || seen.has(key)) return false;
      if (n && !`${p.name} ${p.role} ${p.company}`.toLowerCase().includes(n)) return false;
      seen.add(key);
      return true;
    }).slice(0, 40);
  }, [team, dir, taken, q]);

  const typed = q.trim();
  const exact = options.some((p) => p.name.toLowerCase() === typed.toLowerCase());
  const pick = (a: MinuteAttendee) => { onAdd({ ...a, present: true }); setQ(""); setHi(0); setOpen(false); };
  const count = options.length + (typed && !exact ? 1 : 0);

  return (
    <div ref={box} className="relative m-3 inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200">
        <Plus size={11} /> Add someone
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <label className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search size={13} className="text-slate-400" />
            <input
              autoFocus value={q} placeholder="Name, company or role..." aria-label="Find someone"
              onChange={(e) => { setQ(e.target.value); setHi(0); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                else if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, count - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
                else if (e.key === "Enter") {
                  e.preventDefault();
                  if (hi < options.length) { const { group: _g, ...a } = options[hi]; pick(a); }
                  else if (typed) pick({ name: typed, role: "", company: "" });
                }
              }}
              className="min-w-0 flex-1 text-xs outline-none"
            />
          </label>
          <ul className="max-h-72 overflow-y-auto py-1">
            {options.map((p, i) => {
              const { group, ...a } = p;
              return (
                <li key={`${group}-${p.name}-${p.company}`}>
                  {(i === 0 || options[i - 1].group !== group) && <p className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">{group}</p>}
                  <button type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(a)} className={`flex w-full flex-col px-3 py-1.5 text-left ${hi === i ? "bg-primary/5" : ""}`}>
                    <span className="text-xs font-bold text-slate-800">{p.name}</span>
                    {(p.role || p.company) && <span className="text-[10px] text-slate-400">{[p.role, p.company].filter(Boolean).join(" · ")}</span>}
                  </button>
                </li>
              );
            })}
            {dir === null && <li className="flex items-center gap-2 px-3 py-2 text-[10px] text-slate-400"><Loader2 size={11} className="animate-spin" /> Loading the Directory...</li>}
            {dir !== null && !options.length && !typed && <li className="px-3 py-2 text-[10px] italic text-slate-400">Everyone is already on the list.</li>}
            {typed && !exact && (
              <li className="border-t border-slate-100">
                <button type="button" onMouseEnter={() => setHi(options.length)} onClick={() => pick({ name: typed, role: "", company: "" })} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-primary ${hi === options.length ? "bg-primary/5" : ""}`}>
                  <UserPlus size={12} /> Add "{typed}" as a name
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
