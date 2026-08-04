import Notification from "../models/Notification";
import User from "../models/User";

interface NotifyInput {
  userId: string;
  type?: "assignment" | "share" | "general";
  title: string;
  message: string;
  link?: string;
}

/** Create a notification for a specific user (no-op on failure — never block the caller). */
export async function createNotification(input: NotifyInput): Promise<void> {
  try {
    await Notification.create({
      userId: input.userId,
      type: input.type || "general",
      title: input.title,
      message: input.message,
      link: input.link || "",
    });
  } catch {
    /* notifications are best-effort */
  }
}

/** Notify the user account linked to an employee id (if one exists). Returns true if delivered. */
export async function notifyByEmpId(empId: string, input: Omit<NotifyInput, "userId">): Promise<boolean> {
  if (!empId) return false;
  const user = await User.findOne({ empId }).select("_id").lean();
  if (!user) return false;
  await createNotification({ ...input, userId: String((user as { _id: unknown })._id) });
  return true;
}
