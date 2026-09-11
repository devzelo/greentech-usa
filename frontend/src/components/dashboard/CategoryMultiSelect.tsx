import { Check } from "lucide-react";
import { SERVICE_CATEGORIES } from "../../data/services";

/**
 * Item 101 - a project's categories (services) as a multi-select: one project can be a water
 * treatment plant, HVAC and piping at once. Values outside the standard list (older records) stay
 * selectable so nothing is lost.
 */
export default function CategoryMultiSelect({ value, onChange, disabled = false }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const options = [...SERVICE_CATEGORIES, ...value.filter((v) => !SERVICE_CATEGORIES.includes(v))];
  const toggle = (c: string) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((c) => {
        const on = value.includes(c);
        return (
          <button
            key={c}
            type="button"
            disabled={disabled}
            onClick={() => toggle(c)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
              on ? "border-primary bg-primary/5 text-primary" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
            }`}
          >
            {on && <Check size={11} />}
            {c}
          </button>
        );
      })}
    </div>
  );
}
