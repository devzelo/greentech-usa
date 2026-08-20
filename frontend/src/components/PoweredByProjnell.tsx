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
  size = "md",
  className = "",
}: {
  tone?: Tone;
  /** Wrap the lockup in a subtle card. Off = bare inline badge. */
  card?: boolean;
  /** "sm" shrinks the label + logo (e.g. the dashboard sidebar). */
  size?: "sm" | "md";
  className?: string;
}) {
  const cardStyle = card
    ? tone === "dark"
      ? "rounded-2xl border border-white/10 bg-white/5 px-5 py-3"
      : "rounded-2xl border border-slate-200/80 bg-white px-5 py-3 shadow-sm"
    : "";
  const logo = tone === "dark" ? projnellLight : projnellDark;
  const small = size === "sm";

  return (
    <div
      aria-label="Powered by Projnell"
      className={`inline-flex items-center ${small ? "gap-2" : "gap-3"} ${cardStyle} ${className}`}
    >
      <span className={`font-semibold uppercase text-slate-400 ${small ? "text-[8px] tracking-[0.15em]" : "text-[11px] tracking-[0.2em]"}`}>
        Powered by
      </span>
      <img
        src={logo}
        alt="Projnell"
        className={`w-auto object-contain select-none ${small ? "h-5" : "h-8"}`}
        draggable={false}
      />
    </div>
  );
}
