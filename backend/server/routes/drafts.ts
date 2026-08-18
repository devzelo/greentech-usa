import { Router, Response, NextFunction } from "express";
import Project from "../models/Project";
import User from "../models/User";
import Agreement from "../models/Agreement";
import Submittal from "../models/Submittal";
import Rfq from "../models/Rfq";
import { requireAuth, AuthedRequest } from "../middleware/auth";

// GET /api/drafts — everything the current user has saved as a draft across the platform, so the
// Overview can nudge them to finish it: draft projects, draft agreements (sub/vendor/partner/
// general/employee), draft submittals and draft RFQs. Scoped by access: staff see all; a guest
// only sees drafts inside the projects they're assigned to.
const router = Router();
router.use(requireAuth);

interface DraftItem {
  kind: "project" | "agreement" | "submittal" | "rfq";
  id: string;
  title: string;
  subtitle: string;
  projectId: string;
  projectName: string;
  link: string;
  updatedAt: string;
}

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const me = await User.findById(userId).lean();
    const role = (me as { role?: string } | null)?.role || req.user!.role;
    const isGuest = role === "subcontractor";

    // Projects this user can see (and the name lookup for every draft's badge).
    const projectFilter = isGuest ? { "guests.userId": userId } : {};
    const projects = await Project.find({ ...projectFilter, archived: { $ne: true } })
      .select("projectId name status ownerId updatedAt").lean();
    const nameById: Record<string, string> = {};
    const projectIds: string[] = [];
    for (const p of projects) { nameById[p.projectId] = p.name; projectIds.push(p.projectId); }

    const items: DraftItem[] = [];

    // 1. Draft projects (private to their owner).
    for (const p of projects) {
      if (p.status === "Draft" && String(p.ownerId) === String(userId)) {
        items.push({
          kind: "project", id: p.projectId, title: p.name || "Untitled project",
          subtitle: "Project draft", projectId: p.projectId, projectName: p.name || "",
          link: `/dashboard/projects/${p.projectId}`, updatedAt: String((p as { updatedAt?: unknown }).updatedAt || ""),
        });
      }
    }

    // 2. Draft agreements — staff only (guests sign, they don't draft).
    if (!isGuest) {
      const ags = await Agreement.find({ status: "Draft", archived: { $ne: true } })
        .select("name agreementType ownerContextType ownerProjectId ownerEntityType updatedAt").sort({ updatedAt: -1 }).limit(100).lean();
      for (const a of ags) {
        const ctx = a.ownerContextType;
        const subKey = a.ownerEntityType === "vendor" ? "vendors" : a.ownerEntityType === "partner" ? "partners" : "subcontractors";
        const link = ctx === "user" ? `/dashboard/users?hl=ag-${a._id}`
          : ctx === "general" ? `/dashboard/agreements?hl=ag-${a._id}`
          : `/dashboard/projects/${a.ownerProjectId}?tab=subs&sub=${subKey}&hl=ag-${a._id}`;
        items.push({
          kind: "agreement", id: String(a._id), title: a.name || `${a.agreementType} agreement`,
          subtitle: `${a.agreementType || "Agreement"} draft`, projectId: a.ownerProjectId || "",
          projectName: nameById[a.ownerProjectId] || (ctx === "general" ? "General" : ctx === "user" ? "Employee" : ""),
          link, updatedAt: String((a as { updatedAt?: unknown }).updatedAt || ""),
        });
      }
    }

    // 3. Draft submittals + 4. Draft RFQs — inside projects the user can see.
    if (projectIds.length) {
      const [subs, rfqs] = await Promise.all([
        Submittal.find({ status: "Draft", archived: { $ne: true }, projectId: { $in: projectIds } })
          .select("title productName projectId updatedAt").sort({ updatedAt: -1 }).limit(100).lean(),
        Rfq.find({ status: "Draft", projectId: { $in: projectIds } })
          .select("rfqNo title projectId updatedAt").sort({ updatedAt: -1 }).limit(100).lean(),
      ]);
      for (const s of subs) {
        items.push({
          kind: "submittal", id: String(s._id), title: s.productName || s.title || "Submittal",
          subtitle: "Submittal draft", projectId: s.projectId, projectName: nameById[s.projectId] || "",
          link: `/dashboard/projects/${s.projectId}?tab=procurement&proc=submittals`, updatedAt: String((s as { updatedAt?: unknown }).updatedAt || ""),
        });
      }
      for (const r of rfqs) {
        items.push({
          kind: "rfq", id: String(r._id), title: r.title || r.rfqNo || "RFQ",
          subtitle: `RFQ ${r.rfqNo || ""} draft`.trim(), projectId: r.projectId, projectName: nameById[r.projectId] || "",
          link: `/dashboard/projects/${r.projectId}?tab=procurement&proc=rfqs`, updatedAt: String((r as { updatedAt?: unknown }).updatedAt || ""),
        });
      }
    }

    // Newest first across every kind.
    items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    res.json(items);
  } catch (err) { next(err); }
});

export default router;
