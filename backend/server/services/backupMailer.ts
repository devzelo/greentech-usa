/**
 * Sends a monthly "backup" email to a single employee with secure download links
 * for each project they own or are assigned to. The links point at the existing
 * /api/projects/:id/export endpoint which streams a zip and is auth-gated, so
 * the recipient must be logged in to actually download.
 *
 * Email is sent via Nodemailer + Gmail SMTP using the EMAIL_HOST / EMAIL_USER /
 * EMAIL_PASS env vars. If those are not configured this falls back to a console
 * log so the rest of the system keeps working in dev.
 */
import nodemailer from "nodemailer";
import User from "../models/User";
import Project from "../models/Project";

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "http://localhost:3000";

export interface BackupProjectSummary {
  id: string;
  name: string;
  status: string;
  location: string;
  role: "owner" | "assigned";
  downloadUrl: string;
}

/** Resolve every project a user can back up — they own it or are assigned. */
export async function getBackupProjects(userId: string): Promise<BackupProjectSummary[]> {
  const user = await User.findById(userId).lean();
  if (!user) return [];
  const empId = (user as { empId?: string }).empId || "";

  const or: Record<string, unknown>[] = [{ ownerId: userId }];
  if (empId) or.push({ assignedEmployees: empId });

  const projects = await Project.find({ $or: or })
    .select("projectId name status location ownerId")
    .sort({ updatedAt: -1 })
    .lean();

  return projects.map((p) => ({
    id: p.projectId,
    name: p.name,
    status: p.status,
    location: p.location || "",
    role: String(p.ownerId) === String(userId) ? "owner" : "assigned",
    downloadUrl: `${PUBLIC_BASE_URL}/api/projects/${p.projectId}/export`,
  }));
}

function buildHtml(name: string, projects: BackupProjectSummary[]): string {
  const rows = projects.map((p) => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #e2e8f0;">
        <div style="font-weight:700;color:#0f172a;">${escapeHtml(p.name)}</div>
        <div style="font-size:11px;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">
          ${p.id} · ${escapeHtml(p.status)} · ${p.role === "owner" ? "Owner" : "Assigned"}
        </div>
        ${p.location ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">${escapeHtml(p.location)}</div>` : ""}
      </td>
      <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right;">
        <a href="${p.downloadUrl}" style="display:inline-block;background:#10B981;color:#ffffff;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:12px;font-weight:700;">
          Download
        </a>
      </td>
    </tr>`).join("");

  return `<!doctype html>
  <html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
      <div style="background:linear-gradient(135deg,#10B981,#3B82F6);border-radius:16px;padding:28px;text-align:center;color:#ffffff;margin-bottom:24px;">
        <h1 style="margin:0;font-size:22px;letter-spacing:-0.5px;">GreenTech USA</h1>
        <p style="margin:8px 0 0;opacity:0.9;font-size:13px;letter-spacing:2px;">MONTHLY PROJECT BACKUP</p>
      </div>

      <div style="background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e2e8f0;">
        <h2 style="margin:0 0 8px;color:#0f172a;font-size:20px;">Hi ${escapeHtml(name.split(" ")[0])},</h2>
        <p style="color:#475569;line-height:1.6;font-size:14px;">
          Here&apos;s your monthly snapshot. Click <strong>Download</strong> next to any project
          to grab a zip containing the project data and all uploaded files. You&apos;ll need to
          be logged into the GreenTech USA dashboard for the download to work.
        </p>

        ${projects.length === 0 ? `
          <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:24px;text-align:center;color:#64748b;font-size:13px;margin-top:16px;">
            You don&apos;t own or have been assigned to any projects yet.
          </div>` : `
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <thead>
              <tr>
                <th style="text-align:left;padding:10px 12px;background:#f8fafc;border-bottom:2px solid #e2e8f0;font-size:10px;letter-spacing:1.5px;color:#64748b;text-transform:uppercase;">Project</th>
                <th style="text-align:right;padding:10px 12px;background:#f8fafc;border-bottom:2px solid #e2e8f0;"></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>`}

        <p style="color:#94a3b8;font-size:11px;line-height:1.6;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px;">
          Want to change when these arrive — or turn them off?
          Visit <a href="${PUBLIC_BASE_URL}/dashboard/profile" style="color:#10B981;text-decoration:none;font-weight:700;">your Profile</a>
          and adjust your backup preferences.
        </p>
      </div>

      <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:16px;">
        © ${new Date().getFullYear()} GreenTech USA LLC · Chantilly, Virginia
      </p>
    </div>
  </body></html>`;
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Send the backup email to a single user. Returns { sent, reason } */
export async function sendBackupEmail(userId: string): Promise<{ sent: boolean; reason?: string; projectCount: number }> {
  const user = await User.findById(userId);
  if (!user) return { sent: false, reason: "User not found.", projectCount: 0 };

  const projects = await getBackupProjects(userId);

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`📬 [Backup-Mailer] Would email ${user.email} with ${projects.length} projects (no SMTP creds configured).`);
    return { sent: false, reason: "Email credentials not configured on the server.", projectCount: projects.length };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  await transporter.sendMail({
    from: `"GreenTech USA" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `Your GreenTech USA Backup — ${projects.length} project${projects.length === 1 ? "" : "s"}`,
    html: buildHtml(user.name, projects),
  });

  user.lastBackupSent = new Date();
  await user.save();

  return { sent: true, projectCount: projects.length };
}
