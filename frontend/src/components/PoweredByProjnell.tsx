import projnellWhiteOnDark from "@/assets/white use on dark.png";
import projnellDarkOnWhite from "@/assets/dark use on white.png";

type Tone = "light" | "dark";

/**
 * "Powered by Projnell" attribution lockup shown inside a subtle card.
 * The logo wordmark supplies the "Projnell"; the label supplies "Powered by".
 *
 * `tone="dark"`  → dark surfaces (e.g. the site footer)  → white-on-dark logo
 * `tone="light"` → light surfaces (auth pages, sidebar)   → dark-on-white logo
 *
 * Non-interactive by design — it never navigates anywhere.
 */
export default function PoweredByProjnell({
  tone = "light",
  card = true,
  size = "md",
  className = "",
  logoClassName = "",
  labelClassName = "",
  logoHeightClass = "",
}: {
  tone?: Tone;
  /** Wrap the lockup in a subtle card. Off = bare inline badge. */
  card?: boolean;
  /** "sm" shrinks the label + logo (e.g. the dashboard sidebar). */
  size?: "sm" | "md";
  className?: string;
  /** Extra classes on the logo image itself (e.g. rounded corners in the footer). */
  logoClassName?: string;
  /** Override the "Powered by" label typography (e.g. a smaller label in the footer). */
  labelClassName?: string;
  /** Override the logo height class (e.g. a larger logo in the footer). Defaults to the size. */
  logoHeightClass?: string;
}) {
  const cardStyle = card
    ? tone === "dark"
      ? "rounded-2xl border border-white/10 bg-white/5 px-5 py-3"
      : "rounded-2xl border border-slate-200/80 bg-white px-5 py-3 shadow-sm"
    : "";
  const logo = tone === "dark" ? projnellWhiteOnDark : projnellDarkOnWhite;
  const small = size === "sm";

  return (
    <div
      aria-label="Powered by Projnell"
      className={`inline-flex items-center ${small ? "gap-2" : "gap-3"} ${cardStyle} ${className}`}
    >
      <span className={`font-semibold uppercase text-slate-400 ${labelClassName || (small ? "text-[8px] tracking-[0.15em]" : "text-[11px] tracking-[0.2em]")}`}>
        Powered by
      </span>
      <img
        src={logo}
        alt="Projnell"
        className={`w-auto object-contain select-none ${logoHeightClass || (small ? "h-6" : "h-8")} ${logoClassName}`}
        draggable={false}
      />
    </div>
  );
}
