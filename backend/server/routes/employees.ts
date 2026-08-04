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
    const users = await User.find({ role: { $ne: "subcontractor" } })
      .select("name empId role")
      .sort({ name: 1 });
    res.json(users.map((u) => ({ id: String(u._id), empId: u.empId || "", name: u.name, role: u.role })));
  } catch (err) {
    next(err);
  }
});

export default router;
