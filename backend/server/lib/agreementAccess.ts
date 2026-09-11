import User from "../models/User";

// CR-P (62) — who outside GreenTech may see an agreement. Being NAMED on it is not the same as
// being GIVEN it: until we share it, the agreement is internal and may hold terms we are still
// arguing about. One rule, used by the agreements list, the party's own profile and signing.

export interface PartyIdentity { email: string; companyId: string }

type Shareable = {
  status?: string;
  archived?: boolean;
  visibleTo?: Array<{ email?: string; companyId?: string }>;
  shares?: unknown[];
};

/** The login's email and Directory company, for matching against an agreement's visibleTo list. */
export async function partyIdentityOf(userId: string): Promise<PartyIdentity> {
  const u = await User.findById(userId).select("email companyId").lean() as { email?: string; companyId?: unknown } | null;
  return { email: String(u?.email || "").trim().toLowerCase(), companyId: u?.companyId ? String(u.companyId) : "" };
}

/** Was this agreement shared with this login, by its email or by its Directory company? */
export function isSharedWith(ag: Shareable, me: PartyIdentity): boolean {
  return (ag.visibleTo || []).some((v) =>
    (!!me.email && String(v.email || "").trim().toLowerCase() === me.email) ||
    (!!me.companyId && String(v.companyId || "") === me.companyId));
}

/**
 * May a party (anyone who is not staff) see this agreement at all?
 * Drafts, cancelled and archived agreements: never. An agreement with a "Visible to" list: only
 * the parties on it. An agreement from before sharing existed (no list and never shared) keeps
 * the old rule, where being issued to a party was what made it visible to them.
 */
export function partyMaySee(ag: Shareable, me: PartyIdentity): boolean {
  if (ag.archived) return false;
  if (ag.status === "Draft" || ag.status === "Cancelled") return false;
  if ((ag.visibleTo || []).length) return isSharedWith(ag, me);
  return (ag.shares || []).length === 0;
}
