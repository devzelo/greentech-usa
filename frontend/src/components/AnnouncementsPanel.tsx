import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { fetchAnnouncements, type ApiAnnouncement } from "../lib/api";

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// A minimal, branded glass badge that stays fixed at the bottom-right (like a chat widget) while
// scrolling. Mounted only by the Hero, so it appears on the home page only. It shows ONLY the
// announcement relevant to TODAY — a holiday appears on its exact date (Christmas only on the
// 25th), and custom announcements appear across their date…endDate window. Nothing shows otherwise.
export default function AnnouncementsPanel() {
  const [a, setA] = useState<ApiAnnouncement | null>(null);

  useEffect(() => {
    fetchAnnouncements().then((all) => {
      const today = todayStr();
      const todays = all.filter((x) => x.active && x.date && x.date <= today && today <= (x.endDate || x.date));
      setA(todays[0] || null); // one at a time — the selected/relevant one for the day
    }).catch(() => {});
  }, []);

  if (!a) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
      title={a.message || a.title}
      className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2.5 pl-2 pr-4 py-2 rounded-full bg-white/90 backdrop-blur-xl border border-slate-200/80 shadow-2xl shadow-slate-900/15"
    >
      <span className="relative inline-flex items-center justify-center w-9 h-9 rounded-full bg-gt-gradient text-white text-lg shadow-md shadow-primary/30 shrink-0">
        {a.emoji || "📣"}
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-secondary ring-2 ring-white animate-pulse" />
      </span>
      <div className="flex flex-col leading-tight pr-0.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Announcement</span>
        <span className="text-sm font-bold text-slate-900 whitespace-nowrap">{a.title}</span>
      </div>
    </motion.div>
  );
}
