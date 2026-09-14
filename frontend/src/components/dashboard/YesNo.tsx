/**
 * A Yes / No choice as two buttons, placed beside a question's title (e.g. "Joint Venture: Yes / No").
 */
export default function YesNo({ value, onChange, disabled = false, label, yesTitle, noTitle }: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;          // what is being answered, for screen readers
  yesTitle?: string;
  noTitle?: string;
}) {
  const btn = (v: boolean, text: string, title?: string) => {
    const on = value === v;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        disabled={disabled}
        title={title}
        onClick={() => { if (!on) onChange(v); }}
        className={`min-w-[3.25rem] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:cursor-not-allowed ${
          on ? (v ? "bg-primary text-white shadow-sm" : "bg-slate-900 text-white shadow-sm") : "text-slate-500 hover:text-slate-900 hover:bg-white"
        }`}
      >
        {text}
      </button>
    );
  };
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 ${disabled ? "opacity-60" : ""}`}>
      {btn(true, "Yes", yesTitle)}
      {btn(false, "No", noTitle)}
    </div>
  );
}
