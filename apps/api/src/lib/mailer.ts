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
