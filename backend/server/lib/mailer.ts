import nodemailer from "nodemailer";

// Small shared mail helper. Returns false (never throws) when SMTP isn't configured, so callers
// can treat email as best-effort alongside the in-app notification.
export const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "GreenTech USA";

export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`📬 [Mailer] Would email ${opts.to} — "${opts.subject}" (no SMTP creds configured).`);
    return false;
  }
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: `"${MAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return true;
  } catch (err) {
    console.error("[Mailer] send failed:", err);
    return false;
  }
}
