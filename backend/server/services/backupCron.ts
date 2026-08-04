/**
 * Daily cron job — runs once a day at 09:00. Finds every employee whose
 * backupDay matches today's day-of-month and sends them their backup email.
 *
 * Honors a per-user `backupEnabled` flag, and skips users already mailed
 * within the past 24h (idempotency safety).
 */
import cron from "node-cron";
import User from "../models/User";
import { sendBackupEmail } from "./backupMailer";

export function startBackupCron() {
  // "0 9 * * *" → 09:00 every day, server time
  cron.schedule("0 9 * * *", async () => {
    try {
      const day = new Date().getDate();
      const users = await User.find({ backupEnabled: true, backupDay: day }).select("_id email lastBackupSent").lean();
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

      console.log(`[Backup-Cron] ${new Date().toISOString()} — day ${day}, ${users.length} candidate(s).`);

      for (const u of users) {
        const last = (u as { lastBackupSent?: Date }).lastBackupSent;
        if (last && new Date(last).getTime() > oneDayAgo) {
          console.log(`  skip ${u.email} (already sent in last 24h)`);
          continue;
        }
        try {
          const result = await sendBackupEmail(String(u._id));
          console.log(`  ${result.sent ? "sent" : "skipped"} ${u.email} (${result.projectCount} project(s))${result.reason ? ` — ${result.reason}` : ""}`);
        } catch (err) {
          console.error(`  failed ${u.email}:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error("[Backup-Cron] tick failed:", err);
    }
  });
  console.log("📬 Backup cron scheduled — every day at 09:00.");
}
