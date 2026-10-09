import User from "../models/User";
import Company from "../models/Company";

export type CompanyUser = { _id: unknown; role?: string; email?: string; companyId?: unknown };

// A subcontractor/partner login maps to its Directory company via the hard companyId link,
// falling back to the legacy email match (and back-filling companyId when the match hits).
export async function resolveMyCompany(user: CompanyUser) {
  if (user.role !== "subcontractor") return null;
  if (user.companyId) {
    const byId = await Company.findById(user.companyId).select("name email logoUrl address phone website categories category").lean();
    if (byId) return byId;
  }
  if (!user.email) return null;
  const byEmail = await Company.findOne({ email: user.email.toLowerCase() }).select("name email logoUrl address phone website categories category").lean();
  if (byEmail) await User.updateOne({ _id: user._id }, { companyId: byEmail._id }).catch(() => undefined);
  return byEmail;
}

/** The logins of a Directory company (to tell them about new work). */
export async function companyLoginIds(companyId: string): Promise<string[]> {
  if (!/^[a-f\d]{24}$/i.test(companyId || "")) return [];
  const users = await User.find({ companyId, role: "subcontractor" }).select("_id").lean();
  return users.map((u) => String((u as { _id: unknown })._id));
}
