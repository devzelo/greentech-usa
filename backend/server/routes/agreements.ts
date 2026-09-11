import { Router, Response, NextFunction } from "express";
import mongoose from "mongoose";
import multer from "multer";
import fs from "fs";
import path from "path";
import Agreement, { IAgreement, AgreementStatus, AgreementEntityType } from "../models/Agreement";
import AgreementTemplate from "../models/AgreementTemplate";
import { nextSequence } from "../models/Counter";
import Project from "../models/Project";
import User from "../models/User";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { getProjectAccess } from "../lib/access";
import { createNotification } from "../lib/notify";
import { moveToTrash } from "../lib/recycleBin";
import { isSharedWith, signSlotOf, slotSignedAt, signatureCount, forParty } from "../lib/agreementAccess";

// One agreement engine, two context adapters (spec: docs/agreement-feature-spec.md):
//   userAgreementRouter    → /api/users/:uid/agreements      (employee agreements)
//   projectAgreementRouter → /api/projects/:id/agreements    (partner / sub / vendor agreements)
//   agreementTemplateRouter→ /api/agreement-templates
//
// Permissions:
//   user context    — admin manages; the employee themself can read + sign/reject their own.
//   project context — owners/assigned employees manage; a subcontractor login can read + sign
//                     the agreements of their OWN sub record only. Vendors have no login —
//                     the counter-signed copy is uploaded by staff (sign-upload).
// A Signed agreement is immutable: only Expired/Cancelled transitions remain.

type Ctx = "user" | "project" | "general";

const humanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const today = () => new Date().toISOString().slice(0, 10);

