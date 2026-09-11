import type { CompanyFile, ProposalAttachment } from "./api";

/**
 * Proposal step 4 (item 104; spec 3 and 6) - whether a company document is still valid.
 * "The system should verify document expiration dates ... and warn the proposal writer if a
 * document appears expired or outdated." Expiring means within 30 days.
 */
export type ExpiryState = "none" | "valid" | "expiring" | "expired";
export interface ExpiryInfo { state: ExpiryState; days: number; label: string; cls: string }

const EXPIRING_DAYS = 30;
const fmt = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

export function expiryInfo(expiresAt?: string, now = new Date()): ExpiryInfo {
  if (!expiresAt || !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return { state: "none", days: Infinity, label: "", cls: "" };
  const d = new Date(`${expiresAt}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { state: "expired", days, label: `Expired ${fmt(d)}`, cls: "bg-red-50 text-red-600" };
  if (days <= EXPIRING_DAYS) return { state: "expiring", days, label: days === 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}`, cls: "bg-amber-50 text-amber-700" };
  return { state: "valid", days, label: `Valid to ${fmt(d)}`, cls: "bg-emerald-50 text-emerald-700" };
}

/**
 * The document of a given type to pull into a proposal: the one valid the longest, else (when none
 * is dated) the newest upload; expired ones only as a last resort, so the writer still sees one and
 * is warned rather than getting nothing.
 */
export function bestDocFor<T extends CompanyFile>(libraryKey: string, docs: T[]): T | undefined {
  const same = docs.filter((d) => d.libraryKey === libraryKey && !d.archived);
  if (!same.length) return undefined;
  const rank = (d: T) => {
    const e = expiryInfo(d.expiresAt);
    return e.state === "expired" ? 0 : 1;
  };
  return same.slice().sort((a, b) =>
    rank(b) - rank(a)
    || (b.expiresAt || "").localeCompare(a.expiresAt || "")
    || (b.createdAt || "").localeCompare(a.createdAt || ""),
  )[0];
}

/** A company document as a section attachment (served path, plus its id for expiry checks). */
export function docAttachment(f: CompanyFile): ProposalAttachment {
  return { name: f.name, url: f.url || `/${(f.filePath || "").replace(/\\/g, "/").replace(/^\/+/, "")}`, companyFileId: f._id };
}
