import { withFileToken } from "../../lib/api";

// CR-P — one avatar everywhere: the person's uploaded profile picture when they have one,
// otherwise their initial in a branded circle.
export default function Avatar({ url, name, size = 20, className = "" }: { url?: string; name?: string; size?: number; className?: string }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const style = { width: size, height: size, minWidth: size, fontSize: Math.max(8, Math.round(size * 0.42)) } as const;
  if (url) return <img src={withFileToken(url)} alt={name || ""} title={name} style={style} className={`rounded-full object-cover ring-1 ring-white shrink-0 ${className}`} />;
  return <span title={name} style={style} className={`rounded-full bg-gt-gradient text-white font-bold flex items-center justify-center ring-1 ring-white shrink-0 ${className}`}>{initial}</span>;
}
