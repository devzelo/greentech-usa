import { Router, Response, NextFunction } from "express";
import Project from "../models/Project";
import User from "../models/User";
import Task from "../models/Task";
import TaskColumn from "../models/TaskColumn";
import { requireAuth, AuthedRequest } from "../middleware/auth";

// CR-P — cross-project Kanban overview: every task across the projects this user can access
// ("My Projects" scope), plus each project's columns so the client can group/move by status.
const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const me = await User.findById(userId).lean();
    const empId = (me as { empId?: string } | null)?.empId || "";
    const role = (me as { role?: string } | null)?.role || req.user!.role;

    let filter: Record<string, unknown>;
    if (role === "subcontractor") {
      filter = { "guests.userId": userId, status: { $ne: "Draft" }, archived: { $ne: true } };
    } else {
      const or: Record<string, unknown>[] = [{ ownerId: userId }];
      if (empId) or.push({ assignedEmployees: empId, status: { $ne: "Draft" } });
      filter = { $or: or, archived: { $ne: true } };
    }

    const projects = await Project.find(filter).select("name").sort({ createdAt: -1 }).lean();
    const projectIds = projects.map((p) => String((p as { _id: unknown })._id));
    if (!projectIds.length) return res.json({ projects: [], columns: [], tasks: [] });

    const [columns, tasks] = await Promise.all([
      TaskColumn.find({ projectId: { $in: projectIds } }).sort({ order: 1 }).lean(),
      Task.find({ projectId: { $in: projectIds } }).sort({ order: 1, createdAt: 1 }).lean(),
    ]);
    res.json({
      projects: projects.map((p) => ({ id: String((p as { _id: unknown })._id), name: String((p as { name?: string }).name || "") })),
      columns,
      tasks,
    });
  } catch (err) { next(err); }
});

export default router;
