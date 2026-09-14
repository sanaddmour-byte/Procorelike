import nodemailer, { type Transporter } from "nodemailer";
import type { Env } from "../env";

/** Talks to MailHog locally (docker-compose) or any real SMTP endpoint in prod via the same env vars — see docs/ARCHITECTURE.md. */
export function createMailer(env: Env): Transporter {
  return nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false });
}

export interface RfiEscalationEmail {
  to: string;
  rfiNumber: string;
  subject: string;
  projectName: string;
  dueDate: Date;
}

export async function sendRfiEscalationEmail(mailer: Transporter, env: Env, email: RfiEscalationEmail): Promise<void> {
  const dueDateLabel = email.dueDate.toISOString().slice(0, 10);
  await mailer.sendMail({
    from: env.SMTP_FROM,
    to: email.to,
    subject: `Overdue: ${email.rfiNumber} — ${email.subject}`,
    text: `${email.rfiNumber} ("${email.subject}") on ${email.projectName} was due ${dueDateLabel} and is still open. Please respond as soon as possible.`,
  });
}

export interface InviteEmail {
  to: string;
  inviterName: string;
  projectName: string;
  acceptUrl: string;
}

export async function sendInviteEmail(mailer: Transporter, env: Env, email: InviteEmail): Promise<void> {
  await mailer.sendMail({
    from: env.SMTP_FROM,
    to: email.to,
    subject: `${email.inviterName} invited you to ${email.projectName} on SiteOps`,
    text: `${email.inviterName} has invited you to join "${email.projectName}" on SiteOps.\n\nAccept your invitation: ${email.acceptUrl}\n\nThis link expires in 7 days.`,
  });
}

export interface DailyDigestEmail {
  to: string;
  ballInCourtRfis: { number: string; subject: string; projectName: string }[];
  assignedPunchItems: { number: string; description: string; projectName: string }[];
}

export async function sendDailyDigestEmail(mailer: Transporter, env: Env, email: DailyDigestEmail): Promise<void> {
  const rfiLines = email.ballInCourtRfis.map((r) => `- ${r.number} (${r.projectName}): ${r.subject}`);
  const punchLines = email.assignedPunchItems.map((p) => `- ${p.number} (${p.projectName}): ${p.description}`);
  const text = [
    "Your open items for today:",
    "",
    `RFIs where you're ball-in-court (${email.ballInCourtRfis.length}):`,
    ...(rfiLines.length > 0 ? rfiLines : ["  none"]),
    "",
    `Punch items assigned to you (${email.assignedPunchItems.length}):`,
    ...(punchLines.length > 0 ? punchLines : ["  none"]),
  ].join("\n");

  await mailer.sendMail({
    from: env.SMTP_FROM,
    to: email.to,
    subject: "SiteOps daily digest — your open items",
    text,
  });
}
