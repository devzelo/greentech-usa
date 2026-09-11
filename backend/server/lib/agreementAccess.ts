import User from "../models/User";

// CR-P (62) — who outside GreenTech may see an agreement. Being NAMED on it is not the same as
// being GIVEN it: until we share it, the agreement is internal and may hold terms we are still
// arguing about. One rule, used by the agreements list, the party's own profile and signing.

export interface PartyIdentity { email: string; companyId: string }

type Shareable = {
  status?: string;
  archived?: boolean;
  visibleTo?: Array<{ email?: string; companyId?: string; name?: string }>;
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

// ── CR-P (64) — signing, one slot per party ──────────────────────────────────────────────────

type PartyLike = { name?: string; email?: string; companyId?: string };
type Signable = Shareable & {
  partySnapshot?: { party2?: PartyLike; extraParties?: PartyLike[] };
  signatures?: { recipient?: { signedAt?: string }; extra?: Array<{ signedAt?: string }> };
};
const lc = (s?: string) => String(s || "").trim().toLowerCase();

/**
 * Which signature slot belongs to this login: -1 is party 2 (signatures.recipient), 0 and 1 are
 * parties 3 and 4 (signatures.extra[i]). Matched on the party's Directory company or email, then
 * through the share that reached them. Anyone else with standing to sign (the project's own sub
 * or partner record, or the employee on their own agreement) is party 2, as before.
 */
export function signSlotOf(ag: Signable, me: PartyIdentity): number {
  const parties = [ag.partySnapshot?.party2, ...(ag.partySnapshot?.extraParties || [])];
  let idx = parties.findIndex((x) => !!x && (
    (!!me.companyId && String(x.companyId || "") === me.companyId) || (!!me.email && lc(x.email) === me.email)));
  if (idx < 0) {
    const share = (ag.visibleTo || []).find((v) =>
      (!!me.email && lc(v.email) === me.email) || (!!me.companyId && String(v.companyId || "") === me.companyId));
    if (share) {
      idx = parties.findIndex((x) => !!x && (
        (!!share.companyId && String(x.companyId || "") === String(share.companyId)) || (!!lc(share.name) && lc(x.name) === lc(share.name))));
    }
  }
  return Math.max(idx, 0) - 1;
}

/** When the given slot signed, or "" if it has not. */
export function slotSignedAt(ag: Signable, slot: number): string {
  return String((slot < 0 ? ag.signatures?.recipient?.signedAt : ag.signatures?.extra?.[slot]?.signedAt) || "");
}

/** How many counterparties (party 2 onward) have signed, out of how many. Party 1 is GreenTech. */
export function signatureCount(ag: Signable): { signed: number; total: number } {
  const extras = (ag.partySnapshot?.extraParties || []).length;
  let signed = ag.signatures?.recipient?.signedAt ? 1 : 0;
  for (let i = 0; i < extras; i++) if (ag.signatures?.extra?.[i]?.signedAt) signed++;
  return { signed, total: 1 + extras };
}

type SectionLike = { hidden?: boolean; notes?: string; assignedTo?: string; history?: unknown[] };

/**
 * CR-P (62) — the agreement as a party receives it: the document, never our internal working.
 * Hidden sections, section notes, reviewer tags and history are dropped, and the share list
 * and "Visible to" list are cut down to this party's own entries. `youSigned` tells the party's
 * screen whether their own signature is already on it.
 */
export function forParty<T extends object>(doc: T, me: PartyIdentity) {
  const withToObject = doc as { toObject?: () => object };
  const o = (typeof withToObject.toObject === "function" ? withToObject.toObject() : { ...doc }) as Signable & {
    extraSections?: SectionLike[];
    sectionAssignees?: Record<string, string>;
    shares?: Array<{ email?: string; companyId?: string }>;
    youSigned?: boolean;
    remark?: string;
  };
  o.remark = "";   // CR-P (60) — our internal remark never goes to a party
  const mine = (v: { email?: string; companyId?: string }) => isSharedWith({ visibleTo: [v] }, me);
  o.extraSections = (o.extraSections || []).filter((s) => !s.hidden).map((s) => ({ ...s, notes: "", assignedTo: "", history: [] }));
  o.sectionAssignees = { scope: "", terms: "", paymentConditions: "", deliveryConditions: "" };
  o.youSigned = !!slotSignedAt(o, signSlotOf(o, me));
  o.visibleTo = (o.visibleTo || []).filter(mine);
  o.shares = (o.shares || []).filter(mine);
  return o;
}
