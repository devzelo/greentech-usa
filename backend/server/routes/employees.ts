import { Router, Response, NextFunction } from "express";
import User from "../models/User";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/employees — the real staff accounts (admins + employees) from the User collection,
// so the proposal "Import from team" picker and project assignment reflect actual users
// (including the importer's own admin profile). Subcontractors are managed per-project, not here.
router.get("/", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    // CR-P (78) — the position (jobTitle) travels with the employee so the project's assigned-team
    // table can show "name and the position", and the email so a guest record can be matched.
    const users = await User.find({ role: { $ne: "subcontractor" } })
      .select("name empId role jobTitle email")
      .sort({ name: 1 });
    res.json(users.map((u) => ({
      id: String(u._id), empId: u.empId || "", name: u.name, role: u.role,
      jobTitle: (u as { jobTitle?: string }).jobTitle || "", email: u.email || "",
    })));
  } catch (err) {
    next(err);
  }
});

export default router;
