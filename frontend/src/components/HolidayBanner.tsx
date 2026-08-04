import { useMemo, useState } from "react";
import { X } from "lucide-react";

// §N — a lightweight, automatic festive greeting shown on the public site around key dates.
// Automatic but editable: just edit the HOLIDAYS list. Each greeting shows on its date and the
// day after (≈2 days, per Reza), then disappears until the next occasion. Dismissible per visitor.
//
// Movable feasts (Eid, Chinese New Year) are listed with explicit dates because they shift yearly —
// extend the arrays as new years are confirmed. Fixed holidays repeat on the same month/day.
type Holiday = { id: string; emoji: string; greeting: string; message?: string; dates: string[] };

const HOLIDAYS: Holiday[] = [
  { id: "newyear", emoji: "🎉", greeting: "Happy New Year!", dates: ["2026-01-01", "2027-01-01", "2028-01-01"] },
  { id: "independence", emoji: "🇺🇸", greeting: "Happy 4th of July!", message: "GreenTech USA wishes you a safe and happy Independence Day.", dates: ["2025-07-04", "2026-07-04", "2027-07-04"] },
  { id: "veterans", emoji: "🎖️", greeting: "Honoring our Veterans.", message: "Thank you to all who served.", dates: ["2025-11-11", "2026-11-11", "2027-11-11"] },
  { id: "thanksgiving", emoji: "🦃", greeting: "Happy Thanksgiving!", dates: ["2025-11-27", "2026-11-26", "2027-11-25"] },
  { id: "christmas", emoji: "🎄", greeting: "Merry Christmas!", message: "Season's greetings from all of us at GreenTech USA.", dates: ["2025-12-25", "2026-12-25", "2027-12-25"] },
  { id: "cny", emoji: "🧧", greeting: "Happy Chinese New Year!", message: "Best wishes to those who celebrate.", dates: ["2026-02-17", "2027-02-06", "2028-01-26"] },
  { id: "eid-fitr", emoji: "🌙", greeting: "Eid Mubarak — Eid al-Fitr.", message: "Warm wishes to all who celebrate.", dates: ["2026-03-20", "2027-03-10", "2028-02-27"] },
  { id: "eid-adha", emoji: "🌙", greeting: "Eid Mubarak — Eid al-Adha.", message: "Warm wishes to all who celebrate.", dates: ["2026-05-27", "2027-05-16", "2028-05-05"] },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plusDay = (isoDate: string) => { const d = new Date(`${isoDate}T00:00:00`); d.setDate(d.getDate() + 1); return iso(d); };

// The active holiday for today (matches the date or the day after), if any.
function activeHoliday(today: string): { h: Holiday; anchor: string } | null {
  for (const h of HOLIDAYS) {
    for (const anchor of h.dates) {
      if (today === anchor || today === plusDay(anchor)) return { h, anchor };
    }
  }
  return null;
}

export default function HolidayBanner() {
  const today = useMemo(() => iso(new Date()), []);
  const match = useMemo(() => activeHoliday(today), [today]);
  const storageKey = match ? `gt-holiday-dismissed-${match.h.id}-${match.anchor}` : "";
  const [dismissed, setDismissed] = useState(() => (storageKey ? localStorage.getItem(storageKey) === "1" : true));

  if (!match || dismissed) return null;
  const { h } = match;
  return (
    <div className="w-full bg-gt-gradient text-white">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-center relative">
        <span className="text-base" aria-hidden>{h.emoji}</span>
        <p className="text-xs sm:text-sm font-bold">
          {h.greeting}{h.message ? <span className="font-medium opacity-90"> {h.message}</span> : null}
        </p>
        <button
          onClick={() => { if (storageKey) localStorage.setItem(storageKey, "1"); setDismissed(true); }}
          aria-label="Dismiss"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/20 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