// CR-P (19) — an agreement holds at most 4 parties: party1, party2 and up to 2 extras.
// A bonding application needs three signatories (bank, company, surety); a JV can add one more.
const MAX_EXTRA_PARTIES = 2;
const cleanParty = (v: unknown) => {
  const o = (v || {}) as Record<string, unknown>;
  return {
    name: String(o.name ?? "").slice(0, 200),
    contactName: String(o.contactName ?? "").slice(0, 160),
    address: String(o.address ?? "").slice(0, 400),
    email: String(o.email ?? "").slice(0, 200),
    phone: String(o.phone ?? "").slice(0, 60),
    logoUrl: String(o.logoUrl ?? "").slice(0, 2000),
    companyId: String(o.companyId ?? "").slice(0, 60),
  };
};
// Keeps party1/party2/contextLines as sent, and clamps extraParties to the 2-slot cap.
const cleanPartySnapshot = (v: unknown) => {
  const b = (v || {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...b };
  if ("extraParties" in b) {
    out.extraParties = Array.isArray(b.extraParties)
      ? (b.extraParties as unknown[]).slice(0, MAX_EXTRA_PARTIES).map(cleanParty).filter((p) => p.name)
      : [];
  }
  return out;
};

// CR-P (23) — the next agreement reference, AG-0001, AG-0002, … The counter is standalone so a
// cancelled or deleted agreement never hands its number to the next one. On a database that
// already holds numbered agreements, the counter is seeded past the highest one the first time.
async function nextAgreementNo(): Promise<string> {
  let startAt = 0;
  const highest = await Agreement.findOne({ agreementNo: /^AG-\d+$/ }).sort({ agreementNo: -1 }).select("agreementNo").lean();
  if (highest?.agreementNo) startAt = parseInt(highest.agreementNo.slice(3), 10) || 0;
  const n = await nextSequence("agreementNo", startAt);
  return `AG-${String(n).padStart(4, "0")}`;
}

// CR-P (27) — the projects an agreement covers, name and location snapshotted so the printed
// document keeps the details it was issued with.
const cleanLinkedProjects = (v: unknown) =>
  Array.isArray(v)
    ? (v as Array<{ id?: unknown; name?: unknown; location?: unknown }>)
        .map((p) => ({ id: String(p?.id || ""), name: String(p?.name || "").slice(0, 200), location: String(p?.location || "").slice(0, 200) }))
        .filter((p) => p.id)
    : [];

// CR-P (21) — which dates the document carries. Anything missing stays on (a date with no value
// never prints anyway), so agreements written before this existed are unaffected.
const cleanDatesShown = (v: unknown) => {
  const o = (v || {}) as Record<string, unknown>;
  const on = (k: string) => (k in o ? !!o[k] : true);
  return { effective: on("effective"), start: on("start"), end: on("end") };
};

// Custom named rich-text sections on an agreement (title + HTML body).
const cleanExtraSections = (v: unknown): Array<{ id: string; title: string; body: string; status: string; locked: boolean; hidden: boolean; notes: string; assignedTo: string; attachments: Array<{ name: string; filePath: string; fileType: string; size: string; kind: string }>; history: Array<{ at: string; by: string; text: string }> }> =>
  Array.isArray(v)
    ? v.map((s) => {
        const o = s as { title?: unknown; body?: unknown; status?: unknown; locked?: unknown; hidden?: unknown; notes?: unknown };
        return {
          // CR-P (36) — the section's stable id, carried through every save (live merge key).
          id: String((o as { id?: unknown })?.id ?? "").slice(0, 40),
          title: String(o?.title ?? "").slice(0, 120),
          body: String(o?.body ?? "").slice(0, 20000),
          status: String(o?.status ?? "").slice(0, 20),
          locked: !!o?.locked,
          hidden: !!o?.hidden,
          notes: String(o?.notes ?? "").slice(0, 500),
          assignedTo: String((o as { assignedTo?: unknown })?.assignedTo ?? "").slice(0, 120),
          // CR-B-18 — carry per-section attachments through a whole-draft save (uploaded separately).
          attachments: Array.isArray((o as { attachments?: unknown })?.attachments)
            ? ((o as { attachments: Array<Record<string, unknown>> }).attachments).slice(0, 50).map((a) => ({
                name: String(a?.name ?? ""), filePath: String(a?.filePath ?? ""), fileType: String(a?.fileType ?? ""), size: String(a?.size ?? ""), kind: String(a?.kind ?? "other"),
                // CR-P (42)/(44) — carry the print flag and placement through a whole-draft save.
                // Absent means "print, after its section": that is what every existing file did.
                print: a?.print === undefined ? true : !!a.print,
                placement: a?.placement === "end" ? "end" : "after",
              }))
            : [],
          // CR-B-17 — carry the per-section change history (View History).
          history: Array.isArray((o as { history?: unknown })?.history)
            ? ((o as { history: Array<Record<string, unknown>> }).history).slice(-50).map((h) => ({
                at: String(h?.at ?? ""), by: String(h?.by ?? "").slice(0, 80), text: String(h?.text ?? "").slice(0, 200),
              }))
            : [],
        };
      })
       .filter((s) => s.title || s.body).slice(0, 20)
    : [];

// CR-P (52) — a replaced signed copy is kept, not deleted. The old file stays on disk and is
// listed under the current one, so we can always show what we held before and when it changed.
function archiveSignedCopy(ag: IAgreement, byName: string) {
  const cur = ag.signedDocument;
  if (!cur?.filePath) return;
  ag.signedDocumentHistory = ag.signedDocumentHistory || [];
  ag.signedDocumentHistory.push({
    name: cur.name, filePath: cur.filePath, fileType: cur.fileType, size: cur.size,
    replacedAt: new Date().toISOString(), replacedByName: byName,
  });
}

function act(ag: IAgreement, actorName: string, action: string, note = "") {
  ag.activity.push({ at: new Date(), actorName, action, note });
}

// CR-P (58)/(63) — the logins behind a party: the account with the party's email, and any login
// linked to the party's Directory company (its login may use a different address).
async function loginsOf(party: { companyId?: string; email?: string }): Promise<string[]> {
  const or: Record<string, unknown>[] = [];
  if (party.email) or.push({ email: new RegExp(`^${escapeRegex(party.email.trim())}$`, "i") });
  if (party.companyId && mongoose.isValidObjectId(party.companyId)) or.push({ companyId: party.companyId });
  if (!or.length) return [];
  const users = await User.find({ $or: or }).select("_id").lean();
  return users.map((u) => String(u._id));
}

// `email` is carried so a party that was SHARED an agreement (CR-P (63)) can be recognised as its
// recipient and sign it, which is what CR-P (64) asks for.
// `companyId` is the login's Directory company (CR-P (58)): a share goes to a company, and the
// company's login may use a different address from the one on the Directory record.
interface Perms { staff: boolean; self: boolean; mySubIds: string[]; isPartner: boolean; email: string; companyId: string }

// Resolve what the requester may do in this context.
async function resolvePerms(ctx: Ctx, req: AuthedRequest): Promise<Perms | null> {
  const userId = req.user!.userId;
  const meDoc = await User.findById(userId).select("empId email companyId").lean();
  const myEmail = String((meDoc as { email?: string } | null)?.email || "").trim().toLowerCase();
  const myCompanyId = (meDoc as { companyId?: unknown } | null)?.companyId ? String((meDoc as { companyId?: unknown }).companyId) : "";
  if (ctx === "user") {
    return { staff: req.user!.role === "admin", self: String(userId) === String(req.params.uid), mySubIds: [], isPartner: false, email: myEmail, companyId: myCompanyId };
  }
  if (ctx === "general") {
    // CR-P (64) — an outside party used to be locked out of general agreements entirely ("the
    // counterparty has no login"). They can have one now, so they are let through as NON-staff:
    // the list is already filtered to agreements shared with them (CR-P (62)), and every
    // single-agreement action is guarded by isRecipient below.
    const staff = req.user!.role === "admin" || req.user!.role === "employee";
    return { staff, self: false, mySubIds: [], isPartner: false, email: myEmail, companyId: myCompanyId };
  }
  const project = await Project.findOne({ projectId: req.params.id })
    .select("ownerId assignedEmployees guests subcontractors jointVenture").lean();
  if (!project) return null;
  const me = meDoc;
  const access = getProjectAccess(project, userId, (me as { empId?: string } | null)?.empId || "");
  if (access.role === "none") return null;
  // Match the sub record by its hard link (userId) OR by email — the same two-way rule the
  // Subcontractors tab uses, so a record linked only by email isn't silently locked out.
  const myEmailLower = String((me as { email?: string } | null)?.email || "").trim().toLowerCase();
  const mySubIds = (project.subcontractors || [])
    .filter((s: { userId?: string; email?: string }) =>
      String(s.userId || "") === String(userId) ||
      (!!myEmailLower && String(s.email || "").trim().toLowerCase() === myEmailLower))
    .map((s: { subId?: string }) => String(s.subId || ""))
    .filter(Boolean);
  // The JV partner's login is a project guest matched by the partner email on the JV record —
  // the same rule the Partners tab uses to show the partner's account.
  const jvEmail = String(project.jointVenture?.email || "").trim().toLowerCase();
  const isPartner = !!project.jointVenture?.enabled && !!jvEmail && jvEmail === myEmailLower;
  return { staff: access.role === "owner" || access.role === "employee", self: false, mySubIds, isPartner, email: myEmailLower, companyId: myCompanyId };
}

// Is the requester the agreement's recipient (the one who signs)?
function isRecipient(ctx: Ctx, ag: IAgreement, p: Perms): boolean {
  // CR-P (64) — a party the agreement was SHARED with is its recipient and may sign or reject it,
  // whatever context it lives in. This is what lets a subcontractor or partner sign from their own
  // profile instead of us signing on their behalf.
  if (isSharedWith(ag, p)) return true;
  if (ctx === "user") return p.self;
  if (ctx === "general") return false;   // not named on it and not shared it — no standing to sign
  if (ag.ownerEntityType === "partner") return p.isPartner;
  return ag.ownerEntityType === "subcontractor" && p.mySubIds.includes(ag.ownerEntityId);
}

function ownerFilter(ctx: Ctx, req: AuthedRequest): Record<string, string> {
  if (ctx === "user") return { ownerContextType: "user", ownerUserId: String(req.params.uid) };
  if (ctx === "general") return { ownerContextType: "general" };
  return { ownerContextType: "project", ownerProjectId: String(req.params.id) };
}

// Plain string fields an editor may change. `linkedProjects` used to be listed here, but the loop
// below coerces every entry with String(), which turned the array into "[object Object]" — it is
// handled on its own now (CR-P (27)).
const EDIT_FIELDS = ["name", "title", "description", "remark", "agreementType", "templateId", "effectiveDate", "startDate", "endDate"] as const;

function buildAgreementRouter(ctx: Ctx): Router {
  const router = Router({ mergeParams: true });
  router.use(requireAuth);

  // Per-request permission resolution — 403/404 out early.
  router.use(async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const p = await resolvePerms(ctx, req);
      if (!p) return res.status(ctx === "project" ? 404 : 403).json({ error: ctx === "project" ? "Project not found or no access." : "No access." });
      // A shared outside party has no sub/partner standing, so the guard cannot reject on that
      // alone any more; the list filter and isRecipient do the real work (CR-P (62)/(64)).
      if (!p.staff && !p.self && !p.isPartner && p.mySubIds.length === 0 && !p.email && !p.companyId) return res.status(403).json({ error: "You do not have access to these agreements." });
      (req as AuthedRequest & { agPerms?: Perms }).agPerms = p;
      next();
    } catch (err) { next(err); }
  });
  const permsOf = (req: AuthedRequest): Perms => (req as AuthedRequest & { agPerms?: Perms }).agPerms!;
  // CR-P (62) — a party gets the document, never our internal working (notes, reviewers, hidden
  // sections, who else it was sent to). Staff get the full record.
  const outFor = (req: AuthedRequest, ag: IAgreement) => (permsOf(req).staff ? ag : forParty(ag, permsOf(req)));

  // Every :aid route — reject anything that isn't a real ObjectId BEFORE it reaches a handler
  // (or multer, whose upload path is derived from these params). Also turns CastError 500s into 404s.
  router.param("aid", (req, res, next, value) => {
    if (!mongoose.isValidObjectId(String(value))) return res.status(404).json({ error: "Not found" });
    next();
  });

  const findAg = async (req: AuthedRequest) =>
    Agreement.findOne({ _id: req.params.aid, ...ownerFilter(ctx, req) });

  // ── List ──────────────────────────────────────────────────────────────────
  router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const p = permsOf(req);
      const filter: Record<string, unknown> = ownerFilter(ctx, req);
      const qType = req.query.entityType ? String(req.query.entityType) : "";
      const qId = req.query.entityId ? String(req.query.entityId) : "";
      if (qType) filter.ownerEntityType = qType;
      if (qId) filter.ownerEntityId = qId;
      // Archived agreements are hidden unless staff explicitly asks for the archived view.
      filter.archived = p.staff && String(req.query.archived) === "true" ? true : { $ne: true };
      if (!p.staff) {
        // A recipient never sees drafts or cancelled records — only what was actually issued.
        filter.status = { $nin: ["Draft", "Cancelled"] };
        if (ctx === "user") { if (!p.self) return res.status(403).json({ error: "No access." }); }
        else {
          // Intersect the requested entity with what this recipient owns — never widen it.
          const scopes: Array<Record<string, unknown>> = [];
          if (p.mySubIds.length && (!qType || qType === "subcontractor")) {
            const ids = qId ? p.mySubIds.filter((s) => s === qId) : p.mySubIds;
            if (ids.length) scopes.push({ ownerEntityType: "subcontractor", ownerEntityId: { $in: ids } });
          }
          if (p.isPartner && (!qType || qType === "partner")) scopes.push({ ownerEntityType: "partner" });
          // CR-P (58) — anything shared with this login is theirs to see, in either context. A
          // general agreement owns no sub or partner record, so this is the ONLY way a party
          // reaches one: before it, a shared general agreement came back as an empty list.
          // Still narrowed to the entity asked for, so a record's panel never widens.
          const within: Record<string, unknown> = {};
          if (qType) within.ownerEntityType = qType;
          if (qId) within.ownerEntityId = qId;
          if (p.email) scopes.push({ ...within, "visibleTo.email": new RegExp(`^${escapeRegex(p.email)}$`, "i") });
          if (p.companyId) scopes.push({ ...within, "visibleTo.companyId": p.companyId });
          if (!scopes.length) return res.json([]);
          delete filter.ownerEntityType; delete filter.ownerEntityId;
          filter.$or = scopes;
        }
      }
      let list = await Agreement.find(filter).sort({ createdAt: -1 });
      // CR-P (62) — being NAMED on an agreement is not the same as having been GIVEN it. Until the
      // agreement is shared, it is internal: "we don't want them to see... you are adding some
      // restricted information here". So a recipient only sees agreements whose visibleTo list
      // includes them. Agreements from before this existed have an empty list and are matched the
      // old way (they were already issued to this recipient), so nothing disappears retroactively.
      if (!p.staff) {
        list = list.filter((ag) => {
          const shared = ag.visibleTo || [];
          // Legacy: never shared explicitly. An emailed copy (CR-P (61)) is not a share with a party.
          if (!shared.length) return !(ag.shares || []).some((s) => s.purpose !== "email");
          return isSharedWith(ag, p);   // by the login's email or its Directory company
        });
      }
      // Recipient opening their list marks freshly-sent agreements as Viewed.
      if (!p.staff) {
        for (const ag of list) {
          if (ag.status === "Sent" && isRecipient(ctx, ag, p)) {
            ag.status = "Viewed";
            act(ag, req.user!.name || "", "viewed");
            await ag.save();
          }
        }
      }
      res.json(p.staff ? list : list.map((ag) => forParty(ag, p)));
    } catch (err) { next(err); }
  });

  // CR-P (36) — one agreement, for the open editor's live refresh. The editor used to fetch the
  // whole list every few seconds just to read this one. Staff only: only staff edit.
  router.get("/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "No access." });
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      res.json(ag);
    } catch (err) { next(err); }
  });

  // ── Create (staff) ────────────────────────────────────────────────────────
  router.post("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "Only staff can create agreements." });
      const b = req.body || {};
      const entityType = ctx === "project" ? String(b.ownerEntityType || "") : "";
      if (ctx === "project" && !["partner", "subcontractor", "vendor"].includes(entityType)) {
        return res.status(400).json({ error: "ownerEntityType must be partner, subcontractor or vendor." });
      }
      const ag = await Agreement.create({
        ownerContextType: ctx,
        ownerUserId: ctx === "user" ? String(req.params.uid) : "",
        ownerProjectId: ctx === "project" ? String(req.params.id) : "",
        // general agreements own no entity — the counterparty lives entirely in partySnapshot
        ownerEntityType: entityType as AgreementEntityType,
        ownerEntityId: ctx === "project" ? String(b.ownerEntityId || "") : "",
        name: String(b.name || "").slice(0, 160),
        agreementNo: await nextAgreementNo(),   // CR-P (23) — server-assigned, never from the client
        title: String(b.title || "").slice(0, 200),
        description: String(b.description || "").slice(0, 4000),
        remark: String(b.remark || "").slice(0, 4000),   // CR-P (60)
        agreementType: String(b.agreementType || "Custom").slice(0, 60),
        templateId: String(b.templateId || ""),
        linkedProjects: cleanLinkedProjects(b.linkedProjects),
        effectiveDate: String(b.effectiveDate || ""),
        startDate: String(b.startDate || ""),
        endDate: String(b.endDate || ""),
        datesShown: cleanDatesShown(b.datesShown),  // CR-P (21)
        docStatus: String(b.docStatus || "").slice(0, 20),   // CR-P (33)
        partySnapshot: cleanPartySnapshot(b.partySnapshot),
        sections: b.sections || {},
        extraSections: cleanExtraSections(b.extraSections),
        sectionAssignees: {
          scope: String(b.sectionAssignees?.scope || ""),
          terms: String(b.sectionAssignees?.terms || ""),
          paymentConditions: String(b.sectionAssignees?.paymentConditions || ""),
          deliveryConditions: String(b.sectionAssignees?.deliveryConditions || ""),
        },
        letterhead: b.letterhead === "jv" ? "jv" : "gt",
        jvLogoUrl: String(b.jvLogoUrl || ""),
        jvPartnerId: String(b.jvPartnerId || "").slice(0, 60),        // CR-P (30)
        jvPartnerName: String(b.jvPartnerName || "").slice(0, 200),   // CR-P (30)
        documentMode: b.documentMode === "uploaded" ? "uploaded" : "built",
        // Accept the company signer at creation so the client needs ONE call (no half-made record).
        // CR-P (16) — the counterparty's stored signature can be attached the same way.
        signatures: {
          ...(b.signatures || {}),
          ...(b.companySignature ? { company: b.companySignature } : {}),
          ...(b.recipientSignature ? { recipient: b.recipientSignature } : {}),
        },
        status: "Draft",
        addedById: req.user!.userId,
        addedByName: req.user!.name || "",
        activity: [{ at: new Date(), actorName: req.user!.name || "", action: "created", note: "" }],
      });
      res.status(201).json(ag);
    } catch (err) { next(err); }
  });

  // ── Edit (staff; locked once Signed; party snapshot locked once Sent) ─────
  router.patch("/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "Only staff can edit agreements." });
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      // Archive/restore is allowed in any status (it doesn't change the agreement's terms).
      if (typeof req.body?.archived === "boolean" && Object.keys(req.body).length === 1) {
        ag.archived = req.body.archived; await ag.save(); return res.json(ag);
      }
      if (ag.status === "Signed") return res.status(400).json({ error: "A signed agreement is locked. Only cancel/expire are possible." });
      const b = req.body || {};
      for (const f of EDIT_FIELDS) if (f in b) (ag as unknown as Record<string, unknown>)[f] = String(b[f] ?? "").slice(0, f === "name" ? 160 : f === "description" || f === "remark" ? 4000 : 200);
      if (Array.isArray(b.linkedProjects)) ag.linkedProjects = cleanLinkedProjects(b.linkedProjects);  // CR-P (27)
      if (b.datesShown && typeof b.datesShown === "object") ag.datesShown = cleanDatesShown(b.datesShown);  // CR-P (21)
      if (typeof b.docStatus === "string") ag.docStatus = b.docStatus.slice(0, 20);  // CR-P (33)
      if (b.letterhead === "gt" || b.letterhead === "jv") ag.letterhead = b.letterhead;
      if (typeof b.jvLogoUrl === "string") ag.jvLogoUrl = b.jvLogoUrl;
      // CR-P (30) — the picked Directory partner behind the JV letterhead.
      if (typeof b.jvPartnerId === "string") ag.jvPartnerId = b.jvPartnerId.slice(0, 60);
      if (typeof b.jvPartnerName === "string") ag.jvPartnerName = b.jvPartnerName.slice(0, 200);
      if (b.documentMode === "built" || b.documentMode === "uploaded") ag.documentMode = b.documentMode;
      if (b.sections && typeof b.sections === "object") ag.sections = { ...ag.sections, ...b.sections };
      if (Array.isArray(b.extraSections)) ag.extraSections = cleanExtraSections(b.extraSections);
      if (b.sectionAssignees && typeof b.sectionAssignees === "object") {
        const a = b.sectionAssignees;
        ag.sectionAssignees = {
          scope: String(a.scope ?? ag.sectionAssignees?.scope ?? ""),
          terms: String(a.terms ?? ag.sectionAssignees?.terms ?? ""),
          paymentConditions: String(a.paymentConditions ?? ag.sectionAssignees?.paymentConditions ?? ""),
          deliveryConditions: String(a.deliveryConditions ?? ag.sectionAssignees?.deliveryConditions ?? ""),
        };
      }
      // The party snapshot freezes at send time (spec §3) — applied only while still a Draft.
      // Once sent it is silently ignored so that editing the TERMS of a sent/rejected agreement
      // (and re-sending it) still works.
      if (b.partySnapshot && typeof b.partySnapshot === "object" && ag.status === "Draft") {
        ag.partySnapshot = { ...ag.partySnapshot, ...cleanPartySnapshot(b.partySnapshot) };
      }
      if (b.companySignature && typeof b.companySignature === "object") {
        ag.signatures.company = { ...ag.signatures.company, ...b.companySignature };
      }
      // CR-P (16) — staff can attach the counterparty's stored signature (named signatures the
      // subcontractor/partner uploaded on their profile) before or after sending.
      if (b.recipientSignature && typeof b.recipientSignature === "object") {
        ag.signatures.recipient = { ...ag.signatures.recipient, ...b.recipientSignature };
      }
      if (b.status === "PendingSignature" && ["Sent", "Viewed"].includes(ag.status)) {
        ag.status = "PendingSignature";
        act(ag, req.user!.name || "", "pending-signature");
      }
      await ag.save();
      res.json(ag);
    } catch (err) { next(err); }
  });

  // CR-P (57) — the old one-shot "Send" route lived here. It is gone: Share (below) replaces it.

  // ── Share with the parties (CR-P (57)/(58)/(59)/(61)/(63)) ────────────────
  // Replaces the old one-shot "Send". Staff pick WHICH parties receive it and why, the chosen
  // parties gain visibility, everyone picked is notified, and the send is logged. It stays
  // available afterwards, so the same agreement can go out again after a revision.
  router.post("/:aid/share", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "Only staff can share agreements." });
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      if (ag.status === "Cancelled") return res.status(400).json({ error: "A cancelled agreement cannot be shared." });

      const body = req.body || {};
      const purpose = body.purpose === "signature" ? "signature" : "review";
      const note = String(body.note || "").slice(0, 500);
      const picked = Array.isArray(body.parties) ? body.parties : [];
      if (!picked.length) return res.status(400).json({ error: "Choose at least one party to share with." });

      const stamp = new Date().toISOString();
      const by = req.user!.name || "";
      ag.visibleTo = ag.visibleTo || [];
      ag.shares = ag.shares || [];

      for (const raw of picked.slice(0, 10)) {
        const party = {
          companyId: String((raw as { companyId?: unknown })?.companyId || "").slice(0, 60),
          name: String((raw as { name?: unknown })?.name || "").slice(0, 200),
          email: String((raw as { email?: unknown })?.email || "").slice(0, 200),
        };
        if (!party.name) continue;
        // Visibility is a set: sharing again must not duplicate the grant, only log the send.
        const already = ag.visibleTo.some((v) =>
          (party.companyId && v.companyId === party.companyId) ||
          (!party.companyId && v.name.toLowerCase() === party.name.toLowerCase()));
        if (!already) ag.visibleTo.push({ ...party, grantedAt: stamp, grantedByName: by });
        ag.shares.push({ ...party, purpose, sentAt: stamp, sentByName: by, note });

        // Notify the party's logins: by email, or through its Directory company.
        for (const uid of await loginsOf(party)) {
          await createNotification({
            userId: uid, type: "general",
            title: purpose === "signature" ? "Agreement awaiting your signature" : "Agreement shared with you for review",
            message: `${by || "GreenTech USA"} shared "${ag.agreementNo || ag.name || ag.agreementType}" with you.${note ? ` Note: ${note}` : ""}`,
            link: `${ctx === "user" ? "/dashboard/profile" : ctx === "general" ? "/dashboard/agreements" : `/dashboard/projects/${ag.ownerProjectId}`}?hl=ag-${ag._id}`,
          });
        }
      }

      // A draft that has gone out is no longer a draft.
      if (["Draft", "Rejected"].includes(ag.status)) { ag.status = purpose === "signature" ? "PendingSignature" : "Sent"; ag.sentAt = today(); }
      act(ag, by, "shared", `${purpose === "signature" ? "For signature" : "For review"}: ${picked.map((x: { name?: string }) => x?.name).filter(Boolean).join(", ")}`);
      await ag.save();
      res.json(ag);
    } catch (err) { next(err); }
  });

  // Set exactly who can see this agreement (the "Visible to" list) without sending anything.
  router.post("/:aid/visibility", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "Only staff can change visibility." });
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      const stamp = new Date().toISOString();
      const by = req.user!.name || "";
      const before = new Set((ag.visibleTo || []).map((v) => v.companyId || v.name.toLowerCase()));
      ag.visibleTo = (Array.isArray(req.body?.parties) ? req.body.parties : []).slice(0, 10).map((raw: Record<string, unknown>) => {
        const companyId = String(raw?.companyId || "").slice(0, 60);
        const name = String(raw?.name || "").slice(0, 200);
        const prev = (ag.visibleTo || []).find((v) => (companyId && v.companyId === companyId) || (!companyId && v.name.toLowerCase() === name.toLowerCase()));
        return {
          companyId, name, email: String(raw?.email || "").slice(0, 200),
          grantedAt: prev?.grantedAt || stamp, grantedByName: prev?.grantedByName || by,
        };
      }).filter((v: { name: string }) => v.name);
      const after = new Set(ag.visibleTo.map((v) => v.companyId || v.name.toLowerCase()));
      const addedKeys = [...after].filter((k) => !before.has(k));
      const added = addedKeys.length;
      const removed = [...before].filter((k) => !after.has(k)).length;
      // CR-P (63) — "this option becomes available once the agreement is marked complete". Taking
      // access away is always allowed; granting it waits for Complete (Share is the way to send a
      // draft out for review).
      if (added && !["Complete", "CompletedSigned"].includes(ag.docStatus)) {
        return res.status(400).json({ error: "Access can be granted once the agreement is Complete. To send it for review before that, use Share." });
      }
      act(ag, by, "visibility", `${added} granted, ${removed} removed`);
      await ag.save();
      // CR-P (63) — "save, and they get a notification": the parties just given access are told.
      for (const v of ag.visibleTo.filter((x) => addedKeys.includes(x.companyId || x.name.toLowerCase()))) {
        for (const uid of await loginsOf(v)) {
          await createNotification({
            userId: uid, type: "general",
            title: "Agreement shared with you",
            message: `${by || "GreenTech USA"} gave you access to "${ag.agreementNo || ag.name || ag.agreementType}".`,
            link: `${ctx === "user" ? "/dashboard/profile" : ctx === "general" ? "/dashboard/agreements" : `/dashboard/projects/${ag.ownerProjectId}`}?hl=ag-${ag._id}`,
          });
        }
      }
      res.json(ag);
    } catch (err) { next(err); }
  });

  // CR-P (61) — "sent to Farmer on [date]": an agreement emailed from the share menu is logged in
  // the same send log, so Manage and the row show who already has it and when. An email is not
  // access to the platform, so "Visible to" is untouched.
  router.post("/:aid/sends", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "Only staff can log a send." });
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      const to = String(req.body?.to || "").trim().slice(0, 200);
      if (!to) return res.status(400).json({ error: "Say who it was sent to." });
      const by = req.user!.name || "";
      ag.shares = ag.shares || [];
      ag.shares.push({ companyId: "", name: to, email: to, purpose: "email", sentAt: new Date().toISOString(), sentByName: by, note: "" });
      act(ag, by, "emailed", to);
      await ag.save();
      res.json(ag);
    } catch (err) { next(err); }
  });

  // ── Sign (the recipient, from their own account) ──────────────────────────
  router.post("/:aid/sign", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const p = permsOf(req);
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      if (!isRecipient(ctx, ag, p)) return res.status(403).json({ error: "Only the agreement's recipient can sign it." });
      if (!["Sent", "Viewed", "PendingSignature"].includes(ag.status)) return res.status(400).json({ error: `Cannot sign an agreement in status ${ag.status}.` });
      // CR-P (64) — each party signs in its OWN slot. This used to write every signature into
      // party 2's slot and mark the whole agreement Signed on the first one, which then locked
      // parties 3 and 4 out. Slot -1 is party 2 (signatures.recipient); 0 and 1 are parties 3, 4.
      const slot = signSlotOf(ag, p);
      if (slotSignedAt(ag, slot)) return res.status(400).json({ error: "You have already signed this agreement." });
      // CR-P (16) — the signer picks one of their named signatures; only images stored on their
      // own account are accepted (default signature when nothing is chosen).
      const signer = await User.findById(req.user!.userId).select("signatureUrl signatures").lean();
      const mine = new Set<string>([
        ...(((signer as { signatures?: Array<{ url?: string }> } | null)?.signatures) || []).map((s) => s.url || ""),
        (signer as { signatureUrl?: string } | null)?.signatureUrl || "",
      ].filter(Boolean));
      const requested = String(req.body?.signatureUrl || "");
      const signatureUrl = requested && mine.has(requested) ? requested : ((signer as { signatureUrl?: string } | null)?.signatureUrl || "");
      const mark = { signerName: String(req.body?.signerName || req.user!.name || "").slice(0, 120), signatureUrl, signedAt: today(), method: "account" as const };
      if (slot < 0) {
        ag.signatures.recipient = { ...ag.signatures.recipient, ...mark };
      } else {
        const extra = (ag.signatures.extra || []).map((x) => ({
          signerName: x.signerName || "", signerTitle: x.signerTitle || "", signatureUrl: x.signatureUrl || "",
          stampUrl: x.stampUrl || "", signedAt: x.signedAt || "", method: x.method || "",
        }));
        while (extra.length <= slot) extra.push({ signerName: "", signerTitle: "", signatureUrl: "", stampUrl: "", signedAt: "", method: "" });
        extra[slot] = { ...extra[slot], ...mark };
        ag.signatures.extra = extra as IAgreement["signatures"]["extra"];
      }
      ag.markModified("signatures");
      // Signed means every counterparty has signed. Until then it stays pending, and the document
      // status only becomes "Completed and signed" with the last signature.
      const { signed, total } = signatureCount(ag);
      const complete = signed >= total;
      ag.status = complete ? "Signed" : "PendingSignature";
      if (complete) ag.docStatus = "CompletedSigned";
      act(ag, req.user!.name || "", "signed", total > 1 ? `Party ${slot + 3}. ${signed} of ${total} parties have signed.` : "");
      await ag.save();
      if (ag.addedById) {
        const what = ag.agreementNo || ag.name || ag.agreementType;
        await createNotification({
          userId: ag.addedById, type: "general",
          title: complete ? "Agreement signed" : "Agreement signed by one party",
          message: complete
            ? `${req.user!.name || "The recipient"} signed "${what}".${total > 1 ? " Every party has now signed." : ""}`
            : `${req.user!.name || "A party"} signed "${what}". ${signed} of ${total} parties have signed.`,
          link: `${ctx === "user" ? "/dashboard/users" : ctx === "general" ? "/dashboard/agreements" : `/dashboard/projects/${ag.ownerProjectId}`}?hl=ag-${ag._id}`,
        });
      }
      res.json(outFor(req, ag));
    } catch (err) { next(err); }
  });

  // ── Reject (the recipient) ────────────────────────────────────────────────
  router.post("/:aid/reject", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const p = permsOf(req);
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      if (!isRecipient(ctx, ag, p)) return res.status(403).json({ error: "Only the agreement's recipient can reject it." });
      if (!["Sent", "Viewed", "PendingSignature"].includes(ag.status)) return res.status(400).json({ error: `Cannot reject an agreement in status ${ag.status}.` });
      // CR-P (65) — "then they must give a reason". A rejection with no reason tells us nothing
      // and leaves the agreement stuck, so the reason is required, not optional.
      const reason = String(req.body?.note || "").trim().slice(0, 500);
      if (!reason) return res.status(400).json({ error: "A reason is required when rejecting an agreement." });
      ag.status = "Rejected";
      act(ag, req.user!.name || "", "rejected", reason);
      await ag.save();
      if (ag.addedById) {
        await createNotification({
          userId: ag.addedById, type: "general",
          title: "Agreement rejected",
          message: `${req.user!.name || "The recipient"} rejected "${ag.agreementNo || ag.name || ag.agreementType}". Reason: ${reason.slice(0, 200)}`,
          link: `${ctx === "user" ? "/dashboard/users" : ctx === "general" ? "/dashboard/agreements" : `/dashboard/projects/${ag.ownerProjectId}`}?hl=ag-${ag._id}`,
        });
      }
      res.json(outFor(req, ag));
    } catch (err) { next(err); }
  });

  // ── Cancel (staff) ────────────────────────────────────────────────────────
  router.post("/:aid/cancel", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "Only staff can cancel agreements." });
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      ag.status = "Cancelled";
      act(ag, req.user!.name || "", "cancelled", String(req.body?.note || "").slice(0, 500));
      await ag.save();
      res.json(ag);
    } catch (err) { next(err); }
  });

  // ── Delete (staff; a signed agreement is never deleted) ───────────────────
  router.delete("/:aid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "Only staff can delete agreements." });
      const ag = await findAg(req);
      if (!ag) return res.status(404).json({ error: "Not found" });
      if (ag.status === "Signed") return res.status(400).json({ error: "A signed agreement cannot be deleted — cancel it instead." });
      // CR-P-26 — snapshot to the recycle bin (files kept for restore, purged only on permanent delete).
      const files: Array<{ filePath: string }> = [];
      for (const a of ag.attachments || []) if (a.filePath) files.push({ filePath: a.filePath });
      if (ag.signedDocument?.filePath) files.push({ filePath: ag.signedDocument.filePath });
      if (ag.shareCopy?.filePath) files.push({ filePath: ag.shareCopy.filePath });
      await moveToTrash({
        kind: "agreement", refId: String(ag._id), projectId: ag.ownerProjectId || "",
        name: ag.name || `${ag.agreementType} agreement`, subtitle: `${ag.agreementType || "Agreement"}`,
        data: ag.toObject(), files, deletedById: req.user!.userId, deletedByName: req.user!.name || "",
      });
      await ag.deleteOne();
      res.json({ message: "Agreement deleted" });
    } catch (err) { next(err); }
  });

  // ── File uploads ──────────────────────────────────────────────────────────
  const storage = multer.diskStorage({
    destination: (req: AuthedRequest, _file, cb) => {
      const dir = ctx === "project"
        ? path.join("uploads", req.params.id, "agreements", req.params.aid)
        : ctx === "general"
          ? path.join("uploads", "general-agreements", req.params.aid)
          : path.join("uploads", "user-agreements", req.params.uid, req.params.aid);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  });
  const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });
  const fileMeta = (f: Express.Multer.File) => ({
    name: f.originalname, filePath: f.path.replace(/\\/g, "/"),
    fileType: (f.originalname.split(".").pop() || "").toLowerCase(), size: humanSize(f.size),
  });

  // Freeze the final PDF (built client-side) as the immutable signed snapshot.
  router.post("/:aid/freeze", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded." });
      const p = permsOf(req);
      const ag = await findAg(req);
      if (!ag) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
      if (!p.staff && !isRecipient(ctx, ag, p)) { fs.unlink(req.file.path, () => {}); return res.status(403).json({ error: "No access." }); }
      archiveSignedCopy(ag, req.user!.name || "");
      ag.signedDocument = fileMeta(req.file);
      act(ag, req.user!.name || "", "snapshot-frozen", req.file.originalname);
      await ag.save();
      res.status(201).json(outFor(req, ag));
    } catch (err) { next(err); }
  });

  // CR-P (56)/(57) — the current PDF of an agreement, made on demand (drafts included) so Copy
  // link, Email and Notify a teammate have a real file to point at. Each share makes a fresh copy;
  // earlier copies are kept on disk because a link already emailed must keep working.
  router.post("/:aid/share-copy", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded." });
      if (!permsOf(req).staff) { fs.unlink(req.file.path, () => {}); return res.status(403).json({ error: "Only staff can share agreements." }); }
      const ag = await findAg(req);
      if (!ag) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
      ag.shareCopy = { ...fileMeta(req.file), madeAt: new Date().toISOString() };
      await ag.save();
      res.status(201).json(ag);
    } catch (err) { next(err); }
  });

  // Upload an already-made agreement file (documentMode "uploaded"). The file becomes the
  // document itself — preview & download serve it as-is, in whatever format it was uploaded.
  router.post("/:aid/document", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded." });
      if (!permsOf(req).staff) { fs.unlink(req.file.path, () => {}); return res.status(403).json({ error: "Only staff can upload the agreement document." }); }
      const ag = await findAg(req);
      if (!ag) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
      if (ag.status === "Signed") { fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: "A signed agreement is locked." }); }
      if (ag.uploadedDocument?.filePath) fs.unlink(path.resolve(ag.uploadedDocument.filePath), () => {});
      ag.uploadedDocument = fileMeta(req.file);
      ag.documentMode = "uploaded";
      act(ag, req.user!.name || "", "document-uploaded", req.file.originalname);
      await ag.save();
      res.status(201).json(ag);
    } catch (err) { next(err); }
  });

  // CR-B-18 — attach a pre-made file (resume/excel/pdf/picture) to a specific agreement section.
  router.post("/:aid/sections/:idx/files", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded." });
      if (!permsOf(req).staff) { fs.unlink(req.file.path, () => {}); return res.status(403).json({ error: "Only staff can attach section files." }); }
      const ag = await findAg(req);
      const idx = parseInt(req.params.idx, 10);
      if (!ag || !ag.extraSections[idx]) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Section not found." }); }
      if (ag.status === "Signed") { fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: "A signed agreement is locked." }); }
      ag.extraSections[idx].attachments = ag.extraSections[idx].attachments || [];
      ag.extraSections[idx].attachments!.push(fileMeta(req.file));
      await ag.save();
      res.status(201).json(ag);
    } catch (err) { next(err); }
  });
  router.delete("/:aid/sections/:idx/files/:fid", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!permsOf(req).staff) return res.status(403).json({ error: "Only staff can remove section files." });
      const ag = await findAg(req);
      const idx = parseInt(req.params.idx, 10);
      if (!ag || !ag.extraSections[idx]) return res.status(404).json({ error: "Section not found." });
      const list = ag.extraSections[idx].attachments || [];
      const gone = list.find((a) => String((a as { _id?: unknown })._id) === req.params.fid);
      if (gone?.filePath) fs.unlink(path.resolve(gone.filePath), () => {});
      ag.extraSections[idx].attachments = list.filter((a) => String((a as { _id?: unknown })._id) !== req.params.fid);
      await ag.save();
      res.json(ag);
    } catch (err) { next(err); }
  });

  // Staff uploads the counter-signed copy received outside the platform (vendor flow) —
  // the uploaded document becomes the signed snapshot and the agreement is marked Signed.
  router.post("/:aid/sign-upload", upload.single("file"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded." });
      if (!permsOf(req).staff) { fs.unlink(req.file.path, () => {}); return res.status(403).json({ error: "Only staff can upload the signed copy." }); }
      const ag = await findAg(req);
      if (!ag) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: "Not found" }); }
      // CR-P (51)/(66) — any live agreement can receive its signed copy, a Draft included: it may
      // have been signed on paper or on another platform without ever being shared here, and
      // "please upload the signed copy" must have somewhere to go. Cancelled and expired ones
      // cannot. CR-P (52) — "Signed" is included so the signed copy can be REPLACED with a
      // corrected scan; only that file changes, the agreement's terms stay locked.
      if (!["Draft", "Sent", "Viewed", "PendingSignature", "Rejected", "Signed"].includes(ag.status)) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: `A ${ag.status.toLowerCase()} agreement cannot take a signed copy.` });
      }
      const replacing = ag.status === "Signed" && !!ag.signedDocument?.filePath;
      const meta = fileMeta(req.file);
      ag.attachments.push({ ...meta, kind: "signed" });
      archiveSignedCopy(ag, req.user!.name || "");
      ag.signedDocument = meta;
      ag.signatures.recipient = {
        ...ag.signatures.recipient,
        signerName: String(req.body?.signerName || ag.partySnapshot?.party2?.contactName || ag.partySnapshot?.party2?.name || "").slice(0, 120),
        // CR-P (16) — keep/accept the counterparty's stored signature image so it still renders
        // on the frozen document even when the signed copy arrived outside the platform.
        signatureUrl: String(req.body?.signatureUrl || ag.signatures.recipient?.signatureUrl || ""),
        signedAt: today(),
        method: "upload",
      };
      ag.status = "Signed";
      ag.docStatus = "CompletedSigned";   // CR-P (64) — the table's status column follows the signature
      act(ag, req.user!.name || "", replacing ? "signed-copy-replaced" : "signed", replacing ? `Signed copy replaced with ${req.file.originalname}` : "Counter-signed copy uploaded");
      await ag.save();
      res.status(201).json(ag);
    } catch (err) { next(err); }
  });

  return router;
}

export const userAgreementRouter = buildAgreementRouter("user");
export const projectAgreementRouter = buildAgreementRouter("project");
export const generalAgreementRouter = buildAgreementRouter("general");

// ── Templates (read for all staff/recipients; seeded at startup) ─────────────
export const agreementTemplateRouter = Router();
agreementTemplateRouter.use(requireAuth);
agreementTemplateRouter.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.contextType) filter.contextType = String(req.query.contextType);
    res.json(await AgreementTemplate.find(filter).sort({ builtin: -1, name: 1 }));
  } catch (err) { next(err); }
});

// ── Daily expiry sweep (called from the agreements cron) ─────────────────────
export async function expireOverdueAgreements(): Promise<number> {
  const ACTIVE: AgreementStatus[] = ["Sent", "Viewed", "PendingSignature", "Signed"];
  const result = await Agreement.updateMany(
    { status: { $in: ACTIVE }, endDate: { $nin: ["", null] as unknown as string[], $lt: today() } },
    { $set: { status: "Expired" }, $push: { activity: { at: new Date(), actorName: "system", action: "expired", note: "End date passed" } } }
  );
  return result.modifiedCount || 0;
}
