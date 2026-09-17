import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

// Live "Current time" at the project site (CR 180), ticking every second, so the team knows the
// hour on site before calling engineers abroad.
export default function LocalClock({ timeZone, place }: { timeZone: string; place?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!timeZone) return null;

  const time = now.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit", second: "2-digit" });
  const day = now.toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
  const zone = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(now).find((p) => p.type === "timeZoneName")?.value || "";
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
  const offHours = hour < 7 || hour >= 20;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${offHours ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-600"}`}
      title={`Current time${place ? ` in ${place}` : ""} (${timeZone.replace(/_/g, " ")})${offHours ? ". Outside working hours on site." : ""}`}
    >
      <Clock size={11} className={offHours ? "text-amber-500" : "text-primary"} />
      <span className="text-slate-400 font-semibold">Current time</span>
      <span className="tabular-nums">{time}</span>
      <span className="text-slate-400 font-semibold">{day} · {zone}</span>
    </span>
  );
}
