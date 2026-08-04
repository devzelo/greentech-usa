import projnellDark from "@/assets/projnell logo dark.png";
import projnellLight from "@/assets/projnell logo light.png";

type Tone = "light" | "dark";

/**
 * "Powered by Projnell" attribution lockup shown inside a subtle card.
 * The logo wordmark supplies the "Projnell"; the label supplies "Powered by".
 *
 * `tone="dark"`  → dark surfaces (e.g. the site footer)  → light logo
 * `tone="light"` → light surfaces (e.g. the auth pages)   → dark logo
 *
 * Non-interactive by design — it never navigates anywhere.
 */
export default function PoweredByProjnell({
  tone = "light",
  card = true,
  className = "",
}: {
  tone?: Tone;
  /** Wrap the lockup in a subtle card. Off = bare inline badge. */
  card?: boolean;
  className?: string;
}) {
  const cardStyle = card
    ? tone === "dark"
      ? "rounded-2xl border border-white/10 bg-white/5 px-5 py-3"
      : "rounded-2xl border border-slate-200/80 bg-white px-5 py-3 shadow-sm"
    : "";
  const logo = tone === "dark" ? projnellLight : projnellDark;

  return (
    <div
      aria-label="Powered by Projnell"
      className={`inline-flex items-center gap-3 ${cardStyle} ${className}`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        Powered by
      </span>
      <img
        src={logo}
        alt="Projnell"
        className="h-8 w-auto object-contain select-none"
        draggable={false}
      />
    </div>
  );
}
